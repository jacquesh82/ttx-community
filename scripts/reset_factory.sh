#!/usr/bin/env bash
# TTX Platform — Factory Reset Script
#
# Usage: ./scripts/reset_factory.sh [options]
#
# Options:
#   --force          Skip confirmation prompts
#   --keep-volumes   Keep Docker volumes (database, media, logs)
#   --help, -h       Show this help message

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# shellcheck source=scripts/lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"

PROJECT_NAME="ttx-platform"
FORCE=false
KEEP_VOLUMES=false

print_header() {
    echo -e "${BLUE}"
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║                   TTX Platform Factory Reset                 ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

show_help() {
    echo "Usage: $0 [options]"
    echo ""
    echo "Options:"
    echo "  --force          Skip confirmation prompts"
    echo "  --keep-volumes   Keep Docker volumes (database, media, logs)"
    echo "  --help, -h       Show this help message"
}

check_prerequisites() {
    print_step "Checking prerequisites..."
    require_docker
    detect_compose
    if [[ ! -f "$PROJECT_ROOT/docker-compose.yml" ]]; then
        print_error "docker-compose.yml not found."
        exit 1
    fi
    print_success "Prerequisites check passed"
}

confirm_reset() {
    [[ "$FORCE" == "true" ]] && return 0

    echo -e "${RED}⚠️  WARNING: This will completely reset your TTX Platform!${NC}"
    echo -e "${RED}⚠️  All data will be permanently deleted!${NC}"
    echo ""
    echo "This will delete:"
    echo "  - All Docker containers"
    echo "  - All Docker images for this project"
    if [[ "$KEEP_VOLUMES" != "true" ]]; then
        echo "  - All Docker volumes (database, media, logs)"
    else
        echo "  (Docker volumes will be kept)"
    fi
    echo ""
    read -rp "Type 'yes' to confirm or 'no' to cancel: "
    if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
        print_info "Factory reset cancelled"
        exit 0
    fi
    echo ""
}

stop_containers() {
    print_step "Stopping all containers..."
    cd "$PROJECT_ROOT"
    run_compose down --volumes --remove-orphans >/dev/null 2>&1 || true
    print_success "All containers stopped"
}

remove_containers() {
    print_step "Removing containers..."
    docker ps -aq --filter "label=com.docker.compose.project=$PROJECT_NAME" | xargs -r docker rm -f
    print_success "Containers removed"
}

remove_images() {
    if [[ "$KEEP_VOLUMES" == "true" ]]; then
        print_info "Skipping image removal (--keep-volumes specified)"
        return 0
    fi
    print_step "Removing images..."
    docker images -q --filter "label=com.docker.compose.project=$PROJECT_NAME" | xargs -r docker rmi -f
    print_success "Images removed"
}

remove_volumes() {
    if [[ "$KEEP_VOLUMES" == "true" ]]; then
        print_info "Skipping volume removal (--keep-volumes specified)"
        return 0
    fi
    print_step "Removing volumes..."
    docker volume ls -q --filter "label=com.docker.compose.project=$PROJECT_NAME" | xargs -r docker volume rm
    print_success "Volumes removed"
}

cleanup_files() {
    print_step "Cleaning up temporary files..."
    rm -f "$PROJECT_ROOT/.env.local"
    find "$PROJECT_ROOT" -name "*.log" -type f -delete 2>/dev/null || true
    find "$PROJECT_ROOT" -name "node_modules" -type d -exec rm -rf {} + 2>/dev/null || true
    print_success "Temporary files cleaned up"
}

verify_cleanup() {
    print_step "Verifying cleanup..."
    CONTAINER_COUNT=$(docker ps -aq --filter "label=com.docker.compose.project=$PROJECT_NAME" | wc -l)
    if [[ $CONTAINER_COUNT -gt 0 ]]; then
        print_warning "Some containers may still exist"
    else
        print_success "No containers found"
    fi

    if COMPOSE_RUNNING=$(run_compose ps -q 2>/dev/null | wc -l | tr -d '[:space:]'); then
        if [[ ${COMPOSE_RUNNING:-0} -gt 0 ]]; then
            print_warning "Docker Compose stack still lists $COMPOSE_RUNNING service(s)"
        else
            print_success "Docker Compose stack has no running services"
        fi
    fi

    if [[ "$KEEP_VOLUMES" != "true" ]]; then
        VOLUME_COUNT=$(docker volume ls -q --filter "label=com.docker.compose.project=$PROJECT_NAME" | wc -l)
        [[ $VOLUME_COUNT -gt 0 ]] && print_warning "Some volumes may still exist" || print_success "No volumes found"

        IMAGE_COUNT=$(docker images -q --filter "label=com.docker.compose.project=$PROJECT_NAME" | wc -l)
        [[ $IMAGE_COUNT -gt 0 ]] && print_warning "Some images may still exist" || print_success "No images found"
    fi
}

show_completion_message() {
    echo ""
    echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║                    Factory Reset Complete                    ║${NC}"
    echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo "TTX Platform has been completely reset."
    echo ""
    echo "Next steps:"
    echo "  make install    — reinstall the platform"
    echo "  make start      — start containers (if .env is already configured)"
    echo ""
}

# ─────────────────────────────────────────────
# Argument parsing
# ─────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
    case $1 in
        --force)        FORCE=true; shift ;;
        --keep-volumes) KEEP_VOLUMES=true; shift ;;
        -h|--help)      show_help; exit 0 ;;
        *)
            print_error "Unknown option: $1"
            show_help
            exit 1
            ;;
    esac
done

main() {
    print_header
    check_prerequisites
    confirm_reset
    stop_containers
    remove_containers
    remove_images
    remove_volumes
    cleanup_files
    verify_cleanup
    show_completion_message
}

main "$@"
