# Standalone Readiness Review 2

Result: **STANDALONE READY**

Reviewed `.specs/pi-tasks-control-plane/plan.md` as if starting a brand-new Pi session with no prior conversation and executing `/do-it .specs/pi-tasks-control-plane/plan.md`.

## Blockers

None found.

The prior blockers appear repaired:

1. **Staged redaction gates:** T2/V1 now cover helper plus registry paths, T4/V2 covers renderer redaction, and T5/T6/V3 cover tool and slash-command output redaction.
2. **Archive preflight:** The archive rule now scans evidence for sentinel/private-key/AWS markers, scans tests for real-looking private-key/AWS markers, and explicitly allows fake sentinel literals in committed test files only.

## Hardening Issues

- **Idempotent retry mechanism is required but under-specified.** The plan requires create/batch-create retry after `persist_failed` via client keys, deterministic aliases, or repair handles, but does not choose one mechanism. This is executable because T1 is explicitly required to choose/document the schema policy and T5 tests batch behavior, but implementation risk would be lower if the plan named the preferred retry key shape before coding.
- **Evidence log commit policy remains implicit.** T7 requires evidence files under `.specs/.../evidence/` and says runtime task state should not be committed. If `/do-it` is expected to leave evidence logs unstaged or committed, that policy should be stated explicitly; this is not a blocker to safe execution.

## Nits

- `TaskCreateMany` intra-batch dependency reference syntax is still not specified in detail. The implementation can infer a reasonable client-key/alias approach from the idempotent retry contract, but explicit examples would reduce iteration.
- `/tasks clear completed` does not explicitly say whether `skipped` is cleared with completed terminal tasks or only hidden by default.

## Overall Assessment

The plan includes sufficient context, constraints, file targets, dependency ordering, executable acceptance criteria, validation gates, rollback safety, and archive conditions for a fresh `/do-it` run. No blockers found.
