"""
API routes for simulated communication channels.
"""
from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect, Query
from sqlalchemy import select, and_, or_, desc, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db_session
from app.models.simulated_channel import (
    SimulatedMail, SimulatedChatRoom, SimulatedChatMessage,
    SimulatedSms, SimulatedCall, CallStatus,
    SimulatedSocialPost, SimulatedPressArticle, SimulatedTvEvent
)
from app.models.crisis_contact import CrisisContact
from app.schemas.simulated_channel import (
    SimulatedMailCreate, SimulatedMailResponse, SimulatedMailListResponse,
    SimulatedMailFromInject,
    SimulatedChatRoomCreate, SimulatedChatRoomResponse, SimulatedChatRoomDetailResponse,
    SimulatedChatMessageCreate, SimulatedChatMessageResponse,
    SimulatedSmsCreate, SimulatedSmsResponse, SimulatedSmsFromInject, SimulatedSmsConversationResponse,
    SimulatedCallFromInject, SimulatedCallAction, SimulatedCallResponse, CallStatusEnum,
    SimulatedSocialPostFromInject, SimulatedSocialPostReaction, SimulatedSocialPostResponse, SimulatedSocialFeedResponse,
    SimulatedPressArticleFromInject, SimulatedPressArticleResponse, SimulatedPressFeedResponse,
    SimulatedTvEventFromInject, SimulatedTvEventResponse, SimulatedTvFeedResponse,
    WebSocketEvent
)
from app.models import WsAuthTicketScope
from app.routers.auth import authenticate_ws_with_ticket

router = APIRouter(prefix="/simulated", tags=["simulated-channels"])


# ============== WEBSOCKET MANAGER ==============

class ConnectionManager:
    def __init__(self):
        self._connections: dict[int, list[WebSocket]] = {}  # exercise_id -> [websockets]
    
    async def connect(self, websocket: WebSocket, exercise_id: int):
        await websocket.accept()
        if exercise_id not in self._connections:
            self._connections[exercise_id] = []
        self._connections[exercise_id].append(websocket)
    
    def disconnect(self, websocket: WebSocket, exercise_id: int):
        if exercise_id in self._connections:
            if websocket in self._connections[exercise_id]:
                self._connections[exercise_id].remove(websocket)
    
    async def broadcast(self, exercise_id: int, message: dict):
        if exercise_id in self._connections:
            disconnected = []
            for websocket in self._connections[exercise_id]:
                try:
                    await websocket.send_json(message)
                except Exception:
                    disconnected.append(websocket)
            for ws in disconnected:
                self.disconnect(ws, exercise_id)


ws_manager = ConnectionManager()


# ============== MAIL ==============

@router.get("/{exercise_id}/mails", response_model=SimulatedMailListResponse)
async def list_mails(
    exercise_id: int,
    folder: str = Query("inbox", pattern="^(inbox|sent|starred)$"),
    unread_only: bool = False,
    page: int = 1,
    page_size: int = 20
):
    """List mails for a player (inbox or sent)."""
    async for db in get_db_session():
        base_query = select(SimulatedMail).where(SimulatedMail.exercise_id == exercise_id)
        
        if folder == "inbox":
            base_query = base_query.where(SimulatedMail.is_from_player == False)
        elif folder == "sent":
            base_query = base_query.where(SimulatedMail.is_from_player == True)
        elif folder == "starred":
            base_query = base_query.where(SimulatedMail.is_starred == True)
        
        if unread_only:
            base_query = base_query.where(SimulatedMail.is_read == False)
        
        # Count total
        count_query = select(func.count()).select_from(base_query.subquery())
        total = (await db.execute(count_query)).scalar()
        
        # Count unread (inbox only)
        unread_query = select(func.count()).where(
            and_(
                SimulatedMail.exercise_id == exercise_id,
                SimulatedMail.is_from_player == False,
                SimulatedMail.is_read == False
            )
        )
        unread_count = (await db.execute(unread_query)).scalar()
        
        # Get paginated results
        query = base_query.order_by(desc(SimulatedMail.sent_at)).offset((page - 1) * page_size).limit(page_size)
        result = await db.execute(query)
        mails = result.scalars().all()
        
        return SimulatedMailListResponse(
            mails=[SimulatedMailResponse.model_validate(m) for m in mails],
            total=total,
            unread_count=unread_count
        )
    
    raise HTTPException(status_code=500, detail="Database error")


@router.get("/{exercise_id}/mails/{mail_id}", response_model=SimulatedMailResponse)
async def get_mail(exercise_id: int, mail_id: int):
    """Get a specific mail and mark it as read."""
    async for db in get_db_session():
        result = await db.execute(
            select(SimulatedMail).where(
                and_(SimulatedMail.id == mail_id, SimulatedMail.exercise_id == exercise_id)
            )
        )
        mail = result.scalar_one_or_none()
        
        if not mail:
            raise HTTPException(status_code=404, detail="Mail not found")
        
        # Mark as read
        if not mail.is_read:
            mail.is_read = True
            mail.read_at = datetime.utcnow()
            await db.commit()
            await db.refresh(mail)
        
        return SimulatedMailResponse.model_validate(mail)
    
    raise HTTPException(status_code=500, detail="Database error")


@router.post("/{exercise_id}/mails", response_model=SimulatedMailResponse)
async def send_mail(exercise_id: int, mail_data: SimulatedMailCreate):
    """Send a mail (player action)."""
    async for db in get_db_session():
        # Get recipient contact
        result = await db.execute(
            select(CrisisContact).where(CrisisContact.id == mail_data.to_contact_id)
        )
        to_contact = result.scalar_one_or_none()
        
        if not to_contact:
            raise HTTPException(status_code=404, detail="Recipient not found")
        
        # Create mail
        mail = SimulatedMail(
            exercise_id=exercise_id,
            to_contact_id=mail_data.to_contact_id,
            to_name=to_contact.display_name,
            to_email=to_contact.email,
            from_name="Joueur",  # TODO: Get actual player name
            from_email="player@simulation.local",
            subject=mail_data.subject,
            body=mail_data.body,
            is_from_player=True,
            parent_mail_id=mail_data.parent_mail_id,
            sent_at=datetime.utcnow()
        )
        db.add(mail)
        await db.commit()
        await db.refresh(mail)
        
        # Broadcast to WebSocket
        await ws_manager.broadcast(exercise_id, {
            "event_type": "mail",
            "action": "new",
            "data": SimulatedMailResponse.model_validate(mail).model_dump(),
            "timestamp": datetime.utcnow().isoformat(),
            "exercise_id": exercise_id
        })
        
        return SimulatedMailResponse.model_validate(mail)
    
    raise HTTPException(status_code=500, detail="Database error")


@router.post("/{exercise_id}/mails/inject", response_model=SimulatedMailResponse)
async def create_mail_from_inject(exercise_id: int, mail_data: SimulatedMailFromInject):
    """Create a mail from an inject event (system action)."""
    async for db in get_db_session():
        mail = SimulatedMail(
            exercise_id=exercise_id,
            from_contact_id=mail_data.from_contact_id,
            to_contact_id=mail_data.to_contact_id,
            from_name=mail_data.from_name,
            from_email=mail_data.from_email,
            to_name=mail_data.to_name,
            to_email=mail_data.to_email,
            subject=mail_data.subject,
            body=mail_data.body,
            is_from_player=False,
            is_inject=True,
            sent_at=datetime.utcnow()
        )
        db.add(mail)
        await db.commit()
        await db.refresh(mail)
        
        # Broadcast to WebSocket
        await ws_manager.broadcast(exercise_id, {
            "event_type": "mail",
            "action": "new",
            "data": SimulatedMailResponse.model_validate(mail).model_dump(),
            "timestamp": datetime.utcnow().isoformat(),
            "exercise_id": exercise_id
        })
        
        return SimulatedMailResponse.model_validate(mail)
    
    raise HTTPException(status_code=500, detail="Database error")


@router.post("/{exercise_id}/mails/{mail_id}/star")
async def toggle_star_mail(exercise_id: int, mail_id: int):
    """Toggle star status on a mail."""
    async for db in get_db_session():
        result = await db.execute(
            select(SimulatedMail).where(
                and_(SimulatedMail.id == mail_id, SimulatedMail.exercise_id == exercise_id)
            )
        )
        mail = result.scalar_one_or_none()
        
        if not mail:
            raise HTTPException(status_code=404, detail="Mail not found")
        
        mail.is_starred = not mail.is_starred
        await db.commit()
        
        return {"starred": mail.is_starred}
    
    raise HTTPException(status_code=500, detail="Database error")


# ============== CHAT ==============

@router.get("/{exercise_id}/chat/rooms", response_model=List[SimulatedChatRoomResponse])
async def list_chat_rooms(exercise_id: int):
    """List chat rooms for an exercise."""
    async for db in get_db_session():
        result = await db.execute(
            select(SimulatedChatRoom)
            .where(and_(SimulatedChatRoom.exercise_id == exercise_id, SimulatedChatRoom.is_active == True))
            .order_by(SimulatedChatRoom.created_at)
        )
        rooms = result.scalars().all()
        
        # Get unread counts and last messages
        room_responses = []
        for room in rooms:
            # Count unread (messages not from player)
            unread_result = await db.execute(
                select(func.count()).where(
                    and_(
                        SimulatedChatMessage.room_id == room.id,
                        SimulatedChatMessage.is_from_player == False
                    )
                )
            )
            unread_count = unread_result.scalar() or 0
            
            # Get last message
            last_msg_result = await db.execute(
                select(SimulatedChatMessage)
                .where(SimulatedChatMessage.room_id == room.id)
                .order_by(desc(SimulatedChatMessage.sent_at))
                .limit(1)
            )
            last_msg = last_msg_result.scalar_one_or_none()
            
            room_resp = SimulatedChatRoomResponse.model_validate(room)
            room_resp.unread_count = unread_count
            room_resp.last_message_at = last_msg.sent_at if last_msg else None
            room_resp.last_message_preview = last_msg.content[:50] if last_msg else None
            room_responses.append(room_resp)
        
        return room_responses
    
    raise HTTPException(status_code=500, detail="Database error")


@router.get("/{exercise_id}/chat/rooms/{room_id}", response_model=SimulatedChatRoomDetailResponse)
async def get_chat_room(exercise_id: int, room_id: int, mark_read: bool = True):
    """Get a chat room with messages."""
    async for db in get_db_session():
        result = await db.execute(
            select(SimulatedChatRoom).where(
                and_(SimulatedChatRoom.id == room_id, SimulatedChatRoom.exercise_id == exercise_id)
            )
        )
        room = result.scalar_one_or_none()
        
        if not room:
            raise HTTPException(status_code=404, detail="Chat room not found")
        
        # Get messages
        msg_result = await db.execute(
            select(SimulatedChatMessage)
            .where(SimulatedChatMessage.room_id == room_id)
            .order_by(SimulatedChatMessage.sent_at)
        )
        messages = msg_result.scalars().all()
        
        room_resp = SimulatedChatRoomDetailResponse.model_validate(room)
        room_resp.messages = [SimulatedChatMessageResponse.model_validate(m) for m in messages]
        
        return room_resp
    
    raise HTTPException(status_code=500, detail="Database error")


@router.post("/{exercise_id}/chat/rooms/{room_id}/messages", response_model=SimulatedChatMessageResponse)
async def send_chat_message(exercise_id: int, room_id: int, message_data: SimulatedChatMessageCreate):
    """Send a chat message."""
    async for db in get_db_session():
        # Verify room exists
        room_result = await db.execute(
            select(SimulatedChatRoom).where(
                and_(SimulatedChatRoom.id == room_id, SimulatedChatRoom.exercise_id == exercise_id)
            )
        )
        room = room_result.scalar_one_or_none()
        if not room:
            raise HTTPException(status_code=404, detail="Chat room not found")
        
        message = SimulatedChatMessage(
            room_id=room_id,
            exercise_id=exercise_id,
            sender_name="Joueur",
            sender_type="player",
            content=message_data.content,
            message_type=message_data.message_type,
            is_from_player=True,
            sent_at=datetime.utcnow()
        )
        db.add(message)
        await db.commit()
        await db.refresh(message)
        
        # Broadcast
        await ws_manager.broadcast(exercise_id, {
            "event_type": "chat",
            "action": "new",
            "data": SimulatedChatMessageResponse.model_validate(message).model_dump(),
            "timestamp": datetime.utcnow().isoformat(),
            "exercise_id": exercise_id
        })
        
        return SimulatedChatMessageResponse.model_validate(message)
    
    raise HTTPException(status_code=500, detail="Database error")


@router.post("/{exercise_id}/chat/rooms", response_model=SimulatedChatRoomResponse)
async def create_chat_room(exercise_id: int, room_data: SimulatedChatRoomCreate):
    """Create a new chat room."""
    async for db in get_db_session():
        room = SimulatedChatRoom(
            exercise_id=exercise_id,
            name=room_data.name,
            room_type=room_data.room_type,
            description=room_data.description,
            participant_ids=room_data.participant_ids
        )
        db.add(room)
        await db.commit()
        await db.refresh(room)
        
        return SimulatedChatRoomResponse.model_validate(room)
    
    raise HTTPException(status_code=500, detail="Database error")


# ============== SMS ==============

@router.get("/{exercise_id}/sms/conversations", response_model=List[SimulatedSmsConversationResponse])
async def list_sms_conversations(exercise_id: int):
    """List SMS conversations grouped by contact."""
    async for db in get_db_session():
        # Get all SMS for this exercise
        result = await db.execute(
            select(SimulatedSms)
            .where(SimulatedSms.exercise_id == exercise_id)
            .order_by(SimulatedSms.sent_at)
        )
        all_sms = result.scalars().all()
        
        # Group by contact
        conversations = {}
        for sms in all_sms:
            # For incoming SMS, group by sender; for outgoing, group by recipient
            if not sms.is_from_player:
                key = sms.from_contact_id or sms.from_phone
                if key not in conversations:
                    conversations[key] = {
                        "contact_id": sms.from_contact_id,
                        "contact_name": sms.from_name,
                        "contact_phone": sms.from_phone,
                        "messages": [],
                        "unread_count": 0
                    }
                conversations[key]["messages"].append(sms)
                if not sms.is_read:
                    conversations[key]["unread_count"] += 1
            else:
                # Outgoing SMS - add to existing conversation or create entry
                key = sms.to_contact_id or sms.to_phone
                if key not in conversations:
                    conversations[key] = {
                        "contact_id": sms.to_contact_id,
                        "contact_name": sms.to_name,
                        "contact_phone": sms.to_phone,
                        "messages": [],
                        "unread_count": 0
                    }
                conversations[key]["messages"].append(sms)
        
        return [
            SimulatedSmsConversationResponse(
                contact_id=v["contact_id"],
                contact_name=v["contact_name"],
                contact_phone=v["contact_phone"],
                messages=[SimulatedSmsResponse.model_validate(m) for m in sorted(v["messages"], key=lambda x: x.sent_at)],
                unread_count=v["unread_count"]
            )
            for v in conversations.values()
        ]
    
    raise HTTPException(status_code=500, detail="Database error")


@router.post("/{exercise_id}/sms", response_model=SimulatedSmsResponse)
async def send_sms(exercise_id: int, sms_data: SimulatedSmsCreate):
    """Send an SMS (player action)."""
    async for db in get_db_session():
        # Get recipient
        result = await db.execute(
            select(CrisisContact).where(CrisisContact.id == sms_data.to_contact_id)
        )
        to_contact = result.scalar_one_or_none()
        
        if not to_contact:
            raise HTTPException(status_code=404, detail="Recipient not found")
        
        sms = SimulatedSms(
            exercise_id=exercise_id,
            to_contact_id=sms_data.to_contact_id,
            to_name=to_contact.display_name,
            to_phone=to_contact.mobile or to_contact.phone,
            from_name="Joueur",
            from_phone="+33600000000",  # Simulated player number
            content=sms_data.content,
            is_from_player=True,
            sent_at=datetime.utcnow()
        )
        db.add(sms)
        await db.commit()
        await db.refresh(sms)
        
        await ws_manager.broadcast(exercise_id, {
            "event_type": "sms",
            "action": "new",
            "data": SimulatedSmsResponse.model_validate(sms).model_dump(),
            "timestamp": datetime.utcnow().isoformat(),
            "exercise_id": exercise_id
        })
        
        return SimulatedSmsResponse.model_validate(sms)
    
    raise HTTPException(status_code=500, detail="Database error")


@router.post("/{exercise_id}/sms/inject", response_model=SimulatedSmsResponse)
async def create_sms_from_inject(exercise_id: int, sms_data: SimulatedSmsFromInject):
    """Create an SMS from an inject event."""
    async for db in get_db_session():
        sms = SimulatedSms(
            exercise_id=exercise_id,
            from_contact_id=sms_data.from_contact_id,
            to_contact_id=sms_data.to_contact_id,
            from_name=sms_data.from_name,
            from_phone=sms_data.from_phone,
            to_name=sms_data.to_name,
            to_phone=sms_data.to_phone,
            content=sms_data.content,
            is_from_player=False,
            is_inject=True,
            sent_at=datetime.utcnow()
        )
        db.add(sms)
        await db.commit()
        await db.refresh(sms)
        
        await ws_manager.broadcast(exercise_id, {
            "event_type": "sms",
            "action": "new",
            "data": SimulatedSmsResponse.model_validate(sms).model_dump(),
            "timestamp": datetime.utcnow().isoformat(),
            "exercise_id": exercise_id
        })
        
        return SimulatedSmsResponse.model_validate(sms)
    
    raise HTTPException(status_code=500, detail="Database error")


@router.post("/{exercise_id}/sms/{sms_id}/read")
async def mark_sms_read(exercise_id: int, sms_id: int):
    """Mark an SMS as read."""
    async for db in get_db_session():
        result = await db.execute(
            select(SimulatedSms).where(
                and_(SimulatedSms.id == sms_id, SimulatedSms.exercise_id == exercise_id)
            )
        )
        sms = result.scalar_one_or_none()
        
        if not sms:
            raise HTTPException(status_code=404, detail="SMS not found")
        
        if not sms.is_read:
            sms.is_read = True
            sms.read_at = datetime.utcnow()
            await db.commit()
        
        return {"read": True}
    
    raise HTTPException(status_code=500, detail="Database error")


# ============== CALLS ==============

@router.get("/{exercise_id}/calls", response_model=List[SimulatedCallResponse])
async def list_calls(exercise_id: int, include_ended: bool = False):
    """List phone calls."""
    async for db in get_db_session():
        query = select(SimulatedCall).where(SimulatedCall.exercise_id == exercise_id)
        
        if not include_ended:
            query = query.where(SimulatedCall.status != CallStatus.ENDED)
        
        query = query.order_by(desc(SimulatedCall.created_at))
        
        result = await db.execute(query)
        calls = result.scalars().all()
        
        return [SimulatedCallResponse.model_validate(c) for c in calls]
    
    raise HTTPException(status_code=500, detail="Database error")


@router.get("/{exercise_id}/calls/active", response_model=Optional[SimulatedCallResponse])
async def get_active_call(exercise_id: int):
    """Get the currently active call (ringing or answered)."""
    async for db in get_db_session():
        result = await db.execute(
            select(SimulatedCall).where(
                and_(
                    SimulatedCall.exercise_id == exercise_id,
                    SimulatedCall.status.in_([CallStatus.RINGING, CallStatus.ANSWERED])
                )
            ).order_by(desc(SimulatedCall.created_at))
        )
        call = result.scalar_one_or_none()
        
        return SimulatedCallResponse.model_validate(call) if call else None
    
    raise HTTPException(status_code=500, detail="Database error")


@router.post("/{exercise_id}/calls/inject", response_model=SimulatedCallResponse)
async def create_call_from_inject(exercise_id: int, call_data: SimulatedCallFromInject):
    """Create a call from an inject event."""
    async for db in get_db_session():
        call = SimulatedCall(
            exercise_id=exercise_id,
            caller_contact_id=call_data.caller_contact_id,
            callee_contact_id=call_data.callee_contact_id,
            caller_name=call_data.caller_name,
            caller_phone=call_data.caller_phone,
            callee_name=call_data.callee_name,
            callee_phone=call_data.callee_phone,
            call_type=call_data.call_type,
            status=CallStatus.RINGING,
            voicemail_transcript=call_data.voicemail_transcript,
            is_inject=True
        )
        db.add(call)
        await db.commit()
        await db.refresh(call)
        
        await ws_manager.broadcast(exercise_id, {
            "event_type": "call",
            "action": "new",
            "data": SimulatedCallResponse.model_validate(call).model_dump(),
            "timestamp": datetime.utcnow().isoformat(),
            "exercise_id": exercise_id
        })
        
        return SimulatedCallResponse.model_validate(call)
    
    raise HTTPException(status_code=500, detail="Database error")


@router.post("/{exercise_id}/calls/{call_id}/action", response_model=SimulatedCallResponse)
async def handle_call_action(exercise_id: int, call_id: int, action_data: SimulatedCallAction):
    """Handle call actions: answer, reject, end."""
    async for db in get_db_session():
        result = await db.execute(
            select(SimulatedCall).where(
                and_(SimulatedCall.id == call_id, SimulatedCall.exercise_id == exercise_id)
            )
        )
        call = result.scalar_one_or_none()
        
        if not call:
            raise HTTPException(status_code=404, detail="Call not found")
        
        now = datetime.utcnow()
        
        if action_data.action == "answer":
            if call.status != CallStatus.RINGING:
                raise HTTPException(status_code=400, detail="Call is not ringing")
            call.status = CallStatus.ANSWERED
            call.started_at = now
            
        elif action_data.action == "reject":
            if call.status != CallStatus.RINGING:
                raise HTTPException(status_code=400, detail="Call is not ringing")
            call.status = CallStatus.REJECTED
            call.ended_at = now
            
        elif action_data.action == "end":
            if call.status != CallStatus.ANSWERED:
                raise HTTPException(status_code=400, detail="Call is not active")
            call.status = CallStatus.ENDED
            call.ended_at = now
            if call.started_at:
                call.duration_seconds = int((now - call.started_at).total_seconds())
        else:
            raise HTTPException(status_code=400, detail="Invalid action")
        
        await db.commit()
        await db.refresh(call)
        
        await ws_manager.broadcast(exercise_id, {
            "event_type": "call",
            "action": "update",
            "data": SimulatedCallResponse.model_validate(call).model_dump(),
            "timestamp": datetime.utcnow().isoformat(),
            "exercise_id": exercise_id
        })
        
        return SimulatedCallResponse.model_validate(call)
    
    raise HTTPException(status_code=500, detail="Database error")


# ============== SOCIAL ==============

@router.get("/{exercise_id}/social", response_model=SimulatedSocialFeedResponse)
async def list_social_posts(exercise_id: int, page: int = 1, page_size: int = 20):
    """List social media posts."""
    async for db in get_db_session():
        # Count total and unseen
        count_result = await db.execute(
            select(func.count()).where(SimulatedSocialPost.exercise_id == exercise_id)
        )
        total = count_result.scalar() or 0
        
        unseen_result = await db.execute(
            select(func.count()).where(
                and_(SimulatedSocialPost.exercise_id == exercise_id, SimulatedSocialPost.seen_at == None)
            )
        )
        unseen_count = unseen_result.scalar() or 0
        
        # Get posts
        result = await db.execute(
            select(SimulatedSocialPost)
            .where(SimulatedSocialPost.exercise_id == exercise_id)
            .order_by(desc(SimulatedSocialPost.posted_at))
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        posts = result.scalars().all()
        
        # Mark as seen
        now = datetime.utcnow()
        for post in posts:
            if post.seen_at is None:
                post.seen_at = now
        await db.commit()
        
        return SimulatedSocialFeedResponse(
            posts=[SimulatedSocialPostResponse.model_validate(p) for p in posts],
            total=total,
            unseen_count=unseen_count
        )
    
    raise HTTPException(status_code=500, detail="Database error")


@router.post("/{exercise_id}/social/inject", response_model=SimulatedSocialPostResponse)
async def create_social_post_from_inject(exercise_id: int, post_data: SimulatedSocialPostFromInject):
    """Create a social post from an inject event."""
    async for db in get_db_session():
        post = SimulatedSocialPost(
            exercise_id=exercise_id,
            author_name=post_data.author_name,
            author_handle=post_data.author_handle,
            author_avatar=post_data.author_avatar,
            is_verified=post_data.is_verified,
            content=post_data.content,
            media_urls=post_data.media_urls,
            likes_count=post_data.likes_count,
            retweets_count=post_data.retweets_count,
            replies_count=post_data.replies_count,
            views_count=post_data.views_count,
            is_breaking=post_data.is_breaking,
            is_inject=True,
            posted_at=datetime.utcnow()
        )
        db.add(post)
        await db.commit()
        await db.refresh(post)
        
        await ws_manager.broadcast(exercise_id, {
            "event_type": "social",
            "action": "new",
            "data": SimulatedSocialPostResponse.model_validate(post).model_dump(),
            "timestamp": datetime.utcnow().isoformat(),
            "exercise_id": exercise_id
        })
        
        return SimulatedSocialPostResponse.model_validate(post)
    
    raise HTTPException(status_code=500, detail="Database error")


@router.post("/{exercise_id}/social/{post_id}/react", response_model=SimulatedSocialPostResponse)
async def react_to_social_post(exercise_id: int, post_id: int, reaction_data: SimulatedSocialPostReaction):
    """React to a social post (like/retweet)."""
    async for db in get_db_session():
        result = await db.execute(
            select(SimulatedSocialPost).where(
                and_(SimulatedSocialPost.id == post_id, SimulatedSocialPost.exercise_id == exercise_id)
            )
        )
        post = result.scalar_one_or_none()
        
        if not post:
            raise HTTPException(status_code=404, detail="Post not found")
        
        if reaction_data.reaction_type == "like":
            if post.player_liked:
                post.player_liked = False
                post.likes_count = max(0, post.likes_count - 1)
            else:
                post.player_liked = True
                post.likes_count += 1
                
        elif reaction_data.reaction_type == "retweet":
            if post.player_retweeted:
                post.player_retweeted = False
                post.retweets_count = max(0, post.retweets_count - 1)
            else:
                post.player_retweeted = True
                post.retweets_count += 1
        
        await db.commit()
        await db.refresh(post)
        
        return SimulatedSocialPostResponse.model_validate(post)
    
    raise HTTPException(status_code=500, detail="Database error")


# ============== PRESS ==============

@router.get("/{exercise_id}/press", response_model=SimulatedPressFeedResponse)
async def list_press_articles(exercise_id: int, page: int = 1, page_size: int = 20):
    """List press articles."""
    async for db in get_db_session():
        count_result = await db.execute(
            select(func.count()).where(SimulatedPressArticle.exercise_id == exercise_id)
        )
        total = count_result.scalar() or 0
        
        unread_result = await db.execute(
            select(func.count()).where(
                and_(SimulatedPressArticle.exercise_id == exercise_id, SimulatedPressArticle.is_read == False)
            )
        )
        unread_count = unread_result.scalar() or 0
        
        result = await db.execute(
            select(SimulatedPressArticle)
            .where(SimulatedPressArticle.exercise_id == exercise_id)
            .order_by(desc(SimulatedPressArticle.published_at))
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        articles = result.scalars().all()
        
        return SimulatedPressFeedResponse(
            articles=[SimulatedPressArticleResponse.model_validate(a) for a in articles],
            total=total,
            unread_count=unread_count
        )
    
    raise HTTPException(status_code=500, detail="Database error")


@router.get("/{exercise_id}/press/{article_id}", response_model=SimulatedPressArticleResponse)
async def get_press_article(exercise_id: int, article_id: int):
    """Get a press article and mark as read."""
    async for db in get_db_session():
        result = await db.execute(
            select(SimulatedPressArticle).where(
                and_(SimulatedPressArticle.id == article_id, SimulatedPressArticle.exercise_id == exercise_id)
            )
        )
        article = result.scalar_one_or_none()
        
        if not article:
            raise HTTPException(status_code=404, detail="Article not found")
        
        if not article.is_read:
            article.is_read = True
            article.read_at = datetime.utcnow()
            await db.commit()
            await db.refresh(article)
        
        return SimulatedPressArticleResponse.model_validate(article)
    
    raise HTTPException(status_code=500, detail="Database error")


@router.post("/{exercise_id}/press/inject", response_model=SimulatedPressArticleResponse)
async def create_press_article_from_inject(exercise_id: int, article_data: SimulatedPressArticleFromInject):
    """Create a press article from an inject event."""
    async for db in get_db_session():
        article = SimulatedPressArticle(
            exercise_id=exercise_id,
            source=article_data.source,
            source_logo=article_data.source_logo,
            title=article_data.title,
            content=article_data.content,
            summary=article_data.summary,
            image_url=article_data.image_url,
            article_url=article_data.article_url,
            category=article_data.category,
            is_breaking_news=article_data.is_breaking_news,
            is_inject=True,
            published_at=datetime.utcnow()
        )
        db.add(article)
        await db.commit()
        await db.refresh(article)
        
        await ws_manager.broadcast(exercise_id, {
            "event_type": "press",
            "action": "new",
            "data": SimulatedPressArticleResponse.model_validate(article).model_dump(),
            "timestamp": datetime.utcnow().isoformat(),
            "exercise_id": exercise_id
        })
        
        return SimulatedPressArticleResponse.model_validate(article)
    
    raise HTTPException(status_code=500, detail="Database error")


# ============== TV ==============

@router.get("/{exercise_id}/tv", response_model=SimulatedTvFeedResponse)
async def list_tv_events(exercise_id: int, page: int = 1, page_size: int = 20):
    """List TV events."""
    async for db in get_db_session():
        count_result = await db.execute(
            select(func.count()).where(SimulatedTvEvent.exercise_id == exercise_id)
        )
        total = count_result.scalar() or 0
        
        unseen_result = await db.execute(
            select(func.count()).where(
                and_(SimulatedTvEvent.exercise_id == exercise_id, SimulatedTvEvent.is_seen == False)
            )
        )
        unseen_count = unseen_result.scalar() or 0
        
        # Check for current live event
        live_result = await db.execute(
            select(SimulatedTvEvent).where(
                and_(SimulatedTvEvent.exercise_id == exercise_id, SimulatedTvEvent.is_live == True)
            ).order_by(desc(SimulatedTvEvent.broadcast_at)).limit(1)
        )
        current_live = live_result.scalar_one_or_none()
        
        result = await db.execute(
            select(SimulatedTvEvent)
            .where(SimulatedTvEvent.exercise_id == exercise_id)
            .order_by(desc(SimulatedTvEvent.broadcast_at))
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        events = result.scalars().all()
        
        return SimulatedTvFeedResponse(
            events=[SimulatedTvEventResponse.model_validate(e) for e in events],
            total=total,
            unseen_count=unseen_count,
            current_live=SimulatedTvEventResponse.model_validate(current_live) if current_live else None
        )
    
    raise HTTPException(status_code=500, detail="Database error")


@router.post("/{exercise_id}/tv/inject", response_model=SimulatedTvEventResponse)
async def create_tv_event_from_inject(exercise_id: int, event_data: SimulatedTvEventFromInject):
    """Create a TV event from an inject event."""
    async for db in get_db_session():
        event = SimulatedTvEvent(
            exercise_id=exercise_id,
            channel=event_data.channel,
            channel_logo=event_data.channel_logo,
            title=event_data.title,
            description=event_data.description,
            video_url=event_data.video_url,
            thumbnail_url=event_data.thumbnail_url,
            event_type=event_data.event_type,
            is_live=event_data.is_live,
            is_breaking=event_data.is_breaking,
            duration_seconds=event_data.duration_seconds,
            is_inject=True,
            broadcast_at=datetime.utcnow()
        )
        db.add(event)
        await db.commit()
        await db.refresh(event)
        
        await ws_manager.broadcast(exercise_id, {
            "event_type": "tv",
            "action": "new",
            "data": SimulatedTvEventResponse.model_validate(event).model_dump(),
            "timestamp": datetime.utcnow().isoformat(),
            "exercise_id": exercise_id
        })
        
        return SimulatedTvEventResponse.model_validate(event)
    
    raise HTTPException(status_code=500, detail="Database error")


@router.post("/{exercise_id}/tv/{event_id}/seen")
async def mark_tv_event_seen(exercise_id: int, event_id: int):
    """Mark a TV event as seen."""
    async for db in get_db_session():
        result = await db.execute(
            select(SimulatedTvEvent).where(
                and_(SimulatedTvEvent.id == event_id, SimulatedTvEvent.exercise_id == exercise_id)
            )
        )
        event = result.scalar_one_or_none()
        
        if not event:
            raise HTTPException(status_code=404, detail="TV event not found")
        
        if not event.is_seen:
            event.is_seen = True
            event.seen_at = datetime.utcnow()
            await db.commit()
        
        return {"seen": True}
    
    raise HTTPException(status_code=500, detail="Database error")


# ============== WEBSOCKET ==============

@router.websocket("/{exercise_id}/ws")
async def simulated_channels_websocket(websocket: WebSocket, exercise_id: int, ticket: str = Query(...)):
    """WebSocket endpoint for real-time updates on simulated channels."""
    try:
        await authenticate_ws_with_ticket(
            websocket=websocket,
            ticket_id=ticket,
            expected_scope=WsAuthTicketScope.SIMULATED_CHANNELS,
            expected_exercise_id=exercise_id,
        )
    except HTTPException:
        return

    await ws_manager.connect(websocket, exercise_id)
    
    try:
        # Send connection confirmation
        await websocket.send_json({
            "event_type": "system",
            "action": "connected",
            "data": {"message": "Connected to simulated channels"},
            "timestamp": datetime.utcnow().isoformat(),
            "exercise_id": exercise_id
        })
        
        while True:
            # Wait for any message (ping/pong or keep-alive)
            data = await websocket.receive_json()
            
            if data.get("type") == "ping":
                await websocket.send_json({"type": "pong"})
                
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket, exercise_id)
    except Exception as e:
        print(f"[Simulated WS] Error: {e}")
        ws_manager.disconnect(websocket, exercise_id)
