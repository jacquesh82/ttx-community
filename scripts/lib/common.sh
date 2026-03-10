#!/usr/bin/env bash
# scripts/lib/common.sh — shared helpers for TTX shell scripts
# Source this file: source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"

# ─────────────────────────────────────────────
# Colors
# ─────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# ─────────────────────────────────────────────
# Output helpers
# ─────────────────────────────────────────────
print_info()    { echo -e "${BLUE}[INFO]${NC} $1"; }
print_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
print_error()   { echo -e "${RED}[ERROR]${NC} $1"; }
print_step()    { echo -e "${CYAN}[STEP]${NC} $1"; }

# ─────────────────────────────────────────────
# Docker helpers
# ─────────────────────────────────────────────
DOCKER_COMPOSE_CMD=()

require_docker() {
    if ! command -v docker >/dev/null 2>&1; then
        print_error "Docker n'est pas installé. Voir: https://docs.docker.com/get-docker/"
        exit 1
    fi
    if ! docker info >/dev/null 2>&1; then
        print_error "Le daemon Docker n'est pas disponible. Démarrez Docker."
        exit 1
    fi
}

detect_compose() {
    if command -v docker-compose >/dev/null 2>&1; then
        DOCKER_COMPOSE_CMD=(docker-compose)
        return 0
    fi
    if docker compose version >/dev/null 2>&1; then
        DOCKER_COMPOSE_CMD=(docker compose)
        return 0
    fi
    print_error "Docker Compose non trouvé. Voir: https://docs.docker.com/compose/install/"
    exit 1
}

run_compose() {
    if [[ ${#DOCKER_COMPOSE_CMD[@]} -eq 0 ]]; then
        print_error "Docker Compose non configuré — appelez detect_compose() d'abord"
        exit 1
    fi
    "${DOCKER_COMPOSE_CMD[@]}" "$@"
}

require_running() {
    # Usage: require_running svc1 svc2 ...
    local -a missing=()
    for svc in "$@"; do
        local cnt
        cnt=$(run_compose ps -q "$svc" 2>/dev/null | wc -l | tr -d '[:space:]')
        cnt=${cnt:-0}
        if [[ "$cnt" -eq 0 ]]; then
            missing+=("$svc")
        fi
    done
    if [[ ${#missing[@]} -gt 0 ]]; then
        print_warning "Services non démarrés: ${missing[*]}"
        print_info "Lancez: ${DOCKER_COMPOSE_CMD[*]} up -d"
        return 1
    fi
    return 0
}

# ─────────────────────────────────────────────
# Environment helpers
# ─────────────────────────────────────────────

ensure_env_file() {
    # Usage: ensure_env_file <project_root>
    local root="${1:-.}"
    if [[ ! -f "$root/.env" ]]; then
        if [[ -f "$root/.env.example" ]]; then
            cp "$root/.env.example" "$root/.env"
            print_success "Fichier .env créé depuis .env.example"
        else
            print_error ".env.example introuvable dans $root"
            exit 1
        fi
    else
        print_info ".env existe déjà, ignoré"
    fi
}

generate_session_secret() {
    # Usage: generate_session_secret <project_root>
    local root="${1:-.}"
    if ! grep -q "SESSION_SECRET=" "$root/.env" 2>/dev/null \
       || grep -q "change_me_in_production_min_32_chars" "$root/.env" 2>/dev/null; then
        local secret
        secret=$(openssl rand -base64 32 | tr -d '/=+' | cut -c -32)
        sed -i.bak "s/SESSION_SECRET=.*/SESSION_SECRET=$secret/" "$root/.env"
        rm -f "$root/.env.bak"
        print_success "SESSION_SECRET généré"
    fi
}

# ─────────────────────────────────────────────
# Service readiness helpers
# ─────────────────────────────────────────────

wait_for_backend() {
    print_info "Attente du backend API (http://localhost:3000/api/health)..."
    for i in {1..30}; do
        if curl -fsS http://localhost:3000/api/health >/dev/null 2>&1 \
           || curl -fsS http://localhost:3000/health >/dev/null 2>&1; then
            print_success "Backend prêt"
            return 0
        fi
        if [[ $i -eq 30 ]]; then
            print_warning "Backend peut ne pas être prêt (timeout)"
            return 1
        fi
        sleep 2
    done
}

wait_for_frontend() {
    print_info "Attente du frontend (http://localhost:5173)..."
    for i in {1..30}; do
        if curl -fsS http://localhost:5173 >/dev/null 2>&1; then
            print_success "Frontend prêt (http://localhost:5173)"
            return 0
        fi
        if [[ $i -eq 30 ]]; then
            print_warning "Frontend peut ne pas être prêt (timeout)"
            return 1
        fi
        sleep 2
    done
}
