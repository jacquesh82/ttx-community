"""Player router - API endpoints for participant/joueur role."""
from datetime import datetime, timezone, timedelta
from typing import Optional, List
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func, or_, and_, exists
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db_session
from app.models import User, Exercise, Team, Inject, Delivery, Event, Decision, ExerciseUser
from app.models.chat import ChatRoom as ChatRoomModel, ChatRoomType, ChatMessage as ChatMessageModel, ChatReadReceipt
from app.models.inject import DeliveryStatus, InjectStatus, AudienceKind
from app.models.event import EventType, EventActorType, EventAudience
from app.models.exercise import ExerciseStatus
from app.models.user import UserRole
from app.models.exercise_user import ExerciseRole
from app.routers.auth import require_auth
from app.schemas.player import (
    PlayerContext, PlayerExerciseInfo, PlayerTeamInfo, PlayerStats,
    PlayerInject, PlayerEvent, UpdateDeliveryRequest, DeliveryResponse,
    ChatRoom, ChatMessage, SendChatMessageRequest,
    CreateDecisionRequest, DecisionResponse,
    Notification, NotificationListResponse,
)
from app.utils.tenancy import current_tenant_id_var

router = APIRouter(prefix="/player", tags=["player"])


async def get_player_exercise_role(
    db: AsyncSession,
    user_id: int,
    exercise_id: int
) -> Optional[ExerciseUser]:
    """Get the user's role in an exercise."""
    result = await db.execute(
        select(ExerciseUser).options(selectinload(ExerciseUser.capability)).where(
            ExerciseUser.user_id == user_id,
            ExerciseUser.exercise_id == exercise_id
        )
    )
    return result.scalar_one_or_none()


async def require_player_access(
    exercise_id: int,
    user: User = Depends(require_auth),
    db: AsyncSession = Depends(get_db_session),
) -> tuple[User, ExerciseUser, Exercise]:
    """Require player access to an exercise.
    
    - Admin et Animateur ont accès à tous les exercices sans ExerciseUser record.
    - Observateur et Participant nécessitent un ExerciseUser record.
    """
    # Get exercise
    query = select(Exercise).where(Exercise.id == exercise_id)
    tenant_id = current_tenant_id_var.get()
    if tenant_id is not None:
        query = query.where(Exercise.tenant_id == tenant_id)
    result = await db.execute(query)
    exercise = result.scalar_one_or_none()
    
    if not exercise:
        raise HTTPException(status_code=404, detail="Exercise not found")

    # Essayer de trouver le rôle spécifique à l'exercice
    exercise_user = await get_player_exercise_role(db, user.id, exercise_id)

    if exercise_user:
        return user, exercise_user, exercise

    # Admin et animateur ont accès même sans ExerciseUser record
    if user.role in (UserRole.ADMIN, UserRole.ANIMATEUR):
        # Créer un ExerciseUser synthétique (non persisté) avec le rôle animateur
        synthetic = ExerciseUser()
        synthetic.user_id = user.id
        synthetic.exercise_id = exercise_id
        synthetic.role = ExerciseRole.ANIMATEUR
        synthetic.team_id = None
        return user, synthetic, exercise

    # Observateur global a accès en lecture
    if user.role == UserRole.OBSERVATEUR:
        synthetic = ExerciseUser()
        synthetic.user_id = user.id
        synthetic.exercise_id = exercise_id
        synthetic.role = ExerciseRole.OBSERVATEUR
        synthetic.team_id = None
        return user, synthetic, exercise

    raise HTTPException(status_code=403, detail="Not assigned to this exercise")


def calculate_exercise_time(exercise: Exercise) -> Optional[str]:
    """Calculate exercise time as T+HH:MM."""
    if not exercise.started_at or exercise.status != ExerciseStatus.RUNNING:
        return None
    
    now = datetime.now(timezone.utc)
    elapsed = now - exercise.started_at
    
    # Apply time multiplier
    multiplier = float(exercise.time_multiplier)
    adjusted_seconds = elapsed.total_seconds() * multiplier
    
    hours = int(adjusted_seconds // 3600)
    minutes = int((adjusted_seconds % 3600) // 60)
    
    return f"T+{hours:02d}:{minutes:02d}"


# === Context ===

@router.get("/exercises/{exercise_id}/context", response_model=PlayerContext)
async def get_player_context(
    exercise_id: int,
    auth: tuple = Depends(require_player_access),
    db: AsyncSession = Depends(get_db_session),
):
    """Get player context for an exercise."""
    user, exercise_user, exercise = auth
    
    # Get team info
    team_info = None
    if exercise_user.team_id:
        result = await db.execute(
            select(Team).where(Team.id == exercise_user.team_id)
        )
        team = result.scalar_one_or_none()
        if team:
            team_info = PlayerTeamInfo(
                id=team.id,
                name=team.name,
                code=team.name[:4].upper().replace(" ", "")
            )
    
    # Calculate stats
    team_id = exercise_user.team_id
    user_id = user.id
    
    # Pending injects (handle case where team_id is None)
    injects_pending = 0
    injects_in_progress = 0
    injects_treated = 0
    messages_unread = 0
    decisions_count = 0
    
    if team_id:
        pending_query = select(func.count(Delivery.id)).join(Inject).where(
            Delivery.target_team_id == team_id,
            Inject.exercise_id == exercise_id,
            Delivery.status.in_([DeliveryStatus.DELIVERED, DeliveryStatus.OPENED])
        )
        pending_result = await db.execute(pending_query)
        injects_pending = pending_result.scalar() or 0
        
        # In progress injects
        in_progress_query = select(func.count(Delivery.id)).join(Inject).where(
            Delivery.target_team_id == team_id,
            Inject.exercise_id == exercise_id,
            Delivery.status == DeliveryStatus.IN_PROGRESS
        )
        in_progress_result = await db.execute(in_progress_query)
        injects_in_progress = in_progress_result.scalar() or 0
        
        # Treated injects
        treated_query = select(func.count(Delivery.id)).join(Inject).where(
            Delivery.target_team_id == team_id,
            Inject.exercise_id == exercise_id,
            Delivery.status == DeliveryStatus.TREATED
        )
        treated_result = await db.execute(treated_query)
        injects_treated = treated_result.scalar() or 0
    
    # Unread messages (simplified - would need proper read receipts)
    
    # Decisions count
    if team_id:
        decisions_query = select(func.count(Decision.id)).where(
            Decision.exercise_id == exercise_id,
            or_(Decision.team_id == team_id, Decision.user_id == user_id)
        )
        decisions_result = await db.execute(decisions_query)
        decisions_count = decisions_result.scalar() or 0
    
    stats = PlayerStats(
        injects_pending=injects_pending,
        injects_in_progress=injects_in_progress,
        injects_treated=injects_treated,
        messages_unread=messages_unread,
        decisions_count=decisions_count
    )
    
    exercise_info = PlayerExerciseInfo(
        id=exercise.id,
        name=exercise.name,
        status=exercise.status.value,
        started_at=exercise.started_at,
        time_multiplier=str(exercise.time_multiplier)
    )
    
    return PlayerContext(
        exercise=exercise_info,
        team=team_info,
        role=exercise_user.role,
        exercise_time=calculate_exercise_time(exercise),
        stats=stats
    )


# === Timeline ===

def event_to_player_event(event: Event, user_id: int, team_id: Optional[int]) -> PlayerEvent:
    """Convert an Event to a PlayerEvent with enriched fields."""
    
    # Determine channel and icon based on event type
    channel = "inject"
    icon = "📌"
    title = event.type.value.replace("_", " ").title()
    description = None
    visibility = "public"
    criticity = "info"
    actions = ["open"]
    
    event_type = event.type
    
    if event_type in [EventType.MAIL_DELIVERED, EventType.MAIL_OPENED, EventType.MAIL_REPLIED]:
        channel = "mail"
        icon = "📩"
        title = f"Mail : {event.payload.get('subject', 'Nouveau message')}" if event.payload else "Nouveau mail"
        visibility = "personal" if event.payload and event.payload.get("personal") else "team"
        actions = ["open", "reply", "create_decision"]
        
    elif event_type in [EventType.TWITTER_POSTED, EventType.TWITTER_REPLY, EventType.TWITTER_VIRAL]:
        channel = "social"
        icon = "🐦"
        title = f"@{event.actor_label or 'Unknown'}: {event.payload.get('content', '')[:50]}..." if event.payload else "Nouveau post"
        visibility = "public"
        actions = ["open", "create_decision"]
        
    elif event_type in [EventType.TV_SEGMENT_STARTED, EventType.TV_SEGMENT_ENDED, EventType.TV_BANNER_CHANGED]:
        channel = "tv"
        icon = "📺"
        title = f"TV : {event.payload.get('title', 'Flash info')}" if event.payload else "TV Live"
        visibility = "public"
        criticity = "important" if event_type == EventType.TV_SEGMENT_STARTED else "info"
        actions = ["open", "create_decision"]
        
    elif event_type == EventType.DECISION_LOGGED:
        channel = "decision"
        icon = "📌"
        title = f"Décision : {event.payload.get('title', 'Nouvelle décision')}" if event.payload else "Nouvelle décision"
        visibility = "team"
        actions = ["open"]
        
    elif event_type in [EventType.INJECT_SENT, EventType.INJECT_CREATED]:
        channel = "inject"
        icon = "⚠️"
        title = f"Inject : {event.payload.get('title', 'Nouvel événement')}" if event.payload else "Nouvel inject"
        criticity = event.payload.get("criticity", "info") if event.payload else "info"
        visibility = "team"
        actions = ["open", "acknowledge", "create_decision", "mark_treated"]
    
    # Determine if read (simplified - would check read receipts)
    is_read = False
    
    return PlayerEvent(
        id=event.id,
        type=event.type,
        entity_type=event.entity_type,
        entity_id=event.entity_id,
        actor_type=event.actor_type,
        actor_label=event.actor_label,
        payload=event.payload,
        ts=event.ts,
        exercise_time=event.exercise_time,
        title=title,
        description=description,
        icon=icon,
        visibility=visibility,
        channel=channel,
        criticity=criticity,
        is_read=is_read,
        actions=actions
    )


@router.get("/exercises/{exercise_id}/timeline")
async def get_player_timeline(
    exercise_id: int,
    channel: Optional[str] = Query(None),
    scope: Optional[str] = Query(None),
    criticity: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    auth: tuple = Depends(require_player_access),
    db: AsyncSession = Depends(get_db_session),
):
    """Get timeline events for player (RBAC filtered)."""
    user, exercise_user, exercise = auth
    team_id = exercise_user.team_id
    user_id = user.id
    capability = exercise_user.capability
    role_value = exercise_user.role.value if exercise_user else None
    
    # Build query with RBAC filtering
    query = select(Event).where(Event.exercise_id == exercise_id)
    
    # Visibility filter
    # Public events (TV, Twitter public posts)
    public_event_types = [
        EventType.TV_SEGMENT_STARTED, EventType.TV_SEGMENT_ENDED, EventType.TV_BANNER_CHANGED,
        EventType.TWITTER_POSTED, EventType.TWITTER_VIRAL,
        EventType.EXERCISE_STARTED, EventType.EXERCISE_PAUSED, EventType.EXERCISE_ENDED
    ]
    
    # Team events
    team_event_types = [
        EventType.INJECT_SENT, EventType.DECISION_LOGGED,
        EventType.MAIL_DELIVERED, EventType.MAIL_OPENED, EventType.MAIL_REPLIED
    ]

    if capability:
        if not capability.can_tv:
            public_event_types = [t for t in public_event_types if t not in (
                EventType.TV_SEGMENT_STARTED, EventType.TV_SEGMENT_ENDED, EventType.TV_BANNER_CHANGED
            )]
        if not capability.can_social:
            public_event_types = [t for t in public_event_types if t not in (
                EventType.TWITTER_POSTED, EventType.TWITTER_VIRAL
            )]
        if not capability.can_mail:
            team_event_types = [t for t in team_event_types if t not in (
                EventType.MAIL_DELIVERED, EventType.MAIL_OPENED, EventType.MAIL_REPLIED
            )]
    
    if scope == "public":
        query = query.where(Event.type.in_(public_event_types))
    elif scope == "team":
        query = query.where(
            or_(
                Event.type.in_(public_event_types),
                and_(
                    Event.type.in_(team_event_types),
                    or_(
                        Event.payload["team_id"].as_integer() == team_id,
                        Event.payload.is_(None)  # system events
                    )
                ) if team_id else Event.type.in_(public_event_types)
            )
        )
    elif scope == "me":
        # Personal events
        query = query.where(
            or_(
                Event.actor_id == user_id,
                Event.payload["user_id"].as_integer() == user_id if Event.payload is not None else False
            )
        )
    else:
        # Default: show public + team events
        visibility_conditions = [Event.type.in_(public_event_types)]
        if team_id:
            visibility_conditions.append(
                Event.payload["team_id"].as_integer() == team_id
            )
        query = query.where(or_(*visibility_conditions))
    
    # Channel filter
    if channel:
        channel_event_types = {
            "inject": [EventType.INJECT_SENT, EventType.INJECT_CREATED],
            "mail": [EventType.MAIL_DELIVERED, EventType.MAIL_OPENED, EventType.MAIL_REPLIED],
            "tv": [EventType.TV_SEGMENT_STARTED, EventType.TV_SEGMENT_ENDED, EventType.TV_BANNER_CHANGED],
            "social": [EventType.TWITTER_POSTED, EventType.TWITTER_REPLY, EventType.TWITTER_VIRAL],
            "decision": [EventType.DECISION_LOGGED]
        }
        if channel in channel_event_types:
            query = query.where(Event.type.in_(channel_event_types[channel]))

    # Audience filter: event visible if no audience or one matches user/team/role
    audience_match_conditions = []
    if role_value:
        audience_match_conditions.append(
            and_(EventAudience.kind == AudienceKind.ROLE, EventAudience.value == role_value)
        )
    if team_id:
        audience_match_conditions.append(
            and_(EventAudience.kind == AudienceKind.TEAM, EventAudience.value == str(team_id))
        )
    audience_match_conditions.append(
        and_(EventAudience.kind == AudienceKind.USER, EventAudience.value == str(user_id))
    )

    audience_match_exists = exists(
        select(EventAudience.id).where(
            EventAudience.event_id == Event.id,
            or_(*audience_match_conditions)
        )
    )
    no_audience_exists = ~exists(select(EventAudience.id).where(EventAudience.event_id == Event.id))
    query = query.where(or_(no_audience_exists, audience_match_exists))
    
    # Count total
    count_query = select(func.count(Event.id))
    count_query = count_query.where(query.whereclause)
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0
    
    # Get paginated results
    offset = (page - 1) * page_size
    query = query.order_by(Event.ts.desc()).offset(offset).limit(page_size)
    
    result = await db.execute(query)
    events = result.scalars().all()
    
    player_events = [event_to_player_event(e, user_id, team_id) for e in events]
    
    return {
        "events": player_events,
        "total": total,
        "page": page,
        "page_size": page_size
    }


# === Injects ===

@router.get("/exercises/{exercise_id}/injects", response_model=List[PlayerInject])
async def get_player_injects(
    exercise_id: int,
    status: Optional[str] = Query(None),
    auth: tuple = Depends(require_player_access),
    db: AsyncSession = Depends(get_db_session),
):
    """Get injects for player (filtered by team/user)."""
    user, exercise_user, exercise = auth
    team_id = exercise_user.team_id
    capability = exercise_user.capability
    user_id = user.id
    
    # Query injects delivered to user's team or user directly
    query = select(Inject, Delivery).join(
        Delivery, Inject.id == Delivery.inject_id
    ).where(
        Inject.exercise_id == exercise_id,
        Inject.status == InjectStatus.SENT,
        or_(
            Delivery.target_team_id == team_id,
            Delivery.target_user_id == user_id
        )
    ).options(selectinload(Inject.deliveries))
    
    if status:
        try:
            delivery_status = DeliveryStatus(status)
            query = query.where(Delivery.status == delivery_status)
        except ValueError:
            pass
    
    query = query.order_by(Inject.sent_at.desc())
    
    result = await db.execute(query)
    rows = result.all()
    
    injects = []
    for inject, delivery in rows:
        # Determine criticity from inject content
        content = inject.content or {}
        criticity = content.get("criticity", "info")
        
        player_inject = PlayerInject(
            id=inject.id,
            type=inject.type.value,
            title=inject.title,
            description=inject.description,
            status=inject.status.value,
            delivery_id=delivery.id,
            delivery_status=delivery.status,
            scheduled_at=inject.scheduled_at,
            sent_at=inject.sent_at,
            delivered_at=delivery.delivered_at,
            opened_at=delivery.opened_at,
            acknowledged_at=delivery.acknowledged_at,
            treated_at=delivery.treated_at,
            is_public=False,  # Injects to team/user are not public
            target_type="team" if delivery.target_team_id else "user",
            criticity=criticity,
            created_at=inject.created_at
        )
        injects.append(player_inject)
    
    return injects


@router.patch("/deliveries/{delivery_id}", response_model=DeliveryResponse)
async def update_delivery(
    delivery_id: int,
    data: UpdateDeliveryRequest,
    user: User = Depends(require_auth),
    db: AsyncSession = Depends(get_db_session),
):
    """Update delivery status (acknowledge, mark as treated, etc.)."""
    result = await db.execute(
        select(Delivery).where(Delivery.id == delivery_id)
    )
    delivery = result.scalar_one_or_none()
    
    if not delivery:
        raise HTTPException(status_code=404, detail="Delivery not found")
    
    # Verify user has access (team member or direct target)
    # TODO: Proper authorization check
    
    now = datetime.now(timezone.utc)
    
    if data.acknowledge:
        delivery.status = DeliveryStatus.ACKNOWLEDGED
        delivery.acknowledged_at = now
    
    if data.treat:
        delivery.status = DeliveryStatus.TREATED
        delivery.treated_at = now
        delivery.treated_by = user.id
    
    if data.status:
        delivery.status = data.status
        if data.status == DeliveryStatus.OPENED and not delivery.opened_at:
            delivery.opened_at = now
        elif data.status == DeliveryStatus.IN_PROGRESS:
            pass  # Just status change
    
    await db.commit()
    await db.refresh(delivery)
    
    return DeliveryResponse(
        id=delivery.id,
        status=delivery.status,
        acknowledged_at=delivery.acknowledged_at,
        treated_at=delivery.treated_at,
        treated_by=delivery.treated_by
    )


# === Decisions ===

@router.post("/exercises/{exercise_id}/decisions", response_model=DecisionResponse)
async def create_player_decision(
    exercise_id: int,
    data: CreateDecisionRequest,
    auth: tuple = Depends(require_player_access),
    db: AsyncSession = Depends(get_db_session),
):
    """Create a decision as a player."""
    user, exercise_user, exercise = auth
    
    decision = Decision(
        exercise_id=exercise_id,
        team_id=exercise_user.team_id,
        user_id=user.id,
        title=data.title,
        description=data.description,
        impact=data.impact
    )
    
    db.add(decision)
    
    # Create event for the decision
    event = Event(
        exercise_id=exercise_id,
        type=EventType.DECISION_LOGGED,
        entity_type="decision",
        entity_id=decision.id,
        actor_type=EventActorType.USER,
        actor_id=user.id,
        actor_label=user.username,
        payload={
            "title": data.title,
            "team_id": exercise_user.team_id,
            "source_event_id": data.source_event_id,
            "source_inject_id": data.source_inject_id
        }
    )
    db.add(event)
    
    await db.commit()
    await db.refresh(decision)
    
    return DecisionResponse(
        id=decision.id,
        exercise_id=decision.exercise_id,
        team_id=decision.team_id,
        user_id=decision.user_id,
        title=decision.title,
        description=decision.description,
        impact=decision.impact,
        decided_at=decision.decided_at,
        created_at=decision.created_at,
        source_event_id=data.source_event_id,
        source_inject_id=data.source_inject_id
    )


@router.get("/exercises/{exercise_id}/decisions", response_model=List[DecisionResponse])
async def get_player_decisions(
    exercise_id: int,
    auth: tuple = Depends(require_player_access),
    db: AsyncSession = Depends(get_db_session),
):
    """Get decisions for player's team."""
    user, exercise_user, exercise = auth
    team_id = exercise_user.team_id
    
    query = select(Decision).where(
        Decision.exercise_id == exercise_id,
        Decision.team_id == team_id
    ).order_by(Decision.decided_at.desc())
    
    result = await db.execute(query)
    decisions = result.scalars().all()
    
    return [
        DecisionResponse(
            id=d.id,
            exercise_id=d.exercise_id,
            team_id=d.team_id,
            user_id=d.user_id,
            title=d.title,
            description=d.description,
            impact=d.impact,
            decided_at=d.decided_at,
            created_at=d.created_at
        )
        for d in decisions
    ]


# === Notifications ===

@router.get("/exercises/{exercise_id}/notifications", response_model=NotificationListResponse)
async def get_player_notifications(
    exercise_id: int,
    auth: tuple = Depends(require_player_access),
    db: AsyncSession = Depends(get_db_session),
):
    """Get notifications for player."""
    user, exercise_user, exercise = auth
    team_id = exercise_user.team_id
    
    # Get recent events that should generate notifications
    # This is simplified - in production you'd have a proper notification table
    
    notifications = []
    
    # Get recent injects (handle case where team_id is None)
    if team_id and (capability is None or capability.can_mail):
        recent_injects_query = select(Inject, Delivery).join(
            Delivery, Inject.id == Delivery.inject_id
        ).where(
            Inject.exercise_id == exercise_id,
            Inject.status == InjectStatus.SENT,
            or_(
                Delivery.target_team_id == team_id,
                Delivery.target_user_id == user.id
            ),
            Delivery.status.in_([DeliveryStatus.DELIVERED, DeliveryStatus.OPENED])
        ).order_by(Inject.sent_at.desc()).limit(5)
        
        result = await db.execute(recent_injects_query)
        rows = result.all()
        
        for inject, delivery in rows:
            content = inject.content or {}
            criticity = content.get("criticity", "info")
            
            notifications.append(Notification(
                id=f"inject-{inject.id}",
                type="inject.received",
                title=f"Nouvel inject : {inject.title}",
                message=inject.description or "",
                entity_type="inject",
                entity_id=inject.id,
                criticity=criticity,
                created_at=inject.sent_at or inject.created_at,
                is_read=delivery.opened_at is not None
            ))
    elif capability is None or capability.can_mail:
        # No team - only get user direct messages
        recent_injects_query = select(Inject, Delivery).join(
            Delivery, Inject.id == Delivery.inject_id
        ).where(
            Inject.exercise_id == exercise_id,
            Inject.status == InjectStatus.SENT,
            Delivery.target_user_id == user.id,
            Delivery.status.in_([DeliveryStatus.DELIVERED, DeliveryStatus.OPENED])
        ).order_by(Inject.sent_at.desc()).limit(5)
        
        result = await db.execute(recent_injects_query)
        rows = result.all()
        
        for inject, delivery in rows:
            content = inject.content or {}
            criticity = content.get("criticity", "info")
            
            notifications.append(Notification(
                id=f"inject-{inject.id}",
                type="inject.received",
                title=f"Nouvel inject : {inject.title}",
                message=inject.description or "",
                entity_type="inject",
                entity_id=inject.id,
                criticity=criticity,
                created_at=inject.sent_at or inject.created_at,
                is_read=delivery.opened_at is not None
            ))
    
    # Get recent TV segments
    if capability is None or capability.can_tv:
        tv_events_query = select(Event).where(
            Event.exercise_id == exercise_id,
            Event.type == EventType.TV_SEGMENT_STARTED
        ).order_by(Event.ts.desc()).limit(3)

        result = await db.execute(tv_events_query)
        tv_events = result.scalars().all()

        for event in tv_events:
            title = event.payload.get("title", "Flash info") if event.payload else "Flash info"
            notifications.append(Notification(
                id=f"tv-{event.id}",
                type="tv.segment",
                title=f"📺 TV : {title}",
                message="Nouveau segment en cours",
                entity_type="tv_segment",
                entity_id=event.entity_id,
                criticity="important",
                created_at=event.ts,
                is_read=False
            ))
    
    unread_count = sum(1 for n in notifications if not n.is_read)
    
    return NotificationListResponse(
        notifications=notifications,
        unread_count=unread_count
    )


# === Chat ===

async def ensure_default_rooms(db: AsyncSession, exercise_id: int, team_id: Optional[int] = None):
    """Ensure default chat rooms exist for an exercise."""
    # Check if general room exists
    result = await db.execute(
        select(ChatRoomModel).where(
            ChatRoomModel.exercise_id == exercise_id,
            ChatRoomModel.room_type == ChatRoomType.PUBLIC,
            ChatRoomModel.name == "#general"
        )
    )
    general_room = result.scalar_one_or_none()
    
    if not general_room:
        general_room = ChatRoomModel(
            exercise_id=exercise_id,
            name="#general",
            room_type=ChatRoomType.PUBLIC,
            is_active=True
        )
        db.add(general_room)
        await db.flush()
    
    # Create team room if team_id provided and doesn't exist
    team_room = None
    if team_id:
        result = await db.execute(
            select(ChatRoomModel).where(
                ChatRoomModel.exercise_id == exercise_id,
                ChatRoomModel.room_type == ChatRoomType.TEAM,
                ChatRoomModel.team_id == team_id
            )
        )
        team_room = result.scalar_one_or_none()
        
        if not team_room:
            # Get team code
            team_result = await db.execute(select(Team).where(Team.id == team_id))
            team = team_result.scalar_one_or_none()
            team_code = team.name[:4].upper().replace(" ", "") if team else "TEAM"
            
            team_room = ChatRoomModel(
                exercise_id=exercise_id,
                name=f"#team-{team_code.lower()}",
                room_type=ChatRoomType.TEAM,
                team_id=team_id,
                is_active=True
            )
            db.add(team_room)
            await db.flush()
    
    return general_room, team_room


@router.get("/exercises/{exercise_id}/chat/rooms", response_model=List[ChatRoom])
async def get_chat_rooms(
    exercise_id: int,
    auth: tuple = Depends(require_player_access),
    db: AsyncSession = Depends(get_db_session),
):
    """Get available chat rooms for player."""
    user, exercise_user, exercise = auth
    team_id = exercise_user.team_id
    
    # Ensure default rooms exist
    await ensure_default_rooms(db, exercise_id, team_id)
    await db.commit()
    
    # Build query for accessible rooms
    # User can access: public rooms + their team's rooms
    query = select(ChatRoomModel).where(
        ChatRoomModel.exercise_id == exercise_id,
        ChatRoomModel.is_active == True
    )
    
    # Filter by room type and team access
    if team_id:
        query = query.where(
            or_(
                ChatRoomModel.room_type == ChatRoomType.PUBLIC,
                ChatRoomModel.team_id == team_id
            )
        )
    else:
        query = query.where(ChatRoomModel.room_type == ChatRoomType.PUBLIC)
    
    query = query.order_by(ChatRoomModel.room_type, ChatRoomModel.name)
    
    result = await db.execute(query)
    rooms = result.scalars().all()
    
    # Get unread counts for each room
    room_list = []
    for room in rooms:
        # Get last message
        last_msg_result = await db.execute(
            select(ChatMessageModel)
            .where(ChatMessageModel.room_id == room.id)
            .order_by(ChatMessageModel.created_at.desc())
            .limit(1)
        )
        last_message = last_msg_result.scalar_one_or_none()
        
        # Get read receipt for this user
        read_receipt_result = await db.execute(
            select(ChatReadReceipt).where(
                ChatReadReceipt.room_id == room.id,
                ChatReadReceipt.user_id == user.id
            )
        )
        read_receipt = read_receipt_result.scalar_one_or_none()
        
        # Count unread messages
        if read_receipt and read_receipt.last_read_at:
            unread_count_result = await db.execute(
                select(func.count(ChatMessageModel.id)).where(
                    ChatMessageModel.room_id == room.id,
                    ChatMessageModel.created_at > read_receipt.last_read_at
                )
            )
            unread_count = unread_count_result.scalar() or 0
        else:
            # No read receipt - count all messages as unread
            unread_count_result = await db.execute(
                select(func.count(ChatMessageModel.id)).where(
                    ChatMessageModel.room_id == room.id
                )
            )
            unread_count = unread_count_result.scalar() or 0
        
        room_list.append(ChatRoom(
            id=room.id,
            name=room.name,
            room_type=room.room_type.value,
            unread_count=unread_count,
            last_message_at=last_message.created_at if last_message else None,
            last_message_preview=last_message.content[:100] if last_message else None
        ))
    
    return room_list


@router.get("/exercises/{exercise_id}/chat/rooms/{room_id}/messages", response_model=List[ChatMessage])
async def get_chat_messages(
    exercise_id: int,
    room_id: int,
    limit: int = Query(50, ge=1, le=200),
    before_id: Optional[int] = Query(None),
    auth: tuple = Depends(require_player_access),
    db: AsyncSession = Depends(get_db_session),
):
    """Get messages for a chat room."""
    user, exercise_user, exercise = auth
    team_id = exercise_user.team_id
    
    # Verify room exists and user has access
    room_result = await db.execute(
        select(ChatRoomModel).where(
            ChatRoomModel.id == room_id,
            ChatRoomModel.exercise_id == exercise_id,
            ChatRoomModel.is_active == True
        )
    )
    room = room_result.scalar_one_or_none()
    
    if not room:
        raise HTTPException(status_code=404, detail="Chat room not found")
    
    # Check access
    if room.room_type == ChatRoomType.TEAM and room.team_id != team_id:
        raise HTTPException(status_code=403, detail="Access denied to this room")
    
    # Build query
    query = select(ChatMessageModel).where(
        ChatMessageModel.room_id == room_id
    )
    
    if before_id:
        query = query.where(ChatMessageModel.id < before_id)
    
    query = query.order_by(ChatMessageModel.created_at.desc()).limit(limit)
    
    result = await db.execute(query)
    messages = result.scalars().all()
    
    # Update read receipt
    if messages:
        # Get the latest message
        latest_message = messages[0]  # Already sorted desc
        
        # Upsert read receipt
        read_receipt_result = await db.execute(
            select(ChatReadReceipt).where(
                ChatReadReceipt.room_id == room_id,
                ChatReadReceipt.user_id == user.id
            )
        )
        read_receipt = read_receipt_result.scalar_one_or_none()
        
        if read_receipt:
            read_receipt.last_read_at = datetime.now(timezone.utc)
            read_receipt.last_read_message_id = latest_message.id
        else:
            read_receipt = ChatReadReceipt(
                room_id=room_id,
                user_id=user.id,
                last_read_at=datetime.now(timezone.utc),
                last_read_message_id=latest_message.id
            )
            db.add(read_receipt)
        
        await db.commit()
    
    # Return in chronological order (oldest first)
    messages.reverse()
    
    return [
        ChatMessage(
            id=msg.id,
            room_id=msg.room_id,
            author_type=msg.author_type,
            author_id=msg.author_id,
            author_label=msg.author_label,
            content=msg.content,
            created_at=msg.created_at,
            is_pinned=msg.is_pinned,
            reactions=msg.reactions or {}
        )
        for msg in messages
    ]


@router.post("/exercises/{exercise_id}/chat/rooms/{room_id}/messages", response_model=ChatMessage)
async def send_chat_message(
    exercise_id: int,
    room_id: int,
    data: SendChatMessageRequest,
    auth: tuple = Depends(require_player_access),
    db: AsyncSession = Depends(get_db_session),
):
    """Send a message to a chat room."""
    user, exercise_user, exercise = auth
    team_id = exercise_user.team_id
    
    # Verify room exists and user has access
    room_result = await db.execute(
        select(ChatRoomModel).where(
            ChatRoomModel.id == room_id,
            ChatRoomModel.exercise_id == exercise_id,
            ChatRoomModel.is_active == True
        )
    )
    room = room_result.scalar_one_or_none()
    
    if not room:
        raise HTTPException(status_code=404, detail="Chat room not found")
    
    # Check access
    if room.room_type == ChatRoomType.TEAM and room.team_id != team_id:
        raise HTTPException(status_code=403, detail="Access denied to this room")
    
    # Create message
    message = ChatMessageModel(
        room_id=room_id,
        author_type="user",
        author_id=user.id,
        author_label=user.username,
        content=data.content,
        parent_message_id=data.parent_message_id,
        is_pinned=False,
        reactions={}
    )
    
    db.add(message)
    await db.commit()
    await db.refresh(message)
    
    return ChatMessage(
        id=message.id,
        room_id=message.room_id,
        author_type=message.author_type,
        author_id=message.author_id,
        author_label=message.author_label,
        content=message.content,
        created_at=message.created_at,
        is_pinned=message.is_pinned,
        reactions=message.reactions or {}
    )
