"""CrisisLab Media router.

Handles file upload, metadata management, download, streaming (with HTTP Range
support for video/audio), and preview for media assets used in crisis simulation
exercises. Supports deduplication via SHA-256 hashing, tag-based filtering,
and visibility scoping (global, exercise, team).
"""
from datetime import datetime, timezone
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Request
from fastapi.responses import StreamingResponse, FileResponse
from pydantic import BaseModel, Field
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
    """Base media schema with common metadata fields."""

    title: Optional[str] = Field(None, description="Human-readable title for the media asset", examples=["Rapport SOC incident ransomware"])
    description: Optional[str] = Field(None, description="Detailed description of the media content", examples=["Capture de la note de rancon affichee sur le poste DSI-PC042"])
    tags: Optional[List[str]] = Field(None, description="List of tags for categorization and search", examples=[["SOC", "incident"]])
    visibility: MediaVisibility = Field(MediaVisibility.EXERCISE, description="Visibility scope: global, exercise, or team")


class MediaCreate(MediaBase):
    """Schema for creating media via upload. Extends MediaBase with exercise and team ownership."""

    exercise_id: Optional[int] = Field(None, description="Exercise to attach this media to")
    owner_team_id: Optional[int] = Field(None, description="Team that owns this media (for team-scoped visibility)")

    model_config = {
        "json_schema_extra": {
            "example": {
                "title": "Rapport SOC incident ransomware",
                "description": "Rapport d'analyse SOC suite a la detection du ransomware CYBER-STORM 2024 chez Duval Industries",
                "tags": ["SOC", "incident"],
                "visibility": "exercise",
                "exercise_id": 42,
                "owner_team_id": None,
            }
        }
    }


class MediaUpdate(BaseModel):
    """Schema for partially updating media metadata. Only provided fields are modified."""

    title: Optional[str] = Field(None, description="Updated title", examples=["Screenshot note de rancon - poste DSI-PC042"])
    description: Optional[str] = Field(None, description="Updated description")
    tags: Optional[List[str]] = Field(None, description="Replacement tag list", examples=[["forensique", "preuve"]])
    visibility: Optional[MediaVisibility] = Field(None, description="Updated visibility scope")

    model_config = {
        "json_schema_extra": {
            "example": {
                "title": "Screenshot note de rancon - poste DSI-PC042",
                "tags": ["forensique", "preuve"],
            }
        }
    }


class MediaResponse(BaseModel):
    """Full media object returned by the API, including file metadata and computed type flags."""

    id: int = Field(description="Unique media identifier")
    exercise_id: Optional[int] = Field(description="Exercise this media is attached to, if any")
    owner_team_id: Optional[int] = Field(description="Team that owns this media, if any")
    filename: str = Field(description="Server-side stored filename (UUID-based)", examples=["a1b2c3d4-rapport_soc_incident.pdf"])
    original_filename: str = Field(description="Original filename as uploaded by the user", examples=["rapport_soc_incident.pdf"])
    mime_type: str = Field(description="MIME type of the file", examples=["application/pdf"])
    size: int = Field(description="File size in bytes", examples=[245760])
    sha256: str = Field(description="SHA-256 hash of the file content for deduplication")
    title: Optional[str] = Field(description="Human-readable title")
    description: Optional[str] = Field(description="Detailed description")
    tags: Optional[List[str]] = Field(description="List of tags")
    visibility: MediaVisibility = Field(description="Visibility scope")
    status: MediaStatus = Field(description="Processing status of the media")
    uploaded_by: int = Field(description="User ID of the uploader")
    created_at: datetime
    updated_at: datetime

    # Computed properties
    is_image: bool = Field(False, description="True if mime_type starts with image/")
    is_video: bool = Field(False, description="True if mime_type starts with video/")
    is_audio: bool = Field(False, description="True if mime_type starts with audio/")
    is_pdf: bool = Field(False, description="True if mime_type is application/pdf")

    model_config = {
        "from_attributes": True,
        "json_schema_extra": {
            "example": {
                "id": 7,
                "exercise_id": 42,
                "owner_team_id": None,
                "filename": "a1b2c3d4-rapport_soc_incident.pdf",
                "original_filename": "rapport_soc_incident.pdf",
                "mime_type": "application/pdf",
                "size": 245760,
                "sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
                "title": "Rapport SOC incident ransomware",
                "description": "Rapport d'analyse SOC - exercice CYBER-STORM 2024 Duval Industries",
                "tags": ["SOC", "incident"],
                "visibility": "exercise",
                "status": "ready",
                "uploaded_by": 3,
                "created_at": "2024-06-15T10:30:00",
                "updated_at": "2024-06-15T10:30:00",
                "is_image": False,
                "is_video": False,
                "is_audio": False,
                "is_pdf": True,
            }
        },
    }
    
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
    """Paginated list of media assets."""

    media: List[MediaResponse] = Field(description="List of media objects for the current page")
    total: int = Field(description="Total number of matching media across all pages")
    page: int = Field(description="Current page number (1-based)")
    page_size: int = Field(description="Number of items per page")


class UploadResponse(BaseModel):
    """Response returned after a successful file upload, including deduplication info."""

    media: MediaResponse = Field(description="The created (or deduplicated) media object")
    is_duplicate: bool = Field(description="True if an identical file (same SHA-256) already existed")
    message: str = Field(description="Human-readable status message", examples=["File uploaded successfully"])

    model_config = {
        "json_schema_extra": {
            "example": {
                "media": {
                    "id": 7,
                    "exercise_id": 42,
                    "owner_team_id": None,
                    "filename": "b5e6f7g8-screenshot_ransom_note.png",
                    "original_filename": "screenshot_ransom_note.png",
                    "mime_type": "image/png",
                    "size": 524288,
                    "sha256": "abc123def456...",
                    "title": None,
                    "description": None,
                    "tags": None,
                    "visibility": "exercise",
                    "status": "ready",
                    "uploaded_by": 3,
                    "created_at": "2024-06-15T10:35:00",
                    "updated_at": "2024-06-15T10:35:00",
                    "is_image": True,
                    "is_video": False,
                    "is_audio": False,
                    "is_pdf": False,
                },
                "is_duplicate": False,
                "message": "File uploaded successfully",
            }
        }
    }


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
    """List media files with filters and pagination.

    Returns a paginated list of media assets scoped to the current tenant.
    Supports filtering by exercise, MIME type prefix (e.g. 'image/', 'application/pdf'),
    visibility level, and comma-separated tags. Full-text search spans title,
    description, and original filename. Non-admin users only see global,
    exercise-scoped, or their own uploads.
    """
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
    """Upload a media file to the CrisisLab media library.

    Stores the file on disk, computes its SHA-256 hash for deduplication,
    and creates a Media record. If an identical file already exists
    (same hash), a new reference is created without duplicating storage.
    Requires admin or animateur role.
    """
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
    """Retrieve media metadata by ID.

    Returns the full media object including file info, tags, visibility,
    and computed type flags (is_image, is_video, is_audio, is_pdf).
    """
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
    """Partially update media metadata (title, description, tags, visibility).

    Only the uploader or an admin can modify a media asset.
    Only provided fields are updated; omitted fields remain unchanged.
    """
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
    """Delete a media asset (soft delete by default).

    Soft delete marks the media as deleted but preserves the file on disk.
    Pass `hard_delete=true` to permanently remove the file from storage.
    Only the uploader or an admin can delete. Requires admin or animateur role.
    """
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
    """Download a media file as an attachment.

    Returns the file with its original filename in the Content-Disposition header,
    triggering a browser download.
    """
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
    """Stream a media file with HTTP Range support for video/audio playback.

    Supports partial content requests (HTTP 206) allowing browsers to seek
    within video and audio files. Returns the full file (HTTP 200) when no
    Range header is provided.
    """
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
    """Get a preview of the media asset.

    Currently returns the full file. Future versions will generate thumbnails
    for images/videos and render the first page for PDFs.
    """
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
    """Look up a media asset by its SHA-256 hash.

    Useful for client-side deduplication: compute the hash before uploading
    and check if the file already exists in the library.
    """
    media = await media_service.find_by_hash(sha256, db, tenant_id=tenant_ctx.tenant.id)
    
    if not media:
        raise HTTPException(status_code=404, detail="Media not found")
    
    return MediaResponse.from_media(media)
