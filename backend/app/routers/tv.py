"""TV router for live streaming, playlist, and segment management."""
from datetime import datetime, timezone
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db_session
from app.models import (
    Exercise,
    TVChannel, TVSegment, TVSegmentType, TVSegmentStatus,
    TVLiveState, TVLiveStatus, TVPlaylistItem, PlaylistItemStatus,
    Media, Inject, InjectStatus
)
from app.models.user import UserRole
from app.routers.auth import require_auth, require_role
from app.utils.tenancy import TenantRequestContext, require_tenant_context

router = APIRouter()


# Schemas
class TickerItem(BaseModel):
    """Ticker item schema."""
    text: str
    priority: str = "normal"  # low, normal, high, urgent


class TVLiveStateResponse(BaseModel):
    """Schema for TV live state response."""
    channel_id: int
    status: TVLiveStatus
    on_air_type: Optional[str]
    on_air_id: Optional[int]
    on_air_media_id: Optional[int]
    started_at: Optional[datetime]
    banner_text: Optional[str]
    ticker_items: List[TickerItem]
    version: int
    
    model_config = {"from_attributes": True}


class TVSegmentBase(BaseModel):
    """Base TV segment schema."""
    segment_type: TVSegmentType
    title: Optional[str] = None
    banner_text: Optional[str] = None
    ticker_text: Optional[str] = None
    script: Optional[str] = None
    scheduled_start: Optional[datetime] = None
    scheduled_end: Optional[datetime] = None


class TVSegmentCreate(TVSegmentBase):
    """Schema for creating a TV segment."""
    channel_id: int
    media_ids: Optional[List[int]] = None


class TVSegmentUpdate(BaseModel):
    """Schema for updating a TV segment."""
    title: Optional[str] = None
    banner_text: Optional[str] = None
    ticker_text: Optional[str] = None
    script: Optional[str] = None
    scheduled_start: Optional[datetime] = None
    scheduled_end: Optional[datetime] = None
    status: Optional[TVSegmentStatus] = None


class TVSegmentResponse(TVSegmentBase):
    """Schema for TV segment response."""
    id: int
    channel_id: int
    status: TVSegmentStatus
    inject_id: Optional[int]
    created_by: Optional[int]
    created_at: datetime
    actual_start: Optional[datetime]
    actual_end: Optional[datetime]
    
    model_config = {"from_attributes": True}


class TVPlaylistItemBase(BaseModel):
    """Base playlist item schema."""
    item_type: str  # segment, video_inject, flash
    title: Optional[str] = None
    media_id: Optional[int] = None
    ref_id: Optional[int] = None
    banner_text: Optional[str] = None
    ticker_items: Optional[List[TickerItem]] = None
    play_mode: str = "once"
    takeover: bool = False
    planned_at: Optional[datetime] = None


class TVPlaylistItemCreate(TVPlaylistItemBase):
    """Schema for creating a playlist item."""
    channel_id: int


class TVPlaylistItemResponse(TVPlaylistItemBase):
    """Schema for playlist item response."""
    id: int
    channel_id: int
    exercise_id: int
    position: int
    status: PlaylistItemStatus
    created_at: datetime
    updated_at: datetime
    
    model_config = {"from_attributes": True}


class TVChannelResponse(BaseModel):
    """Schema for TV channel response."""
    id: int
    exercise_id: int
    name: str
    logo_url: Optional[str]
    is_active: bool
    created_at: datetime
    
    model_config = {"from_attributes": True}


class BannerUpdate(BaseModel):
    """Schema for updating banner."""
    text: Optional[str] = None


class TickerUpdate(BaseModel):
    """Schema for updating ticker."""
    op: str  # add, remove, clear
    item: Optional[TickerItem] = None
    index: Optional[int] = None


class ControlCommand(BaseModel):
    """Schema for control commands."""
    action: str  # start, stop, pause, resume, skip
    target_id: Optional[int] = None  # segment_id or playlist_item_id


# Helper functions
async def get_or_create_live_state(channel_id: int, db: AsyncSession) -> TVLiveState:
    """Get or create live state for a channel."""
    result = await db.execute(
        select(TVLiveState).where(TVLiveState.channel_id == channel_id)
    )
    live_state = result.scalar_one_or_none()
    
    if not live_state:
        live_state = TVLiveState(channel_id=channel_id)
        db.add(live_state)
        await db.flush()
    
    return live_state


async def _get_exercise_in_tenant_or_404(
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


async def _get_channel_in_tenant_or_404(
    db: AsyncSession,
    channel_id: int,
    tenant_id: int,
    *,
    exercise_id: int | None = None,
) -> TVChannel:
    query = (
        select(TVChannel)
        .join(Exercise, Exercise.id == TVChannel.exercise_id)
        .where(
            TVChannel.id == channel_id,
            Exercise.tenant_id == tenant_id,
        )
    )
    if exercise_id is not None:
        query = query.where(TVChannel.exercise_id == exercise_id)
    result = await db.execute(query)
    channel = result.scalar_one_or_none()
    if not channel:
        raise HTTPException(status_code=404, detail="TV channel not found")
    return channel


async def _get_active_channel_for_exercise_or_404(
    db: AsyncSession,
    exercise_id: int,
    tenant_id: int,
) -> TVChannel:
    result = await db.execute(
        select(TVChannel)
        .join(Exercise, Exercise.id == TVChannel.exercise_id)
        .where(
            TVChannel.exercise_id == exercise_id,
            TVChannel.is_active == True,  # noqa: E712
            Exercise.tenant_id == tenant_id,
        )
        .limit(1)
    )
    channel = result.scalar_one_or_none()
    if not channel:
        raise HTTPException(status_code=404, detail="No active channel found")
    return channel


async def _get_segment_in_tenant_or_404(
    db: AsyncSession,
    segment_id: int,
    tenant_id: int,
) -> TVSegment:
    result = await db.execute(
        select(TVSegment)
        .join(TVChannel, TVChannel.id == TVSegment.channel_id)
        .join(Exercise, Exercise.id == TVChannel.exercise_id)
        .where(
            TVSegment.id == segment_id,
            Exercise.tenant_id == tenant_id,
        )
    )
    segment = result.scalar_one_or_none()
    if not segment:
        raise HTTPException(status_code=404, detail="Segment not found")
    return segment


async def _get_playlist_item_in_tenant_or_404(
    db: AsyncSession,
    item_id: int,
    tenant_id: int,
) -> TVPlaylistItem:
    result = await db.execute(
        select(TVPlaylistItem)
        .join(Exercise, Exercise.id == TVPlaylistItem.exercise_id)
        .where(
            TVPlaylistItem.id == item_id,
            Exercise.tenant_id == tenant_id,
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Playlist item not found")
    return item


async def _ensure_media_in_tenant(
    db: AsyncSession,
    media_id: int,
    tenant_id: int,
) -> None:
    result = await db.execute(
        select(Media.id).where(
            Media.id == media_id,
            Media.tenant_id == tenant_id,
        )
    )
    if result.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="Media not found")


# TV Channel endpoints
@router.get("/channels/{exercise_id}", response_model=List[TVChannelResponse])
async def list_channels(
    exercise_id: int,
    current_user = Depends(require_auth),
    tenant_ctx: TenantRequestContext = Depends(require_tenant_context),
    db: AsyncSession = Depends(get_db_session),
):
    """List TV channels for an exercise."""
    await _get_exercise_in_tenant_or_404(db, exercise_id, tenant_ctx.tenant.id)
    result = await db.execute(
        select(TVChannel).where(TVChannel.exercise_id == exercise_id)
    )
    channels = result.scalars().all()
    return [TVChannelResponse.model_validate(c) for c in channels]


@router.post("/channels", response_model=TVChannelResponse, status_code=201)
async def create_channel(
    exercise_id: int,
    name: str,
    logo_url: Optional[str] = None,
    current_user = Depends(require_role(UserRole.ADMIN, UserRole.ANIMATEUR)),
    tenant_ctx: TenantRequestContext = Depends(require_tenant_context),
    db: AsyncSession = Depends(get_db_session),
):
    """Create a TV channel for an exercise."""
    await _get_exercise_in_tenant_or_404(db, exercise_id, tenant_ctx.tenant.id)
    channel = TVChannel(
        exercise_id=exercise_id,
        name=name,
        logo_url=logo_url,
    )
    db.add(channel)
    await db.flush()
    
    # Create live state for the channel
    live_state = TVLiveState(channel_id=channel.id)
    db.add(live_state)
    
    await db.commit()
    await db.refresh(channel)
    
    return TVChannelResponse.model_validate(channel)


# TV Live State endpoints
@router.get("/{exercise_id}/live", response_model=TVLiveStateResponse)
async def get_live_state(
    exercise_id: int,
    channel_id: Optional[int] = None,
    current_user = Depends(require_auth),
    tenant_ctx: TenantRequestContext = Depends(require_tenant_context),
    db: AsyncSession = Depends(get_db_session),
):
    """Get current live state for TV channel(s)."""
    await _get_exercise_in_tenant_or_404(db, exercise_id, tenant_ctx.tenant.id)
    # Get first active channel if not specified
    if not channel_id:
        channel = await _get_active_channel_for_exercise_or_404(db, exercise_id, tenant_ctx.tenant.id)
        channel_id = channel.id
    else:
        await _get_channel_in_tenant_or_404(db, channel_id, tenant_ctx.tenant.id, exercise_id=exercise_id)
    
    live_state = await get_or_create_live_state(channel_id, db)
    
    # Convert ticker_items from list to list of TickerItem
    ticker_items = []
    if live_state.ticker_items:
        for item in live_state.ticker_items:
            if isinstance(item, dict):
                ticker_items.append(TickerItem(**item))
            else:
                ticker_items.append(item)
    
    return TVLiveStateResponse(
        channel_id=live_state.channel_id,
        status=live_state.status,
        on_air_type=live_state.on_air_type,
        on_air_id=live_state.on_air_id,
        on_air_media_id=live_state.on_air_media_id,
        started_at=live_state.started_at,
        banner_text=live_state.banner_text,
        ticker_items=ticker_items,
        version=live_state.version,
    )


@router.post("/{exercise_id}/live/banner")
async def update_banner(
    exercise_id: int,
    banner: BannerUpdate,
    channel_id: Optional[int] = None,
    current_user = Depends(require_role(UserRole.ADMIN, UserRole.ANIMATEUR)),
    tenant_ctx: TenantRequestContext = Depends(require_tenant_context),
    db: AsyncSession = Depends(get_db_session),
):
    """Update the banner text on live TV."""
    await _get_exercise_in_tenant_or_404(db, exercise_id, tenant_ctx.tenant.id)
    if not channel_id:
        channel = await _get_active_channel_for_exercise_or_404(db, exercise_id, tenant_ctx.tenant.id)
        channel_id = channel.id
    else:
        await _get_channel_in_tenant_or_404(db, channel_id, tenant_ctx.tenant.id, exercise_id=exercise_id)
    
    live_state = await get_or_create_live_state(channel_id, db)
    live_state.banner_text = banner.text
    live_state.version += 1
    live_state.updated_at = datetime.now(timezone.utc)
    
    await db.commit()
    
    return {"message": "Banner updated", "banner_text": banner.text}


@router.post("/{exercise_id}/live/ticker")
async def update_ticker(
    exercise_id: int,
    ticker: TickerUpdate,
    channel_id: Optional[int] = None,
    current_user = Depends(require_role(UserRole.ADMIN, UserRole.ANIMATEUR)),
    tenant_ctx: TenantRequestContext = Depends(require_tenant_context),
    db: AsyncSession = Depends(get_db_session),
):
    """Update the ticker items on live TV."""
    await _get_exercise_in_tenant_or_404(db, exercise_id, tenant_ctx.tenant.id)
    if not channel_id:
        channel = await _get_active_channel_for_exercise_or_404(db, exercise_id, tenant_ctx.tenant.id)
        channel_id = channel.id
    else:
        await _get_channel_in_tenant_or_404(db, channel_id, tenant_ctx.tenant.id, exercise_id=exercise_id)
    
    live_state = await get_or_create_live_state(channel_id, db)
    
    current_items = list(live_state.ticker_items or [])
    
    if ticker.op == "clear":
        current_items = []
    elif ticker.op == "add" and ticker.item:
        current_items.append(ticker.item.model_dump())
    elif ticker.op == "remove":
        if ticker.index is not None and 0 <= ticker.index < len(current_items):
            current_items.pop(ticker.index)
    
    live_state.ticker_items = current_items
    live_state.version += 1
    live_state.updated_at = datetime.now(timezone.utc)
    
    await db.commit()
    
    return {"message": "Ticker updated", "ticker_items": current_items}


@router.post("/{exercise_id}/live/control")
async def control_live(
    exercise_id: int,
    command: ControlCommand,
    channel_id: Optional[int] = None,
    current_user = Depends(require_role(UserRole.ADMIN, UserRole.ANIMATEUR)),
    tenant_ctx: TenantRequestContext = Depends(require_tenant_context),
    db: AsyncSession = Depends(get_db_session),
):
    """Control the live TV stream (start, stop, pause, resume, skip)."""
    await _get_exercise_in_tenant_or_404(db, exercise_id, tenant_ctx.tenant.id)
    if not channel_id:
        channel = await _get_active_channel_for_exercise_or_404(db, exercise_id, tenant_ctx.tenant.id)
        channel_id = channel.id
    else:
        await _get_channel_in_tenant_or_404(db, channel_id, tenant_ctx.tenant.id, exercise_id=exercise_id)
    
    live_state = await get_or_create_live_state(channel_id, db)
    
    if command.action == "start":
        if command.target_id:
            # Start a specific playlist item or segment
            playlist_result = await db.execute(
                select(TVPlaylistItem).where(
                    TVPlaylistItem.id == command.target_id,
                    TVPlaylistItem.channel_id == channel_id,
                    TVPlaylistItem.exercise_id == exercise_id,
                )
            )
            playlist_item = playlist_result.scalar_one_or_none()
            
            if playlist_item:
                live_state.on_air_type = playlist_item.item_type
                live_state.on_air_id = playlist_item.id
                live_state.on_air_media_id = playlist_item.media_id
                playlist_item.status = PlaylistItemStatus.ON_AIR
        else:
            # Start next item in playlist
            next_result = await db.execute(
                select(TVPlaylistItem).where(
                    TVPlaylistItem.channel_id == channel_id,
                    TVPlaylistItem.status == PlaylistItemStatus.QUEUED
                ).order_by(TVPlaylistItem.position)
            )
            next_item = next_result.scalar_one_or_none()
            
            if next_item:
                live_state.on_air_type = next_item.item_type
                live_state.on_air_id = next_item.id
                live_state.on_air_media_id = next_item.media_id
                next_item.status = PlaylistItemStatus.ON_AIR
        
        live_state.status = TVLiveStatus.PLAYING
        live_state.started_at = datetime.now(timezone.utc)
    
    elif command.action == "stop":
        # Mark current item as done
        if live_state.on_air_id:
            current_item_result = await db.execute(
                select(TVPlaylistItem).where(
                    TVPlaylistItem.id == live_state.on_air_id,
                    TVPlaylistItem.channel_id == channel_id,
                )
            )
            current_item = current_item_result.scalar_one_or_none()
            if current_item:
                current_item.status = PlaylistItemStatus.DONE
        
        live_state.status = TVLiveStatus.IDLE
        live_state.on_air_type = None
        live_state.on_air_id = None
        live_state.on_air_media_id = None
        live_state.started_at = None
    
    elif command.action == "pause":
        if live_state.status == TVLiveStatus.PLAYING:
            live_state.status = TVLiveStatus.PAUSED
    
    elif command.action == "resume":
        if live_state.status == TVLiveStatus.PAUSED:
            live_state.status = TVLiveStatus.PLAYING
    
    elif command.action == "skip":
        # Skip current and move to next
        if live_state.on_air_id:
            # Mark current as skipped
            pass
        
        # Get next item
        next_result = await db.execute(
            select(TVPlaylistItem).where(
                TVPlaylistItem.channel_id == channel_id,
                TVPlaylistItem.status == PlaylistItemStatus.QUEUED
            ).order_by(TVPlaylistItem.position)
        )
        next_item = next_result.scalar_one_or_none()
        
        if next_item:
            live_state.on_air_type = next_item.item_type
            live_state.on_air_id = next_item.id
            live_state.on_air_media_id = next_item.media_id
            next_item.status = PlaylistItemStatus.ON_AIR
            live_state.started_at = datetime.now(timezone.utc)
        else:
            live_state.status = TVLiveStatus.IDLE
            live_state.on_air_type = None
            live_state.on_air_id = None
            live_state.on_air_media_id = None
    
    live_state.version += 1
    live_state.updated_at = datetime.now(timezone.utc)
    
    await db.commit()
    
    return {"message": f"Command '{command.action}' executed", "status": live_state.status.value}


# TV Segments endpoints
@router.get("/{exercise_id}/segments", response_model=List[TVSegmentResponse])
async def list_segments(
    exercise_id: int,
    channel_id: Optional[int] = None,
    status: Optional[TVSegmentStatus] = None,
    current_user = Depends(require_auth),
    tenant_ctx: TenantRequestContext = Depends(require_tenant_context),
    db: AsyncSession = Depends(get_db_session),
):
    """List TV segments for an exercise."""
    await _get_exercise_in_tenant_or_404(db, exercise_id, tenant_ctx.tenant.id)
    if channel_id is not None:
        await _get_channel_in_tenant_or_404(db, channel_id, tenant_ctx.tenant.id, exercise_id=exercise_id)
    query = select(TVSegment).join(TVChannel).where(TVChannel.exercise_id == exercise_id)
    
    if channel_id:
        query = query.where(TVSegment.channel_id == channel_id)
    if status:
        query = query.where(TVSegment.status == status)
    
    query = query.order_by(TVSegment.created_at.desc())
    
    result = await db.execute(query)
    segments = result.scalars().all()
    
    return [TVSegmentResponse.model_validate(s) for s in segments]


@router.post("/segments", response_model=TVSegmentResponse, status_code=201)
async def create_segment(
    segment_data: TVSegmentCreate,
    current_user = Depends(require_role(UserRole.ADMIN, UserRole.ANIMATEUR)),
    tenant_ctx: TenantRequestContext = Depends(require_tenant_context),
    db: AsyncSession = Depends(get_db_session),
):
    """Create a TV segment."""
    channel = await _get_channel_in_tenant_or_404(db, segment_data.channel_id, tenant_ctx.tenant.id)
    segment = TVSegment(
        channel_id=segment_data.channel_id,
        segment_type=segment_data.segment_type,
        title=segment_data.title,
        banner_text=segment_data.banner_text,
        ticker_text=segment_data.ticker_text,
        script=segment_data.script,
        scheduled_start=segment_data.scheduled_start,
        scheduled_end=segment_data.scheduled_end,
        created_by=current_user.id,
    )
    db.add(segment)
    await db.flush()
    
    # Add media attachments if provided
    if segment_data.media_ids:
        from app.models import TVSegmentMedia
        for idx, media_id in enumerate(segment_data.media_ids):
            await _ensure_media_in_tenant(db, media_id, tenant_ctx.tenant.id)
            segment_media = TVSegmentMedia(
                segment_id=segment.id,
                media_id=media_id,
                display_order=idx,
            )
            db.add(segment_media)
    
    await db.commit()
    await db.refresh(segment)
    
    return TVSegmentResponse.model_validate(segment)


@router.post("/segments/{segment_id}/start")
async def start_segment(
    segment_id: int,
    current_user = Depends(require_role(UserRole.ADMIN, UserRole.ANIMATEUR)),
    tenant_ctx: TenantRequestContext = Depends(require_tenant_context),
    db: AsyncSession = Depends(get_db_session),
):
    """Start a TV segment (go live)."""
    segment = await _get_segment_in_tenant_or_404(db, segment_id, tenant_ctx.tenant.id)
    
    if segment.status == TVSegmentStatus.LIVE:
        raise HTTPException(status_code=400, detail="Segment is already live")
    
    # Update segment status
    segment.status = TVSegmentStatus.LIVE
    segment.actual_start = datetime.now(timezone.utc)
    
    # Update live state
    live_state = await get_or_create_live_state(segment.channel_id, db)
    live_state.on_air_type = "segment"
    live_state.on_air_id = segment.id
    live_state.status = TVLiveStatus.PLAYING
    live_state.started_at = segment.actual_start
    live_state.version += 1
    
    if segment.banner_text:
        live_state.banner_text = segment.banner_text
    
    await db.commit()
    
    return {"message": "Segment started", "segment_id": segment_id}


@router.post("/segments/{segment_id}/end")
async def end_segment(
    segment_id: int,
    current_user = Depends(require_role(UserRole.ADMIN, UserRole.ANIMATEUR)),
    tenant_ctx: TenantRequestContext = Depends(require_tenant_context),
    db: AsyncSession = Depends(get_db_session),
):
    """End a TV segment."""
    segment = await _get_segment_in_tenant_or_404(db, segment_id, tenant_ctx.tenant.id)
    
    if segment.status != TVSegmentStatus.LIVE:
        raise HTTPException(status_code=400, detail="Segment is not live")
    
    # Update segment status
    segment.status = TVSegmentStatus.ENDED
    segment.actual_end = datetime.now(timezone.utc)
    
    # Update live state
    live_state = await get_or_create_live_state(segment.channel_id, db)
    live_state.on_air_type = None
    live_state.on_air_id = None
    live_state.status = TVLiveStatus.IDLE
    live_state.version += 1
    
    await db.commit()
    
    return {"message": "Segment ended", "segment_id": segment_id}


# TV Playlist endpoints
@router.get("/{exercise_id}/playlist", response_model=List[TVPlaylistItemResponse])
async def get_playlist(
    exercise_id: int,
    channel_id: Optional[int] = None,
    current_user = Depends(require_auth),
    tenant_ctx: TenantRequestContext = Depends(require_tenant_context),
    db: AsyncSession = Depends(get_db_session),
):
    """Get playlist for a channel."""
    await _get_exercise_in_tenant_or_404(db, exercise_id, tenant_ctx.tenant.id)
    if not channel_id:
        try:
            channel = await _get_active_channel_for_exercise_or_404(db, exercise_id, tenant_ctx.tenant.id)
        except HTTPException:
            return []
        channel_id = channel.id
    else:
        await _get_channel_in_tenant_or_404(db, channel_id, tenant_ctx.tenant.id, exercise_id=exercise_id)
    
    result = await db.execute(
        select(TVPlaylistItem).where(
            TVPlaylistItem.channel_id == channel_id,
            TVPlaylistItem.exercise_id == exercise_id
        ).order_by(TVPlaylistItem.position)
    )
    items = result.scalars().all()
    
    return [TVPlaylistItemResponse.model_validate(i) for i in items]


@router.post("/{exercise_id}/playlist", response_model=TVPlaylistItemResponse, status_code=201)
async def add_to_playlist(
    exercise_id: int,
    item_data: TVPlaylistItemCreate,
    current_user = Depends(require_role(UserRole.ADMIN, UserRole.ANIMATEUR)),
    tenant_ctx: TenantRequestContext = Depends(require_tenant_context),
    db: AsyncSession = Depends(get_db_session),
):
    """Add item to playlist."""
    await _get_exercise_in_tenant_or_404(db, exercise_id, tenant_ctx.tenant.id)
    await _get_channel_in_tenant_or_404(db, item_data.channel_id, tenant_ctx.tenant.id, exercise_id=exercise_id)
    if item_data.media_id is not None:
        await _ensure_media_in_tenant(db, item_data.media_id, tenant_ctx.tenant.id)

    # Get max position
    result = await db.execute(
        select(func.max(TVPlaylistItem.position)).where(
            TVPlaylistItem.channel_id == item_data.channel_id
        )
    )
    max_position = result.scalar() or 0
    
    playlist_item = TVPlaylistItem(
        channel_id=item_data.channel_id,
        exercise_id=exercise_id,
        item_type=item_data.item_type,
        ref_id=item_data.ref_id,
        media_id=item_data.media_id,
        title=item_data.title,
        banner_text=item_data.banner_text,
        ticker_items=[t.model_dump() for t in item_data.ticker_items] if item_data.ticker_items else None,
        play_mode=item_data.play_mode,
        takeover=item_data.takeover,
        planned_at=item_data.planned_at,
        position=max_position + 1,
    )
    db.add(playlist_item)
    await db.commit()
    await db.refresh(playlist_item)
    
    return TVPlaylistItemResponse.model_validate(playlist_item)


@router.patch("/{exercise_id}/playlist/reorder")
async def reorder_playlist(
    exercise_id: int,
    item_ids: List[int],
    channel_id: int = Query(...),
    current_user = Depends(require_role(UserRole.ADMIN, UserRole.ANIMATEUR)),
    tenant_ctx: TenantRequestContext = Depends(require_tenant_context),
    db: AsyncSession = Depends(get_db_session),
):
    """Reorder playlist items."""
    await _get_exercise_in_tenant_or_404(db, exercise_id, tenant_ctx.tenant.id)
    await _get_channel_in_tenant_or_404(db, channel_id, tenant_ctx.tenant.id, exercise_id=exercise_id)
    for position, item_id in enumerate(item_ids):
        result = await db.execute(
            select(TVPlaylistItem).where(
                TVPlaylistItem.id == item_id,
                TVPlaylistItem.channel_id == channel_id,
                TVPlaylistItem.exercise_id == exercise_id
            )
        )
        item = result.scalar_one_or_none()
        if item:
            item.position = position
    
    await db.commit()
    
    return {"message": "Playlist reordered"}


@router.delete("/playlist/{item_id}")
async def remove_from_playlist(
    item_id: int,
    current_user = Depends(require_role(UserRole.ADMIN, UserRole.ANIMATEUR)),
    tenant_ctx: TenantRequestContext = Depends(require_tenant_context),
    db: AsyncSession = Depends(get_db_session),
):
    """Remove item from playlist."""
    item = await _get_playlist_item_in_tenant_or_404(db, item_id, tenant_ctx.tenant.id)
    
    await db.delete(item)
    await db.commit()
    
    return {"message": "Item removed from playlist"}
