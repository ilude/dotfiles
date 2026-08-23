# T0 Result

## Evidence Frozen

- Architecture reviews: `reviews/01-scheduler-lifecycle.md`, `reviews/02-operator-ux-terminology.md`, and `reviews/03-program-dispatch-durable-tasks.md`.
- Initial hunk classification: `hunk-dispositions.md`.

## Removed Invalid State

Returned these files to the repository baseline because their initial diffs implemented duplicate lifecycle authorities or asserted invalid states:

- `pi/extensions/tasks.ts`
- `pi/tests/tasks.test.ts`
- `pi/extensions/subagent/workflow-runtime.ts`
- `pi/tests/subagent-workflow.test.ts`
- `pi/extensions/subagent/run-manager.ts`
- `pi/tests/subagent-run-manager.test.ts`
- `pi/extensions/subagent/tree-runtime.ts`
- `pi/tests/subagent-tree-runtime.test.ts`
- `pi/extensions/subagent/ui.ts`

This removed the duplicate runtime inbox, persisted readiness metadata, root-as-blocker edges, premature completion behavior/tests, aggregate completion retention, and duplicate broker/run-manager lease projection. Unrelated working-tree changes were not modified.

## Baseline Validation

- `cd pi && pnpm run typecheck` - passed after removing the stale UI lease projection.
- `cd pi && pnpm test subagent-run-manager.test.ts subagent-tree-runtime.test.ts subagent-workflow.test.ts tasks.test.ts operator-status.test.ts subagent.test.ts model-routing.test.ts orchestration-telemetry.test.ts` - initially 219 passed and 1 failed because the remaining UI footer hunk conflicted with the retained baseline test.
- `cd pi && pnpm test subagent-run-manager.test.ts` - passed, 11 tests, after returning `pi/extensions/subagent/ui.ts` to baseline.
- `cd pi && pnpm run typecheck` - passed after the UI correction.

The first repository-root `pnpm run typecheck` invocation did not execute a code check because the root has no `package.json`; the valid typecheck results above ran from `pi/`.
