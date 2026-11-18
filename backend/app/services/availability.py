from types import SimpleNamespace
from sqlalchemy.orm import Session

from app.core.exceptions import DomainError
from app.models import Availability
from app.models.enums import StudySessionStatus
from app.repositories import intervals
from app.schemas.availability import AvailabilityCreate
from app.services.common import now, required, serialize_write
from app.services.time_rules import covers, interval


def guard_sessions(db: Session, day, windows, timezone: str):
    for session in intervals.sessions_on(db, day):
        if session.status != StudySessionStatus.PLANNED:
            continue
        start, end, _ = interval(session.date, session.start_time, session.end_time, timezone)
        if session.origin == "SCHEDULER" and start >= now():
            continue  # Retain invalid generated work until explicit preview/apply.
        if end > now() and not covers(windows, session.start_time, session.end_time):
            raise DomainError("Availability change would invalidate a planned session. Edit or remove that session first.", 409)


def create(db: Session, data, timezone: str):
    serialize_write(db)
    interval(data.date, data.start_time, data.end_time, timezone)
    if intervals.overlapping(db, Availability, data.date, data.start_time, data.end_time):
        raise DomainError("Availability overlaps an existing interval.", 409)
    item = Availability(**data.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def patch(db: Session, id, data, timezone: str):
    serialize_write(db)
    item = required(db.get(Availability, id), "Availability")
    values = {key: getattr(item, key) for key in ("date", "start_time", "end_time")}
    values.update(data.model_dump(exclude_unset=True))
    # Service re-validates the merged interval rather than trusting a partial schema.
    if values["end_time"] <= values["start_time"]:
        raise DomainError("End time must be after start time on the same date.")
    merged = AvailabilityCreate(**values)
    interval(merged.date, merged.start_time, merged.end_time, timezone)
    if intervals.overlapping(db, Availability, merged.date, merged.start_time, merged.end_time, id):
        raise DomainError("Availability overlaps an existing interval.", 409)
    for day in {item.date, merged.date}:
        windows = [window for window in intervals.availability_on(db, day) if window.id != id]
        if merged.date == day:
            windows.append(SimpleNamespace(**values))
        guard_sessions(db, day, windows, timezone)
    for key, value in values.items():
        setattr(item, key, value)
    db.commit()
    db.refresh(item)
    return item


def remove(db: Session, id, timezone: str):
    serialize_write(db)
    item = required(db.get(Availability, id), "Availability")
    guard_sessions(db, item.date, [window for window in intervals.availability_on(db, item.date) if window.id != id], timezone)
    db.delete(item)
    db.commit()
