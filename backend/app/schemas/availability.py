from datetime import date as DateValue, time as TimeValue
from pydantic import field_validator, model_validator
from app.schemas.common import PatchSchema, Record, Schema


def local_minute(value: TimeValue) -> TimeValue:
    if value.tzinfo is not None or value.second or value.microsecond:
        raise ValueError("Use a local time with whole-minute precision (HH:MM).")
    return value


class AvailabilityCreate(Schema):
    date: DateValue
    start_time: TimeValue
    end_time: TimeValue
    validate_time = field_validator("start_time", "end_time")(local_minute)

    @model_validator(mode="after")
    def ordered(self):
        if self.end_time <= self.start_time:
            raise ValueError("End time must be after start time on the same date.")
        return self


class AvailabilityPatch(PatchSchema):
    date: DateValue | None = None
    start_time: TimeValue | None = None
    end_time: TimeValue | None = None
    validate_time = field_validator("start_time", "end_time")(local_minute)


class AvailabilityRead(Record):
    date: DateValue
    start_time: TimeValue
    end_time: TimeValue
