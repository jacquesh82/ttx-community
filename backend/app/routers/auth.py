"""Authentication router."""
from datetime import datetime, timedelta, timezone
import secrets
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Response, Request, Cookie, WebSocket
from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db_session
from app.models import User, Session, Exercise, ExerciseUser, Team, UserTeam, ExerciseTeam, WsAuthTicket
from app.models.user import UserRole
from app.models.tenant import SessionScope, WsAuthTicketScope
from app.models.exercise_user import ExerciseRole
from app.schemas.auth import (
    LoginRequest, LoginResponse, SessionUser, SessionResponse, ChangePasswordRequest, AuthError,
    SessionTenant, WsTicketRequest, WsTicketResponse,
)
from app.schemas.user import UserProfileUpdate
from app.utils.security import (
    hash_password, verify_password, generate_session_token, hash_token,
    create_session_expiry, generate_csrf_token
)
from app.utils.tenancy import (
    TenantRequestContext,
    current_is_platform_host_var,
    get_tenant_context,
    require_tenant_context,
    resolve_websocket_tenant_context,
)
from app.utils.permissions import (
    Permission, ExercisePermission,
    has_global_permission, has_exercise_permission,
    resolve_exercise_role, can_access_exercise
)

router = APIRouter()
settings = get_settings()

# Cookie name for session
SESSION_COOKIE_NAME = "__Host-ttx_session" if settings.is_production else "ttx_session"


async def _get_session_and_user_by_session_token(
    *,
    session_token: str | None,
    db: AsyncSession,
    tenant_ctx: TenantRequestContext | None = None,
) -> tuple[Session | None, User | None]:
    if not session_token:
        return None, None

    token_hash = hash_token(session_token)
    result = await db.execute(select(Session).where(Session.token_hash == token_hash))
    session = result.scalar_one_or_none()
    if not session or session.is_expired:
        return None, None

    if tenant_ctx is not None:
        if tenant_ctx.is_platform_host:
            if session.session_scope != SessionScope.PLATFORM.value:
                return None, None
        else:
            if not tenant_ctx.tenant:
                return None, None
            if session.tenant_id != tenant_ctx.tenant.id:
                return None, None
            if session.session_scope != SessionScope.TENANT.value:
                return None, None

    user_result = await db.execute(select(User).where(User.id == session.user_id))
    user = user_result.scalar_one_or_none()
    if not user:
        return None, None
    return session, user


def _build_session_tenant(ctx: TenantRequestContext) -> SessionTenant:
    if not ctx.tenant:
        raise HTTPException(status_code=400, detail="tenant_not_resolved")
    return SessionTenant(id=ctx.tenant.id, slug=ctx.tenant.slug, name=ctx.tenant.name)


async def _create_ws_ticket(
    *,
    db: AsyncSession,
    scope: WsAuthTicketScope,
    tenant_id: int | None,
    user_id: int,
    session_id: int,
    exercise_id: int | None = None,
) -> WsAuthTicket:
    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(seconds=max(10, settings.ws_ticket_ttl_seconds))
    ticket = WsAuthTicket(
        id=token,
        tenant_id=tenant_id,
        user_id=user_id,
        session_id=session_id,
        scope=scope,
        exercise_id=exercise_id,
        expires_at=expires_at,
    )
    db.add(ticket)
    await db.flush()
    return ticket


def _is_same_origin_ws(origin: str | None, websocket: WebSocket) -> bool:
    if not origin:
        return False
    origin = origin.rstrip("/")
    host = websocket.headers.get("host", "")
    scheme = "https" if websocket.url.scheme == "wss" else "http"
    return origin == f"{scheme}://{host}"


async def authenticate_ws_with_ticket(
    *,
    websocket: WebSocket,
    ticket_id: str,
    expected_scope: WsAuthTicketScope,
    expected_exercise_id: int | None = None,
) -> tuple[TenantRequestContext, Session, User]:
    tenant_ctx = await resolve_websocket_tenant_context(websocket)

    if not _is_same_origin_ws(websocket.headers.get("origin"), websocket):
        await websocket.close(code=4003, reason="Invalid origin")
        raise HTTPException(status_code=403, detail="invalid_origin")

    session_cookie = websocket.cookies.get(SESSION_COOKIE_NAME)
    if not session_cookie:
        await websocket.close(code=4001, reason="Missing session")
        raise HTTPException(status_code=401, detail="missing_session")

    from app.database import async_session_factory  # local import to avoid cycles in startup

    async with async_session_factory() as db:
        session, user = await _get_session_and_user_by_session_token(
            session_token=session_cookie,
            db=db,
            tenant_ctx=tenant_ctx,
        )
        if not session or not user:
            await websocket.close(code=4001, reason="Unauthorized")
            raise HTTPException(status_code=401, detail="unauthorized")

        if tenant_ctx.is_platform_host:
            if not user.is_platform_admin:
                await websocket.close(code=4003, reason="Platform admin required")
                raise HTTPException(status_code=403, detail="platform_admin_required")
        else:
            if not tenant_ctx.tenant:
                await websocket.close(code=4004, reason="Tenant not found")
                raise HTTPException(status_code=404, detail="tenant_not_found")

        now = datetime.now(timezone.utc)
        result = await db.execute(select(WsAuthTicket).where(WsAuthTicket.id == ticket_id))
        ticket = result.scalar_one_or_none()
        if not ticket:
            await websocket.close(code=4001, reason="Invalid ticket")
            raise HTTPException(status_code=401, detail="invalid_ticket")
        if ticket.used_at is not None:
            await websocket.close(code=4001, reason="Ticket already used")
            raise HTTPException(status_code=401, detail="ticket_used")
        expires_at = ticket.expires_at if ticket.expires_at.tzinfo else ticket.expires_at.replace(tzinfo=timezone.utc)
        if expires_at <= now:
            await websocket.close(code=4001, reason="Ticket expired")
            raise HTTPException(status_code=401, detail="ticket_expired")
        if ticket.scope != expected_scope:
            await websocket.close(code=4003, reason="Invalid ticket scope")
            raise HTTPException(status_code=403, detail="invalid_ticket_scope")
        if expected_exercise_id is not None and ticket.exercise_id != expected_exercise_id:
            await websocket.close(code=4003, reason="Invalid ticket exercise")
            raise HTTPException(status_code=403, detail="invalid_ticket_exercise")
        if ticket.user_id != user.id or ticket.session_id != session.id:
            await websocket.close(code=4003, reason="Ticket binding mismatch")
            raise HTTPException(status_code=403, detail="invalid_ticket_binding")
        if not tenant_ctx.is_platform_host and ticket.tenant_id != tenant_ctx.tenant_id:
            await websocket.close(code=4003, reason="Tenant mismatch")
            raise HTTPException(status_code=403, detail="invalid_ticket_tenant")

        ticket.used_at = now
        await db.commit()
        return tenant_ctx, session, user


async def get_current_user(
    request: Request,
    session_token: Optional[str] = Cookie(None, alias=SESSION_COOKIE_NAME),
    tenant_ctx: TenantRequestContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db_session),
) -> Optional[User]:
    """Get the current authenticated user from session cookie."""
    _session, user = await _get_session_and_user_by_session_token(
        session_token=session_token,
        db=db,
        tenant_ctx=tenant_ctx,
    )
    return user


async def get_current_user_ws(token: str) -> Optional[User]:
    """Legacy helper kept for compatibility; prefer WS tickets."""
    if not token:
        return None

    from app.database import async_session_factory

    async with async_session_factory() as db:
        _session, user = await _get_session_and_user_by_session_token(
            session_token=token,
            db=db,
            tenant_ctx=None,
        )
        return user


async def require_auth(
    user: Optional[User] = Depends(get_current_user),
) -> User:
    """Dependency that requires authentication."""
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is disabled")
    if user.is_locked:
        raise HTTPException(status_code=403, detail="Account is temporarily locked")
    return user


def require_role(*roles: UserRole):
    """Dependency factory that requires specific role(s)."""
    async def role_checker(user: User = Depends(require_auth)) -> User:
        # Platform backoffice actions are guarded by the platform-admin flag.
        # Tenant-scoped routes continue to use the tenant-local role field.
        request_ctx = current_is_platform_host_var.get()  # type: ignore[name-defined]
        if request_ctx and user.is_platform_admin:
            return user
        if user.role not in roles:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return user
    return role_checker


def require_permission(permission: Permission):
    """Dependency factory that requires a specific platform permission."""
    async def permission_checker(
        user: User = Depends(require_auth),
    ) -> User:
        if current_is_platform_host_var.get() and user.is_platform_admin:
            return user
        if not has_global_permission(user.role, permission):
            raise HTTPException(status_code=403, detail=f"Permission denied: {permission.value}")
        return user
    return permission_checker


async def get_user_exercise_role(
    user: User,
    exercise_id: int,
    db: AsyncSession,
) -> tuple[ExerciseRole, int | None]:
    """Get the user's effective role for an exercise and their team_id if assigned.
    
    Returns:
        Tuple of (effective_role, team_id)
    """
    # Check for exercise-specific role
    result = await db.execute(
        select(ExerciseUser).where(
            ExerciseUser.user_id == user.id,
            ExerciseUser.exercise_id == exercise_id,
        )
    )
    exercise_user = result.scalar_one_or_none()
    
    exercise_role = None
    team_id = None
    
    if exercise_user:
        exercise_role = exercise_user.role
        team_id = exercise_user.team_id
    
    # Resolve effective role
    effective_role = resolve_exercise_role(user.role, exercise_role)
    
    return effective_role, team_id


async def get_user_team_ids_for_exercise(
    user: User,
    exercise_id: int,
    db: AsyncSession,
) -> list[int]:
    """Get all team IDs the user belongs to in a specific exercise."""
    # Direct team membership through ExerciseUser
    result = await db.execute(
        select(ExerciseUser.team_id).where(
            ExerciseUser.user_id == user.id,
            ExerciseUser.exercise_id == exercise_id,
            ExerciseUser.team_id.isnot(None),
        )
    )
    team_ids = [row[0] for row in result.fetchall()]
    
    # Also check UserTeam -> ExerciseTeam chain
    result = await db.execute(
        select(UserTeam.team_id).join(
            ExerciseTeam, ExerciseTeam.team_id == UserTeam.team_id
        ).where(
            UserTeam.user_id == user.id,
            ExerciseTeam.exercise_id == exercise_id,
        )
    )
    team_ids.extend(row[0] for row in result.fetchall())
    
    return list(set(team_ids))


def require_exercise_permission(permission: ExercisePermission):
    """Dependency factory that requires a specific exercise permission.
    
    Use this with a path parameter 'exercise_id' in the route.
    """
    from fastapi import Path
    
    async def permission_checker(
        exercise_id: int = Path(...),
        user: User = Depends(require_auth),
        tenant_ctx: TenantRequestContext = Depends(require_tenant_context),
        db: AsyncSession = Depends(get_db_session),
    ) -> tuple[User, ExerciseRole, int | None]:
        exercise_result = await db.execute(
            select(Exercise.id).where(
                Exercise.id == exercise_id,
                Exercise.tenant_id == tenant_ctx.tenant.id,
            )
        )
        if exercise_result.scalar_one_or_none() is None:
            raise HTTPException(status_code=404, detail="Exercise not found")

        # Get user's role for this exercise
        exercise_role, team_id = await get_user_exercise_role(user, exercise_id, db)
        
        # Check if user has the required permission
        if not has_exercise_permission(exercise_role, permission):
            raise HTTPException(status_code=403, detail=f"Permission denied: {permission.value}")
        
        return user, exercise_role, team_id
    
    return permission_checker


def require_exercise_access():
    """Dependency that checks if user has any access to an exercise.
    
    Use this for routes that just need to verify access without specific permissions.
    """
    from fastapi import Path
    
    async def access_checker(
        exercise_id: int = Path(...),
        user: User = Depends(require_auth),
        tenant_ctx: TenantRequestContext = Depends(require_tenant_context),
        db: AsyncSession = Depends(get_db_session),
    ) -> tuple[User, ExerciseRole, int | None, list[int]]:
        exercise_result = await db.execute(
            select(Exercise.id).where(
                Exercise.id == exercise_id,
                Exercise.tenant_id == tenant_ctx.tenant.id,
            )
        )
        if exercise_result.scalar_one_or_none() is None:
            raise HTTPException(status_code=404, detail="Exercise not found")

        # Get user's role and teams for this exercise
        exercise_role, assigned_team_id = await get_user_exercise_role(user, exercise_id, db)
        team_ids = await get_user_team_ids_for_exercise(user, exercise_id, db)
        
        # Check if user can access this exercise
        is_team_member = len(team_ids) > 0
        if not can_access_exercise(user.role, exercise_role if exercise_role != resolve_exercise_role(user.role, None) else None, is_team_member):
            raise HTTPException(status_code=403, detail="Access denied to this exercise")
        
        return user, exercise_role, assigned_team_id, team_ids
    
    return access_checker


def create_session_cookie_settings() -> dict:
    """Get cookie settings for session."""
    return {
        "key": SESSION_COOKIE_NAME,
        "httponly": True,
        "secure": settings.is_production,
        "samesite": "lax",
        "max_age": settings.session_max_age,
        "path": "/",
    }


@router.post("/login", response_model=LoginResponse, responses={401: {"model": AuthError}})
async def login(
    request: Request,
    response: Response,
    login_data: LoginRequest,
    tenant_ctx: TenantRequestContext = Depends(require_tenant_context),
    db: AsyncSession = Depends(get_db_session),
):
    """Login with username/email and password."""
    # Find user by username or email
    result = await db.execute(
        select(User).where(
            User.tenant_id == tenant_ctx.tenant.id,
            or_(
                User.username == login_data.username_or_email,
                User.email == login_data.username_or_email,
            )
        )
    )
    user = result.scalar_one_or_none()
    
    # Check if user exists and is active
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    if not user.is_active:
        raise HTTPException(status_code=401, detail="Account is disabled")
    
    if user.is_locked:
        raise HTTPException(status_code=401, detail="Account is temporarily locked")
    
    # Verify password
    if not verify_password(login_data.password, user.password_hash):
        # Increment failed attempts
        user.failed_login_attempts += 1
        
        # Lock account if too many failed attempts
        if user.failed_login_attempts >= settings.login_max_attempts:
            user.locked_until = datetime.now(timezone.utc) + timedelta(minutes=settings.login_lockout_minutes)
        
        await db.commit()
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    # Reset failed attempts on successful login
    user.failed_login_attempts = 0
    user.locked_until = None
    
    # Create session
    session_token = generate_session_token()
    session = Session(
        tenant_id=tenant_ctx.tenant.id,
        user_id=user.id,
        session_scope=SessionScope.TENANT.value,
        token_hash=hash_token(session_token),
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent", "")[:500],
        expires_at=create_session_expiry(),
    )
    db.add(session)
    await db.commit()
    
    # Set session cookie
    cookie_settings = create_session_cookie_settings()
    response.set_cookie(value=session_token, **cookie_settings)
    
    # Generate CSRF token
    csrf_token = generate_csrf_token()
    response.headers["X-CSRF-Token"] = csrf_token
    
    return LoginResponse(
        user=SessionUser.model_validate(user),
        csrf_token=csrf_token,
        tenant=_build_session_tenant(tenant_ctx),
    )


@router.post("/logout")
async def logout(
    response: Response,
    user: Optional[User] = Depends(get_current_user),
    session_token: Optional[str] = Cookie(None, alias=SESSION_COOKIE_NAME),
    db: AsyncSession = Depends(get_db_session),
):
    """Logout and clear session."""
    if session_token and user:
        # Delete session from database
        token_hash = hash_token(session_token)
        result = await db.execute(
            select(Session).where(Session.token_hash == token_hash)
        )
        session = result.scalar_one_or_none()
        if session:
            await db.delete(session)
            await db.commit()
    
    # Clear session cookie
    response.delete_cookie(key=SESSION_COOKIE_NAME, path="/")
    
    return {"message": "Logged out successfully"}


@router.get("/me", response_model=SessionResponse)
async def get_current_session(
    user: User = Depends(require_auth),
    tenant_ctx: TenantRequestContext = Depends(require_tenant_context),
):
    """Get current session info."""
    csrf_token = generate_csrf_token()
    return SessionResponse(
        user=SessionUser.model_validate(user),
        csrf_token=csrf_token,
        tenant=_build_session_tenant(tenant_ctx),
    )


@router.patch("/profile", response_model=SessionResponse)
async def update_profile(
    body: UserProfileUpdate,
    user: User = Depends(require_auth),
    tenant_ctx: TenantRequestContext = Depends(require_tenant_context),
    db: AsyncSession = Depends(get_db_session),
):
    """Update the current user's own profile (display_name, avatar_url, username)."""
    if body.display_name is not None:
        user.display_name = body.display_name.strip() or None
    if body.avatar_url is not None:
        user.avatar_url = body.avatar_url.strip() or None
    if body.username is not None:
        username = body.username.strip()
        if username != user.username:
            existing = await db.execute(
                select(User).where(
                    User.tenant_id == user.tenant_id,
                    User.username == username,
                    User.id != user.id,
                )
            )
            if existing.scalar_one_or_none():
                raise HTTPException(status_code=409, detail="username_already_taken")
            user.username = username
    await db.commit()
    await db.refresh(user)
    csrf_token = generate_csrf_token()
    return SessionResponse(
        user=SessionUser.model_validate(user),
        csrf_token=csrf_token,
        tenant=_build_session_tenant(tenant_ctx),
    )


@router.post("/ws-ticket", response_model=WsTicketResponse)
async def create_ws_ticket(
    request_body: WsTicketRequest,
    request: Request,
    user: User = Depends(require_auth),
    tenant_ctx: TenantRequestContext = Depends(get_tenant_context),
    session_token: Optional[str] = Cookie(None, alias=SESSION_COOKIE_NAME),
    db: AsyncSession = Depends(get_db_session),
):
    """Issue a short-lived one-time ticket for WebSocket authentication."""
    session, _ = await _get_session_and_user_by_session_token(
        session_token=session_token,
        db=db,
        tenant_ctx=tenant_ctx,
    )
    if not session:
        raise HTTPException(status_code=401, detail="Not authenticated")

    if request_body.scope == WsAuthTicketScope.DEBUG_EVENTS:
        if tenant_ctx.is_platform_host:
            if not user.is_platform_admin:
                raise HTTPException(status_code=403, detail="platform_admin_required")
            debug_ticket_tenant_id = None
        else:
            if settings.is_production:
                raise HTTPException(status_code=403, detail="debug_ws_requires_platform_host")
            if user.role != UserRole.ADMIN:
                raise HTTPException(status_code=403, detail="debug_ws_requires_admin")
            debug_ticket_tenant_id = tenant_ctx.tenant.id if tenant_ctx.tenant else None
        ticket = await _create_ws_ticket(
            db=db,
            scope=request_body.scope,
            tenant_id=debug_ticket_tenant_id,
            user_id=user.id,
            session_id=session.id,
            exercise_id=None,
        )
        await db.commit()
        return WsTicketResponse(ticket=ticket.id, expires_at=ticket.expires_at, scope=ticket.scope)

    # Exercise-bound scopes require a tenant host and an exercise_id.
    tenant_ctx = await require_tenant_context(tenant_ctx)  # validate tenant status
    if request_body.exercise_id is None:
        raise HTTPException(status_code=400, detail="exercise_id_required")

    exercise_result = await db.execute(
        select(Exercise).where(
            Exercise.id == request_body.exercise_id,
            Exercise.tenant_id == tenant_ctx.tenant.id,
        )
    )
    exercise = exercise_result.scalar_one_or_none()
    if not exercise:
        raise HTTPException(status_code=404, detail="Exercise not found")

    exercise_role, _assigned_team_id = await get_user_exercise_role(user, request_body.exercise_id, db)
    team_ids = await get_user_team_ids_for_exercise(user, request_body.exercise_id, db)
    is_team_member = len(team_ids) > 0
    if not can_access_exercise(
        user.role,
        exercise_role if exercise_role != resolve_exercise_role(user.role, None) else None,
        is_team_member,
    ):
        raise HTTPException(status_code=403, detail="Access denied to this exercise")

    ticket = await _create_ws_ticket(
        db=db,
        scope=request_body.scope,
        tenant_id=tenant_ctx.tenant.id,
        user_id=user.id,
        session_id=session.id,
        exercise_id=request_body.exercise_id,
    )
    await db.commit()
    return WsTicketResponse(ticket=ticket.id, expires_at=ticket.expires_at, scope=ticket.scope)


@router.post("/password/change")
async def change_password(
    password_data: ChangePasswordRequest,
    user: User = Depends(require_auth),
    db: AsyncSession = Depends(get_db_session),
):
    """Change user password."""
    # Verify current password
    if not verify_password(password_data.current_password, user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    
    # Update password
    user.password_hash = hash_password(password_data.new_password)
    await db.commit()
    
    return {"message": "Password changed successfully"}


@router.post("/dev-login/{role}", response_model=LoginResponse, responses={403: {"model": AuthError}})
async def dev_login(
    request: Request,
    response: Response,
    role: UserRole,
    tenant_ctx: TenantRequestContext = Depends(require_tenant_context),
    db: AsyncSession = Depends(get_db_session),
):
    """Development-only login without password. Creates user if not exists."""
    # Only allow in development environment
    if settings.is_production:
        raise HTTPException(status_code=403, detail="Dev login is disabled in production")
    
    # Determine username based on role
    role_usernames = {
        UserRole.ADMIN: "dev_admin",
        UserRole.ANIMATEUR: "dev_animateur",
        UserRole.OBSERVATEUR: "dev_observateur",
        UserRole.PARTICIPANT: "dev_participant",
    }
    username = role_usernames.get(role, f"dev_{role.value}")
    email = f"{username}@dev.local"
    
    # Find or create user
    result = await db.execute(
        select(User).where(User.tenant_id == tenant_ctx.tenant.id, User.username == username)
    )
    user = result.scalar_one_or_none()
    
    if not user:
        # Create dev user
        user = User(
            tenant_id=tenant_ctx.tenant.id,
            email=email,
            username=username,
            password_hash=hash_password("dev_password"),
            role=role,
            is_active=True,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
    
    # Create session
    session_token = generate_session_token()
    session = Session(
        tenant_id=tenant_ctx.tenant.id,
        user_id=user.id,
        session_scope=SessionScope.TENANT.value,
        token_hash=hash_token(session_token),
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent", "")[:500],
        expires_at=create_session_expiry(),
    )
    db.add(session)
    await db.commit()
    
    # Set session cookie
    cookie_settings = create_session_cookie_settings()
    response.set_cookie(value=session_token, **cookie_settings)
    
    # Generate CSRF token
    csrf_token = generate_csrf_token()
    response.headers["X-CSRF-Token"] = csrf_token
    
    return LoginResponse(
        user=SessionUser.model_validate(user),
        csrf_token=csrf_token,
        tenant=_build_session_tenant(tenant_ctx),
    )
