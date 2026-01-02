---
description: "DevContainer configuration best practices for consistent development environments"
applyTo: "**/.devcontainer/**"
---

# DevContainer Development Standards

## Overview

DevContainers provide consistent, reproducible development environments using Docker containers. This ensures all developers work in identical environments regardless of their host OS.

---

## Container Configuration

### Multi-stage Dockerfile
```dockerfile
# Use dedicated development stage in Dockerfile
FROM python:3.12-alpine AS development

# Install development tools
RUN apk add --no-cache \
        bash \
        curl \
        git \
        make \
        vim \
        zsh

# Install Python development dependencies
COPY requirements.txt requirements-dev.txt ./
RUN pip install --no-cache-dir -r requirements-dev.txt

USER vscode
```

### devcontainer.json Structure
```json
{
  "name": "Project Development",
  "dockerFile": "../Dockerfile",
  "target": "development",
  "runArgs": [
    "--env-file", "${localWorkspaceFolder}/.env",
    "--env-file", "${localWorkspaceFolder}/.devcontainer/.env"
  ],
  "mounts": [
    "source=devcontainer-home,target=/home/vscode,type=volume"
  ],
  "postCreateCommand": "make initialize"
}
```

---

## Security: Non-root User

### User Configuration
- Use **non-root user** for development (`vscode` is standard)
- Set correct permissions for mounted volumes
- Configure sudo access if needed for specific tasks

```dockerfile
# Create vscode user for devcontainer
ARG USERNAME=vscode
ARG USER_UID=1000
ARG USER_GID=$USER_UID

RUN groupadd --gid $USER_GID $USERNAME && \
    useradd --uid $USER_UID --gid $USER_GID -m $USERNAME -s /bin/zsh && \
    # Optional: Add sudo support
    apt-get update && apt-get install -y sudo && \
    echo $USERNAME ALL=\(root\) NOPASSWD:ALL > /etc/sudoers.d/$USERNAME && \
    chmod 0440 /etc/sudoers.d/$USERNAME

USER $USERNAME
```

---

## Environment Management

### Multiple .env Files
- **Root `.env`** - Shared configuration for all environments
- **`.devcontainer/.env`** - Development-specific overrides
- Load both via `runArgs` in devcontainer.json

### Example Structure
```
project/
├── .env                    # Shared config (gitignored)
├── .env.example           # Template with safe defaults (committed)
├── .devcontainer/
│   ├── .env              # Dev-specific config (gitignored)
│   ├── .env.example      # Dev template (committed)
│   └── devcontainer.json
```

### .devcontainer/.env Example
```bash
# Development-specific settings
DEBUG=true
LOG_LEVEL=debug
FLASK_ENV=development
HOT_RELOAD=true
```

---

## Docker-in-Docker Support

### When to Use
- Building Docker images within devcontainer
- Running integration tests with containers
- Testing Docker Compose configurations

### Configuration
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

### Security Note
Mounting Docker socket gives container full Docker access. Use only in trusted development environments.

---

## Development Tools

### Shell: Zsh Configuration
```dockerfile
# Install zsh with plugins
RUN apk add --no-cache zsh zsh-autosuggestions zsh-syntax-highlighting

# Configure zsh for vscode user
USER vscode
RUN echo "source /usr/share/zsh/plugins/zsh-autosuggestions/zsh-autosuggestions.zsh" >> ~/.zshrc && \
    echo "source /usr/share/zsh/plugins/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh" >> ~/.zshrc
```

### VS Code Extensions
```json
{
  "customizations": {
    "vscode": {
      "extensions": [
        "ms-python.python",
        "ms-python.vscode-pylance",
        "ms-python.black-formatter",
        "charliermarsh.ruff",
        "ms-azuretools.vscode-docker",
        "eamodio.gitlens"
      ],
      "settings": {
        "python.defaultInterpreterPath": "/usr/local/bin/python",
        "python.linting.enabled": true,
        "python.linting.pylintEnabled": false,
        "python.linting.flake8Enabled": true,
        "python.formatting.provider": "black",
        "editor.formatOnSave": true,
        "files.trimTrailingWhitespace": true
      }
    }
  }
}
```

---

## Volume Mounts

### Home Directory Persistence
```json
{
  "mounts": [
    "source=devcontainer-home,target=/home/vscode,type=volume"
  ]
}
```

Preserves:
- Shell history
- Git configuration
- VS Code server data
- Tool configurations

### SSH Key Access
```json
{
  "mounts": [
    "source=${localEnv:HOME}/.ssh,target=/home/vscode/.ssh,readonly,type=bind"
  ]
}
```

Enables:
- Git operations with SSH
- Access to private repositories
- Deployment to remote servers

---

## Post-Create Commands

### Initialization Script
```json
{
  "postCreateCommand": "make initialize"
}
```

### Makefile Target Example
```makefile
.PHONY: initialize
initialize:
	@echo "Initializing development environment..."
	@# Install dependencies
	uv sync --extra dev
	@# Set up pre-commit hooks (if using)
	pre-commit install || true
	@# Create necessary directories
	mkdir -p logs tmp
	@# Copy environment template if not exists
	test -f .env || cp .env.example .env
	@echo "Development environment ready!"
```

---

## Testing Support

### Integration Testing
```json
{
  "features": {
    "ghcr.io/devcontainers/features/docker-in-docker:2": {}
  },
  "postCreateCommand": "make setup-test-env"
}
```

### Makefile Test Targets
```makefile
.PHONY: test test-unit test-integration

test: test-unit test-integration

test-unit:
	uv run pytest tests/unit/ -v

test-integration:
	# Start test dependencies
	docker compose -f docker-compose.test.yml up -d
	# Run integration tests
	uv run pytest tests/integration/ -v
	# Cleanup
	docker compose -f docker-compose.test.yml down
```

---

## Complete devcontainer.json Example

```json
{
  "name": "Python Development Container",
  "dockerFile": "../Dockerfile",
  "target": "development",

  "runArgs": [
    "--env-file", "${localWorkspaceFolder}/.env",
    "--env-file", "${localWorkspaceFolder}/.devcontainer/.env"
  ],

  "features": {
    "ghcr.io/devcontainers/features/docker-in-docker:2": {
      "version": "latest",
      "moby": true
    }
  },

  "mounts": [
    "source=devcontainer-home,target=/home/vscode,type=volume",
    "source=${localEnv:HOME}/.ssh,target=/home/vscode/.ssh,readonly,type=bind"
  ],

  "customizations": {
    "vscode": {
      "extensions": [
        "ms-python.python",
        "ms-python.vscode-pylance",
        "ms-python.black-formatter",
        "charliermarsh.ruff",
        "ms-azuretools.vscode-docker"
      ],
      "settings": {
        "python.defaultInterpreterPath": "/usr/local/bin/python",
        "python.linting.enabled": true,
        "python.formatting.provider": "black",
        "editor.formatOnSave": true,
        "terminal.integrated.defaultProfile.linux": "zsh"
      }
    }
  },

  "postCreateCommand": "make initialize",

  "remoteUser": "vscode"
}
```

---

## Common Patterns

### Python Project with UV
```dockerfile
FROM python:3.12-alpine AS development

# Install development tools
RUN apk add --no-cache \
        bash \
        curl \
        git \
        make \
        zsh \
        zsh-autosuggestions \
        zsh-syntax-highlighting

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

# Create vscode user
RUN adduser -D -s /bin/zsh vscode

USER vscode
WORKDIR /workspace

# Configure zsh
RUN echo "source /usr/share/zsh/plugins/zsh-autosuggestions/zsh-autosuggestions.zsh" >> ~/.zshrc && \
    echo "source /usr/share/zsh/plugins/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh" >> ~/.zshrc
```

### Node.js Project
```dockerfile
FROM node:20-alpine AS development

RUN apk add --no-cache \
        bash \
        git \
        zsh \
        zsh-autosuggestions \
        zsh-syntax-highlighting

RUN adduser -D -s /bin/zsh vscode

USER vscode
WORKDIR /workspace
```

---

## Troubleshooting

### Common Issues

**Issue: Permission denied errors**
```bash
# Check container user
whoami

# Check file permissions
ls -la

# Fix ownership if needed (in Dockerfile)
RUN chown -R vscode:vscode /workspace
```

**Issue: Extensions not installing**
```json
{
  "customizations": {
    "vscode": {
      "extensions": [
        // Use full extension IDs
        "ms-python.python@2023.18.0"
      ]
    }
  }
}
```

**Issue: Environment variables not loading**
```bash
# Check env files exist
ls -la .env .devcontainer/.env

# Verify in container
printenv | grep YOUR_VAR

# Rebuild container if changed
```

---

## Makefile Integration

### Common Development Tasks
```makefile
.PHONY: initialize clean test check run

initialize:
	uv sync --extra dev
	mkdir -p logs tmp
	test -f .env || cp .env.example .env

clean:
	find . -type d -name __pycache__ -exec rm -rf {} +
	find . -type f -name "*.pyc" -delete
	rm -rf .pytest_cache htmlcov .coverage

test:
	uv run pytest tests/ -v

check:
	uv run pytest tests/ -v
	uv run ruff check .
	uv run mypy src/

run:
	uv run python run.py
```
