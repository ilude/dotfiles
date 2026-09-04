# Execute Requested Work

Execute `$ARGUMENTS` as either a raw task or a plan path ending in `plan.md` inside exactly one owned branch/worktree beneath repository-root `.worktrees/`. Raw work is retained only after ownership is established.

If no input is provided, ask: "What should I do? Describe the task."

## Execution controls

`/do-it` clears into a fresh session and uses an owned worktree by default. Only the exact `--no-clear` flag suppresses session replacement, only the exact `--in-place` flag suppresses owned-worktree execution, and only the exact `--no-merge` flag selects commit-and-retain closeout; the flags are independent and may be combined in any order. `--` ends option parsing, so following text is literal task input. Plan wording, commit wording, or incident wording never selects either exception.

Default closeout archives and commits, then merges and cleans the owned workflow. Retain policy, including explicit `--no-merge`, archives and commits without merging and preserves the owned branch, worktree, and ownership record. `--no-merge` overrides a canonical plan's default merge policy. With `--in-place`, no-merge is redundant and the existing in-place verification remains required. In-place closeout commits in the invoking worktree without creating, inspecting, merging, or removing another worktree; it fails closed if durable mode state, worktree, branch, descendant baseline, clean state, or completed archive requirements do not match.

Direct interactive or RPC input is routed to `/do-it` only for an execution verb plus an exact canonical plan path, or `this plan` when one recent canonical plan is uniquely identified. Trusted extension input is not eligible to mint that route. Native argument completion uses a cached active-plan list, refreshed on session transitions, plan readiness, and successful archival.

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

Execute normal plan tasks directly. Delegate only independently parallel work or work that materially benefits from context isolation, and create durable tasks only when they add useful cross-turn or dependency tracking. Do not mirror the plan checklist into another tracking system by default.

For live tasks, the root runs every live command; leaves never run live commands. Before an attempt, confirm the plan's session, cap, terminal outcomes, and hard stop. After any live attempt, record exactly one ledger row and stop. A `rejected` terminal outcome completes a live evaluation task. A material fixture change does not reset the attempt count. If the cap is reached, ask the operator before another attempt. Before delegating analysis of external evidence, copy that evidence into `.tmp/evidence/<task>/` and give the leaf only that bounded artifact.

When a user correction changes the active task outcome, update the active task bound first and disregard results from children still working from the superseded bound. Do not automatically cancel those children; reconcile them through the existing process controls when needed.

## Worktree lifecycle

Before any read that may lead to mutation, establish or resume the single durable ownership record for the workflow branch and worktree. Confine implementation and validation to that worktree. After validation, perform the recoverable Git closeout directly. The default policy archives a completed spec, commits in-scope artifacts, and merges the workflow branch with `--no-ff` into the primary branch. When Retention contains the exact commit-and-retain `Closeout` policy, archive the completed spec and commit nonignored in-scope artifacts, but do not merge; retain the owned branch, worktree, and ownership record. Never force-add or commit ignored plan files. Inspect current Git state and repair only the failed boundary when archive, commit, or merge work fails; never abort, reset, replay, or clean up blindly. The closeout tool only verifies the selected policy and performs default-policy cleanup. Dirty, unmerged, merge-conflict, failed-merge, or failed-cleanup states preserve the recovery worktree.

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

On failure, isolate the changed boundary, make the smallest in-scope repair, and rerun only the failing check and any directly dependent check. The task, not the edit, is the validation unit: batch related edits before checking. If a repair leaves the failure signature unchanged, report it and stop. Stop when repair requires unavailable access, destructive action, user judgment, or scope expansion.

Do not perform a second review path. For a canonical plan, use only the correctness review and subtractive gate already recorded by `/plan-it`; validate directly against the closed contract.

## Completion

For a raw task, after the settled completion evidence passes, stage and commit the in-scope work on the workflow branch, merge it with `--no-ff` into the primary branch, then call `workflow_complete`. The tool verifies the commit, merge, primary HEAD, cleanliness, and ownership before removing the owned worktree and branch. Complete any root task only after that verification succeeds.

For an incomplete plan, keep it at its existing path and save the current status and exact next ready task.

For a canonical `.specs/{slug}/plan.md`, completion requires all of these steps:

1. Finish every required task and prove the plan's `Completion Evidence` with relevant validation.
2. Mark the required task checkboxes, validation checkboxes, frontmatter status, completion date, and execution status complete.
3. Move the complete spec directory to `.specs/archive/{slug}/` in the workflow worktree and stage and commit all nonignored in-scope artifacts. Never force-add an ignored plan. Under the default policy, merge the workflow branch with `--no-ff` into the primary branch. Under commit-and-retain policy, do not merge.
4. Call `plan_archive` with the original plan path. Under the default policy, the tool verifies the exact archive, source absence, completed plan, clean workflow and primary state, required merge commit, and ownership before removing only the owned worktree and branch. Under commit-and-retain policy, it verifies the archive, completed plan, clean committed branch, and non-merge state, then leaves the owned worktree, branch, and ownership record intact.

The plan is not complete until `plan_archive` verifies closeout. The tool does not archive, commit, merge, abort, reset, or resolve conflicts. On failure, inspect the reported current state, repair only that recoverable boundary, and call it again. It refuses incomplete plans, unsafe paths, dirty state, branch changes, policy violations, and unresolved conflicts. A plan already under `.specs/archive/` needs no further move.

## Report

State what changed, relevant validation, and anything that remains. For incomplete plan work, include the exact next ready task. Do not add timing, finding counts, or evidence inventories unless the work requires them.
