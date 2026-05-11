---
date: 2026-05-07
status: synthesis-complete
---

# Review: Pi Tasks Control Plane MVP Plan

## Review Panel
| Reviewer | Base Agent | Assigned Expert Persona | Why selected | Adversarial angle | Artifact |
|----------|------------|-------------------------|--------------|-------------------|----------|
| reviewer | reviewer recovered via coding-light | Completeness and explicitness reviewer | Mandatory standard reviewer for plan explicitness and /do-it readiness | Assume executors infer missing semantics incorrectly | `.specs/pi-tasks-control-plane/review-2/reviewer.md` |
| security-reviewer | security-reviewer recovered via coding-light | Security and evidence-safety reviewer | Mandatory standard reviewer for secrets, rollback, persistence, archive safety | Assume persisted logs/fixtures leak sensitive data | `.specs/pi-tasks-control-plane/review-2/security-reviewer.md` |
| product-manager | product-manager | MVP scope/simplicity reviewer | Mandatory standard reviewer for scope and sequencing | Assume MVP still contains too many product surfaces | `.specs/pi-tasks-control-plane/review-2/product-manager.md` |
| typescript-pro | typescript-pro | Pi TypeScript extension/module-boundary reviewer | Plan changes TS extensions, helpers, schemas, pnpm validation | Assume helpers land in auto-discovered locations or imports fail | `.specs/pi-tasks-control-plane/review-2/typescript-pro.md` |
| backend-dev-state | backend-dev | Task registry state-machine/data-integrity reviewer | Plan changes canonical schema, persistence, DAG, transitions | Assume partial writes and migrations corrupt data | `.specs/pi-tasks-control-plane/review-2/backend-dev-state.md` |
| qa-engineer | qa-engineer | /do-it validation contract reviewer | Plan depends on evidence logs, tests, checklist gates | Assume commands pass without durable evidence | `.specs/pi-tasks-control-plane/review-2/qa-engineer.md` |
| ux-researcher | ux-researcher | Operator workflow and /tasks UX reviewer | Plan changes slash grammar, warnings, display modes | Assume technically valid UX still confuses operators | `.specs/pi-tasks-control-plane/review-2/ux-researcher.md` |

## Standard Reviewer Findings
### reviewer
- HIGH: Lifecycle transition matrix is referenced from the PRD but not inlined in the executable plan.
- HIGH: Dependency partial-write behavior allows either rollback or repair state, which is too ambiguous.
- MEDIUM: Redaction fixtures/output behavior are underspecified.
- MEDIUM: Tool schemas/result unions are not concrete enough.
- MEDIUM: Evidence filenames are generic; checklist evidence updates need exact mapping.

### security-reviewer
- HIGH: Redaction must be mandatory at all task ingress/egress paths, not optional helper work.
- MEDIUM: Evidence logs can preserve sensitive task content unless archive preflight scans them.
- MEDIUM: Rollback guidance needs path safety due to unrelated repo changes.
- MEDIUM: Test fixtures should use fake sentinel secrets, not realistic credentials.
- LOW: Deferred execution tool names should be explicitly absent or unavailable.

### product-manager
- HIGH: MVP still bundles too many surfaces for a first slice.
- HIGH: T1 and T6 are oversized cross-cutting tasks.
- MEDIUM: User-visible callable tools arrive late in Wave 3.
- MEDIUM: Output-like redaction may be premature while output tools are deferred.
- LOW: Evidence requirements are repetitive.

## Additional Expert Findings
### typescript-pro
- HIGH: Helper/schema placement rule needs an explicit file-system check for top-level `pi/extensions` auto-discovery hazards.
- HIGH: ESM import style must distinguish extension-to-lib `.js` imports from lib/test `.ts` imports.
- MEDIUM: New lib helpers may not be typechecked until late integration.
- MEDIUM: Tool schema expectations should require TypeBox-compatible schemas.
- MEDIUM: Isolated test commands need `pi/extensions pnpm install` prerequisite.

### backend-dev-state
- HIGH: Schema-version/migration policy and unknown-field round-trip tests are insufficient.
- HIGH: Batch dependency atomicity lacks a concrete protocol.
- HIGH: Redaction integration order creates a gap because T1/T2 are parallel and registry integration is optional.
- MEDIUM: `skipped` dependency semantics need explicit A->B tests.
- MEDIUM: Create/batch idempotency after persistence failure is missing.

### qa-engineer
- HIGH: Evidence artifacts are named but commands do not capture output with `tee` or equivalent.
- HIGH: Redaction can pass helper tests while persistence/rendering still leak raw strings.
- MEDIUM: T2 races T1 unless integration is mandatory at V1/V3.
- MEDIUM: Final gates need exact evidence mapping; preflight needs a checklist item if required.
- LOW: `make check-pi-extensions` exists and should be required, not optional.

### ux-researcher
- HIGH: `/tasks` grammar is underspecified.
- HIGH: Compact display priority can hide urgent tasks unless priority is explicit.
- MEDIUM: Warning copy needs action, reason, persistence status, and next command.
- MEDIUM: `retry` wording can be confused with execution.
- MEDIUM: Settings commands/persistence/recovery from hidden mode are unclear.

## Suggested Additional Reviewers
- typescript-pro -- relevant for Pi TypeScript extension boundaries, ESM import style, TypeBox schemas, and pnpm validation.
- backend-dev -- relevant for schema migration, state transitions, dependency atomicity, and registry data integrity.
- qa-engineer -- relevant for executable validation, evidence artifacts, checklist consistency, and false-positive tests.
- ux-researcher -- relevant for operator-facing `/tasks` grammar, warnings, compact display defaults, and settings discoverability.

## Bugs (must fix before execution)
1. The executable plan leaves state-transition, schema migration, dependency atomicity, and tool schema details too implicit for safe implementation.
2. Redaction is not mandated across all persistence/rendering/tool paths and can pass helper-only tests while leaks remain.
3. Evidence log commands do not actually capture the named evidence files, weakening `/do-it` resume/archive gates.
4. `/tasks` command grammar and display priority are underspecified, so implementation and tests can diverge.
5. Pi TypeScript module/import and clean-checkout test prerequisites are not explicit enough to prevent build/test failures.

## Hardening
1. Add path-safe rollback and archive preflight secret scans over evidence logs, diffs, and fixtures.
2. Add a dedicated preflight checklist item with evidence.
3. Require `make check-pi-extensions` as the repo wrapper because this repo defines it.
4. Define fake sentinel secret fixtures and forbid real-looking credentials/private keys in tests.
5. Add idempotency/retry expectations for create and batch create after injected persistence failure.
6. Consider splitting T1/T6 during implementation if they become too large, but this can be managed through acceptance criteria without changing the wave model now.

## Simpler Alternatives / Scope Reductions
1. A thinner first slice could implement only registry + TaskCreate/List/Get/Update + `/tasks list/show`; however, the reviewed PRD explicitly selected a broader MVP with batch creation, dependencies, renderer modes, and redaction. The plan should keep scope but remove ambiguity.
2. Output-like redaction can be documented as future-facing test coverage, but metadata/title/description redaction must be enforced now.
3. Evidence can be captured at validation gates rather than every narrow `-t` task command, as long as checklist items point to the relevant gate log.

## Automation Readiness
- Agent-runnable operational steps: mostly present, but commands must include evidence capture wrappers and clean-checkout install prerequisites.
- Credential/auth flow clarity: no credentials required; tests must use fake sentinel secrets only.
- Evidence and archive gates: named paths exist conceptually but need exact capture commands, archive preflight scan, and per-gate evidence mapping.
- Manual-only steps and justification: no manual validation required; acceptable.
- Execution checklist: present and consistent, but should add preflight checklist item and evidence mapping for final gates.

## Contested or Dismissed Findings
1. Product-manager suggested reducing MVP scope substantially. This was not applied as a must-fix because the PRD review already intentionally selected this MVP boundary. The actionable fix is to harden ambiguity and split only if implementation stalls.
2. Output-like redaction was considered premature by product-manager, but retained as hardening because future stats/output fields and task metadata render paths make redaction reusable and low-cost if implemented as a small helper.

## Verification Notes
1. Confirmed missing inline lifecycle matrix: `plan.md` T1 references PRD behavior but only summarizes lifecycle in task text; executable implementation should not depend on PRD lookup.
2. Confirmed ambiguous dependency atomicity: T3 says “all-or-nothing or repair-record behavior,” allowing incompatible implementations.
3. Confirmed evidence command gap: Automation Plan commands list plain shell commands while evidence files are named separately without redirection/tee.
4. Confirmed `/tasks` grammar gap: T6 says help should mention commands “or the exact implemented MVP subset,” but no canonical grammar table exists.
5. Confirmed clean-checkout prerequisite: `pi/tests` depends on packages installed under `pi/extensions`, while task-specific commands often run only from `pi/tests`.

## Reviewer Artifact Status
| Reviewer | Artifact | Status | Notes |
|----------|----------|--------|-------|
| reviewer | `.specs/pi-tasks-control-plane/review-2/reviewer.md` | read | Original reviewer lacked write tools; recovered via coding-light. |
| security-reviewer | `.specs/pi-tasks-control-plane/review-2/security-reviewer.md` | read | Original artifact missing despite success preview; recovered via coding-light. |
| product-manager | `.specs/pi-tasks-control-plane/review-2/product-manager.md` | read | Usable. |
| typescript-pro | `.specs/pi-tasks-control-plane/review-2/typescript-pro.md` | read | Usable. |
| backend-dev-state | `.specs/pi-tasks-control-plane/review-2/backend-dev-state.md` | read | Usable. |
| qa-engineer | `.specs/pi-tasks-control-plane/review-2/qa-engineer.md` | read | Usable. |
| ux-researcher | `.specs/pi-tasks-control-plane/review-2/ux-researcher.md` | read | Usable. |

## Timing Notes
| Step | Duration | Notes |
|------|----------|-------|
| Initial review panel | unknown | 7 reviewers launched; per-reviewer timing unavailable. |
| Artifact reads | unknown | All expected artifacts read after targeted recoveries. |
| Recovery calls | unknown | Recovered reviewer and security-reviewer only. |
| Verification | unknown | Static inspection of plan sections and project context. |
| Synthesis | unknown | `.specs/pi-tasks-control-plane/review-2/synthesis.md` |

## Auto-Apply Plan
- Applied fixes artifact: `.specs/pi-tasks-control-plane/review-2/applied-fixes.md`
- Known-blocker fixes artifact: `not run/no prior blockers`
- Section integrity check: passed via `grep -n '^## ' .specs/pi-tasks-control-plane/plan.md`
- Standalone-readiness result: initial blockers repaired; retry returned `STANDALONE READY`
- Standalone-readiness artifacts: `.specs/pi-tasks-control-plane/review-2/standalone-readiness.md`, `.specs/pi-tasks-control-plane/review-2/standalone-readiness-2.md`
- Repair passes used: 1

## Review Artifact
Wrote full synthesis to: `.specs/pi-tasks-control-plane/review-2/synthesis.md`

## Overall Verdict
**Fix bugs first**

## Recommended Next Step
- Apply structured plan fixes, then execute via `/do-it .specs/pi-tasks-control-plane/plan.md`.
