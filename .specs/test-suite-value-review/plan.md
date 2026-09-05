---
created: 2026-09-05
status: ready
---

# Implement and evaluate test-suite value review

## Objective

Deliver the PRD's root-coordinated JavaScript/TypeScript test-suite value review capability, with supported calibration and a complete, revision-reconciled dotfiles baseline that preserves known test protection and reports assessment gaps honestly.

## Completion Evidence

- Evidence: The discovered prompt, skill, and closed-read reviewer implement the complete inventory -> review -> verify -> report -> resume/invalidate loop. Focused deterministic checks establish loading, authority, and checkpoint safety. Root-verified calibration is supported, and the dotfiles baseline closes at one commit with every owned test accounted for, canonical timing samples shared without double counting, verified findings/dispositions, and explicit limits. Owned implementation artifacts and the archived plan are committed, merged, and verified; generated review state/reports remain untracked.
- Fails when: A PRD obligation is omitted; a child can mutate or execute arbitrary shell; concurrent writers silently overwrite evidence; pending/stale units disappear; shared timing is duplicated or falsely attributed; unknown evidence is reused as current; calibration misses a seeded contract-threatening defect or recommends away known unique protection; real remediation runs without its separate request; or assessment/savings claims exceed evidence. Rejected or blocked evaluation is an incomplete objective, not a passing release.

## Boundaries

- In scope: All REQ-001 through REQ-055, NFR-001 through NFR-005, and 14 acceptance criteria in [PRD.md](../../docs/research/obsidian-vault/agent-workflows/workflow-ideas/test-suite-value-review/PRD.md), using the [operating model](../../docs/research/obsidian-vault/agent-workflows/workflow-ideas/test-suite-value-review/operating-model.md). Own the prompt, skill/references, agent, focused checks/fixtures, and operator documentation named below. Runtime evidence remains under the selected Git common directory; calibration resources remain disposable.
- Out of scope: General production review; semantic browser E2E review; independent repositories/submodules; actual fixes to dotfiles tests or production seams; installation during review; CI mutation, infrastructure access, or external publication; generic subagent/workflow API changes; new extensions, standalone CLI, database, queue, telemetry service, content fingerprints, or numeric quality/confidence scores.
- Preserve: Supplied requirement strength and exceptions, mode overrides, no overall baseline budget, serial measurement, no-change conclusions, root verification, trusted-policy and containment boundaries, existing runner configuration, unrelated working-tree changes, module checkouts, and runtime data. The product's later remediation worktree retains its no-automatic-integration/no-cleanup rule.
- Assumptions: `/do-it` must create and own the implementation worktree before implementation, validation, archive, or commit. Existing accessible configured dependencies may be used; missing tooling blocks affected validation without installation. Jest and authenticated CI are not assumed available. Primary `main` was clean at planning inspection; recheck at execution. Git, transfer, and merge constraints are execution context, not planning blockers.

The PRD is the product authority. This implementation workflow uses default archive/commit/merge/cleanup. REQ-051 through REQ-055 instead govern a later test-remediation request; they do not require retaining the capability's implementation worktree.

## Tasks

- [ ] **T1: Deliver a loadable root-owned review loop**
  - Files: `pi/prompts/test-review.md`; `pi/skills/test-review/SKILL.md`; `pi/skills/test-review/references/review.md`; `pi/skills/test-review/references/lifecycle.md`; `pi/skills/test-review/references/evidence.md`; `pi/skills/test-review/references/remediation.md`; `pi/skills/test-review/references/calibration.md`; `pi/skills/test-review/scripts/state.mjs`; `pi/agents/test-reviewer.md`; `pi/tests/test-review.test.ts`; `pi/tests/fixtures/test-review/`; `pi/README.md`; `CHANGELOG.md`.
  - Change: Implement one prompt/skill/agent workflow. First prove native prompt/skill loading, dynamic agent discovery, closed-read authority preparation, and a root-written checkpoint for two behavior clusters sharing one command in a disposable Git repository. Use real loaders and filesystem seams with injected reviewer results, not provider calls. Expand that same loop to every PRD mode, complete inventory/accounting, Git invalidation/final-commit reconciliation, evidence/report/disposition rules, optional performance/smell/coverage/mutation paths, and separately requested remediation instructions. Reuse existing testing/TypeScript/Playwright guidance and versioned runner evidence; do not copy research wholesale. The child receives review guidance and returns candidates, no-change conclusions, or bounded context requests, never the root's command/write workflow. Limit the private state helper to exclusive initialization and locked atomic JSON updates with owner/identity checks; it cannot choose work, judge evidence, launch agents/commands, or render reports. Reuse installed locking support and the atomic-write precedent, without a new dependency or general state engine. Finish with operator usage and changelog documentation.
  - Done when: The actual loaded definitions and checkpoint boundary support a provider-free representative review-loop transcript that resumes from its written state without repeating a shared measurement or accepting a competing writer. Direct PRD-to-owner inspection accounts for every requirement in its owning instruction/reference or executable boundary. Calibration fixtures are ready without adding another runtime or accidentally running known-bad samples as ordinary Pi tests.
  - Verify: deterministic Run `pnpm test test-review.test.ts` from the owned worktree's `pi/` after the representative loader/authority/checkpoint slice exists; expand only after it passes. Run the expanded focused file once when T1 settles, exercising real concurrent initialization/update, interrupted-write preservation, owner mismatch, containment, malformed state, and shared-sample reuse with fixed reviewer results. Inspect all remaining prose obligations directly against the PRD, not source-spelling assertions. No aggregate suite or typecheck for Markdown-only changes. Stop dependent expansion on a failed seam, classify it, and rerun only the affected check after a concrete correction. If a generic TypeScript/runtime contract must change, stop as out of scope instead of silently expanding the implementation.

- [ ] **T2: Evaluate the loop against known-answer calibration**
  - Files: Committed T1 resources and fixtures (read-only); one owned OS-temporary calibration root containing fixture repositories and isolated Pi/session/review state; bounded result references in `.specs/test-suite-value-review/plan.md`.
  - Change: Execute the predeclared calibration protocol below, using root-established contracts/counterfactual answers withheld from the reviewer. Invoke the actual prompt/skill and exact closed-read reviewer through the existing harness. The root directly drives commands and transitions; child output is the subject evaluated, not the controller of the check or its verdict. Use disposable repositories only. This plan's execution authorizes the fixture-only remediation demonstration; issue its fix request explicitly inside the isolated session after fixture baseline closeout.
  - Done when: One independently adjudicated supported, rejected, or blocked calibration record covers the prescribed review-loop scenario and records settled children and cleanup. Supported requires all PRD calibration/safety checks. Rejected completes this evaluation but does not satisfy the objective or permit T3. Unavailable required runtime/evidence is blocked, not a fabricated pass.
  - Verify: live Observe the single predeclared review-loop calibration protocol, compare actual outputs against independent expected contracts, Git revisions, inventory sets, measurement references, candidate dispositions, and sentinels. Stop children before cleaning owned fixtures; preserve only bounded redacted evidence outside temporary storage. A miss, unsafe accepted deletion, invalid closeout, or authority violation ends the attempt rejected; missing prerequisites end it blocked after retaining independent evidence. No automatic retry or fixture-specific prompt tuning. Diagnose first; another attempt requires separate authorization after a supported correction.
  - Max attempts: 1
  - Session: One root-controlled disposable calibration session with isolated fixture Git repositories and Pi state; existing provider authentication is read-only and never copied into fixtures/reports.
  - Terminal outcomes: supported | rejected | blocked
  - Depends on: T1

- [ ] **T3: Establish the complete dotfiles baseline**
  - Files: The clean committed implementation worktree's owned tests/source/configuration (read-only); a distinct baseline namespace under its `<git-common-dir>/test-review/`; bounded result references in `.specs/test-suite-value-review/plan.md` after closeout.
  - Change: Require a supported T2 verdict. Commit settled implementation artifacts and plan progress on the owned workflow branch before baseline start, giving the trial a clean attributable revision. Inventory every owned JavaScript/TypeScript runtime and compile-time test through Git and configured discovery, including disabled tests and dependencies; exclude independent repositories explicitly, including `modules/` contents, and route browser E2E semantic work separately. Run the actual baseline, not a simulation/path smoke. Root-verify candidates and accounting, measure serially, record dispositions and maintainer cost, and reconcile to one final commit. Do not repair trial findings. Keep review state/report local; update plan evidence only after the baseline no longer requires a clean worktree.
  - Done when: The complete root-verified dotfiles report is closed-assessed or closed-with-gaps at one commit, with no pending/stale unit or unsupported protection/savings claim, and the trial has not modified reviewed source or primary state. Missing dynamic evidence can remain explicit unit gaps; inability to establish inventory, trustworthy state, or revision reconciliation blocks completion. Rejected T2 cannot be bypassed as advisory calibration.
  - Verify: live Observe one complete baseline and compare report ownership/inventory against tracked files and configured discovery, statuses against evidence/gap reasons, shared timing IDs against actual commands/scopes, and findings against contracts/root verification. Inspect Git revision/cleanliness at start and closeout. Settle children and release only this baseline's writer ownership; retain required state/report and clean only owned transient execution artifacts. Unauthorized targets remain unexecuted. Product failure or unknown inventory ends rejected/blocked with partial state preserved, not restarted. Resuming this same baseline continues the same attempt and retains valid work; the attempt cap is not an overall time/unit budget.
  - Max attempts: 1
  - Session: Root-owned baseline session in the clean committed implementation worktree, using an explicit distinct namespace in the dotfiles Git common directory; no infrastructure, independent-repository execution, or unrelated state mutation.
  - Terminal outcomes: supported | rejected | blocked
  - Depends on: T2

## Live attempt ledger

| Task | Attempt | Preconditions | Result | Cleanup | Disposition |
| --- | --- | --- | --- | --- | --- |

## Execution Strategy

Root owns integration, commands, state, and acceptance. Independent semantic reads may be parallel, but timing cannot overlap other review-owned execution. Child timeouts yield partial evidence rather than truncating the overall baseline. Do not duplicate unit state in the task registry or add scheduling infrastructure.

### State and invocation

Use one JSON checkpoint and manually composed Markdown report per explicit baseline under `<git-common-dir>/test-review/<baseline-name>/`. Validate canonical containment; a baseline name is an identifier, not an arbitrary path. Record repository/scope identity, root owner, starting/per-unit/final revisions, units/dependencies/status, measurement references, findings/dispositions, and gap/evidence summaries. Keep complete accounting; bound each evidence excerpt initially to 4 KiB and disclose truncation rather than cap unit count. Use a short-held exclusive lock for checkpoint updates and reject owner mismatch. Interrupted-root handoff is explicit and validated; no silent stale-owner takeover, lease daemon, event stream, fingerprints, state auto-repair, or report generator.

Syntax: `/test-review [baseline|diff|path|deep-performance|smells] [scope and instructions]`. Unqualified mode follows the operating-model table. Explicit baseline resumes active work/reopens requested gaps; a complete refresh requires an explicit request. Report selected scope/identity before writing; ambiguous baseline matches require selection. Dirty limited-mode reports cannot advance committed baseline state.

Set finite overridable command bounds before execution: initial fallback 300 seconds, replaced by repository configuration or justified observed runtime. There is no total baseline budget. Use current root tools only after checking their timeout/tree-cleanup contract; do not create a process supervisor.

### Calibration protocol

Keep known-bad fixture sources outside ordinary configured discovery, then copy them into disposable Git repositories. Keep expected answers outside reviewer read authority. Use installed Node Test and Vitest/TypeScript for executable fault evidence. Include version-pinned Jest source/config examples for semantic interpretation; when Jest is unavailable, record static-only evidence rather than installing it or executing with Vitest.

One root-driven timeline covers absent baseline -> two clusters sharing a command plus an independent control -> partial checkpoint -> interruption -> committed unit/shared-setup changes and added/removed tests -> resume -> dirty in-flight result withholding -> clean final reconciliation -> unchanged/gapped and explicit limited modes -> fixture-only remediation from the recorded final commit. Include parent/child dirt and gitlink variants, an unavailable dependency, an unexecuted fake external target, a bounded local hanging child, competing ownership, and missing revision/unknown dependency evidence. Use fixed inputs at protocol seams, not model-selected tool behavior.

Use the six operating-model calibration cases for semantic review: hidden known regression, unique protection, redundant tests, justified complexity/slowness, harmless weakness, and uncertain equivalence. Root independently records detections, omissions, false mandatory cleanup, unsafe accepted deletion, and justified abstention. Check candidate/verified separation, shared-finding and baseline-debt deduplication, trusted-policy adversarial content, and measurement attribution within the declared protocol. Stop on the first safety/calibration failure, not an expanding retry matrix. Passing fixed protocol records does not prove semantic quality; actual live reviewer results must meet the known-answer acceptance.

The fixture remediation segment proves one worktree begins at the final reviewed commit, gap-dependent fixes are refused, a gap-independent verified fix produces a focused validated commit, and fixture primary/remotes remain unchanged. Observe retained branch/worktree before teardown. The protocol explicitly authorizes cleanup of only its disposable fixture resources after that observation, without changing the product retention rule.

PRD acceptance criteria 1, 3-11, 13, and 14 are exercised through T1/T2. Criteria 2 and 12 require T3, which also verifies actual accounting, measurement, and revision validity across the real suite. A rejected evaluation is a valid recorded terminal result, but never a substitute for product acceptance; preserve the incomplete plan and stop dependent execution.

### Existing contracts and execution preflight

- Pi loading: installed `@earendil-works/pi-coding-agent` 0.84.4 `docs/prompt-templates.md`, `docs/skills.md`, and `docs/environment-variables.md`; native explicit template/skill paths and `PI_CODING_AGENT_DIR` support isolated resources. Re-read installed versions at execution, not guessed CLI options.
- Agent discovery/authority: `pi/extensions/subagent/agents.ts` (`loadAgentsFromDir`, `withAgentCatalog`), `pi/extensions/subagent/index.ts` (`resolveChildToolAuthority`), `pi/extensions/subagent/contracts.ts`, `pi/tests/subagent-t1.test.ts`, and `pi/skills/pi-extension/references/contracts/subagents-and-tasks.md`. Reload refreshes the dynamic catalog. Failed discovery blocks dispatch, not permission to substitute an agent or widen authority.
- Atomic writes: `pi/lib/settings-file.ts` is the existing pattern; `proper-lockfile` is installed through `pi/package.json`. Before writing the minimal private helper, verify the installed lock options and Node filesystem contract. Do not reuse settings paths or create backups. This helper protects checkpoint writes only; it is not a new public CLI or runtime orchestrator.
- Process isolation: `pi/scripts/run-isolated-pi-smoke.mjs`, `pi/lib/process-tree.ts`, `pi/extensions/bash-cwd.ts`, and current tool schemas. Reuse isolation patterns, not unverified assumptions about whole-tree cancellation. Verify the selected mechanism's installed implementation before the hanging-child scenario.
- Git: maintained `git help status`, `git help rev-parse`, `git help diff`, and `git help worktree`; use the operating model's `--ignore-submodules=dirty` interpretation, resolve the selected worktree's actual common directory, and never initialize/change module branches automatically.
- Runner ownership: `pi/package.json`, `pi/tests/vitest.config.ts`, `pi/skills/testing/SKILL.md`, and `pi/skills/typescript/testing.md`. Pi uses pnpm and direct test filters, without an extra `--`. Discover other owned package runners during T3, not an assumption that all tests use Vitest.
- Implementation lifecycle: `pi/skills/workflow/do-it.md` and `pi/skills/pi-extension/references/contracts/workflow-lifecycle.md` remain unchanged.

## Validation

- [ ] After T1 settles, inspect its recorded focused result and direct PRD-to-owner review; no unchanged rerun. Expected: loadable closed-read workflow, protected root writes, every requirement represented.
- [ ] After T2 settles, inspect independent calibration verdict and cleanup evidence once. Expected: supported; misses, unsafe recommendations, or missing required evidence stop objective completion and T3 without automatic extra attempts.
- [ ] After T3 settles, inspect retained inventory/report/reconciliation once. Expected: complete ownership accounting, honest assessed/with-gaps status, no stale evidence, serial deduplicated timing, verified findings, and no real remediation. Do not rerun an unchanged suite to confirm a valid timing sample.
- [ ] At closeout, run `git diff --check` on settled implementation changes and inspect ASCII punctuation/LF and local links. Archive and commit only owned artifacts in the implementation worktree, merge with `--no-ff`, verify merged HEAD and ownership/clean states, then remove only the owned implementation branch/worktree. Preserve the baseline's actual reviewed commit; the later archive/merge commit is not retroactively measured. Failure preserves recovery rather than replaying closeout.

## Retention

Keep incomplete work at `.specs/test-suite-value-review/plan.md`. After completion, `/do-it` archives this directory to `.specs/archive/test-suite-value-review/`.

Default implementation closeout is archive, commit, merge, verify, then owned branch/worktree cleanup. Never force-add an ignored plan. Retain local baseline state/report in the Git common directory. REQ-054 applies to later remediation worktrees, not this implementation worktree. Rejected/blocked objective evidence leaves the plan incomplete and work recoverable.

## Execution Status

- State: Ready; implementation has not started.
- Blocker: None at planning. Missing runtime prerequisites, failed calibration, or unclean/unreconciled trial state are execution stop conditions above.
- Next: T1.
- Current frontier: T1; verify with `pnpm test test-review.test.ts` from owned-worktree `pi/` after the representative slice exists; remaining live attempts: T2 1, T3 1.
- Resume: `/do-it .specs/test-suite-value-review/plan.md`
