---
created: 2026-09-04
completed: 2026-09-04
status: completed
---

# Align Pi Tests With Consequential Risk

## Objective

Every current Pi test is accounted for, and tests that only pin presentation, policy prose, source layout, duplicate coverage, or internal mock choreography are loosened, merged, or removed without weakening consequential behavior coverage.

## Completion Evidence

- Evidence: A machine-checked audit accounts for the original and final Vitest-collected Pi test inventories; root-reviewed cleanup decisions map every changed or removed test to a non-consequential assertion or retained equivalent coverage; and retained tests continue to exercise state transitions, persistence, external protocols, schemas, security controls, cleanup, session recovery, and failure handling in the passing Pi suite.
- Fails when: A collected test is missing or duplicated in the audit, a cleanup lacks cited assertion-level evidence, a consequential contract loses direct coverage, a production seam changes supported runtime behavior or exceeds the minimum needed for deterministic observation, final inventory cannot be reconciled with the audit, or focused or aggregate validation fails.

## Boundaries

- In scope: `pi/tests/**/*.test.ts`; a spec-local audit that classifies current tests as `KEEP`, `LOOSEN`, `MERGE`, or `REMOVE` using observable behavior and overlap with other tests; and the smallest stable seams under `pi/extensions/` or `pi/lib/` needed to replace real sleeps, polling, scheduler luck, or incidental acquisition order with injected clocks, explicit barriers, lifecycle signals, or directly callable protocol mapping.
- Out of scope: Production behavior changes; the partially implemented actionable-extension-diagnostics work; new test frameworks, coverage targets, mutation-testing infrastructure, and unrelated specs or repository cleanup.
- Preserve: Tests for state transitions, persistence, external protocols and parsed schemas, security and damage-control boundaries, cleanup and isolation, session replacement and recovery, workflow dispatch and mutation refusal, and failure handling. Preserve exact text when it is machine-consumed, explicitly documented as a contract, or itself carries an actionable command, identifier, count, order, channel, terminal status, or safety decision.
- Assumptions: Commit `bb103c70` is the completed first cleanup slice and evidence for the decision rubric, not authorization to weaken additional behavior. The installed Vitest 4.1.9 `list --json` and positional filename-filter interfaces were confirmed during planning with `pnpm exec vitest list --help`; `pi/package.json` and `pi/tests/vitest.config.ts` own the repository invocations. `/do-it` creates and owns the implementation worktree from committed HEAD before implementation, while current primary-worktree diagnostic changes remain untouched.

## Tasks

- [x] **T1: Inventory the current test portfolio**
  - Files: `.specs/pi-test-risk-alignment/audit.json`, `.tmp/pi-test-inventory-original.json`, `.tmp/verify-pi-test-audit.mjs`; read-only targets `pi/package.json`, `pi/tests/vitest.config.ts`, and `pi/tests/**/*.test.ts`
  - Change: Collect the original test identifiers through the installed Vitest `list --json` interface and initialize one audit entry per collected identifier with source file and stable original identifier. The temporary verifier compares the audit with collected identifiers. Do not classify tests or change repository code. If the installed interface differs from the planning-time contract, stop as an external-contract mismatch and consult maintained Vitest documentation before changing the verifier. Stop on collection, parsing, or identity mismatch without retrying an unchanged command.
  - Done when: The verifier reports exact identifier equality between the original Vitest inventory and audit, with no missing or duplicate entries.
  - Verify: `deterministic: cd pi && pnpm exec vitest list --config tests/vitest.config.ts --json ../.tmp/pi-test-inventory-original.json && node ../.tmp/verify-pi-test-audit.mjs inventory ../.tmp/pi-test-inventory-original.json ../.specs/pi-test-risk-alignment/audit.json; expect exact unique identifier equality and exit 0`

- [x] **T2: Classify tests against observable contracts**
  - Files: `.specs/pi-test-risk-alignment/audit.json`; read-only targets `pi/tests/**/*.test.ts`, `pi/extensions/**/*.ts`, `pi/lib/**/*.ts`, `pi/skills/**/*.md`, and Git history only when an assertion's purpose remains unclear or a proposed decision relies on defect history
  - Change: The root assigns every `KEEP|LOOSEN|MERGE|REMOVE` decision. A `KEEP` entry needs only its identifier and decision unless it supplies replacement coverage. For every non-`KEEP` entry, record the protected observable outcome, assertion-level evidence, and low-value criterion. For `MERGE` or `REMOVE`, name original-inventory replacement identifiers that assert the same consequential outcome unless the evidence establishes that no consequential contract exists. Treat presentation-only as asserting no machine-consumed value, command, identifier, count, order, channel, terminal status, or safety decision; duplicate as equivalent input/state and observable outcome already covered by named tests; and mock choreography as having no externally observable state, persistence, protocol/schema, cleanup/isolation, recovery, refusal, or failure outcome. Default unresolved cases to `KEEP`. Do not mutate tests. End at the first unresolved evidence question by recording `KEEP`; do not infer missing evidence or repeat unchanged research.
  - Done when: The root has reviewed every non-`KEEP` entry; each names a protected observable outcome or explicitly establishes that none exists; each has a defined low-value criterion and cited evidence; each `MERGE` or consequential `REMOVE` resolves retained equivalent coverage; and zero cleanup candidates remains a valid result.
  - Verify: `deterministic: run the temporary audit verifier in classification mode, then root-review every non-KEEP entry against its cited assertions and replacement identifiers; expect all required evidence fields populated, all replacement identifiers present in the original inventory, no quota-based decisions, and every unresolved mapping recorded as KEEP`
  - Depends on: T1

- [x] **T3: Apply the evidence-backed cleanup**
  - Files: `pi/tests/**/*.test.ts`, minimum deterministic-observation seams under `pi/extensions/` and `pi/lib/`, `.specs/pi-test-risk-alignment/audit.json`, `.tmp/pi-test-inventory-final.json`, `.tmp/verify-pi-test-audit.mjs`
  - Change: Apply only T2 decisions: remove presentation-only and source-spelling checks, loosen incidental wording while retaining consequential values and channel behavior, merge true duplicates, and replace temporal coupling with fake clocks, explicit barriers, state signals, or directly callable protocol mapping. Add replacement behavior coverage only when T2 identifies a consequential contract that would otherwise lose direct coverage. Record each decision as applied or skipped with evidence. The verifier infers unchanged mappings when the same unique identifier exists in both inventories; record explicit mappings only for renamed, loosened, merged, removed, or replacement-covered entries. Production edits must expose only the smallest deterministic observation or callable protocol seam and preserve runtime behavior; target no test-count reduction. If T2 finds no supported candidates, record that result and make no test mutation. Run each changed test file once after its edits settle. On the first nonzero check, inventory mismatch, unmatched diff, or unresolved contract mapping, stop after recording the command, output, classification, and affected boundary; do not retry without an input change addressing that failure.
  - Done when: Every supported cleanup decision is applied or skipped for a recorded contract-preservation reason; final inventory reconciliation resolves every original and final identifier; `KEEP` entries remain present unless named as replacement-covered changes; any production seam is minimal and behavior-preserving; and each changed test file passes its direct Vitest filter.
  - Verify: `deterministic: after all edits settle, collect tests once with pnpm exec vitest list --config tests/vitest.config.ts --json ../.tmp/pi-test-inventory-final.json; require the verifier to reconcile original entries, final identifiers, applied decisions, replacement coverage, and changed paths; then run each changed test filename once as a direct pnpm test filter with no -- separator; expect no missing, new-unaccounted, duplicate, or unresolved identifiers and all focused files passing`
  - Depends on: T2

## Execution Strategy

T1 through T3 are sequential because classification depends on the verified inventory and mutation depends on root-approved decisions. The root owns classification, contract-preservation review, integration, and final validation. Implementation starts only in the `/do-it`-owned worktree. Do not copy, overwrite, stage, or commit the unrelated dirty diagnostic implementation from the primary worktree.

## Validation

All checks are deterministic; this plan has no live checks. Run each check once after its covered inputs settle. On the first failure, stop, record the failing command and classification, and do not retry until a relevant input changes.

- [x] After T1, retain the inventory-to-audit verifier result showing exact, unique coverage of the original collected tests; do not rerun it while inputs remain unchanged.
- [x] After T2, run the classification verifier and root evidence review once; every non-`KEEP` entry has cited assertion-level evidence and every required replacement identifier resolves.
- [x] After T3 changes at least one test, run each changed filename as one direct `pnpm test` filter and then run `cd pi && pnpm test` once; focused and aggregate suites pass. If T3 changes no tests, omit these unchanged runs.
- [x] After T3 settles, run `cd pi && pnpm run biome:check` once when tests changed, then `git diff --check -- pi/tests .specs/pi-test-risk-alignment` once. The full Biome command reported six pre-existing errors only in unchanged `extensions/history.ts`, `extensions/web-tools.ts`, `lib/log-analytics/registry.ts`, and `tests/workspace-policy.test.ts`; the 56 changed TypeScript paths passed their scoped Biome check, and the final scoped `git diff --check` exited 0. No `--` separator is used for test filters.
- [x] Use the single final inventory and reconciliation result produced by T3; every original entry maps to an allowed final outcome, every final identifier is accounted for, and all replacement identifiers resolve to cited retained assertions.
- [x] Review the final diff once; paths owned by this plan are limited to `pi/tests/`, the minimum cited deterministic-observation seams under `pi/extensions/`, `pi/lib/`, and `pi/scripts/`, and `.specs/pi-test-risk-alignment/`, with `.tmp/` containing ignored evidence only, and no retained consequential contract identified in the audit was removed.

## Retention

Keep incomplete work at `.specs/pi-test-risk-alignment/plan.md`. After completion, `/do-it` archives this directory to `.specs/archive/pi-test-risk-alignment/`.

## Execution Status

- State: Complete; archived closeout in progress.
- Blocker: None.
- Next: Commit, merge with `--no-ff`, and run `plan_archive`.
- Current frontier: Archived artifact and Git closeout; remaining live attempts: N/A.
- Result: The verified audit classifies all 1,912 original identifiers as 1,827 `KEEP`, 46 `LOOSEN`, 36 `REMOVE`, and 3 `MERGE` decisions. All 85 non-`KEEP` decisions map to applied or replacement-covered outcomes, and the final inventory reconciles exactly to 1,873 identifiers. Timing-only presentation and scheduler-dependent dependency tests were removed; retained temporal behavior uses fixed clocks, explicit barriers, lifecycle signals, or minimal behavior-preserving seams. Focused tests and the aggregate suite pass; changed paths pass Biome and `git diff --check`, while the full Biome command retains six documented unchanged baseline errors.
- Resume: `/do-it .specs/pi-test-risk-alignment/plan.md`
