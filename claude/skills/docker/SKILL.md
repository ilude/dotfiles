---
name: docker
description: Docker containers, Compose, and containerization patterns. Activate when working with Dockerfile, docker-compose.yml, or discussing Docker.
---

# Container-Based Projects

Guidelines for containerized projects using Docker, Dockerfile, docker-compose, containers, and DevContainers. Covers multi-stage builds, security, signal handling, entrypoint scripts, and deployment workflows.

## Out of Scope
- Infrastructure orchestration - see ansible skill
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

## DevContainer Configuration

For VS Code DevContainers with Docker, non-root users, and Python/uv patterns, see [devcontainer.md](devcontainer.md).
