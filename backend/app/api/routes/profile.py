from typing import Annotated
from fastapi import APIRouter, Depends, Response
from app.api.dependencies import Db, Config
from app.core.auth import Principal, get_current_user
from app.schemas.profile import ProfileRead, ProfilePatch, DeleteAccount
from app.services import profiles

User = Annotated[Principal,Depends(get_current_user)]
router=APIRouter(tags=['Account'])

@router.get('/profile',response_model=ProfileRead)
def read_profile(db:Db,user:User):return profiles.get_profile(db,user.user_id)

@router.patch('/profile',response_model=ProfileRead)
def update_profile(data:ProfilePatch,db:Db,user:User,config:Config):return profiles.patch_profile(db,user,data,config)

@router.delete('/account',status_code=204)
def remove_account(data:DeleteAccount,user:User,config:Config):
    profiles.delete_account(user,config)
    return Response(status_code=204)
