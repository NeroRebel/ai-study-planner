"""Onboarding uses isolated per-user SQLite data; no Supabase/AI calls."""
import importlib.util
from pathlib import Path
from uuid import UUID
import pytest
from sqlalchemy import create_engine, text
from alembic.migration import MigrationContext
from alembic.operations import Operations
from app.core.auth import Principal, get_current_user
from app.ai.tools.planner_tools import profile_context
from app.core.exceptions import DomainError
from app.services import subjects
from tests.conftest import TEST_USER

B = UUID('22222222-2222-4222-8222-222222222222')
def as_user(app, uid): app.dependency_overrides[get_current_user] = lambda: Principal(uid, 'fixture@example.test')

def test_new_profile_starts_incomplete_and_read_is_idempotent(client):
    first=client.get('/api/profile').json()
    assert first['onboarding_completed'] is False
    assert first['onboarding_completed_at'] is None
    assert first['interests']==first['goals']==first['preferred_study_days']==[]
    assert client.get('/api/profile').json()==first

def test_preferences_and_draft_step_persist_without_changing_plan(client):
    data={'university':' Example University ','study_program':'Computer Science','study_level':'Master','study_year':2,'weekly_study_hours':15,'preferred_session_minutes':45,'preferred_study_period':'Evening','preferred_study_days':[5,1,3],'interests':[{'name':'Databases','type':'subject'},{'name':'Programming','type':'skill'}],'goals':['Pass exams'],'onboarding_step':4}
    result=client.patch('/api/profile',json=data)
    assert result.status_code==200,result.text
    saved=client.get('/api/profile').json()
    assert saved['university']=='Example University'
    assert saved['preferred_study_days']==[1,3,5]
    assert saved['onboarding_step']==4 and not saved['onboarding_completed']
    assert all(client.get('/api/'+group).json()==[] for group in ['subjects','tasks','availability','study-sessions'])

@pytest.mark.parametrize('data',[
    {'study_year':0},{'study_year':13},{'study_year':True},{'weekly_study_hours':0},{'weekly_study_hours':81},
    {'preferred_session_minutes':15},{'preferred_study_period':'Night'},{'preferred_study_days':[1,1]},
    {'preferred_study_days':[8]},{'preferred_study_days':[True]},{'study_level':'School'},
    {'interests':[{'name':'  ','type':'subject'}]},{'interests':[{'name':'SQL','type':'unknown'}]},
    {'goals':['Unknown']},{'goals':['Pass exams','Pass exams']},
    {'onboarding_completed':True},{'onboarding_completed_at':'2099-01-01T00:00:00Z'},
    {'user_id':str(B)},{'onboarding_step':6},
])
def test_invalid_preferences_and_client_completion_are_rejected(client,data):
    assert client.patch('/api/profile',json=data).status_code==422
    assert client.get('/api/profile').json()['onboarding_completed'] is False

def test_duplicate_interest_names_are_case_insensitive(client):
    assert client.patch('/api/profile',json={'interests':[{'name':'SQL','type':'subject'},{'name':' sql ','type':'skill'}]}).status_code==422

def test_profile_interests_and_goals_cannot_cross_users(client,application):
    client.patch('/api/profile',json={'study_program':'A private major','interests':[{'name':'A course','type':'subject'}],'goals':['Pass exams']})
    as_user(application,B)
    own=client.get('/api/profile').json()
    assert own['user_id']==str(B) and own['study_program'] is None and own['interests']==[]
    client.patch('/api/profile',json={'study_program':'B major'})
    client.post('/api/profile/onboarding/complete',json={'start_mode':'manual','create_subjects':True})
    assert client.get('/api/subjects').json()==[]
    as_user(application,TEST_USER)
    assert client.get('/api/profile').json()['study_program']=='A private major'
    assert client.get('/api/profile').json()['onboarding_completed'] is False

def test_manual_completion_without_approval_creates_nothing(client):
    client.patch('/api/profile',json={'interests':[{'name':'Databases','type':'subject'}]})
    result=client.post('/api/profile/onboarding/complete',json={'start_mode':'manual','create_subjects':False}).json()
    assert result['profile']['onboarding_completed'] and result['profile']['onboarding_completed_at']
    assert result['created_subjects']==[] and client.get('/api/subjects').json()==[]

def test_approved_subjects_created_once_skills_never_become_courses(client):
    client.post('/api/subjects',json={'name':'databases'})
    client.patch('/api/profile',json={'interests':[{'name':'Databases','type':'subject'},{'name':'Statistics','type':'subject'},{'name':'Programming','type':'skill'}]})
    body={'start_mode':'ai','create_subjects':True,'subject_names':['Databases','Statistics']}
    first=client.post('/api/profile/onboarding/complete',json=body).json()
    second=client.post('/api/profile/onboarding/complete',json=body).json()
    assert [s['name'] for s in first['created_subjects']]==['Statistics']
    assert second['created_subjects']==[]
    assert first['profile']['onboarding_completed_at']==second['profile']['onboarding_completed_at']
    assert {s['name'] for s in client.get('/api/subjects').json()}=={'databases','Statistics'}
    assert all(client.get('/api/'+group).json()==[] for group in ['tasks','availability','study-sessions'])

def test_skip_is_persistent_and_does_not_create_subjects(client):
    client.patch('/api/profile',json={'interests':[{'name':'Statistics','type':'subject'}]})
    result=client.post('/api/profile/onboarding/complete',json={'skip':True}).json()['profile']
    assert result['onboarding_completed'] and result['onboarding_skipped'] and result['onboarding_start_mode']=='manual'
    assert client.get('/api/profile').json()['onboarding_skipped']
    assert client.get('/api/subjects').json()==[]
    assert client.post('/api/profile/onboarding/complete',json={'skip':True,'create_subjects':True}).status_code==422

def test_subject_creation_and_completion_rollback_together(client,monkeypatch):
    client.patch('/api/profile',json={'interests':[{'name':'Statistics','type':'subject'}]})
    original=subjects.add
    def fail(db,data):
        original(db,data);db.flush()
        raise DomainError('Test interrupted.',409)
    monkeypatch.setattr(subjects,'add',fail)
    assert client.post('/api/profile/onboarding/complete',json={'create_subjects':True,'subject_names':['Statistics']}).status_code==409
    assert client.get('/api/subjects').json()==[]
    assert not client.get('/api/profile').json()['onboarding_completed']

def test_study_context_is_owned_and_excludes_unnecessary_identity(client,application,db_factory):
    client.patch('/api/profile',json={'university':'Private university','study_program':'Statistics','goals':['Pass exams'],'weekly_study_hours':15})
    with db_factory() as db:
        context=profile_context(db,'Europe/Budapest')
        assert context['study_preferences']['study_program']=='Statistics'
        assert 'Private university' not in str(context) and 'user_id' not in context and 'avatar_path' not in context
    as_user(application,B);client.get('/api/profile')
    with db_factory(info={'user_id':B}) as db:
        assert profile_context(db,'Europe/Budapest')['study_preferences']['goals']==[]

def test_concurrent_subject_selection_change_needs_new_approval(client):
    client.patch('/api/profile',json={'interests':[{'name':'Statistics','type':'subject'}]})
    assert client.post('/api/profile/onboarding/complete',json={'create_subjects':True,'subject_names':['Databases']}).status_code==409
    assert not client.get('/api/profile').json()['onboarding_completed']
    assert client.get('/api/subjects').json()==[]

def test_onboarding_requires_existing_auth(client,application):
    application.dependency_overrides.clear()
    assert client.post('/api/profile/onboarding/complete',json={}).status_code==401

def test_migration_preserves_existing_profiles_and_defaults_new_ones_incomplete():
    path=Path(__file__).parents[1]/'alembic/versions/0005_profile_onboarding.py'
    spec=importlib.util.spec_from_file_location('onboarding_migration',path);migration=importlib.util.module_from_spec(spec);spec.loader.exec_module(migration)
    engine=create_engine('sqlite://')
    with engine.begin() as connection:
        connection.execute(text('CREATE TABLE profiles (user_id VARCHAR PRIMARY KEY, display_name VARCHAR NOT NULL)'))
        connection.execute(text("INSERT INTO profiles VALUES ('old','Existing')"))
        with Operations.context(MigrationContext.configure(connection)): migration.upgrade()
        old=connection.execute(text("SELECT onboarding_completed,onboarding_completed_at FROM profiles WHERE user_id='old'")).one()
        assert old[0] and old[1]
        connection.execute(text("INSERT INTO profiles (user_id,display_name) VALUES ('new','New')"))
        assert not connection.scalar(text("SELECT onboarding_completed FROM profiles WHERE user_id='new'"))
    engine.dispose()
