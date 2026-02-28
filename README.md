# TTX Platform – Table Top Exercise Platform

Plateforme de simulation d'exercices de crise (**Table Top Exercise**) pour la formation et l'entraînement à la gestion de situations d'urgence.

---

## 📖 Description

TTX Platform permet de concevoir, animer et vivre des exercices de crise simulés. Elle reproduit les outils de communication d'une vraie cellule de crise (webmail, médias sociaux, TV en direct, messagerie d'équipe) dans un environnement maîtrisé et scénarisé.

### Cas d'usage typiques
- Formation des équipes de gestion de crise
- Évaluation des procédures d'urgence
- Entraînement à la prise de décision sous pression
- Test de plans de continuité d'activité (PCA/PRA)

---

## 👥 Rôles

| Rôle | Description | Accès |
|------|-------------|-------|
| **Admin** | Configure la plateforme, gère les utilisateurs et les équipes | Tout : administration, exercices, configuration |
| **Animateur** | Crée et pilote les exercices, envoie les injects, gère l'avancement | Exercices, injects, timeline, médias |
| **Observateur** | Suit l'exercice en lecture seule, peut noter et scorer | Tous les écrans sans action |
| **Participant** | Joue l'exercice depuis l'interface joueur | Interface joueur de son exercice assigné |

### Rôles dans un exercice

Un utilisateur peut avoir un rôle différent selon l'exercice :

| Rôle exercice | Droits |
|---------------|--------|
| `animateur` | Contrôle total de l'exercice |
| `observateur` | Lecture + scoring + annotation |
| `joueur` | Webmail, chat, décisions, médias de son équipe |

---

## 🏗️ Architecture

```
ttx-platform/
├── backend/                    # FastAPI Python Backend
│   ├── app/
│   │   ├── models/            # SQLAlchemy Models (User, Exercise, Inject, Team...)
│   │   ├── routers/           # Endpoints REST API
│   │   ├── schemas/           # Pydantic Schemas (validation)
│   │   ├── services/          # Services métier
│   │   ├── utils/
│   │   │   ├── permissions.py # Système RBAC complet
│   │   │   └── security.py    # Hash passwords, sessions
│   │   └── main.py            # FastAPI App entry point
│   ├── alembic/               # Migrations base de données
│   └── scripts/
│       ├── init_db.py         # Init tables + données de base
│       └── init_env.py        # Init complète : users, équipes, exercice démo
├── frontend/                   # React TypeScript Frontend
│   ├── src/
│   │   ├── components/
│   │   │   ├── Layout.tsx          # Layout admin/animateur (sidebar adaptative)
│   │   │   ├── ObservateurLayout.tsx  # Layout observateur (lecture seule)
│   │   │   └── player/             # Composants layout joueur
│   │   ├── pages/
│   │   │   ├── admin/              # Pages admin (users, teams, audit)
│   │   │   ├── player/             # Pages interface joueur
│   │   │   ├── observateur/        # Pages interface observateur
│   │   │   └── ParticipantLandingPage.tsx  # Page d'accueil participants
│   │   ├── services/              # Clients API (api.ts, playerApi.ts)
│   │   └── stores/                # État global Zustand (authStore)
│   └── package.json
└── docker-compose.yml          # Environnement de développement
```

---

## 🚀 Démarrage rapide

### Prérequis
- Docker & Docker Compose
- (Optionnel) Node.js 18+ / Python 3.11+ pour développement local

### 1. Cloner et configurer

```bash
git clone <repo-url>
cd inject
cp .env.example .env
# Éditer .env si nécessaire
```

### 2. Lancer les services

```bash
docker compose up -d
```

### 3. Initialiser l'environnement complet

```bash
# Option A : initialisation complète avec exercice de démo
docker compose exec backend python scripts/init_env.py --demo-exercise

# Option B : reset complet + réinitialisation
docker compose exec backend python scripts/init_env.py --reset --demo-exercise

# Option C : init minimale (tables + utilisateurs de base uniquement)
docker compose exec backend python scripts/init_db.py
```

### 4. Accéder à l'application

| Service | URL |
|---------|-----|
| Frontend | http://localhost:5173 |
| Backend API | http://localhost:3000 |
| API Docs (Swagger) | http://localhost:3000/docs |

---

## 🔑 Comptes par défaut

Créés par `init_env.py` :

| Rôle | Utilisateur | Mot de passe |
|------|-------------|--------------|
| Admin | `admin` | `Admin123!` |
| Animateur | `animateur1` | `Anim123!` |
| Animateur | `animateur2` | `Anim123!` |
| Observateur | `observateur1` | `Obs123!` |
| Observateur | `observateur2` | `Obs123!` |
| Participant | `participant1` | `Part123!` |
| Participant | `participant2` | `Part123!` |
| ... | ... | ... |

> ⚠️ **Changer ces mots de passe en production !**

---

## 🎮 Flux d'utilisation typique

```
1. ADMIN        → Configure les utilisateurs et les équipes
2. ANIMATEUR    → Crée un exercice, définit le scénario, prépare les injects
3. ADMIN/ANIM   → Assigne les participants et observateurs à l'exercice
4. ANIMATEUR    → Lance l'exercice
5. PARTICIPANTS → Se connectent et rejoignent l'exercice en cours
6. ANIMATEUR    → Envoie des injects (emails, tweets, breaking news TV...)
7. PARTICIPANTS → Réagissent : répondent aux emails, prennent des décisions
8. OBSERVATEURS → Suivent tous les écrans, annotent, scorent les équipes
9. ANIMATEUR    → Pause / reprend / clôture l'exercice
10. ADMIN/ANIM  → Exporte le rapport de l'exercice
```

---

## 🛠️ Développement

### Backend seul

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 3000
```

### Frontend seul

```bash
cd frontend
npm install
npm run dev
```

### Migrations base de données

```bash
# Créer une nouvelle migration
docker compose exec backend alembic revision --autogenerate -m "description"

# Appliquer les migrations
docker compose exec backend alembic upgrade head

# Revenir à une version précédente
docker compose exec backend alembic downgrade -1
```

### Logs

```bash
docker compose logs -f backend
docker compose logs -f frontend
```

---

## 🔐 Sécurité

- Sessions serveur (pas de JWT stocké côté client)
- Protection CSRF sur toutes les mutations
- RBAC à deux niveaux : rôle global + rôle par exercice
- Verrouillage de compte après échecs de connexion
- Audit trail complet des actions

---

## 📦 Variables d'environnement

| Variable | Description | Défaut |
|----------|-------------|--------|
| `DB_PASSWORD` | Mot de passe PostgreSQL | `ttx_dev_password` |
| `SESSION_SECRET` | Clé secrète des sessions (min 32 chars) | *(à changer)* |
| `ENVIRONMENT` | `development` ou `production` | `development` |
| `CORS_ORIGINS` | Origines CORS autorisées | `http://localhost:5173` |
| `API_URL` | URL de l'API (frontend) | `http://localhost:3000` |
