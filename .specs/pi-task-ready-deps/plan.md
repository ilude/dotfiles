---
created: 2026-05-11
status: draft
completed:
---

# Plan: Pi Task Ready Dependency UX

## Context & Motivation

The Pi task control-plane MVP now persists tasks with lifecycle states and dependency fields (`blockedBy` / `blocks`), but the visible `/tasks` experience does not yet feel like Claude Code-style dependency-tracked tasks. The current foundation stores dependencies, maintains reverse edges, rejects simple cycles, and shows `blockedBy` / `blocks` in task detail, but list output does not clearly separate ready work from dependency-waiting work and `/tasks start` does not enforce unmet dependencies.

This plan implements the small "Option 1" last mile: make dependencies visible, queryable, and behaviorally enforced without building a full workflow engine. After this plan, follow-up notes document how a future dependency tree renderer (Option 2) and workflow-engine-lite behavior (Option 3) could layer on top of the same primitives and broader Pi control-plane ecosystem.

## Constraints

- Platform: Windows/MSYS2 Git Bash detected (`MINGW64_NT-10.0-26200`).
- Shell: bash available; PowerShell available if Windows-native checks are needed.
- Project markers: `pyproject.toml`, `Makefile`, `.gitattributes`.
- Pi TypeScript validation is pnpm-only:
  - `cd pi/extensions && pnpm install --frozen-lockfile && pnpm run typecheck`
  - `cd pi/tests && pnpm install --frozen-lockfile && pnpm run test`
- Do not use Bun/npm for Pi TypeScript packages/tests.
- Do not create helper `.ts` files at top level of `pi/extensions/`; reusable helpers belong under `pi/lib/` or non-auto-discovered subdirectories.
- Preserve existing task-registry behavior and the MVP non-goal: do not add task auto-execution, background scheduling, or prompt-output injection.
- Keep changes reversible and local to the personal dotfiles/Pi repo.

## Risk & Manual Gate Decision

Manual gates are exceptional. Decide based on blast radius and rollback, not generic confidence. Be conservative for work/shared systems and data/resources that cost money; treat personal/local GitHub repos as localized-to-user when changes are reversible and validated.

- **Risk level:** low
- **Blast radius:** personal-local-repo
- **Rollback:** easy
- **Manual approval before action:** not required
- **Manual validation after action:** not required
- **Decision reason:** This is a local code/test/docs change in a personal dotfiles repo. It is non-destructive, reversible with git, and fully verifiable with pnpm tests/typecheck plus `make check`.

## Alternatives Considered

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| Option 1: ready/blocked queries plus start enforcement | Small diff, immediately useful, makes stored dependencies visible and enforceable, low risk | Does not render nested dependency trees or perform auto-cascade | **Selected** for this plan |
| Option 2: dependency tree renderer | More Claude-like visual hierarchy and topological display | More renderer complexity; better after ready/waiting semantics are stable | Rejected for now; document as follow-up |
| Option 3: workflow engine-lite | Could auto-unblock/cascade and eventually coordinate execution | Overbuilt for current MVP and explicitly close to current non-goals | Rejected for now; document as future ecosystem layer |

## Objective

Add a minimal Claude-like dependency-tracked task experience:

1. Derive whether pending tasks are `ready` or `waiting` based on blocker completion, using pure snapshot-based helpers.
2. Add `/tasks ready` and `/tasks blocked` query commands.
3. Update compact/full rendering to show dependency readiness and blocker IDs deterministically.
4. Prevent `/tasks start <id>` when dependencies are unmet, with an actionable, redacted message.
5. Add tests proving registered command behavior, ready/waiting behavior, start enforcement, non-mutation, tombstone handling, and deterministic output.
6. Document how Options 2 and 3 could build on this system later without expanding this implementation scope.

Operator-facing vocabulary:

| Term | Meaning | Display/command policy |
|------|---------|------------------------|
| `ready` | Pending task with no unmet blockers | Included in `/tasks ready`; can be started |
| `waiting` | Pending task with unmet blockers | Included in `/tasks blocked`; cannot be started until blockers unblock |
| `blocked` | Explicit lifecycle state for manually blocked/waiting tasks | Included in `/tasks blocked`; if blockers are satisfied it remains blocked until reopened/started according to existing transition rules |
| `unmet blocker` | Blocker that is missing, tombstoned, pending, running, blocked, failed, or cancelled | Render with blocker id, state/status, redacted summary when available, and recovery guidance |

## Project Context

- **Language**: TypeScript for Pi extensions/tests; Python and shell also exist in repo.
- **Test command**: focused Pi tests via `cd pi/tests && pnpm test <files>`; full Pi suite via `cd pi/tests && pnpm run test`; repo-wide via `make check`.
- **Lint command**: repo aggregate `make check`; TypeScript formatting/lint quality gates are exercised by Pi tests and existing project tooling.

## Automation Plan

| Operation | Command/wrapper | Credentials | Evidence |
|-----------|-----------------|-------------|----------|
| Preflight | `git status --short && grep -RIn "blockedBy\|blocks\|ready\|blocked" pi/lib pi/extensions pi/tests --exclude-dir=node_modules || true` | none | `.specs/pi-task-ready-deps/evidence/P0-preflight.md` |
| Implement | Edit `pi/lib/task-registry.ts`, `pi/lib/task-renderer.ts`, `pi/extensions/tasks.ts`, task tests, and docs if needed | none | task evidence files |
| Focused verify | `cd pi/tests && pnpm install --frozen-lockfile && pnpm test task-registry.test.ts tasks.test.ts task-dependencies.test.ts task-renderer.test.ts task-tools.test.ts task-security.test.ts` | none | `.specs/pi-task-ready-deps/evidence/V1-focused-validation.md` |
| Pi verify | `cd pi/extensions && pnpm install --frozen-lockfile && pnpm run typecheck` and `cd ../tests && pnpm install --frozen-lockfile && pnpm run test` | none | `.specs/pi-task-ready-deps/evidence/V2-pi-validation.md` |
| Repo verify | `make check` | none | `.specs/pi-task-ready-deps/evidence/V3-repo-validation.md` |
| Deploy | not applicable | none | none |
| Rollback | `git restore -- pi/lib/task-registry.ts pi/lib/task-renderer.ts pi/extensions/tasks.ts pi/tests pi/README.md .specs/pi-task-ready-deps/plan.md` or normal git revert after commit | none | git status before/after if needed |

## Execution Checklist

This checklist is the durable resume ledger for `/do-it`. Every executable task, validation gate, and final completion gate has exactly one matching checkbox. Checked means verified complete; unchecked means pending, in-progress, blocked, or invalidated.

`/do-it` must mark each item `[x]` immediately after that item passes its required verification and before starting any dependent or next sequential step. `/review-it` must preserve checked state, add unchecked items for new executable work, and never mark implementation or validation work complete.

### Wave 0

- [ ] P0: Preflight dependency UX inventory
  - Status: pending
  - Evidence: --
- [ ] V0: Validate preflight findings
  - Status: pending
  - Evidence: --

### Wave 1

- [ ] T1: Add dependency readiness helpers
  - Status: pending
  - Evidence: --
- [ ] T2: Upgrade task renderer for ready/waiting dependency display
  - Status: pending
  - Evidence: --
- [ ] V1: Validate dependency helper and renderer behavior
  - Status: pending
  - Evidence: --

### Wave 2

- [ ] T3: Add `/tasks ready` and `/tasks blocked` commands
  - Status: pending
  - Evidence: --
- [ ] T4: Enforce unmet dependencies on `/tasks start`
  - Status: pending
  - Evidence: --
- [ ] V2: Validate command behavior
  - Status: pending
  - Evidence: --

### Wave 3

- [ ] T5: Document Option 2 and Option 3 follow-up architecture
  - Status: pending
  - Evidence: --
- [ ] V3: Validate docs and integration scope
  - Status: pending
  - Evidence: --

### Final Gates

- [ ] F1: Task-specific verification complete
  - Status: pending
  - Evidence: --
- [ ] F2: Repo-wide validation complete
  - Status: pending
  - Evidence: --
- [ ] F3: Manual validation not required
  - Status: pending
  - Evidence: --
- [ ] F4: Deployment validation not required
  - Status: pending
  - Evidence: --
- [ ] F5: Archive preflight complete
  - Status: pending
  - Evidence: --

## Task Breakdown

| # | Task | Files | Type | Model | Agent | Depends On |
|---|------|-------|------|-------|-------|------------|
| P0 | Preflight dependency UX inventory | evidence only | mechanical | small | typescript-pro | -- |
| V0 | Validate preflight findings | evidence only | validation | small | qa-engineer | P0 |
| T1 | Add dependency readiness helpers | 2-3 | feature | medium | typescript-pro | V0 |
| T2 | Upgrade task renderer for ready/waiting dependency display | 2-3 | feature | medium | typescript-pro | V0 |
| V1 | Validate dependency helper and renderer behavior | tests/evidence | validation | medium | qa-engineer | T1, T2 |
| T3 | Add `/tasks ready` and `/tasks blocked` commands | 2-3 | feature | medium | typescript-pro | V1 |
| T4 | Enforce unmet dependencies on `/tasks start` | 2-3 | feature | medium | typescript-pro | V1 |
| V2 | Validate command behavior | tests/evidence | validation | medium | qa-engineer | T3, T4 |
| T5 | Document Option 2 and Option 3 follow-up architecture | 1-2 | documentation | small | reviewer | V2 |
| V3 | Validate docs and integration scope | evidence only | validation | small | qa-engineer | T5 |

## Execution Waves

### Wave 0: Preflight

**P0: Preflight dependency UX inventory** [small] -- typescript-pro
- Description: Capture current dependency-related implementation before editing.
- Files: `.specs/pi-task-ready-deps/evidence/P0-preflight.md`
- Acceptance Criteria:
  1. [ ] Current dependency functions, renderer behavior, command support, and tests are inventoried.
     - Verify: `mkdir -p .specs/pi-task-ready-deps/evidence && { git status --short; grep -RIn "blockedBy\|blocks\|ready\|blocked" pi/lib pi/extensions pi/tests --exclude-dir=node_modules || true; } 2>&1 | tee .specs/pi-task-ready-deps/evidence/P0-preflight.md; exit ${PIPESTATUS[0]}`
     - Pass: evidence file exists and identifies relevant files without modifying code.
     - Fail: if command fails, record stderr and inspect missing paths before continuing.

### Wave 0 -- Validation Gate

**V0: Validate preflight findings** [small] -- qa-engineer
- Blocked by: P0
- Evidence command:
  ```bash
  {
    set -e
    echo '# V0 preflight validation'
    test -s .specs/pi-task-ready-deps/evidence/P0-preflight.md
    grep -q 'pi/lib/task-registry.ts\|task-registry' .specs/pi-task-ready-deps/evidence/P0-preflight.md
    grep -q 'pi/lib/task-renderer.ts\|task-renderer' .specs/pi-task-ready-deps/evidence/P0-preflight.md
    grep -q 'pi/extensions/tasks.ts\|extensions/tasks' .specs/pi-task-ready-deps/evidence/P0-preflight.md
    echo 'P0 evidence references task registry, renderer, and tasks extension.'
    echo 'exit=0'
  } 2>&1 | tee .specs/pi-task-ready-deps/evidence/V0-preflight-validation.md
  exit ${PIPESTATUS[0]}
  ```
- Pass: command exits 0 and evidence file exists.
- On failure: rerun P0 with corrected paths and update evidence.

### Wave 1: Dependency semantics and renderer

**T1: Add dependency readiness helpers** [medium] -- typescript-pro
- Blocked by: V0
- Description: Add pure helper functions that classify task dependency status without mutating records or reading task files. Required API shape must accept explicit dependency context, for example `getUnmetBlockers(task: TaskRecordV1, tasksById: ReadonlyMap<string, TaskRecordV1>)`, `isTaskReady(task, tasksById)`, and/or `partitionReadyTasks(tasks: readonly TaskRecordV1[])`. Callers must build the map from one `listTasks({ includeTombstones: true })` snapshot. A pending task is ready when it has no blockers or all `blockedBy` tasks are terminal-success. Treat `completed` and `skipped` as dependency-unblocking; treat missing, pending, running, blocked, failed, cancelled, and tombstoned blockers as unmet. Unmet blocker IDs and blocked dependent IDs must be sorted by full task ID lexicographically before shortening/rendering.
- Files: `pi/lib/task-registry.ts`, `pi/tests/task-dependencies.test.ts`, possibly `pi/tests/task-registry.test.ts`
- Acceptance Criteria:
  1. [ ] Helpers classify ready vs waiting deterministically from an explicit snapshot.
     - Verify: `cd pi/tests && pnpm test task-dependencies.test.ts task-registry.test.ts`
     - Pass: tests cover no blockers, completed blocker, skipped blocker, pending/running/blocked/failed/cancelled/missing/tombstoned blocker, explicit blocked-state tasks, and non-sorted dependency IDs that render sorted deterministically.
     - Fail: missing/tombstoned blockers appear ready, failed/cancelled blockers unblock, output order changes nondeterministically, or helper signatures hide filesystem reads.
  2. [ ] Helpers are pure and do not read or write task files.
     - Verify: targeted tests call helper APIs with in-memory records/maps and snapshot a temp task directory before and after helper calls.
     - Pass: no filesystem reads/writes, no timestamp changes, no reverse-edge changes, no file count/content changes.
     - Fail: helper calls `getTask`, `listTasks`, updates timestamps, reverse edges, or files.

**T2: Upgrade task renderer for ready/waiting dependency display** [medium] -- typescript-pro
- Blocked by: V0
- Description: Update compact/full task rendering so dependency state is visible. Compact mode should prioritize active states but identify `ready` pending tasks separately from dependency-waiting tasks. Full/detail output should show unmet blockers and blocked dependents with short deterministic IDs. All output that includes task summaries, blocker context, reasons, or recovery guidance must use the existing task redaction path. Hidden mode behavior and recovery text must remain unchanged.
- Files: `pi/lib/task-renderer.ts`, `pi/tests/task-renderer.test.ts`, possibly `pi/tests/tasks.test.ts`
- Acceptance Criteria:
  1. [ ] Compact output contains clear ready/waiting labels using the vocabulary table.
     - Verify: `cd pi/tests && pnpm test task-renderer.test.ts tasks.test.ts`
     - Pass: expected output distinguishes `ready` pending tasks from `waiting` dependency-blocked pending tasks and explicit `blocked` tasks; terminal summary remains deterministic.
     - Fail: pending tasks with unmet blockers appear indistinguishable from ready pending tasks or labels conflict with the vocabulary table.
  2. [ ] Detail output shows dependency IDs deterministically and redacted.
     - Verify: `cd pi/tests && pnpm test task-renderer.test.ts task-security.test.ts`
     - Pass: blocker/dependent IDs appear sorted by full ID before shortening; synthetic secret sentinels in summaries/reasons/context are redacted; skipped blockers show `skipped` explicitly when they unblock a task.
     - Fail: unstable ordering, raw sentinel output, or skipped-as-unblocking is invisible to operators.

### Wave 1 -- Validation Gate

**V1: Validate dependency helper and renderer behavior** [medium] -- qa-engineer
- Blocked by: T1, T2
- Evidence command:
  ```bash
  {
    set -e
    echo '# V1 dependency helper and renderer validation'
    echo 'cwd: pi/tests'
    echo 'command: pnpm install --frozen-lockfile && pnpm test task-registry.test.ts tasks.test.ts task-dependencies.test.ts task-renderer.test.ts task-tools.test.ts task-security.test.ts'
    cd pi/tests && pnpm install --frozen-lockfile && pnpm test task-registry.test.ts tasks.test.ts task-dependencies.test.ts task-renderer.test.ts task-tools.test.ts task-security.test.ts
    echo "exit=$?"
  } 2>&1 | tee .specs/pi-task-ready-deps/evidence/V1-focused-validation.md
  exit ${PIPESTATUS[0]}
  ```
- Pass: command exits 0 and evidence includes helper/renderer/security tests.
- On failure: fix helper/renderer tests or implementation, then rerun V1.

### Wave 2: Slash-command behavior

**T3: Add `/tasks ready` and `/tasks blocked` commands** [medium] -- typescript-pro
- Blocked by: V1
- Description: Extend `/tasks` parsing/help to support `ready` and `blocked` views. `ready` lists pending tasks with no unmet blockers. `blocked` lists dependency-waiting pending tasks plus explicit `blocked` lifecycle tasks. Existing `/tasks`, `/tasks list`, `/tasks list --all`, and hidden-mode recovery behavior must remain compatible. Tests must invoke the registered command path by loading the extension with a mocked `ExtensionAPI`, capturing `pi.registerCommand("tasks")`, and invoking the handler with exact strings.
- Files: `pi/extensions/tasks.ts`, `pi/tests/tasks.test.ts`, possibly `pi/tests/task-tools.test.ts`
- Acceptance Criteria:
  1. [ ] `/tasks ready` returns only dependency-ready work through the registered command handler.
     - Verify: `cd pi/tests && pnpm test tasks.test.ts task-tools.test.ts`
     - Pass: mocked ExtensionAPI captures the registered `tasks` handler; invoking `ready` emits output with a ready task and excludes pending tasks with unmet blockers.
     - Fail: tests only call parser/helpers, waiting tasks appear in ready output, or the command is not reachable through registration.
  2. [ ] `/tasks blocked` returns actionable waiting/blocker context through the registered command handler.
     - Verify: `cd pi/tests && pnpm test tasks.test.ts`
     - Pass: invoking `blocked` emits output with sorted unmet blocker IDs, blocker state/status, redacted blocker summary when available, and recovery guidance for missing/tombstoned blockers.
     - Fail: blocked output lacks actionable blocker information, leaks sentinel secrets, or is not tested through the registered handler.
  3. [ ] Help documents ready/blocked commands, examples, and retry remains non-executing.
     - Verify: `cd pi/tests && pnpm test tasks.test.ts`
     - Pass: help text mentions `ready`, `blocked`, retry/reopen non-execution, and examples for “what can I work on now?” and “why can’t this start?”.
     - Fail: help omits new commands/examples or regresses retry warning.

**T4: Enforce unmet dependencies on `/tasks start`** [medium] -- typescript-pro
- Blocked by: V1
- Description: Prevent starting a task when its dependencies are unmet. The rejection must be non-mutating, redacted, and actionable. Required message template: `Cannot start <task-id>: waiting on <blocker-id> (<state/status>) <redacted-summary>. Next: /tasks show <blocker-id> or /tasks blocked`. For missing/tombstoned blockers, identify them distinctly and include a safe recovery hint such as updating/removing the stale dependency if a command exists, or documenting the limitation if no dependency-edit command exists. Starting a ready task should preserve existing transition behavior.
- Files: `pi/extensions/tasks.ts`, `pi/lib/task-registry.ts` if helper plumbing is needed, `pi/tests/tasks.test.ts`, `pi/tests/task-dependencies.test.ts`
- Acceptance Criteria:
  1. [ ] Starting a waiting task is rejected without any persistence mutation through the registered command handler.
     - Verify: `cd pi/tests && pnpm test tasks.test.ts task-dependencies.test.ts`
     - Pass: mocked ExtensionAPI invokes `start <id>`; output follows the actionable template; full persisted task records and task directory contents are identical before/after rejection, including timestamps, reverse edges, and file count.
     - Fail: task transitions to `running`, timestamps/edges/files change, output lacks next-step guidance, or tests bypass the registered command handler.
  2. [ ] Starting a ready task still works.
     - Verify: `cd pi/tests && pnpm test tasks.test.ts`
     - Pass: ready task transitions to `running` through the registered handler and existing notifications remain compatible.
     - Fail: ready tasks are rejected or notification contract changes unexpectedly.
  3. [ ] Missing and tombstoned blockers are actionable and redacted.
     - Verify: `cd pi/tests && pnpm test tasks.test.ts task-dependencies.test.ts task-security.test.ts`
     - Pass: missing/tombstoned blocker tests prove they remain unmet, are rendered distinctly, include recovery guidance, and leak no raw synthetic secret sentinels.
     - Fail: missing/tombstoned blockers silently disappear, unblock tasks, or leak raw sentinel content.

### Wave 2 -- Validation Gate

**V2: Validate command behavior** [medium] -- qa-engineer
- Blocked by: T3, T4
- Evidence command:
  ```bash
  {
    set -e
    echo '# V2 command behavior validation'
    echo 'cwd: pi/tests'
    echo 'command: pnpm install --frozen-lockfile && pnpm test task-registry.test.ts tasks.test.ts task-dependencies.test.ts task-renderer.test.ts task-tools.test.ts task-security.test.ts'
    cd pi/tests && pnpm install --frozen-lockfile && pnpm test task-registry.test.ts tasks.test.ts task-dependencies.test.ts task-renderer.test.ts task-tools.test.ts task-security.test.ts
    echo "tests_exit=$?"
    cd ../extensions
    echo 'cwd: pi/extensions'
    echo 'command: pnpm install --frozen-lockfile && pnpm run typecheck'
    pnpm install --frozen-lockfile && pnpm run typecheck
    echo "typecheck_exit=$?"
  } 2>&1 | tee .specs/pi-task-ready-deps/evidence/V2-command-validation.md
  exit ${PIPESTATUS[0]}
  ```
- Pass: both commands exit 0 and evidence includes registered-handler ready/blocked/start behavior from tests.
- On failure: fix command parser/handler/helper behavior and rerun V2.

### Wave 3: Follow-up architecture notes

**T5: Document Option 2 and Option 3 follow-up architecture** [small] -- reviewer
- Blocked by: V2
- Description: Add a concise evidence-only follow-up note explaining how future Option 2 and Option 3 can build on the new ready/waiting primitives. This is not implementation scope. Do not edit `pi/README.md` for rejected/future options unless implementation already requires README updates for current behavior.
- Files: `.specs/pi-task-ready-deps/evidence/T5-follow-up-architecture.md`
- Acceptance Criteria:
  1. [ ] Option 2 dependency tree renderer follow-up is described.
     - Verify: `grep -RIn "dependency tree\|topological\|ready queue" pi/README.md .specs/pi-task-ready-deps/evidence 2>/dev/null`
     - Pass: docs mention tree/indented display, topological ordering, and integration with renderer modes.
     - Fail: follow-up is missing or presented as current behavior.
  2. [ ] Option 3 workflow-engine-lite follow-up is described with guardrails.
     - Verify: `grep -RIn "workflow engine\|auto-unblock\|cascade\|deferred execution" pi/README.md .specs/pi-task-ready-deps/evidence 2>/dev/null`
     - Pass: docs mention auto-unblock/cascade/execution hooks as future work and preserve current deferred execution guardrails.
     - Fail: docs imply auto-execution exists now or remove the non-goal boundary.

### Wave 3 -- Validation Gate

**V3: Validate docs and integration scope** [small] -- qa-engineer
- Blocked by: T5
- Evidence command:
  ```bash
  {
    set -e
    echo '# V3 docs and integration scope validation'
    grep -RIn "dependency tree\|topological\|ready queue" .specs/pi-task-ready-deps/evidence
    grep -RIn "workflow engine\|auto-unblock\|cascade\|deferred execution" .specs/pi-task-ready-deps/evidence
    if grep -RIn "auto-execution exists\|workflow engine is implemented" .specs/pi-task-ready-deps/evidence; then exit 1; fi
    echo 'Follow-up notes exist and do not claim future behavior is implemented.'
    echo 'exit=0'
  } 2>&1 | tee .specs/pi-task-ready-deps/evidence/V3-docs-validation.md
  exit ${PIPESTATUS[0]}
  ```
- Pass: command exits 0 and evidence confirms Option 2/3 are future-only.
- On failure: repair wording and rerun V3.

### Final Gates

**F1: Task-specific verification complete** [small] -- qa-engineer
- Blocked by: V3
- Evidence command:
  ```bash
  {
    set -e
    echo '# F1 task-specific verification'
    for f in P0-preflight.md V0-preflight-validation.md V1-focused-validation.md V2-command-validation.md V3-docs-validation.md T5-follow-up-architecture.md; do
      test -s ".specs/pi-task-ready-deps/evidence/$f"
      echo "found $f"
    done
    echo 'Task-specific evidence files exist.'
    echo 'exit=0'
  } 2>&1 | tee .specs/pi-task-ready-deps/evidence/F1-task-specific-verification.md
  exit ${PIPESTATUS[0]}
  ```
- Pass: all task/wave evidence files exist and command exits 0.

**F2: Repo-wide validation complete** [small] -- qa-engineer
- Blocked by: F1
- Evidence command:
  ```bash
  {
    set -e
    echo '# F2 repo-wide validation'
    echo 'command: make check'
    make check
    echo "exit=$?"
  } 2>&1 | tee .specs/pi-task-ready-deps/evidence/F2-repo-validation.md
  exit ${PIPESTATUS[0]}
  ```
- Pass: `make check` exits 0.

**F3: Manual validation not required** [small] -- qa-engineer
- Blocked by: F2
- Evidence command:
  ```bash
  {
    set -e
    echo '# F3 manual validation gate'
    echo 'Manual validation required: no'
    echo 'Reason: low-risk local personal repo code/test/docs change; automated validation is sufficient.'
    echo 'exit=0'
  } 2>&1 | tee .specs/pi-task-ready-deps/evidence/F3-manual-not-required.md
  exit ${PIPESTATUS[0]}
  ```
- Pass: evidence records no manual validation is required.

**F4: Deployment validation not required** [small] -- qa-engineer
- Blocked by: F3
- Evidence command:
  ```bash
  {
    set -e
    echo '# F4 deployment validation gate'
    echo 'Deployment validation required: no'
    echo 'Reason: no deploy procedure; local Pi extension/test changes only.'
    echo 'exit=0'
  } 2>&1 | tee .specs/pi-task-ready-deps/evidence/F4-deployment-not-required.md
  exit ${PIPESTATUS[0]}
  ```
- Pass: evidence records no deployment validation is required.

**F5: Archive preflight complete** [small] -- qa-engineer
- Blocked by: F4
- Evidence command:
  ```bash
  {
    set -e
    echo '# F5 archive preflight'
    echo 'Required evidence files:'
    for f in P0-preflight.md V0-preflight-validation.md V1-focused-validation.md V2-command-validation.md V3-docs-validation.md F1-task-specific-verification.md F2-repo-validation.md F3-manual-not-required.md F4-deployment-not-required.md; do
      test -s ".specs/pi-task-ready-deps/evidence/$f"
      echo "found $f"
    done
    grep -q 'exit=0' .specs/pi-task-ready-deps/evidence/F2-repo-validation.md
    grep -n '^## ' .specs/pi-task-ready-deps/plan.md
    git status --short
    echo 'Archive preflight passed when all checklist items are checked, evidence exists, repo validation shows exit=0, and git status has been reviewed for unrelated changes.'
    echo 'exit=0'
  } 2>&1 | tee .specs/pi-task-ready-deps/evidence/F5-archive-preflight.md
  exit ${PIPESTATUS[0]}
  ```
- Pass: command exits 0, all evidence files exist, repo validation evidence contains `exit=0`, checklist is fully checked, and git status has been reviewed for unrelated changes.

## Dependency Graph

```text
Wave 0: P0 -> V0
Wave 1: V0 -> T1, T2 (parallel) -> V1
Wave 2: V1 -> T3, T4 (parallel) -> V2
Wave 3: V2 -> T5 -> V3
Final: V3 -> F1 -> F2 -> F3 -> F4 -> F5 -> archive
```

## Success Criteria

1. [ ] Ready/waiting semantics are implemented and tested.
   - Verify: `cd pi/tests && pnpm test task-dependencies.test.ts task-registry.test.ts`
   - Pass: tests prove ready tasks have no unmet blockers, waiting tasks identify unmet blockers, explicit blocked-state policy is enforced, and missing/tombstoned blockers remain unmet.
2. [ ] `/tasks ready` and `/tasks blocked` work through the registered command handler and are documented in help.
   - Verify: `cd pi/tests && pnpm test tasks.test.ts task-renderer.test.ts task-security.test.ts`
   - Pass: command tests assert registered-handler ready/blocked output, help text, deterministic ordering, and redaction.
3. [ ] `/tasks start <id>` rejects unmet dependencies without mutation.
   - Verify: `cd pi/tests && pnpm test tasks.test.ts task-dependencies.test.ts task-security.test.ts`
   - Pass: waiting task remains non-running, full persisted records/task directory contents are unchanged, and output names blockers with actionable redacted next steps.
4. [ ] Pi and repo validation pass.
   - Verify: `cd pi/extensions && pnpm run typecheck`, `cd pi/tests && pnpm run test`, and `make check`
   - Pass: all commands exit 0.
5. [ ] Future Option 2/3 direction is captured without expanding implementation scope.
   - Verify: T5/V3 evidence.
   - Pass: docs identify tree-renderer and workflow-engine-lite as future layers, not current behavior.

## Validation Contract

`/do-it` must satisfy this contract before reporting the plan complete or archiving it.

### Automation completeness

- Required: yes
- `/do-it` must run all validation through documented commands.
- No credentials are required.
- Manual-only steps are not required because this is non-destructive local code work.

### Required automated validation

1. [ ] Focused validation must pass.
   - Command: `cd pi/tests && pnpm install --frozen-lockfile && pnpm test task-registry.test.ts tasks.test.ts task-dependencies.test.ts task-renderer.test.ts task-tools.test.ts task-security.test.ts`
   - Pass: exits 0 with all listed tests passing.
   - Fail: repair implementation/tests and rerun.

2. [ ] Pi validation must pass.
   - Command: `cd pi/extensions && pnpm install --frozen-lockfile && pnpm run typecheck` and `cd ../tests && pnpm install --frozen-lockfile && pnpm run test`
   - Pass: both commands exit 0.
   - Fail: repair type/test failures and rerun.

3. [ ] Repo-wide validation must pass.
   - Command: `make check`
   - Pass: exits 0 with no errors.
   - Fail: repair failures and rerun; do not archive while failing.

4. [ ] Task-specific verification from every acceptance criterion must pass.
   - Command: see each task's `Verify:` command.
   - Pass: every acceptance criterion passes exactly as written or is updated with an equivalent stronger check and evidence.
   - Fail: repair task implementation or plan wording, rerun affected checks, then rerun repo-wide validation.

### Manual validation

Manual validation is exceptional. It should be `Required: no` unless the plan includes destructive operations, data-loss risk, irreversible external side effects, shared/work production impact, paid/billing/data-costing resources, secret exposure risk, hardware/physical checks, or genuinely subjective user judgment that cannot be replaced by safe automation. Scale matters: personal/local GitHub repos, local/home-lab, and new-backed-up systems are usually agent-runnable; work/shared/multi-user production systems and money/data-costing resources may need user gates when other people, spend, quota, or costly recovery could be affected.

- Required: no
- Justification: Automated validation is sufficient. This is local, non-destructive TypeScript/test/documentation work.
- Steps:
  1. None.

If manual validation is not required, `/do-it` may mark the manual gate complete after recording why automated evidence is sufficient.

### Deployment validation

- Required: no
- Procedure: None.

### Archive rule

`/do-it` may archive this plan only after all implementation tasks, focused validation, Pi validation, repo-wide validation, task-specific verification, manual-validation-not-required evidence, deployment-not-required evidence, and archive preflight pass. Do not require manual validation merely to increase confidence in non-destructive behavior that automated checks already cover.

## Handoff Notes

- This plan intentionally implements Option 1 only. Do not add auto-execution, background scheduling, or cascade execution.
- Dependency-unblocking policy is fixed for this plan: `completed` and `skipped` unblock; `cancelled`, `failed`, missing, tombstoned, and active states do not. Skipped blockers must be visible in full/detail dependency context so operators understand why a task is ready.
- Explicit `blocked` lifecycle tasks remain blocked until an operator transitions them; satisfying dependencies alone does not silently move them to ready/running. `/tasks blocked` should include explicit blocked tasks, and `/tasks ready` should only include pending ready tasks.
- Unmet blocker IDs and blocked dependent IDs must sort by full task ID lexicographically before shortening/rendering.
- If existing task tests encode different state assumptions, update tests only when the new behavior is directly part of this plan and keep compatibility for existing commands.
- Follow-up ecosystem notes for Options 2 and 3:
  - Option 2 can layer a dependency tree/topological renderer on top of the readiness helpers added here, likely in `pi/lib/task-renderer.ts`, without changing persistence.
  - Option 3 can later add workflow-engine-lite behavior around auto-unblock/cascade/execution hooks, but should remain gated behind explicit non-success/deferred execution semantics until the broader Pi control plane has safe scheduling, cancellation, and user-risk policies.
