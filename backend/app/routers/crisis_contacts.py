"""CrisisLab Crisis Contacts router.

Manages the crisis contact directory for exercises: CRUD operations,
search with filters, and bulk import from CSV/JSON files.
Contacts represent key stakeholders (authorities, experts, internal staff)
that participants may need to reach during a crisis simulation.
"""
import csv
import io
import json
import re
import secrets
import unicodedata
from typing import Annotated, Optional, List
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, status
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db_session as get_db
from app.models.user import User, UserRole
from app.models.exercise import Exercise, ExerciseTeam
from app.models.crisis_contact import CrisisContact, ContactCategory, ContactPriority
from app.models.team import Team
from app.models.exercise_user import ExerciseUser, ExerciseRole
from app.routers.auth import get_current_user, require_role
from app.utils.security import hash_password
from app.utils.tenancy import current_tenant_id_var

router = APIRouter(prefix="/crisis-contacts", tags=["crisis-contacts"])


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


# === Schemas ===
from pydantic import BaseModel, Field


class CrisisContactSchema(BaseModel):
    """Full representation of a crisis contact returned by the API."""

    id: int = Field(description="Unique contact identifier")
    exercise_id: int = Field(description="ID of the exercise this contact belongs to")
    name: str = Field(description="Full name of the contact person")
    function: str | None = Field(description="Professional title or role, e.g. 'Prefet', 'RSSI'")
    organization: str | None = Field(description="Organization the contact belongs to")
    email: str | None = Field(description="Professional email address")
    phone: str | None = Field(description="Landline phone number")
    mobile: str | None = Field(description="Mobile phone number")
    category: str = Field(description="Contact category: autorite, expert, media, interne, externe, urgence, autre")
    priority: str = Field(description="Contact priority: critical, high, normal, low")
    notes: str | None = Field(description="Free-text notes about the contact")
    availability: str | None = Field(description="Availability window, e.g. '24/7' or '9h-18h'")
    display_name: str = Field(description="Computed display name (name + function)")
    created_at: datetime
    updated_at: datetime

    model_config = {
        "from_attributes": True,
        "json_schema_extra": {
            "example": {
                "id": 1,
                "exercise_id": 42,
                "name": "Jean-Pierre Lemaire",
                "function": "Préfet de Région",
                "organization": "Préfecture de Région",
                "email": "jp.lemaire@prefet.gouv.fr",
                "phone": "01 23 45 67 89",
                "mobile": "06 12 34 56 78",
                "category": "autorite",
                "priority": "critical",
                "notes": "Contact principal pour la gestion de crise CYBER-STORM 2024",
                "availability": "24/7",
                "display_name": "Jean-Pierre Lemaire (Préfet de Région)",
                "created_at": "2024-06-15T09:00:00",
                "updated_at": "2024-06-15T09:00:00",
            }
        }
    }


class CrisisContactCreate(BaseModel):
    """Schema for creating a new crisis contact in an exercise directory."""

    exercise_id: int = Field(..., description="ID of the exercise to attach this contact to")
    name: str = Field(..., min_length=1, max_length=200, description="Full name of the contact", examples=["Dr. Sophie Bernard"])
    function: str | None = Field(None, max_length=200, description="Professional title or role", examples=["Médecin-Chef ARS"])
    organization: str | None = Field(None, max_length=200, description="Organization name", examples=["ARS"])
    email: str | None = Field(None, max_length=255, description="Professional email", examples=["s.bernard@ars.sante.fr"])
    phone: str | None = Field(None, max_length=50, description="Landline phone number", examples=["01 23 45 67 89"])
    mobile: str | None = Field(None, max_length=50, description="Mobile phone number", examples=["06 12 34 56 78"])
    category: str = Field("autre", description="Contact category: autorite, expert, media, interne, externe, urgence, autre", examples=["expert"])
    priority: str = Field("normal", description="Contact priority: critical, high, normal, low", examples=["high"])
    notes: str | None = Field(None, description="Free-text notes", examples=["Experte sanitaire pour le scenario CYBER-STORM 2024"])
    availability: str | None = Field(None, max_length=100, description="Availability window", examples=["9h-18h"])

    model_config = {
        "json_schema_extra": {
            "example": {
                "exercise_id": 42,
                "name": "Dr. Sophie Bernard",
                "function": "Médecin-Chef ARS",
                "organization": "ARS",
                "email": "s.bernard@ars.sante.fr",
                "phone": "01 23 45 67 89",
                "mobile": "06 12 34 56 78",
                "category": "expert",
                "priority": "high",
                "notes": "Experte sanitaire pour le scenario CYBER-STORM 2024",
                "availability": "9h-18h",
            }
        }
    }


class CrisisContactUpdate(BaseModel):
    """Schema for partially updating an existing crisis contact. Only provided fields are updated."""

    name: str | None = Field(None, min_length=1, max_length=200, description="Full name of the contact", examples=["Isabelle Petit"])
    function: str | None = Field(None, max_length=200, description="Professional title or role", examples=["Analyste CERT"])
    organization: str | None = Field(None, max_length=200, description="Organization name", examples=["ANSSI"])
    email: str | None = Field(None, max_length=255, description="Professional email", examples=["i.petit@ssi.gouv.fr"])
    phone: str | None = Field(None, max_length=50, description="Landline phone number", examples=["01 71 75 84 68"])
    mobile: str | None = Field(None, max_length=50, description="Mobile phone number", examples=["06 98 76 54 32"])
    category: str | None = Field(None, description="Contact category", examples=["expert"])
    priority: str | None = Field(None, description="Contact priority", examples=["critical"])
    notes: str | None = Field(None, description="Free-text notes", examples=["Point de contact ANSSI pour la cellule CYBER-STORM 2024"])
    availability: str | None = Field(None, max_length=100, description="Availability window", examples=["24/7"])

    model_config = {
        "json_schema_extra": {
            "example": {
                "name": "Isabelle Petit",
                "function": "Analyste CERT",
                "organization": "ANSSI",
                "priority": "critical",
                "availability": "24/7",
            }
        }
    }


class ImportResult(BaseModel):
    """Result summary returned after a CSV/JSON bulk import of crisis contacts."""

    success: int = Field(description="Number of contacts successfully imported")
    errors: List[dict] = Field(description="List of row-level errors encountered during import")
    total: int = Field(description="Total rows processed (success + errors)")
    users_created: int = Field(0, description="Number of new platform users created from import data")
    users_assigned: int = Field(0, description="Number of users newly assigned to the exercise")
    users_updated: int = Field(0, description="Number of existing exercise assignments updated")
    users_skipped: int = Field(0, description="Number of rows skipped (no identifiable user data)")

    model_config = {
        "json_schema_extra": {
            "example": {
                "success": 12,
                "errors": [{"row": 5, "error": "Name is required"}],
                "total": 13,
                "users_created": 8,
                "users_assigned": 10,
                "users_updated": 2,
                "users_skipped": 0,
            }
        }
    }


def _clean_str(value) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _safe_int(value) -> Optional[int]:
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _parse_bool(value) -> Optional[bool]:
    if isinstance(value, bool):
        return value
    if value is None:
        return None
    lowered = str(value).strip().lower()
    if lowered in {"1", "true", "yes", "oui", "y"}:
        return True
    if lowered in {"0", "false", "no", "non", "n"}:
        return False
    return None


def _slugify_identifier(value: str, fallback: str = "acteur") -> str:
    normalized = unicodedata.normalize("NFKD", value)
    ascii_text = normalized.encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-zA-Z0-9._-]+", "_", ascii_text).strip("._-").lower()
    return slug or fallback


def _parse_exercise_role(value: Optional[str]) -> ExerciseRole:
    role = (value or "").strip().lower()
    aliases = {
        "animateur": ExerciseRole.ANIMATEUR,
        "animator": ExerciseRole.ANIMATEUR,
        "observateur": ExerciseRole.OBSERVATEUR,
        "observer": ExerciseRole.OBSERVATEUR,
        "joueur": ExerciseRole.JOUEUR,
        "player": ExerciseRole.JOUEUR,
        "participant": ExerciseRole.JOUEUR,
    }
    return aliases.get(role, ExerciseRole.JOUEUR)


def _should_import_as_actor(data: dict) -> bool:
    return True


# === Routes ===

@router.get("")
async def list_contacts(
    exercise_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    search: str | None = Query(None, description="Search term for name, function, organization, email"),
    category: str | None = Query(None, description="Filter by category"),
    priority: str | None = Query(None, description="Filter by priority"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
):
    """List crisis contacts for a CrisisLab exercise with search and filters.

    Returns a paginated list of contacts from the exercise's crisis directory.
    Supports full-text search across name, function, organization and email,
    as well as filtering by category (autorite, expert, media, interne, externe,
    urgence, autre) and priority (critical, high, normal, low).
    Results are ordered by priority (critical first) then alphabetically by name.
    """
    # Verify exercise exists
    await _get_exercise_or_404(db, exercise_id)
    
    # Build query
    query = select(CrisisContact).where(CrisisContact.exercise_id == exercise_id)
    
    # Apply search filter
    if search:
        search_term = f"%{search}%"
        query = query.where(
            or_(
                CrisisContact.name.ilike(search_term),
                CrisisContact.function.ilike(search_term),
                CrisisContact.organization.ilike(search_term),
                CrisisContact.email.ilike(search_term),
            )
        )
    
    # Apply category filter
    if category:
        try:
            cat_enum = ContactCategory(category)
            query = query.where(CrisisContact.category == cat_enum)
        except ValueError:
            pass
    
    # Apply priority filter
    if priority:
        try:
            pri_enum = ContactPriority(priority)
            query = query.where(CrisisContact.priority == pri_enum)
        except ValueError:
            pass
    
    # Count total
    count_query = select(func.count(CrisisContact.id)).where(CrisisContact.exercise_id == exercise_id)
    if search:
        search_term = f"%{search}%"
        count_query = count_query.where(
            or_(
                CrisisContact.name.ilike(search_term),
                CrisisContact.function.ilike(search_term),
                CrisisContact.organization.ilike(search_term),
                CrisisContact.email.ilike(search_term),
            )
        )
    if category:
        try:
            cat_enum = ContactCategory(category)
            count_query = count_query.where(CrisisContact.category == cat_enum)
        except ValueError:
            pass
    if priority:
        try:
            pri_enum = ContactPriority(priority)
            count_query = count_query.where(CrisisContact.priority == pri_enum)
        except ValueError:
            pass
    
    total = await db.scalar(count_query)
    
    # Order by priority then name
    query = query.order_by(CrisisContact.priority, CrisisContact.name)
    
    # Paginate
    offset = (page - 1) * page_size
    query = query.offset(offset).limit(page_size)
    
    result = await db.execute(query)
    contacts = result.scalars().all()
    
    # Build response
    items = [
        CrisisContactSchema(
            id=c.id,
            exercise_id=c.exercise_id,
            name=c.name,
            function=c.function,
            organization=c.organization,
            email=c.email,
            phone=c.phone,
            mobile=c.mobile,
            category=c.category.value,
            priority=c.priority.value,
            notes=c.notes,
            availability=c.availability,
            display_name=c.display_name,
            created_at=c.created_at,
            updated_at=c.updated_at,
        )
        for c in contacts
    ]
    
    return {
        "contacts": items,
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.get("/{contact_id}")
async def get_contact(
    contact_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Retrieve a single crisis contact by its ID.

    Returns the full contact details including category, priority,
    availability, and computed display name.
    """
    contact = await db.get(CrisisContact, contact_id)
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")
    
    return CrisisContactSchema(
        id=contact.id,
        exercise_id=contact.exercise_id,
        name=contact.name,
        function=contact.function,
        organization=contact.organization,
        email=contact.email,
        phone=contact.phone,
        mobile=contact.mobile,
        category=contact.category.value,
        priority=contact.priority.value,
        notes=contact.notes,
        availability=contact.availability,
        display_name=contact.display_name,
        created_at=contact.created_at,
        updated_at=contact.updated_at,
    )


@router.post("")
async def create_contact(
    data: CrisisContactCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Create a new crisis contact in the exercise's directory.

    Adds a stakeholder (authority, expert, internal staff, etc.) to the
    crisis contact directory for the specified exercise. Invalid category
    or priority values fall back to 'autre' and 'normal' respectively.
    """
    # Verify exercise exists
    await _get_exercise_or_404(db, data.exercise_id)
    
    # Validate category and priority
    try:
        category = ContactCategory(data.category)
    except ValueError:
        category = ContactCategory.AUTRE
    
    try:
        priority = ContactPriority(data.priority)
    except ValueError:
        priority = ContactPriority.NORMAL
    
    contact = CrisisContact(
        exercise_id=data.exercise_id,
        name=data.name,
        function=data.function,
        organization=data.organization,
        email=data.email,
        phone=data.phone,
        mobile=data.mobile,
        category=category,
        priority=priority,
        notes=data.notes,
        availability=data.availability,
    )
    db.add(contact)
    await db.commit()
    await db.refresh(contact)
    
    return {"id": contact.id, "message": "Contact created"}


@router.put("/{contact_id}")
async def update_contact(
    contact_id: int,
    data: CrisisContactUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Partially update an existing crisis contact.

    Only the fields provided in the request body are modified.
    Omitted fields remain unchanged.
    """
    contact = await db.get(CrisisContact, contact_id)
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")
    
    # Update fields
    if data.name is not None:
        contact.name = data.name
    if data.function is not None:
        contact.function = data.function
    if data.organization is not None:
        contact.organization = data.organization
    if data.email is not None:
        contact.email = data.email
    if data.phone is not None:
        contact.phone = data.phone
    if data.mobile is not None:
        contact.mobile = data.mobile
    if data.category is not None:
        try:
            contact.category = ContactCategory(data.category)
        except ValueError:
            pass
    if data.priority is not None:
        try:
            contact.priority = ContactPriority(data.priority)
        except ValueError:
            pass
    if data.notes is not None:
        contact.notes = data.notes
    if data.availability is not None:
        contact.availability = data.availability
    
    await db.commit()
    
    return {"message": "Contact updated"}


@router.delete("/{contact_id}")
async def delete_contact(
    contact_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Permanently delete a crisis contact from the exercise directory."""
    contact = await db.get(CrisisContact, contact_id)
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")
    
    await db.delete(contact)
    await db.commit()
    
    return {"message": "Contact deleted"}


@router.post("/import")
async def import_contacts(
    exercise_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    file: UploadFile = File(...),
):
    """Bulk-import crisis contacts from a CSV or JSON file.

    Accepts a `.csv` or `.json` file and creates contacts in the exercise
    directory. For CSV, expects a header row with columns: name, function,
    organization, email, phone, mobile, category, priority, notes, availability.
    For JSON, expects either a list of contact objects or an object with a
    'contacts' key. The import also supports creating or assigning platform
    users (via username, email, role, team_name columns) for participant
    provisioning. Returns a detailed ImportResult with success/error counts.
    """
    # Verify exercise exists
    await _get_exercise_or_404(db, exercise_id)
    
    # Read file content
    content = await file.read()
    filename = file.filename or ""
    
    success_count = 0
    errors = []
    users_created = 0
    users_assigned = 0
    users_updated = 0
    users_skipped = 0

    assigned_result = await db.execute(
        select(ExerciseUser).where(ExerciseUser.exercise_id == exercise_id)
    )
    exercise_users_by_user_id = {eu.user_id: eu for eu in assigned_result.scalars().all()}

    teams_result = await db.execute(
        select(Team)
        .join(ExerciseTeam, ExerciseTeam.team_id == Team.id)
        .where(ExerciseTeam.exercise_id == exercise_id)
    )
    exercise_teams = teams_result.scalars().all()
    team_ids_in_exercise = {team.id for team in exercise_teams}
    teams_by_name = {team.name.strip().lower(): team for team in exercise_teams if team.name}

    users_by_id_cache: dict[int, Optional[User]] = {}
    users_by_email_cache: dict[str, Optional[User]] = {}
    users_by_username_cache: dict[str, Optional[User]] = {}

    async def get_user_by_id(user_id: int) -> Optional[User]:
        cached = users_by_id_cache.get(user_id, None)
        if cached is not None:
            return cached
        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        users_by_id_cache[user_id] = user
        if user:
            users_by_email_cache[user.email.lower()] = user
            users_by_username_cache[user.username.lower()] = user
        return user

    async def get_user_by_email(email: str) -> Optional[User]:
        key = email.lower()
        if key in users_by_email_cache:
            return users_by_email_cache[key]
        result = await db.execute(select(User).where(func.lower(User.email) == key))
        user = result.scalar_one_or_none()
        users_by_email_cache[key] = user
        if user:
            users_by_id_cache[user.id] = user
            users_by_username_cache[user.username.lower()] = user
        return user

    async def get_user_by_username(username: str) -> Optional[User]:
        key = username.lower()
        if key in users_by_username_cache:
            return users_by_username_cache[key]
        result = await db.execute(select(User).where(func.lower(User.username) == key))
        user = result.scalar_one_or_none()
        users_by_username_cache[key] = user
        if user:
            users_by_id_cache[user.id] = user
            users_by_email_cache[user.email.lower()] = user
        return user

    async def build_unique_username(seed: str) -> str:
        base = _slugify_identifier(seed)[:50] or "acteur"
        candidate = base
        suffix = 1
        while await get_user_by_username(candidate):
            suffix_text = f"_{suffix}"
            candidate = f"{base[:max(1, 50 - len(suffix_text))]}{suffix_text}"
            suffix += 1
        return candidate

    async def build_unique_email(local_part: str) -> str:
        local = _slugify_identifier(local_part)[:64] or "acteur"
        candidate = local
        suffix = 1
        while await get_user_by_email(f"{candidate}@import.local"):
            suffix_text = f".{suffix}"
            candidate = f"{local[:max(1, 64 - len(suffix_text))]}{suffix_text}"
            suffix += 1
        return f"{candidate}@import.local"

    async def upsert_actor_assignment(source: dict, row_ref: int) -> None:
        nonlocal users_created, users_assigned, users_updated, users_skipped

        if not _should_import_as_actor(source):
            return

        existing_user: Optional[User] = None
        user_id = _safe_int(source.get("user_id"))
        email = _clean_str(source.get("email")) or _clean_str(source.get("user_email"))
        username = _clean_str(source.get("username"))
        display_name = _clean_str(source.get("name"))

        if user_id:
            existing_user = await get_user_by_id(user_id)
        if existing_user is None and email:
            existing_user = await get_user_by_email(email)
        if existing_user is None and username:
            existing_user = await get_user_by_username(username)

        if existing_user is None:
            if not any((display_name, email, username)):
                users_skipped += 1
                return
            unique_username = await build_unique_username(username or display_name or "acteur")
            if email and await get_user_by_email(email):
                email = None
            unique_email = (email.lower() if email else await build_unique_email(unique_username))
            raw_password = _clean_str(source.get("password")) or f"Tmp-{secrets.token_urlsafe(10)}"
            existing_user = User(
                email=unique_email,
                username=unique_username,
                password_hash=hash_password(raw_password),
                role=UserRole.PARTICIPANT,
                is_active=True,
            )
            db.add(existing_user)
            await db.flush()
            users_created += 1
            users_by_id_cache[existing_user.id] = existing_user
            users_by_email_cache[existing_user.email.lower()] = existing_user
            users_by_username_cache[existing_user.username.lower()] = existing_user

        role_value = (
            _clean_str(source.get("role"))
            or _clean_str(source.get("exercise_role"))
            or _clean_str(source.get("participant_role"))
        )
        parsed_role = _parse_exercise_role(role_value)

        raw_team_id = _safe_int(source.get("team_id"))
        raw_team_name = _clean_str(source.get("team_name"))
        resolved_team_id: Optional[int] = None
        if raw_team_id is not None:
            if raw_team_id in team_ids_in_exercise:
                resolved_team_id = raw_team_id
            else:
                errors.append({"row": row_ref, "error": f"Team {raw_team_id} is not attached to exercise"})
        elif raw_team_name:
            matched_team = teams_by_name.get(raw_team_name.lower())
            if matched_team:
                resolved_team_id = matched_team.id
            else:
                errors.append({"row": row_ref, "error": f"Team '{raw_team_name}' not found in exercise"})

        organization = _clean_str(source.get("organization"))
        real_function = _clean_str(source.get("real_function")) or _clean_str(source.get("function"))

        exercise_user = exercise_users_by_user_id.get(existing_user.id)
        if exercise_user is None:
            exercise_user = ExerciseUser(
                exercise_id=exercise_id,
                user_id=existing_user.id,
                role=parsed_role,
                team_id=resolved_team_id,
                organization=organization,
                real_function=real_function,
                assigned_by=current_user.id,
            )
            db.add(exercise_user)
            await db.flush()
            exercise_users_by_user_id[existing_user.id] = exercise_user
            users_assigned += 1
        else:
            exercise_user.role = parsed_role
            if raw_team_id is not None or raw_team_name is not None:
                exercise_user.team_id = resolved_team_id
            if "organization" in source:
                exercise_user.organization = organization
            if "real_function" in source or "function" in source:
                exercise_user.real_function = real_function
            users_updated += 1
    
    if filename.endswith('.json'):
        # Parse JSON
        try:
            data = json.loads(content.decode('utf-8'))
            if isinstance(data, dict) and 'contacts' in data:
                contacts_data = data['contacts']
            elif isinstance(data, list):
                contacts_data = data
            else:
                raise ValueError("Invalid JSON structure")
        except (json.JSONDecodeError, ValueError) as e:
            raise HTTPException(status_code=400, detail=f"Invalid JSON file: {str(e)}")
        
        for i, item in enumerate(contacts_data):
            if not isinstance(item, dict):
                errors.append({"row": i + 1, "error": "Invalid contact object"})
                continue
            try:
                category = ContactCategory(item.get('category', 'autre'))
            except ValueError:
                category = ContactCategory.AUTRE
            
            try:
                priority = ContactPriority(item.get('priority', 'normal'))
            except ValueError:
                priority = ContactPriority.NORMAL
            
            if not item.get('name'):
                errors.append({"row": i + 1, "error": "Name is required"})
                continue
            
            contact = CrisisContact(
                exercise_id=exercise_id,
                name=item.get('name'),
                function=item.get('function'),
                organization=item.get('organization'),
                email=item.get('email'),
                phone=item.get('phone'),
                mobile=item.get('mobile'),
                category=category,
                priority=priority,
                notes=item.get('notes'),
                availability=item.get('availability'),
            )
            db.add(contact)
            await upsert_actor_assignment(item, i + 1)
            success_count += 1
    
    elif filename.endswith('.csv'):
        # Parse CSV
        try:
            text = content.decode('utf-8')
            reader = csv.DictReader(io.StringIO(text))
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid CSV file: {str(e)}")
        
        for i, row in enumerate(reader):
            row_num = i + 2  # +2 for header and 0-index
            
            try:
                category = ContactCategory(row.get('category', 'autre').lower())
            except ValueError:
                category = ContactCategory.AUTRE
            
            try:
                priority = ContactPriority(row.get('priority', 'normal').lower())
            except ValueError:
                priority = ContactPriority.NORMAL
            
            name = row.get('name', '').strip()
            if not name:
                errors.append({"row": row_num, "error": "Name is required"})
                continue
            
            contact = CrisisContact(
                exercise_id=exercise_id,
                name=name,
                function=row.get('function', '').strip() or None,
                organization=row.get('organization', '').strip() or None,
                email=row.get('email', '').strip() or None,
                phone=row.get('phone', '').strip() or None,
                mobile=row.get('mobile', '').strip() or None,
                category=category,
                priority=priority,
                notes=row.get('notes', '').strip() or None,
                availability=row.get('availability', '').strip() or None,
            )
            db.add(contact)
            await upsert_actor_assignment(row, row_num)
            success_count += 1
    
    else:
        raise HTTPException(status_code=400, detail="Unsupported file format. Use CSV or JSON.")
    
    await db.commit()
    
    return ImportResult(
        success=success_count,
        errors=errors,
        total=success_count + len(errors),
        users_created=users_created,
        users_assigned=users_assigned,
        users_updated=users_updated,
        users_skipped=users_skipped,
    )


@router.get("/template/csv")
async def download_template():
    """Download a pre-filled CSV template for bulk contact import.

    Returns a sample CSV file with header row and example data rows
    illustrating the expected format for the import endpoint.
    """
    csv_content = """name,function,organization,email,phone,mobile,category,priority,notes,availability,username,role,team_id,team_name,create_user
Jean Dupont,Directeur,Préfecture,j.dupont@pref.gouv.fr,01 02 03 04 05,06 07 08 09 10,autorite,critical,Contact principal crise,24/7,jdupont,observateur,,,true
Marie Martin,Experte chimie,INERIS,m.martin@ineris.fr,,,expert,high,Intervenant technique risques chimiques,9h-18h,mmartin,joueur,,,true
Paul Leroy,Responsable SOC,DSI,p.leroy@acme.local,01 11 22 33 44,06 00 00 00 01,interne,high,Acteur cellule cyber,24/7,pleroy,joueur,,Equipe Bleue,true"""
    
    from fastapi.responses import Response
    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={
            "Content-Disposition": "attachment; filename=annuaire_template.csv"
        }
    )
