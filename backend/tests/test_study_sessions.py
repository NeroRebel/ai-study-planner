from uuid import uuid4
import pytest


def test_session_crud_and_filters(client, study_session, task):
    assert study_session["planned_minutes"] == 60
    for params in ({"task_id": task["id"]}, {"status": "PLANNED"}, {"date_from": "2099-01-05", "date_to": "2099-01-05"}):
        assert client.get("/api/study-sessions", params=params).json()[0]["id"] == study_session["id"]
    assert client.get("/api/study-sessions/" + study_session["id"]).status_code == 200
    patched = client.patch("/api/study-sessions/" + study_session["id"], json={"start_time": "18:00", "end_time": "19:30"})
    assert patched.status_code == 200 and patched.json()["planned_minutes"] == 90
    assert client.delete("/api/study-sessions/" + study_session["id"]).status_code == 204
    assert client.get("/api/study-sessions/" + study_session["id"]).status_code == 404


def test_invalid_task(client):
    assert client.post("/api/study-sessions", json={"task_id": str(uuid4()), "date": "2099-01-05", "start_time": "17:00", "end_time": "18:00"}).status_code == 404


def test_overlap_rejection_and_adjacency(client, study_session, task):
    payload = {"task_id": task["id"], "date": "2099-01-05", "start_time": "17:30", "end_time": "18:30"}
    response = client.post("/api/study-sessions", json=payload)
    assert response.status_code == 409 and "overlaps" in response.json()["detail"]
    payload.update(start_time="18:00", end_time="19:00")
    assert client.post("/api/study-sessions", json=payload).status_code == 201


@pytest.mark.parametrize("change", [
    {"end_time": "16:00"}, {"completed_minutes": -1}, {"completed_minutes": 61},
    {"planned_minutes": 30}, {"status": "COMPLETED", "completed_minutes": 30},
    {"status": "PLANNED", "completed_minutes": 5},
    {"status": "PARTIALLY_COMPLETED", "completed_minutes": 0},
])
def test_invalid_session_values(client, task, window, change):
    payload = {"task_id": task["id"], "date": window["date"], "start_time": "17:00", "end_time": "18:00"}
    payload.update(change)
    assert client.post("/api/study-sessions", json=payload).status_code == 422


def test_closed_tasks_and_capacity(client, task, window):
    assert client.patch("/api/tasks/" + task["id"], json={"remaining_hours": 0.5}).status_code == 200
    payload = {"task_id": task["id"], "date": window["date"], "start_time": "17:00", "end_time": "18:00"}
    assert client.post("/api/study-sessions", json=payload).status_code == 409
    assert client.patch("/api/tasks/" + task["id"], json={"status": "CANCELLED"}).status_code == 200
    assert client.post("/api/study-sessions", json=payload).status_code == 409


def test_outcome_requires_explicit_effort_decision_and_is_retry_safe(client, task):
    client.post("/api/availability", json={"date": "2000-01-03", "start_time": "17:00", "end_time": "20:00"})
    payload = {"task_id": task["id"], "date": "2000-01-03", "start_time": "17:00", "end_time": "18:00",
               "status": "PARTIALLY_COMPLETED", "completed_minutes": 30}
    assert client.post("/api/study-sessions", json=payload).status_code == 422
    payload["task_remaining_hours"] = 4
    response = client.post("/api/study-sessions", json=payload)
    assert response.status_code == 201, response.text
    assert client.get("/api/tasks/" + task["id"]).json()["remaining_hours"] == 4
    for _ in range(2):
        assert client.patch("/api/study-sessions/" + response.json()["id"], json={
            "status": "PARTIALLY_COMPLETED", "completed_minutes": 30, "task_remaining_hours": 4}).status_code == 200
    assert client.get("/api/tasks/" + task["id"]).json()["remaining_hours"] == 4


def test_time_does_not_automatically_reduce_effort(client, task):
    client.post("/api/availability", json={"date": "2000-01-03", "start_time": "17:00", "end_time": "20:00"})
    response = client.post("/api/study-sessions", json={"task_id": task["id"], "date": "2000-01-03",
        "start_time": "17:00", "end_time": "18:00", "status": "COMPLETED", "completed_minutes": 60, "confirm_no_progress": True})
    assert response.status_code == 201, response.text
    assert client.get("/api/tasks/" + task["id"]).json()["remaining_hours"] == 5
    assert client.patch("/api/study-sessions/" + response.json()["id"], json={"date": "2000-01-04"}).status_code == 409


def test_invalid_outcome_rolls_back_both_session_and_task(client, task):
    client.post("/api/availability", json={"date": "2000-01-03", "start_time": "17:00", "end_time": "20:00"})
    response = client.post("/api/study-sessions", json={"task_id": task["id"], "date": "2000-01-03",
        "start_time": "17:00", "end_time": "18:00", "status": "COMPLETED", "completed_minutes": 60, "task_remaining_hours": 10})
    assert response.status_code == 422
    assert client.get("/api/study-sessions").json() == []
    assert client.get("/api/tasks/" + task["id"]).json()["remaining_hours"] == 5

def test_reservation_respects_deadline_and_manual_changes(client, task, window, study_session):
    response = client.patch("/api/tasks/" + task["id"], json={"deadline": "2099-01-05T16:30:00Z"})
    assert response.status_code == 409
    assert client.get("/api/tasks/" + task["id"]).json()["deadline"] == task["deadline"]
    second = client.post("/api/tasks", json={"title": "Early deadline", "subject_id": task["subject_id"],
                         "deadline": "2099-01-05T16:00:00Z", "estimated_hours": 5})
    assert second.status_code == 201
    response = client.post("/api/study-sessions", json={"task_id": second.json()["id"], "date": window["date"],
                           "start_time": "18:00", "end_time": "19:00"})
    assert response.status_code == 422


def test_session_requires_availability_and_future_start(client, task):
    payload = {"task_id": task["id"], "date": "2099-01-05", "start_time": "09:00", "end_time": "10:00"}
    assert client.post("/api/study-sessions", json=payload).status_code == 409
    assert client.post("/api/availability", json={"date": "2000-01-03", "start_time": "09:00", "end_time": "10:00"}).status_code == 201
    payload["date"] = "2000-01-03"
    assert client.post("/api/study-sessions", json=payload).status_code == 422


def test_completing_task_preserves_outcome_history(client, task, study_session):
    client.post("/api/availability", json={"date": "2000-01-03", "start_time": "09:00", "end_time": "10:00"})
    history = client.post("/api/study-sessions", json={"task_id": task["id"], "date": "2000-01-03",
        "start_time": "09:00", "end_time": "10:00", "status": "COMPLETED", "completed_minutes": 60,
        "confirm_no_progress": True})
    assert history.status_code == 201
    assert client.patch("/api/tasks/" + task["id"], json={"status": "COMPLETED"}).status_code == 200
    assert client.get("/api/study-sessions/" + history.json()["id"]).status_code == 200
    assert client.get("/api/study-sessions/" + study_session["id"]).status_code == 404
