"""Mock HTTP only: retries never contact Gemini or the development database."""
import json
import logging
from datetime import UTC, datetime, timedelta
from email.utils import format_datetime
from types import SimpleNamespace
from uuid import UUID

import httpx
import pytest
from sqlalchemy import select

from app.ai import service
from app.ai.errors import ProviderError
from app.ai.providers import gemini
from app.ai.tools import planner_tools
from app.core.config import Settings
from app.models import AssistantAction


def answer(text="Grounded answer"):
    return {"candidates": [{"finishReason": "STOP", "content": {
        "role": "model", "parts": [{"text": text}]}}]}


def call(name, arguments):
    return {"candidates": [{"finishReason": "STOP", "content": {
        "role": "model", "parts": [{"functionCall": {
            "name": name, "args": arguments, "id": "call-1"},
            "thoughtSignature": "opaque-signature"}]}}]}


@pytest.fixture
def wire(monkeypatch, application):
    service._rates.clear()
    clock = SimpleNamespace(value=0.0, sleeps=[])
    def sleep(delay):
        clock.sleeps.append(delay)
        clock.value += delay
    monkeypatch.setattr(gemini, "time", SimpleNamespace(monotonic=lambda: clock.value, sleep=sleep))
    monkeypatch.setattr(gemini.random, "uniform", lambda low, high: 0.0)
    responses = []
    requests = []
    real_client = httpx.Client
    def handler(request):
        requests.append({"body": json.loads(request.content), "timeout": request.extensions["timeout"]})
        assert responses, "Unexpected provider request"
        response = responses.pop(0)
        if isinstance(response, Exception):
            raise response
        if callable(response):
            return response(request)
        if isinstance(response, int):
            return httpx.Response(response, text="SECRET upstream error body")
        return httpx.Response(200, json=response)
    monkeypatch.setattr(httpx, "Client", lambda **kwargs: real_client(transport=httpx.MockTransport(handler), **kwargs))
    provider = gemini.GeminiProvider(Settings(_env_file=None, ai_model="manually-configured-model", gemini_api_key="SECRET-test-api-key"))
    application.dependency_overrides[service.get_provider] = lambda: provider
    def generate(timeout=15):
        return provider.generate("SECRET system context", [{"role": "user", "content": "SECRET prompt"}], [], [], [], timeout)
    return SimpleNamespace(responses=responses, requests=requests, clock=clock, generate=generate)


@pytest.mark.parametrize("failures,delays", [(1, [0.8]), (2, [0.8, 1.6])])
def test_503_retries_then_success_with_identical_payload(wire, failures, delays):
    wire.responses.extend([503] * failures + [answer()])
    assert wire.generate().text == "Grounded answer"
    assert wire.clock.sleeps == delays
    assert len(wire.requests) == failures + 1
    assert all(request["body"] == wire.requests[0]["body"] for request in wire.requests)
    assert wire.requests[-1]["timeout"]["read"] == pytest.approx(15 - sum(delays))


def test_retry_limit_returns_normalized_safe_error_and_logs_no_secrets(wire, caplog):
    wire.responses.extend([503] * 3)
    with caplog.at_level(logging.WARNING, logger=gemini.__name__), pytest.raises(ProviderError) as exc:
        wire.generate()
    assert exc.value.category == "transient_unavailable" and exc.value.status_code == 503
    assert "Your planner data is unchanged" in exc.value.detail
    assert "SECRET" not in exc.value.detail + caplog.text
    records = [record for record in caplog.records if record.name == gemini.__name__]
    assert [record.attempt for record in records] == [1, 2, 3]
    assert all(record.provider == "gemini" and record.model == "manually-configured-model" for record in records)
    assert all(record.error_type == "transient_unavailable" and record.upstream_status == 503 for record in records)
    assert [record.retrying for record in records] == [True, True, False]
    assert len(wire.requests) == 3


@pytest.mark.parametrize("failure", [httpx.ReadTimeout("SECRET"), httpx.ConnectError("SECRET"),
    httpx.ReadError("connection reset SECRET"), httpx.WriteError("connection reset SECRET"), httpx.RemoteProtocolError("SECRET")])
def test_transport_failure_then_success(wire, failure):
    wire.responses.extend([failure, answer()])
    assert wire.generate().text == "Grounded answer"
    assert wire.clock.sleeps == [0.8]


@pytest.mark.parametrize("status", [500, 502, 504])
def test_transient_http_statuses_retry(wire, status):
    wire.responses.extend([status, answer()])
    assert wire.generate().text == "Grounded answer"
    assert len(wire.requests) == 2


def test_timeouts_are_bounded_and_classified(wire):
    wire.responses.extend([httpx.ReadTimeout("SECRET")] * 3)
    with pytest.raises(ProviderError) as exc:
        wire.generate()
    assert exc.value.category == "timeout" and exc.value.status_code == 504
    assert len(wire.requests) == 3


def test_real_deadline_exhaustion_does_not_restart_timeout_budget(wire):
    def timeout(request):
        wire.clock.value += request.extensions["timeout"]["read"]
        raise httpx.ReadTimeout("SECRET")
    wire.responses.append(timeout)
    with pytest.raises(ProviderError) as exc:
        wire.generate(timeout=1)
    assert exc.value.category == "timeout"
    assert len(wire.requests) == 1 and wire.clock.sleeps == []


def test_short_remaining_budget_does_not_sleep_or_retry(wire):
    wire.responses.append(503)
    with pytest.raises(ProviderError):
        wire.generate(timeout=0.8)
    assert len(wire.requests) == 1 and not wire.clock.sleeps


def test_429_respects_retry_after(wire):
    wire.responses.extend([lambda request: httpx.Response(429, headers={"Retry-After": "3"}), answer()])
    assert wire.generate().text == "Grounded answer"
    assert wire.clock.sleeps == [3]


def test_429_without_retry_after_uses_slower_bounded_backoff(wire):
    wire.responses.extend([429, 429, answer()])
    assert wire.generate().text == "Grounded answer"
    assert wire.clock.sleeps == [2, 4]


def test_429_retry_limit_remains_rate_limited(wire):
    wire.responses.extend([429] * 3)
    with pytest.raises(ProviderError) as exc:
        wire.generate()
    assert exc.value.category == "rate_limited" and exc.value.status_code == 429
    assert wire.clock.sleeps == [2, 4]


@pytest.mark.parametrize("delay,timeout", [(120, 15), (3, 2)])
def test_retry_after_never_shortened_to_hammer_rate_limit(wire, delay, timeout):
    wire.responses.append(lambda request: httpx.Response(429, headers={"Retry-After": str(delay)}))
    with pytest.raises(ProviderError) as exc:
        wire.generate(timeout)
    assert exc.value.category == "rate_limited"
    assert len(wire.requests) == 1 and not wire.clock.sleeps


def test_http_date_retry_after_and_invalid_headers(monkeypatch):
    fixed = datetime(2026, 11, 19, 12, tzinfo=UTC)
    monkeypatch.setattr(gemini, "datetime", SimpleNamespace(now=lambda timezone: fixed))
    header = format_datetime(fixed + timedelta(seconds=4), usegmt=True)
    assert gemini.retry_after_seconds(header) == 4
    for value in [None, "invalid", "-1", "nan", "inf"]:
        assert gemini.retry_after_seconds(value) is None


def test_small_jitter_is_added(wire, monkeypatch):
    monkeypatch.setattr(gemini.random, "uniform", lambda low, high: 0.1)
    wire.responses.extend([503, 503, answer()])
    wire.generate()
    assert wire.clock.sleeps == pytest.approx([0.9, 1.7])


@pytest.mark.parametrize("status,category", [(400, "invalid_request"), (401, "authentication_error"),
    (403, "authentication_error"), (404, "invalid_request"), (422, "invalid_request"), (501, "provider_error")])
def test_non_retryable_statuses_never_repeat_or_sign_user_out(wire, status, category):
    wire.responses.append(status)
    with pytest.raises(ProviderError) as exc:
        wire.generate()
    assert exc.value.category == category and exc.value.status_code == 503
    assert len(wire.requests) == 1 and not wire.clock.sleeps


def test_missing_configuration_is_non_retryable(wire):
    with pytest.raises(ProviderError) as exc:
        gemini.GeminiProvider(Settings(_env_file=None, ai_model="", gemini_api_key=None))
    assert exc.value.category == "authentication_error"
    assert not wire.requests


@pytest.mark.parametrize("response", [{"candidates": []}, call("get_tasks", "malformed arguments"), {"not": "a candidate"}])
def test_malformed_model_output_is_not_retried(wire, response):
    wire.responses.append(response)
    with pytest.raises(ProviderError) as exc:
        wire.generate()
    assert exc.value.category == "provider_error"
    assert len(wire.requests) == 1 and not wire.clock.sleeps


def send(client):
    return client.post("/api/assistant/message", json={"message": "Review my real planner"})


def test_read_tool_not_reexecuted_when_followup_model_request_retries(client, wire, task, monkeypatch):
    wire.responses.extend([503, call("get_tasks", {}), 503, answer()])
    reads = []
    original = planner_tools.read
    def read(*args):
        reads.append(args[1])
        return original(*args)
    monkeypatch.setattr(planner_tools, "read", read)
    before = client.get("/api/tasks").json()
    response = send(client)
    assert response.status_code == 200, response.text
    assert reads == ["get_tasks"]
    assert wire.requests[2]["body"] == wire.requests[3]["body"]
    content = wire.requests[3]["body"]["contents"]
    assert content[1]["parts"][0]["thoughtSignature"] == "opaque-signature"
    assert content[2]["parts"][0]["functionResponse"]["id"] == "call-1"
    assert client.get("/api/tasks").json() == before


def test_invalid_tool_validation_does_not_retry_provider_or_call_tool(client, wire, monkeypatch):
    wire.responses.extend([call("get_tasks", {"limit": -1}), answer()])
    monkeypatch.setattr(planner_tools, "read", lambda *args: pytest.fail("Invalid tool executed"))
    assert send(client).status_code == 200
    assert len(wire.requests) == 2 and not wire.clock.sleeps
    assert "error" in wire.requests[1]["body"]["contents"][-1]["parts"][0]["functionResponse"]["response"]


@pytest.mark.parametrize("kind", ["create_task", "apply_replan"])
def test_retry_proposal_confirm_receipt_and_later_provider_failure_are_exactly_once(client, wire, subject, task, window, kind, db_factory):
    if kind == "create_task":
        args = {"title": "Confirmed once", "subject_id": subject["id"], "estimated_hours": 3, "deadline": "2099-01-09T17:00"}
        path = "/api/tasks"
    else:
        scope = {"date_from": window["date"], "date_to": window["date"]}
        preview = client.post("/api/planner/replan/preview", json=scope).json()
        args = scope | {key: preview[key] for key in ["evaluated_at", "fingerprint", "plan_digest"]}
        path = "/api/study-sessions"
    before = client.get(path).json()
    wire.responses.extend([503, call(kind, args)])
    proposal = send(client)
    assert proposal.status_code == 200, proposal.text
    pending = proposal.json()["confirmation"]
    assert client.get(path).json() == before
    with db_factory() as db:
        assert len(list(db.scalars(select(AssistantAction)))) == 1
    confirm_path = f"/api/assistant/actions/{pending['id']}/confirm"
    receipt = client.post(confirm_path, json={})
    assert receipt.status_code == 200, receipt.text
    after = client.get(path).json()
    assert len(after) > len(before)
    assert len(wire.requests) == 2  # Confirm never invokes a provider.
    wire.responses.extend([503] * 3)
    assert send(client).status_code == 503
    assert client.get(path).json() == after
    assert client.post(confirm_path, json={}).json() == receipt.json()
    assert client.get(path).json() == after
    with db_factory() as db:
        assert db.get(AssistantAction, UUID(pending["id"])).status == "CONFIRMED"


def test_frontend_receives_only_normalized_safe_provider_error(client, wire):
    wire.responses.extend([503] * 3)
    response = send(client)
    assert response.status_code == 503
    assert response.json() == {"detail": "AI Assistant is unavailable. Your planner data is unchanged. Gemini is temporarily unavailable. Try again in a moment."}
    assert "SECRET" not in response.text


def test_interrupted_response_cannot_publish_a_tool_or_duplicate_a_proposal(client, wire, subject, db_factory):
    proposal = call("create_task", {"title": "Exactly one proposal", "subject_id": subject["id"],
        "estimated_hours": 1, "deadline": "2099-01-09T17:00"})
    class InterruptedStream(httpx.SyncByteStream):
        def __iter__(self):
            yield json.dumps(proposal).encode()
            raise httpx.ReadError("SECRET interrupted response")
    wire.responses.extend([lambda request: httpx.Response(200, stream=InterruptedStream()), proposal])
    response = send(client)
    assert response.status_code == 200, response.text
    assert response.json()["confirmation"] is not None
    assert len(wire.requests) == 2
    assert client.get("/api/tasks").json() == []
    with db_factory() as db:
        assert len(list(db.scalars(select(AssistantAction)))) == 1
