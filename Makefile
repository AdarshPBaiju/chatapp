.DEFAULT_GOAL := help

# Variables
COMPOSE=docker compose
DEV_COMPOSE=$(COMPOSE) -f docker-compose.dev.yml
PROD_COMPOSE=$(COMPOSE) -f docker-compose.prod.yml --env-file .env.prod
BACKEND=backend
DB=db
REDIS=redis

.PHONY: help build dev-build up down restart logs ps shell migrate makemigrations collectstatic createsuperuser test test-coverage lint lint-fix format quality prod-build prod-up prod-down clean teardown dev-setup db-shell db-reset redis-shell minio-init rebuild

help:
	@echo "Available commands:"
	@echo "  build            - Build all Docker images"
	@echo "  dev-build        - Build development images"
	@echo "  up               - Start services in background"
	@echo "  up-logs          - Start services with logs"
	@echo "  down             - Stop all services"
	@echo "  restart          - Restart services"
	@echo "  logs             - Show logs"
	@echo "  ps               - List running containers"
	@echo "  shell            - Open backend shell"
	@echo "  migrate          - Apply migrations"
	@echo "  makemigrations   - Create migrations"
	@echo "  collectstatic    - Collect static files"
	@echo "  createsuperuser  - Create admin user"
	@echo "  test             - Run tests"
	@echo "  test-coverage    - Run tests with coverage"
	@echo "  lint             - Run linter"
	@echo "  lint-fix         - Fix lint issues"
	@echo "  format           - Format code"
	@echo "  quality          - Lint + format + test"
	@echo "  prod-build       - Build production images"
	@echo "  prod-up          - Start production"
	@echo "  prod-down        - Stop production"
	@echo "  clean            - ⚠️ Remove containers, volumes, images"
	@echo "  teardown         - Stop + remove containers + volumes"
	@echo "  rebuild          - Rebuild from scratch"
	@echo "  dev-setup        - Full dev setup"

# Build
build:
	$(COMPOSE) build

dev-build:
	$(DEV_COMPOSE) build

# Run
up:
	$(COMPOSE) up -d

up-logs:
	$(COMPOSE) up

down:
	$(COMPOSE) down

restart:
	$(COMPOSE) restart

ps:
	$(COMPOSE) ps

logs:
	$(COMPOSE) logs -f

logs-%:
	$(COMPOSE) logs -f $*

# Backend access
shell:
	$(COMPOSE) exec $(BACKEND) bash

# Django commands
migrate:
	$(COMPOSE) exec $(BACKEND) python manage.py migrate

makemigrations:
	$(COMPOSE) exec $(BACKEND) python manage.py makemigrations

collectstatic:
	$(COMPOSE) exec $(BACKEND) python manage.py collectstatic --noinput

createsuperuser:
	$(COMPOSE) exec $(BACKEND) python manage.py createsuperuser

# Testing
test:
	$(COMPOSE) exec $(BACKEND) python manage.py test

test-coverage:
	$(COMPOSE) exec $(BACKEND) coverage run manage.py test
	$(COMPOSE) exec $(BACKEND) coverage report
	$(COMPOSE) exec $(BACKEND) coverage html

# Code quality
lint:
	$(COMPOSE) exec $(BACKEND) ruff check .

lint-fix:
	$(COMPOSE) exec $(BACKEND) ruff check . --fix

format:
	$(COMPOSE) exec $(BACKEND) ruff format .

quality: lint format test

# Production
prod-build:
	$(PROD_COMPOSE) build

prod-up:
	$(PROD_COMPOSE) up -d

prod-down:
	$(PROD_COMPOSE) down

# Cleanup
clean:
	$(COMPOSE) down -v --rmi all

teardown:
	$(COMPOSE) down -v

# Rebuild everything
rebuild: down build up

# Development setup
dev-setup: build up
	@echo "Waiting for services..."
	@sleep 5
	@$(MAKE) migrate

# Database
db-shell:
	$(COMPOSE) exec $(DB) psql -U postgres -d chatapp

db-reset:
	$(COMPOSE) down
	docker volume rm chatapp_postgres_data || true
	$(COMPOSE) up -d
	@echo "Waiting for DB..."
	@sleep 5
	@$(MAKE) migrate

# Redis
redis-shell:
	$(COMPOSE) exec $(REDIS) redis-cli

# MinIO (better moved to script in production)
minio-init:
	$(COMPOSE) exec $(BACKEND) python manage.py shell -c "import boto3; from django.conf import settings; client=boto3.client('s3',endpoint_url=settings.AWS_S3_ENDPOINT_URL,aws_access_key_id=settings.AWS_ACCESS_KEY_ID,aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,region_name='us-east-1'); \
	print('Bucket ready' if not client.list_buckets() else 'Checked')"
