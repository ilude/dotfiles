---
name: python
description: Python, pyproject.toml, uv, pip, pytest, Pydantic, type hints, or Python patterns.
---

# Python Projects Workflow

Compact index for Python work. Load linked files only for framework-specific details or examples.

## Project-specific rules

- This repo uses `uv`, `pytest`, and `ruff`; Python floor is 3.9 from `pyproject.toml`.
- Prefer explicit exceptions when required data/dependencies are missing; do not add silent fallback logic.
- Keep scripts idempotent and LF-only.
- Do not introduce broad try/except wrappers or guard flags unless requested.
- Before resolving new dependencies, apply the uv supply-chain hardening settings from `reference.md`; prefer locked installs and avoid ad-hoc `uv pip install`.
- In Bash commands, use `python`, not `python3`. Run script paths directly; use `python -m` only for modules.

## Practical steps

1. Identify the Python project root and read `pyproject.toml` and relevant tests.
2. Use `uv` for dependency and command execution when the project supports it.

## Quick validation

| Purpose | Commands |
|---|---|
| Dotfiles quick tests | `make test-quick` |
| Python tests | `make test-pytest` or `uv run pytest <path>` |
| Python lint | `make lint-python` or `uv run ruff check <path>` |
| Format check/fix | `uv run ruff format --check <path>` / `uv run ruff format <path>` |
| Full repo check | `make check` |

## Anti-patterns

- Using `pip`/global installs when `uv` is available in the repo workflow.
- Adding comments that restate obvious Python syntax instead of explaining domain intent.
- Broad exception swallowing, hidden defaults, or fallback behavior that masks missing data.
- Changing public behavior without focused regression tests.

## Optional references

- [reference.md](reference.md) - detailed guidance, examples, and templates.
- [testing.md](testing.md) - pytest patterns.
- [fastapi.md](fastapi.md), [flask.md](flask.md), [django.md](django.md) - framework guidance.
