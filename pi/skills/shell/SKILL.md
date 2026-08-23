---
name: shell
description: "Bash/POSIX shell: .sh, .bash, .zsh, Makefile fragments, CLI scripts, quoting, exits, traps, or cross-platform shell behavior. Not for PowerShell; use powershell."
---

# Shell Script Workflow

## Boundary

Use `shell` for Bash, POSIX sh, and zsh implementation details. Use `powershell` for PowerShell commands and `.ps1` files, `workflow-design` for public command UX, and `justfile` for Just recipes.

## Core Principle

Shell scripts should be explicit about interpreter, inputs, failure behavior, and platform assumptions.

## Supply-chain guardrails

- Do not add `curl | sh`, `wget | bash`, `irm | iex`, or other remote script execution without an explicit user request.
- Pin downloaded tool versions and verify checksums/signatures when automation downloads executables.
- Keep installer scripts fail-closed: if verification metadata is missing, stop with a clear error.

## Practical Steps

1. Match the existing interpreter and style.
2. Quote variables unless intentional word-splitting is required.
3. Validate required commands, files, and arguments early.
4. Prefer functions for repeated logic.
5. Use temporary files safely. Leave overwriteable scratch in place unless it contains secrets or the repository workflow requires teardown.
6. Return meaningful exit codes and messages.
7. Run focused lint/format checks used by the repo when they validate the changed script contract.

## Bash Defaults

```bash
#!/usr/bin/env bash
set -euo pipefail
```

Use arrays for argument lists. Use `[[ ... ]]` in Bash-specific scripts; use POSIX `[` only for POSIX sh. In Bash on Windows, use `/dev/null` rather than `nul` and use forward slashes in paths.

## Anti-Patterns

- Unquoted variables in paths or user input.
- Parsing `ls` output.
- Silent fallback when a required dependency is missing.
- Mixing POSIX and Bash features accidentally.
- Changing platform behavior without validation.
- Running generated mutation scripts without explicit instruction.
