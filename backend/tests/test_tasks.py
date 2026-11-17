from uuid import uuid4
import pytest


def test_task_progress_and_filters(client, task, subject):
    assert task["remaining_hours"] == 5 and task["progress"] == 0
    updated = client.patch("/api/tasks/" + task["id"], json={"progress": 40}).json()
    assert updated["remaining_hours"] == 3 and updated["status"] == "IN_PROGRESS"
    for query in ({"subject_id": subject["id"]}, {"status": "IN_PROGRESS"}, {"priority": "HIGH"},
                  {"deadline_from": "2099-01-01T00:00:00Z", "deadline_to": "2100-01-01T00:00:00Z"}):
        result = client.get("/api/tasks", params=query)
        assert result.status_code == 200 and result.json()[0]["id"] == task["id"]
    assert client.get("/api/tasks", params={"priority": "LOW"}).json() == []
    assert client.get("/api/tasks", params={"deadline_from": "2100-01-01T00:00:00Z"}).json() == []
    assert client.get("/api/tasks/" + task["id"]).status_code == 200


@pytest.mark.parametrize("change", [
    {"title": ""}, {"estimated_hours": 0}, {"estimated_hours": -1}, {"remaining_hours": -1},
    {"remaining_hours": 6}, {"progress": -1}, {"progress": 101},
    {"remaining_hours": 3, "progress": 80},
    {"deadline": "2099-12-31T22:59:00"},
    {"status": "COMPLETED", "progress": 20},
    {"status": "COMPLETED", "remaining_hours": 2},
])
def test_task_validation(client, subject, change):
    payload = {"title": "Task", "subject_id": subject["id"], "deadline": "2099-12-31T22:59:00Z", "estimated_hours": 5}
    payload.update(change)
    assert client.post("/api/tasks", json=payload).status_code == 422


def test_missing_subject(client):
    assert client.post("/api/tasks", json={"title": "Task", "subject_id": str(uuid4()),
        "deadline": "2099-12-31T22:59:00Z", "estimated_hours": 2}).status_code == 404


def test_completion_deletes_only_future_planned_sessions(client, task, study_session):
    response = client.patch("/api/tasks/" + task["id"], json={"status": "COMPLETED"})
    assert response.status_code == 200
    assert response.json()["remaining_hours"] == 0
    assert response.json()["progress"] == 100
    assert client.get("/api/study-sessions/" + study_session["id"]).status_code == 404
    assert client.get("/api/availability").json() != []


def test_reducing_effort_rejects_invalid_reservation_without_replanning(client, task, study_session):
    response = client.patch("/api/tasks/" + task["id"], json={"remaining_hours": 0.5})
    assert response.status_code == 409
    assert client.get("/api/tasks/" + task["id"]).json()["remaining_hours"] == 5
    assert client.get("/api/study-sessions/" + study_session["id"]).json()["start_time"] == "17:00:00"


def test_task_delete_removes_linked_sessions(client, task, study_session):
    assert client.delete("/api/tasks/" + task["id"]).status_code == 204
    assert client.get("/api/study-sessions/" + study_session["id"]).status_code == 404


def test_task_patch_consistency(client, task):
    assert client.patch("/api/tasks/" + task["id"], json={"progress": 40}).json()["remaining_hours"] == 3
    result = client.patch("/api/tasks/" + task["id"], json={"estimated_hours": 10}).json()
    assert result["remaining_hours"] == 3 and result["progress"] == 70
    assert client.patch("/api/tasks/" + task["id"], json={"remaining_hours": None}).status_code == 422


def test_task_overdue_and_timezone(client, subject):
    response = client.post("/api/tasks", json={"title": "Overdue", "subject_id": subject["id"],
        "deadline": "2000-01-01T10:00:00+01:00", "estimated_hours": 2})
    assert response.status_code == 201
    assert response.json()["deadline"] == "2000-01-01T09:00:00Z"


def test_filter_range_validation(client):
    assert client.get("/api/tasks", params={"deadline_from": "2100-01-01T00:00:00Z",
        "deadline_to": "2099-01-01T00:00:00Z"}).status_code == 422
    assert client.get("/api/tasks", params={"deadline_from": "2099-01-01T00:00:00"}).status_code == 422
