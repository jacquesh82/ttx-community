"""TV live-broadcast simulation router.

Provides a simulated TV news channel experience within a CrisisLab exercise.
Animateurs manage channels, segments (flash info, breaking news, interviews),
playlists, banners, and scrolling tickers that participants see in real time
on the TV Live player view.
"""
from datetime import datetime, timezone
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field
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
    """A single scrolling ticker line displayed at the bottom of the simulated TV screen."""
    text: str = Field(
        description="Ticker text displayed in the crawl.",
        examples=["Duval Industries — production à l'arrêt suite à une cyberattaque"],
    )
    priority: str = Field(
        default="normal",
        description="Visual priority: low, normal, high, urgent.",
        examples=["urgent"],
    )

    model_config = {"json_schema_extra": {
        "example": {
            "text": "ANSSI saisie de l'incident Duval Industries",
            "priority": "high",
        }
    }}


class TVLiveStateResponse(BaseModel):
    """Current on-air state of a simulated TV channel in CrisisLab."""
    channel_id: int = Field(description="Channel this state belongs to.", examples=[1])
    status: TVLiveStatus = Field(description="Current broadcast status (idle, playing, paused).")
    on_air_type: Optional[str] = Field(description="Type of content currently on air (segment, video_inject, flash).", examples=["segment"])
    on_air_id: Optional[int] = Field(description="Database ID of the on-air playlist item or segment.", examples=[5])
    on_air_media_id: Optional[int] = Field(description="Media asset ID currently being played.")
    started_at: Optional[datetime] = Field(description="Timestamp when the current content started playing.")
    banner_text: Optional[str] = Field(
        description="Breaking-news banner overlaid on the broadcast.",
        examples=["URGENT — Cyberattaque massive chez Duval Industries"],
    )
    ticker_items: List[TickerItem] = Field(description="Scrolling ticker items currently displayed.")
    version: int = Field(description="Optimistic-lock version counter.", examples=[7])

    model_config = {"from_attributes": True, "json_schema_extra": {
        "example": {
            "channel_id": 1,
            "status": "playing",
            "on_air_type": "segment",
            "on_air_id": 5,
            "on_air_media_id": None,
            "started_at": "2026-03-12T09:00:00Z",
            "banner_text": "URGENT — Cyberattaque massive chez Duval Industries",
            "ticker_items": [
                {"text": "Duval Industries — production à l'arrêt", "priority": "urgent"},
                {"text": "ANSSI saisie de l'incident", "priority": "high"},
            ],
            "version": 7,
        }
    }}


class TVSegmentBase(BaseModel):
    """Base fields for a TV broadcast segment in CrisisLab."""
    segment_type: TVSegmentType = Field(description="Segment format: flash, interview, report, etc.")
    title: Optional[str] = Field(
        default=None,
        description="Editorial title of the segment.",
        examples=["Flash info — Cyberattaque industrielle majeure"],
    )
    banner_text: Optional[str] = Field(
        default=None,
        description="Banner to display when this segment goes live.",
        examples=["URGENT — Cyberattaque massive chez Duval Industries"],
    )
    ticker_text: Optional[str] = Field(
        default=None,
        description="Ticker text to add when this segment goes live.",
        examples=["Duval Industries — production à l'arrêt suite à une cyberattaque ransomware"],
    )
    script: Optional[str] = Field(
        default=None,
        description="Full presenter script / teleprompter text.",
    )
    scheduled_start: Optional[datetime] = Field(default=None, description="Planned start time.")
    scheduled_end: Optional[datetime] = Field(default=None, description="Planned end time.")


class TVSegmentCreate(TVSegmentBase):
    """Schema for creating a new TV segment in a CrisisLab exercise."""
    channel_id: int = Field(description="Target channel ID.", examples=[1])
    media_ids: Optional[List[int]] = Field(default=None, description="Media assets to attach (videos, images).")

    model_config = {"json_schema_extra": {
        "example": {
            "channel_id": 1,
            "segment_type": "flash",
            "title": "Flash info — Cyberattaque industrielle majeure",
            "banner_text": "URGENT — Cyberattaque massive chez Duval Industries",
            "ticker_text": "Duval Industries — production à l'arrêt",
            "script": "Mesdames, messieurs, bonsoir. Nous interrompons nos programmes pour un flash spécial...",
            "scheduled_start": "2026-03-12T09:00:00Z",
            "scheduled_end": "2026-03-12T09:05:00Z",
        }
    }}


class TVSegmentUpdate(BaseModel):
    """Schema for partially updating a TV segment."""
    title: Optional[str] = Field(default=None, description="Updated segment title.")
    banner_text: Optional[str] = Field(default=None, description="Updated banner text.")
    ticker_text: Optional[str] = Field(default=None, description="Updated ticker text.")
    script: Optional[str] = Field(default=None, description="Updated presenter script.")
    scheduled_start: Optional[datetime] = Field(default=None, description="New scheduled start.")
    scheduled_end: Optional[datetime] = Field(default=None, description="New scheduled end.")
    status: Optional[TVSegmentStatus] = Field(default=None, description="Force a status transition.")

    model_config = {"json_schema_extra": {
        "example": {
            "title": "Flash info MAJ — Rançon de 150 BTC exigée",
            "banner_text": "ALERTE — Demande de rançon de 150 BTC chez Duval Industries",
        }
    }}


class TVSegmentResponse(TVSegmentBase):
    """Full representation of a TV segment returned by the CrisisLab API."""
    id: int = Field(description="Unique database identifier.", examples=[5])
    channel_id: int = Field(description="Parent channel ID.", examples=[1])
    status: TVSegmentStatus = Field(description="Current segment status (draft, ready, live, ended).")
    inject_id: Optional[int] = Field(description="Linked inject ID, if the segment was created from an inject.")
    created_by: Optional[int] = Field(description="User ID who created the segment.")
    created_at: datetime = Field(description="Record creation timestamp.")
    actual_start: Optional[datetime] = Field(description="Actual on-air start time.")
    actual_end: Optional[datetime] = Field(description="Actual on-air end time.")

    model_config = {"from_attributes": True, "json_schema_extra": {
        "example": {
            "id": 5,
            "channel_id": 1,
            "segment_type": "flash",
            "title": "Flash info — Cyberattaque industrielle majeure",
            "banner_text": "URGENT — Cyberattaque massive chez Duval Industries",
            "ticker_text": "Duval Industries — production à l'arrêt",
            "script": "Mesdames, messieurs, bonsoir...",
            "scheduled_start": "2026-03-12T09:00:00Z",
            "scheduled_end": "2026-03-12T09:05:00Z",
            "status": "live",
            "inject_id": None,
            "created_by": 3,
            "created_at": "2026-03-12T08:45:00Z",
            "actual_start": "2026-03-12T09:00:12Z",
            "actual_end": None,
        }
    }}


class TVPlaylistItemBase(BaseModel):
    """Base fields for a TV playlist entry in CrisisLab."""
    item_type: str = Field(
        description="Content type: segment, video_inject, or flash.",
        examples=["segment"],
    )
    title: Optional[str] = Field(
        default=None,
        description="Display title in the playlist queue.",
        examples=["Flash info — Cyberattaque industrielle majeure"],
    )
    media_id: Optional[int] = Field(default=None, description="Pre-recorded media asset to play.")
    ref_id: Optional[int] = Field(default=None, description="Reference ID of the linked segment or inject.")
    banner_text: Optional[str] = Field(
        default=None,
        description="Banner to display when this item plays.",
        examples=["URGENT — Cyberattaque massive chez Duval Industries"],
    )
    ticker_items: Optional[List[TickerItem]] = Field(default=None, description="Ticker items to display when this item plays.")
    play_mode: str = Field(default="once", description="Playback mode: once or loop.", examples=["once"])
    takeover: bool = Field(default=False, description="If true, interrupts current playback immediately.")
    planned_at: Optional[datetime] = Field(default=None, description="Scheduled playback time.")


class TVPlaylistItemCreate(TVPlaylistItemBase):
    """Schema for adding a new item to the TV playlist."""
    channel_id: int = Field(description="Target channel ID.", examples=[1])

    model_config = {"json_schema_extra": {
        "example": {
            "channel_id": 1,
            "item_type": "flash",
            "title": "Flash info — Cyberattaque industrielle majeure",
            "banner_text": "URGENT — Cyberattaque massive chez Duval Industries",
            "ticker_items": [
                {"text": "Duval Industries — production à l'arrêt", "priority": "urgent"},
            ],
            "play_mode": "once",
            "takeover": True,
            "planned_at": "2026-03-12T09:00:00Z",
        }
    }}


class TVPlaylistItemResponse(TVPlaylistItemBase):
    """Full representation of a TV playlist item returned by the CrisisLab API."""
    id: int = Field(description="Unique database identifier.", examples=[10])
    channel_id: int = Field(description="Parent channel ID.", examples=[1])
    exercise_id: int = Field(description="Parent exercise ID.", examples=[1])
    position: int = Field(description="Order in the playlist (0-based).", examples=[0])
    status: PlaylistItemStatus = Field(description="Item status: queued, on_air, done, skipped.")
    created_at: datetime = Field(description="Record creation timestamp.")
    updated_at: datetime = Field(description="Last modification timestamp.")

    model_config = {"from_attributes": True}


class TVChannelResponse(BaseModel):
    """Full representation of a simulated TV channel in CrisisLab."""
    id: int = Field(description="Unique database identifier.", examples=[1])
    exercise_id: int = Field(description="Parent exercise ID.", examples=[1])
    name: str = Field(description="Channel display name.", examples=["BFM Business"])
    logo_url: Optional[str] = Field(description="URL to the channel logo.", examples=["https://example.com/logos/bfm.png"])
    is_active: bool = Field(description="Whether this channel is the active broadcast channel.", examples=[True])
    created_at: datetime = Field(description="Record creation timestamp.")

    model_config = {"from_attributes": True, "json_schema_extra": {
        "example": {
            "id": 1,
            "exercise_id": 1,
            "name": "BFM Business",
            "logo_url": "https://example.com/logos/bfm.png",
            "is_active": True,
            "created_at": "2026-03-12T07:00:00Z",
        }
    }}


class BannerUpdate(BaseModel):
    """Payload for updating the breaking-news banner on the simulated TV broadcast."""
    text: Optional[str] = Field(
        default=None,
        description="Banner text to display. Set to null to clear the banner.",
        examples=["URGENT — Cyberattaque massive chez Duval Industries"],
    )

    model_config = {"json_schema_extra": {
        "example": {
            "text": "URGENT — Cyberattaque massive chez Duval Industries",
        }
    }}


class TickerUpdate(BaseModel):
    """Payload for modifying the scrolling ticker on the simulated TV broadcast."""
    op: str = Field(
        description="Operation: add (append item), remove (by index), or clear (remove all).",
        examples=["add"],
    )
    item: Optional[TickerItem] = Field(
        default=None,
        description="Ticker item to add (required when op='add').",
    )
    index: Optional[int] = Field(
        default=None,
        description="Index of the item to remove (required when op='remove').",
        examples=[0],
    )

    model_config = {"json_schema_extra": {
        "example": {
            "op": "add",
            "item": {"text": "ANSSI saisie de l'incident Duval Industries", "priority": "high"},
        }
    }}


class ControlCommand(BaseModel):
    """Command payload for controlling the live TV broadcast in CrisisLab."""
    action: str = Field(
        description="Broadcast action: start, stop, pause, resume, or skip.",
        examples=["start"],
    )
    target_id: Optional[int] = Field(
        default=None,
        description="ID of a specific playlist item or segment to start (optional for start, ignored for other actions).",
        examples=[10],
    )

    model_config = {"json_schema_extra": {
        "example": {
            "action": "start",
            "target_id": 10,
        }
    }}


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
    """List all simulated TV channels configured for a CrisisLab exercise."""
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
    """Create a new simulated TV channel (e.g. BFM Business, CNEWS) for a CrisisLab exercise.

    A live-state record is automatically initialised for the new channel.
    """
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
    """Get the current on-air state of a simulated TV channel.

    If no `channel_id` is provided, the first active channel for the exercise
    is used. The response includes the current banner, ticker items, and
    what content is currently playing.
    """
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
    """Update the breaking-news banner displayed on the simulated TV broadcast.

    Set `text` to null to clear the banner. The live-state version counter is
    incremented so connected clients can detect changes via polling or WebSocket.
    """
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
    """Modify the scrolling ticker on the simulated TV broadcast.

    Supports three operations:
    - **add**: append a new ticker item
    - **remove**: remove the item at the given index
    - **clear**: remove all ticker items
    """
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
    """Send a control command to the live TV broadcast.

    Supported actions:
    - **start**: begin playing a specific playlist item (by `target_id`) or the next queued item
    - **stop**: end the current broadcast and return to idle
    - **pause** / **resume**: toggle playback
    - **skip**: skip the current item and advance to the next queued item
    """
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
    """List TV segments for a CrisisLab exercise, optionally filtered by channel and/or status."""
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
    """Create a new TV segment (flash info, interview, report, etc.) for a CrisisLab channel."""
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
    """Take a TV segment live on its channel.

    Sets the segment status to LIVE, updates the channel live-state, and applies
    the segment's banner text if present. Returns 400 if the segment is already live.
    """
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
    """End a live TV segment and return the channel to idle.

    Records the actual end timestamp. Returns 400 if the segment is not currently live.
    """
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
    """Get the ordered playlist for a CrisisLab TV channel.

    If no `channel_id` is provided, the first active channel for the exercise is used.
    Returns an empty list if no active channel exists.
    """
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
    """Append a new item to the end of a CrisisLab TV channel playlist.

    The item is automatically assigned the next position. Use the `takeover` flag
    to interrupt current playback when this item is started.
    """
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
    """Reorder playlist items by providing the full list of item IDs in the desired order."""
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
    """Remove an item from the TV playlist permanently."""
    item = await _get_playlist_item_in_tenant_or_404(db, item_id, tenant_ctx.tenant.id)
    
    await db.delete(item)
    await db.commit()
    
    return {"message": "Item removed from playlist"}
