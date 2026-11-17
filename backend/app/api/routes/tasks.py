from uuid import UUID
from fastapi import APIRouter, Response
from pydantic import AwareDatetime
from app.api.dependencies import Config, Db, Limit, Offset
from app.models.enums import Priority, TaskStatus
from app.repositories import tasks as repo
from app.schemas.task import TaskCreate, TaskPatch, TaskRead
from app.services import tasks as service
from app.services.common import check_range, required

router = APIRouter(prefix="/tasks", tags=["Tasks"])


@router.get("", response_model=list[TaskRead])
def list_tasks(db: Db, subject_id: UUID | None = None, status: TaskStatus | None = None,
               priority: Priority | None = None, deadline_from: AwareDatetime | None = None,
               deadline_to: AwareDatetime | None = None, offset: Offset = 0, limit: Limit = 100):
    check_range(deadline_from, deadline_to)
    return repo.list_all(db, subject_id=subject_id, status=status, priority=priority,
                         deadline_from=deadline_from, deadline_to=deadline_to, offset=offset, limit=limit)


@router.post("", response_model=TaskRead, status_code=201)
def create_task(data: TaskCreate, db: Db):
    return service.create(db, data)


@router.get("/{id}", response_model=TaskRead)
def get_task(id: UUID, db: Db):
    return required(repo.get(db, id), "Task")


@router.patch("/{id}", response_model=TaskRead)
def patch_task(id: UUID, data: TaskPatch, db: Db, config: Config):
    return service.patch(db, id, data, config.app_timezone)


@router.delete("/{id}", status_code=204)
def delete_task(id: UUID, db: Db):
    service.remove(db, id)
    return Response(status_code=204)
