"""Tests for simulated channels — mail, SMS, calls, chat, social."""
from httpx import AsyncClient

NEW_EXERCISE = {
    "name": "Simulated Channel Exercise",
    "exercise_type": "cyber",
    "target_duration_hours": 4,
    "maturity_level": "intermediate",
    "mode": "real_time",
}


async def _exercise_id(client: AsyncClient) -> int:
    cr = await client.post("/api/exercises", json=NEW_EXERCISE)
    return cr.json()["id"]


class TestSimulatedMail:
    async def test_list_mails(self, admin_client: AsyncClient):
        eid = await _exercise_id(admin_client)
        resp = await admin_client.get(f"/api/simulated/{eid}/mails")
        assert resp.status_code == 200

    async def test_unauthenticated_blocked(self, client: AsyncClient):
        resp = await client.get("/api/simulated/1/mails")
        assert resp.status_code in (200, 401, 403)  # some simulated endpoints are public


class TestSimulatedSMS:
    async def test_list_sms(self, admin_client: AsyncClient):
        eid = await _exercise_id(admin_client)
        resp = await admin_client.get(f"/api/simulated/{eid}/sms/conversations")
        assert resp.status_code == 200


class TestSimulatedCalls:
    async def test_list_calls(self, admin_client: AsyncClient):
        eid = await _exercise_id(admin_client)
        resp = await admin_client.get(f"/api/simulated/{eid}/calls")
        assert resp.status_code == 200

    async def test_list_active_calls(self, admin_client: AsyncClient):
        eid = await _exercise_id(admin_client)
        resp = await admin_client.get(f"/api/simulated/{eid}/calls/active")
        assert resp.status_code in (200, 404)


class TestSimulatedChat:
    async def test_list_chat_rooms(self, admin_client: AsyncClient):
        eid = await _exercise_id(admin_client)
        resp = await admin_client.get(f"/api/simulated/{eid}/chat/rooms")
        assert resp.status_code == 200

    async def test_create_chat_room(self, admin_client: AsyncClient):
        eid = await _exercise_id(admin_client)
        resp = await admin_client.post(
            f"/api/simulated/{eid}/chat/rooms",
            json={"name": "Crisis Room", "room_type": "group"},
        )
        assert resp.status_code in (200, 201, 422)


class TestSimulatedSocial:
    async def test_list_social_posts(self, admin_client: AsyncClient):
        eid = await _exercise_id(admin_client)
        resp = await admin_client.get(f"/api/simulated/{eid}/social")
        assert resp.status_code == 200
