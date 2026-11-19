from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response
from pydantic import ValidationError

from app.api.dependencies import Config, Db
from app.core.exceptions import DomainError
from app.schemas.workspace import MAX_FILE_BYTES, ApplyRequest, ImportPreview, ImportResult, PreviewRequest
from app.services import workspace

router = APIRouter(prefix='/workspace', tags=['Workspace data'])
# JSON-encoding a raw JSON file may escape every byte. Bound transport as well as file size.
MAX_BODY_BYTES = MAX_FILE_BYTES * 6 + 1024


async def read_command(request: Request, schema):
    content = bytearray()
    async for chunk in request.stream():
        content.extend(chunk)
        if len(content) > MAX_BODY_BYTES:
            raise DomainError('Workspace request is too large.', 413)
    try:
        return schema.model_validate(workspace.strict_json(content))
    except ValidationError:
        raise DomainError('Invalid import request fields.', 422) from None


async def preview_command(request: Request):
    return await read_command(request, PreviewRequest)


async def apply_command(request: Request):
    return await read_command(request, ApplyRequest)


@router.get('/export')
def export(db: Db, response: Response):
    response.headers['Cache-Control'] = 'no-store'
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['Content-Disposition'] = 'attachment; filename="ai-study-planner-workspace.json"'
    return workspace.export_workspace(db)


@router.post('/import/preview', response_model=ImportPreview)
def preview(db: Db, config: Config, data: Annotated[PreviewRequest, Depends(preview_command)],
            request: Request, response: Response):
    response.headers['Cache-Control'] = 'no-store'
    return workspace.preview_import(db, data, config.app_timezone, request.app.state.workspace_import_key)


@router.post('/import/apply', response_model=ImportResult)
def apply(db: Db, config: Config, data: Annotated[ApplyRequest, Depends(apply_command)],
          request: Request, response: Response):
    response.headers['Cache-Control'] = 'no-store'
    return workspace.apply_import(db, data, config.app_timezone, request.app.state.workspace_import_key)
