"""Align twitter_accounts and twitter_posts columns with Pydantic schemas.

- twitter_accounts: add bio, follower_count, following_count
- twitter_posts: rename parent_post_id → reply_to_id, add quote_of_id,
  like_count, retweet_count, reply_count, quote_count, view_count,
  scheduled_at, posted_at

Revision ID: 0014_twitter_add_missing_columns
Revises: 0013_add_organization_sector
Create Date: 2026-03-09
"""
from alembic import op
import sqlalchemy as sa


revision = "0014_twitter_add_missing_columns"
down_revision = "0013_add_organization_sector"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── twitter_accounts ──────────────────────────────────────────────────────
    op.execute("ALTER TABLE twitter_accounts ADD COLUMN IF NOT EXISTS bio TEXT")
    op.execute("ALTER TABLE twitter_accounts ADD COLUMN IF NOT EXISTS follower_count INTEGER NOT NULL DEFAULT 0")
    op.execute("ALTER TABLE twitter_accounts ADD COLUMN IF NOT EXISTS following_count INTEGER NOT NULL DEFAULT 0")

    # ── twitter_posts — rename parent_post_id → reply_to_id ──────────────────
    # PostgreSQL supports RENAME COLUMN directly
    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'twitter_posts' AND column_name = 'parent_post_id'
            ) THEN
                ALTER TABLE twitter_posts RENAME COLUMN parent_post_id TO reply_to_id;
            END IF;
        END$$;
    """)

    # ── twitter_posts — new columns ───────────────────────────────────────────
    op.execute("ALTER TABLE twitter_posts ADD COLUMN IF NOT EXISTS quote_of_id INTEGER REFERENCES twitter_posts(id) ON DELETE SET NULL")
    op.execute("ALTER TABLE twitter_posts ADD COLUMN IF NOT EXISTS like_count INTEGER NOT NULL DEFAULT 0")
    op.execute("ALTER TABLE twitter_posts ADD COLUMN IF NOT EXISTS retweet_count INTEGER NOT NULL DEFAULT 0")
    op.execute("ALTER TABLE twitter_posts ADD COLUMN IF NOT EXISTS reply_count INTEGER NOT NULL DEFAULT 0")
    op.execute("ALTER TABLE twitter_posts ADD COLUMN IF NOT EXISTS quote_count INTEGER NOT NULL DEFAULT 0")
    op.execute("ALTER TABLE twitter_posts ADD COLUMN IF NOT EXISTS view_count INTEGER NOT NULL DEFAULT 0")
    op.execute("ALTER TABLE twitter_posts ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMP WITH TIME ZONE")
    op.execute("ALTER TABLE twitter_posts ADD COLUMN IF NOT EXISTS posted_at TIMESTAMP WITH TIME ZONE")


def downgrade() -> None:
    # ── twitter_posts ─────────────────────────────────────────────────────────
    for col in ("posted_at", "scheduled_at", "view_count", "quote_count",
                "reply_count", "retweet_count", "like_count", "quote_of_id"):
        op.execute(f"ALTER TABLE twitter_posts DROP COLUMN IF EXISTS {col}")

    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'twitter_posts' AND column_name = 'reply_to_id'
            ) THEN
                ALTER TABLE twitter_posts RENAME COLUMN reply_to_id TO parent_post_id;
            END IF;
        END$$;
    """)

    # ── twitter_accounts ──────────────────────────────────────────────────────
    for col in ("following_count", "follower_count", "bio"):
        op.execute(f"ALTER TABLE twitter_accounts DROP COLUMN IF EXISTS {col}")
