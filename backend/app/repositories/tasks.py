from uuid import UUID
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.models import Task


def get(db: Session, id: UUID) -> Task | None:
    return db.get(Task, id)


def list_all(db: Session, *, subject_id=None, status=None, priority=None,
             deadline_from=None, deadline_to=None, offset=0, limit=100):
    statement = select(Task)
    for column, value in ((Task.subject_id, subject_id), (Task.status, status), (Task.priority, priority)):
        if value is not None:
            statement = statement.where(column == value)
    if deadline_from is not None:
        statement = statement.where(Task.deadline >= deadline_from)
    if deadline_to is not None:
        statement = statement.where(Task.deadline <= deadline_to)
    return db.scalars(statement.order_by(Task.deadline, Task.id).offset(offset).limit(limit)).all()
