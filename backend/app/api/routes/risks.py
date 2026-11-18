from fastapi import APIRouter, Response

from app.api.dependencies import Config, Db
from app.schemas.risk import RiskResponse
from app.services import risk_engine

router = APIRouter(prefix="/risks", tags=["Deadline risks"])


@router.get("", response_model=RiskResponse)
def get_risks(db: Db, config: Config, response: Response):
    response.headers["Cache-Control"] = "no-store"
    return risk_engine.assess_all(db, config.app_timezone)
