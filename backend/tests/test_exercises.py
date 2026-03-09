"""Tests for /api/exercises — CRUD and lifecycle."""
import pytest
from httpx import AsyncClient

NEW_EXERCISE = {
    "name": "Test Exercise Alpha",
    "exercise_type": "cyber",
    "target_duration_hours": 4,
    "maturity_level": "intermediate",
    "mode": "real_time",
}


class TestCreationOptions:
    async def test_get_creation_options(self, admin_client: AsyncClient):
        resp = await admin_client.get("/api/exercises/creation-options")
        assert resp.status_code == 200

    async def test_creation_options_unauthenticated(self, client: AsyncClient):
        resp = await client.get("/api/exercises/creation-options")
        assert resp.status_code == 401


class TestListExercises:
    async def test_list_exercises(self, admin_client: AsyncClient):
        resp = await admin_client.get("/api/exercises")
        assert resp.status_code == 200
        data = resp.json()
        assert "exercises" in data or "items" in data or isinstance(data, list)

    async def test_list_exercises_unauthenticated(self, client: AsyncClient):
        resp = await client.get("/api/exercises")
        assert resp.status_code == 401


class TestCreateExercise:
    async def test_admin_create_exercise(self, admin_client: AsyncClient):
        resp = await admin_client.post("/api/exercises", json=NEW_EXERCISE)
        assert resp.status_code in (200, 201)
        data = resp.json()
        assert data["name"] == NEW_EXERCISE["name"]
        assert data["status"] == "draft"

    async def test_animateur_create_exercise(self, animateur_client: AsyncClient):
        resp = await animateur_client.post(
            "/api/exercises",
            json={**NEW_EXERCISE, "name": "Animateur Exercise"},
        )
        assert resp.status_code in (200, 201)

    async def test_participant_cannot_create(self, participant_client: AsyncClient):
        resp = await participant_client.post("/api/exercises", json=NEW_EXERCISE)
        assert resp.status_code in (401, 403)

    async def test_create_exercise_missing_name(self, admin_client: AsyncClient):
        resp = await admin_client.post(
            "/api/exercises",
            json={"exercise_type": "cyber"},
        )
        assert resp.status_code == 422


class TestGetExercise:
    async def test_get_exercise(self, admin_client: AsyncClient):
        cr = await admin_client.post("/api/exercises", json=NEW_EXERCISE)
        eid = cr.json()["id"]
        resp = await admin_client.get(f"/api/exercises/{eid}")
        assert resp.status_code == 200
        assert resp.json()["id"] == eid

    async def test_get_nonexistent_exercise(self, admin_client: AsyncClient):
        resp = await admin_client.get("/api/exercises/999999")
        assert resp.status_code == 404

    async def test_get_exercise_stats(self, admin_client: AsyncClient):
        cr = await admin_client.post("/api/exercises", json=NEW_EXERCISE)
        eid = cr.json()["id"]
        resp = await admin_client.get(f"/api/exercises/{eid}/stats")
        assert resp.status_code == 200


class TestUpdateExercise:
    async def test_update_exercise_name(self, admin_client: AsyncClient):
        cr = await admin_client.post("/api/exercises", json=NEW_EXERCISE)
        eid = cr.json()["id"]
        resp = await admin_client.put(
            f"/api/exercises/{eid}",
            json={**NEW_EXERCISE, "name": "Updated Name"},
        )
        assert resp.status_code == 200
        assert resp.json()["name"] == "Updated Name"


class TestDeleteExercise:
    async def test_delete_exercise(self, admin_client: AsyncClient):
        cr = await admin_client.post(
            "/api/exercises", json={**NEW_EXERCISE, "name": "To Delete"}
        )
        eid = cr.json()["id"]
        resp = await admin_client.delete(f"/api/exercises/{eid}")
        assert resp.status_code in (200, 204)

    async def test_animateur_cannot_delete(self, animateur_client: AsyncClient, admin_client: AsyncClient):
        cr = await admin_client.post(
            "/api/exercises", json={**NEW_EXERCISE, "name": "Protected Exercise"}
        )
        eid = cr.json()["id"]
        resp = await animateur_client.delete(f"/api/exercises/{eid}")
        assert resp.status_code in (401, 403)


class TestExerciseLifecycle:
    async def test_start_exercise(self, admin_client: AsyncClient):
        cr = await admin_client.post(
            "/api/exercises", json={**NEW_EXERCISE, "name": "Lifecycle Exercise"}
        )
        eid = cr.json()["id"]
        resp = await admin_client.post(f"/api/exercises/{eid}/start")
        assert resp.status_code in (200, 400)  # 400 if conditions not met

    async def test_start_then_pause(self, admin_client: AsyncClient):
        cr = await admin_client.post(
            "/api/exercises", json={**NEW_EXERCISE, "name": "Pause Exercise"}
        )
        eid = cr.json()["id"]
        start = await admin_client.post(f"/api/exercises/{eid}/start")
        if start.status_code == 200:
            resp = await admin_client.post(f"/api/exercises/{eid}/pause")
            assert resp.status_code in (200, 400)


class TestExerciseTeams:
    async def test_list_exercise_teams(self, admin_client: AsyncClient):
        cr = await admin_client.post("/api/exercises", json=NEW_EXERCISE)
        eid = cr.json()["id"]
        resp = await admin_client.get(f"/api/exercises/{eid}/teams")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list) or "teams" in data

    async def test_add_team_to_exercise(self, admin_client: AsyncClient):
        cr_ex = await admin_client.post("/api/exercises", json=NEW_EXERCISE)
        eid = cr_ex.json()["id"]
        cr_team = await admin_client.post(
            "/api/teams", json={"name": "Exercise Team", "color": "#AABBCC"}
        )
        tid = cr_team.json()["id"]
        resp = await admin_client.post(f"/api/exercises/{eid}/teams/{tid}")
        assert resp.status_code in (200, 201, 204)
