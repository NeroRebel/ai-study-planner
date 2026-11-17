from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal
from uuid import UUID

import pytest
from sqlalchemy import func, select

from app.models import Availability, StudySession, Task
from app.models.enums import Difficulty, Priority, StudySessionStatus, TaskStatus
from app.schemas.scheduler import GeneratePlanRequest
from app.services import scheduler
from app.services.scheduler import calculate_plan
from app.services.time_rules import interval, local_instant

TZ = "Europe/Budapest"
DAY = date(2030, 1, 7)
NOW = datetime(2030, 1, 7, 6, tzinfo=UTC)


def work(id=1, hours="2", priority=Priority.MEDIUM, day=DAY, due=time(20), **changes):
    values = dict(id=UUID(int=id), title="Study task", estimated_hours=Decimal(hours),
                  remaining_hours=Decimal(hours), progress=0, priority=priority,
                  difficulty=Difficulty.MEDIUM, status=TaskStatus.TODO,
                  deadline=local_instant(day, due, TZ))
    values.update(changes)
    return Task(**values)


def available(start=time(9), end=time(12), day=DAY):
    return Availability(id=UUID(int=900), date=day, start_time=start, end_time=end)


def entered(task, start=time(10), end=time(11), day=DAY, status=StudySessionStatus.PLANNED):
    return StudySession(id=UUID(int=800), task_id=task.id, date=day, start_time=start,
                        end_time=end, planned_minutes=interval(day, start, end, TZ)[2],
                        completed_minutes=0, status=status)


def plan(tasks, windows, existing=(), day=DAY, end=None, now=NOW):
    return calculate_plan(tasks, windows, existing,
        GeneratePlanRequest(date_from=day, date_to=end or day), now, TZ)


def assert_integrity(result, tasks, windows, now=NOW):
    booked = []
    by_id = {task.id: task for task in tasks}
    for session in result.sessions:
        start, end, minutes = interval(session.date, session.start_time, session.end_time, TZ)
        assert start >= now
        assert end <= by_id[session.task_id].deadline
        assert minutes == session.planned_minutes and 0 < minutes <= 60
        for other_start, other_end in booked:
            assert end <= other_start or start >= other_end
        booked.append((start, end))
        assert any(window.date == session.date and window.start_time <= session.start_time
                   and window.end_time >= session.end_time for window in windows)


def test_one_task_and_large_task_splitting():
    task, window = work(hours="3"), available()
    result = plan([task], [window])
    assert [session.planned_minutes for session in result.sessions] == [60, 60, 60]
    assert result.tasks[0].outcome == "FULLY_SCHEDULED"
    assert_integrity(result, [task], [window])


def test_deadline_clips_session_and_partial_is_a_normal_result():
    task = work(hours="2", due=time(9, 45))
    task.deadline += timedelta(seconds=30)
    result = plan([task], [available()])
    assert [session.planned_minutes for session in result.sessions] == [45]
    assert result.sessions[0].end_time == time(9, 45)
    assert result.tasks[0].outcome == "PARTIALLY_SCHEDULED"
    assert result.tasks[0].unscheduled_minutes == 75


def test_existing_session_blocks_time_and_counts_reserved_effort():
    task, window = work(hours="3"), available(end=time(13))
    manual = entered(task)
    result = plan([task], [window], [manual])
    assert [(s.start_time, s.end_time) for s in result.sessions] == [(time(9), time(10)), (time(11), time(12))]
    assert result.tasks[0].existing_reserved_minutes == 60
    assert manual.start_time == time(10) and manual.status == "PLANNED"
    assert_integrity(result, [task], [window])


def test_multiple_windows_and_multiple_days_have_no_overlap():
    task = work(hours="4", day=DAY + timedelta(days=1))
    windows = [available(time(9), time(10)), available(time(13), time(14)),
               available(time(9), time(11), DAY + timedelta(days=1))]
    result = plan([task], windows, end=DAY + timedelta(days=1))
    assert len(result.sessions) == 4
    assert_integrity(result, [task], windows)


def test_adjacent_and_duplicate_windows_do_not_double_capacity():
    task = work(hours="1")
    result = plan([task], [available(time(9), time(9, 30)), available(time(9, 30), time(10)),
                            available(time(9), time(10))])
    assert len(result.sessions) == 1
    assert result.sessions[0].planned_minutes == 60


@pytest.mark.parametrize("status", [TaskStatus.COMPLETED, TaskStatus.CANCELLED])
def test_closed_tasks_are_skipped(status):
    result = plan([work(status=status)], [available()])
    assert result.sessions == []
    assert result.tasks[0].outcome == "SKIPPED"


def test_zero_remaining_is_skipped():
    result = plan([work(remaining_hours=Decimal(0), progress=100)], [available()])
    assert not result.sessions
    assert result.tasks[0].reasons == ["NO_REMAINING_WORK"]


def test_canonical_remaining_effort_accounts_for_progress_without_double_deduction():
    task = work(hours="5", remaining_hours=Decimal("1.5"), progress=70)
    result = plan([task], [available()])
    assert sum(s.planned_minutes for s in result.sessions) == 90
    assert task.progress == 70 and task.remaining_hours == Decimal("1.5")


def test_rounded_progress_is_not_used_to_recalculate_canonical_minutes():
    task = work(hours="3", remaining_hours=Decimal("0.016667"), progress=99)
    result = plan([task], [available()])
    assert [session.planned_minutes for session in result.sessions] == [1]


def test_earlier_due_day_wins_over_later_high_priority():
    early = work(id=2, hours="1", priority=Priority.LOW)
    later = work(id=1, hours="1", priority=Priority.HIGH, day=DAY + timedelta(days=1))
    result = plan([later, early], [available(end=time(10))])
    assert result.sessions[0].task_id == early.id
    assert next(task for task in result.tasks if task.task_id == later.id).outcome == "UNSCHEDULED"


def test_high_priority_wins_for_comparable_same_day_deadlines():
    low = work(id=1, hours="1", priority=Priority.LOW, due=time(18))
    high = work(id=2, hours="1", priority=Priority.HIGH, due=time(20))
    result = plan([low, high], [available(end=time(10))])
    assert result.sessions[0].task_id == high.id


def test_exact_deadline_and_shorter_effort_break_priority_ties():
    later = work(id=1, hours="1", due=time(20))
    early = work(id=2, hours="1", due=time(18))
    assert plan([later, early], [available(end=time(10))]).sessions[0].task_id == early.id
    large = work(id=1, hours="2")
    small = work(id=2, hours="1")
    assert plan([large, small], [available(end=time(10))]).sessions[0].task_id == small.id


def test_deterministic_tie_breaking_independent_of_input_order():
    tasks = [work(id=2, hours="1"), work(id=1, hours="1")]
    windows = [available(time(11), time(12)), available(time(9), time(10))]
    first = plan(tasks, windows)
    second = plan(list(reversed(tasks)), list(reversed(windows)))
    assert first == second
    assert first.sessions[0].task_id == UUID(int=1)


def test_difficulty_is_a_final_tie_breaker_not_an_effort_multiplier():
    easy = work(id=1, hours="1", difficulty=Difficulty.EASY)
    hard = work(id=2, hours="1", difficulty=Difficulty.HARD)
    result = plan([easy, hard], [available()])
    assert result.sessions[0].task_id == hard.id
    assert [session.planned_minutes for session in result.sessions] == [60, 60]


def test_no_tasks_and_no_availability():
    assert plan([], [available()]).sessions == []
    result = plan([work()], [])
    assert result.sessions == [] and result.tasks[0].unscheduled_minutes == 120
    assert result.tasks[0].reasons == ["NO_ENTERED_AVAILABILITY"]


def test_overdue_tasks_report_unscheduled_effort_without_recovery_blocks():
    result = plan([work(deadline=NOW - timedelta(minutes=1))], [available()])
    assert not result.sessions and result.tasks[0].unscheduled_minutes == 120
    assert result.tasks[0].reasons == ["DEADLINE_PASSED"]


@pytest.mark.parametrize("minutes,expected", [(75, [45, 30]), (20, [20]), (90, [60, 30])])
def test_session_sizes_and_avoidable_tiny_tails(minutes, expected):
    task = work(hours=str(Decimal(minutes) / 60))
    result = plan([task], [available()])
    assert [session.planned_minutes for session in result.sessions] == expected


def test_subminimum_gaps_are_only_used_as_last_resort():
    task = work(hours="1")
    windows = [available(time(9), time(9, 10)), available(time(10), time(11))]
    assert [session.start_time for session in plan([task], windows).sessions] == [time(10)]
    fragmented = [available(time(9), time(9, 20)), available(time(10), time(10, 20)),
                  available(time(11), time(11, 20))]
    result = plan([task], fragmented)
    assert [session.planned_minutes for session in result.sessions] == [20, 20, 20]
    assert result.tasks[0].outcome == "FULLY_SCHEDULED"


def test_evaluation_seconds_round_forward_and_range_does_not_expand():
    now = local_instant(DAY, time(9), TZ) + timedelta(seconds=30)
    result = plan([work(hours="1")], [available(time(9), time(10)),
                                    available(day=DAY + timedelta(days=1))], now=now)
    assert result.sessions[0].start_time == time(9, 1)
    assert result.tasks[0].unscheduled_minutes == 1
    assert all(session.date == DAY for session in result.sessions)


@pytest.mark.parametrize("day", [date(2030, 3, 31), date(2030, 10, 27)])
def test_dst_transition_minutes_are_safe_and_explicitly_reported(day):
    task = work(hours="4", day=day, due=time(5))
    window = available(time(1), time(4), day)
    now = local_instant(day, time(0), TZ)
    result = plan([task], [window], day=day, now=now)
    assert sum(session.planned_minutes for session in result.sessions) == 119
    assert result.warnings[0].code == "DST_TIME_SKIPPED"
    assert all(session.start_time.hour != 2 and session.end_time.hour != 2 for session in result.sessions)
    assert_integrity(result, [task], [window], now)


def test_missing_or_invalid_task_data_is_reported_without_crashing():
    for changes in ({"remaining_hours": None}, {"deadline": None}, {"priority": "UNKNOWN"},
                    {"remaining_hours": Decimal("-1")}):
        result = plan([work(**changes)], [available()])
        assert result.sessions == []
        assert result.tasks[0].reasons == ["INVALID_TASK_DATA"]
        assert result.tasks[0].unscheduled_minutes is None


def test_out_of_range_future_reservations_and_ongoing_full_duration_count():
    task = work(hours="1", day=DAY + timedelta(days=7))
    next_week = entered(task, day=DAY + timedelta(days=7))
    assert plan([task], [available()], [next_week]).sessions == []
    ongoing = entered(task, time(9), time(10))
    result = plan([task], [available()], [ongoing], now=local_instant(DAY, time(9, 30), TZ))
    assert result.sessions == [] and result.tasks[0].existing_reserved_minutes == 60


def test_conflicting_existing_reservations_are_not_silently_replaced():
    task = work(hours="0.5")
    result = plan([task], [available()], [entered(task)])
    assert not result.sessions
    assert result.tasks[0].reasons == ["EXISTING_RESERVATION_CONFLICT"]


def test_all_existing_statuses_block_time_and_history_remains_unchanged():
    task = work(hours="2")
    existing = [entered(task, time(9), time(10), status=StudySessionStatus.COMPLETED),
                entered(task, time(10), time(11), status=StudySessionStatus.MISSED),
                entered(task, time(11), time(12), status=StudySessionStatus.PARTIALLY_COMPLETED)]
    result = plan([task], [available(end=time(14))], existing)
    assert [session.start_time for session in result.sessions] == [time(12), time(13)]
    assert [session.status for session in existing] == ["COMPLETED", "MISSED", "PARTIALLY_COMPLETED"]


def test_session_limit_returns_partial_result(monkeypatch):
    monkeypatch.setattr(scheduler, "MAX_CREATED_SESSIONS", 1)
    result = plan([work()], [available()])
    assert len(result.sessions) == 1 and result.tasks[0].unscheduled_minutes == 60
    assert result.warnings[0].code == "GENERATION_LIMIT"


def test_api_generation_persistence_idempotency_and_unchanged_task(client, task, window):
    before = client.get("/api/tasks/" + task["id"]).json()
    payload = {"date_from": window["date"], "date_to": window["date"], "task_ids": [task["id"]]}
    first = client.post("/api/planner/generate", json=payload)
    assert first.status_code == 200, first.text
    result = first.json()
    assert result["created_count"] == 4 and result["tasks_partially_scheduled"] == 1
    assert result["unscheduled_minutes"] == 60
    persisted = client.get("/api/study-sessions").json()
    assert len(persisted) == 4
    assert client.get("/api/tasks/" + task["id"]).json() == before
    second = client.post("/api/planner/generate", json=payload).json()
    assert second["created_count"] == 0 and second["unscheduled_minutes"] == 60
    assert client.get("/api/study-sessions").json() == persisted


def test_api_preserves_manual_and_completed_records(client, task, window, study_session):
    client.post("/api/availability", json={"date": "2000-01-03", "start_time": "09:00", "end_time": "10:00"})
    history = client.post("/api/study-sessions", json={"task_id": task["id"], "date": "2000-01-03",
        "start_time": "09:00", "end_time": "10:00", "status": "COMPLETED", "completed_minutes": 60,
        "confirm_no_progress": True}).json()
    result = client.post("/api/planner/generate", json={"date_from": window["date"], "date_to": window["date"]})
    assert result.status_code == 200 and result.json()["created_count"] == 3
    assert client.get("/api/study-sessions/" + study_session["id"]).json() == study_session
    assert client.get("/api/study-sessions/" + history["id"]).json() == history


def test_api_empty_data_missing_task_and_request_validation(client):
    payload = {"date_from": "2099-01-05", "date_to": "2099-01-05"}
    result = client.post("/api/planner/generate", json=payload)
    assert result.status_code == 200 and result.json()["created_count"] == 0
    assert client.post("/api/planner/generate", json={**payload, "task_ids": [str(UUID(int=50))]}).status_code == 404
    for change in ({"date_to": "2099-01-04"}, {"date_to": "2099-03-01"}, {"task_ids": []},
                   {"evaluated_at": "2099-01-05T00:00:00Z"}):
        assert client.post("/api/planner/generate", json={**payload, **change}).status_code == 422


def test_failed_batch_rolls_back_every_created_session(db_factory, client, task, window, monkeypatch):
    with db_factory() as db:
        def fail_commit():
            raise RuntimeError("Simulated batch commit failure")
        monkeypatch.setattr(db, "commit", fail_commit)
        with pytest.raises(RuntimeError):
            scheduler.generate(db, GeneratePlanRequest(date_from=window["date"], date_to=window["date"]), TZ)
    with db_factory() as db:
        assert db.scalar(select(func.count()).select_from(StudySession)) == 0
        assert db.get(Task, UUID(task["id"])).remaining_hours == Decimal(5)
