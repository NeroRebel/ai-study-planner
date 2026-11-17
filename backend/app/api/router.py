from fastapi import APIRouter
from app.api.routes import availability, study_sessions, subjects, tasks

router = APIRouter(prefix="/api")
for group in (subjects, tasks, availability, study_sessions):
    router.include_router(group.router)
