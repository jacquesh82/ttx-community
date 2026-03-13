#!/usr/bin/env python3
"""TTX Platform CLI — manage.py

Usage:
  manage.py db migrate
  manage.py db reset

  manage.py seed users
  manage.py seed teams [--no-assign]
  manage.py seed exercise
  manage.py seed exercise-content [--force]
  manage.py seed contacts [--exercise-id N] [--reset]
  manage.py seed organisation [--force]
  manage.py seed all

  manage.py init [--reset] [--demo] [--skip-migrate]

  manage.py tenant create <slug> <name> [--domain D] [--no-domain]

  manage.py info
"""
import argparse
import asyncio
import subprocess
import sys
from pathlib import Path

# Resolve paths for imports
_SCRIPTS_DIR = Path(__file__).parent
_BACKEND_DIR = _SCRIPTS_DIR.parent

sys.path.insert(0, str(_BACKEND_DIR))   # for app.*
sys.path.insert(0, str(_SCRIPTS_DIR))   # for data.*


# ─────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────

async def _cleanup():
    from app.database import engine
    await engine.dispose()


def run(coro):
    """Run an async coroutine and always dispose the engine."""
    async def _wrapped():
        try:
            await coro
        finally:
            await _cleanup()
    asyncio.run(_wrapped())


async def _reset_schema():
    from sqlalchemy import text
    from app.database import engine
    print("⚠️  Suppression du schéma public...")
    async with engine.begin() as conn:
        await conn.execute(text("DROP SCHEMA public CASCADE"))
        await conn.execute(text("CREATE SCHEMA public"))
        await conn.execute(text("GRANT ALL ON SCHEMA public TO PUBLIC"))
    print("✅ Schéma recréé")


def _in_docker() -> bool:
    return Path("/.dockerenv").exists()


def _run_alembic_migrate() -> bool:
    if _in_docker():
        cmd = ["alembic", "upgrade", "head"]
        cwd = _BACKEND_DIR
    else:
        cmd = ["docker", "compose", "exec", "ttx-community-backend", "alembic", "upgrade", "head"]
        cwd = _BACKEND_DIR.parent  # repo root (where docker-compose.yml lives)
    result = subprocess.run(cmd, cwd=cwd)
    return result.returncode == 0


async def _create_tables_fallback():
    from app.database import engine, Base
    print("📦 Fallback: création des tables via SQLAlchemy...")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("✅ Tables créées")


# ─────────────────────────────────────────────
# db subcommands
# ─────────────────────────────────────────────

def cmd_db_migrate(args):
    """alembic upgrade head"""
    print("📦 Exécution des migrations Alembic...")
    ok = _run_alembic_migrate()
    if ok:
        print("✅ Migrations exécutées")
    else:
        print("❌ Erreur lors des migrations", file=sys.stderr)
        sys.exit(1)


def cmd_db_reset(args):
    """Drop schema + migrate"""
    run(_reset_schema())
    cmd_db_migrate(args)


# ─────────────────────────────────────────────
# seed subcommands
# ─────────────────────────────────────────────

def cmd_seed_users(args):
    from data.users import create_users
    from data.timeline import ensure_default_tenant

    async def _run():
        tenant = await ensure_default_tenant()
        await create_users(tenant.id)

    run(_run())


def cmd_seed_teams(args):
    from data.users import create_users, create_teams_and_assign
    from data.timeline import ensure_default_tenant

    async def _run():
        tenant = await ensure_default_tenant()
        users = await create_users(tenant.id)
        await create_teams_and_assign(users, tenant.id, skip_assign=args.no_assign)

    run(_run())


def cmd_seed_exercise(args):
    from data.users import create_users, create_teams_and_assign
    from data.exercises import create_demo_exercise, seed_demo_exercise_content
    from data.timeline import ensure_default_tenant

    async def _run():
        tenant = await ensure_default_tenant()
        users = await create_users(tenant.id)
        teams = await create_teams_and_assign(users, tenant.id)
        exercise = await create_demo_exercise(users, teams, tenant.id)
        if exercise:
            await seed_demo_exercise_content(exercise, users)

    run(_run())


def cmd_seed_contacts(args):
    from data.contacts import get_or_create_exercise, create_crisis_contacts, reset_crisis_contacts

    async def _run():
        exercise_id = await get_or_create_exercise(args.exercise_id)
        if args.reset:
            await reset_crisis_contacts(exercise_id)
        await create_crisis_contacts(exercise_id)

    run(_run())


def cmd_seed_exercise_content(args):
    from data.users import create_users, create_teams_and_assign
    from data.exercises import create_demo_exercise, seed_demo_exercise_content
    from data.timeline import ensure_default_tenant

    async def _run():
        tenant = await ensure_default_tenant()
        users = await create_users(tenant.id)
        teams = await create_teams_and_assign(users, tenant.id)
        exercise = await create_demo_exercise(users, teams, tenant.id)
        if exercise:
            await seed_demo_exercise_content(exercise, users, force=args.force)

    run(_run())


def cmd_seed_organisation(args):
    from data.organisation import seed_demo_organisation
    from data.timeline import ensure_default_tenant

    async def _run():
        tenant = await ensure_default_tenant()
        await seed_demo_organisation(tenant, force=args.force)

    run(_run())


def cmd_seed_all(args):
    from data.users import create_users, create_teams_and_assign
    from data.exercises import create_demo_exercise, seed_demo_exercise_content
    from data.contacts import create_crisis_contacts
    from data.timeline import ensure_default_tenant, ensure_default_timeline_configuration
    from data.organisation import seed_demo_organisation

    async def _run():
        tenant = await ensure_default_tenant()
        await ensure_default_timeline_configuration(tenant)
        await seed_demo_organisation(tenant)
        users = await create_users(tenant.id)
        teams = await create_teams_and_assign(users, tenant.id)
        exercise = await create_demo_exercise(users, teams, tenant.id)
        if exercise:
            await seed_demo_exercise_content(exercise, users)
            await create_crisis_contacts(exercise.id)

    run(_run())


# ─────────────────────────────────────────────
# init subcommand
# ─────────────────────────────────────────────

def cmd_init(args):
    from data.users import create_users, create_teams_and_assign, print_summary
    from data.exercises import create_demo_exercise, seed_demo_exercise_content
    from data.contacts import create_crisis_contacts
    from data.timeline import ensure_default_tenant, ensure_default_timeline_configuration
    from data.organisation import seed_demo_organisation

    async def _run():
        if args.reset:
            await _reset_schema()

        if not args.skip_migrate:
            print("📦 Exécution des migrations Alembic...")
            ok = _run_alembic_migrate()
            if not ok:
                print("⚠️  Migrations échouées, fallback SQLAlchemy...")
                await _create_tables_fallback()
        else:
            print("⏭️  Migrations ignorées (--skip-migrate)")
            await _create_tables_fallback()

        tenant = await ensure_default_tenant()
        await ensure_default_timeline_configuration(tenant)
        users = await create_users(tenant.id)
        teams = await create_teams_and_assign(users, tenant.id)

        exercise = None
        if args.demo:
            await seed_demo_organisation(tenant)
            exercise = await create_demo_exercise(users, teams, tenant.id)
            if exercise:
                await seed_demo_exercise_content(exercise, users)
                await create_crisis_contacts(exercise.id)

        print_summary(exercise)

    run(_run())


# ─────────────────────────────────────────────
# tenant create subcommand
# ─────────────────────────────────────────────

def cmd_tenant_create(args):
    from sqlalchemy import select
    from app.database import async_session_factory
    from app.models.tenant import Tenant, TenantStatus, TenantDomain, TenantDomainType

    domain = args.domain or f"{args.slug}.localhost"

    async def _run():
        async with async_session_factory() as session:
            result = await session.execute(
                select(Tenant).where(Tenant.slug == args.slug)
            )
            tenant = result.scalar_one_or_none()

            if tenant:
                print(f"⏭️  Tenant '{args.slug}' existe déjà (id={tenant.id})")
            else:
                tenant = Tenant(
                    slug=args.slug,
                    name=args.name,
                    status=TenantStatus.ACTIVE,
                    is_active=True,
                    primary_domain=domain if not args.no_domain else None,
                )
                session.add(tenant)
                await session.flush()
                print(f"✅ Tenant '{args.slug}' créé (id={tenant.id})")

            if not args.no_domain:
                result = await session.execute(
                    select(TenantDomain).where(TenantDomain.domain == domain)
                )
                existing_domain = result.scalar_one_or_none()
                if existing_domain:
                    print(f"⏭️  Domaine '{domain}' existe déjà")
                else:
                    session.add(TenantDomain(
                        tenant_id=tenant.id,
                        domain=domain,
                        domain_type=TenantDomainType.SUBDOMAIN,
                        is_primary=True,
                        is_verified=True,
                    ))
                    print(f"✅ Domaine '{domain}' créé")

            await session.commit()

        print(f"\nTenant prêt:")
        print(f"  Slug   : {args.slug}")
        print(f"  Name   : {args.name}")
        if not args.no_domain:
            print(f"  Domain : {domain}")
            print(f"  URL    : http://{domain}:5173/login")

    run(_run())


# ─────────────────────────────────────────────
# info subcommand
# ─────────────────────────────────────────────

def cmd_info(args):
    from sqlalchemy import select, func
    from app.database import async_session_factory
    from app.models import Tenant, User
    from app.models.exercise import Exercise

    async def _run():
        async with async_session_factory() as session:
            tenants = (await session.execute(select(func.count()).select_from(Tenant))).scalar()
            users = (await session.execute(select(func.count()).select_from(User))).scalar()
            exercises = (await session.execute(select(func.count()).select_from(Exercise))).scalar()

        print(f"Tenants  : {tenants}")
        print(f"Users    : {users}")
        print(f"Exercises: {exercises}")

    run(_run())
    subprocess.run(["alembic", "current"], cwd=_BACKEND_DIR)


# ─────────────────────────────────────────────
# CLI setup
# ─────────────────────────────────────────────

def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="manage.py",
        description="TTX Platform management CLI",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    sub = parser.add_subparsers(dest="command", metavar="<command>")
    sub.required = True

    # ── db ──────────────────────────────────────────────────────
    db = sub.add_parser("db", help="Database operations")
    db_sub = db.add_subparsers(dest="db_action", metavar="<action>")
    db_sub.required = True

    db_sub.add_parser("migrate", help="Run alembic upgrade head")
    db_sub.add_parser("reset", help="Drop schema + run migrations")

    # ── seed ────────────────────────────────────────────────────
    seed = sub.add_parser("seed", help="Seed demo data")
    seed_sub = seed.add_subparsers(dest="seed_action", metavar="<action>")
    seed_sub.required = True

    seed_sub.add_parser("users", help="Create initial users")

    seed_teams = seed_sub.add_parser("teams", help="Create teams and assign members")
    seed_teams.add_argument("--no-assign", action="store_true", help="Skip member assignment")

    seed_sub.add_parser("exercise", help="Create demo exercise")

    seed_ex_content = seed_sub.add_parser("exercise-content", help="Seed demo exercise full content (scenario, phases, injects)")
    seed_ex_content.add_argument("--force", action="store_true", help="Overwrite existing content")

    seed_contacts = seed_sub.add_parser("contacts", help="Create crisis contacts")
    seed_contacts.add_argument("--exercise-id", type=int, metavar="N", help="Target exercise ID")
    seed_contacts.add_argument("--reset", action="store_true", help="Delete existing contacts first")

    seed_org = seed_sub.add_parser("organisation", help="Seed demo organisation data")
    seed_org.add_argument("--force", action="store_true", help="Overwrite existing values")

    seed_sub.add_parser("all", help="users + teams + exercise + contacts + organisation")

    # ── init ────────────────────────────────────────────────────
    init = sub.add_parser("init", help="Full environment initialisation")
    init.add_argument("--reset", action="store_true", help="Drop schema before init")
    init.add_argument("--demo", action="store_true", help="Create demo exercise + contacts")
    init.add_argument("--skip-migrate", action="store_true", help="Skip alembic migrations")

    # ── tenant ──────────────────────────────────────────────────
    tenant = sub.add_parser("tenant", help="Tenant management")
    tenant_sub = tenant.add_subparsers(dest="tenant_action", metavar="<action>")
    tenant_sub.required = True

    tenant_create = tenant_sub.add_parser("create", help="Create a new tenant")
    tenant_create.add_argument("slug", help="Tenant slug (lowercase, a-z0-9-)")
    tenant_create.add_argument("name", help="Tenant display name")
    tenant_create.add_argument("--domain", metavar="D", help="Domain mapping (default: <slug>.localhost)")
    tenant_create.add_argument("--no-domain", action="store_true", help="Skip domain creation")

    # ── info ────────────────────────────────────────────────────
    sub.add_parser("info", help="Show platform info (tenants, users, exercises, alembic)")

    return parser


def main():
    parser = build_parser()
    args = parser.parse_args()

    try:
        if args.command == "db":
            if args.db_action == "migrate":
                cmd_db_migrate(args)
            elif args.db_action == "reset":
                cmd_db_reset(args)

        elif args.command == "seed":
            if args.seed_action == "users":
                cmd_seed_users(args)
            elif args.seed_action == "teams":
                cmd_seed_teams(args)
            elif args.seed_action == "exercise":
                cmd_seed_exercise(args)
            elif args.seed_action == "exercise-content":
                cmd_seed_exercise_content(args)
            elif args.seed_action == "contacts":
                cmd_seed_contacts(args)
            elif args.seed_action == "organisation":
                cmd_seed_organisation(args)
            elif args.seed_action == "all":
                cmd_seed_all(args)

        elif args.command == "init":
            cmd_init(args)

        elif args.command == "tenant":
            if args.tenant_action == "create":
                cmd_tenant_create(args)

        elif args.command == "info":
            cmd_info(args)

    except Exception as e:
        print(f"\n❌ Erreur: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
