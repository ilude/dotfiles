# Execute Requested Work

Execute `$ARGUMENTS` as either a raw task or a plan path ending in `plan.md` inside exactly one owned branch/worktree beneath repository-root `.worktrees/`. Raw work is retained only after ownership is established.

If no input is provided, ask: "What should I do? Describe the task."

## Objective

Deliver the requested outcome, check the contract that changed, and preserve enough state to resume incomplete plan work.

## Raw Task

Before substantial work, state the observable evidence that would prove the requested outcome and how it could fail. If materially different completion conditions fit the request, discuss them with the operator and settle one before acting.

Inspect only enough repository state to establish scope, ownership, and relevant validation. Execute bounded work directly.

Treat work as large only when it is expected to span compaction, delegation, or delayed continuation. For large raw work, after completion evidence and scope bounds settle, create exactly one root task whose summary names the deliverable and whose Task Instructions record the completion checks. Short direct work remains task-free. Do not create a root task before bounds settle.

Create a plan only when unresolved architecture, migration design, destructive or stateful rollout, or material ambiguity makes direct execution unsafe. Otherwise do the work without adding planning ceremony.

## Plan Task

When the argument is a canonical `.specs/{slug}/plan.md`, treat that plan as the sole ledger. Read the complete plan, validate its canonical syntax, dependency graph, readiness status, and archive prerequisites before implementation, then resume from the first unchecked dependency-ready task. Do not create a duplicate root task or mirror the plan checklist in the task registry. A usable plan needs an objective, boundaries, executable tasks, real dependencies, validation, retention/archive instructions, and current status; equivalent structures are acceptable.

Treat checked work as complete when current repository state and its recorded result do not contradict it. Do not demand separate evidence files, gate IDs, wave narratives, or duplicate checklists.

Treat the plan's `Completion Evidence`, requested acceptance, stated invariants, and safety boundaries as the closed execution contract. Preserve source requirement identifiers when supplied, but do not invent requirement IDs or additional contracts. Do not silently weaken, strengthen, or reinterpret the contract. If completion evidence is missing or repository evidence cannot resolve competing material interpretations, stop and ask for the product or design decision.

Do not add tasks, follow-up work, full-suite checks, reviewer passes, telemetry, or documentation work unless the closed contract directly requires them. A reviewer finding is advisory unless it maps to requested acceptance, a stated invariant, or a safety boundary; reject or defer unmapped advice without editing for it. For a canonical plan, record progress in the plan only; use the task registry only when the operator explicitly requests separate tracking or when this is raw large work.

After a task's relevant check passes, mark its checkbox complete and save the plan. Record a concise result only when it is needed for resume, external mutation, or a required audit. A root task created for raw work remains authoritative across compaction and delegation; update it after a user correction and complete it only after its recorded checks pass.

Execute plan tasks directly. Delegate only when independent workstreams materially improve execution, and create durable tasks only when they add useful cross-turn or dependency tracking. Do not mirror the plan checklist into another tracking system by default.

## Worktree lifecycle

Before any read that may lead to mutation, establish or resume the single durable ownership record for the workflow branch and worktree. Confine every modification, validation, plan archive, and artifact operation to that worktree. Closeout archives the complete spec directory on the workflow branch, commits all in-scope artifacts, merges the branch with `--no-ff` into the primary worktree branch, verifies the merged HEAD, marks ownership complete, and removes the owned worktree and branch. Dirty, unmerged, merge-conflict, failed-merge, or failed-cleanup states stop and preserve the recovery worktree.

## Boundaries

- Keep secrets and sensitive output out of plans and reports.
- Ask before destructive, irreversible, shared-production, paid-resource, or credential-exposing action.

For actual stateful mutation, verify the current backup or explicit no-prior-state condition, restore action, rollback boundary, and one mutation target. After the first failed live mutation, stop later rollout work and recover the affected boundary before resuming. These safeguards do not apply to local code, prompts, documentation, or reversible configuration edits.

## Validation

Run only checks that can establish whether the changed contract works.

- For behavior changes, exercise the user entrypoint or closest available exact workflow.
- For code or parsed contracts, run focused tests first; run broader suites only when shared impact, repository policy, or focused failures justify them.
- For prose-only edits, inspect the revised content directly. Do not run code tests, generic repository checks, or `git diff --check` unless they test a changed parser, loader, generator, or formatting contract.
- Do not run a check merely because it is customary or available.

On failure, isolate the changed boundary, make the smallest in-scope repair, and rerun only the failing check and any directly dependent check. Stop when repair requires unavailable access, destructive action, user judgment, or scope expansion.

Do not perform a second review path. For a canonical plan, use only the correctness review and subtractive gate already recorded by `/plan-it`; validate directly against the closed contract.

## Completion

For a raw task, after the settled completion evidence passes, call `workflow_complete`. Completion requires its verified commit, `--no-ff` merge, primary HEAD check, and owned worktree/branch cleanup. Complete any root task only after that tool succeeds.

For an incomplete plan, keep it at its existing path and save the current status and exact next ready task.

For a canonical `.specs/{slug}/plan.md`, completion requires all of these steps:

1. Finish every required task and prove the plan's `Completion Evidence` with relevant validation.
2. Mark the required task checkboxes, validation checkboxes, frontmatter status, completion date, and execution status complete.
3. Call `plan_archive` with the original plan path. Do not use shell commands or file edits to move the plan.
4. Confirm the tool returned `.specs/archive/{slug}/plan.md`, committed the workflow branch, merged it with `--no-ff` into the clean primary branch, verified merged HEAD, and removed only the owned worktree and branch.

The plan is not complete until `plan_archive` succeeds. The tool archives the entire spec directory with its supporting artifacts, commits in-scope work, merges and verifies the primary branch, and performs owned cleanup. It refuses incomplete plans, unsafe paths, archive collisions, dirty primary state, branch changes, and unresolved merge conflicts. A plan already under `.specs/archive/` needs no further move.

## Report

State what changed, relevant validation, and anything that remains. For incomplete plan work, include the exact next ready task. Do not add timing, finding counts, or evidence inventories unless the work requires them.
