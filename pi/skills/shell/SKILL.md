---
name: shell
description: "Shell and PowerShell script implementation. Use for .sh, .bash, .zsh, .ps1, Makefile shell fragments, CLI scripts, quoting, exit codes, traps, and cross-platform shell behavior. Not for workflow command UX or Justfile routing."
---

# Shell Script Workflow

**Auto-activate when:** editing shell/PowerShell scripts, CLI entrypoints, Makefile shell fragments, quoting, exit handling, traps, or cross-platform shell behavior.

## Boundary

Use `shell` for script implementation details. Use `workflow-design` for public command UX and `justfile` for Just recipes.

## Core Principle

Shell scripts should be explicit about interpreter, inputs, failure behavior, and platform assumptions.

## Supply-chain guardrails

- Do not add `curl | sh`, `wget | bash`, `irm | iex`, or other remote script execution without an explicit user request.
- Pin downloaded tool versions and verify checksums/signatures when automation downloads executables.
- Keep installer scripts fail-closed: if verification metadata is missing, stop with a clear error.
- Treat editor tasks, AI-agent hooks, CI workflows, and setup scripts as executable attack surface; flag auto-run-on-open behavior and hidden Node/Python/Bun/PowerShell launchers.

## Practical Steps

1. Match the existing interpreter and style.
2. Quote variables unless intentional word-splitting is required.
3. Validate required commands, files, and arguments early.
4. Prefer functions for repeated logic.
5. Use temporary files safely and clean them up.
6. Return meaningful exit codes and messages.
7. Run focused lint/format checks used by the repo when they validate the changed script contract.

## Bash Defaults

```bash
#!/usr/bin/env bash
set -euo pipefail
```

Use arrays for argument lists. Use `[[ ... ]]` in Bash-specific scripts; use POSIX `[` only for POSIX sh.

## PowerShell Defaults

Use approved cmdlet names in scripts, `$env:NAME` for environment variables, and explicit error handling consistent with the existing file.

For administrative mutation scripts, support `ShouldProcess`/`-WhatIf` through `[CmdletBinding(SupportsShouldProcess)]` and `ShouldProcess` guards around each mutation. When the user asks for preview mode, default to `-WhatIf` or an equivalent read-only dry run.

Do not run newly written or generated PowerShell scripts unless the user explicitly asks to execute them. For legacy or on-prem Windows environments, target Windows PowerShell 5.1 compatibility unless the repo documents PowerShell 7+ as the runtime.

For PowerShell readability, avoid dense or minified style:

- Do not compress functions, loops, `if`/`else`, `try`/`catch`, or object construction onto one long line.
- Prefer readable multiline hashtables and `[pscustomobject]` literals when there is more than one or two properties.
- Keep comments/help concise and operator-focused: what the script does, what is read-only, what can mutate state, and what outputs are written.
- Avoid filler wording such as "comprehensive", "robust", "seamless", or legacy/process commentary that does not help an operator run or review the script.
- Use small helper functions for repeated path, output, auth, and comparison logic instead of copy-pasted dense blocks.
- Before finishing, scan for very long lines and reflow any dense implementation line that would be hard to review in a diff.

## Anti-Patterns

- Unquoted variables in paths or user input.
- Parsing `ls` output.
- Silent fallback when a required dependency is missing.
- Mixing POSIX and Bash features accidentally.
- Changing platform behavior without validation.
- Running generated mutation scripts without explicit instruction.
- PowerShell admin scripts that mutate state without `ShouldProcess`/`-WhatIf` support.
- PowerShell slop: minified one-line functions/control flow, giant one-line apply blocks, vague boilerplate comments, or decorative comments that do not explain behavior.

## Quick Reference

Make interpreter choice, input contract, and failure mode obvious.
