"""Tests for /api/debug — status and exercise listing."""
from httpx import AsyncClient


class TestDebugStatus:
    async def test_debug_status_admin(self, admin_client: AsyncClient):
        resp = await admin_client.get("/api/debug/status")
        assert resp.status_code == 200

    async def test_debug_status_unauthenticated(self, client: AsyncClient):
        resp = await client.get("/api/debug/status")
        assert resp.status_code in (200, 401)  # may be public

    async def test_debug_exercises(self, admin_client: AsyncClient):
        resp = await admin_client.get("/api/debug/exercises")
        assert resp.status_code == 200
