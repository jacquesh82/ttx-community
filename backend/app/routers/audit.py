"""Audit log router for admin compliance and security."""
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel
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
    """Schema for audit log response."""
    id: int
    user_id: Optional[int]
    action: str
    entity_type: Optional[str]
    entity_id: Optional[int]
    old_values: Optional[dict]
    new_values: Optional[dict]
    ip_address: Optional[str]
    user_agent: Optional[str]
    created_at: str
    user_username: Optional[str] = None

    model_config = {"from_attributes": True}


class AuditLogListResponse(BaseModel):
    """Schema for list of audit logs."""
    logs: list[AuditLogResponse]
    total: int
    page: int
    page_size: int


class AuditStatsResponse(BaseModel):
    """Schema for audit statistics."""
    total_logs: int
    logs_today: int
    logs_this_week: int
    unique_users: int
    top_actions: list[dict]
    top_users: list[dict]


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
    """List audit logs with filters (admin only)."""
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
    """Get audit log statistics (admin only)."""
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
    """Get a specific audit log entry (admin only)."""
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
    """Export audit logs as CSV (admin only)."""
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


# Helper function to create audit log entries
async def create_audit_log(
    db: AsyncSession,
    user_id: int | None,
    action: str,
    entity_type: str | None = None,
    entity_id: int | None = None,
    old_values: dict | None = None,
    new_values: dict | None = None,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> AuditLog:
    """Create an audit log entry."""
    log = AuditLog(
        user_id=user_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        old_values=old_values,
        new_values=new_values,
        ip_address=ip_address,
        user_agent=user_agent,
    )
    db.add(log)
    await db.flush()
    return log
