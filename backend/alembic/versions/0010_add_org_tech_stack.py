"""Add organization_tech_stack to app_configurations and tenant_configurations.

Revision ID: 0010_add_org_tech_stack
Revises: 0009_add_timeline_configured
Create Date: 2026-03-09
"""
from alembic import op


revision = "0010_add_org_tech_stack"
down_revision = "0009_add_timeline_configured"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE app_configurations
        ADD COLUMN IF NOT EXISTS organization_tech_stack TEXT
        """
    )
    op.execute(
        """
        ALTER TABLE tenant_configurations
        ADD COLUMN IF NOT EXISTS organization_tech_stack TEXT
        """
    )


def downgrade() -> None:
    op.execute(
        """
        ALTER TABLE app_configurations
        DROP COLUMN IF EXISTS organization_tech_stack
        """
    )
    op.execute(
        """
        ALTER TABLE tenant_configurations
        DROP COLUMN IF EXISTS organization_tech_stack
        """
    )
