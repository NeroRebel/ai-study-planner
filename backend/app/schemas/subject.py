from pydantic import Field
from app.schemas.common import PatchSchema, Record, Schema

COLOR_PATTERN = r"^(gold|purple|blue|green|#[0-9a-fA-F]{6})$"


class SubjectCreate(Schema):
    name: str = Field(min_length=1, max_length=80)
    description: str = Field(default="", max_length=10000)
    color: str | None = Field(default=None, pattern=COLOR_PATTERN)


class SubjectPatch(PatchSchema):
    nullable_fields = {"color"}
    name: str | None = Field(default=None, min_length=1, max_length=80)
    description: str | None = Field(default=None, max_length=10000)
    color: str | None = Field(default=None, pattern=COLOR_PATTERN)


class SubjectRead(Record):
    name: str
    description: str
    color: str | None
