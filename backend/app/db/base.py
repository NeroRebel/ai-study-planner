from datetime import UTC, datetime
from uuid import UUID, uuid4

from sqlalchemy import DateTime, ForeignKey, MetaData, Uuid, text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy.types import TypeDecorator


class UTCDateTime(TypeDecorator):
    """TIMESTAMPTZ on PostgreSQL; restore UTC metadata in isolated SQLite tests."""
    impl = DateTime
    cache_ok = True

    def load_dialect_impl(self, dialect):
        return dialect.type_descriptor(DateTime(timezone=True))

    def process_bind_param(self, value, _dialect):
        if value is not None:
            if value.tzinfo is None or value.utcoffset() is None:
                raise ValueError("A timezone-aware instant is required.")
            return value.astimezone(UTC)
        return value

    def process_result_value(self, value, _dialect):
        if value is not None:
            return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)
        return value


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention={
        "ix": "ix_%(table_name)s_%(column_0_name)s",
        "uq": "uq_%(table_name)s_%(column_0_name)s",
        "ck": "ck_%(table_name)s_%(constraint_name)s",
        "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
        "pk": "pk_%(table_name)s",
    })


def utcnow() -> datetime:
    return datetime.now(UTC)


class IdentityTimestamps:
    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow, server_default=text("CURRENT_TIMESTAMP"), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow, onupdate=utcnow, server_default=text("CURRENT_TIMESTAMP"), nullable=False)


class Owned:
    # NULL is a deliberately quarantined legacy row, never an authenticated owner.
    user_id: Mapped[UUID | None] = mapped_column(Uuid, ForeignKey("profiles.user_id", ondelete="CASCADE"), nullable=True, index=True)
