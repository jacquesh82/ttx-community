"""Add technical context fields to app_configurations and tenant_configurations.

Revision ID: 0011_add_org_tech_context
Revises: 0010_add_org_tech_stack
Create Date: 2026-03-09
"""
from alembic import op


revision = "0011_add_org_tech_context"
down_revision = "0010_add_org_tech_stack"
branch_labels = None
depends_on = None

TECH_CONTEXT_COLUMNS = [
    ("windows_domain",           "VARCHAR(255)"),
    ("public_domain",            "VARCHAR(255)"),
    ("mail_domain",              "VARCHAR(255)"),
    ("internal_ip_ranges",       "TEXT"),
    ("dmz_ip_ranges",            "TEXT"),
    ("domain_controllers",       "TEXT"),
    ("server_naming_examples",   "TEXT"),
    ("technological_dependencies","TEXT"),
    ("cloud_providers",          "TEXT"),
    ("critical_applications",    "TEXT"),
]


def upgrade() -> None:
    for table in ("app_configurations", "tenant_configurations"):
        for col_name, col_type in TECH_CONTEXT_COLUMNS:
            op.execute(
                f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {col_name} {col_type}"
            )


def downgrade() -> None:
    for table in ("app_configurations", "tenant_configurations"):
        for col_name, _ in TECH_CONTEXT_COLUMNS:
            op.execute(
                f"ALTER TABLE {table} DROP COLUMN IF EXISTS {col_name}"
            )
