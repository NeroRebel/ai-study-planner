import pytest


def test_availability_crud_and_filters(client, window):
    assert client.get("/api/availability/" + window["id"]).status_code == 200
    assert client.get("/api/availability", params={"date_from": "2099-01-05", "date_to": "2099-01-05"}).json()[0]["id"] == window["id"]
    updated = client.patch("/api/availability/" + window["id"], json={"end_time": "22:00"})
    assert updated.status_code == 200 and updated.json()["end_time"] == "22:00:00"
    assert client.delete("/api/availability/" + window["id"]).status_code == 204
    assert client.get("/api/availability/" + window["id"]).status_code == 404


@pytest.mark.parametrize("start,end", [("18:00", "17:00"), ("17:00", "17:00"), ("17:00:30", "18:00"), ("17:00+01:00", "18:00+01:00")])
def test_invalid_intervals(client, start, end):
    assert client.post("/api/availability", json={"date": "2099-01-05", "start_time": start, "end_time": end}).status_code == 422


def test_overlap_and_adjacent_windows(client, window):
    assert client.post("/api/availability", json={"date": window["date"], "start_time": "20:00", "end_time": "22:00"}).status_code == 409
    adjacent = client.post("/api/availability", json={"date": window["date"], "start_time": "21:00", "end_time": "22:00"})
    assert adjacent.status_code == 201
    assert client.patch("/api/availability/" + adjacent.json()["id"], json={"start_time": "20:30"}).status_code == 409
    assert client.patch("/api/availability/" + window["id"], json={"end_time": "16:00"}).status_code == 422


def test_availability_change_preserves_manual_sessions(client, study_session, window):
    assert client.delete("/api/availability/" + window["id"]).status_code == 409
    assert client.patch("/api/availability/" + window["id"], json={"start_time": "18:00"}).status_code == 409
    assert client.get("/api/study-sessions/" + study_session["id"]).status_code == 200


def test_dst_ambiguous_and_nonexistent_times(client):
    for day in ("2026-03-29", "2026-10-25"):
        response = client.post("/api/availability", json={"date": day, "start_time": "02:30", "end_time": "04:00"})
        assert response.status_code == 422
        assert "ambiguous or nonexistent" in response.json()["detail"]
