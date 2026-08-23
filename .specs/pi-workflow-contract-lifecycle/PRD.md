---
created: 2026-08-21
updated: 2026-08-23
status: draft-proposal
---

# PRD: Pi Contract, Execution, and Validation Workflow

## Proposal status

This PRD is the single open product proposal for future Pi workflow changes. It does not describe current command authority. Current behavior and consolidated research are recorded in `README.md` and `research.md`.

As of 2026-08-23, `/goal`, `/plan-it`, and `/do-it` already implement persistent goal state, reviewed canonical plans, workflow-owned worktree isolation, bounded execution, validation, merge, and archive behavior. `/validate-it` and `/do-it --repair` do not exist. `/review-it` is retired from Pi registration, while `/prd-it` remains available for optional product-definition work.

The central product question is whether independent validation and explicitly authorized repair require new public commands and a second durable artifact, or whether the existing plan and `/do-it` lifecycle can enforce the same authority separation with less ceremony.

## Problem

Pi's planning, review, implementation, and validation responsibilities are spread across overlapping public workflows. Review findings can be interpreted by the active implementor as new work authorization, even when they strengthen the accepted contract, cross ownership boundaries, or require unrelated files. This creates scope expansion, gold plating, churn, and unsafe behavior in shared worktrees.

The operator wants one understandable lifecycle:

```text
/plan-it -> /do-it -> /validate-it
```

`/plan-it` must finish plan review before implementation begins. `/do-it` must execute only accepted work. `/validate-it` must independently evaluate the result, present findings for discussion, and hand only explicitly authorized, bounded repairs back to `/do-it`.

This direction follows current 2026 evidence favoring enforced role separation, read-only reviewers and validators, scoped repository rules, explicit action authorization, and restraint evaluation rather than prompt-only role descriptions.

## Goals

1. Establish a single public workflow from reviewed plan through implementation and independent validation.
2. Prevent review and validation findings from becoming implicit implementation authority.
3. Make scope, ownership, threat-model, and repair decisions explicit and reviewable in the transcript and durable artifacts.
4. Make `/plan-it` produce an implementation authority and an independent validation contract before `/do-it` starts.
5. Let the operator discuss validation findings and proposed solutions without ordinary conversation authorizing mutations.
6. Return approved repairs to an implementor through narrow, enforceable repair contracts.
7. Remove unused public workflows that overlap or distract from this lifecycle.

## Non-Goals

- Implementing this redesign as part of the active subagent-execution-safety work.
- Allowing `/validate-it` to modify product code.
- Automatically fixing every review or validation finding.
- Treating finding severity or reviewer wording as work authorization.
- Replacing deterministic tests, permission checks, branch protections, or repository validation policy with model review.
- Redesigning durable task persistence or subagent execution except where later planning identifies a direct integration requirement.
- Removing generic PRD expertise or PRD support used outside the public `/prd-it` command unless separately requested.

## Users / Jobs To Be Done

- **Primary user:** The Pi operator running substantial repository work across multiple sessions.
- **Job:** Define a bounded change, have it challenged for correctness and unnecessary complexity, execute it without scope drift, independently validate the result, discuss failures, and authorize only the repairs that are actually wanted.
- **Current workaround:** Rely on prose instructions and manually stop the implementor when review feedback causes it to expand scope.

## Product Model

### Public lifecycle

```text
/plan-it <objective-or-source>
/do-it <accepted-plan>
/validate-it <implemented-plan>
```

A failed validation routes as follows:

```text
already-authorized repair -> /do-it --repair <repair-id>
contract, ownership, or threat-model change -> /plan-it
missing access or external dependency -> operator action
all required evidence passes -> complete and archive
```

### Durable artifacts

`/plan-it` produces exactly two canonical artifacts:

```text
.specs/{slug}/plan.md
.specs/{slug}/validation.md
```

- `plan.md` is the accepted implementation authority.
- `validation.md` contains the frozen validation contract plus append-only validation results, findings, operator dispositions, and approved repair authorizations.
- The expected claims and checks in `validation.md` cannot be weakened after implementation is observed. A changed expectation requires a new plan contract revision.

### Authority separation

| Workflow | Defines contract | Reviews contract | Mutates product code | Judges result |
| --- | --- | --- | --- | --- |
| `/plan-it` | Yes | Yes | No | No |
| `/do-it` | No | No | Yes | No |
| `/validate-it` | No | No | No | Yes |

## Requirements

### Public command surface

- **REQ-001:** Pi shall expose `/plan-it`, `/do-it`, and `/validate-it` as the public workflow for substantial planned implementation.
  - Verification: Command registration and provider-visible guidance expose all three commands with non-overlapping responsibilities.

- **REQ-002:** Pi shall remove the public `/review-it`, `/prd-it`, and `/improve` command surfaces and their command-specific guidance, tools, and tests when they have no remaining owner.
  - Exceptions: Generic PRD expertise and passive workflow-friction telemetry remain unless an accepted plan explicitly removes them.
  - Verification: Exact command registration and command documentation searches return no retired public command, while retained non-command capabilities continue to pass their focused tests.

### Plan creation and review

- **REQ-003:** `/plan-it` shall write `plan.md` and `validation.md` under one canonical `.specs/{slug}/` directory before reporting the plan ready for execution.
  - Verification: A successful plan lifecycle produces both schema-valid artifacts and refuses readiness when either is absent or inconsistent.

- **REQ-004:** `plan.md` shall define the objective, completion evidence, non-goals, authorized repositories and paths, affected interfaces, existing invariants, threat model, tasks, dependencies, operator decisions, and deferred findings required for implementation.
  - Verification: Plan lifecycle validation rejects an accepted plan missing a required contract field.

- **REQ-005:** `/plan-it` shall run one read-only adversarial review of the draft contract before acceptance.
  - Verification: Plan lifecycle evidence records the review and every finding receives a terminal disposition.

- **REQ-006:** After adversarial findings are settled, `/plan-it` shall run one read-only restraint review covering over-engineering, gold plating, unnecessary compatibility, speculative extensibility, redundant telemetry, repeated verification, cross-client duplication, ownership expansion, shared-worktree churn, and work introduced only by reviewer preference.
  - Verification: Plan readiness requires a restraint-review outcome and terminal dispositions for its findings.

- **REQ-007:** Reviewers shall not edit plan artifacts, add tasks directly, or authorize implementation.
  - Verification: Reviewer execution uses read-only authority and returns findings to `/plan-it` for adjudication.

- **REQ-008:** `/plan-it` shall classify every material review finding as `required_repair`, `rejected`, `deferred`, `operator_decision`, or `no_change` before plan acceptance.
  - Verification: Unsettled findings prevent readiness.

- **REQ-009:** A `required_repair` disposition shall cite an accepted objective, existing invariant, introduced regression, or required validation claim as its authority.
  - Verification: A finding without one of these authorities cannot transition to `required_repair`.

- **REQ-010:** A finding that introduces a new repository, ownership boundary, public contract, threat model, or unplanned path shall require an operator decision rather than automatic plan expansion.
  - Verification: Safe counterexample tests prove that high-severity but contract-strengthening findings do not become tasks automatically.

- **REQ-011:** Plan review shall be bounded to one adversarial pass and one restraint pass, with targeted reinspection only when an accepted repair materially changes the reviewed contract.
  - Verification: Lifecycle state prevents an unchanged review boundary from being run repeatedly.

### Validation contract

- **REQ-012:** `validation.md` shall define traceable validation claims, direct evidence methods, expected results, behavioral scenarios, negative checks, compatibility checks, scope checks, security and privacy checks, external-boundary checks, prerequisites, and known unvalidated boundaries that materially apply to the plan.
  - Verification: Every required validation claim maps to a plan objective, invariant, or task and has a direct pass condition.

- **REQ-013:** Validation claims shall test observable behavior, parsed contracts, protocols, or runtime evidence rather than source wording or internal layout unless layout is itself an accepted contract.
  - Verification: Contract validation rejects unsupported prose-presence checks as primary evidence.

- **REQ-014:** `/do-it` shall not weaken, replace, or remove frozen validation claims or expected results.
  - Verification: Validation-contract changes after plan acceptance require a new contract revision and return to `/plan-it`.

### Implementation

- **REQ-015:** `/do-it` shall execute only an accepted `plan.md` whose contract revision matches `validation.md`.
  - Verification: Missing, draft, mismatched, or superseded artifacts prevent implementation.

- **REQ-016:** `/do-it` shall treat authorized repositories, paths, interfaces, and prohibited changes as execution boundaries rather than advisory reviewer suggestions.
  - Verification: An attempted edit outside the accepted boundary stops the affected work and returns `operator_decision` or `replan_required` without mutating the new target.

- **REQ-017:** `/do-it` shall report adjacent findings without repairing them unless they directly prevent an authorized task from satisfying its existing contract.
  - Verification: A seeded unrelated finding is reported and remains unmodified.

- **REQ-018:** `/do-it` shall finish implementation with an `awaiting_validation` outcome and shall not declare the objective complete or archive the specification.
  - Verification: Completion and archival remain unavailable until `/validate-it` passes.

### Independent validation and discussion

- **REQ-019:** `/validate-it` shall have read-only authority over product code and may inspect files, diffs, logs, runtime state, and artifacts; run approved checks; and write only bounded validation results and decision records to `validation.md`.
  - Verification: Product mutation tools are unavailable during validation, and validation-contract fields remain immutable.

- **REQ-020:** `/validate-it` shall return one typed outcome: `passed`, `findings_open`, `repair_required`, `replan_required`, `blocked`, or `inconclusive`.
  - Verification: Every validation run terminates in exactly one allowed outcome with supporting evidence.

- **REQ-021:** Each validation finding shall have a stable ID, violated claim, evidence, severity, affected ownership and paths, status, and one or more bounded proposed solutions when evidence supports them.
  - Verification: Findings missing required evidence or claim authority cannot be offered for repair authorization.

- **REQ-022:** The operator shall be able to discuss an open finding, challenge its evidence, compare alternatives, and refine a proposed solution without ordinary conversation changing its authorization state.
  - Verification: Questions and free-form discussion leave the finding `open` or `discussing`.

- **REQ-023:** A finding shall transition only through an explicit operator disposition: `approve_repair`, `reject`, `defer`, `replan`, or `accept_risk`.
  - Verification: The complete proposed decision is written to the transcript before persistence, and no implicit decision parser changes state.

### Repair handoff

- **REQ-024:** An `approve_repair` disposition shall create a stable repair authorization containing the finding ID, authority, exact objective, approved approach, authorized paths, prohibited changes, required evidence, and stop conditions.
  - Verification: `/do-it --repair <repair-id>` refuses incomplete, unapproved, stale, or superseded repair authorizations.

- **REQ-025:** A repair authorization may permit only work already within the accepted plan's repositories, ownership, public contract, and threat model.
  - Verification: A proposed repair outside those boundaries can transition only to `replan` or another non-implementation disposition.

- **REQ-026:** `/do-it --repair <repair-id>` shall receive only the relevant contract excerpt, finding evidence, approved approach, boundaries, prohibited changes, and required validation claims.
  - Verification: The repair implementor is not prompted to fix all findings or inspect unrelated reviewer discussion.

- **REQ-027:** `/do-it --repair` shall stop with `repair_blocked` when the approved approach cannot satisfy the claim without crossing a stop condition; it shall not choose a broader approach autonomously.
  - Verification: A seeded insufficient repair cannot add paths, change ownership, or strengthen the contract.

- **REQ-028:** After a repair implementation, control shall return to `/validate-it` to rerun the affected claims before broader checks required by the validation contract.
  - Verification: A repair cannot close its own finding or mark validation passed.

### Completion and archival

- **REQ-029:** The workflow shall archive the specification only after every required claim passes, every finding has a terminal disposition, and no required repair remains awaiting revalidation.
  - Verification: Archive refuses open findings, mismatched revisions, blocked required checks, or unvalidated repairs.

- **REQ-030:** Runtime state and transcript output shall make the active contract revision, workflow phase, open findings, approved repair IDs, and next valid command observable to the operator.
  - Verification: Resume and status checks identify the same authoritative artifacts and legal next transition.

### Non-functional requirements

- **NFR-001:** Scope, path, command-state, disposition, and artifact-revision enforcement shall use deterministic code rather than model judgment where inputs are structured.
  - Verification: Unit tests exercise allowed and denied transitions without provider calls.

- **NFR-002:** Review, validation, and repair records shall not persist raw secrets, credentials, unrestricted command output, or unrelated transcript content.
  - Verification: Serialization tests reject prohibited fields and bound retained evidence.

- **NFR-003:** The workflow shall preserve unrelated working-tree changes and stop an owning boundary when concurrent changes make the inspected contract stale.
  - Verification: Shared-worktree tests prove that foreign changes are neither discarded nor silently incorporated.

- **NFR-004:** The workflow shall avoid repeated review, validation, or repair loops with unchanged evidence and unchanged relevant state.
  - Verification: Repeated identical attempts terminate with an explicit blocked or unchanged outcome.

## Acceptance Criteria

1. [ ] Given a substantial objective, when `/plan-it` reaches ready state, then one accepted `plan.md` and one frozen `validation.md` exist with matching contract revisions.
   - Verification: Focused lifecycle tests inspect both artifacts and readiness gates.

2. [ ] Given adversarial and restraint findings, when `/plan-it` adjudicates them, then every finding has a terminal disposition and only authority-backed required repairs alter the plan.
   - Verification: Tests include real violations, safe counterexamples, unrelated suggestions, and contract-strengthening findings.

3. [ ] Given an accepted plan, when `/do-it` attempts an unplanned repository or path, then the mutation is refused and the workflow returns an operator or replan decision without changing that target.
   - Verification: Tool-boundary integration test checks the working tree.

4. [ ] Given completed implementation, when `/validate-it` runs, then it cannot mutate product code and produces a typed evidence-backed outcome.
   - Verification: Tool visibility and integration tests prove read-only authority.

5. [ ] Given an open validation finding, when the operator asks questions or discusses alternatives, then no repair is authorized until an explicit disposition is recorded.
   - Verification: Transcript and state-transition tests cover questions, corrections, rejection, deferral, risk acceptance, replan, and repair approval.

6. [ ] Given an approved repair, when `/do-it --repair` runs, then it can change only the authorized paths and approach and must stop rather than broaden the repair when a stop condition is reached.
   - Verification: Repair-contract tests seed adjacent findings and insufficient approved approaches.

7. [ ] Given a completed repair, when validation resumes, then the affected claims are independently rerun and the implementor cannot close its own finding.
   - Verification: End-to-end state-machine test covers repair authorization through revalidation.

8. [ ] Given open findings, mismatched revisions, blocked required checks, or an unvalidated repair, when archival is requested, then archival is refused with the exact unmet condition.
   - Verification: Archive-gate tests cover every refusal and the passing path.

9. [ ] Given the redesigned workflow is installed, when public command registration and documentation are inspected, then `/plan-it`, `/do-it`, and `/validate-it` remain and `/review-it`, `/prd-it`, and `/improve` are absent.
   - Verification: Focused command-surface and documentation checks pass.

## Alternatives Considered

| Option | Pros | Cons | Decision |
| --- | --- | --- | --- |
| Keep `/review-it` as a separate command | Explicit review entry point | Ambiguous pre- versus post-implementation meaning; findings can leak into execution authority | Reject |
| Let `/validate-it` repair code | Shorter loop | Collapses verifier and executor roles and recreates review-driven scope expansion | Reject |
| Store each repair in a third artifact | Clean separation | Adds artifact and lifecycle overhead | Reject initially; use bounded records in `validation.md` |
| Let free-form discussion authorize repair | Conversational | Ambiguous and unsafe across corrections or exploratory questions | Reject |
| Integrate plan review into `/plan-it` | Produces an execution-ready contract before mutation | Requires bounded internal lifecycle | Accept |

## Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Workflow becomes too ceremonial for small changes | Operators avoid it or incur unnecessary overhead | Keep substantial planned work as the activation boundary; ordinary small edits remain direct |
| Validation contract is rewritten to match implementation | False confidence and self-approval | Freeze claims and expected results by contract revision |
| Repair contracts remain too broad | Implementor repeats scope expansion | Exact paths, prohibited changes, stop conditions, one bounded repair unit |
| Review passes generate noise | Plans grow instead of shrink | Authority-backed dispositions, restraint review, safe-counterexample evals, bounded passes |
| Artifact state diverges from transcript or runtime | Unsafe resume behavior | Stable IDs, matching revisions, deterministic transition validation |
| Retired workflows leave hidden tools or aliases | Multiple authority paths remain | Exact registration, discovery, documentation, and resume-compatibility inventory during planning |

## PR-first CI extension

A later phase may move broad repository gates to protected Forgejo pull requests while retaining focused local checks. Any repair flow must bind to the exact failed PR head, preserve required checks and branch protection, classify non-code failures before agent work, reject stale events, limit repeated attempts, and keep merge authority separate. The deterministic coordinator may authorize only the recorded repair scope on the PR branch. Full research and open decisions are in `research.md`.

## Dependencies

- Existing Pi plan lifecycle, plan progress, workflow-owned worktrees, merge and archival tools, task, tool visibility, and workflow-command infrastructure.
- Current repository instructions governing shared worktrees, review passes, adjacent findings, and deterministic validation.
- A later migration decision for active or archived artifacts created by retired workflows.

## Open Questions

1. Should passive workflow-friction telemetry remain after the public `/improve` workflow and its decision tool are removed, or should the entire feature be retired?
2. Should explicit validation dispositions use subcommands such as `/validate-it decide ...`, a dedicated model tool, or both with one canonical persistence boundary?
3. Should accepted plans permit bounded path patterns, exact paths only, or both with deterministic canonicalization?
4. How should active legacy `/review-it`, `/prd-it`, or `/improve` session state be retired without making resumed sessions execute an obsolete authority path?
5. Which sections of `plan.md` may record execution progress without changing the accepted contract revision?

## Research Basis

The complete source record, URLs, weekend session decisions, current implementation baseline, limitations, and PR-first CI research are consolidated in `research.md`.

- OpenAI, "Auto-review of agent actions without synchronous human oversight," April 30, 2026: separate action review from the completion-driven executor and stop repeated denied trajectories.
- Kim et al., "TeamBench: Evaluating Agent Coordination under Enforced Role Separation," May 2026: prompt-only roles produced more verifier mutation attempts, and verifier approval was not a reliable correctness signal.
- OpenAI, "Custom Code Review rules for Codex," July 20, 2026: evaluate restraint and safe counterexamples, scope rules narrowly, and retain deterministic enforcement.
- Current Codex documentation: dedicated review and reviewer agents operate read-only.
- Current Claude Code permission documentation: deterministic deny, ask, and allow precedence enforces authority beyond prompts.
- Current GitHub Copilot cloud-agent documentation: implementation remains isolated from review and merge authority.

## Plan Handoff

This PRD is intentionally separate from the active subagent-execution-safety work. Finish or settle that work before starting this redesign.

Recommended later command:

```bash
/plan-it .specs/pi-workflow-contract-lifecycle/PRD.md
```

The planner must resolve the open questions, inventory every retired command's current owners, and preserve the three-role authority separation described here.
