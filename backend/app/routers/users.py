"""Users router."""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db_session
from app.models import Team, User
from app.models.user import UserRole
from app.schemas.user import UserCreate, UserResponse, UserUpdate, UserListResponse
from app.routers.auth import require_role
from app.utils.security import hash_password
from app.utils.tenancy import TenantRequestContext, require_tenant_context

router = APIRouter()


@router.get("", response_model=UserListResponse)
async def list_users(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    role: Optional[UserRole] = None,
    is_active: Optional[bool] = None,
    search: Optional[str] = None,
    tenant_ctx: TenantRequestContext = Depends(require_tenant_context),
    _: User = Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db_session),
):
    """List all users (admin only)."""
    query = select(User).where(User.tenant_id == tenant_ctx.tenant.id)
    count_query = select(func.count(User.id)).where(User.tenant_id == tenant_ctx.tenant.id)
    
    # Apply filters
    if role:
        query = query.where(User.role == role)
        count_query = count_query.where(User.role == role)
    if is_active is not None:
        query = query.where(User.is_active == is_active)
        count_query = count_query.where(User.is_active == is_active)
    if search:
        search_pattern = f"%{search}%"
        query = query.where(
            (User.username.ilike(search_pattern)) | (User.email.ilike(search_pattern))
        )
        count_query = count_query.where(
            (User.username.ilike(search_pattern)) | (User.email.ilike(search_pattern))
        )
    
    # Get total count
    total_result = await db.execute(count_query)
    total = total_result.scalar()
    
    # Paginate
    offset = (page - 1) * page_size
    query = query.order_by(User.created_at.desc()).offset(offset).limit(page_size)
    
    result = await db.execute(query)
    users = result.scalars().all()
    
    return UserListResponse(
        users=[UserResponse.model_validate(u) for u in users],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("", response_model=UserResponse, status_code=201)
async def create_user(
    user_data: UserCreate,
    tenant_ctx: TenantRequestContext = Depends(require_tenant_context),
    _: User = Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db_session),
):
    """Create a new user (admin only)."""
    # Check if username or email already exists
    existing = await db.execute(
        select(User).where(
            User.tenant_id == tenant_ctx.tenant.id,
            (User.username == user_data.username) | (User.email == user_data.email)
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Username or email already exists")
    
    # Create user
    if user_data.team_id is not None:
        team_result = await db.execute(
            select(Team).where(Team.id == user_data.team_id, Team.tenant_id == tenant_ctx.tenant.id)
        )
        team = team_result.scalar_one_or_none()
        if not team:
            raise HTTPException(status_code=404, detail="Team not found")

    user = User(
        tenant_id=tenant_ctx.tenant.id,
        email=user_data.email,
        username=user_data.username,
        password_hash=hash_password(user_data.password),
        role=user_data.role,
        team_id=user_data.team_id,
        tags=user_data.tags,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    
    return UserResponse.model_validate(user)


@router.get("/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: int,
    tenant_ctx: TenantRequestContext = Depends(require_tenant_context),
    _: User = Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db_session),
):
    """Get a user by ID (admin only)."""
    result = await db.execute(select(User).where(User.id == user_id, User.tenant_id == tenant_ctx.tenant.id))
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    return UserResponse.model_validate(user)


@router.put("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: int,
    user_data: UserUpdate,
    tenant_ctx: TenantRequestContext = Depends(require_tenant_context),
    _: User = Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db_session),
):
    """Update a user (admin only)."""
    result = await db.execute(select(User).where(User.id == user_id, User.tenant_id == tenant_ctx.tenant.id))
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Update fields
    if user_data.email is not None:
        # Check if email is already used by another user
        existing = await db.execute(
            select(User).where(User.tenant_id == tenant_ctx.tenant.id, User.email == user_data.email, User.id != user_id)
        )
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Email already in use")
        user.email = user_data.email
    
    if user_data.username is not None:
        # Check if username is already used by another user
        existing = await db.execute(
            select(User).where(User.tenant_id == tenant_ctx.tenant.id, User.username == user_data.username, User.id != user_id)
        )
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Username already in use")
        user.username = user_data.username
    
    if user_data.role is not None:
        user.role = user_data.role
    
    if user_data.is_active is not None:
        user.is_active = user_data.is_active

    if "team_id" in user_data.model_fields_set:
        if user_data.team_id is not None:
            team_result = await db.execute(
                select(Team).where(Team.id == user_data.team_id, Team.tenant_id == tenant_ctx.tenant.id)
            )
            team = team_result.scalar_one_or_none()
            if not team:
                raise HTTPException(status_code=404, detail="Team not found")
        user.team_id = user_data.team_id

    if user_data.tags is not None:
        user.tags = user_data.tags
    
    await db.commit()
    await db.refresh(user)
    
    return UserResponse.model_validate(user)


@router.delete("/{user_id}")
async def delete_user(
    user_id: int,
    tenant_ctx: TenantRequestContext = Depends(require_tenant_context),
    current_user: User = Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db_session),
):
    """Delete a user (admin only)."""
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
    
    result = await db.execute(select(User).where(User.id == user_id, User.tenant_id == tenant_ctx.tenant.id))
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    await db.delete(user)
    await db.commit()
    
    return {"message": "User deleted successfully"}
