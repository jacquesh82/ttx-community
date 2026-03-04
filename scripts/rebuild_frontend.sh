#!/usr/bin/env bash

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

DOCKER_COMPOSE_CMD=()

print_info() {
  echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
  echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
  echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
  echo -e "${RED}[ERROR]${NC} $1"
}

set_compose_command() {
  if command -v docker-compose >/dev/null 2>&1; then
    DOCKER_COMPOSE_CMD=(docker-compose)
    return
  fi

  if docker compose version >/dev/null 2>&1; then
    DOCKER_COMPOSE_CMD=(docker compose)
    return
  fi

  print_error "Docker Compose non trouvé."
  exit 1
}

run_compose() {
  "${DOCKER_COMPOSE_CMD[@]}" "$@"
}

main() {
  print_info "Rebuild + restart du frontend"

  if ! command -v docker >/dev/null 2>&1; then
    print_error "Docker non trouvé."
    exit 1
  fi

  if ! docker info >/dev/null 2>&1; then
    print_error "Le daemon Docker n'est pas disponible."
    exit 1
  fi

  set_compose_command

  if [[ ! -f "$PROJECT_ROOT/docker-compose.yml" ]]; then
    print_error "docker-compose.yml introuvable à la racine projet."
    exit 1
  fi

  cd "$PROJECT_ROOT"

  print_info "Build du service frontend..."
  run_compose build frontend

  print_info "Redémarrage du service frontend..."
  run_compose up -d --force-recreate frontend

  print_info "Attente de disponibilité de http://localhost:5173 ..."
  for i in {1..30}; do
    if curl -fsS http://localhost:5173 >/dev/null 2>&1; then
      print_success "Frontend prêt (http://localhost:5173)."
      exit 0
    fi
    sleep 2
  done

  print_warning "Le frontend a été relancé, mais la vérification HTTP a expiré."
  print_warning "Vérifie les logs avec: ${DOCKER_COMPOSE_CMD[*]} logs -f frontend"
}

main "$@"
