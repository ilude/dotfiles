---
name: planning
description: Create, review, resume, and close implementation plans in .specs. Resolve consequential uncertainty, execute in task worktrees, and merge completed work with dated archived plans.
---

# Planning

Use this for implementation planning and plan maintenance. Planning alone does
not authorize execution. Authorization to execute a plan includes local task
commits and merge into its recorded target unless the user says otherwise.
Deployment and push require separate authorization. Keep guidance proportional.

## Why this workflow exists

A fresh-context model needs more than broad phases: it must know the accepted
scope, source files, decisions, checks, and next step without inventing requirements.
Prior feedback also identified premature handoffs and open-ended testing. A plan
should make useful continuation and a bounded finish clear, not add a controller.
See [agent-process](../agent-process/SKILL.md) when reviewing workflow feedback or
changing instructions; ordinary planning does not require another feedback review.

## Create or revise

1. Establish the selected repository root and read its applicable instructions.
   Inspect the actual implementation and relevant feedback before proposing changes.
   Preserve unrelated work; existing plans from another client/profile are context,
   not current policy. Do not impose reviewers or a new execution system.
2. Put the canonical plan at `REPO_ROOT/.specs/<descriptive-kebab-case-stub>/plan.md`.
   For cross-repository work, keep one coordinating plan and identify each owning
   repository. Code, secrets, and deployment configuration stay with their owners.
   Use the [plan template](references/plan-template.md), omitting irrelevant sections.
3. Separate user requirements, verified facts, proposals, and unresolved decisions;
   keep required outcomes distinct from proposed mechanisms. Resolve discoverable
   facts yourself. When remaining uncertainty could materially change scope,
   architecture, or acceptance, explain the choice and consequences, recommend an
   approach with reasons, and ask a focused question. Handle routine implementation
   details using judgment; recommendations are not requirements until agreed.
   The user's request and subsequent changes are authoritative. Keep unapproved
   optional work outside the task checklist and completion criteria; do not generate
   speculative optional-work backlogs. Do not add rollback work unless requested.
   For technical assumptions that could materially change the plan, use the smallest
   practical investigation where useful, naming the question and decision it enables.
   Record a fallback or operator decision boundary only where needed. Investigation
   may be a bounded first task; not every implementation detail must be settled.
4. Write ordered Markdown checkboxes with useful task IDs. Each task names its
   dependencies, existing/new paths, concrete change or decision, verification, and
   done condition. Include exact contracts where another task depends on them.
   Mark future files/commands as proposed, not already available. Avoid vague steps
   such as "integrate appropriately" or "test thoroughly." Include the template's
   execution guidance and place brief scope checkpoints at meaningful phase
   boundaries, not after every task or tool call. These are not approval gates.
5. Include only the context needed to restart: goal, non-goals, required reading,
   relevant behavior, repository/profile identity, authorization, open decisions,
   and next task. Use repository-root-relative code paths, explicitly labeled, so
   moving the spec into archive does not break them. Do not duplicate whole docs.
6. Record the planning profile and intended execution/test profile when Pi behavior
   matters. Inspect `PI_CODING_AGENT_DIR` and the repository's launcher mapping;
   don't infer a profile from a model name or a `pi/` directory. Record `unknown`
   if unverified. Keep actual runs separate: date, profile/path, scope, result, and
   model/settings only when relevant. Never claim intended profiles were tested.
7. Review once as a fresh reader: can each next task be started from its named
   inputs, and is its finish observable? Fix consequential gaps. Leave a plan draft
   with explicit unresolved decisions rather than falsely calling it executable.
   Do not add speculative edge cases or blanket approval gates to make it look complete.

## Maintain and finish

- At execution start, create a dedicated Git worktree and task branch in each
  repository being changed, or resume the plan's existing worktrees. Record paths,
  branches, and merge targets in the plan; resolve unclear targets before editing.
  Work and validate there. Planning alone does not require a worktree. Bring any
  uncommitted plan into the task worktree without discarding the original or other
  work; reconcile that task-owned copy during integration.
- Respect each repository's branch and submodule rules. For coordinated work,
  integrate module changes before parent gitlinks and archive the coordinating
  plan with the final parent integration. Required submodule publication remains
  subject to explicit push authorization; report a blocker rather than bypass it.
- On resume, inspect the current checkout and task evidence. Start the next unmet
  dependency; don't repeat completed checks without a related change or stale evidence.
- Before adding tasks or completion requirements, apply the plan's scope check.
  At checkpoints, use its recovery guidance if work has drifted; resume required
  work rather than starting another audit.
- Check off work only when its done condition is met. Record a concise result by
  the task, including the actual Pi profile for profile-sensitive execution.
- Keep status, concrete blockers, and next step consistent with latest execution
  evidence; replace superseded pause/blocker statements. Distinguish historical
  results from current health and unverified acceptance. Continue authorized
  independent work; stop testing when agreed checks pass. Do not invent more
  requirements to avoid finishing or call unfinished work complete.
- Once the work described by the plan and its agreed checks are complete, set
  `status: completed` and `completed: YYYY-MM-DD` inside `plan.md`, summarize the
  result and relevant profile runs, and move the whole directory to
  `REPO_ROOT/.specs/archive/<stub>/`. Use the actual completion date, not creation date.
- Verify the destination doesn't already contain another plan before moving; never
  overwrite it. Repair affected links and confirm the active copy is gone. Keep
  unfinished implementation plans active. Completed work awaiting integration
  remains in the task branch; writing the plan is not completing its implementation.
- Archive in the task branch and commit the implementation and archived plan
  together before merging into the recorded target. Explicit no-commit/no-merge
  instructions take precedence; report pending integration rather than bypass them.
  Preserve unrelated target-checkout work; do not stash, discard, or commit it to
  make a merge possible. If integration is blocked, retain the task worktree and
  report implementation/validation separately from delivery.
- Verify the target contains the task changes and archived plan and no active copy
  remains. Check affected behavior if conflict resolution changed implementation;
  do not repeat unchanged checks solely because of the merge. Remove the task
  worktree only after successful integration and with no uncommitted or unmerged work.
- Use ordinary Git and file operations. No daemon, manifest, runtime hook, automatic
  push, or migration of unrelated old plans is implied.
