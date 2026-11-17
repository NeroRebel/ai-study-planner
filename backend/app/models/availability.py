from datetime import date, time

from sqlalchemy import CheckConstraint, Date, Time
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, IdentityTimestamps


class Availability(IdentityTimestamps, Base):
    __tablename__ = "availability"
    __table_args__ = (CheckConstraint("end_time > start_time", name="interval_order"),)

    date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    start_time: Mapped[time] = mapped_column(Time(timezone=False), nullable=False)
    end_time: Mapped[time] = mapped_column(Time(timezone=False), nullable=False)
