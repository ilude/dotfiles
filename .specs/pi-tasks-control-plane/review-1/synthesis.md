---
date: 2026-05-07
status: synthesis-complete
---

# Review: Pi Tasks Control Plane PRD

## Review Panel
| Reviewer | Base Agent | Assigned Expert Persona | Why selected | Adversarial angle | Artifact |
|----------|------------|-------------------------|--------------|-------------------|----------|
| reviewer | reviewer recovered via coding-light | Completeness and explicitness reviewer | Mandatory standard reviewer for PRD ambiguity and readiness | Assume a cold planner will miss unresolved semantics | `.specs/pi-tasks-control-plane/review-1/reviewer.md` |
| security-reviewer | security-reviewer recovered via coding-light | Red-team persistence/output safety reviewer | Mandatory standard reviewer for realistic data-loss and prompt-injection risks | Assume persisted outputs can leak or poison dependent prompts | `.specs/pi-tasks-control-plane/review-1/security-reviewer.md` |
| product-manager | product-manager | Simplicity and MVP boundary reviewer | Mandatory standard reviewer for scope and product value | Assume upstream parity is over-scoped unless tied to a user job | `.specs/pi-tasks-control-plane/review-1/product-manager.md` |
| typescript-pro | typescript-pro | Pi TypeScript extension/toolchain reviewer | PRD targets Pi TypeScript extensions, schema, and tests | Assume helper placement and tool schemas will be underspecified | `.specs/pi-tasks-control-plane/review-1/typescript-pro.md` |
| backend-dev-state | backend-dev | Task registry state-transition and data-integrity reviewer | PRD changes canonical task schema, persistence, DAG edges, and lifecycle | Assume implementers will create impossible transitions or corrupt records | `.specs/pi-tasks-control-plane/review-1/backend-dev-state.md` |
| qa-engineer | qa-engineer | Verification realism and regression coverage reviewer | PRD contains many acceptance criteria and test-first claims | Assume criteria can pass without proving runtime behavior | `.specs/pi-tasks-control-plane/review-1/qa-engineer.md` |
| ux-researcher | ux-researcher | Operator workflow and task-noise reviewer | PRD includes widget modes, nudges, resume flow, and /tasks UX | Assume a rich task system will annoy or mislead without defaults | `.specs/pi-tasks-control-plane/review-1/ux-researcher.md` |

## Standard Reviewer Findings
### reviewer
- HIGH: Execution semantics are unresolved for `TaskExecute`, `TaskStop`, auto-cascade, and dependent prompt injection.
- HIGH: Storage scope is listed as desired but remains an open question.
- MEDIUM: Tool schemas are not explicit enough for planning.
- MEDIUM: Several acceptance criteria use vague verification phrases instead of concrete test files/commands.
- MEDIUM: Persistent widget behavior must be separated from fallback text/status rendering.

### security-reviewer
- HIGH: Persisted metadata/output and dependent prompt injection lack redaction, retention, and secret-safety policy.
- HIGH: Output injection plus auto-cascade creates prompt-injection risk if prior task output is treated as trusted instructions.
- MEDIUM: Stop semantics are unsafe unless statuses distinguish requested/stopped/failed-to-stop/orphaned.
- MEDIUM: Shared task lists and batch DAG writes need lock/concurrency and partial-failure tests.
- MEDIUM: Storage scope and deletion policy must be resolved before planning.

### product-manager
- HIGH: The PRD imports nearly all upstream features as one project; it needs MVP/later phases.
- HIGH: Parity with upstream is framed as the value instead of concrete operator outcomes.
- MEDIUM: Execution orchestration should be deferred from the first implementation unless strictly necessary.
- MEDIUM: Duplicated criteria and unresolved semantics should be cleaned before `/plan-it`.
- MEDIUM: Persistent widget should not be mandatory in the MVP.

## Additional Expert Findings
### typescript-pro
- HIGH: Extension module boundaries are underspecified; top-level `pi/extensions/*.ts` auto-discovery makes helper placement risky.
- HIGH: Typecheck alone cannot prove tool schema compatibility or runtime registration.
- HIGH: Schema evolution conflicts with the current `TaskRecordV1` contract unless migration behavior is explicit.
- MEDIUM: Final validation commands and test targets are incomplete.
- MEDIUM: Widget/status API boundary needs a pure renderer plus optional UI adapter.

### backend-dev-state
- HIGH: `skipped` lifecycle semantics conflict with the current state model and are unresolved.
- HIGH: Dependency edge ownership, atomicity, duplicates, dangling references, and rollback are not precise enough.
- HIGH: Migration/backward compatibility is too vague for canonical registry changes.
- MEDIUM: Delete/clear behavior is unresolved and affects dependencies/output retrieval.
- MEDIUM: Mutation result/error contracts need typed outcomes and idempotency semantics.

### qa-engineer
- HIGH: Many acceptance criteria are not executable verification commands and duplicate coverage.
- HIGH: Tool registration criterion can pass without proving runtime usability.
- MEDIUM: Widget/subagent mocks and output/token contracts are underspecified.
- HIGH: Persistence failure tests must verify durable state, not only warning strings.
- MEDIUM: Resume/orphan and auto-clear reminders need session fixtures and one-time proof.

### ux-researcher
- HIGH: Display/noise defaults are underspecified.
- HIGH: Resume/orphan recovery lacks operator decision paths.
- MEDIUM: `/tasks` command grammar vs interactive menu is unclear.
- MEDIUM: Auto-cascade and dependency behavior need consent/preview rules.
- MEDIUM: Failure warning copy, placement, persistence, and acknowledgement are undefined.

## Suggested Additional Reviewers
- typescript-pro -- relevant because the implementation will be Pi TypeScript extensions with pnpm-only validation and auto-discovery constraints.
- backend-dev -- relevant because the canonical task registry, state transitions, dependency graph, and persistence contracts are data-integrity risks.
- qa-engineer -- relevant because PRD readiness depends on acceptance criteria that can drive reliable `/plan-it` and later `/do-it` verification.
- ux-researcher -- relevant because the feature changes operator-facing task noise, reminders, display modes, and resume flows.

## Bugs (must fix before execution)
1. PRD is not ready for `/plan-it` while core product semantics remain open: storage scope, delete/tombstone behavior, auto-cascade default, skipped-state lifecycle, and stop semantics.
2. PRD over-scopes MVP by bundling registry/tool compatibility, execution orchestration, widget modes, auto-cascade, prompt injection, recovery, settings, and storage scopes into one deliverable.
3. Security policy for persisted output/metadata and dependent prompt injection is insufficient; redaction, retention, trust boundaries, and prompt-injection handling are required.
4. Schema migration/state-transition/dependency graph contracts are too vague for a canonical registry change.
5. Acceptance criteria lack enough concrete commands, test files, fixtures, and expected assertions for `/plan-it` to produce an automation-ready plan.
6. Tool schema/runtime registration criteria are not verifiable with typecheck alone.

## Hardening
1. Add explicit Pi TypeScript module boundaries: extension entrypoint vs helper modules.
2. Define UX defaults for display mode, nudge interval, task priority ordering, warning behavior, and resume/orphan flows.
3. Split mandatory pure text/status rendering from optional persistent widget UI adapter.
4. Add concurrency/locking and partial-write tests for shared task lists and batch dependency updates.
5. Add typed mutation result contracts and idempotency guidance for retries.

## Simpler Alternatives / Scope Reductions
1. Define an MVP around native registry/tool compatibility, minimal dependencies, `/tasks` filtering/UX, explicit schemas, migration, and safety policies.
2. Defer execution orchestration (`TaskExecute`, `TaskStop`, auto-cascade, dependent output injection) to Phase 2 after the control-plane data model is stable.
3. Defer persistent widget UI to Phase 3; require only pure renderer/status output in MVP.
4. Treat upstream parity as reference material, not a product success metric.

## Automation Readiness
- Agent-runnable operational steps: PRD is not an execution plan, so full `/do-it` checklist is not required. For `/plan-it`, it needed clearer phases, decisions, and concrete verification targets.
- Credential/auth flow clarity: no credentialed external operations are required; PRD correctly prohibits secrets but lacked concrete redaction/retention policy.
- Evidence and archive gates: as a PRD, archive gates are not required; however acceptance criteria needed exact test/evidence targets for the future plan.
- Manual-only steps and justification: unresolved product choices would force `/plan-it` to make product decisions. Those should be decided in the PRD.

## Contested or Dismissed Findings
1. No targeted rebuttal was run. Reviewers converged on the same core issues: unresolved semantics, over-scoped MVP, weak security policy, vague migration/data-integrity contracts, and insufficient verification specificity.
2. Persistent widget concerns were downgraded from a must-have blocker to a scope/phase issue: a fallback pure renderer can satisfy MVP while widget support remains optional.

## Verification Notes
1. Confirmed unresolved semantics in PRD `## Open Questions`, which asks about storage scopes, delete behavior, auto-cascade default, and skipped retry behavior while those features also appear in Requirements.
2. Confirmed over-scope in `## Requirements`, which combines eight tools, dependency DAG execution, skip state, widget/display, persistence recovery, orphan detection, and settings.
3. Confirmed security gap in `## Non-Goals` and Requirements: secrets must not persist, but execution output/metadata/prompt injection are required without a concrete redaction/retention/trust policy.
4. Confirmed weak verification in `## Acceptance Criteria`, which uses generic phrases such as “unit test,” “mocked execution test,” and “simulated new session” without target files or fixtures.

## Reviewer Artifact Status
| Reviewer | Artifact | Status | Notes |
|----------|----------|--------|-------|
| reviewer | `.specs/pi-tasks-control-plane/review-1/reviewer.md` | read | Original reviewer lacked write tools; recovered via coding-light. |
| security-reviewer | `.specs/pi-tasks-control-plane/review-1/security-reviewer.md` | read | Original artifact missing despite success preview; recovered via coding-light. |
| product-manager | `.specs/pi-tasks-control-plane/review-1/product-manager.md` | read | Usable. |
| typescript-pro | `.specs/pi-tasks-control-plane/review-1/typescript-pro.md` | read | Usable. |
| backend-dev-state | `.specs/pi-tasks-control-plane/review-1/backend-dev-state.md` | read | Usable. |
| qa-engineer | `.specs/pi-tasks-control-plane/review-1/qa-engineer.md` | read | Usable. |
| ux-researcher | `.specs/pi-tasks-control-plane/review-1/ux-researcher.md` | read | Usable. |

## Timing Notes
| Step | Duration | Notes |
|------|----------|-------|
| Initial review panel | unknown | 7 reviewers launched; per-reviewer timing unavailable. |
| Artifact reads | unknown | All expected reviewer artifacts read after two targeted recoveries. |
| Recovery calls | unknown | Recovered reviewer and security-reviewer only. |
| Verification | unknown | Static inspection of PRD sections and reviewer artifacts. |
| Synthesis | unknown | `.specs/pi-tasks-control-plane/review-1/synthesis.md` |

## Auto-Apply Plan
- Applied fixes artifact: `.specs/pi-tasks-control-plane/review-1/applied-fixes.md`
- Known-blocker fixes artifact: `not run/no prior blockers`
- Section integrity check: PRD branch; plan.md execution headings not applicable; PRD headings checked with `grep -n '^## ' .specs/pi-tasks-control-plane/PRD.md`
- Standalone-readiness result: `STANDALONE READY` for `/plan-it .specs/pi-tasks-control-plane/PRD.md`
- Standalone-readiness artifact: `.specs/pi-tasks-control-plane/review-1/standalone-readiness.md`
- Repair passes used: 0

## Review Artifact
Wrote full synthesis to: `.specs/pi-tasks-control-plane/review-1/synthesis.md`

## Overall Verdict
**Fix bugs first**

## Recommended Next Step
- Apply PRD fixes, then run `/plan-it .specs/pi-tasks-control-plane/PRD.md`.
