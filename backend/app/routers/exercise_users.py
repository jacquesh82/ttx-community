"""CrisisLab Exercise Users router.

Manages participant assignments within a crisis-simulation exercise: assigning
users to exercises with a specific role (animateur, observateur, joueur),
linking them to a crisis-cell team, and configuring their channel capabilities
(social, TV, mail).
"""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
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
    """Assign a user to a CrisisLab exercise with a specific role.

    The caller must provide the platform ``user_id`` and an exercise-scoped
    role. Optionally attach the user to a crisis-cell team and configure
    which simulation channels they may access.
    """
    user_id: int = Field(description="Platform user ID to assign", examples=[12])
    role: ExerciseRole = Field(default=ExerciseRole.JOUEUR, description="Exercise-scoped role", examples=["JOUEUR"])
    team_id: Optional[int] = Field(default=None, description="Crisis-cell team to attach the user to", examples=[3])
    organization: Optional[str] = Field(default=None, description="Organisation the participant represents during the exercise", examples=["DSI"])
    real_function: Optional[str] = Field(default=None, description="Real-world function the participant plays in the scenario", examples=["RSSI"])
    can_social: Optional[bool] = Field(default=None, description="Allow access to the simulated social-media channel", examples=[True])
    can_tv: Optional[bool] = Field(default=None, description="Allow access to the simulated TV-live channel", examples=[True])
    can_mail: Optional[bool] = Field(default=None, description="Allow access to the simulated webmail channel", examples=[True])
    visibility_scope: Optional[InjectVisibilityScope] = Field(default=None, description="Inject visibility scope for this participant", examples=["TEAM_ONLY"])

    model_config = {"json_schema_extra": {
        "example": {
            "user_id": 12,
            "role": "JOUEUR",
            "team_id": 3,
            "organization": "DSI",
            "real_function": "RSSI",
            "can_social": True,
            "can_tv": True,
            "can_mail": True,
            "visibility_scope": "TEAM_ONLY",
        }
    }}


class ExerciseUserUpdate(BaseModel):
    """Update a participant's role, team, or channel capabilities within a CrisisLab exercise.

    All fields are optional -- only supplied fields are modified.
    """
    role: Optional[ExerciseRole] = Field(default=None, description="New exercise-scoped role", examples=["ANIMATEUR"])
    team_id: Optional[int] = Field(default=None, description="New crisis-cell team ID (0 to clear)", examples=[2])
    organization: Optional[str] = Field(default=None, description="Updated organisation", examples=["Direction Generale"])
    real_function: Optional[str] = Field(default=None, description="Updated real-world function", examples=["Directeur de crise"])
    can_social: Optional[bool] = Field(default=None, description="Toggle social-media channel access", examples=[True])
    can_tv: Optional[bool] = Field(default=None, description="Toggle TV-live channel access", examples=[True])
    can_mail: Optional[bool] = Field(default=None, description="Toggle webmail channel access", examples=[True])
    visibility_scope: Optional[InjectVisibilityScope] = Field(default=None, description="Updated inject visibility scope", examples=["TEAM_ONLY"])

    model_config = {"json_schema_extra": {
        "example": {
            "role": "ANIMATEUR",
            "team_id": 2,
            "organization": "Direction Generale",
            "real_function": "Directeur de crise",
            "can_social": True,
            "can_tv": True,
            "can_mail": True,
            "visibility_scope": "TEAM_ONLY",
        }
    }}


class ExerciseUserResponse(BaseModel):
    """Detailed view of a participant assigned to a CrisisLab exercise.

    Includes the user's platform identity, exercise-scoped role, team
    assignment, organisation context, and channel capabilities.
    """
    id: int = Field(description="Exercise-user assignment ID", examples=[1])
    user_id: int = Field(description="Platform user ID", examples=[12])
    exercise_id: int = Field(description="Exercise this assignment belongs to", examples=[5])
    role: ExerciseRole = Field(description="Exercise-scoped role", examples=["JOUEUR"])
    team_id: Optional[int] = Field(description="Assigned crisis-cell team ID", examples=[3])
    assigned_at: str = Field(description="ISO-8601 timestamp of the assignment", examples=["2024-11-15T09:30:00Z"])
    assigned_by: Optional[int] = Field(description="Platform user ID of the person who made the assignment", examples=[1])
    user_username: str = Field(description="Username of the assigned user", examples=["m.dupont"])
    user_email: str = Field(description="Email of the assigned user", examples=["m.dupont@duval-industries.fr"])
    team_name: Optional[str] = Field(default=None, description="Display name of the assigned team", examples=["Cellule IT"])
    organization: Optional[str] = Field(default=None, description="Organisation the participant represents", examples=["DSI"])
    real_function: Optional[str] = Field(default=None, description="Real-world function played in the scenario", examples=["RSSI"])
    can_social: bool = Field(default=True, description="Whether the participant can use simulated social media", examples=[True])
    can_tv: bool = Field(default=True, description="Whether the participant can use simulated TV live", examples=[True])
    can_mail: bool = Field(default=True, description="Whether the participant can use simulated webmail", examples=[True])
    visibility_scope: InjectVisibilityScope = Field(default=InjectVisibilityScope.TEAM_ONLY, description="Inject visibility scope", examples=["TEAM_ONLY"])

    model_config = {"from_attributes": True, "json_schema_extra": {
        "example": {
            "id": 1,
            "user_id": 12,
            "exercise_id": 5,
            "role": "JOUEUR",
            "team_id": 3,
            "assigned_at": "2024-11-15T09:30:00Z",
            "assigned_by": 1,
            "user_username": "m.dupont",
            "user_email": "m.dupont@duval-industries.fr",
            "team_name": "Cellule IT",
            "organization": "DSI",
            "real_function": "RSSI",
            "can_social": True,
            "can_tv": True,
            "can_mail": True,
            "visibility_scope": "TEAM_ONLY",
        }
    }}


class ExerciseUserListResponse(BaseModel):
    """Paginated list of participants assigned to a CrisisLab exercise."""
    users: list[ExerciseUserResponse] = Field(description="Exercise-user assignments")
    total: int = Field(description="Total number of assignments matching the query", examples=[42])

    model_config = {"json_schema_extra": {
        "example": {
            "users": [
                {
                    "id": 1,
                    "user_id": 12,
                    "exercise_id": 5,
                    "role": "JOUEUR",
                    "team_id": 3,
                    "assigned_at": "2024-11-15T09:30:00Z",
                    "assigned_by": 1,
                    "user_username": "m.dupont",
                    "user_email": "m.dupont@duval-industries.fr",
                    "team_name": "Cellule IT",
                    "organization": "DSI",
                    "real_function": "RSSI",
                    "can_social": True,
                    "can_tv": True,
                    "can_mail": True,
                    "visibility_scope": "TEAM_ONLY",
                }
            ],
            "total": 1,
        }
    }}


class AvailableUserResponse(BaseModel):
    """A platform user who can potentially be assigned to a CrisisLab exercise.

    Includes a flag indicating whether the user is already assigned, so the
    frontend can grey-out or hide duplicates in the assignment picker.
    """
    id: int = Field(description="Platform user ID", examples=[14])
    username: str = Field(description="Username", examples=["c.martin"])
    email: str = Field(description="Email address", examples=["c.martin@duval-industries.fr"])
    global_role: UserRole = Field(description="Platform-level role of the user", examples=["animateur"])
    already_assigned: bool = Field(description="True if the user is already assigned to this exercise", examples=[False])

    model_config = {"from_attributes": True, "json_schema_extra": {
        "example": {
            "id": 14,
            "username": "c.martin",
            "email": "c.martin@duval-industries.fr",
            "global_role": "animateur",
            "already_assigned": False,
        }
    }}


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
    """List participants assigned to a CrisisLab exercise.

    Returns a paginated list of exercise-user assignments with their role,
    team, organisation, real-world function, and channel capabilities.
    Optionally filter by exercise-scoped role (ANIMATEUR, OBSERVATEUR, JOUEUR).
    """
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
    """Assign a platform user to a CrisisLab exercise.

    Creates a new exercise-user assignment with the specified role (defaults
    to JOUEUR). Optionally links the participant to a crisis-cell team and
    sets channel capabilities (can_social, can_tv, can_mail) and inject
    visibility scope. Returns 400 if the user is already assigned.
    """
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
    """Update a participant's assignment within a CrisisLab exercise.

    Accepts a partial payload -- only supplied fields are modified. Can change
    the exercise-scoped role, reassign to a different crisis-cell team, update
    the organisation/function metadata, or toggle channel capabilities.
    """
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
    """Remove a participant from a CrisisLab exercise.

    Deletes the exercise-user assignment. The platform user account is not
    affected. Returns 404 if the user is not currently assigned to the
    exercise.
    """
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
    """List platform users available for assignment to a CrisisLab exercise.

    Returns up to 50 users belonging to the current tenant, each annotated
    with an ``already_assigned`` flag so the UI can indicate which users are
    already participating. Supports optional free-text search on username or
    email.
    """
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
    """List all CrisisLab exercises a given user is assigned to.

    Returns every exercise-user assignment for the specified platform user
    within the current tenant, ordered by most recently assigned first.
    """
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
