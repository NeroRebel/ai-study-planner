from sqlalchemy import UniqueConstraint, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, IdentityTimestamps, Owned


class Subject(Owned, IdentityTimestamps, Base):
    __tablename__ = "subjects"
    __table_args__ = (UniqueConstraint("user_id", "id", name="uq_subjects_owner_id"),)

    name: Mapped[str] = mapped_column(String(80), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="", nullable=False)
    color: Mapped[str | None] = mapped_column(String(32), nullable=True)
    tasks: Mapped[list["Task"]] = relationship(back_populates="subject", passive_deletes=True, foreign_keys="Task.subject_id")
