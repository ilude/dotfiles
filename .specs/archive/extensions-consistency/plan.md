---
created: 2026-04-25
status: completed
revision: 2
revision_reason: Incorporated review-1 findings -- moved helpers out of auto-discovered path, replaced grep-based ACs with behavioral tests, deferred broad provider/session/transcript refactors to Phase 2, tightened damage-control scope.
completed: 2026-04-25
---

# Plan: Standardize Pi Extensions (Phase 1)

## Context & Motivation

Pi extensions in `pi/extensions/` have grown organically and now show inconsistent patterns: duplicated path/config-loading logic, mixed default export shapes, inconsistent tool error result shapes and UI notification wording, hand-rolled YAML/config parsing, and partially implemented safety in `damage-control.ts` (it loads `no_delete_paths` from config but no enforcement path consumes it).

The selected direction is conversation option 1: shared utility helpers plus a canonical scaffold and conventions doc, refactored into representative extensions only. After review-1, scope is split into two phases:

- **Phase 1 (this plan)**: utilities, conventions doc, damage-control safety repair, and 2-3 representative refactors with behavioral tests.
- **Phase 2 (separate plan, deferred)**: broader provider/session/transcript refactors, lint rules, and any cross-extension architecture work, only after Phase 1 conventions stabilize.

## Constraints

- Platform: Windows/MSYS2 (`MINGW64_NT-10.0-26200`); PowerShell available for Windows-native tasks.
- Shell: `/usr/bin/bash`. Use forward-slash paths in docs and commands.
- Repository markers: `pyproject.toml`, `Makefile`, `.gitattributes`, `pi/extensions/tsconfig.json`.
- Hard rule: shared helpers MUST live under `pi/lib/`, not under `pi/extensions/`. Top-level `*.ts` files in `pi/extensions/` are auto-discovered by Pi as extension modules (see `pi/README.md:113` and the workaround comment in `pi/extensions/transcript-runtime.ts:30-40`); a non-extension helper file at the top level would either crash startup or require the no-op-factory hack on every helper. `pi/lib/` is the existing shared-library convention (sibling to `pi/lib/transcript.ts`, `pi/lib/expertise-snapshot.ts`, `pi/lib/yaml-helpers.ts`).
- Do not weaken safety controls in `damage-control.ts`, `commit-guard.ts`, or related guard extensions.
- Reuse existing dependencies. `pi/lib/yaml-helpers.ts` already exists; do not introduce `js-yaml` or duplicate YAML helpers.
- Preserve existing behavior unless a change is explicitly part of standardization or safety repair.
- Do not modify secrets, credentials, `*.env`, SSH keys, or destructive git state.
- All encountered errors/warnings in touched validation paths must be fixed at the root, not suppressed.

## Alternatives Considered

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| Phase 1 utilities + safety repair + 2-3 representative refactors | Removes the highest-value duplication, fixes the real safety bug, validates conventions on small surface area before scaling | Convention coverage is incomplete after Phase 1 | **Selected**: smallest first slice that proves the pattern and ships the safety fix |
| Single-pass standardization across all 16+ extensions (original plan v1) | One coordinated refactor | Architecture migration disguised as consistency pass; high churn for limited user-facing value; review-1 flagged broad provider/session refactors as risky | Rejected: deferred to a Phase 2 plan after Phase 1 validates |
| Lint/config enforcement only | Fast | Does not remove duplicate path/config code or fix damage-control; encodes conventions before they stabilize | Rejected for Phase 1 |
| Base extension class/wrapper | Strong compile-time consistency | Framework-like overhead for Pi's simple functional extension model | Rejected |
| Leave extensions as-is | No regression risk | Drift continues; `no_delete_paths` remains unenforced (real safety bug) | Rejected: damage-control fix is non-optional |

## Objective

Ship a small, validated Phase 1 that:
1. Establishes a shared helper location and module under `pi/lib/`.
2. Documents extension conventions, including the precise definition of a "documented exception."
3. Repairs `damage-control.ts` so `no_delete_paths` is actually enforced for the operations explicitly defined in T3.
4. Refactors three representative extensions (`damage-control.ts`, `agent-team.ts`, `ask-user.ts`) onto the shared helpers as proof-of-pattern.
5. Adds executable behavioral tests covering the safety repair and helper behavior, plus a Pi runtime smoke check.

Phase 2 (deferred) covers `agent-chain.ts`, `commit-guard.ts`, `quality-gates.ts`, `context.ts`, `web-tools.ts`, `tool-search.ts`, `tool-reduction.ts`, `model-visibility.ts`, `copilot-headers.ts`, `provider.ts`, `prompt-router.ts`, `refresh-models.ts`, `session-hooks.ts`, `probe-thinking-level.ts`, `test-orchestrator.ts`, `pwsh.ts`, `transcript-*.ts`.

## Project Context

- **Language**: TypeScript under `pi/extensions/` and `pi/lib/`; Vitest test suite under `pi/tests/`; Python validation tooling and Makefile-based test/lint commands at the repo level.
- **Test command (TS)**: `cd pi/tests && bun test` (existing pattern).
- **Test command (repo)**: `make test-quick` for fast regression, `make test` for full.
- **Lint commands**: `make lint` runs ruff + shellcheck only (does NOT cover TS); TS validation is `python pi/extensions/tsc-check.py`.
- **New target (T8)**: `make check-pi-extensions` will run `tsc-check.py` plus the Vitest suite plus a Pi runtime smoke check.

## Definition: "Documented Exception"

When a refactor leaves a file using a direct API (e.g. `ctx.ui.notify`) instead of a shared helper, the file MUST contain a top-of-file or call-site comment of the form:

```
// Convention exception: <one-line rationale>.
// Risk: <what breaks if this drifts>.
// Why shared helper is inappropriate: <reason>.
```

A bare TODO or a comment without all three lines is NOT a documented exception and fails the AC.

## Definition: `no_delete_paths` Covered Operations

For Phase 1, `no_delete_paths` enforcement covers any of the following when the resolved target path or any ancestor path matches a configured pattern:

1. **Bash tool commands** that match (case-insensitive, after argv split): `rm`, `rmdir`, `unlink`, `mv ... /dev/null`, `> <path>` (truncating overwrite via redirection), `cp /dev/null <path>`, `find ... -delete`, `git rm`, `git clean`.
2. **PowerShell tool commands** that match: `Remove-Item`, `Clear-Content`, `Out-File -Force <path>` when the file pre-exists, `Set-Content` to a no-delete-listed path, `[System.IO.File]::Delete`.
3. **Edit/Write tool calls** whose target file is within a no-delete path AND whose new content is empty, only whitespace, or otherwise truncates the file to zero non-trivial bytes.

Out of scope for Phase 1 (defer to Phase 2 with explicit ACs): symlink races, hardlink redirection, recursive directory manipulation through indirection (e.g. mounted volumes).

## Task Breakdown

| # | Task | Files | Type | Model | Agent | Depends On |
|---|------|-------|------|-------|-------|------------|
| T1 | Add shared extension utilities under pi/lib | 1-2 | mechanical | small | builder-light | -- |
| T2 | Document conventions and exception format | 1-2 | mechanical | small | docs-specialist | T1 |
| V1 | Validate wave 1 | -- | validation | small | validation-light | T1, T2 |
| T3 | Repair damage-control.ts no_delete_paths + refactor onto helpers | 1-2 | feature | medium | safety-extension-specialist | V1 |
| T4 | Refactor agent-team.ts onto shared YAML/config helpers | 1 | feature | medium | extension-refactor-specialist | V1 |
| T5 | Refactor ask-user.ts onto error-result helper | 1 | feature | small | builder-light | V1 |
| T6 | Behavioral tests for helpers + damage-control + Pi runtime smoke | 2-4 | feature | medium | test-specialist | T3, T4, T5 |
| V2 | Validate wave 2 | -- | validation | medium | validation-lead | T3, T4, T5, T6 |
| T7 | Add scaffold (`.ts.example`) and `make check-pi-extensions` target | 2-3 | feature | small | tooling-specialist | V2 |
| V3 | Validate wave 3 | -- | validation | small | validation-light | T7 |

## Execution Waves

### Wave 1 (parallel)

**T1: Add shared extension utilities under `pi/lib/`** [small] -- builder-light

- Description: Create `pi/lib/extension-utils.ts` exporting reusable helpers. Reuse `pi/lib/yaml-helpers.ts` for any YAML needs; do NOT introduce a new YAML loader. Helpers MUST be importable from `pi/extensions/*.ts` via relative path `../lib/extension-utils.js` (matching the existing pattern in `pi/extensions/session-hooks.ts` which imports from `../lib/transcript.js`).
- Files: `pi/lib/extension-utils.ts`. Optionally a barrel re-export in `pi/lib/index.ts` only if the existing extensions already use barrel imports (they do not, so default to direct module imports).
- Required exports:
  - `getAgentDir(ctx): string` -- canonical agent directory resolution.
  - `getMultiTeamDir(ctx): string` -- multi-team directory resolution.
  - `canonicalize(p: string): string` -- safe absolute path normalization (handles `~`, `..`, MSYS2/Windows drive letters; rejects null bytes).
  - `formatToolError(message: string, opts?: { details?: unknown }): ToolResult` -- standard `{ content: [...], isError: true, ... }` shape matching what `pi-coding-agent` expects.
  - `uiNotify(ctx, level, message): void` -- wrapper over `ctx.ui.notify` with consistent capitalization and `[extension-name]` prefix convention.
- Acceptance Criteria:
  1. [ ] Helpers exist under `pi/lib/`, NOT `pi/extensions/`.
     - Verify: `test -f pi/lib/extension-utils.ts && ! test -f pi/extensions/_utils.ts && ! test -f pi/extensions/extension-utils.ts`
     - Pass: file is at `pi/lib/extension-utils.ts` and no auto-discoverable copy exists.
     - Fail: a top-level file in `pi/extensions/` would be auto-loaded by Pi and break startup.
  2. [ ] Module type-checks under the extension TypeScript config.
     - Verify: `python pi/extensions/tsc-check.py`
     - Pass: exits 0 with no TS errors.
  3. [ ] `canonicalize` and `formatToolError` have minimum-viable Vitest tests in `pi/tests/extension-utils.test.ts`.
     - Verify: `cd pi/tests && bun test extension-utils.test.ts`
     - Pass: tests exist and pass; cover at least: `canonicalize` rejects null bytes; `canonicalize` resolves `~`; `formatToolError` produces `isError: true` and a text content block.

**T2: Document conventions and exception format** [small] -- docs-specialist

- Blocked by: T1 (so README can reference real exported names).
- Description: Create `pi/extensions/README.md` documenting extension file headers, default export shape, tool result error shape, UI notification wording, config loading, path handling, and the precise "Documented Exception" format from this plan. Also document why shared helpers live in `pi/lib/` (auto-discovery hazard) so future contributors do not move them.
- Files: `pi/extensions/README.md`.
- Acceptance Criteria:
  1. [ ] README documents helper module location, helper names, and default-export convention.
     - Verify: `grep -E "pi/lib/extension-utils|getAgentDir|formatToolError|uiNotify|export default function" pi/extensions/README.md`
     - Pass: each referenced name appears in the README.
  2. [ ] README contains the verbatim "Documented Exception" three-line format from this plan.
     - Verify: `grep -E "Convention exception:" pi/extensions/README.md && grep -E "Risk:" pi/extensions/README.md && grep -E "Why shared helper is inappropriate:" pi/extensions/README.md`
     - Pass: all three required marker strings present.
  3. [ ] README explains the auto-discovery hazard for top-level `pi/extensions/*.ts` files.
     - Verify: `grep -E "auto-discover|auto-loaded" pi/extensions/README.md`
     - Pass: README warns future contributors not to add non-extension `.ts` files at the top level.

### Wave 1 -- Validation Gate

**V1: Validate wave 1** [small] -- validation-light

- Blocked by: T1, T2.
- Checks:
  1. Run AC verifications for T1 and T2.
  2. `python pi/extensions/tsc-check.py` -- extension TS type-check passes.
  3. `cd pi/tests && bun test extension-utils.test.ts` -- new helper tests pass.
  4. Cross-task integration: every helper name referenced in `pi/extensions/README.md` matches a real export from `pi/lib/extension-utils.ts`.
- On failure: create a fix task, re-validate after fix.

### Wave 2 (parallel)

**T3: Repair `damage-control.ts` `no_delete_paths` and refactor onto helpers** [medium] -- safety-extension-specialist

- Blocked by: V1.
- Description: Add active enforcement of `no_delete_paths` covering the operation set defined in the "`no_delete_paths` Covered Operations" section above. Refactor canonical path/error-result code in `damage-control.ts` to use helpers from `pi/lib/extension-utils.ts`. Do NOT weaken any existing dangerous-command checks.
- Files: `pi/extensions/damage-control.ts`. New tests live in T6.
- Acceptance Criteria:
  1. [ ] `damage-control.ts` exposes a function (e.g. `checkNoDelete(target, command, content?)`) that returns a block decision for the covered operations.
     - Verify (behavioral, in T6): see T6 AC #1.
     - Verify (structural, supplementary only): `grep -nE "checkNoDelete|enforceNoDelete" pi/extensions/damage-control.ts`
     - Pass: exported predicate exists AND T6 behavioral tests pass.
     - Fail: a grep match alone is NOT sufficient; the behavior tests in T6 are the binding criterion.
  2. [ ] Path canonicalization in `damage-control.ts` calls `canonicalize` from the shared helper, or includes a Documented Exception in the file header.
     - Verify: `grep -E "from \"\\.\\./lib/extension-utils" pi/extensions/damage-control.ts || grep -E "Convention exception:" pi/extensions/damage-control.ts`
     - Pass: shared helper imported, or exception block present per the README format.

**T4: Refactor `agent-team.ts` onto shared YAML/config helpers** [medium] -- extension-refactor-specialist

- Blocked by: V1.
- Description: Replace any hand-rolled YAML or config parsing in `agent-team.ts` with calls into `pi/lib/yaml-helpers.ts` (already present) or helpers from `pi/lib/extension-utils.ts`. If a bespoke parser must remain (e.g. it handles a Pi-specific DSL the shared loader cannot represent), include a Documented Exception block.
- Files: `pi/extensions/agent-team.ts`.
- Acceptance Criteria:
  1. [ ] No hand-rolled YAML parser remains, OR a Documented Exception explains why.
     - Verify: behavioral parity test in T6 AC #2 (parses a fixture YAML and produces the same result the original parser produced); plus structural check `grep -E "from \"\\.\\./lib/yaml-helpers|from \"\\.\\./lib/extension-utils|Convention exception:" pi/extensions/agent-team.ts`.
     - Pass: behavioral parity test passes AND one of the two structural patterns matches.
  2. [ ] Agent directory resolution uses `getAgentDir` or `getMultiTeamDir` from the helper, or includes a Documented Exception.
     - Verify: `grep -E "getAgentDir|getMultiTeamDir|Convention exception:" pi/extensions/agent-team.ts`

**T5: Refactor `ask-user.ts` onto error-result helper** [small] -- builder-light

- Blocked by: V1.
- Description: Replace ad-hoc tool-error result shapes in `ask-user.ts` with `formatToolError` from the shared helper.
- Files: `pi/extensions/ask-user.ts`.
- Acceptance Criteria:
  1. [ ] All tool error returns in `ask-user.ts` go through `formatToolError`, or each non-conforming site has a Documented Exception.
     - Verify: behavioral check in T6 AC #3 (an existing or new Vitest case asserts the error shape from a forced error path); plus structural check `grep -nE "formatToolError|isError: true" pi/extensions/ask-user.ts`.

**T6: Behavioral tests for helpers, damage-control, and Pi runtime smoke** [medium] -- test-specialist

- Blocked by: T3, T4, T5.
- Description: Add Vitest tests under `pi/tests/` and a runtime smoke check.
- Files: `pi/tests/damage-control.test.ts` (extend existing), `pi/tests/agent-team.test.ts` (extend existing), `pi/tests/ask-user-pure.test.ts` (extend existing), `pi/tests/extension-utils.test.ts` (from T1, expanded), and a new smoke script `pi/tests/runtime-smoke.test.ts` OR a Makefile target that invokes Pi.
- Acceptance Criteria:
  1. [ ] `damage-control` no-delete tests cover at least one positive case per category from the "Covered Operations" section: `rm`, `Remove-Item`, truncating overwrite (`> <path>`), and an Edit-tool empty-content case. Each test asserts a block decision is produced.
     - Verify: `cd pi/tests && bun test damage-control.test.ts -t no_delete_paths`
     - Pass: at least four behavioral assertions, all passing.
  2. [ ] `agent-team.ts` parser parity: a fixture YAML that exercised the bespoke parser (or a representative subset) is parsed by the new path and produces a result deep-equal to a snapshot captured before refactor.
     - Verify: `cd pi/tests && bun test agent-team.test.ts`
     - Pass: parity test exists and passes against a committed fixture.
  3. [ ] `ask-user.ts` error-shape test asserts `isError: true` and `content[0].type === "text"` for at least one forced error path.
     - Verify: `cd pi/tests && bun test ask-user-pure.test.ts`
  4. [ ] Pi runtime smoke confirms helper module is NOT auto-loaded as an extension.
     - Verify: invoke `pi --no-extensions -e ~/.dotfiles/pi/extensions/damage-control.ts --help` (or equivalent dry-run) with a 30s timeout; assert exit 0 AND that stdout/stderr contains no "extension load failed" or "duplicate hook" warnings; assert that listing auto-discovered extensions (e.g. `pi --list-extensions` if available, otherwise a grep over startup logs) does NOT include `extension-utils`.
     - Pass: smoke command exits 0 with no extension-loader warnings; helper file does not appear in the auto-discovered set.
     - Fail: any auto-discovery of `pi/lib/*` indicates the helper is in the wrong place; revisit T1.

### Wave 2 -- Validation Gate

**V2: Validate wave 2** [medium] -- validation-lead

- Blocked by: T3, T4, T5, T6.
- Checks:
  1. Run AC verifications for T3, T4, T5, T6.
  2. `python pi/extensions/tsc-check.py` -- type-check passes.
  3. `cd pi/tests && bun test` -- full Vitest suite passes (catches regressions in untouched extensions).
  4. `make test-quick` -- repo-level quick checks pass.
  5. Cross-task integration: refactored extensions import only from `pi/lib/*`, never from a top-level `pi/extensions/*` non-extension file.
- On failure: create a fix task, re-validate after fix.

### Wave 3

**T7: Add scaffold and `make check-pi-extensions` target** [small] -- tooling-specialist

- Blocked by: V2.
- Description: Add `pi/extensions/template.extension.ts.example` (NOT `.ts` -- the `.example` suffix prevents auto-discovery) as the canonical scaffold. Add a `make check-pi-extensions` target that runs `python pi/extensions/tsc-check.py` AND `cd pi/tests && bun test` AND the runtime smoke from T6. Document the new target in `pi/extensions/README.md`.
- Files: `pi/extensions/template.extension.ts.example`, `Makefile`, `pi/extensions/README.md`.
- Acceptance Criteria:
  1. [ ] Scaffold is at the `.ts.example` path, not `.ts`.
     - Verify: `test -f pi/extensions/template.extension.ts.example && ! test -f pi/extensions/template.extension.ts`
  2. [ ] `make check-pi-extensions` runs the three steps and exits 0 on a clean checkout.
     - Verify: `make check-pi-extensions`
     - Pass: exit 0; output shows tsc-check, vitest, and runtime smoke all ran.
  3. [ ] README documents `make check-pi-extensions` and references the `.ts.example` scaffold.
     - Verify: `grep -E "make check-pi-extensions|template.extension.ts.example" pi/extensions/README.md`

### Wave 3 -- Validation Gate

**V3: Validate wave 3** [small] -- validation-light

- Blocked by: T7.
- Checks:
  1. Run AC verifications for T7.
  2. `make check-pi-extensions` -- new target works end-to-end.
  3. `make test` -- full repo tests pass.
  4. `make lint` -- no new lint warnings (note: `make lint` does NOT cover TS; TS coverage is via `make check-pi-extensions`).
- On failure: create a fix task, re-validate after fix.

## Dependency Graph

```
Wave 1: T1 -> T2 (T2 blocked by T1 so README can reference real names) -> V1
Wave 2: T3, T4, T5 (parallel, blocked by V1) -> T6 (blocked by T3, T4, T5) -> V2
Wave 3: T7 (blocked by V2) -> V3
```

## Success Criteria

1. [ ] Extension type-checking succeeds end-to-end.
   - Verify: `python pi/extensions/tsc-check.py`
   - Pass: exit 0 with no TS errors.
2. [ ] Vitest suite passes including new behavioral tests.
   - Verify: `cd pi/tests && bun test`
   - Pass: exit 0; tests added in T1 and T6 are present and passing.
3. [ ] Repo regression checks pass.
   - Verify: `make test && make lint`
   - Pass: both exit 0 with no new failures or warnings.
4. [ ] Helpers live under `pi/lib/`, NOT `pi/extensions/`.
   - Verify: `test -f pi/lib/extension-utils.ts && ! find pi/extensions -maxdepth 1 -name "_utils.ts" -o -name "extension-utils.ts" | grep -q .`
   - Pass: helper at canonical location; no auto-discoverable copy.
5. [ ] `damage-control.ts` actively enforces `no_delete_paths`.
   - Verify: behavioral tests under T6 AC #1 (`bun test damage-control.test.ts -t no_delete_paths`) pass.
   - Pass: at least four positive enforcement cases (covering rm, Remove-Item, truncating overwrite, empty Edit) all assert a block decision.
6. [ ] `make check-pi-extensions` exists and runs tsc-check + vitest + runtime smoke.
   - Verify: `make check-pi-extensions`
   - Pass: exit 0.

## Handoff Notes

- Phase 1 deliberately stops after three representative refactors. Phase 2 (deferred) covers the remaining 13+ extensions and may add lint rules if Phase 1 conventions hold up.
- Helper location is non-negotiable: `pi/lib/`, never `pi/extensions/`. The auto-discovery hazard is real (`pi/extensions/transcript-runtime.ts:30-40` documents the workaround that would otherwise be required on every helper).
- "Documented Exception" has a precise three-line format defined above. Reviewers should reject bare TODOs.
- `pi/lib/yaml-helpers.ts` already exists; do not introduce a new YAML loader or `js-yaml`.
- `make lint` only runs ruff + shellcheck. TS validation is `python pi/extensions/tsc-check.py` and the new `make check-pi-extensions` target.
- Some extensions may legitimately need direct `ctx.ui.notify` or custom result rendering. Use the Documented Exception format rather than forcing an inappropriate abstraction.
- Use `/dev/null` in bash redirects on Windows/MSYS2; keep paths with forward slashes in docs.
- `pi/extensions/web-fetch/` is vendored and excluded by `pi/extensions/tsconfig.json`; do not touch.

## Review-1 Findings Resolution

This revision incorporates the review-1 panel findings:

| Finding | Resolution |
|---|---|
| typescript-pro Bug #1: top-level `_utils.ts`/scaffold auto-loaded as extensions | Helpers moved to `pi/lib/extension-utils.ts`. Scaffold uses `.ts.example` suffix. T6 AC #4 adds runtime smoke proof. |
| qa-engineer + reviewer: grep-based ACs prove text presence, not behavior | All safety/refactor ACs now cite a behavioral test in T6 as the binding criterion; greps remain only as supplementary structural checks. |
| reviewer + product-manager: scope too broad | Phase 1 cut to 3 representative refactors (damage-control, agent-team, ask-user). T6/T7 from v1 (provider/session/transcript) deferred to a separate Phase 2 plan. |
| security-reviewer: `no_delete_paths` semantics under-specified | "Covered Operations" section enumerates exact bash, PowerShell, and Edit/Write cases plus explicit out-of-scope items. |
| devops-pro: `make lint` does not validate TS | Plan now states this explicitly and adds `make check-pi-extensions` (T7) as the binding TS validation target. |
| Reviewer hardening: define "documented exception" | "Documented Exception" section defines the three-line format. ACs cite it. |
| typescript-pro: yaml runtime availability assumed | Resolved by reusing existing `pi/lib/yaml-helpers.ts` (already shipped); no new YAML dependency required. |
| Downgraded: replace every `ctx.ui.notify` | `uiNotify` is offered as a helper but direct calls are acceptable with a Documented Exception. |
| Downgraded: add ESLint immediately | Deferred to Phase 2; conventions need to stabilize first. |
