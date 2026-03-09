"""Tests for /api/teams — CRUD + member management."""
from httpx import AsyncClient


class TestListTeams:
    async def test_list_teams_authenticated(self, admin_client: AsyncClient):
        resp = await admin_client.get("/api/teams")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list) or "teams" in data

    async def test_list_teams_unauthenticated(self, client: AsyncClient):
        resp = await client.get("/api/teams")
        assert resp.status_code == 401


class TestCreateTeam:
    async def test_admin_create_team(self, admin_client: AsyncClient):
        resp = await admin_client.post(
            "/api/teams",
            json={"name": "Alpha Team", "color": "#FF0000"},
        )
        assert resp.status_code in (200, 201)
        data = resp.json()
        assert data["name"] == "Alpha Team"
        assert data["color"] == "#FF0000"

    async def test_create_team_missing_name(self, admin_client: AsyncClient):
        resp = await admin_client.post("/api/teams", json={"color": "#FF0000"})
        assert resp.status_code == 422

    async def test_participant_cannot_create_team(self, participant_client: AsyncClient):
        resp = await participant_client.post(
            "/api/teams",
            json={"name": "Hacker Team", "color": "#000"},
        )
        assert resp.status_code in (401, 403)


class TestGetTeam:
    async def test_get_team(self, admin_client: AsyncClient):
        cr = await admin_client.post(
            "/api/teams", json={"name": "Bravo Team", "color": "#0000FF"}
        )
        assert cr.status_code in (200, 201)
        tid = cr.json()["id"]

        resp = await admin_client.get(f"/api/teams/{tid}")
        assert resp.status_code == 200
        assert resp.json()["id"] == tid

    async def test_get_nonexistent_team(self, admin_client: AsyncClient):
        resp = await admin_client.get("/api/teams/999999")
        assert resp.status_code == 404


class TestUpdateTeam:
    async def test_update_team_name(self, admin_client: AsyncClient):
        cr = await admin_client.post(
            "/api/teams", json={"name": "Charlie Team", "color": "#00FF00"}
        )
        tid = cr.json()["id"]
        resp = await admin_client.put(
            f"/api/teams/{tid}", json={"name": "Charlie Renamed", "color": "#00FF00"}
        )
        assert resp.status_code == 200
        assert resp.json()["name"] == "Charlie Renamed"


class TestDeleteTeam:
    async def test_delete_team(self, admin_client: AsyncClient):
        cr = await admin_client.post(
            "/api/teams", json={"name": "Delta Team", "color": "#FF00FF"}
        )
        tid = cr.json()["id"]
        resp = await admin_client.delete(f"/api/teams/{tid}")
        assert resp.status_code in (200, 204)

    async def test_delete_nonexistent_team(self, admin_client: AsyncClient):
        resp = await admin_client.delete("/api/teams/999999")
        assert resp.status_code == 404


class TestTeamMembers:
    async def test_add_member_to_team(self, admin_client: AsyncClient, seed):
        cr = await admin_client.post(
            "/api/teams", json={"name": "Echo Team", "color": "#FFFF00"}
        )
        tid = cr.json()["id"]
        uid = seed["users"]["participant"].id

        resp = await admin_client.post(f"/api/teams/{tid}/members/{uid}")
        assert resp.status_code in (200, 201, 204)

    async def test_remove_member_from_team(self, admin_client: AsyncClient, seed):
        cr = await admin_client.post(
            "/api/teams", json={"name": "Foxtrot Team", "color": "#FF8800"}
        )
        tid = cr.json()["id"]
        uid = seed["users"]["observateur"].id

        await admin_client.post(f"/api/teams/{tid}/members/{uid}")
        resp = await admin_client.delete(f"/api/teams/{tid}/members/{uid}")
        assert resp.status_code in (200, 204)
