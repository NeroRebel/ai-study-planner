from datetime import date
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy import func, select
from sqlalchemy.exc import SQLAlchemyError

from app.core.config import Settings
from app.core.exceptions import DomainError
from app.db.session import postgres_url
from app.main import create_app
from app.models import Availability, StudySession, Subject, Task
from app.seed import seed_into


def test_health_docs_and_openapi(client):
    assert client.get("/health").json() == {"status": "ok"}
    assert client.get("/health/db").json() == {"status": "ok"}
    assert client.get("/docs").status_code == 200
    schema = client.get("/openapi.json").json()
    for group in ("subjects", "tasks", "availability", "study-sessions"):
        assert set(schema["paths"]["/api/" + group]) == {"get", "post"}
        assert set(schema["paths"]["/api/" + group + "/{id}"]) == {"get", "patch", "delete"}


def test_missing_database_still_allows_health():
    with TestClient(create_app(Settings(database_url=None, _env_file=None))) as client:
        assert client.get("/health").status_code == 200
        assert client.get("/docs").status_code == 200
        response = client.get("/api/subjects")
        assert response.status_code == 503
        assert "DATABASE_URL" in response.json()["detail"]


def test_cors_uses_explicit_origins(client):
    response = client.options("/api/subjects", headers={
        "Origin": "http://localhost:5173", "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "Content-Type",
    })
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"
    assert "access-control-allow-credentials" not in response.headers
    assert client.options("/api/subjects", headers={
        "Origin": "https://untrusted.example", "Access-Control-Request-Method": "POST",
    }).status_code == 400


def test_tests_ignore_environment_database(monkeypatch, db_factory):
    monkeypatch.setenv("DATABASE_URL", "postgresql://invalid:private@unreachable.invalid/dev")
    app = create_app(Settings(database_url=None, _env_file=None), db_session_factory=db_factory)
    with TestClient(app) as client:
        assert client.post("/api/subjects", json={"name": "Isolated"}).status_code == 201
    assert db_factory.kw["bind"].dialect.name == "sqlite"


def test_errors_do_not_echo_sql_or_inputs(application):
    @application.get("/test-private-error")
    def fail():
        raise SQLAlchemyError("password=private SQL SELECT secret")

    with TestClient(application) as client:
        response = client.get("/test-private-error")
        assert response.status_code == 503
        assert response.json() == {"detail": "Database operation unavailable."}
        response = client.post("/api/subjects", json={"name": "", "private": "sensitive-value"})
        assert response.status_code == 422
        assert "sensitive-value" not in response.text


@pytest.mark.parametrize("scheme", ["postgres", "postgresql", "postgresql+psycopg"])
def test_postgres_url_normalization(scheme):
    url = postgres_url(scheme + "://demo:p%40ss@localhost/demo?sslmode=require")
    assert url.drivername == "postgresql+psycopg"
    assert url.password == "p@ss"
    assert url.query["sslmode"] == "require"


def test_bad_config_rejected_without_database_connection():
    with pytest.raises(DomainError):
        postgres_url("sqlite:///normal-data.db")
    with pytest.raises(ValidationError):
        Settings(cors_origins="*", _env_file=None)
    with pytest.raises(ValidationError):
        Settings(app_timezone="Invalid/Timezone", _env_file=None)


def test_seed_is_atomic_and_refuses_existing_data(db_factory):
    with db_factory() as db, db.begin():
        counts = seed_into(db, "Europe/Budapest", date(2099, 1, 5))
        assert counts["study_sessions"] == 13
    with db_factory() as db:
        assert [db.scalar(select(func.count()).select_from(model))
                for model in (Subject, Task, Availability, StudySession)] == [4, 12, 9, 13]
    with pytest.raises(DomainError, match="empty core tables"):
        with db_factory() as db, db.begin():
            seed_into(db, "Europe/Budapest", date(2099, 1, 5))
    with db_factory() as db:
        assert db.scalar(select(func.count()).select_from(Subject)) == 4


def test_missing_resources_and_pagination(client):
    for group in ("subjects", "tasks", "availability", "study-sessions"):
        for method in (client.get, client.delete):
            assert method("/api/" + group + "/" + str(uuid4())).status_code == 404
        assert client.get("/api/" + group, params={"limit": 501}).status_code == 422
