from datetime import datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy import ForeignKeyConstraint, UniqueConstraint, CheckConstraint, Enum, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, IdentityTimestamps, Owned, UTCDateTime
from app.models.enums import Difficulty, Priority, TaskStatus


class Task(Owned, IdentityTimestamps, Base):
    __tablename__ = "tasks"
    __table_args__ = (
        UniqueConstraint("user_id", "id", name="uq_tasks_owner_id"),
        ForeignKeyConstraint(["user_id", "subject_id"], ["subjects.user_id", "subjects.id"], name="fk_tasks_owned_subject", deferrable=True, initially="DEFERRED"),
        CheckConstraint("estimated_hours > 0", name="estimated_positive"),
        CheckConstraint("remaining_hours >= 0 AND remaining_hours <= estimated_hours", name="remaining_range"),
        CheckConstraint("progress >= 0 AND progress <= 100", name="progress_range"),
        CheckConstraint("status != 'COMPLETED' OR (progress = 100 AND remaining_hours = 0)", name="completed_consistency"),
        CheckConstraint("remaining_hours != 0 OR status IN ('COMPLETED', 'CANCELLED')", name="zero_remaining_status"),
    )

    title: Mapped[str] = mapped_column(String(160), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="", nullable=False)
    subject_id: Mapped[UUID] = mapped_column(ForeignKey("subjects.id", deferrable=True, initially="DEFERRED"), index=True)
    deadline: Mapped[datetime] = mapped_column(UTCDateTime(), nullable=False, index=True)
    estimated_hours: Mapped[Decimal] = mapped_column(Numeric(12, 6), nullable=False)
    remaining_hours: Mapped[Decimal] = mapped_column(Numeric(12, 6), nullable=False)
    priority: Mapped[Priority] = mapped_column(Enum(Priority, native_enum=False, create_constraint=True, name="priority"), default=Priority.MEDIUM)
    difficulty: Mapped[Difficulty] = mapped_column(Enum(Difficulty, native_enum=False, create_constraint=True, name="difficulty"), default=Difficulty.MEDIUM)
    progress: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[TaskStatus] = mapped_column(Enum(TaskStatus, native_enum=False, create_constraint=True, name="task_status"), default=TaskStatus.TODO)
    subject: Mapped["Subject"] = relationship(back_populates="tasks", foreign_keys=[subject_id])
    study_sessions: Mapped[list["StudySession"]] = relationship(back_populates="task", passive_deletes=True, foreign_keys="StudySession.task_id")
