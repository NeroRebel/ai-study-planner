from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import router
from app.api.routes.health import router as health_router
from app.core.config import Settings
from app.core.exceptions import install_handlers
from app.db.session import build_engine, session_factory


def create_app(settings: Settings | None = None, *, db_session_factory=None) -> FastAPI:
    config = settings if settings is not None else Settings()

    @asynccontextmanager
    async def lifespan(application: FastAPI):
        owned_engine = None
        if application.state.session_factory is None and config.database_url is not None:
            owned_engine = build_engine(config)
            application.state.session_factory = session_factory(owned_engine)
        try:
            yield
        finally:
            if owned_engine is not None:
                owned_engine.dispose()
                application.state.session_factory = None

    application = FastAPI(
        title="AI Study Planner API", version="0.1.0", lifespan=lifespan,
        description="Single-student CRUD, deterministic additive scheduling and read-only deadline risk. No automatic replanning, authentication, or AI integration.",
    )
    application.state.settings = config
    application.state.session_factory = db_session_factory
    application.add_middleware(
        CORSMiddleware, allow_origins=config.allowed_origins, allow_credentials=False,
        allow_methods=["GET", "POST", "PATCH", "DELETE"], allow_headers=["Content-Type"],
    )
    install_handlers(application)
    application.include_router(health_router)
    application.include_router(router)
    return application


app = create_app()
