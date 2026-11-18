from datetime import UTC, datetime
from sqlalchemy import text
from sqlalchemy.orm import Session
from app.core.exceptions import DomainError


def now() -> datetime:
    return datetime.now(UTC)


def serialize_write(db: Session) -> None:
    # One personal workspace: serialize writes before validation to avoid check/insert races.
    # Transaction-scoped locks work through PostgreSQL transaction poolers.
    if db.get_bind().dialect.name == "postgresql":
        db.execute(text("SELECT pg_advisory_xact_lock(946321, :key)"), {"key": workspace_key(db)})


def required(value, label: str):
    if value is None:
        raise DomainError(f"{label} not found.", 404)
    return value


def check_range(start, end) -> None:
    if start is not None and end is not None and end < start:
        raise DomainError("Range end must be on or after its start.")


def workspace_key(db: Session) -> int:
    import hashlib
    owner=db.info.get("user_id")
    return int.from_bytes(hashlib.sha256(str(owner).encode()).digest()[:4],"big",signed=True) if owner else 1


def serialize_read(db: Session) -> None:
    if db.get_bind().dialect.name == "postgresql":
        db.execute(text("SELECT pg_advisory_xact_lock_shared(946321, :key)"), {"key":workspace_key(db)})
