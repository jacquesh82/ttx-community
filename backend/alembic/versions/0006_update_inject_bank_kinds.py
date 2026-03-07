"""Migrate inject_bank_items.kind to schema-canonical values.

Old enum: idea, video, audio, scenario, chronogram, image, mail, message,
          directory, reference_url, social_post, document,
          canal_press, canal_anssi, canal_gouvernement, other
New enum (from JSON schema): mail, sms, call, socialnet, tv, doc, directory, story

Revision ID: 0006_update_inject_bank_kinds
Revises: 0005_add_exercise_options_config
Create Date: 2026-03-07
"""
from alembic import op


revision = '0006_update_inject_bank_kinds'
down_revision = '0005_add_exercise_options_config'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Step 1: Cast column to plain text so we can freely update values
    op.execute("ALTER TABLE inject_bank_items ALTER COLUMN kind TYPE text")

    # Step 2: Map removed kinds to nearest schema equivalent
    op.execute("UPDATE inject_bank_items SET kind = 'story'  WHERE kind IN ('idea', 'chronogram', 'scenario')")
    op.execute("UPDATE inject_bank_items SET kind = 'tv'     WHERE kind IN ('video', 'canal_press')")
    op.execute("UPDATE inject_bank_items SET kind = 'call'   WHERE kind = 'audio'")
    op.execute("UPDATE inject_bank_items SET kind = 'sms'    WHERE kind = 'message'")
    op.execute("UPDATE inject_bank_items SET kind = 'socialnet' WHERE kind = 'social_post'")
    op.execute("UPDATE inject_bank_items SET kind = 'doc'    WHERE kind IN ('document', 'image', 'reference_url', 'canal_anssi', 'canal_gouvernement', 'other')")

    # Step 3: Drop old enum type and recreate with canonical schema values
    op.execute("DROP TYPE IF EXISTS injectbankkind")
    op.execute("CREATE TYPE injectbankkind AS ENUM ('mail', 'sms', 'call', 'socialnet', 'tv', 'doc', 'directory', 'story')")

    # Step 4: Cast column back to new enum
    op.execute("ALTER TABLE inject_bank_items ALTER COLUMN kind TYPE injectbankkind USING kind::injectbankkind")


def downgrade() -> None:
    # Cast back to text, recreate old enum, restore column
    op.execute("ALTER TABLE inject_bank_items ALTER COLUMN kind TYPE text")
    op.execute("DROP TYPE IF EXISTS injectbankkind")
    op.execute("""
        CREATE TYPE injectbankkind AS ENUM (
            'idea', 'video', 'audio', 'scenario', 'chronogram', 'image',
            'mail', 'message', 'directory', 'reference_url', 'social_post',
            'document', 'canal_press', 'canal_anssi', 'canal_gouvernement', 'other'
        )
    """)
    # Best-effort reverse mapping (lossy)
    op.execute("UPDATE inject_bank_items SET kind = 'scenario'   WHERE kind = 'story'")
    op.execute("UPDATE inject_bank_items SET kind = 'video'      WHERE kind = 'tv'")
    op.execute("UPDATE inject_bank_items SET kind = 'audio'      WHERE kind = 'call'")
    op.execute("UPDATE inject_bank_items SET kind = 'message'    WHERE kind = 'sms'")
    op.execute("UPDATE inject_bank_items SET kind = 'social_post' WHERE kind = 'socialnet'")
    op.execute("UPDATE inject_bank_items SET kind = 'document'   WHERE kind = 'doc'")
    op.execute("ALTER TABLE inject_bank_items ALTER COLUMN kind TYPE injectbankkind USING kind::injectbankkind")
