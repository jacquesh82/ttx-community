"""Tests for /api/auth — login, logout, me, profile, password change."""
import pytest
from httpx import AsyncClient


class TestLogin:
    async def test_login_with_username(self, client: AsyncClient):
        resp = await client.post(
            "/api/auth/login",
            json={"username_or_email": "test_admin", "password": "TestPass1!"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["user"]["role"] == "admin"
        assert "ttx_session" in resp.cookies

    async def test_login_with_email(self, client: AsyncClient):
        resp = await client.post(
            "/api/auth/login",
            json={"username_or_email": "test_admin@ttx.test", "password": "TestPass1!"},
        )
        assert resp.status_code == 200

    async def test_login_wrong_password(self, client: AsyncClient):
        resp = await client.post(
            "/api/auth/login",
            json={"username_or_email": "test_admin", "password": "Wrong!"},
        )
        assert resp.status_code == 401

    async def test_login_unknown_user(self, client: AsyncClient):
        resp = await client.post(
            "/api/auth/login",
            json={"username_or_email": "nobody@void.test", "password": "any"},
        )
        assert resp.status_code == 401

    async def test_login_missing_password(self, client: AsyncClient):
        resp = await client.post(
            "/api/auth/login",
            json={"username_or_email": "test_admin"},
        )
        assert resp.status_code == 422

    async def test_login_response_shape(self, client: AsyncClient):
        resp = await client.post(
            "/api/auth/login",
            json={"username_or_email": "test_animateur", "password": "TestPass1!"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "user" in data
        assert "tenant" in data
        assert data["user"]["username"] == "test_animateur"


class TestLogout:
    async def test_logout_authenticated(self, admin_client: AsyncClient):
        resp = await admin_client.post("/api/auth/logout")
        assert resp.status_code == 200

    async def test_logout_unauthenticated_is_graceful(self, client: AsyncClient):
        resp = await client.post("/api/auth/logout")
        assert resp.status_code == 200


class TestMe:
    async def test_me_authenticated(self, admin_client: AsyncClient):
        resp = await admin_client.get("/api/auth/me")
        assert resp.status_code == 200
        data = resp.json()
        assert data["user"]["username"] == "test_admin"
        assert data["user"]["role"] == "admin"

    async def test_me_unauthenticated(self, client: AsyncClient):
        resp = await client.get("/api/auth/me")
        assert resp.status_code == 401

    async def test_me_returns_tenant(self, admin_client: AsyncClient):
        resp = await admin_client.get("/api/auth/me")
        assert resp.status_code == 200
        assert "tenant" in resp.json()


class TestProfile:
    async def test_update_display_name(self, admin_client: AsyncClient):
        resp = await admin_client.patch(
            "/api/auth/profile",
            json={"display_name": "Admin Test"},
        )
        assert resp.status_code == 200
        data = resp.json()
        # Response may wrap user in a "user" key (SessionResponse)
        user_data = data.get("user", data)
        assert user_data.get("display_name") == "Admin Test"

    async def test_update_profile_unauthenticated(self, client: AsyncClient):
        resp = await client.patch(
            "/api/auth/profile",
            json={"display_name": "Hacker"},
        )
        assert resp.status_code == 401


class TestPasswordChange:
    async def test_change_password_success(self, animateur_client: AsyncClient):
        resp = await animateur_client.post(
            "/api/auth/password/change",
            json={"current_password": "TestPass1!", "new_password": "NewPass99!"},
        )
        # Reset password back so other tests still work
        if resp.status_code == 200:
            await animateur_client.post(
                "/api/auth/password/change",
                json={"current_password": "NewPass99!", "new_password": "TestPass1!"},
            )
        assert resp.status_code == 200

    async def test_change_password_wrong_current(self, admin_client: AsyncClient):
        resp = await admin_client.post(
            "/api/auth/password/change",
            json={"current_password": "WrongCurrent!", "new_password": "NewPass99!"},
        )
        assert resp.status_code in (400, 401)

    async def test_change_password_unauthenticated(self, client: AsyncClient):
        resp = await client.post(
            "/api/auth/password/change",
            json={"current_password": "TestPass1!", "new_password": "New99!"},
        )
        assert resp.status_code == 401
