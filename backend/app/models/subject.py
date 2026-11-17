from sqlalchemy import String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, IdentityTimestamps


class Subject(IdentityTimestamps, Base):
    __tablename__ = "subjects"

    name: Mapped[str] = mapped_column(String(80), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="", nullable=False)
    color: Mapped[str | None] = mapped_column(String(32), nullable=True)
    tasks: Mapped[list["Task"]] = relationship(back_populates="subject", passive_deletes=True)
