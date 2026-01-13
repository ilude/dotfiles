# DevContainer Configuration

Guidelines for VS Code DevContainers with Docker, non-root users, and Python/uv patterns.

**See also:** Main container workflow in [SKILL.md](./SKILL.md)

---

## When DevContainers Are Worth It

- Multi-developer teams with environment drift
- Complex native dependencies (CUDA, system libraries)
- Projects requiring specific OS configurations
- Frequent onboarding of new developers

**Avoid for:** Solo projects, simple stacks where `uv`/`nvm` suffice, or when maintenance cost exceeds benefit.

---

## Directory Structure

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

## Multi-Stage Dockerfile Pattern

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

## Non-Root User Setup

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

## Environment Management

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

## Makefile Integration

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

## Troubleshooting

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

## Best Practices Summary

1. Always use non-root user (`vscode`)
2. Use dynamic volume naming with `${localWorkspaceFolderBasename}-home`
3. Prefer uv for Python dependency management
4. Multi-stage builds separate dev and production
5. Keep Dockerfile minimal - offload to Makefile
6. Use `.env` files for configuration
7. Mount `.ssh` as readonly for git operations
8. Enable DinD only when truly needed
