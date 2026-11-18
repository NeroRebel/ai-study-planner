from datetime import datetime
from typing import Literal
from uuid import UUID
from pydantic import Field
from app.schemas.common import Schema, PatchSchema

class ProfileRead(Schema):
    user_id: UUID
    display_name: str
    avatar_path: str | None
    timezone: str
    created_at: datetime
    updated_at: datetime

class ProfilePatch(PatchSchema):
    nullable_fields = {'avatar_path'}
    display_name: str | None = Field(default=None,min_length=1,max_length=80)
    avatar_path: str | None = Field(default=None,max_length=512)
    timezone: Literal['Europe/Budapest'] | None = None

class DeleteAccount(Schema):
    confirmation: Literal['DELETE']
