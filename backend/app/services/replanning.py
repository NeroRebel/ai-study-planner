"""Conservative affected-plan repair. Policy: docs/replanning.md.

No ORM object from the input snapshot is changed by calculate_replan(). Allocation
is exclusively scheduler.calculate_plan(); this module chooses which reservations
may be released and produces an identity-preserving diff.
"""
import hashlib
import json
from collections import defaultdict
from collections.abc import Sequence
from datetime import UTC, datetime, timedelta
from uuid import NAMESPACE_URL, uuid5

from sqlalchemy import inspect, select, text
from sqlalchemy.orm import Session

from app.core.exceptions import DomainError
from app.models import Availability, StudySession, Subject, Task
from app.models.enums import StudySessionStatus, TaskStatus
from app.repositories.intervals import overlap_conditions
from app.schemas.common import minute_hours
from app.schemas.replanning import ReplanApply, ReplanPreview, ReplanRequest, SessionMove
from app.schemas.scheduler import PlanningWarning
from app.schemas.study_session import StudySessionRead
from app.services.common import now, serialize_write
from app.services.planning_capacity import task_order_key
from app.services.risk_engine import calculate_risks
from app.services.scheduler import calculate_plan
from app.services.time_rules import covers, interval

TTL = timedelta(minutes=5)
MAX_DISPLACEMENT_TRIALS = 1000


def digest(value: object) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True, default=str, separators=(',', ':')).encode()).hexdigest()


def snapshot_fingerprint(tasks, subjects, windows, sessions, request, timezone):
    def records(objects):
        return [{column.key: getattr(obj, column.key) for column in inspect(type(obj)).columns}
                for obj in sorted(objects, key=lambda item: str(item.id))]
    return digest([records(tasks), records(subjects), records(windows), records(sessions),
                   request.model_dump(mode='json'), timezone, 'affected-v1'])


def session_key(item):
    return item.date, item.start_time, item.end_time, str(item.id)


def overlaps(a, b):
    return all(overlap_conditions(a.date, a.start_time, a.end_time, b.date, b.start_time, b.end_time))


def session_read(item: StudySession, evaluated_at: datetime) -> StudySessionRead:
    return StudySessionRead(id=item.id, task_id=item.task_id, date=item.date,
        start_time=item.start_time, end_time=item.end_time, planned_minutes=item.planned_minutes,
        completed_minutes=item.completed_minutes, status=item.status,
        origin=item.origin or 'MANUAL', created_at=item.created_at or evaluated_at,
        updated_at=item.updated_at or evaluated_at)


def calculate_replan(tasks: Sequence[Task], subjects: Sequence[Subject],
                     windows: Sequence[Availability], sessions: Sequence[StudySession], request: ReplanRequest,
                     evaluated_at: datetime, timezone: str) -> ReplanPreview:
    if evaluated_at.tzinfo is None or evaluated_at.utcoffset() is None:
        raise ValueError('Replanning requires a timezone-aware evaluation instant.')
    evaluated_at = evaluated_at.astimezone(UTC)
    # Database row order is not part of the policy, including warning/risk order.
    tasks = sorted(tasks, key=lambda item: str(item.id))
    subjects = sorted(subjects, key=lambda item: str(item.id))
    windows = sorted(windows, key=lambda item: (item.date, item.start_time, str(item.id)))
    sessions = sorted(sessions, key=session_key)
    by_task = {task.id: task for task in tasks}
    roots = set(request.task_ids) if request.task_ids is not None else set(by_task)
    if not roots <= by_task.keys():
        raise DomainError('One or more selected tasks no longer exist.', 404)
    fingerprint = snapshot_fingerprint(tasks, subjects, windows, sessions, request, timezone)
    warnings, reasons = [], set()
    boundaries = {s.id: interval(s.date, s.start_time, s.end_time, timezone) for s in sessions}
    editable = [s for s in sessions if s.origin == 'SCHEDULER'
                and s.status == StudySessionStatus.PLANNED and s.completed_minutes == 0
                and boundaries[s.id][0] >= evaluated_at
                and request.date_from <= s.date <= request.date_to]
    editable_ids = {s.id for s in editable}
    preserved = [s for s in sessions if s.id not in editable_ids]
    by_day = defaultdict(list)
    for window in windows:
        by_day[window.date].append(window)
    reserved = defaultdict(int)
    for session in preserved:
        if session.status == StudySessionStatus.PLANNED and boundaries[session.id][1] > evaluated_at:
            reserved[session.task_id] += session.planned_minutes
            task = by_task[session.task_id]
            if (boundaries[session.id][1] > task.deadline
                    or task.status in {TaskStatus.COMPLETED, TaskStatus.CANCELLED}
                    or not covers(by_day[session.date], session.start_time, session.end_time)):
                warnings.append(PlanningWarning(code='PRESERVED_CONFLICT', date=session.date,
                    detail='A manual, ongoing, or out-of-horizon reservation needs explicit review; it was preserved.'))
    for task_id, minutes in reserved.items():
        if minutes > minute_hours(by_task[task_id].remaining_hours):
            warnings.append(PlanningWarning(code="PRESERVED_EXCESS_RESERVATION",
                detail="Fixed reservations exceed remaining work; review manual/ongoing blocks or widen the repair horizon."))
    # Unselected reservations stay fixed unless a selected higher-ranked deficit
    # later proves that one lower-ranked generated block must be displaced.
    def rank(task_id, budget=None):
        task = by_task[task_id]
        return task_order_key(task, max(0, minute_hours(task.remaining_hours) -
                              (reserved[task_id] if budget is None else budget)), timezone)
    kept, released = list(preserved), []
    for session in sorted(editable, key=lambda s: (rank(s.task_id), session_key(s))):
        task = by_task[session.task_id]
        start, end, duration = boundaries[session.id]
        valid = (task.status in {TaskStatus.TODO, TaskStatus.IN_PROGRESS}
                 and end <= task.deadline and duration == session.planned_minutes
                 and covers(by_day[session.date], session.start_time, session.end_time)
                 and reserved[task.id] + duration <= minute_hours(task.remaining_hours)
                 and not any(overlaps(session, other) for other in kept))
        if task.id not in roots or valid:
            kept.append(session)
            reserved[task.id] += duration
        else:
            released.append(session)
            reasons.add('INVALID_OR_EXCESS_GENERATED_RESERVATION')
    affected = {s.task_id for s in released}
    demand_ids = roots | affected

    def allocate(fixed, ids):
        return calculate_plan([by_task[key] for key in sorted(ids, key=str)], windows,
                              fixed, request, evaluated_at, timezone)
    plan = allocate(kept, demand_ids)
    affected.update(row.task_id for row in plan.tasks if row.generated_minutes)
    # Only accept a displacement when a strictly higher-ranked task's shortfall
    # improves. Try the worst-ranked, latest reservations first. Unrelated valid
    # blocks remain fixed if free capacity suffices or the trial cannot help.
    trials = 0
    while True:
        deficits = [row for row in plan.tasks if row.unscheduled_minutes
                    and 'EXISTING_RESERVATION_CONFLICT' not in row.reasons
                    and by_task[row.task_id].deadline > evaluated_at]
        if not deficits:
            break
        choices = [s for s in kept if s.id in editable_ids and any(
            rank(row.task_id, row.existing_reserved_minutes) < rank(s.task_id)
            and boundaries[s.id][0] < by_task[row.task_id].deadline for row in deficits)]
        choices.sort(key=lambda s: (rank(s.task_id), session_key(s)), reverse=True)
        improved = False
        for candidate in choices:
            trials += 1
            if trials > MAX_DISPLACEMENT_TRIALS:
                break
            trial_kept = [s for s in kept if s.id != candidate.id]
            trial_ids = demand_ids | {candidate.task_id}
            trial = allocate(trial_kept, trial_ids)
            before = {r.task_id: r.unscheduled_minutes or 0 for r in plan.tasks}
            after = {r.task_id: r.unscheduled_minutes or 0 for r in trial.tasks}
            # Do not degrade any already considered higher/equal ranked task.
            beneficiaries = [row for row in deficits if rank(row.task_id, row.existing_reserved_minutes) < rank(candidate.task_id)
                             and after.get(row.task_id, 0) < before[row.task_id]]
            if beneficiaries and all(after.get(key, 0) <= value for key, value in before.items()
                                     if rank(key) < rank(candidate.task_id)):
                kept, plan, demand_ids = trial_kept, trial, trial_ids
                released.append(candidate)
                affected.add(candidate.task_id)
                affected.update(row.task_id for row in beneficiaries)
                reasons.add('LOWER_RANKED_GENERATED_WORK_DISPLACED')
                improved = True
                break
        if not improved or trials > MAX_DISPLACEMENT_TRIALS:
            break
    if trials > MAX_DISPLACEMENT_TRIALS:
        warnings.append(PlanningWarning(code='DISPLACEMENT_LIMIT', detail='Displacement safety limit reached; remaining work is reported.'))
    affected.update(row.task_id for row in plan.tasks if row.unscheduled_minutes)
    warnings.extend(plan.warnings)
    # Keep exact reservations; pair only within the same task, preserving IDs for
    # moves/trims. New IDs are deterministic for this snapshot and proposed slot.
    remaining_old = sorted(released, key=session_key)
    new = sorted(plan.sessions, key=lambda s: (str(s.task_id), s.date, s.start_time, s.end_time))
    unmatched = []
    for proposal in new:
        match = next((s for s in remaining_old if s.task_id == proposal.task_id and
                      (s.date, s.start_time, s.end_time) == (proposal.date, proposal.start_time, proposal.end_time)), None)
        if match:
            kept.append(match)
            remaining_old.remove(match)
        else:
            unmatched.append(proposal)
    created, moved = [], []
    virtual = list(kept)
    for proposal in unmatched:
        old = next((s for s in remaining_old if s.task_id == proposal.task_id), None)
        identifier = old.id if old else uuid5(NAMESPACE_URL, fingerprint + ':' + str(proposal))
        item = StudySession(id=identifier, origin='SCHEDULER', task_id=proposal.task_id,
            date=proposal.date, start_time=proposal.start_time, end_time=proposal.end_time,
            planned_minutes=proposal.planned_minutes, completed_minutes=0,
            status=StudySessionStatus.PLANNED,
            created_at=old.created_at if old else evaluated_at, updated_at=evaluated_at)
        # Validate only changed blocks: immutable conflicts are surfaced, never erased.
        start, end, duration = interval(item.date, item.start_time, item.end_time, timezone)
        task = by_task[item.task_id]
        if (start < evaluated_at or end > task.deadline or duration != item.planned_minutes
                or duration <= 0 or not covers(by_day[item.date], item.start_time, item.end_time)
                or any(overlaps(item, other) for other in virtual)):
            raise DomainError('Replanning produced an invalid session; no changes were applied.', 409)
        virtual.append(item)
        if old:
            remaining_old.remove(old)
            moved.append(SessionMove(session_id=old.id, old_start=boundaries[old.id][0], old_end=boundaries[old.id][1],
                new_start=start, new_end=end, before=session_read(old, evaluated_at), after=session_read(item, evaluated_at)))
        else:
            created.append(session_read(item, evaluated_at))
        affected.add(item.task_id)
    affected.update(s.task_id for s in remaining_old)
    result = ReplanPreview(request=request, evaluated_at=evaluated_at, expires_at=evaluated_at + TTL,
        fingerprint=fingerprint, sessions_kept=[session_read(s, evaluated_at) for s in sorted(kept, key=session_key)],
        sessions_created=created, sessions_moved=moved,
        sessions_removed=[session_read(s, evaluated_at) for s in remaining_old],
        affected_tasks=sorted(affected, key=str), tasks=plan.tasks,
        unscheduled_minutes=sum(r.unscheduled_minutes or 0 for r in plan.tasks),
        tasks_fully_scheduled=sum(r.outcome == 'FULLY_SCHEDULED' for r in plan.tasks),
        tasks_partially_scheduled=sum(r.outcome == 'PARTIALLY_SCHEDULED' for r in plan.tasks),
        tasks_unscheduled=sum(r.outcome == 'UNSCHEDULED' for r in plan.tasks),
        reasons=sorted(reasons), warnings=warnings,
        risk_before=calculate_risks(tasks, subjects, windows, sessions, evaluated_at, timezone),
        risk_after=calculate_risks(tasks, subjects, windows, virtual, evaluated_at, timezone))
    result.plan_digest = digest(result.model_dump(mode='json', exclude={'plan_digest', 'applied'}))
    return result


def load_snapshot(db: Session) -> tuple[list[Task], list[Subject], list[Availability], list[StudySession]]:
    return (list(db.scalars(select(Task))), list(db.scalars(select(Subject))),
            list(db.scalars(select(Availability))), list(db.scalars(select(StudySession))))


def preview(db: Session, request: ReplanRequest, timezone: str) -> ReplanPreview:
    if db.get_bind().dialect.name == 'postgresql':
        db.execute(text('SELECT pg_advisory_xact_lock_shared(946321, 1)'))
    return calculate_replan(*load_snapshot(db), request, now(), timezone)


def apply(db: Session, request: ReplanApply, timezone: str) -> ReplanPreview:
    try:
        serialize_write(db)
        current = now()
        if not request.evaluated_at <= current < request.evaluated_at + TTL:
            raise DomainError('Replan preview expired. Request a new preview.', 409)
        plan_request = ReplanRequest(**request.model_dump(include={'date_from', 'date_to', 'task_ids'}))
        snapshot = load_snapshot(db)
        if snapshot_fingerprint(*snapshot, plan_request, timezone) != request.fingerprint:
            raise DomainError("Replan preview is stale. Request a new preview before applying changes.", 409)
        result = calculate_replan(*snapshot, plan_request, request.evaluated_at, timezone)
        if result.fingerprint != request.fingerprint or result.plan_digest != request.plan_digest:
            raise DomainError('Replan preview is stale. Request a new preview before applying changes.', 409)
        current = now()  # Recheck time after loading/calculation, immediately before writes.
        if current >= result.expires_at:
            raise DomainError("Replan preview expired. Request a new preview.", 409)
        by_id = {s.id: s for s in snapshot[3]}
        # Crossing a session start is a state change even without a database write.
        for old in [*result.sessions_removed, *(move.before for move in result.sessions_moved)]:
            if interval(old.date, old.start_time, old.end_time, timezone)[0] < current:
                raise DomainError('A session has started since preview. Request a new preview.', 409)
        for new in [*result.sessions_created, *(move.after for move in result.sessions_moved)]:
            if interval(new.date, new.start_time, new.end_time, timezone)[0] < current:
                raise DomainError('A proposed session would start in the past. Request a new preview.', 409)
        for old in result.sessions_removed:
            db.delete(by_id[old.id])
        for move in result.sessions_moved:
            item = by_id[move.session_id]
            for field in ('date', 'start_time', 'end_time', 'planned_minutes'):
                setattr(item, field, getattr(move.after, field))
        for new in result.sessions_created:
            db.add(StudySession(**new.model_dump(exclude={'created_at', 'updated_at'})))
        if result.sessions_removed or result.sessions_moved or result.sessions_created:
            db.flush()
            db.commit()
        result.applied = True
        return result
    except Exception:
        db.rollback()
        raise
