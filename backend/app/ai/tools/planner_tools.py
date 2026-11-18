"""Allowlisted tools. All lookups use the authenticated request Session/RLS."""
from datetime import date, timedelta
from uuid import UUID
from zoneinfo import ZoneInfo
from pydantic import Field
from sqlalchemy import select
from app.core.exceptions import DomainError
from app.models import Task, Subject, Availability, StudySession, Profile
from app.schemas.common import Schema, minute_hours
from app.schemas.task import TaskCreate, TaskPatch, TaskRead
from app.schemas.availability import AvailabilityCreate, AvailabilityPatch, AvailabilityRead
from app.schemas.study_session import StudySessionRead
from app.schemas.subject import SubjectRead
from app.schemas.scheduler import GeneratePlanRequest
from app.schemas.replanning import ReplanRequest, ReplanApply
from app.services import tasks, availability, scheduler, replanning, risk_engine
from app.services.common import required, now, check_range

class Empty(Schema): pass
class Lookup(Schema):
    task_id: UUID
class SubjectLookup(Schema):
    subject_id: UUID
class Query(Schema):
    date_from: date | None = None
    date_to: date | None = None
    subject_id: UUID | None = None
    offset: int = Field(default=0,ge=0,le=10000)
    limit: int = Field(default=30,ge=1,le=50)
    include_inactive: bool = False
class TaskUpdate(Schema):
    task_id: UUID
    changes: TaskPatch
# These are input adapters, not new domain/deadline fields. The model copies the
# student's local clock literally; only the canonical backend utility handles UTC.
LOCAL_DEADLINE_PATTERN = r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$"
LOCAL_DEADLINE_DESCRIPTION = "Europe/Budapest local date and clock, YYYY-MM-DDTHH:MM, e.g. 2026-11-20T18:00. Copy the requested local time literally. Do NOT convert to UTC or add a timezone offset."

class LocalTaskCreate(TaskCreate):
    deadline: str = Field(pattern=LOCAL_DEADLINE_PATTERN, description=LOCAL_DEADLINE_DESCRIPTION)

class LocalTaskPatch(TaskPatch):
    deadline: str | None = Field(default=None, pattern=LOCAL_DEADLINE_PATTERN, description=LOCAL_DEADLINE_DESCRIPTION)

class LocalTaskUpdate(TaskUpdate):
    changes: LocalTaskPatch

class AvailabilityUpdate(Schema):
    availability_id: UUID
    changes: AvailabilityPatch
class AvailabilityDelete(Schema):
    availability_id: UUID

# Tools reuse API schemas, with a local-clock input adapter for task deadlines.
# There is no user_id field.
TOOLS = {
    "get_profile_context": (Empty, "Read display name, fixed planner timezone and current local time."),
    "get_subjects": (Empty, "Resolve exact subject IDs/names; ask when a name is ambiguous."),
    "get_today_plan": (Empty, "Read today's actual sessions and task/subject context."),
    "get_week_plan": (Empty, "Read this Monday-Sunday week's actual sessions and total planned minutes."),
    "get_tasks": (Query, "Read tasks with canonical remaining minutes; date bounds filter local deadlines. Paginated."),
    "get_task_details": (Lookup, "Read one task, including its student-provided description."),
    "get_deadlines": (Query, "Read active task deadlines, including overdue work. Paginated."),
    "get_risks": (Empty, "Read authoritative deterministic task/subject risks. Shared slack is non-additive."),
    "get_subject_summary": (SubjectLookup, "Read one subject's tasks, remaining work and risk summary."),
    "get_availability": (Query, "Read local dated availability, not free capacity. Paginated."),
    "assess_workload": (GeneratePlanRequest, "READ ONLY: assess whether remaining work fits an explicit 1-31 day horizon using the existing Risk Engine on an immutable deadline-capped snapshot. This is a what-if assessment, not changed saved risk/deadlines; existing reservations remain fixed."),
    "preview_replan": (ReplanRequest, "READ ONLY: compute the existing deterministic replanning diff and risks. To offer approval, call apply_replan with the returned version. Does NOT simulate changed availability."),
    "create_task": (LocalTaskCreate, "PROPOSE a task for explicit UI confirmation. Resolve subject/date/time first. Never executes during chat."),
    "update_task": (LocalTaskUpdate, "PROPOSE exact task changes, including completion/cancellation. Warn that closing a task can remove future manual reservations."),
    "create_availability": (AvailabilityCreate, "PROPOSE adding a dated availability window; explicit UI confirmation required."),
    "update_availability": (AvailabilityUpdate, "PROPOSE changing a window; explicit UI confirmation required."),
    "delete_availability": (AvailabilityDelete, "PROPOSE removing one window; explicit UI confirmation required. Generated work awaits separately approved replanning."),
    "generate_study_plan": (GeneratePlanRequest, "PROPOSE persisting scheduler allocations for an explicit horizon; UI confirmation required."),
    "apply_replan": (ReplanApply, "PROPOSE applying an actual preview's exact version. UI confirmation required; stale previews rejected."),
}
MUTATIONS = {"create_task","update_task","create_availability","update_availability","delete_availability","generate_study_plan","apply_replan"}

def declarations():
    return [{"name":name,"description":description,"parameters":schema.model_json_schema()} for name,(schema,description) in TOOLS.items()]

def parse(name, arguments, timezone="Europe/Budapest", *, stored=False):
    if name not in TOOLS: raise DomainError("This assistant tool is not available.")
    # Confirm revalidates the already canonical server-stored payload. It never
    # reparses UTC as local time, and never accepts a replacement client payload.
    if stored and name in {"create_task", "update_task"}:
        return (TaskCreate if name=="create_task" else TaskUpdate).model_validate(arguments)
    data=TOOLS[name][0].model_validate(arguments)
    if name in {"create_task","update_task"}:
        from datetime import datetime
        from app.services.time_rules import local_instant
        values=data.model_dump(exclude_unset=True)
        changes=values if name=="create_task" else values["changes"]
        if "deadline" in changes:
            try:
                local=datetime.fromisoformat(changes["deadline"])
            except ValueError:
                raise DomainError("Supply a valid local deadline as YYYY-MM-DDTHH:MM.") from None
            changes["deadline"]=local_instant(local.date(),local.time(),timezone)
        return (TaskCreate if name=="create_task" else TaskUpdate).model_validate(values)
    return data

def task_data(item, timezone="Europe/Budapest"):
    return TaskRead.model_validate(item).model_dump(mode="json",exclude={"description","created_at","updated_at"}) | {"remaining_minutes":minute_hours(item.remaining_hours), "deadline_local":item.deadline.astimezone(ZoneInfo(timezone)).isoformat()}

def risk_data(row, timezone):
    return row.model_dump(mode="json") | {"deadline_local":row.deadline.astimezone(ZoneInfo(timezone)).isoformat() if row.deadline else None}

def profile_context(db, timezone):
    profile = db.scalar(select(Profile))
    return {"display_name":profile.display_name if profile else "Student", "timezone":timezone,
            "current_local_time":now().astimezone(ZoneInfo(timezone)).isoformat()}

def read(db, name, data, timezone):
    current = now().astimezone(ZoneInfo(timezone)); today=current.date()
    if name == "get_profile_context": return profile_context(db,timezone)
    if name == "get_subjects":
        rows=list(db.scalars(select(Subject).order_by(Subject.name,Subject.id).limit(101)))
        return {"subjects":[{"id":str(s.id),"name":s.name} for s in rows[:100]],"truncated":len(rows)>100}
    if name == "get_task_details":
        item=required(db.get(Task,data.task_id),"Task")
        return task_data(item,timezone) | {"description":item.description[:1000]}
    if name in {"get_today_plan","get_week_plan"}:
        start=today if name=="get_today_plan" else today-timedelta(days=today.weekday())
        end=start if name=="get_today_plan" else start+timedelta(days=6)
        rows=list(db.execute(select(StudySession,Task,Subject).join(Task,StudySession.task_id==Task.id).join(Subject,Task.subject_id==Subject.id)
            .where(StudySession.date>=start,StudySession.date<=end).order_by(StudySession.date,StudySession.start_time).limit(101)))
        result={"date_from":str(start),"date_to":str(end),"sessions":[StudySessionRead.model_validate(s).model_dump(mode="json") | {"task_title":t.title,"subject_name":sub.name,"task":task_data(t,timezone)} for s,t,sub in rows[:100]],
            "total_planned_minutes":sum(s.planned_minutes for s,_,_ in rows[:100]),"truncated":len(rows)>100}
        if name=="get_today_plan":
            # A model may answer after this single tool. Supply the authoritative
            # context needed for today's recommendation, even with no sessions,
            # rather than relying on another optional provider tool selection.
            assessed=risk_engine.assess_all(db,timezone)
            risk_by_id={row.task_id:row for row in assessed.tasks}
            active=list(db.scalars(select(Task).where(Task.status.in_(["TODO","IN_PROGRESS"]))
                .order_by(Task.deadline,Task.id).limit(31)))
            result["active_tasks"]=[task_data(task,timezone) | {"risk":risk_data(risk_by_id[task.id],timezone)} for task in active[:30]]
            result["active_tasks_truncated"]=len(active)>30
        return result
    if name in {"get_tasks","get_deadlines","get_availability"}:
        check_range(data.date_from,data.date_to)
        model=Availability if name=="get_availability" else Task
        query=select(model)
        if model==Task and data.subject_id: query=query.where(Task.subject_id==data.subject_id)
        if model==Task and (name=="get_deadlines" or not data.include_inactive): query=query.where(Task.status.in_(["TODO","IN_PROGRESS"]))
        if data.date_to==date.max: raise DomainError("Choose a deadline range earlier than the final supported date.")
        if model==Availability and data.date_from is None and data.date_to is None:
            query=query.where(Availability.date>=today,Availability.date<=today+timedelta(days=31))
        # Local deadline date avoids UTC date shifts; bound the underlying semester
        # result before returning a page, and explicitly report truncation.
        if model==Availability:
            if data.date_from: query=query.where(Availability.date>=data.date_from)
            if data.date_to: query=query.where(Availability.date<=data.date_to)
            query=query.order_by(Availability.date,Availability.start_time)
        else:
            from datetime import datetime, time
            if data.date_from: query=query.where(Task.deadline>=datetime.combine(data.date_from,time.min,ZoneInfo(timezone)))
            if data.date_to: query=query.where(Task.deadline<datetime.combine(data.date_to+timedelta(days=1),time.min,ZoneInfo(timezone)))
            query=query.order_by(Task.deadline,Task.id)
        rows=list(db.scalars(query.offset(data.offset).limit(data.limit+1)))
        return {"items":[AvailabilityRead.model_validate(r).model_dump(mode="json") if model==Availability else task_data(r,timezone) for r in rows[:data.limit]],"has_more":len(rows)>data.limit,"next_offset":data.offset+data.limit}
    if name=="get_risks":
        assessed=risk_engine.assess_all(db,timezone)
        value=assessed.model_dump(mode="json")
        value["tasks"]=[risk_data(row,timezone) for row in assessed.tasks]
        return value
    if name=="get_subject_summary":
        subject=required(db.get(Subject,data.subject_id),"Subject")
        rows=list(db.scalars(select(Task).where(Task.subject_id==subject.id).order_by(Task.deadline).limit(101)))
        risks=risk_engine.assess_all(db,timezone)
        return {"subject":SubjectRead.model_validate(subject).model_dump(mode="json",exclude={"description","created_at","updated_at"}),
            "tasks":[task_data(t,timezone) for t in rows[:100]],"truncated":len(rows)>100,
            "risk":next((r.model_dump(mode="json") for r in risks.subjects if r.subject_id==subject.id),None)}
    if name=="assess_workload":
        from datetime import time
        from types import SimpleNamespace
        from sqlalchemy import inspect
        from app.services.time_rules import local_instant
        snapshot=replanning.load_snapshot(db)
        selected=set(data.task_ids) if data.task_ids is not None else {t.id for t in snapshot[0]}
        if not selected<={t.id for t in snapshot[0]}: raise DomainError("Selected task not found.",404)
        if data.date_to==date.max: raise DomainError("Choose an earlier planning end date.")
        end=local_instant(data.date_to+timedelta(days=1),time.min,timezone)
        # Deadline-capped copies, never ORM changes. This reuses the exact Risk
        # Engine accounting instead of mistaking next week's reservations for
        # completion capacity this week or adding non-additive shared slack.
        virtual=[]
        for task in snapshot[0]:
            values={column.key:getattr(task,column.key) for column in inspect(Task).columns}
            if task.id in selected: values["deadline"]=min(task.deadline,end)
            virtual.append(SimpleNamespace(**values))
        windows=[w for w in snapshot[2] if data.date_from<=w.date<=data.date_to]
        assessed=risk_engine.calculate_risks(virtual,snapshot[1],windows,snapshot[3],now(),timezone)
        rows=[row for row in assessed.tasks if row.task_id in selected]
        return {"date_from":str(data.date_from),"date_to":str(data.date_to),"evaluated_at":assessed.evaluated_at.isoformat(),
            "deadline_cap":end.isoformat(),"tasks":[risk_data(r,timezone) for r in rows],
            "unscheduled_minutes":sum(r.shortfall_minutes or 0 for r in rows),
            "fully_assessed":all(r.status!="unavailable" for r in rows),
            "warnings":[w.model_dump(mode="json") for w in assessed.warnings],"persisted":False,
            "scenario":"Finish selected work by the earlier of its saved deadline or the requested horizon end, using only entered availability in this range and preserving all existing reservations. These scenario risks do not replace saved-deadline assessments."}
    if name=="preview_replan": return replanning.preview(db,data,timezone).model_dump(mode="json")
    raise DomainError("This read-only tool is not available.")

def validate_proposal(db, name, data, timezone):
    payload=data.model_dump(mode="json",exclude_unset=True)
    summary={"action":name,"values":payload}
    if name=="create_task":
        subject=required(db.get(Subject,data.subject_id),"Subject")
        values=tasks.task_values(data.model_dump(exclude_none=True))
        payload=TaskCreate(**values).model_dump(mode="json")
        summary={"action":name,"subject":subject.name,"values":payload}
    elif name=="update_task":
        item=required(db.get(Task,data.task_id),"Task")
        if not data.changes.model_fields_set: raise DomainError("Specify at least one task change.")
        tasks.task_values(data.changes.model_dump(exclude_unset=True),item)
        if data.changes.subject_id: required(db.get(Subject,data.changes.subject_id),"Subject")
        summary |= {"task":item.title,"warning":"Completing or cancelling can remove future manual reservations; recorded history is preserved."}
    elif name in {"update_availability","delete_availability"}:
        item=required(db.get(Availability,data.availability_id),"Availability")
        summary |= {"current_window":AvailabilityRead.model_validate(item).model_dump(mode="json")}
    elif name=="apply_replan":
        if not data.evaluated_at<=now()<data.evaluated_at+replanning.TTL: raise DomainError("Replan preview expired. Request a new preview.",409)
        preview=replanning.calculate_replan(*replanning.load_snapshot(db),ReplanRequest(**data.model_dump(include={"date_from","date_to","task_ids"})),data.evaluated_at,timezone,owner_id=db.info["user_id"])
        if preview.fingerprint!=data.fingerprint or preview.plan_digest!=data.plan_digest: raise DomainError("Replan preview is stale. Request a new preview.",409)
        summary={"action":name,"preview":preview.model_dump(mode="json")}
    return payload,summary

def execute(db, name, payload, timezone):
    data=parse(name,payload,timezone,stored=True)
    if name=="create_task": return TaskRead.model_validate(tasks.create(db,data)).model_dump(mode="json")
    if name=="update_task": return TaskRead.model_validate(tasks.patch(db,data.task_id,data.changes,timezone)).model_dump(mode="json")
    if name=="create_availability": return AvailabilityRead.model_validate(availability.create(db,data,timezone)).model_dump(mode="json")
    if name=="update_availability": return AvailabilityRead.model_validate(availability.patch(db,data.availability_id,data.changes,timezone)).model_dump(mode="json")
    if name=="delete_availability":
        availability.remove(db,data.availability_id,timezone)
        return {"deleted":True,"id":str(data.availability_id)}
    if name=="generate_study_plan": return scheduler.generate(db,data,timezone).model_dump(mode="json")
    if name=="apply_replan": return replanning.apply(db,data,timezone).model_dump(mode="json")
    raise DomainError("This action is not available.")
