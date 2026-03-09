"""Tests for /api/twitter — accounts and posts."""
from httpx import AsyncClient

NEW_EXERCISE = {
    "name": "Twitter Exercise",
    "exercise_type": "cyber",
    "target_duration_hours": 4,
    "maturity_level": "intermediate",
    "mode": "real_time",
}


async def _exercise_id(client: AsyncClient) -> int:
    cr = await client.post("/api/exercises", json=NEW_EXERCISE)
    return cr.json()["id"]


class TestTwitterAccounts:
    async def test_create_account(self, admin_client: AsyncClient):
        eid = await _exercise_id(admin_client)
        resp = await admin_client.post(
            "/api/twitter/accounts",
            json={
                "exercise_id": eid,
                "handle": "fake_news_bot",
                "display_name": "Fake News Bot",
                "account_type": "journalist",
                "follower_count": 1000,
                "following_count": 200,
                "verified": False,
                "bio": "",
            },
        )
        assert resp.status_code in (200, 201)

    async def test_list_accounts(self, admin_client: AsyncClient):
        eid = await _exercise_id(admin_client)
        resp = await admin_client.get(f"/api/twitter/accounts/{eid}")
        assert resp.status_code == 200

    async def test_unauthenticated_blocked(self, client: AsyncClient):
        resp = await client.get("/api/twitter/accounts/1")
        assert resp.status_code == 401

    async def test_csv_template(self, admin_client: AsyncClient):
        resp = await admin_client.get("/api/twitter/template/accounts/csv")
        assert resp.status_code == 200


class TestTwitterPosts:
    async def test_create_post(self, admin_client: AsyncClient):
        eid = await _exercise_id(admin_client)
        cr_acc = await admin_client.post(
            "/api/twitter/accounts",
            json={
                "exercise_id": eid,
                "handle": "post_author",
                "display_name": "Post Author",
                "account_type": "journalist",
                "follower_count": 0,
                "following_count": 0,
                "verified": False,
                "bio": "",
            },
        )
        if cr_acc.status_code in (200, 201):
            acc_id = cr_acc.json()["id"]
            resp = await admin_client.post(
                "/api/twitter/posts",
                json={
                    "exercise_id": eid,
                    "account_id": acc_id,
                    "content": "ALERTE : intrusion détectée #cybersécurité",
                    "post_type": "tweet",
                    "scheduled_offset_minutes": 15,
                },
            )
            assert resp.status_code in (200, 201)

    async def test_posts_csv_template(self, admin_client: AsyncClient):
        resp = await admin_client.get("/api/twitter/template/posts/csv")
        assert resp.status_code == 200
