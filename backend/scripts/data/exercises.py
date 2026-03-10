"""Seed data and functions for the demo exercise."""
from sqlalchemy import select

from app.database import async_session_factory
from app.models import User, Team
from app.models.exercise import Exercise, ExerciseStatus, ExerciseTeam
from app.models.exercise_user import ExerciseUser, ExerciseRole

from data.users import INITIAL_TEAMS


DEMO_EXERCISE = {
    "name": "Exercice CYBER-STORM 2024",
    "description": (
        "Simulation d'une cyber-attaque majeure sur l'infrastructure critique. "
        "Les équipes doivent gérer la communication de crise, coordonner la réponse technique "
        "et prendre des décisions stratégiques sous pression temporelle."
    ),
    "status": ExerciseStatus.DRAFT,
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
    "teams": ["Équipe Alpha", "Équipe Beta", "Cellule de Crise"],
}


async def create_demo_exercise(
    users: dict[str, User],
    teams: dict[str, Team],
) -> Exercise | None:
    """Crée un exercice de démonstration avec tous les rôles et équipes."""
    print("\n🎯 Création de l'exercice de démonstration...")

    admin_user = users.get("admin")

    async with async_session_factory() as session:
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

        for team_name in DEMO_EXERCISE["teams"]:
            team = teams.get(team_name)
            if not team:
                continue
            et = ExerciseTeam(exercise_id=exercise.id, team_id=team.id)
            session.add(et)
            print(f"  🏢 Équipe '{team_name}' ajoutée à l'exercice")

        print(f"\n  👥 Assignation des rôles dans l'exercice...")
        for username, ex_role in DEMO_EXERCISE["user_roles"].items():
            user = users.get(username)
            if not user:
                continue

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

        result = await session.execute(
            select(Exercise).where(Exercise.name == DEMO_EXERCISE["name"])
        )
        exercise = result.scalar_one_or_none()

    print("✅ Exercice de démonstration prêt")
    return exercise
