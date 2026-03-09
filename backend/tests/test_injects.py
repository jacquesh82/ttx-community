"""Tests for /api/injects — CRUD, types, schema, send, schedule."""
from httpx import AsyncClient

NEW_EXERCISE = {
    "name": "Inject Test Exercise",
    "exercise_type": "cyber",
    "target_duration_hours": 4,
    "maturity_level": "intermediate",
    "mode": "real_time",
}


async def _create_exercise(client: AsyncClient) -> int:
    cr = await client.post("/api/exercises", json=NEW_EXERCISE)
    assert cr.status_code in (200, 201)
    return cr.json()["id"]


async def _create_inject(client: AsyncClient, exercise_id: int) -> dict:
    cr = await client.post(
        "/api/injects",
        json={
            "exercise_id": exercise_id,
            "title": "Test Inject",
            "type": "mail",
            "content": {},
        },
    )
    assert cr.status_code in (200, 201)
    return cr.json()


class TestInjectTypes:
    async def test_get_inject_types(self, admin_client: AsyncClient):
        resp = await admin_client.get("/api/injects/types")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list) or "types" in data

    async def test_get_timeline_schema(self, admin_client: AsyncClient):
        resp = await admin_client.get("/api/injects/schema/timeline")
        assert resp.status_code == 200


class TestListInjects:
    async def test_list_injects(self, admin_client: AsyncClient):
        resp = await admin_client.get("/api/injects")
        assert resp.status_code == 200

    async def test_list_injects_unauthenticated(self, client: AsyncClient):
        resp = await client.get("/api/injects")
        assert resp.status_code == 401


class TestCreateInject:
    async def test_create_inject(self, admin_client: AsyncClient):
        eid = await _create_exercise(admin_client)
        inject = await _create_inject(admin_client, eid)
        assert inject["title"] == "Test Inject"
        assert inject.get("type") == "mail" or inject.get("inject_type") == "mail"

    async def test_create_inject_missing_exercise(self, admin_client: AsyncClient):
        resp = await admin_client.post(
            "/api/injects",
            json={
                "exercise_id": 999999,
                "title": "Ghost Inject",
                "type": "mail",
                "content": {},
            },
        )
        assert resp.status_code in (400, 404, 422)

    async def test_participant_cannot_create_inject(self, participant_client: AsyncClient, admin_client: AsyncClient):
        eid = await _create_exercise(admin_client)
        resp = await participant_client.post(
            "/api/injects",
            json={
                "exercise_id": eid,
                "title": "Sneaky Inject",
                "type": "mail",
                "content": {},
            },
        )
        assert resp.status_code in (401, 403)


class TestGetInject:
    async def test_get_inject(self, admin_client: AsyncClient):
        eid = await _create_exercise(admin_client)
        inject = await _create_inject(admin_client, eid)
        iid = inject["id"]
        resp = await admin_client.get(f"/api/injects/{iid}")
        assert resp.status_code == 200
        assert resp.json()["id"] == iid

    async def test_get_nonexistent_inject(self, admin_client: AsyncClient):
        resp = await admin_client.get("/api/injects/999999")
        assert resp.status_code == 404


class TestUpdateInject:
    async def test_update_inject_title(self, admin_client: AsyncClient):
        eid = await _create_exercise(admin_client)
        inject = await _create_inject(admin_client, eid)
        iid = inject["id"]
        resp = await admin_client.put(
            f"/api/injects/{iid}",
            json={"title": "Updated Title"},
        )
        assert resp.status_code == 200
        assert resp.json()["title"] == "Updated Title"


class TestDeleteInject:
    async def test_delete_inject(self, admin_client: AsyncClient):
        eid = await _create_exercise(admin_client)
        inject = await _create_inject(admin_client, eid)
        iid = inject["id"]
        resp = await admin_client.delete(f"/api/injects/{iid}")
        assert resp.status_code in (200, 204)


class TestInjectDeliveries:
    async def test_get_inject_deliveries(self, admin_client: AsyncClient):
        eid = await _create_exercise(admin_client)
        inject = await _create_inject(admin_client, eid)
        iid = inject["id"]
        resp = await admin_client.get(f"/api/injects/{iid}/deliveries")
        assert resp.status_code == 200


class TestCsvTemplate:
    async def test_csv_template(self, admin_client: AsyncClient):
        resp = await admin_client.get("/api/injects/template/csv")
        assert resp.status_code == 200
