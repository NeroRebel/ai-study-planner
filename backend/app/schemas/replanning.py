from datetime import datetime
from uuid import UUID
from pydantic import AwareDatetime, Field
from app.schemas.common import Schema
from app.schemas.scheduler import GeneratePlanRequest, PlanningWarning, TaskAllocation
from app.schemas.study_session import StudySessionRead
from app.schemas.risk import RiskResponse


class ReplanRequest(GeneratePlanRequest):
    """Explicit repair horizon; task_ids optionally limits affected root demand."""


class ReplanApply(ReplanRequest):
    evaluated_at: AwareDatetime
    fingerprint: str = Field(pattern=r'^[0-9a-f]{64}$')
    plan_digest: str = Field(pattern=r'^[0-9a-f]{64}$')


class SessionMove(Schema):
    session_id: UUID
    old_start: AwareDatetime
    old_end: AwareDatetime
    new_start: AwareDatetime
    new_end: AwareDatetime
    before: StudySessionRead
    after: StudySessionRead


class ReplanPreview(Schema):
    policy_version: str = 'affected-v1'
    request: ReplanRequest
    evaluated_at: datetime
    expires_at: datetime
    fingerprint: str
    plan_digest: str = ''
    sessions_kept: list[StudySessionRead]
    sessions_created: list[StudySessionRead]
    sessions_moved: list[SessionMove]
    sessions_removed: list[StudySessionRead]
    affected_tasks: list[UUID]
    tasks: list[TaskAllocation]
    unscheduled_minutes: int
    tasks_fully_scheduled: int
    tasks_partially_scheduled: int
    tasks_unscheduled: int
    reasons: list[str]
    warnings: list[PlanningWarning]
    risk_before: RiskResponse
    risk_after: RiskResponse
    applied: bool = False
