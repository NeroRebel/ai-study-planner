from typing import Annotated
from fastapi import Depends, Query, Request
from sqlalchemy.orm import Session
from app.core.config import Settings
from app.db.session import get_db

Db = Annotated[Session, Depends(get_db)]
Offset = Annotated[int, Query(ge=0)]
Limit = Annotated[int, Query(ge=1, le=500)]


def get_config(request: Request) -> Settings:
    return request.app.state.settings


Config = Annotated[Settings, Depends(get_config)]
