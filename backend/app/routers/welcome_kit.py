"""CrisisLab Welcome Kit router.

Manages welcome kit templates (Markdown-based) and generates personalized
PDF documents for exercise participants. Templates use ``{{variable}}``
placeholders that are resolved at render time with exercise and user data
(e.g. credentials, role, team). Supports per-user preview/download and
batch PDF generation for all participants of an exercise.
"""
import io
import json
import re
import secrets
from datetime import datetime, timezone
from typing import Optional

import markdown
from weasyprint import HTML, CSS
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db_session
from app.models import (
    Exercise,
    ExerciseUser,
    Team,
    User,
    UserRole,
    WelcomeKitTemplate,
    WelcomeKitKind,
    ExerciseUserCredential,
)
from app.routers.auth import require_auth, require_role
from app.utils.security import hash_password
from app.utils.tenancy import current_tenant_id_var

router = APIRouter(prefix="/welcome-kits", tags=["welcome-kits"])


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


# Default templates
DEFAULT_PLAYER_TEMPLATE = """# Kit de Bienvenue - Joueur

## {{exercise_name}}

**Date:** {{exercise_date}}  
**Lieu:** {{exercise_location}}

---

### Vos identifiants de connexion

| Champ | Valeur |
|-------|--------|
| **Login** | `{{player_login}}` |
| **Mot de passe** | `{{player_password}}` |

---

### Votre rôle dans l'exercice

- **Rôle:** {{player_role}}
- **Fonction:** {{player_function}}
- **Équipe:** {{player_team}}
- **Organisation:** {{organization_name}}

---

### Instructions

1. Connectez-vous à la plateforme avec vos identifiants
2. Vous accéderez à votre interface personnelle
3. Suivez les instructions de votre animateur

**Important:** Ne partagez pas vos identifiants avec d'autres participants.

---

*Ce document est confidentiel et destiné uniquement à {{player_name}}.*
"""

DEFAULT_FACILITATOR_TEMPLATE = """# Kit de Bienvenue - Animateur

## {{exercise_name}}

**Date:** {{exercise_date}}  
**Lieu:** {{exercise_location}}

---

### Vos identifiants de connexion

| Champ | Valeur |
|-------|--------|
| **Login** | `{{player_login}}` |
| **Mot de passe** | `{{player_password}}` |

---

### Votre rôle

- **Rôle:** {{player_role}}
- **Fonction:** {{player_function}}

---

### Responsabilités de l'animateur

1. **Pilotage de l'exercice**
   - Déclencher les injects selon le chronogramme
   - Adapter le scénario en temps réel
   - Gérer les imprévus

2. **Suivi des joueurs**
   - Observer les réactions et décisions
   - Noter les éléments pertinents pour le RETEX

3. **Communication**
   - Annoncer les phases de l'exercice
   - Répondre aux questions des participants

---

### Accès à l'interface d'animation

- **URL:** {{platform_url}}
- **Mode:** Interface animateur

---

*Ce document est confidentiel et destiné uniquement à {{player_name}}.*
"""


class WelcomeKitTemplateCreate(BaseModel):
    """Schema for creating a new welcome kit template."""

    name: str = Field(..., min_length=1, max_length=200, description="Template display name", examples=["Kit joueur standard"])
    kind: WelcomeKitKind = Field(description="Template kind: 'player' for participants, 'facilitator' for animateurs", examples=["player"])
    template_markdown: str = Field(..., min_length=1, description="Markdown content with {{variable}} placeholders. Available variables: exercise_name, exercise_date, exercise_location, player_name, player_login, player_password, player_role, player_function, player_team, organization_name, platform_url")
    variables: Optional[dict] = Field(None, description="Optional metadata describing which variables this template uses")
    is_default: bool = Field(False, description="If true, this template becomes the default for its kind")

    model_config = {
        "json_schema_extra": {
            "example": {
                "name": "Kit joueur standard",
                "kind": "player",
                "template_markdown": "# Bienvenue {{player_name}}\n\n## Exercice : {{exercise_name}}\n\n**Date :** {{exercise_date}}  \n**Lieu :** {{exercise_location}}\n\n---\n\n### Vos identifiants\n\n| Champ | Valeur |\n|-------|--------|\n| **Login** | `{{player_login}}` |\n| **Mot de passe** | `{{player_password}}` |\n\n### Votre role\n\n- **Role :** {{player_role}}\n- **Equipe :** {{player_team}}\n- **Organisation :** {{organization_name}}\n\n---\n\n*Document confidentiel - {{player_name}}*",
                "variables": {
                    "exercise_name": "Nom de l'exercice",
                    "player_name": "Nom complet du participant",
                    "player_login": "Identifiant de connexion",
                    "player_password": "Mot de passe",
                },
                "is_default": False,
            }
        }
    }


class WelcomeKitTemplateUpdate(BaseModel):
    """Schema for partially updating a welcome kit template. Only provided fields are modified."""

    name: Optional[str] = Field(None, min_length=1, max_length=200, description="Updated template name", examples=["Kit animateur"])
    template_markdown: Optional[str] = Field(None, min_length=1, description="Updated Markdown content with {{variable}} placeholders")
    variables: Optional[dict] = Field(None, description="Updated variable metadata")
    is_default: Optional[bool] = Field(None, description="Set or unset as the default template for its kind")

    model_config = {
        "json_schema_extra": {
            "example": {
                "name": "Kit animateur",
                "is_default": True,
            }
        }
    }


AVAILABLE_VARIABLES = {
    "exercise_name": "Nom de l'exercice",
    "exercise_date": "Date planifiée de l'exercice",
    "exercise_location": "Lieu de l'exercice",
    "exercise_type": "Type d'exercice (cyber, ransomware, etc.)",
    "exercise_duration": "Durée prévue",
    "player_name": "Nom complet du participant",
    "player_email": "Email du participant",
    "player_login": "Identifiant de connexion",
    "player_password": "Mot de passe",
    "player_role": "Rôle dans l'exercice (joueur, animateur, observateur)",
    "player_function": "Fonction réelle (ex: DSI, RSSI)",
    "player_team": "Équipe assignée",
    "organization_name": "Nom de l'organisation",
    "platform_url": "URL de la plateforme",
}


async def get_or_create_default_template(db: AsyncSession, kind: WelcomeKitKind) -> WelcomeKitTemplate:
    """Get default template or create one if not exists."""
    result = await db.execute(
        select(WelcomeKitTemplate).where(
            WelcomeKitTemplate.kind == kind,
            WelcomeKitTemplate.is_default == True,
        )
    )
    template = result.scalar_one_or_none()
    
    if not template:
        template = WelcomeKitTemplate(
            name=f"Template {kind.value} par défaut",
            kind=kind,
            template_markdown=DEFAULT_PLAYER_TEMPLATE if kind == WelcomeKitKind.PLAYER else DEFAULT_FACILITATOR_TEMPLATE,
            variables=AVAILABLE_VARIABLES,
            is_default=True,
        )
        db.add(template)
        await db.commit()
        await db.refresh(template)
    
    return template


def render_markdown_template(template: str, context: dict) -> str:
    """Replace {{variable}} placeholders with context values."""
    def replace_match(match):
        var_name = match.group(1).strip()
        value = context.get(var_name, f"{{{{undefined: {var_name}}}}}")
        return str(value) if value is not None else ""
    
    return re.sub(r'\{\{\s*(\w+)\s*\}\}', replace_match, template)


# PDF CSS styles for single user
PDF_STYLES = """
@page {
    size: A4;
    margin: 2cm;
    @bottom-right {
        content: "Page " counter(page) " / " counter(pages);
        font-size: 9pt;
        color: #666;
    }
}

/* Page break between users */
.page-break {
    break-after: page;
    page-break-after: always;
}

/* Last user should not have a blank page after */
.page-break:last-child {
    break-after: avoid;
    page-break-after: avoid;
}

body {
    font-family: 'Helvetica', 'Arial', sans-serif;
    font-size: 11pt;
    line-height: 1.6;
    color: #333;
}

h1 {
    color: #1e3a5f;
    font-size: 22pt;
    border-bottom: 3px solid #1e3a5f;
    padding-bottom: 12px;
    margin-bottom: 20px;
    margin-top: 0;
}

h2 {
    color: #2563eb;
    font-size: 16pt;
    margin-top: 25px;
    margin-bottom: 10px;
}

h3 {
    color: #374151;
    font-size: 13pt;
    margin-top: 20px;
    margin-bottom: 8px;
}

table {
    border-collapse: collapse;
    width: 100%;
    margin: 15px 0;
    font-size: 10pt;
}

th, td {
    border: 1px solid #d1d5db;
    padding: 10px 14px;
    text-align: left;
}

th {
    background-color: #f3f4f6;
    font-weight: bold;
    color: #374151;
}

tr:nth-child(even) {
    background-color: #f9fafb;
}

code {
    background-color: #e5e7eb;
    padding: 3px 8px;
    border-radius: 4px;
    font-family: 'Courier New', monospace;
    font-size: 10pt;
    color: #dc2626;
}

hr {
    border: none;
    border-top: 1px solid #e5e7eb;
    margin: 25px 0;
}

p {
    margin: 10px 0;
}

ul, ol {
    margin: 10px 0;
    padding-left: 25px;
}

li {
    margin: 6px 0;
}

strong {
    color: #1f2937;
}

em {
    color: #4b5563;
}

.password-box {
    background-color: #fef3c7;
    border: 2px solid #f59e0b;
    padding: 15px 20px;
    border-radius: 8px;
    margin: 20px 0;
}

.footer {
    margin-top: 40px;
    padding-top: 15px;
    border-top: 1px solid #e5e7eb;
    font-size: 9pt;
    color: #6b7280;
    text-align: center;
}

.header-logo {
    text-align: center;
    margin-bottom: 30px;
}

.confidential {
    color: #dc2626;
    font-weight: bold;
    font-size: 10pt;
    text-align: center;
    margin-top: 20px;
}
"""


def markdown_to_html(markdown_text: str) -> str:
    """Convert markdown to HTML using the markdown library with tables extension."""
    # Use the markdown library with tables extension
    md = markdown.Markdown(extensions=['tables', 'fenced_code'])
    return md.convert(markdown_text)


def generate_pdf_bytes(html_content: str, title: str = "Kit de bienvenue") -> bytes:
    """Generate a PDF from HTML content using weasyprint."""
    # Create complete HTML document with styles
    full_html = f"""<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>{title}</title>
    <style>{PDF_STYLES}</style>
</head>
<body>
    {html_content}
    <div class="footer">
        Ce document est généré automatiquement - Ne pas distribuer
    </div>
</body>
</html>"""
    
    # Generate PDF using weasyprint
    html_doc = HTML(string=full_html)
    pdf_bytes = html_doc.write_pdf()
    
    return pdf_bytes


@router.get("/templates")
async def list_templates(
    kind: Optional[WelcomeKitKind] = Query(default=None),
    _: User = Depends(require_auth),
    db: AsyncSession = Depends(get_db_session),
):
    """List all welcome kit templates, optionally filtered by kind.

    Returns available templates along with the dictionary of supported
    placeholder variables and their descriptions.
    """
    query = select(WelcomeKitTemplate).order_by(WelcomeKitTemplate.kind, WelcomeKitTemplate.name)
    if kind:
        query = query.where(WelcomeKitTemplate.kind == kind)
    
    result = await db.execute(query)
    templates = result.scalars().all()
    
    return {
        "templates": templates,
        "available_variables": AVAILABLE_VARIABLES,
    }


@router.get("/templates/{template_id}")
async def get_template(
    template_id: int,
    _: User = Depends(require_auth),
    db: AsyncSession = Depends(get_db_session),
):
    """Retrieve a single welcome kit template by ID, including its full Markdown content."""
    result = await db.execute(select(WelcomeKitTemplate).where(WelcomeKitTemplate.id == template_id))
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    return template


@router.post("/templates", status_code=201)
async def create_template(
    data: WelcomeKitTemplateCreate,
    current_user: User = Depends(require_role(UserRole.ADMIN, UserRole.ANIMATEUR)),
    db: AsyncSession = Depends(get_db_session),
):
    """Create a new welcome kit template.

    The template_markdown field supports Markdown with ``{{variable}}``
    placeholders that will be resolved at render time. Use the
    ``/templates`` GET endpoint to see all available variables.
    Requires admin or animateur role.
    """
    template = WelcomeKitTemplate(
        name=data.name,
        kind=data.kind,
        template_markdown=data.template_markdown,
        variables=data.variables,
        is_default=data.is_default,
        created_by=current_user.id,
    )
    db.add(template)
    await db.commit()
    await db.refresh(template)
    return template


@router.put("/templates/{template_id}")
async def update_template(
    template_id: int,
    data: WelcomeKitTemplateUpdate,
    current_user: User = Depends(require_role(UserRole.ADMIN, UserRole.ANIMATEUR)),
    db: AsyncSession = Depends(get_db_session),
):
    """Partially update a welcome kit template.

    Only provided fields are modified. Requires admin or animateur role.
    """
    result = await db.execute(select(WelcomeKitTemplate).where(WelcomeKitTemplate.id == template_id))
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    
    if data.name is not None:
        template.name = data.name
    if data.template_markdown is not None:
        template.template_markdown = data.template_markdown
    if data.variables is not None:
        template.variables = data.variables
    if data.is_default is not None:
        template.is_default = data.is_default
    
    await db.commit()
    await db.refresh(template)
    return template


@router.delete("/templates/{template_id}", status_code=204)
async def delete_template(
    template_id: int,
    _: User = Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db_session),
):
    """Permanently delete a welcome kit template.

    Default templates cannot be deleted. Requires admin role.
    """
    result = await db.execute(select(WelcomeKitTemplate).where(WelcomeKitTemplate.id == template_id))
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    
    if template.is_default:
        raise HTTPException(status_code=400, detail="Cannot delete default template")
    
    await db.delete(template)
    await db.commit()
    return Response(status_code=204)


@router.get("/exercises/{exercise_id}/preview/{user_id}")
async def preview_welcome_kit(
    exercise_id: int,
    user_id: int,
    kind: WelcomeKitKind = Query(default=WelcomeKitKind.PLAYER),
    template_id: Optional[int] = Query(default=None),
    _: User = Depends(require_auth),
    db: AsyncSession = Depends(get_db_session),
):
    """Preview a welcome kit as rendered HTML for a specific exercise participant.

    Resolves all ``{{variable}}`` placeholders using the exercise and user
    context (credentials, role, team, etc.) and returns both the rendered
    Markdown and the final HTML. Useful for reviewing the kit before
    generating the PDF.
    """
    # Get exercise
    exercise = await _get_exercise_or_404(db, exercise_id)
    
    # Get exercise user
    eu_result = await db.execute(
        select(ExerciseUser).where(
            ExerciseUser.exercise_id == exercise_id,
            ExerciseUser.user_id == user_id,
        )
    )
    eu = eu_result.scalar_one_or_none()
    if not eu:
        raise HTTPException(status_code=404, detail="User not found in exercise")
    
    # Get user
    user_result = await db.execute(select(User).where(User.id == user_id))
    user = user_result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Get template
    if template_id:
        template_result = await db.execute(select(WelcomeKitTemplate).where(WelcomeKitTemplate.id == template_id))
        template = template_result.scalar_one_or_none()
        if not template:
            raise HTTPException(status_code=404, detail="Template not found")
    else:
        template = await get_or_create_default_template(db, kind)
    
    # Get team
    team_name = ""
    if eu.team_id:
        team_result = await db.execute(select(Team).where(Team.id == eu.team_id))
        team = team_result.scalar_one_or_none()
        team_name = team.name if team else ""
    
    # Get password
    cred_result = await db.execute(
        select(ExerciseUserCredential).where(
            ExerciseUserCredential.exercise_id == exercise_id,
            ExerciseUserCredential.user_id == user_id,
        )
    )
    cred = cred_result.scalar_one_or_none()
    password = cred.plain_password if cred else "***"
    
    # Build context
    context = {
        "exercise_name": exercise.name,
        "exercise_date": exercise.planned_date.strftime("%d/%m/%Y %H:%M") if exercise.planned_date else "Non définie",
        "exercise_location": exercise.location or "Non défini",
        "exercise_type": exercise.exercise_type if exercise.exercise_type else "",
        "exercise_duration": f"{exercise.target_duration_hours}h" if exercise.target_duration_hours else "",
        "player_name": user.username,
        "player_email": user.email,
        "player_login": user.username,
        "player_password": password,
        "player_role": eu.role.value if eu.role else "joueur",
        "player_function": eu.real_function or "",
        "player_team": team_name,
        "organization_name": eu.organization or "",
        "platform_url": "http://localhost:5173",  # TODO: make configurable
    }
    
    rendered = render_markdown_template(template.template_markdown, context)
    html = markdown_to_html(rendered)
    
    return {
        "template_id": template.id,
        "template_name": template.name,
        "context": context,
        "rendered_markdown": rendered,
        "rendered_html": html,
    }


@router.get("/exercises/{exercise_id}/generate/{user_id}")
async def generate_user_welcome_kit_pdf(
    exercise_id: int,
    user_id: int,
    kind: WelcomeKitKind = Query(default=WelcomeKitKind.PLAYER),
    template_id: Optional[int] = Query(default=None),
    _: User = Depends(require_auth),
    db: AsyncSession = Depends(get_db_session),
):
    """Generate and download a personalized welcome kit PDF for a single participant.

    Renders the template with user-specific data and returns a styled A4 PDF
    document as a file download.
    """
    # Get preview data
    preview_data = await preview_welcome_kit(exercise_id, user_id, kind, template_id, _, db)
    
    html_content = preview_data["rendered_html"]
    context = preview_data["context"]
    
    # Wrap with CSS
    styled_html = f"""
    <html>
    <head>
        <style>
            body {{ font-family: Helvetica, Arial, sans-serif; margin: 40px; }}
            h1 {{ color: #1e3a5f; font-size: 24px; border-bottom: 2px solid #1e3a5f; padding-bottom: 10px; }}
            h2 {{ color: #2563eb; font-size: 18px; margin-top: 20px; }}
            h3 {{ color: #374151; font-size: 14px; margin-top: 15px; }}
            table {{ border-collapse: collapse; width: 100%; margin: 15px 0; }}
            th, td {{ border: 1px solid #d1d5db; padding: 8px 12px; text-align: left; }}
            th {{ background-color: #f3f4f6; }}
            code {{ background-color: #f3f4f6; padding: 2px 6px; border-radius: 4px; }}
            hr {{ border: none; border-top: 1px solid #e5e7eb; margin: 20px 0; }}
            p {{ margin: 10px 0; line-height: 1.5; }}
            ul {{ margin: 10px 0; padding-left: 20px; }}
            li {{ margin: 5px 0; }}
            .password-box {{ background-color: #fef3c7; border: 1px solid #f59e0b; padding: 15px; border-radius: 8px; margin: 15px 0; }}
            .footer {{ margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #6b7280; }}
        </style>
    </head>
    <body>
        {html_content}
    </body>
    </html>
    """
    
    # For now, return HTML that can be printed as PDF
    # In production, use weasyprint or similar
    pdf_bytes = generate_pdf_bytes(styled_html, f"Kit de bienvenue - {context['player_name']}")
    
    filename = f"kit-bienvenue-{context['player_login']}.pdf"
    
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/exercises/{exercise_id}/generate-all")
async def generate_all_welcome_kits(
    exercise_id: int,
    kind: WelcomeKitKind = Query(default=WelcomeKitKind.PLAYER),
    template_id: Optional[int] = Query(default=None),
    current_user: User = Depends(require_role(UserRole.ADMIN, UserRole.ANIMATEUR)),
    db: AsyncSession = Depends(get_db_session),
):
    """Prepare welcome kit generation for all matching participants of an exercise.

    Filters participants by role based on the requested kind (player or
    facilitator), ensures each has stored credentials, and returns a summary
    of who will receive a kit. Requires admin or animateur role.
    """
    # Get exercise
    exercise = await _get_exercise_or_404(db, exercise_id)
    
    # Get all exercise users
    eu_result = await db.execute(
        select(ExerciseUser).where(ExerciseUser.exercise_id == exercise_id)
    )
    exercise_users = eu_result.scalars().all()
    
    if not exercise_users:
        raise HTTPException(status_code=400, detail="No participants in this exercise")
    
    generated = []
    skipped = []
    
    for eu in exercise_users:
        # Filter by role based on kind
        if kind == WelcomeKitKind.PLAYER and eu.role.value not in ["joueur", "participant"]:
            skipped.append({"user_id": eu.user_id, "reason": "wrong role"})
            continue
        if kind == WelcomeKitKind.FACILITATOR and eu.role.value not in ["animateur", "admin"]:
            skipped.append({"user_id": eu.user_id, "reason": "wrong role"})
            continue
        
        # Ensure password exists
        cred_result = await db.execute(
            select(ExerciseUserCredential).where(
                ExerciseUserCredential.exercise_id == exercise_id,
                ExerciseUserCredential.user_id == eu.user_id,
            )
        )
        cred = cred_result.scalar_one_or_none()
        
        if not cred:
            # Generate a password if not exists
            temp_password = f"Tmp-{secrets.token_urlsafe(8)}"
            cred = ExerciseUserCredential(
                exercise_id=exercise_id,
                user_id=eu.user_id,
                plain_password=temp_password,
            )
            db.add(cred)
        
        generated.append({
            "user_id": eu.user_id,
            "exercise_user_id": eu.id,
            "role": eu.role.value,
        })
    
    await db.commit()
    
    return {
        "message": f"Ready to generate {len(generated)} welcome kits",
        "exercise_id": exercise_id,
        "kind": kind.value,
        "generated_count": len(generated),
        "skipped_count": len(skipped),
        "participants": generated,
        "skipped": skipped,
    }


@router.post("/exercises/{exercise_id}/download-all")
async def download_all_welcome_kits(
    exercise_id: int,
    kind: WelcomeKitKind = Query(default=WelcomeKitKind.PLAYER),
    template_id: Optional[int] = Query(default=None),
    current_user: User = Depends(require_role(UserRole.ADMIN, UserRole.ANIMATEUR)),
    db: AsyncSession = Depends(get_db_session),
):
    """Download all welcome kits as a single multi-page PDF (one page per participant).

    Generates a combined PDF document with page breaks between each
    participant's kit. The file is named with the exercise ID, kind, and
    a timestamp. Requires admin or animateur role.
    """
    # Get list of participants
    participants_data = await generate_all_welcome_kits(exercise_id, kind, template_id, current_user, db)
    
    if not participants_data["participants"]:
        raise HTTPException(status_code=400, detail="No participants to generate kits for")
    
    # Get exercise for filename
    exercise = await _get_exercise_or_404(db, exercise_id)
    exercise_name = exercise.name if exercise else f"Exercise {exercise_id}"
    
    # Build HTML content for all users with page breaks
    all_users_html = []
    
    for i, participant in enumerate(participants_data["participants"]):
        # Get user info
        user_result = await db.execute(select(User).where(User.id == participant["user_id"]))
        user = user_result.scalar_one_or_none()
        if not user:
            continue
        
        # Get preview data for this user
        preview = await preview_welcome_kit(
            exercise_id,
            participant["user_id"],
            kind,
            template_id,
            current_user,
            db,
        )
        
        html_content = preview["rendered_html"]
        
        # Add page break for all users except the last one
        is_last = (i == len(participants_data["participants"]) - 1)
        page_break_div = "" if is_last else '<div class="page-break"></div>'
        
        # Wrap each user's content in a container
        user_html = f"""
    <div class="user-kit">
        {html_content}
        <div class="footer">
            Ce document est confidentiel - Destiné à {user.username}
        </div>
    </div>
    {page_break_div}"""
        
        all_users_html.append(user_html)
    
    # Combine all HTML into a single document
    combined_html = f"""<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Kits de bienvenue - {exercise_name}</title>
    <style>{PDF_STYLES}</style>
</head>
<body>
    {''.join(all_users_html)}
</body>
</html>"""
    
    # Generate single PDF using weasyprint
    html_doc = HTML(string=combined_html)
    pdf_bytes = html_doc.write_pdf()
    
    # Generate filename
    kind_label = "joueurs" if kind == WelcomeKitKind.PLAYER else "animateurs"
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    filename = f"kits-{kind_label}-{exercise_id}-{timestamp}.pdf"
    
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/exercises/{exercise_id}/ensure-passwords")
async def ensure_passwords_for_exercise(
    exercise_id: int,
    current_user: User = Depends(require_role(UserRole.ADMIN, UserRole.ANIMATEUR)),
    db: AsyncSession = Depends(get_db_session),
):
    """Ensure all exercise participants have stored credentials for welcome kit generation.

    Iterates over all exercise users and generates a temporary password for
    any participant that does not already have one stored. Existing passwords
    are preserved. Returns counts of created vs. existing credentials.
    Requires admin or animateur role.
    """
    # Get all exercise users
    eu_result = await db.execute(
        select(ExerciseUser).where(ExerciseUser.exercise_id == exercise_id)
    )
    exercise_users = eu_result.scalars().all()
    
    created = 0
    existing = 0
    
    for eu in exercise_users:
        cred_result = await db.execute(
            select(ExerciseUserCredential).where(
                ExerciseUserCredential.exercise_id == exercise_id,
                ExerciseUserCredential.user_id == eu.user_id,
            )
        )
        cred = cred_result.scalar_one_or_none()
        
        if cred:
            existing += 1
        else:
            # Generate password
            temp_password = f"Ex{exercise_id}-{secrets.token_urlsafe(6)}"
            cred = ExerciseUserCredential(
                exercise_id=exercise_id,
                user_id=eu.user_id,
                plain_password=temp_password,
            )
            db.add(cred)
            created += 1
    
    await db.commit()
    
    return {
        "message": f"Passwords ready for exercise {exercise_id}",
        "created": created,
        "existing": existing,
        "total": len(exercise_users),
    }
