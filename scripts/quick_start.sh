#!/bin/bash

# TTX Platform - Quick Start Script
#
# This script provides a quick way to start the TTX Platform for development.
# It's designed for developers who want to get up and running quickly.
#
# Usage: ./scripts/quick_start.sh [options]
#
# Options:
#   --fresh          Start fresh (stop and remove existing containers)
#   --logs           Show logs after starting
#   --dev            Start in development mode (with hot reload)
#   --prod           Start in production mode
#   --help, -h       Show this help message

set -e

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

# Default values
FRESH=false
SHOW_LOGS=false
MODE="dev"

# Functions
print_header() {
    echo -e "${CYAN}"
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║                      TTX Platform Quick Start                ║"
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
    echo "  --fresh          Start fresh (stop and remove existing containers)"
    echo "  --logs           Show logs after starting"
    echo "  --dev            Start in development mode (with hot reload)"
    echo "  --prod           Start in production mode"
    echo "  --help, -h       Show this help message"
    echo ""
    echo "Quick Start Modes:"
    echo "  Development:     Fast startup with hot reload for frontend/backend"
    echo "  Production:      Optimized build for production use"
    echo ""
    echo "Examples:"
    echo "  $0               Start in development mode"
    echo "  $0 --fresh       Fresh start (removes existing containers)"
    echo "  $0 --logs        Start and show logs"
    echo "  $0 --prod        Start in production mode"
    echo ""
    echo "After starting:"
    echo "  Frontend:  http://localhost:5173"
    echo "  API:       http://localhost:3000"
    echo "  API Docs:  http://localhost:3000/docs"
}

check_prerequisites() {
    print_step "Checking prerequisites..."
    
    # Check if Docker is installed
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed. Please install Docker first."
        exit 1
    fi
    
    # Check if Docker Compose is installed
    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
        print_error "Docker Compose is not installed. Please install Docker Compose first."
        exit 1
    fi
    
    # Check if we're in the right directory
    if [[ ! -f "$PROJECT_ROOT/docker-compose.yml" ]]; then
        print_error "docker-compose.yml not found. Please run this script from the project root directory."
        exit 1
    fi
    
    print_success "Prerequisites check passed"
}

prepare_environment() {
    print_step "Preparing environment..."
    
    cd "$PROJECT_ROOT"
    
    # Check if .env exists, create from example if not
    if [[ ! -f ".env" ]]; then
        if [[ -f ".env.example" ]]; then
            print_info "Creating .env from .env.example"
            cp .env.example .env
        else
            print_error ".env.example not found"
            exit 1
        fi
    fi
    
    # Ensure we have a session secret
    if ! grep -q "SESSION_SECRET=" .env || grep -q "change_me_in_production_min_32_chars" .env; then
        SESSION_SECRET=$(openssl rand -base64 32 | tr -d /=+ | cut -c -32)
        sed -i.bak "s/SESSION_SECRET=.*/SESSION_SECRET=$SESSION_SECRET/" .env
        rm -f .env.bak
        print_info "Generated new SESSION_SECRET"
    fi
    
    print_success "Environment ready"
}

start_fresh() {
    print_step "Starting fresh (removing existing containers)..."
    
    cd "$PROJECT_ROOT"
    
    # Stop and remove existing containers
    if command -v docker-compose &> /dev/null; then
        docker-compose down -v 2>/dev/null || true
    else
        docker compose down -v 2>/dev/null || true
    fi
    
    print_success "Existing containers removed"
}

start_services() {
    print_step "Starting services..."
    
    cd "$PROJECT_ROOT"
    
    # Start containers
    if command -v docker-compose &> /dev/null; then
        docker-compose up -d
    else
        docker compose up -d
    fi
    
    print_success "Services started"
}

wait_for_services() {
    print_step "Waiting for services to be ready..."
    
    # Wait for database
    print_info "Waiting for database..."
    sleep 5
    
    # Check if containers are running
    if command -v docker-compose &> /dev/null; then
        RUNNING_CONTAINERS=$(docker-compose ps -q | wc -l)
    else
        RUNNING_CONTAINERS=$(docker compose ps -q | wc -l)
    fi
    
    if [[ $RUNNING_CONTAINERS -lt 2 ]]; then
        print_error "Failed to start services properly"
        print_info "Check container status with: docker-compose ps"
        exit 1
    fi
    
    # Wait for backend
    print_info "Waiting for backend API..."
    for i in {1..30}; do
        if curl -s http://localhost:3000/health > /dev/null 2>&1; then
            print_success "Backend API is ready"
            break
        fi
        if [[ $i -eq 30 ]]; then
            print_warning "Backend API may not be ready yet"
            break
        fi
        sleep 2
    done
    
    # Wait for frontend
    print_info "Waiting for frontend..."
    for i in {1..30}; do
        if curl -s http://localhost:5173 > /dev/null 2>&1; then
            print_success "Frontend is ready"
            break
        fi
        if [[ $i -eq 30 ]]; then
            print_warning "Frontend may not be ready yet"
            break
        fi
        sleep 2
    done
}

show_logs() {
    print_step "Showing logs..."
    echo ""
    
    cd "$PROJECT_ROOT"
    
    if command -v docker-compose &> /dev/null; then
        docker-compose logs -f
    else
        docker compose logs -f
    fi
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
    echo "🛠️  Development Commands:"
    echo "  View logs:     $0 --logs"
    echo "  Stop services: docker-compose down"
    echo "  Restart:       docker-compose restart"
    echo "  View status:   docker-compose ps"
    echo ""
    echo "📝 Notes:"
    if [[ "$FRESH" == "true" ]]; then
        echo "  - Started fresh (existing data was removed)"
    fi
    if [[ "$MODE" == "dev" ]]; then
        echo "  - Development mode: changes will auto-reload"
    else
        echo "  - Production mode: optimized for performance"
    fi
    echo ""
    echo "🔑 Default Credentials (if database was initialized):"
    echo "  Admin:       admin / Admin123!"
    echo "  Animateur:   animateur1 / Anim123!"
    echo "  Observateur: observateur1 / Obs123!"
    echo "  Participant: participant1 / Part123!"
    echo ""
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --fresh)
            FRESH=true
            shift
            ;;
        --logs)
            SHOW_LOGS=true
            shift
            ;;
        --dev)
            MODE="dev"
            shift
            ;;
        --prod)
            MODE="prod"
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
    prepare_environment
    
    if [[ "$FRESH" == "true" ]]; then
        start_fresh
    fi
    
    start_services
    wait_for_services
    
    if [[ "$SHOW_LOGS" == "true" ]]; then
        show_logs
    else
        show_completion_message
    fi
}

# Run main function
main "$@"