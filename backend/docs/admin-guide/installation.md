# Installation

## Prérequis

- Docker Engine 24+
- Docker Compose v2+
- 2 Go RAM minimum
- 10 Go espace disque

## Déploiement rapide

```bash
# Cloner le dépôt
git clone <url-du-depot>
cd ttx-community

# Configurer les variables d'environnement
cp .env.example .env
# Éditer .env avec vos valeurs

# Démarrer les conteneurs
docker compose up -d
```

## Conteneurs

| Conteneur | Port | Rôle |
|-----------|------|------|
| `ttx-community-frontend` | 80 | Interface web (Nginx + React) |
| `ttx-community-backend` | 3000 | API FastAPI |
| `ttx-community-postgres` | 5432 | Base de données PostgreSQL |

## Variables d'environnement clés

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | URL de connexion PostgreSQL |
| `SECRET_KEY` | Clé secrète pour les sessions |
| `CORS_ORIGINS` | Origines autorisées (CORS) |
| `ENVIRONMENT` | `development` ou `production` |

## Premier démarrage

Au premier démarrage, CrisisLab crée automatiquement :

1. Le schéma de base de données
2. Un tenant par défaut (`localhost`)
3. Un compte administrateur initial (voir les logs du backend)
