from typing import Literal
from uuid import UUID
from pydantic import Field, AwareDatetime
from app.schemas.common import Schema
from app.schemas.replanning import ReplanPreview

class HistoryMessage(Schema):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=4000)

class AssistantRequest(Schema):
    message: str = Field(min_length=1, max_length=2000)
    history: list[HistoryMessage] = Field(default_factory=list, max_length=12)

class Confirmation(Schema):
    id: UUID
    type: str
    summary: dict
    expires_at: AwareDatetime
    status: str = "PENDING"
    preview: ReplanPreview | None = None

class AssistantResponse(Schema):
    message: str
    provider: str
    model: str
    actions: list[dict] = Field(default_factory=list)
    confirmation: Confirmation | None = None
    metadata: dict = Field(default_factory=dict)

class EmptyCommand(Schema):
    pass
