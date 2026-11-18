"""Server-owned, expiring command proposals; conversation text is never persisted."""
from datetime import datetime
from sqlalchemy import JSON, String, CheckConstraint
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base, Owned, IdentityTimestamps, UTCDateTime

class AssistantAction(Owned, IdentityTimestamps, Base):
    __tablename__ = "assistant_actions"
    __table_args__ = (CheckConstraint("status IN ('PENDING','CONFIRMED','CANCELLED')", name="action_status"),)
    kind: Mapped[str] = mapped_column(String(40))
    payload: Mapped[dict] = mapped_column(JSON)
    summary: Mapped[dict] = mapped_column(JSON)
    fingerprint: Mapped[str] = mapped_column(String(64))
    expires_at: Mapped[datetime] = mapped_column(UTCDateTime())
    status: Mapped[str] = mapped_column(String(16), default="PENDING")
    result: Mapped[dict | None] = mapped_column(JSON, nullable=True)
