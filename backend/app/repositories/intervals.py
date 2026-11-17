from sqlalchemy import select
from sqlalchemy.orm import Session
from app.models import Availability, StudySession


def list_all(db: Session, model, *, date_from=None, date_to=None, task_id=None,
             status=None, offset=0, limit=100):
    statement = select(model)
    if date_from is not None:
        statement = statement.where(model.date >= date_from)
    if date_to is not None:
        statement = statement.where(model.date <= date_to)
    if task_id is not None:
        statement = statement.where(model.task_id == task_id)
    if status is not None:
        statement = statement.where(model.status == status)
    return db.scalars(statement.order_by(model.date, model.start_time, model.id).offset(offset).limit(limit)).all()


def overlapping(db: Session, model, day, start, end, exclude_id=None) -> bool:
    statement = select(model.id).where(model.date == day, model.start_time < end, model.end_time > start)
    if exclude_id is not None:
        statement = statement.where(model.id != exclude_id)
    return db.scalar(statement.limit(1)) is not None


def availability_on(db: Session, day):
    return db.scalars(select(Availability).where(Availability.date == day)
                      .order_by(Availability.start_time)).all()


def sessions_for_task(db: Session, task_id):
    return db.scalars(select(StudySession).where(StudySession.task_id == task_id)).all()


def sessions_on(db: Session, day):
    return db.scalars(select(StudySession).where(StudySession.date == day)).all()
