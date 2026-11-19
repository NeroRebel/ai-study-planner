from datetime import datetime
from typing import Literal, Annotated
from uuid import UUID
from pydantic import Field, field_validator
from app.schemas.common import Schema, PatchSchema

StudyLevel = Literal['Bachelor','Master','PhD','Other']
StudyPeriod = Literal['Morning','Afternoon','Evening','Flexible']
Goal = Literal['Stay ahead of deadlines','Pass exams','Improve grades','Build practical skills','Prepare for internship','Create a consistent study routine','Reduce procrastination']

class Interest(Schema):
    name: str = Field(min_length=1,max_length=80)
    type: Literal['subject','skill']

class ProfileRead(Schema):
    user_id: UUID
    display_name: str
    avatar_path: str | None
    timezone: str
    university: str | None
    study_program: str | None
    study_level: StudyLevel | None
    study_year: int | None
    weekly_study_hours: int | None
    preferred_session_minutes: int | None
    preferred_study_period: StudyPeriod | None
    preferred_study_days: list[int]
    interests: list[Interest]
    goals: list[Goal]
    onboarding_step: int
    onboarding_completed: bool
    onboarding_skipped: bool
    onboarding_start_mode: Literal['manual','ai'] | None
    onboarding_completed_at: datetime | None
    created_at: datetime
    updated_at: datetime

class ProfilePatch(PatchSchema):
    nullable_fields = {'avatar_path','university','study_program','study_level','study_year','weekly_study_hours','preferred_session_minutes','preferred_study_period'}
    display_name: str | None = Field(default=None,min_length=1,max_length=80)
    avatar_path: str | None = Field(default=None,max_length=512)
    timezone: Literal['Europe/Budapest'] | None = None
    university: str | None = Field(default=None,max_length=160)
    study_program: str | None = Field(default=None,max_length=160)
    study_level: StudyLevel | None = None
    study_year: int | None = Field(default=None,ge=1,le=12,strict=True)
    weekly_study_hours: int | None = Field(default=None,ge=1,le=80,strict=True)
    preferred_session_minutes: Literal[30,45,60,90] | None = None
    preferred_study_period: StudyPeriod | None = None
    preferred_study_days: list[Annotated[int, Field(strict=True,ge=1,le=7)]] | None = Field(default=None,max_length=7)
    interests: list[Interest] | None = Field(default=None,max_length=30)
    goals: list[Goal] | None = Field(default=None,max_length=7)
    onboarding_step: int | None = Field(default=None,ge=1,le=5,strict=True)

    @field_validator('university','study_program')
    @classmethod
    def optional_text(cls, value):
        return value or None

    @field_validator('interests')
    @classmethod
    def unique_interests(cls, values):
        if values is not None and len({value.name.casefold() for value in values}) != len(values):
            raise ValueError('Choose each interest only once.')
        return values

    @field_validator('preferred_study_days')
    @classmethod
    def valid_days(cls, values):
        if values is not None:
            if any(type(day) is not int or not 1 <= day <= 7 for day in values) or len(set(values)) != len(values):
                raise ValueError('Study days must be unique Monday–Sunday values (1–7).')
            return sorted(values)
        return values

    @field_validator('goals')
    @classmethod
    def unique_goals(cls, values):
        if values is not None and len(set(values)) != len(values):
            raise ValueError('Choose each goal only once.')
        return values

class OnboardingComplete(Schema):
    start_mode: Literal['manual','ai'] = 'manual'
    create_subjects: bool = False
    skip: bool = False
    subject_names: list[Annotated[str, Field(min_length=1,max_length=80)]] = Field(default_factory=list,max_length=30)

class DeleteAccount(Schema):
    confirmation: Literal['DELETE']
