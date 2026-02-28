"""Permission system for RBAC.

Permission format: resource:action or scope:resource:action
Examples:
  - platform:users:read       # Global platform permission
  - exercise:5:injects:create # Exercise-scoped permission
  - team:3:messages:read      # Team-scoped permission
"""
from enum import Enum
from typing import Optional
from dataclasses import dataclass

from app.models.user import UserRole
from app.models.exercise_user import ExerciseRole


class Permission(str, Enum):
    """Platform-level permissions."""
    # User management
    USERS_READ = "platform:users:read"
    USERS_CREATE = "platform:users:create"
    USERS_UPDATE = "platform:users:update"
    USERS_DELETE = "platform:users:delete"
    
    # Team management
    TEAMS_READ = "platform:teams:read"
    TEAMS_CREATE = "platform:teams:create"
    TEAMS_UPDATE = "platform:teams:update"
    TEAMS_DELETE = "platform:teams:delete"
    
    # Exercise management (global)
    EXERCISES_READ = "platform:exercises:read"
    EXERCISES_CREATE = "platform:exercises:create"
    EXERCISES_DELETE = "platform:exercises:delete"
    
    # Settings
    SETTINGS_READ = "platform:settings:read"
    SETTINGS_UPDATE = "platform:settings:update"
    
    # Templates
    TEMPLATES_READ = "platform:templates:read"
    TEMPLATES_CREATE = "platform:templates:create"
    TEMPLATES_UPDATE = "platform:templates:update"
    TEMPLATES_DELETE = "platform:templates:delete"
    
    # Audit
    AUDIT_READ = "platform:audit:read"
    AUDIT_EXPORT = "platform:audit:export"


class ExercisePermission(str, Enum):
    """Exercise-scoped permissions."""
    # Exercise control
    EXERCISE_READ = "exercise:read"
    EXERCISE_UPDATE = "exercise:update"
    EXERCISE_START = "exercise:start"
    EXERCISE_PAUSE = "exercise:pause"
    EXERCISE_END = "exercise:end"
    
    # Injects
    INJECTS_READ = "exercise:injects:read"
    INJECTS_CREATE = "exercise:injects:create"
    INJECTS_UPDATE = "exercise:injects:update"
    INJECTS_SEND = "exercise:injects:send"
    INJECTS_DELETE = "exercise:injects:delete"
    
    # Timeline
    TIMELINE_READ = "exercise:timeline:read"
    TIMELINE_ANNOTATE = "exercise:timeline:annotate"
    
    # Webmail
    MAIL_READ_OWN = "exercise:mail:read_own"
    MAIL_READ_ALL = "exercise:mail:read_all"
    MAIL_SEND = "exercise:mail:send"
    MAIL_REPLY = "exercise:mail:reply"
    
    # Twitter
    TWITTER_READ = "exercise:twitter:read"
    TWITTER_POST = "exercise:twitter:post"
    TWITTER_POST_AS_ACTOR = "exercise:twitter:post_as_actor"
    TWITTER_MODERATE = "exercise:twitter:moderate"
    
    # TV
    TV_READ = "exercise:tv:read"
    TV_CONTROL = "exercise:tv:control"
    
    # Actors
    ACTORS_READ = "exercise:actors:read"
    ACTORS_MANAGE = "exercise:actors:manage"
    
    # Media
    MEDIA_READ = "exercise:media:read"
    MEDIA_UPLOAD = "exercise:media:upload"
    MEDIA_MANAGE = "exercise:media:manage"
    
    # Scoring
    SCORE_READ = "exercise:score:read"
    SCORE_WRITE = "exercise:score:write"
    SCORE_EXPORT = "exercise:score:export"
    
    # Decisions
    DECISIONS_READ = "exercise:decisions:read"
    DECISIONS_CREATE = "exercise:decisions:create"
    DECISIONS_UPDATE_OWN = "exercise:decisions:update_own"
    DECISIONS_UPDATE_ALL = "exercise:decisions:update_all"
    
    # Reporting
    REPORTING_READ = "exercise:reporting:read"
    REPORTING_EXPORT = "exercise:reporting:export"


@dataclass
class ResolvedPermission:
    """A resolved permission with scope information."""
    permission: str
    exercise_id: Optional[int] = None
    team_id: Optional[int] = None


# Role-to-permission mappings for global roles
GLOBAL_ROLE_PERMISSIONS: dict[UserRole, set[Permission]] = {
    UserRole.ADMIN: {
        # Admins have all permissions
        Permission.USERS_READ, Permission.USERS_CREATE, Permission.USERS_UPDATE, Permission.USERS_DELETE,
        Permission.TEAMS_READ, Permission.TEAMS_CREATE, Permission.TEAMS_UPDATE, Permission.TEAMS_DELETE,
        Permission.EXERCISES_READ, Permission.EXERCISES_CREATE, Permission.EXERCISES_DELETE,
        Permission.SETTINGS_READ, Permission.SETTINGS_UPDATE,
        Permission.TEMPLATES_READ, Permission.TEMPLATES_CREATE, Permission.TEMPLATES_UPDATE, Permission.TEMPLATES_DELETE,
        Permission.AUDIT_READ, Permission.AUDIT_EXPORT,
    },
    UserRole.ANIMATEUR: {
        Permission.EXERCISES_READ, Permission.EXERCISES_CREATE,
        Permission.TEAMS_READ,
        Permission.TEMPLATES_READ,
    },
    UserRole.OBSERVATEUR: {
        Permission.EXERCISES_READ,
        Permission.TEAMS_READ,
    },
    UserRole.PARTICIPANT: {
        Permission.EXERCISES_READ,
    },
}


# Role-to-permission mappings for exercise-scoped roles
EXERCISE_ROLE_PERMISSIONS: dict[ExerciseRole, set[ExercisePermission]] = {
    ExerciseRole.ANIMATEUR: {
        # Animateurs have full control over their exercises
        ExercisePermission.EXERCISE_READ, ExercisePermission.EXERCISE_UPDATE,
        ExercisePermission.EXERCISE_START, ExercisePermission.EXERCISE_PAUSE, ExercisePermission.EXERCISE_END,
        ExercisePermission.INJECTS_READ, ExercisePermission.INJECTS_CREATE, 
        ExercisePermission.INJECTS_UPDATE, ExercisePermission.INJECTS_SEND, ExercisePermission.INJECTS_DELETE,
        ExercisePermission.TIMELINE_READ, ExercisePermission.TIMELINE_ANNOTATE,
        ExercisePermission.MAIL_READ_ALL, ExercisePermission.MAIL_SEND, ExercisePermission.MAIL_REPLY,
        ExercisePermission.TWITTER_READ, ExercisePermission.TWITTER_POST, 
        ExercisePermission.TWITTER_POST_AS_ACTOR, ExercisePermission.TWITTER_MODERATE,
        ExercisePermission.TV_READ, ExercisePermission.TV_CONTROL,
        ExercisePermission.ACTORS_READ, ExercisePermission.ACTORS_MANAGE,
        ExercisePermission.MEDIA_READ, ExercisePermission.MEDIA_UPLOAD, ExercisePermission.MEDIA_MANAGE,
        ExercisePermission.SCORE_READ, ExercisePermission.SCORE_WRITE, ExercisePermission.SCORE_EXPORT,
        ExercisePermission.DECISIONS_READ, ExercisePermission.DECISIONS_UPDATE_ALL,
        ExercisePermission.REPORTING_READ, ExercisePermission.REPORTING_EXPORT,
    },
    ExerciseRole.OBSERVATEUR: {
        # Observers can read and score
        ExercisePermission.EXERCISE_READ,
        ExercisePermission.INJECTS_READ,
        ExercisePermission.TIMELINE_READ, ExercisePermission.TIMELINE_ANNOTATE,
        ExercisePermission.MAIL_READ_ALL,
        ExercisePermission.TWITTER_READ,
        ExercisePermission.TV_READ,
        ExercisePermission.ACTORS_READ,
        ExercisePermission.MEDIA_READ,
        ExercisePermission.SCORE_READ, ExercisePermission.SCORE_WRITE,
        ExercisePermission.DECISIONS_READ,
        ExercisePermission.REPORTING_READ, ExercisePermission.REPORTING_EXPORT,
    },
    ExerciseRole.JOUEUR: {
        # Players have limited permissions
        ExercisePermission.EXERCISE_READ,
        ExercisePermission.INJECTS_READ,
        ExercisePermission.TIMELINE_READ,
        ExercisePermission.MAIL_READ_OWN, ExercisePermission.MAIL_REPLY,
        ExercisePermission.TWITTER_READ, ExercisePermission.TWITTER_POST,
        ExercisePermission.TV_READ,
        ExercisePermission.MEDIA_READ,
        ExercisePermission.DECISIONS_READ, ExercisePermission.DECISIONS_CREATE, ExercisePermission.DECISIONS_UPDATE_OWN,
    },
}


def has_global_permission(user_role: UserRole, permission: Permission) -> bool:
    """Check if a global role has a specific permission."""
    return permission in GLOBAL_ROLE_PERMISSIONS.get(user_role, set())


def has_exercise_permission(exercise_role: ExerciseRole, permission: ExercisePermission) -> bool:
    """Check if an exercise role has a specific permission."""
    return permission in EXERCISE_ROLE_PERMISSIONS.get(exercise_role, set())


def get_exercise_role_permissions(role: ExerciseRole) -> set[ExercisePermission]:
    """Get all permissions for an exercise role."""
    return EXERCISE_ROLE_PERMISSIONS.get(role, set())


def get_global_role_permissions(role: UserRole) -> set[Permission]:
    """Get all permissions for a global role."""
    return GLOBAL_ROLE_PERMISSIONS.get(role, set())


def resolve_exercise_role(
    user_global_role: UserRole,
    exercise_specific_role: Optional[ExerciseRole],
) -> ExerciseRole:
    """Resolve the effective exercise role for a user.
    
    Rules:
    1. If user has a specific exercise role, use it
    2. Global ADMIN maps to ExerciseRole.ANIMATEUR (but can also act as any role)
    3. Global ANIMATEUR defaults to ExerciseRole.ANIMATEUR
    4. Global OBSERVATEUR defaults to ExerciseRole.OBSERVATEUR
    5. Global PARTICIPANT defaults to ExerciseRole.JOUEUR
    """
    if exercise_specific_role:
        return exercise_specific_role
    
    # Map global role to exercise role
    role_mapping = {
        UserRole.ADMIN: ExerciseRole.ANIMATEUR,  # Admin can do everything
        UserRole.ANIMATEUR: ExerciseRole.ANIMATEUR,
        UserRole.OBSERVATEUR: ExerciseRole.OBSERVATEUR,
        UserRole.PARTICIPANT: ExerciseRole.JOUEUR,
    }
    return role_mapping.get(user_global_role, ExerciseRole.JOUEUR)


def can_access_exercise(
    user_global_role: UserRole,
    exercise_specific_role: Optional[ExerciseRole],
    is_team_member: bool = False,
) -> bool:
    """Check if user can access an exercise at all."""
    # Admins always have access
    if user_global_role == UserRole.ADMIN:
        return True
    
    # Has specific role in exercise
    if exercise_specific_role:
        return True
    
    # Global animateur/observateur have access to all exercises
    if user_global_role in (UserRole.ANIMATEUR, UserRole.OBSERVATEUR):
        return True
    
    # Participants only have access if they're in a team in the exercise
    return is_team_member