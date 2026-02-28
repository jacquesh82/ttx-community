"""Media service for file upload, storage, and streaming."""
import hashlib
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import BinaryIO, Optional

from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models import Media, MediaVisibility, MediaStatus, StorageProvider

settings = get_settings()


class MediaService:
    """Service for handling media files."""
    
    # Allowed MIME types
    ALLOWED_IMAGE_TYPES = {
        "image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml"
    }
    ALLOWED_VIDEO_TYPES = {
        "video/mp4", "video/webm", "video/ogg", "video/quicktime", "video/x-msvideo"
    }
    ALLOWED_AUDIO_TYPES = {
        "audio/mpeg", "audio/wav", "audio/ogg", "audio/webm", "audio/aac"
    }
    ALLOWED_DOC_TYPES = {
        "application/pdf", "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    }
    
    ALL_ALLOWED_TYPES = ALLOWED_IMAGE_TYPES | ALLOWED_VIDEO_TYPES | ALLOWED_AUDIO_TYPES | ALLOWED_DOC_TYPES
    
    # Max file size (200MB default)
    MAX_FILE_SIZE = 200 * 1024 * 1024
    
    def __init__(self, storage_path: Optional[str] = None):
        """Initialize media service."""
        self.storage_path = Path(storage_path or settings.media_storage_path)
        self.storage_path.mkdir(parents=True, exist_ok=True)
    
    def _compute_sha256(self, file: BinaryIO) -> str:
        """Compute SHA256 hash of file content."""
        sha256_hash = hashlib.sha256()
        file.seek(0)
        for chunk in iter(lambda: file.read(8192), b""):
            sha256_hash.update(chunk)
        file.seek(0)
        return sha256_hash.hexdigest()
    
    def _generate_storage_key(self, sha256: str, filename: str) -> str:
        """Generate storage key for a file."""
        # Use first 2 chars of hash for subdirectory to avoid too many files in one dir
        prefix = sha256[:2]
        ext = Path(filename).suffix or ".bin"
        unique_name = f"{sha256}{ext}"
        return f"{prefix}/{unique_name}"
    
    def _get_full_path(self, storage_key: str) -> Path:
        """Get full filesystem path for storage key."""
        return self.storage_path / storage_key
    
    def _is_allowed_type(self, mime_type: str) -> bool:
        """Check if MIME type is allowed."""
        return mime_type in self.ALL_ALLOWED_TYPES
    
    def _detect_mime_type(self, file: BinaryIO, filename: str) -> str:
        """Detect MIME type from file content and extension."""
        import mimetypes
        
        # Try to guess from filename first
        mime_type, _ = mimetypes.guess_type(filename)
        
        if mime_type:
            return mime_type
        
        # Default to octet-stream if unknown
        return "application/octet-stream"
    
    async def save_file(
        self,
        file: BinaryIO,
        filename: str,
        size: int,
        uploaded_by: int,
        tenant_id: Optional[int] = None,
        exercise_id: Optional[int] = None,
        owner_team_id: Optional[int] = None,
        title: Optional[str] = None,
        description: Optional[str] = None,
        tags: Optional[list[str]] = None,
        visibility: MediaVisibility = MediaVisibility.EXERCISE,
        deduplicate: bool = True,
        db: Optional[AsyncSession] = None,
    ) -> tuple[Media, bool]:
        """
        Save a file to storage and create media record.
        
        Returns:
            tuple: (Media instance, is_duplicate boolean)
        """
        # Validate size
        if size > self.MAX_FILE_SIZE:
            raise ValueError(f"File size {size} exceeds maximum {self.MAX_FILE_SIZE}")
        
        # Detect MIME type
        mime_type = self._detect_mime_type(file, filename)
        
        # Validate MIME type
        if not self._is_allowed_type(mime_type):
            raise ValueError(f"MIME type {mime_type} is not allowed")
        
        # Compute hash
        sha256 = self._compute_sha256(file)
        
        # Check for duplicates if db session provided and deduplication enabled
        if db and deduplicate:
            existing = await self.find_by_hash(sha256, db, tenant_id=tenant_id)
            if existing:
                # Create a new reference to existing file
                media = Media(
                    tenant_id=tenant_id,
                    exercise_id=exercise_id,
                    owner_team_id=owner_team_id,
                    filename=existing.filename,
                    original_filename=filename,
                    mime_type=existing.mime_type,
                    size=existing.size,
                    sha256=sha256,
                    storage_key=existing.storage_key,
                    storage_provider=existing.storage_provider,
                    title=title or filename,
                    description=description,
                    tags=tags or [],
                    visibility=visibility,
                    status=MediaStatus.READY,
                    uploaded_by=uploaded_by,
                )
                db.add(media)
                await db.flush()
                return media, True
        
        # Generate storage key
        storage_key = self._generate_storage_key(sha256, filename)
        full_path = self._get_full_path(storage_key)
        
        # Create directory if needed
        full_path.parent.mkdir(parents=True, exist_ok=True)
        
        # Save file
        file.seek(0)
        with open(full_path, "wb") as f:
            while chunk := file.read(8192):
                f.write(chunk)
        
        # Generate unique filename for storage
        storage_filename = f"{uuid.uuid4()}{Path(filename).suffix}"
        
        # Create media record
        media = Media(
            tenant_id=tenant_id,
            exercise_id=exercise_id,
            owner_team_id=owner_team_id,
            filename=storage_filename,
            original_filename=filename,
            mime_type=mime_type,
            size=size,
            sha256=sha256,
            storage_key=storage_key,
            storage_provider=StorageProvider.LOCAL,
            title=title or Path(filename).stem,
            description=description,
            tags=tags or [],
            visibility=visibility,
            status=MediaStatus.READY,
            uploaded_by=uploaded_by,
        )
        
        if db:
            db.add(media)
            await db.flush()
        
        return media, False
    
    async def find_by_hash(
        self,
        sha256: str,
        db: AsyncSession,
        tenant_id: Optional[int] = None,
    ) -> Optional[Media]:
        """Find media by SHA256 hash."""
        query = select(Media).where(Media.sha256 == sha256)
        if tenant_id is not None:
            query = query.where(Media.tenant_id == tenant_id)
        result = await db.execute(query.limit(1))
        return result.scalar_one_or_none()
    
    async def get_by_id(self, media_id: int, db: AsyncSession) -> Optional[Media]:
        """Get media by ID."""
        result = await db.execute(
            select(Media).where(Media.id == media_id)
        )
        return result.scalar_one_or_none()
    
    def get_file_stream(self, media: Media) -> tuple[Path, int]:
        """
        Get file path and size for streaming.
        
        Returns:
            tuple: (file path, file size)
        """
        full_path = self._get_full_path(media.storage_key)
        
        if not full_path.exists():
            raise FileNotFoundError(f"Media file not found: {media.id}")
        
        return full_path, media.size
    
    def get_stream_range(
        self,
        media: Media,
        range_header: Optional[str]
    ) -> tuple[Path, int, int, int]:
        """
        Parse range header and get file info for partial content streaming.
        
        Args:
            media: Media instance
            range_header: HTTP Range header value (e.g., "bytes=0-1023")
        
        Returns:
            tuple: (file path, start byte, end byte, total size)
        """
        full_path, total_size = self.get_file_stream(media)
        
        if not range_header:
            return full_path, 0, total_size - 1, total_size
        
        # Parse range header
        if not range_header.startswith("bytes="):
            return full_path, 0, total_size - 1, total_size
        
        range_spec = range_header[6:]  # Remove "bytes="
        
        if range_spec.startswith("-"):
            # Suffix range: -500 means last 500 bytes
            suffix_length = int(range_spec[1:])
            start = max(0, total_size - suffix_length)
            end = total_size - 1
        elif range_spec.endswith("-"):
            # Open-ended range: 500- means from byte 500 to end
            start = int(range_spec[:-1])
            end = total_size - 1
        else:
            # Specific range: 0-1023
            parts = range_spec.split("-")
            start = int(parts[0])
            end = int(parts[1]) if len(parts) > 1 else total_size - 1
        
        # Clamp values
        start = max(0, start)
        end = min(total_size - 1, end)
        
        return full_path, start, end, total_size
    
    async def delete_file(self, media: Media, db: AsyncSession, hard_delete: bool = False) -> bool:
        """
        Delete media record and optionally the file.
        
        Args:
            media: Media instance to delete
            db: Database session
            hard_delete: If True, also delete the file from storage
        
        Returns:
            bool: True if file was deleted from storage
        """
        file_deleted = False
        
        if hard_delete:
            # Check if other media records reference the same file
            result = await db.execute(
                select(Media).where(
                    and_(
                        Media.sha256 == media.sha256,
                        Media.id != media.id
                    )
                )
            )
            other_references = result.scalars().all()
            
            # Only delete file if no other references
            if not other_references:
                full_path = self._get_full_path(media.storage_key)
                if full_path.exists():
                    full_path.unlink()
                    file_deleted = True
        
        # Delete database record
        await db.delete(media)
        await db.flush()
        
        return file_deleted
    
    async def update_metadata(
        self,
        media: Media,
        db: AsyncSession,
        title: Optional[str] = None,
        description: Optional[str] = None,
        tags: Optional[list[str]] = None,
        visibility: Optional[MediaVisibility] = None,
    ) -> Media:
        """Update media metadata."""
        if title is not None:
            media.title = title
        if description is not None:
            media.description = description
        if tags is not None:
            media.tags = tags
        if visibility is not None:
            media.visibility = visibility
        
        media.updated_at = datetime.now(timezone.utc)
        await db.flush()
        
        return media
    
    def can_access(
        self,
        media: Media,
        user_id: int,
        user_role: str,
        user_team_ids: list[int],
        exercise_id: Optional[int] = None,
    ) -> bool:
        """Check if user can access media based on visibility rules."""
        # Admins can access everything
        if user_role == "admin":
            return True
        
        # Global visibility - everyone can access
        if media.visibility == MediaVisibility.GLOBAL:
            return True
        
        # Check exercise-specific access
        if exercise_id and media.exercise_id == exercise_id:
            if media.visibility == MediaVisibility.EXERCISE:
                return True
        
        # Check team access
        if media.owner_team_id and media.owner_team_id in user_team_ids:
            return True
        
        # Check private access (uploader)
        if media.visibility == MediaVisibility.PRIVATE:
            return media.uploaded_by == user_id
        
        # Check if user is the uploader
        if media.uploaded_by == user_id:
            return True
        
        return False


# Global instance
media_service = MediaService()
