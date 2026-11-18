from fastapi import APIRouter

from app.api.dependencies import Config, Db
from app.schemas.scheduler import GeneratePlanRequest, GeneratePlanResult
from app.services import scheduler, replanning
from app.schemas.replanning import ReplanRequest, ReplanApply, ReplanPreview

router = APIRouter(prefix="/planner", tags=["Planner"])


@router.post("/generate", response_model=GeneratePlanResult)
def generate_plan(data: GeneratePlanRequest, db: Db, config: Config):
    return scheduler.generate(db, data, config.app_timezone)


@router.post("/replan/preview", response_model=ReplanPreview)
def preview_replan(data: ReplanRequest, db: Db, config: Config):
    return replanning.preview(db, data, config.app_timezone)


@router.post("/replan/apply", response_model=ReplanPreview)
def apply_replan(data: ReplanApply, db: Db, config: Config):
    return replanning.apply(db, data, config.app_timezone)
