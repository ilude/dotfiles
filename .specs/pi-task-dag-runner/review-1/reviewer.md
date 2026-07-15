---
reviewer: standalone-completeness-automation-reviewer
status: complete
finding_count: 4
---

# Findings

- severity: high
  category: "process defect"
  confidence: high
  evidence: "Fresh-session validation is not runnable from the documented commands: `pi/tests/vitest.config.ts` throws when `pi/node_modules/@earendil-works/pi-coding-agent` is absent, while `scripts/pi-deps-link-setup` is the documented linker for that package family. The plan's focused commands and `make check-pi-extensions` omit that linker, and the Makefile target only runs frozen install, typecheck, and test. Severity rationale: a clean checkout can fail before any test executes, invalidating the stated automation contract."
  required_fix: "Add `scripts/pi-deps-link-setup` after each required install (or make the canonical wrapper invoke it), and require the same setup in the preflight/validation sequence. Include a prerequisite check and expected success signal for all Pi-owned packages."
- severity: high
  category: "substantive defect"
  confidence: high
  evidence: "T4 names new fields/actions but never defines an executable public contract: the exact `tasks[]` shape for `key` and `blockedByKeys`, whether existing UUID `blockedBy` may coexist, the top-level `ids` schema, the `await` signal/timeout behavior, or the result envelope for started/manual/blocked/terminal/external/missing records. Existing `pi/extensions/tasks.ts:557-616` has a concrete TypeBox schema and action union that must be extended. Severity rationale: different builders can produce incompatible schemas and result shapes while satisfying the prose acceptance checks."
  required_fix: "Specify the TypeBox input schema, validation rules, and JSON content/details shape for each new action, including deterministic ordering and per-ID classification/error codes. Add contract tests that parse representative valid/invalid calls and assert the exact envelopes."
- severity: high
  category: "substantive defect"
  confidence: high
  evidence: "The proposed wait contract is incomplete at the concurrency boundary. T3 says to await same-coordinator active promises and classify pending/manual or externally owned running records, but does not define behavior for missing IDs, pending executable IDs, duplicate IDs, tasks that finish before registration, a mix of active and terminal records, or a task that settles while another wait call is aborted. Existing coordinator state is only `active` plus `settledOrchestrationIds` (`pi/extensions/tasks/execution.ts:214-220`), so these choices affect correctness and repeatability. Severity rationale: lifecycle and ownership outcomes are part of the stated MVP but are left to implementation guesswork."
  required_fix: "Add a state/ownership truth table for every supplied-ID class and define duplicate/order semantics, then add controlled-runner tests for each row, including pre-settlement races and abort after partial settlement. State whether repeated await is idempotent and how externally owned running tasks are reported."
- severity: medium
  category: "process defect"
  confidence: high
  evidence: "The plan claims exact end-to-end validation but only requires `pnpm test task-tools.test.ts` for T5 and does not require invoking the registered tool with the real abort signal. T4's acceptance says to 'inspect' signal propagation, while the existing handler receives `_signal` in `pi/extensions/tasks.ts:639-665` and currently has no behavioral test contract for cancellation of the wait operation. Severity rationale: coordinator unit tests can pass while the public tool drops or misroutes the caller's abort signal, violating the user-facing no-cancel-on-await guarantee."
  required_fix: "Add a public-handler test that executes `await` with an AbortSignal, proves the promise returns/aborts, proves worker controllers remain un-aborted and records remain unchanged, and includes that test in T5/V3/V4/F1 commands. Replace inspection-only verification with assertions."
