---
name: planning
description: Create, review, or explicitly revise standalone implementation plans in .specs.
---

# Planning

Turn user intent into a bounded, fresh-context implementation plan. Planning does
not authorize execution. Questions about an existing plan do not authorize rewriting
it; revise only when explicitly asked. The user's request and subsequent decisions
are authoritative, including when an older draft disagrees.

## Create or revise

1. Read the selected repository's applicable instructions and inspect the relevant
   implementation. Preserve unrelated work. Plans from other clients or profiles
   are context, not current policy.
2. Put the canonical plan at `REPO_ROOT/.specs/<descriptive-kebab-case-stub>/plan.md`
   using the [template](references/plan-template.md). Keep its frontmatter; combine
   or omit sections that add no value. Cross-repository work uses one coordinating
   plan naming each owner, without relocating code, secrets, or deployment config.
3. Separate requirements and settled decisions from verified facts, proposals, and
   open questions. Investigate discoverable facts and choose routine technical
   details yourself. For consequential choices affecting scope, architecture, or
   acceptance, explain the tradeoff, recommend an option, and ask one question at a
   time. Preserve settled decisions. Continue until executable unless the user
   requested a draft or an external prerequisite blocks readiness; record that
   prerequisite, action owner, and next action. Deferred work must not block
   independent approved work.
4. Write named checkbox tasks with bounded changes, paths/contracts, actual
   prerequisite results, finite checks, and observable done conditions. Size ordinary
   tasks for reliable Luna execution within one context, including investigation and
   validation headroom. Split oversized tasks and identify useful independent work
   with disjoint write ownership, without manufacturing tasks or concurrency. Note
   difficult judgments or split points when useful; Strategist owns staffing advice.
   Include only restart context, using repository-relative paths and labeling proposed
   files. Leave equivalent implementation choices flexible.
5. Carry forward authorization and preservation constraints, not a new execution
   system. Include the existing [delegation policy](../../docs/subagents.md#roles-guidance-and-councils):
   consult Strategist before executing implementation plans, with the explicit
   single-agent handoff exception; a Team Lead retains its own Strategist-first
   workflow. Assign at most one named plan task per subagent and use active roles.
   Consult Steward for post-implementation reviewer/validator findings when assessing
   whether more work is warranted, not for planning or initial implementation; handle
   evidence-proved corrections directly and reuse assessments for the same finding.
6. Specify the stopping point: implement settled scope, fix demonstrated task-related
   failures, and stop when agreed checks pass. Continue independent work around
   blockers; ask before changing scope, decisions, or acceptance. Do not add work or gates beyond the request or comparable repository
   patterns, including speculative fixes, recovery machinery or reviewer sequences. Pending operator manual/live testing is a non-blocking
   verification limit, not a reason to keep implementation active.
7. Record worktree/integration coordinates and closeout steps only when the selected
   workflow uses them. If execution uses `/do-it`, link its
   [owning prompt](../../prompts/do-it.md) for authorization, worktrees, archival,
   Integrator closeout, and reporting; do not duplicate those mechanics. Ordinary
   plans do not require that command or its workflow.
8. When Pi behavior matters, distinguish verified planning profile, intended execution
   profile, and actual runs by date, profile/path, scope, and result. Do not describe
   intended behavior as tested. Check the plan once as a fresh executor, resolve
   remaining scope decisions, and mark it ready without starting implementation.

See [agent-process](../agent-process/SKILL.md) when reviewing workflow feedback or
changing instructions. Ordinary planning does not require another feedback review.
