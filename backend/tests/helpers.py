"""
Shared factory helpers for creating test data directly in the DB,
bypassing the HTTP layer for speed and fixture isolation.
"""
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Exercise, ExerciseStatus, Team, Inject, InjectStatus, InjectType
from app.models.crisis_contact import CrisisContact, ContactCategory, ContactPriority
from app.models.inject_bank import InjectBankItem, InjectBankKind, InjectBankStatus
from app.models.twitter import TwitterAccount, TwitterAccountType
from app.models.tv import TVChannel


async def create_exercise(
    db: AsyncSession,
    *,
    tenant_id: int,
    created_by: int,
    name: str = "Test Exercise",
    exercise_type: str = "cyber",
    status: ExerciseStatus = ExerciseStatus.DRAFT,
) -> Exercise:
    ex = Exercise(
        tenant_id=tenant_id,
        name=name,
        exercise_type=exercise_type,
        target_duration_hours=4,
        maturity_level="intermediate",
        mode="real_time",
        status=status,
        created_by=created_by,
    )
    db.add(ex)
    await db.flush()
    await db.refresh(ex)
    return ex


async def create_team(
    db: AsyncSession,
    *,
    tenant_id: int,
    name: str = "Test Team",
    color: str = "#3B82F6",
) -> Team:
    team = Team(tenant_id=tenant_id, name=name, color=color)
    db.add(team)
    await db.flush()
    await db.refresh(team)
    return team


async def create_inject(
    db: AsyncSession,
    *,
    tenant_id: int,
    exercise_id: int,
    created_by: int,
    title: str = "Test Inject",
    inject_type: InjectType = InjectType.MAIL,
) -> Inject:
    inject = Inject(
        tenant_id=tenant_id,
        exercise_id=exercise_id,
        title=title,
        inject_type=inject_type,
        status=InjectStatus.DRAFT,
        created_by=created_by,
        scheduled_offset_minutes=0,
    )
    db.add(inject)
    await db.flush()
    await db.refresh(inject)
    return inject


async def create_crisis_contact(
    db: AsyncSession,
    *,
    tenant_id: int,
    exercise_id: int,
    name: str = "Test Contact",
    role: str = "RSSI",
) -> CrisisContact:
    c = CrisisContact(
        tenant_id=tenant_id,
        exercise_id=exercise_id,
        name=name,
        role=role,
        category=ContactCategory.INTERNAL,
        priority=ContactPriority.HIGH,
    )
    db.add(c)
    await db.flush()
    await db.refresh(c)
    return c


async def create_inject_bank_item(
    db: AsyncSession,
    *,
    tenant_id: int,
    created_by: int,
    title: str = "Bank Item",
    kind: InjectBankKind = InjectBankKind.MAIL,
) -> InjectBankItem:
    item = InjectBankItem(
        tenant_id=tenant_id,
        title=title,
        kind=kind,
        status=InjectBankStatus.DRAFT,
        data_format="text",
        payload={},
        tags=[],
        created_by=created_by,
    )
    db.add(item)
    await db.flush()
    await db.refresh(item)
    return item


async def create_twitter_account(
    db: AsyncSession,
    *,
    tenant_id: int,
    exercise_id: int,
    handle: str = "test_account",
) -> TwitterAccount:
    acc = TwitterAccount(
        tenant_id=tenant_id,
        exercise_id=exercise_id,
        handle=handle,
        display_name="Test Account",
        account_type=TwitterAccountType.NPC,
        follower_count=100,
        following_count=50,
        is_verified=False,
        bio="",
    )
    db.add(acc)
    await db.flush()
    await db.refresh(acc)
    return acc


async def create_tv_channel(
    db: AsyncSession,
    *,
    tenant_id: int,
    exercise_id: int,
    name: str = "Test Channel",
) -> TVChannel:
    ch = TVChannel(
        tenant_id=tenant_id,
        exercise_id=exercise_id,
        name=name,
        slug="test-channel",
        description="",
    )
    db.add(ch)
    await db.flush()
    await db.refresh(ch)
    return ch
