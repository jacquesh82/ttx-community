#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

# shellcheck source=scripts/lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"

usage() {
  cat <<'EOF'
Usage:
  ./scripts/create_tenant.sh <slug> <name> [options]

Options:
  --domain <domain>           Domain mapping to create (default: <slug>.localhost)
  --no-domain                 Do not create a tenant_domains row
  --no-bootstrap-admin        Do not clone an admin user from the source tenant
  --source-tenant <slug>      Source tenant for admin cloning (default: default)
  --source-admin <username>   Clone this specific user from the source tenant
  --help, -h                  Show this help

Behavior:
  - Creates the tenant (or reuses it if slug exists)
  - Creates a tenant_domains mapping (unless --no-domain)
  - By default clones one admin/animateur from the source tenant with the same password hash

Examples:
  ./scripts/create_tenant.sh aphp "APHP"
  ./scripts/create_tenant.sh acme "ACME" --domain acme.localhost --source-admin admin
EOF
}

SLUG="${1:-}"
NAME="${2:-}"
DOMAIN=""
CREATE_DOMAIN=true
BOOTSTRAP_ADMIN=true
SOURCE_TENANT_SLUG="default"
SOURCE_ADMIN_USERNAME=""

if [[ -z "$SLUG" ]] || [[ "$SLUG" == "--help" ]] || [[ "$SLUG" == "-h" ]]; then
  usage
  exit 0
fi

if [[ -z "$NAME" ]]; then
  print_error "Missing tenant name"
  usage
  exit 1
fi

shift 2
while [[ $# -gt 0 ]]; do
  case "$1" in
    --domain)
      DOMAIN="${2:-}"
      shift 2
      ;;
    --no-domain)
      CREATE_DOMAIN=false
      shift
      ;;
    --no-bootstrap-admin)
      BOOTSTRAP_ADMIN=false
      shift
      ;;
    --source-tenant)
      SOURCE_TENANT_SLUG="${2:-}"
      shift 2
      ;;
    --source-admin)
      SOURCE_ADMIN_USERNAME="${2:-}"
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      print_error "Unknown option: $1"
      usage
      exit 1
      ;;
  esac
done

if [[ -z "$DOMAIN" ]]; then
  DOMAIN="${SLUG}.localhost"
fi

if [[ ! "$SLUG" =~ ^[a-z0-9][a-z0-9-]{0,62}$ ]]; then
  print_error "Invalid slug '$SLUG' (allowed: lowercase letters, digits, hyphen, max 63 chars)"
  exit 1
fi

if [[ ! -f "$PROJECT_ROOT/docker-compose.yml" ]]; then
  print_error "docker-compose.yml not found (run from project root)"
  exit 1
fi

detect_compose

PSQL_BASE=(exec -T postgres psql -U ttx -d ttx -v ON_ERROR_STOP=1)

psql_scalar() {
  local sql="$1"
  run_compose "${PSQL_BASE[@]}" -Atc "$sql"
}

psql_exec() {
  local sql="$1"
  run_compose "${PSQL_BASE[@]}" -c "$sql"
}

print_info "Creating/reusing tenant '$SLUG' ('$NAME')"

psql_exec "
SELECT setval(
  pg_get_serial_sequence('tenants', 'id'),
  GREATEST((SELECT COALESCE(MAX(id), 1) FROM tenants), 1),
  true
);"

TENANT_ID="$(psql_scalar "
WITH upsert AS (
  INSERT INTO tenants (slug, name, status, plan, is_active, primary_domain)
  VALUES ('${SLUG}', '${NAME//\'/\'\'}', 'ACTIVE', 'FREE', true, '${DOMAIN}')
  ON CONFLICT (slug) DO UPDATE
    SET name = EXCLUDED.name,
        primary_domain = EXCLUDED.primary_domain,
        is_active = true
  RETURNING id
)
SELECT id FROM upsert
UNION ALL
SELECT id FROM tenants WHERE slug = '${SLUG}'
LIMIT 1;
")"

if [[ -z "$TENANT_ID" ]]; then
  print_error "Unable to create or resolve tenant id for slug '$SLUG'"
  exit 1
fi

print_success "Tenant id: $TENANT_ID"

if [[ "$CREATE_DOMAIN" == true ]]; then
  print_info "Creating/reusing domain mapping '$DOMAIN'"
  psql_exec "
INSERT INTO tenant_domains (tenant_id, domain, domain_type, is_primary, is_verified)
VALUES (${TENANT_ID}, '${DOMAIN}', 'SUBDOMAIN', true, true)
ON CONFLICT (domain) DO UPDATE
SET tenant_id = EXCLUDED.tenant_id,
    is_primary = EXCLUDED.is_primary,
    is_verified = EXCLUDED.is_verified;"
fi

if [[ "$BOOTSTRAP_ADMIN" == true ]]; then
  print_info "Bootstrapping admin from source tenant '${SOURCE_TENANT_SLUG}'"
  SOURCE_USER_FILTER=""
  if [[ -n "$SOURCE_ADMIN_USERNAME" ]]; then
    SOURCE_USER_FILTER="AND u.username = '${SOURCE_ADMIN_USERNAME}'"
  fi

  EXISTING_USERS_COUNT="$(psql_scalar "SELECT COUNT(*) FROM users WHERE tenant_id = ${TENANT_ID};")"
  if [[ "${EXISTING_USERS_COUNT:-0}" != "0" ]]; then
    print_warning "Tenant already has ${EXISTING_USERS_COUNT} user(s); skipping admin bootstrap"
  else
    CLONED_ID="$(psql_scalar "
WITH source_tenant AS (
  SELECT id FROM tenants WHERE slug = '${SOURCE_TENANT_SLUG}' LIMIT 1
),
source_user AS (
  SELECT u.*
  FROM users u
  JOIN source_tenant st ON st.id = u.tenant_id
  WHERE u.is_active = true
    AND (u.role = 'ADMIN' OR u.role = 'ANIMATEUR')
    ${SOURCE_USER_FILTER}
  ORDER BY CASE WHEN u.role = 'ADMIN' THEN 0 ELSE 1 END, u.id
  LIMIT 1
),
ins AS (
  INSERT INTO users (
    tenant_id, email, username, password_hash, role, is_platform_admin,
    team_id, tags, is_active, failed_login_attempts, locked_until
  )
  SELECT
    ${TENANT_ID}, su.email, su.username, su.password_hash, su.role, false,
    NULL, su.tags, true, 0, NULL
  FROM source_user su
  RETURNING id
)
SELECT id FROM ins;
")"
    if [[ -n "$CLONED_ID" ]]; then
      print_success "Cloned admin user id ${CLONED_ID} into tenant '${SLUG}'"
    else
      print_warning "No source admin/animateur found in tenant '${SOURCE_TENANT_SLUG}'. Tenant created without users."
    fi
  fi
fi

echo ""
print_success "Tenant ready"
echo "  Slug:   ${SLUG}"
echo "  Name:   ${NAME}"
if [[ "$CREATE_DOMAIN" == true ]]; then
  echo "  Domain: ${DOMAIN}"
fi
echo "  URL:    http://${SLUG}.localhost:5173/login"
echo ""
echo "If the backend/frontend containers are already running, restart them if hot-reload does not pick up tenancy changes."
