from datetime import date
from uuid import UUID
from fastapi import APIRouter, Response
from app.api.dependencies import Config, Db, Limit, Offset
from app.models import StudySession
from app.models.enums import StudySessionStatus
from app.repositories import intervals
from app.schemas.study_session import StudySessionCreate, StudySessionPatch, StudySessionRead
from app.services import study_sessions as service
from app.services.common import check_range, required

router = APIRouter(prefix="/study-sessions", tags=["Study sessions"])


@router.get("", response_model=list[StudySessionRead])
def list_sessions(db: Db, task_id: UUID | None = None, date_from: date | None = None,
                  date_to: date | None = None, status: StudySessionStatus | None = None,
                  offset: Offset = 0, limit: Limit = 100):
    check_range(date_from, date_to)
    return intervals.list_all(db, StudySession, task_id=task_id, date_from=date_from,
                              date_to=date_to, status=status, offset=offset, limit=limit)


@router.post("", response_model=StudySessionRead, status_code=201)
def create_session(data: StudySessionCreate, db: Db, config: Config):
    return service.save(db, data, config.app_timezone)


@router.get("/{id}", response_model=StudySessionRead)
def get_session(id: UUID, db: Db):
    return required(db.get(StudySession, id), "Study session")


@router.patch("/{id}", response_model=StudySessionRead)
def patch_session(id: UUID, data: StudySessionPatch, db: Db, config: Config):
    return service.save(db, data, config.app_timezone, id)


@router.delete("/{id}", status_code=204)
def delete_session(id: UUID, db: Db):
    service.remove(db, id)
    return Response(status_code=204)
