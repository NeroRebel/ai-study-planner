from app.services.common import commit
from datetime import UTC
from decimal import Decimal, ROUND_HALF_UP

from sqlalchemy.orm import Session

from app.core.exceptions import DomainError
from app.models import Task
from app.models.enums import TaskStatus, StudySessionStatus
from app.repositories import subjects, tasks, intervals
from app.schemas.common import minute_hours, hours_decimal, progress_percent
from app.services.common import now, required, serialize_write
from app.services.time_rules import interval


def task_values(data: dict, old: Task | None = None) -> dict:
    estimate = minute_hours(data.get("estimated_hours", old.estimated_hours if old else Decimal(0)))
    if estimate < 1:
        raise DomainError("Estimated effort must round to at least one minute.")
    explicit_remaining = data.get("remaining_hours") is not None
    explicit_progress = data.get("progress") is not None
    requested_status = data.get("status", old.status if old else TaskStatus.TODO)
    if data.get("status") == TaskStatus.COMPLETED:
        if (explicit_remaining and minute_hours(data["remaining_hours"]) != 0) or (explicit_progress and data["progress"] != 100):
            raise DomainError("COMPLETED requires zero remaining hours and 100% progress.")
        remaining = 0
    elif explicit_remaining:
        remaining = minute_hours(data["remaining_hours"])
    elif explicit_progress:
        remaining = int((Decimal(estimate) * (100 - data["progress"]) / 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP))
    else:
        remaining = minute_hours(old.remaining_hours) if old else estimate
    if remaining < 0 or remaining > estimate:
        raise DomainError("Remaining hours must be between zero and estimated hours. Revise the total estimate if necessary.")
    progress = progress_percent(estimate, remaining)
    if explicit_remaining and explicit_progress and progress != data["progress"]:
        raise DomainError("Progress contradicts the supplied remaining hours.")
    status = (TaskStatus.CANCELLED if requested_status == TaskStatus.CANCELLED else
              TaskStatus.COMPLETED if remaining == 0 else
              TaskStatus.IN_PROGRESS if progress > 0 or requested_status == TaskStatus.IN_PROGRESS else TaskStatus.TODO)
    result = {key: value for key, value in data.items() if key not in {"remaining_hours", "estimated_hours", "progress", "status"}}
    if "deadline" in result:
        result["deadline"] = result["deadline"].astimezone(UTC)
    result.update(estimated_hours=hours_decimal(estimate), remaining_hours=hours_decimal(remaining), progress=progress, status=status)
    return result


def apply_changes(db: Session, item: Task, data: dict, timezone: str) -> Task:
    values = task_values(data, item)
    if "subject_id" in values:
        required(subjects.get(db, values["subject_id"]), "Subject")
    planned = [session for session in intervals.sessions_for_task(db, item.id)
               if session.status == StudySessionStatus.PLANNED]
    current = now()
    relevant = []
    for session in planned:
        start, end, _ = interval(session.date, session.start_time, session.end_time, timezone)
        if end > current:
            relevant.append((session, start, end))
    # Generated future reservations are repaired only after an approved preview.
    fixed = [(session, start, end) for session, start, end in relevant
             if session.origin != "SCHEDULER" or start < current]
    if values["status"] in {TaskStatus.COMPLETED, TaskStatus.CANCELLED}:
        if any(start < current for _, start, _ in relevant):
            raise DomainError("Record the ongoing study session outcome before closing this task.", 409)
        # Lifecycle cleanup only; no sessions are moved or generated.
        for session, _, _ in fixed:
            db.delete(session)
    else:
        deadline = values.get("deadline", item.deadline)
        if any(end > deadline for _, _, end in fixed):
            raise DomainError("Update or remove planned sessions that exceed the revised deadline first.", 409)
        if sum(session.planned_minutes for session, _, _ in fixed) > minute_hours(values["remaining_hours"]):
            raise DomainError("Update or remove planned sessions that exceed remaining effort first.", 409)
    for key, value in values.items():
        setattr(item, key, value)
    return item


def create(db: Session, data):
    serialize_write(db)
    required(subjects.get(db, data.subject_id), "Subject")
    item = Task(**task_values(data.model_dump(exclude_none=True)))
    db.add(item)
    commit(db)
    db.refresh(item)
    return item


def patch(db: Session, id, data, timezone: str):
    serialize_write(db)
    item = required(tasks.get(db, id), "Task")
    apply_changes(db, item, data.model_dump(exclude_unset=True), timezone)
    commit(db)
    db.refresh(item)
    return item


def remove(db: Session, id):
    serialize_write(db)
    item = required(tasks.get(db, id), "Task")
    # Explicit task deletion also removes its linked study history via the FK.
    db.delete(item)
    commit(db)
