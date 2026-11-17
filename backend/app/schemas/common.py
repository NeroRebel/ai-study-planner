from datetime import datetime
from decimal import Decimal
from typing import ClassVar
from uuid import UUID

from pydantic import BaseModel, ConfigDict, model_validator


class Schema(BaseModel):
    model_config = ConfigDict(
        from_attributes=True, extra="forbid", str_strip_whitespace=True,
        allow_inf_nan=False, hide_input_in_errors=True,
    )


class PatchSchema(Schema):
    nullable_fields: ClassVar[set[str]] = set()

    @model_validator(mode="before")
    @classmethod
    def reject_nulls(cls, data):
        if isinstance(data, dict):
            for name, value in data.items():
                if value is None and name not in cls.nullable_fields:
                    raise ValueError(f"{name} may be omitted but cannot be null.")
        return data


class Record(Schema):
    id: UUID
    created_at: datetime
    updated_at: datetime


def minute_hours(value: Decimal) -> int:
    from decimal import ROUND_HALF_UP
    return int((value * 60).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def hours_decimal(minutes: int) -> Decimal:
    return (Decimal(minutes) / 60).quantize(Decimal("0.000001"))


def progress_percent(estimated_minutes: int, remaining_minutes: int) -> int:
    from decimal import ROUND_HALF_UP
    if remaining_minutes == 0:
        return 100
    result = int((Decimal(100) * (estimated_minutes - remaining_minutes) / estimated_minutes)
                 .quantize(Decimal("1"), rounding=ROUND_HALF_UP))
    return min(99, result)
