#!/usr/bin/env python3
"""
Script d'initialisation de l'annuaire de crise avec des données fictives.
Crée 20 contacts bien répartis entre les catégories et priorités.

Usage:
    python scripts/init_crisis_contacts.py [--exercise-id ID]

Options:
    --exercise-id ID    ID de l'exercice auquel ajouter les contacts (défaut: crée un exercice "Annuaire Test")
"""
import asyncio
import argparse
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import select
from app.database import engine, async_session_factory
from app.models import Exercise, CrisisContact
from app.models.exercise import ExerciseStatus
from app.models.crisis_contact import ContactCategory, ContactPriority


# Contacts de crise fictifs - 20 entrées bien réparties
CRISIS_CONTACTS = [
    # === AUTORITÉ (3 contacts) ===
    {
        "name": "Jean-Pierre LEMAIRE",
        "function": "Préfet",
        "organization": "Préfecture de Région",
        "email": "jp.lemaire@prefecture.gouv.fr",
        "phone": "01 23 45 67 89",
        "mobile": "06 12 34 56 78",
        "category": ContactCategory.AUTORITE,
        "priority": ContactPriority.CRITICAL,
        "notes": "Interlocuteur principal pour les décisions de niveau gouvernemental",
        "availability": "24/7",
    },
    {
        "name": "Marie DUPONT",
        "function": "Maire",
        "organization": "Mairie de Saint-Cloud",
        "email": "m.dupont@saintcloud.fr",
        "phone": "01 23 45 67 90",
        "mobile": "06 23 45 67 89",
        "category": ContactCategory.AUTORITE,
        "priority": ContactPriority.HIGH,
        "notes": "Responsable de la communication locale",
        "availability": "9h-18h / urgent: mobile",
    },
    {
        "name": "Philippe MARTIN",
        "function": "Sous-Préfet",
        "organization": "Sous-Préfecture de l'Arrondissement",
        "email": "p.martin@sousprefecture.gouv.fr",
        "phone": "01 23 45 67 91",
        "mobile": "06 34 56 78 90",
        "category": ContactCategory.AUTORITE,
        "priority": ContactPriority.HIGH,
        "notes": "Relais territorial pour la coordination",
        "availability": "8h30-17h30",
    },

    # === EXPERT (3 contacts) ===
    {
        "name": "Dr. Sophie BERNARD",
        "function": "Médecin-Chef",
        "organization": "ARS - Agence Régionale de Santé",
        "email": "s.bernard@ars.sante.fr",
        "phone": "01 23 45 67 92",
        "mobile": "06 45 67 89 01",
        "category": ContactCategory.EXPERT,
        "priority": ContactPriority.CRITICAL,
        "notes": "Experte santé publique - conseillère pour les crises sanitaires",
        "availability": "24/7",
    },
    {
        "name": "François MOREAU",
        "function": "Directeur Environnement",
        "organization": "DREAL - Direction Régionale",
        "email": "f.moreau@dreal.gouv.fr",
        "phone": "01 23 45 67 93",
        "mobile": "06 56 78 90 12",
        "category": ContactCategory.EXPERT,
        "priority": ContactPriority.HIGH,
        "notes": "Expert environnement et risques industriels",
        "availability": "8h-18h",
    },
    {
        "name": "Isabelle PETIT",
        "function": "Ingénieure Cybersécurité",
        "organization": "ANSSI",
        "email": "i.petit@ssi.gouv.fr",
        "phone": "01 23 45 67 94",
        "mobile": "06 67 89 01 23",
        "category": ContactCategory.EXPERT,
        "priority": ContactPriority.CRITICAL,
        "notes": "Experte cyber-attaques - à contacter en cas d'incident majeur",
        "availability": "24/7",
    },

    # === MEDIA (3 contacts) ===
    {
        "name": "Thomas RICHARD",
        "function": "Journaliste Senior",
        "organization": "France 3 Région",
        "email": "t.richard@francetv.fr",
        "phone": "01 23 45 67 95",
        "mobile": "06 78 90 12 34",
        "category": ContactCategory.MEDIA,
        "priority": ContactPriority.HIGH,
        "notes": "Contact presse privilégié - respecte les embargos",
        "availability": "6h-22h",
    },
    {
        "name": "Claire DUBOIS",
        "function": "Rédactrice en Chef",
        "organization": "Radio France Locale",
        "email": "c.dubois@radiofrance.fr",
        "phone": "01 23 45 67 96",
        "mobile": "06 89 01 23 45",
        "category": ContactCategory.MEDIA,
        "priority": ContactPriority.NORMAL,
        "notes": "Pour les communications radio en temps réel",
        "availability": "5h-20h",
    },
    {
        "name": "Nicolas LEROY",
        "function": "Correspondant",
        "organization": "Le Monde",
        "email": "n.leroy@lemonde.fr",
        "phone": "01 23 45 67 97",
        "mobile": "06 90 12 34 56",
        "category": ContactCategory.MEDIA,
        "priority": ContactPriority.NORMAL,
        "notes": "Presse nationale - à utiliser avec précaution",
        "availability": "9h-19h",
    },

    # === INTERNE (3 contacts) ===
    {
        "name": "Catherine ROUX",
        "function": "Directrice Générale",
        "organization": "Notre Entreprise",
        "email": "c.roux@entreprise.fr",
        "phone": "01 23 45 67 00",
        "mobile": "06 01 23 45 67",
        "category": ContactCategory.INTERNE,
        "priority": ContactPriority.CRITICAL,
        "notes": "Décisionnaire final - à informer immédiatement",
        "availability": "24/7",
    },
    {
        "name": "Alexandre FAURE",
        "function": "Directeur des Ressources Humaines",
        "organization": "Notre Entreprise",
        "email": "a.faure@entreprise.fr",
        "phone": "01 23 45 67 01",
        "mobile": "06 12 34 56 67",
        "category": ContactCategory.INTERNE,
        "priority": ContactPriority.HIGH,
        "notes": "Responsable communication interne et gestion du personnel",
        "availability": "8h-19h / urgent: mobile",
    },
    {
        "name": "Valérie SIMON",
        "function": "DSI",
        "organization": "Notre Entreprise",
        "email": "v.simon@entreprise.fr",
        "phone": "01 23 45 67 02",
        "mobile": "06 23 45 67 78",
        "category": ContactCategory.INTERNE,
        "priority": ContactPriority.HIGH,
        "notes": "Responsable IT et cybersécurité interne",
        "availability": "8h-18h / astreinte 24/7",
    },

    # === EXTERNE (3 contacts) ===
    {
        "name": "Olivier MERCIER",
        "function": "Directeur Régional",
        "organization": "Partenaires Logistiques SA",
        "email": "o.mercier@partlog.fr",
        "phone": "01 23 45 67 98",
        "mobile": "06 34 56 78 89",
        "category": ContactCategory.EXTERNE,
        "priority": ContactPriority.HIGH,
        "notes": "Partenaire stratégique - solutions logistiques d'urgence",
        "availability": "7h-20h",
    },
    {
        "name": "Sandrine GARNIER",
        "function": "Responsable Compte",
        "organization": "Fournisseurs Industriels",
        "email": "s.garnier@findus.fr",
        "phone": "01 23 45 67 99",
        "mobile": "06 45 67 78 90",
        "category": ContactCategory.EXTERNE,
        "priority": ContactPriority.NORMAL,
        "notes": "Fournisseur critique - délais courts possibles",
        "availability": "8h-17h",
    },
    {
        "name": "Marc BLANC",
        "function": "Avocat Associé",
        "organization": "Cabinet Juridique Blanc & Associés",
        "email": "m.blanc@blanc-avocats.fr",
        "phone": "01 23 45 68 00",
        "mobile": "06 56 78 90 01",
        "category": ContactCategory.EXTERNE,
        "priority": ContactPriority.NORMAL,
        "notes": "Conseil juridique - gestion des aspects légaux",
        "availability": "9h-19h",
    },

    # === URGENCE (3 contacts) ===
    {
        "name": "Centre 18",
        "function": "Pompiers",
        "organization": "SDIS - Service Départemental",
        "email": "centre18@sdis.gouv.fr",
        "phone": "18",
        "mobile": "06 67 89 01 12",
        "category": ContactCategory.URGENCE,
        "priority": ContactPriority.CRITICAL,
        "notes": "Numéro d'urgence - intervention immédiate",
        "availability": "24/7",
    },
    {
        "name": "SAMU 15",
        "function": "Urgences Médicales",
        "organization": "CHU Régional",
        "email": "samu@chu-hopital.fr",
        "phone": "15",
        "mobile": "06 78 90 12 23",
        "category": ContactCategory.URGENCE,
        "priority": ContactPriority.CRITICAL,
        "notes": "Urgences médicales - équipe mobile d'urgence",
        "availability": "24/7",
    },
    {
        "name": "Brigade de Gendarmerie",
        "function": "Poste de Commandement",
        "organization": "Gendarmerie Nationale",
        "email": "brgd@gendarmerie.interieur.gouv.fr",
        "phone": "17",
        "mobile": "06 89 01 23 34",
        "category": ContactCategory.URGENCE,
        "priority": ContactPriority.HIGH,
        "notes": "Sécurité et ordre public",
        "availability": "24/7",
    },

    # === AUTRE (2 contacts) ===
    {
        "name": "Nathalie VIDAL",
        "function": "Directrice des Sinistres",
        "organization": "Assurance Créative",
        "email": "n.vidal@assurance-creative.fr",
        "phone": "01 23 45 68 01",
        "mobile": "06 90 12 34 45",
        "category": ContactCategory.AUTRE,
        "priority": ContactPriority.NORMAL,
        "notes": "Gestion des sinistres - déclaration et suivi",
        "availability": "9h-17h",
    },
    {
        "name": "Laurent FERRAND",
        "function": "Psychologue",
        "organization": "Cellule d'Urgence Médico-Psychologique",
        "email": "l.ferrand@cump.fr",
        "phone": "01 23 45 68 02",
        "mobile": "06 01 23 45 56",
        "category": ContactCategory.AUTRE,
        "priority": ContactPriority.LOW,
        "notes": "Support psychologique post-crise - à solliciter si besoin",
        "availability": "Astreinte 24/7",
    },
]


async def get_or_create_exercise(exercise_id: int | None = None) -> int:
    """Récupère ou crée un exercice pour les contacts."""
    async with async_session_factory() as session:
        if exercise_id:
            result = await session.execute(
                select(Exercise).where(Exercise.id == exercise_id)
            )
            exercise = result.scalar_one_or_none()
            if exercise:
                print(f"📝 Utilisation de l'exercice existant: {exercise.name} (ID: {exercise.id})")
                return exercise.id
            else:
                print(f"⚠️  Exercice ID {exercise_id} non trouvé, création d'un nouvel exercice")

        # Créer un nouvel exercice
        exercise = Exercise(
            name="Exercice - Annuaire de Crise Test",
            description="Exercice créé automatiquement pour tester l'annuaire de crise",
            status=ExerciseStatus.DRAFT,
        )
        session.add(exercise)
        await session.commit()
        await session.refresh(exercise)
        print(f"✅ Nouvel exercice créé: {exercise.name} (ID: {exercise.id})")
        return exercise.id


async def create_crisis_contacts(exercise_id: int):
    """Crée les contacts de crise."""
    print(f"\n📋 Création des contacts de crise pour l'exercice {exercise_id}...")
    
    async with async_session_factory() as session:
        # Vérifier si des contacts existent déjà pour cet exercice
        result = await session.execute(
            select(CrisisContact).where(CrisisContact.exercise_id == exercise_id)
        )
        existing = result.scalars().all()
        
        if existing:
            print(f"⚠️  {len(existing)} contacts existent déjà pour cet exercice.")
            print("   Utilisez --reset pour supprimer les contacts existants.")
            return
        
        created_counts = {cat: 0 for cat in ContactCategory}
        
        for contact_data in CRISIS_CONTACTS:
            contact = CrisisContact(
                exercise_id=exercise_id,
                **contact_data
            )
            session.add(contact)
            created_counts[contact_data["category"]] += 1
            print(f"  ✅ {contact_data['name']} ({contact_data['category'].value})")
        
        await session.commit()
        
        print(f"\n📊 Répartition par catégorie:")
        for cat, count in created_counts.items():
            print(f"   {cat.value:12} : {count} contact(s)")
        
        print(f"\n✅ {len(CRISIS_CONTACTS)} contacts créés avec succès!")


async def reset_crisis_contacts(exercise_id: int):
    """Supprime les contacts de crise existants pour un exercice."""
    async with async_session_factory() as session:
        result = await session.execute(
            select(CrisisContact).where(CrisisContact.exercise_id == exercise_id)
        )
        contacts = result.scalars().all()
        
        if contacts:
            for contact in contacts:
                await session.delete(contact)
            await session.commit()
            print(f"🗑️  {len(contacts)} contacts supprimés")
        else:
            print("ℹ️  Aucun contact à supprimer")


async def main():
    parser = argparse.ArgumentParser(description="Initialisation de l'annuaire de crise")
    parser.add_argument("--exercise-id", type=int, help="ID de l'exercice auquel ajouter les contacts")
    parser.add_argument("--reset", action="store_true", help="Supprime les contacts existants avant de créer")
    args = parser.parse_args()
    
    print("\n" + "="*60)
    print("📞 TTX Platform - Initialisation de l'annuaire de crise")
    print("="*60 + "\n")
    
    try:
        exercise_id = await get_or_create_exercise(args.exercise_id)
        
        if args.reset:
            await reset_crisis_contacts(exercise_id)
        
        await create_crisis_contacts(exercise_id)
        
        print("\n" + "="*60)
        print("✨ Initialisation terminée avec succès!")
        print("="*60)
        print(f"\n📌 Exercice ID: {exercise_id}")
        print("\n💡 Conseil: Utilisez --reset pour réinitialiser les contacts")
        print("           Utilisez --exercise-id ID pour un exercice spécifique")
        
    except Exception as e:
        print(f"\n❌ Erreur: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())