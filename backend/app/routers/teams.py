"""Teams router – manage crisis simulation teams within a CrisisLab tenant."""
import random
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select, func, outerjoin
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db_session
from app.models import Team, User, UserTeam
from app.models.user import UserRole
from app.routers.auth import require_auth, require_role
from app.utils.tenancy import TenantRequestContext, require_tenant_context


# Predefined team colors
TEAM_COLORS = [
    "#ef4444",  # red
    "#f97316",  # orange
    "#f59e0b",  # amber
    "#84cc16",  # lime
    "#22c55e",  # green
    "#14b8a6",  # teal
    "#06b6d4",  # cyan
    "#3b82f6",  # blue
    "#6366f1",  # indigo
    "#8b5cf6",  # violet
    "#a855f7",  # purple
    "#d946ef",  # fuchsia
    "#ec4899",  # pink
    "#78716c",  # stone
]


def get_random_color() -> str:
    """Generate a random color for team."""
    return random.choice(TEAM_COLORS)

router = APIRouter()


# Schemas
class TeamBase(BaseModel):
    """Base fields shared by team creation and update schemas."""
    name: str = Field(
        description="Display name of the team",
        examples=["Équipe Alpha"],
    )
    description: Optional[str] = Field(
        default=None,
        description="Free-text description of the team's mission during the exercise",
        examples=["Équipe de réponse principale – direction opérationnelle"],
    )
    color: Optional[str] = Field(
        default=None,
        description="Hex colour code used in the UI. If omitted a random colour is assigned.",
        examples=["#ef4444"],
    )


class TeamCreate(TeamBase):
    """Payload to create a new team, optionally with initial members."""
    member_ids: Optional[list[int]] = Field(
        default=None,
        description="User IDs to add as members on creation",
        examples=[[1, 2, 3]],
    )

    model_config = {
        "json_schema_extra": {
            "example": {
                "name": "Cellule de Crise",
                "description": "Équipe de support technique – infrastructure et sécurité",
                "color": "#8b5cf6",
                "member_ids": [1, 4, 5],
            }
        }
    }


class TeamUpdate(BaseModel):
    """Partial update payload – only supplied fields are changed."""
    name: Optional[str] = Field(
        default=None,
        description="New display name for the team",
        examples=["Équipe Beta"],
    )
    description: Optional[str] = Field(
        default=None,
        description="Updated description",
        examples=["Équipe de support technique – infrastructure et sécurité"],
    )
    color: Optional[str] = Field(
        default=None,
        description="New hex colour code",
        examples=["#3b82f6"],
    )

    model_config = {
        "json_schema_extra": {
            "example": {
                "name": "Équipe Beta",
                "color": "#3b82f6",
            }
        }
    }


class TeamMember(BaseModel):
    """A user belonging to a team, with their leadership flag."""
    id: int = Field(description="User ID", examples=[2])
    username: str = Field(description="Login username", examples=["j.duval"])
    email: str = Field(description="User email", examples=["j.duval@duval-industries.fr"])
    is_leader: bool = Field(description="Whether this member leads the team", examples=[True])
    joined_at: datetime = Field(description="Timestamp when the user joined the team")

    model_config = {
        "from_attributes": True,
        "json_schema_extra": {
            "example": {
                "id": 2,
                "username": "j.duval",
                "email": "j.duval@duval-industries.fr",
                "is_leader": True,
                "joined_at": "2024-11-14T08:30:00Z",
            }
        },
    }


class TeamResponse(TeamBase):
    """Read-only representation of a team returned by list and CRUD endpoints."""
    id: int = Field(description="Unique team identifier", examples=[1])
    color: str = Field(description="Hex colour code", examples=["#ef4444"])
    member_count: int = Field(default=0, description="Number of members in the team", examples=[4])
    created_at: datetime = Field(description="Creation timestamp")
    updated_at: datetime = Field(description="Last modification timestamp")

    model_config = {
        "from_attributes": True,
        "json_schema_extra": {
            "example": {
                "id": 1,
                "name": "Équipe Alpha",
                "description": "Équipe de réponse principale – direction opérationnelle",
                "color": "#ef4444",
                "member_count": 4,
                "created_at": "2024-11-14T08:00:00Z",
                "updated_at": "2024-11-14T09:15:00Z",
            }
        },
    }


class TeamDetailResponse(TeamResponse):
    """Full team representation including the member list."""
    members: list[TeamMember]


class TeamListResponse(BaseModel):
    """Paginated collection of teams."""
    teams: list[TeamResponse]
    total: int = Field(description="Total number of teams matching the query", examples=[3])
    page: int = Field(description="Current page number (1-based)", examples=[1])
    page_size: int = Field(description="Maximum items per page", examples=[20])


@router.get("", response_model=TeamListResponse)
async def list_teams(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: Optional[str] = None,
    tenant_ctx: TenantRequestContext = Depends(require_tenant_context),
    _: User = Depends(require_auth),
    db: AsyncSession = Depends(get_db_session),
):
    """List all teams in the current tenant with their member count.

    Returns a paginated list of teams. Optionally filter by name using the
    `search` query parameter (case-insensitive partial match).

    **Auth:** any authenticated user.
    """
    # Subquery : nombre de membres par équipe
    member_count_sq = (
        select(UserTeam.team_id, func.count(UserTeam.user_id).label("member_count"))
        .group_by(UserTeam.team_id)
        .subquery()
    )

    query = (
        select(Team, func.coalesce(member_count_sq.c.member_count, 0).label("member_count"))
        .outerjoin(member_count_sq, Team.id == member_count_sq.c.team_id)
        .where(Team.tenant_id == tenant_ctx.tenant.id)
    )
    count_query = select(func.count(Team.id)).where(Team.tenant_id == tenant_ctx.tenant.id)

    if search:
        search_pattern = f"%{search}%"
        query = query.where(Team.name.ilike(search_pattern))
        count_query = count_query.where(Team.name.ilike(search_pattern))

    # Get total count
    total_result = await db.execute(count_query)
    total = total_result.scalar()

    # Paginate
    offset = (page - 1) * page_size
    query = query.order_by(Team.created_at.desc()).offset(offset).limit(page_size)

    result = await db.execute(query)
    rows = result.all()

    team_responses = []
    for team, mc in rows:
        tr = TeamResponse.model_validate(team)
        tr.member_count = mc
        team_responses.append(tr)

    return TeamListResponse(
        teams=team_responses,
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("", response_model=TeamResponse, status_code=201)
async def create_team(
    team_data: TeamCreate,
    tenant_ctx: TenantRequestContext = Depends(require_tenant_context),
    _: User = Depends(require_role(UserRole.ADMIN, UserRole.ANIMATEUR)),
    db: AsyncSession = Depends(get_db_session),
):
    """Create a new team within the current tenant.

    Optionally attach initial members by supplying `member_ids`. A random
    colour from the CrisisLab palette is assigned when `color` is omitted.

    **Auth:** admin or animateur role required.
    """
    team = Team(
        tenant_id=tenant_ctx.tenant.id,
        name=team_data.name,
        description=team_data.description,
        color=team_data.color or get_random_color(),
    )
    db.add(team)
    await db.flush()
    
    # Add members if provided
    if team_data.member_ids:
        for user_id in team_data.member_ids:
            user_check = await db.execute(
                select(User.id).where(User.id == user_id, User.tenant_id == tenant_ctx.tenant.id)
            )
            if user_check.scalar_one_or_none() is None:
                raise HTTPException(status_code=404, detail=f"User not found: {user_id}")
            member = UserTeam(team_id=team.id, user_id=user_id)
            db.add(member)
    
    await db.commit()
    await db.refresh(team)
    
    return TeamResponse.model_validate(team)


@router.get("/{team_id}", response_model=TeamDetailResponse)
async def get_team(
    team_id: int,
    tenant_ctx: TenantRequestContext = Depends(require_tenant_context),
    _: User = Depends(require_auth),
    db: AsyncSession = Depends(get_db_session),
):
    """Retrieve a single team by ID, including the full member list.

    Each member entry includes username, email, leadership status, and join
    timestamp.

    **Auth:** any authenticated user.
    """
    result = await db.execute(
        select(Team)
        .options(selectinload(Team.members).selectinload(UserTeam.user))
        .where(Team.id == team_id, Team.tenant_id == tenant_ctx.tenant.id)
    )
    team = result.scalar_one_or_none()
    
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    
    members = []
    for member in team.members:
        members.append(TeamMember(
            id=member.user.id,
            username=member.user.username,
            email=member.user.email,
            is_leader=member.is_leader,
            joined_at=member.joined_at,
        ))
    
    return TeamDetailResponse(
        id=team.id,
        name=team.name,
        description=team.description,
        color=team.color,
        created_at=team.created_at,
        updated_at=team.updated_at,
        members=members,
    )


@router.put("/{team_id}", response_model=TeamResponse)
async def update_team(
    team_id: int,
    team_data: TeamUpdate,
    tenant_ctx: TenantRequestContext = Depends(require_tenant_context),
    _: User = Depends(require_role(UserRole.ADMIN, UserRole.ANIMATEUR)),
    db: AsyncSession = Depends(get_db_session),
):
    """Update a team's name, description, or colour.

    Only the fields present in the request body are modified; omitted fields
    remain unchanged.

    **Auth:** admin or animateur role required.
    """
    result = await db.execute(select(Team).where(Team.id == team_id, Team.tenant_id == tenant_ctx.tenant.id))
    team = result.scalar_one_or_none()
    
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    
    if team_data.name is not None:
        team.name = team_data.name
    if team_data.description is not None:
        team.description = team_data.description
    if team_data.color is not None:
        team.color = team_data.color
    
    await db.commit()
    await db.refresh(team)
    
    return TeamResponse.model_validate(team)


@router.delete("/{team_id}")
async def delete_team(
    team_id: int,
    tenant_ctx: TenantRequestContext = Depends(require_tenant_context),
    _: User = Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db_session),
):
    """Permanently delete a team and all its membership associations.

    **Auth:** admin role required.
    """
    result = await db.execute(select(Team).where(Team.id == team_id, Team.tenant_id == tenant_ctx.tenant.id))
    team = result.scalar_one_or_none()
    
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    
    await db.delete(team)
    await db.commit()
    
    return {"message": "Team deleted successfully"}


@router.post("/{team_id}/members/{user_id}")
async def add_team_member(
    team_id: int,
    user_id: int,
    is_leader: bool = False,
    tenant_ctx: TenantRequestContext = Depends(require_tenant_context),
    _: User = Depends(require_role(UserRole.ADMIN, UserRole.ANIMATEUR)),
    db: AsyncSession = Depends(get_db_session),
):
    """Add an existing user to a team.

    Set `is_leader=true` to designate the user as team leader. A user cannot
    be added twice to the same team.

    **Auth:** admin or animateur role required.
    """
    # Check team exists
    team_result = await db.execute(select(Team).where(Team.id == team_id, Team.tenant_id == tenant_ctx.tenant.id))
    if not team_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Team not found")
    
    # Check user exists
    user_result = await db.execute(select(User).where(User.id == user_id, User.tenant_id == tenant_ctx.tenant.id))
    if not user_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="User not found")
    
    # Check if already member
    existing = await db.execute(
        select(UserTeam).where(UserTeam.team_id == team_id, UserTeam.user_id == user_id)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="User is already a member of this team")
    
    member = UserTeam(team_id=team_id, user_id=user_id, is_leader=is_leader)
    db.add(member)
    await db.commit()
    
    return {"message": "Member added successfully"}


@router.delete("/{team_id}/members/{user_id}")
async def remove_team_member(
    team_id: int,
    user_id: int,
    tenant_ctx: TenantRequestContext = Depends(require_tenant_context),
    _: User = Depends(require_role(UserRole.ADMIN, UserRole.ANIMATEUR)),
    db: AsyncSession = Depends(get_db_session),
):
    """Remove a user from a team.

    The user account is not deleted, only the team membership association.

    **Auth:** admin or animateur role required.
    """
    result = await db.execute(
        select(UserTeam)
        .join(Team, Team.id == UserTeam.team_id)
        .where(
            UserTeam.team_id == team_id,
            UserTeam.user_id == user_id,
            Team.tenant_id == tenant_ctx.tenant.id,
        )
    )
    member = result.scalar_one_or_none()
    
    if not member:
        raise HTTPException(status_code=404, detail="Member not found in team")
    
    await db.delete(member)
    await db.commit()
    
    return {"message": "Member removed successfully"}
