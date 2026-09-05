---
created: 2026-09-05
status: complete
completed: 2026-09-05
---

# Implement test-suite value review

## Objective

Deliver the root-coordinated JavaScript/TypeScript test-suite value review capability and its focused deterministic validation. Archive, commit, merge, and clean up the owned implementation workflow after Git safety checks permit it.

## Operator scope correction

The operator rejected running live trials and then explicitly requested plan completion, merge, and cleanup. T3 calibration and T4 real dotfiles baseline execution are removed from required acceptance and explicitly skipped, not passed. No live calibration, fixture remediation demonstration, real-suite review, or OAuth login/refresh was performed for those tasks. The earlier authentication investigation is not an outstanding product or closeout requirement.

This decision supersedes the original plan's trial-dependent objective, completion evidence, execution strategy, live protocol, and validation gates. It does not establish semantic reviewer quality or a complete real-world baseline. The original plan remains in Git history at b74b2a86.

## Completion Evidence

- Evidence: Native prompt/skill loading, discovered reviewer authority, exclusive checkpoint initialization, owner/identity checks, atomic replacement, containment, and a real-Git representative resume/invalidation regression pass the focused deterministic test file. The capability artifacts and operator documentation are committed. Archive, merge, and cleanup are separately verified at workflow closeout.
- Fails when: The deterministic checks fail, unrelated work is discarded or included, live trials run despite the scope correction, skipped evaluation is reported as passing, or merge/cleanup is claimed without verification.

## Boundaries

- In scope: The prompt, skill and two references, closed-read reviewer, private checkpoint helper, focused tests and calibration fixture resources, operator documentation, and changelog already implemented in b74b2a86. Source requirements remain REQ-001 through REQ-055 and NFR-001 through NFR-005 in `docs/research/obsidian-vault/agent-workflows/workflow-ideas/test-suite-value-review/PRD.md`, interpreted with its operating model and the explicit operator scope correction above.
- Out of scope: Running the capability on live examples or the dotfiles suite; changing authentication; actual test remediation; independent repositories/submodules; new runtime orchestration infrastructure; unrelated working-tree changes.
- Preserve: Root verification, read-only reviewer authority, honest evidence limits, serial shared measurements, existing runner configuration, and separately authorized remediation. Later remediation worktrees retain their no-automatic-integration/no-cleanup rule.
- Implementation workspace: `C:/Users/mglenn/.dotfiles/.worktrees/test-suite-value-review`, branch `workflow/test-suite-value-review`, with its existing durable ownership record. This implementation uses default merge-and-cleanup closeout, not remediation retention.

## Tasks

- [x] **T1: Deliver a loadable root-owned review loop**
  - Files: `pi/prompts/test-review.md`; `pi/skills/test-review/SKILL.md`; `pi/skills/test-review/references/review.md`; `pi/skills/test-review/references/lifecycle.md`; `pi/skills/test-review/scripts/state.mjs`; `pi/agents/test-reviewer.md`; `pi/tests/test-review.test.ts`; `pi/tests/fixtures/test-review/`; `pi/README.md`; `CHANGELOG.md`.
  - Change: Implement native loading, discovered closed-read authority, a root-written checkpoint, supported review modes, inventory/revision/evidence/report instructions, and separate remediation guidance. Keep the helper private and limited to contained locked atomic JSON operations; do not give the reviewer the root skill.
  - Done when: The integrated capability, focused regressions, fixture resources, and documentation are authored. Source inspection accounts for the requirements without claiming live behavior from prose.
  - Verify: deterministic Source inspection and the T2 executable checks.
  - Result: Implemented and committed in b74b2a86. Calibration fixtures remain resources, not a claim of executed calibration.

- [x] **T2: Validate the integrated review capability**
  - Files: T1 artifacts and this plan's recorded results.
  - Change: Run focused provider-free validation after implementation settles, preserving failures and operator-authorized repair history.
  - Done when: Native prompt and skill loaders, actual reviewer discovery and resolved authority, checkpoint write safety, and the disposable Git representative transcript pass. A shared command is measured once; actual Git comparison invalidates both affected clusters while independent evidence carries forward.
  - Verify: deterministic `pnpm test test-review.test.ts` from the owned worktree's `pi/`; formatting and source inspection of the settled changes.
  - Depends on: T1
  - Result: Five tests passed on the latest authorized run. `git diff --check` and staged whitespace checks passed. Dolos staged scanning passed before b74b2a86. No unchanged checks need rerunning for this plan-only closeout update.

- [x] **T3: Known-answer calibration - skipped by operator**
  - State: skipped
  - Change: Do not launch the planned live trial or fixture remediation demonstration.
  - Done when: The cancellation and evidence limit are recorded without a fabricated supported verdict.
  - Verify: deterministic Inspect the scope correction and prior execution record; no live attempt or child was started.
  - Depends on: T2
  - Result: Skipped at the operator's direction. No calibration result exists.

- [x] **T4: Complete dotfiles baseline - skipped by operator**
  - State: skipped
  - Change: Do not run the capability against the real suite as part of implementation closeout.
  - Done when: The removed execution scope is recorded without claiming inventory completeness, measured savings, or a reviewed final baseline revision.
  - Verify: deterministic Inspect the scope correction and prior execution record; no baseline attempt was started.
  - Depends on: T3
  - Result: Skipped at the operator's direction. No real-suite baseline report exists.

## Validation

- [x] Focused deterministic tests: `pnpm test test-review.test.ts` passed all five tests.
- [x] Settled implementation formatting: `git diff --check` and staged whitespace checks passed; LF/ASCII and source boundaries were inspected.
- [x] Live calibration acceptance: explicitly removed by the operator, not executed or passed.
- [x] Real-suite baseline acceptance: explicitly removed by the operator, not executed or passed.

Closeout safety checks remain at their mutation boundaries. Preserve unrelated primary changes. Commit only owned artifacts; merge with `--no-ff` only into a clean primary worktree. Then call `plan_archive` with the original plan path to verify exact merged/archive state and clean only the owned branch/worktree. Do not claim closeout success until that tool succeeds.

## Retention

Archive this complete implementation spec to `.specs/archive/test-suite-value-review/` in the owned worktree and commit it. Default closeout merges with `--no-ff`, verifies, and removes only this owned workflow branch/worktree. Never force-add ignored artifacts, discard unrelated changes, or remove recovery state before verification.

If merge or cleanup is blocked, retain the owned branch, worktree, and ownership record. Resume closeout using `/do-it .specs/test-suite-value-review/plan.md`; the completed archive selects closeout-only recovery. Do not repeat implementation or reinstate cancelled live tasks.

## Execution Status

- State: complete
- Scope: Implementation and deterministic acceptance complete; T3/T4 explicitly skipped by operator. Workflow closeout remains pending until merge and verifier success.
- Evidence: b74b2a86 contains the implementation. The latest root-owned focused run passed all five tests; formatting and Dolos scanning passed. Earlier dependency-link, discovery-shape, Windows replacement, import-only resolution, and isolated task-store failures were repaired through operator-authorized batches; their history remains in b74b2a86 and the session record. No further development check is required for the plan-only closeout change.
- Closeout blocker: Primary `main` has unrelated uncommitted changes, including overlapping CHANGELOG.md and pi/README.md plus subagent code/instructions. Those changes are preserved. No merge has been attempted; no branch/worktree cleanup is authorized before a verified merge.
- Next: Commit the completed archive in the owned workflow. Once the primary changes are safely settled by their owner, merge the workflow with `--no-ff` and call `plan_archive` with the original plan path.
- Live activity: No calibration or baseline child/process was launched; no trial cleanup or credential change is required.
