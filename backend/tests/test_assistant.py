"""Offline assistant contracts. All data uses isolated SQLite, never Gemini/Supabase."""
from datetime import timedelta
from uuid import UUID, uuid4
import json
import pytest
from sqlalchemy import select
from app.ai import service
from app.ai.base import Generation, ToolCall
from app.ai.tools import planner_tools
from app.core.auth import Principal, get_current_user
from app.core.exceptions import DomainError
from app.models import AssistantAction, Task, Subject
from app.services.common import now
TEST_USER = UUID("11111111-1111-4111-8111-111111111111")

class FakeProvider:
    name="fake"
    model="offline-test"
    def __init__(self, calls=None, failure=None): self.calls=calls or [];self.failure=failure;self.requests=[]
    def generate(self, system, history, tools, continuation, results, timeout):
        self.requests.append(dict(system=system,history=history,tools=tools,results=results))
        if self.failure: raise self.failure
        if len(self.requests)<=len(self.calls): return Generation(calls=self.calls[len(self.requests)-1],continuation=[])
        return Generation(text="Answer grounded in the tool result.")

@pytest.fixture(autouse=True)
def clear_rate():
    service._rates.clear()

@pytest.fixture
def fake(application):
    provider=FakeProvider()
    application.dependency_overrides[service.get_provider]=lambda:provider
    return provider

def send(client): return client.post("/api/assistant/message",json={"message":"What should I study?"})
def propose(client,fake,kind,args):
    fake.calls=[[ToolCall(kind,args)]]
    response=send(client)
    assert response.status_code==200,response.text
    return response.json()["confirmation"]
def create_args(subject): return {"title":"Presentation","subject_id":subject["id"],"estimated_hours":3,"deadline":"2099-01-09T17:00","priority":"HIGH"}

def test_missing_token(application,client,fake):
    application.dependency_overrides.pop(get_current_user)
    assert send(client).status_code==401

def test_invalid_token(application,client,fake):
    application.dependency_overrides.pop(get_current_user)
    assert client.post("/api/assistant/message",json={"message":"Hi"},headers={"Authorization":"Bearer invalid"}).status_code==401

@pytest.mark.parametrize("name,args",[("get_profile_context",{}),("get_subjects",{}),("get_today_plan",{}),("get_week_plan",{}),("get_tasks",{}),("get_deadlines",{}),("get_availability",{}),("get_risks",{})])
def test_read_tools(client,fake,task,name,args):
    before=client.get("/api/tasks").json()
    fake.calls=[[ToolCall(name,args)]]
    response=send(client)
    assert response.status_code==200,response.text
    assert fake.requests[-1]["results"][0]["name"]==name
    assert client.get("/api/tasks").json()==before
    assert response.json()["metadata"]["planner_changed"] is False

def test_details_and_subject(client,fake,task,subject):
    fake.calls=[[ToolCall("get_task_details",{"task_id":task["id"]}),ToolCall("get_subject_summary",{"subject_id":subject["id"]})]]
    assert send(client).status_code==200
    results=fake.requests[-1]["results"]
    assert results[0]["result"]["title"]==task["title"]
    assert results[0]["result"]["remaining_minutes"]==300
    assert "user_id" not in json.dumps(results)

def test_multistep_and_duplicate_reads(client,fake,task,monkeypatch):
    original=planner_tools.read;calls=[]
    def spy(*args): calls.append(args[1]);return original(*args)
    monkeypatch.setattr(planner_tools,"read",spy)
    fake.calls=[[ToolCall("get_tasks",{})],[ToolCall("get_tasks",{}),ToolCall("get_risks",{})]]
    assert send(client).status_code==200
    assert calls==["get_tasks","get_risks"]
    assert len(fake.requests)==3

def test_round_limit(client,fake):
    fake.calls=[[ToolCall("get_tasks",{})]]*10
    response=send(client)
    assert response.status_code==503
    assert "tool limit" in response.json()["detail"]
    assert len(fake.requests)==6

@pytest.mark.parametrize("args",[{"user_id":str(TEST_USER)},{"limit":10000},{"subject_id":"not-a-uuid"}])
def test_malformed_tools_never_execute(client,fake,args):
    fake.calls=[[ToolCall("get_tasks",args)]]
    assert send(client).status_code==200
    assert "error" in fake.requests[-1]["results"][0]["result"]

@pytest.mark.parametrize("failure",[TimeoutError("secret provider body"),DomainError("AI timed out. Data unchanged.",504)])
def test_provider_failure(client,fake,failure):
    fake.failure=failure
    response=send(client)
    assert response.status_code in {503,504}
    assert "secret provider body" not in response.text

def test_confirmation_exact_atomic_and_replay(client,fake,subject):
    before=client.get("/api/tasks").json()
    pending=propose(client,fake,"create_task",create_args(subject))
    assert client.get("/api/tasks").json()==before
    path=f"/api/assistant/actions/{pending['id']}/confirm"
    response=client.post(path,json={})
    assert response.status_code==200,response.text
    result=response.json()["result"]
    assert result["title"]=="Presentation" and result["estimated_hours"]==3
    assert result["deadline"]=="2099-01-09T16:00:00Z"
    assert client.post(path,json={}).json()==response.json()
    assert len(client.get("/api/tasks").json())==len(before)+1

def test_client_cannot_modify_confirmation(client,fake,subject):
    pending=propose(client,fake,"create_task",create_args(subject))
    assert client.post(f"/api/assistant/actions/{pending['id']}/confirm",json={"title":"Tampered"}).status_code==422
    assert client.get("/api/tasks").json()==[]

def test_expired(client,fake,subject,db_factory):
    pending=propose(client,fake,"create_task",create_args(subject))
    with db_factory() as db:
        db.get(AssistantAction,UUID(pending["id"])).expires_at=now()-timedelta(seconds=1);db.commit()
    assert client.post(f"/api/assistant/actions/{pending['id']}/confirm",json={}).status_code==409
    assert client.get("/api/tasks").json()==[]

def test_stale_action(client,fake,subject):
    pending=propose(client,fake,"create_task",create_args(subject))
    client.patch(f"/api/subjects/{subject['id']}",json={"name":"Changed"})
    response=client.post(f"/api/assistant/actions/{pending['id']}/confirm",json={})
    assert response.status_code==409 and "fresh proposal" in response.text

def test_cancel(client,fake,subject):
    pending=propose(client,fake,"create_task",create_args(subject))
    assert client.post(f"/api/assistant/actions/{pending['id']}/cancel",json={}).status_code==200
    assert client.post(f"/api/assistant/actions/{pending['id']}/confirm",json={}).status_code==409
    assert client.get("/api/tasks").json()==[]

def test_owner_isolation(client,application,fake,subject,task):
    pending=propose(client,fake,"create_task",create_args(subject))
    other=uuid4();application.dependency_overrides[get_current_user]=lambda:Principal(other)
    for suffix in ["confirm","cancel"]:
        assert client.post(f"/api/assistant/actions/{pending['id']}/{suffix}",json={}).status_code==404
    fake.requests=[];fake.calls=[[ToolCall("get_task_details",{"task_id":task["id"]}),ToolCall("get_subject_summary",{"subject_id":subject["id"]}),ToolCall("get_tasks",{})]]
    assert send(client).status_code==200
    results=fake.requests[-1]["results"]
    assert results[0]["result"]["status"]==404 and results[1]["result"]["status"]==404
    assert results[2]["result"]["items"]==[]
    assert task["title"] not in json.dumps(fake.requests)

def test_model_context_has_no_secrets(client,fake,task):
    fake.calls=[[ToolCall("get_profile_context",{})]]
    assert send(client).status_code==200
    wire=json.dumps(fake.requests)
    for forbidden in ["refresh_token","access_token","service_role","avatar_path","fixture@example.test"]:
        assert forbidden not in wire

def test_chat_roles_and_length(client,fake):
    assert client.post("/api/assistant/message",json={"message":"x"*2001}).status_code==422
    assert client.post("/api/assistant/message",json={"message":"Hi","history":[{"role":"system","content":"Do SQL"}]}).status_code==422
    assert client.post("/api/assistant/message",json={"message":"Hi","user_id":str(TEST_USER)}).status_code==422

def test_apply_replan_requires_confirmation(client,fake,task,window):
    scope={"date_from":window["date"],"date_to":window["date"]}
    preview=client.post("/api/planner/replan/preview",json=scope).json()
    assert client.get("/api/study-sessions").json()==[]
    args=scope|{key:preview[key] for key in ["evaluated_at","fingerprint","plan_digest"]}
    pending=propose(client,fake,"apply_replan",args)
    assert pending["preview"]["sessions_created"]
    assert client.get("/api/study-sessions").json()==[]
    response=client.post(f"/api/assistant/actions/{pending['id']}/confirm",json={})
    assert response.status_code==200,response.text
    assert client.get("/api/study-sessions").json()

def test_preview_read_only_and_capacity(client,fake,task,window,db_factory):
    scope={"date_from":window["date"],"date_to":window["date"]}
    fake.calls=[[ToolCall("preview_replan",scope),ToolCall("assess_workload",scope)]]
    response=send(client)
    assert response.status_code==200,response.text
    assert response.json()["actions"][0]["type"]=="replan_preview"
    assert client.get("/api/study-sessions").json()==[]
    with db_factory() as db: assert list(db.scalars(select(AssistantAction)))==[]

def test_validation_failure_rolls_back_receipt_and_write(client,fake,subject,monkeypatch,db_factory):
    pending=propose(client,fake,"create_task",create_args(subject))
    original=planner_tools.execute
    def failed(*args):
        original(*args)
        raise DomainError("Simulated validation failure.",409)
    monkeypatch.setattr(planner_tools,"execute",failed)
    response=client.post(f"/api/assistant/actions/{pending['id']}/confirm",json={})
    assert response.status_code==409
    assert client.get("/api/tasks").json()==[]
    with db_factory() as db: assert db.get(AssistantAction,UUID(pending["id"])).status=="PENDING"

def test_proposal_unknown_foreign_subject(client,fake):
    fake.calls=[[ToolCall("create_task",create_args({"id":str(uuid4())}))]]
    assert send(client).json()["confirmation"] is None
    assert fake.requests[-1]["results"][0]["result"]["status"]==404

def test_rate_limit(client,fake):
    for _ in range(10): assert send(client).status_code==200
    assert send(client).status_code==429



def test_gemini_wire_preserves_signatures_ids_and_server_only_key(monkeypatch):
    import httpx
    from app.ai.providers.gemini import GeminiProvider
    from app.core.config import Settings
    real_client=httpx.Client;requests=[]
    signed={"role":"model","parts":[{"functionCall":{"name":"get_tasks","args":{},"id":"call-1"},"thoughtSignature":"opaque-signature"}]}
    def handler(request):
        body=json.loads(request.content);requests.append(body)
        assert request.headers["x-goog-api-key"]=="fake-server-key"
        assert "fake-server-key" not in request.url.query.decode()
        return httpx.Response(200,json={"candidates":[{"finishReason":"STOP","content":signed if len(requests)==1 else {"role":"model","parts":[{"text":"Grounded answer"}]}}]})
    monkeypatch.setattr(httpx,"Client",lambda **kwargs:real_client(transport=httpx.MockTransport(handler),**kwargs))
    provider=GeminiProvider(Settings(_env_file=None,ai_model="configured-model",gemini_api_key="fake-server-key"))
    history=[{"role":"user","content":"Today?"}]
    first=provider.generate("system",history,planner_tools.declarations(),[],[],10)
    assert first.calls[0].name=="get_tasks"
    second=provider.generate("system",history,planner_tools.declarations(),first.continuation,[{"name":"get_tasks","id":"call-1","result":{"items":[]}}],10)
    assert second.text=="Grounded answer"
    assert requests[1]["contents"][1]==signed
    assert requests[1]["contents"][2]["parts"][0]["functionResponse"]["id"]=="call-1"

@pytest.mark.parametrize("status",[429,500,400])
def test_gemini_sanitizes_provider_errors(monkeypatch,status):
    import httpx
    from app.ai.providers.gemini import GeminiProvider
    from app.core.config import Settings
    real_client=httpx.Client
    monkeypatch.setattr(httpx,"Client",lambda **kwargs:real_client(transport=httpx.MockTransport(lambda request:httpx.Response(status,text="private raw provider content")),**kwargs))
    provider=GeminiProvider(Settings(_env_file=None,ai_model="configured-model",gemini_api_key="fake-key"))
    with pytest.raises(DomainError) as exc: provider.generate("system",[],[],[],[],10)
    assert exc.value.status_code==(429 if status==429 else 503)
    assert "private raw" not in exc.value.detail

def test_gemini_timeout_and_malformed_response(monkeypatch):
    import httpx
    from app.ai.providers.gemini import GeminiProvider
    from app.core.config import Settings
    real_client=httpx.Client
    def fail(request): raise httpx.ReadTimeout("private",request=request)
    monkeypatch.setattr(httpx,"Client",lambda **kwargs:real_client(transport=httpx.MockTransport(fail),**kwargs))
    provider=GeminiProvider(Settings(_env_file=None,ai_model="configured-model",gemini_api_key="fake-key"))
    with pytest.raises(DomainError) as exc: provider.generate("system",[],[],[],[],10)
    assert exc.value.status_code==504
    monkeypatch.setattr(httpx,"Client",lambda **kwargs:real_client(transport=httpx.MockTransport(lambda request:httpx.Response(200,json={"candidates":[]})),**kwargs))
    with pytest.raises(DomainError): provider.generate("system",[],[],[],[],10)

def test_missing_configuration_fails_closed(client,application):
    application.dependency_overrides.pop(service.get_provider,None)
    assert send(client).status_code==503
    assert client.get("/api/tasks").json()==[]

def test_update_and_availability_tools_are_confirmed_only(client,fake,task):
    pending=propose(client,fake,"update_task",{"task_id":task["id"],"changes":{"progress":25}})
    assert client.get(f"/api/tasks/{task['id']}").json()["progress"]==0
    assert client.post(f"/api/assistant/actions/{pending['id']}/confirm",json={}).status_code==200
    assert client.get(f"/api/tasks/{task['id']}").json()["progress"]==25
    fake.requests=[]
    pending=propose(client,fake,"create_availability",{"date":"2099-01-05","start_time":"18:00","end_time":"20:00"})
    assert client.get("/api/availability").json()==[]
    response=client.post(f"/api/assistant/actions/{pending['id']}/confirm",json={})
    assert response.status_code==200,response.text
    window=response.json()["result"]
    fake.requests=[]
    pending=propose(client,fake,"update_availability",{"availability_id":window["id"],"changes":{"end_time":"21:00"}})
    assert client.post(f"/api/assistant/actions/{pending['id']}/confirm",json={}).status_code==200
    fake.requests=[]
    pending=propose(client,fake,"delete_availability",{"availability_id":window["id"]})
    assert client.post(f"/api/assistant/actions/{pending['id']}/confirm",json={}).status_code==200
    assert client.get("/api/availability").json()==[]

def test_scheduler_tool_uses_existing_policy_and_current_owner(client,fake,task,window):
    before=client.get(f"/api/tasks/{task['id']}").json()
    pending=propose(client,fake,"generate_study_plan",{"date_from":window["date"],"date_to":window["date"]})
    assert client.get("/api/study-sessions").json()==[]
    response=client.post(f"/api/assistant/actions/{pending['id']}/confirm",json={})
    assert response.status_code==200,response.text
    assert response.json()["result"]["created_count"]==4
    assert client.get(f"/api/tasks/{task['id']}").json()==before

def test_replan_becomes_stale_after_proposal(client,fake,task,window):
    scope={"date_from":window["date"],"date_to":window["date"]}
    preview=client.post("/api/planner/replan/preview",json=scope).json()
    pending=propose(client,fake,"apply_replan",scope|{key:preview[key] for key in ["evaluated_at","fingerprint","plan_digest"]})
    client.patch(f"/api/tasks/{task['id']}",json={"priority":"LOW"})
    response=client.post(f"/api/assistant/actions/{pending['id']}/confirm",json={})
    assert response.status_code==409
    assert client.get("/api/study-sessions").json()==[]


def test_workload_does_not_count_next_weeks_reservations_for_this_week(client,fake,task,window):
    session=client.post("/api/study-sessions",json={"task_id":task["id"],"date":window["date"],"start_time":"17:00","end_time":"18:00"})
    assert session.status_code==201
    # No capacity exists in the requested previous week, even though this task
    # has future reservations. The canonical Risk Engine must report a shortfall.
    fake.calls=[[ToolCall("assess_workload",{"date_from":"2098-12-29","date_to":"2099-01-04"})]]
    before=client.get(f"/api/tasks/{task['id']}").json()
    assert send(client).status_code==200
    result=fake.requests[-1]["results"][0]["result"]
    assert result["unscheduled_minutes"]==300
    assert result["tasks"][0]["scheduled_minutes"]==0
    assert result["persisted"] is False
    assert client.get(f"/api/tasks/{task['id']}").json()==before


def test_gemini_normalizes_plain_history_after_confirmation_receipts(monkeypatch):
    import httpx
    from app.ai.providers.gemini import GeminiProvider
    from app.core.config import Settings
    real_client=httpx.Client;bodies=[]
    def handler(request):
        bodies.append(json.loads(request.content))
        return httpx.Response(200,json={"candidates":[{"finishReason":"STOP","content":{"role":"model","parts":[{"text":"Clarification"}]}}]})
    monkeypatch.setattr(httpx,"Client",lambda **kwargs:real_client(transport=httpx.MockTransport(handler),**kwargs))
    provider=GeminiProvider(Settings(_env_file=None,ai_model="configured-model",gemini_api_key="fake-key"))
    history=[{"role":"assistant","content":"Trimmed old answer"},{"role":"user","content":"Create task"},{"role":"assistant","content":"Proposal"},{"role":"assistant","content":"Change saved"},{"role":"user","content":"Now replan"}]
    provider.generate("system",history,planner_tools.declarations(),[],[],10)
    assert [m["role"] for m in bodies[0]["contents"]]==["user","model","user"]
    assert len(bodies[0]["contents"][1]["parts"])==2


def test_today_and_week_return_actual_owned_session_context(client,fake,study_session,task,subject,monkeypatch):
    from datetime import datetime,UTC
    monkeypatch.setattr(planner_tools,"now",lambda:datetime(2099,1,5,8,tzinfo=UTC))
    fake.calls=[[ToolCall("get_today_plan",{}),ToolCall("get_week_plan",{})]]
    assert send(client).status_code==200
    for value in fake.requests[-1]["results"]:
        assert value["result"]["sessions"][0]["id"]==study_session["id"]
        assert value["result"]["sessions"][0]["task_title"]==task["title"]
        assert value["result"]["sessions"][0]["subject_name"]==subject["name"]
        assert value["result"]["total_planned_minutes"]==60
        assert value["result"]["sessions"][0]["task"]["priority"]=="HIGH"
        if value["name"]=="get_today_plan":
            focus=value["result"]["active_tasks"][0]
            assert focus["remaining_minutes"]==300
            assert focus["risk"]["task_id"]==task["id"]
            assert focus["risk"]["explanation"]


def test_no_arbitrary_sql_tool(client,fake,task):
    before=client.get("/api/tasks").json()
    fake.calls=[[ToolCall("execute_sql",{"sql":"DELETE FROM tasks"})]]
    assert send(client).status_code==200
    assert "not available" in fake.requests[-1]["results"][0]["result"]["error"]
    assert client.get("/api/tasks").json()==before


@pytest.mark.parametrize("local,utc",[("2099-01-09T18:00","2099-01-09T17:00:00+00:00"),("2099-07-09T18:00","2099-07-09T16:00:00+00:00")])
def test_tool_deadline_conversion_is_backend_owned(subject,local,utc):
    args=create_args(subject)|{"deadline":local}
    parsed=planner_tools.parse("create_task",args)
    assert parsed.deadline.isoformat()==utc
    # Exact stored UTC payload is never shifted again on confirmation.
    restored=planner_tools.parse("create_task",parsed.model_dump(mode="json"),stored=True)
    assert restored.deadline==parsed.deadline

@pytest.mark.parametrize("value",["2099-01-09T18:00Z","2099-01-09T18:00:00+01:00"])
def test_tool_rejects_model_computed_utc_offsets(subject,value):
    from pydantic import ValidationError
    with pytest.raises(ValidationError):planner_tools.parse("create_task",create_args(subject)|{"deadline":value})

@pytest.mark.parametrize("value",["2026-03-29T02:30","2026-10-25T02:30"])
def test_tool_deadline_reuses_canonical_dst_rejection(subject,value):
    with pytest.raises(DomainError):planner_tools.parse("create_task",create_args(subject)|{"deadline":value})

def test_update_tool_local_deadline_uses_same_conversion(task):
    parsed=planner_tools.parse("update_task",{"task_id":task["id"],"changes":{"deadline":"2099-07-09T18:00"}})
    assert parsed.changes.deadline.isoformat()=="2099-07-09T16:00:00+00:00"


def test_read_tools_supply_backend_resolved_local_deadlines(client,fake,task):
    fake.calls=[[ToolCall("get_task_details",{"task_id":task["id"]}),ToolCall("get_risks",{})]]
    assert send(client).status_code==200
    values=fake.requests[-1]["results"]
    assert values[0]["result"]["deadline_local"]=="2099-12-31T23:59:00+01:00"
    row=next(r for r in values[1]["result"]["tasks"] if r["task_id"]==task["id"])
    assert row["deadline_local"]=="2099-12-31T23:59:00+01:00"

def test_ui_can_propose_exact_preview_without_another_llm_turn(client,task,window,fake):
    scope={"date_from":window["date"],"date_to":window["date"]}
    preview=client.post("/api/planner/replan/preview",json=scope).json()
    args=scope|{key:preview[key] for key in ["evaluated_at","fingerprint","plan_digest"]}
    response=client.post("/api/assistant/replan/propose",json=args)
    assert response.status_code==200,response.text
    assert response.json()["confirmation"]["type"]=="apply_replan"
    assert fake.requests==[]
    assert client.get("/api/study-sessions").json()==[]
    pending=response.json()["confirmation"]
    assert client.post(f"/api/assistant/actions/{pending['id']}/confirm",json={}).status_code==200
    assert client.get("/api/study-sessions").json()

def test_ui_preview_proposal_rejects_tampered_or_stale_versions(client,task,window):
    scope={"date_from":window["date"],"date_to":window["date"]}
    preview=client.post("/api/planner/replan/preview",json=scope).json()
    args=scope|{key:preview[key] for key in ["evaluated_at","fingerprint","plan_digest"]}
    assert client.post("/api/assistant/replan/propose",json=args|{"plan_digest":"a"*64}).status_code==409
    client.patch(f"/api/tasks/{task['id']}",json={"priority":"LOW"})
    assert client.post("/api/assistant/replan/propose",json=args).status_code==409
    assert client.get("/api/study-sessions").json()==[]
