from copy import deepcopy
from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal
from uuid import UUID

import pytest
from sqlalchemy import event, inspect, select

from app.core.exceptions import DomainError
from app.models import Availability, StudySession, Subject, Task
from app.models.enums import Difficulty, Priority, StudySessionStatus, TaskStatus
from app.services import risk_engine
from app.services.risk_engine import calculate_risks
from app.services.time_rules import interval, local_instant

TZ = "Europe/Budapest"
DAY = date(2030, 1, 7)
NOW = local_instant(DAY, time(8), TZ)
SUBJECT = UUID(int=100)


def task(id=1, hours="2", **changes):
    values = dict(id=UUID(int=id), subject_id=SUBJECT, title="Study task",
        estimated_hours=Decimal(hours), remaining_hours=Decimal(hours), progress=0,
        deadline=local_instant(DAY + timedelta(days=8), time(20), TZ),
        status=TaskStatus.TODO, priority=Priority.MEDIUM, difficulty=Difficulty.MEDIUM)
    values.update(changes)
    return Task(**values)


def window(start=time(9), end=time(15), day=DAY):
    return Availability(id=UUID(int=900), date=day, start_time=start, end_time=end)


def session(work, start=time(9), end=time(10), day=DAY, id=800, **changes):
    values = dict(id=UUID(int=id), task_id=work.id, date=day, start_time=start, end_time=end,
        planned_minutes=interval(day, start, end, TZ)[2], completed_minutes=0,
        status=StudySessionStatus.PLANNED)
    values.update(changes)
    return StudySession(**values)


def assess(tasks, windows=(), sessions=(), subjects=None, now=NOW):
    if subjects is None:
        subjects = [Subject(id=SUBJECT, name="Databases", description="", color="gold")]
    return calculate_risks(tasks, subjects, windows, sessions, now, TZ)


def row(tasks, windows=(), sessions=(), **kwargs):
    return assess(tasks, windows, sessions, **kwargs).tasks[0]


def test_low_with_healthy_capacity():
    risk = row([task()], [window()])
    assert risk.level == "LOW"
    assert risk.remaining_minutes == 120 and risk.capacity_minutes == 360
    assert risk.allocated_free_minutes == 120 and risk.shared_slack_minutes == 240
    assert risk.reasons == ["sufficient_capacity", "healthy_margin"]
    assert "6.0h" in risk.explanation and "2.0h" in risk.explanation


@pytest.mark.parametrize("minutes", [270, 300])
def test_medium_with_narrow_margin(minutes):
    risk = row([task(hours="4")], [window(end=time(9 + minutes // 60, minutes % 60))])
    assert risk.level == "MEDIUM" and "narrow_margin" in risk.reasons
    assert risk.capacity_minutes == minutes and risk.shortfall_minutes == 0


def test_high_insufficient_capacity():
    risk = row([task(hours="4")], [window(end=time(11))])
    assert risk.level == "HIGH"
    assert risk.shortfall_minutes == 120 and risk.capacity_minutes == 120
    assert risk.reasons == ["insufficient_capacity"]
    assert "only 2.0h" in risk.explanation


def test_overdue_incomplete_is_high_with_explicit_explanation():
    risk = row([task(deadline=NOW - timedelta(seconds=1))], [window()])
    assert risk.level == "HIGH" and risk.reasons == ["deadline_passed"]
    assert risk.capacity_minutes == 0 and risk.minutes_until_deadline < 0
    assert "deadline passed" in risk.explanation


@pytest.mark.parametrize("status", [TaskStatus.COMPLETED, TaskStatus.CANCELLED])
def test_closed_tasks_have_no_active_risk(status):
    risk = row([task(status=status)], [window()])
    assert risk.level is None and risk.status == "not_applicable"


def test_zero_work_is_not_high_even_when_overdue():
    risk = row([task(remaining_hours=Decimal(0), progress=100, deadline=NOW - timedelta(days=1))])
    assert risk.level is None and risk.reasons == ["no_remaining_work"]


def test_canonical_remaining_effort_already_reflects_progress():
    risk = row([task(hours="10", remaining_hours=Decimal(2), progress=80)], [window()])
    assert risk.remaining_minutes == 120 and risk.level == "LOW"
    precise = row([task(hours="3", remaining_hours=Decimal("0.016667"), progress=99)], [window()])
    assert precise.remaining_minutes == 1


def test_scheduled_minutes_are_counted_once_and_removed_from_free_capacity():
    work = task(hours="4")
    risk = row([work], [window(end=time(13))], [session(work)])
    assert risk.scheduled_minutes == 60 and risk.free_available_minutes == 180
    assert risk.capacity_minutes == 240


def test_overlapping_windows_are_unioned_not_double_counted():
    risk = row([task(hours="4")], [window(end=time(13)), window(time(10), time(12))])
    assert risk.capacity_minutes == 240


def test_other_tasks_manual_or_generated_sessions_occupy_capacity():
    work, other = task(hours="4"), task(id=2)
    booked = session(other, end=time(11))
    risk = row([work], [window(end=time(13))], [booked])
    assert risk.scheduled_minutes == 0 and risk.capacity_minutes == 120


@pytest.mark.parametrize("status,completed", [
    (StudySessionStatus.COMPLETED, 60), (StudySessionStatus.MISSED, 0),
    (StudySessionStatus.PARTIALLY_COMPLETED, 30),
])
def test_outcomes_never_count_as_useful_future_planned_work(status, completed):
    work = task(hours="4")
    risk = row([work], [window(end=time(13))],
               [session(work, status=status, completed_minutes=completed)])
    assert risk.scheduled_minutes == 0 and risk.capacity_minutes == 180


def test_completed_history_is_not_deducted_from_remaining_effort_again():
    work = task(hours="4", remaining_hours=Decimal(2), progress=50)
    past = session(work, day=DAY - timedelta(days=1), status=StudySessionStatus.COMPLETED, completed_minutes=60)
    risk = row([work], [window()], [past])
    assert risk.remaining_minutes == 120 and risk.scheduled_minutes == 0 and risk.capacity_minutes == 360


def test_no_availability_is_high():
    risk = row([task()])
    assert risk.level == "HIGH" and risk.capacity_minutes == 0


def test_close_deadline_is_medium_despite_large_capacity():
    risk = row([task(deadline=local_instant(DAY + timedelta(days=1), time(20), TZ))], [window()])
    assert risk.level == "MEDIUM" and "deadline_soon" in risk.reasons
    assert "within 48 hours" in risk.explanation


def test_urgency_boundary_at_48_hours_is_inclusive():
    close = row([task(deadline=NOW + timedelta(hours=48))], [window()])
    far = row([task(deadline=NOW + timedelta(hours=48, seconds=1))], [window()])
    assert close.level == "MEDIUM" and far.level == "LOW"


def test_low_schedule_coverage_uses_both_deadline_and_capacity_signals():
    deadline = NOW + timedelta(days=6)
    work = task(hours="4", deadline=deadline)
    unscheduled = row([work], [window()])
    assert unscheduled.level == "MEDIUM" and "low_schedule_coverage" in unscheduled.reasons
    planned = row([work], [window()], [session(work, end=time(11))])
    assert planned.level == "LOW"
    assert planned.scheduled_minutes == 120


def test_exact_healthy_margin_boundary():
    risk = row([task(hours="4")], [window(end=time(14, 30))])
    assert risk.capacity_minutes == 330 and risk.level == "LOW"


def test_percentage_margin_can_exceed_the_90_minute_floor():
    windows = [window(end=time(17)), window(end=time(15, 40), day=DAY + timedelta(days=1))]
    risk = row([task(hours="12")], windows)
    assert risk.capacity_minutes == 880 and risk.level == "MEDIUM"
    assert "narrow_margin" in risk.reasons


def test_multiple_windows_and_availability_after_deadline():
    work = task(hours="4", deadline=local_instant(DAY, time(15), TZ))
    risk = row([work], [window(end=time(10)), window(time(13), time(15)),
                        window(day=DAY + timedelta(days=1)), window(time(16), time(17))])
    assert risk.capacity_minutes == 180 and risk.level == "HIGH"


def test_session_wholly_after_deadline_is_not_counted():
    work = task(hours="1", deadline=local_instant(DAY, time(10), TZ))
    risk = row([work], [window()], [session(work, start=time(11), end=time(12))])
    assert risk.scheduled_minutes == 0 and risk.capacity_minutes == 60


def test_session_crossing_deadline_is_invalid_and_not_promised_as_scheduled_work():
    work = task(hours="1", deadline=local_instant(DAY, time(9, 30), TZ))
    result = assess([work], [window()], [session(work)])
    assert result.tasks[0].scheduled_minutes == 0
    assert result.tasks[0].capacity_minutes == 0
    assert result.warnings[0].code == "INVALID_PLANNED_SESSION"


def test_past_availability_and_elapsed_part_of_ongoing_session_are_excluded():
    work = task()
    past = window(day=DAY - timedelta(days=1))
    now = local_instant(DAY, time(9, 30), TZ) + timedelta(seconds=30)
    risk = row([work], [past, window(end=time(10))], [session(work)], now=now)
    assert risk.scheduled_minutes == 29 and risk.free_available_minutes == 0


def test_conflicting_reservations_never_promise_a_minute_to_two_tasks():
    a, b = task(hours="1"), task(id=2, hours="1")
    result = assess([a, b], [window(end=time(10))], [session(a), session(b, id=801)])
    assert sum(item.scheduled_minutes for item in result.tasks) == 0
    assert all(item.level == "HIGH" for item in result.tasks)


def test_competing_tasks_claim_each_required_free_minute_once():
    low, high = task(hours="4", priority=Priority.LOW), task(id=2, hours="4", priority=Priority.HIGH)
    result = assess([low, high], [window()])
    by_id = {risk.task_id: risk for risk in result.tasks}
    assert by_id[high.id].allocated_free_minutes == 240 and by_id[high.id].level == "MEDIUM"
    assert by_id[low.id].allocated_free_minutes == 120 and by_id[low.id].level == "HIGH"
    assert sum(risk.allocated_free_minutes for risk in result.tasks) == 360


def test_shared_contingency_is_explicit_and_not_a_second_claim():
    result = assess([task(), task(id=2)], [window()])
    assert sum(risk.allocated_free_minutes for risk in result.tasks) == 240
    assert all(risk.shared_slack_minutes == 120 and risk.capacity_minutes == 240 for risk in result.tasks)


def test_subject_aggregation_high_medium_low_and_none():
    subjects = [Subject(id=UUID(int=n), name=str(n)) for n in range(100, 104)]
    tasks = [task(id=1, subject_id=subjects[0].id, deadline=NOW - timedelta(days=1)),
             task(id=2, hours="4", subject_id=subjects[1].id, deadline=local_instant(DAY, time(13), TZ)),
             task(id=3, subject_id=subjects[2].id)]
    result = assess(tasks, [window(end=time(13)), window(day=DAY + timedelta(days=1))], subjects=subjects)
    assert [item.level for item in result.subjects] == ["HIGH", "MEDIUM", "LOW", None]
    assert result.subjects[-1].status == "not_applicable"
    assert result.subjects[0].active_task_count == 1


def test_missing_data_is_unavailable_instead_of_invented_low_or_high():
    result = assess([task(remaining_hours=None)])
    assert result.tasks[0].level is None and result.tasks[0].status == "unavailable"
    assert result.subjects[0].level is None and result.subjects[0].status == "unavailable"


@pytest.mark.parametrize("day", [date(2030, 3, 31), date(2030, 10, 27)])
def test_dst_uses_the_same_safe_minutes_as_scheduler(day):
    work = task(hours="4", deadline=local_instant(day + timedelta(days=2), time(20), TZ))
    result = assess([work], [window(time(1), time(4), day)], now=local_instant(day, time(0), TZ))
    assert result.tasks[0].capacity_minutes == 119
    assert result.warnings[0].code == "DST_TIME_SKIPPED"


def test_timezone_cutoff_and_subminute_deadline():
    work = task(hours="1", deadline=datetime(2030, 1, 7, 8, 30, 30, tzinfo=UTC))
    risk = row([work], [window(end=time(11))])
    assert risk.capacity_minutes == 30


def test_determinism_reversed_inputs_and_read_only_model_snapshots():
    tasks = [task(id=2), task(id=1)]
    windows = [window(end=time(10)), window(time(11), time(15))]
    sessions = [session(tasks[0], start=time(11), end=time(12))]
    objects = [*tasks, *windows, *sessions]
    def snapshot():
        return [{column.key: deepcopy(getattr(obj, column.key)) for column in inspect(type(obj)).columns} for obj in objects]
    before = snapshot()
    first = assess(tasks, windows, sessions)
    second = assess(list(reversed(tasks)), list(reversed(windows)), list(reversed(sessions)))
    assert first.model_dump() == second.model_dump()
    assert snapshot() == before
    assert first.expires_at > first.evaluated_at
    assert (first.expires_at - first.evaluated_at).total_seconds() <= 60


def test_empty_workspace_and_naive_evaluation():
    result = assess([], [])
    assert not result.tasks and result.subjects[0].level is None
    with pytest.raises(ValueError):
        assess([task()], [window()], now=datetime(2030, 1, 7, 8))


def test_api_batch_is_read_only_and_has_constant_query_count(client, task, window, db_factory, monkeypatch):
    monkeypatch.setattr(risk_engine, "now", lambda: datetime(2099, 1, 5, 6, tzinfo=UTC))
    before = {name: client.get("/api/" + name).json()
              for name in ("subjects", "tasks", "availability", "study-sessions")}
    statements = []
    engine = db_factory.kw["bind"]
    def capture(_connection, _cursor, statement, _parameters, _context, _many):
        statements.append(statement)
    event.listen(engine, "before_cursor_execute", capture)
    try:
        response = client.get("/api/risks")
    finally:
        event.remove(engine, "before_cursor_execute", capture)
    assert response.status_code == 200, response.text
    assert response.headers["cache-control"] == "no-store"
    result = response.json()
    assert result["tasks"][0]["task_id"] == task["id"] and result["tasks"][0]["level"] == "HIGH"
    assert result["subjects"][0]["level"] == "HIGH"
    assert len(statements) == 4 and all(sql.lstrip().upper().startswith("SELECT") for sql in statements)
    assert {name: client.get("/api/" + name).json() for name in before} == before
    with db_factory() as db:
        assert risk_engine.assess_task(db, UUID(task["id"]), TZ).task_id == UUID(task["id"])
        with pytest.raises(DomainError):
            risk_engine.assess_task(db, UUID(int=123), TZ)