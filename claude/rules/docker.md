---
paths:
  - "Dockerfile"
  - "Dockerfile.*"
  - "**/Dockerfile"
  - "**/Dockerfile.*"
  - "docker-compose*.yml"
  - "docker-compose*.yaml"
  - ".dockerignore"
  - ".devcontainer/**/*"
  - "devcontainer.json"
---

# Container-Based Projects

Guidelines for containerized projects using Docker, Dockerfile, docker-compose, containers, and DevContainers. Covers multi-stage builds, security, signal handling, entrypoint scripts, and deployment workflows.

## Out of Scope
- Infrastructure orchestration - see @~/.claude/skills/ansible-workflow/SKILL.md
- Kubernetes patterns - separate skill

---

## CRITICAL: Avoid Container Complexity Theater

**Containers are tools, not requirements. Use them when they solve real problems.**

Before adding container complexity, ask:
1. **Does this solve a real problem?** ("We need consistent environments" vs "Best practices say...")
2. **Is the simpler approach sufficient?**
3. **What's the operational cost?**

### Anti-Patterns to Avoid

| Anti-Pattern | Problem |
|--------------|---------|
| mTLS theater | In single-tenant app where TLS terminates at edge |
| Sidecar proliferation | When log shipping from host works fine |
| Service mesh overhead | For 3 services talking to each other |

---

## CRITICAL: Docker Compose V2 Syntax

**MUST NOT use `version:` field** (deprecated) **or `docker-compose` with hyphen:**

```yaml
# MUST NOT
version: '3.8'

# MUST
services:
  app:
    image: myapp
```

```bash
docker compose up    # MUST
docker-compose up    # MUST NOT
```

## CRITICAL: DNS Configuration

```yaml
# MUST use .internal for container DNS
environment:
  - DNS_DOMAIN=.internal

# MUST NOT use .local (conflicts with mDNS/Bonjour)
```

---

## Dockerfile Core Requirements

### Base Images
- Use **Alpine Linux** for minimal attack surface (`python:3.12-alpine`, `node:20-alpine`)
- **MUST specify version tags** (MUST NOT use `latest`)
- **SHOULD use image digest pinning (SHA256)** for production
- If Alpine packages unavailable, use Debian Slim

```dockerfile
# RECOMMENDED: Pin by digest for production
FROM python:3.12-alpine@sha256:abc123...
```

### Multi-stage Builds
- `base` - Common dependencies and user setup
- `development` - Development tools
- `production` - Minimal runtime only

### Security Checklist
- MUST create and use non-root users
- MUST set USER directive before EXPOSE and CMD
- MUST NOT include secrets in layers
- MUST use `.dockerignore` to exclude sensitive files
- MUST include health checks for orchestration
- MUST use Docker secrets for sensitive data (NOT environment variables)
- MUST set `no-new-privileges:true` security option

```yaml
services:
  app:
    security_opt:
      - no-new-privileges:true
```

---

## .dockerignore Best Practices

**MUST maintain `.dockerignore`** to reduce build context and prevent sensitive file inclusion.

### Template

```dockerignore
# Git
.git/
.gitattributes
.gitignore

# Documentation
*.md
docs/

# CI/CD
.github/
.gitlab-ci.yml

# Development
.devcontainer/
.idea/
.vscode/

# Testing
.coverage
.pytest_cache/
.spec/
htmlcov/
tests/

# Python
__pycache__/
*.egg-info/
*.pyc
*.pyo
.mypy_cache/
.ruff_cache/

# Virtual environments
.venv/
venv/

# Build artifacts
build/
dist/

# Environment files
.env
.env.*

# Logs
*.log
logs/

# OS
.DS_Store
Thumbs.db

# Temporary
temp/
tmp/
*.tmp

# Docker files (not needed in image)
docker-compose*.yml
Dockerfile*
.dockerignore

# Node (if applicable)
node_modules/
```

### Key Principles
1. **Alphabetical ordering** within sections
2. **Include Git metadata** - `.git/` not needed in images
3. **Exclude tests** - Tests run before build, not in container
4. **Exclude dev tools** - IDE configs, devcontainer
5. **Keep dependency files** - `requirements.txt`, `package.json` needed for install

---

## Layer Optimization

```dockerfile
# MUST NOT: Multiple layers
RUN apk update
RUN apk add curl
RUN apk add git

# MUST: Single optimized layer
RUN apk add --no-cache \
        curl \
        git
```

### Cache Optimization

```dockerfile
# Dependency layer cached separately
COPY requirements.txt .
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --no-cache-dir -r requirements.txt

# Source code changes won't invalidate dependency cache
COPY app/ ./app/
```

---

## Non-Root User Setup

```dockerfile
ARG PUID=1000
ARG PGID=1000
ARG USER=appuser

RUN addgroup -g ${PGID} ${USER} && \
    adduser -D -u ${PUID} -G ${USER} -s /bin/sh ${USER}

USER ${USER}
```

---

## 12-Factor App Compliance

| Factor | Implementation |
|--------|---------------|
| Configuration | Environment variables only |
| Dependencies | Explicit declarations with lockfiles |
| Stateless | No local state, horizontally scalable |
| Disposability | Fast startup/shutdown, graceful termination |

---

## Resource Limits & Log Rotation

**MUST define for production:**

```yaml
services:
  app:
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 512M
          pids: 100
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
```

---

## Health Checks

```dockerfile
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD curl -f http://localhost:8000/health || exit 1
```

```yaml
services:
  app:
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
```

---

## Docker Compose Organization

```yaml
# docker-compose.yml
include:
  - compose/service1.yml
  - compose/service2.yml

services:
  app:
    build:
      context: .
      target: production
    depends_on:
      db:
        condition: service_healthy
    networks:
      - app_network
    security_opt:
      - no-new-privileges:true

  db:
    image: postgres:15-alpine
    volumes:
      - db_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD", "pg_isready", "-U", "postgres"]

volumes:
  db_data:

networks:
  app_network:
    driver: bridge
```

---

## Docker Secrets

**MUST use over environment variables** for sensitive data:

```yaml
services:
  app:
    secrets:
      - db_password
    environment:
      - DB_PASSWORD_FILE=/run/secrets/db_password

secrets:
  db_password:
    file: ./secrets/db_password.txt
```

---

## Signal Handling and Entrypoint

### Production Entrypoint Script

```bash
#!/bin/bash
set -euo pipefail

if [ "$(id -u)" = "0" ]; then
    groupmod -o -g ${PGID:-1000} ${USER} 2>/dev/null || true
    usermod -o -u ${PUID:-1000} ${USER} 2>/dev/null || true
    chown ${USER}:${USER} /var/run/docker.sock 2>/dev/null || true
    exec gosu ${USER} "$@"
fi

exec "$@"
```

- Use `gosu` with `exec` to drop privileges and forward signals
- Use direct command execution (not shell wrapping) for proper signal delivery

---

## Makefile Integration

```makefile
.PHONY: dev build up down logs

dev:
	@docker compose -f docker-compose.yml -f compose/dev.yml up

build:
	@docker compose build

up:
	@docker compose up -d

down:
	@docker compose down

logs:
	@docker compose logs -f
```

---

## Essential Commands

```bash
# Service management
docker compose up / up -d / down / down -v
docker compose build / build --no-cache

# Monitoring
docker compose ps / logs -f
docker stats

# Execute commands
docker compose exec app sh
docker compose run --rm app pytest

# Cleanup
docker image prune -a
docker system prune
```

---

## Quick Reference

**Before running containers:**
- Check README and Makefile
- Review docker-compose.yml dependencies
- Check for .env.example

**Common mistakes:**
- Using `version:` field or `docker-compose` with hyphen
- Running as root user
- Using large base images (not Alpine)
- Using `.local` domain
- Skipping health checks
- Using env vars instead of secrets
- Missing resource limits
- No log rotation

---

# DevContainer Configuration

Guidelines for VS Code DevContainers with Docker, non-root users, and Python/uv patterns.

---

## When DevContainers Are Worth It

- Multi-developer teams with environment drift
- Complex native dependencies (CUDA, system libraries)
- Projects requiring specific OS configurations
- Frequent onboarding of new developers

**Avoid for:** Solo projects, simple stacks where `uv`/`nvm` suffice, or when maintenance cost exceeds benefit.

---

## DevContainer Directory Structure

```
project/
├── .devcontainer/
│   ├── devcontainer.json       # Runtime configuration
│   ├── Dockerfile              # Multi-stage development build
│   ├── .env.example            # Dev-specific config template
│   └── .env                    # Dev-specific config (gitignored)
├── .env.example                # Shared config template
├── .env                        # Shared config (gitignored)
├── Makefile                    # Task automation
└── pyproject.toml              # Python project config
```

---

## Multi-Stage Dockerfile Pattern (DevContainer)

```dockerfile
# Base stage with common dependencies
FROM python:3.12-slim AS base

RUN apt-get update && apt-get install -y --no-install-recommends \
    bash curl git make zsh ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Development stage with full tooling
FROM base AS development

ARG USERNAME=vscode
ARG USER_UID=1000
ARG USER_GID=$USER_UID

# Create non-root user with sudo
RUN groupadd --gid $USER_GID $USERNAME && \
    useradd --uid $USER_UID --gid $USER_GID -m $USERNAME -s /bin/zsh && \
    apt-get update && apt-get install -y --no-install-recommends sudo vim && \
    rm -rf /var/lib/apt/lists/* && \
    echo $USERNAME ALL=\(root\) NOPASSWD:ALL > /etc/sudoers.d/$USERNAME && \
    chmod 0440 /etc/sudoers.d/$USERNAME

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

WORKDIR /workspace
USER $USERNAME

# Production stage (minimal)
FROM base AS production
RUN useradd --create-home --shell /bin/bash appuser
WORKDIR /app
USER appuser
```

---

## DevContainer Non-Root User Setup

Always use a non-root user (standard name: `vscode`):

```dockerfile
ARG USERNAME=vscode
ARG USER_UID=1000
ARG USER_GID=$USER_UID

RUN groupadd --gid $USER_GID $USERNAME && \
    useradd --uid $USER_UID --gid $USER_GID -m $USERNAME -s /bin/zsh && \
    echo $USERNAME ALL=\(root\) NOPASSWD:ALL > /etc/sudoers.d/$USERNAME

USER $USERNAME
```

In `devcontainer.json`:
```json
{ "remoteUser": "vscode" }
```

---

## DevContainer Environment Management

Use multiple `.env` files for different scopes:

1. **Project root `.env`** - Shared across environments (gitignored)
2. **`.devcontainer/.env`** - Development overrides (gitignored)
3. **`.env.example`** - Templates (committed)

```json
{
  "runArgs": [
    "--env-file", "${localWorkspaceFolder}/.env",
    "--env-file", "${localWorkspaceFolder}/.devcontainer/.env"
  ]
}
```

Order matters: later files override earlier ones.

---

## Docker-in-Docker Support

For building images within the devcontainer:

```json
{
  "features": {
    "ghcr.io/devcontainers/features/docker-in-docker:2": {
      "version": "latest",
      "moby": true
    }
  },
  "mounts": [
    "source=/var/run/docker.sock,target=/var/run/docker.sock,type=bind"
  ]
}
```

Add user to docker group:
```dockerfile
RUN groupadd docker || true && usermod -aG docker vscode
```

**Security:** Only use in trusted environments - Docker socket grants full daemon access.

---

## Volume Mounts

### Home Directory Persistence

```json
{
  "mounts": [
    "source=${localWorkspaceFolderBasename}-home,target=/home/vscode,type=volume"
  ]
}
```

### SSH Key Access

```json
{
  "mounts": [
    "source=${localEnv:HOME}/.ssh,target=/home/vscode/.ssh,type=bind,readonly"
  ]
}
```

Windows:
```json
"source=${localEnv:USERPROFILE}\\.ssh,target=/home/vscode/.ssh,type=bind,readonly"
```

---

## VS Code Extensions

```json
{
  "customizations": {
    "vscode": {
      "extensions": [
        "ms-python.python",
        "ms-python.vscode-pylance",
        "charliermarsh.ruff",
        "ms-azuretools.vscode-docker",
        "eamodio.gitlens"
      ],
      "settings": {
        "python.defaultInterpreterPath": "/usr/local/bin/python",
        "[python]": {
          "editor.defaultFormatter": "charliermarsh.ruff",
          "editor.formatOnSave": true
        },
        "terminal.integrated.defaultProfile.linux": "zsh"
      }
    }
  }
}
```

---

## Complete devcontainer.json Example

```json
{
  "name": "Python Development",
  "dockerFile": "Dockerfile",
  "context": "..",
  "build": { "target": "development" },

  "runArgs": [
    "--env-file", "${localWorkspaceFolder}/.env",
    "--env-file", "${localWorkspaceFolder}/.devcontainer/.env"
  ],

  "features": {
    "ghcr.io/devcontainers/features/docker-in-docker:2": {}
  },

  "mounts": [
    "source=${localWorkspaceFolderBasename}-home,target=/home/vscode,type=volume",
    "source=${localEnv:HOME}/.ssh,target=/home/vscode/.ssh,type=bind,readonly"
  ],

  "customizations": {
    "vscode": {
      "extensions": [
        "ms-python.python",
        "ms-python.vscode-pylance",
        "charliermarsh.ruff",
        "ms-azuretools.vscode-docker"
      ],
      "settings": {
        "terminal.integrated.defaultProfile.linux": "zsh"
      }
    }
  },

  "postCreateCommand": "make initialize",
  "remoteUser": "vscode"
}
```

---

## DevContainer Makefile Integration

```makefile
.PHONY: initialize deps env-setup

initialize: deps env-setup
	@echo "Development environment initialized"

deps:
	uv sync --extra dev

env-setup:
	test -f .env || cp .env.example .env
	test -f .devcontainer/.env || cp .devcontainer/.env.example .devcontainer/.env
```

---

## DevContainer Troubleshooting

### Permission Denied

```dockerfile
RUN chown -R vscode:vscode /workspace /home/vscode
```

### Docker Socket Issues

```dockerfile
RUN groupadd docker || true && usermod -aG docker vscode
```

### Volume Mount Issues on Windows

Ensure Docker Desktop WSL2 integration is enabled. Use `${localEnv:USERPROFILE}` for Windows paths.

---

## DevContainer Best Practices Summary

1. Always use non-root user (`vscode`)
2. Use dynamic volume naming with `${localWorkspaceFolderBasename}-home`
3. Prefer uv for Python dependency management
4. Multi-stage builds separate dev and production
5. Keep Dockerfile minimal - offload to Makefile
6. Use `.env` files for configuration
7. Mount `.ssh` as readonly for git operations
8. Enable DinD only when truly needed
