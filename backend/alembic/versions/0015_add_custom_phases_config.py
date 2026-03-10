"""add custom_phases_config to app_configurations

Revision ID: 0015
Revises: 0014
Create Date: 2026-03-10
"""
from alembic import op

revision = '0015_add_custom_phases_config'
down_revision = '0014_twitter_add_missing_columns'
branch_labels = None
depends_on = None


def upgrade():
    op.execute(
        "ALTER TABLE app_configurations ADD COLUMN IF NOT EXISTS custom_phases_config TEXT"
    )


def downgrade():
    op.execute(
        "ALTER TABLE app_configurations DROP COLUMN IF EXISTS custom_phases_config"
    )
