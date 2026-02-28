#!/bin/bash

# TTX Platform - Installation Script
#
# This script installs and initializes the TTX Platform with default configuration:
# - Teams configuration
# - Empty inject bank
# - Welcome kit with default templates
#
# Usage: ./scripts/install.sh [options]
#
# Options:
#   --production     Set up for production environment
#   --dev            Set up for development environment (default)
#   --skip-build     Skip Docker image building
#   --skip-init      Skip database initialization
#   --help, -h       Show this help message

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
PROJECT_NAME="ttx-platform"

# Default values
ENVIRONMENT="development"
SKIP_BUILD=false
SKIP_INIT=false
FORCE_REINIT=false

# Docker Compose helper
DOCKER_COMPOSE_CMD=()

set_compose_command() {
    if command -v docker-compose &> /dev/null; then
        DOCKER_COMPOSE_CMD=(docker-compose)
        return 0
    fi

    if docker compose version &> /dev/null 2>&1; then
        DOCKER_COMPOSE_CMD=(docker compose)
        return 0
    fi

    print_error "Docker Compose is not installed. Please install Docker Compose first."
    echo "Visit: https://docs.docker.com/compose/install/"
    exit 1
}

run_compose() {
    if [[ ${#DOCKER_COMPOSE_CMD[@]} -eq 0 ]]; then
        print_error "Docker Compose command not configured"
        exit 1
    fi
    "${DOCKER_COMPOSE_CMD[@]}" "$@"
}

# Functions
print_header() {
    echo -e "${BLUE}"
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║                    TTX Platform Installation                 ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_step() {
    echo -e "${CYAN}[STEP]${NC} $1"
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
    echo "This script will:"
    echo "  1. Check prerequisites"
    echo "  2. Set up environment configuration"
    echo "  3. Build and start Docker containers"
    echo "  4. Initialize database with default configuration:"
    echo "     - Default users (admin, animateur, observateur, participant)"
    echo "     - Teams configuration (Alpha, Beta, Cellule de Crise)"
    echo "     - Empty inject bank"
    echo "     - Welcome kit with default templates"
    echo "  5. Display connection information"
    echo ""
    echo "Default credentials:"
    echo "  Admin: admin / Admin123!"
    echo "  Animateur: animateur1 / Anim123!"
    echo "  Observateur: observateur1 / Obs123!"
    echo "  Participant: participant1 / Part123!"
}

check_prerequisites() {
    print_step "Checking prerequisites..."
    
    # Check if Docker is installed
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed. Please install Docker first."
        echo "Visit: https://docs.docker.com/get-docker/"
        exit 1
    fi
    
    # Check Docker daemon
    if ! docker info &> /dev/null; then
        print_error "Docker daemon is not running. Please start Docker."
        exit 1
    fi

    # Configure Docker Compose command
    set_compose_command

    # Check if we're in the right directory
    if [[ ! -f "$PROJECT_ROOT/docker-compose.yml" ]]; then
        print_error "docker-compose.yml not found. Please run this script from the project root directory."
        exit 1
    fi
    
    print_success "Prerequisites check passed"
}

setup_environment() {
    print_step "Setting up environment configuration..."
    
    cd "$PROJECT_ROOT"
    
    # Copy .env.example to .env if it doesn't exist
    if [[ ! -f ".env" ]]; then
        if [[ -f ".env.example" ]]; then
            cp .env.example .env
            print_success "Created .env from .env.example"
        else
            print_error ".env.example not found"
            exit 1
        fi
    else
        print_info ".env already exists, skipping creation"
    fi
    
    # Generate a secure session secret if not set
    if ! grep -q "SESSION_SECRET=" .env || grep -q "change_me_in_production_min_32_chars" .env; then
        SESSION_SECRET=$(openssl rand -base64 32 | tr -d /=+ | cut -c -32)
        sed -i.bak "s/SESSION_SECRET=.*/SESSION_SECRET=$SESSION_SECRET/" .env
        rm -f .env.bak
        print_success "Generated new SESSION_SECRET"
    fi
    
    # Set environment-specific values
    if [[ "$ENVIRONMENT" == "production" ]]; then
        print_info "Setting up for production environment"
        sed -i.bak 's/ENVIRONMENT=.*/ENVIRONMENT=production/' .env
        sed -i.bak 's/CORS_ORIGINS=.*/CORS_ORIGINS=https:\/\/your-domain.com/' .env
        sed -i.bak 's/API_URL=.*/API_URL=https:\/\/your-domain.com:3000/' .env
        sed -i.bak 's/WS_URL=.*/WS_URL=wss:\/\/your-domain.com:3000/' .env
        rm -f .env.bak
        print_warning "Please update CORS_ORIGINS, API_URL, and WS_URL in .env for your production domain"
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
    
    # Start containers
    run_compose up -d
    
    # Wait for database to be ready
    print_info "Waiting for database to be ready..."
    sleep 10
    
    # Check if containers are running
    RUNNING_CONTAINERS=$(run_compose ps -q 2>/dev/null | wc -l | tr -d '[:space:]')
    
    if [[ $RUNNING_CONTAINERS -lt 2 ]]; then
        print_error "Failed to start containers properly"
        print_info "Check container status with: ${DOCKER_COMPOSE_CMD[*]} ps"
        exit 1
    fi
    
    print_success "Containers started successfully"
}

wait_for_services() {
    print_step "Waiting for services to be ready..."
    
    # Wait for backend to be ready
    print_info "Waiting for backend API..."
    for i in {1..30}; do
        if curl -s http://localhost:3000/health > /dev/null 2>&1; then
            print_success "Backend API is ready"
            break
        fi
        if [[ $i -eq 30 ]]; then
            print_warning "Backend API may not be ready yet, continuing anyway..."
            break
        fi
        sleep 2
    done
    
    # Wait for frontend to be ready
    print_info "Waiting for frontend..."
    for i in {1..30}; do
        if curl -s http://localhost:5173 > /dev/null 2>&1; then
            print_success "Frontend is ready"
            break
        fi
        if [[ $i -eq 30 ]]; then
            print_warning "Frontend may not be ready yet, continuing anyway..."
            break
        fi
        sleep 2
    done

    verify_compose_services postgres backend frontend
}

verify_compose_services() {
    print_step "Verifying Docker Compose services..."

    local -a missing_services=()
    for service in "$@"; do
        local SERVICE_RUNNING
        if ! SERVICE_RUNNING=$(run_compose ps -q "$service" 2>/dev/null | wc -l | tr -d '[:space:]'); then
            missing_services+=("$service")
            continue
        fi
        SERVICE_RUNNING=${SERVICE_RUNNING:-0}
        if [[ $SERVICE_RUNNING -eq 0 ]]; then
            missing_services+=("$service")
        fi
    done

    if [[ ${#missing_services[@]} -gt 0 ]]; then
        print_warning "Compose services not running: ${missing_services[*]}"
        print_info "Run '${DOCKER_COMPOSE_CMD[*]} ps' for details"
    else
        print_success "All core Compose services are running"
    fi
}

initialize_database() {
    if [[ "$SKIP_INIT" == "true" ]]; then
        print_info "Skipping database initialization (--skip-init specified)"
        return 0
    fi
    
    print_step "Initializing database..."
    
    cd "$PROJECT_ROOT"
    
    # Check if database is already initialized
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
            print_warning "Database appears to already be initialized"
            print_info "Use --force-reinit to re-initialize existing data"
            print_info "Skipping database initialization"
            return 0
        else
            print_warning "Forcing re-initialization of existing database"
        fi
    fi
    
    # Run initialization script
    print_info "Running database initialization..."
    
    run_compose exec -T backend python scripts/init_env.py --skip-migrations --demo-exercise
    
    print_success "Database initialization complete"
}

show_completion_message() {
    echo ""
    echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║                    Installation Complete                     ║${NC}"
    echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo "Your TTX Platform has been successfully installed and initialized!"
    echo ""
    echo "📋 Configuration Summary:"
    echo "  Environment: $ENVIRONMENT"
    echo "  Database: PostgreSQL (with default users and teams)"
    echo "  Inject Bank: Empty (ready for your scenarios)"
    echo "  Welcome Kit: Initialized with default templates"
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
    echo "  - Configure CORS_ORIGINS for your domain"
    echo ""
    echo "🚀 Next Steps:"
    echo "  1. Open http://localhost:5173 in your browser"
    echo "  2. Log in with admin / Admin123!"
    echo "  3. Explore the admin panel to manage users and teams"
    echo "  4. Create new exercises or modify the demo exercise"
    echo "  5. Start creating inject scenarios"
    echo ""
    echo "📚 Documentation:"
    echo "  - See README.md for detailed usage instructions"
    echo "  - API documentation available at /docs"
    echo ""
    echo "🛠️  Development Commands:"
    echo "  View logs:     docker-compose logs -f"
    echo "  Stop services: docker-compose down"
    echo "  Restart:       docker-compose restart"
    echo ""
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --production)
            ENVIRONMENT="production"
            shift
            ;;
        --dev)
            ENVIRONMENT="development"
            shift
            ;;
        --skip-build)
            SKIP_BUILD=true
            shift
            ;;
        --skip-init)
            SKIP_INIT=true
            shift
            ;;
        --force-reinit)
            FORCE_REINIT=true
            shift
            ;;
        -h|--help)
            show_help
            exit 0
            ;;
        *)
            print_error "Unknown option: $1"
            show_help
            exit 1
            ;;
    esac
done

# Main execution
main() {
    print_header
    
    check_prerequisites
    setup_environment
    build_and_start_containers
    wait_for_services
    initialize_database
    show_completion_message
}

# Run main function
main "$@"
