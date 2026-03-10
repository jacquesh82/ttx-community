#!/usr/bin/env bash
# TTX Platform — Installation Script
#
# Usage: ./scripts/install.sh [options]
#
# Options:
#   --production     Set up for production environment
#   --dev            Set up for development environment (default)
#   --skip-build     Skip Docker image building
#   --skip-init      Skip database initialization
#   --force-reinit   Force re-initialization even if data exists
#   --help, -h       Show this help message

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# shellcheck source=scripts/lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"

PROJECT_NAME="ttx-platform"
ENVIRONMENT="development"
SKIP_BUILD=false
SKIP_INIT=false
FORCE_REINIT=false

print_header() {
    echo -e "${BLUE}"
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║                    TTX Platform Installation                 ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

show_help() {
    echo "Usage: $0 [options]"
    echo ""
    echo "Options:"
    echo "  --production     Set up for production environment"
    echo "  --dev            Set up for development environment (default)"
    echo "  --skip-build     Skip Docker image building"
    echo "  --skip-init      Skip database initialization"
    echo "  --force-reinit   Force re-initialization even if data exists"
    echo "  --help, -h       Show this help message"
    echo ""
    echo "Default credentials:"
    echo "  Admin:       admin / Admin123!"
    echo "  Animateur:   animateur1 / Anim123!"
    echo "  Observateur: observateur1 / Obs123!"
    echo "  Participant: participant1 / Part123!"
}

check_prerequisites() {
    print_step "Checking prerequisites..."
    require_docker
    detect_compose
    if [[ ! -f "$PROJECT_ROOT/docker-compose.yml" ]]; then
        print_error "docker-compose.yml not found. Please run this script from the project root directory."
        exit 1
    fi
    print_success "Prerequisites check passed"
}

setup_environment() {
    print_step "Setting up environment configuration..."
    cd "$PROJECT_ROOT"

    ensure_env_file "$PROJECT_ROOT"
    generate_session_secret "$PROJECT_ROOT"

    if [[ "$ENVIRONMENT" == "production" ]]; then
        print_info "Setting up for production environment"
        sed -i.bak 's/ENVIRONMENT=.*/ENVIRONMENT=production/' .env
        sed -i.bak 's/CORS_ORIGINS=.*/CORS_ORIGINS=https:\/\/your-domain.com/' .env
        sed -i.bak 's/API_URL=.*/API_URL=https:\/\/your-domain.com:3000/' .env
        sed -i.bak 's/WS_URL=.*/WS_URL=wss:\/\/your-domain.com:3000/' .env
        rm -f .env.bak
        print_warning "Update CORS_ORIGINS, API_URL, and WS_URL in .env for your production domain"
    else
        print_info "Setting up for development environment"
        sed -i.bak 's/ENVIRONMENT=.*/ENVIRONMENT=development/' .env
        sed -i.bak 's/CORS_ORIGINS=.*/CORS_ORIGINS=http:\/\/localhost:5173,http:\/\/localhost:80/' .env
        sed -i.bak 's/API_URL=.*/API_URL=http:\/\/localhost:3000/' .env
        sed -i.bak 's/WS_URL=.*/WS_URL=ws:\/\/localhost:3000/' .env
        rm -f .env.bak
    fi

    print_success "Environment configuration complete"
}

build_and_start_containers() {
    if [[ "$SKIP_BUILD" == "true" ]]; then
        print_info "Skipping Docker image building (--skip-build specified)"
    else
        print_step "Building Docker images..."
        cd "$PROJECT_ROOT"
        run_compose build
        print_success "Docker images built"
    fi

    print_step "Starting containers..."
    cd "$PROJECT_ROOT"
    run_compose up -d

    print_info "Waiting for database to be ready..."
    sleep 10

    RUNNING_CONTAINERS=$(run_compose ps -q 2>/dev/null | wc -l | tr -d '[:space:]')
    if [[ ${RUNNING_CONTAINERS:-0} -lt 2 ]]; then
        print_error "Failed to start containers properly"
        print_info "Check container status with: ${DOCKER_COMPOSE_CMD[*]} ps"
        exit 1
    fi

    print_success "Containers started successfully"
}

wait_for_all_services() {
    print_step "Waiting for services to be ready..."
    wait_for_backend || true
    wait_for_frontend || true

    local -a missing=()
    for svc in postgres backend frontend; do
        local cnt
        cnt=$(run_compose ps -q "$svc" 2>/dev/null | wc -l | tr -d '[:space:]')
        [[ "${cnt:-0}" -eq 0 ]] && missing+=("$svc")
    done
    if [[ ${#missing[@]} -gt 0 ]]; then
        print_warning "Services not running: ${missing[*]}"
    else
        print_success "All core services are running"
    fi
}

initialize_database() {
    if [[ "$SKIP_INIT" == "true" ]]; then
        print_info "Skipping database initialization (--skip-init specified)"
        return 0
    fi

    print_step "Initializing database..."
    cd "$PROJECT_ROOT"

    if run_compose exec -T backend python -c "
import asyncio
from app.database import async_session_factory
from app.models import User
async def check():
    async with async_session_factory() as session:
        result = await session.execute(User.__table__.select().limit(1))
        return result.fetchone() is not None
print(asyncio.run(check()))
" 2>/dev/null | grep -q "True"; then
        if [[ "$FORCE_REINIT" != "true" ]]; then
            print_warning "Database already initialized. Use --force-reinit to re-initialize."
            return 0
        fi
        print_warning "Forcing re-initialization of existing database"
    fi

    run_compose exec -T backend python scripts/manage.py seed all

    print_success "Database initialization complete"
}

show_completion_message() {
    echo ""
    echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║                    Installation Complete                     ║${NC}"
    echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo "Your TTX Platform has been successfully installed!"
    echo ""
    echo "🌐 Access Information:"
    echo "  Frontend:  http://localhost:5173"
    echo "  API:       http://localhost:3000"
    echo "  API Docs:  http://localhost:3000/docs"
    echo ""
    echo "🔑 Default Credentials:"
    echo "  Admin:       admin / Admin123!"
    echo "  Animateur:   animateur1 / Anim123!"
    echo "  Observateur: observateur1 / Obs123!"
    echo "  Participant: participant1 / Part123!"
    echo ""
    echo "⚠️  Security Notes:"
    echo "  - Change default passwords in production"
    echo "  - Update SESSION_SECRET in .env"
    echo ""
    echo "🛠️  Useful commands:"
    echo "  make help          — full command list"
    echo "  make logs          — tail container logs"
    echo "  make reset         — reset DB + demo data"
    echo "  make db-backup     — backup the database"
    echo ""
}

# ─────────────────────────────────────────────
# Argument parsing
# ─────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
    case $1 in
        --production)   ENVIRONMENT="production"; shift ;;
        --dev)          ENVIRONMENT="development"; shift ;;
        --skip-build)   SKIP_BUILD=true; shift ;;
        --skip-init)    SKIP_INIT=true; shift ;;
        --force-reinit) FORCE_REINIT=true; shift ;;
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
    setup_environment
    build_and_start_containers
    wait_for_all_services
    initialize_database
    show_completion_message
}

main "$@"
