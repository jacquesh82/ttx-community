#!/usr/bin/env bash
# TTX Platform — Tenant domain manager
#
# Usage: ./scripts/tenant_domain.sh [list|add|remove] [options]
#
# Commands:
#   list                         Liste les domaines enregistrés
#   add <domain> [--tenant slug] Enregistre un domaine pour un tenant
#   remove <domain>              Supprime un mapping de domaine
#
# Options:
#   --tenant <slug>  Tenant cible (défaut: default)
#   --help, -h       Affiche cette aide
#
# Exemple prod (accès via localhost:80):
#   ./scripts/tenant_domain.sh add localhost

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

source "$SCRIPT_DIR/lib/common.sh"

BACKEND_CONTAINER="ttx-community-backend"
COMMAND=""
DOMAIN=""
TENANT_SLUG="default"

show_help() {
    echo "Usage: $0 [list|add|remove] [options]"
    echo ""
    echo "Commands:"
    echo "  list                         Liste les domaines enregistrés"
    echo "  add <domain> [--tenant slug] Enregistre un domaine pour un tenant"
    echo "  remove <domain>              Supprime un mapping de domaine"
    echo ""
    echo "Options:"
    echo "  --tenant <slug>  Tenant cible (défaut: default)"
    echo "  --help, -h       Affiche cette aide"
    echo ""
    echo "Exemple prod (accès via localhost:80):"
    echo "  $0 add localhost"
}

check_container() {
    if ! docker ps --format '{{.Names}}' | grep -q "^${BACKEND_CONTAINER}$"; then
        print_error "Le conteneur '$BACKEND_CONTAINER' n'est pas en cours d'exécution."
        print_info "Lancez: docker compose up -d"
        exit 1
    fi
}

cmd_list() {
    print_step "Domaines enregistrés..."
    docker exec "$BACKEND_CONTAINER" python3 -c "
import asyncio
from app.database import async_session_factory
from app.models.tenant import Tenant, TenantDomain
from sqlalchemy import select
from sqlalchemy.orm import selectinload

async def main():
    async with async_session_factory() as db:
        result = await db.execute(
            select(TenantDomain).join(Tenant, Tenant.id == TenantDomain.tenant_id)
        )
        domains = result.scalars().all()
        if not domains:
            print('  Aucun domaine enregistré.')
            print()
            print('  En mode production, ajoutez votre domaine avec:')
            print('    ./scripts/tenant_domain.sh add <votre-domaine>')
            return
        result2 = await db.execute(select(Tenant))
        tenants = {t.id: t for t in result2.scalars().all()}
        for d in domains:
            t = tenants.get(d.tenant_id)
            tenant_label = f'{t.slug} (id={t.id})' if t else f'id={d.tenant_id}'
            primary = ' [PRIMARY]' if d.is_primary else ''
            print(f'  {d.domain:<40} → tenant: {tenant_label}{primary}')

asyncio.run(main())
"
}

cmd_add() {
    print_step "Enregistrement du domaine '$DOMAIN' pour le tenant '$TENANT_SLUG'..."
    docker exec "$BACKEND_CONTAINER" python3 -c "
import asyncio
from app.database import async_session_factory
from app.models.tenant import Tenant, TenantDomain, TenantDomainType
from sqlalchemy import select

async def main():
    async with async_session_factory() as db:
        # Trouver le tenant
        result = await db.execute(select(Tenant).where(Tenant.slug == '${TENANT_SLUG}'))
        tenant = result.scalar_one_or_none()
        if not tenant:
            print(f'ERREUR: Tenant \"${TENANT_SLUG}\" introuvable.')
            return

        # Vérifier si le domaine existe déjà
        result2 = await db.execute(select(TenantDomain).where(TenantDomain.domain == '${DOMAIN}'))
        existing = result2.scalar_one_or_none()
        if existing:
            if existing.tenant_id == tenant.id:
                print(f'INFO: Domaine \"${DOMAIN}\" déjà enregistré pour ce tenant.')
            else:
                print(f'ERREUR: Domaine \"${DOMAIN}\" déjà assigné à un autre tenant (id={existing.tenant_id}).')
            return

        # Vérifier si c'est le premier domaine (→ primary)
        result3 = await db.execute(select(TenantDomain).where(TenantDomain.tenant_id == tenant.id))
        existing_domains = result3.scalars().all()
        is_primary = len(existing_domains) == 0

        domain = TenantDomain(
            tenant_id=tenant.id,
            domain='${DOMAIN}',
            domain_type=TenantDomainType.CUSTOM,
            is_primary=is_primary,
            is_verified=True,
        )
        db.add(domain)
        await db.commit()
        primary_label = ' (marqué comme domaine primary)' if is_primary else ''
        print(f'OK: Domaine \"${DOMAIN}\" enregistré pour le tenant \"{tenant.slug}\"{primary_label}')

asyncio.run(main())
"
    print_success "Domaine '$DOMAIN' ajouté → le tenant '${TENANT_SLUG}' sera résolu pour ce host"
}

cmd_remove() {
    print_step "Suppression du domaine '$DOMAIN'..."
    docker exec "$BACKEND_CONTAINER" python3 -c "
import asyncio
from app.database import async_session_factory
from app.models.tenant import TenantDomain
from sqlalchemy import select, delete

async def main():
    async with async_session_factory() as db:
        result = await db.execute(select(TenantDomain).where(TenantDomain.domain == '${DOMAIN}'))
        existing = result.scalar_one_or_none()
        if not existing:
            print(f'INFO: Domaine \"${DOMAIN}\" non trouvé, rien à supprimer.')
            return
        await db.execute(delete(TenantDomain).where(TenantDomain.domain == '${DOMAIN}'))
        await db.commit()
        print(f'OK: Domaine \"${DOMAIN}\" supprimé.')

asyncio.run(main())
"
    print_success "Domaine '$DOMAIN' supprimé"
}

# ─────────────────────────────────────────────
# Argument parsing
# ─────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
    case $1 in
        list)           COMMAND="list"; shift ;;
        add)            COMMAND="add"; DOMAIN="${2:-}"; shift; [[ -n "$DOMAIN" ]] && shift || { print_error "Domaine manquant après 'add'"; exit 1; } ;;
        remove)         COMMAND="remove"; DOMAIN="${2:-}"; shift; [[ -n "$DOMAIN" ]] && shift || { print_error "Domaine manquant après 'remove'"; exit 1; } ;;
        --tenant)       TENANT_SLUG="$2"; shift 2 ;;
        -h|--help)      show_help; exit 0 ;;
        *)
            print_error "Option inconnue: $1"
            show_help
            exit 1
            ;;
    esac
done

if [[ -z "$COMMAND" ]]; then
    show_help
    exit 1
fi

check_container

case "$COMMAND" in
    list)   cmd_list ;;
    add)    cmd_add ;;
    remove) cmd_remove ;;
esac
