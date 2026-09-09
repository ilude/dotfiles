# Default-profile extension review implementation order

Scope corrected by operator direction: this workstream targets `pi/profiles/default/` and dependencies it actually consumes. Legacy-only repairs and cross-profile consolidation are not part of it. This index records order, not a second task/status registry; each plan owns its scope, checks and completion evidence. Plan corrections do not authorize implementation.

## Independent starting work

These plans can start concurrently in separate worktrees after execution authorization. Priority is listed below, not a requirement to finish each before starting the next.

| Priority | Plan | Starting requirements |
| --- | --- | --- |
| 2 | [Command invocation ownership](default-command-invocation-ownership/plan.md) | Default invocation/tool authority; no prerequisite plan. |
| 3 | [Subagent cleanup failures](default-subagent-cleanup-failures/plan.md) | Default process/pane cleanup error handling; no prerequisite plan. Not a live orphan-removal task. |
| 4 | [Onclave delivery reliability](onclave-delivery-reliability/plan.md) | Included because default loads this adapter. Use its owning module worktree and repository preflight. |
| 5 | [Bedrock baseline create-once](bedrock-baseline-create-once/plan.md) | Default accounting mutation boundary; no prerequisite plan. |

Already completed and archived: [Damage Control bypass](archive/default-damage-control-bypass/plan.md).

## Work requiring predecessor code

**Subagent cleanup -> [subagent failure reporting/control UX](subagent-failure-reporting-and-control-ux/plan.md).**

Finish and merge cleanup first. Before UX implementation starts, create its worktree from updated `main`, or integrate the cleanup commit into an already-created worktree without discarding existing work. Verify and record that commit in the UX plan. The UX implementation must use the resulting resource-state and cleanup-error contract in `rpc.ts`, `visible.ts`, `extensions/subagents.ts` and their tests; do not independently design a competing contract against the old code.

UX can then run alongside any still-active independent plans above. Shared documentation edits alone are merge coordination, not implementation dependencies.

## Retired and archived

At the operator's request, these plans are archived as `retired`, not completed. Their findings and unfinished tasks are preserved, but none remains queued or a prerequisite for default work:

- [Legacy web-fetch correctness](archive/legacy-web-fetch-correctness/plan.md): legacy-only fetch repair.
- [Legacy task-completion evidence](archive/legacy-task-completion-evidence/plan.md): legacy-only task parser repair.
- [Herdr state-delivery consolidation](archive/herdr-state-delivery-consolidation/plan.md): the demonstrated unbounded queue was legacy-only; default already coalesces pending state. The generated default reporter remains unchanged, with no ownership question blocking this workstream.
- [Stateless extension deduplication](archive/pi-stateless-extension-deduplication/plan.md): cross-profile extraction was withdrawn and no concrete default-local refactor was selected. Its proposed reassessment is no longer queued.

Retirement does not claim implementation or validation. Resuming any of these requires a separately requested scope, not completion of a default prerequisite.

## Worktree and integration rules

- A dependency means predecessor code must be present before successor implementation starts, not merely that merges happen in a preferred order. Record the prerequisite commit and verify ancestry in the successor worktree.
- Independent plans may start from the same current `main`. Do not require every correctness plan to finish before unrelated work can proceed.
- Serialize merges into dotfiles `main`. Preserve additive `CHANGELOG.md` and `pi/README.md` changes and all unrelated work. Re-run only checks whose covered inputs changed during reconciliation.
- Avoid concurrent installs or mutation of shared dependency links. Use profile-owned dependencies and isolated test state; follow each plan's finite checks.
- Onclave implementation stays in `modules/onclave`; the default loader stays thin. Other consumers receive the same adapter fix, but this does not authorize legacy customization. Follow safe required-branch reconciliation and module-first publication/gitlink integration. Push remains separately authorized.
- Active-child reload teardown, migration and recovery remain excluded. Cleanup reliability concerns ordinary cancellation, reset and shutdown, not new reload support or live process hunting.
