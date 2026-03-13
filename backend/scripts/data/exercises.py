"""Seed data and functions for the demo exercise."""
from datetime import datetime, timedelta, timezone
from sqlalchemy import select, delete

from app.database import async_session_factory
from app.models import User, Team
from app.models.exercise import Exercise, ExerciseStatus, ExerciseTeam
from app.models.exercise_user import ExerciseUser, ExerciseRole
from app.models.inject import (
    Inject, InjectType, InjectStatus, InjectCategory, InjectChannel,
    TargetAudience, PressureLevel, TestedCompetence, TimelineType,
)
from app.models.crisis_management import (
    ExerciseScenario, ExerciseEscalationAxis, ExercisePhase, EscalationAxisType,
)

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

# ─────────────────────────────────────────────
# Demo exercise full content
# ─────────────────────────────────────────────

DEMO_EXERCISE_METADATA = {
    "exercise_type": "ransomware",
    "target_duration_hours": 4,
    "maturity_level": "intermediate",
    "mode": "real_time",
    "location": "Salle de crise — Siège Duval Industries, Paris",
    "business_objective": (
        "Tester la gouvernance de crise face à une attaque ransomware : "
        "capacité de prise de décision stratégique, coordination inter-services "
        "et communication de crise sous pression temporelle."
    ),
    "technical_objective": (
        "Évaluer la réponse technique à un incident ransomware : "
        "détection, confinement, analyse forensique, restauration des systèmes "
        "et coordination avec les autorités (ANSSI, CNIL)."
    ),
    "timeline_configured": True,
}

DEMO_SCENARIO = {
    "strategic_intent": (
        "Tester la capacité de réponse globale de Duval Industries face à une attaque "
        "ransomware ciblée, depuis la détection initiale jusqu'à la reprise d'activité, "
        "en évaluant la coordination entre les équipes techniques, juridiques et de direction."
    ),
    "initial_context": (
        "Duval Industries, vendredi 14h00. Clôture trimestrielle en cours. "
        "L'activité est normale sur l'ensemble des sites. Le SOC surveille "
        "les infrastructures depuis le centre opérationnel de Paris."
    ),
    "initial_situation": (
        "Le SOC détecte une alerte SIEM signalant un chiffrement suspect de fichiers "
        "sur plusieurs serveurs de fichiers. Les premiers utilisateurs commencent à "
        "signaler des fichiers inaccessibles."
    ),
    "implicit_hypotheses": (
        "Les sauvegardes existent mais leur intégrité n'est pas confirmée et elles sont "
        "potentiellement compromises. L'ANSSI n'a pas encore été notifiée. "
        "Le PCA/PRA n'a pas été testé depuis 18 mois."
    ),
    "hidden_brief": (
        "L'attaquant (groupe APT) est présent dans le SI depuis 3 semaines. Il a effectué "
        "un mouvement latéral complet, exfiltré des données RH sensibles (paie, dossiers "
        "disciplinaires) et positionné le ransomware sur 12 serveurs avant déclenchement. "
        "Les sauvegardes du mardi sont compromises, seules celles du dimanche sont saines."
    ),
    "pedagogical_objectives": [
        "Coordination inter-services : tester la capacité des équipes DSI, juridique, communication et direction à travailler ensemble sous pression",
        "Communication de crise : évaluer la qualité et la rapidité des communications internes et externes",
        "Prise de décision stratégique : mesurer la capacité de la direction à prendre des décisions rapides avec des informations incomplètes",
        "Conformité réglementaire : vérifier la connaissance des obligations (notification CNIL 72h, signalement ANSSI)",
        "Continuité d'activité : tester la capacité de maintenir les opérations critiques pendant l'incident",
    ],
    "evaluation_criteria": [
        "Temps de réaction : délai entre la détection et l'activation de la cellule de crise (objectif < 30 min)",
        "Qualité de la communication : clarté, cohérence et timing des messages internes et externes",
        "Justification des décisions : capacité à documenter et argumenter chaque décision stratégique",
        "Actions réglementaires : respect des délais et procédures de notification CNIL/ANSSI",
        "Efficacité du confinement : rapidité et pertinence des mesures techniques d'isolation",
    ],
    "stress_factors": [
        "Pression médiatique : journalistes et réseaux sociaux relaient des rumeurs sur l'attaque",
        "Appels clients : clients stratégiques (Airbus, Safran) demandent des comptes sur la sécurité de leurs données",
        "Deadline réglementaire : notification CNIL obligatoire sous 72h en cas de données personnelles compromises",
        "Menace d'exfiltration : l'attaquant menace de publier les données RH si la rançon n'est pas payée sous 48h",
    ],
}

DEMO_ESCALATION_AXES = [
    {"axis_type": EscalationAxisType.TECHNICAL, "intensity": 8, "notes": "Ransomware se propage vers réseau OT / MES — risque d'arrêt de production"},
    {"axis_type": EscalationAxisType.COMMUNICATION, "intensity": 6, "notes": "Médias interrogent, clients inquiets, rumeurs sur les réseaux sociaux"},
    {"axis_type": EscalationAxisType.LEGAL, "intensity": 7, "notes": "Notification CNIL 72h, signalement ANSSI, données personnelles RH exfiltrées"},
    {"axis_type": EscalationAxisType.POLITICAL, "intensity": 4, "notes": "Contact préfecture, statut OSE potentiel, sensibilité industrie défense"},
    {"axis_type": EscalationAxisType.MEDIA, "intensity": 5, "notes": "Spéculation réseaux sociaux, article presse spécialisée, intérêt TV nationale"},
]

DEMO_PHASES = [
    {"name": "Détection & Alerte", "phase_order": 1, "start_offset_min": 0, "end_offset_min": 30, "description": "Détection de l'activité suspecte et premières alertes SOC"},
    {"name": "Qualification & Activation", "phase_order": 2, "start_offset_min": 30, "end_offset_min": 60, "description": "Qualification de l'incident et activation de la cellule de crise"},
    {"name": "Confinement & Réponse", "phase_order": 3, "start_offset_min": 60, "end_offset_min": 120, "description": "Confinement technique et premières actions de réponse"},
    {"name": "Communication de crise", "phase_order": 4, "start_offset_min": 120, "end_offset_min": 180, "description": "Gestion de la communication interne et externe"},
    {"name": "Remédiation & Reprise", "phase_order": 5, "start_offset_min": 180, "end_offset_min": 240, "description": "Restauration des systèmes et reprise d'activité"},
]

DEMO_INJECTS = [
    # ── Phase 1 : Détection & Alerte ──
    {
        "phase_index": 0, "time_offset": 0, "custom_id": "INJ-001",
        "type": InjectType.SYSTEM, "title": "Alerte SIEM — Activité suspecte détectée",
        "timeline_type": TimelineType.TECHNICAL,
        "inject_category": InjectCategory.INCIDENT, "channel": InjectChannel.SIEM,
        "target_audience": TargetAudience.DSI, "pressure_level": PressureLevel.MEDIUM,
        "tested_competence": TestedCompetence.TECHNICAL,
        "content": {
            "message": "ALERTE CRITIQUE — Le SIEM a détecté une activité de chiffrement anormale sur les serveurs FS-PAR-01, FS-PAR-02 et FS-LYO-01. Pattern compatible avec un ransomware (extension .locked ajoutée à 847 fichiers en 3 minutes). Règle de corrélation : CRYPTO-RANSOM-001.",
            "severity": "critical",
        },
        "description": "Le SOC détecte les premiers signes de l'attaque via le SIEM.",
    },
    {
        "phase_index": 0, "time_offset": 10, "custom_id": "INJ-002",
        "type": InjectType.MAIL, "title": "Rapport SOC — Chiffrement de fichiers en cours",
        "timeline_type": TimelineType.TECHNICAL,
        "inject_category": InjectCategory.INCIDENT, "channel": InjectChannel.MAIL,
        "target_audience": TargetAudience.DSI, "pressure_level": PressureLevel.HIGH,
        "tested_competence": TestedCompetence.COORDINATION,
        "content": {
            "subject": "URGENT — Rapport SOC : chiffrement de fichiers en cours",
            "from": "soc@duval-industries.fr",
            "to": "rssi@duval-industries.fr",
            "body": "Bonjour,\n\nSuite à l'alerte SIEM de 14h00, nous confirmons un chiffrement actif sur 3 serveurs de fichiers. Le processus malveillant utilise l'extension .locked et progresse rapidement.\n\nServeurs touchés :\n- FS-PAR-01 (2 847 fichiers chiffrés)\n- FS-PAR-02 (1 203 fichiers chiffrés)\n- FS-LYO-01 (en cours, ~500 fichiers/min)\n\nActions immédiates recommandées :\n1. Isolation réseau des serveurs impactés\n2. Activation du protocole incident de sécurité\n3. Préservation des logs pour analyse forensique\n\nCordialement,\nL'équipe SOC",
        },
        "description": "Le SOC envoie un rapport détaillé au RSSI confirmant l'incident.",
    },
    {
        "phase_index": 0, "time_offset": 20, "custom_id": "INJ-003",
        "type": InjectType.MAIL, "title": "Utilisateurs — Fichiers inaccessibles",
        "timeline_type": TimelineType.BUSINESS,
        "inject_category": InjectCategory.INFORMATION, "channel": InjectChannel.MAIL,
        "target_audience": TargetAudience.ALL, "pressure_level": PressureLevel.MEDIUM,
        "tested_competence": TestedCompetence.COMMUNICATION,
        "content": {
            "subject": "Problème d'accès aux fichiers partagés",
            "from": "marie.dupont@duval-industries.fr",
            "to": "support-it@duval-industries.fr",
            "body": "Bonjour,\n\nJe n'arrive plus à ouvrir mes fichiers sur le serveur partagé depuis environ 14h. Tous mes documents Excel ont une extension bizarre (.locked) et sont illisibles. Plusieurs collègues du service comptabilité ont le même problème.\n\nC'est urgent car nous sommes en pleine clôture trimestrielle et les fichiers de consolidation sont bloqués.\n\nMerci de traiter en priorité.\n\nMarie Dupont\nResponsable Comptabilité",
        },
        "description": "Les utilisateurs commencent à signaler des problèmes d'accès aux fichiers.",
    },
    # ── Phase 2 : Qualification & Activation ──
    {
        "phase_index": 1, "time_offset": 35, "custom_id": "INJ-004",
        "type": InjectType.MAIL, "title": "Demande de rançon reçue",
        "timeline_type": TimelineType.BUSINESS,
        "inject_category": InjectCategory.INCIDENT, "channel": InjectChannel.MAIL,
        "target_audience": TargetAudience.DIRECTION, "pressure_level": PressureLevel.CRITICAL,
        "tested_competence": TestedCompetence.GOVERNANCE,
        "content": {
            "subject": "🔒 Your files have been encrypted — READ THIS",
            "from": "darkside-group@protonmail.com",
            "to": "direction@duval-industries.fr",
            "body": "Dear Duval Industries Management,\n\nAll your critical files have been encrypted with military-grade AES-256 encryption. We also have a copy of your HR database including payroll and disciplinary records for 2,300 employees.\n\nTo recover your files and prevent publication of sensitive data:\n- Payment: 150 BTC (~4.2M EUR)\n- Deadline: 48 hours\n- Contact: darkside-negotiation@onionmail.org\n\nAs proof, here are 5 sample employee records from your HR database:\n[REDACTED]\n\nThe clock is ticking.\n\n— DarkSide Group",
        },
        "description": "L'attaquant envoie sa demande de rançon avec preuves d'exfiltration.",
    },
    {
        "phase_index": 1, "time_offset": 45, "custom_id": "INJ-005",
        "type": InjectType.DECISION, "title": "Activation de la cellule de crise",
        "timeline_type": TimelineType.BUSINESS,
        "inject_category": InjectCategory.DECISION, "channel": None,
        "target_audience": TargetAudience.DIRECTION, "pressure_level": PressureLevel.HIGH,
        "tested_competence": TestedCompetence.GOVERNANCE,
        "content": {
            "text": "Au vu de la demande de rançon et de la confirmation d'exfiltration de données, faut-il activer immédiatement la cellule de crise au niveau Direction Générale ?",
            "options": [
                "Activation immédiate — cellule de crise complète (DG, DSI, Juridique, Com, RH)",
                "Activation partielle — cellule technique DSI uniquement pour le moment",
                "Attendre l'analyse forensique complète avant de mobiliser la direction",
            ],
        },
        "description": "Première décision stratégique : niveau d'activation de la cellule de crise.",
    },
    {
        "phase_index": 1, "time_offset": 55, "custom_id": "INJ-006",
        "type": InjectType.SYSTEM, "title": "Propagation confirmée — 3 serveurs supplémentaires touchés",
        "timeline_type": TimelineType.TECHNICAL,
        "inject_category": InjectCategory.TECHNICAL, "channel": InjectChannel.SIEM,
        "target_audience": TargetAudience.DSI, "pressure_level": PressureLevel.CRITICAL,
        "tested_competence": TestedCompetence.TECHNICAL,
        "content": {
            "message": "ALERTE ESCALADE — Le ransomware s'est propagé à 3 serveurs supplémentaires : APP-ERP-01 (SAP), DB-RH-01 (base RH), MES-PROD-01 (Manufacturing Execution System). Le réseau OT est potentiellement exposé via MES-PROD-01. Nombre total de fichiers chiffrés : 45 000+.",
            "severity": "critical",
        },
        "description": "L'attaque se propage vers des systèmes critiques incluant l'ERP et le réseau OT.",
    },
    # ── Phase 3 : Confinement & Réponse ──
    {
        "phase_index": 2, "time_offset": 70, "custom_id": "INJ-007",
        "type": InjectType.DECISION, "title": "Isoler le réseau OT ?",
        "timeline_type": TimelineType.TECHNICAL,
        "inject_category": InjectCategory.DECISION, "channel": None,
        "target_audience": TargetAudience.DSI, "pressure_level": PressureLevel.CRITICAL,
        "tested_competence": TestedCompetence.ARBITRATION,
        "content": {
            "text": "Le ransomware a atteint le serveur MES-PROD-01 qui fait le lien entre IT et OT. L'isolation du réseau OT stopperait la propagation mais arrêterait la production sur les 2 sites industriels (coût estimé : 800K€/jour).",
            "options": [
                "Isolation complète IT/OT immédiate — arrêt de production accepté",
                "Isolation partielle — couper uniquement MES-PROD-01 et surveiller",
                "Ne pas isoler — renforcer la surveillance et tenter un confinement ciblé",
            ],
        },
        "description": "Décision critique : arbitrage entre sécurité et continuité de production.",
    },
    {
        "phase_index": 2, "time_offset": 90, "custom_id": "INJ-008",
        "type": InjectType.MAIL, "title": "Notification ANSSI — Incident de sécurité",
        "timeline_type": TimelineType.BUSINESS,
        "inject_category": InjectCategory.LEGAL, "channel": InjectChannel.OFFICIAL_MAIL,
        "target_audience": TargetAudience.LEGAL, "pressure_level": PressureLevel.HIGH,
        "tested_competence": TestedCompetence.GOVERNANCE,
        "content": {
            "subject": "Notification d'incident de sécurité — Duval Industries",
            "from": "cert-fr@ssi.gouv.fr",
            "to": "rssi@duval-industries.fr",
            "body": "Monsieur le RSSI,\n\nNous avons pris connaissance via nos sources d'un incident de sécurité potentiel affectant Duval Industries. Le groupe DarkSide a revendiqué une attaque sur votre infrastructure.\n\nConformément à la directive NIS et à votre statut potentiel d'Opérateur de Services Essentiels (OSE), nous vous rappelons vos obligations de notification.\n\nNous vous demandons de nous transmettre dans les meilleurs délais :\n1. Un rapport d'incident préliminaire\n2. Le périmètre des systèmes impactés\n3. Les mesures de confinement prises\n4. L'éventuelle compromission de données personnelles\n\nUn analyste CERT-FR peut être mis à disposition si nécessaire.\n\nCordialement,\nCERT-FR / ANSSI",
        },
        "description": "L'ANSSI contacte Duval Industries suite à la revendication publique de l'attaque.",
    },
    {
        "phase_index": 2, "time_offset": 110, "custom_id": "INJ-009",
        "type": InjectType.TWITTER, "title": "Tweet journaliste — Rumeur cyberattaque Duval",
        "timeline_type": TimelineType.BUSINESS,
        "inject_category": InjectCategory.MEDIA, "channel": InjectChannel.SOCIAL_NETWORK,
        "target_audience": TargetAudience.COM, "pressure_level": PressureLevel.HIGH,
        "tested_competence": TestedCompetence.COMMUNICATION,
        "content": {
            "text": "🚨 EXCLU — Selon nos sources, le groupe industriel Duval Industries serait victime d'une cyberattaque majeure de type ransomware. Des données employés auraient été exfiltrées. La direction n'a pas encore communiqué. #cybersécurité #ransomware @DuvalIndustries",
            "author": "@P_Martin_Cyber",
            "author_name": "Pierre Martin",
            "author_bio": "Journaliste cybersécurité @LeMondeTech — DM ouverts",
        },
        "description": "Un journaliste spécialisé publie les premières informations sur l'attaque.",
    },
    # ── Phase 4 : Communication de crise ──
    {
        "phase_index": 3, "time_offset": 125, "custom_id": "INJ-010",
        "type": InjectType.TV, "title": "Flash info — Cyberattaque industrielle majeure",
        "timeline_type": TimelineType.BUSINESS,
        "inject_category": InjectCategory.MEDIA, "channel": InjectChannel.TV,
        "target_audience": TargetAudience.ALL, "pressure_level": PressureLevel.CRITICAL,
        "tested_competence": TestedCompetence.COMMUNICATION,
        "content": {
            "headline": "FLASH — Cyberattaque massive chez Duval Industries",
            "body": "Le groupe industriel Duval Industries, sous-traitant majeur de l'aéronautique et de la défense, serait victime d'une attaque ransomware d'envergure. Selon nos informations, les systèmes de production seraient à l'arrêt et des données personnelles de plus de 2 000 employés auraient été dérobées. La direction n'a pour l'instant fait aucune déclaration officielle. L'ANSSI aurait été saisie.",
            "channel": "BFM Business",
            "ticker": "URGENT — Duval Industries victime d'une cyberattaque — Production à l'arrêt",
        },
        "description": "L'attaque fait l'objet d'un flash info sur une chaîne d'information continue.",
    },
    {
        "phase_index": 3, "time_offset": 140, "custom_id": "INJ-011",
        "type": InjectType.MAIL, "title": "Client Airbus — Demande de statut urgent",
        "timeline_type": TimelineType.BUSINESS,
        "inject_category": InjectCategory.INFORMATION, "channel": InjectChannel.MAIL,
        "target_audience": TargetAudience.DIRECTION, "pressure_level": PressureLevel.HIGH,
        "tested_competence": TestedCompetence.COMMUNICATION,
        "content": {
            "subject": "URGENT — Statut cybersécurité Duval Industries",
            "from": "security-office@airbus.com",
            "to": "dg@duval-industries.fr",
            "body": "Monsieur le Directeur Général,\n\nNous avons pris connaissance par voie de presse d'un incident de cybersécurité affectant votre organisation. En tant que fournisseur Tier-1 du programme A350, nous avons besoin d'une réponse formelle sous 24h sur les points suivants :\n\n1. Les systèmes liés à nos échanges de données techniques sont-ils impactés ?\n2. Des données relatives à nos programmes ont-elles été compromises ?\n3. Quelles mesures de confinement avez-vous déployées ?\n4. Quel est votre plan de reprise estimé ?\n\nNous vous informons que notre CSIRT procède à un audit de nos échanges avec vos systèmes. En l'absence de réponse sous 24h, nous serons contraints de suspendre temporairement nos échanges de données.\n\nCordialement,\nCyber Security Office — Airbus Defence & Space",
        },
        "description": "Un client stratégique exige des réponses immédiates sur l'impact de l'attaque.",
    },
    {
        "phase_index": 3, "time_offset": 160, "custom_id": "INJ-012",
        "type": InjectType.DECISION, "title": "Validation du communiqué de presse",
        "timeline_type": TimelineType.BUSINESS,
        "inject_category": InjectCategory.DECISION, "channel": None,
        "target_audience": TargetAudience.COM, "pressure_level": PressureLevel.HIGH,
        "tested_competence": TestedCompetence.COMMUNICATION,
        "content": {
            "text": "Le service communication a préparé un projet de communiqué de presse. Les médias et les clients attendent une déclaration officielle. Quel niveau de transparence adopter ?",
            "options": [
                "Communiqué complet — confirmer l'attaque, l'exfiltration et les mesures prises",
                "Communiqué mesuré — confirmer un incident de sécurité sans détailler l'exfiltration",
                "Communiqué minimal — signaler une perturbation technique en cours de résolution",
                "Reporter le communiqué — attendre d'avoir plus d'éléments avant de communiquer",
            ],
        },
        "description": "Décision sur le niveau de transparence de la communication externe.",
    },
    # ── Phase 5 : Remédiation & Reprise ──
    {
        "phase_index": 4, "time_offset": 190, "custom_id": "INJ-013",
        "type": InjectType.SYSTEM, "title": "Sauvegardes vérifiées — Restauration possible",
        "timeline_type": TimelineType.TECHNICAL,
        "inject_category": InjectCategory.TECHNICAL, "channel": InjectChannel.SIEM,
        "target_audience": TargetAudience.DSI, "pressure_level": PressureLevel.MEDIUM,
        "tested_competence": TestedCompetence.TECHNICAL,
        "content": {
            "message": "RAPPORT FORENSIQUE — Analyse des sauvegardes terminée. Les sauvegardes de mardi (J-3) sont compromises (traces du ransomware détectées). Les sauvegardes de dimanche (J-5) sont saines et exploitables. Perte de données estimée : 5 jours ouvrés. Temps de restauration estimé : 12-18h pour les serveurs critiques.",
            "severity": "info",
        },
        "description": "L'équipe forensique confirme la disponibilité de sauvegardes saines.",
    },
    {
        "phase_index": 4, "time_offset": 210, "custom_id": "INJ-014",
        "type": InjectType.MAIL, "title": "Plan de remédiation technique DSI",
        "timeline_type": TimelineType.TECHNICAL,
        "inject_category": InjectCategory.TECHNICAL, "channel": InjectChannel.MAIL,
        "target_audience": TargetAudience.DSI, "pressure_level": PressureLevel.MEDIUM,
        "tested_competence": TestedCompetence.COORDINATION,
        "content": {
            "subject": "Plan de remédiation et restauration — Proposition DSI",
            "from": "dsi@duval-industries.fr",
            "to": "cellule-crise@duval-industries.fr",
            "body": "Membres de la cellule de crise,\n\nVoici notre proposition de plan de remédiation :\n\nPhase 1 — Nettoyage (H+0 à H+6) :\n- Réinstallation complète des 6 serveurs compromis\n- Rotation de tous les secrets et mots de passe AD\n- Déploiement de l'EDR sur l'ensemble du parc\n\nPhase 2 — Restauration (H+6 à H+18) :\n- Restauration depuis les sauvegardes de dimanche\n- Perte estimée : données de lundi à vendredi\n- Priorité : ERP (SAP), puis serveurs de fichiers, puis MES\n\nPhase 3 — Surveillance renforcée (H+18 à J+30) :\n- SOC en mode 24/7 pendant 30 jours\n- Threat hunting quotidien\n- Audit complet du SI par prestataire externe\n\nCoût estimé de la remédiation : 1.2M€ — 1.8M€\n\nNous attendons votre validation pour lancer la Phase 1.\n\nCordialement,\nDirection des Systèmes d'Information",
        },
        "description": "La DSI soumet son plan de remédiation pour validation par la cellule de crise.",
    },
    {
        "phase_index": 4, "time_offset": 230, "custom_id": "INJ-015",
        "type": InjectType.DECISION, "title": "Reprise progressive des systèmes",
        "timeline_type": TimelineType.BUSINESS,
        "inject_category": InjectCategory.DECISION, "channel": None,
        "target_audience": TargetAudience.DIRECTION, "pressure_level": PressureLevel.MEDIUM,
        "tested_competence": TestedCompetence.GOVERNANCE,
        "content": {
            "text": "Le plan de remédiation DSI est prêt. La restauration depuis les sauvegardes de dimanche implique la perte de 5 jours de données. Quelle stratégie de reprise adopter ?",
            "options": [
                "Restauration immédiate depuis dimanche — accepter la perte de 5 jours",
                "Tenter une récupération partielle des données de lundi-mardi avant restauration",
                "Restauration progressive — commencer par les systèmes critiques (ERP, MES) puis étendre",
            ],
        },
        "description": "Décision finale sur la stratégie de reprise d'activité.",
    },
]


async def create_demo_exercise(
    users: dict[str, User],
    teams: dict[str, Team],
    tenant_id: int | None = None,
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
            # Fix tenant_id if missing
            if existing.tenant_id is None and tenant_id is not None:
                existing.tenant_id = tenant_id
                await session.commit()
                print(f"  🔧 Exercice '{DEMO_EXERCISE['name']}' → tenant_id assigné")
            print(f"  ⏭️  Exercice '{DEMO_EXERCISE['name']}' existe déjà (id={existing.id})")
            return existing

        exercise = Exercise(
            name=DEMO_EXERCISE["name"],
            description=DEMO_EXERCISE["description"],
            status=DEMO_EXERCISE["status"],
            created_by=admin_user.id if admin_user else None,
            tenant_id=tenant_id,
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


async def seed_demo_exercise_content(
    exercise: Exercise,
    users: dict[str, User],
    *,
    force: bool = False,
) -> None:
    """Peuple le contenu complet de l'exercice démo (scénario, phases, injects)."""
    print("\n📋 Seed du contenu de l'exercice démo...")

    admin_user = users.get("admin")

    async with async_session_factory() as session:
        # Re-fetch exercise in this session
        result = await session.execute(
            select(Exercise).where(Exercise.id == exercise.id)
        )
        ex = result.scalar_one_or_none()
        if not ex:
            print("  ❌ Exercice introuvable")
            return

        # Check if already seeded (unless --force)
        if ex.timeline_configured and not force:
            print(f"  ⏭️  Contenu déjà seedé (timeline_configured=True). Utilisez --force pour écraser.")
            return

        if force:
            print("  🔄 Mode --force : suppression du contenu existant...")
            # Delete in FK order: Injects → Phases → Axes → Scenario
            await session.execute(
                delete(Inject).where(Inject.exercise_id == ex.id)
            )
            await session.execute(
                delete(ExercisePhase).where(ExercisePhase.exercise_id == ex.id)
            )
            await session.execute(
                delete(ExerciseEscalationAxis).where(ExerciseEscalationAxis.exercise_id == ex.id)
            )
            await session.execute(
                delete(ExerciseScenario).where(ExerciseScenario.exercise_id == ex.id)
            )
            await session.flush()
            print("  ✅ Contenu existant supprimé")

        # 1. Update exercise metadata
        planned_date = datetime.now(timezone.utc) + timedelta(days=30)
        for key, value in DEMO_EXERCISE_METADATA.items():
            setattr(ex, key, value)
        ex.planned_date = planned_date
        if admin_user:
            ex.lead_organizer_user_id = admin_user.id
        await session.flush()
        print("  ✅ Métadonnées exercice mises à jour")

        # 2. Create scenario
        scenario = ExerciseScenario(exercise_id=ex.id, **DEMO_SCENARIO)
        session.add(scenario)
        await session.flush()
        print("  ✅ Scénario créé")

        # 3. Create escalation axes
        for axis_data in DEMO_ESCALATION_AXES:
            axis = ExerciseEscalationAxis(exercise_id=ex.id, **axis_data)
            session.add(axis)
        await session.flush()
        print(f"  ✅ {len(DEMO_ESCALATION_AXES)} axes d'escalade créés")

        # 4. Create phases and build index → id mapping
        phase_id_map: dict[int, int] = {}
        for i, phase_data in enumerate(DEMO_PHASES):
            phase = ExercisePhase(exercise_id=ex.id, **phase_data)
            session.add(phase)
            await session.flush()
            phase_id_map[i] = phase.id
        print(f"  ✅ {len(DEMO_PHASES)} phases créées")

        # 5. Create injects
        for inject_data in DEMO_INJECTS:
            data = {k: v for k, v in inject_data.items() if k != "phase_index"}
            data["exercise_id"] = ex.id
            data["phase_id"] = phase_id_map[inject_data["phase_index"]]
            data["status"] = InjectStatus.DRAFT
            if admin_user:
                data["created_by"] = admin_user.id
            inject = Inject(**data)
            session.add(inject)
        await session.flush()
        print(f"  ✅ {len(DEMO_INJECTS)} injects créés")

        await session.commit()

    print("✅ Contenu de l'exercice démo seedé avec succès")
    print(f"   Scénario: 1 | Axes: {len(DEMO_ESCALATION_AXES)} | Phases: {len(DEMO_PHASES)} | Injects: {len(DEMO_INJECTS)}")
