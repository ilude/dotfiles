---
reviewer: product-manager
status: changes_requested
---

## Findings

### 1. Tool-building may be oversized for the observed problem

- severity: high
- evidence: The plan jumps from “about 100 mutating Python-in-bash snippets” to two new Pi custom tools, helper modules, registration, tests, docs, research note, and repo-wide validation. It rejects a prompt-only policy but does not evaluate a lightweight wrapper around existing `edit`/`write` usage guidance plus lint/session detection.
- required_fix: Add a smaller Phase 0: detect/report Python heredoc writes and update agent guidance. Require evidence that friction remains before implementing new mutation tools.

### 2. Manual process is not converted into enforceable automation

- severity: high
- evidence: Success depends on agents choosing `text_edit`/`structured_edit` instead of heredocs, but the plan only adds “guidance.” There is no preflight, hook, lint rule, or session-log detector that blocks or flags the undesired behavior.
- required_fix: Add an automated guardrail: scan shell tool calls/session logs for mutating `python - <<` patterns and fail or warn with a recommended tool alternative.

### 3. Safety scope is vague and risks false confidence

- severity: medium
- evidence: Constraints say tools must avoid secrets, `.env`, ignored paths, and broad globs “unless explicitly safe,” while tasks only require `.env` and directory rejection. Tracked/ignored checks are “where practical,” leaving core safety behavior optional.
- required_fix: Define exact v1 safety rules: allowed roots, ignored-file behavior, symlink handling, glob limits, binary-file detection, and whether untracked files are editable. Add acceptance tests for each chosen rule.

### 4. `structured_edit` selector semantics are underspecified

- severity: medium
- evidence: The plan requires JSON `set`/`delete` with “selector/path syntax” but does not choose JSON Pointer, dot-path, array handling, escaping, create-missing behavior, or delete-missing behavior. This invites incompatible implementation choices and hidden complexity.
- required_fix: Pick one minimal path syntax for v1, preferably JSON Pointer, and specify missing-path, array-index, escaping, and error behavior before implementation.

### 5. Validation is heavier than necessary for early design uncertainty

- severity: low
- evidence: Every iteration requires `pnpm install --frozen-lockfile`, Vitest, typecheck, and `make check`, while the plan still has unresolved product questions. This encourages expensive implementation before proving the smaller guardrail option.
- required_fix: Split the plan into decision gates: first ship detection/guidance with targeted tests, measure usage reduction, then require full Pi tool validation only if custom tools are still justified.
