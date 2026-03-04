#!/usr/bin/env python3
"""
Script d'initialisation complète de l'environnement TTX Platform.

Crée les utilisateurs (tous les rôles), les équipes, assigne les membres,
et optionnellement un exercice de démonstration avec tous les rôles assignés.

Usage:
    python scripts/init_env.py [options]

Options:
    --reset           Supprime toutes les données existantes avant d'initialiser
    --demo-exercise   Crée également un exercice de démonstration complet
    --users-only      Crée uniquement les utilisateurs
    --teams-only      Crée uniquement les équipes
    --no-assign       Ne pas assigner les membres aux équipes
    --skip-migrations Skip Alembic migrations (use existing schema)

Exemples:
    python scripts/init_env.py                         # Init standard
    python scripts/init_env.py --demo-exercise         # Avec exercice démo
    python scripts/init_env.py --reset --demo-exercise # Reset complet + démo
"""
import asyncio
import argparse
import subprocess
import sys
import json
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import select, text
from app.database import engine, async_session_factory, Base
from app.models import User, Team, Tenant, TenantStatus, TenantConfiguration
from app.models.user import UserRole
from app.models.team import UserTeam
from app.models.exercise import Exercise, ExerciseStatus, ExerciseTeam
from app.models.exercise_user import ExerciseUser, ExerciseRole
from app.utils.security import hash_password


# ─────────────────────────────────────────────
# Données de configuration
# ─────────────────────────────────────────────

INITIAL_USERS = [
    # ── Admin ──────────────────────────────────
    {
        "username": "admin",
        "email": "admin@ttx.local",
        "password": "Admin123!",
        "role": UserRole.ADMIN,
        "display": "Administrateur plateforme",
    },
    # ── Animateurs ─────────────────────────────
    {
        "username": "animateur1",
        "email": "animateur1@ttx.local",
        "password": "Anim123!",
        "role": UserRole.ANIMATEUR,
        "display": "Animateur principal",
    },
    {
        "username": "animateur2",
        "email": "animateur2@ttx.local",
        "password": "Anim123!",
        "role": UserRole.ANIMATEUR,
        "display": "Animateur secondaire",
    },
    # ── Observateurs ───────────────────────────
    {
        "username": "observateur1",
        "email": "observateur1@ttx.local",
        "password": "Obs123!",
        "role": UserRole.OBSERVATEUR,
        "display": "Observateur évaluateur",
    },
    {
        "username": "observateur2",
        "email": "observateur2@ttx.local",
        "password": "Obs123!",
        "role": UserRole.OBSERVATEUR,
        "display": "Observateur formateur",
    },
    # ── Participants ────────────────────────────
    {
        "username": "participant1",
        "email": "participant1@ttx.local",
        "password": "Part123!",
        "role": UserRole.PARTICIPANT,
        "display": "Directeur de crise (Alpha)",
    },
    {
        "username": "participant2",
        "email": "participant2@ttx.local",
        "password": "Part123!",
        "role": UserRole.PARTICIPANT,
        "display": "Responsable communication (Alpha)",
    },
    {
        "username": "participant3",
        "email": "participant3@ttx.local",
        "password": "Part123!",
        "role": UserRole.PARTICIPANT,
        "display": "Responsable technique (Alpha)",
    },
    {
        "username": "participant4",
        "email": "participant4@ttx.local",
        "password": "Part123!",
        "role": UserRole.PARTICIPANT,
        "display": "Chef de projet (Beta)",
    },
    {
        "username": "participant5",
        "email": "participant5@ttx.local",
        "password": "Part123!",
        "role": UserRole.PARTICIPANT,
        "display": "Ingénieur sécurité (Beta)",
    },
    {
        "username": "participant6",
        "email": "participant6@ttx.local",
        "password": "Part123!",
        "role": UserRole.PARTICIPANT,
        "display": "Directeur (Cellule de crise)",
    },
]

INITIAL_TEAMS = [
    {
        "name": "Équipe Alpha",
        "description": "Équipe de réponse principale – direction opérationnelle",
        "leader_username": "participant1",
        "members": ["participant1", "participant2", "participant3"],
    },
    {
        "name": "Équipe Beta",
        "description": "Équipe de support technique – infrastructure et sécurité",
        "leader_username": "participant4",
        "members": ["participant4", "participant5"],
    },
    {
        "name": "Cellule de Crise",
        "description": "Direction de la cellule de crise – prise de décision stratégique",
        "leader_username": "participant6",
        "members": ["participant6"],
    },
]

DEMO_EXERCISE = {
    "name": "Exercice CYBER-STORM 2024",
    "description": (
        "Simulation d'une cyber-attaque majeure sur l'infrastructure critique. "
        "Les équipes doivent gérer la communication de crise, coordonner la réponse technique "
        "et prendre des décisions stratégiques sous pression temporelle."
    ),
    "status": ExerciseStatus.DRAFT,
    # Rôles dans l'exercice : username → ExerciseRole
    "user_roles": {
        "animateur1": ExerciseRole.ANIMATEUR,
        "animateur2": ExerciseRole.ANIMATEUR,
        "observateur1": ExerciseRole.OBSERVATEUR,
        "observateur2": ExerciseRole.OBSERVATEUR,
        "participant1": ExerciseRole.JOUEUR,
        "participant2": ExerciseRole.JOUEUR,
        "participant3": ExerciseRole.JOUEUR,
        "participant4": ExerciseRole.JOUEUR,
        "participant5": ExerciseRole.JOUEUR,
        "participant6": ExerciseRole.JOUEUR,
    },
    # Équipes participantes dans cet exercice
    "teams": ["Équipe Alpha", "Équipe Beta", "Cellule de Crise"],
}

CLASSIQUE_PHASES_ENABLED = {
    "Détection",
    "Qualification",
    "Alerte",
    "Activation de la cellule de crise",
    "Analyse de situation",
    "Décisions stratégiques",
    "Endiguement",
    "Remédiation technique",
    "Clôture de crise",
}

TIMELINE_DEFAULT_INJECT_TYPES_FORMATS = [
    {"type": "Mail", "formats": ["TXT"], "simulator": "mail"},
    {"type": "SMS", "formats": ["TXT", "IMAGE"], "simulator": "sms"},
    {"type": "Call", "formats": ["AUDIO"], "simulator": "tel"},
    {"type": "Social network", "formats": ["TXT", "VIDEO", "IMAGE"], "simulator": "social"},
    {"type": "TV", "formats": ["VIDEO"], "simulator": "tv"},
    {"type": "Document", "formats": ["TXT", "IMAGE"], "simulator": "mail"},
    {"type": "Annuaire de crise", "formats": ["TXT"], "simulator": None},
    {"type": "Scenario", "formats": ["TXT"], "simulator": None},
]

TIMELINE_DEFAULT_SOURCE_IDS = [
    "fr-press-lemonde", "fr-press-lefigaro", "fr-tv-france24", "fr-tv-bfmtv", "fr-gov-gouvernement", "fr-gov-anssi",
    "us-press-nyt", "us-press-wp", "us-tv-cnn", "us-tv-foxnews", "us-gov-cisa", "us-gov-whitehouse",
    "de-press-spiegel", "de-press-faz", "de-tv-dw", "de-tv-zdf", "de-gov-bsi", "de-gov-bundesregierung",
    "es-press-pais", "es-press-mundo", "es-tv-rtve", "es-tv-antena3", "es-gov-incibe", "es-gov-lamoncloa",
    "uk-press-bbcnews", "uk-press-guardian", "uk-tv-skynews", "uk-tv-bbcone", "uk-gov-ncsc", "uk-gov-govuk",
]


# ─────────────────────────────────────────────
# Fonctions d'initialisation
# ─────────────────────────────────────────────

async def reset_database():
    """Supprime toutes les tables et le schéma Alembic."""
    print("⚠️  Suppression de toutes les tables...")
    async with engine.begin() as conn:
        # Drop and recreate schema to bypass FK dependency ordering issues
        await conn.execute(text("DROP SCHEMA public CASCADE"))
        await conn.execute(text("CREATE SCHEMA public"))
        await conn.execute(text("GRANT ALL ON SCHEMA public TO PUBLIC"))
    print("✅ Tables supprimées")


def run_alembic_migrations():
    """Exécute les migrations Alembic pour créer le schéma."""
    print("📦 Exécution des migrations Alembic...")
    backend_dir = Path(__file__).parent.parent
    
    # Run alembic upgrade head
    result = subprocess.run(
        ["alembic", "upgrade", "head"],
        cwd=backend_dir,
        capture_output=True,
        text=True
    )
    
    if result.returncode != 0:
        print(f"⚠️  Erreur lors des migrations: {result.stderr[:500]}...")
        print("⚠️  Tentative avec create_all()...")
        return False
    
    print("✅ Migrations exécutées avec succès")
    return True


async def create_tables_fallback():
    """Crée toutes les tables via SQLAlchemy (fallback si pas de migrations)."""
    print("📦 Création des tables via SQLAlchemy...")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("✅ Tables créées")


async def create_default_tenant() -> Tenant:
    """Crée le tenant par défaut si absent (requis même en mode community)."""
    print("\n🏠 Création du tenant par défaut...")
    async with async_session_factory() as session:
        result = await session.execute(select(Tenant).where(Tenant.slug == "default"))
        existing = result.scalar_one_or_none()
        if existing:
            print("  ⏭️  Tenant 'default' existe déjà")
            return existing
        tenant = Tenant(
            slug="default",
            name="Default",
            status=TenantStatus.ACTIVE,
            is_active=True,
        )
        session.add(tenant)
        await session.commit()
        await session.refresh(tenant)
        print("  ✅ Tenant 'default' créé")
        return tenant


async def ensure_default_timeline_configuration(tenant: Tenant) -> None:
    """Seed timeline-related tenant overrides if absent.

    Keeps existing values untouched and only fills missing keys.
    """
    print("\n🧭 Initialisation des presets Timeline par défaut...")
    async with async_session_factory() as session:
        result = await session.execute(
            select(TenantConfiguration).where(TenantConfiguration.tenant_id == tenant.id)
        )
        config = result.scalar_one_or_none()
        if not config:
            config = TenantConfiguration(
                tenant_id=tenant.id,
                organization_name=tenant.name or "Organisation",
            )
            session.add(config)
            await session.flush()

        overlay = dict(config.legacy_app_config_overrides or {})

        default_phases = [
            {"name": name, "enabled": name in CLASSIQUE_PHASES_ENABLED}
            for name in [
                "Détection",
                "Qualification",
                "Alerte",
                "Activation de la cellule de crise",
                "Analyse de situation",
                "Décisions stratégiques",
                "Endiguement",
                "Continuité d'activité (mode dégradé)",
                "Communication interne",
                "Communication externe (autorités, médias, partenaires)",
                "Remédiation technique",
                "Rétablissement progressif des services",
                "Surveillance renforcée",
                "Désescalade",
                "Clôture de crise",
                "RETEX (retour d'expérience)",
                "Plan d'actions correctives",
            ]
        ]

        defaults = {
            "default_phases_preset": "classique",
            "default_phases_config": json.dumps(default_phases, ensure_ascii=False),
            "timeline_phase_type_format_config": json.dumps(TIMELINE_DEFAULT_INJECT_TYPES_FORMATS, ensure_ascii=False),
            "timeline_sources_config": json.dumps(TIMELINE_DEFAULT_SOURCE_IDS, ensure_ascii=False),
            "timeline_sources_custom_config": json.dumps([], ensure_ascii=False),
        }

        changed = False
        for key, value in defaults.items():
            if key not in overlay or overlay.get(key) in (None, ""):
                overlay[key] = value
                changed = True

        if changed:
            config.legacy_app_config_overrides = overlay
            await session.commit()
            print("  ✅ Presets Timeline appliqués")
        else:
            print("  ⏭️  Presets Timeline déjà présents")


async def create_users(tenant_id: int) -> dict[str, User]:
    """Crée tous les utilisateurs initiaux. Retourne un dict username→User."""
    print("\n👥 Création des utilisateurs...")
    created_users: dict[str, User] = {}

    async with async_session_factory() as session:
        for user_data in INITIAL_USERS:
            result = await session.execute(
                select(User).where(User.username == user_data["username"])
            )
            existing = result.scalar_one_or_none()

            if existing:
                if existing.tenant_id is None:
                    existing.tenant_id = tenant_id
                    print(f"  🔧  '{user_data['username']}' → tenant_id assigné")
                else:
                    print(f"  ⏭️  '{user_data['username']}' existe déjà")
                created_users[user_data["username"]] = existing
                continue

            user = User(
                username=user_data["username"],
                email=user_data["email"],
                password_hash=hash_password(user_data["password"]),
                role=user_data["role"],
                is_active=True,
                tenant_id=tenant_id,
            )
            session.add(user)
            await session.flush()  # Obtenir l'ID
            created_users[user_data["username"]] = user
            role_icon = {
                UserRole.ADMIN: "🔑",
                UserRole.ANIMATEUR: "🎬",
                UserRole.OBSERVATEUR: "👁️ ",
                UserRole.PARTICIPANT: "🎮",
            }.get(user_data["role"], "👤")
            print(f"  {role_icon}  [{user_data['role'].value:12}] {user_data['username']:15} – {user_data['display']}")

        await session.commit()

        # Recharger depuis DB pour avoir les IDs corrects
        for username in list(created_users.keys()):
            result = await session.execute(
                select(User).where(User.username == username)
            )
            user = result.scalar_one_or_none()
            if user:
                created_users[username] = user

    print("✅ Utilisateurs prêts")
    return created_users


async def create_teams_and_assign(
    users: dict[str, User],
    tenant_id: int,
    skip_assign: bool = False,
) -> dict[str, Team]:
    """Crée les équipes et assigne les membres."""
    print("\n🏢 Création des équipes...")
    created_teams: dict[str, Team] = {}

    async with async_session_factory() as session:
        for team_data in INITIAL_TEAMS:
            result = await session.execute(
                select(Team).where(Team.name == team_data["name"])
            )
            existing = result.scalar_one_or_none()

            if existing:
                if existing.tenant_id is None:
                    existing.tenant_id = tenant_id
                    print(f"  🔧  Équipe '{team_data['name']}' → tenant_id assigné")
                else:
                    print(f"  ⏭️  Équipe '{team_data['name']}' existe déjà")
                created_teams[team_data["name"]] = existing
            else:
                team = Team(
                    name=team_data["name"],
                    description=team_data["description"],
                    tenant_id=tenant_id,
                )
                session.add(team)
                await session.flush()
                created_teams[team_data["name"]] = team
                print(f"  ✅ Équipe '{team_data['name']}' créée")

        await session.commit()

        # Recharger pour avoir les IDs
        for team_name in list(created_teams.keys()):
            result = await session.execute(
                select(Team).where(Team.name == team_name)
            )
            team = result.scalar_one_or_none()
            if team:
                created_teams[team_name] = team

    if not skip_assign:
        print("\n🔗 Assignation des membres aux équipes...")
        async with async_session_factory() as session:
            for team_data in INITIAL_TEAMS:
                team = created_teams.get(team_data["name"])
                if not team:
                    continue

                leader_username = team_data.get("leader_username")
                for member_username in team_data.get("members", []):
                    user = users.get(member_username)
                    if not user:
                        print(f"  ⚠️  Utilisateur '{member_username}' non trouvé")
                        continue

                    # Vérifier si déjà membre
                    result = await session.execute(
                        select(UserTeam).where(
                            UserTeam.user_id == user.id,
                            UserTeam.team_id == team.id,
                        )
                    )
                    if result.scalar_one_or_none():
                        continue

                    is_leader = (member_username == leader_username)
                    membership = UserTeam(
                        user_id=user.id,
                        team_id=team.id,
                        is_leader=is_leader,
                    )
                    session.add(membership)
                    leader_tag = " (chef)" if is_leader else ""
                    print(f"  ➕  {member_username}{leader_tag} → {team_data['name']}")

            await session.commit()
        print("✅ Membres assignés")

    return created_teams


async def create_demo_exercise(
    users: dict[str, User],
    teams: dict[str, Team],
) -> Exercise | None:
    """Crée un exercice de démonstration avec tous les rôles et équipes."""
    print("\n🎯 Création de l'exercice de démonstration...")

    admin_user = users.get("admin")

    async with async_session_factory() as session:
        # Vérifier si l'exercice démo existe déjà
        result = await session.execute(
            select(Exercise).where(Exercise.name == DEMO_EXERCISE["name"])
        )
        existing = result.scalar_one_or_none()

        if existing:
            print(f"  ⏭️  Exercice '{DEMO_EXERCISE['name']}' existe déjà (id={existing.id})")
            return existing

        exercise = Exercise(
            name=DEMO_EXERCISE["name"],
            description=DEMO_EXERCISE["description"],
            status=DEMO_EXERCISE["status"],
            created_by=admin_user.id if admin_user else None,
        )
        session.add(exercise)
        await session.flush()
        print(f"  ✅ Exercice '{exercise.name}' créé (id={exercise.id})")

        # Assigner les équipes à l'exercice
        for team_name in DEMO_EXERCISE["teams"]:
            team = teams.get(team_name)
            if not team:
                continue
            et = ExerciseTeam(exercise_id=exercise.id, team_id=team.id)
            session.add(et)
            print(f"  🏢 Équipe '{team_name}' ajoutée à l'exercice")

        # Assigner les rôles utilisateurs dans l'exercice
        print(f"\n  👥 Assignation des rôles dans l'exercice...")
        for username, ex_role in DEMO_EXERCISE["user_roles"].items():
            user = users.get(username)
            if not user:
                continue

            # Trouver l'équipe du participant dans cet exercice
            team_id = None
            if ex_role == ExerciseRole.JOUEUR:
                for team_data in INITIAL_TEAMS:
                    if username in team_data.get("members", []):
                        t = teams.get(team_data["name"])
                        if t:
                            team_id = t.id
                        break

            eu = ExerciseUser(
                user_id=user.id,
                exercise_id=exercise.id,
                role=ex_role,
                team_id=team_id,
                assigned_by=admin_user.id if admin_user else None,
            )
            session.add(eu)
            role_icon = {
                ExerciseRole.ANIMATEUR: "🎬",
                ExerciseRole.OBSERVATEUR: "👁️ ",
                ExerciseRole.JOUEUR: "🎮",
            }.get(ex_role, "👤")
            print(f"  {role_icon}  {username:15} [{ex_role.value}]")

        await session.commit()

        # Recharger
        result = await session.execute(
            select(Exercise).where(Exercise.name == DEMO_EXERCISE["name"])
        )
        exercise = result.scalar_one_or_none()

    print("✅ Exercice de démonstration prêt")
    return exercise


def print_summary(exercise: Exercise | None = None):
    """Affiche un résumé de l'environnement créé."""
    print("\n" + "═" * 60)
    print("✨  Environnement TTX initialisé avec succès!")
    print("═" * 60)

    print("\n📋  Comptes utilisateurs :")
    print("─" * 60)
    print(f"  {'RÔLE':12} │ {'LOGIN':15} │ {'MOT DE PASSE':15} │ EMAIL")
    print(f"  {'─'*12}─┼─{'─'*15}─┼─{'─'*15}─┼─{'─'*30}")
    for u in INITIAL_USERS:
        print(
            f"  {u['role'].value:12} │ {u['username']:15} │ {u['password']:15} │ {u['email']}"
        )
    print("─" * 60)

    print("\n🏢  Équipes :")
    for team_data in INITIAL_TEAMS:
        members_str = ", ".join(team_data["members"])
        print(f"  • {team_data['name']}: {members_str}")

    if exercise:
        print(f"\n🎯  Exercice démo : '{exercise.name}' (id={exercise.id}, statut={exercise.status.value})")

    print("\n🌐  Accès :")
    print("  Frontend  → http://localhost:5173")
    print("  API       → http://localhost:3000")
    print("  API Docs  → http://localhost:3000/docs")

    print("\n⚠️   Changer les mots de passe en production !")
    print("═" * 60 + "\n")


# ─────────────────────────────────────────────
# Point d'entrée
# ─────────────────────────────────────────────

async def main():
    parser = argparse.ArgumentParser(
        description="Initialisation complète de l'environnement TTX Platform",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "--reset",
        action="store_true",
        help="Supprime toutes les données existantes avant d'initialiser",
    )
    parser.add_argument(
        "--demo-exercise",
        action="store_true",
        help="Crée un exercice de démonstration complet",
    )
    parser.add_argument(
        "--users-only",
        action="store_true",
        help="Crée uniquement les utilisateurs (pas les équipes)",
    )
    parser.add_argument(
        "--teams-only",
        action="store_true",
        help="Crée uniquement les équipes",
    )
    parser.add_argument(
        "--no-assign",
        action="store_true",
        help="Ne pas assigner les membres aux équipes",
    )
    parser.add_argument(
        "--skip-migrations",
        action="store_true",
        help="Skip Alembic migrations (use existing schema)",
    )
    args = parser.parse_args()

    print("\n" + "═" * 60)
    print("🚀  TTX Platform – Initialisation de l'environnement")
    print("═" * 60 + "\n")

    exercise = None

    try:
        if args.reset:
            await reset_database()

        # Run Alembic migrations to create schema (including enums)
        if not args.skip_migrations:
            migrations_success = run_alembic_migrations()
            if not migrations_success:
                print("⚠️  Fallback: Creating tables with SQLAlchemy...")
                await create_tables_fallback()
        else:
            print("⏭️  Skipping migrations (--skip-migrations)")
            await create_tables_fallback()

        tenant = await create_default_tenant()
        await ensure_default_timeline_configuration(tenant)
        tenant_id = tenant.id

        users: dict[str, User] = {}
        teams: dict[str, Team] = {}

        if args.teams_only:
            # On a quand même besoin des users pour assigner les membres
            users = await create_users(tenant_id)
            teams = await create_teams_and_assign(users, tenant_id, skip_assign=args.no_assign)
        elif args.users_only:
            users = await create_users(tenant_id)
        else:
            users = await create_users(tenant_id)
            teams = await create_teams_and_assign(users, tenant_id, skip_assign=args.no_assign)

            if args.demo_exercise:
                exercise = await create_demo_exercise(users, teams)

        print_summary(exercise)

    except Exception as e:
        print(f"\n❌  Erreur : {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
