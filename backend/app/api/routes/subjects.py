from uuid import UUID
from fastapi import APIRouter, Response
from app.api.dependencies import Db, Limit, Offset
from app.repositories import subjects as repo
from app.schemas.subject import SubjectCreate, SubjectPatch, SubjectRead
from app.services import subjects as service
from app.services.common import required

router = APIRouter(prefix="/subjects", tags=["Subjects"])


@router.get("", response_model=list[SubjectRead])
def list_subjects(db: Db, offset: Offset = 0, limit: Limit = 100):
    return repo.list_all(db, offset, limit)


@router.post("", response_model=SubjectRead, status_code=201)
def create_subject(data: SubjectCreate, db: Db):
    return service.create(db, data)


@router.get("/{id}", response_model=SubjectRead)
def get_subject(id: UUID, db: Db):
    return required(repo.get(db, id), "Subject")


@router.patch("/{id}", response_model=SubjectRead)
def patch_subject(id: UUID, data: SubjectPatch, db: Db):
    return service.patch(db, id, data)


@router.delete("/{id}", status_code=204)
def delete_subject(id: UUID, db: Db):
    service.remove(db, id)
    return Response(status_code=204)
