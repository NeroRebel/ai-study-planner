"""Deterministic, additive scheduling. See docs/scheduler.md for the policy.

Pure calculate_plan() reads snapshots and an explicit evaluation instant. Only
generate() owns persistence. No task effort, history, or existing session is edited.
"""
from collections import defaultdict
from collections.abc import Sequence
from dataclasses import dataclass, asdict
from datetime import UTC, date, datetime, time, timedelta
from decimal import InvalidOperation
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.exceptions import DomainError
from app.models import Availability, StudySession, Task
from app.models.enums import StudySessionStatus, TaskStatus
from app.schemas.common import minute_hours
from app.schemas.scheduler import (
    GeneratePlanRequest, GeneratePlanResult, PlanningWarning, TaskAllocation,
)
from app.schemas.study_session import StudySessionRead
from app.services.common import now, serialize_write
from app.services.time_rules import interval
from app.services.planning_capacity import (
    PRIORITY_ORDER, DIFFICULTY_ORDER, available_slots, clock_minute, clock_at, free_runs, task_order_key,
)

TARGET_MINUTES = 60
MIN_USEFUL_MINUTES = 30
MAX_CREATED_SESSIONS = 1000


@dataclass(frozen=True)
class ProposedSession:
    task_id: UUID
    date: date
    start_time: time
    end_time: time
    planned_minutes: int


@dataclass
class Plan:
    sessions: list[ProposedSession]
    tasks: list[TaskAllocation]
    warnings: list[PlanningWarning]


def calculate_plan(
    tasks: Sequence[Task],
    availability: Sequence[Availability],
    existing_sessions: Sequence[StudySession],
    request: GeneratePlanRequest,
    evaluated_at: datetime,
    timezone: str,
) -> Plan:
    if evaluated_at.tzinfo is None or evaluated_at.utcoffset() is None:
        raise ValueError("The scheduler requires an explicit timezone-aware evaluation instant.")
    evaluated_at = evaluated_at.astimezone(UTC)
    slots, shared_warnings, boundary = available_slots(
        availability, evaluated_at, timezone, request.date_from, request.date_to)
    warnings = [PlanningWarning(**asdict(warning)) for warning in shared_warnings]

    reserved: dict[UUID, int] = defaultdict(int)
    reservation_conflicts: set[UUID] = set()
    by_task = {task.id: task for task in tasks}
    for session in existing_sessions:
        # Every status blocks its entered interval. Outcomes/history are never changed.
        first, last = clock_minute(session.start_time), clock_minute(session.end_time)
        if last <= first:
            raise DomainError("An existing study session has invalid timing. Correct it before generating a plan.", 409)
        if session.date in slots:
            slots[session.date].difference_update(range(first, last))
        if session.status != StudySessionStatus.PLANNED:
            continue
        try:
            _, end, duration = interval(session.date, session.start_time, session.end_time, timezone)
        except DomainError:
            raise DomainError("An existing planned session has invalid local timing. Correct it before generating a plan.", 409) from None
        if end <= evaluated_at:
            continue
        # Count the full ongoing reservation, matching the existing CRUD service.
        reserved[session.task_id] += session.planned_minutes
        task = by_task.get(session.task_id)
        if task is not None:
            deadline = getattr(task, "deadline", None)
            if duration != session.planned_minutes or (
                isinstance(deadline, datetime) and deadline.tzinfo is not None and end > deadline
            ):
                reservation_conflicts.add(task.id)

    allocations: dict[UUID, TaskAllocation] = {}
    candidates: list[tuple[Task, int, datetime]] = []
    for task in tasks:
        if task.status not in {TaskStatus.TODO, TaskStatus.IN_PROGRESS}:
            allocations[task.id] = TaskAllocation(task_id=task.id, outcome="SKIPPED",
                remaining_minutes=0, unscheduled_minutes=0, reasons=["INACTIVE_TASK"])
            continue
        try:
            estimate, remaining = minute_hours(task.estimated_hours), minute_hours(task.remaining_hours)
            deadline = task.deadline
            if (estimate <= 0 or not 0 <= remaining <= estimate or deadline.tzinfo is None
                    or deadline.utcoffset() is None or task.priority not in PRIORITY_ORDER
                    or task.difficulty not in DIFFICULTY_ORDER):
                raise ValueError
            deadline = deadline.astimezone(UTC)
        except (AttributeError, TypeError, ValueError, InvalidOperation, OverflowError):
            allocations[task.id] = TaskAllocation(task_id=task.id, outcome="SKIPPED",
                remaining_minutes=None, unscheduled_minutes=None, reasons=["INVALID_TASK_DATA"])
            continue
        allocation = TaskAllocation(task_id=task.id, outcome="UNSCHEDULED",
            remaining_minutes=remaining, existing_reserved_minutes=reserved[task.id],
            unscheduled_minutes=max(0, remaining - reserved[task.id]))
        allocations[task.id] = allocation
        if remaining == 0:
            allocation.outcome = "SKIPPED"
            allocation.reasons = ["NO_REMAINING_WORK"]
        elif reserved[task.id] > remaining or task.id in reservation_conflicts:
            allocation.reasons = ["EXISTING_RESERVATION_CONFLICT"]
        elif deadline <= evaluated_at:
            allocation.reasons = ["DEADLINE_PASSED"]
        elif allocation.unscheduled_minutes == 0:
            allocation.outcome = "FULLY_SCHEDULED"
        else:
            candidates.append((task, allocation.unscheduled_minutes, deadline))

    # Same local due date = comparable urgency. Within that day: explicit priority,
    # exact deadline, shortest unreserved effort, difficulty, then opaque task ID.
    # Difficulty is only a final suitability tie-breaker; it never inflates effort.
    candidates.sort(key=lambda row: task_order_key(row[0], row[1], timezone))
    proposals: list[ProposedSession] = []
    limited = False
    for task, needed, deadline in candidates:
        allocation = allocations[task.id]
        # Prefer useful blocks first. Only use leftover sub-30-minute gaps after
        # all useful gaps have been considered for this task, or to finish its tail.
        for allow_fragments in (False, True):
            for day, first, last in free_runs(slots):
                while needed > 0 and first < last:
                    start = boundary(day, first)
                    if start >= deadline:
                        break
                    end = min(last, first + TARGET_MINUTES, first + needed)
                    while end > first and boundary(day, end) > deadline:
                        end -= 1
                    capacity = end - first
                    if capacity <= 0:
                        break
                    if not allow_fragments and capacity < MIN_USEFUL_MINUTES and needed >= MIN_USEFUL_MINUTES:
                        break
                    if len(proposals) >= MAX_CREATED_SESSIONS:
                        limited = True
                        break
                    # Rebalance a 61–89-minute useful segment into two >=30-minute
                    # blocks instead of emitting 60 plus an avoidable tiny tail.
                    useful = min(needed, last - first)
                    while useful > capacity and boundary(day, first + useful) > deadline:
                        useful -= 1
                    tail = useful - capacity
                    if capacity == TARGET_MINUTES and 0 < tail < MIN_USEFUL_MINUTES:
                        capacity -= MIN_USEFUL_MINUTES - tail
                        end = first + capacity
                    proposals.append(ProposedSession(task.id, day, clock_at(first), clock_at(end), capacity))
                    slots[day].difference_update(range(first, end))
                    needed -= capacity
                    allocation.generated_minutes += capacity
                    first = end
                if needed == 0 or limited:
                    break
            if needed == 0 or limited:
                break
        allocation.unscheduled_minutes = needed
        allocated = allocation.existing_reserved_minutes + allocation.generated_minutes
        allocation.outcome = ("FULLY_SCHEDULED" if needed == 0 else
                              "PARTIALLY_SCHEDULED" if allocated > 0 else "UNSCHEDULED")
        if needed:
            allocation.reasons = ["GENERATION_LIMIT" if limited else
                                  "INSUFFICIENT_FREE_TIME" if any(slots.values()) or availability else
                                  "NO_ENTERED_AVAILABILITY"]
    if limited:
        warnings.append(PlanningWarning(code="GENERATION_LIMIT",
            detail="The 1000-session safety limit was reached. Remaining effort is reported explicitly."))
    return Plan(proposals, [allocations[key] for key in sorted(allocations, key=str)], warnings)


def generate(db: Session, request: GeneratePlanRequest, timezone: str) -> GeneratePlanResult:
    """Serialize with existing CRUD writes, read once, then persist one atomic batch."""
    try:
        serialize_write(db)
        evaluated_at = now()
        statement = select(Task)
        if request.task_ids is not None:
            statement = statement.where(Task.id.in_(request.task_ids))
        tasks = list(db.scalars(statement))
        if request.task_ids is not None and {task.id for task in tasks} != set(request.task_ids):
            raise DomainError("One or more selected tasks no longer exist.", 404)
        windows = list(db.scalars(select(Availability).where(
            Availability.date >= request.date_from, Availability.date <= request.date_to)))
        # Semester-sized snapshot: include reservations outside the displayed
        # week so they cannot be allocated again in a second week.
        sessions = list(db.scalars(select(StudySession)))
        plan = calculate_plan(tasks, windows, sessions, request, evaluated_at, timezone)
        created = [StudySession(task_id=item.task_id, date=item.date,
            start_time=item.start_time, end_time=item.end_time, planned_minutes=item.planned_minutes,
            completed_minutes=0, status=StudySessionStatus.PLANNED) for item in plan.sessions]
        db.add_all(created)
        db.flush()
        result = GeneratePlanResult(
            date_from=request.date_from, date_to=request.date_to, evaluated_at=evaluated_at,
            timezone=timezone, sessions_created=[StudySessionRead.model_validate(item) for item in created],
            created_count=len(created),
            tasks_fully_scheduled=sum(task.outcome == "FULLY_SCHEDULED" for task in plan.tasks),
            tasks_partially_scheduled=sum(task.outcome == "PARTIALLY_SCHEDULED" for task in plan.tasks),
            tasks_unscheduled=sum(task.outcome == "UNSCHEDULED" for task in plan.tasks),
            tasks_skipped=sum(task.outcome == "SKIPPED" for task in plan.tasks),
            unscheduled_minutes=sum(task.unscheduled_minutes or 0 for task in plan.tasks),
            tasks=plan.tasks, warnings=plan.warnings,
        )
        db.commit()
        return result
    except Exception:
        db.rollback()
        raise
