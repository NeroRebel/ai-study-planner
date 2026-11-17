from logging.config import fileConfig

from alembic import context

from app.core.config import Settings
from app.db.base import Base, UTCDateTime
from app.db.session import build_engine, configured_url
from app.models import Availability, StudySession, Subject, Task  # noqa: F401

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name, disable_existing_loggers=False)
target_metadata = Base.metadata

def render_item(kind, item, _context):
    if kind == "type" and isinstance(item, UTCDateTime):
        return "sa.DateTime(timezone=True)"
    return False


def run_migrations_offline():
    settings = Settings()
    # URL is passed directly: percent-escaped passwords never enter ConfigParser.
    url = configured_url(settings, migration=True)
    context.configure(url=url, target_metadata=target_metadata, literal_binds=True,
                      dialect_opts={"paramstyle": "named"}, compare_type=True, render_item=render_item)
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online():
    engine = build_engine(Settings(), migration=True)
    try:
        with engine.connect() as connection:
            context.configure(connection=connection, target_metadata=target_metadata,
                              compare_type=True, compare_server_default=True, render_item=render_item)
            with context.begin_transaction():
                context.run_migrations()
    finally:
        engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
