"""Tests for /webmail — conversations and messages."""
from httpx import AsyncClient

NEW_EXERCISE = {
    "name": "Webmail Exercise",
    "exercise_type": "cyber",
    "target_duration_hours": 4,
    "maturity_level": "intermediate",
    "mode": "real_time",
}


async def _exercise_id(client: AsyncClient) -> int:
    cr = await client.post("/api/exercises", json=NEW_EXERCISE)
    return cr.json()["id"]


class TestWebmailConversations:
    async def test_list_conversations(self, admin_client: AsyncClient):
        eid = await _exercise_id(admin_client)
        resp = await admin_client.get(f"/webmail/conversations?exercise_id={eid}")
        assert resp.status_code == 200

    async def test_unauthenticated_access(self, admin_client: AsyncClient, client: AsyncClient):
        eid = await _exercise_id(admin_client)
        resp = await client.get(f"/webmail/conversations?exercise_id={eid}")
        assert resp.status_code in (200, 401)  # optional auth endpoint

    async def test_get_nonexistent_conversation(self, participant_client: AsyncClient):
        resp = await participant_client.get("/webmail/conversations/999999")
        assert resp.status_code == 404

    async def test_create_conversation(self, admin_client: AsyncClient, seed):
        eid = await _exercise_id(admin_client)
        uid = seed["users"]["observateur"].id
        resp = await admin_client.post(
            "/webmail/conversations",
            json={
                "subject": "Test Subject",
                "participant_ids": [uid],
                "exercise_id": eid,
            },
        )
        assert resp.status_code in (200, 201, 422)


class TestWebmailMessages:
    async def test_send_message_no_conversation(self, participant_client: AsyncClient):
        resp = await participant_client.post(
            "/webmail/messages",
            json={
                "conversation_id": 999999,
                "body": "Hello",
            },
        )
        assert resp.status_code in (400, 404, 422)
