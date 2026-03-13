"""Application configuration using Pydantic Settings."""
from functools import lru_cache
from pathlib import Path
from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )
    
    # Database
    database_url: str = "postgresql+asyncpg://ttx:ttx_dev_password@localhost:5432/ttx"
    
    # Security
    session_secret: str = "change_me_in_production_min_32_chars"
    session_max_age: int = 86400  # 24 hours
    csrf_token_name: str = "csrf_token"
    base_domain: str = "localhost"
    platform_admin_subdomain: str = "admin"
    default_tenant_slug: str = "default"
    ws_ticket_ttl_seconds: int = 60
    
    # Rate limiting
    login_max_attempts: int = 5
    login_lockout_minutes: int = 15
    
    # CORS
    cors_origins: str = "http://localhost:5173,http://localhost:80"
    
    # Environment
    environment: str = "development"
    edition: str = "community"

    @property
    def is_community(self) -> bool:
        return self.edition == "community"

    # Media storage
    media_storage_path: str = "/app/media"
    inject_bank_schema_path: str = str(
        Path(__file__).resolve().parent / "resources" / "schemas" / "inject-bank-item.schema.json"
    )
    max_upload_size: int = 50 * 1024 * 1024  # 50 MB
    allowed_mime_types: List[str] = [
        "image/jpeg", "image/png", "image/gif", "image/webp",
        "application/pdf",
        "video/mp4", "video/webm",
        "text/plain", "text/csv",
    ]
    
    @property
    def cors_origins_list(self) -> List[str]:
        """Parse CORS origins from comma-separated string."""
        return [origin.strip() for origin in self.cors_origins.split(",")]
    
    @property
    def is_production(self) -> bool:
        """Check if running in production."""
        return self.environment == "production"


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
