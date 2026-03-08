"""Add timeline_configured flag to exercises table.

Revision ID: 0009_add_timeline_configured
Revises: 0008_restore_default_exercise_type
Create Date: 2026-03-08
"""
from alembic import op


revision = "0009_add_timeline_configured"
down_revision = "0008_restore_default_exercise_type"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE exercises
        ADD COLUMN IF NOT EXISTS timeline_configured BOOLEAN NOT NULL DEFAULT false
        """
    )


def downgrade() -> None:
    op.execute(
        """
        ALTER TABLE exercises
        DROP COLUMN IF EXISTS timeline_configured
        """
    )
