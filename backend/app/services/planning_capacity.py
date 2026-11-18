"""Shared, read-only minute capacity and ordering primitives for planning and risk."""
from collections import defaultdict
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from functools import lru_cache
from typing import Callable
from zoneinfo import ZoneInfo

from app.core.exceptions import DomainError
from app.models.enums import Difficulty, Priority
from app.services.time_rules import local_instant

PRIORITY_ORDER = {Priority.HIGH: 0, Priority.MEDIUM: 1, Priority.LOW: 2}
DIFFICULTY_ORDER = {Difficulty.HARD: 0, Difficulty.MEDIUM: 1, Difficulty.EASY: 2}


@dataclass(frozen=True)
class CapacityWarning:
    code: str
    date: date | None
    detail: str


def clock_minute(clock: time) -> int:
    if clock.tzinfo is not None or clock.second or clock.microsecond:
        raise DomainError("Existing intervals must use whole-minute local times.", 409)
    return clock.hour * 60 + clock.minute


def clock_at(minute: int) -> time:
    return time(minute // 60, minute % 60)


def free_runs(slots: dict[date, set[int]]) -> list[tuple[date, int, int]]:
    runs = []
    for day in sorted(slots):
        start = previous = None
        for minute in sorted(slots[day]):
            if previous is not None and minute != previous + 1:
                runs.append((day, start, previous + 1))
                start = None
            if start is None:
                start = minute
            previous = minute
        if start is not None:
            runs.append((day, start, previous + 1))
    return runs


def task_order_key(task, unreserved_minutes: int, timezone: str):
    deadline = task.deadline.astimezone(UTC)
    return (deadline.astimezone(ZoneInfo(timezone)).date(), PRIORITY_ORDER[task.priority],
            deadline, unreserved_minutes, DIFFICULTY_ORDER[task.difficulty], str(task.id))


def available_slots(availability, evaluated_at: datetime, timezone: str,
                    date_from: date, date_to: date) -> tuple[
                        dict[date, set[int]], list[CapacityWarning],
                        Callable[[date, int], datetime | None]]:
    slots: dict[date, set[int]] = defaultdict(set)
    warnings: list[CapacityWarning] = []
    dst_days: set[date] = set()

    @lru_cache(maxsize=None)
    def boundary(day: date, minute: int) -> datetime | None:
        try:
            return local_instant(day, clock_at(minute), timezone)
        except DomainError:
            return None

    for window in availability:
        if not date_from <= window.date <= date_to:
            continue
        first, last = clock_minute(window.start_time), clock_minute(window.end_time)
        if last <= first:
            warnings.append(CapacityWarning("INVALID_AVAILABILITY", window.date,
                                           "An invalid availability window was skipped."))
            continue
        for minute in range(first, last):
            start, end = boundary(window.date, minute), boundary(window.date, minute + 1)
            if start is None or end is None or end - start != timedelta(minutes=1):
                dst_days.add(window.date)
                continue
            if start >= evaluated_at:
                slots[window.date].add(minute)
    for day in sorted(dst_days):
        warnings.append(CapacityWarning("DST_TIME_SKIPPED", day,
            "Ambiguous, nonexistent, or discontinuous local minutes were left unscheduled."))
    return slots, warnings, boundary
