"""Tests for /api/inject-bank — CRUD, stats, categories, export/import."""
from httpx import AsyncClient

NEW_ITEM = {
    "title": "Bank Item Test",
    "kind": "mail",
    "status": "draft",
    "data_format": "text",
    "payload": {},
    "tags": [],
}


class TestListBankItems:
    async def test_list_items(self, admin_client: AsyncClient):
        resp = await admin_client.get("/api/inject-bank")
        assert resp.status_code == 200
        data = resp.json()
        assert "items" in data or isinstance(data, list)

    async def test_pagination_params(self, admin_client: AsyncClient):
        resp = await admin_client.get("/api/inject-bank?page=1&page_size=5")
        assert resp.status_code == 200

    async def test_filter_by_kind(self, admin_client: AsyncClient):
        resp = await admin_client.get("/api/inject-bank?kind=mail")
        assert resp.status_code == 200

    async def test_unauthenticated_blocked(self, client: AsyncClient):
        resp = await client.get("/api/inject-bank")
        assert resp.status_code == 401


class TestBankStats:
    async def test_get_stats(self, admin_client: AsyncClient):
        resp = await admin_client.get("/api/inject-bank/stats")
        assert resp.status_code == 200
        data = resp.json()
        assert "total" in data or "by_kind" in data


class TestBankCategories:
    async def test_get_categories(self, admin_client: AsyncClient):
        resp = await admin_client.get("/api/inject-bank/categories")
        assert resp.status_code == 200

    async def test_get_kinds(self, admin_client: AsyncClient):
        resp = await admin_client.get("/api/inject-bank/kinds")
        assert resp.status_code == 200

    async def test_get_statuses(self, admin_client: AsyncClient):
        resp = await admin_client.get("/api/inject-bank/statuses")
        assert resp.status_code == 200


class TestCreateBankItem:
    async def test_create_item(self, admin_client: AsyncClient):
        resp = await admin_client.post("/api/inject-bank", json=NEW_ITEM)
        assert resp.status_code in (200, 201)
        data = resp.json()
        assert data["title"] == NEW_ITEM["title"]
        assert data["kind"] == "mail"

    async def test_create_item_missing_title(self, admin_client: AsyncClient):
        resp = await admin_client.post(
            "/api/inject-bank",
            json={"kind": "mail", "status": "draft", "data_format": "text"},
        )
        assert resp.status_code == 422

    async def test_participant_cannot_create(self, participant_client: AsyncClient):
        resp = await participant_client.post("/api/inject-bank", json=NEW_ITEM)
        assert resp.status_code in (401, 403)


class TestGetBankItem:
    async def test_get_item(self, admin_client: AsyncClient):
        cr = await admin_client.post("/api/inject-bank", json=NEW_ITEM)
        item_id = cr.json()["id"]
        resp = await admin_client.get(f"/api/inject-bank/{item_id}")
        assert resp.status_code == 200
        assert resp.json()["id"] == item_id

    async def test_get_nonexistent(self, admin_client: AsyncClient):
        resp = await admin_client.get("/api/inject-bank/999999")
        assert resp.status_code == 404


class TestUpdateBankItem:
    async def test_update_item(self, admin_client: AsyncClient):
        cr = await admin_client.post("/api/inject-bank", json=NEW_ITEM)
        item_id = cr.json()["id"]
        resp = await admin_client.put(
            f"/api/inject-bank/{item_id}",
            json={**NEW_ITEM, "title": "Updated Bank Item", "status": "ready"},
        )
        assert resp.status_code == 200
        assert resp.json()["title"] == "Updated Bank Item"
        assert resp.json()["status"] == "ready"


class TestDeleteBankItem:
    async def test_delete_item(self, admin_client: AsyncClient):
        cr = await admin_client.post(
            "/api/inject-bank", json={**NEW_ITEM, "title": "To Delete Bank"}
        )
        item_id = cr.json()["id"]
        resp = await admin_client.delete(f"/api/inject-bank/{item_id}")
        assert resp.status_code in (200, 204)

    async def test_delete_nonexistent(self, admin_client: AsyncClient):
        resp = await admin_client.delete("/api/inject-bank/999999")
        assert resp.status_code == 404


class TestBankSchema:
    async def test_get_schema(self, admin_client: AsyncClient):
        resp = await admin_client.get("/api/inject-bank/schema")
        assert resp.status_code == 200
