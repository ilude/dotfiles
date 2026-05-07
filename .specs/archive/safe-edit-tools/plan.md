---
created: 2026-05-06
status: completed
completed: 2026-05-07
---

# Plan: Safe edit tools for Pi

## Context & Motivation

Session-log review found that agents frequently use ad hoc `python - <<'PY'` heredocs to mutate tracked repo files even though Pi exposes safer `edit` and `write` tools. Across recent dotfiles sessions, `edit` and `write` were used often, but about 100 mutating Python-in-bash snippets appeared for JSON mutation, bulk string replacement, regex/block replacement, newline normalization, and installed-file patching. This plan creates two Pi-native custom tools that make common programmatic edits first-class, auditable tool calls instead of shell escape hatches, and documents the research in the Obsidian vault.

Web research identified borrowable patterns from `replace-in-files-cli` and `sd` for explicit literal/regex replacement, dry-run behavior, and low-escaping APIs; from `dasel` and `yq` for structured set/delete/update operations; and from `comby`/`ast-grep` for later syntax-aware rewrite ideas. The selected scope is intentionally KISS: implement `text_edit` and `structured_edit` now, defer AST/code rewrite tooling.

## Constraints

- Platform: Windows Git Bash/MSYS/MSYS2 detected (`MINGW64_NT-10.0-26200`).
- Shell: bash available and preferred for git/Make; PowerShell available for Windows-native tasks.
- Project markers: `pyproject.toml`, `Makefile`, `.gitattributes`; Pi TypeScript tooling lives under `pi/extensions` and `pi/tests`.
- Pi TypeScript validation is pnpm-only: use `cd pi/extensions && pnpm install --frozen-lockfile && pnpm run typecheck`; use `cd pi/tests && pnpm install --frozen-lockfile && pnpm run test` for Vitest.
- Repo-wide validation command detected: `make check`.
- New tools must reduce Python heredoc edits without becoming a universal unsafe mutation surface.
- Tools must avoid touching secrets, `.env` files, ignored paths, and broad path globs unless explicitly safe.
- Shared helper code must not live as a top-level `pi/extensions/*.ts` file. Per `pi/extensions/README.md`, top-level files are auto-discovered as extensions; shared helpers belong under `pi/lib/` and are imported with the existing `.js` ESM import pattern.
- v1 path safety contract: resolve every input path relative to `ctx.cwd`, canonicalize before safety checks, require repo-root containment, reject NUL/path traversal/outside-repo paths, reject directories, reject symlink escapes, reject `.env`/`.env.*` and common secret-like filenames, reject gitignored targets via `git check-ignore` or a documented fallback, and reject glob-like path strings in v1 rather than expanding globs.
- v1 JSON path contract: `structured_edit` uses typed path arrays (`Array<string | number>`) rather than dot-path/JSONPath strings. Reject dangerous object segments `__proto__`, `prototype`, and `constructor`; require explicit existing parent containers for set/delete; allow numeric array indexes only for existing array entries unless an operation explicitly documents append later; delete-missing is an error in v1.
- The Obsidian note belongs under `docs/research/obsidian-vault/agent-workflows/projects/` and should cite the researched repos.

## Alternatives Considered

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| Add prompt-only policy forbidding Python file writes | Fast, no code | Relies on model discipline; does not reduce tool friction | Rejected: useful as follow-up guardrail but not enough |
| Build one universal edit tool with text, JSON, YAML, TOML, AST, and transforms | One surface for agents | Too broad/risky; harder to test and explain | Rejected: over-engineered for observed need |
| Build `text_edit` and JSON-first `structured_edit` | Covers most observed Python heredocs; simple, auditable | YAML/TOML/AST features deferred | **Selected** |
| Shell out to existing tools (`sd`, `yq`, `dasel`) | Reuses mature projects | Adds platform/dependency variance and shell escaping; less Pi-native | Rejected for first implementation; borrow API ideas only |
| Add AST rewrite via `ast-grep`/`comby` now | Safer code refactors than regex | Larger architectural scope; not needed for common newline/JSON/version edits | Rejected/deferred; correct later for syntax-sensitive TypeScript migrations |

Convergence note: all selected options are Pi-native tool surfaces. The opposite pattern, delegating to external CLIs, would be correct for a project already standardizing on `yq`/`sd` in CI and developer machines.

## Objective

Implement and test two Pi custom tools:

1. `text_edit`: safe text-level operations for literal replacement, regex replacement, LF normalization, and final-newline enforcement, with expected match counts and dry-run/diff summaries.
2. `structured_edit`: safe JSON-first structured edits for set/delete operations with pretty output and final newline preservation.

Also create an Obsidian vault research note that records the observed problem, research findings, and rationale.

## Project Context

- **Language**: TypeScript for Pi extensions/tests; Python for repo tests; Markdown for docs/research.
- **Test command**: `cd pi/tests && pnpm install --frozen-lockfile && pnpm run test`; repo-wide `make check`.
- **Lint command**: `make lint`; Pi extension typecheck via `cd pi/extensions && pnpm run typecheck`.
- **Existing `.specs/` slugs**: `archive`, `infisical-dns-certs`, `infisical-secrets`, `linux-arch-install`, `menos-infisical-runtime`, `menos-knowledge-compiler`, `multipass-yolo-workflows`, `pi-branch-tab`, `x-research-pipeline`, `zellij-windows-cockpit-v1`. This plan uses non-colliding slug `safe-edit-tools`.

## Automation Plan

| Operation | Command/wrapper | Credentials | Evidence |
|-----------|-----------------|-------------|----------|
| Preflight | `git status --short && git status --porcelain=v1 --untracked-files=normal` then inspect whether intended paths are already dirty | none | status output recorded in `.specs/safe-edit-tools/execution-log.md`; abort or ask before touching dirty intended paths |
| Implement | Pi tools in `pi/extensions/*.ts`, shared helpers in `pi/lib/*.ts`, tests in `pi/tests/*.test.ts`, docs note under Obsidian vault | none | git diff and changed file list recorded in `.specs/safe-edit-tools/execution-log.md` |
| Verify Pi typecheck | `cd pi/extensions && pnpm install --frozen-lockfile && pnpm run typecheck` | none | zero exit, no TS errors |
| Verify Pi tests | `cd pi/tests && pnpm install --frozen-lockfile && pnpm run test` | none | zero exit, Vitest pass summary recorded in `.specs/safe-edit-tools/execution-log.md` |
| Verify repo | `make check` | none | zero exit, no errors/warnings recorded in `.specs/safe-edit-tools/execution-log.md` |
| Deploy | not applicable | none | none |
| Rollback | `git restore -- pi/extensions pi/lib pi/tests docs/research/obsidian-vault/agent-workflows .specs/safe-edit-tools/plan.md` for tracked changes, then remove only known untracked files created by this plan after reviewing `git status --short` | none | clean or restored `git status --short` recorded in `.specs/safe-edit-tools/execution-log.md` |

## Execution Status

No implementation has run yet. `/do-it` must append blockers, failed commands, and recovery notes here if execution cannot complete in one pass. Current status: completed; implementation, automated validation, repo-wide validation, manual/deployment not-required gates, archive preflight, and final workspace evidence checks passed on 2026-05-07.

## Execution Checklist

This checklist is the durable resume ledger for `/do-it`. Every executable task, validation gate, and final completion gate has exactly one matching checkbox. Checked means verified complete; unchecked means pending, in-progress, blocked, or invalidated.

`/do-it` must mark each item `[x]` immediately after that item passes its required verification and before starting any dependent or next sequential step. `/review-it` must preserve checked state, add unchecked items for new executable work, and never mark implementation or validation work complete.

### Preflight

- [x] P0: Preflight and evidence-log setup
  - Status: completed
  - Evidence: .specs/safe-edit-tools/execution-log.md records initial git status and dirty-path policy

### Wave 1

- [x] T1: Implement shared safe-edit helpers
  - Status: completed
  - Evidence: pi/lib/safe-edit.ts exports shared path, read/write, newline, preview, and match-count helpers; acceptance greps passed
- [x] T2: Add Obsidian research note
  - Status: completed
  - Evidence: docs/research/obsidian-vault/agent-workflows/projects/pi-safe-edit-tools.md created after reading vault AGENTS guidance; acceptance greps passed
- [x] V1: Validate wave 1
  - Status: completed
  - Evidence: T1/T2 acceptance checks and diff whitespace formatting passed via Biome/write checks

### Wave 2

- [x] T3: Implement `text_edit` tool
  - Status: completed
  - Evidence: pi/extensions/text-edit.ts registers text_edit with TypeBox schema, dryRun preview, safe helper imports, and tested behavior
- [x] T4: Implement `structured_edit` JSON tool
  - Status: completed
  - Evidence: pi/extensions/structured-edit.ts registers structured_edit with TypeBox schema, JSON set/delete typed paths, safe helper imports, and tested behavior
- [x] V2: Validate wave 2
  - Status: completed
  - Evidence: cd pi/extensions && pnpm install --frozen-lockfile && pnpm run typecheck exited 0; package manifests/lockfiles unchanged

### Wave 3

- [x] T5: Add tests, heredoc guardrail, and prompt/tool guidance
  - Status: completed
  - Evidence: pi/tests/text-edit.test.ts, pi/tests/structured-edit.test.ts, pi/tests/shell-edit-guard.test.ts, pi/extensions/commit-guard.ts, and pi/extensions/README.md cover tools, guardrail, and guidance
- [x] V3: Validate wave 3
  - Status: completed
  - Evidence: cd pi/tests && pnpm run test -- *edit*.test.ts shell-edit-guard.test.ts exited 0 (Vitest pass); typecheck exited 0

### Final Gates

- [x] F1: Task-specific verification complete
  - Status: completed
  - Evidence: P0/T1/T2/T3/T4/T5 Verify commands passed; see .specs/safe-edit-tools/execution-log.md
- [x] F2: Repo-wide validation complete
  - Status: completed
  - Evidence: make check exited 0; All checks passed
- [x] F3: Manual validation complete or not required
  - Status: completed
  - Evidence: manual validation: not required recorded in execution log
- [x] F4: Deployment validation complete or not required
  - Status: completed
  - Evidence: deployment validation: not required recorded in execution log
- [x] F5: Archive preflight complete
  - Status: completed
  - Evidence: final gate summaries and archive readiness recorded in execution log
- [x] F6: Final workspace evidence check complete
  - Status: completed
  - Evidence: git diff --stat and git status --short reviewed; remaining changes are intended implementation/docs/plan artifacts plus pre-existing unrelated review-it edits

## Task Breakdown

| # | Task | Files | Type | Model | Agent | Depends On |
|---|------|-------|------|-------|-------|------------|
| P0 | Preflight and evidence-log setup | 1: `.specs/safe-edit-tools/execution-log.md` | mechanical | small | builder | -- |
| T1 | Implement shared safe-edit helpers | 1-2: `pi/lib/safe-edit.ts` or helper module under `pi/lib/` | feature | medium | builder | P0 |
| T2 | Add Obsidian research note | 1: `docs/research/obsidian-vault/agent-workflows/projects/pi-safe-edit-tools.md` | documentation | small | planner | P0 |
| V1 | Validate wave 1 | -- | validation | medium | reviewer | T1, T2 |
| T3 | Implement `text_edit` tool | 1-2: `pi/extensions/text-edit.ts`, registration surface if needed | feature | medium | builder | V1 |
| T4 | Implement `structured_edit` JSON tool | 1-2: `pi/extensions/structured-edit.ts`, registration surface if needed | feature | medium | builder | V1 |
| V2 | Validate wave 2 | -- | validation | medium | reviewer | T3, T4 |
| T5 | Add tests, heredoc guardrail, and prompt/tool guidance | 3-5: `pi/tests/*edit*.test.ts`, relevant guardrail/guidance files | feature | medium | qa-engineer | V2 |
| V3 | Validate wave 3 | -- | validation | medium | reviewer | T5 |

## Execution Waves

### Preflight

**P0: Preflight and evidence-log setup** [small] -- builder
- Description: Capture initial workspace state before implementation, create `.specs/safe-edit-tools/execution-log.md`, and decide whether it is safe to edit intended paths.
- Files: `.specs/safe-edit-tools/execution-log.md`.
- Acceptance Criteria:
  1. [ ] Initial git status and dirty-path policy are recorded.
     - Verify: `git status --short && test -f .specs/safe-edit-tools/execution-log.md && grep -E "Preflight|git status|dirty" .specs/safe-edit-tools/execution-log.md`
     - Pass: execution log contains timestamped initial status and states whether intended paths were clean, unrelated dirty paths were present, or user confirmation was needed.
     - Fail: implementation starts without recorded preflight evidence.

### Wave 1 (parallel)

**T1: Implement shared safe-edit helpers** [medium] -- builder
- Blocked by: P0
- Description: Create reusable helper logic for safe path handling, ignored-file checks, read/write with LF preservation, final newline handling, dry-run summaries, and match-count validation. Helpers should be simple, local to Pi TypeScript code, and must not add external CLI dependencies. Do not place helpers at top-level `pi/extensions/*.ts`; that directory auto-discovers extensions. Use `pi/lib/safe-edit.ts` or an existing non-auto-discovered helper module, imported from extensions with the existing `.js` ESM pattern.
- Files: `pi/lib/safe-edit.ts` or nearest existing helper module under `pi/lib/`.
- Acceptance Criteria:
  1. [ ] Helper module exports functions usable by both planned tools.
     - Verify: `test -f pi/lib/safe-edit.ts && grep -E "export .*safe|export .*Edit|export function" -n pi/lib/safe-edit.ts`
     - Pass: exported helper functions are visible in `pi/lib/safe-edit.ts`.
     - Fail: no shared helpers or helpers placed at top-level `pi/extensions/*.ts`.
  2. [ ] Helpers implement the v1 path safety contract structurally; behavioral proof is completed by T5/F1.
     - Verify: `test -f pi/lib/safe-edit.ts && grep -E "canonical|check-ignore|\.env|secret|symlink|glob|cwd|repo" -n pi/lib/safe-edit.ts`
     - Pass: `pi/lib/safe-edit.ts` contains explicit branches or named functions for canonical repo containment, directory rejection, `.env`/secret filename rejection, gitignored target rejection, symlink escape rejection, and glob-like path rejection.
     - Fail: helper blindly writes arbitrary paths or leaves any safety rule undocumented/untested.

**T2: Add Obsidian research note** [small] -- planner
- Blocked by: P0
- Description: Before writing, read and follow `docs/research/obsidian-vault/AGENTS.md` and `docs/research/obsidian-vault/agent-workflows/AGENTS.md`. Then write the subagent-drafted research note to the Obsidian vault, correcting the `replace-in-files-cli` repo URL to `https://github.com/sindresorhus/replace-in-files-cli` and including researched repos: `replace-in-files-cli`, `sd`, `dasel`, `yq`, `comby`, and `ast-grep`.
- Files: `docs/research/obsidian-vault/agent-workflows/projects/pi-safe-edit-tools.md`.
- Acceptance Criteria:
  1. [ ] Note exists with frontmatter, problem statement, observed patterns, researched repos, and KISS recommendation.
     - Verify: `note=docs/research/obsidian-vault/agent-workflows/projects/pi-safe-edit-tools.md; test -f docs/research/obsidian-vault/AGENTS.md && test -f docs/research/obsidian-vault/agent-workflows/AGENTS.md && test -f "$note" && grep -q "^---" "$note" && grep -q "Python heredoc" "$note" && grep -q "KISS recommendation" "$note" && grep -q "replace-in-files-cli" "$note" && grep -q "sd" "$note" && grep -q "dasel" "$note" && grep -q "yq" "$note" && grep -q "comby" "$note" && grep -q "ast-grep" "$note" && grep -q "text_edit" "$note" && grep -q "structured_edit" "$note"`
     - Pass: command exits 0 after local vault guidance has been read.
     - Fail: missing guidance file, missing note, frontmatter/problem/recommendation missing, or any researched repo/tool recommendation missing.

### Wave 1 -- Validation Gate

**V1: Validate wave 1** [medium] -- reviewer
- Blocked by: T1, T2
- Checks:
  1. Run T1 and T2 acceptance criteria that are executable at this wave; behavioral safety tests remain pending until T5/V3/F1.
  2. `git diff --check -- pi/lib pi/extensions docs/research/obsidian-vault/agent-workflows/projects/pi-safe-edit-tools.md` -- no whitespace errors.
  3. Cross-task integration: helper scope still aligns with documented KISS recommendation.
- On failure: create/fix a task, re-validate after fix.

### Wave 2 (parallel)

**T3: Implement `text_edit` tool** [medium] -- builder
- Blocked by: V1
- Description: Register a Pi tool named `text_edit` for safe text operations. Minimum parameters: `paths`, `operations`, and optional `dryRun`. Operations must include `literal_replace`, `regex_replace`, `normalize_line_endings` with LF, and `ensure_final_newline`. Replacement operations must support `expectedMatches` or `allowZero` to prevent silent misses. Use an explicit TypeBox schema with literal operation modes; do not accept free-form transform callbacks. For regex operations, reject binary files, impose a documented max file size/input size, and either reject known catastrophic patterns or document bounded JS-regex risk controls with tests for safe failure.
- Files: `pi/extensions/text-edit.ts` and any extension registration mechanism used by this repo.
- Acceptance Criteria:
  1. [ ] Tool schema exposes explicit TypeBox modes instead of shell-like expressions.
     - Verify: `grep -R "name: \"text_edit\"\|Type.Object\|literal_replace\|regex_replace\|ensure_final_newline\|normalize_line_endings" -n pi/extensions/text-edit.ts pi/extensions 2>/dev/null && grep -E "\.\./lib/safe-edit\.js" -n pi/extensions/text-edit.ts`
     - Pass: all expected operation names appear in TypeBox schema and implementation, and the extension imports `pi/lib/safe-edit.ts` via the `.js` ESM pattern.
     - Fail: tool is missing, relies on free-form shell commands, or lacks runtime schema metadata.
  2. [ ] Tool is exposed through a top-level extension default export; runtime registration proof is completed by T5/F1.
     - Verify: `grep -R "export default function\|registerTool\|name: \"text_edit\"" -n pi/extensions/text-edit.ts pi/extensions 2>/dev/null`
     - Pass: extension file has a default export and calls `registerTool` for `text_edit`.
     - Fail: non-loadable extension file or no registration call.
  3. [ ] Dry-run implementation returns a bounded summary; no-write behavioral proof is completed by T5/F1.
     - Verify: `grep -R "dryRun\|unified\|diff\|preview\|operation count\|resolved" -n pi/extensions/text-edit.ts pi/lib/safe-edit.ts pi/extensions pi/lib 2>/dev/null`
     - Pass: implementation includes dry-run branching and summary terms for resolved paths, operation counts, and bounded diff/preview.
     - Fail: no dry-run branch or no actionable summary path.

**T4: Implement `structured_edit` JSON tool** [medium] -- builder
- Blocked by: V1
- Description: Register a Pi tool named `structured_edit` for parser-aware structured files, JSON-first. Minimum parameters: `path`, `format` (`json` initially), `operations` with `set` and `delete`, optional `indent`, and `finalNewline`. Use an explicit TypeBox schema. Path selectors are typed arrays (`Array<string | number>`), not dot-path/JSONPath strings. Reject unsupported formats with a clear message rather than guessing. Reject dangerous path segments `__proto__`, `prototype`, and `constructor`; require existing parent containers; delete-missing is an error in v1.
- Files: `pi/extensions/structured-edit.ts` and any extension registration mechanism used by this repo.
- Acceptance Criteria:
  1. [ ] Tool schema supports JSON `set` and `delete` operations with typed array paths.
     - Verify: `grep -R "name: \"structured_edit\"\|Type.Object\|format\|set\|delete\|finalNewline" -n pi/extensions/structured-edit.ts pi/extensions 2>/dev/null && grep -E "\.\./lib/safe-edit\.js" -n pi/extensions/structured-edit.ts`
     - Pass: expected schema terms appear in TypeBox schema and implementation, and the extension imports `pi/lib/safe-edit.ts` via the `.js` ESM pattern.
     - Fail: missing tool, only text replacement masquerading as structured editing, or ambiguous path syntax.
  2. [ ] Tool is exposed through a top-level extension default export; runtime registration proof is completed by T5/F1.
     - Verify: `grep -R "export default function\|registerTool\|name: \"structured_edit\"" -n pi/extensions/structured-edit.ts pi/extensions 2>/dev/null`
     - Pass: extension file has a default export and calls `registerTool` for `structured_edit`.
     - Fail: non-loadable extension file or no registration call.
  3. [ ] JSON edit implementation includes validation for valid JSON, indentation, final newline, and prototype-pollution segments; behavioral proof is completed by T5/F1.
     - Verify: `grep -R "JSON.parse\|JSON.stringify\|finalNewline\|indent\|__proto__\|prototype\|constructor" -n pi/extensions/structured-edit.ts pi/lib/safe-edit.ts pi/extensions pi/lib 2>/dev/null`
     - Pass: implementation includes JSON parse/write logic, newline/indent handling, and dangerous segment rejection.
     - Fail: no JSON parser use, no newline/indent handling, or unsafe object segment not checked.

### Wave 2 -- Validation Gate

**V2: Validate wave 2** [medium] -- reviewer
- Blocked by: T3, T4
- Checks:
  1. Run T3 and T4 acceptance criteria that are executable at this wave; runtime registration and mutation behavior tests remain pending until T5/V3/F1.
  2. `cd pi/extensions && pnpm install --frozen-lockfile && pnpm run typecheck` -- TypeScript typecheck passes.
  3. `git status --short -- pi/extensions/package.json pi/extensions/pnpm-lock.yaml pi/tests/package.json pi/tests/pnpm-lock.yaml` -- no package manifest or lockfile changes caused by validation installs unless intentionally part of the implementation and documented.
  4. Cross-task integration: both tools share helper behavior and error style.
- On failure: create/fix a task, re-validate after fix.

### Wave 3

**T5: Add tests, heredoc guardrail, and prompt/tool guidance** [medium] -- qa-engineer
- Blocked by: V2
- Description: Add Vitest coverage for both tools and update Pi guidance so agents know to prefer `text_edit`/`structured_edit` over Python heredocs for tracked repo edits. Required guidance target is `pi/extensions/README.md`; additionally update `pi/README.md` only if the new tools need top-level user-facing documentation. Add the automated guardrail in `pi/extensions/commit-guard.ts` if it can cleanly extend the existing `tool_call` bash interception pattern; otherwise create a focused top-level extension such as `pi/extensions/shell-edit-guard.ts` with a documented exception explaining why it inspects command strings. The guardrail scans shell tool calls/session logs for mutating heredoc patterns such as `python - <<` plus `write_text`, `open(..., 'w')`, `sed -i`, `perl -pi`, or `cat >`, and reports the safer tool alternative. Tests must cover successful edits, dry-run/no-write, expected match failures, unsafe path rejection, JSON set/delete, newline behavior, registration, and guardrail detection.
- Files: `pi/tests/text-edit.test.ts`, `pi/tests/structured-edit.test.ts`, `pi/tests/shell-edit-guard.test.ts` or relevant guardrail test file, `pi/extensions/commit-guard.ts` or `pi/extensions/shell-edit-guard.ts`, `pi/extensions/README.md`, and optionally `pi/README.md` if top-level docs are needed.
- Acceptance Criteria:
  1. [ ] Tests cover positive and negative cases for both tools.
     - Verify: `grep -R "text_edit\|structured_edit\|dryRun\|expectedMatches\|\.env\|finalNewline\|gitignored\|symlink\|__proto__\|constructor\|prototype" -n pi/tests/*edit*.test.ts`
     - Pass: expected behavior names appear in tests for happy paths and safety failures.
     - Fail: tests only cover happy path or omit path/secret/prototype safety cases.
  2. [ ] Registration tests prove both tools are runtime-visible.
     - Verify: `grep -R "registerTool\|text_edit\|structured_edit" -n pi/tests/*edit*.test.ts`
     - Pass: tests import extension default exports, invoke them with a fake `ExtensionAPI`, and assert registered tool names, schemas, and executable handlers.
     - Fail: tests only grep implementation files or instantiate helpers directly.
  3. [ ] Dry-run/no-write and match-count tests prove behavior, not just summaries.
     - Verify: `grep -R "readFile\|stat\|mtime\|toBe\|expectedMatches\|allowZero\|dryRun" -n pi/tests/*edit*.test.ts && cd pi/tests && pnpm run test -- *edit*.test.ts`
     - Pass: tests fail if dry-run writes or match-count semantics are wrong.
     - Fail: mock-only tests or summary-only tests can pass while files mutate incorrectly.
  4. [ ] Guardrail detects mutating Python/shell edit patterns and suggests safer tools.
     - Verify: `grep -R "python - <<\|write_text\|sed -i\|perl -pi\|cat >\|text_edit\|structured_edit" -n pi/tests pi/extensions pi/lib pi/skills 2>/dev/null`
     - Pass: detector or warning path is implemented and tested against mutating heredoc examples.
     - Fail: only prose guidance exists and no automated warning/detection is tested.
  5. [ ] Agent-facing guidance discourages Python heredoc edits when these tools fit.
     - Verify: `grep -E "text_edit|structured_edit|Python heredoc|tracked repo" -n pi/extensions/README.md && { grep -E "text_edit|structured_edit" -n pi/README.md pi/skills/* 2>/dev/null || true; }`
     - Pass: required guidance is present in `pi/extensions/README.md`; optional top-level/skill guidance may also be present.
     - Fail: tools exist but `pi/extensions/README.md` does not route agents toward them.

### Wave 3 -- Validation Gate

**V3: Validate wave 3** [medium] -- reviewer
- Blocked by: T5
- Checks:
  1. Run all T5 acceptance criteria.
  2. `cd pi/tests && pnpm install --frozen-lockfile && pnpm run test` -- Vitest passes.
  3. `cd pi/extensions && pnpm install --frozen-lockfile && pnpm run typecheck` -- TypeScript typecheck passes.
  4. `git status --short -- pi/extensions/package.json pi/extensions/pnpm-lock.yaml pi/tests/package.json pi/tests/pnpm-lock.yaml` -- no package manifest or lockfile changes caused by validation installs unless intentionally part of the implementation and documented.
  5. Cross-task integration: test evidence demonstrates the original Python-heredoc cases are covered by first-class tools and guardrail detection.
- On failure: create/fix a task, re-validate after fix.

## Dependency Graph

```
Preflight: P0
Wave 1: T1, T2 (parallel, both depend on P0) → V1
Wave 2: T3, T4 (parallel, both depend on V1) → V2
Wave 3: T5 (depends on V2) → V3
Final: V3 → F1 → F2 → F3 → F4 → F5 → F6
```

## Success Criteria

1. [ ] Pi exposes `text_edit` and `structured_edit` as registered custom tools with clear schemas and safety behavior.
   - Verify: `cd pi/tests && pnpm run test -- *edit*.test.ts`
   - Pass: tests prove extension default exports register both tools with schemas and executable handlers.
2. [ ] The common observed Python-heredoc edit patterns have direct tool equivalents and an automated warning path.
   - Verify: inspect tests for literal replace, regex replace, LF normalization, final newline, JSON set/delete, expected match failure, dry-run, unsafe path rejection, and mutating heredoc detection.
   - Pass: each behavior has a test or explicit acceptance evidence.
3. [ ] Documentation exists in the Obsidian vault and agent-facing guidance points agents to the tools.
   - Verify: `test -f docs/research/obsidian-vault/agent-workflows/projects/pi-safe-edit-tools.md && grep -R "text_edit\|structured_edit" docs/research/obsidian-vault/agent-workflows/projects/pi-safe-edit-tools.md pi/extensions pi/README.md pi/skills 2>/dev/null`
   - Pass: research note exists and guidance references both tools.
4. [ ] Full validation passes.
   - Verify: `make check`
   - Pass: exits 0 with no errors or warnings.

## Validation Contract

`/do-it` must satisfy this contract before reporting the plan complete or archiving it.

### Automation completeness

- Required: yes
- `/do-it` must be able to run all agent-runnable validation/deployment steps through documented commands.
- Credentials are not required.
- Manual-only steps are not required.
- `/do-it` must maintain `.specs/safe-edit-tools/execution-log.md` during execution. For every task, validation gate, and final gate, record command, exit status, timestamp, concise non-secret output summary, and any evidence file/test names before marking the matching checklist item complete.
- `/do-it` must preserve pre-existing user work: capture initial `git status --short`; abort or ask before changing dirty intended paths; keep unrelated pre-existing changes out of rollback and final evidence.

### Required automated validation

1. [ ] Run Pi extension typecheck.
   - Command: `cd pi/extensions && pnpm install --frozen-lockfile && pnpm run typecheck`
   - Pass: exits 0 with no TypeScript errors.
   - Fail: do not archive; fix type errors and rerun.

2. [ ] Run Pi tests.
   - Command: `cd pi/tests && pnpm install --frozen-lockfile && pnpm run test`
   - Pass: exits 0 with all tests passing.
   - Fail: do not archive; fix tests/code and rerun.

3. [ ] Run repo-wide validation.
   - Command: `make check`
   - Pass: exits 0 with no errors or warnings.
   - Fail: do not archive; update `## Execution Status` with failing command and next fix.

4. [ ] Run task-specific verification from every acceptance criterion above.
   - Command: see each task's `Verify:` command.
   - Pass: every acceptance criterion passes exactly as written, with evidence recorded in `.specs/safe-edit-tools/execution-log.md`.
   - Fail: create/fix a task, rerun affected checks, then rerun repo-wide validation.

5. [ ] Run final workspace evidence checks. This corresponds to checklist item F6.
   - Command: `git diff --stat && git status --short`
   - Pass: changed-path inventory contains only intended implementation, test, docs, plan/review, and execution-log artifacts; package manifests/lockfiles are unchanged unless intentionally modified and documented.
   - Fail: stop before archive; investigate unexpected tracked or untracked files.

### Final gate execution map

- **F1: Task-specific verification complete**
  - Command: run every `Verify:` command in P0, T1, T2, T3, T4, and T5; record each command and exit status in `.specs/safe-edit-tools/execution-log.md`.
  - Pass: every task acceptance criterion passes and no placeholder/deferred verification remains.
- **F2: Repo-wide validation complete**
  - Command: `make check`
  - Pass: exits 0 with no errors or warnings, with summary recorded in the execution log.
- **F3: Manual validation complete or not required**
  - Command: `printf 'manual validation: not required\n' >> .specs/safe-edit-tools/execution-log.md`
  - Pass: manual validation is explicitly recorded as not required.
- **F4: Deployment validation complete or not required**
  - Command: `printf 'deployment validation: not required\n' >> .specs/safe-edit-tools/execution-log.md`
  - Pass: deployment validation is explicitly recorded as not required.
- **F5: Archive preflight complete**
  - Command: `grep -E "F1|F2|F3|F4" .specs/safe-edit-tools/execution-log.md`
  - Pass: execution log contains non-secret summaries for all prior final gates and states archive-readiness checks are beginning. This is readiness verification only; it does not physically move the spec.
- **F6: Final workspace evidence check complete**
  - Command: `git diff --stat && git status --short`
  - Pass: output contains only intended implementation, test, docs, plan/review, and execution-log artifacts; unexpected files are resolved or documented before archive.

### Manual validation

- Required: no
- Steps:
  1. None.

### Deployment validation

- Required: no
- Procedure: None.

### Archive rule

`/do-it` may archive this plan only after all required automated validation, task-specific verification, manual validation, deployment validation, repo-wide validation, and final workspace evidence checks pass. Before archiving, `/do-it` must record evidence paths or command summaries in the checklist and `.specs/safe-edit-tools/execution-log.md`, including final `git diff --stat` and `git status --short`. Archive is blocked if untracked generated files remain unexplained or if intended rollback cannot remove the known artifacts safely. This plan does not require `/do-it` to physically move the spec into `.specs/archive/`; F5 means archive-readiness verification only unless the user separately requests archiving.

## Handoff Notes

- Recreate the Obsidian vault note from the T2 acceptance criteria and researched repo list; do not rely on prior conversation context.
- Use these exact research links in the Obsidian note: `replace-in-files-cli` https://github.com/sindresorhus/replace-in-files-cli; `sd` https://github.com/chmln/sd; `dasel` https://github.com/TomWright/dasel; `yq` https://github.com/mikefarah/yq; `comby` https://github.com/comby-tools/comby; `ast-grep` https://github.com/ast-grep/ast-grep.
- Keep `structured_edit` JSON-first; do not implement YAML/TOML unless tests and scope are explicitly expanded.
- Keep `structured_edit` path semantics to typed arrays in v1; do not introduce dot-path, JSONPath, or automatic parent creation without updating this plan and tests.
- Keep `text_edit` structured and auditable; do not add arbitrary transform callbacks in v1 because they recreate the Python-heredoc problem.
- Do not place shared helpers at top-level `pi/extensions/*.ts`; top-level extension files must default-export an extension factory. Put helpers under `pi/lib/` and import with the existing `.js` ESM pattern.
- If a Pi extension registration index is generated or convention-based, follow existing patterns in nearby tool files such as `pi/extensions/tool-search.ts`, but verify registration with Vitest rather than grep-only checks.
