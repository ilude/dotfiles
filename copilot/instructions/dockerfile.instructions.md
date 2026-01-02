---
description: "Dockerfile and containerization best practices for secure, efficient images"
applyTo: "**/Dockerfile*"
---

# Dockerfile Best Practices

## Core Requirements

### Base Images
- Use **Alpine Linux** for minimal attack surface and smaller images
  - Example: `python:3.12-alpine`, `node:20-alpine`
- **Specify version tags** for reproducible builds (never use `latest`)
- Use official images from trusted registries
- Consider distroless images for production

### Multi-stage Builds
- **Separate stages** for different purposes:
  - `base` - Common dependencies and user setup
  - `development` - Development tools and dependencies
  - `production` - Minimal runtime with only production dependencies
- **Copy only necessary artifacts** to final stage
- Reduces final image size and attack surface

---

## Security Best Practices

### Non-root User
```dockerfile
# Create non-root user
ARG PUID=1000
ARG PGID=1000
ARG USER=appuser

RUN addgroup -g ${PGID} ${USER} && \
    adduser -D -u ${PUID} -G ${USER} -s /bin/sh ${USER}

# Switch to non-root user before EXPOSE and CMD
USER ${USER}
```

### Security Checklist
- ✅ Create and use non-root users
- ✅ Set USER directive before EXPOSE and CMD
- ✅ Never include secrets in layers
- ✅ Use `.dockerignore` to exclude sensitive files
- ✅ Scan images for vulnerabilities regularly
- ✅ Keep base images updated

---

## Layer Optimization

### Reduce Layer Count
- **Group RUN commands** to reduce layers
- Use `&&` to chain related commands
- Clean up in the same layer as installation

### Example: Bad vs. Good
```dockerfile
# ❌ BAD: Multiple layers
RUN apk update
RUN apk add curl
RUN apk add git
RUN rm -rf /var/cache/apk/*

# ✅ GOOD: Single optimized layer
RUN apk update && \
    apk add --no-cache \
        curl \
        git && \
    rm -rf /var/cache/apk/*
```

### Cache Optimization
- **Order commands from least to most frequently changing**
- Copy dependency files separately before copying source code
- Use BuildKit cache mounts for package managers

```dockerfile
# ✅ GOOD: Dependency layer cached separately
COPY requirements.txt .
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --no-cache-dir -r requirements.txt

# Source code changes won't invalidate dependency cache
COPY app/ ./app/
```

---

## Package Management Best Practices

### Alpine APK
- Use `apk add --no-cache` to avoid caching package index
- Maintain **alphabetical order** in package lists for maintainability
- Remove cache in the same RUN command if not using `--no-cache`

```dockerfile
RUN apk add --no-cache \
        bash \
        curl \
        git \
        openssh \
        vim
```

### Python UV (Modern Package Manager)
```dockerfile
# Copy uv from official image
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

# Install dependencies with cache mount
COPY requirements.txt .
RUN --mount=type=cache,target=/root/.cache/uv \
    uv pip install --system --no-cache -r requirements.txt
```

### Traditional Python Pip
```dockerfile
COPY requirements.txt .
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --no-cache-dir -r requirements.txt
```

---

## Environment Variables

### Build-time Variables (ARG)
- Use ARG for build-time configuration
- Common ARGs: PUID, PGID, USER, WORKDIR, VERSION

```dockerfile
ARG PYTHON_VERSION=3.12
ARG PUID=1000
ARG PGID=1000
ARG USER=appuser
ARG WORKDIR=/app
```

### Runtime Variables (ENV)
- Use ENV for runtime environment variables
- Provide sensible defaults
- Document required vs. optional variables

```dockerfile
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    APP_ENV=production
```

---

## Health Checks

### Implementation
```dockerfile
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1
```

### Best Practices
- Use lightweight commands (curl, wget, or custom scripts)
- Set appropriate intervals based on app startup time
- Check actual application health, not just container running
- Consider using dedicated health check endpoints

---

## Complete Example Template

```dockerfile
# Base stage with common setup
FROM python:3.12-alpine AS base

# Install uv for fast dependency management
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

# Build arguments
ARG PUID=1000
ARG PGID=1000
ARG USER=appuser
ARG WORKDIR=/app

# Create non-root user
RUN addgroup -g ${PGID} ${USER} && \
    adduser -D -u ${PUID} -G ${USER} -s /bin/sh ${USER}

WORKDIR ${WORKDIR}

# Development stage
FROM base AS development

# Install development tools
RUN apk add --no-cache \
        bash \
        curl \
        git \
        vim

# Install development dependencies
COPY requirements.txt requirements-dev.txt ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv pip install --system --no-cache -r requirements-dev.txt

# Copy source code
COPY --chown=${USER}:${USER} . .

USER ${USER}

CMD ["python", "run.py"]

# Production stage
FROM base AS production

# Install runtime system dependencies
RUN apk add --no-cache \
        bash \
        curl

# Install production dependencies only
COPY requirements.txt .
RUN --mount=type=cache,target=/root/.cache/uv \
    uv pip install --system --no-cache -r requirements.txt

# Copy application code
COPY --chown=${USER}:${USER} app/ ./app/
COPY --chown=${USER}:${USER} run.py .

# Switch to non-root user
USER ${USER}

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Expose port
EXPOSE 8000

# Run application
CMD ["python", "run.py"]
```

---

## BuildKit Features

### Cache Mounts
```dockerfile
# Cache pip packages
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install -r requirements.txt

# Cache npm packages
RUN --mount=type=cache,target=/root/.npm \
    npm install
```

### Multi-platform Builds
```dockerfile
# Support ARM and AMD architectures
FROM --platform=$BUILDPLATFORM python:3.12-alpine

ARG TARGETPLATFORM
ARG BUILDPLATFORM

RUN echo "Building for $TARGETPLATFORM on $BUILDPLATFORM"
```

---

## .dockerignore Best Practices

Always include a `.dockerignore` file to exclude unnecessary files:

```
# Git
.git/
.gitignore
.gitattributes

# Documentation
README.md
docs/
*.md

# CI/CD
.github/
.gitlab-ci.yml

# Development
.vscode/
.idea/
.devcontainer/

# Python
__pycache__/
*.pyc
*.pyo
*.pyd
.pytest_cache/
.coverage
htmlcov/
.venv/
venv/

# Environment files
.env
.env.*

# Build artifacts
build/
dist/
*.egg-info/

# Testing
tests/
.spec/
```

See `ignore-files.instructions.md` for detailed guidance.

---

## Common Patterns

### Flask Application
```dockerfile
FROM python:3.12-alpine AS production

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

ARG USER=appuser
RUN adduser -D -s /bin/sh ${USER}

WORKDIR /app

COPY requirements.txt .
RUN --mount=type=cache,target=/root/.cache/uv \
    uv pip install --system --no-cache -r requirements.txt

COPY --chown=${USER}:${USER} app/ ./app/
COPY --chown=${USER}:${USER} run.py .

USER ${USER}

EXPOSE 5000

HEALTHCHECK CMD curl -f http://localhost:5000/health || exit 1

CMD ["python", "run.py"]
```

### Background Worker
```dockerfile
FROM python:3.12-alpine AS production

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

ARG USER=worker
RUN adduser -D -s /bin/sh ${USER}

WORKDIR /app

COPY requirements.txt .
RUN --mount=type=cache,target=/root/.cache/uv \
    uv pip install --system --no-cache -r requirements.txt

COPY --chown=${USER}:${USER} worker/ ./worker/

USER ${USER}

# No EXPOSE needed for background workers
# No HEALTHCHECK - use orchestrator health checks

CMD ["python", "-m", "worker.main"]
```
