"""Compatibility shim for accidental external 0007 revision reference.

Revision ID: 0007_rename_default_exercise_type_to_mode
Revises: 0006_update_inject_bank_kinds
Create Date: 2026-03-07
"""
from alembic import op


revision = "0007_rename_default_exercise_type_to_mode"
down_revision = "0006_update_inject_bank_kinds"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # No-op shim to reconnect local Alembic history.
    pass


def downgrade() -> None:
    # No-op shim.
    pass
