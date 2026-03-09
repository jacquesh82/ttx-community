"""Tests for /api/users — CRUD, role-based access."""
import pytest
from httpx import AsyncClient


class TestListUsers:
    async def test_admin_can_list_users(self, admin_client: AsyncClient):
        resp = await admin_client.get("/api/users")
        assert resp.status_code == 200
        data = resp.json()
        users = data if isinstance(data, list) else data.get("users", [])
        assert len(users) >= 4  # seeded users

    async def test_animateur_cannot_list_users(self, animateur_client: AsyncClient):
        resp = await animateur_client.get("/api/users")
        assert resp.status_code in (401, 403)

    async def test_unauthenticated_cannot_list(self, client: AsyncClient):
        resp = await client.get("/api/users")
        assert resp.status_code == 401


class TestGetUser:
    async def test_admin_get_existing_user(self, admin_client: AsyncClient, seed):
        user_id = seed["users"]["admin"].id
        resp = await admin_client.get(f"/api/users/{user_id}")
        assert resp.status_code == 200
        assert resp.json()["id"] == user_id

    async def test_get_nonexistent_user(self, admin_client: AsyncClient):
        resp = await admin_client.get("/api/users/999999")
        assert resp.status_code == 404


class TestCreateUser:
    async def test_admin_create_user(self, admin_client: AsyncClient):
        resp = await admin_client.post(
            "/api/users",
            json={
                "username": "newuser_test",
                "email": "newuser_test@ttx.test",
                "password": "TestPass1!",
                "role": "participant",
            },
        )
        assert resp.status_code in (200, 201)
        data = resp.json()
        assert data["username"] == "newuser_test"
        assert data["role"] == "participant"

    async def test_create_user_duplicate_username(self, admin_client: AsyncClient):
        await admin_client.post(
            "/api/users",
            json={
                "username": "dup_user_x",
                "email": "dup_x@ttx.test",
                "password": "TestPass1!",
                "role": "participant",
            },
        )
        resp = await admin_client.post(
            "/api/users",
            json={
                "username": "dup_user_x",
                "email": "dup_x2@ttx.test",
                "password": "TestPass1!",
                "role": "participant",
            },
        )
        assert resp.status_code in (400, 409, 422)

    async def test_participant_cannot_create_user(self, participant_client: AsyncClient):
        resp = await participant_client.post(
            "/api/users",
            json={
                "username": "hacker",
                "email": "h@ttx.test",
                "password": "Hack99!",
                "role": "admin",
            },
        )
        assert resp.status_code in (401, 403)


class TestUpdateUser:
    async def test_admin_update_user_role(self, admin_client: AsyncClient, seed):
        user_id = seed["users"]["observateur"].id
        resp = await admin_client.put(
            f"/api/users/{user_id}",
            json={"role": "animateur"},
        )
        # Restore
        await admin_client.put(f"/api/users/{user_id}", json={"role": "observateur"})
        assert resp.status_code == 200

    async def test_update_nonexistent_user(self, admin_client: AsyncClient):
        resp = await admin_client.put(
            "/api/users/999999",
            json={"display_name": "Ghost"},
        )
        assert resp.status_code == 404


class TestDeleteUser:
    async def test_admin_delete_user(self, admin_client: AsyncClient):
        # Create a throwaway user
        cr = await admin_client.post(
            "/api/users",
            json={
                "username": "to_delete_test",
                "email": "to_delete_test@ttx.test",
                "password": "TestPass1!",
                "role": "participant",
            },
        )
        assert cr.status_code in (200, 201)
        user_id = cr.json()["id"]
        resp = await admin_client.delete(f"/api/users/{user_id}")
        assert resp.status_code in (200, 204)

    async def test_animateur_cannot_delete(self, animateur_client: AsyncClient, seed):
        user_id = seed["users"]["participant"].id
        resp = await animateur_client.delete(f"/api/users/{user_id}")
        assert resp.status_code in (401, 403)
