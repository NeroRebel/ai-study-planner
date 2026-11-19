"""Lifecycle reopening preserves work; normal tests use isolated SQLite only."""
import importlib.util
from pathlib import Path
from uuid import uuid4

from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import create_engine, text

from app.core.auth import Principal, get_current_user


def close(client, task):
    response = client.patch('/api/tasks/' + task['id'], json={'status': 'COMPLETED'})
    assert response.status_code == 200
    return response.json()


def reopen(client, task, **changes):
    return client.patch('/api/tasks/' + task['id'], json={'status': 'IN_PROGRESS', **changes})


def test_status_only_reopen_keeps_progress_effort_identity_and_active_visibility(client, task):
    closed = close(client, task)
    response = reopen(client, task)
    assert response.status_code == 200, response.text
    active = response.json()
    assert active['status'] == 'IN_PROGRESS'
    for field in ['id', 'created_at', 'progress', 'remaining_hours', 'estimated_hours', 'deadline']:
        assert active[field] == closed[field]
    assert active['progress'] == 100 and active['remaining_hours'] == 0
    assert client.get('/api/tasks', params={'status': 'IN_PROGRESS'}).json()[0]['id'] == task['id']
    assert client.get('/api/tasks', params={'status': 'COMPLETED'}).json() == []
    assert reopen(client, task).json()['status'] == 'IN_PROGRESS'
    assert len(client.get('/api/tasks').json()) == 1
    assert client.get('/api/study-sessions').json() == []


def test_unrelated_edits_do_not_implicitly_close_reopened_task(client, task):
    close(client, task)
    reopen(client, task)
    result = client.patch('/api/tasks/' + task['id'], json={'title': 'Reopened assignment'}).json()
    assert result['status'] == 'IN_PROGRESS' and result['progress'] == 100
    assert client.patch('/api/tasks/' + task['id'], json={'status': 'COMPLETED'}).json()['status'] == 'COMPLETED'


def test_reopening_preserves_all_historical_outcomes(client, task):
    client.post('/api/availability', json={'date': '2020-01-05', 'start_time': '09:00', 'end_time': '12:00'})
    for hour, status, minutes in [(9, 'COMPLETED', 60), (10, 'MISSED', 0), (11, 'PARTIALLY_COMPLETED', 30)]:
        response = client.post('/api/study-sessions', json={'task_id': task['id'], 'date': '2020-01-05',
            'start_time': f'{hour:02}:00', 'end_time': f'{hour+1:02}:00', 'status': status,
            'completed_minutes': minutes, 'confirm_no_progress': True})
        assert response.status_code == 201, response.text
    close(client, task)
    before = client.get('/api/study-sessions').json()
    assert reopen(client, task).status_code == 200
    assert client.get('/api/study-sessions').json() == before


def test_zero_effort_reopened_task_gets_no_risk_or_allocation(client, task, window):
    close(client, task)
    assert reopen(client, task).status_code == 200
    risk = client.get('/api/risks').json()['tasks'][0]
    assert risk['status'] == 'not_applicable' and risk['level'] is None
    scope = {'date_from': window['date'], 'date_to': window['date']}
    generated = client.post('/api/planner/generate', json=scope)
    assert generated.status_code == 200, generated.text
    assert generated.json()['created_count'] == 0
    assert 'NO_REMAINING_WORK' in generated.json()['tasks'][0]['reasons']


def test_revised_work_reactivates_risk_scheduler_and_replanning_without_duplicates(client, task, window):
    close(client, task)
    assert client.get('/api/risks').json()['tasks'][0]['status'] == 'not_applicable'
    result = reopen(client, task, remaining_hours=2)
    assert result.status_code == 200, result.text
    assert result.json()['progress'] == 60 and result.json()['remaining_hours'] == 2
    risk = client.get('/api/risks').json()['tasks'][0]
    assert risk['status'] == 'assessed' and risk['remaining_minutes'] == 120
    scope = {'date_from': window['date'], 'date_to': window['date']}
    preview = client.post('/api/planner/replan/preview', json=scope)
    assert preview.status_code == 200, preview.text
    assert task['id'] in preview.json()['affected_tasks']
    assert sum(s['planned_minutes'] for s in preview.json()['sessions_created']) == 120
    assert client.get('/api/study-sessions').json() == []
    generated = client.post('/api/planner/generate', json=scope).json()
    assert sum(s['planned_minutes'] for s in generated['sessions_created']) == 120
    assert client.post('/api/planner/generate', json=scope).json()['created_count'] == 0
    assert client.get('/api/tasks/' + task['id']).json()['progress'] == 60


def test_progress_can_be_explicitly_revised_after_status_only_reopening(client, task):
    close(client, task)
    reopen(client, task)
    changed = client.patch('/api/tasks/' + task['id'], json={'progress': 80}).json()
    assert changed['status'] == 'IN_PROGRESS' and changed['remaining_hours'] == 1
    # Existing progress-to-completion behavior remains.
    assert client.patch('/api/tasks/' + task['id'], json={'progress': 100}).json()['status'] == 'COMPLETED'


def test_other_user_cannot_reopen_task_or_read_its_history(client, application, task):
    before = close(client, task)
    original = application.dependency_overrides[get_current_user]
    other = uuid4()
    application.dependency_overrides[get_current_user] = lambda: Principal(other)
    assert reopen(client, task).status_code == 404
    assert client.get('/api/tasks/' + task['id']).status_code == 404
    assert client.get('/api/tasks').json() == []
    application.dependency_overrides[get_current_user] = original
    assert client.get('/api/tasks/' + task['id']).json() == before


def test_reopen_migration_relaxes_only_zero_effort_lifecycle_constraint():
    path = Path(__file__).parents[1] / 'alembic/versions/0006_reopen_tasks.py'
    spec = importlib.util.spec_from_file_location('reopen_migration', path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    engine = create_engine('sqlite://')
    with engine.begin() as connection:
        connection.execute(text("""CREATE TABLE tasks (id VARCHAR PRIMARY KEY, status VARCHAR NOT NULL,
            progress INTEGER NOT NULL, remaining_hours NUMERIC NOT NULL,
            CONSTRAINT ck_tasks_zero_remaining_status CHECK (remaining_hours != 0 OR status IN ('COMPLETED','CANCELLED')),
            CONSTRAINT ck_tasks_completed_consistency CHECK (status != 'COMPLETED' OR (progress = 100 AND remaining_hours = 0)))"""))
        connection.execute(text("INSERT INTO tasks VALUES ('same-task', 'COMPLETED', 100, 0)"))
        with Operations.context(MigrationContext.configure(connection)):
            migration.upgrade()
        connection.execute(text("UPDATE tasks SET status='IN_PROGRESS' WHERE id='same-task'"))
        assert connection.execute(text('SELECT progress, remaining_hours FROM tasks')).one() == (100, 0)
        # Downgrade never rewrites work; explicitly close first.
        connection.execute(text("UPDATE tasks SET status='COMPLETED'"))
        with Operations.context(MigrationContext.configure(connection)):
            migration.downgrade()
    engine.dispose()
