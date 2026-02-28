#!/usr/bin/env python3
"""
Script d'initialisation de la base de données TTX Platform.
Crée les tables et insère les utilisateurs initiaux.

Usage:
    python scripts/init_db.py [--reset]

Options:
    --reset    Supprime toutes les données existantes avant d'initialiser
"""
import asyncio
import argparse
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import text
from app.database import engine, async_session_factory, Base
from app.models import User, Team
from app.models.user import UserRole
from app.utils.security import hash_password


# Utilisateurs initiaux
INITIAL_USERS = [
    {
        "username": "admin",
        "email": "admin@ttx.local",
        "password": "Admin123!",
        "role": UserRole.ADMIN,
    },
    {
        "username": "animateur",
        "email": "animateur@ttx.local",
        "password": "Anim123!",
        "role": UserRole.ANIMATEUR,
    },
    {
        "username": "observateur",
        "email": "observateur@ttx.local",
        "password": "Obs123!",
        "role": UserRole.OBSERVATEUR,
    },
    {
        "username": "participant",
        "email": "participant@ttx.local",
        "password": "Part123!",
        "role": UserRole.PARTICIPANT,
    },
]

# Équipes initiales
INITIAL_TEAMS = [
    {
        "name": "Équipe Alpha",
        "description": "Équipe de réponse principale",
    },
    {
        "name": "Équipe Beta",
        "description": "Équipe de support",
    },
    {
        "name": "Cellule de Crise",
        "description": "Direction de la cellule de crise",
    },
]


async def reset_database():
    """Supprime et recrée toutes les tables."""
    print("⚠️  Suppression de toutes les tables...")
    async with engine.begin() as conn:
        # Drop and recreate schema to bypass FK dependency ordering issues
        await conn.execute(text("DROP SCHEMA public CASCADE"))
        await conn.execute(text("CREATE SCHEMA public"))
        await conn.execute(text("GRANT ALL ON SCHEMA public TO PUBLIC"))
    print("✅ Tables supprimées")


async def create_tables():
    """Crée toutes les tables."""
    print("📦 Création des tables...")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("✅ Tables créées")


async def create_initial_users():
    """Crée les utilisateurs initiaux."""
    print("👥 Création des utilisateurs initiaux...")
    
    async with async_session_factory() as session:
        for user_data in INITIAL_USERS:
            # Vérifier si l'utilisateur existe déjà
            from sqlalchemy import select
            result = await session.execute(
                select(User).where(User.username == user_data["username"])
            )
            existing = result.scalar_one_or_none()
            
            if existing:
                print(f"  ⏭️  Utilisateur '{user_data['username']}' existe déjà")
                continue
            
            user = User(
                username=user_data["username"],
                email=user_data["email"],
                password_hash=hash_password(user_data["password"]),
                role=user_data["role"],
                is_active=True,
            )
            session.add(user)
            print(f"  ✅ Utilisateur '{user_data['username']}' créé ({user_data['role'].value})")
        
        await session.commit()
    print("✅ Utilisateurs créés")


async def create_initial_teams():
    """Crée les équipes initiales."""
    print("🏢 Création des équipes initiales...")
    
    async with async_session_factory() as session:
        for team_data in INITIAL_TEAMS:
            from sqlalchemy import select
            result = await session.execute(
                select(Team).where(Team.name == team_data["name"])
            )
            existing = result.scalar_one_or_none()
            
            if existing:
                print(f"  ⏭️  Équipe '{team_data['name']}' existe déjà")
                continue
            
            team = Team(
                name=team_data["name"],
                description=team_data["description"],
            )
            session.add(team)
            print(f"  ✅ Équipe '{team_data['name']}' créée")
        
        await session.commit()
    print("✅ Équipes créées")


async def main():
    parser = argparse.ArgumentParser(description="Initialisation de la base de données TTX")
    parser.add_argument("--reset", action="store_true", help="Supprime toutes les données avant d'initialiser")
    parser.add_argument("--users-only", action="store_true", help="Crée uniquement les utilisateurs")
    parser.add_argument("--teams-only", action="store_true", help="Crée uniquement les équipes")
    args = parser.parse_args()
    
    print("\n" + "="*50)
    print("🚀 TTX Platform - Initialisation de la base de données")
    print("="*50 + "\n")
    
    try:
        if args.reset:
            await reset_database()
        
        if not args.users_only and not args.teams_only:
            await create_tables()
            await create_initial_users()
            await create_initial_teams()
        elif args.users_only:
            await create_initial_users()
        elif args.teams_only:
            await create_initial_teams()
        
        print("\n" + "="*50)
        print("✨ Initialisation terminée avec succès!")
        print("="*50)
        print("\n📋 Comptes créés:")
        print("-"*40)
        for user in INITIAL_USERS:
            print(f"  {user['role'].value:12} | {user['username']:15} | {user['password']}")
        print("-"*40)
        print("\n⚠️  Pensez à changer ces mots de passe en production!")
        
    except Exception as e:
        print(f"\n❌ Erreur: {e}")
        sys.exit(1)
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())