"""Tests for GET /api/health"""


async def test_health_returns_200(client):
    resp = await client.get("/api/health")
    assert resp.status_code == 200


async def test_health_body(client):
    resp = await client.get("/api/health")
    data = resp.json()
    assert data["status"] == "healthy"
    assert "timestamp" in data
