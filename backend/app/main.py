"""FastAPI main application for TTX Platform."""
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Optional

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from sqlalchemy import select

from app.config import get_settings
from app.database import init_db, close_db, async_session_factory
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
    print(f"[{datetime.now(timezone.utc).isoformat()}] TTX Platform started")
    yield
    # Shutdown
    await close_db()
    print(f"[{datetime.now(timezone.utc).isoformat()}] TTX Platform stopped")


app = FastAPI(
    title="TTX Platform",
    description="Table Top Exercise Platform for Crisis Simulation",
    version="0.1.0",
    lifespan=lifespan,
    docs_url="/api/docs" if not settings.is_production else None,
    redoc_url="/api/redoc" if not settings.is_production else None,
    openapi_url="/api/openapi.json" if not settings.is_production else None,
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


# Root endpoint
@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "name": "TTX Platform API",
        "version": "0.1.0",
        "docs": "/api/docs" if not settings.is_production else None,
    }
