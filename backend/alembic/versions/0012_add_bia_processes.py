"""Add bia_processes field to app_configurations and tenant_configurations.

Revision ID: 0012_add_bia_processes
Revises: 0011_add_org_tech_context
Create Date: 2026-03-09
"""
from alembic import op


revision = "0012_add_bia_processes"
down_revision = "0011_add_org_tech_context"
branch_labels = None
depends_on = None


def upgrade() -> None:
    for table in ("app_configurations", "tenant_configurations"):
        op.execute(
            f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS bia_processes TEXT"
        )


def downgrade() -> None:
    for table in ("app_configurations", "tenant_configurations"):
        op.execute(
            f"ALTER TABLE {table} DROP COLUMN IF EXISTS bia_processes"
        )
