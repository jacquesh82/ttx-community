"""
Webmail router — CrisisLab simulated email system.

Provides a full webmail experience within a crisis exercise: threaded
conversations, per-user read receipts, and inject-driven messages sent by
the animation team.  Every message belongs to one conversation which is
scoped to a single exercise.
"""
from typing import Annotated
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db_session as get_db
from app.models.user import User, UserRole
from app.models.exercise import Exercise, ExerciseStatus
from app.models.webmail import Conversation, ConversationParticipant, Message, ReadReceipt, AuthorType
from app.models.inject import Inject
from app.models.event import Event, EventType, EventActorType
from app.routers.auth import get_current_user, require_role
from app.utils.tenancy import current_tenant_id_var

router = APIRouter(prefix="/webmail", tags=["webmail (CrisisLab simulated email)"])


async def _get_exercise_or_404(db: AsyncSession, exercise_id: int) -> Exercise:
    query = select(Exercise).where(Exercise.id == exercise_id)
    tenant_id = current_tenant_id_var.get()
    if tenant_id is not None:
        query = query.where(Exercise.tenant_id == tenant_id)
    result = await db.execute(query)
    exercise = result.scalar_one_or_none()
    if not exercise:
        raise HTTPException(status_code=404, detail="Exercise not found")
    return exercise


async def _get_conversation_or_404(db: AsyncSession, conversation_id: int) -> Conversation:
    result = await db.execute(
        select(Conversation)
        .join(Exercise, Exercise.id == Conversation.exercise_id)
        .where(
            Conversation.id == conversation_id,
            *( [Exercise.tenant_id == current_tenant_id_var.get()] if current_tenant_id_var.get() is not None else [] ),
        )
    )
    conversation = result.scalar_one_or_none()
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return conversation


async def _get_message_or_404(db: AsyncSession, message_id: int) -> Message:
    result = await db.execute(
        select(Message)
        .join(Conversation, Conversation.id == Message.conversation_id)
        .join(Exercise, Exercise.id == Conversation.exercise_id)
        .where(
            Message.id == message_id,
            *( [Exercise.tenant_id == current_tenant_id_var.get()] if current_tenant_id_var.get() is not None else [] ),
        )
    )
    message = result.scalar_one_or_none()
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")
    return message


# === Schemas ===
from pydantic import BaseModel, Field
from typing import List


class ParticipantSchema(BaseModel):
    """A participant in a webmail conversation (sender, recipient, or CC)."""

    id: int | None = Field(default=None, description="Internal participant ID (null for external actors)")
    type: str = Field(description="Participant type — 'user', 'actor', or 'team'", examples=["actor"])
    label: str | None = Field(default=None, description="Human-readable display name", examples=["soc@duval-industries.fr"])
    role: str = Field(description="Participant role in this conversation", examples=["to", "cc", "bcc", "from"])

    model_config = {
        "from_attributes": True,
        "json_schema_extra": {
            "example": {
                "id": 12,
                "type": "actor",
                "label": "rssi@duval-industries.fr",
                "role": "to",
            }
        },
    }


class MessageSchema(BaseModel):
    """A single email message within a threaded conversation."""

    id: int = Field(description="Unique message identifier")
    conversation_id: int = Field(description="Parent conversation ID")
    author_type: str = Field(description="Type of author — 'user', 'actor', or 'system'", examples=["user"])
    author_id: int | None = Field(default=None, description="User ID of the author (null for actors/system)")
    author_label: str | None = Field(default=None, description="Display name of the author", examples=["soc@duval-industries.fr"])
    subject: str | None = Field(default=None, description="Message subject line", examples=["URGENT \u2014 Rapport SOC : chiffrement de fichiers en cours"])
    body_text: str = Field(description="Plain-text message body")
    body_html: str | None = Field(default=None, description="HTML-formatted message body (optional)")
    created_at: datetime = Field(description="Timestamp when the message was created")
    is_read: bool = Field(default=False, description="Whether the current user has read this message")

    model_config = {
        "from_attributes": True,
        "json_schema_extra": {
            "example": {
                "id": 42,
                "conversation_id": 7,
                "author_type": "actor",
                "author_id": None,
                "author_label": "soc@duval-industries.fr",
                "subject": "URGENT \u2014 Rapport SOC : chiffrement de fichiers en cours",
                "body_text": (
                    "Bonjour,\n\n"
                    "Le SOC a d\u00e9tect\u00e9 une activit\u00e9 de chiffrement anormale sur les serveurs de fichiers "
                    "du site de Nantes. Plus de 2 000 fichiers ont \u00e9t\u00e9 renomm\u00e9s avec l\u2019extension .locked "
                    "en moins de 15 minutes. Le processus responsable est svchost_update.exe, "
                    "lanc\u00e9 depuis le compte de service srv-backup.\n\n"
                    "Actions imm\u00e9diates recommand\u00e9es :\n"
                    "1. Isoler le VLAN 10 (serveurs de fichiers)\n"
                    "2. D\u00e9sactiver le compte srv-backup\n"
                    "3. Capturer la m\u00e9moire du serveur NAS-01\n\n"
                    "Cordialement,\n\u00c9quipe SOC Duval Industries"
                ),
                "body_html": None,
                "created_at": "2024-11-15T09:32:00Z",
                "is_read": False,
            }
        }
    }


class ConversationSchema(BaseModel):
    """Summary view of a webmail conversation (used in inbox listing)."""

    id: int = Field(description="Unique conversation identifier")
    exercise_id: int = Field(description="Exercise this conversation belongs to")
    subject: str = Field(description="Conversation subject line", examples=["URGENT \u2014 Rapport SOC : chiffrement de fichiers en cours"])
    inject_id: int | None = Field(default=None, description="ID of the inject that triggered this conversation (null if user-initiated)")
    created_at: datetime = Field(description="Conversation creation timestamp")
    updated_at: datetime = Field(description="Last activity timestamp")
    message_count: int = Field(default=0, description="Total number of messages in the thread")
    unread_count: int = Field(default=0, description="Number of unread messages for the current user")
    last_message_at: datetime | None = Field(default=None, description="Timestamp of the most recent message")

    model_config = {
        "from_attributes": True,
        "json_schema_extra": {
            "example": {
                "id": 7,
                "exercise_id": 1,
                "subject": "URGENT \u2014 Rapport SOC : chiffrement de fichiers en cours",
                "inject_id": 15,
                "created_at": "2024-11-15T09:30:00Z",
                "updated_at": "2024-11-15T09:45:00Z",
                "message_count": 3,
                "unread_count": 1,
                "last_message_at": "2024-11-15T09:45:00Z",
            }
        }
    }


class ConversationDetailSchema(BaseModel):
    """Full conversation view including participants and all messages."""

    id: int = Field(description="Unique conversation identifier")
    exercise_id: int = Field(description="Exercise this conversation belongs to")
    subject: str = Field(description="Conversation subject line")
    inject_id: int | None = Field(default=None, description="ID of the triggering inject (null if user-initiated)")
    created_at: datetime = Field(description="Conversation creation timestamp")
    updated_at: datetime = Field(description="Last activity timestamp")
    participants: List[ParticipantSchema] = Field(description="All participants (to, cc, bcc, from)")
    messages: List[MessageSchema] = Field(description="Ordered list of messages in the thread")

    model_config = {"from_attributes": True}


class SendMessageSchema(BaseModel):
    """Payload for sending a message — either a reply to an existing conversation or a brand-new thread."""

    conversation_id: int | None = Field(default=None, description="Target conversation ID (omit to start a new thread)")
    exercise_id: int | None = Field(default=None, description="Required when creating a new conversation")
    subject: str | None = Field(default=None, description="Subject line (required for new conversations)", examples=["RE: Rapport SOC \u2014 mesures de confinement activ\u00e9es"])
    to_participants: List[str] = Field(default=[], description='Recipient list as "type:label" strings', examples=[["actor:rssi@duval-industries.fr", "team:Cellule Crise"]])
    body_text: str = Field(description="Plain-text message body", examples=["Le VLAN 10 a \u00e9t\u00e9 isol\u00e9. Compte srv-backup d\u00e9sactiv\u00e9. Capture m\u00e9moire en cours."])
    parent_message_id: int | None = Field(default=None, description="ID of the message being replied to (for threading)")

    model_config = {
        "json_schema_extra": {
            "example": {
                "conversation_id": 7,
                "exercise_id": None,
                "subject": None,
                "to_participants": [],
                "body_text": "Le VLAN 10 a \u00e9t\u00e9 isol\u00e9. Compte srv-backup d\u00e9sactiv\u00e9. Capture m\u00e9moire en cours sur NAS-01.",
                "parent_message_id": 42,
            }
        }
    }


class ConversationCreateSchema(BaseModel):
    """Payload for creating a new webmail conversation with an initial message."""

    exercise_id: int = Field(description="Exercise to create the conversation in")
    subject: str = Field(description="Conversation subject line", examples=["URGENT \u2014 Rapport SOC : chiffrement de fichiers en cours"])
    to_participants: List[str] = Field(default=[], description='Primary recipients as "type:label"', examples=[["actor:rssi@duval-industries.fr", "actor:dg@duval-industries.fr"]])
    cc_participants: List[str] = Field(default=[], description='CC recipients as "type:label"', examples=[["actor:dsi@duval-industries.fr"]])
    body_text: str = Field(description="Initial message body")

    model_config = {
        "json_schema_extra": {
            "example": {
                "exercise_id": 1,
                "subject": "URGENT \u2014 Rapport SOC : chiffrement de fichiers en cours",
                "to_participants": ["actor:rssi@duval-industries.fr", "actor:dg@duval-industries.fr"],
                "cc_participants": ["actor:dsi@duval-industries.fr"],
                "body_text": (
                    "Bonjour,\n\n"
                    "Le SOC a d\u00e9tect\u00e9 une activit\u00e9 de chiffrement anormale sur le site de Nantes. "
                    "Merci de rejoindre la cellule de crise imm\u00e9diatement.\n\n"
                    "Cordialement,\nsoc@duval-industries.fr"
                ),
            }
        }
    }


# === Routes ===

@router.get("/conversations")
async def list_conversations(
    exercise_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    unread_only: bool = False,
):
    """List webmail conversations for a CrisisLab exercise.

    Returns a paginated list of conversation summaries ordered by most recent
    activity.  Each summary includes unread count for the authenticated user.
    Use `unread_only=true` to filter conversations that have at least one
    unread message.
    """
    # Verify exercise exists and user has access
    await _get_exercise_or_404(db, exercise_id)
    
    # Build query
    query = (
        select(Conversation)
        .where(Conversation.exercise_id == exercise_id)
        .options(selectinload(Conversation.messages))
        .order_by(Conversation.updated_at.desc())
    )
    
    # Count total
    count_query = select(func.count(Conversation.id)).where(Conversation.exercise_id == exercise_id)
    total = await db.scalar(count_query)
    
    # Paginate
    offset = (page - 1) * page_size
    query = query.offset(offset).limit(page_size)
    
    result = await db.execute(query)
    conversations = result.scalars().all()
    
    # Build response with unread counts
    items = []
    for conv in conversations:
        # Count messages
        message_count = len(conv.messages)
        
        # Count unread for current user
        unread_count = 0
        last_message_at = None
        if conv.messages:
            for msg in conv.messages:
                if last_message_at is None or msg.created_at > last_message_at:
                    last_message_at = msg.created_at
                
                # Check if read
                read = await db.execute(
                    select(ReadReceipt).where(
                        ReadReceipt.message_id == msg.id,
                        ReadReceipt.user_id == current_user.id
                    )
                )
                if not read.scalar_one_or_none():
                    unread_count += 1
        
        if unread_only and unread_count == 0:
            continue
            
        items.append(ConversationSchema(
            id=conv.id,
            exercise_id=conv.exercise_id,
            subject=conv.subject,
            inject_id=conv.inject_id,
            created_at=conv.created_at,
            updated_at=conv.updated_at,
            message_count=message_count,
            unread_count=unread_count,
            last_message_at=last_message_at,
        ))
    
    return {
        "conversations": items,
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.get("/conversations/{conversation_id}")
async def get_conversation(
    conversation_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Retrieve a full conversation thread with all participants and messages.

    Returns the complete conversation including every message in chronological
    order and per-message read status for the authenticated user.
    """
    tenant_id = current_tenant_id_var.get()
    query = (
        select(Conversation)
        .options(
            selectinload(Conversation.participants),
            selectinload(Conversation.messages).selectinload(Message.read_receipts),
        )
        .join(Exercise, Exercise.id == Conversation.exercise_id)
        .where(Conversation.id == conversation_id)
    )
    if tenant_id is not None:
        query = query.where(Exercise.tenant_id == tenant_id)
    result = await db.execute(query)
    conversation = result.scalar_one_or_none()
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    
    # Build participants
    participants = [
        ParticipantSchema(
            id=p.participant_id,
            type=p.participant_type,
            label=p.participant_label,
            role=p.role,
        )
        for p in conversation.participants
    ]
    
    # Build messages with read status
    messages = []
    for msg in conversation.messages:
        is_read = any(r.user_id == current_user.id for r in msg.read_receipts)
        messages.append(MessageSchema(
            id=msg.id,
            conversation_id=msg.conversation_id,
            author_type=msg.author_type.value,
            author_id=msg.author_id,
            author_label=msg.author_label,
            subject=msg.subject,
            body_text=msg.body_text,
            body_html=msg.body_html,
            created_at=msg.created_at,
            is_read=is_read,
        ))
    
    return ConversationDetailSchema(
        id=conversation.id,
        exercise_id=conversation.exercise_id,
        subject=conversation.subject,
        inject_id=conversation.inject_id,
        created_at=conversation.created_at,
        updated_at=conversation.updated_at,
        participants=participants,
        messages=messages,
    )


@router.post("/conversations")
async def create_conversation(
    data: ConversationCreateSchema,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Create a new webmail conversation with an initial message.

    Starts a new email thread within the exercise.  Participants are specified
    as `type:label` strings (e.g. `actor:rssi@duval-industries.fr`).  The
    authenticated user is automatically added as the sender.
    """
    # Verify exercise exists
    await _get_exercise_or_404(db, data.exercise_id)
    
    # Create conversation
    conversation = Conversation(
        exercise_id=data.exercise_id,
        subject=data.subject,
    )
    db.add(conversation)
    await db.flush()
    
    # Add participants
    for p in data.to_participants:
        parts = p.split(":", 1)
        participant = ConversationParticipant(
            conversation_id=conversation.id,
            participant_type=parts[0] if len(parts) > 0 else "actor",
            participant_label=parts[1] if len(parts) > 1 else p,
            role="to",
        )
        db.add(participant)
    
    for p in data.cc_participants:
        parts = p.split(":", 1)
        participant = ConversationParticipant(
            conversation_id=conversation.id,
            participant_type=parts[0] if len(parts) > 0 else "actor",
            participant_label=parts[1] if len(parts) > 1 else p,
            role="cc",
        )
        db.add(participant)
    
    # Create initial message
    message = Message(
        conversation_id=conversation.id,
        author_type=AuthorType.USER,
        author_id=current_user.id,
        author_label=current_user.username,
        subject=data.subject,
        body_text=data.body_text,
    )
    db.add(message)
    
    await db.commit()
    await db.refresh(conversation)
    
    return {"id": conversation.id, "message": "Conversation created"}


@router.post("/messages")
async def send_message(
    data: SendMessageSchema,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Send a message — reply to an existing thread or start a new one.

    When `conversation_id` is provided the message is appended to the existing
    thread.  When omitted, a new conversation is created (requires
    `exercise_id` and `subject`).  If `parent_message_id` is set, a
    `MAIL_REPLIED` event is emitted for exercise tracking.
    """
    if data.conversation_id:
        # Reply to existing conversation
        conversation = await _get_conversation_or_404(db, data.conversation_id)
    else:
        # Create new conversation
        if not data.exercise_id or not data.subject:
            raise HTTPException(status_code=400, detail="exercise_id and subject required for new conversation")
        await _get_exercise_or_404(db, data.exercise_id)
        
        conversation = Conversation(
            exercise_id=data.exercise_id,
            subject=data.subject,
        )
        db.add(conversation)
        await db.flush()
        
        # Add participants
        for p in data.to_participants:
            parts = p.split(":", 1)
            participant = ConversationParticipant(
                conversation_id=conversation.id,
                participant_type=parts[0] if len(parts) > 0 else "actor",
                participant_label=parts[1] if len(parts) > 1 else p,
                role="to",
            )
            db.add(participant)
    
    # Create message
    message = Message(
        conversation_id=conversation.id,
        parent_message_id=data.parent_message_id,
        author_type=AuthorType.USER,
        author_id=current_user.id,
        author_label=current_user.username,
        body_text=data.body_text,
    )
    db.add(message)
    await db.flush()  # get message.id

    # Emit MAIL_REPLIED event if this is a reply
    if data.parent_message_id:
        db.add(Event(
            exercise_id=conversation.exercise_id,
            type=EventType.MAIL_REPLIED,
            actor_type=EventActorType.USER,
            actor_id=current_user.id,
            actor_label=current_user.username,
            entity_type="message",
            entity_id=message.id,
            payload={
                "message_id": message.id,
                "parent_message_id": data.parent_message_id,
                "conversation_id": conversation.id,
            },
        ))

    await db.commit()
    return {"id": message.id, "conversation_id": conversation.id, "message": "Message sent"}


@router.post("/messages/{message_id}/read")
async def mark_message_read(
    message_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Mark a single message as read by the authenticated user.

    Creates a read receipt and emits a `MAIL_OPENED` event for the exercise
    timeline.  Idempotent — calling twice returns success without duplicating
    the receipt.
    """
    message = await _get_message_or_404(db, message_id)

    # Check if already read
    existing = await db.execute(
        select(ReadReceipt).where(
            ReadReceipt.message_id == message_id,
            ReadReceipt.user_id == current_user.id,
        )
    )
    if existing.scalar_one_or_none():
        return {"message": "Already marked as read"}

    # Create read receipt
    receipt = ReadReceipt(
        message_id=message_id,
        user_id=current_user.id,
    )
    db.add(receipt)

    # Emit MAIL_OPENED event (first read only)
    conv_result = await db.execute(
        select(Conversation).where(Conversation.id == message.conversation_id)
    )
    conversation = conv_result.scalar_one_or_none()
    if conversation:
        db.add(Event(
            exercise_id=conversation.exercise_id,
            type=EventType.MAIL_OPENED,
            actor_type=EventActorType.USER,
            actor_id=current_user.id,
            actor_label=current_user.username,
            entity_type="message",
            entity_id=message_id,
            payload={"message_id": message_id, "conversation_id": conversation.id},
        ))

    await db.commit()
    return {"message": "Marked as read"}


@router.post("/conversations/{conversation_id}/read-all")
async def mark_conversation_read(
    conversation_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Mark every message in a conversation as read for the authenticated user.

    Bulk operation that creates read receipts for all messages that the user
    has not yet opened.  Useful when a player opens a conversation thread.
    """
    conversation = await _get_conversation_or_404(db, conversation_id)
    
    # Get all messages
    result = await db.execute(
        select(Message).where(Message.conversation_id == conversation_id)
    )
    messages = result.scalars().all()
    
    for msg in messages:
        # Check if already read
        existing = await db.execute(
            select(ReadReceipt).where(
                ReadReceipt.message_id == msg.id,
                ReadReceipt.user_id == current_user.id,
            )
        )
        if not existing.scalar_one_or_none():
            receipt = ReadReceipt(
                message_id=msg.id,
                user_id=current_user.id,
            )
            db.add(receipt)
    
    await db.commit()
    
    return {"message": "All messages marked as read"}


# === Animateur routes ===

@router.post("/inject-message")
async def send_inject_message(
    conversation_id: int,
    message_id: int,
    current_user: Annotated[User, Depends(require_role(UserRole.ADMIN, UserRole.ANIMATEUR))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Deliver a pre-authored inject message into a conversation (animateur only).

    Used by the animation team to release a scripted email at the desired
    moment during the exercise.  Resets the message timestamp to simulate
    real-time delivery.
    """
    conversation = await _get_conversation_or_404(db, conversation_id)
    
    message = await _get_message_or_404(db, message_id)
    if message.conversation_id != conversation_id:
        raise HTTPException(status_code=404, detail="Message not found")
    
    # Mark as sent (update timestamp)
    message.created_at = datetime.utcnow()
    await db.commit()
    
    return {"message": "Inject message sent"}
