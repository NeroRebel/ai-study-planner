from uuid import UUID
import pytest
import httpx
import jwt
from cryptography.hazmat.primitives.asymmetric import ec
from datetime import UTC, datetime, timedelta
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError
from app.core.auth import Principal, get_current_user, validate_token
from app.core.config import Settings
from app.models import Subject, Task, Availability, StudySession, Profile
from app.services import profiles
from tests.conftest import TEST_USER

B=UUID('22222222-2222-4222-8222-222222222222')


def as_user(app,uid):app.dependency_overrides[get_current_user]=lambda:Principal(uid,'fixture@example.test','token')
def snapshot(client):return {g:client.get('/api/'+g).json() for g in ['subjects','tasks','availability','study-sessions']}
def preview(client,ids=None):
    payload={'date_from':'2099-01-05','date_to':'2099-01-05'}
    if ids:payload['task_ids']=ids
    return client.post('/api/planner/replan/preview',json=payload)
def body(p):return {**p['request'],**{k:p[k] for k in ['fingerprint','plan_digest','evaluated_at']}}


def test_missing_invalid_and_expired_auth_never_mutate(application,db_factory):
    application.dependency_overrides.clear()
    with TestClient(application) as client:
        assert client.get('/api/subjects').status_code==401
        assert client.get('/api/subjects',headers={'Authorization':'Bearer malformed'}).status_code==401
        assert client.post('/api/subjects',json={'name':'No access'}).status_code==401
        assert client.get('/api/tasks',headers={'Authorization':'Basic x'}).status_code==401
    with db_factory() as db:assert not db.scalars(select(Subject)).all()


def test_subject_lists_pagination_and_guessed_ids_are_isolated(client,application,subject):
    assert len(client.get('/api/subjects').json())==1
    as_user(application,B)
    assert client.get('/api/subjects').json()==[]
    assert client.get('/api/subjects/'+subject['id']).status_code==404
    assert client.patch('/api/subjects/'+subject['id'],json={'name':'Stolen'}).status_code==404
    assert client.delete('/api/subjects/'+subject['id']).status_code==404
    own=client.post('/api/subjects',json={'name':'B only'}).json()
    assert client.get('/api/subjects?limit=1&offset=0').json()[0]['id']==own['id']
    assert client.get('/api/subjects?limit=1&offset=1').json()==[]
    as_user(application,TEST_USER)
    assert [r['id'] for r in client.get('/api/subjects').json()]==[subject['id']]


@pytest.mark.parametrize('method',['get','patch','delete'])
def test_other_users_task_id_is_404(client,application,task,method):
    as_user(application,B)
    kwargs={'json':{'priority':'LOW'}} if method=='patch' else {}
    assert getattr(client,method)('/api/tasks/'+task['id'],**kwargs).status_code==404
    assert client.get('/api/tasks').json()==[]


def test_parent_ids_cannot_cross_ownership(client,application,task,window,study_session):
    as_user(application,B)
    own=client.post('/api/subjects',json={'name':'B'}).json()
    assert client.post('/api/tasks',json={'title':'Stolen','subject_id':task['subject_id'],'deadline':task['deadline'],'estimated_hours':1}).status_code==404
    assert client.post('/api/study-sessions',json={'task_id':task['id'],'date':window['date'],'start_time':'19:00','end_time':'20:00'}).status_code==404
    assert client.get('/api/study-sessions').json()==[]
    for group,identifier in [('availability',window['id']),('study-sessions',study_session['id'])]:
        assert client.get('/api/'+group+'/'+identifier).status_code==404
        assert client.delete('/api/'+group+'/'+identifier).status_code==404
        assert client.patch('/api/'+group+'/'+identifier,json={'end_time':'20:00'}).status_code==404
    assert client.get('/api/availability').json()==[]
    # Same time windows from different users do not conflict.
    assert client.post('/api/availability',json={'date':window['date'],'start_time':'17:00','end_time':'21:00'}).status_code==201
    assert own['id']!=task['subject_id']


def test_client_cannot_supply_owner(client,subject):
    assert client.post('/api/subjects',json={'name':'Spoof','user_id':str(B)}).status_code==422
    assert client.patch('/api/subjects/'+subject['id'],json={'user_id':str(B)}).status_code==422


def test_scheduler_risk_and_replanning_are_user_scoped(client,application,task,window,db_factory):
    a_preview=preview(client).json()
    as_user(application,B)
    assert client.post('/api/planner/generate',json={'date_from':window['date'],'date_to':window['date']}).json()['created_count']==0
    assert client.get('/api/risks').json()['tasks']==[]
    assert client.get('/api/risks').json()['subjects']==[]
    assert preview(client,[task['id']]).status_code==404
    assert client.post('/api/planner/replan/apply',json=body(a_preview)).status_code==409
    own_subject=client.post('/api/subjects',json={'name':'B'}).json()
    own_task=client.post('/api/tasks',json={'title':'B task','subject_id':own_subject['id'],'deadline':task['deadline'],'estimated_hours':1}).json()
    assert client.post('/api/planner/generate',json={'date_from':window['date'],'date_to':window['date']}).json()['created_count']==0
    client.post('/api/availability',json={'date':window['date'],'start_time':'17:00','end_time':'18:00'})
    result=client.post('/api/planner/generate',json={'date_from':window['date'],'date_to':window['date']}).json()
    assert result['created_count']==1 and result['sessions_created'][0]['task_id']==own_task['id']
    risks=client.get('/api/risks').json();assert [r['task_id'] for r in risks['tasks']]==[own_task['id']]
    p=preview(client).json();assert all(s['task_id']==own_task['id'] for s in p['sessions_kept'])
    with db_factory(info={'user_id':B}) as db:
        assert all(s.user_id==B for s in db.scalars(select(StudySession)))
    as_user(application,TEST_USER)
    assert client.get('/api/study-sessions').json()==[]
    assert [r['task_id'] for r in client.get('/api/risks').json()['tasks']]==[task['id']]


def test_empty_preview_cannot_be_replayed_by_another_user(client,application):
    p=preview(client).json();as_user(application,B)
    assert client.post('/api/planner/replan/apply',json=body(p)).status_code==409


def test_profile_bootstrap_idempotent_update_timezone_and_owner(client,application,db_factory):
    first=client.get('/api/profile').json();second=client.get('/api/profile').json()
    assert first==second and first['user_id']==str(TEST_USER)
    assert client.patch('/api/profile',json={'display_name':' Alex '}).json()['display_name']=='Alex'
    assert client.patch('/api/profile',json={'timezone':'America/New_York'}).status_code==422
    assert client.patch('/api/profile',json={'user_id':str(B)}).status_code==422
    as_user(application,B)
    assert client.get('/api/profile').json()['display_name']=='Student'
    assert client.patch('/api/profile',json={'avatar_path':str(TEST_USER)+'/00000000-0000-4000-8000-000000000000.png'}).status_code==422
    with db_factory(info={'user_id':None}) as db:assert len(db.scalars(select(Profile)).all())==2


def test_avatar_metadata_requires_owned_uploaded_image(client,application,monkeypatch):
    path=str(TEST_USER)+'/00000000-0000-4000-8000-000000000000.png'
    from pydantic import SecretStr
    application.state.settings.supabase_publishable_key=SecretStr('public')
    monkeypatch.setattr(httpx,'head',lambda *a,**k:httpx.Response(200,headers={'content-type':'image/png','content-length':'100'}))
    assert client.patch('/api/profile',json={'avatar_path':path}).json()['avatar_path']==path
    assert client.patch('/api/profile',json={'avatar_path':None}).json()['avatar_path'] is None
    monkeypatch.setattr(httpx,'head',lambda *a,**k:httpx.Response(200,headers={'content-type':'image/svg+xml','content-length':'100'}))
    assert client.patch('/api/profile',json={'avatar_path':path}).status_code==422


def test_legacy_rows_remain_quarantined_and_profile_never_claims_them(client,db_factory):
    with db_factory(info={'user_id':None}) as db:
        old=Subject(name='Legacy',user_id=None);db.add(old);db.commit();identifier=str(old.id)
    assert client.get('/api/subjects').json()==[]
    client.get('/api/profile')
    assert client.get('/api/subjects/'+identifier).status_code==404
    with db_factory(info={'user_id':None}) as db:assert db.get(Subject,UUID(identifier)).user_id is None


def test_database_rejects_cross_owner_foreign_key_even_offline(client,application,subject,db_factory):
    as_user(application,B);client.get('/api/profile')
    with db_factory(info={'user_id':None}) as db:
        from app.services.tasks import task_values
        from app.schemas.task import TaskCreate
        values=task_values(TaskCreate(title='Bad',subject_id=UUID(subject['id']),deadline='2099-01-01T00:00:00Z',estimated_hours=1).model_dump(exclude_none=True))
        db.add(Task(**values,user_id=B))
        with pytest.raises(IntegrityError):db.commit()
        db.rollback()


def test_account_delete_requires_confirmation_and_derived_identity(client,application,monkeypatch):
    called=[];monkeypatch.setattr(profiles,'delete_account',lambda user,config:called.append(user.user_id))
    assert client.delete('/api/account').status_code==422
    assert client.request('DELETE','/api/account',json={'confirmation':'DELETE','user_id':str(B)}).status_code==422
    assert client.request('DELETE','/api/account',json={'confirmation':'DELETE'}).status_code==204
    assert called==[TEST_USER]
    application.dependency_overrides.clear()
    assert client.request('DELETE','/api/account',json={'confirmation':'DELETE'}).status_code==401


def test_deletion_without_server_secret_fails_safely(client,subject):
    before=snapshot(client)
    assert client.request('DELETE','/api/account',json={'confirmation':'DELETE'}).status_code==503
    assert snapshot(client)==before


def test_jwt_signatures_issuer_audience_expiry_and_confirmed_user(monkeypatch):
    from pydantic import SecretStr
    key=ec.generate_private_key(ec.SECP256R1());public=key.public_key()
    class Keys:
        def get_signing_key_from_jwt(self,token):
            class Result:pass
            result=Result();result.key=public;return result
    monkeypatch.setattr('app.core.auth.jwks_client',lambda url:Keys())
    monkeypatch.setattr(httpx,'get',lambda *a,**k:httpx.Response(200,json={'id':str(TEST_USER),'email':'a@example.test','email_confirmed_at':'2026-01-01'}))
    config=Settings(database_url=None,supabase_url='https://auth.example.test',supabase_publishable_key=SecretStr('public'),_env_file=None)
    claims={'sub':str(TEST_USER),'aud':'authenticated','iss':config.supabase_url+'/auth/v1','iat':datetime.now(UTC),'exp':datetime.now(UTC)+timedelta(minutes=5),'role':'authenticated'}
    def token(values,key=key,algorithm='ES256'):return jwt.encode(values,key,algorithm=algorithm,headers={'kid':'test'})
    assert validate_token(token(claims),config).user_id==TEST_USER
    for values in [{**claims,'aud':'other'},{**claims,'iss':'https://evil.example'},{**claims,'exp':datetime.now(UTC)-timedelta(seconds=5)},{**claims,'role':'service_role'}]:
        with pytest.raises(HTTPException) as exc:validate_token(token(values),config)
        assert exc.value.status_code==401
    with pytest.raises(HTTPException):validate_token(token(claims,key=ec.generate_private_key(ec.SECP256R1())),config)
    with pytest.raises(HTTPException):validate_token(jwt.encode(claims,'',algorithm='none'),config)
    monkeypatch.setattr(httpx,'get',lambda *a,**k:httpx.Response(200,json={'id':str(TEST_USER),'email_confirmed_at':None}))
    with pytest.raises(HTTPException):validate_token(token(claims),config)


def test_legacy_hmac_is_verified_by_supabase_not_local_decode(monkeypatch):
    from pydantic import SecretStr
    config=Settings(database_url=None,supabase_url='https://auth.example.test',supabase_publishable_key=SecretStr('public'),_env_file=None)
    token=jwt.encode({'sub':str(TEST_USER)},'fixture-secret-at-least-thirty-two-bytes-long',algorithm='HS256')
    monkeypatch.setattr(httpx,'get',lambda *a,**k:httpx.Response(401))
    with pytest.raises(HTTPException) as exc:validate_token(token,config)
    assert exc.value.status_code==401


def test_owned_profile_cascade_removes_only_that_users_workspace(client,application,task,window,study_session,db_factory):
    as_user(application,B);own=client.post('/api/subjects',json={'name':'B stays'}).json()
    with db_factory(info={'user_id':None}) as db:
        db.delete(db.get(Profile,TEST_USER));db.commit()
        assert not db.scalars(select(Task).where(Task.user_id==TEST_USER)).all()
        assert not db.scalars(select(StudySession).where(StudySession.user_id==TEST_USER)).all()
        assert not db.scalars(select(Availability).where(Availability.user_id==TEST_USER)).all()
        assert not db.scalars(select(Subject).where(Subject.user_id==TEST_USER)).all()
        assert db.get(Subject,UUID(own['id'])).user_id==B


def test_admin_deletion_only_targets_authenticated_avatar_prefix_and_identity(monkeypatch):
    from pydantic import SecretStr
    calls=[];pages=[[{'id':'owned-object','name':'image.png'}],[]]
    class Admin:
        def __init__(self,**kwargs):pass
        def __enter__(self):return self
        def __exit__(self,*args):pass
        def post(self,path,json):calls.append(('list',json));return httpx.Response(200,json=pages.pop(0))
        def request(self,method,path,json):calls.append(('remove',json));return httpx.Response(200,json={})
        def delete(self,path):calls.append(('delete',path));return httpx.Response(200,json={})
    monkeypatch.setattr(httpx,'Client',Admin)
    config=Settings(database_url=None,supabase_url='https://auth.example.test',supabase_service_role_key=SecretStr('fixture-server-only'),_env_file=None)
    profiles.delete_account(Principal(TEST_USER),config)
    assert calls[0][1]['prefix']==str(TEST_USER)+'/'
    assert calls[1][1]['prefixes']==[str(TEST_USER)+'/image.png']
    assert calls[-1]==('delete','/auth/v1/admin/users/'+str(TEST_USER))


def test_explicit_legacy_claim_does_not_reassign_existing_owned_records(client,application,db_factory):
    from app.claim_legacy import claim
    as_user(application,B);existing=client.post('/api/subjects',json={'name':'B remains B'}).json()
    with db_factory(info={'user_id':None}) as db:
        old=Subject(name='Quarantined');db.add(old);db.commit();identifier=old.id
        counts=claim(db,TEST_USER)
        assert counts['subjects']==1 and db.get(Subject,UUID(existing['id'])).user_id==B
    as_user(application,TEST_USER)
    assert [r['id'] for r in client.get('/api/subjects').json()]==[str(identifier)]
