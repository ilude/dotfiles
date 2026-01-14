# Makefile Best Practices

## When to Use Makefiles

**Use Makefiles when:**
- Multi-language projects (Python + Go + TypeScript)
- Complex build pipelines with real dependencies
- `npm scripts` or `pyproject.toml` can't express the workflow
- Teams already familiar with Make

**Skip Makefiles when:**
- Single-language with straightforward commands
- `package.json` scripts or `pyproject.toml` scripts suffice
- Simple one-off automation (use shell scripts)

### Anti-Patterns

| Anti-Pattern | Problem |
|--------------|---------|
| Echo spam | "Starting...", "Now doing...", "Done!" adds noise |
| Flag accumulation | `pytest -v --tb=short --strict-markers --durations=0` |
| Wrapper theater | `make lint` just calls `npm run lint` |
| Unnecessary platform detection | When cross-platform isn't needed |

---

## Basic Template

```makefile
.DEFAULT_GOAL := help

PYTHON := python
UV := uv

.PHONY: help install test lint format clean run

help: ## Show this help message
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  %-20s %s\n", $$1, $$2}'

install: ## Install dependencies
	$(UV) sync --extra dev

test: ## Run tests
	$(UV) run pytest -v

lint: ## Run linters
	$(UV) run ruff check .

format: ## Format code
	$(UV) run ruff format .

clean: ## Remove generated files
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	rm -rf .pytest_cache htmlcov .coverage

run: ## Run application
	$(UV) run python run.py
```

---

## Variable Types

| Type | Syntax | When to Use |
|------|--------|-------------|
| Immediate | `VAR := value` | Constants, one-time evaluations |
| Conditional | `VAR ?= value` | Defaults, overrideable settings |
| Recursive | `VAR = value` | Dynamic values (evaluated each use) |

```makefile
# Immediate - evaluated once at definition
PYTHON := python
BUILD_DATE := $(shell date +%Y-%m-%d)

# Conditional - can override via CLI or environment
ENVIRONMENT ?= development
LOG_LEVEL ?= info

# Recursive - evaluated each time referenced
TIMESTAMP = $(shell date +%Y%m%d-%H%M%S)
```

Override at runtime:
```bash
make test ENVIRONMENT=production
ENVIRONMENT=staging make test
```

---

## PHONY vs File Targets

```makefile
# PHONY - commands that don't create files
.PHONY: test clean install

test:
	pytest tests/

# File target - only rebuilds when sources change
build/app: src/main.py src/utils.py
	python -m PyInstaller src/main.py -o build/
```

**Why `.PHONY` matters:** Without it, `make test` fails if a file named `test` exists.

---

## Platform Detection

```makefile
UNAME_S := $(shell uname -s)

ifeq ($(UNAME_S),Linux)
    OPEN := xdg-open
endif
ifeq ($(UNAME_S),Darwin)
    OPEN := open
endif
ifeq ($(OS),Windows_NT)
    OPEN := start
endif

show-docs: ## Open docs in browser
	$(OPEN) htmlcov/index.html
```

---

## Tool Detection

```makefile
HAS_UV := $(shell command -v uv 2>/dev/null)
HAS_POETRY := $(shell command -v poetry 2>/dev/null)

install:
ifdef HAS_UV
	uv sync --extra dev
else ifdef HAS_POETRY
	poetry install --with dev
else
	pip install -r requirements-dev.txt
endif
```

---

## Common Targets

### Testing

```makefile
test: ## Run all tests
	$(UV) run pytest tests/ -v

test-coverage: ## Run tests with coverage
	$(UV) run pytest --cov=app --cov-report=html --cov-report=term
```

### Code Quality

```makefile
lint: ## Run linters
	$(UV) run ruff check .
	$(UV) run mypy src/

format: ## Format code
	$(UV) run ruff format .
	$(UV) run ruff check --fix .

check: format lint test ## Run all quality checks
```

### Cleanup

```makefile
clean: ## Remove generated files
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	rm -rf .pytest_cache htmlcov .coverage .mypy_cache build/ dist/
```

---

## Output Control

```makefile
# @ suppresses command echo
install:
	@echo "Installing..."
	@uv sync --extra dev

# - ignores errors
clean:
	-rm -rf build/
```

**Output discipline:** One line in, one line out. Skip echoes for obvious commands (test, lint, format).

---

## Error Handling

```makefile
# Default: stop on error
.SHELLFLAGS := -ec

# Check command exists before using
require-docker:
	@command -v docker >/dev/null 2>&1 || \
		(echo "Error: Docker not installed" && exit 1)

docker-deploy: require-docker
	docker compose up -d
```

---

## Dependency Chains

```makefile
# Build depends on tests passing
build: test lint
	python -m build

# Deploy depends on build
deploy: build
	docker push myapp:latest

# Pre-commit runs all checks
pre-commit: format lint test
```

---

## Quick Reference

| Concept | Syntax | Use Case |
|---------|--------|----------|
| Immediate | `VAR := value` | Constants |
| Conditional | `VAR ?= value` | Overrideable defaults |
| Recursive | `VAR = value` | Dynamic values |
| Phony | `.PHONY: target` | Commands (not files) |
| Silent | `@command` | Cleaner output |
| Ignore error | `-command` | Safe failures |

---

## Common Pitfalls

1. **Forgetting `.PHONY`** - `make test` fails if a `test` file exists
2. **Tab indentation required** - Recipe lines need actual tabs, not spaces
3. **Variable timing** - `=` evaluates late, `:=` evaluates early
4. **Not exporting** - Subprocesses won't see Make variables unless exported
5. **Echo spam** - Avoid play-by-play narration
