#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

usage() {
  cat <<'EOF'
Usage: ./scripts/reset_db.sh [--demo-exercise]

Reset only the database schema/data and reinitialize default data.

Options:
  --demo-exercise   Also create the demo exercise after reset
  -h, --help        Show this help
EOF
}

DEMO_ARG=""
case "${1:-}" in
  --demo-exercise)
    DEMO_ARG="--demo-exercise"
    ;;
  -h|--help)
    usage
    exit 0
    ;;
  "")
    ;;
  *)
    echo "Unknown option: $1" >&2
    usage
    exit 1
    ;;
esac

run_local() {
  echo "[reset-db] Running locally via backend/scripts/init_env.py --reset ${DEMO_ARG}"
  (
    cd "$PROJECT_ROOT/backend"
    python3 scripts/init_env.py --reset ${DEMO_ARG}
  )
}

if command -v docker-compose >/dev/null 2>&1; then
  if (cd "$PROJECT_ROOT" && docker-compose ps backend >/dev/null 2>&1); then
    echo "[reset-db] Running inside docker-compose backend service"
    (cd "$PROJECT_ROOT" && docker-compose exec backend python scripts/init_env.py --reset ${DEMO_ARG})
    exit 0
  fi
fi

if command -v docker >/dev/null 2>&1; then
  if (cd "$PROJECT_ROOT" && docker compose ps backend >/dev/null 2>&1); then
    echo "[reset-db] Running inside docker compose backend service"
    (cd "$PROJECT_ROOT" && docker compose exec backend python scripts/init_env.py --reset ${DEMO_ARG})
    exit 0
  fi
fi

run_local
