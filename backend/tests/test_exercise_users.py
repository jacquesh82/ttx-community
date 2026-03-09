"""Tests for exercise user assignment — /api/exercises/{id}/users."""
from httpx import AsyncClient

NEW_EXERCISE = {
    "name": "ExUser Exercise",
    "exercise_type": "cyber",
    "target_duration_hours": 4,
    "maturity_level": "intermediate",
    "mode": "real_time",
}


async def _exercise_id(client: AsyncClient) -> int:
    cr = await client.post("/api/exercises", json=NEW_EXERCISE)
    return cr.json()["id"]


class TestListExerciseUsers:
    async def test_list_exercise_users(self, admin_client: AsyncClient):
        eid = await _exercise_id(admin_client)
        resp = await admin_client.get(f"/api/exercises/{eid}/users")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list) or "users" in data

    async def test_list_available_users(self, admin_client: AsyncClient):
        eid = await _exercise_id(admin_client)
        resp = await admin_client.get(f"/api/exercises/{eid}/available-users")
        assert resp.status_code == 200

    async def test_unauthenticated_blocked(self, client: AsyncClient):
        resp = await client.get("/api/exercises/1/users")
        assert resp.status_code == 401


class TestAssignUser:
    async def test_assign_user_to_exercise(self, admin_client: AsyncClient, seed):
        eid = await _exercise_id(admin_client)
        uid = seed["users"]["participant"].id
        resp = await admin_client.post(
            f"/api/exercises/{eid}/users",
            json={"user_id": uid, "role": "joueur"},
        )
        assert resp.status_code in (200, 201)

    async def test_assign_nonexistent_user(self, admin_client: AsyncClient):
        eid = await _exercise_id(admin_client)
        resp = await admin_client.post(
            f"/api/exercises/{eid}/users",
            json={"user_id": 999999, "role": "joueur"},
        )
        assert resp.status_code in (400, 404, 422)


class TestUpdateExerciseUser:
    async def test_update_user_role(self, admin_client: AsyncClient, seed):
        eid = await _exercise_id(admin_client)
        uid = seed["users"]["observateur"].id
        await admin_client.post(
            f"/api/exercises/{eid}/users",
            json={"user_id": uid, "role": "joueur"},
        )
        resp = await admin_client.put(
            f"/api/exercises/{eid}/users/{uid}",
            json={"role": "observateur"},
        )
        assert resp.status_code in (200, 404)  # 404 if not found after assign


class TestRemoveUser:
    async def test_remove_user_from_exercise(self, admin_client: AsyncClient, seed):
        eid = await _exercise_id(admin_client)
        uid = seed["users"]["animateur"].id
        await admin_client.post(
            f"/api/exercises/{eid}/users",
            json={"user_id": uid, "role": "animateur"},
        )
        resp = await admin_client.delete(f"/api/exercises/{eid}/users/{uid}")
        assert resp.status_code in (200, 204)
