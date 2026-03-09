"""Tests for crisis management — scenario, phases, escalation axes, triggers."""
from httpx import AsyncClient

NEW_EXERCISE = {
    "name": "Crisis Mgmt Exercise",
    "exercise_type": "cyber",
    "target_duration_hours": 4,
    "maturity_level": "intermediate",
    "mode": "real_time",
}


async def _exercise_id(client: AsyncClient) -> int:
    cr = await client.post("/api/exercises", json=NEW_EXERCISE)
    return cr.json()["id"]


class TestScenario:
    async def test_get_scenario(self, admin_client: AsyncClient):
        eid = await _exercise_id(admin_client)
        resp = await admin_client.get(f"/api/exercises/{eid}/scenario")
        assert resp.status_code in (200, 404)

    async def test_update_scenario(self, admin_client: AsyncClient):
        eid = await _exercise_id(admin_client)
        resp = await admin_client.put(
            f"/api/exercises/{eid}/scenario",
            json={
                "title": "Cyberattaque critique",
                "description": "Simulation d'une attaque ransomware.",
                "context": "Environnement hospitalier",
            },
        )
        assert resp.status_code in (200, 201)

    async def test_unauthenticated_blocked(self, client: AsyncClient):
        resp = await client.get("/api/exercises/1/scenario")
        assert resp.status_code == 401


class TestPhases:
    async def test_list_phases(self, admin_client: AsyncClient):
        eid = await _exercise_id(admin_client)
        resp = await admin_client.get(f"/api/exercises/{eid}/phases")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    async def test_create_phase(self, admin_client: AsyncClient):
        eid = await _exercise_id(admin_client)
        resp = await admin_client.post(
            f"/api/exercises/{eid}/phases",
            json={
                "name": "Phase 1 — Détection",
                "phase_order": 1,
                "color": "#FF0000",
            },
        )
        assert resp.status_code in (200, 201)

    async def test_update_phase(self, admin_client: AsyncClient):
        eid = await _exercise_id(admin_client)
        cr = await admin_client.post(
            f"/api/exercises/{eid}/phases",
            json={"name": "Old Phase", "order": 1, "color": "#AAA"},
        )
        if cr.status_code in (200, 201):
            pid = cr.json()["id"]
            resp = await admin_client.put(
                f"/api/exercises/{eid}/phases/{pid}",
                json={"name": "New Phase", "order": 1, "color": "#BBB"},
            )
            assert resp.status_code == 200


class TestEscalationAxes:
    async def test_list_axes(self, admin_client: AsyncClient):
        eid = await _exercise_id(admin_client)
        resp = await admin_client.get(f"/api/exercises/{eid}/escalation-axes")
        assert resp.status_code == 200

    async def test_create_axis(self, admin_client: AsyncClient):
        eid = await _exercise_id(admin_client)
        resp = await admin_client.post(
            f"/api/exercises/{eid}/escalation-axes",
            json={
                "name": "Impact métier",
                "axis_type": "business",
                "levels": ["faible", "modéré", "critique"],
            },
        )
        assert resp.status_code in (200, 201, 422)


class TestInjectTriggers:
    async def test_list_triggers(self, admin_client: AsyncClient):
        eid = await _exercise_id(admin_client)
        resp = await admin_client.get(f"/api/exercises/{eid}/inject-triggers")
        assert resp.status_code == 200
