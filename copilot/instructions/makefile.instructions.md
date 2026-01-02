---
description: "Makefile best practices for project automation and build system"
applyTo: "**/Makefile"
---

# Makefile Development Standards

## Overview

Makefiles provide consistent command interfaces across development, testing, and deployment. They abstract complex commands into simple, memorable targets.

---

## Basic Structure

### Template Makefile
```makefile
# Project Makefile

.DEFAULT_GOAL := help

# Variables
PYTHON := python
UV := uv
PROJECT_DIR := $(shell pwd)

# Phony targets (not files)
.PHONY: help install test lint format clean run

help: ## Show this help message
	@echo "Available targets:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  %-20s %s\n", $$1, $$2}'

install: ## Install dependencies
	$(UV) sync --extra dev

test: ## Run tests
	$(UV) run pytest -v

lint: ## Run linters
	$(UV) run ruff check .
	$(UV) run mypy src/

format: ## Format code
	$(UV) run ruff format .

clean: ## Remove generated files
	find . -type d -name __pycache__ -exec rm -rf {} +
	find . -type f -name "*.pyc" -delete
	rm -rf .pytest_cache htmlcov .coverage build dist *.egg-info

run: ## Run application
	$(UV) run python run.py
```

---

## Target Organization

### Phony Targets
Use `.PHONY` for targets that don't produce files:

```makefile
.PHONY: test clean install deploy

# These don't create files, so mark as PHONY
test:
	pytest tests/

clean:
	rm -rf build/

install:
	pip install -r requirements.txt
```

### File Targets
Use real file targets when possible for automatic dependency tracking:

```makefile
# Real file target - only rebuilds if source changes
build/app: src/main.py src/utils.py
	mkdir -p build
	python -m PyInstaller src/main.py -o build/

# Dependency chain
dist/app.tar.gz: build/app
	tar -czf dist/app.tar.gz -C build app
```

---

## Variable Management

### Variable Definition
```makefile
# Immediate assignment (evaluated once)
PYTHON := python3
UV := uv
SRC_DIR := $(shell pwd)/src

# Conditional assignment (default if not set)
ENVIRONMENT ?= development
LOG_LEVEL ?= info

# Recursive assignment (evaluated on use)
TIMESTAMP = $(shell date +%Y%m%d-%H%M%S)
```

### Environment Variables
```makefile
# Export variables to subprocesses
export DATABASE_URL := postgresql://localhost/testdb
export FLASK_ENV := development

# Or export all variables
.EXPORT_ALL_VARIABLES:
```

### Platform Detection
```makefile
# Detect OS
UNAME_S := $(shell uname -s)

ifeq ($(UNAME_S),Linux)
    PLATFORM := linux
    OPEN := xdg-open
endif
ifeq ($(UNAME_S),Darwin)
    PLATFORM := macos
    OPEN := open
endif
ifeq ($(OS),Windows_NT)
    PLATFORM := windows
    OPEN := start
endif

coverage-report: test
	$(OPEN) htmlcov/index.html
```

---

## Common Development Targets

### Installation and Setup
```makefile
.PHONY: install install-dev initialize

install: ## Install production dependencies
	$(UV) sync

install-dev: ## Install development dependencies
	$(UV) sync --extra dev

initialize: install-dev ## Initialize development environment
	mkdir -p logs tmp
	test -f .env || cp .env.example .env
	@echo "Development environment initialized!"
```

### Testing Targets
```makefile
.PHONY: test test-unit test-integration test-coverage

test: ## Run all tests
	$(UV) run pytest tests/ -v

test-unit: ## Run unit tests only
	$(UV) run pytest tests/unit/ -v

test-integration: ## Run integration tests only
	$(UV) run pytest tests/integration/ -v

test-coverage: ## Run tests with coverage report
	$(UV) run pytest --cov=app --cov-report=html --cov-report=term
	@echo "Coverage report: htmlcov/index.html"
```

### Code Quality Targets
```makefile
.PHONY: lint format check

lint: ## Run linters
	$(UV) run ruff check .
	$(UV) run mypy src/

format: ## Format code
	$(UV) run ruff format .
	$(UV) run ruff check --fix .

check: test lint ## Run all quality checks
	@echo "All checks passed!"
```

### Cleanup Targets
```makefile
.PHONY: clean clean-pyc clean-test clean-build

clean: clean-pyc clean-test clean-build ## Remove all generated files

clean-pyc: ## Remove Python file artifacts
	find . -type d -name __pycache__ -exec rm -rf {} +
	find . -type f -name "*.pyc" -delete
	find . -type f -name "*.pyo" -delete
	find . -type f -name "*~" -delete

clean-test: ## Remove test and coverage artifacts
	rm -rf .pytest_cache
	rm -rf htmlcov
	rm -rf .coverage
	rm -rf .mypy_cache
	rm -rf .ruff_cache

clean-build: ## Remove build artifacts
	rm -rf build/
	rm -rf dist/
	rm -rf *.egg-info
```

---

## Output Control

### Silent Commands
```makefile
# @ suppresses command echo
install:
	@echo "Installing dependencies..."
	@uv sync --extra dev
	@echo "Done!"

# Without @, shows command:
install:
	echo "Installing dependencies..."  # Shows this line
	uv sync --extra dev              # Shows this line
```

### Verbose vs. Quiet Modes
```makefile
# Verbose mode with variable
VERBOSE ?= 0

test:
ifeq ($(VERBOSE),1)
	$(UV) run pytest tests/ -vv
else
	$(UV) run pytest tests/ -q
endif

# Usage:
# make test          # Quiet
# make test VERBOSE=1  # Verbose
```

---

## Background Process Management

### Process Control
```makefile
.PHONY: run run-bg stop

# PID file for process management
PID_FILE := /tmp/app.pid

run: ## Run application in foreground
	$(UV) run python run.py

run-bg: ## Run application in background
	@echo "Starting application in background..."
	@$(UV) run python run.py & echo $$! > $(PID_FILE)
	@echo "Application running with PID $$(cat $(PID_FILE))"

stop: ## Stop background application
	@if [ -f $(PID_FILE) ]; then \
		kill -TERM $$(cat $(PID_FILE)) 2>/dev/null || true; \
		rm -f $(PID_FILE); \
		echo "Application stopped"; \
	else \
		echo "No PID file found"; \
	fi
```

---

## Docker Integration

### Docker Targets
```makefile
.PHONY: docker-build docker-run docker-stop docker-clean

DOCKER_IMAGE := myapp
DOCKER_TAG := latest

docker-build: ## Build Docker image
	docker build -t $(DOCKER_IMAGE):$(DOCKER_TAG) .

docker-run: ## Run Docker container
	docker run -d --name $(DOCKER_IMAGE) -p 8000:8000 $(DOCKER_IMAGE):$(DOCKER_TAG)

docker-stop: ## Stop Docker container
	docker stop $(DOCKER_IMAGE) || true
	docker rm $(DOCKER_IMAGE) || true

docker-clean: docker-stop ## Remove Docker images
	docker rmi $(DOCKER_IMAGE):$(DOCKER_TAG) || true

docker-compose-up: ## Start services with docker-compose
	docker compose up -d

docker-compose-down: ## Stop services with docker-compose
	docker compose down
```

---

## DevContainer Integration

### Separate DevContainer Makefile
```makefile
# Main Makefile
-include .devcontainer/Makefile

# .devcontainer/Makefile
.PHONY: dev-setup dev-test

dev-setup: ## DevContainer-specific setup
	@echo "Running devcontainer setup..."
	uv sync --extra dev
	pre-commit install || true

dev-test: ## Run tests in devcontainer context
	uv run pytest tests/ -v --log-cli-level=DEBUG
```

---

## Conditional Logic

### Feature Flags
```makefile
# Check if command exists
HAS_UV := $(shell command -v uv 2> /dev/null)

install:
ifdef HAS_UV
	uv sync --extra dev
else
	pip install -r requirements-dev.txt
endif
```

### Environment-specific Targets
```makefile
ENVIRONMENT ?= development

deploy:
ifeq ($(ENVIRONMENT),production)
	@echo "Deploying to production..."
	# Production deployment commands
else ifeq ($(ENVIRONMENT),staging)
	@echo "Deploying to staging..."
	# Staging deployment commands
else
	@echo "Invalid environment: $(ENVIRONMENT)"
	@exit 1
endif
```

---

## Dependency Chains

### Target Dependencies
```makefile
# Build depends on test passing
build: test
	@echo "Building application..."
	python -m build

# Deploy depends on build
deploy: build
	@echo "Deploying application..."
	# Deployment commands

# Run all quality checks before commit
pre-commit: format lint test
	@echo "Ready to commit!"
```

---

## Advanced Patterns

### Parallel Execution
```makefile
# Run independent tasks in parallel
.PHONY: parallel-tests

parallel-tests:
	$(MAKE) -j4 test-unit test-integration lint type-check

# Note: Requires GNU Make 4.0+
```

### Dynamic Targets
```makefile
# Generate targets from files
TEST_FILES := $(wildcard tests/test_*.py)
TEST_TARGETS := $(TEST_FILES:tests/test_%.py=test-%)

$(TEST_TARGETS): test-%:
	$(UV) run pytest tests/test_$*.py -v

# Usage: make test-users, make test-auth, etc.
```

---

## Best Practices

### Documentation
```makefile
# Every target should have a help comment
target-name: ## Brief description of what this does
	@command
```

### Error Handling
```makefile
# Stop on errors (default behavior)
.SHELLFLAGS := -ec

# Or continue despite errors
.IGNORE:

# Specific target continues on error
.IGNORE: cleanup
cleanup:
	-rm -rf temp/  # - prefix ignores error if dir doesn't exist
```

### Multi-line Commands
```makefile
# Use \ for line continuation
deploy:
	@echo "Starting deployment..." && \
		docker build -t myapp . && \
		docker push myapp:latest && \
		kubectl apply -f k8s/ && \
		echo "Deployment complete!"
```

### Recipes with Shell Scripts
```makefile
# Complex logic in shell
initialize:
	@bash -c ' \
		if [ ! -f .env ]; then \
			echo "Creating .env from template..."; \
			cp .env.example .env; \
		fi; \
		mkdir -p logs tmp; \
		echo "Initialization complete!"; \
	'
```

---

## Complete Example

```makefile
# Project Makefile
.DEFAULT_GOAL := help

# Variables
UV := uv
PYTHON := python
SRC_DIR := src
TEST_DIR := tests

# Colors for output
COLOR_RESET := \033[0m
COLOR_INFO := \033[36m
COLOR_SUCCESS := \033[32m

.PHONY: help install test lint format check clean run

help: ## Show this help message
	@echo "$(COLOR_INFO)Available targets:$(COLOR_RESET)"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  $(COLOR_SUCCESS)%-20s$(COLOR_RESET) %s\n", $$1, $$2}'

install: ## Install dependencies
	@echo "$(COLOR_INFO)Installing dependencies...$(COLOR_RESET)"
	@$(UV) sync --extra dev
	@echo "$(COLOR_SUCCESS)Dependencies installed!$(COLOR_RESET)"

test: ## Run tests
	@echo "$(COLOR_INFO)Running tests...$(COLOR_RESET)"
	@$(UV) run pytest $(TEST_DIR)/ -v

test-coverage: ## Run tests with coverage
	@$(UV) run pytest --cov=$(SRC_DIR) --cov-report=html --cov-report=term

lint: ## Run linters
	@echo "$(COLOR_INFO)Running linters...$(COLOR_RESET)"
	@$(UV) run ruff check .
	@$(UV) run mypy $(SRC_DIR)/

format: ## Format code
	@echo "$(COLOR_INFO)Formatting code...$(COLOR_RESET)"
	@$(UV) run ruff format .

check: format lint test ## Run all quality checks
	@echo "$(COLOR_SUCCESS)All checks passed!$(COLOR_RESET)"

clean: ## Remove generated files
	@echo "$(COLOR_INFO)Cleaning up...$(COLOR_RESET)"
	@find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	@find . -type f -name "*.pyc" -delete
	@rm -rf .pytest_cache htmlcov .coverage .mypy_cache .ruff_cache
	@echo "$(COLOR_SUCCESS)Cleanup complete!$(COLOR_RESET)"

run: ## Run application
	@$(UV) run $(PYTHON) run.py
```
