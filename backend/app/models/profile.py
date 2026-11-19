from uuid import UUID
from datetime import datetime
from sqlalchemy import CheckConstraint, String, text, Integer, Boolean, JSON
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base, UTCDateTime, utcnow


class Profile(Base):
    __tablename__ = 'profiles'
    __table_args__ = (
        CheckConstraint("timezone = 'Europe/Budapest'", name='profile_timezone'),
        CheckConstraint("avatar_path IS NULL OR replace(avatar_path, '-', '') LIKE replace(CAST(user_id AS VARCHAR), '-', '') || '/%'", name='avatar_owner'),
        CheckConstraint("study_year IS NULL OR study_year BETWEEN 1 AND 12", name='profile_study_year'),
        CheckConstraint("study_level IS NULL OR study_level IN ('Bachelor','Master','PhD','Other')", name='profile_study_level'),
        CheckConstraint("weekly_study_hours IS NULL OR weekly_study_hours BETWEEN 1 AND 80", name='profile_weekly_hours'),
        CheckConstraint("preferred_session_minutes IS NULL OR preferred_session_minutes IN (30,45,60,90)", name='profile_session_minutes'),
        CheckConstraint("preferred_study_period IS NULL OR preferred_study_period IN ('Morning','Afternoon','Evening','Flexible')", name='profile_study_period'),
        CheckConstraint("onboarding_step BETWEEN 1 AND 5", name='profile_onboarding_step'),
        CheckConstraint("onboarding_start_mode IS NULL OR onboarding_start_mode IN ('manual','ai')", name='profile_start_mode'),
    )
    user_id: Mapped[UUID] = mapped_column(primary_key=True)
    display_name: Mapped[str] = mapped_column(String(80), default='Student', server_default='Student')
    avatar_path: Mapped[str | None] = mapped_column(String(512), nullable=True)
    timezone: Mapped[str] = mapped_column(String(64), default='Europe/Budapest', server_default='Europe/Budapest')
    university: Mapped[str | None] = mapped_column(String(160))
    study_program: Mapped[str | None] = mapped_column(String(160))
    study_level: Mapped[str | None] = mapped_column(String(20))
    study_year: Mapped[int | None] = mapped_column(Integer)
    weekly_study_hours: Mapped[int | None] = mapped_column(Integer)
    preferred_session_minutes: Mapped[int | None] = mapped_column(Integer)
    preferred_study_period: Mapped[str | None] = mapped_column(String(20))
    preferred_study_days: Mapped[list] = mapped_column(JSON().with_variant(JSONB(), 'postgresql'), default=list, server_default='[]')
    interests: Mapped[list] = mapped_column(JSON().with_variant(JSONB(), 'postgresql'), default=list, server_default='[]')
    goals: Mapped[list] = mapped_column(JSON().with_variant(JSONB(), 'postgresql'), default=list, server_default='[]')
    onboarding_step: Mapped[int] = mapped_column(Integer, default=1, server_default='1')
    onboarding_completed: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text('false'))
    onboarding_skipped: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text('false'))
    onboarding_start_mode: Mapped[str | None] = mapped_column(String(10))
    onboarding_completed_at: Mapped[datetime | None] = mapped_column(UTCDateTime())
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow, server_default=text('CURRENT_TIMESTAMP'))
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow, onupdate=utcnow, server_default=text('CURRENT_TIMESTAMP'))
