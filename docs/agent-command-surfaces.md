# Agent Command Surfaces

This repository supports multiple coding-agent clients. Keep shared behavior aligned, but edit the command source that each client actually loads.

## `/do-it` locations

- **Pi**: `pi/skills/workflow/do-it.md`
  - Pi loads workflow skills from `pi/skills/workflow/`.
  - Changes to Pi `/do-it` behavior must be made here.
- **Claude Code**: `claude/commands/do-it.md` includes `claude/shared/do-it-instructions.md`.
  - The command wrapper is intentionally thin; shared behavior lives in `claude/shared/do-it-instructions.md`.
- **OpenCode**: `opencode/commands/do-it.md` includes `claude/shared/do-it-instructions.md`.
  - OpenCode shares the Claude command instructions unless an overlay overrides them.
- **Copilot**: `copilot/prompts/do-it.prompt.md` references `claude/shared/do-it-instructions.md`.
  - Keep this reference intact unless Copilot needs a client-specific override.

## `/do-it` completion rule

`/do-it` completion requires the project's full repo-wide validation suite to pass: tests, linting, formatting checks, and any project-defined aggregate check command. If any required validation command fails for any reason, including failures outside the files changed by the task, the task is not complete and the plan must not be archived.

Use the strongest project-defined aggregate command when available. In this repository that is `make check`; other projects may use commands such as `make test`, `just check`, `pnpm test`, `cargo test`, `go test ./...`, or separate lint/format/test commands.

Targeted tests and changed-file lint checks are useful during implementation, but they do not replace the final repo-wide validation gate.
