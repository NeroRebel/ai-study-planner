from typing import Annotated
from uuid import UUID
from fastapi import APIRouter, Depends, Response
from app.api.dependencies import Db, Config
from app.ai import service
from app.schemas.replanning import ReplanApply
from app.schemas.assistant import AssistantRequest, AssistantResponse, EmptyCommand

router=APIRouter(prefix="/assistant",tags=["Assistant"])

def assistant_db(db: Db):
    # Trusted SQL-only context; direct PostgREST access cannot change proposals.
    db.info["assistant_access"]=True
    return db

AssistantDb=Annotated[object,Depends(assistant_db)]

@router.post("/message",response_model=AssistantResponse)
def send_message(data: AssistantRequest, db: AssistantDb, config: Config, response: Response,
                 provider=Depends(service.get_provider)):
    response.headers["Cache-Control"]="no-store"
    return service.message(db,data,config,provider)

@router.post("/actions/{id}/confirm")
def confirm_action(id: UUID, data: EmptyCommand, db: AssistantDb, config: Config, response: Response):
    response.headers["Cache-Control"]="no-store"
    return service.confirm(db,id,config.app_timezone)

@router.post("/actions/{id}/cancel")
def cancel_action(id: UUID, data: EmptyCommand, db: AssistantDb, response: Response):
    response.headers["Cache-Control"]="no-store"
    return service.cancel(db,id)


@router.post("/replan/propose", response_model=AssistantResponse)
def propose_preview(data: ReplanApply, db: AssistantDb, config: Config, response: Response):
    """UI-only review action: store an exact valid preview for later confirmation.

    No planner writes and no provider call. The LLM cannot confirm this command.
    """
    response.headers["Cache-Control"]="no-store"
    pending=service.propose(db,"apply_replan",data,config.app_timezone)
    return AssistantResponse(message="Review the exact plan changes below. Confirm applies them; Cancel leaves your plan unchanged.",
        provider="backend",model="",confirmation=pending,metadata={"planner_changed":False})
