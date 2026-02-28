"""Tenant resolution middleware and dependencies."""
from __future__ import annotations

from contextvars import ContextVar
from dataclasses import dataclass

from fastapi import Depends, HTTPException, Request, WebSocket
from sqlalchemy import select
from starlette.middleware.base import BaseHTTPMiddleware

from app.config import get_settings
from app.database import async_session_factory
from app.models import Tenant, TenantDomain, TenantStatus


settings = get_settings()

current_tenant_id_var: ContextVar[int | None] = ContextVar("current_tenant_id", default=None)
current_tenant_slug_var: ContextVar[str | None] = ContextVar("current_tenant_slug", default=None)
current_is_platform_host_var: ContextVar[bool] = ContextVar("current_is_platform_host", default=False)


@dataclass
class TenantRequestContext:
    tenant: Tenant | None
    tenant_id: int | None
    tenant_slug: str | None
    is_platform_host: bool
    host: str


def _normalize_host(host_value: str | None) -> str:
    host = (host_value or "").strip().lower()
    if not host:
        return ""
    if "," in host:
        host = host.split(",")[0].strip()
    if ":" in host and not host.startswith("["):
        host = host.split(":", 1)[0]
    return host


def _is_local_dev_host(host: str) -> bool:
    # Exact dev hosts only; subdomains like "<tenant>.localhost" should be resolved as tenants.
    return host in {"localhost", "127.0.0.1", "backend"}


async def resolve_tenant_for_host(host_value: str | None) -> TenantRequestContext:
    host = _normalize_host(host_value)
    if not host:
        return TenantRequestContext(None, None, None, False, host)

    base_domain = settings.base_domain.strip().lower()
    admin_subdomain = settings.platform_admin_subdomain.strip().lower()

    if base_domain and host.endswith(f".{base_domain}"):
        label = host[: -(len(base_domain) + 1)]
        # Only support one-level subdomain for v1.
        if "." not in label and label:
            if label == admin_subdomain:
                return TenantRequestContext(None, None, None, True, host)
            async with async_session_factory() as db:
                result = await db.execute(select(Tenant).where(Tenant.slug == label))
                tenant = result.scalar_one_or_none()
                return TenantRequestContext(
                    tenant=tenant,
                    tenant_id=tenant.id if tenant else None,
                    tenant_slug=label,
                    is_platform_host=False,
                    host=host,
                )

    # Dev fallback for exact localhost-like hosts.
    if not settings.is_production and _is_local_dev_host(host):
        async with async_session_factory() as db:
            result = await db.execute(select(Tenant).where(Tenant.slug == settings.default_tenant_slug))
            tenant = result.scalar_one_or_none()
            return TenantRequestContext(
                tenant=tenant,
                tenant_id=tenant.id if tenant else None,
                tenant_slug=tenant.slug if tenant else settings.default_tenant_slug,
                is_platform_host=False,
                host=host,
            )

    # Fallback to explicit domain mapping.
    async with async_session_factory() as db:
        result = await db.execute(
            select(Tenant)
            .join(TenantDomain, TenantDomain.tenant_id == Tenant.id)
            .where(TenantDomain.domain == host)
        )
        tenant = result.scalar_one_or_none()
        return TenantRequestContext(
            tenant=tenant,
            tenant_id=tenant.id if tenant else None,
            tenant_slug=tenant.slug if tenant else None,
            is_platform_host=False,
            host=host,
        )


class TenantContextMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        forwarded_host = request.headers.get("x-forwarded-host")
        host = forwarded_host or request.headers.get("host")
        ctx = await resolve_tenant_for_host(host)
        request.state.tenant = ctx.tenant
        request.state.tenant_context = ctx

        token_tenant = current_tenant_id_var.set(ctx.tenant_id)
        token_slug = current_tenant_slug_var.set(ctx.tenant_slug)
        token_platform = current_is_platform_host_var.set(ctx.is_platform_host)
        try:
            return await call_next(request)
        finally:
            current_tenant_id_var.reset(token_tenant)
            current_tenant_slug_var.reset(token_slug)
            current_is_platform_host_var.reset(token_platform)


async def get_tenant_context(request: Request) -> TenantRequestContext:
    ctx = getattr(request.state, "tenant_context", None)
    if ctx is None:
        host = request.headers.get("x-forwarded-host") or request.headers.get("host")
        ctx = await resolve_tenant_for_host(host)
        request.state.tenant_context = ctx
        request.state.tenant = ctx.tenant
    return ctx


async def require_tenant_context(ctx: TenantRequestContext = Depends(get_tenant_context)) -> TenantRequestContext:
    if ctx.is_platform_host:
        raise HTTPException(status_code=400, detail="Tenant context required on tenant host")

    if not ctx.tenant:
        if ctx.tenant_slug:
            raise HTTPException(status_code=404, detail="tenant_not_found")
        raise HTTPException(status_code=400, detail="tenant_not_resolved")
    if not ctx.tenant.is_active or ctx.tenant.status == TenantStatus.SUSPENDED:
        raise HTTPException(status_code=403, detail="tenant_suspended")
    return ctx


async def require_platform_host(ctx: TenantRequestContext = Depends(get_tenant_context)) -> TenantRequestContext:
    if not ctx.is_platform_host:
        raise HTTPException(status_code=403, detail="platform_host_required")
    return ctx


async def resolve_websocket_tenant_context(websocket: WebSocket) -> TenantRequestContext:
    forwarded_host = websocket.headers.get("x-forwarded-host")
    host = forwarded_host or websocket.headers.get("host")
    return await resolve_tenant_for_host(host)
