#!/usr/bin/env bash
# Restaure la base de données TTX depuis un fichier .sql.gz
#
# Usage: ./scripts/db_restore.sh <fichier.sql.gz>
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# shellcheck source=scripts/lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"

FILE="${1:-}"

if [[ -z "$FILE" ]]; then
    print_error "Usage: $0 <fichier.sql.gz>"
    exit 1
fi

if [[ ! -f "$FILE" ]]; then
    print_error "Fichier introuvable : $FILE"
    exit 1
fi

require_docker
detect_compose

print_step "Restauration depuis $FILE..."
print_warning "Cela va écraser la base de données actuelle."
read -rp "Confirmer ? [yes/N] " confirm
if [[ ! "$confirm" =~ ^[Yy][Ee][Ss]$ ]]; then
    print_info "Restauration annulée"
    exit 0
fi

gunzip -c "$FILE" | run_compose exec -T postgres psql -U ttx -d ttx

print_success "Restauration terminée depuis $FILE"
