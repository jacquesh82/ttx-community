#!/usr/bin/env bash
# TTX Platform — Quick Start Script
#
# Usage: ./scripts/quick_start.sh [options]
#
# Options:
#   --fresh      Start fresh (stop and remove existing containers)
#   --logs       Show logs after starting
#   --dev        Start in development mode (default)
#   --prod       Start in production mode
#   --help, -h   Show this help message

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# shellcheck source=scripts/lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"

FRESH=false
SHOW_LOGS=false
MODE="dev"

print_header() {
    echo -e "${CYAN}"
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║                   TTX Platform Quick Start                   ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

show_help() {
    echo "Usage: $0 [options]"
    echo ""
    echo "Options:"
    echo "  --fresh      Start fresh (stop and remove existing containers)"
    echo "  --logs       Show logs after starting"
    echo "  --dev        Start in development mode (default)"
    echo "  --prod       Start in production mode"
    echo "  --help, -h   Show this help message"
    echo ""
    echo "After starting:"
    echo "  Frontend:  http://localhost:5173"
    echo "  API:       http://localhost:3000"
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

prepare_environment() {
    print_step "Preparing environment..."
    cd "$PROJECT_ROOT"
    ensure_env_file "$PROJECT_ROOT"
    generate_session_secret "$PROJECT_ROOT"
    print_success "Environment ready"
}

start_fresh() {
    print_step "Starting fresh (removing existing containers)..."
    cd "$PROJECT_ROOT"
    run_compose down -v 2>/dev/null || true
    print_success "Existing containers removed"
}

start_services() {
    print_step "Starting services..."
    cd "$PROJECT_ROOT"
    run_compose up -d
    print_success "Services started"
}

show_logs() {
    print_step "Showing logs..."
    cd "$PROJECT_ROOT"
    run_compose logs -f
}

show_completion_message() {
    echo ""
    echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║                    Quick Start Complete                      ║${NC}"
    echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo "Your TTX Platform is now running!"
    echo ""
    echo "🌐 Access Information:"
    echo "  Frontend:  http://localhost:5173"
    echo "  API:       http://localhost:3000"
    echo "  API Docs:  http://localhost:3000/docs"
    echo ""
    echo "🛠️  Commands:"
    echo "  View logs:  $0 --logs"
    echo "  Stop:       ${DOCKER_COMPOSE_CMD[*]} down"
    echo "  make help   — full command list"
    echo ""
    echo "🔑 Default Credentials (if database was initialized):"
    echo "  Admin:       admin / Admin123!"
    echo "  Animateur:   animateur1 / Anim123!"
    echo "  Observateur: observateur1 / Obs123!"
    echo "  Participant: participant1 / Part123!"
    echo ""
}

# ─────────────────────────────────────────────
# Argument parsing
# ─────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
    case $1 in
        --fresh)    FRESH=true; shift ;;
        --logs)     SHOW_LOGS=true; shift ;;
        --dev)      MODE="dev"; shift ;;
        --prod)     MODE="prod"; shift ;;
        -h|--help)  show_help; exit 0 ;;
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
    prepare_environment

    [[ "$FRESH" == "true" ]] && start_fresh

    start_services
    wait_for_backend || true
    wait_for_frontend || true

    if [[ "$SHOW_LOGS" == "true" ]]; then
        show_logs
    else
        show_completion_message
    fi
}

main "$@"
