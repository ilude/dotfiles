# T8 Integration Status

## Passed gates

- `cd pi && pnpm run typecheck`
- 13 focused orchestration test files: 267 tests passed
- Full Pi suite: 128 files passed, 1659 tests passed, 1 skipped
- `git diff --check`

## Blocking integration gap

The Wave 1 and Wave 2 authorities are implemented and tested, but the live `subagent` entrypoint still executes through `SubagentTreeBroker` and `SubagentRunManager`. The new `OrchestrationDispatcher`, `OrchestrationTaskRegistry`, `SubagentResultStore`, `PackageMailbox`, and `SubagentControlFacade` are not composed into one live runtime. Registering `subagent_control` before that composition would expose controls against an authority that does not own current runs.

T8 cannot claim authority agreement or run the stated live canary until the old tree broker execution path is migrated behind the dispatcher and the result/control/task adapters share its IDs and events.

## Exact next work

1. Add one process-local orchestration runtime composition owned by the subagent extension.
2. Adapt cross-process tree admission to the dispatcher rather than maintaining separate broker lifecycle truth.
3. Route run settlement into the result store only after dispatcher cleanup confirmation.
4. Route task assignment/result envelopes through the canonical task registry and mailbox transaction.
5. Register `subagent_control` against those live authorities.
6. Derive `/subagents` and footer projections from the composed authorities.
7. Run the stated canary, migration validation, aggregate gates, and archive the plan.
