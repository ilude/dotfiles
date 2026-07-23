---
name: docker
description: Docker containers, Compose, and containerization patterns. Activate when working with Dockerfile, docker-compose.yml, docker-compose, .dockerignore, .devcontainer, devcontainer.json, or discussing Docker, containers, images, container orchestration, or podman.
---

# Container-Based Projects

Compact index for Docker, Compose, and DevContainer work. Load linked files for full templates and examples.

## Project-specific rules

- Avoid container complexity theater: do not add Compose, sidecars, custom networks, or orchestration unless the project need is real.
- Use Docker Compose V2 syntax: `docker compose`, not `docker-compose`.
- Onramp/Caddy convention: a service `port` field means the container/service port reachable on the Compose network; do not reinterpret it as host publishing or split host/internal ports unless requested. Preserve explicit exposure decisions such as no host binding, Caddy-only ingress, or intentionally published ports.
- Keep entrypoints idempotent and signal-safe; prefer exec form for final process.
- Do not bake secrets into images or Compose files.
- Pin base images and copied tool images by version; use digests for production or CI-sensitive images.
- Do not install tools from remote shell pipes inside Dockerfiles; use package-manager repositories or verified checksums.

## Practical steps

1. Identify the runtime contract: image build, local dev, CI, or deployment.
2. Minimize build context with `.dockerignore` and avoid copying secrets/caches.
3. Keep Dockerfiles deterministic and cache-friendly; use multi-stage only when it reduces real risk/size.
4. Validate image build and the service path touched by the change.

## Quick validation

| Purpose | Commands |
|---|---|
| Compose config check | `docker compose config` |
| Build image | `docker build -t <name> .` |
| Build Compose services | `docker compose build` |
| Start/health smoke | `docker compose up --build` |
| Cleanup local stack | `docker compose down` |

## Anti-patterns

- Publishing host ports by default when network-only service access is intended.
- Adding root containers, privileged mode, or Docker socket mounts without explicit need.
- Using `latest` tags in reproducible workflows.
- Treating health checks, resource limits, or log rotation as generic copy-paste instead of project contracts.

## Optional references

- [reference.md](reference.md) - detailed guidance, examples, and templates.
- [devcontainer.md](devcontainer.md) - DevContainer-specific guidance.
