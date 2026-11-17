from decimal import Decimal
from uuid import UUID

from pydantic import AwareDatetime, Field, field_serializer

from app.models.enums import Difficulty, Priority, TaskStatus
from app.schemas.common import PatchSchema, Record, Schema


class TaskCreate(Schema):
    title: str = Field(min_length=1, max_length=160)
    description: str = Field(default="", max_length=10000)
    subject_id: UUID
    deadline: AwareDatetime
    estimated_hours: Decimal = Field(gt=0, le=999999)
    remaining_hours: Decimal | None = Field(default=None, ge=0, le=999999)
    progress: int | None = Field(default=None, ge=0, le=100)
    priority: Priority = Priority.MEDIUM
    difficulty: Difficulty = Difficulty.MEDIUM
    status: TaskStatus = TaskStatus.TODO


class TaskPatch(PatchSchema):
    title: str | None = Field(default=None, min_length=1, max_length=160)
    description: str | None = Field(default=None, max_length=10000)
    subject_id: UUID | None = None
    deadline: AwareDatetime | None = None
    estimated_hours: Decimal | None = Field(default=None, gt=0, le=999999)
    remaining_hours: Decimal | None = Field(default=None, ge=0, le=999999)
    progress: int | None = Field(default=None, ge=0, le=100)
    priority: Priority | None = None
    difficulty: Difficulty | None = None
    status: TaskStatus | None = None


class TaskRead(Record):
    title: str
    description: str
    subject_id: UUID
    deadline: AwareDatetime
    estimated_hours: Decimal
    remaining_hours: Decimal
    priority: Priority
    difficulty: Difficulty
    progress: int
    status: TaskStatus

    @field_serializer("estimated_hours", "remaining_hours", when_used="json")
    def numeric_hours(self, value: Decimal) -> float:
        return float(value)
