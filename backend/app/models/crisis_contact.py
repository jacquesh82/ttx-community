"""Crisis Contact models for the directory."""
import enum
from datetime import datetime
from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String, Text, func, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class ContactCategory(str, enum.Enum):
    """Category of crisis contact."""
    AUTORITE = "autorite"          # Authorities (prefecture, mayor, etc.)
    EXPERT = "expert"              # Technical experts
    MEDIA = "media"                # Media contacts
    INTERNE = "interne"            # Internal organization
    EXTERNE = "externe"            # External partners
    URGENCE = "urgence"            # Emergency services
    AUTRE = "autre"                # Other


class ContactPriority(str, enum.Enum):
    """Priority level for contacts."""
    CRITICAL = "critical"          # Must be contacted first
    HIGH = "high"                  # Important
    NORMAL = "normal"              # Standard
    LOW = "low"                    # Can wait


class CrisisContact(Base):
    """Crisis contact for the directory."""
    
    __tablename__ = "crisis_contacts"
    __table_args__ = (
        Index('ix_crisis_contacts_exercise_search', 'exercise_id', 'name', 'organization'),
        Index('ix_crisis_contacts_category', 'exercise_id', 'category'),
    )
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    exercise_id: Mapped[int] = mapped_column(Integer, ForeignKey("exercises.id", ondelete="CASCADE"), nullable=False, index=True)
    
    # Core information
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    function: Mapped[str | None] = mapped_column(String(200), nullable=True)
    organization: Mapped[str | None] = mapped_column(String(200), nullable=True)
    
    # Contact details
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    mobile: Mapped[str | None] = mapped_column(String(50), nullable=True)
    
    # Categorization
    category: Mapped[ContactCategory] = mapped_column(Enum(ContactCategory), nullable=False, default=ContactCategory.AUTRE)
    priority: Mapped[ContactPriority] = mapped_column(Enum(ContactPriority), nullable=False, default=ContactPriority.NORMAL)
    
    # Additional info
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    availability: Mapped[str | None] = mapped_column(String(100), nullable=True)  # e.g., "24/7", "9h-18h"
    
    # Metadata
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False
    )
    
    # Relationships
    exercise = relationship("Exercise", back_populates="crisis_contacts")
    
    def __repr__(self) -> str:
        return f"<CrisisContact(id={self.id}, name='{self.name}', category={self.category.value})>"
    
    @property
    def display_name(self) -> str:
        """Return a formatted display name."""
        if self.function and self.organization:
            return f"{self.name} ({self.function}, {self.organization})"
        elif self.function:
            return f"{self.name} ({self.function})"
        elif self.organization:
            return f"{self.name} ({self.organization})"
        return self.name