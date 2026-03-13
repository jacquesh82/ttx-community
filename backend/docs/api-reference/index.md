# Référence API

L'API CrisisLab est une API REST construite avec **FastAPI** (Python).

## Authentification

L'API utilise des **cookies de session** (`ttx_session`).

```http
POST /api/auth/login
Content-Type: application/json

{
  "username": "admin",
  "password": "secret"
}
```

La réponse définit automatiquement le cookie de session à utiliser dans les requêtes suivantes.

## Base URL

```
http://<votre-instance>:3000
```

## Principaux endpoints

| Groupe | Préfixe | Description |
|--------|---------|-------------|
| Auth | `/api/auth` | Login, logout, profil, sessions |
| Utilisateurs | `/api/users` | CRUD utilisateurs |
| Équipes | `/api/teams` | CRUD équipes |
| Exercices | `/api/exercises` | Cycle de vie des exercices |
| Injects | `/api/injects` | Gestion des injects |
| Banque d'injects | `/api/inject-bank` | Bibliothèque réutilisable |
| Joueur | `/api/player` | API côté joueur |
| Canaux simulés | `/api/simulated-channels` | Messagerie, SMS, appels... |
| Médias | `/api/media` | Upload et gestion des fichiers |
| Administration | `/api/admin` | Configuration plateforme |

## Swagger UI interactif

La documentation interactive générée automatiquement par FastAPI est disponible en environnement de développement :

[Ouvrir Swagger UI](/api/docs){.md-button .md-button--primary}

> **Note** : Swagger UI est désactivé en production (`ENVIRONMENT=production`).

## Format des réponses

Les erreurs suivent ce format :

```json
{
  "error": "error_code",
  "detail": "Description de l'erreur"
}
```

Codes HTTP utilisés :

| Code | Signification |
|------|---------------|
| `200` | Succès |
| `201` | Ressource créée |
| `400` | Requête invalide |
| `401` | Non authentifié |
| `403` | Accès refusé |
| `404` | Ressource introuvable |
| `422` | Erreur de validation |
| `500` | Erreur serveur |
