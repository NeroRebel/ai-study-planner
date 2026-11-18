"""Bounded tool loop and server-owned two-phase commands."""
import json
import time
from collections import OrderedDict, deque
from datetime import date, timedelta
from threading import Lock
from uuid import uuid4
from pydantic import ValidationError
from sqlalchemy import select, func, delete
from app.ai.providers.gemini import GeminiProvider
from app.ai.prompts.system import SYSTEM_PROMPT
from app.ai.tools import planner_tools as tools
from app.core.exceptions import DomainError
from app.api.dependencies import Config
from app.models import AssistantAction
from app.schemas.assistant import AssistantResponse, Confirmation
from app.schemas.replanning import ReplanRequest
from app.services import replanning
from app.services.common import now, required, serialize_read, serialize_write

MAX_ROUNDS = 6
MAX_CALLS = 20
TTL = timedelta(minutes=5)
_rate_lock = Lock()
_rates = OrderedDict()

def rate_limit(owner):
    current=time.monotonic()
    with _rate_lock:
        bucket=_rates.setdefault(str(owner),deque())
        while bucket and bucket[0]<=current-60: bucket.popleft()
        if len(bucket)>=10: raise DomainError("Please wait a minute before sending another assistant request.",429)
        bucket.append(current);_rates.move_to_end(str(owner))
        while len(_rates)>10000: _rates.popitem(last=False)

def get_provider(config: Config):
    if config.ai_provider != "gemini": raise DomainError("The configured AI provider is not supported.",503)
    return GeminiProvider(config)

def fingerprint(db, timezone):
    # Fixed scope makes the hash purely a function of owned persistent state.
    scope=ReplanRequest(date_from=date(2000,1,1),date_to=date(2000,1,1))
    return replanning.snapshot_fingerprint(*replanning.load_snapshot(db),scope,timezone,db.info["user_id"])

def confirmation(item):
    return Confirmation(id=item.id,type=item.kind,summary={k:v for k,v in item.summary.items() if k!="preview"},
        expires_at=item.expires_at,status=item.status,preview=item.summary.get("preview"))

def propose(db, name, data, timezone):
    serialize_write(db)
    count=db.scalar(select(func.count()).select_from(AssistantAction).where(AssistantAction.status=="PENDING",AssistantAction.expires_at>now()))
    if count>=20: raise DomainError("Too many pending actions. Cancel an earlier proposal or wait five minutes.",429)
    db.execute(delete(AssistantAction).where(AssistantAction.expires_at < now()-timedelta(days=1)))
    payload,summary=tools.validate_proposal(db,name,data,timezone)
    expiry=now()+TTL
    if name=="apply_replan": expiry=min(expiry,data.evaluated_at+replanning.TTL)
    item=AssistantAction(id=uuid4(),kind=name,payload=payload,summary=summary,
        fingerprint=fingerprint(db,timezone),expires_at=expiry,status="PENDING")
    db.add(item);db.commit()
    return confirmation(item)

def message(db, request, config, provider):
    rate_limit(db.info["user_id"])
    serialize_read(db)
    context=tools.profile_context(db,config.app_timezone)
    db.rollback()  # Never hold planner/advisory locks while waiting on an LLM.
    history=[m.model_dump() for m in request.history][-12:]
    # Bound chat replay independently from the individual message cap.
    while sum(len(m["content"]) for m in history)>16000: history.pop(0)
    history.append({"role":"user","content":request.message})
    system=SYSTEM_PROMPT+"\nSafe current profile/clock metadata: "+json.dumps(context)
    continuation=[];results=[];cache={};cards=[];call_count=0;budget=100000
    deadline=time.monotonic()+75
    for _ in range(MAX_ROUNDS):
        remaining=min(config.ai_timeout_seconds,deadline-time.monotonic())
        if remaining<=0: raise DomainError("Assistant request timed out. Your planner data is unchanged.",504)
        try:
            generated=provider.generate(system,history,tools.declarations(),continuation,results,remaining)
        except DomainError: raise
        except Exception:
            raise DomainError("The AI service is unavailable. Your planner data is unchanged.",503) from None
        if not generated.calls:
            if not generated.text.strip() or len(generated.text)>12000:
                raise DomainError("The AI service returned an invalid response. Your planner data is unchanged.",503)
            return AssistantResponse(message=generated.text,provider=provider.name,model=provider.model,actions=cards,
                metadata={"tools_used":list(dict.fromkeys(c[0] for c in cache)),"planner_changed":False})
        call_count+=len(generated.calls)
        if call_count>MAX_CALLS: break
        continuation=generated.continuation;results=[]
        for call in generated.calls:
            try:
                data=tools.parse(call.name,call.arguments,config.app_timezone)
                if call.name in tools.MUTATIONS:
                    pending=propose(db,call.name,data,config.app_timezone)
                    # Stop at the first proposal. The model cannot execute any write
                    # nor speak as though it succeeded, even in parallel tool calls.
                    return AssistantResponse(message="Please review this proposed change. Nothing has been saved to your planner. Use Confirm to apply it.",
                        provider=provider.name,model=provider.model,confirmation=pending,actions=cards,
                        metadata={"planner_changed":False,"tools_used":[*dict.fromkeys(c[0] for c in cache),call.name]})
                key=(call.name,json.dumps(data.model_dump(mode="json"),sort_keys=True))
                if key not in cache:
                    serialize_read(db)
                    value=tools.read(db,call.name,data,config.app_timezone)
                    db.rollback()
                    size=len(json.dumps(value))
                    if size>80000 or size>budget:
                        value={"error":"Result too large. Ask for a narrower date range or task instead; no result may be assumed complete."}
                    else:
                        budget-=size
                        if call.name=="preview_replan": cards.append({"type":"replan_preview","preview":value})
                        if call.name=="get_risks": cards.append({"type":"risks","tasks":value["tasks"][:20],"evaluated_at":value["evaluated_at"]})
                    cache[key]=value
                value=cache[key]
            except ValidationError as error:
                db.rollback();value={"error":"Invalid tool arguments. Check required fields, types and enum values. Do not invent missing values; ask the user.",
                    "fields":[{"path":".".join(map(str,item["loc"])),"message":item["msg"]} for item in error.errors()]}
            except DomainError as error:
                db.rollback();value={"error":error.detail,"status":error.status_code}
            results.append({"name":call.name,"id":call.id,"result":value})
    raise DomainError("The assistant reached its tool limit. Please ask a more specific question. Your planner data is unchanged.",503)

def confirm(db, action_id, timezone):
    serialize_write(db)
    item=required(db.scalar(select(AssistantAction).where(AssistantAction.id==action_id).with_for_update()),"Pending action")
    if item.status=="CONFIRMED": return item.result
    if item.status!="PENDING": raise DomainError("This action was cancelled.",409)
    if now()>=item.expires_at: raise DomainError("This confirmation expired. Request a new proposal.",409)
    if fingerprint(db,timezone)!=item.fingerprint: raise DomainError("Planner data changed. Request a fresh proposal before confirming.",409)
    try:
        db.info["defer_service_commit"]=True
        # Existing services flush instead of committing within this unit of work.
        # A failed validation/SQL write rolls back both the command and its receipt.
        result=tools.execute(db,item.kind,item.payload,timezone)
        item.status="CONFIRMED"
        item.result={"message":"Change saved to your planner.","action":item.kind,"result":result,"planner_changed":True}
        db.flush();db.commit()
        return item.result
    except Exception:
        db.rollback();raise
    finally: db.info.pop("defer_service_commit",None)

def cancel(db, action_id):
    serialize_write(db)
    item=required(db.scalar(select(AssistantAction).where(AssistantAction.id==action_id).with_for_update()),"Pending action")
    if item.status=="CONFIRMED": raise DomainError("This action was already confirmed. Refresh your planner.",409)
    item.status="CANCELLED";db.commit()
    return {"message":"Proposal cancelled. Your planner data is unchanged."}
