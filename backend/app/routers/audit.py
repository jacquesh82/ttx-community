"""Audit log router – compliance and security trail for CrisisLab platform actions."""
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel, Field
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db_session
from app.models import User, AuditLog
from app.models.user import UserRole
from app.routers.auth import require_permission
from app.utils.permissions import Permission

router = APIRouter()


# Schemas
class AuditLogResponse(BaseModel):
    """Single audit log entry recording a user or system action on the CrisisLab platform."""
    id: int = Field(description="Unique audit entry identifier", examples=[1024])
    user_id: Optional[int] = Field(
        default=None,
        description="ID of the user who performed the action (null for system actions)",
        examples=[3],
    )
    action: str = Field(
        description="HTTP method and path that was executed",
        examples=["POST /api/exercises"],
    )
    entity_type: Optional[str] = Field(
        default=None,
        description="Domain entity affected by the action",
        examples=["exercises"],
    )
    entity_id: Optional[int] = Field(
        default=None,
        description="ID of the affected entity",
        examples=[7],
    )
    old_values: Optional[dict] = Field(
        default=None,
        description="Snapshot of field values before the change (for updates/deletes)",
        examples=[{"status": "draft"}],
    )
    new_values: Optional[dict] = Field(
        default=None,
        description="Snapshot of field values after the change",
        examples=[{"status": "active"}],
    )
    ip_address: Optional[str] = Field(
        default=None,
        description="Client IP address that originated the request",
        examples=["192.168.1.42"],
    )
    user_agent: Optional[str] = Field(
        default=None,
        description="Client User-Agent header",
        examples=["Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0"],
    )
    created_at: str = Field(
        description="ISO-8601 timestamp of the action",
        examples=["2024-11-14T10:05:32Z"],
    )
    user_username: Optional[str] = Field(
        default=None,
        description="Username of the acting user (denormalised for display)",
        examples=["m.laurent"],
    )

    model_config = {
        "from_attributes": True,
        "json_schema_extra": {
            "example": {
                "id": 1024,
                "user_id": 3,
                "action": "PUT /api/injects/5",
                "entity_type": "injects",
                "entity_id": 5,
                "old_values": {"status": "draft"},
                "new_values": {"status": "sent"},
                "ip_address": "192.168.1.42",
                "user_agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0",
                "created_at": "2024-11-14T10:05:32Z",
                "user_username": "m.laurent",
            }
        },
    }


class AuditLogListResponse(BaseModel):
    """Paginated collection of audit log entries."""
    logs: list[AuditLogResponse]
    total: int = Field(description="Total entries matching the filters", examples=[542])
    page: int = Field(description="Current page number (1-based)", examples=[1])
    page_size: int = Field(description="Maximum items per page", examples=[50])


class AuditStatsResponse(BaseModel):
    """Aggregated audit statistics for the platform dashboard."""
    total_logs: int = Field(description="Total number of audit entries", examples=[4231])
    logs_today: int = Field(description="Entries recorded today (UTC)", examples=[87])
    logs_this_week: int = Field(description="Entries recorded in the last 7 days", examples=[614])
    unique_users: int = Field(description="Distinct users who generated at least one entry", examples=[12])
    top_actions: list[dict] = Field(
        description="Most frequent actions, sorted by count descending (max 10)",
        examples=[[
            {"action": "POST /api/exercises", "count": 45},
            {"action": "PUT /api/injects/5", "count": 38},
            {"action": "DELETE /api/users/3", "count": 12},
        ]],
    )
    top_users: list[dict] = Field(
        description="Most active users, sorted by count descending (max 10)",
        examples=[[
            {"user_id": 3, "username": "m.laurent", "count": 210},
            {"user_id": 1, "username": "admin", "count": 185},
        ]],
    )

    model_config = {
        "json_schema_extra": {
            "example": {
                "total_logs": 4231,
                "logs_today": 87,
                "logs_this_week": 614,
                "unique_users": 12,
                "top_actions": [
                    {"action": "POST /api/exercises", "count": 45},
                    {"action": "PUT /api/injects/5", "count": 38},
                    {"action": "DELETE /api/users/3", "count": 12},
                ],
                "top_users": [
                    {"user_id": 3, "username": "m.laurent", "count": 210},
                    {"user_id": 1, "username": "admin", "count": 185},
                ],
            }
        }
    }


def build_audit_log_response(log: AuditLog) -> AuditLogResponse:
    """Build response from AuditLog model."""
    return AuditLogResponse(
        id=log.id,
        user_id=log.user_id,
        action=log.action,
        entity_type=log.entity_type,
        entity_id=log.entity_id,
        old_values=log.old_values,
        new_values=log.new_values,
        ip_address=str(log.ip_address) if log.ip_address is not None else None,
        user_agent=str(log.user_agent) if log.user_agent is not None else None,
        created_at=log.created_at.isoformat() if log.created_at else None,
        user_username=log.user.username if log.user else None,
    )


@router.get("", response_model=AuditLogListResponse)
async def list_audit_logs(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    user_id: Optional[int] = None,
    action: Optional[str] = None,
    entity_type: Optional[str] = None,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    search: Optional[str] = None,
    _: User = Depends(require_permission(Permission.AUDIT_READ)),
    db: AsyncSession = Depends(get_db_session),
):
    """List audit log entries with optional filters.

    Returns a reverse-chronological paginated list. Supports filtering by:
    - `user_id` – entries from a specific user
    - `action` – partial match on the HTTP method+path (case-insensitive)
    - `entity_type` – domain entity (e.g. `exercises`, `injects`, `users`)
    - `start_date` / `end_date` – ISO-8601 date range
    - `search` – free-text search across action and entity_type

    **Auth:** requires `AUDIT_READ` permission (admin only).
    """
    query = select(AuditLog)
    count_query = select(func.count(AuditLog.id))
    
    # Apply filters
    if user_id:
        query = query.where(AuditLog.user_id == user_id)
        count_query = count_query.where(AuditLog.user_id == user_id)
    
    if action:
        query = query.where(AuditLog.action.ilike(f"%{action}%"))
        count_query = count_query.where(AuditLog.action.ilike(f"%{action}%"))
    
    if entity_type:
        query = query.where(AuditLog.entity_type == entity_type)
        count_query = count_query.where(AuditLog.entity_type == entity_type)
    
    if start_date:
        query = query.where(AuditLog.created_at >= start_date)
        count_query = count_query.where(AuditLog.created_at >= start_date)
    
    if end_date:
        query = query.where(AuditLog.created_at <= end_date)
        count_query = count_query.where(AuditLog.created_at <= end_date)
    
    if search:
        search_pattern = f"%{search}%"
        query = query.where(
            or_(
                AuditLog.action.ilike(search_pattern),
                AuditLog.entity_type.ilike(search_pattern),
            )
        )
        count_query = count_query.where(
            or_(
                AuditLog.action.ilike(search_pattern),
                AuditLog.entity_type.ilike(search_pattern),
            )
        )
    
    # Get total count
    total_result = await db.execute(count_query)
    total = total_result.scalar()
    
    # Paginate
    offset = (page - 1) * page_size
    query = query.options(
        selectinload(AuditLog.user)
    ).order_by(AuditLog.created_at.desc()).offset(offset).limit(page_size)
    
    result = await db.execute(query)
    logs = result.scalars().all()
    
    return AuditLogListResponse(
        logs=[build_audit_log_response(log) for log in logs],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/stats", response_model=AuditStatsResponse)
async def get_audit_stats(
    _: User = Depends(require_permission(Permission.AUDIT_READ)),
    db: AsyncSession = Depends(get_db_session),
):
    """Return aggregated audit statistics for the CrisisLab platform.

    Provides totals (all-time, today, this week), the number of distinct
    users, and the top-10 most frequent actions and most active users.

    **Auth:** requires `AUDIT_READ` permission (admin only).
    """
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = today_start - timedelta(days=7)
    
    # Total logs
    total_result = await db.execute(select(func.count(AuditLog.id)))
    total_logs = total_result.scalar() or 0
    
    # Logs today
    today_result = await db.execute(
        select(func.count(AuditLog.id)).where(AuditLog.created_at >= today_start)
    )
    logs_today = today_result.scalar() or 0
    
    # Logs this week
    week_result = await db.execute(
        select(func.count(AuditLog.id)).where(AuditLog.created_at >= week_start)
    )
    logs_this_week = week_result.scalar() or 0
    
    # Unique users
    users_result = await db.execute(
        select(func.count(func.distinct(AuditLog.user_id)))
    )
    unique_users = users_result.scalar() or 0
    
    # Top actions
    actions_result = await db.execute(
        select(
            AuditLog.action,
            func.count(AuditLog.id).label('count')
        ).group_by(AuditLog.action).order_by(func.count(AuditLog.id).desc()).limit(10)
    )
    top_actions = [{"action": row[0], "count": row[1]} for row in actions_result.fetchall()]
    
    # Top users
    users_activity_result = await db.execute(
        select(
            AuditLog.user_id,
            User.username,
            func.count(AuditLog.id).label('count')
        ).outerjoin(User, User.id == AuditLog.user_id)
        .group_by(AuditLog.user_id, User.username)
        .order_by(func.count(AuditLog.id).desc())
        .limit(10)
    )
    top_users = [
        {"user_id": row[0], "username": row[1] or "System", "count": row[2]}
        for row in users_activity_result.fetchall()
    ]
    
    return AuditStatsResponse(
        total_logs=total_logs,
        logs_today=logs_today,
        logs_this_week=logs_this_week,
        unique_users=unique_users,
        top_actions=top_actions,
        top_users=top_users,
    )


@router.get("/{log_id}", response_model=AuditLogResponse)
async def get_audit_log(
    log_id: int,
    _: User = Depends(require_permission(Permission.AUDIT_READ)),
    db: AsyncSession = Depends(get_db_session),
):
    """Retrieve a single audit log entry by ID.

    Returns the full entry including old/new value snapshots and the
    associated username.

    **Auth:** requires `AUDIT_READ` permission (admin only).
    """
    result = await db.execute(
        select(AuditLog)
        .options(selectinload(AuditLog.user))
        .where(AuditLog.id == log_id)
    )
    log = result.scalar_one_or_none()
    
    if not log:
        raise HTTPException(status_code=404, detail="Audit log not found")
    
    return build_audit_log_response(log)


@router.get("/export/csv")
async def export_audit_logs_csv(
    user_id: Optional[int] = None,
    action: Optional[str] = None,
    entity_type: Optional[str] = None,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    _: User = Depends(require_permission(Permission.AUDIT_EXPORT)),
    db: AsyncSession = Depends(get_db_session),
):
    """Export audit log entries as a downloadable CSV file.

    Applies the same filters as the list endpoint. The export is capped at
    10 000 rows. The response has `Content-Type: text/csv` and a
    `Content-Disposition` header with a timestamped filename.

    **Auth:** requires `AUDIT_EXPORT` permission (admin only).
    """
    import csv
    import io
    
    query = select(AuditLog).options(selectinload(AuditLog.user))
    
    # Apply filters
    if user_id:
        query = query.where(AuditLog.user_id == user_id)
    if action:
        query = query.where(AuditLog.action.ilike(f"%{action}%"))
    if entity_type:
        query = query.where(AuditLog.entity_type == entity_type)
    if start_date:
        query = query.where(AuditLog.created_at >= start_date)
    if end_date:
        query = query.where(AuditLog.created_at <= end_date)
    
    query = query.order_by(AuditLog.created_at.desc()).limit(10000)
    
    result = await db.execute(query)
    logs = result.scalars().all()
    
    # Generate CSV
    output = io.StringIO()
    writer = csv.writer(output)
    
    # Header
    writer.writerow([
        'id', 'timestamp', 'user_id', 'username', 'action',
        'entity_type', 'entity_id', 'ip_address', 'old_values', 'new_values'
    ])
    
    # Data
    for log in logs:
        writer.writerow([
            log.id,
            log.created_at.isoformat() if log.created_at else '',
            log.user_id or '',
            log.user.username if log.user else '',
            log.action,
            log.entity_type or '',
            log.entity_id or '',
            log.ip_address or '',
            str(log.old_values) if log.old_values else '',
            str(log.new_values) if log.new_values else '',
        ])
    
    output.seek(0)
    
    return Response(
        content=output.getvalue(),
        media_type='text/csv',
        headers={
            'Content-Disposition': f'attachment; filename=audit_logs_{datetime.now().strftime("%Y%m%d_%H%M%S")}.csv'
        }
    )
