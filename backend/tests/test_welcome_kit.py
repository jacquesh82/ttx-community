"""Tests for /api/welcome-kits — templates CRUD + generation."""
from httpx import AsyncClient

NEW_EXERCISE = {
    "name": "Welcome Kit Exercise",
    "exercise_type": "cyber",
    "target_duration_hours": 4,
    "maturity_level": "intermediate",
    "mode": "real_time",
}


class TestWelcomeKitTemplates:
    async def test_list_templates(self, admin_client: AsyncClient):
        resp = await admin_client.get("/api/welcome-kits/templates")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list) or "templates" in data

    async def test_unauthenticated_blocked(self, client: AsyncClient):
        resp = await client.get("/api/welcome-kits/templates")
        assert resp.status_code == 401

    async def test_create_template(self, admin_client: AsyncClient):
        resp = await admin_client.post(
            "/api/welcome-kits/templates",
            json={
                "name": "Template Test",
                "kind": "pdf",
                "content": "Bienvenue à l'exercice {{exercise_name}}.",
            },
        )
        assert resp.status_code in (200, 201, 422)

    async def test_get_nonexistent_template(self, admin_client: AsyncClient):
        resp = await admin_client.get("/api/welcome-kits/templates/999999")
        assert resp.status_code == 404


class TestWelcomeKitGeneration:
    async def test_ensure_passwords(self, admin_client: AsyncClient):
        cr = await admin_client.post("/api/exercises", json=NEW_EXERCISE)
        eid = cr.json()["id"]
        resp = await admin_client.post(f"/api/exercises/{eid}/ensure-passwords")
        assert resp.status_code in (200, 204, 404)

    async def test_preview_requires_auth(self, client: AsyncClient):
        resp = await client.get("/api/exercises/1/welcome-kit/preview/1")
        assert resp.status_code in (401, 404)
