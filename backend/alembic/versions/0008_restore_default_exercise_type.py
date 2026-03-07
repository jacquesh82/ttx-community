"""Restore app_configurations.default_exercise_type for community backend.

Revision ID: 0008_restore_default_exercise_type
Revises: 0007_rename_default_exercise_type_to_mode
Create Date: 2026-03-07
"""
from alembic import op


revision = "0008_restore_default_exercise_type"
down_revision = "0007_rename_default_exercise_type_to_mode"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE app_configurations
        ADD COLUMN IF NOT EXISTS default_exercise_type VARCHAR(50) NOT NULL DEFAULT 'cyber'
        """
    )


def downgrade() -> None:
    op.execute(
        """
        ALTER TABLE app_configurations
        DROP COLUMN IF EXISTS default_exercise_type
        """
    )
