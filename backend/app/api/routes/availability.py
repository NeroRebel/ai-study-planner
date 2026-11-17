from datetime import date
from uuid import UUID
from fastapi import APIRouter, Response
from app.api.dependencies import Config, Db, Limit, Offset
from app.models import Availability
from app.repositories import intervals
from app.schemas.availability import AvailabilityCreate, AvailabilityPatch, AvailabilityRead
from app.services import availability as service
from app.services.common import check_range, required

router = APIRouter(prefix="/availability", tags=["Availability"])


@router.get("", response_model=list[AvailabilityRead])
def list_availability(db: Db, date_from: date | None = None, date_to: date | None = None,
                      offset: Offset = 0, limit: Limit = 100):
    check_range(date_from, date_to)
    return intervals.list_all(db, Availability, date_from=date_from, date_to=date_to, offset=offset, limit=limit)


@router.post("", response_model=AvailabilityRead, status_code=201)
def create_availability(data: AvailabilityCreate, db: Db, config: Config):
    return service.create(db, data, config.app_timezone)


@router.get("/{id}", response_model=AvailabilityRead)
def get_availability(id: UUID, db: Db):
    return required(db.get(Availability, id), "Availability")


@router.patch("/{id}", response_model=AvailabilityRead)
def patch_availability(id: UUID, data: AvailabilityPatch, db: Db, config: Config):
    return service.patch(db, id, data, config.app_timezone)


@router.delete("/{id}", status_code=204)
def delete_availability(id: UUID, db: Db, config: Config):
    service.remove(db, id, config.app_timezone)
    return Response(status_code=204)
