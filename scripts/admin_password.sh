#!/usr/bin/env bash
# TTX Platform — Admin password manager
#
# Usage: ./scripts/admin_password.sh [show|reset] [--password <new_password>]
#
# Commands:
#   show             Affiche les infos du compte admin (mot de passe non récupérable)
#   reset            Réinitialise le mot de passe admin (défaut: Admin123!)
#
# Options:
#   --password <pw>  Nouveau mot de passe à utiliser avec reset
#   --help, -h       Affiche cette aide

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

source "$SCRIPT_DIR/lib/common.sh"

BACKEND_CONTAINER="ttx-community-backend"
COMMAND=""
NEW_PASSWORD="Admin123!"

show_help() {
    echo "Usage: $0 [show|reset] [--password <new_password>]"
    echo ""
    echo "Commands:"
    echo "  show             Affiche les infos du compte admin"
    echo "  reset            Réinitialise le mot de passe admin"
    echo ""
    echo "Options:"
    echo "  --password <pw>  Nouveau mot de passe (avec reset, défaut: Admin123!)"
    echo "  --help, -h       Affiche cette aide"
}

check_container() {
    if ! docker ps --format '{{.Names}}' | grep -q "^${BACKEND_CONTAINER}$"; then
        print_error "Le conteneur '$BACKEND_CONTAINER' n'est pas en cours d'exécution."
        print_info "Lancez: docker compose up -d"
        exit 1
    fi
}

cmd_show() {
    print_step "Infos du compte admin platform..."
    docker exec "$BACKEND_CONTAINER" python3 -c "
import asyncio
from app.database import async_session_factory
from app.models.user import User, UserRole
from sqlalchemy import select

async def main():
    async with async_session_factory() as db:
        result = await db.execute(
            select(User).where(User.role == UserRole.ADMIN)
        )
        admins = result.scalars().all()
        if not admins:
            print('  Aucun compte admin trouvé.')
            return
        for u in admins:
            print(f'  ID       : {u.id}')
            print(f'  Username : {u.username}')
            print(f'  Email    : {u.email}')
            print(f'  Actif    : {u.is_active}')
            print(f'  Rôle     : {u.role.value}')
            print(f'  Créé le  : {u.created_at}')
            print()
        print('  ⚠  Le mot de passe est hashé (Argon2) — non récupérable.')
        print('     Utilisez: ./scripts/admin_password.sh reset')

asyncio.run(main())
"
}

cmd_reset() {
    print_step "Réinitialisation du mot de passe admin platform..."
    print_info "Nouveau mot de passe : $NEW_PASSWORD"

    docker exec "$BACKEND_CONTAINER" python3 -c "
import asyncio
from app.database import async_session_factory
from app.models.user import User, UserRole
from app.utils.security import hash_password
from sqlalchemy import select

async def main():
    async with async_session_factory() as db:
        result = await db.execute(
            select(User).where(User.role == UserRole.ADMIN).limit(1)
        )
        admin = result.scalars().first()
        if not admin:
            print('ERREUR: Aucun compte platform admin trouvé.')
            return
        admin.password_hash = hash_password('${NEW_PASSWORD}')
        await db.commit()
        print(f'OK: Mot de passe réinitialisé pour {admin.username} ({admin.email})')

asyncio.run(main())
"
    print_success "Mot de passe réinitialisé → $NEW_PASSWORD"
}

# ─────────────────────────────────────────────
# Argument parsing
# ─────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
    case $1 in
        show|reset)     COMMAND="$1"; shift ;;
        --password)     NEW_PASSWORD="$2"; shift 2 ;;
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
    show)  cmd_show ;;
    reset) cmd_reset ;;
esac
