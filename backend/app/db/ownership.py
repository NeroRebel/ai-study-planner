"""Request-scoped ORM ownership plus PostgreSQL RLS context on every transaction.

Unscoped sessions are reserved for offline migrations/explicit operator tools and
isolated test setup. FastAPI's get_db always binds a validated principal.
"""
from sqlalchemy import event, inspect, text
from sqlalchemy.orm import Session, with_loader_criteria
from app.core.exceptions import DomainError
from app.db.base import Owned
from app.models import Subject, Task, Availability, StudySession, Profile, AssistantAction

MODELS = (Subject, Task, Availability, StudySession, Profile, AssistantAction)


@event.listens_for(Session, 'do_orm_execute')
def scope_queries(state):
    owner = state.session.info.get('user_id')
    if owner is not None and (state.is_select or state.is_update or state.is_delete):
        for model in MODELS:
            state.statement = state.statement.options(with_loader_criteria(model, model.user_id == owner, include_aliases=True))


@event.listens_for(Session, 'after_begin')
def rls_context(session, transaction, connection):
    owner = session.info.get('user_id')
    if owner is not None and connection.dialect.name == 'postgresql':
        connection.execute(text("SELECT set_config('request.jwt.claim.sub', :uid, true), set_config('request.jwt.claims', :claims, true)"),
            {'uid':str(owner),'claims':'{"sub":"'+str(owner)+'","role":"authenticated"}'})
        connection.execute(text('SET LOCAL ROLE authenticated'))
        if session.info.get('assistant_access'):
            connection.execute(text("SELECT set_config('app.assistant_access', 'on', true)"))


@event.listens_for(Session, 'before_flush')
def assign_owner(session, _context, _instances):
    owner = session.info.get('user_id')
    if owner is None: return
    owned_new = [item for item in session.new if isinstance(item, Owned)]
    if owned_new:
        # Conflict-safe bootstrap without another SELECT on read-only endpoints.
        from app.services.profiles import bootstrap
        bootstrap(session, owner)
    for item in [*session.new, *session.dirty, *session.deleted]:
        if not isinstance(item, (Owned, Profile)): continue
        if isinstance(item, Owned) and item in session.new and item.user_id is None: item.user_id = owner
        if item.user_id != owner: raise DomainError('Record not found.',404)
        history = inspect(item).attrs.user_id.history
        if history.deleted and any(value != owner for value in history.deleted):
            raise DomainError('Record not found.',404)
