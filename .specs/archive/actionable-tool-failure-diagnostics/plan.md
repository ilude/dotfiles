---
created: 2026-08-25
status: completed
completed: 2026-08-25
---

# Make recurring tool-failure diagnostics actionable

## Objective

`/find-fails` produces representative, redacted evidence that distinguishes correct tool rejection from recurring caller-generation defects and permits `Fixed` only when an inspected post-change check directly exercises the failed contract.

## Completion Evidence

- Evidence: Focused tests demonstrate deterministic newest-first selection and matching last-seen reporting, bounded structurally redacted call/result envelopes, recurrence counted only after the inspected decision boundary, exact parity between the decision tool schema and writer, successful-result ingestion, and fixed decisions admitted only by an inspected post-boundary check supported by a verifier for that failure contract.
- Fails when: Selection and last-seen reporting can refer to different observations, missing or tied timestamps produce nondeterministic evidence, an oversized or nested-sensitive call cannot be inspected safely, historical failures immediately reopen a caller-contract decision, the public decision schema accepts evidence that its writer rejects, successful results are absent after corpus refresh, or an unsupported or mismatched success can prove a fix.

## Boundaries

- In scope: Pi's `/find-fails` classifier, session read model, bounded inspection envelope, candidate/decision semantics, diagnostic prompt and tools, focused tests, and the owning observability contract.
- Out of scope: Automatic code repair, executing arbitrary replay commands inside the restricted diagnostic turn, non-Pi clients, provider routing, unrelated log analytics, and historical session-file mutation.
- Preserve: The single active-provider turn, custom-extension filtering, opaque coordinate tokens, transcript path and byte limits, redaction, read-only diagnostic authority except for the narrow append-only decision writer, maximum three candidates, five human verdicts, and existing decision-file durability and safety checks.
- Assumptions: Canonical session JSONL contains correlated tool calls and results. Direct fix checks are initially supported only where a deterministic contract-specific verifier can compare the failed call with a later successful call; unsupported failure classes remain unresolved rather than using same-tool success, elapsed time, or absence of failures.

## Tasks

- [x] **T1: Select and inspect representative call envelopes**
  - Files: `pi/lib/tool-failure-classifier.ts`, `pi/lib/tool-failure-store.ts`, `pi/lib/tool-failure-inspection.ts`, `pi/tests/tool-failure-store.test.ts`, `pi/tests/tool-failure-inspection.test.ts`
  - Change: Replace hash-ordered coordinate truncation with authoritative ordering by valid observation timestamp descending, then session digest and coordinate token; observations without a valid timestamp follow timestamped observations and use the same stable tie-breakers. Derive `lastObserved` and the first selected coordinate from that ordering, then fill the existing three-coordinate bound with distinct sessions before same-session observations. Extend corpus ingestion to retain correlated successful results needed for verification. Build a structured envelope with tool name, redacted argument shape and bounded values, result status and bounded text, timestamps, session digest, and opaque correlation token. Recursively redact secret-named keys and secret-like values before applying per-field caps and explicit truncation markers, while always retaining tool, status, timestamp validity, and token. Keep paths and surrounding transcript content outside the envelope. Because shared TypeScript types change, run the focused typecheck before expanding into decision behavior.
  - Done when: Fixtures cover hash order differing from time order, tied and invalid timestamps, distinct sessions, nested secrets, oversized arguments/results, and successful-result refresh; the selected newest valid failure supports the reported last-seen value, required envelope fields survive truncation, and protected paths plus per-call/per-turn limits still reject unsafe reads.
  - Verify: `cd pi && pnpm test tool-failure-store.test.ts tool-failure-inspection.test.ts && pnpm run typecheck`

- [x] **T2: Preserve recurring caller defects and expose the real decision contract**
  - Depends on: T1
  - Files: `pi/lib/tool-failure-decisions.ts`, `pi/lib/tool-failure-report.ts`, `pi/extensions/tool-failure-triage.ts`, `pi/tests/tool-failure-decisions.test.ts`, `pi/tests/tool-failure-report.test.ts`, `pi/tests/tool-failure-command.test.ts`
  - Change: Persist one validated ISO observation boundary with a caller-contract decision, then derive recurrence occurrence and distinct-session counts only from observations strictly after it so historical aggregates cannot immediately reopen the finding. Keep the existing verdict vocabulary while requiring the explanation to distinguish correct rejection from continuing caller-generation failure. Replace the decision tool's undocumented prefixed strings with structured evidence items whose enumerated type and text constraints exactly match writer validation; normalize them to the existing persisted string encoding at the extension boundary and read prior records without rewriting them.
  - Done when: Tests show that historical and unchanged isolated caller mistakes remain settled, only qualifying failures from enough post-boundary sessions become actionable, stale or malformed boundary state remains unresolved, and every evidence value accepted by the advertised tool schema is accepted by the writer while malformed values are rejected before persistence.
  - Verify: `cd pi && pnpm test tool-failure-decisions.test.ts tool-failure-report.test.ts tool-failure-command.test.ts`

- [x] **T3: Gate fixed findings on an inspected post-change check**
  - Depends on: T1, T2
  - Files: `pi/lib/tool-failure-inspection.ts`, `pi/lib/tool-failure-decisions.ts`, `pi/lib/tool-failure-report.ts`, `pi/extensions/tool-failure-triage.ts`, `pi/tests/tool-failure-inspection.test.ts`, `pi/tests/tool-failure-decisions.test.ts`, `pi/tests/tool-failure-report.test.ts`, `pi/tests/tool-failure-command.test.ts`, `pi/skills/pi-extension/references/contracts/observability.md`
  - Change: Implement one deterministic fix verifier for `required:command`: the failed envelope must be a Bash missing-command rejection and the corrected envelope must be a later successful Bash call containing a nonempty `command`. Require an `addressed`/`Fixed` decision for that contract to reference the successful envelope inspected in the current turn with a timestamp strictly after the persisted ISO change boundary. Keep prior date-only records readable but ineligible as new fix proof. Reject unsupported contracts, another tool, pre-boundary results, absence, counts, and free-form claims. Include an eligible fix-check token in the prompt; otherwise report unresolved with a repair/replay recommendation. Update the owning contract with the exact selection, envelope, recurrence, evidence, and fix-verifier rules; defer additional verifier abstraction until another contract requires it.
  - Done when: The `required:command` fixture admits only a matching inspected post-boundary Bash success with a nonempty command; mismatched, older, missing, uninspected, and unsupported successes cannot prove a fix; successful pairs survive corpus refresh; and provider, mutation, redaction, and verdict boundaries remain enforced.
  - Verify: `cd pi && pnpm test tool-failure-inspection.test.ts tool-failure-decisions.test.ts tool-failure-report.test.ts tool-failure-command.test.ts && pnpm run typecheck`

## Validation

- [x] `cd pi && pnpm test tool-failure-store.test.ts tool-failure-inspection.test.ts tool-failure-decisions.test.ts tool-failure-report.test.ts tool-failure-command.test.ts tool-failure-diagnostic-turn.test.ts tool-visibility.test.ts` passes and directly covers deterministic timestamp fallback/ties, newest evidence and matching last seen, structural redaction and truncation, successful-result refresh, post-boundary recurrence, schema parity, and supported-contract post-change fix proof.
- [x] Inspect `pi/skills/pi-extension/references/contracts/observability.md` against the executable tests and confirm it preserves the restricted active-provider turn, narrow mutation authority, and direct-proof rules without claiming automatic repair or arbitrary replay execution.

## Retention

Keep incomplete work at `.specs/actionable-tool-failure-diagnostics/plan.md`. `/do-it` must create and own the implementation worktree before implementation, then validate the change, archive this directory to `.specs/archive/actionable-tool-failure-diagnostics/`, commit the workflow branch, merge it with `--no-ff` into the primary branch, verify merged HEAD, and remove only its owned worktree and branch. Any dirty, unmerged, or conflict state must preserve the recoverable worktree and plan; an ignored plan must not be force-added and returns to the primary local archive after a successful merge.

## Execution Status

- State: Completed; implementation and validation passed.
- Blocker: None.
- Next: Archive and close out the owned workflow.
- Resume: `/do-it .specs/actionable-tool-failure-diagnostics/plan.md`
