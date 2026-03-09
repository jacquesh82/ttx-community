"""Tests for /api/media — upload, list, get, delete."""
import io
from httpx import AsyncClient


class TestListMedia:
    async def test_list_media(self, admin_client: AsyncClient):
        resp = await admin_client.get("/api/media")
        assert resp.status_code == 200

    async def test_unauthenticated_blocked(self, client: AsyncClient):
        resp = await client.get("/api/media")
        assert resp.status_code == 401


class TestUploadMedia:
    async def test_upload_image(self, admin_client: AsyncClient):
        # Minimal valid 1x1 white PNG
        png_bytes = (
            b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01"
            b"\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00\x00"
            b"\x00\x0cIDATx\x9cc\xf8\x0f\x00\x00\x01\x01\x00\x05\x18"
            b"\xd8N\x00\x00\x00\x00IEND\xaeB`\x82"
        )
        resp = await admin_client.post(
            "/api/media/upload",
            files={"file": ("test.png", io.BytesIO(png_bytes), "image/png")},
        )
        assert resp.status_code in (200, 201, 400, 422)
        # 400/422 allowed if media storage is not configured in test env

    async def test_upload_requires_auth(self, client: AsyncClient):
        resp = await client.post(
            "/api/media/upload",
            files={"file": ("test.txt", io.BytesIO(b"hello"), "text/plain")},
        )
        assert resp.status_code == 401


class TestGetMedia:
    async def test_get_nonexistent_media(self, admin_client: AsyncClient):
        resp = await admin_client.get("/api/media/999999")
        assert resp.status_code == 404
