"""Seed data and functions for users and teams."""
from sqlalchemy import select

from app.database import async_session_factory
from app.models import User, Team
from app.models.user import UserRole
from app.models.team import UserTeam
from app.utils.security import hash_password


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
            await session.flush()
            created_users[user_data["username"]] = user
            role_icon = {
                UserRole.ADMIN: "🔑",
                UserRole.ANIMATEUR: "🎬",
                UserRole.OBSERVATEUR: "👁️ ",
                UserRole.PARTICIPANT: "🎮",
            }.get(user_data["role"], "👤")
            print(f"  {role_icon}  [{user_data['role'].value:12}] {user_data['username']:15} – {user_data['display']}")

        await session.commit()

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


def print_summary(exercise=None) -> None:
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
