from sqlalchemy.orm import Session

from app.core.exceptions import DomainError
from app.models import StudySession
from app.models.enums import StudySessionStatus, TaskStatus
from app.repositories import intervals, tasks
from app.schemas.common import minute_hours
from app.services.common import now, required, serialize_write
from app.services.tasks import apply_changes
from app.services.time_rules import covers, interval

SESSION_FIELDS = ("task_id", "date", "start_time", "end_time", "planned_minutes", "completed_minutes", "status")


def save(db: Session, data, timezone: str, id=None):
    serialize_write(db)
    old = required(db.get(StudySession, id), "Study session") if id is not None else None
    incoming = data.model_dump(exclude_unset=True) if old else data.model_dump(exclude_none=True)
    values = {key: getattr(old, key) for key in SESSION_FIELDS} if old else {}
    values.update({key: value for key, value in incoming.items() if key in SESSION_FIELDS})
    task = required(tasks.get(db, values["task_id"]), "Task")
    start, end, duration = interval(values["date"], values["start_time"], values["end_time"], timezone)
    if incoming.get("planned_minutes") is not None and incoming["planned_minutes"] != duration:
        raise DomainError("Planned minutes must equal the actual elapsed interval duration.")
    values["planned_minutes"] = duration
    completed = values.get("completed_minutes", 0)
    status = values.get("status", StudySessionStatus.PLANNED)
    values.update(completed_minutes=completed, status=status)
    if completed < 0 or completed > duration:
        raise DomainError("Completed minutes must be between zero and planned minutes.")
    if status in {StudySessionStatus.PLANNED, StudySessionStatus.MISSED} and completed != 0:
        raise DomainError("PLANNED and MISSED sessions require zero completed minutes.")
    if status == StudySessionStatus.COMPLETED and completed != duration:
        raise DomainError("COMPLETED sessions require the full planned minutes.")
    if status == StudySessionStatus.PARTIALLY_COMPLETED and not 0 < completed < duration:
        raise DomainError("PARTIALLY_COMPLETED requires some, but not all, planned minutes.")
    if intervals.overlapping(db, StudySession, values["date"], values["start_time"], values["end_time"], id):
        raise DomainError("Study session overlaps an existing session.", 409)
    structural_change = old is None or any(key in incoming and incoming[key] != getattr(old, key)
                                         for key in ("task_id", "date", "start_time", "end_time"))
    if old is not None and old.status != StudySessionStatus.PLANNED and structural_change:
        raise DomainError("Historical task/date/time cannot be moved. Correct its outcome or create a new session.", 409)
    if structural_change or status == StudySessionStatus.PLANNED:
        if not covers(intervals.availability_on(db, values["date"]), values["start_time"], values["end_time"]):
            raise DomainError("Study session must fit entered availability.", 409)
    if status == StudySessionStatus.PLANNED:
        if task.status in {TaskStatus.COMPLETED, TaskStatus.CANCELLED}:
            raise DomainError("Completed or cancelled tasks cannot receive planned sessions.", 409)
        if start < now():
            raise DomainError("Planned sessions cannot begin in the past.")
        if end > task.deadline:
            raise DomainError("Study session must end on or before the task deadline.")
        reserved = 0
        for session in intervals.sessions_for_task(db, task.id):
            if session.id == id or session.status != StudySessionStatus.PLANNED:
                continue
            _, other_end, _ = interval(session.date, session.start_time, session.end_time, timezone)
            if other_end > now():
                reserved += session.planned_minutes
        if reserved + duration > minute_hours(task.remaining_hours):
            raise DomainError("Planned sessions exceed the task's remaining effort.", 409)
    elif end > now():
        raise DomainError("A study outcome cannot be reported before the session has ended.")
    outcome_changed = completed > 0 and (old is None or old.completed_minutes != completed or old.status != status)
    remaining = incoming.get("task_remaining_hours")
    if remaining is not None and completed == 0:
        raise DomainError("Task remaining effort can only accompany a reported study outcome.")
    if outcome_changed and remaining is None and not incoming.get("confirm_no_progress", False):
        raise DomainError("Supply task_remaining_hours or confirm_no_progress=true when recording study time.")
    item = old or StudySession()
    for key, value in values.items():
        setattr(item, key, value)
    db.add(item)
    db.flush()
    if remaining is not None:
        apply_changes(db, task, {"remaining_hours": remaining}, timezone)
    db.commit()
    db.refresh(item)
    return item


def remove(db: Session, id):
    serialize_write(db)
    item = required(db.get(StudySession, id), "Study session")
    db.delete(item)
    db.commit()
