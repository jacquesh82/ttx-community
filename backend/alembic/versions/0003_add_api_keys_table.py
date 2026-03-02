"""add_api_keys_table

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-03-02 00:01:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b2c3d4e5f6a7'
down_revision: Union[str, None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'api_keys',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('key', sa.String(length=128), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('last_used_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_api_keys')),
        sa.UniqueConstraint('key', name=op.f('uq_api_keys_key')),
    )
    op.create_index(op.f('ix_api_keys_key'), 'api_keys', ['key'], unique=True)

    # Remove the now-unused singleton api_key fields
    op.drop_column('app_configurations', 'api_key')
    op.drop_column('app_configurations', 'api_key_enabled')


def downgrade() -> None:
    op.drop_index(op.f('ix_api_keys_key'), table_name='api_keys')
    op.drop_table('api_keys')
    op.add_column('app_configurations', sa.Column('api_key_enabled', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('app_configurations', sa.Column('api_key', sa.String(length=128), nullable=True))
