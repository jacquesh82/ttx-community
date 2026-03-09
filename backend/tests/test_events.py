"""Tests for /api/events."""
from httpx import AsyncClient


class TestListEvents:
    async def test_admin_list_events(self, admin_client: AsyncClient):
        resp = await admin_client.get("/api/events")
        assert resp.status_code == 200

    async def test_unauthenticated_cannot_list_events(self, client: AsyncClient):
        resp = await client.get("/api/events")
        assert resp.status_code == 401

    async def test_list_events_returns_list(self, admin_client: AsyncClient):
        resp = await admin_client.get("/api/events")
        data = resp.json()
        assert isinstance(data, list) or "items" in data or "events" in data


class TestGetEvent:
    async def test_get_nonexistent_event(self, admin_client: AsyncClient):
        resp = await admin_client.get("/api/events/999999")
        assert resp.status_code == 404
