#!/usr/bin/env bash
# Sauvegarde la base de données TTX dans backups/YYYY-MM-DD_HH-MM.sql.gz
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# shellcheck source=scripts/lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"

require_docker
detect_compose

BACKUP_DIR="$PROJECT_ROOT/backups"
mkdir -p "$BACKUP_DIR"

TIMESTAMP="$(date +%Y-%m-%d_%H-%M)"
OUTFILE="$BACKUP_DIR/${TIMESTAMP}.sql.gz"

print_step "Sauvegarde de la base de données..."

run_compose exec -T postgres pg_dump -U ttx ttx | gzip > "$OUTFILE"

SIZE=$(du -sh "$OUTFILE" | cut -f1)
print_success "Sauvegarde créée : $OUTFILE ($SIZE)"
