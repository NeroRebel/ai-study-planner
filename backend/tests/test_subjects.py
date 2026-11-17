from uuid import uuid4
import pytest


def test_subject_crud(client):
    response = client.post("/api/subjects", json={"name": "  Statistics  "})
    assert response.status_code == 201
    item = response.json()
    assert item["name"] == "Statistics"
    assert item["color"] is None
    assert item["created_at"].endswith("Z")
    assert client.get("/api/subjects").json()[0]["id"] == item["id"]
    assert client.get("/api/subjects/" + item["id"]).status_code == 200
    patched = client.patch("/api/subjects/" + item["id"], json={"name": "Applied Statistics", "color": "#aabbcc"})
    assert patched.status_code == 200
    assert patched.json()["name"] == "Applied Statistics"
    assert client.patch("/api/subjects/" + item["id"], json={"color": None}).json()["color"] is None
    deleted = client.delete("/api/subjects/" + item["id"])
    assert deleted.status_code == 204 and not deleted.content
    assert client.get("/api/subjects/" + item["id"]).status_code == 404


def test_subject_with_tasks_is_not_deleted(client, task):
    response = client.delete("/api/subjects/" + task["subject_id"])
    assert response.status_code == 409
    assert "still contains tasks" in response.json()["detail"]
    assert client.get("/api/tasks/" + task["id"]).status_code == 200


@pytest.mark.parametrize("payload", [{"name": ""}, {"name": " "}, {"name": "x" * 81}, {"name": "Valid", "color": "orange"}, {"name": "Valid", "unexpected": True}])
def test_subject_validation(client, payload):
    assert client.post("/api/subjects", json=payload).status_code == 422


def test_subject_not_found_and_null_patch(client):
    assert client.get("/api/subjects/" + str(uuid4())).status_code == 404
    item = client.post("/api/subjects", json={"name": "Subject"}).json()
    assert client.patch("/api/subjects/" + item["id"], json={"name": None}).status_code == 422
    assert client.get("/api/subjects/not-a-uuid").status_code == 422
