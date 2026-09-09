# Default-profile extension review implementation order

Scope corrected by operator direction: this workstream targets `pi/profiles/default/` and dependencies it actually consumes. Legacy-only repairs and cross-profile consolidation are not part of it. This index records order, not a second task/status registry; each plan owns its scope, checks and completion evidence. Plan corrections do not authorize implementation.

## Independent starting work

These plans can start concurrently in separate worktrees after execution authorization. Priority is listed below, not a requirement to finish each before starting the next.

| Priority | Plan | Starting requirements |
| --- | --- | --- |
| 1 | [Damage Control bypass](default-damage-control-bypass/plan.md) | Default policy boundary; no prerequisite plan. |
| 2 | [Command invocation ownership](default-command-invocation-ownership/plan.md) | Default invocation/tool authority; no prerequisite plan. |
| 3 | [Subagent cleanup failures](default-subagent-cleanup-failures/plan.md) | Default process/pane cleanup error handling; no prerequisite plan. Not a live orphan-removal task. |
| 4 | [Onclave delivery reliability](onclave-delivery-reliability/plan.md) | Included because default loads this adapter. Use its owning module worktree and repository preflight. |
| 5 | [Bedrock baseline create-once](bedrock-baseline-create-once/plan.md) | Default accounting mutation boundary; no prerequisite plan. |

## Work requiring predecessor code

**Subagent cleanup -> [subagent failure reporting/control UX](subagent-failure-reporting-and-control-ux/plan.md).**

Finish and merge cleanup first. Before UX implementation starts, create its worktree from updated `main`, or integrate the cleanup commit into an already-created worktree without discarding existing work. Verify and record that commit in the UX plan. The UX implementation must use the resulting resource-state and cleanup-error contract in `rpc.ts`, `visible.ts`, `extensions/subagents.ts` and their tests; do not independently design a competing contract against the old code.

UX can then run alongside any still-active independent plans above. Shared documentation edits alone are merge coordination, not implementation dependencies.

## DRY draft: scope reassessment before implementation

The existing [DRY plan](pi-stateless-extension-deduplication/plan.md) remains at its current path, but is now a default-only draft. Its previous cross-profile extraction tasks and legacy truncation work are withdrawn. No new plan set or replacement refactoring requirements are implied.

The next step is a bounded review of actual default-local benefit. This read-only planning work may run alongside the correctness plans. Before any refactor is made executable, name its exact source/contract overlap and required predecessor commits. There are no blanket prerequisites on command ownership, Bedrock baseline, legacy web-fetch or legacy task evidence. If a selected refactor changes subagent runtime code, sequence it after the owning cleanup/UX work rather than implementing against stale contracts. No concrete refactor has been selected by this scope correction.

## Deferred, outside this workstream

These plans are preserved, not deleted, completed or queued for default implementation:

- [Legacy web-fetch correctness](legacy-web-fetch-correctness/plan.md).
- [Legacy task-completion evidence](legacy-task-completion-evidence/plan.md).
- [Herdr state-delivery consolidation](herdr-state-delivery-consolidation/plan.md). The demonstrated unbounded queue was legacy-only; default already coalesces pending state. No default defect justifies this consolidation, and the generated default reporter remains unchanged. There is no Herdr ownership question blocking this workstream.

Resuming any deferred plan requires a separately requested scope, not completion of a default prerequisite.

## Worktree and integration rules

- A dependency means predecessor code must be present before successor implementation starts, not merely that merges happen in a preferred order. Record the prerequisite commit and verify ancestry in the successor worktree.
- Independent plans may start from the same current `main`. Do not require every correctness plan to finish before unrelated work can proceed.
- Serialize merges into dotfiles `main`. Preserve additive `CHANGELOG.md` and `pi/README.md` changes and all unrelated work. Re-run only checks whose covered inputs changed during reconciliation.
- Avoid concurrent installs or mutation of shared dependency links. Use profile-owned dependencies and isolated test state; follow each plan's finite checks.
- Onclave implementation stays in `modules/onclave`; the default loader stays thin. Other consumers receive the same adapter fix, but this does not authorize legacy customization. Follow safe required-branch reconciliation and module-first publication/gitlink integration. Push remains separately authorized.
- Active-child reload teardown, migration and recovery remain excluded. Cleanup reliability concerns ordinary cancellation, reset and shutdown, not new reload support or live process hunting.
