"""Webmail router: conversations and messages API."""
from typing import Annotated, Optional
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

router = APIRouter(prefix="/webmail", tags=["webmail"])


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
from pydantic import BaseModel
from typing import List


class ParticipantSchema(BaseModel):
    id: int | None = None
    type: str
    label: str | None = None
    role: str  # to, cc, bcc, from

    class Config:
        from_attributes = True


class MessageSchema(BaseModel):
    id: int
    conversation_id: int
    author_type: str
    author_id: int | None
    author_label: str | None
    subject: str | None
    body_text: str
    body_html: str | None
    created_at: datetime
    is_read: bool = False

    class Config:
        from_attributes = True


class ConversationSchema(BaseModel):
    id: int
    exercise_id: int
    subject: str
    inject_id: int | None
    created_at: datetime
    updated_at: datetime
    message_count: int = 0
    unread_count: int = 0
    last_message_at: datetime | None = None

    class Config:
        from_attributes = True


class ConversationDetailSchema(BaseModel):
    id: int
    exercise_id: int
    subject: str
    inject_id: int | None
    created_at: datetime
    updated_at: datetime
    participants: List[ParticipantSchema]
    messages: List[MessageSchema]

    class Config:
        from_attributes = True


class SendMessageSchema(BaseModel):
    conversation_id: int | None = None  # None = new conversation
    exercise_id: int | None = None  # Required if new conversation
    subject: str | None = None  # Required if new conversation
    to_participants: List[str] = []  # List of "type:label" e.g. ["actor:Président", "team:Cellule Crise"]
    body_text: str
    parent_message_id: int | None = None


class ConversationCreateSchema(BaseModel):
    exercise_id: int
    subject: str
    to_participants: List[str] = []
    cc_participants: List[str] = []
    body_text: str


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
    """List conversations for an exercise."""
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
    """Get a conversation with all messages."""
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
    """Create a new conversation with initial message."""
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
    """Send a message (either new conversation or reply)."""
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
    """Mark a message as read."""
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
    """Mark all messages in a conversation as read."""
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
    """Send a prepared inject message (animateur only)."""
    conversation = await _get_conversation_or_404(db, conversation_id)
    
    message = await _get_message_or_404(db, message_id)
    if message.conversation_id != conversation_id:
        raise HTTPException(status_code=404, detail="Message not found")
    
    # Mark as sent (update timestamp)
    message.created_at = datetime.utcnow()
    await db.commit()
    
    return {"message": "Inject message sent"}
