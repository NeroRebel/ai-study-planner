from uuid import UUID
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.models import Subject, Task


def get(db: Session, id: UUID) -> Subject | None:
    return db.get(Subject, id)


def list_all(db: Session, offset: int = 0, limit: int = 100):
    return db.scalars(select(Subject).order_by(Subject.name, Subject.id).offset(offset).limit(limit)).all()


def has_tasks(db: Session, id: UUID) -> bool:
    return db.scalar(select(Task.id).where(Task.subject_id == id).limit(1)) is not None
