"""Portable-workspace contracts against isolated SQLite, never live user data."""
from copy import deepcopy
from datetime import UTC, datetime, timedelta
import json
from pathlib import Path
from uuid import UUID, uuid4

import pytest
from sqlalchemy import select

from app.core.auth import Principal, get_current_user
from app.core.exceptions import DomainError
from app.models import Availability, Profile, StudySession, Subject, Task
from app.services import workspace


def fixture_document():
    return {'format': 'ai-study-planner-workspace', 'version': 1, 'exported_at': '2026-11-19T12:00:00Z', 'workspace': {
        'subjects': [{'id': 'db', 'name': 'Databases', 'description': '', 'color': 'gold'}],
        'tasks': [{'id': 'assignment', 'subject_id': 'db', 'title': 'Database assignment', 'description': '',
                   'deadline': '2099-01-09T18:00:00Z', 'estimated_hours': 2, 'remaining_hours': 2,
                   'progress': 0, 'status': 'TODO', 'priority': 'HIGH', 'difficulty': 'MEDIUM'}],
        'availability': [{'id': 'monday', 'date': '2099-01-05', 'start_time': '09:00', 'end_time': '12:00'}],
        'study_sessions': [{'id': 'block', 'task_id': 'assignment', 'date': '2099-01-05', 'start_time': '09:00',
                            'end_time': '10:00', 'planned_minutes': 60, 'completed_minutes': 0,
                            'status': 'PLANNED', 'origin': 'SCHEDULER'}]}}


def preview(client, document=None, mode='MERGE', content=None):
    return client.post('/api/workspace/import/preview', json={'mode': mode, 'content': content if content is not None else json.dumps(document or fixture_document())})


def apply(client, result, document=None, **changes):
    data = {'mode': result['mode'], 'content': json.dumps(document or fixture_document()),
            'evaluated_at': result['evaluated_at'], 'fingerprint': result['fingerprint']}
    data.update(changes)
    return client.post('/api/workspace/import/apply', json=data)


def collections(client):
    return {path: client.get('/api/' + path).json() for path in ['subjects', 'tasks', 'availability', 'study-sessions']}


def test_export_is_portable_and_whitelists_owned_planner_fields(client, application, task, window, study_session):
    response = client.get('/api/workspace/export')
    assert response.status_code == 200
    data = response.json()
    assert data['format'] == 'ai-study-planner-workspace' and data['version'] == 1
    rows = data['workspace']
    assert len(rows['tasks']) == len(rows['subjects']) == len(rows['study_sessions']) == 1
    assert rows['tasks'][0]['subject_id'] == rows['subjects'][0]['id']
    assert rows['study_sessions'][0]['task_id'] == rows['tasks'][0]['id']
    for forbidden in ['user_id', 'access_token', 'refresh_token', 'email', 'avatar', 'gemini_api_key', 'created_at', task['id']]:
        assert forbidden not in response.text
    assert response.headers['cache-control'] == 'no-store'
    application.dependency_overrides[get_current_user] = lambda: Principal(uuid4())
    other = client.get('/api/workspace/export').json()['workspace']
    assert all(not values for values in other.values())


def test_preview_validates_counts_without_any_writes(client, db_factory):
    with db_factory() as db:
        before = {model: len(list(db.scalars(select(model)))) for model in [Profile, Subject, Task, Availability, StudySession]}
    response = preview(client)
    assert response.status_code == 200, response.text
    result = response.json()
    assert result['can_apply'] and result['additions'] == dict(subjects=1, tasks=1, availability=1, study_sessions=1)
    with db_factory() as db:
        assert {model: len(list(db.scalars(select(model)))) for model in before} == before


def test_merge_persists_fresh_ids_relationships_and_is_repeatable(client):
    before = preview(client).json()
    response = apply(client, before)
    assert response.status_code == 200, response.text
    data = collections(client)
    assert data['tasks'][0]['subject_id'] == data['subjects'][0]['id']
    assert data['study-sessions'][0]['task_id'] == data['tasks'][0]['id']
    assert data['tasks'][0]['id'] != 'assignment'
    assert data['study-sessions'][0]['origin'] == 'SCHEDULER'
    assert apply(client, before).status_code == 409  # Consumed snapshot cannot create a second copy.
    repeated = preview(client).json()
    assert repeated['duplicates'] == dict(subjects=1, tasks=1, availability=1, study_sessions=1)
    assert not any(repeated['additions'].values())
    assert apply(client, repeated).status_code == 200
    assert collections(client) == data


def test_export_then_import_into_a_different_user_preserves_portable_relationships(client, application):
    assert apply(client, preview(client).json()).status_code == 200
    exported = client.get('/api/workspace/export').json()
    original = collections(client)
    application.dependency_overrides[get_current_user] = lambda: Principal(UUID(int=77))
    assert apply(client, preview(client, exported).json(), exported).status_code == 200
    copied = collections(client)
    assert copied['subjects'][0]['id'] != original['subjects'][0]['id']
    assert copied['tasks'][0]['subject_id'] == copied['subjects'][0]['id']
    assert copied['study-sessions'][0]['task_id'] == copied['tasks'][0]['id']
    assert copied['tasks'][0]['progress'] == original['tasks'][0]['progress']


def test_replace_requires_typed_confirmation_and_preserves_profile(client, task, study_session):
    profile = client.get('/api/profile').json()
    before = collections(client)
    result = preview(client, mode='REPLACE').json()
    assert apply(client, result).status_code == 422
    assert collections(client) == before
    response = apply(client, result, confirmation='REPLACE')
    assert response.status_code == 200, response.text
    assert client.get('/api/tasks/' + task['id']).status_code == 404
    assert client.get('/api/profile').json() == profile
    assert len(client.get('/api/tasks').json()) == 1


@pytest.mark.parametrize('content', ['{not json', '{"format":1,"format":2}', '{"a":NaN}', '[]', '{}'])
def test_malformed_or_invalid_envelope_is_rejected(client, content):
    assert preview(client, content=content).status_code in {400, 422}
    assert all(not rows for rows in collections(client).values())


@pytest.mark.parametrize('field,value', [('version', 2), ('version', True), ('format', 'other'), ('user_id', 'spoof')])
def test_unsupported_format_version_or_identity_fields(client, field, value):
    document = fixture_document()
    document[field] = value
    assert preview(client, document).status_code == 422


@pytest.mark.parametrize('group,field,value', [
    ('subjects', 'user_id', str(UUID(int=80))), ('tasks', 'created_at', '2000-01-01T00:00:00Z'),
    ('tasks', 'subject_id', str(UUID(int=99))), ('study_sessions', 'task_id', str(UUID(int=99))),
    ('study_sessions', 'completed_minutes', 90), ('availability', 'end_time', '08:00'),
    ('tasks', 'progress', 80), ('tasks', 'id', 'existing:foreign-id'),
])
def test_invalid_rows_never_persist_even_with_a_preview_token(client, group, field, value):
    document = fixture_document()
    document['workspace'][group][0][field] = value
    result = preview(client, document).json()
    assert not result['can_apply'] and result['invalid_rows']
    assert apply(client, result, document).status_code == 422
    assert all(not rows for rows in collections(client).values())


def test_subject_name_conflict_reuses_owned_subject_without_overwriting(client):
    subject = client.post('/api/subjects', json={'name': 'Databases', 'color': 'blue'}).json()
    result = preview(client).json()
    assert result['can_apply'] and result['additions']['subjects'] == 0
    assert result['conflicts'][0]['code'] == 'subject_name_conflict'
    assert apply(client, result).status_code == 200
    assert client.get('/api/subjects/' + subject['id']).json()['color'] == 'blue'
    assert client.get('/api/tasks').json()[0]['subject_id'] == subject['id']


def test_duplicate_subject_rows_map_to_one_subject_and_duplicate_ids_are_invalid(client):
    document = fixture_document()
    document['workspace']['subjects'].append(document['workspace']['subjects'][0] | {'id': 'second'})
    result = preview(client, document).json()
    assert result['duplicates']['subjects'] == 1
    assert apply(client, result, document).status_code == 200
    assert len(client.get('/api/subjects').json()) == 1
    document['workspace']['subjects'][1]['id'] = 'db'
    assert not preview(client, document).json()['can_apply']


def test_replace_preserves_distinct_logical_subjects_tasks_even_with_same_natural_keys(client):
    document = fixture_document()
    document['workspace']['subjects'].append(document['workspace']['subjects'][0] | {'id':'second-subject','description':'Another semester'})
    document['workspace']['tasks'].append(document['workspace']['tasks'][0] | {'id':'second-task'})
    document['workspace']['tasks'].append(document['workspace']['tasks'][0] | {'id':'third-task','subject_id':'second-subject'})
    result = preview(client, document, mode='REPLACE').json()
    assert result['can_apply'] and result['additions']['subjects'] == 2 and result['additions']['tasks'] == 3
    assert apply(client, result, document, confirmation='REPLACE').status_code == 200
    data = collections(client)
    assert len(data['subjects']) == 2 and len(data['tasks']) == 3
    assert len({row['subject_id'] for row in data['tasks']}) == 2
    assert data['study-sessions'][0]['task_id'] in {row['id'] for row in data['tasks']}


def test_merge_task_conflict_skips_task_and_dependent_sessions(client):
    assert apply(client, preview(client).json()).status_code == 200
    document = fixture_document()
    document['workspace']['tasks'][0]['description'] = 'Different estimate context'
    result = preview(client, document).json()
    assert {issue['code'] for issue in result['conflicts']} == {'task_conflict', 'dependent_task_conflict'}
    assert apply(client, result, document).status_code == 200
    assert len(client.get('/api/tasks').json()) == len(client.get('/api/study-sessions').json()) == 1


def test_availability_overlap_is_visible_and_incoming_overlap_blocks_replace(client):
    client.post('/api/availability', json={'date': '2099-01-05', 'start_time': '10:00', 'end_time': '13:00'})
    document = fixture_document()
    document['workspace']['study_sessions'] = []
    result = preview(client, document).json()
    assert result['conflicts'][0]['code'] == 'availability_overlap'
    document['workspace']['availability'].append(document['workspace']['availability'][0] | {'id': 'overlap', 'start_time': '11:00'})
    assert not preview(client, document, mode='REPLACE').json()['can_apply']


def test_merge_skips_sessions_dependent_on_conflicting_availability(client):
    client.post('/api/availability', json={'date': '2099-01-05', 'start_time': '10:00', 'end_time': '13:00'})
    result = preview(client).json()
    assert result['can_apply']
    assert {row['code'] for row in result['conflicts']} == {'availability_overlap', 'availability_conflict'}
    assert apply(client, result).status_code == 200
    assert len(client.get('/api/tasks').json()) == 1
    assert client.get('/api/study-sessions').json() == []


def test_import_limits_and_dst_unsafe_windows_are_rejected(client):
    assert preview(client, content='x' * (2 * 1024 * 1024 + 1)).status_code in {413, 422}
    document = fixture_document()
    document['workspace']['availability'][0].update(date='2030-03-31', start_time='02:00', end_time='03:00')
    document['workspace']['study_sessions'] = []
    result = preview(client, document).json()
    assert not result['can_apply']
    assert result['invalid_rows'][0]['code'] == 'invalid_interval'


def test_oversized_existing_collection_is_rejected_instead_of_truncated(client, monkeypatch):
    client.post('/api/subjects', json={'name':'First'})
    client.post('/api/subjects', json={'name':'Second'})
    monkeypatch.setattr(workspace, 'MAX_ROWS', 1)
    assert client.get('/api/workspace/export').status_code == 413
    assert preview(client).status_code == 413


def test_stale_preview_and_modified_content_mode_or_signature_rejected(client):
    result = preview(client).json()
    assert apply(client, result, fingerprint='0' * 64).status_code == 409
    changed = fixture_document()
    changed['workspace']['tasks'][0]['title'] = 'Tampered'
    assert apply(client, result, changed).status_code == 409
    assert apply(client, result, mode='REPLACE', confirmation='REPLACE').status_code == 409
    client.post('/api/subjects', json={'name': 'Concurrent edit'})
    assert apply(client, result).status_code == 409


def test_preview_expiry(client, monkeypatch):
    result = preview(client).json()
    original = workspace.now
    monkeypatch.setattr(workspace, 'now', lambda: original() + timedelta(minutes=11))
    assert apply(client, result).status_code == 409


def test_replace_rolls_back_every_deletion_and_insert_on_failure(client, task, study_session, monkeypatch):
    before = collections(client)
    result = preview(client, mode='REPLACE').json()
    insert = workspace.insert_plan
    def fail(*args):
        insert(*args)
        raise DomainError('Simulated import failure.', 409)
    monkeypatch.setattr(workspace, 'insert_plan', fail)
    assert apply(client, result, confirmation='REPLACE').status_code == 409
    assert collections(client) == before


def test_other_user_cannot_apply_preview_and_replace_never_touches_other_users(client, application, task):
    owner = application.dependency_overrides[get_current_user]
    result = preview(client, mode='REPLACE').json()
    application.dependency_overrides[get_current_user] = lambda: Principal(UUID(int=77))
    assert apply(client, result, confirmation='REPLACE').status_code == 409
    other_preview = preview(client, mode='REPLACE').json()
    assert apply(client, other_preview, confirmation='REPLACE').status_code == 200
    application.dependency_overrides[get_current_user] = owner
    assert client.get('/api/tasks/' + task['id']).status_code == 200
    # Another user's changes do not invalidate the current user's reviewed plan.
    assert apply(client, result, confirmation='REPLACE').status_code == 200


def test_historical_outcomes_round_trip_without_decrementing_current_effort(client):
    document = fixture_document()
    document['workspace']['study_sessions'][0].update(date='2020-01-05', status='COMPLETED', completed_minutes=60)
    document['workspace']['availability'] = []
    result = preview(client, document).json()
    assert result['can_apply'] and result['warnings']
    assert apply(client, result, document).status_code == 200
    assert client.get('/api/tasks').json()[0]['remaining_hours'] == 2
    assert client.get('/api/study-sessions').json()[0]['completed_minutes'] == 60


def test_future_completed_or_after_deadline_sessions_are_rejected(client):
    for change in [{'status': 'COMPLETED', 'completed_minutes': 60}, {'date': '2099-01-10'}]:
        document = fixture_document()
        document['workspace']['study_sessions'][0].update(change)
        assert not preview(client, document).json()['can_apply']


def test_reopened_zero_effort_task_round_trips_without_becoming_completed(client):
    document = fixture_document()
    document['workspace']['tasks'][0].update(status='IN_PROGRESS', progress=100, remaining_hours=0)
    document['workspace']['study_sessions'] = []
    assert apply(client, preview(client, document).json(), document).status_code == 200
    task = client.get('/api/tasks').json()[0]
    assert task['status'] == 'IN_PROGRESS' and task['progress'] == 100 and task['remaining_hours'] == 0


def test_workspace_routes_require_auth(client, application):
    application.dependency_overrides.clear()
    assert client.get('/api/workspace/export').status_code == 401
    assert preview(client).status_code == 401
    assert preview(client, content='not json').status_code == 401


@pytest.mark.parametrize('unsafe', ['\0', '\ud800'])
def test_unsafe_database_text_rejected_before_any_writes(client, unsafe):
    document = fixture_document()
    document['workspace']['subjects'][0]['name'] = unsafe
    assert preview(client, document).status_code == 400
    assert client.get('/api/subjects').json() == []


def test_unsupported_extreme_local_date_is_reported_not_a_server_crash(client):
    document = fixture_document()
    document['workspace']['availability'][0].update(date='0001-01-01', start_time='00:00', end_time='01:00')
    document['workspace']['study_sessions'] = []
    result = preview(client, document)
    assert result.status_code == 200 and not result.json()['can_apply']


def test_checked_in_qa_fixture_supports_real_planner_workflow(client, monkeypatch):
    from app.services import scheduler, risk_engine, replanning
    fixed = datetime(2026, 11, 19, 12, tzinfo=UTC)
    for module in [workspace, scheduler, risk_engine, replanning]:
        monkeypatch.setattr(module, 'now', lambda: fixed)
    document = json.loads((Path(__file__).parents[2] / 'docs/fixtures/qa-workspace-v1.json').read_text())
    result = preview(client, document, mode='REPLACE').json()
    assert result['can_apply'] and result['additions'] == dict(subjects=3, tasks=4, availability=2, study_sessions=2)
    assert apply(client, result, document, confirmation='REPLACE').status_code == 200
    scope = {'date_from': '2030-01-07', 'date_to': '2030-01-13'}
    generated = client.post('/api/planner/generate', json=scope)
    assert generated.status_code == 200, generated.text
    assert generated.json()['created_count'] > 0
    assert client.get('/api/risks').status_code == 200
    assert client.post('/api/planner/replan/preview', json=scope).status_code == 200
    completed = next(row for row in client.get('/api/tasks').json() if row['status'] == 'COMPLETED')
    assert client.patch('/api/tasks/' + completed['id'], json={'status':'IN_PROGRESS'}).json()['progress'] == 100
    assert client.get('/api/workspace/export').status_code == 200
