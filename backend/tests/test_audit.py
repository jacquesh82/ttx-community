"""Tests for /api/audit — log listing, stats, export."""
from httpx import AsyncClient


class TestListAuditLogs:
    async def test_admin_list_logs(self, admin_client: AsyncClient):
        resp = await admin_client.get("/api/audit")
        assert resp.status_code == 200

    async def test_animateur_cannot_list_audit(self, animateur_client: AsyncClient):
        resp = await animateur_client.get("/api/audit")
        assert resp.status_code in (401, 403)

    async def test_unauthenticated_blocked(self, client: AsyncClient):
        resp = await client.get("/api/audit")
        assert resp.status_code == 401

    async def test_list_returns_pagination(self, admin_client: AsyncClient):
        resp = await admin_client.get("/api/audit")
        data = resp.json()
        assert isinstance(data, list) or "items" in data or "logs" in data


class TestAuditStats:
    async def test_get_audit_stats(self, admin_client: AsyncClient):
        resp = await admin_client.get("/api/audit/stats")
        assert resp.status_code == 200


class TestAuditExport:
    async def test_export_csv(self, admin_client: AsyncClient):
        resp = await admin_client.get("/api/audit/export/csv")
        assert resp.status_code == 200
        assert "text/csv" in resp.headers.get("content-type", "")
