# TTX Platform — Makefile
# Run `make help` for the full list of targets.

COMPOSE := docker compose
BACKEND  := ttx-community-backend
MANAGE   := $(COMPOSE) exec -T $(BACKEND) python scripts/manage.py

.DEFAULT_GOAL := help

.PHONY: help install start stop restart logs \
        reset reset-factory migrate seed db-backup db-restore \
        create-tenant info shell-backend shell-db test rebuild-frontend

# ─────────────────────────────────────────────
# Meta
# ─────────────────────────────────────────────
help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
	  | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-22s\033[0m %s\n", $$1, $$2}' \
	  | sort

# ─────────────────────────────────────────────
# Lifecycle
# ─────────────────────────────────────────────
install: ## Install and initialize the platform (./scripts/install.sh)
	./scripts/install.sh

start: ## Start all containers
	$(COMPOSE) up -d

stop: ## Stop all containers
	$(COMPOSE) down

restart: ## Restart all containers
	$(COMPOSE) restart

logs: ## Tail logs (all services)
	$(COMPOSE) logs -f

# ─────────────────────────────────────────────
# Database
# ─────────────────────────────────────────────
reset: ## Reset DB + reseed demo data (manage.py init --reset --demo)
	$(MANAGE) init --reset --demo

reset-factory: ## Full factory reset (./scripts/reset_factory.sh --force)
	./scripts/reset_factory.sh --force

migrate: ## Run alembic upgrade head
	$(MANAGE) db migrate

seed: ## Seed all demo data (users + teams + exercise + contacts)
	$(MANAGE) seed all

db-backup: ## Backup database to backups/
	./scripts/db_backup.sh

db-restore: ## Restore database from FILE=backups/…sql.gz
	@if [[ -z "$(FILE)" ]]; then echo "Usage: make db-restore FILE=backups/<file>.sql.gz"; exit 1; fi
	./scripts/db_restore.sh "$(FILE)"

# ─────────────────────────────────────────────
# Tenant management
# ─────────────────────────────────────────────
create-tenant: ## Create a tenant: make create-tenant SLUG=acme NAME="ACME Corp"
	@if [[ -z "$(SLUG)" ]] || [[ -z "$(NAME)" ]]; then \
	  echo "Usage: make create-tenant SLUG=<slug> NAME=<name>"; exit 1; fi
	$(MANAGE) tenant create "$(SLUG)" "$(NAME)"

# ─────────────────────────────────────────────
# Info / Debugging
# ─────────────────────────────────────────────
info: ## Show tenants / users / exercises count + alembic revision
	$(MANAGE) info

shell-backend: ## Open a shell in the backend container
	$(COMPOSE) exec $(BACKEND) bash

shell-db: ## Open psql in the postgres container
	$(COMPOSE) exec ttx-community-postgres psql -U ttx -d ttx

# ─────────────────────────────────────────────
# Tests & Build
# ─────────────────────────────────────────────
test: ## Run backend test suite
	$(COMPOSE) exec -T $(BACKEND) pytest

rebuild-frontend: ## Rebuild and restart the frontend container
	./scripts/rebuild_frontend.sh
