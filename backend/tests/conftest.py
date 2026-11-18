import pytest
from uuid import UUID
from app.core.auth import Principal, get_current_user
TEST_USER = UUID("11111111-1111-4111-8111-111111111111")
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.config import Settings
from app.db.base import Base
from app.main import create_app
from app.models import Availability, StudySession, Subject, Task  # noqa: F401


@pytest.fixture
def db_factory():
    # Hard-coded in-memory SQLite. DATABASE_URL and backend/.env are never used.
    engine = create_engine("sqlite+pysqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)

    @event.listens_for(engine, "connect")
    def foreign_keys(connection, _record):
        connection.execute("PRAGMA foreign_keys=ON")

    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, expire_on_commit=False, autoflush=False, info={"user_id":TEST_USER})
    yield factory
    engine.dispose()


@pytest.fixture
def application(db_factory):
    # Explicit None wins over any developer DATABASE_URL in the environment.
    settings = Settings(database_url=None, _env_file=None)
    app = create_app(settings, db_session_factory=db_factory)
    app.dependency_overrides[get_current_user] = lambda: Principal(TEST_USER, "fixture@example.test")
    return app


@pytest.fixture
def client(application):
    with TestClient(application) as test_client:
        yield test_client


@pytest.fixture
def subject(client):
    response = client.post("/api/subjects", json={"name": "Databases", "color": "gold"})
    assert response.status_code == 201, response.text
    return response.json()


@pytest.fixture
def task(client, subject):
    response = client.post("/api/tasks", json={
        "title": "Database assignment", "subject_id": subject["id"], "deadline": "2099-12-31T22:59:00Z",
        "estimated_hours": 5, "priority": "HIGH", "difficulty": "HARD",
    })
    assert response.status_code == 201, response.text
    return response.json()


@pytest.fixture
def window(client):
    response = client.post("/api/availability", json={"date": "2099-01-05", "start_time": "17:00", "end_time": "21:00"})
    assert response.status_code == 201, response.text
    return response.json()


@pytest.fixture
def study_session(client, task, window):
    response = client.post("/api/study-sessions", json={"task_id": task["id"], "date": window["date"],
                           "start_time": "17:00", "end_time": "18:00"})
    assert response.status_code == 201, response.text
    return response.json()
