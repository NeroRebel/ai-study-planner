from collections.abc import Iterator

from fastapi import Request
from sqlalchemy import create_engine
from sqlalchemy.engine import URL, Engine, make_url
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import Settings
from app.core.exceptions import DomainError


def postgres_url(raw: str) -> URL:
    try:
        url = make_url(raw)
        if url.drivername not in {"postgres", "postgresql", "postgresql+psycopg"}:
            raise ValueError
        # pgbouncer is a client compatibility flag, not a psycopg/libpq option.
        return url.set(drivername="postgresql+psycopg").difference_update_query(["pgbouncer"])
    except Exception as exc:
        raise DomainError("DATABASE_URL must be a PostgreSQL SQLAlchemy URL.", 503) from exc


def configured_url(settings: Settings, *, migration: bool = False) -> URL:
    secret = (settings.direct_url or settings.database_url) if migration else settings.database_url
    if secret is None:
        variable = "DIRECT_URL or DATABASE_URL" if migration else "DATABASE_URL"
        raise DomainError(f"Database is not configured. Set {variable} in backend/.env.", 503)
    return postgres_url(secret.get_secret_value())


def build_engine(settings: Settings, *, migration: bool = False) -> Engine:
    url = configured_url(settings, migration=migration)
    options = {
        "pool_pre_ping": True, "pool_size": settings.db_pool_size,
        "max_overflow": settings.db_max_overflow,
        "pool_timeout": settings.db_pool_timeout, "pool_recycle": settings.db_pool_recycle,
        "hide_parameters": True,
        # Avoid server-side prepared statements when using Supabase's transaction pooler.
        "connect_args": {"connect_timeout": 10, "prepare_threshold": None},
    }
    if migration:
        from sqlalchemy.pool import NullPool
        for key in ("pool_size", "max_overflow", "pool_timeout", "pool_recycle"):
            options.pop(key)
        options["poolclass"] = NullPool
    return create_engine(url, **options)


def session_factory(engine: Engine) -> sessionmaker[Session]:
    return sessionmaker(bind=engine, expire_on_commit=False, autoflush=False)


def get_db(request: Request) -> Iterator[Session]:
    factory = request.app.state.session_factory
    if factory is None:
        raise DomainError("Database is not configured. Set DATABASE_URL in backend/.env.", 503)
    with factory() as session:
        yield session
