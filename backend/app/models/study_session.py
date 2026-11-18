from datetime import date, time
from uuid import UUID

from sqlalchemy import ForeignKeyConstraint, CheckConstraint, Date, Enum, ForeignKey, Integer, String, Time
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, IdentityTimestamps, Owned
from app.models.enums import StudySessionStatus


class StudySession(Owned, IdentityTimestamps, Base):
    __tablename__ = "study_sessions"
    __table_args__ = (
        ForeignKeyConstraint(["user_id", "task_id"], ["tasks.user_id", "tasks.id"], name="fk_sessions_owned_task", deferrable=True, initially="DEFERRED"),
        CheckConstraint("origin IN ('MANUAL', 'SCHEDULER')", name="origin_valid"),
        CheckConstraint("end_time > start_time", name="interval_order"),
        CheckConstraint("planned_minutes > 0", name="planned_positive"),
        CheckConstraint("completed_minutes >= 0 AND completed_minutes <= planned_minutes", name="completed_range"),
        CheckConstraint("(status IN ('PLANNED', 'MISSED') AND completed_minutes = 0) OR (status = 'COMPLETED' AND completed_minutes = planned_minutes) OR (status = 'PARTIALLY_COMPLETED' AND completed_minutes > 0 AND completed_minutes < planned_minutes)", name="outcome_consistency"),
    )

    origin: Mapped[str] = mapped_column(String(16), default="MANUAL", server_default="MANUAL", nullable=False)
    task_id: Mapped[UUID] = mapped_column(ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False, index=True)
    date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    start_time: Mapped[time] = mapped_column(Time(timezone=False), nullable=False)
    end_time: Mapped[time] = mapped_column(Time(timezone=False), nullable=False)
    planned_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    completed_minutes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    status: Mapped[StudySessionStatus] = mapped_column(Enum(StudySessionStatus, native_enum=False, create_constraint=True, name="study_session_status"), default=StudySessionStatus.PLANNED)
    task: Mapped["Task"] = relationship(back_populates="study_sessions", foreign_keys=[task_id])
