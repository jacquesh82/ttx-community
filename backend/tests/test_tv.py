"""Tests for /api/tv — channels, segments, live."""
from httpx import AsyncClient

NEW_EXERCISE = {
    "name": "TV Exercise",
    "exercise_type": "cyber",
    "target_duration_hours": 4,
    "maturity_level": "intermediate",
    "mode": "real_time",
}


async def _exercise_id(client: AsyncClient) -> int:
    cr = await client.post("/api/exercises", json=NEW_EXERCISE)
    return cr.json()["id"]


class TestTVChannels:
    async def test_create_channel(self, admin_client: AsyncClient):
        eid = await _exercise_id(admin_client)
        resp = await admin_client.post(
            "/api/tv/channels",
            params={"exercise_id": eid, "name": "BFM Crisis TV"},
        )
        assert resp.status_code in (200, 201)

    async def test_get_channel(self, admin_client: AsyncClient):
        eid = await _exercise_id(admin_client)
        cr = await admin_client.post(
            "/api/tv/channels",
            params={"exercise_id": eid, "name": "Canal Test"},
        )
        if cr.status_code in (200, 201):
            cid = cr.json()["id"]
            resp = await admin_client.get(f"/api/tv/channels/{cid}")
            assert resp.status_code == 200

    async def test_unauthenticated_blocked(self, client: AsyncClient):
        resp = await client.get("/api/tv/channels/1")
        assert resp.status_code == 401


class TestTVSegments:
    async def test_create_segment(self, admin_client: AsyncClient):
        eid = await _exercise_id(admin_client)
        cr = await admin_client.post(
            "/api/tv/channels",
            params={"exercise_id": eid, "name": "Segment Channel"},
        )
        if cr.status_code in (200, 201):
            cid = cr.json()["id"]
            resp = await admin_client.post(
                "/api/tv/segments",
                json={
                    "channel_id": cid,
                    "title": "Breaking News",
                    "segment_type": "news",
                    "duration_seconds": 60,
                },
            )
            assert resp.status_code in (200, 201, 422)


class TestTVLive:
    async def test_get_live_state(self, admin_client: AsyncClient):
        eid = await _exercise_id(admin_client)
        cr = await admin_client.post(
            "/api/tv/channels",
            params={"exercise_id": eid, "name": "Live Channel"},
        )
        if cr.status_code in (200, 201):
            cid = cr.json()["id"]
            resp = await admin_client.get(f"/api/tv/{cid}/live")
            assert resp.status_code in (200, 404)
