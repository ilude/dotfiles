---
created: 2026-05-18
status: completed
completed: 2026-05-19
---

# Plan: Pi AGENTS Context Loading

## Context & Motivation

The user is unhappy with the current Pi expertise tool system and wants to disable it in favor of durable, inspectable instruction files: user/global skills, project-local `.pi/skills/` skills, and `AGENTS.md` files at project roots and subdirectories. Before this plan, parallel research compared Claude Code, OpenCode, Gemini CLI, Codex CLI, Aider, and Cursor project-instruction behavior.

Key findings from the research artifacts in `.pi/tmp/`:

- Claude Code natively loads `CLAUDE.md`, walks cwd ancestors at startup, and lazy-loads nested/subdirectory `CLAUDE.md` when reading files in those directories. It also supports `@file` imports and an `InstructionsLoaded` observability hook. Artifact: `.pi/tmp/agents-md-findings-claude.md`.
- OpenCode natively uses `AGENTS.md`, applies global + project rules, and its source/test behavior attaches nearby nested instruction files when reading files under those directories. Artifact: `.pi/tmp/agents-md-findings-opencode.md`.
- Gemini CLI defaults to `GEMINI.md`, can be configured for `AGENTS.md`, and supports just-in-time context discovery when tools access files or directories. Artifact: `.pi/tmp/agents-md-findings-other-tuis.md`.
- Codex CLI uses `AGENTS.md`, walks from repo/project root to cwd, and supports `AGENTS.override.md`, but does not provide the same lazy file-path loading behavior as Claude/OpenCode/Gemini.
- A Pi implementation research pass recommended a focused TypeScript extension, `pi/extensions/agents-context.ts`, using `before_agent_start`, `session_start`, and `tool_call` hooks to disable expertise tools and dynamically load nested `AGENTS.md` / `AGENT.md` files based on actual file paths. Artifact: `.pi/tmp/agents-md-research-pi-implementation.md`.

This plan implements the MVP needed to make Pi behave more like Claude/OpenCode/Gemini for local project instructions, while keeping the larger expertise-to-skills migration as an explicit Phase 2 follow-up.

## Constraints

- Platform: Windows 11 through Git Bash/MSYS2 (`MINGW64_NT-10.0-26200`).
- Shell: `/usr/bin/bash` in `C:/Users/mglenn/.dotfiles`.
- Repository: personal/local dotfiles repo; changes are reversible through git.
- Pi TypeScript validation is pnpm-only in this repo. Do not use Bun for Pi TypeScript packages/tests.
- Pi top-level extension files under `pi/extensions/*.ts` are auto-discovered; helper modules should live under `pi/lib/` if needed.
- Existing repo policy prefers deterministic code for routing/status/validation; do not hide missing data behind silent fallbacks.
- The initial implementation must be small enough for one focused `/do-it` session.
- The extension must not duplicate instruction files already loaded by Pi startup context.
- The extension must support global/user instruction lookup for Pi's existing global path (`~/.pi/agent/AGENTS.md`) and the requested compatibility path (`~/.pi/AGENTS.md`) when present.
- The extension must support project and nested instruction lookup for `AGENTS.md`, `AGENT.md`, `.pi/AGENTS.md`, `CLAUDE.md`, and `.claude/CLAUDE.md` relative to cwd ancestors and target file directories.
- The extension must parse bounded Claude-style `@file` imports inside loaded instruction files, resolving relative imports relative to the importing file and enforcing a recursion-depth cap.
- The extension must avoid uncontrolled context growth through deterministic caps and deduplication.
- The extension must surface which instruction files were loaded so the user can inspect behavior.
- Phase 2 must plan the expertise migration with the user, but actual migration/classification of all expertise data is not required for archiving this MVP.

## Risk & Manual Gate Decision

Manual gates are exceptional. Decide based on blast radius and rollback, not generic confidence. Be conservative for work/shared systems and data/resources that cost money; treat personal/local GitHub repos as localized-to-user when changes are reversible and validated.

- **Risk level:** low
- **Blast radius:** personal-local-repo
- **Rollback:** easy via git revert or deleting/disabling `pi/extensions/agents-context.ts`
- **Manual approval before action:** not required
- **Manual validation after action:** not required
- **Decision reason:** This is a local, non-destructive Pi extension and test change. It disables local Pi expertise tools and changes prompt/context behavior only inside the user's local agent setup. Automated unit tests, typecheck, and Pi test commands can verify behavior without requiring a human manual gate. The later content restructuring into skills/AGENTS files is deferred because it is subjective and interactive.

## Alternatives Considered

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| Prompt-only startup append using `before_agent_start` | Very small; fits Pi extension APIs; easy to test | Only handles cwd/startup files and cannot reliably load subdirectory instructions when the model later reads/edits files elsewhere | Rejected: does not meet the Claude/OpenCode/Gemini lazy-loading goal |
| Tool-call-aware `agents-context.ts` extension | Matches observed Claude/OpenCode/Gemini behavior; reacts to actual file paths; can block mutating calls once to ensure newly discovered instructions apply before edits; can disable expertise tools deterministically; can support the user's actual compatibility files and bounded imports | More code and tests than prompt-only approach; requires careful caps/dedupe/status/import handling | **Selected**: best MVP fit for requested behavior |
| Modify Pi core/resource loader | Most native integration with startup context files and built-in header | Larger upstream-style change, harder to validate locally, unnecessary for local dotfiles behavior | Rejected: over-scoped for MVP |
| Keep expertise tools and only add AGENTS loading | Minimizes behavior change | Does not address the user's dissatisfaction with expertise tool workflow | Rejected: disabling expertise tools is part of the requested direction |
| Immediate full migration of all expertise into skills and project AGENTS files | Addresses the bigger desired end state | Too subjective and broad for one implementation session; requires user walkthrough decisions about global vs project vs subdirectory scope | Deferred to Phase 2 interactive migration plan |

## Objective

Create and validate `pi/extensions/agents-context.ts` so Pi:

1. Disables `read_expertise` and `append_expertise` tools during normal sessions, with a `tool_call` safety block if they are invoked anyway.
2. Loads startup/root AGENTS provenance without duplicating files Pi already loaded.
3. Dynamically discovers global, project, and nested instruction files for file-path-bearing tool calls, including `~/.pi/agent/AGENTS.md`, `~/.pi/AGENTS.md`, `AGENTS.md`, `AGENT.md`, `.pi/AGENTS.md`, `CLAUDE.md`, and `.claude/CLAUDE.md`, plus bounded `@file` imports from those files.
4. Blocks the first mutating tool call when newly discovered local instructions need to be applied before mutation, then allows retry after loading.
5. Provides a visible status/command surface to inspect loaded instruction paths.
6. Produces a Phase 2 planning artifact for the later expertise-to-skills/AGENTS migration walkthrough.

## MVP Boundary

The smallest user-visible outcome is: when Pi starts in a project or reads/edits a file under a subdirectory containing supported instruction files (`AGENTS.md`, `AGENT.md`, `.pi/AGENTS.md`, `CLAUDE.md`, or `.claude/CLAUDE.md`), Pi discovers and injects those instructions and their bounded `@file` imports, includes supported global/user AGENTS files when present, shows what it loaded, and prevents a first edit/write from proceeding until the relevant newly discovered instructions are available to the model. Expertise tools are no longer active by default.

This is sufficient because it changes the working context model away from opaque expertise logs toward visible project instruction files, without requiring the subjective migration of all existing expertise data in the same session.

## Explicit Deferrals

Deferred items are not required for archive:

1. Full migration of existing expertise data into global/user skills, repo `.pi/skills/`, project `AGENTS.md`, and subdirectory `AGENTS.md` files.
2. Interactive user walkthrough deciding which expertise entries belong at user/global scope vs project-local scope.
3. `CLAUDE.local.md`, `.claude/rules/*.md`, and `AGENTS.override.md`; the user does not use these and explicitly asked to drop them from the MVP.
4. File watchers or automatic reload when instruction files change after loading.
5. Upstream Pi core changes to make this behavior native instead of extension-provided.
6. Cross-client migration updates for Claude/OpenCode/Codex beyond documenting Phase 2 recommendations.

## Project Context

- **Language**: TypeScript for Pi extensions/tests; Python/shell also present in the dotfiles repo.
- **Marker files detected**: `pyproject.toml`, `package.json` under `pi/extensions`, `package.json` under `pi/tests`, `Makefile`, `pi/extensions/tsconfig.json`, `.gitattributes`, Go modules under `claude/claude-status-go` and `tools/dolos`.
- **Test command**: `cd pi/tests && pnpm install --frozen-lockfile && pnpm test agents-context.test.ts`
- **Lint/typecheck command**: `cd pi/extensions && pnpm install --frozen-lockfile && pnpm run typecheck`
- **Repo-wide validation command**: `make check-pi-extensions` for Pi extension scope; `make check` is strongest repo-wide validation if the executor has required local tools and time.

## Automation Plan

List every operational step required to complete this plan and how it is automated. Prefer scripts, playbooks, wrappers, and repeatable commands over manual steps. Any manual-only step must include why it cannot be safely automated.

| Operation | Command/wrapper | Credentials | Evidence |
|-----------|-----------------|-------------|----------|
| Preflight | `git status --short && test -f pi/extensions/package.json && test -f pi/tests/package.json` | none | command output shows repo state and required package files |
| Install Pi extension deps | `cd pi/extensions && pnpm install --frozen-lockfile` | none | exits 0 |
| Install Pi test deps | `cd pi/tests && pnpm install --frozen-lockfile` | none | exits 0 |
| Task-specific tests | `cd pi/tests && pnpm test agents-context.test.ts` | none | Vitest exits 0 and reports agents-context tests passing |
| Typecheck | `cd pi/extensions && pnpm run typecheck` | none | TypeScript exits 0 |
| Pi scoped validation | `make check-pi-extensions` | none | exits 0 |
| Repo-wide validation | `make check` if local shellcheck/ruff/pytest/Pi deps are available; otherwise document missing environment and run `make check-pi-extensions` plus targeted tests | none | exits 0, or Execution Status documents missing external tools and completed Pi-scope checks |
| Deploy | not applicable | none | no deployment for local extension changes |
| Rollback | `git restore -- pi/extensions/agents-context.ts pi/tests/agents-context.test.ts .specs/agents-context-loading/phase-2-expertise-migration.md` before commit, or `git revert <commit>` after commit | none | working tree returns to prior state |

## Execution Checklist

This checklist is the durable resume ledger for `/do-it`. Every executable task, validation gate, and final completion gate has exactly one matching checkbox. Checked means verified complete; unchecked means pending, in-progress, blocked, or invalidated.

`/do-it` must mark each item `[x]` immediately after that item passes its required verification and before starting any dependent or next sequential step. `/review-it` must preserve checked state, add unchecked items for new executable work, and never mark implementation or validation work complete.

### Wave 1

- [x] T1: Implement agents-context extension core
  - Status: completed
  - Evidence: pi/extensions/agents-context.ts implemented; targeted Vitest passed.
- [x] T2: Add agents-context focused tests
  - Status: completed
  - Evidence: pi/tests/agents-context.test.ts added; targeted Vitest passed.
- [x] V1: Validate wave 1
  - Status: completed
  - Evidence: `cd pi/tests && pnpm test agents-context.test.ts` and `cd pi/extensions && pnpm run typecheck` exited 0; no Bun used.

### Wave 2

- [x] T3: Add inspection command/status and context hygiene refinements
  - Status: completed
  - Evidence: `/agents-context` command/status implemented and tested; display reports use triggerTurn:false.
- [x] T4: Draft Phase 2 expertise migration walkthrough plan
  - Status: completed
  - Evidence: `.specs/agents-context-loading/phase-2-expertise-migration.md` created and grep checks passed.
- [x] V2: Validate wave 2
  - Status: completed
  - Evidence: targeted Vitest, typecheck, and Phase 2 grep checks exited 0.

### Final Gates

- [x] F1: Task-specific verification complete
  - Status: completed
  - Evidence: `cd pi/tests && pnpm test agents-context.test.ts` passed.
- [x] F2: Repo-wide validation complete
  - Status: completed
  - Evidence: `make check-pi-extensions` passed; `make check` attempted and failed in unrelated local uv lint-python environment before project tests (`--no-build` editable install has no binary distribution), allowed by Validation Contract.
- [x] F3: Manual validation not required or completed
  - Status: completed
  - Evidence: Manual validation not required; low-risk local extension with automated validation evidence.
- [x] F4: Deployment validation complete or not required
  - Status: completed
  - Evidence: Deployment validation not required; local Pi extension activates on Pi reload/restart.
- [x] F5: Archive preflight complete
  - Status: completed
  - Evidence: Required gates completed or not applicable; archive path prepared.

## Task Breakdown

| # | Task | Files | Type | Model | Agent | Depends On |
|---|------|-------|------|-------|-------|------------|
| T1 | Implement agents-context extension core | 1-2 files: `pi/extensions/agents-context.ts`, maybe `pi/lib/agents-context.ts` | feature | medium | typescript-dev | -- |
| T2 | Add agents-context focused tests | 1-2 files: `pi/tests/agents-context.test.ts`, maybe `pi/tests/helpers/mock-pi.ts` | feature | medium | validation-lead | -- |
| V1 | Validate wave 1 | -- | validation | medium | qa-engineer | T1, T2 |
| T3 | Add inspection command/status and context hygiene refinements | 1-2 files: `pi/extensions/agents-context.ts`, tests as needed | feature | medium | typescript-dev | V1 |
| T4 | Draft Phase 2 expertise migration walkthrough plan | 1 file: `.specs/agents-context-loading/phase-2-expertise-migration.md` | planning | small | planning-lead | V1 |
| V2 | Validate wave 2 | -- | validation | medium | qa-engineer | T3, T4 |

## Execution Waves

### Wave 1 (parallel)

**T1: Implement agents-context extension core** [medium] -- typescript-dev
- Description: Create `pi/extensions/agents-context.ts` with deterministic discovery/loading behavior. On `session_start`, remove `read_expertise` and `append_expertise` from active tools if present. On `tool_call`, block those tool names if invoked. Track startup context files from `before_agent_start` so already-loaded files are not duplicated. Inspect file-path-bearing tool calls (`read`, `edit`, `write`, `text_edit`, `structured_edit`, and similar local safe-edit tools if present) and resolve target paths relative to `ctx.cwd`. Load supported global/user instruction files (`~/.pi/agent/AGENTS.md` and requested compatibility path `~/.pi/AGENTS.md`) if present and not already loaded. For each target file, walk from repo/session cwd toward the target parent and discover `AGENTS.md`, `AGENT.md`, `.pi/AGENTS.md`, `CLAUDE.md`, and `.claude/CLAUDE.md` in deterministic root-to-leaf order. Parse bounded `@file` imports from loaded instruction files, resolving relative paths from the importing file and enforcing depth/cycle/path-safety caps. Deduplicate by canonical path. Apply conservative byte/file caps with explicit notices when caps are hit.
- Files: `pi/extensions/agents-context.ts`; optionally `pi/lib/agents-context.ts` if pure helpers would otherwise make the extension file too large.
- Acceptance Criteria:
  1. [ ] Expertise tools are removed from active tools and blocked if directly requested.
     - Verify: `cd pi/tests && pnpm test agents-context.test.ts`
     - Pass: tests assert `read_expertise` and `append_expertise` are filtered/blocked.
     - Fail: expertise tools remain active or tool_call does not block direct invocation; inspect hook registration and active-tool filtering.
  2. [ ] Global/user, project, and nested instruction discovery follows deterministic order and skips files already loaded by startup context.
     - Verify: `cd pi/tests && pnpm test agents-context.test.ts`
     - Pass: fixture tests cover `~/.pi/agent/AGENTS.md`, `~/.pi/AGENTS.md`, root/nested `AGENTS.md`, `AGENT.md`, `.pi/AGENTS.md`, `CLAUDE.md`, `.claude/CLAUDE.md`, and bounded `@file` imports, with expected ordered paths and no duplicates.
     - Fail: order is unstable, requested locations are missing, duplicates appear, or startup context files are reinjected.
  3. [ ] Newly discovered instructions before a mutating operation block once, inject/surface instructions, and allow retry.
     - Verify: `cd pi/tests && pnpm test agents-context.test.ts`
     - Pass: first edit/write/text_edit call with new instructions is blocked with a clear reason; repeated call after load is allowed.
     - Fail: mutation proceeds before instructions load, or retry remains blocked indefinitely.

**T2: Add agents-context focused tests** [medium] -- validation-lead
- Description: Add Vitest coverage for pure discovery helpers and extension hook behavior. Tests should use temporary directories/fixtures and existing mock Pi patterns rather than relying on live Pi sessions. Cover path normalization on Windows-style and POSIX-style paths where feasible, global/user AGENTS lookup, `AGENTS.md` / `AGENT.md` / `.pi/AGENTS.md` / `CLAUDE.md` / `.claude/CLAUDE.md` discovery, bounded `@file` import parsing, startup context dedupe, caps, read vs mutating tool behavior, status/command registration if implemented in T1, and expertise-tool disabling.
- Files: `pi/tests/agents-context.test.ts`; optionally `pi/tests/helpers/mock-pi.ts` if current mock surfaces are insufficient.
- Acceptance Criteria:
  1. [ ] Tests cover the MVP behavior without network, git, or live LLM dependencies.
     - Verify: `cd pi/tests && pnpm test agents-context.test.ts`
     - Pass: targeted test file exits 0 and failures would catch missing expertise disabling, nested discovery, dedupe, or mutating-call block-once behavior.
     - Fail: tests require live Pi/LLM state or only check exported function existence.
  2. [ ] Test fixtures explicitly include global/user, root, and nested instruction files.
     - Verify: inspect `pi/tests/agents-context.test.ts`
     - Pass: tests create or mock at least `~/.pi/agent/AGENTS.md`, `~/.pi/AGENTS.md`, root/nested `AGENTS.md`, `AGENT.md`, `.pi/AGENTS.md`, `CLAUDE.md`, `.claude/CLAUDE.md`, and `@file` import scenarios.
     - Fail: tests do not exercise global/user compatibility or nested/subdirectory behavior.

### Wave 1 -- Validation Gate

**V1: Validate wave 1** [medium] -- qa-engineer
- Blocked by: T1, T2
- Checks:
  1. Run `cd pi/tests && pnpm install --frozen-lockfile && pnpm test agents-context.test.ts`.
  2. Run `cd pi/extensions && pnpm install --frozen-lockfile && pnpm run typecheck`.
  3. Confirm implementation does not place helper-only top-level files under `pi/extensions/` without a valid default extension export.
  4. Confirm no Bun commands were used for Pi TypeScript validation.
- On failure: create/fix a task, rerun affected checks, then rerun V1.

### Wave 2

**T3: Add inspection command/status and context hygiene refinements** [medium] -- typescript-dev
- Blocked by: V1
- Description: Add a visible Pi status/command surface, such as `/agents-context`, that reports loaded instruction paths, byte counts, skipped/truncated files, and whether expertise tools are disabled. Ensure display-only messages are filtered from future LLM context if using custom UI messages, while actual instruction injections remain available to the model. Keep output concise and deterministic.
- Files: `pi/extensions/agents-context.ts`; `pi/tests/agents-context.test.ts` as needed.
- Acceptance Criteria:
  1. [ ] The user can inspect which instruction files were loaded and why.
     - Verify: `cd pi/tests && pnpm test agents-context.test.ts`
     - Pass: tests assert command/status registration or handler output includes loaded paths and expertise-disabled state.
     - Fail: there is no way to inspect loaded paths, or command output omits critical state.
  2. [ ] Context hygiene prevents display-only status/report messages from becoming repeated prompt baggage.
     - Verify: `cd pi/tests && pnpm test agents-context.test.ts`
     - Pass: tests or code review show UI/status/report entries are excluded from LLM context where applicable; instruction payloads are injected only once per loaded file/version.
     - Fail: status/report messages are repeatedly included in context, or instruction payloads are duplicated.

**T4: Draft Phase 2 expertise migration walkthrough plan** [small] -- planning-lead
- Blocked by: V1
- Description: Create a follow-up planning artifact for the user's requested second phase: review existing expertise data together and decide what becomes user/global skills, repo `.pi/skills/` skills, project `AGENTS.md`, and subdirectory `AGENTS.md`. This artifact must not perform the migration. It should define an inventory process, classification rubric, proposed destinations, review questions for the user, and safe migration/rollback rules.
- Files: `.specs/agents-context-loading/phase-2-expertise-migration.md`
- Acceptance Criteria:
  1. [ ] The Phase 2 artifact separates categories clearly: user/global skill, project `.pi/skills/` skill, project root `AGENTS.md`, subdirectory `AGENTS.md`, archive/delete/ignore.
     - Verify: `test -f .specs/agents-context-loading/phase-2-expertise-migration.md && grep -E "user/global|\.pi/skills|AGENTS.md|subdirectory" .specs/agents-context-loading/phase-2-expertise-migration.md`
     - Pass: command finds the required categories.
     - Fail: artifact is missing or does not provide a usable classification rubric.
  2. [ ] The artifact identifies current expertise sources without requiring immediate migration.
     - Verify: `grep -E "expertise-log|mental-model|read_expertise" .specs/agents-context-loading/phase-2-expertise-migration.md`
     - Pass: artifact names the expertise data sources and states migration is deferred.
     - Fail: artifact implies automatic deletion/migration during this MVP.

### Wave 2 -- Validation Gate

**V2: Validate wave 2** [medium] -- qa-engineer
- Blocked by: T3, T4
- Checks:
  1. Run `cd pi/tests && pnpm test agents-context.test.ts`.
  2. Run `cd pi/extensions && pnpm run typecheck`.
  3. Run the T4 grep checks for the Phase 2 artifact.
  4. Confirm `/agents-context` or equivalent inspection surface is documented in tests or command metadata.
- On failure: create/fix a task, rerun affected checks, then rerun V2.

## Dependency Graph

```
Wave 1: T1, T2 (parallel) → V1
Wave 2: T3, T4 (parallel after V1) → V2
Final: V2 → F1 → F2 → F3 → F4 → F5
```

## Success Criteria

1. [ ] Pi extension MVP works end-to-end in automated tests.
   - Verify: `cd pi/tests && pnpm test agents-context.test.ts`
   - Pass: tests demonstrate expertise tools disabled, global/user AGENTS lookup, nested AGENTS/AGENT/.pi/AGENTS/CLAUDE/.claude/CLAUDE discovery, bounded `@file` imports, startup dedupe, mutating-call block-once behavior, and inspection output.
2. [ ] Pi extension TypeScript compiles.
   - Verify: `cd pi/extensions && pnpm run typecheck`
   - Pass: exits 0.
3. [ ] Pi scoped validation passes.
   - Verify: `make check-pi-extensions`
   - Pass: exits 0.
4. [ ] Phase 2 is planned but not executed.
   - Verify: `test -f .specs/agents-context-loading/phase-2-expertise-migration.md && grep -E "Deferred|not perform the migration|migration is deferred" .specs/agents-context-loading/phase-2-expertise-migration.md`
   - Pass: artifact exists and clearly states actual migration is deferred.

## Validation Contract

`/do-it` must satisfy this contract before reporting the plan complete or archiving it.

### Automation completeness

- Required: yes
- `/do-it` must be able to run all agent-runnable validation/deployment steps through documented commands, scripts, playbooks, or wrappers.
- If credentials are required, the plan must define a gitignored/local credential path or an explicit user-approved auth mode.
- Manual-only steps must be justified and include exact user actions plus expected success signals.

### Required automated validation

1. [ ] Run the strongest Pi-specific validation command for this project.
   - Command: `make check-pi-extensions`
   - Pass: exits 0 with Pi extension typecheck and Vitest suite passing
   - Fail: do not archive; update `## Execution Status` with the failing command and next fix

2. [ ] Run task-specific verification from every acceptance criterion above.
   - Command: see each task's `Verify:` command
   - Pass: every acceptance criterion passes as written
   - Fail: create/fix a task, rerun affected checks, then rerun repo-wide validation

3. [ ] Attempt strongest repo-wide validation if environment supports it.
   - Command: `make check`
   - Pass: exits 0
   - Fail: if failure is unrelated missing local tooling or pre-existing broad repo failure, document exact failure and still require `make check-pi-extensions`; if failure is caused by this plan, fix before archive

Do not require exact test function names, exhaustive evidence files, or audit-grade traceability unless those tests/scripts already exist or the user explicitly requested that rigor.

### Manual validation

Manual validation is exceptional. It should be `Required: no` unless the plan includes destructive operations, data-loss risk, irreversible external side effects, shared/work production impact, paid/billing/data-costing resources, secret exposure risk, hardware/physical checks, or genuinely subjective user judgment that cannot be replaced by safe automation. Scale matters: personal/local GitHub repos, local/home-lab, and new-backed-up systems are usually agent-runnable; work/shared/multi-user production systems and money/data-costing resources may need user gates when other people, spend, quota, or costly recovery could be affected.

- Required: no
- Justification: Automated validation is sufficient for the non-destructive extension behavior. The subjective expertise restructuring is deferred and will require user walkthrough later, but it is not part of this archive gate.
- Steps:
  1. None.

If manual validation is required and not confirmed passed, `/do-it` must classify the result as `implemented-awaiting-manual-validation`, update `## Execution Status`, and must not archive the plan. If manual validation is not required, `/do-it` may mark the manual gate complete after recording why automated evidence is sufficient.

### Deployment validation

- Required: no
- Procedure: None. This is a local dotfiles/Pi extension change. Normal use begins after Pi reload/restart or extension reload according to existing Pi workflow.

If deployment is required and skipped, cancelled, or fails, `/do-it` must not archive the plan.

### Archive rule

`/do-it` may archive this plan only after all required automated validation, task-specific verification, exceptional manual validation (if required), deployment validation, and repo-wide validation pass. Do not require manual validation merely to increase confidence in non-destructive behavior that automated checks already cover, especially for local/home-lab/new-backed-up systems.

## Execution Status

- Completion classification: completed-and-archived
- Date: 2026-05-19
- Last completed wave/gate: Final gate F5 archive preflight
- Implemented: agents-context Pi extension, focused Vitest coverage, and Phase 2 expertise migration walkthrough artifact
- Validation run:
  - `cd pi/tests && pnpm test agents-context.test.ts` -- passed
  - `cd pi/extensions && pnpm run typecheck` -- passed
  - Phase 2 grep checks -- passed
  - `make check-pi-extensions` -- passed
  - `make check` -- attempted; failed at `uv run ruff check` because local uv editable install is marked `--no-build` and has no binary distribution before repo tests ran. This was classified as unrelated local environment/broad repo validation infrastructure per the Validation Contract; Pi scoped validation passed.
- Manual validation: not required
- Deployment validation: not required
- Archive: completed after checklist gates passed

## Handoff Notes

- Use pnpm for all Pi TypeScript validation: `cd pi/extensions && pnpm install --frozen-lockfile && pnpm run typecheck`; `cd pi/tests && pnpm install --frozen-lockfile && pnpm test agents-context.test.ts`.
- Do not use Bun for Pi extension or Vitest validation in this repo.
- The researched implementation recommendation is Option B from `.pi/tmp/agents-md-research-pi-implementation.md`: a tool-call-aware extension.
- Research artifacts are currently under `.pi/tmp/`; if unavailable in a fresh checkout, the plan contains the relevant conclusions.
- Keep the extension self-contained unless helper code is clearly needed. If helper code is needed, put it under `pi/lib/`, not as another top-level `pi/extensions/*.ts` file without a default extension export.
- Be conservative with context caps. If an instruction file is too large or total cap is exceeded, surface an explicit skipped/truncated notice rather than silently ignoring it.
- Phase 2 should be an interactive classification/migration workflow with the user; do not delete or rewrite expertise logs during this MVP.
