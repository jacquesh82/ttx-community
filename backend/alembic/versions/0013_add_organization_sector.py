"""Add organization_sector field to app_configurations and tenant_configurations.

Revision ID: 0013_add_organization_sector
Revises: 0012_add_bia_processes
Create Date: 2026-03-09
"""
from alembic import op


revision = "0013_add_organization_sector"
down_revision = "0012_add_bia_processes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    for table in ("app_configurations", "tenant_configurations"):
        op.execute(
            f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS organization_sector VARCHAR(100)"
        )


def downgrade() -> None:
    for table in ("app_configurations", "tenant_configurations"):
        op.execute(
            f"ALTER TABLE {table} DROP COLUMN IF EXISTS organization_sector"
        )
