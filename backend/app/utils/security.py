"""Security utilities for authentication and password hashing."""
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

from app.config import get_settings

settings = get_settings()

# Password hasher with recommended settings
ph = PasswordHasher(
    time_cost=3,        # Number of iterations
    memory_cost=65536,  # Memory usage in KiB (64 MB)
    parallelism=4,      # Number of parallel threads
    hash_len=32,        # Hash length
    salt_len=16,        # Salt length
)


def hash_password(password: str) -> str:
    """Hash a password using Argon2id."""
    return ph.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    """Verify a password against its hash."""
    try:
        ph.verify(password_hash, password)
        return True
    except VerifyMismatchError:
        return False


def generate_session_token() -> str:
    """Generate a secure random session token."""
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    """Hash a session token for storage."""
    # Use SHA-256 for token hashing (fast, one-way)
    import hashlib
    return hashlib.sha256(token.encode()).hexdigest()


def create_session_expiry() -> datetime:
    """Create session expiry datetime."""
    return datetime.now(timezone.utc) + timedelta(seconds=settings.session_max_age)


def generate_csrf_token() -> str:
    """Generate a CSRF token."""
    return secrets.token_urlsafe(32)


def sanitize_html(html: str) -> str:
    """Sanitize HTML content to prevent XSS."""
    import bleach
    
    allowed_tags = [
        'a', 'b', 'i', 'u', 'strong', 'em', 'br', 'p', 'div',
        'span', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'ul', 'ol', 'li', 'blockquote', 'pre', 'code',
        'table', 'thead', 'tbody', 'tr', 'th', 'td',
    ]
    
    allowed_attributes = {
        'a': ['href', 'title', 'target'],
        'span': ['style'],
        'div': ['style'],
        'p': ['style'],
    }
    
    return bleach.clean(
        html,
        tags=allowed_tags,
        attributes=allowed_attributes,
        strip=True
    )