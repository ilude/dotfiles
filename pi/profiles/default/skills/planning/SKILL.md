---
name: planning
description: Create, review, or explicitly revise standalone implementation plans in .specs.
---

# Planning

Use this skill to turn user intent into a bounded implementation plan. The user
supplies desired outcomes, priorities, and consequential judgment. The agent
investigates the implementation, recommends choices, and supplies technical
reasoning. Planning does not authorize execution.

A plan should stand alone for a fresh-context Sol session at low reasoning. It
must preserve intent and make each next step and its finish observable without
requiring the executor to load this skill or reconstruct the planning discussion.
Keep detail proportional and leave routine implementation choices flexible.

Questions about an existing plan do not authorize rewriting it. Revise a plan
only when explicitly asked. The user's request and subsequent changes are
authoritative; reconcile stale drafts against recorded decisions rather than
reopening them.

## Create or revise

1. Establish the selected repository root and read its applicable instructions.
   Inspect the actual implementation and relevant feedback before proposing changes.
   Preserve unrelated work. Existing plans from another client or profile are
   context, not current policy. Do not impose reviewers or a new execution system.
2. Put the canonical plan at `REPO_ROOT/.specs/<descriptive-kebab-case-stub>/plan.md`.
   For cross-repository work, keep one coordinating plan and identify each owning
   repository. Code, secrets, and deployment configuration stay with their owners.
   Use the [plan template](references/plan-template.md), combining or omitting
   sections that add no useful information.
3. Separate user requirements, verified facts, proposals, and unresolved decisions.
   Investigate discoverable facts. When uncertainty could materially change scope,
   architecture, or acceptance, explain the choices and consequences, recommend
   one with reasons, and ask a focused question. Handle routine technical details
   using judgment. Recommendations do not become requirements until agreed. Do not
   call a plan ready while a consequential decision remains open.
4. Write ordered Markdown checkboxes with concrete changes, dependencies, relevant
   paths or contracts, finite checks, and observable done conditions. Include only
   context needed to restart. Label paths repository-root-relative and future files
   as proposed. Do not invent optional work, rollback tasks, exhaustive contingencies,
   approval gates, or manual acceptance requirements.
5. Record authorization and preservation constraints. Execution normally includes
   dedicated task worktrees, local task commits, and merge into a recorded target;
   push and deployment require separate permission. Plans must tell the executor to
   continue independent work around blockers, adapt mechanisms within settled intent,
   and ask before changing scope, decisions, or acceptance.
6. Include a bounded closeout contract. After implementation and agreed agent-owned
   checks, archive the whole spec and commit it with the task changes on the task
   branch, then merge into the recorded target before declaring completion. If merge
   is blocked, retain the worktree and report integration pending. Preserve explicit
   no-merge instructions as an intentional exception. Operator manual or live testing
   happens after completion and never blocks archival, commit, or authorized merge;
   record it only as a non-blocking verification limit. Require accurate unfinished
   integration/cleanup checkboxes and blocker, next-action, and action-owner records.
   Include the template's outcome-first response contract: 🟢 completed, 🔴 merge
   blocked or user input required, 🔵 merge intentionally skipped, or 🟡 cleanup
   pending, always with explicit text. Blocked results must foreground the reason
   and action needed, not passed checks. Routine merge conflicts remain agent-owned.
7. When Pi behavior matters, record the verified planning profile and intended
   execution profile. Keep actual runs separate by date, profile/path, scope, and
   result. Never claim intended profiles or model behavior were tested.
8. Review once as a fresh executor: can Sol at low reasoning start each task, preserve
   fixed intent while choosing routine mechanisms, handle blockers, run finite checks,
   and complete authorized closeout from the plan alone? Fix consequential gaps, then
   stop. A draft with explicit open decisions is more honest than false readiness.

See [agent-process](../agent-process/SKILL.md) when reviewing workflow feedback or
changing instructions. Ordinary planning does not require another feedback review.
