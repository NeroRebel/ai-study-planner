"""Read-only deadline assessment; exact policy is documented in docs/risk-engine.md."""
from bisect import bisect_right
from collections import defaultdict
from collections.abc import Sequence
from dataclasses import asdict
from datetime import UTC, datetime, timedelta
from decimal import InvalidOperation
from uuid import UUID
from zoneinfo import ZoneInfo

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.core.exceptions import DomainError
from app.models import Availability, StudySession, Subject, Task
from app.models.enums import StudySessionStatus, TaskStatus
from app.schemas.common import minute_hours
from app.schemas.risk import RiskResponse, RiskWarning, SubjectRiskAssessment, TaskRiskAssessment
from app.services.common import serialize_read, now
from app.services.planning_capacity import (
    DIFFICULTY_ORDER, PRIORITY_ORDER, available_slots, clock_minute, task_order_key,
)
from app.services.time_rules import interval

MINUTE = timedelta(minutes=1)
CLOSE_HOURS = 48
UNPLANNED_DAYS = 7
MIN_MARGIN_MINUTES = 90
MONTHS = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")


def hours(minutes: int) -> str:
    return f"{minutes / 60:.1f}h"


def due_text(deadline: datetime, timezone: str) -> str:
    local = deadline.astimezone(ZoneInfo(timezone))
    return f"{local.day:02d} {MONTHS[local.month - 1]} {local.year}"


def calculate_risks(tasks: Sequence[Task], subjects: Sequence[Subject],
                    availability: Sequence[Availability], sessions: Sequence[StudySession],
                    evaluated_at: datetime, timezone: str) -> RiskResponse:
    if evaluated_at.tzinfo is None or evaluated_at.utcoffset() is None:
        raise ValueError("Risk assessment requires a timezone-aware evaluation instant.")
    evaluated_at = evaluated_at.astimezone(UTC)
    zone = ZoneInfo(timezone)
    rows: dict[UUID, TaskRiskAssessment] = {}
    eligible: dict[UUID, Task] = {}
    for task in tasks:
        active = task.status in {TaskStatus.TODO, TaskStatus.IN_PROGRESS}
        deadline = getattr(task, "deadline", None)
        valid_deadline = isinstance(deadline, datetime) and deadline.tzinfo is not None and deadline.utcoffset() is not None
        deadline = deadline.astimezone(UTC) if valid_deadline else None
        remaining = None
        try:
            estimate, remaining = minute_hours(task.estimated_hours), minute_hours(task.remaining_hours)
            if estimate <= 0 or not 0 <= remaining <= estimate:
                raise ValueError
        except (AttributeError, TypeError, ValueError, InvalidOperation, OverflowError):
            remaining = None
        valid = remaining is not None and valid_deadline and task.priority in PRIORITY_ORDER and task.difficulty in DIFFICULTY_ORDER
        status = "not_applicable" if not active or remaining == 0 else "unavailable" if not valid else "assessed"
        row = TaskRiskAssessment(task_id=task.id, subject_id=task.subject_id, level=None, status=status,
            remaining_minutes=remaining, scheduled_minutes=0, allocated_free_minutes=0,
            shared_slack_minutes=0, free_available_minutes=0, capacity_minutes=0,
            shortfall_minutes=remaining, deadline=deadline,
            minutes_until_deadline=int((deadline - evaluated_at).total_seconds() // 60) if deadline else None,
            explanation="", reasons=[])
        if not active:
            row.explanation = "This task is completed or cancelled; no active deadline risk applies."
            row.reasons = ["inactive_task"]
            row.shortfall_minutes = 0
        elif remaining == 0:
            row.explanation = "No remaining work is recorded; no active deadline risk applies."
            row.reasons = ["no_remaining_work"]
        elif not valid:
            row.explanation = "Correct this task's deadline, effort, priority, or difficulty before assessing its risk."
            row.reasons = ["invalid_task_data"]
        else:
            eligible[task.id] = task
        rows[task.id] = row

    today = evaluated_at.astimezone(zone).date()
    last_day = max([today, *(task.deadline.astimezone(zone).date() for task in eligible.values())])
    slots, capacity_warnings, boundary = available_slots(availability, evaluated_at, timezone, today, last_day)
    available = {boundary(day, minute) for day, minutes in slots.items() for minute in minutes}
    # Every occupied minute is removed from free capacity, independent of status,
    # origin (manual/generated), selected task, or whether it counts as useful work.
    occupied: dict[datetime, set[UUID]] = defaultdict(set)
    proposed_scheduled: dict[UUID, set[datetime]] = defaultdict(set)
    warnings = [RiskWarning(**asdict(warning)) for warning in capacity_warnings]
    for session in sessions:
        if not today <= session.date <= last_day:
            continue
        try:
            first, last = clock_minute(session.start_time), clock_minute(session.end_time)
            if last <= first:
                raise DomainError("Invalid interval.")
        except (AttributeError, DomainError):
            warnings.append(RiskWarning(code="INVALID_SESSION", date=session.date,
                detail="A session has invalid timing; review its record."))
            # Unknown occupancy cannot safely become spare time on this date.
            for minute in slots.get(session.date, set()):
                occupied[boundary(session.date, minute)].add(session.id)
            continue
        future = set()
        for minute in range(first, last):
            start, end = boundary(session.date, minute), boundary(session.date, minute + 1)
            if start is not None and end is not None and end - start == MINUTE and start >= evaluated_at:
                occupied[start].add(session.id)
                future.add(start)
        task = eligible.get(session.task_id)
        if task is None or session.status != StudySessionStatus.PLANNED:
            continue
        try:
            _, end, duration = interval(session.date, session.start_time, session.end_time, timezone)
            valid_session = (duration == session.planned_minutes and session.completed_minutes == 0
                             and end <= task.deadline)
        except DomainError:
            valid_session = False
        if not valid_session:
            warnings.append(RiskWarning(code="INVALID_PLANNED_SESSION", date=session.date,
                detail="Invalid planned time was excluded from useful scheduled capacity."))
            continue
        proposed_scheduled[task.id].update(future & available)

    for task_id, cells in proposed_scheduled.items():
        # Deduplicate overlapping reservations; a physically conflicting cell is
        # never promised to two tasks. Only future safe whole minutes are useful.
        useful = {cell for cell in cells if len(occupied[cell]) == 1
                  and cell + MINUTE <= eligible[task_id].deadline}
        rows[task_id].scheduled_minutes = min(rows[task_id].remaining_minutes, len(useful))
    free = sorted(available - occupied.keys())
    candidates = sorted(
        (task for task in eligible.values() if task.deadline > evaluated_at),
        key=lambda task: task_order_key(task, rows[task.id].remaining_minutes - rows[task.id].scheduled_minutes, timezone),
    )
    # Shadow claims are integers only: no scheduler invocation, ProposedSessions,
    # ORM writes or generated blocks. Each required free minute is claimed once.
    for task in candidates:
        row = rows[task.id]
        count = min(row.remaining_minutes - row.scheduled_minutes,
                    bisect_right(free, task.deadline.astimezone(UTC) - MINUTE))
        row.allocated_free_minutes = count
        free = free[count:]
    for task in eligible.values():
        row = rows[task.id]
        if task.deadline > evaluated_at:
            row.shared_slack_minutes = bisect_right(free, task.deadline.astimezone(UTC) - MINUTE)
        row.free_available_minutes = row.allocated_free_minutes + row.shared_slack_minutes
        row.capacity_minutes = row.scheduled_minutes + row.free_available_minutes
        row.shortfall_minutes = max(0, row.remaining_minutes - row.capacity_minutes)
        due = due_text(row.deadline, timezone)
        if task.deadline <= evaluated_at:
            row.level = "HIGH"
            row.reasons = ["deadline_passed"]
            row.explanation = f"The deadline passed on {due} and {hours(row.remaining_minutes)} of work remains."
        elif row.shortfall_minutes > 0:
            row.level = "HIGH"
            row.reasons = ["insufficient_capacity"]
            row.explanation = (f"You need {hours(row.remaining_minutes)} of study time, but only "
                               f"{hours(row.capacity_minutes)} of capacity is available before {due}.")
        else:
            row.reasons = ["sufficient_capacity"]
            margin = row.capacity_minutes - row.remaining_minutes
            if margin < max(MIN_MARGIN_MINUTES, (row.remaining_minutes + 3) // 4):
                row.reasons.append("narrow_margin")
            seconds_left = (task.deadline - evaluated_at).total_seconds()
            if seconds_left <= CLOSE_HOURS * 3600:
                row.reasons.append("deadline_soon")
            if (seconds_left <= UNPLANNED_DAYS * 86400
                    and row.scheduled_minutes * 2 < row.remaining_minutes
                    and row.capacity_minutes < row.remaining_minutes * 2):
                row.reasons.append("low_schedule_coverage")
            if len(row.reasons) > 1:
                row.level = "MEDIUM"
                row.explanation = f"Enough capacity exists, but only {hours(margin)} of margin remains before {due}."
                if "deadline_soon" in row.reasons:
                    row.explanation += " The deadline is within 48 hours."
                if "low_schedule_coverage" in row.reasons:
                    row.explanation += " Less than half the work is scheduled and the deadline is within 7 days."
            else:
                row.level = "LOW"
                row.reasons.append("healthy_margin")
                row.explanation = (f"You have {hours(row.capacity_minutes)} of capacity for "
                                   f"{hours(row.remaining_minutes)} of remaining work before {due}.")
            row.explanation += (f" Capacity includes {hours(row.scheduled_minutes)} scheduled and "
                                f"{hours(row.free_available_minutes)} usable free time after competing work.")
    subject_rows = []
    for subject in sorted(subjects, key=lambda item: str(item.id)):
        active = [row for row in rows.values() if row.subject_id == subject.id and row.status != "not_applicable"]
        high = sum(row.level == "HIGH" for row in active)
        medium = sum(row.level == "MEDIUM" for row in active)
        low = sum(row.level == "LOW" for row in active)
        unknown = sum(row.status == "unavailable" for row in active)
        level = "HIGH" if high else "MEDIUM" if medium else None if unknown else "LOW" if low else None
        status = "assessed" if level else "unavailable" if unknown else "not_applicable"
        subject_rows.append(SubjectRiskAssessment(subject_id=subject.id, level=level, status=status,
            active_task_count=len(active), high_count=high, medium_count=medium, low_count=low,
            unavailable_count=unknown,
            explanation=("No active deadline-based work." if not active else
                         "Some task data needs correction." if status == "unavailable" else
                         f"{high} high, {medium} medium, and {low} low-risk active tasks."
                         + (f" {unknown} tasks could not be assessed." if unknown else ""))))
    # The browser must not retain an apparently live assessment across a known
    # urgency/deadline/minute boundary. Refresh remains one batch request.
    expiry = evaluated_at + timedelta(seconds=60)
    next_minute = evaluated_at.replace(second=0, microsecond=0) + MINUTE
    expiry = min(expiry, next_minute)
    for task in eligible.values():
        for hours_before in (0, CLOSE_HOURS, UNPLANNED_DAYS * 24):
            change = task.deadline - timedelta(hours=hours_before)
            if evaluated_at < change < expiry:
                expiry = change
    return RiskResponse(evaluated_at=evaluated_at, expires_at=expiry, timezone=timezone,
        tasks=[rows[key] for key in sorted(rows, key=str)], subjects=subject_rows, warnings=warnings)


def assess_all(db: Session, timezone: str, evaluated_at: datetime | None = None) -> RiskResponse:
    # Shared read lock gives four SELECTs a consistent snapshot relative to every
    # existing exclusive-lock CRUD/scheduler write. It never changes table data.
    serialize_read(db)
    evaluation = evaluated_at if evaluated_at is not None else now()
    subjects = list(db.scalars(select(Subject)))
    tasks = list(db.scalars(select(Task)))
    availability = list(db.scalars(select(Availability)))
    sessions = list(db.scalars(select(StudySession)))
    return calculate_risks(tasks, subjects, availability, sessions, evaluation, timezone)


def assess_task(db: Session, task_id: UUID, timezone: str,
                evaluated_at: datetime | None = None) -> TaskRiskAssessment:
    result = assess_all(db, timezone, evaluated_at)
    for row in result.tasks:
        if row.task_id == task_id:
            return row
    raise DomainError("Task not found.", 404)
