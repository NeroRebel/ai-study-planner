from fastapi import APIRouter

from app.api.dependencies import Config, Db
from app.schemas.scheduler import GeneratePlanRequest, GeneratePlanResult
from app.services import scheduler

router = APIRouter(prefix="/planner", tags=["Planner"])


@router.post("/generate", response_model=GeneratePlanResult)
def generate_plan(data: GeneratePlanRequest, db: Db, config: Config):
    return scheduler.generate(db, data, config.app_timezone)
