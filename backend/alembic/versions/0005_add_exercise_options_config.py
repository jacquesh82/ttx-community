"""Add crisis_cell_roles_config and other exercise options config columns.

Revision ID: 0005_add_exercise_options_config
Revises: 0004_exercise_options_free_text
Create Date: 2026-03-07
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '0005_add_exercise_options_config'
down_revision = '0004_exercise_options_free_text'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'app_configurations',
        sa.Column('exercise_type_options_config', sa.Text(), nullable=True),
    )
    op.add_column(
        'app_configurations',
        sa.Column('exercise_duration_options_config', sa.Text(), nullable=True),
    )
    op.add_column(
        'app_configurations',
        sa.Column('exercise_maturity_options_config', sa.Text(), nullable=True),
    )
    op.add_column(
        'app_configurations',
        sa.Column('exercise_mode_options_config', sa.Text(), nullable=True),
    )
    op.add_column(
        'app_configurations',
        sa.Column('crisis_cell_roles_config', sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('app_configurations', 'crisis_cell_roles_config')
    op.drop_column('app_configurations', 'exercise_mode_options_config')
    op.drop_column('app_configurations', 'exercise_maturity_options_config')
    op.drop_column('app_configurations', 'exercise_duration_options_config')
    op.drop_column('app_configurations', 'exercise_type_options_config')
