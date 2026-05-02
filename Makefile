.DEFAULT_GOAL := help

# Variables
COMPOSE = docker compose
PROJECT_NAME = chatapp

# Environment specific commands
DEV_CMD = $(COMPOSE) -f docker-compose.yml -f docker-compose.dev.yml
PROD_CMD = $(COMPOSE) -f docker-compose.yml -f docker-compose.prod.yml --env-file .env.prod

.PHONY: help dev-build dev-rebuild dev-up dev-down dev-restart dev-logs dev-shell dev-migrate dev-makemigrations prod-build prod-up prod-down prod-restart prod-logs teardown clean

help:
	@echo "ChatApp Development Control"
	@echo "---------------------------"
	@echo "Development Commands:"
	@echo "  make dev-build            - Build dev images"
	@echo "  make dev-rebuild          - 🔨 Clean build (no cache)"
	@echo "  make dev-up               - Start dev environment"
	@echo "  make dev-down             - Stop dev containers"
	@echo "  make dev-restart          - Restart dev containers"
	@echo "  make dev-teardown         - Stop and remove dev volumes"
	@echo "  make dev-clean            - ⚠️ Full wipe (volumes + images)"
	@echo "  make dev-logs             - Follow all dev logs"
	@echo "  make dev-logs-<service>   - Follow logs for a specific dev service"
	@echo "  make dev-backend          - Shortcut for backend logs"
	@echo "  make dev-frontend         - Shortcut for frontend logs"
	@echo "  make dev-go-auth          - Shortcut for Go Auth logs"
	@echo "  make dev-go-enrichment    - Shortcut for Go Enrichment logs"
	@echo "  make dev-go-risk          - Shortcut for Go Risk logs"
	@echo "  make dev-go-all           - Shortcut for all Go service logs"
	@echo "  make dev-shell            - Open shell in backend container"
	@echo "  make dev-migrate          - Run migrations in dev"
	@echo "  make dev-makemigrations   - Create migrations in dev"
	@echo ""
	@echo "Production Commands:"
	@echo "  make prod-build           - Build prod images"
	@echo "  make prod-up              - Start prod environment"
	@echo "  make prod-down            - Stop prod containers"
	@echo "  make prod-restart         - Restart prod containers"
	@echo "  make prod-teardown        - Stop and remove prod volumes"
	@echo "  make prod-logs            - Follow all prod logs"
	@echo "  make prod-logs-<service>  - Follow logs for a specific prod service"
	@echo "  make prod-frontend        - Shortcut for production frontend logs"
	@echo "  make prod-go-auth         - Shortcut for production Go Auth logs"
	@echo "  make prod-go-enrichment   - Shortcut for production Go Enrichment logs"
	@echo "  make prod-go-risk         - Shortcut for production Go Risk logs"
	@echo "  make prod-go-all          - Shortcut for all production Go service logs"
	@echo "  make prod-backend         - Shortcut for backend logs"
	@echo ""
	@echo "Global Commands:"
	@echo "  make teardown             - Full wipe of Dev & Prod (removes volumes)"
	@echo "  make clean                - ⚠️ Nuclear wipe (volumes + images)"
	@echo ""
	@echo "Admin UI:"
	@echo "  pgAdmin (DB UI) is available at http://localhost:5050"
	@echo "  (Login: admin@chatapp.com / admin)"

# --- Global ---
teardown:
	$(DEV_CMD) down -v --remove-orphans
	$(PROD_CMD) down -v --remove-orphans

clean:
	$(DEV_CMD) down -v --rmi all --remove-orphans
	$(PROD_CMD) down -v --rmi all --remove-orphans

# --- Development ---
dev-build:
	$(DEV_CMD) build

dev-rebuild:
	$(DEV_CMD) build --no-cache

dev-up:
	$(DEV_CMD) up -d

dev-down:
	$(DEV_CMD) down

dev-restart:
	$(DEV_CMD) restart

dev-teardown:
	$(DEV_CMD) down -v --remove-orphans

dev-clean:
	$(DEV_CMD) down -v --rmi all --remove-orphans

dev-logs:
	$(DEV_CMD) logs -f

dev-logs-%:
	$(DEV_CMD) logs -f $*

dev-backend:
	$(DEV_CMD) logs -f backend

dev-frontend:
	$(DEV_CMD) logs -f frontend

dev-backend:
	$(DEV_CMD) logs -f backend

dev-gateway:
	$(DEV_CMD) logs -f gateway

dev-logs:
	$(DEV_CMD) logs -f

dev-go-auth:
	$(DEV_CMD) logs -f go-auth

dev-go-enrichment:
	$(DEV_CMD) logs -f go-enrichment

dev-go-risk:
	$(DEV_CMD) logs -f go-risk

dev-go-chat:
	$(DEV_CMD) logs -f go-chat

dev-go-all:
	$(DEV_CMD) logs -f go-auth go-enrichment go-risk go-chat

dev-shell:
	$(DEV_CMD) exec backend bash

dev-migrate:
	$(DEV_CMD) exec backend python manage.py migrate

dev-makemigrations:
	$(DEV_CMD) exec backend python manage.py makemigrations

# --- Production ---
prod-build:
	$(PROD_CMD) build

prod-up:
	$(PROD_CMD) up -d

prod-down:
	$(PROD_CMD) down

prod-restart:
	$(PROD_CMD) restart

prod-teardown:
	$(PROD_CMD) down -v --remove-orphans

prod-logs:
	$(PROD_CMD) logs -f

prod-logs-%:
	$(PROD_CMD) logs -f $*

prod-backend:
	$(PROD_CMD) logs -f backend

prod-frontend:
	$(PROD_CMD) logs -f frontend

prod-go-auth:
	$(PROD_CMD) logs -f go-auth

prod-go-enrichment:
	$(PROD_CMD) logs -f go-enrichment

prod-go-risk:
	$(PROD_CMD) logs -f go-risk

prod-go-chat:
	$(PROD_CMD) logs -f go-chat

prod-go-all:
	$(PROD_CMD) logs -f go-auth go-enrichment go-risk go-chat
