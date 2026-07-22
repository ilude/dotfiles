# Execute Requested Work

Execute `$ARGUMENTS` as either a raw task or a plan path ending in `plan.md`.

If no input is provided, ask: "What should I do? Describe the task."

## Objective

Deliver the requested outcome, check the contract that changed, and preserve enough state to resume incomplete plan work.

## Raw Task

Inspect only enough repository state to establish scope, ownership, and relevant validation. Execute bounded work directly.

Create a plan only when unresolved architecture, migration design, destructive or stateful rollout, or material ambiguity makes direct execution unsafe. Otherwise do the work without adding planning ceremony.

## Plan Task

Read the complete plan and resume from the first unchecked dependency-ready task. A usable plan needs an objective, boundaries, executable tasks, real dependencies, validation, and current status; equivalent structures are acceptable.

Treat checked work as complete when current repository state and its recorded result do not contradict it. Do not demand separate evidence files, gate IDs, wave narratives, or duplicate checklists.

After a task's relevant check passes, mark its checkbox complete and save the plan. Record a concise result only when it is needed for resume, external mutation, or a required audit.

Execute plan tasks directly. Delegate only when independent workstreams materially improve execution, and create durable tasks only when they add useful cross-turn or dependency tracking. Do not mirror the plan checklist into another tracking system by default.

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

## Completion

For a raw task, stop when the requested outcome and relevant checks are complete.

For a plan, keep it at its existing path. When all required tasks and relevant validation are complete, mark its status complete. Archive or move it only when the user asks. If work remains, save the current status and exact next ready task instead.

## Report

State what changed, relevant validation, and anything that remains. For incomplete plan work, include the exact next ready task. Do not add timing, finding counts, or evidence inventories unless the work requires them.
