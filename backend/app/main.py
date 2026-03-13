"""FastAPI main application for CrisisLab."""
import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Optional

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from fastapi.staticfiles import StaticFiles
from sqlalchemy import select

from app.config import get_settings
from app.database import init_db, close_db, async_session_factory
from app.seed import seed_initial_data
from app.models import AuditLog, Session
from app.routers import auth, users, teams, exercises, injects, events, webmail, crisis_contacts, exercise_users, audit, media, tv, player, websocket, twitter, inject_bank, crisis_management, welcome_kit, admin_options, debug, simulated_channels
from app.utils.security import hash_token
from app.utils.tenancy import TenantContextMiddleware

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler."""
    # Startup
    await init_db()
    await seed_initial_data()
    print(f"[{datetime.now(timezone.utc).isoformat()}] CrisisLab started")
    yield
    # Shutdown
    await close_db()
    print(f"[{datetime.now(timezone.utc).isoformat()}] CrisisLab stopped")


OPENAPI_TAGS = [
    {
        "name": "auth",
        "description": "Authentification par cookie de session (login, logout, profil, changement de mot de passe, tickets WebSocket).",
    },
    {
        "name": "users",
        "description": "Gestion des utilisateurs de la plateforme (CRUD, rôles, tags). Réservé aux administrateurs.",
    },
    {
        "name": "teams",
        "description": "Gestion des équipes et de leurs membres (création, affectation, leaders).",
    },
    {
        "name": "exercises",
        "description": "Cycle de vie des exercices de crise : création, démarrage, pause, fin, statistiques, plugins.",
    },
    {
        "name": "injects",
        "description": "Gestion des injects (stimuli) sur la timeline : planification, envoi, livraison, import/export CSV.",
    },
    {
        "name": "inject-bank",
        "description": "Banque d'injects réutilisables : bibliothèque de stimuli pré-rédigés avec catégories, tags et import/export ZIP.",
    },
    {
        "name": "events",
        "description": "Journal d'événements de la timeline (création automatique lors des actions).",
    },
    {
        "name": "player",
        "description": "API joueur : contexte d'exercice, timeline filtrée, notifications, décisions, livraisons.",
    },
    {
        "name": "simulated-channels",
        "description": "Canaux de communication simulés pour les joueurs : messagerie, SMS, appels, réseau social, presse, TV.",
    },
    {
        "name": "crisis-contacts",
        "description": "Annuaire de crise : contacts d'urgence, autorités, experts, médias, partenaires.",
    },
    {
        "name": "crisis-management",
        "description": "Pilotage de crise : phases, scénario, axes d'escalade, règles de déclenchement, métriques, RETEX.",
    },
    {
        "name": "exercise-users",
        "description": "Affectation des utilisateurs aux exercices avec rôle (animateur, observateur, joueur) et permissions par canal.",
    },
    {
        "name": "media",
        "description": "Médiathèque : upload, téléchargement et gestion des fichiers média (images, vidéos, documents).",
    },
    {
        "name": "twitter",
        "description": "Réseau social simulé (type X/Twitter) : comptes, publications, interactions.",
    },
    {
        "name": "tv",
        "description": "Régie TV simulée : chaînes, playlists, segments live, bandeaux et tickers.",
    },
    {
        "name": "audit",
        "description": "Journal d'audit : traçabilité des actions utilisateur, statistiques, export CSV.",
    },
    {
        "name": "admin-options",
        "description": "Configuration de la plateforme : organisation, options d'exercice, SMTP, sécurité, BIA, plugins.",
    },
    {
        "name": "welcome-kits",
        "description": "Kits d'accueil : modèles Markdown personnalisables, génération PDF pour joueurs et animateurs.",
    },
    {
        "name": "debug",
        "description": "Endpoints de développement (désactivés en production) : debug exercices, WebSocket temps réel.",
    },
]

app = FastAPI(
    title="CrisisLab",
    description=(
        "## CrisisLab — Plateforme de simulation de crise\n\n"
        "CrisisLab est une plateforme multi-tenant permettant d'organiser et d'animer des exercices de crise (Table Top Exercises).\n\n"
        "### Authentification\n"
        "L'API utilise des **cookies de session** (`ttx_session`). "
        "Appelez `POST /api/auth/login` pour obtenir un cookie, puis utilisez-le dans toutes les requêtes suivantes.\n\n"
        "### Multi-tenancy\n"
        "Le tenant est résolu depuis le header `Host`. En développement, `localhost` correspond au tenant par défaut.\n\n"
        "### Démarrage rapide\n"
        "1. `POST /api/auth/login` → connexion\n"
        "2. `POST /api/exercises` → créer un exercice\n"
        "3. `POST /api/exercises/{id}/start` → démarrer\n"
        "4. `GET /api/player/exercises/{id}/context` → contexte joueur\n"
    ),
    version="0.1.0",
    lifespan=lifespan,
    docs_url="/api/docs" if not settings.is_production else None,
    redoc_url="/api/redoc" if not settings.is_production else None,
    openapi_url="/api/openapi.json" if not settings.is_production else None,
    openapi_tags=OPENAPI_TAGS,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-CSRF-Token"],
)
app.add_middleware(TenantContextMiddleware)


AUDIT_TRACKED_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
AUDIT_EXCLUDED_PATH_PREFIXES = ("/api/audit", "/api/docs", "/api/redoc", "/api/openapi.json", "/api/health")


def _extract_audit_entity(path: str) -> tuple[str | None, int | None]:
    parts = [segment for segment in path.strip("/").split("/") if segment]
    if len(parts) < 2 or parts[0] != "api":
        return None, None
    entity_type = parts[1]
    entity_id = next((int(segment) for segment in parts[2:] if segment.isdigit()), None)
    return entity_type, entity_id


async def _resolve_user_id_from_cookie(session_token: Optional[str]) -> int | None:
    if not session_token:
        return None
    async with async_session_factory() as db:
        result = await db.execute(
            select(Session.user_id).where(Session.token_hash == hash_token(session_token))
        )
        return result.scalar_one_or_none()


@app.middleware("http")
async def audit_actions_middleware(request: Request, call_next):
    """Record mutating API requests in audit_log."""
    path = request.url.path
    should_log = (
        path.startswith("/api/")
        and request.method in AUDIT_TRACKED_METHODS
        and not any(path.startswith(prefix) for prefix in AUDIT_EXCLUDED_PATH_PREFIXES)
    )

    user_id = None
    tenant_id = None
    if should_log:
        user_id = await _resolve_user_id_from_cookie(request.cookies.get(auth.SESSION_COOKIE_NAME))
        tenant = getattr(request.state, "tenant", None)
        tenant_id = tenant.id if tenant else None

    response = await call_next(request)

    if should_log:
        entity_type, entity_id = _extract_audit_entity(path)
        try:
            async with async_session_factory() as db:
                db.add(
                    AuditLog(
                        user_id=user_id,
                        tenant_id=tenant_id,
                        action=f"{request.method} {path}",
                        entity_type=entity_type,
                        entity_id=entity_id,
                        new_values={
                            "status_code": response.status_code,
                            "query_params": dict(request.query_params),
                        },
                        ip_address=request.client.host if request.client else None,
                        user_agent=request.headers.get("user-agent", "")[:500],
                    )
                )
                await db.commit()
        except Exception:
            # Never fail the original request because of audit logging.
            pass

    return response


# Exception handlers
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Handle validation errors."""
    return JSONResponse(
        status_code=422,
        content={
            "error": "validation_error",
            "detail": exc.errors(),
        },
    )


@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    """Handle general exceptions."""
    return JSONResponse(
        status_code=500,
        content={
            "error": "internal_error",
            "detail": str(exc) if not settings.is_production else "An internal error occurred",
        },
    )


# Health check endpoint
@app.get("/api/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy", "timestamp": datetime.now(timezone.utc).isoformat()}


# Include routers
app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(users.router, prefix="/api/users", tags=["users"])
app.include_router(teams.router, prefix="/api/teams", tags=["teams"])
app.include_router(exercises.router, prefix="/api/exercises", tags=["exercises"])
app.include_router(injects.router, prefix="/api/injects", tags=["injects"])
app.include_router(events.router, prefix="/api/events", tags=["events"])
app.include_router(webmail.router)
app.include_router(crisis_contacts.router, prefix="/api", tags=["crisis-contacts"])
app.include_router(exercise_users.router, prefix="/api", tags=["exercise-users"])
app.include_router(audit.router, prefix="/api/audit", tags=["audit"])
app.include_router(media.router, prefix="/api/media", tags=["media"])
app.include_router(tv.router, prefix="/api/tv", tags=["tv"])
app.include_router(player.router, prefix="/api", tags=["player"])
app.include_router(websocket.router)
app.include_router(twitter.router, prefix="/api/twitter", tags=["twitter"])
app.include_router(inject_bank.router, prefix="/api/inject-bank", tags=["inject-bank"])
app.include_router(crisis_management.router, prefix="/api", tags=["crisis-management"])
app.include_router(welcome_kit.router, prefix="/api", tags=["welcome-kits"])
app.include_router(admin_options.router, prefix="/api/admin", tags=["admin-options"])
app.include_router(debug.router, prefix="/api", tags=["debug"])
app.include_router(simulated_channels.router, prefix="/api", tags=["simulated-channels"])

# Documentation statique MkDocs (servie sur /docs)
_docs_site = "/docs-site"
if os.path.isdir(_docs_site):
    app.mount("/docs", StaticFiles(directory=_docs_site, html=True), name="docs")


# Root endpoint
@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "name": "CrisisLab API",
        "version": "0.1.0",
        "docs": "/api/docs" if not settings.is_production else None,
    }
