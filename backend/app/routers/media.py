"""Media router for file upload, streaming, and management."""
from datetime import datetime, timezone
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Request
from fastapi.responses import StreamingResponse, FileResponse
from pydantic import BaseModel
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db_session
from app.models import Media, MediaVisibility, MediaStatus, Exercise, Team
from app.models.user import UserRole
from app.routers.auth import require_auth, require_role
from app.services.media_service import media_service
from app.utils.tenancy import TenantRequestContext, require_tenant_context

router = APIRouter()


async def _ensure_exercise_in_tenant(
    db: AsyncSession,
    exercise_id: int,
    tenant_id: int,
) -> None:
    result = await db.execute(
        select(Exercise.id).where(
            Exercise.id == exercise_id,
            Exercise.tenant_id == tenant_id,
        )
    )
    if result.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="Exercise not found")


async def _ensure_team_in_tenant(
    db: AsyncSession,
    team_id: int,
    tenant_id: int,
) -> None:
    result = await db.execute(
        select(Team.id).where(
            Team.id == team_id,
            Team.tenant_id == tenant_id,
        )
    )
    if result.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="Team not found")


# Schemas
class MediaBase(BaseModel):
    """Base media schema."""
    title: Optional[str] = None
    description: Optional[str] = None
    tags: Optional[List[str]] = None
    visibility: MediaVisibility = MediaVisibility.EXERCISE


class MediaCreate(MediaBase):
    """Schema for creating media via upload."""
    exercise_id: Optional[int] = None
    owner_team_id: Optional[int] = None


class MediaUpdate(BaseModel):
    """Schema for updating media metadata."""
    title: Optional[str] = None
    description: Optional[str] = None
    tags: Optional[List[str]] = None
    visibility: Optional[MediaVisibility] = None


class MediaResponse(BaseModel):
    """Schema for media response."""
    id: int
    exercise_id: Optional[int]
    owner_team_id: Optional[int]
    filename: str
    original_filename: str
    mime_type: str
    size: int
    sha256: str
    title: Optional[str]
    description: Optional[str]
    tags: Optional[List[str]]
    visibility: MediaVisibility
    status: MediaStatus
    uploaded_by: int
    created_at: datetime
    updated_at: datetime
    
    # Computed properties
    is_image: bool = False
    is_video: bool = False
    is_audio: bool = False
    is_pdf: bool = False
    
    model_config = {"from_attributes": True}
    
    @classmethod
    def from_media(cls, media: Media) -> "MediaResponse":
        """Create response from Media model."""
        return cls(
            id=media.id,
            exercise_id=media.exercise_id,
            owner_team_id=media.owner_team_id,
            filename=media.filename,
            original_filename=media.original_filename,
            mime_type=media.mime_type,
            size=media.size,
            sha256=media.sha256,
            title=media.title,
            description=media.description,
            tags=media.tags,
            visibility=media.visibility,
            status=media.status,
            uploaded_by=media.uploaded_by,
            created_at=media.created_at,
            updated_at=media.updated_at,
            is_image=media.is_image,
            is_video=media.is_video,
            is_audio=media.is_audio,
            is_pdf=media.is_pdf,
        )


class MediaListResponse(BaseModel):
    """Schema for list of media."""
    media: List[MediaResponse]
    total: int
    page: int
    page_size: int


class UploadResponse(BaseModel):
    """Schema for upload response."""
    media: MediaResponse
    is_duplicate: bool
    message: str


@router.get("", response_model=MediaListResponse)
async def list_media(
    exercise_id: Optional[int] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    mime_type: Optional[str] = None,
    search: Optional[str] = None,
    tags: Optional[str] = None,
    visibility: Optional[MediaVisibility] = None,
    current_user = Depends(require_auth),
    tenant_ctx: TenantRequestContext = Depends(require_tenant_context),
    db: AsyncSession = Depends(get_db_session),
):
    """List media files with filters."""
    query = select(Media).where(Media.tenant_id == tenant_ctx.tenant.id)
    count_query = select(func.count(Media.id)).where(Media.tenant_id == tenant_ctx.tenant.id)
    
    # Filter by exercise
    if exercise_id:
        await _ensure_exercise_in_tenant(db, exercise_id, tenant_ctx.tenant.id)
        query = query.where(Media.exercise_id == exercise_id)
        count_query = count_query.where(Media.exercise_id == exercise_id)
    
    # Filter by MIME type
    if mime_type:
        query = query.where(Media.mime_type.startswith(mime_type))
        count_query = count_query.where(Media.mime_type.startswith(mime_type))
    
    # Search in title, description, filename
    if search:
        search_pattern = f"%{search}%"
        query = query.where(
            or_(
                Media.title.ilike(search_pattern),
                Media.description.ilike(search_pattern),
                Media.original_filename.ilike(search_pattern),
            )
        )
        count_query = count_query.where(
            or_(
                Media.title.ilike(search_pattern),
                Media.description.ilike(search_pattern),
                Media.original_filename.ilike(search_pattern),
            )
        )
    
    # Filter by visibility
    if visibility:
        query = query.where(Media.visibility == visibility)
        count_query = count_query.where(Media.visibility == visibility)
    
    # Filter by tags (PostgreSQL array contains)
    if tags:
        tag_list = [t.strip() for t in tags.split(",")]
        query = query.where(Media.tags.contains(tag_list))
        count_query = count_query.where(Media.tags.contains(tag_list))
    
    # Non-admin users can only see media they have access to
    if current_user.role != UserRole.ADMIN:
        # User can see: their own uploads, global, exercise (if in exercise), team (if in team)
        # This is a simplified version - full implementation would check exercise/team membership
        query = query.where(
            or_(
                Media.visibility == MediaVisibility.GLOBAL,
                Media.uploaded_by == current_user.id,
                Media.visibility == MediaVisibility.EXERCISE,
            )
        )
        count_query = count_query.where(
            or_(
                Media.visibility == MediaVisibility.GLOBAL,
                Media.uploaded_by == current_user.id,
                Media.visibility == MediaVisibility.EXERCISE,
            )
        )
    
    # Get total count
    total_result = await db.execute(count_query)
    total = total_result.scalar()
    
    # Pagination
    offset = (page - 1) * page_size
    query = query.order_by(Media.created_at.desc()).offset(offset).limit(page_size)
    
    result = await db.execute(query)
    media_list = result.scalars().all()
    
    return MediaListResponse(
        media=[MediaResponse.from_media(m) for m in media_list],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("/upload", response_model=UploadResponse, status_code=201)
async def upload_media(
    file: UploadFile = File(...),
    exercise_id: Optional[int] = Query(None),
    owner_team_id: Optional[int] = Query(None),
    title: Optional[str] = Query(None),
    description: Optional[str] = Query(None),
    visibility: MediaVisibility = Query(MediaVisibility.EXERCISE),
    current_user = Depends(require_role(UserRole.ADMIN, UserRole.ANIMATEUR)),
    tenant_ctx: TenantRequestContext = Depends(require_tenant_context),
    db: AsyncSession = Depends(get_db_session),
):
    """Upload a media file."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")

    if exercise_id is not None:
        await _ensure_exercise_in_tenant(db, exercise_id, tenant_ctx.tenant.id)
    if owner_team_id is not None:
        await _ensure_team_in_tenant(db, owner_team_id, tenant_ctx.tenant.id)
    
    try:
        # Read file content
        content = await file.read()
        size = len(content)
        
        # Create a file-like object from content
        from io import BytesIO
        file_obj = BytesIO(content)
        
        # Save file
        media, is_duplicate = await media_service.save_file(
            file=file_obj,
            filename=file.filename,
            size=size,
            uploaded_by=current_user.id,
            tenant_id=tenant_ctx.tenant.id,
            exercise_id=exercise_id,
            owner_team_id=owner_team_id,
            title=title,
            description=description,
            visibility=visibility,
            db=db,
        )
        
        await db.commit()
        await db.refresh(media)
        
        message = "File uploaded successfully"
        if is_duplicate:
            message = "File already exists, created new reference"
        
        return UploadResponse(
            media=MediaResponse.from_media(media),
            is_duplicate=is_duplicate,
            message=message,
        )
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")


@router.get("/{media_id}", response_model=MediaResponse)
async def get_media(
    media_id: int,
    current_user = Depends(require_auth),
    tenant_ctx: TenantRequestContext = Depends(require_tenant_context),
    db: AsyncSession = Depends(get_db_session),
):
    """Get media metadata by ID."""
    result = await db.execute(
        select(Media).where(
            Media.id == media_id,
            Media.tenant_id == tenant_ctx.tenant.id,
        )
    )
    media = result.scalar_one_or_none()
    
    if not media:
        raise HTTPException(status_code=404, detail="Media not found")
    
    return MediaResponse.from_media(media)


@router.patch("/{media_id}", response_model=MediaResponse)
async def update_media(
    media_id: int,
    update_data: MediaUpdate,
    current_user = Depends(require_auth),
    tenant_ctx: TenantRequestContext = Depends(require_tenant_context),
    db: AsyncSession = Depends(get_db_session),
):
    """Update media metadata."""
    result = await db.execute(
        select(Media).where(
            Media.id == media_id,
            Media.tenant_id == tenant_ctx.tenant.id,
        )
    )
    media = result.scalar_one_or_none()
    
    if not media:
        raise HTTPException(status_code=404, detail="Media not found")
    
    # Check permissions - only uploader or admin can update
    if current_user.role != UserRole.ADMIN and media.uploaded_by != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to update this media")
    
    updated_media = await media_service.update_metadata(
        media=media,
        db=db,
        title=update_data.title,
        description=update_data.description,
        tags=update_data.tags,
        visibility=update_data.visibility,
    )
    
    await db.commit()
    
    return MediaResponse.from_media(updated_media)


@router.delete("/{media_id}")
async def delete_media(
    media_id: int,
    hard_delete: bool = Query(False),
    current_user = Depends(require_role(UserRole.ADMIN, UserRole.ANIMATEUR)),
    tenant_ctx: TenantRequestContext = Depends(require_tenant_context),
    db: AsyncSession = Depends(get_db_session),
):
    """Delete media (soft delete by default, hard delete removes file)."""
    result = await db.execute(
        select(Media).where(
            Media.id == media_id,
            Media.tenant_id == tenant_ctx.tenant.id,
        )
    )
    media = result.scalar_one_or_none()
    
    if not media:
        raise HTTPException(status_code=404, detail="Media not found")
    
    # Check permissions - only uploader or admin can delete
    if current_user.role != UserRole.ADMIN and media.uploaded_by != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to delete this media")
    
    file_deleted = await media_service.delete_file(media, db, hard_delete=hard_delete)
    
    await db.commit()
    
    return {
        "message": "Media deleted successfully",
        "file_deleted": file_deleted,
    }


@router.get("/{media_id}/download")
async def download_media(
    media_id: int,
    current_user = Depends(require_auth),
    tenant_ctx: TenantRequestContext = Depends(require_tenant_context),
    db: AsyncSession = Depends(get_db_session),
):
    """Download media file."""
    result = await db.execute(
        select(Media).where(
            Media.id == media_id,
            Media.tenant_id == tenant_ctx.tenant.id,
        )
    )
    media = result.scalar_one_or_none()
    
    if not media:
        raise HTTPException(status_code=404, detail="Media not found")
    
    try:
        file_path, size = media_service.get_file_stream(media)
        
        return FileResponse(
            path=file_path,
            filename=media.original_filename,
            media_type=media.mime_type,
        )
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="File not found on storage")


@router.get("/{media_id}/stream")
async def stream_media(
    media_id: int,
    request: Request,
    current_user = Depends(require_auth),
    tenant_ctx: TenantRequestContext = Depends(require_tenant_context),
    db: AsyncSession = Depends(get_db_session),
):
    """Stream media file with Range support (for video/audio)."""
    result = await db.execute(
        select(Media).where(
            Media.id == media_id,
            Media.tenant_id == tenant_ctx.tenant.id,
        )
    )
    media = result.scalar_one_or_none()
    
    if not media:
        raise HTTPException(status_code=404, detail="Media not found")
    
    # Get range header
    range_header = request.headers.get("range")
    
    try:
        file_path, start, end, total_size = media_service.get_stream_range(media, range_header)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="File not found on storage")
    
    # Calculate content length
    content_length = end - start + 1
    
    # Create file iterator
    def iterfile():
        with open(file_path, "rb") as f:
            f.seek(start)
            remaining = content_length
            while remaining > 0:
                chunk_size = min(8192, remaining)
                data = f.read(chunk_size)
                if not data:
                    break
                remaining -= len(data)
                yield data
    
    # Return partial content response
    from fastapi.responses import Response
    
    headers = {
        "Content-Range": f"bytes {start}-{end}/{total_size}",
        "Accept-Ranges": "bytes",
        "Content-Length": str(content_length),
        "Content-Type": media.mime_type,
    }
    
    return Response(
        content=b"".join(iterfile()),
        status_code=206 if range_header else 200,
        headers=headers,
        media_type=media.mime_type,
    )


@router.get("/{media_id}/preview")
async def preview_media(
    media_id: int,
    current_user = Depends(require_auth),
    tenant_ctx: TenantRequestContext = Depends(require_tenant_context),
    db: AsyncSession = Depends(get_db_session),
):
    """Get media preview (thumbnail for images/videos, first page for PDFs)."""
    result = await db.execute(
        select(Media).where(
            Media.id == media_id,
            Media.tenant_id == tenant_ctx.tenant.id,
        )
    )
    media = result.scalar_one_or_none()
    
    if not media:
        raise HTTPException(status_code=404, detail="Media not found")
    
    # For now, just redirect to the full file
    # TODO: Implement actual thumbnail generation
    try:
        file_path, size = media_service.get_file_stream(media)
        
        return FileResponse(
            path=file_path,
            media_type=media.mime_type,
        )
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="File not found on storage")


@router.get("/by-hash/{sha256}", response_model=MediaResponse)
async def get_media_by_hash(
    sha256: str,
    current_user = Depends(require_auth),
    tenant_ctx: TenantRequestContext = Depends(require_tenant_context),
    db: AsyncSession = Depends(get_db_session),
):
    """Get media by SHA256 hash (for deduplication check)."""
    media = await media_service.find_by_hash(sha256, db, tenant_id=tenant_ctx.tenant.id)
    
    if not media:
        raise HTTPException(status_code=404, detail="Media not found")
    
    return MediaResponse.from_media(media)
