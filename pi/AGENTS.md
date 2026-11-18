# Pi instructions

- `pi` is the sole public cross-platform launcher. Bare `pi` selects `profiles/default/`; internal helpers are `../scripts/pi-profile-launch` and `../scripts/pi-profile-launch.ps1`. `~/.pi/agent` points at default, not legacy.
- Pi TypeScript is pnpm-only, never Bun. Each profile's `package.json` owns its dependencies and checks. Pass Vitest file filters directly after `pnpm test`, without `--`.
- Before installation, upgrades, launcher/profile changes, authentication repair or runtime diagnosis, read [setup](profiles/default/docs/setup.md).
- `profiles/legacy/` preserves the previous customized setup and local runtime state. Leave it untouched unless explicitly asked for a specific operation: no inspection, edits, tests, dependency installation, launches or staging/commits as part of unrelated work. This includes indirect access through links that resolve there. A mention or Git status entry is not authorization; preserve incidental runtime metadata changes.
- Keep default-profile implementation and references under `profiles/default/`; do not recreate a shared `pi/docs/` tree. The orchestrator is the primary model the user interacts with, not a worker role.
