# Execute Requested Work

Execute `$ARGUMENTS` as either a raw task or a plan path ending in `plan.md` inside exactly one owned branch/worktree beneath repository-root `.worktrees/`. Raw work is retained only after ownership is established.

If no input is provided, ask: "What should I do? Describe the task."

## Execution controls

`/do-it` prepares its owned worktree and validates the execution copy before clearing into a fresh session. Setup failures preserve the current session; a retry may finish transfer into an untouched baseline worktree, but never overwrite execution progress. The fresh session dispatches the prepared plan only while its bytes, ownership, canonical path, and effective closeout policy still match. Dispatch shows the selected execution path, worktree/branch, mode, and closeout policy. Cancelled session replacement reports that execution did not start and preserves the prepared workspace for retry. Only the exact `--no-clear` flag suppresses session replacement, only the exact `--in-place` flag suppresses owned-worktree execution, and only the exact `--no-merge` flag selects commit-and-retain closeout; the flags are independent and may be combined in any order. `--` ends option parsing, so following text is literal task input. Plan wording, commit wording, or incident wording never selects either exception.

Default closeout archives and commits, then merges and cleans the owned workflow. Retain policy, including explicit `--no-merge`, archives and commits without merging and preserves the owned branch, worktree, and ownership record. `--no-merge` overrides a canonical plan's default merge policy. With `--in-place`, no-merge is redundant and the existing in-place verification remains required. In-place closeout commits in the invoking worktree without creating, inspecting, merging, or removing another worktree; it fails closed if durable mode state, worktree, branch, descendant baseline, clean state, or completed archive requirements do not match.

Direct interactive or RPC input is routed to `/do-it` only for an execution verb plus an exact canonical plan path, or `this plan` when one recent canonical plan is uniquely identified. Trusted extension input is not eligible to mint that route. Native argument completion uses a cached active-plan list, refreshed on session transitions, plan readiness, and successful archival.

## Objective

Deliver the requested outcome and preserve enough state to resume incomplete plan work. By default, finish implementation, test authoring, and integration before the root runs one final validation phase; an explicit operator early or TDD choice overrides that order.

## Raw Task

For raw work, apply the repository completion-evidence and operator-decision rules before acting.

Inspect enough repository state to establish the cause, affected callers, scope, ownership, and relevant validation. Distinguish evidence from implementation assumptions, then execute bounded work directly.

Treat work as large only when it is expected to span compaction, interruption, or delayed continuation, or when the operator explicitly requests tracking. For large raw work, after completion evidence and scope bounds settle, create exactly one root task whose summary names the deliverable and whose Task Instructions record the completion checks. Short direct work remains task-free; delegation or an independently verifiable deliverable alone does not require a task. Preserve mandatory unattended-goal root tasks. Do not create a root task before bounds settle.

Create a plan only when unresolved architecture, migration design, destructive or stateful rollout, or material ambiguity makes direct execution unsafe. Otherwise do the work without adding planning ceremony.

## Plan Task

When the argument is a canonical `.specs/{slug}/plan.md`, treat that plan as the sole ledger. Read the complete plan, validate its canonical syntax, dependency graph, readiness status, and archive prerequisites before implementation, then resume from the first unchecked dependency-ready task. Do not create a duplicate root task or mirror the plan checklist in the task registry. A usable plan needs an objective, boundaries, executable tasks, real dependencies, validation, retention/archive instructions, and current status; equivalent structures are acceptable.

Treat checked work as complete when current repository state and its recorded result do not contradict it. For implementation tasks, their task-specific `Done when` and recorded result establish authored-work completion only; inspection does not establish behavior verification. Do not demand separate evidence files, gate IDs, wave narratives, or duplicate checklists.

Treat the plan's `Completion Evidence`, requested acceptance, stated invariants, and safety boundaries as the closed execution contract. Preserve source requirement identifiers when supplied, but do not invent requirement IDs or additional contracts. Do not silently weaken, strengthen, or reinterpret the contract. If completion evidence is missing or repository evidence cannot resolve competing material interpretations, stop and ask for the product or design decision.

Keep acceptance, invariants, explicit operator design decisions, and authority fixed, but reassess implementation assumptions when repository evidence disproves them. Do not keep patching a disproven approach to preserve the original file list. The root records an in-scope method revision in the existing plan or task before continuing or reassigning affected work. If the revision changes an explicit operator decision, acceptance, repository authority, a live-mutation plan, or protected task mappings, stop the affected work and obtain the required decision or reconciliation. Method revisions never bypass plan handoff checks, worktree ownership, or the shared repair allowance.

Do not add tasks, follow-up work, full-suite checks, reviewer passes, telemetry, or documentation work unless the closed contract directly requires them. A reviewer finding is advisory unless it maps to requested acceptance, a stated invariant, or a safety boundary; reject or defer unmapped advice without editing for it. For a canonical plan, record progress in the plan only; use the task registry only when the operator explicitly requests separate tracking or when this is raw large work. Do not add early development checks by default.

Mark an implementation checkbox when its authored-work acceptance is met by source inspection, without running deferred development checks. Keep final acceptance unchecked until the executable evidence passes. For legacy plans that gate each implementation task on runtime checks, record the scheduling adjustment: preserve those behavior criteria and commands in a final acceptance task and distinguish authored completion on the implementation tasks. Preserve task identity, real dependencies, and existing passing evidence; do not weaken the overall acceptance contract. Save concise implementation progress, used checks, and remaining repair allowance in the existing Execution Status notes so resume does not replay edits or reset the budget. A root task created for raw work remains authoritative across compaction and delegation; update it after a user correction and complete it only after its recorded checks pass.

Execute normal plan tasks directly; use repository delegation policy for independent or context-isolated slices without creating a task merely because work is delegated or independently verifiable. Finish implementation, test authoring, and integration before the root-owned final validation task or `Validation` batch. Children do not run development validation unless the plan records an explicit operator early/TDD choice. When tracking is required, use the sequence record/assign -> root tool or actual subagent invocation -> validate -> record the terminal outcome. Readiness selects eligible work only; it never dispatches work, and assigned means selected work rather than live process activity. Do not mirror the plan checklist into another tracking system.

For live tasks, the root runs every live command; leaves never run live commands. Before that task's first live action, confirm its actual target, authorization, session, cap, terminal outcomes, hard stop, and concrete cleanup. Missing prerequisites block that action, not independent earlier implementation. Judge cleanup and verification instructions by meaning; keyword presence or absence does not establish safety. After any live attempt, record exactly one ledger row and stop. A `rejected` terminal outcome completes a live evaluation task. A material fixture change does not reset the attempt count. If the cap is reached, ask the operator before another attempt. Before delegating analysis of external evidence, copy that evidence into `.tmp/evidence/<task>/` and give the leaf only that bounded artifact.

When a user correction changes the active task outcome, update the active task bound first and disregard results from children still working from the superseded bound. Do not automatically cancel those children; reconcile them through the existing process controls when needed.

## Worktree lifecycle

Before any read that may lead to mutation, establish or resume the single durable ownership record for the workflow branch and worktree. Confine implementation and validation to that worktree. After validation, perform the recoverable Git closeout directly. The default policy archives a completed spec, commits in-scope artifacts, and merges the workflow branch with `--no-ff` into the primary branch. When Retention contains the exact commit-and-retain `Closeout` policy, archive the completed spec and commit nonignored in-scope artifacts, but do not merge; retain the owned branch, worktree, and ownership record. Never force-add or commit ignored plan files. Inspect current Git state and repair only the failed boundary when archive, commit, or merge work fails; never abort, reset, replay, or clean up blindly. The closeout tool only verifies the selected policy and performs default-policy cleanup. Dirty, unmerged, merge-conflict, failed-merge, or failed-cleanup states preserve the recovery worktree. If closeout was interrupted after archival, retry the original `/do-it .specs/{slug}/plan.md` command. The owned completed archive selects closeout-only recovery; do not recreate the active plan or repeat implementation. Inspect current Git state before resuming the unfinished closeout step.

## Boundaries

- Keep secrets and sensitive output out of plans and reports.
- Ask before destructive, irreversible, shared-production, paid-resource, or credential-exposing action.

For actual stateful mutation, verify the current backup or explicit no-prior-state condition, restore action, rollback boundary, and one mutation target. After the first failed live mutation, stop later rollout work and recover the affected boundary before resuming. These safeguards do not apply to local code, prompts, documentation, or reversible configuration edits.

## Validation

Apply repository contract-directed validation to the plan's completion evidence. The root owns one final validation phase after implementation, test authoring, and integration settle. Run each necessary command in the plan's `Validation` section once; that section carries timing and budget. An explicit operator early or TDD choice may authorize bounded earlier checks. Preserve legacy per-task checks and evidence, but batch their execution unless that choice or a safety boundary requires earlier validation.

- For behavior changes, exercise the user entrypoint or closest available exact workflow.
- For prose-only edits, inspect the revised content directly; do not run code tests, generic repository checks, or `git diff --check` unless they test a changed parser, loader, generator, or formatting contract.

On a final-phase failure, classify it as fixture/harness, product, external-contract misunderstanding, or protocol violation before editing. Make at most one focused development repair batch, then run one targeted rerun for the entire affected outcome. The allowance is shared across tasks, children, messages, and resume. If any check still fails after that rerun, stop patching, reassess the mechanism, assumptions, and harness, and report the evidence with a better approach or blocker. Further repair or validation requires user direction even if the failure signature changed. Closeout/archive/merge recovery remains a separate incident boundary and does not authorize development repair or validation reruns.

For a canonical plan, validate directly against the closed contract. An explicit final validation task remains incomplete until its acceptance check passes.

## Completion

For a raw task, after the settled completion evidence passes, stage and commit the in-scope work on the workflow branch, merge it with `--no-ff` into the primary branch, then call `workflow_complete`. The tool verifies the commit, merge, primary HEAD, cleanliness, and ownership before removing the owned worktree and branch. Complete any root task only after that verification succeeds.

For an incomplete plan, keep it at its existing path and save the current status and exact next ready task.

For a canonical `.specs/{slug}/plan.md`, completion requires all of these steps:

1. Finish every required implementation, test-authoring, integration, and explicit final validation task. Prove the plan's `Completion Evidence` only with the root-owned final validation phase or an explicitly authorized early/TDD check.
2. Mark the required task checkboxes, validation checkboxes, frontmatter status, completion date, and execution status complete.
3. Move the complete spec directory to `.specs/archive/{slug}/` in the workflow worktree and stage and commit all nonignored in-scope artifacts. Never force-add an ignored plan. Under the default policy, merge the workflow branch with `--no-ff` into the primary branch. Under commit-and-retain policy, do not merge.
4. Call `plan_archive` with the original plan path. Under the default policy, the tool verifies the exact archive, source absence, completed plan, clean workflow and primary state, required merge commit, and ownership before removing only the owned worktree and branch. Under commit-and-retain policy, it verifies the archive, completed plan, clean committed branch, and non-merge state, then leaves the owned worktree, branch, and ownership record intact.

The plan is not complete until `plan_archive` verifies closeout. The tool does not archive, commit, merge, abort, reset, or resolve conflicts. On failure, inspect the reported current state, repair only that recoverable boundary, and call it again. It refuses incomplete plans, unsafe paths, dirty state, branch changes, policy violations, and unresolved conflicts. A plan already under `.specs/archive/` needs no further move.

## Report

State what changed, relevant validation, and anything that remains. For incomplete plan work, include the exact next ready task. Do not add timing, finding counts, or evidence inventories unless the work requires them.
