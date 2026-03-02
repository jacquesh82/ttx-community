"""add_api_key

Revision ID: a1b2c3d4e5f6
Revises: d77b9ff3fa28
Create Date: 2026-03-02 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = 'd77b9ff3fa28'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('app_configurations', sa.Column('api_key_enabled', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('app_configurations', sa.Column('api_key', sa.String(length=128), nullable=True))


def downgrade() -> None:
    op.drop_column('app_configurations', 'api_key')
    op.drop_column('app_configurations', 'api_key_enabled')
