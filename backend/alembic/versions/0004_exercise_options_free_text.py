"""Make exercise socle fields configurable free text and add default_exercise_type.

Revision ID: 0004_exercise_options_free_text
Revises: b2c3d4e5f6a7
Create Date: 2026-03-07
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '0004_exercise_options_free_text'
down_revision = 'b2c3d4e5f6a7'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'app_configurations',
        sa.Column('default_exercise_type', sa.String(length=50), nullable=False, server_default='cyber'),
    )

    op.alter_column(
        'exercises',
        'exercise_type',
        existing_type=sa.Enum('CYBER', 'IT_OUTAGE', 'RANSOMWARE', 'MIXED', name='exercisetype'),
        type_=sa.String(length=50),
        postgresql_using='lower(exercise_type::text)',
        existing_nullable=False,
    )
    op.alter_column(
        'exercises',
        'maturity_level',
        existing_type=sa.Enum('BEGINNER', 'INTERMEDIATE', 'EXPERT', name='exercisematuritylevel'),
        type_=sa.String(length=50),
        postgresql_using='lower(maturity_level::text)',
        existing_nullable=False,
    )
    op.alter_column(
        'exercises',
        'mode',
        existing_type=sa.Enum('REAL_TIME', 'COMPRESSED', 'SIMULATED', name='exercisemode'),
        type_=sa.String(length=50),
        postgresql_using='lower(mode::text)',
        existing_nullable=False,
    )

    op.execute('DROP TYPE IF EXISTS exercisetype')
    op.execute('DROP TYPE IF EXISTS exercisematuritylevel')
    op.execute('DROP TYPE IF EXISTS exercisemode')


def downgrade() -> None:
    op.execute("CREATE TYPE exercisetype AS ENUM ('CYBER', 'IT_OUTAGE', 'RANSOMWARE', 'MIXED')")
    op.execute("CREATE TYPE exercisematuritylevel AS ENUM ('BEGINNER', 'INTERMEDIATE', 'EXPERT')")
    op.execute("CREATE TYPE exercisemode AS ENUM ('REAL_TIME', 'COMPRESSED', 'SIMULATED')")

    op.execute(
        """
        ALTER TABLE exercises
        ALTER COLUMN exercise_type TYPE exercisetype
        USING (
            CASE lower(exercise_type)
                WHEN 'cyber' THEN 'CYBER'::exercisetype
                WHEN 'it_outage' THEN 'IT_OUTAGE'::exercisetype
                WHEN 'ransomware' THEN 'RANSOMWARE'::exercisetype
                WHEN 'mixed' THEN 'MIXED'::exercisetype
                ELSE 'MIXED'::exercisetype
            END
        )
        """
    )
    op.execute(
        """
        ALTER TABLE exercises
        ALTER COLUMN maturity_level TYPE exercisematuritylevel
        USING (
            CASE lower(maturity_level)
                WHEN 'beginner' THEN 'BEGINNER'::exercisematuritylevel
                WHEN 'intermediate' THEN 'INTERMEDIATE'::exercisematuritylevel
                WHEN 'expert' THEN 'EXPERT'::exercisematuritylevel
                ELSE 'BEGINNER'::exercisematuritylevel
            END
        )
        """
    )
    op.execute(
        """
        ALTER TABLE exercises
        ALTER COLUMN mode TYPE exercisemode
        USING (
            CASE lower(mode)
                WHEN 'real_time' THEN 'REAL_TIME'::exercisemode
                WHEN 'compressed' THEN 'COMPRESSED'::exercisemode
                WHEN 'simulated' THEN 'SIMULATED'::exercisemode
                ELSE 'REAL_TIME'::exercisemode
            END
        )
        """
    )

    op.drop_column('app_configurations', 'default_exercise_type')
