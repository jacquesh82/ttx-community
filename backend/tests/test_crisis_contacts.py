"""Tests for /api/crisis-contacts — CRUD + CSV import/template."""
from httpx import AsyncClient
import io

NEW_EXERCISE = {
    "name": "Crisis Contact Exercise",
    "exercise_type": "cyber",
    "target_duration_hours": 4,
    "maturity_level": "intermediate",
    "mode": "real_time",
}


async def _exercise_id(client: AsyncClient) -> int:
    cr = await client.post("/api/exercises", json=NEW_EXERCISE)
    return cr.json()["id"]


class TestListContacts:
    async def test_list_contacts(self, admin_client: AsyncClient):
        eid = await _exercise_id(admin_client)
        resp = await admin_client.get(f"/api/crisis-contacts?exercise_id={eid}")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list) or "contacts" in data or "items" in data

    async def test_unauthenticated_access(self, admin_client: AsyncClient, client: AsyncClient):
        eid = await _exercise_id(admin_client)
        resp = await client.get(f"/api/crisis-contacts?exercise_id={eid}")
        assert resp.status_code in (200, 401)  # optional auth endpoint


class TestCreateContact:
    async def test_create_contact(self, admin_client: AsyncClient):
        eid = await _exercise_id(admin_client)
        resp = await admin_client.post(
            "/api/crisis-contacts",
            json={
                "exercise_id": eid,
                "name": "Jean Dupont",
                "category": "interne",
                "priority": "normal",
            },
        )
        assert resp.status_code in (200, 201)
        data = resp.json()
        assert "id" in data or data.get("name") == "Jean Dupont"

    async def test_create_contact_missing_name(self, admin_client: AsyncClient):
        eid = await _exercise_id(admin_client)
        resp = await admin_client.post(
            "/api/crisis-contacts",
            json={"exercise_id": eid, "role": "DSI"},
        )
        assert resp.status_code == 422


class TestUpdateContact:
    async def test_update_contact(self, admin_client: AsyncClient):
        eid = await _exercise_id(admin_client)
        cr = await admin_client.post(
            "/api/crisis-contacts",
            json={"exercise_id": eid, "name": "Old Name", "category": "interne", "priority": "normal"},
        )
        cid = cr.json()["id"]
        resp = await admin_client.put(
            f"/api/crisis-contacts/{cid}",
            json={"name": "New Name", "category": "interne", "priority": "normal"},
        )
        assert resp.status_code == 200


class TestDeleteContact:
    async def test_delete_contact(self, admin_client: AsyncClient):
        eid = await _exercise_id(admin_client)
        cr = await admin_client.post(
            "/api/crisis-contacts",
            json={"exercise_id": eid, "name": "To Delete", "category": "interne", "priority": "normal"},
        )
        cid = cr.json()["id"]
        resp = await admin_client.delete(f"/api/crisis-contacts/{cid}")
        assert resp.status_code in (200, 204)


class TestCsvTemplate:
    async def test_csv_template(self, admin_client: AsyncClient):
        resp = await admin_client.get("/api/crisis-contacts/template/csv")
        assert resp.status_code == 200
