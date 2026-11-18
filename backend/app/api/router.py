from fastapi import APIRouter
from app.api.routes import availability, study_sessions, subjects, tasks, planner, risks, profile, assistant

router = APIRouter(prefix="/api")
for group in (subjects, tasks, availability, study_sessions, planner, risks, profile, assistant):
    router.include_router(group.router)
