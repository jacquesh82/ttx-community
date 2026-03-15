# Référence API

L'API CrisisLab est une API REST construite avec **FastAPI** (Python).

## Authentification

L'API utilise des **cookies de session** (`ttx_session`).

```http
POST /api/auth/login
Content-Type: application/json

{
  "username_or_email": "admin",
  "password": "secret"
}
```

La réponse définit automatiquement le cookie de session à utiliser dans les requêtes suivantes.

## Base URL

```
http://<votre-instance>:3000
```

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
| `204` | Suppression réussie (pas de contenu) |
| `400` | Requête invalide |
| `401` | Non authentifié |
| `403` | Accès refusé |
| `404` | Ressource introuvable |
| `422` | Erreur de validation |
| `500` | Erreur serveur |

---

## Endpoints par groupe

### Auth — `/api/auth`

| Méthode | Chemin | Description | Auth |
|---------|--------|-------------|------|
| POST | `/login` | Connexion (username/email + mot de passe) | Non |
| POST | `/logout` | Déconnexion (suppression session) | Oui |
| GET | `/me` | Profil de l'utilisateur courant + info tenant | Oui |
| PATCH | `/profile` | Mise à jour du profil (email, display_name) | Oui |
| POST | `/ws-ticket` | Générer un ticket WebSocket éphémère | Oui |
| POST | `/password/change` | Changer son mot de passe | Oui |
| POST | `/dev-login/{role}` | Login rapide dev (DEV uniquement) | Non |

### Utilisateurs — `/api/users`

| Méthode | Chemin | Description | Auth |
|---------|--------|-------------|------|
| GET | `/` | Liste des utilisateurs du tenant | admin |
| POST | `/` | Créer un utilisateur | admin |
| GET | `/{user_id}` | Détail d'un utilisateur | admin |
| PUT | `/{user_id}` | Modifier un utilisateur | admin |
| DELETE | `/{user_id}` | Supprimer un utilisateur | admin |

### Équipes — `/api/teams`

| Méthode | Chemin | Description | Auth |
|---------|--------|-------------|------|
| GET | `/` | Liste des équipes | Oui |
| POST | `/` | Créer une équipe | admin |
| GET | `/{team_id}` | Détail d'une équipe + membres | Oui |
| PUT | `/{team_id}` | Modifier une équipe | admin |
| DELETE | `/{team_id}` | Supprimer une équipe | admin |
| POST | `/{team_id}/members/{user_id}` | Ajouter un membre | admin |
| DELETE | `/{team_id}/members/{user_id}` | Retirer un membre | admin |

### Exercices — `/api/exercises`

| Méthode | Chemin | Description | Auth |
|---------|--------|-------------|------|
| GET | `/creation-options` | Options de création (types, niveaux, modes) | Oui |
| GET | `/` | Liste des exercices | Oui |
| POST | `/` | Créer un exercice | admin, animateur |
| GET | `/{exercise_id}` | Détail d'un exercice | Oui |
| PUT | `/{exercise_id}` | Modifier un exercice | admin, animateur |
| DELETE | `/{exercise_id}` | Supprimer un exercice | admin |
| GET | `/{exercise_id}/teams` | Équipes assignées à l'exercice | Oui |
| POST | `/{exercise_id}/teams/{team_id}` | Assigner une équipe | admin, animateur |
| DELETE | `/{exercise_id}/teams/{team_id}` | Retirer une équipe | admin, animateur |
| POST | `/{exercise_id}/start` | Démarrer l'exercice | admin, animateur |
| POST | `/{exercise_id}/restart` | Redémarrer l'exercice | admin, animateur |
| POST | `/{exercise_id}/pause` | Mettre en pause | admin, animateur |
| POST | `/{exercise_id}/end` | Terminer l'exercice | admin, animateur |
| GET | `/{exercise_id}/stats` | Statistiques de l'exercice | Oui |
| GET | `/plugins/available` | Plugins disponibles | Oui |
| PUT | `/{exercise_id}/plugins/{plugin_type}` | Configurer un plugin pour l'exercice | admin, animateur |

### Injects — `/api/injects`

| Méthode | Chemin | Description | Auth |
|---------|--------|-------------|------|
| GET | `/types` | Types d'injects disponibles | Oui |
| GET | `/schema/timeline` | Schéma JSON pour la timeline | Oui |
| GET | `/` | Liste des injects (filtrable par exercice) | Oui |
| POST | `/` | Créer un inject | admin, animateur |
| GET | `/{inject_id}` | Détail d'un inject | Oui |
| PUT | `/{inject_id}` | Modifier un inject | admin, animateur |
| POST | `/{inject_id}/send` | Envoyer un inject | admin, animateur |
| POST | `/{inject_id}/schedule` | Planifier un inject | admin, animateur |
| POST | `/{inject_id}/cancel` | Annuler un inject planifié | admin, animateur |
| DELETE | `/{inject_id}` | Supprimer un inject | admin, animateur |
| GET | `/{inject_id}/deliveries` | Historique de livraison | Oui |
| POST | `/import-csv` | Importer des injects depuis CSV | admin, animateur |
| GET | `/template/csv` | Télécharger le template CSV | Oui |
| GET | `/{inject_id}/media` | Médias attachés à un inject | Oui |
| POST | `/{inject_id}/media` | Attacher un média | admin, animateur |
| DELETE | `/{inject_id}/media/{media_id}` | Détacher un média | admin, animateur |
| PUT | `/{inject_id}/media/reorder` | Réordonner les médias | admin, animateur |

### Banque d'injects — `/api/inject-bank`

| Méthode | Chemin | Description | Auth |
|---------|--------|-------------|------|
| GET | `/` | Liste paginée + filtres | Oui |
| GET | `/stats` | Statistiques de la banque | Oui |
| GET | `/categories` | Catégories existantes | Oui |
| GET | `/schema` | Schéma JSON des items | Oui |
| GET | `/export/zip` | Export ZIP complet | admin |
| DELETE | `/clear-all` | Vider toute la banque | admin |
| POST | `/import/zip` | Importer depuis ZIP | admin |
| POST | `/` | Créer un item | admin, animateur |
| GET | `/kinds` | Types d'items | Oui |
| GET | `/statuses` | Statuts possibles | Oui |
| GET | `/{item_id}` | Détail d'un item | Oui |
| PUT | `/{item_id}` | Modifier un item | admin, animateur |
| DELETE | `/{item_id}` | Supprimer un item | admin, animateur |

### Événements — `/api/events`

| Méthode | Chemin | Description | Auth |
|---------|--------|-------------|------|
| GET | `/` | Liste des événements (filtrable par exercice) | Oui |
| GET | `/{event_id}` | Détail d'un événement | Oui |

### Joueur — `/api/player`

| Méthode | Chemin | Description | Auth |
|---------|--------|-------------|------|
| *Sous-routes spécifiques au rôle participant* | | Vue côté joueur de l'exercice | participant |

### Canaux simulés — `/api/simulated`

#### Chat

| Méthode | Chemin | Description | Auth |
|---------|--------|-------------|------|
| GET | `/{exercise_id}/chat/rooms/{room_id}` | Détail d'une room + messages | Oui |
| POST | `/{exercise_id}/chat/rooms/{room_id}/messages` | Envoyer un message | Oui |
| POST | `/{exercise_id}/chat/rooms` | Créer une room | admin, animateur |

#### SMS

| Méthode | Chemin | Description | Auth |
|---------|--------|-------------|------|
| GET | `/{exercise_id}/sms/conversations` | Liste des conversations SMS | Oui |
| POST | `/{exercise_id}/sms` | Envoyer un SMS (joueur) | Oui |
| POST | `/{exercise_id}/sms/inject` | Injecter un SMS (animateur) | admin, animateur |
| POST | `/{exercise_id}/sms/{sms_id}/read` | Marquer comme lu | Oui |

#### Appels

| Méthode | Chemin | Description | Auth |
|---------|--------|-------------|------|
| GET | `/{exercise_id}/calls` | Liste des appels | Oui |
| GET | `/{exercise_id}/calls/active` | Appel actif en cours | Oui |
| POST | `/{exercise_id}/calls/inject` | Injecter un appel | admin, animateur |
| POST | `/{exercise_id}/calls/{call_id}/action` | Action sur un appel (décrocher, raccrocher…) | Oui |

#### Réseaux sociaux

| Méthode | Chemin | Description | Auth |
|---------|--------|-------------|------|
| GET | `/{exercise_id}/social` | Fil d'actualité social | Oui |
| POST | `/{exercise_id}/social/inject` | Injecter un post social | admin, animateur |
| POST | `/{exercise_id}/social/{post_id}/react` | Réagir à un post | Oui |

#### Presse

| Méthode | Chemin | Description | Auth |
|---------|--------|-------------|------|
| GET | `/{exercise_id}/press` | Fil d'articles de presse | Oui |
| GET | `/{exercise_id}/press/{article_id}` | Détail d'un article | Oui |
| POST | `/{exercise_id}/press/inject` | Injecter un article | admin, animateur |

#### TV simulée (canal simulé)

| Méthode | Chemin | Description | Auth |
|---------|--------|-------------|------|
| GET | `/{exercise_id}/tv` | Fil TV simulé | Oui |
| POST | `/{exercise_id}/tv/inject` | Injecter un événement TV | admin, animateur |
| POST | `/{exercise_id}/tv/{event_id}/seen` | Marquer comme vu | Oui |
| WS | `/{exercise_id}/ws` | WebSocket temps réel canaux simulés | Oui |

### Contacts de crise — `/api/crisis-contacts`

| Méthode | Chemin | Description | Auth |
|---------|--------|-------------|------|
| GET | `/` | Liste des contacts (filtrable par exercice) | Oui |
| GET | `/{contact_id}` | Détail d'un contact | Oui |
| POST | `/` | Créer un contact | admin, animateur |
| PUT | `/{contact_id}` | Modifier un contact | admin, animateur |
| DELETE | `/{contact_id}` | Supprimer un contact | admin, animateur |
| POST | `/import` | Importer des contacts (CSV) | admin, animateur |
| GET | `/template/csv` | Télécharger le template CSV | Oui |

### Gestion de crise — `/api/exercises`

*Endpoints avancés sous le préfixe exercice (tag crisis-management).*

| Méthode | Chemin | Description | Auth |
|---------|--------|-------------|------|
| GET | `/{exercise_id}/scenario` | Scénario de l'exercice | Oui |
| PUT | `/{exercise_id}/scenario` | Modifier le scénario | admin, animateur |
| GET | `/{exercise_id}/escalation-axes` | Axes d'escalade | Oui |
| POST | `/{exercise_id}/escalation-axes` | Créer un axe | admin, animateur |
| PUT | `/{exercise_id}/escalation-axes/{axis_id}` | Modifier un axe | admin, animateur |
| DELETE | `/{exercise_id}/escalation-axes/{axis_id}` | Supprimer un axe | admin, animateur |
| GET | `/{exercise_id}/phases` | Phases de l'exercice | Oui |
| POST | `/{exercise_id}/phases` | Créer une phase | admin, animateur |
| PUT | `/{exercise_id}/phases/{phase_id}` | Modifier une phase | admin, animateur |
| DELETE | `/{exercise_id}/phases/{phase_id}` | Supprimer une phase | admin, animateur |
| GET | `/{exercise_id}/inject-triggers` | Règles de déclenchement | Oui |
| POST | `/{exercise_id}/inject-triggers` | Créer une règle | admin, animateur |
| DELETE | `/{exercise_id}/inject-triggers/{rule_id}` | Supprimer une règle | admin, animateur |
| GET | `/{exercise_id}/live-dashboard` | Dashboard temps réel | Oui |
| POST | `/{exercise_id}/live/surprise-injects` | Injecter une surprise en live | admin, animateur |
| POST | `/{exercise_id}/live/actions` | Actions live (timeline) | admin, animateur |
| GET | `/{exercise_id}/evaluation` | Données d'évaluation | Oui |
| POST | `/{exercise_id}/retex/generate` | Générer le RETEX | admin, animateur |
| GET | `/{exercise_id}/retex/export.json` | Exporter RETEX en JSON | admin, animateur |
| GET | `/{exercise_id}/retex/export.pdf` | Exporter RETEX en PDF | admin, animateur |
| GET | `/{exercise_id}/retex/export.anssi.json` | Exporter au format ANSSI | admin, animateur |
| POST | `/{exercise_id}/imports/{component}` | Importer un composant (CSV) | admin, animateur |
| POST | `/{exercise_id}/imports/{component}/from-bank` | Importer depuis la banque | admin, animateur |
| POST | `/{exercise_id}/imports/{component}/from-bank-selection` | Importer une sélection depuis la banque | admin, animateur |
| GET | `/{exercise_id}/actors/orgchart` | Organigramme des acteurs | Oui |

### Utilisateurs d'exercice — `/api/exercises`

*Gestion des affectations utilisateurs aux exercices (tag exercise-users).*

| Méthode | Chemin | Description | Auth |
|---------|--------|-------------|------|
| GET | `/{exercise_id}/users` | Utilisateurs assignés | Oui |
| POST | `/{exercise_id}/users` | Assigner un utilisateur | admin, animateur |
| PUT | `/{exercise_id}/users/{user_id}` | Modifier l'affectation | admin, animateur |
| DELETE | `/{exercise_id}/users/{user_id}` | Retirer un utilisateur | admin, animateur |
| GET | `/{exercise_id}/available-users` | Utilisateurs disponibles | admin, animateur |
| GET | `/users/{user_id}/exercises` | Exercices d'un utilisateur | Oui |

### Médias — `/api/media`

| Méthode | Chemin | Description | Auth |
|---------|--------|-------------|------|
| GET | `/` | Liste des médias du tenant | Oui |
| POST | `/upload` | Uploader un fichier | Oui |
| GET | `/{media_id}` | Détail/téléchargement d'un média | Oui |
| PATCH | `/{media_id}` | Modifier les métadonnées | Oui |
| DELETE | `/{media_id}` | Supprimer un média | admin |

### Twitter (simulé) — `/api/twitter`

| Méthode | Chemin | Description | Auth |
|---------|--------|-------------|------|
| GET | `/accounts/{exercise_id}` | Comptes Twitter d'un exercice | Oui |
| POST | `/accounts` | Créer un compte | admin, animateur |
| GET | `/accounts/by-id/{account_id}` | Détail d'un compte | Oui |
| PUT | `/accounts/{account_id}` | Modifier un compte | admin, animateur |
| DELETE | `/accounts/{account_id}` | Supprimer un compte | admin, animateur |
| GET | `/posts/{exercise_id}` | Posts d'un exercice | Oui |
| POST | `/posts` | Créer un post | admin, animateur |
| GET | `/posts/by-id/{post_id}` | Détail d'un post | Oui |
| PUT | `/posts/{post_id}` | Modifier un post | admin, animateur |
| POST | `/posts/{post_id}/publish` | Publier un post | admin, animateur |
| DELETE | `/posts/{post_id}` | Supprimer un post | admin, animateur |
| POST | `/accounts/import-csv` | Importer des comptes (CSV) | admin, animateur |
| POST | `/posts/import-csv` | Importer des posts (CSV) | admin, animateur |
| GET | `/template/accounts/csv` | Template CSV comptes | Oui |
| GET | `/template/posts/csv` | Template CSV posts | Oui |

### TV — `/api/tv`

| Méthode | Chemin | Description | Auth |
|---------|--------|-------------|------|
| GET | `/channels/{exercise_id}` | Chaînes TV d'un exercice | Oui |
| POST | `/channels` | Créer une chaîne | admin, animateur |
| GET | `/{exercise_id}/live` | État live TV | Oui |
| POST | `/{exercise_id}/live/banner` | Changer le bandeau | admin, animateur |
| POST | `/{exercise_id}/live/ticker` | Changer le ticker | admin, animateur |
| POST | `/{exercise_id}/live/control` | Contrôle live (play, stop…) | admin, animateur |
| GET | `/{exercise_id}/segments` | Segments TV | Oui |
| POST | `/segments` | Créer un segment | admin, animateur |
| POST | `/segments/{segment_id}/start` | Démarrer un segment | admin, animateur |
| POST | `/segments/{segment_id}/end` | Terminer un segment | admin, animateur |
| GET | `/{exercise_id}/playlist` | Playlist TV | Oui |
| POST | `/{exercise_id}/playlist` | Ajouter à la playlist | admin, animateur |
| PATCH | `/{exercise_id}/playlist/reorder` | Réordonner la playlist | admin, animateur |
| DELETE | `/playlist/{item_id}` | Supprimer un item de playlist | admin, animateur |

### Audit — `/api/audit`

| Méthode | Chemin | Description | Auth |
|---------|--------|-------------|------|
| GET | `/` | Logs d'audit paginés + filtres | admin |
| GET | `/stats` | Statistiques d'audit | admin |
| GET | `/{log_id}` | Détail d'un log | admin |
| GET | `/export/csv` | Export CSV des logs | admin |

### Administration — `/api/admin`

| Méthode | Chemin | Description | Auth |
|---------|--------|-------------|------|
| GET | `/public/config` | Configuration publique (branding) | Non |
| GET | `/config` | Configuration complète du tenant | admin |
| PUT | `/config` | Modifier la configuration | admin |
| GET | `/config/export` | Exporter la configuration (JSON) | admin |
| POST | `/config/import` | Importer une configuration | admin |
| GET | `/plugins` | Plugins configurés | admin |
| PUT | `/plugins/{plugin_type}` | Configurer un plugin | admin |
| POST | `/plugins/reset` | Réinitialiser tous les plugins | admin |
| GET | `/plugins/registry` | Registre des plugins disponibles | admin |
| GET | `/placeholders` | Liste des placeholders et leurs valeurs | admin |
| POST | `/placeholders/resolve` | Résoudre des placeholders dans un texte | admin |
| GET | `/api-keys` | Liste des clés API | admin |
| POST | `/api-keys` | Créer une clé API | admin |
| DELETE | `/api-keys/{key_id}` | Révoquer une clé API | admin |

### Webmail (simulé) — `/api/webmail`

| Méthode | Chemin | Description | Auth |
|---------|--------|-------------|------|
| GET | `/conversations` | Liste des conversations email | Oui |
| GET | `/conversations/{conversation_id}` | Détail d'une conversation | Oui |
| POST | `/conversations` | Créer une conversation | Oui |
| POST | `/messages` | Envoyer un message | Oui |
| POST | `/messages/{message_id}/read` | Marquer un message comme lu | Oui |
| POST | `/conversations/{conversation_id}/read-all` | Marquer tous les messages comme lus | Oui |
| POST | `/inject-message` | Injecter un message (animateur) | admin, animateur |

### Welcome Kits — `/api/welcome-kits`

| Méthode | Chemin | Description | Auth |
|---------|--------|-------------|------|
| GET | `/templates` | Liste des templates de kit | admin |
| GET | `/templates/{template_id}` | Détail d'un template | admin |
| POST | `/templates` | Créer un template | admin |
| PUT | `/templates/{template_id}` | Modifier un template | admin |
| DELETE | `/templates/{template_id}` | Supprimer un template | admin |
| GET | `/exercises/{exercise_id}/preview/{user_id}` | Prévisualiser un kit | admin, animateur |
| GET | `/exercises/{exercise_id}/generate/{user_id}` | Générer un kit PDF | admin, animateur |
| POST | `/exercises/{exercise_id}/generate-all` | Générer tous les kits | admin, animateur |
| POST | `/exercises/{exercise_id}/download-all` | Télécharger tous les kits (ZIP) | admin, animateur |
| POST | `/exercises/{exercise_id}/ensure-passwords` | Générer les mots de passe manquants | admin, animateur |

### WebSocket — `/ws`

| Chemin | Description | Auth |
|--------|-------------|------|
| `/ws/exercise/{exercise_id}` | Flux temps réel de l'exercice | Ticket WS |

### Debug — `/api/debug`

*Disponible uniquement en développement.*

| Méthode | Chemin | Description | Auth |
|---------|--------|-------------|------|
| GET | `/exercises` | Liste simplifiée des exercices | Oui |
| GET | `/exercises/{exercise_id}/timeline` | Timeline de debug | Oui |
| GET | `/status` | Statut du serveur | Non |
| WS | `/ws/events` | WebSocket événements de debug | Non |
