#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# shellcheck source=scripts/lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"

main() {
    print_info "Rebuild + restart du frontend"

    require_docker
    detect_compose

    if [[ ! -f "$PROJECT_ROOT/docker-compose.yml" ]]; then
        print_error "docker-compose.yml introuvable à la racine projet."
        exit 1
    fi

    cd "$PROJECT_ROOT"

    print_info "Build du service frontend..."
    run_compose build frontend

    print_info "Redémarrage du service frontend..."
    run_compose up -d --force-recreate frontend

    wait_for_frontend \
        && exit 0 \
        || print_warning "Vérifie les logs avec: ${DOCKER_COMPOSE_CMD[*]} logs -f frontend"
}

main "$@"
