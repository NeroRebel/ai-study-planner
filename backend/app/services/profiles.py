import re
from uuid import UUID
import httpx
from sqlalchemy import select
from app.core.auth import Principal
from app.core.exceptions import DomainError
from app.core.config import Settings
from app.models import Profile
from app.services.common import serialize_write, now


def bootstrap(db, user_id: UUID):
    from sqlalchemy.dialects.postgresql import insert as pg_insert
    from sqlalchemy.dialects.sqlite import insert as sqlite_insert
    insert = pg_insert if db.get_bind().dialect.name == 'postgresql' else sqlite_insert
    db.execute(insert(Profile).values(user_id=user_id,display_name='Student',timezone='Europe/Budapest')
        .on_conflict_do_nothing(index_elements=['user_id']))


def get_profile(db, user_id):
    bootstrap(db,user_id)
    db.commit()
    return db.scalar(select(Profile).where(Profile.user_id==user_id))


def avatar_path_valid(path: str, user_id: UUID):
    return re.fullmatch(re.escape(str(user_id))+r'/[0-9a-f-]{36}\.(png|jpg|webp)',path) is not None


def patch_profile(db, principal: Principal, data, settings: Settings):
    values=data.model_dump(exclude_unset=True)
    path=values.get('avatar_path')
    if path is not None:
        if not avatar_path_valid(path,principal.user_id): raise DomainError('Invalid avatar path.')
        try:
            response=httpx.head(settings.supabase_url+'/storage/v1/object/authenticated/avatars/'+path,
                headers={'apikey':settings.supabase_publishable_key.get_secret_value(),'Authorization':'Bearer '+principal.token},timeout=8)
            if response.status_code!=200: raise DomainError('Upload your avatar before saving its profile path.')
            if response.headers.get('content-type','').split(';')[0] not in {'image/png','image/jpeg','image/webp'} or not 0<int(response.headers.get('content-length','0'))<=2*1024*1024:
                raise DomainError('Avatar must be a PNG, JPEG or WebP image up to 2 MB.')
        except (httpx.HTTPError,ValueError): raise DomainError('Avatar storage is unavailable.',503) from None
    item=get_profile(db,principal.user_id)
    for key,value in values.items():setattr(item,key,value)
    db.commit();db.refresh(item)
    return item


def complete_onboarding(db, principal: Principal, data):
    from app.models import Subject
    from app.schemas.subject import SubjectCreate, SubjectRead
    from app.schemas.profile import ProfileRead
    from app.services import subjects
    if data.skip and data.create_subjects:
        raise DomainError('Skipping setup cannot create subjects.')
    bootstrap(db, principal.user_id)
    serialize_write(db)
    item = db.scalar(select(Profile).where(Profile.user_id == principal.user_id).with_for_update())
    created = []
    if not item.onboarding_completed:
        if data.create_subjects:
            selected = {interest['name'].casefold() for interest in item.interests if interest['type'] == 'subject'}
            approved = [name.casefold() for name in data.subject_names]
            if set(approved) != selected or len(approved) != len(set(approved)):
                raise DomainError('Selected subjects changed. Review your subjects again before finishing setup.',409)
            existing = {subject.name.casefold() for subject in db.scalars(select(Subject))}
            for interest in item.interests:
                if interest['type'] == 'subject' and interest['name'].casefold() not in existing:
                    created.append(subjects.add(db, SubjectCreate(name=interest['name'])))
                    existing.add(interest['name'].casefold())
        item.onboarding_completed = True
        item.onboarding_skipped = data.skip
        item.onboarding_completed_at = now()
        item.onboarding_start_mode = 'manual' if data.skip else data.start_mode
        item.onboarding_step = 5
    db.commit()
    db.refresh(item)
    return {'profile': ProfileRead.model_validate(item), 'created_subjects': [SubjectRead.model_validate(subject) for subject in created]}


def delete_account(principal: Principal, settings: Settings):
    if not settings.supabase_service_role_key:
        raise DomainError('Account deletion is not configured on the server.',503)
    secret=settings.supabase_service_role_key.get_secret_value()
    headers={'apikey':secret,'Authorization':'Bearer '+secret}
    prefix=str(principal.user_id)+'/'
    try:
        # Remove only this user's flat avatar prefix. Delete each page before
        # fetching offset zero again so removal cannot skip objects.
        with httpx.Client(base_url=settings.supabase_url,headers=headers,timeout=15) as client:
            for _ in range(100):
                listing=client.post('/storage/v1/object/list/avatars',json={'prefix':prefix,'limit':100,'offset':0})
                if listing.status_code==404:break  # No avatar bucket configured yet.
                if listing.status_code!=200:raise DomainError('Could not remove avatar files. Please retry account deletion.',503)
                files=listing.json()
                if not files:break
                if any(not f.get('id') or '/' in f.get('name','') for f in files):
                    raise DomainError('Avatar cleanup requires server review; account was not deleted.',503)
                removal=client.request('DELETE','/storage/v1/object/avatars',json={'prefixes':[prefix+f['name'] for f in files]})
                if removal.status_code!=200:raise DomainError('Could not remove avatar files. Please retry account deletion.',503)
            else:raise DomainError('Avatar cleanup limit reached. Please retry account deletion.',503)
            result=client.delete('/auth/v1/admin/users/'+str(principal.user_id))
            if result.status_code not in {200,204}:raise DomainError('Account deletion could not be confirmed. Please retry.',503)
            # auth.users -> profiles -> owned records cascade in one provider DB transaction.
    except httpx.HTTPError:
        raise DomainError('Account deletion could not be confirmed. Please retry.',503) from None
