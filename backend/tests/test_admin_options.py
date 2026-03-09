"""Tests for /api/admin — app config, plugins, api-keys, import/export."""
from httpx import AsyncClient


class TestPublicConfig:
    async def test_public_config_no_auth(self, client: AsyncClient):
        resp = await client.get("/api/admin/public/config")
        assert resp.status_code == 200
        data = resp.json()
        assert "organization_name" in data

    async def test_public_config_has_tenant_slug(self, client: AsyncClient):
        resp = await client.get("/api/admin/public/config")
        data = resp.json()
        assert "tenant_slug" in data


class TestGetConfig:
    async def test_admin_get_config(self, admin_client: AsyncClient):
        resp = await admin_client.get("/api/admin/config")
        assert resp.status_code == 200
        data = resp.json()
        assert "organization_name" in data
        assert "default_exercise_type" in data
        assert "enable_tv_plugin" in data

    async def test_animateur_cannot_read_config(self, animateur_client: AsyncClient):
        resp = await animateur_client.get("/api/admin/config")
        assert resp.status_code in (401, 403)

    async def test_participant_cannot_read_config(self, participant_client: AsyncClient):
        resp = await participant_client.get("/api/admin/config")
        assert resp.status_code in (401, 403)

    async def test_unauthenticated_cannot_read_config(self, client: AsyncClient):
        resp = await client.get("/api/admin/config")
        assert resp.status_code == 401


class TestUpdateConfig:
    async def test_admin_update_organization_name(self, admin_client: AsyncClient):
        resp = await admin_client.put(
            "/api/admin/config",
            json={"organization_name": "Updated Org Name"},
        )
        assert resp.status_code == 200
        assert resp.json()["organization_name"] == "Updated Org Name"

    async def test_admin_update_multiple_fields(self, admin_client: AsyncClient):
        resp = await admin_client.put(
            "/api/admin/config",
            json={
                "default_exercise_type": "ransomware",
                "default_exercise_duration_hours": 8,
                "enable_scoring": True,
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["default_exercise_type"] == "ransomware"
        assert data["enable_scoring"] is True

    async def test_update_bia_processes(self, admin_client: AsyncClient):
        import json
        processes = [
            {
                "id": "test-001",
                "process_name": "Facturation",
                "criticality": "critique",
                "rto_hours": 4,
                "rpo_minutes": 60,
                "mtpd_hours": 72,
                "priority": "P1",
                "operational_impact": True,
                "regulatory_impact": False,
                "financial_impact": "fort",
                "dependencies_it": [],
                "dependencies_external": [],
            }
        ]
        resp = await admin_client.put(
            "/api/admin/config",
            json={"bia_processes": json.dumps(processes)},
        )
        assert resp.status_code == 200
        assert resp.json()["bia_processes"] is not None

    async def test_animateur_cannot_update_config(self, animateur_client: AsyncClient):
        resp = await animateur_client.put(
            "/api/admin/config",
            json={"organization_name": "Hacked"},
        )
        assert resp.status_code in (401, 403)


class TestPlugins:
    async def test_list_plugins(self, admin_client: AsyncClient):
        resp = await admin_client.get("/api/admin/plugins")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    async def test_reset_plugins(self, admin_client: AsyncClient):
        resp = await admin_client.post("/api/admin/plugins/reset")
        assert resp.status_code in (200, 201, 204)

    async def test_participant_cannot_list_plugins(self, participant_client: AsyncClient):
        resp = await participant_client.get("/api/admin/plugins")
        assert resp.status_code in (401, 403)


class TestApiKeys:
    async def test_list_api_keys(self, admin_client: AsyncClient):
        resp = await admin_client.get("/api/admin/api-keys")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    async def test_create_api_key(self, admin_client: AsyncClient):
        resp = await admin_client.post(
            "/api/admin/api-keys",
            json={"name": "Test Key", "description": "For tests"},
        )
        assert resp.status_code in (200, 201)
        data = resp.json()
        assert "key" in data or "api_key" in data or "name" in data

    async def test_delete_api_key(self, admin_client: AsyncClient):
        cr = await admin_client.post(
            "/api/admin/api-keys",
            json={"name": "Key To Delete"},
        )
        assert cr.status_code in (200, 201)
        key_id = cr.json().get("id")
        if key_id:
            resp = await admin_client.delete(f"/api/admin/api-keys/{key_id}")
            assert resp.status_code in (200, 204)


class TestExportImport:
    async def test_export_config(self, admin_client: AsyncClient):
        resp = await admin_client.get("/api/admin/config/export")
        assert resp.status_code == 200
        data = resp.json()
        assert "app_configuration" in data
        assert "exported_at" in data

    async def test_import_config(self, admin_client: AsyncClient):
        # Export then re-import
        export = await admin_client.get("/api/admin/config/export")
        payload = export.json()
        resp = await admin_client.post(
            "/api/admin/config/import",
            json={"app_configuration": payload["app_configuration"]},
        )
        assert resp.status_code in (200, 204)
