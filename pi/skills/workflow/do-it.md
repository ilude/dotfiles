# Execute Requested Work

Execute `$ARGUMENTS` as either a raw task or a plan path ending in `plan.md`.

## Objective

Deliver the requested outcome, validate the exact workflow, preserve durable state for incomplete plan execution, and archive a completed plan when its gates pass.

If no input is provided, ask: "What should I do? Describe the task."

## Input and Scope

### Raw task

Inspect only enough repository state to establish scope, ownership, mutation boundaries, and validation.

- Execute bounded work directly.
- Use an available specialist only when distinct domain capability or independent work justifies delegation; runtime discovery and defaults own selection.
- When safe execution requires unresolved architecture, migration design, stateful rollout planning, or materially ambiguous scope, create a plan with `/plan-it <full-task>` and report its path instead of improvising.
- Report raw-task work with a concise normal summary, validation, and remaining action. Do not use plan archive wording.

### Plan path

Assume a fresh session. Read the complete plan, its durable checklist/status, owned ledger or evidence artifacts, and `templates/do-it-report-template.md`.

Require enough objective, boundaries, task breakdown, dependencies, waves, validation, and success criteria to execute safely. Older plans may proceed from equivalent content, but record any contract gap that blocks completion.

Reconcile unchecked plan items with the durable task graph. Trust checked work only when its required evidence exists and current repository state does not contradict it.

## Hard Boundaries

- Preserve public interfaces, explicit user decisions, security controls, and plan scope.
- Follow task dependencies and validation gates. Do not batch independent stateful replacements.
- Before stateful mutation, verify current backup evidence, restore action, rollback boundary, and one target.
- The first failed live mutation enters incident mode: stop later rollout work, preserve healthy systems, diagnose one affected boundary, and recover its original endpoint and persisted state before resuming.
- Use the plan's required capabilities, but resolve workers and runtime resources from what is actually available.
- Keep secrets and raw sensitive output out of plans and reports.
- Do not archive with an unresolved checklist item, required gate, deployment, blocker, or evidence mismatch.

## Execution and Evidence

Materialize the unchecked task breakdown once with one graph-aware `task batch` call: use stable keys for dependency references, `blockedByKeys` for edges, worktree-relative `scope` for writers, executable fields only for delegated work, and manual records for main-thread work. Reuse existing records on resume instead of creating duplicates. If the graph exceeds the public batch bound, record the contract gap and stop rather than publishing a partial graph.

Start `task drain` for dependency-aware background dispatch. Let the scheduler own readiness, bounded concurrency, critical-path ordering, and writer serialization; react to completion notifications rather than pumping waves with `ready`, `execute`, or polling. At quiescence, execute any ready manual task directly, record its state once, and drain again only when that state change can unblock executable work. A starvation result is a blocker and must be copied into plan state with the named failed dependencies.

Keep an item unchecked while it is in progress. Immediately after its required verification passes, mark it `[x]`, set completed status, record non-secret evidence, and save the plan before dependent or sequential work proceeds.

## Validation and Repair

Run every task-specific and wave command required by the plan. At completion, run the plan's repository-wide command set; if an older plan names none, use the strongest supported project aggregate.

On failure:

- preserve sanitized direct evidence;
- isolate the first failing boundary;
- apply the smallest safe, reversible, in-scope repair supported by evidence;
- rerun the failing command, then the gate it belongs to;
- stop when repair requires destructive action, unavailable access, secrets, production action, user judgment, out-of-scope work, or unknown rollback/blast radius.

## Manual and Deployment Gates

Manual validation is exceptional. Run all safe automated checks first.

A manual gate may be marked not required when the operation is non-destructive, reversible or backed up, covered by automated evidence, and does not affect shared or work production users. Record the risk facts and reason.

Keep a user gate for destructive or irreversible action, data-loss risk, shared production impact, paid resources, secret exposure, hardware action, or irreducibly subjective judgment. A required manual or deployment gate that is skipped, cancelled, failed, or unsafe blocks archive.

## Archive

Archive only after implementation, task-specific validation, wave validation, repository-wide validation, manual/deployment decisions, evidence checks, and archive preflight all pass or are explicitly not applicable.

Unless the plan records an explicit opt-out rationale, move the completed plan and owned sibling artifacts to a collision-safe `.specs/archive/{slug}/` path and record completion metadata. Never overwrite an existing archive.

## Evidence Review

Treat recorded blockers and review artifacts as evidence to re-verify, not permanent gates. Current repository state and a repaired or approved plan supersede stale artifacts. Do not repeat this rule in review workflows that already enforce it.

Use independent review only when direct evidence reveals friction: a blocked outcome, validation failure, manual-gate exception, archive problem or opt-out, checklist/evidence mismatch, unexpected scope expansion, or user-visible confusion. Review findings cannot overturn a successful archive unless they establish a factual completion inconsistency.

## Definition of Done

A plan execution is complete only when:

- every required checklist item and gate passed;
- the requested workflow and repository-wide completion checks passed;
- no blocker or required user/deployment action remains;
- checklist state and evidence are consistent with the outcome;
- archive preflight passed and the plan was archived, unless an explicit opt-out applies.

## Report

Use `templates/do-it-report-template.md` for plan execution. State what changed, the commands and observed results that validate it, what remains, and the next action.

The first and last lines must agree with current Execution Status: complete and archived, checkpointed with no blocker, or blocked by a recorded current condition. A report must not claim a blocker that Execution Status does not record.
