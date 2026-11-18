from uuid import UUID
from datetime import datetime
from sqlalchemy import CheckConstraint, String, text
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base, UTCDateTime, utcnow


class Profile(Base):
    __tablename__ = 'profiles'
    __table_args__ = (
        CheckConstraint("timezone = 'Europe/Budapest'", name='profile_timezone'),
        CheckConstraint("avatar_path IS NULL OR replace(avatar_path, '-', '') LIKE replace(CAST(user_id AS VARCHAR), '-', '') || '/%'", name='avatar_owner'),
    )
    user_id: Mapped[UUID] = mapped_column(primary_key=True)
    display_name: Mapped[str] = mapped_column(String(80), default='Student', server_default='Student')
    avatar_path: Mapped[str | None] = mapped_column(String(512), nullable=True)
    timezone: Mapped[str] = mapped_column(String(64), default='Europe/Budapest', server_default='Europe/Budapest')
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow, server_default=text('CURRENT_TIMESTAMP'))
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow, onupdate=utcnow, server_default=text('CURRENT_TIMESTAMP'))
