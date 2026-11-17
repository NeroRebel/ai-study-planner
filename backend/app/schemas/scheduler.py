from datetime import date as DateValue, datetime
from typing import Literal
from uuid import UUID

from pydantic import Field, model_validator

from app.schemas.common import Schema
from app.schemas.study_session import StudySessionRead


class GeneratePlanRequest(Schema):
    date_from: DateValue
    date_to: DateValue
    task_ids: list[UUID] | None = Field(default=None, min_length=1, max_length=100)

    @model_validator(mode="after")
    def valid_range(self):
        if not 0 <= (self.date_to - self.date_from).days <= 30:
            raise ValueError("Choose an inclusive planning range of 1–31 days.")
        return self


class TaskAllocation(Schema):
    task_id: UUID
    outcome: Literal["FULLY_SCHEDULED", "PARTIALLY_SCHEDULED", "UNSCHEDULED", "SKIPPED"]
    remaining_minutes: int | None
    existing_reserved_minutes: int = 0
    generated_minutes: int = 0
    unscheduled_minutes: int | None
    reasons: list[str] = Field(default_factory=list)


class PlanningWarning(Schema):
    code: str
    date: DateValue | None = None
    detail: str


class GeneratePlanResult(Schema):
    algorithm_version: str = "greedy-v1"
    date_from: DateValue
    date_to: DateValue
    evaluated_at: datetime
    timezone: str
    sessions_created: list[StudySessionRead]
    created_count: int
    tasks_fully_scheduled: int
    tasks_partially_scheduled: int
    tasks_unscheduled: int
    tasks_skipped: int
    unscheduled_minutes: int
    tasks: list[TaskAllocation]
    warnings: list[PlanningWarning]
