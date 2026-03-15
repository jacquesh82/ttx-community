"""
Test fixtures for TTX Platform API test suite.

Architecture:
  - PostgreSQL-specific types (PgEnum, JSONB, ARRAY) are patched to SQLite-
    compatible equivalents BEFORE any app import.
  - A temp-file SQLite engine (NullPool) is injected into app.database,
    replacing the production Postgres engine.
  - app.main.seed_initial_data is replaced with a no-op.
  - Tables are created once (session scope); seed data inserted once.
  - Authenticated clients are built via POST /api/auth/login (no direct DB access).
  - asyncio_default_fixture_loop_scope = session (pytest.ini) ensures all
    async fixtures share the same event loop — no "different loop" errors.
"""

# ── Step 1 : patch PostgreSQL-specific types BEFORE any app import ────────────
import sqlalchemy.dialects.postgresql as _pg
from sqlalchemy import String as _String, JSON as _JSON
import sqlalchemy as _sa


class _SQLiteEnum(_String):
    """String shim — silently absorbs all PgEnum keyword arguments."""
    def __init__(self, *enums, **kw):
        for key in ("create_type", "validate_strings", "metadata", "name", "schema"):
            kw.pop(key, None)
        self.enums = list(enums)  # some routers access .enums to list valid values
        super().__init__(length=100)


class _SQLiteArray(_JSON):
    """JSON shim — stores PostgreSQL ARRAYs as JSON in SQLite."""
    def __init__(self, item_type=None, **kw):
        for key in ("as_tuple", "zero_indexes", "dimensions"):
            kw.pop(key, None)
        super().__init__()


_pg.ENUM = _SQLiteEnum    # type: ignore[assignment]
_pg.JSONB = _JSON         # type: ignore[assignment]
_sa.ARRAY = _SQLiteArray  # type: ignore[assignment]
# ─────────────────────────────────────────────────────────────────────────────

import os
import tempfile
from typing import AsyncGenerator

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.pool import NullPool

# ── Step 2 : import app modules (types already patched) ──────────────────────
from app.database import Base, get_db_session
import app.database as _db_mod
import app.main as _main_mod

from app.main import app
from app.models import (
    Tenant, TenantStatus, TenantConfiguration,
    User, UserRole,
)
from app.utils.security import hash_password

# ── Step 3 : create test engine (temp file + NullPool) ───────────────────────
_DB_FILE = tempfile.mktemp(suffix=".test.db")

_TEST_ENGINE = create_async_engine(
    f"sqlite+aiosqlite:///{_DB_FILE}",
    connect_args={"check_same_thread": False},
    poolclass=NullPool,
    echo=False,
)

_TEST_SESSION_FACTORY = async_sessionmaker(
    _TEST_ENGINE,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)

# ── Step 4 : inject test engine into ALL modules that hold a direct reference ─
import app.utils.tenancy as _tenancy_mod
import app.services.scheduler as _scheduler_mod

_db_mod.engine = _TEST_ENGINE
_db_mod.async_session_factory = _TEST_SESSION_FACTORY
_main_mod.async_session_factory = _TEST_SESSION_FACTORY
_tenancy_mod.async_session_factory = _TEST_SESSION_FACTORY  # type: ignore[assignment]
_scheduler_mod.async_session_factory = _TEST_SESSION_FACTORY  # type: ignore[assignment]


async def _noop_seed():
    pass


_main_mod.seed_initial_data = _noop_seed  # type: ignore[assignment]

# Override FastAPI dependency
async def _test_get_db() -> AsyncGenerator[AsyncSession, None]:
    async with _TEST_SESSION_FACTORY() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


app.dependency_overrides[get_db_session] = _test_get_db


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest_asyncio.fixture(scope="session")
async def create_tables():
    """Create all tables once per test session, drop on teardown."""
    async with _TEST_ENGINE.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with _TEST_ENGINE.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await _TEST_ENGINE.dispose()
    # Clean up temp file
    try:
        os.unlink(_DB_FILE)
    except OSError:
        pass


@pytest_asyncio.fixture(scope="session")
async def seed(create_tables):
    """
    Seed one Tenant + one User per role.
    Returns {"tenant": Tenant, "users": {UserRole: User}}.
    """
    async with _TEST_SESSION_FACTORY() as db:
        tenant = Tenant(
            slug="default",
            name="Test Tenant",
            status=TenantStatus.ACTIVE,
            is_active=True,
        )
        db.add(tenant)
        await db.flush()

        tc = TenantConfiguration(
            tenant_id=tenant.id,
            organization_name="Test Organisation",
        )
        db.add(tc)
        await db.flush()

        users: dict[UserRole, User] = {}
        for role in UserRole:
            u = User(
                tenant_id=tenant.id,
                username=f"test_{role.value}",
                email=f"test_{role.value}@ttx.test",
                password_hash=hash_password("TestPass1!"),
                role=role,
                is_active=True,
            )
            db.add(u)
            users[role] = u

        await db.commit()
        for u in users.values():
            await db.refresh(u)
        await db.refresh(tenant)

    return {"tenant": tenant, "users": users}


_TEST_PASSWORD = "TestPass1!"


def _build_client(cookies: dict | None = None) -> AsyncClient:
    return AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://localhost",
        headers={"Host": "localhost"},
        cookies=cookies or {},
        follow_redirects=True,
    )


async def _login_client(username: str) -> AsyncClient:
    """Login via POST /api/auth/login and return an authenticated client."""
    c = _build_client()
    await c.__aenter__()
    resp = await c.post("/api/auth/login", json={
        "username_or_email": username,
        "password": _TEST_PASSWORD,
    })
    assert resp.status_code == 200, f"Login failed for {username}: {resp.text}"
    return c


# ── Per-test clients ──────────────────────────────────────────────────────────

@pytest_asyncio.fixture
async def client(seed) -> AsyncGenerator[AsyncClient, None]:
    async with _build_client() as c:
        yield c


@pytest_asyncio.fixture
async def admin_client(seed) -> AsyncGenerator[AsyncClient, None]:
    c = await _login_client(f"test_{UserRole.ADMIN.value}")
    try:
        yield c
    finally:
        await c.aclose()


@pytest_asyncio.fixture
async def animateur_client(seed) -> AsyncGenerator[AsyncClient, None]:
    c = await _login_client(f"test_{UserRole.ANIMATEUR.value}")
    try:
        yield c
    finally:
        await c.aclose()


@pytest_asyncio.fixture
async def observateur_client(seed) -> AsyncGenerator[AsyncClient, None]:
    c = await _login_client(f"test_{UserRole.OBSERVATEUR.value}")
    try:
        yield c
    finally:
        await c.aclose()


@pytest_asyncio.fixture
async def participant_client(seed) -> AsyncGenerator[AsyncClient, None]:
    c = await _login_client(f"test_{UserRole.PARTICIPANT.value}")
    try:
        yield c
    finally:
        await c.aclose()
