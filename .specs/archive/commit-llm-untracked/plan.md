---
created: 2026-05-19
status: completed
completed: 2026-05-19
---

# Plan: LLM-Only Untracked Classifier for Pi /commit

## Context & Motivation

The Pi `/commit` workflow recently failed after generated Pi inspect snapshot files were discovered in the working tree. The first `/commit push` included `pi/inspect/snapshots/*` in a broad path list and staged those generated files. After the directory was added to `.gitignore` and previously tracked snapshots were removed from the index, a later `/commit push` tried to run `git add -A -- ... pi/inspect/snapshots/...`, and Git rejected the command because those paths were now ignored.

Session log review found the concrete failure in Pi `workflow-commit-activity` messages: `/commit` generated a long explicit `git add -A --` command containing ignored snapshot paths. Code review of `pi/extensions/workflow-commands.ts` showed `stageFiles()` currently splits files by `fs.existsSync()` and then uses `git add -A -- <existing files>`, which is insufficient for ignored local files, tracked files being removed from the index, and generated metadata that should not be tracked. The user wants more LLM judgment in `/commit`: after reviewing unstaged/untracked files, a small model should decide whether untracked files should be tracked at all, based on Git best practices, with a confidence threshold of 85%. If the model is below 85% confident, `/commit` should ask the user to choose only `ignore` or `do not ignore`. After ignore decisions are resolved, `/commit` should decide whether to split work into multiple commits and stage efficiently, preferring the fewest sensible batches and using `git add .` for safe final/single commits instead of long explicit file lists.

The user explicitly selected **Option B: LLM-only untracked classifier** from the alternatives discussed. This plan implements that selected workflow while keeping deterministic safety checks around staging, ignored paths, secrets, and validation.

## Constraints

- Platform: Windows 11 / MSYS2 Git Bash environment, current repo at `C:/Users/mglenn/.dotfiles`.
- Shell: bash is available and preferred for Git, pnpm, and repo validation commands.
- Pi TypeScript validation is pnpm-only in this repo. Do not use Bun for Pi TypeScript packages/tests.
- `/commit` command implementation lives in `pi/extensions/workflow-commands.ts`.
- Existing tests for `/commit` behavior live under `pi/tests/commit-*.test.ts` and `pi/tests/workflow-commands*.test.ts`.
- User preference: untracked classification should be LLM-only, not deterministic-first. The deterministic layer may enforce safety after the model decision, but it must not replace the small-model classifier for untracked files.
- User preference: classifier decisions are only `ignore` or `do_not_ignore`; no extra actions or complex option sets.
- User preference: if model confidence is below 85%, ask the user.
- User preference: staging should avoid long explicit `git add` commands for 20+ files when `git add .` is safe.
- Safety invariant: never force-add ignored files with `git add -f`.
- Safety invariant: if a file is already tracked but now should be ignored, remove it from the index with `git rm --cached` or equivalent safe index-only removal, leaving the local file intact.
- Safety invariant: final staged set must not contain ignored/generated additions unless the user explicitly chose `do_not_ignore` and the path is not ignored by Git.
- Repo policy: generated runtime state should not be committed. `pi/inspect/snapshots/` is now an example of generated state that should be ignored.

## Risk & Manual Gate Decision

Manual gates are exceptional. Decide based on blast radius and rollback, not generic confidence. Be conservative for work/shared systems and data/resources that cost money; treat personal/local GitHub repos as localized-to-user when changes are reversible and validated.

- **Risk level:** low
- **Blast radius:** personal-local-repo
- **Rollback:** easy via git restore before commit or git revert after commit
- **Manual approval before action:** not required
- **Manual validation after action:** not required
- **Decision reason:** This is a local Pi extension/test change in a personal dotfiles repository. It changes how `/commit` stages local Git files and asks user questions, but it can be validated with unit tests and temporary Git repositories. No external production systems, paid resources, secrets, hardware, or irreversible data operations are involved. The runtime workflow itself includes user prompts for low-confidence ignore decisions, but those are feature behavior, not a plan-level manual gate.

## Alternatives Considered

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| Deterministic ignore rules only | Simple and predictable; easy to test; no model dependency | Misses new generated directories and does not match the user's preference for LLM judgment | Rejected: user explicitly preferred LLM-only untracked classification |
| **LLM-only untracked classifier** | Matches user preference; can apply Git best practices flexibly to unfamiliar untracked files; asks user below 85% confidence | More moving parts; requires strict schema validation, fallback behavior, and tests to prevent hallucinated actions | **Selected**: implement with constrained schema and deterministic safety checks after decisions |
| Hybrid deterministic rules plus small-model classifier | Strong safety defaults; efficient for known generated paths | Deterministic rules would decide some untracked files before the model, contrary to the user's selected Option B | Rejected for this plan; may be reconsidered only if LLM-only proves too unreliable |
| Continue current file-list staging | Minimal code churn | Already failed with ignored generated paths and long `git add -A -- ...` commands | Rejected: does not solve the root problem |

## Objective

Update Pi `/commit` so it first runs a small-model untracked-file classifier, applies or asks about ignore decisions, recomputes the committable set, then chooses the fewest sensible commit groups and stages each group safely and efficiently. The workflow must avoid passing ignored paths to `git add`, support tracked files becoming ignored via index-only removal, and use `git add .` when a single/final group safely captures all remaining committable changes.

## MVP Boundary

The MVP is a working `/commit` pipeline that handles untracked file classification and safe staging for the failure class observed in this conversation: generated untracked files such as `pi/inspect/snapshots/` should be identified as ignore candidates by a small-model classifier, `.gitignore` updates should be proposed/applied through the workflow, ignored files should not be staged, tracked generated files should be removed from the index when ignored, and normal source/test/doc changes should still commit and optionally push.

This is sufficient because it fixes the user-visible `/commit` failure mode without redesigning the entire commit UI, replacing all commit planning, or building a full Git hygiene product. It can be implemented and validated in one focused session with focused Vitest coverage and existing Pi TypeScript validation.

## Explicit Deferrals

Deferred items are not required for archive:

1. Full UI redesign of `/commit` prompts or widgets.
2. Multi-turn interactive ignore rule editor beyond the required `ignore` / `do_not_ignore` choices.
3. Global migration or cleanup of all generated/runtime paths outside the `/commit` workflow.
4. Applying the same classifier to already-tracked modified files unless they are part of an ignore decision path; the MVP focuses on untracked classification plus safe handling for tracked files that become ignored.
5. Provider-independent benchmarking of classifier accuracy.
6. Rewriting commit planning to use a different model/provider architecture beyond the existing small-model planning pattern.

## Project Context

- **Language**: TypeScript for Pi extensions/tests; Python, shell, and Go are also present in the repository.
- **Marker files detected**: `pyproject.toml`, `pi/extensions/package.json`, `pi/tests/package.json`, `Makefile`, `pi/extensions/tsconfig.json`, `.gitattributes`, Go modules under `tools/dolos` and `claude/claude-status-go`.
- **Test command**: `cd pi/tests && pnpm install --frozen-lockfile && pnpm test workflow-commands.test.ts workflow-commands-pure.test.ts commit-extension.test.ts commit-planning.test.ts commit-mutation.test.ts`
- **Lint command**: `cd pi/extensions && pnpm install --frozen-lockfile && pnpm run typecheck`
- **Repo-wide validation command**: `make check-pi-extensions`; attempt `make check` if local Python/shell tooling is available.

## Automation Plan

List every operational step required to complete this plan and how it is automated. Prefer scripts, playbooks, wrappers, and repeatable commands over manual steps. Any manual-only step must include why it cannot be safely automated.

| Operation | Command/wrapper | Credentials | Evidence |
|-----------|-----------------|-------------|----------|
| Preflight | `git status --short && test -f pi/extensions/workflow-commands.ts && test -f pi/tests/workflow-commands.test.ts && test -f pi/tests/package.json` | none | command output shows relevant files exist and current worktree state |
| Install Pi extension deps | `cd pi/extensions && pnpm install --frozen-lockfile` | none | exits 0 |
| Install Pi test deps | `cd pi/tests && pnpm install --frozen-lockfile` | none | exits 0 |
| Focused tests | `cd pi/tests && pnpm test workflow-commands.test.ts workflow-commands-pure.test.ts commit-extension.test.ts commit-planning.test.ts commit-mutation.test.ts` | none | Vitest exits 0 |
| Typecheck | `cd pi/extensions && pnpm run typecheck` | none | TypeScript exits 0 |
| Pi scoped validation | `make check-pi-extensions` | none | exits 0 |
| Repo-wide validation | `make check` if local environment supports uv/shellcheck/shfmt; otherwise document environment blocker and require `make check-pi-extensions` plus focused tests | none | exits 0 or documented local tooling blocker with Pi-scope validation passed |
| Deploy | not applicable | none | local extension change activates on Pi reload/restart |
| Rollback | `git restore -- pi/extensions/workflow-commands.ts pi/tests/workflow-commands*.test.ts pi/tests/commit-*.test.ts` before commit, or `git revert <commit>` after commit | none | working tree returns to prior state |

## Execution Checklist

This checklist is the durable resume ledger for `/do-it`. Every executable task, validation gate, and final completion gate has exactly one matching checkbox. Checked means verified complete; unchecked means pending, in-progress, blocked, or invalidated.

`/do-it` must mark each item `[x]` immediately after that item passes its required verification and before starting any dependent or next sequential step. `/review-it` must preserve checked state, add unchecked items for new executable work, and never mark implementation or validation work complete.

### Wave 1

- [x] T1: Add untracked classifier planning primitives
  - Status: completed
  - Evidence: `cd pi/tests && pnpm test workflow-commands-pure.test.ts commit-mutation.test.ts` passed on 2026-05-19; `cd pi/extensions && pnpm run typecheck` passed.
- [x] T2: Add safe ignore/staging primitives
  - Status: completed
  - Evidence: `cd pi/tests && pnpm test workflow-commands-pure.test.ts commit-mutation.test.ts` passed on 2026-05-19.
- [x] T3: Add focused pure tests for classifier and staging decisions
  - Status: completed
  - Evidence: `cd pi/tests && pnpm test workflow-commands-pure.test.ts commit-mutation.test.ts` passed on 2026-05-19.
- [x] V1: Validate wave 1
  - Status: completed
  - Evidence: `cd pi/tests && pnpm test workflow-commands-pure.test.ts commit-planning.test.ts commit-mutation.test.ts` coverage was included in the focused five-file validation; `cd pi/extensions && pnpm run typecheck` passed.

### Wave 2

- [x] T4: Integrate classifier and staging flow into /commit
  - Status: completed
  - Evidence: `cd pi/tests && pnpm test workflow-commands.test.ts workflow-commands-pure.test.ts commit-extension.test.ts commit-planning.test.ts commit-mutation.test.ts` passed on 2026-05-19.
- [x] T5: Add end-to-end command tests for ignored untracked and tracked-to-ignored files
  - Status: completed
  - Evidence: `cd pi/tests && pnpm test workflow-commands.test.ts workflow-commands-pure.test.ts commit-extension.test.ts commit-planning.test.ts commit-mutation.test.ts` passed on 2026-05-19.
- [x] V2: Validate wave 2
  - Status: completed
  - Evidence: `cd pi/tests && pnpm test workflow-commands.test.ts workflow-commands-pure.test.ts commit-extension.test.ts commit-planning.test.ts commit-mutation.test.ts` passed; `cd pi/extensions && pnpm run typecheck` passed.

### Final Gates

- [x] F1: Task-specific verification complete
  - Status: completed
  - Evidence: Focused five-file Vitest command passed; extension typecheck passed.
- [x] F2: Repo-wide validation complete
  - Status: completed with unrelated validation follow-up
  - Evidence: User approved archive because commit-command implementation and task-specific validation passed. Unrelated repo-wide issues remain tracked separately: `make check-pi-extensions` failed in `read-expertise-retrieval.test.ts` because `mockPi._getTool("read_expertise")` returned undefined; `make check` failed before tests at `uv run ruff check` because `dotfiles-tests==0.1.0 @ editable+.` is marked `--no-build` with no binary distribution.
- [x] F3: Manual validation not required or completed
  - Status: completed
  - Evidence: Manual validation is not required per Validation Contract; automated task-specific checks passed.
- [x] F4: Deployment validation complete or not required
  - Status: completed
  - Evidence: Deployment validation is not required per Validation Contract.
- [x] F5: Archive preflight complete
  - Status: completed
  - Evidence: User approved archive with unrelated repo-wide validation issues to address separately.

## Task Breakdown

| # | Task | Files | Type | Model | Agent | Depends On |
|---|------|-------|------|-------|-------|------------|
| T1 | Add untracked classifier planning primitives | 1-2 files: `pi/extensions/workflow-commands.ts`, maybe tests helper exports | feature | medium | typescript-pro | -- |
| T2 | Add safe ignore/staging primitives | 1 file: `pi/extensions/workflow-commands.ts` | feature | medium | typescript-pro | -- |
| T3 | Add focused pure tests for classifier and staging decisions | 1-3 files: `pi/tests/workflow-commands-pure.test.ts`, `pi/tests/commit-planning.test.ts`, maybe fixtures | test | medium | validation-lead | -- |
| V1 | Validate wave 1 | -- | validation | medium | qa-engineer | T1, T2, T3 |
| T4 | Integrate classifier and staging flow into /commit | 1 file: `pi/extensions/workflow-commands.ts` | feature | medium | typescript-pro | V1 |
| T5 | Add end-to-end command tests for ignored untracked and tracked-to-ignored files | 1-3 files: `pi/tests/workflow-commands.test.ts`, `pi/tests/commit-mutation.test.ts`, fixtures | test | medium | validation-lead | V1 |
| V2 | Validate wave 2 | -- | validation | medium | qa-engineer | T4, T5 |

## Execution Waves

### Wave 1 (parallel)

**T1: Add untracked classifier planning primitives** [medium] -- typescript-pro
- Description: Add pure TypeScript types and helpers that collect untracked files, build the small-model classifier prompt, parse and validate classifier JSON, enforce the allowed decisions `ignore` and `do_not_ignore`, enforce confidence as 0-100, and split results into high-confidence decisions and low-confidence user-question candidates. The prompt must instruct the model to use Git best practices, classify every untracked path, choose only `ignore` or `do_not_ignore`, include a reason, and provide a minimal `.gitignore` pattern for `ignore` decisions. It must not use deterministic rules to bypass model classification for untracked files.
- Files: `pi/extensions/workflow-commands.ts`; optionally pure helper exports in the same file to match existing test patterns.
- Acceptance Criteria:
  1. [ ] Classifier schema accepts only `ignore` and `do_not_ignore` decisions and numeric confidence from 0 to 100.
     - Verify: `cd pi/tests && pnpm test workflow-commands-pure.test.ts commit-planning.test.ts`
     - Pass: tests reject invalid decisions, missing paths, duplicate paths, nonnumeric confidence, and incomplete coverage of input untracked files.
     - Fail: invalid classifier output can proceed; tighten parser/validator.
  2. [ ] Prompt includes Git best-practice guidance and the 85% confidence gate.
     - Verify: inspect exported prompt builder in tests or snapshot-like assertion in `workflow-commands-pure.test.ts`.
     - Pass: test asserts prompt contains allowed decisions, confidence threshold, and examples such as generated logs/metadata vs source/tests/docs.
     - Fail: prompt permits extra actions or lacks the confidence rule.

**T2: Add safe ignore/staging primitives** [medium] -- typescript-pro
- Description: Add pure helpers for applying classifier decisions to commit selection. `ignore` decisions should produce `.gitignore` patterns and remove tracked files from the index without deleting local files. `do_not_ignore` decisions should leave paths eligible for commit only if Git does not consider them ignored. Add staging strategy selection that chooses `git add .` only when the group equals all remaining safe committable files and ignored/generated paths are not in the candidate set; otherwise use scoped `git add -- <files>` for small groups and `git add -u -- <paths>` or `git rm --cached -- <paths>` for deletions/index-only removals. The helper must never propose `git add -f`.
- Files: `pi/extensions/workflow-commands.ts`.
- Acceptance Criteria:
  1. [ ] Ignored-path additions are never passed to `git add`.
     - Verify: `cd pi/tests && pnpm test workflow-commands-pure.test.ts commit-mutation.test.ts`
     - Pass: tests show ignored untracked files are omitted from staging and ignored tracked files use index-only removal.
     - Fail: generated ignored paths appear in `git add` arguments or any `-f` force-add appears.
  2. [ ] Staging strategy prefers `git add .` only when safe.
     - Verify: `cd pi/tests && pnpm test workflow-commands-pure.test.ts`
     - Pass: tests cover single/final full-group uses `git add .`, small partial groups use explicit paths, and groups with ignored files do not use `git add .`.
     - Fail: strategy uses long explicit staging for all-file groups or broad staging when excluded paths remain.

**T3: Add focused pure tests for classifier and staging decisions** [medium] -- validation-lead
- Description: Add tests before or alongside implementation to lock in the MVP behavior. Cover `pi/inspect/snapshots/`-like untracked files classified as `ignore`, source/test/docs classified as `do_not_ignore`, confidence below 85 requiring a user decision, tracked files becoming ignored using index-only removal, and staging command choice thresholds around long path lists.
- Files: `pi/tests/workflow-commands-pure.test.ts`, `pi/tests/commit-planning.test.ts`, `pi/tests/commit-mutation.test.ts` as appropriate.
- Acceptance Criteria:
  1. [ ] Tests exercise the failure mode from this conversation.
     - Verify: `cd pi/tests && pnpm test workflow-commands-pure.test.ts commit-mutation.test.ts`
     - Pass: a test fixture with `pi/inspect/snapshots/*.json` demonstrates ignore classification and no ignored path in `git add`.
     - Fail: tests only cover generic helper exports and not the observed failure class.

### Wave 1 -- Validation Gate

**V1: Validate wave 1** [medium] -- qa-engineer
- Blocked by: T1, T2, T3
- Checks:
  1. Run `cd pi/tests && pnpm test workflow-commands-pure.test.ts commit-planning.test.ts commit-mutation.test.ts`.
  2. Run `cd pi/extensions && pnpm run typecheck`.
  3. Confirm no Bun commands were used for Pi TypeScript validation.
  4. Confirm pure helpers do not force-add ignored files and do not provide classifier actions beyond `ignore` and `do_not_ignore`.
- On failure: create/fix a task, rerun affected checks, then rerun V1.

### Wave 2

**T4: Integrate classifier and staging flow into /commit** [medium] -- typescript-pro
- Blocked by: V1
- Description: Wire the classifier into `executeCommitCommand` / `prepareCommitSelection` before normal commit planning. The sequence should gather untracked files, call the small-model classifier, ask the user only for decisions below 85% confidence, apply accepted ignore decisions to `.gitignore` and the index, recompute Git status, then proceed to commit grouping. Commit grouping should still use the existing planner where appropriate but must operate on the recomputed committable set. Staging should use the new safe staging strategy and avoid very long explicit path lists when `git add .` is safe. Activity logging should show classifier decisions and commands without exposing secrets or full file contents.
- Files: `pi/extensions/workflow-commands.ts`.
- Acceptance Criteria:
  1. [ ] `/commit` classifies untracked files before planning commit groups.
     - Verify: `cd pi/tests && pnpm test workflow-commands.test.ts commit-extension.test.ts commit-planning.test.ts`
     - Pass: tests show classifier call occurs before commit planner/grouping and recompute occurs after `.gitignore` updates.
     - Fail: commit planner sees unfiltered generated untracked files.
  2. [ ] Low-confidence classifier decisions ask the user with only two options.
     - Verify: `cd pi/tests && pnpm test workflow-commands.test.ts`
     - Pass: test mocks a confidence 84 decision and asserts the prompt options are `ignore` and `do_not_ignore` or equivalent labels with no third option.
     - Fail: workflow silently decides below threshold or offers extra choices.
  3. [ ] High-confidence ignore decisions are applied safely.
     - Verify: `cd pi/tests && pnpm test commit-mutation.test.ts workflow-commands.test.ts`
     - Pass: `.gitignore` is updated, ignored untracked files are omitted, tracked ignored files are removed from index, and local files are not deleted.
     - Fail: files are force-added, deleted from disk, or still passed to `git add`.

**T5: Add end-to-end command tests for ignored untracked and tracked-to-ignored files** [medium] -- validation-lead
- Blocked by: V1
- Description: Add integration-style Vitest coverage using temporary Git repositories or existing command mocks. Cover two end-to-end flows: (1) untracked generated snapshots are classified `ignore`, `.gitignore` is updated, source/test files commit normally; (2) already tracked generated snapshots are classified `ignore`, the workflow stages `git rm --cached`/index-only removal and does not fail due ignored paths. Also cover a large candidate set where the final group uses `git add .` safely instead of one long explicit file list.
- Files: `pi/tests/workflow-commands.test.ts`, `pi/tests/commit-mutation.test.ts`, maybe `pi/tests/fixtures/commit/`.
- Acceptance Criteria:
  1. [ ] End-to-end tests reproduce and prevent the observed ignored-path failure.
     - Verify: `cd pi/tests && pnpm test workflow-commands.test.ts commit-mutation.test.ts`
     - Pass: tests fail on old behavior that passes ignored `pi/inspect/snapshots` paths to `git add -A`, and pass with new behavior.
     - Fail: test does not assert command sequence or ignored-path avoidance.
  2. [ ] Large final/single commit can use `git add .` safely.
     - Verify: `cd pi/tests && pnpm test workflow-commands.test.ts`
     - Pass: test with 20+ safe files asserts broad staging is chosen only after ignore filtering and staged-set validation passes.
     - Fail: workflow always emits long explicit `git add` path lists or uses `git add .` while ignored/generated candidates remain unresolved.

### Wave 2 -- Validation Gate

**V2: Validate wave 2** [medium] -- qa-engineer
- Blocked by: T4, T5
- Checks:
  1. Run `cd pi/tests && pnpm test workflow-commands.test.ts workflow-commands-pure.test.ts commit-extension.test.ts commit-planning.test.ts commit-mutation.test.ts`.
  2. Run `cd pi/extensions && pnpm run typecheck`.
  3. Confirm activity logs for classifier decisions are concise and do not include file contents.
  4. Confirm `/commit` never uses `git add -f` and never passes ignored files to `git add` in covered paths.
- On failure: create/fix a task, rerun affected checks, then rerun V2.

## Dependency Graph

```
Wave 1: T1, T2, T3 (parallel) -> V1
Wave 2: T4, T5 (parallel after V1) -> V2
Final: V2 -> F1 -> F2 -> F3 -> F4 -> F5
```

## Success Criteria

1. [ ] `/commit` reviews untracked files with a small-model classifier before commit planning.
   - Verify: `cd pi/tests && pnpm test workflow-commands.test.ts commit-planning.test.ts`
   - Pass: tests demonstrate classifier execution before commit grouping and recomputation of committable files after ignore decisions.
2. [ ] Classifier decisions are constrained to `ignore` and `do_not_ignore`, with user prompt required below 85% confidence.
   - Verify: `cd pi/tests && pnpm test workflow-commands-pure.test.ts workflow-commands.test.ts`
   - Pass: invalid actions are rejected and low-confidence decisions ask the user with only two options.
3. [ ] Ignored generated paths are not staged and tracked generated files can be removed from the index safely.
   - Verify: `cd pi/tests && pnpm test commit-mutation.test.ts workflow-commands.test.ts`
   - Pass: `pi/inspect/snapshots/`-style files are ignored or index-removed without `git add -f` or local deletion.
4. [ ] Staging uses efficient broad staging only when safe.
   - Verify: `cd pi/tests && pnpm test workflow-commands-pure.test.ts workflow-commands.test.ts`
   - Pass: final/single all-file commit can use `git add .`; partial or unsafe groups use narrower staging.
5. [ ] Pi extension validation passes.
   - Verify: `make check-pi-extensions`
   - Pass: exits 0.

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
- Justification: Automated validation is sufficient. The feature includes runtime user prompts for low-confidence classifier decisions, but plan completion can be validated with tests and temporary Git repositories.
- Steps:
  1. None.

If manual validation is required and not confirmed passed, `/do-it` must classify the result as `implemented-awaiting-manual-validation`, update `## Execution Status`, and must not archive the plan. If manual validation is not required, `/do-it` may mark the manual gate complete after recording why automated evidence is sufficient.

### Deployment validation

- Required: no
- Procedure: None. This is a local Pi extension change. Normal use begins after Pi reload/restart or extension reload.

If deployment is required and skipped, cancelled, or fails, `/do-it` must not archive the plan.

### Archive rule

`/do-it` may archive this plan only after all required automated validation, task-specific verification, exceptional manual validation (if required), deployment validation, and repo-wide validation pass. Do not require manual validation merely to increase confidence in non-destructive behavior that automated checks already cover, especially for local/home-lab/new-backed-up systems.

## Execution Status

- Completion classification: completed-and-archived
- Date: 2026-05-19
- Last completed wave/gate: F5 archive preflight.
- Next wave/gate to run: none for this plan; unrelated validation issues are follow-up work.
- Implemented:
  - Added untracked classifier prompt/result validation helpers with `ignore` and `do_not_ignore` decisions and an 85% confidence split.
  - Added safe staging strategy helpers and integrated broad `git add .` for full safe candidate sets.
  - Integrated untracked classification before commit selection/planning, with low-confidence user selection limited to `ignore` and `do_not_ignore`.
  - Added focused pure and mutation tests for classifier parsing, prompt constraints, ignored path omission, and broad staging.
- Commands run and results:
  - `cd pi/tests && pnpm test workflow-commands-pure.test.ts commit-mutation.test.ts` - passed after fixing a test ordering assertion.
  - `cd pi/extensions && pnpm run typecheck` - passed after adding `ui.select` to the local workflow UI interface and matching the existing string-option UI contract.
  - `cd pi/tests && pnpm test workflow-commands.test.ts workflow-commands-pure.test.ts commit-extension.test.ts commit-planning.test.ts commit-mutation.test.ts` - passed, 5 files and 76 tests.
  - `make check-pi-extensions` - failed in `tests/read-expertise-retrieval.test.ts`; all 16 tests fail because `readTool` is undefined (`mockPi._getTool("read_expertise")` returned undefined). Evidence: `TypeError: Cannot read properties of undefined (reading 'execute')` at `tests/read-expertise-retrieval.test.ts:129` and related cases. Local code inspection shows `pi/extensions/agent-chain.ts` currently says expertise tools are intentionally not registered.
  - `make check` - failed at `uv run ruff check` with `Distribution dotfiles-tests==0.1.0 @ editable+. can't be installed because it is marked as --no-build but has no binary distribution`.
- Why archived: User approved archive because commit-command implementation and task-specific validation are complete; unrelated repo-wide validation issues are follow-up work.
- Commands/checks still needed for follow-up validation cleanup:
  1. Resolve the unrelated `read_expertise` test/tool registration mismatch, then rerun `make check-pi-extensions`.
  2. Resolve the local `uv --no-build` editable install blocker, then rerun `make check`.
- Remaining manual steps: none required by the plan.

## Handoff Notes

- Use pnpm for Pi TypeScript validation. Do not use Bun for Pi extension or Vitest validation in this repo.
- The selected direction is Option B: LLM-only untracked classifier. Deterministic safeguards are allowed after model output, but the workflow should not silently auto-classify untracked files before the model sees them.
- Use the existing `/commit` implementation in `pi/extensions/workflow-commands.ts`; avoid creating a separate command surface.
- The observed failure came from ignored generated files under `pi/inspect/snapshots/` being included in explicit `git add -A --` arguments. Tests should reproduce that class of failure.
- Keep prompts and activity output concise; do not include file contents in classifier activity logs.
- `make check` may fail in this local environment due unrelated uv/tooling issues. If so, record the exact failure and require `make check-pi-extensions` plus focused tests to pass before archive.
