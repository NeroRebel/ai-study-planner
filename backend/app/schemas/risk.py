from datetime import date as DateValue, datetime
from typing import Literal
from uuid import UUID

from pydantic import AwareDatetime
from app.schemas.common import Schema

RiskLevel = Literal["LOW", "MEDIUM", "HIGH"]
AssessmentStatus = Literal["assessed", "not_applicable", "unavailable"]


class TaskRiskAssessment(Schema):
    task_id: UUID
    subject_id: UUID
    level: RiskLevel | None
    status: AssessmentStatus
    remaining_minutes: int | None
    scheduled_minutes: int
    allocated_free_minutes: int
    shared_slack_minutes: int
    free_available_minutes: int
    capacity_minutes: int
    shortfall_minutes: int | None
    deadline: AwareDatetime | None
    minutes_until_deadline: int | None
    explanation: str
    reasons: list[str]


class SubjectRiskAssessment(Schema):
    subject_id: UUID
    level: RiskLevel | None
    status: AssessmentStatus
    active_task_count: int
    high_count: int
    medium_count: int
    low_count: int
    unavailable_count: int
    explanation: str


class RiskWarning(Schema):
    code: str
    date: DateValue | None
    detail: str


class RiskResponse(Schema):
    policy_version: str = "capacity-v1"
    evaluated_at: datetime
    expires_at: datetime
    timezone: str
    tasks: list[TaskRiskAssessment]
    subjects: list[SubjectRiskAssessment]
    warnings: list[RiskWarning]
