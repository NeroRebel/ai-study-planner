from datetime import date as DateValue, time as TimeValue
from decimal import Decimal
from uuid import UUID

from pydantic import Field, field_validator

from app.models.enums import StudySessionStatus
from app.schemas.availability import local_minute
from app.schemas.common import PatchSchema, Record, Schema


class StudySessionCreate(Schema):
    task_id: UUID
    date: DateValue
    start_time: TimeValue
    end_time: TimeValue
    planned_minutes: int | None = Field(default=None, gt=0)
    completed_minutes: int = Field(default=0, ge=0)
    status: StudySessionStatus = StudySessionStatus.PLANNED
    # Outcome controls are consumed by the service, not stored on the session.
    task_remaining_hours: Decimal | None = Field(default=None, ge=0, le=999999)
    confirm_no_progress: bool = False
    validate_time = field_validator("start_time", "end_time")(local_minute)


class StudySessionPatch(PatchSchema):
    task_id: UUID | None = None
    date: DateValue | None = None
    start_time: TimeValue | None = None
    end_time: TimeValue | None = None
    planned_minutes: int | None = Field(default=None, gt=0)
    completed_minutes: int | None = Field(default=None, ge=0)
    status: StudySessionStatus | None = None
    task_remaining_hours: Decimal | None = Field(default=None, ge=0, le=999999)
    confirm_no_progress: bool = False
    validate_time = field_validator("start_time", "end_time")(local_minute)


class StudySessionRead(Record):
    task_id: UUID
    date: DateValue
    start_time: TimeValue
    end_time: TimeValue
    planned_minutes: int
    completed_minutes: int
    status: StudySessionStatus
