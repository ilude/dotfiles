# Python packaging / CLI / async provider contract review

## Finding 1 — High: package location and import path are ambiguous and likely non-installable

**Evidence:** T1 creates files under `pi/x_research/...` and verifies `from pi.x_research.protocol import XClient`. The repo root `pyproject.toml` is named `dotfiles-tests`, has no package configuration, and current `pi/` has no `__init__.py`, so `pi` is currently just a directory used for mixed runtime assets, TypeScript extensions, tests, sessions, and other non-package content.

**Required fix:** Decide and specify one packaging model before implementation:
- Preferred: create an installable `src/x_research/` package and import `x_research.protocol`.
- Or, if it must live under `pi/`, add explicit packaging config and `__init__.py` files proving `pi.x_research` is intentionally importable without accidentally packaging unrelated `pi/` runtime directories.
Update all acceptance commands and test paths accordingly.

## Finding 2 — High: CLI commands are specified but no console entry point or testable invocation contract exists

**Evidence:** T6/T7 define commands such as `x-research sync following <handle>` and file `pi/x_research/cli.py`, but the plan never adds `[project.scripts]`, a `python -m ...` path, or a CLI framework dependency. Acceptance criteria only run pytest; they do not verify that `x-research` resolves under `uv run` on Windows/Git Bash/PowerShell.

**Required fix:** Add an explicit entrypoint contract, e.g. `[project.scripts] x-research = "x_research.cli:main"`, and require verification with `uv run x-research --help` plus at least one `uv run x-research ...` smoke test. Structure `main(argv: Sequence[str] | None = None) -> int` so tests can call it without subprocess-only coupling.

## Finding 3 — High: dependency declarations are missing for Pydantic, HTTP async client, CLI, and async test tooling

**Evidence:** The root `pyproject.toml` dependencies currently include only `pytest`, `pyyaml`, `ruff`, and tree-sitter packages. The plan requires Pydantic models, an async provider backend with retry/backoff, CLI commands, and async tests, but no task updates dependency declarations or lock/sync expectations.

**Required fix:** Add a task/acceptance criterion to declare runtime dependencies (`pydantic`, async HTTP client such as `httpx`, CLI framework if used) and dev dependencies (`pytest-asyncio` or equivalent, type checker if required). Verification should include `uv sync` and running tests from a clean environment, not relying on globally installed packages.

## Finding 4 — Medium: async protocol typing is underspecified and may pass tests while failing real substitution

**Evidence:** The protocol returns `Page[XUser]` / `Page[XTweet]`, but the plan does not define `Page` generic typing, cursor fields, partial-result semantics, provider capability differences, or whether runtime protocol checking is required. T1 says stub backends “satisfy the protocol shape,” which Python will not verify at runtime unless tests use static typing or `@runtime_checkable` with limited guarantees.

**Required fix:** Specify `Page[T]` as a typed generic Pydantic model or dataclass with stable fields (`items`, `next_cursor`, `complete`, `source`, optional `warnings/errors`). Add a static type-check acceptance criterion for backend conformance or assignment-based tests using `XClient`-typed variables, and document which protocol methods may raise typed capability/auth/quota errors.

## Finding 5 — Medium: Windows path and SQLite behavior is not pinned enough for reliable local CLI tests

**Evidence:** The objective hardcodes `private/x/x-data.sqlite`, while the platform constraint requires Windows 11 plus Git Bash and PowerShell. The plan does not state how paths are resolved, whether directories are auto-created, whether UTF-8 encoding is used for JSON config/raw exports, or how SQLite connections handle Windows file locking during tests.

**Required fix:** Require `pathlib.Path`-based path resolution, explicit UTF-8 file I/O, automatic creation of `private/x/`, and a CLI/config option for `--db-path` so tests use temp directories instead of real `private/`. Add a Windows-compatible acceptance test that initializes and queries a temp SQLite DB via the CLI entrypoint.
