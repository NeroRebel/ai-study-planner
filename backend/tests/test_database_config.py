from io import StringIO

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy.pool import NullPool

from app.core.config import BACKEND_ROOT, Settings
from app.core.exceptions import DomainError
from app.db.session import build_engine


RUNTIME = "postgresql+psycopg://demo:placeholder@runtime.invalid:6543/postgres?pgbouncer=true&sslmode=require"
DIRECT = "postgresql+psycopg://demo:placeholder@migrations.invalid:5432/postgres?sslmode=require"


@pytest.mark.parametrize("direct", [DIRECT, None, ""])
def test_runtime_and_migration_engine_selection(direct):
    settings = Settings(database_url=RUNTIME, direct_url=direct, _env_file=None)
    runtime = build_engine(settings)
    migration = build_engine(settings, migration=True)
    try:
        assert runtime.url.host == "runtime.invalid"
        assert runtime.url.port == 6543
        assert migration.url.host == ("migrations.invalid" if direct else "runtime.invalid")
        assert isinstance(migration.pool, NullPool)
        for engine in (runtime, migration):
            assert "pgbouncer" not in engine.url.query
            assert engine.url.query["sslmode"] == "require"
            _, kwargs = engine.dialect.create_connect_args(engine.url)
            assert "pgbouncer" not in kwargs
    finally:
        runtime.dispose()
        migration.dispose()


def test_direct_url_does_not_configure_runtime():
    settings = Settings(database_url=None, direct_url=DIRECT, _env_file=None)
    with pytest.raises(DomainError, match="Set DATABASE_URL"):
        build_engine(settings)
    engine = build_engine(settings, migration=True)
    assert engine.url.host == "migrations.invalid"
    engine.dispose()


@pytest.mark.parametrize("direct", [DIRECT, ""])
def test_alembic_offline_url_selection(monkeypatch, direct):
    # Invalid runtime URL proves DIRECT_URL is selected when supplied.
    # Offline generation never connects to either database.
    monkeypatch.setenv("DATABASE_URL", "invalid-runtime" if direct else RUNTIME)
    monkeypatch.setenv("DIRECT_URL", direct)
    output = StringIO()
    config = Config(str(BACKEND_ROOT / "alembic.ini"), output_buffer=output)
    command.upgrade(config, "head", sql=True)
    assert "CREATE TABLE subjects" in output.getvalue()
    assert "CREATE TABLE study_sessions" in output.getvalue()
