from fastapi import APIRouter
from app.api.routes import availability, study_sessions, subjects, tasks, planner

router = APIRouter(prefix="/api")
for group in (subjects, tasks, availability, study_sessions, planner):
    router.include_router(group.router)
