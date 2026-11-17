from datetime import UTC, date, datetime, time
from zoneinfo import ZoneInfo

from app.core.exceptions import DomainError


def local_instant(day: date, clock: time, timezone: str) -> datetime:
    naive = datetime.combine(day, clock)
    zone = ZoneInfo(timezone)
    candidates = set()
    for fold in (0, 1):
        instant = naive.replace(tzinfo=zone, fold=fold).astimezone(UTC)
        if instant.astimezone(zone).replace(tzinfo=None) == naive:
            candidates.add(instant)
    if len(candidates) != 1:
        raise DomainError("Local time is ambiguous or nonexistent in the configured timezone. Choose another time.")
    return candidates.pop()


def interval(day: date, start: time, end: time, timezone: str):
    if end <= start:
        raise DomainError("End time must be after start time on the same date.")
    first, last = local_instant(day, start, timezone), local_instant(day, end, timezone)
    minutes = int((last - first).total_seconds() // 60)
    if minutes <= 0:
        raise DomainError("Study interval must have positive duration.")
    return first, last, minutes


def covers(windows, start: time, end: time) -> bool:
    cursor = start
    for window in sorted(windows, key=lambda item: item.start_time):
        if window.end_time <= cursor:
            continue
        if window.start_time > cursor:
            return False
        cursor = max(cursor, window.end_time)
        if cursor >= end:
            return True
    return False
