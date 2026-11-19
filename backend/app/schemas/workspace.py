"""Version-one portable records: no ownership, credentials or writable audit fields."""
from datetime import datetime
from typing import Annotated, Literal

from pydantic import AwareDatetime, Field, StringConstraints, field_validator

from app.models.enums import StudySessionStatus
from app.schemas.availability import AvailabilityCreate
from app.schemas.common import Schema
from app.schemas.subject import SubjectCreate
from app.schemas.task import TaskCreate

MAX_FILE_BYTES = 2 * 1024 * 1024
MAX_ROWS = 2000
GROUPS = ('subjects', 'tasks', 'availability', 'study_sessions')
LogicalId = Annotated[str, Field(min_length=1, max_length=64, pattern=r'^[A-Za-z0-9_-]+$')]
Mode = Literal['MERGE', 'REPLACE']


class SubjectRow(SubjectCreate):
    id: LogicalId


class TaskRow(TaskCreate):
    id: LogicalId
    subject_id: LogicalId


class AvailabilityRow(AvailabilityCreate):
    id: LogicalId


class SessionRow(AvailabilityCreate):
    id: LogicalId
    task_id: LogicalId
    planned_minutes: int = Field(gt=0, strict=True)
    completed_minutes: int = Field(ge=0, strict=True)
    status: StudySessionStatus
    origin: Literal['MANUAL', 'SCHEDULER'] = 'MANUAL'


class PortableWorkspace(Schema):
    subjects: list[object] = Field(max_length=MAX_ROWS)
    tasks: list[object] = Field(max_length=MAX_ROWS)
    availability: list[object] = Field(max_length=MAX_ROWS)
    study_sessions: list[object] = Field(max_length=MAX_ROWS)


class WorkspaceDocument(Schema):
    format: Literal['ai-study-planner-workspace']
    version: Literal[1]
    exported_at: AwareDatetime
    workspace: PortableWorkspace

    @field_validator('version', mode='before')
    @classmethod
    def integer_version(cls, value):
        if type(value) is not int:
            raise ValueError('Version must be an integer.')
        return value


class PreviewRequest(Schema):
    mode: Mode
    content: Annotated[str, StringConstraints(strip_whitespace=False, min_length=1, max_length=MAX_FILE_BYTES)]


class ApplyRequest(PreviewRequest):
    evaluated_at: AwareDatetime
    fingerprint: str = Field(pattern=r'^[0-9a-f]{64}$')
    confirmation: Literal['', 'REPLACE'] = ''


class Counts(Schema):
    subjects: int = 0
    tasks: int = 0
    availability: int = 0
    study_sessions: int = 0


class ImportIssue(Schema):
    entity: Literal['subjects', 'tasks', 'availability', 'study_sessions']
    row: int
    code: str
    message: str


class ImportPreview(Schema):
    mode: Mode
    evaluated_at: datetime
    expires_at: datetime
    fingerprint: str
    can_apply: bool
    additions: Counts
    existing: Counts
    duplicates: Counts
    conflicts: list[ImportIssue]
    invalid_rows: list[ImportIssue]
    warnings: list[str]


class ImportResult(Schema):
    applied: bool = True
    imported: Counts
    duplicates: Counts
    conflicts_skipped: int
