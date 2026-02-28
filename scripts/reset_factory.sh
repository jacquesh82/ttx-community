#!/bin/bash

# TTX Platform - Factory Reset Script
# 
# This script completely resets the TTX Platform to a clean state,
# removing all data, containers, volumes, and images.
#
# Usage: ./scripts/reset_factory.sh [options]
#
# Options:
#   --force          Skip confirmation prompts
#   --keep-volumes   Keep Docker volumes (database, media, logs)
#   --help, -h       Show this help message

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
PROJECT_NAME="ttx-platform"

# Default values
FORCE=false
KEEP_VOLUMES=false

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
    echo "║                    TTX Platform Factory Reset                ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

print_warning() {
    echo -e "${RED}⚠️  WARNING: This will completely reset your TTX Platform!${NC}"
    echo -e "${RED}⚠️  All data will be permanently deleted!${NC}"
    echo ""
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

print_step() {
    echo -e "${YELLOW}[STEP]${NC} $1"
}

show_help() {
    echo "Usage: $0 [options]"
    echo ""
    echo "Options:"
    echo "  --force          Skip confirmation prompts"
    echo "  --keep-volumes   Keep Docker volumes (database, media, logs)"
    echo "  --help, -h       Show this help message"
    echo ""
    echo "This script will:"
    echo "  1. Stop all running containers"
    echo "  2. Remove all containers"
    echo "  3. Remove all images (unless --keep-volumes is used)"
    echo "  4. Remove all volumes (unless --keep-volumes is used)"
    echo "  5. Clean up any leftover files"
    echo ""
    echo "After running this script, you'll need to run the installation"
    echo "script to set up a fresh environment."
}

check_prerequisites() {
    print_step "Checking prerequisites..."
    
    # Check if Docker is installed
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed. Please install Docker first."
        exit 1
    fi
    
    # Ensure Docker daemon is running
    if ! docker info &> /dev/null; then
        print_error "Docker daemon is not running. Please start Docker."
        exit 1
    fi

    # Check if Docker Compose is installed
    set_compose_command
    
    # Check if we're in the right directory
    if [[ ! -f "$PROJECT_ROOT/docker-compose.yml" ]]; then
        print_error "docker-compose.yml not found. Please run this script from the project root directory."
        exit 1
    fi
    
    print_success "Prerequisites check passed"
}

confirm_reset() {
    if [[ "$FORCE" == "true" ]]; then
        return 0
    fi
    
    print_warning
    echo "Are you sure you want to proceed with the factory reset?"
    echo ""
    echo "This will delete:"
    echo "  - All Docker containers"
    echo "  - All Docker images for this project"
    if [[ "$KEEP_VOLUMES" != "true" ]]; then
        echo "  - All Docker volumes (database, media, logs)"
    else
        echo "  - All Docker volumes will be kept"
    fi
    echo "  - Any temporary files"
    echo ""
    
    read -p "Type 'yes' to confirm or 'no' to cancel: " -r
    if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
        print_info "Factory reset cancelled"
        exit 0
    fi
    echo ""
}

stop_containers() {
    print_step "Stopping all containers..."
    
    cd "$PROJECT_ROOT"
    
    # Stop containers using docker compose helper
    run_compose down --volumes --remove-orphans >/dev/null 2>&1 || true
    
    print_success "All containers stopped"
}

remove_containers() {
    print_step "Removing containers..."
    
    # Remove any remaining containers with project name
    docker ps -aq --filter "label=com.docker.compose.project=$PROJECT_NAME" | xargs -r docker rm -f
    
    print_success "Containers removed"
}

remove_images() {
    if [[ "$KEEP_VOLUMES" == "true" ]]; then
        print_info "Skipping image removal (--keep-volumes specified)"
        return 0
    fi
    
    print_step "Removing images..."
    
    # Remove images with project name
    docker images -q --filter "label=com.docker.compose.project=$PROJECT_NAME" | xargs -r docker rmi -f
    
    print_success "Images removed"
}

remove_volumes() {
    if [[ "$KEEP_VOLUMES" == "true" ]]; then
        print_info "Skipping volume removal (--keep-volumes specified)"
        return 0
    fi
    
    print_step "Removing volumes..."
    
    # Remove volumes with project name
    docker volume ls -q --filter "label=com.docker.compose.project=$PROJECT_NAME" | xargs -r docker volume rm
    
    print_success "Volumes removed"
}

cleanup_files() {
    print_step "Cleaning up temporary files..."
    
    # Remove any .env.local files
    rm -f "$PROJECT_ROOT/.env.local"
    
    # Remove any log files in the project root
    find "$PROJECT_ROOT" -name "*.log" -type f -delete 2>/dev/null || true
    
    # Clean up any node_modules directories
    find "$PROJECT_ROOT" -name "node_modules" -type d -exec rm -rf {} + 2>/dev/null || true
    
    print_success "Temporary files cleaned up"
}

verify_cleanup() {
    print_step "Verifying cleanup..."
    
    # Check if any containers remain
    CONTAINER_COUNT=$(docker ps -aq --filter "label=com.docker.compose.project=$PROJECT_NAME" | wc -l)
    if [[ $CONTAINER_COUNT -gt 0 ]]; then
        print_warning "Some containers may still exist"
    else
        print_success "No containers found"
    fi

    # Check docker compose stack
    if COMPOSE_RUNNING=$(run_compose ps -q 2>/dev/null | wc -l | tr -d '[:space:]'); then
        if [[ $COMPOSE_RUNNING -gt 0 ]]; then
            print_warning "Docker Compose stack still lists $COMPOSE_RUNNING service(s)"
        else
            print_success "Docker Compose stack has no running services"
        fi
    else
        print_warning "Unable to query Docker Compose stack"
    fi

    # Check if any volumes remain (only if we removed them)
    if [[ "$KEEP_VOLUMES" != "true" ]]; then
        VOLUME_COUNT=$(docker volume ls -q --filter "label=com.docker.compose.project=$PROJECT_NAME" | wc -l)
        if [[ $VOLUME_COUNT -gt 0 ]]; then
            print_warning "Some volumes may still exist"
        else
            print_success "No volumes found"
        fi
    fi
    
    # Check if any images remain (only if we removed them)
    if [[ "$KEEP_VOLUMES" != "true" ]]; then
        IMAGE_COUNT=$(docker images -q --filter "label=com.docker.compose.project=$PROJECT_NAME" | wc -l)
        if [[ $IMAGE_COUNT -gt 0 ]]; then
            print_warning "Some images may still exist"
        else
            print_success "No images found"
        fi
    fi
}

show_completion_message() {
    echo ""
    echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║                    Factory Reset Complete                    ║${NC}"
    echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo "Your TTX Platform has been completely reset to a clean state."
    echo ""
    echo "Next steps:"
    echo "1. Run the installation script: ./scripts/install.sh"
    echo "2. Or start fresh with: docker-compose up -d"
    echo ""
    echo "The installation script will:"
    echo "  - Set up the environment configuration"
    echo "  - Initialize the database with default users and teams"
    echo "  - Create a demo exercise with empty inject bank"
    echo "  - Initialize the welcome kit with default templates"
    echo ""
    echo "For more information, see the README.md file."
    echo ""
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --force)
            FORCE=true
            shift
            ;;
        --keep-volumes)
            KEEP_VOLUMES=true
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
    confirm_reset
    stop_containers
    remove_containers
    remove_images
    remove_volumes
    cleanup_files
    verify_cleanup
    show_completion_message
}

# Run main function
main "$@"
