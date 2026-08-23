# Program Dispatch and Durable Tasks Review

Source run: `99e0ab5b-f3e4-4b44-b9ed-54c669d34c66`

## Findings

1. A single program and task model is absent. `BoundedWorkflowProgramRuntime` owns an independent graph in `pi/extensions/subagent/workflow-runtime.ts:180-226,1290-1420`, while `createMultiTeamProgramTasks` creates another in `pi/extensions/tasks.ts:532-676`. No production adapter connects them.
2. Preparation and readiness fail. Runtime derives readiness from phase and dependency acceptance in `workflow-runtime.ts:180,1251-1254,1413-1419`. Tasks persist duplicate `coordinatorPreparation` and `mutationReadiness`, initialize packages as blocked, and never update them in `tasks.ts:534-538,621-625,658-662`.
3. Acceptance semantics fail. Runtime acceptance unlocks dependencies in `workflow-runtime.ts:1338-1378,1413-1419`, while task acceptance immediately completes tasks in `tasks.ts:494-523`. Tests explicitly expect premature root completion in `tasks.test.ts:201-250`.
4. Follow-on representation fails. Task metadata phases and runtime work items are incompatible duplicate inboxes in `tasks.ts:75-121,221-468` and `workflow-runtime.ts:1430-1618`.
5. Settlement races fail. `updateCoordinatorFollowOnInbox` writes a stale caller-computed inbox without revision comparison in `tasks.ts:312-325`. Tests show a completed root with a blocking queued phase in `tasks.test.ts:387-413`. Runtime version checks are disconnected in `workflow-runtime.ts:1679-1720`.
6. Root ownership fails. Task APIs require root authorization in `tasks.ts:268-281,335-430,470-476`, while runtime assigns readiness and settlement authority to coordinators in `workflow-runtime.ts:1568-1587,1609-1618,1640-1727`.
7. Cancellation and results fail. Runtime keeps in-memory settled, cancelled, and failed snapshots in `workflow-runtime.ts:318-338,704-791` without durable-task transitions. Tests verify only memory in `subagent-workflow.test.ts:836-867`.
8. Inbox tests fail. `BoundedWorkflowCoordinatorInbox` requires an adapter in `workflow-runtime.ts:1619-1623`, while tests instantiate it without one in `subagent-workflow.test.ts:85,141,168`.
9. Blocking running follow-ons do not block settlement in `tasks.ts:464-468` and `tasks.test.ts:376-383`.
10. Follow-on transitions are insufficiently constrained in `tasks.ts:407-430`.
11. Dependencies do not require successful accepted completion in `tasks.ts:442-451`.
12. Root-as-blocker edges are created in `tasks.ts:642-653`.
13. Dispatch lacks idempotent attempt identity and distinct claimed, attempted, and settled states.
14. Rejection, failure, and cancellation are not preserved as distinct outcomes.

## Disposition Direction

Keep stable task identities, dependency validation, bounded dispatch, acceptance values, runtime revision checks, and useful lifecycle states.

Revise dispatch to operate directly through durable tasks, remove acceptance-triggered completion, derive readiness, add compare-and-swap settlement, constrain transitions, and cover all terminal and race cases.

Remove persisted readiness metadata, root-as-blocker edges, the duplicate runtime-only inbox, premature-completion tests, and the inbox alias.

## Recommendation

Fail. Durable tasks must own program lifecycle. The dispatcher owns execution scheduling only. Readiness derives from dependencies that are both completed and accepted, and the root owns topology, assignment, transitions, and atomic settlement.
