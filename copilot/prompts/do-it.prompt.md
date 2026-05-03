---
mode: "agent"
description: "Smart router that triages tasks by complexity"
---

Use the shared do-it workflow instructions:

[do-it-instructions](../../claude/shared/do-it-instructions.md)

Completion rule: `/do-it` is complete only when the project's full repo-wide validation suite passes: tests, linting, formatting checks, and any project-defined aggregate check command. In this repository the aggregate command is `make check`; other projects may use commands such as `make test`, `just check`, or separate lint/format/test commands. If any required validation command fails for any reason, including failures outside the task's changed files, the work is not complete and must not be archived or reported as complete.
