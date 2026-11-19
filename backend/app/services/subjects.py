from sqlalchemy.orm import Session
from app.core.exceptions import DomainError
from app.models import Subject
from app.repositories import subjects as repo
from app.services.common import required, serialize_write


def create(db: Session, data):
    serialize_write(db)
    item = add(db, data)
    db.commit()
    db.refresh(item)
    return item


def add(db: Session, data):
    """Validated subject insertion inside a caller-owned transaction."""
    item = Subject(**data.model_dump())
    db.add(item)
    return item


def patch(db: Session, id, data):
    serialize_write(db)
    item = required(repo.get(db, id), "Subject")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(item, key, value)
    db.commit()
    db.refresh(item)
    return item


def remove(db: Session, id):
    serialize_write(db)
    item = required(repo.get(db, id), "Subject")
    if repo.has_tasks(db, id):
        raise DomainError("Subject still contains tasks. Reassign or delete them first.", 409)
    db.delete(item)
    db.commit()
