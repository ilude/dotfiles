---
reviewer: post-change-workflow-validation
persona: concurrency and exact-workflow validation specialist
status: complete
finding_count: 5
---

# Findings

- severity: high
  category: broad-gate prerequisite defect
  confidence: high
  evidence: The Automation Plan correctly runs `scripts/pi-deps-link-setup` after `pnpm install` and verifies the five linked packages, but F2 then runs `make check-pi-extensions`. `Makefile` defines that target as `cd pi && pnpm install --frozen-lockfile && pnpm run typecheck`, followed by `cd pi && pnpm test`; it does not run the linker or repeat the package-existence check. F2 nevertheless treats the prior links as sufficient. Its fresh frozen install can change `pi/node_modules`, so the broad gate can fail before exercising the changed boundary or pass against a stale/non-fresh link state.
  required_fix: Make the canonical broad gate invoke `scripts/pi-deps-link-setup` after its frozen install, or have F2 run the documented install-link-existence sequence immediately before the broad gate and verify the package paths again. The pass signal must include successful linker and existence evidence for the same node_modules state used by typecheck and Vitest.

- severity: high
  category: renderer contract false positive
  confidence: high
  evidence: The new details envelope is `{ outcome, records, results }` and the contract requires per-ID classifications and artifact paths to be inspectable in the TUI. The current `pi/lib/task-renderer.ts` only branches on `record`, `records`, and `output`; it does not render `results`. T3 allows renderer work only "if the selected envelope requires it," while its AC4 only requires ordered records and artifact paths in compact/expanded modes. Thus tests can pass with the current renderer even though classifications such as `manual_ready`, `blocked`, `foreign_workspace`, and `aborted` are invisible in the TUI.
  required_fix: Make renderer support mandatory for the selected `{ records, results }` envelope. Define and assert compact and expanded output for each result classification and its matching record/artifact, including a mixed result set. Retain a concrete output-size bound for rendered text as well as the model-visible 4,096-byte bound.

- severity: medium
  category: workspace matrix coverage gap
  confidence: high
  evidence: T3 AC2 only names the negative foreign case, and V2 proposes an implementation inspection that workspace checks occur before coordinator calls. Neither requires a behavioral matrix proving that workspace-less and current-workspace IDs are accepted, foreign IDs are rejected without coordinator calls or durable mutation, and a mixed current/foreign request starts only eligible current-workspace work while preserving request-order classifications. The corresponding `await` cases are likewise not required through the public handler. A coarse foreign-only test can therefore pass while the resolver rejects workspace-less records, calls the coordinator before filtering, or mishandles mixed requests.
  required_fix: Add public-handler tests for `execute_many` and `await` covering no-workspace, matching-workspace, foreign, and mixed-ID inputs. Spy on coordinator entry and durable writes, assert no calls/writes for foreign IDs, and assert ordered per-ID results while eligible same-workspace IDs still execute or await.

- severity: medium
  category: abort settlement false positive
  confidence: high
  evidence: T3 requires no unhandled rejection after a mid-wait abort, but T4 AC2 only says both blocked runners later "settle normally once." If both controlled runners resolve, that proves neither was stopped but cannot prove handlers were retained for a post-abort rejection. The intended failure mode is an active worker rejecting after `await` has returned; a success-only post-abort test will miss it.
  required_fix: In the public-signal abort test, reject one captured runner after `await` returns and resolve the other. Assert the rejection is consumed by the retained settlement handler, each durable record reaches its correct terminal state exactly once, and the test framework observes no unhandled rejection. Keep the controller, artifact, and telemetry assertions for both paths.

- severity: medium
  category: archive state-machine ambiguity
  confidence: high
  evidence: F5 requires all checklist items checked, plan status complete, and `archive_status` `ready` before moving. The execution ledger starts with `status: not-started` and `archive_status: active`, but F1-F4 only direct checklist evidence updates; no step explicitly transitions the plan to `complete` and `ready` before the move. The Archive rule then says to set `archive_status` to `archived` after moving, without identifying the archived file as the mutation target. An executor can satisfy the test command while lacking a valid archive transition, or move first and only then discover the precondition was never recorded.
  required_fix: Add an explicit F5 preflight transition that, after every gate is checked and evidenced, updates the active plan to `status: complete` and `archive_status: ready`, then verifies those exact fields plus source/target paths. Define the post-move edit as targeting `.specs/archive/pi-task-dag-runner/plan.md`, followed by a read-back asserting source absent, archive present, `status: complete`, and `archive_status: archived`.
