# /do-it State Machine

Input: `$ARGUMENTS`

## RESOLVE_INPUT

- If `$ARGUMENTS` is empty, ask: "What should I do? Describe the task."
- Parse `$ARGUMENTS` as either a Plan file path ending in `plan.md` or a raw task.
- Example plan path: `.specs/my-feature/plan.md`.
- A request to review a plan first transitions to `/review-it <plan-path>` before execution.
- Transition: input resolved -> CLASSIFY_RAW_OR_PLAN.

## CLASSIFY_RAW_OR_PLAN

- Plan file -> LOAD_PLAN_STATE.
- Raw task -> ROUTE_BY_COMPLEXITY.
- For Plan file execution, assume a fresh session. Use the plan and repository state, not prior chat context.

## ROUTE_BY_COMPLEXITY

Scan repository markers and likely affected files only far enough to classify scope and identify validation commands.

- Simple: any two indicators -- 1-2 files; mechanical change; no new abstraction or cross-file coordination; obvious acceptance criteria; single-revert reversibility.
- Medium: any two indicators -- 3-5 files; feature, refactor, or integration work; approach judgment without architecture; one focused session without a plan artifact.
- Complex: any two indicators -- 6+ files; architectural, cross-cutting, migration, or redesign work; meaningful approach trade-offs; cross-module/service/team coordination; unrelated-system risk; scope ambiguity requiring planning.
- Ambiguous scope defaults to Medium. If genuinely between Medium and Complex, ask whether more than 5 files or structural system interaction changes are expected.

Specialist routing table:

| Work | Route |
|---|---|
| frontend-heavy UI | `frontend-dev` |
| backend, API, or data flow | `backend-dev` |
| TypeScript-heavy | `typescript-pro` |
| Python-heavy | `python-pro` |
| infrastructure, CI, or deployment | `devops-pro` or `terraform-pro` |
| mixed domains requiring coordination | `engineering-lead` |

- Simple -> EXECUTE directly.
- Medium -> EXECUTE through the closest specialist; use `engineering-lead` only for real cross-domain coordination.
- Complex -> invoke `/plan-it <full-task>`, report the new plan path, and offer `/review-it <plan-path>` or `/do-it <plan-path>`.

## LOAD_PLAN_STATE

Route label: Execute Plan File.

- Read the plan and `templates/do-it-report-template.md`.
- Require enough Objective, Task Breakdown, Execution Waves, and Success Criteria content for safe execution; otherwise stop with exact repair or review commands.
- Treat the plan's `## Validation Contract`, `## Automation Plan`, `## Execution Checklist`, and `## Telemetry & Evidence Contract` as authoritative.
- The checklist is the durable resume ledger. Resume at the first unchecked dependency-ready item unless checked evidence is missing or contradicted.
- Older plans missing a contract may proceed from their task, wave, validation, and status content; record any gap that prevents completion in `## Execution Status`.
- Transition: executable state loaded -> EXECUTE_READY_WORK.

## EXECUTE_READY_WORK

- Execute the plan wave by wave, respecting dependencies and stopping each wave at its validation gate.
- Use the plan's task sizing and agent assignments.
- Transactional checklist rule: keep an item unchecked while in progress; after its required verification passes, immediately mark it `[x]`, set completed status, record non-secret evidence, save the plan, and only then start a dependent or sequential item.
- On failure, leave the item unchecked, record blocked or pending status and evidence, then transition to REPAIR_ON_FAILURE.
- After each wave's ready work -> VALIDATE.

## VALIDATE

- Run every task-specific and wave validation command required by the plan.
- Record structured telemetry/evidence because detailed runtime events are not yet complete. Include episode ID, phase ID, task identity, validation command, result, timestamps, archive status, and non-secret evidence as required by the plan.
- Use `pi/docs/workflow-eval-telemetry.md` for field definitions; do not invent a parallel schema.
- Pass -> next dependency-ready wave, or MANUAL_AND_DEPLOY_GATES when all waves pass.
- Fail -> REPAIR_ON_FAILURE.

## REPAIR_ON_FAILURE

- Preserve sanitized failure evidence, diagnose from repository evidence and authoritative sources, apply the smallest safe in-scope repair, and rerun the failing command.
- Validation failures are implementation feedback, not terminal states.
- Repeat while another evidence-based repair is safe, reversible, in scope, and testable.
- A real blocker exists only when a reasonable repair repeats the same failure; repair requires destructive action, unavailable access, secrets, production action, or user judgment; the needed change is out of scope; validation infrastructure cannot be safely recovered; or blast radius/rollback is unacceptable or unknown.
- Real blocker -> persist `## Execution Status`, then RECORD_WORKFLOW_EVAL.
- Repair passes -> return to VALIDATE.

## MANUAL_AND_DEPLOY_GATES

- Manual validation is exceptional. Run agent-runnable checks and treat redundant non-destructive confidence checks as optional when automated evidence covers the behavior.
- `/do-it` may downgrade a manual validation gate to not required only when the operation is clearly safe, non-destructive, reversible or backed up, automated evidence exists, and shared/work production users are unaffected. Record risk facts, reason, phase ID, and evidence.
- Keep a true user gate for destructive, irreversible, data-loss, shared-production, paid-resource, secret-exposure, hardware, or subjective-judgment risk.
- If a true manual gate remains, persist exact actions, success/failure signals, rollback, and `## Execution Status`; do not archive.
- Execute deployment required by the plan only after prior validation passes. Follow its commands, evidence, rollback, and approval boundaries.
- A required deployment that is skipped, cancelled, failed, or unsafe blocks archive.
- Gates pass or are not required -> FINAL_VALIDATION.

## FINAL_VALIDATION

- Run the plan's repo-wide completion command set after task and wave checks.
- If an older plan names none, run the strongest project aggregate command. In this repository, completion requires `make check`.
- Targeted checks do not replace this gate.
- Pass -> ARCHIVE_IF_COMPLETE.
- Fail -> REPAIR_ON_FAILURE.

## ARCHIVE_IF_COMPLETE

- Archive preflight requires all implementation, checklist, task-specific, repo-wide, manual, deployment, evidence, and archive gates to pass or be explicitly not applicable.
- No unresolved `## Execution Status` item may remain.
- If preflight fails, update `## Execution Status`, keep the plan active, and transition to RECORD_WORKFLOW_EVAL.
- After preflight, archive the completed plan by default unless the plan explicitly opted out with a rationale.
- For opted-out plans, record `archive_status: opted-out` and keep the completed plan active.
- Otherwise set completion metadata, record `archive_status: archived`, and move `.specs/{slug}/plan.md` plus owned sibling artifacts to `.specs/archive/{slug}/`; use a collision-safe path or ask before overwrite.
- Never recommend `/do-it <plan-path>` after successful archive.
- Transition -> RECORD_WORKFLOW_EVAL.

## Durable Incomplete State

- Before any incomplete or blocked report, add or update `## Execution Status` in the active plan.
- Record classification, date, last completed wave/gate, next ready wave/gate, completed work, commands/results, blocker, remaining checks, and exact user actions.
- State whether rerunning `/do-it <plan-path>` is appropriate after the blocker clears. Chat alone is not durable state.

## RECORD_WORKFLOW_EVAL

Automatic post-run workflow eval is part of `/do-it`, not a separate command.

- Always record deterministic structured telemetry/evidence and a compact eval in the plan or named artifact. Use `## Workflow Eval Record` when no better structured artifact exists.
- Use `pi/docs/workflow-eval-telemetry.md` for required fields and definitions.
- Run deterministic consistency checks before REPORT.
- Launch the hidden panel only when friction triggers exist: incomplete or blocked outcome; validation failure before repair; manual gate required, skipped, or downgraded; archive collision, failure, or opt-out; checklist/evidence mismatch; missing telemetry; unexpected scope expansion; or user-visible confusion.
- Hidden panel: `evidence-auditor` and `workflow-friction-analyst`; add `regression-test-hunter` only for a clear prompt, runtime, or test gap.
- Findings cannot overturn a successful archive unless they establish a factual completion inconsistency.
- For reviewed plans, record `execution_outcome` and `panel_quality_label`.
- Transition -> REPORT.

## REPORT

Plan-file reports must follow `templates/do-it-report-template.md`; that template owns the output contract.

Completion classifications:

- `completed-and-archived`
- `implemented-awaiting-manual-validation`
- `blocked-by-failure`
- `blocked-by-user-decision`

Use exactly one final line:

- `FINAL STATUS: COMPLETE -- archived at <archive-path>.`
- `FINAL STATUS: NOT COMPLETE -- <required validation/manual/archive gate still failing>.`
- `FINAL STATUS: BLOCKED -- <user decision needed>.`

Raw-task reports are concise normal summaries of work, validation, and remaining action; do not use plan archive wording.
