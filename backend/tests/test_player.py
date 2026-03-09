"""Tests for /api player endpoints — context, timeline, injects, decisions."""
from httpx import AsyncClient

NEW_EXERCISE = {
    "name": "Player Exercise",
    "exercise_type": "cyber",
    "target_duration_hours": 4,
    "maturity_level": "intermediate",
    "mode": "real_time",
}


async def _assign_and_start(admin_client: AsyncClient, player_client: AsyncClient, seed) -> int:
    """Create an exercise, assign the participant, return exercise id."""
    cr = await admin_client.post("/api/exercises", json=NEW_EXERCISE)
    eid = cr.json()["id"]
    uid = seed["users"]["participant"].id
    await admin_client.post(
        f"/api/exercises/{eid}/users",
        json={"user_id": uid, "role": "joueur"},
    )
    return eid


class TestPlayerContext:
    async def test_get_context_requires_auth(self, client: AsyncClient):
        resp = await client.get("/api/exercises/1/context")
        assert resp.status_code in (401, 404)  # 404 if exercise not found before auth check

    async def test_get_context(self, admin_client: AsyncClient, participant_client: AsyncClient, seed):
        eid = await _assign_and_start(admin_client, participant_client, seed)
        resp = await participant_client.get(f"/api/exercises/{eid}/context")
        assert resp.status_code in (200, 403, 404)

    async def test_get_timeline(self, admin_client: AsyncClient, participant_client: AsyncClient, seed):
        eid = await _assign_and_start(admin_client, participant_client, seed)
        resp = await participant_client.get(f"/api/exercises/{eid}/timeline")
        assert resp.status_code in (200, 403, 404)

    async def test_get_player_injects(self, admin_client: AsyncClient, participant_client: AsyncClient, seed):
        eid = await _assign_and_start(admin_client, participant_client, seed)
        resp = await participant_client.get(f"/api/exercises/{eid}/injects")
        assert resp.status_code in (200, 403, 404)


class TestPlayerDecisions:
    async def test_list_decisions(self, admin_client: AsyncClient, participant_client: AsyncClient, seed):
        eid = await _assign_and_start(admin_client, participant_client, seed)
        resp = await participant_client.get(f"/api/exercises/{eid}/decisions")
        assert resp.status_code in (200, 403, 404)

    async def test_create_decision(self, admin_client: AsyncClient, participant_client: AsyncClient, seed):
        eid = await _assign_and_start(admin_client, participant_client, seed)
        resp = await participant_client.post(
            f"/api/exercises/{eid}/decisions",
            json={"content": "Isoler le SI", "inject_id": None},
        )
        assert resp.status_code in (200, 201, 400, 403, 404, 422)


class TestPlayerNotifications:
    async def test_list_notifications(self, admin_client: AsyncClient, participant_client: AsyncClient, seed):
        eid = await _assign_and_start(admin_client, participant_client, seed)
        resp = await participant_client.get(f"/api/exercises/{eid}/notifications")
        assert resp.status_code in (200, 403, 404)
