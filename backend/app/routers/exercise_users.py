"""Exercise Users router for managing exercise-scoped roles."""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db_session
from app.models import User, Exercise, ExerciseUser, Team
from app.models.user import UserRole
from app.models.exercise_user import ExerciseRole
from app.models.crisis_management import ParticipantCapability, InjectVisibilityScope
from app.routers.auth import require_auth, require_role, require_permission
from app.utils.tenancy import TenantRequestContext, require_tenant_context
from app.utils.permissions import Permission

router = APIRouter()


async def _ensure_exercise_in_tenant(
    db: AsyncSession,
    exercise_id: int,
    tenant_id: int,
) -> Exercise:
    result = await db.execute(
        select(Exercise).where(
            Exercise.id == exercise_id,
            Exercise.tenant_id == tenant_id,
        )
    )
    exercise = result.scalar_one_or_none()
    if not exercise:
        raise HTTPException(status_code=404, detail="Exercise not found")
    return exercise


# Schemas
class ExerciseUserCreate(BaseModel):
    """Schema for assigning a user to an exercise."""
    user_id: int
    role: ExerciseRole = ExerciseRole.JOUEUR
    team_id: Optional[int] = None
    organization: Optional[str] = None
    real_function: Optional[str] = None
    can_social: Optional[bool] = None
    can_tv: Optional[bool] = None
    can_mail: Optional[bool] = None
    visibility_scope: Optional[InjectVisibilityScope] = None


class ExerciseUserUpdate(BaseModel):
    """Schema for updating exercise user role."""
    role: Optional[ExerciseRole] = None
    team_id: Optional[int] = None
    organization: Optional[str] = None
    real_function: Optional[str] = None
    can_social: Optional[bool] = None
    can_tv: Optional[bool] = None
    can_mail: Optional[bool] = None
    visibility_scope: Optional[InjectVisibilityScope] = None


class ExerciseUserResponse(BaseModel):
    """Schema for exercise user response."""
    id: int
    user_id: int
    exercise_id: int
    role: ExerciseRole
    team_id: Optional[int]
    assigned_at: str
    assigned_by: Optional[int]
    user_username: str
    user_email: str
    team_name: Optional[str] = None
    organization: Optional[str] = None
    real_function: Optional[str] = None
    can_social: bool = True
    can_tv: bool = True
    can_mail: bool = True
    visibility_scope: InjectVisibilityScope = InjectVisibilityScope.TEAM_ONLY

    model_config = {"from_attributes": True}


class ExerciseUserListResponse(BaseModel):
    """Schema for list of exercise users."""
    users: list[ExerciseUserResponse]
    total: int


class AvailableUserResponse(BaseModel):
    """Schema for users available to add to exercise."""
    id: int
    username: str
    email: str
    global_role: UserRole
    already_assigned: bool

    model_config = {"from_attributes": True}


def build_exercise_user_response(eu: ExerciseUser) -> ExerciseUserResponse:
    """Build response from ExerciseUser model."""
    return ExerciseUserResponse(
        id=eu.id,
        user_id=eu.user_id,
        exercise_id=eu.exercise_id,
        role=eu.role,
        team_id=eu.team_id,
        assigned_at=eu.assigned_at.isoformat() if eu.assigned_at else None,
        assigned_by=eu.assigned_by,
        user_username=eu.user.username if eu.user else None,
        user_email=eu.user.email if eu.user else None,
        team_name=eu.team.name if eu.team else None,
        organization=eu.organization,
        real_function=eu.real_function,
        can_social=eu.capability.can_social if eu.capability else True,
        can_tv=eu.capability.can_tv if eu.capability else True,
        can_mail=eu.capability.can_mail if eu.capability else True,
        visibility_scope=eu.capability.visibility_scope if eu.capability else InjectVisibilityScope.TEAM_ONLY,
    )


@router.get("/exercises/{exercise_id}/users", response_model=ExerciseUserListResponse)
async def list_exercise_users(
    exercise_id: int,
    role: Optional[ExerciseRole] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    _: User = Depends(require_permission(Permission.EXERCISES_READ)),
    tenant_ctx: TenantRequestContext = Depends(require_tenant_context),
    db: AsyncSession = Depends(get_db_session),
):
    """List users assigned to an exercise."""
    # Verify exercise exists
    await _ensure_exercise_in_tenant(db, exercise_id, tenant_ctx.tenant.id)
    
    query = select(ExerciseUser).where(ExerciseUser.exercise_id == exercise_id)
    count_query = select(func.count(ExerciseUser.id)).where(ExerciseUser.exercise_id == exercise_id)
    
    if role:
        query = query.where(ExerciseUser.role == role)
        count_query = count_query.where(ExerciseUser.role == role)
    
    # Get total count
    total_result = await db.execute(count_query)
    total = total_result.scalar()
    
    # Paginate and load relationships
    offset = (page - 1) * page_size
    query = query.options(
        selectinload(ExerciseUser.user),
        selectinload(ExerciseUser.team),
        selectinload(ExerciseUser.capability),
    ).order_by(ExerciseUser.assigned_at.desc()).offset(offset).limit(page_size)
    
    result = await db.execute(query)
    exercise_users = result.scalars().all()
    
    return ExerciseUserListResponse(
        users=[build_exercise_user_response(eu) for eu in exercise_users],
        total=total,
    )


@router.post("/exercises/{exercise_id}/users", response_model=ExerciseUserResponse, status_code=201)
async def assign_user_to_exercise(
    exercise_id: int,
    data: ExerciseUserCreate,
    current_user: User = Depends(require_permission(Permission.EXERCISES_CREATE)),
    tenant_ctx: TenantRequestContext = Depends(require_tenant_context),
    db: AsyncSession = Depends(get_db_session),
):
    """Assign a user to an exercise with a specific role."""
    # Verify exercise exists
    await _ensure_exercise_in_tenant(db, exercise_id, tenant_ctx.tenant.id)
    
    # Verify user exists
    result = await db.execute(
        select(User).where(
            User.id == data.user_id,
            User.tenant_id == tenant_ctx.tenant.id,
        )
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Check if already assigned
    result = await db.execute(
        select(ExerciseUser).where(
            ExerciseUser.exercise_id == exercise_id,
            ExerciseUser.user_id == data.user_id,
        )
    )
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="User already assigned to this exercise")
    
    # Verify team exists and is part of exercise if provided
    if data.team_id:
        from app.models import ExerciseTeam
        result = await db.execute(
            select(ExerciseTeam).where(
                ExerciseTeam.exercise_id == exercise_id,
                ExerciseTeam.team_id == data.team_id,
            )
        )
        if not result.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Team is not part of this exercise")
    
    # Create assignment
    exercise_user = ExerciseUser(
        user_id=data.user_id,
        exercise_id=exercise_id,
        role=data.role,
        team_id=data.team_id,
        organization=data.organization,
        real_function=data.real_function,
        assigned_by=current_user.id,
    )
    db.add(exercise_user)
    await db.flush()

    if any(v is not None for v in (data.can_social, data.can_tv, data.can_mail, data.visibility_scope)):
        capability = ParticipantCapability(
            exercise_id=exercise_id,
            exercise_user_id=exercise_user.id,
            can_social=True if data.can_social is None else data.can_social,
            can_tv=True if data.can_tv is None else data.can_tv,
            can_mail=True if data.can_mail is None else data.can_mail,
            visibility_scope=data.visibility_scope or InjectVisibilityScope.TEAM_ONLY,
        )
        db.add(capability)
    await db.commit()
    await db.refresh(exercise_user)
    
    # Reload with relationships
    result = await db.execute(
        select(ExerciseUser)
        .options(selectinload(ExerciseUser.user), selectinload(ExerciseUser.team), selectinload(ExerciseUser.capability))
        .where(ExerciseUser.id == exercise_user.id)
    )
    exercise_user = result.scalar_one()
    
    return build_exercise_user_response(exercise_user)


@router.put("/exercises/{exercise_id}/users/{user_id}", response_model=ExerciseUserResponse)
async def update_exercise_user(
    exercise_id: int,
    user_id: int,
    data: ExerciseUserUpdate,
    _: User = Depends(require_permission(Permission.EXERCISES_CREATE)),
    tenant_ctx: TenantRequestContext = Depends(require_tenant_context),
    db: AsyncSession = Depends(get_db_session),
):
    """Update a user's role in an exercise."""
    await _ensure_exercise_in_tenant(db, exercise_id, tenant_ctx.tenant.id)
    result = await db.execute(
        select(ExerciseUser)
        .options(selectinload(ExerciseUser.user), selectinload(ExerciseUser.team), selectinload(ExerciseUser.capability))
        .where(
            ExerciseUser.exercise_id == exercise_id,
            ExerciseUser.user_id == user_id,
        )
    )
    exercise_user = result.scalar_one_or_none()
    
    if not exercise_user:
        raise HTTPException(status_code=404, detail="User not assigned to this exercise")
    
    if data.role is not None:
        exercise_user.role = data.role
    
    if data.team_id is not None:
        if data.team_id != 0:  # Allow 0 to clear team
            # Verify team is part of exercise
            from app.models import ExerciseTeam
            result = await db.execute(
                select(ExerciseTeam).where(
                    ExerciseTeam.exercise_id == exercise_id,
                    ExerciseTeam.team_id == data.team_id,
                )
            )
            if not result.scalar_one_or_none():
                raise HTTPException(status_code=400, detail="Team is not part of this exercise")
            exercise_user.team_id = data.team_id
        else:
            exercise_user.team_id = None

    if data.organization is not None:
        exercise_user.organization = data.organization
    if data.real_function is not None:
        exercise_user.real_function = data.real_function

    if any(v is not None for v in (data.can_social, data.can_tv, data.can_mail, data.visibility_scope)):
        if exercise_user.capability is None:
            exercise_user.capability = ParticipantCapability(
                exercise_id=exercise_id,
                exercise_user_id=exercise_user.id,
                can_social=True,
                can_tv=True,
                can_mail=True,
                visibility_scope=InjectVisibilityScope.TEAM_ONLY,
            )
        if data.can_social is not None:
            exercise_user.capability.can_social = data.can_social
        if data.can_tv is not None:
            exercise_user.capability.can_tv = data.can_tv
        if data.can_mail is not None:
            exercise_user.capability.can_mail = data.can_mail
        if data.visibility_scope is not None:
            exercise_user.capability.visibility_scope = data.visibility_scope
    
    await db.commit()
    await db.refresh(exercise_user)
    
    # Reload with relationships
    result = await db.execute(
        select(ExerciseUser)
        .options(selectinload(ExerciseUser.user), selectinload(ExerciseUser.team), selectinload(ExerciseUser.capability))
        .where(ExerciseUser.id == exercise_user.id)
    )
    exercise_user = result.scalar_one()
    
    return build_exercise_user_response(exercise_user)


@router.delete("/exercises/{exercise_id}/users/{user_id}")
async def remove_user_from_exercise(
    exercise_id: int,
    user_id: int,
    _: User = Depends(require_permission(Permission.EXERCISES_CREATE)),
    tenant_ctx: TenantRequestContext = Depends(require_tenant_context),
    db: AsyncSession = Depends(get_db_session),
):
    """Remove a user from an exercise."""
    await _ensure_exercise_in_tenant(db, exercise_id, tenant_ctx.tenant.id)
    result = await db.execute(
        select(ExerciseUser).where(
            ExerciseUser.exercise_id == exercise_id,
            ExerciseUser.user_id == user_id,
        )
    )
    exercise_user = result.scalar_one_or_none()
    
    if not exercise_user:
        raise HTTPException(status_code=404, detail="User not assigned to this exercise")
    
    await db.delete(exercise_user)
    await db.commit()
    
    return {"message": "User removed from exercise"}


@router.get("/exercises/{exercise_id}/available-users", response_model=list[AvailableUserResponse])
async def get_available_users(
    exercise_id: int,
    search: Optional[str] = None,
    _: User = Depends(require_permission(Permission.EXERCISES_READ)),
    tenant_ctx: TenantRequestContext = Depends(require_tenant_context),
    db: AsyncSession = Depends(get_db_session),
):
    """Get users available to add to an exercise."""
    # Verify exercise exists
    await _ensure_exercise_in_tenant(db, exercise_id, tenant_ctx.tenant.id)
    
    # Get already assigned user IDs
    result = await db.execute(
        select(ExerciseUser.user_id).where(ExerciseUser.exercise_id == exercise_id)
    )
    assigned_ids = {row[0] for row in result.fetchall()}
    
    # Build query for all users
    query = select(User).where(User.tenant_id == tenant_ctx.tenant.id)
    if search:
        search_pattern = f"%{search}%"
        query = query.where(
            (User.username.ilike(search_pattern)) | (User.email.ilike(search_pattern))
        )
    
    query = query.order_by(User.username).limit(50)
    
    result = await db.execute(query)
    users = result.scalars().all()
    
    return [
        AvailableUserResponse(
            id=u.id,
            username=u.username,
            email=u.email,
            global_role=u.role,
            already_assigned=u.id in assigned_ids,
        )
        for u in users
    ]


@router.get("/users/{user_id}/exercises", response_model=ExerciseUserListResponse)
async def list_user_exercises(
    user_id: int,
    current_user: User = Depends(require_auth),
    tenant_ctx: TenantRequestContext = Depends(require_tenant_context),
    db: AsyncSession = Depends(get_db_session),
):
    """List all exercises a user is assigned to."""
    # Users can only see their own assignments unless admin
    _ = current_user.id if hasattr(current_user, "id") else None

    target_user_result = await db.execute(
        select(User.id).where(
            User.id == user_id,
            User.tenant_id == tenant_ctx.tenant.id,
        )
    )
    if target_user_result.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="User not found")

    query = (
        select(ExerciseUser)
        .join(Exercise, Exercise.id == ExerciseUser.exercise_id)
        .where(
            ExerciseUser.user_id == user_id,
            Exercise.tenant_id == tenant_ctx.tenant.id,
        )
    )
    query = query.options(
        selectinload(ExerciseUser.user),
        selectinload(ExerciseUser.team),
        selectinload(ExerciseUser.capability),
        selectinload(ExerciseUser.exercise),
    ).order_by(ExerciseUser.assigned_at.desc())
    
    result = await db.execute(query)
    exercise_users = result.scalars().all()
    
    return ExerciseUserListResponse(
        users=[build_exercise_user_response(eu) for eu in exercise_users],
        total=len(exercise_users),
    )
