# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Architecture Overview

TTX Community is a **Table Top Exercise (TTX) platform** for crisis simulation. It is a multi-tenant SaaS with:
- **Backend**: FastAPI (Python, async), PostgreSQL 16, SQLAlchemy async ORM, Alembic migrations
- **Frontend**: React 18 + TypeScript + Vite, TailwindCSS, Zustand, TanStack Query, react-router-dom v6
- **Real-time**: WebSocket (`/ws`) managed by `websocket_manager` service
- **Docker**: Three containers — `ttx-community-backend` (port 3000), `ttx-community-frontend` (port 5173), `ttx-community-postgres`

## Commands

All runtime commands go through Docker. The containers are named `ttx-community-backend`, `ttx-community-frontend`, `ttx-community-postgres`.

```bash
# Start all services
docker compose up

# Backend: run all tests
docker compose exec ttx-community-backend pytest

# Backend: run a single test file
docker compose exec ttx-community-backend pytest tests/test_auth.py

# Backend: run a single test
docker compose exec ttx-community-backend pytest tests/test_auth.py::TestLogin::test_login_with_username

# Backend: apply migrations
docker compose exec ttx-community-backend alembic upgrade head

# Backend: create a new migration
docker compose exec ttx-community-backend alembic revision -m "description"

# Backend: seed initial data (creates demo tenant + users)
docker compose exec ttx-community-backend python scripts/init_env.py --demo-exercise

# Frontend: install a new npm package (node_modules owned by root)
docker exec ttx-community-frontend npm install <pkg>
```

API docs (dev only): `http://localhost:3000/api/docs`

## Multi-tenancy

Tenants are resolved from the `Host` header by `TenantContextMiddleware`. In dev, `localhost` maps to the default tenant. Context variables `current_tenant_id_var` / `current_tenant_slug_var` (in `app/utils/tenancy.py`) carry the tenant through the request lifecycle. Every model that is tenant-scoped has a `tenant_id` foreign key.

Two scopes exist on sessions: `TENANT` (normal user) and `PLATFORM` (admin spanning tenants).

## Authentication

Cookie-based sessions — **no JWT**. The cookie is `ttx_session` (dev) or `__Host-ttx_session` (prod). The session token hash is stored in the `sessions` table. Password hashing uses Argon2. After `login_max_attempts` failures the account is locked for `login_lockout_minutes`.

## Backend Structure

```
backend/app/
  main.py          # FastAPI app, lifespan, middleware registration, router mounting
  config.py        # Pydantic Settings (env vars)
  database.py      # Async engine, AsyncSession factory
  models/          # SQLAlchemy ORM models (one file per domain)
  routers/         # 21 route handlers mounted under /api or /ws or /webmail
  services/        # Business logic (websocket_manager, media_service, tenant_service, …)
  schemas/         # Pydantic request/response schemas
  resources/schemas/  # JSON Schema files for inject validation — cached via @lru_cache
  utils/
    permissions.py # has_global_permission(), has_exercise_permission()
    security.py    # password hashing, session token utils
    tenancy.py     # TenantContextMiddleware, context vars
```

Key routers: `auth`, `users`, `teams`, `exercises`, `injects`, `inject_bank`, `webmail`, `twitter`, `tv`, `media`, `player`, `websocket`, `crisis_contacts`, `crisis_management`, `welcome_kit`, `admin_options`, `audit`, `simulated_channels`.

**Important:** JSON schema files in `resources/schemas/` are cached with `@lru_cache` — restart the backend container after editing them.

## Permission System

Two levels:
- **Platform permissions** (`Permission` enum) — e.g. `USERS_READ`, `SETTINGS_UPDATE` — checked with `has_global_permission(user, perm)`
- **Exercise permissions** (`ExercisePermission` enum) — e.g. `INJECTS_SEND`, `TWITTER_POST` — checked with `has_exercise_permission(user, exercise, perm)`

Roles: `admin > animateur > observateur > participant` (platform). Exercises have separate roles: `animateur`, `observateur`, `joueur`.

## Frontend Structure

```
frontend/src/
  pages/           # Route-level page components
  components/      # Reusable components (options/, exercise/, …)
  services/api.ts  # All API calls (adminApi, exerciseApi, …)
  stores/          # Zustand stores: authStore, autoSaveStore, langStore, themeStore
  i18n/            # fr.json + en.json (default lang: fr)
  hooks/           # Custom React hooks
  contexts/        # AppDialogContext, …
  features/        # Self-contained feature modules (phasePresets, exercise-setup/…)
```

The Vite dev server proxies `/api`, `/ws`, `/webmail` to `backend:3000`.

## i18n

Library: `i18next` + `react-i18next`. Default language: `fr`, fallback: `fr`. Use `useTranslation()` + `t('namespace.key')`. All keys are in `fr.json` / `en.json` under namespaces: `login`, `nav`, `common`, `roles`, `debug`, `admin`, `exercises`, `observer`.

**ALWAYS use i18n strings for any user-facing text.** Never hardcode French or English strings directly in JSX or `.ts` files. Every new label, message, placeholder, tooltip, or error string must have a key in both `fr.json` and `en.json`. Add the key to `fr.json` first, then mirror it in `en.json`.

## Tests

- **Framework**: pytest-asyncio, `asyncio_mode = auto`, `asyncio_default_fixture_loop_scope = session`
- **Test DB**: SQLite (aiosqlite) with NullPool. PostgreSQL-specific types are shimmed in `conftest.py` (`_SQLiteEnum` extends `String` with `.enums`, `_SQLiteArray` maps to JSON, `JSONB` → JSON).
- **Fixtures**: `client` (unauthenticated), `admin_client`, `animateur_client`, `observateur_client`, `participant_client`, `db` (raw AsyncSession), `seed` (tenant + 4 users)
- **Test credentials**: all roles use password `TestPass1!`, usernames `test_admin` / `test_animateur` / `test_observateur` / `test_participant`

## Alembic Conventions

Migration files live in `backend/alembic/versions/`. Name them `NNNN_description.py` (e.g. `0015_add_foo.py`). Use `op.execute("ALTER TABLE … ADD COLUMN IF NOT EXISTS …")` for safe idempotent upgrades. Chain via `down_revision`.

## Environment Variables (backend)

| Variable | Default | Notes |
|---|---|---|
| `DB_PASSWORD` | `ttx_dev_password` | PostgreSQL password |
| `SESSION_SECRET` | — | Min 32 chars, required |
| `ENVIRONMENT` | `development` | Enables API docs, disables `__Host-` cookie prefix |
| `CORS_ORIGINS` | `http://localhost:5173` | Comma-separated |
| `MEDIA_STORAGE_PATH` | `/app/media` | File upload storage |
