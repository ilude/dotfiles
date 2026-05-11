---
created: 2026-05-11
status: completed
completed: 2026-05-11
---

# Plan: Consolidated Pi Control Plane Cleanup

## Context

This plan replaces the remaining active `.specs/pi*` work:

- `.specs/archive/pi-agent-team-cleanup/PRD.md`
- `.specs/archive/pi-branch-tab/plan.md`
- `.specs/archive/pi-tasks-control-plane/PRD.md`
- `.specs/archive/pi-tasks-control-plane/plan.md`

Those artifacts contained overlapping Pi operator-control-plane work. Some implementation already exists and must be reused, not rebuilt:

- `/branch` is implemented and tested for Windows Terminal/fallback basics in `pi/extensions/workflow-commands.ts` and `pi/tests/branch-command.test.ts`.
- A baseline task registry and `/tasks` surface exist in `pi/lib/task-registry.ts`, `pi/lib/operator-state.ts`, `pi/extensions/tasks.ts`, `pi/tests/task-registry.test.ts`, and `pi/tests/tasks.test.ts`.
- `pi/agents/` contains role metadata, but stale `pi/multi-team/agents/` and active `/team` registration still exist.
- `pi/extensions/agent-team.ts` currently registers `team`; implementation must disable/remove that active registration before claiming `/team` is removed.
- The current subagent extension path is `pi/extensions/subagent/index.ts`, not `pi/extensions/subagent.ts`.
- Current task states in `pi/lib/operator-state.ts` are `pending`, `running`, `blocked`, `completed`, `failed`, and `cancelled`; `skipped` is not yet implemented.

This plan is the source of truth for the remaining work. Archived predecessor specs are historical context only.

## Objective

Finish the Pi agent/task/branch control-plane cleanup with one coherent implementation path:

1. Close `/branch` gaps or explicitly narrow the supported contract.
2. Replace the separate `/team` workflow with explicit `subagent` lead/team dispatch semantics.
3. Evolve the existing task registry and `/tasks` command into a safe MVP task control plane.
4. Keep validation Pi-native and pnpm-only for TypeScript work.

## Constraints

- Use existing code as the base; do not rebuild working `/branch`, task-registry, or `/tasks` behavior from scratch.
- Pi TypeScript validation is pnpm-only:
  - `cd pi/extensions && pnpm install --frozen-lockfile && pnpm run typecheck`
  - `cd pi/tests && pnpm install --frozen-lockfile && pnpm run test`
- Do not use Bun/npm for Pi TypeScript packages/tests.
- Do not create helper `.ts` files at top level of `pi/extensions/`; every top-level extension file is auto-discovered. Reusable helpers belong under `pi/lib/` or non-auto-discovered subdirectories.
- Do not persist secrets, raw prompts, credentials, tokens, private keys, or raw session content in task metadata/output/evidence.
- Do not remove useful historical expertise/memory directories unless implementation proves they are stale source definitions rather than runtime state.
- No destructive git operations without explicit confirmation.
- `make check` remains a final validation gate. Focused/Pi tests are the iteration gates.

## Non-Goals

- Full workflow engine, auto-cascade, `TaskExecute`, `TaskStop`, or prompt-output injection.
- Real path/domain sandbox enforcement for agents.
- Worktree isolation or background scheduled agents.
- Cross-platform `/branch` perfection beyond validated adapters; unsupported terminals may use safe fallback.
- Keeping `/team` as a working alias. Migration guidance may appear in docs/help/error text, but `/team` must not remain an active coordination workflow.

## Task Breakdown

| ID | Task | Primary files | Depends on | Evidence |
|----|------|---------------|------------|----------|
| P0 | Inventory current implementation and active command surfaces | no code edits; grep/read evidence | -- | `evidence/P0-preflight.md` |
| T1 | Encode final `/branch` support contract | `pi/extensions/workflow-commands.ts`, branch tests, docs/help | P0 | `evidence/T1-branch-contract.md` |
| T2 | Finish branch safety tests and launch-failure behavior | branch tests, workflow command | T1 | `evidence/T2-branch-safety.md` |
| T3 | Make `pi/agents/` canonical active source | agent docs/config/tests | P0 | `evidence/T3-agent-source.md` |
| T4 | Add and verify subagent lead/team dispatch before disabling `/team` | `pi/extensions/subagent/index.ts`, `pi/agents/teams.yaml`, tests | T3 | `evidence/T4-subagent-team-dispatch.md` |
| T5 | Disable active `/team` registration and add migration guidance | `pi/extensions/agent-team.ts`, docs/help/tests | T4 | `evidence/T5-team-removal.md` |
| T6 | Enforce lead/worker role semantics with recovery validation | agent frontmatter/prompts/config tests | T3 | `evidence/T6-role-semantics.md` |
| T7 | Evolve task schema/lifecycle and persistence outcomes | `pi/lib/task-registry.ts`, `pi/lib/operator-state.ts`, registry tests | P0 | `evidence/T7-task-lifecycle.md` |
| T8 | Add atomic task persistence and migration compatibility | registry/operator-state tests and fixtures | T7 | `evidence/T8-task-persistence.md` |
| T9 | Add dependency graph and tombstone semantics | registry/dependency helper tests | T8 | `evidence/T9-task-dependencies.md` |
| T10 | Add shared task security sanitizer/redactor | `pi/lib/task-security.ts`, security tests | T8 | `evidence/T10-task-security.md` |
| T11 | Add MVP task tools with registered-tool tests | existing tasks extension or non-auto-discovered helper location | T7,T10 | `evidence/T11-task-tools.md` |
| T12 | Upgrade `/tasks` command lifecycle UX | `pi/extensions/tasks.ts`, command tests | T7,T10 | `evidence/T12-tasks-command.md` |
| T13 | Add renderer/settings modes | `pi/lib/task-renderer.ts`, `pi/lib/task-settings.ts`, tests | T12 | `evidence/T13-task-renderer.md` |
| T14 | Update docs/help/status and active-source references | docs, extension help/status output | T2,T5,T11,T12,T13 | `evidence/T14-docs-help.md` |
| V1 | Run focused validation | tests listed in Validation Contract | T1-T14 | `evidence/V1-focused-validation.md` |
| V2 | Run Pi validation | pnpm typecheck and Pi tests | V1 | `evidence/V2-pi-validation.md` |
| V3 | Run repo validation | `make check` | V2 | `evidence/V3-repo-validation.md` |
| F1 | Complete manual validation or document not-required/deferral | manual evidence | V3 | `evidence/F1-manual-validation.md` |
| F2 | Archive preflight and manifest | evidence scan, git status, archive manifest | F1 | `evidence/F2-archive-preflight.md` |
| F3 | Archive this plan | plan move/status update | F2 | archived plan |

## Execution Waves

### Wave 0: Preflight and inventory

**P0: Capture current implementation inventory**
- Commands:
  ```bash
  mkdir -p .specs/pi-control-plane-consolidation/evidence
  {
    git status --short
    grep -RIn "registerCommand(.*team\|registerCommand(\"team\"\|registerCommand('team'" pi/extensions --exclude-dir=node_modules || true
    find pi/extensions -maxdepth 2 -type f \( -path '*subagent*' -o -name 'agent-team.ts' -o -name 'tasks.ts' -o -name 'workflow-commands.ts' \) -print | sort
    find pi/agents pi/multi-team/agents -maxdepth 1 -type f 2>/dev/null | sort
    grep -n "TASK_STATES\|ALLOWED_TRANSITIONS" pi/lib/operator-state.ts
  } 2>&1 | tee .specs/pi-control-plane-consolidation/evidence/P0-preflight.md
  ```
- Pass: evidence identifies active `/team`, subagent path, task states, agent source directories, branch/task files, and any unrelated dirty worktree changes.

### Wave 1: `/branch` closure

**T1: Encode final `/branch` support contract**
- Contract: Windows Terminal is supported; unsupported terminals print a safe manual resume command; Ghostty is fallback-only unless confirmed syntax and tests are added.
- Verify: tests/docs do not claim an unimplemented Ghostty adapter as supported.
- Evidence: `evidence/T1-branch-contract.md` lists exact support status and changed docs/tests.

**T2: Finish branch safety behavior**
- Required tests: registered `/branch` handler, default/custom title, special-character argv handling, session-id resume, unsupported fallback, launch-failure reporting, and no raw session content in argv/log/fallback text.
- If cleanup-on-launch-failure is unsupported by Pi session APIs, document the orphaned branch behavior and manual recovery command instead of pretending cleanup exists.
- Focused command:
  ```bash
  cd pi/tests && pnpm install --frozen-lockfile && pnpm test branch-command.test.ts
  ```
- Evidence: `evidence/T2-branch-safety.md` records command, exit code, and fallback/manual behavior.

### Wave 2: Agent team cleanup

**T3: Make `pi/agents/` the canonical active source**
- Runtime discovery/docs must point to `pi/agents/` for active agents.
- `pi/multi-team/agents/` must be removed from active discovery. If retained, it must be moved or documented as non-source runtime/history outside discovery paths.
- Add an executable discovery/config test that fails if active agent definitions are loaded from `pi/multi-team/agents/`.
- Evidence must distinguish active source hits from `.specs/archive` historical references.

**T4: Add explicit subagent lead/team dispatch before disabling `/team`**
- Define the public interface before implementation:
  - registered tool/command surface used for team dispatch;
  - exact input fields for direct agent, lead, and team-key requests;
  - schema validation for unknown team/lead/worker;
  - resolution rules using `pi/agents/teams.yaml`;
  - output for coordinated, declined-too-simple, and needs-other-team results;
  - max delegation-depth behavior.
- Tests must invoke the registered `subagent` surface, not only imported resolver helpers.
- Pass: direct worker invocation and explicit team/lead invocation both work before `/team` is disabled.

**T5: Disable active `/team` registration and add migration guidance**
- `pi/extensions/agent-team.ts` must be deleted, renamed out of auto-discovery, or converted to non-registering shared code.
- Add registration tests that load extensions and assert `team` is absent as an active command while `subagent` remains available.
- Add docs/help migration guidance with replacement examples. Do not keep `/team` as a working coordination alias.
- Active-source grep command must exclude `.specs/archive` and allow only historical docs explicitly marked archived.

**T6: Enforce lead/worker role semantics with recovery validation**
- Leads/orchestrators are coordination-only and should not have direct read/bash/edit/write tools by default.
- Workers/specialists should not have `subagent` by default unless explicitly justified.
- Before applying restrictions, add a validation check proving at least one documented maintenance/recovery path remains for repairing bad agent config.
- Tests or structured config checks must cover `roleType` parsing, tool restrictions, and recovery-path existence.

### Wave 3: Task control-plane MVP foundation

**T7: Evolve task schema/lifecycle and persistence outcomes**
- Define lifecycle before implementation:
  - states: `pending`, `running`, `blocked`, `completed`, `failed`, `cancelled`, `skipped`;
  - allowed transitions for every state;
  - whether `skipped` is terminal, retryable, and dependency-unblocking;
  - timestamp/reason behavior for start/end/skip/cancel/retry;
  - `/tasks skip` idempotency and error behavior.
- Define shared outcome codes: `persisted`, `rejected`, `conflict`, `deferred`, `write_failed`, and `not_found` where applicable.
- Tests must prove no mutating command/tool emits success when persistence fails.

**T8: Add atomic task persistence and migration compatibility**
- Preserve unknown fields on round trip.
- Accept legacy records from existing producers with defaults for new fields.
- Use temp-file plus atomic rename for single-record writes.
- For multi-record graph mutations, validate all affected records before commit; if true cross-file atomicity is not available, use a journal/repair handle and tests proving no false success after mid-write failure.
- Add corrupt JSON quarantine or warning behavior; corrupt JSON must not be treated as valid legacy JSON.

**T9: Add dependency graph and tombstone semantics**
- Define `blocks`/`blockedBy`, bidirectional edge maintenance, cycle rejection, missing dependency handling, and tombstone behavior.
- Tombstone contract must define retained id, final state, edge retention/removal, and dependent behavior when a blocker is cleared/deleted.
- Tests must cover create/update/delete/clear completed with active dependents, deleted blocker, deleted dependent, and load graph containing tombstones.

**T10: Add shared task security sanitizer/redactor**
- Implement a single reusable sanitizer/redactor API and require all registry writes, renderers, task tools, and slash-command output paths to use it.
- Tests must use synthetic fake values only, including representative token/private-key shapes and sentinel strings.
- Tests must assert persisted JSON, logs, argv, slash output, tool output, and evidence omit or reject raw sentinels.

### Wave 4: Task tools and `/tasks` UX

**T11: Add LLM-callable MVP task tools**
- Decide canonical tool names before implementation. Prefer repo/Pi convention if existing tools are lower_snake_case; otherwise add registered-tool integration tests proving UpperCamelCase names work.
- Required capabilities: create, batch create, list, get, and update.
- Deferred tools `TaskExecute`, `TaskStop`, and `TaskOutput` must be absent or return explicit non-success `deferred` and perform no execution.
- Name module placement explicitly in evidence. Do not add top-level helper files that are unintentionally auto-discovered.

**T12: Upgrade `/tasks` command lifecycle UX**
- Tests must cover current/default behavior preservation or explicitly documented changes.
- Required commands: `/tasks|/tasks list`, `list --all`, `show <id>`, `create`, `start`, `complete`, `skip`, `cancel`, `retry|reopen`, `clear completed`, `settings`, `settings mode compact|full|hidden`, and `help`.
- Command-created task input must pass through the shared sanitizer/redactor.
- Retry/reopen output must state it does not execute work.

**T13: Add pure renderer/settings modes**
- Renderer/settings modes: `hidden`, `compact`, and `full`.
- `/tasks` must remain available in hidden mode, and there must be a tested recovery path from hidden back to visible output.
- Compact priority: `failed`, `blocked`, `running`, `pending`, then terminal summary counts.
- Output must be deterministic and redacted.

### Wave 5: Documentation, validation, archive

**T14: Update docs/help/status and active-source references**
- Docs and in-product help/status output must document:
  - `/branch` support/fallback behavior;
  - `/tasks` MVP commands and settings recovery;
  - `/team` removal and replacement examples using the new subagent dispatch surface.
- Grep checks must separate active source/docs from `.specs/archive` and other historical paths.

**V1: Run focused validation**
- Required focused commands, updating file list as tests are added:
  ```bash
  cd pi/tests && pnpm install --frozen-lockfile && pnpm test branch-command.test.ts
  cd pi/tests && pnpm test task-registry.test.ts tasks.test.ts
  cd pi/tests && pnpm test subagent.test.ts
  cd pi/tests && pnpm test task-dependencies.test.ts task-security.test.ts task-renderer.test.ts task-tools.test.ts
  ```
- If a listed file does not exist yet, implementation must create it or update this plan with the replacement test file before marking V1 complete.
- Evidence: `evidence/V1-focused-validation.md` includes command, cwd, exit code, and named tests/fixtures.

**V2: Run Pi validation**
```bash
cd pi/extensions && pnpm install --frozen-lockfile && pnpm run typecheck
cd ../tests && pnpm install --frozen-lockfile && pnpm run test
```
- Evidence: `evidence/V2-pi-validation.md`.

**V3: Run repo validation**
```bash
make check
```
- Evidence: `evidence/V3-repo-validation.md`.

**F1: Manual validation complete or explicitly not required**
- Required manual checks unless automated tests prove the same behavior:
  - `/branch` and `/branch custom-name` in Windows Terminal open branched sessions;
  - branch independence marker appears only in the branched session;
  - unsupported-terminal fallback command resumes the branch;
  - `/tasks help`, settings mode changes, hidden-to-visible recovery, and `/team` migration guidance are discoverable;
  - subagent team/lead discovery or examples are visible to the operator.
- Evidence: `evidence/F1-manual-validation.md` with only sanitized outputs.

**F2: Archive preflight and manifest**
- Write `evidence/archive-manifest.txt` listing every path to move/archive/delete.
- Run active-source grep checks with archive allowlists.
- Run secret scan over evidence and tests for fake sentinel leaks plus real-looking PEM/AWS/token patterns.
- Review `git status --short` and record unrelated changes. Do not delete directories unless the archive manifest proves no untracked/unrelated files are inside.
- Evidence: `evidence/F2-archive-preflight.md`.

**F3: Archive this plan**
- Only after all gates pass, move this plan/review/evidence to `.specs/archive/pi-control-plane-consolidation/` and set frontmatter `status: completed` and `completed: YYYY-MM-DD`.
- Leave no active superseded `.specs/pi-agent-team-cleanup`, `.specs/pi-branch-tab`, or `.specs/pi-tasks-control-plane` directories.

## Success Criteria

1. `/branch` behavior has an explicit validated support contract.
   - Verify: focused branch tests and manual/automated evidence.
   - Pass: supported terminal behavior and fallback behavior are both documented and tested.

2. `/team` is no longer an active coordination workflow.
   - Verify: extension registration tests and active-source grep checks.
   - Pass: no active command registration exposes `/team`; replacement subagent dispatch has tests and docs/help examples.

3. Agent role/source cleanup is enforceable.
   - Verify: structured config tests for active agent sources, `roleType`, tool restrictions, and recovery path.
   - Pass: no active agent definitions load from stale duplicate source directories.

4. Task registry MVP is durable and safe.
   - Verify: registry/dependency/security/tool/command tests.
   - Pass: lifecycle, persistence outcomes, dependencies, tombstones, sanitizer, and no-false-success paths are covered.

5. `/tasks` and task tools are operator/model usable without unsafe execution scope.
   - Verify: registered tool tests, slash-command tests, renderer/settings tests, and help/status docs.
   - Pass: MVP create/list/get/update and slash commands work; deferred execution tools do not execute.

6. Validation and archive are reproducible.
   - Verify: V1/V2/V3/F1/F2 evidence files exist and record commands, exit codes, and sanitized outputs.
   - Pass: `make check` exits 0 and archive manifest/scan pass.

## Validation Contract

### Evidence ledger rule

After each checklist item passes, append a short entry to `## Execution Status` and the corresponding evidence file with:

- item id;
- cwd;
- command(s) run;
- exit code;
- files changed;
- evidence artifact path;
- next safe item;
- any failures and repairs.

Checked means verified complete. Unchecked means pending, in progress, blocked, or invalidated. `/review-it` must not mark implementation or validation items complete.

### Required automated validation

1. Focused validation from V1 must pass.
2. Pi validation from V2 must pass.
3. Repo validation from V3 must pass.
4. Archive preflight from F2 must pass.
5. All evidence files must avoid raw prompts, credentials, tokens, private keys, and unredacted sentinel strings.

### Manual validation

Manual validation is required for `/branch` live terminal behavior unless a test harness proves tab launch and session independence. If skipped or deferred, classify the implementation as `implemented-awaiting-manual-validation` and do not archive as completed.

### Deployment validation

Not required. This is local dotfiles/Pi extension behavior.

### Archive rule

Archive only after all automated validation, task-specific verification, manual validation completion-or-explicit deferral policy, deployment-not-required note, repo validation, archive manifest, and secret scan pass. Do not archive if the plan state is `implemented-awaiting-manual-validation`.

## Execution Checklist

### Wave 0: Preflight and inventory

- [x] P0: Capture current implementation inventory
  - Evidence: `.specs/pi-control-plane-consolidation/evidence/P0-preflight.md`

### Wave 1: `/branch` closure

- [x] T1: Encode final `/branch` support contract
  - Evidence: `.specs/pi-control-plane-consolidation/evidence/T1-branch-contract.md`
- [x] T2: Finish branch safety tests and launch-failure behavior
  - Evidence: `.specs/pi-control-plane-consolidation/evidence/T2-branch-safety.md`

### Wave 2: Agent team cleanup

- [x] T3: Make `pi/agents/` the canonical active source
  - Evidence: `.specs/pi-control-plane-consolidation/evidence/T3-agent-source.md`
- [x] T4: Add and verify subagent lead/team dispatch before disabling `/team`
  - Evidence: `.specs/pi-control-plane-consolidation/evidence/T4-subagent-team-dispatch.md`
- [x] T5: Disable active `/team` registration and add migration guidance
  - Evidence: `.specs/pi-control-plane-consolidation/evidence/T5-team-removal.md`
- [x] T6: Enforce lead/worker role semantics with recovery validation
  - Evidence: `.specs/pi-control-plane-consolidation/evidence/T6-role-semantics.md`

### Wave 3: Task control-plane MVP foundation

- [x] T7: Evolve task schema/lifecycle and persistence outcomes
  - Evidence: `.specs/pi-control-plane-consolidation/evidence/T7-task-lifecycle.md`
- [x] T8: Add atomic task persistence and migration compatibility
  - Evidence: `.specs/pi-control-plane-consolidation/evidence/T8-task-persistence.md`
- [x] T9: Add dependency graph and tombstone semantics
  - Evidence: `.specs/pi-control-plane-consolidation/evidence/T9-task-dependencies.md`
- [x] T10: Add shared task security sanitizer/redactor
  - Evidence: `.specs/pi-control-plane-consolidation/evidence/T10-task-security.md`

### Wave 4: Task tools and `/tasks` UX

- [x] T11: Add LLM-callable MVP task tools
  - Evidence: `.specs/pi-control-plane-consolidation/evidence/T11-task-tools.md`
- [x] T12: Upgrade `/tasks` command lifecycle UX
  - Evidence: `.specs/pi-control-plane-consolidation/evidence/T12-tasks-command.md`
- [x] T13: Add pure renderer/settings modes
  - Evidence: `.specs/pi-control-plane-consolidation/evidence/T13-task-renderer.md`

### Wave 5: Documentation, validation, archive

- [x] T14: Update docs/help/status and active-source references
  - Evidence: `.specs/pi-control-plane-consolidation/evidence/T14-docs-help.md`
- [x] V1: Run focused validation
  - Evidence: `.specs/pi-control-plane-consolidation/evidence/V1-focused-validation.md`
- [x] V2: Run Pi validation
  - Evidence: `.specs/pi-control-plane-consolidation/evidence/V2-pi-validation.md`
- [x] V3: Run repo validation
  - Evidence: `.specs/pi-control-plane-consolidation/evidence/V3-repo-validation.md`
- [x] F1: Manual validation complete or explicitly not required
  - Evidence: `.specs/pi-control-plane-consolidation/evidence/F1-manual-validation.md`
- [x] F2: Archive preflight and manifest complete
  - Evidence: `.specs/pi-control-plane-consolidation/evidence/F2-archive-preflight.md`
- [x] F3: Archive this plan
  - Evidence: `.specs/archive/pi-control-plane-consolidation/plan.md`

## Execution Status

- Completion classification: completed-and-archived.
- Status: Implementation, focused validation, Pi validation, repo validation, manual validation, archive preflight, and archive completed.
- Last updated: 2026-05-11.
- Last completed item: F3 archive this plan.
- Next item: none.
- Review artifact: `.specs/pi-control-plane-consolidation/review-1/synthesis.md`.
- Supersedes:
  - `.specs/archive/pi-agent-team-cleanup/PRD.md`
  - `.specs/archive/pi-branch-tab/plan.md`
  - `.specs/archive/pi-tasks-control-plane/PRD.md`
  - `.specs/archive/pi-tasks-control-plane/plan.md`
- 2026-05-11 P0: Captured implementation inventory in `.specs/pi-control-plane-consolidation/evidence/P0-preflight.md`; unrelated dirty worktree noted and preserved.
- 2026-05-11 T1-T2: Encoded `/branch` support contract via tests; focused branch validation passed. Evidence: `evidence/T1-branch-contract.md`, `evidence/T2-branch-safety.md`.
- 2026-05-11 T3-T6: Made `pi/agents/` canonical in tests, added subagent team dispatch, disabled active `/team`, enforced role semantics and recovery docs. Evidence: `evidence/T3-agent-source.md` through `evidence/T6-role-semantics.md`.
- 2026-05-11 Validation: `pnpm` focused tests and extension typecheck passed. Evidence: `evidence/W1-W2-validation.md`.
- 2026-05-11 T7-T13: Implemented task lifecycle/schema/persistence/dependencies/security/tools/commands/renderer/settings MVP. Focused task tests passed (`46 passed`), and `cd pi/extensions && pnpm run typecheck` exited 0. Evidence: `evidence/T7-task-lifecycle.md` through `evidence/T13-task-renderer.md`.
- 2026-05-11 T14: Captured docs/help/status evidence in `.specs/pi-control-plane-consolidation/evidence/T14-docs-help.md`; active `/team` registration grep returned no matches.
- 2026-05-11 V1: Focused validation passed. Evidence: `.specs/pi-control-plane-consolidation/evidence/V1-focused-validation.md`.
- 2026-05-11 V2: Extension typecheck passed; initial full Pi tests failed on stale operator-state seven-state expectation, repaired `pi/tests/operator-state.test.ts`, then full Pi tests passed (`78 passed`, `988 tests`). Evidence: `.specs/pi-control-plane-consolidation/evidence/V2-pi-validation.md`.
- 2026-05-11 V3: `make check` passed; evidence recorded in `.specs/pi-control-plane-consolidation/evidence/V3-repo-validation.md`.
- 2026-05-11 F1: Manual validation completed from user-provided sanitized pass/fail confirmations. Evidence recorded in `.specs/pi-control-plane-consolidation/evidence/F1-manual-validation.md`.
- 2026-05-11 F2: Archive preflight passed; manifest, active-source checks, secret pattern scan, and git status recorded in `.specs/pi-control-plane-consolidation/evidence/F2-archive-preflight.md`.
- 2026-05-11 F3: Plan archived to `.specs/archive/pi-control-plane-consolidation/plan.md`.
