"""Auto-seed initial data on first startup."""
from sqlalchemy import select

from app.database import async_session_factory
from app.models import Tenant, TenantStatus, User, UserRole
from app.utils.security import hash_password


async def seed_initial_data() -> None:
    """Create default tenant and admin user if they don't exist.

    Idempotent: safe to call on every startup.
    """
    async with async_session_factory() as session:
        # -- Default tenant --------------------------------------------------
        result = await session.execute(
            select(Tenant).where(Tenant.slug == "default")
        )
        tenant = result.scalar_one_or_none()
        if not tenant:
            tenant = Tenant(
                slug="default",
                name="Default",
                status=TenantStatus.ACTIVE,
                is_active=True,
            )
            session.add(tenant)
            await session.flush()
            print("[seed] Default tenant created")

        # -- Admin user ------------------------------------------------------
        result = await session.execute(
            select(User).where(
                User.tenant_id == tenant.id,
                User.role == UserRole.ADMIN,
            ).limit(1)
        )
        admin = result.scalar_one_or_none()
        if not admin:
            session.add(User(
                username="admin",
                email="admin@ttx.local",
                password_hash=hash_password("Admin123!"),
                role=UserRole.ADMIN,
                is_active=True,
                tenant_id=tenant.id,
            ))
            print("[seed] Admin user created  →  admin / Admin123!")
            print("[seed] WARNING: change the default password before going to production!")

        await session.commit()
