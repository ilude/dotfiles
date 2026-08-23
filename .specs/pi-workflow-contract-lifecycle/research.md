# Pi workflow lifecycle research

Status: Consolidated research record
Updated: 2026-08-23

## Purpose

This document is the single open research record for Pi goal, planning, execution, validation, repair, CI handoff, and closeout behavior. It distinguishes current executable behavior from proposed changes. A cited design is not implementation authority.

## Current executable baseline

### `/goal`

Current Pi supports foreground goals and unattended goals. A goal owns a persistent objective, conditions, linked plans and tasks, recovery state, artifacts, validation evidence, and terminal closeout. Unattended execution uses SQLite-backed state, durable root tasks for dependencies, bounded re-evaluation, and two materially different recovery attempts. Damage-control decisions remain authoritative; unattended ask-tier actions wait for the operator rather than inheriting authorization.

`goal_complete` closes a goal only when current conditions compose into the requested outcome. It records condition judgments, integration judgment, validation, gaps, and next steps.

Sources:

- `pi/skills/pi-extension/references/contracts/goal-and-loop.md`
- `pi/docs/goal-execution-domain.md`
- `pi/extensions/goal.ts`
- `pi/lib/goal-state.ts`

### `/plan-it`

Current `/plan-it` creates one canonical `.specs/{slug}/plan.md`. It includes an objective, completion evidence, boundaries, tasks, validation, retention, and execution status. Planning includes one correctness review and one subtractive review. `plan_progress` records bounded lifecycle transitions and validates readiness. Planning does not authorize implementation before the plan is ready.

Sources:

- `pi/skills/workflow/plan-it.md`
- `pi/skills/pi-extension/references/contracts/workflow-lifecycle.md`
- `pi/extensions/workflow-commands.ts`

### `/do-it`

Current `/do-it` executes raw bounded work or an accepted plan. For plan work, the plan is the closed execution contract. Review findings authorize changes only when they map to accepted completion evidence, invariants, or safety boundaries. `/do-it` owns proportional validation, recovery of its workflow boundary, completion updates, the workflow commit, a `--no-ff` merge into the clean primary branch, merge verification, archival, and cleanup of only its owned worktree and branch.

The workflow-worktree lifecycle added on 2026-08-23 isolates `/do-it` in an owned worktree. The invocation must prove that the primary worktree was clean before execution. The workflow refuses to merge into a dirty primary worktree and leaves recoverable state when integration cannot safely complete.

Sources:

- `pi/skills/workflow/do-it.md`
- `pi/skills/pi-extension/references/contracts/workflow-lifecycle.md`
- `pi/extensions/workflow-commands.ts`
- `pi/extensions/workflow-worktree.ts`

### Current command boundary

- `/review-it` is retired from Pi registration. Review is internal to planning when required.
- `/validate-it` is not implemented.
- `/do-it --repair` is not implemented.
- `/prd-it` remains available for product-definition work and is not part of the ordinary plan execution sequence.
- Durable tasks record deliverables and dependencies. They do not execute, schedule, wait for, or own child processes.

## Settled workflow principles

1. The operator's accepted outcome, invariants, safety boundaries, and explicit corrections define implementation authority.
2. Findings are evidence to adjudicate, not automatic authorization to mutate code.
3. Deterministic mechanisms own state transitions, path containment, permissions, task dependencies, archive gates, and merge safety.
4. Reviewers and validators should be read-only where independent judgment matters.
5. Direct work is the default for one coherent task. Delegation must provide a concrete benefit.
6. One canonical plan is preferable to parallel ledgers, duplicate checklists, or reviewer-owned authority artifacts.
7. Validation must exercise the changed contract. Broad checks are justified only by shared impact, repository policy, or an explicit gate.
8. A failed live mutation enters incident recovery for that boundary before broader rollout continues.
9. Telemetry can describe execution but cannot prove quality, causality, completion, or cost savings by itself.
10. Workflow automation may observe and propose changes, but it must not silently alter policy or implementation authority.

## Weekend session review

Reviewed source:

`C:/Users/mglenn/.pi/agent/sessions/--C--Users-mglenn-.dotfiles--/2026-08-21T18-56-01-397Z_01a025ae-1775-7ad7-adf0-8c47b92fc4e0.jsonl`

The session settled these operator decisions:

- Ask consequential questions through ordinary assistant messages so the full question, choices, consequences, recommendation, and reply remain in the transcript.
- Use labeled choices for bounded decisions and include a stop or investigate option where proceeding could cause material harm.
- Preserve free-form discussion and do not treat discussion as mutation authority.
- Do not ask the operator to approve an unexplained implementation inference.
- Keep universal decision guidance in `AGENTS.md`; retain deeper interview behavior in the `grill-me` skill.
- Prevent review findings from silently becoming implementation authority.
- Require explicit disposition before a finding becomes an authorized repair.

These decisions are now reflected in repository instructions and the proposed authority-separation model in `PRD.md`.

## Research sources and findings

### OpenAI - Custom Code Review rules for Codex

URL: https://developers.openai.com/blog/custom-code-review-rules-for-codex

Findings:

- Repository rules can preserve compatibility and data-boundary invariants that generic review misses.
- Rules should be concise, scoped, current, and state both the invariant and the safe path.
- Evaluation should test required findings, restraint, retention, actionability, safe counterexamples, and unrelated changes.
- Review rules supplement tests, branch protection, and required approvals; they do not replace enforcement.

### OpenAI - Auto-review of agent actions without synchronous human oversight

URL: https://alignment.openai.com/auto-review/

Findings:

- Action review can be separated from a completion-driven executor.
- Most actions may proceed without synchronous approval, while denied actions should cause safe recovery rather than repeated equivalent attempts.

### OpenAI - Subagents

URL: https://developers.openai.com/codex/subagents

Finding: review should prioritize correctness, security, regressions, and missing tests, with concrete reproduction evidence rather than style-only feedback.

### OpenAI - Codex CLI features

URL: https://developers.openai.com/codex/cli/features/

Finding: dedicated review reports findings without modifying the working tree, supporting a read-only reviewer boundary.

### OpenAI - Agent improvement loop

URL: https://developers.openai.com/cookbook/examples/agents_sdk/agent_improvement_loop

Finding: traces, feedback, and evals can turn recurring failures into regression checks. This supports measurement and proposal generation, not automatic policy mutation.

### TeamBench

Title: TeamBench: Evaluating Agent Coordination under Enforced Role Separation

The reviewed session recorded that prompt-only role separation produced more verifier mutation attempts and that verifier approval was not a reliable correctness signal. The exact arXiv URL was not preserved in the session record, so this remains a source to re-verify before relying on its quantitative claims.

### Claude Code permissions

Title: Configure permissions - Claude Code Docs

The reviewed session found that deterministic deny, ask, and allow precedence enforces authority beyond role prompts. The exact URL was not preserved and should be re-verified before using it as external evidence.

### GitHub Copilot cloud agent

Title: About GitHub Copilot cloud agent - GitHub Docs

The reviewed session found that research, planning, implementation, review, and merge remain distinct stages and that implementation is isolated on a branch. The exact URL was not preserved and should be re-verified before using it as external evidence.

## Proposed lifecycle changes

`PRD.md` explores stronger separation between planning, implementation, and independent validation:

```text
/plan-it -> /do-it -> /validate-it
```

Valuable requirements retained for future discussion:

- freeze validation expectations before implementation is observed;
- prevent validators from mutating product code;
- give findings stable identities and evidence;
- distinguish required repair, rejection, deferral, operator decision, and accepted risk;
- authorize repairs by exact contract revision, paths, approach, prohibited changes, and stop conditions;
- independently rerun affected claims after repair;
- refuse archive when required checks or dispositions remain open.

Unsettled proposals:

- whether validation needs a separate public `/validate-it` command;
- whether validation needs a separate `validation.md` artifact;
- whether `/do-it` should gain a dedicated repair mode;
- whether current `/do-it` validation and archive ownership already provides sufficient separation;
- which plan sections may record execution progress without changing the accepted contract;
- how legacy workflow state should migrate.

## PR-first CI validation and repair

This is a future extension of the same authority model, not a separate open spec.

Candidate sequence:

```text
local implementation
  -> focused checks
  -> feature branch and pull request
  -> authoritative Forgejo Actions gates
  -> verified failure event
  -> bounded diagnosis or repair on the exact PR head
  -> focused local validation
  -> CI rerun
  -> protected merge decision
```

Potential responsibility split:

- Local implementor: implement the accepted change, run directly relevant checks, and update the feature branch.
- CI: own broad repository gates and prevent merge while required checks fail.
- Deterministic coordinator: verify repository, PR, head revision, workflow run, failure class, attempt budget, and stale-head conditions.
- Repair implementor: modify only the authorized PR branch and bounded repair scope.
- Operator-facing systems such as Hermes: notify and collect decisions, but do not inherit merge or repair authority merely by relaying an event.

Required safety properties:

- A repair attempt must bind to the exact failed PR head and stop if the head changes.
- CI configuration, required checks, and branch protection cannot be weakened by the repair path.
- Repeated unchanged failures must stop after a bounded number of attempts.
- Infrastructure, credential, flaky-test, policy, and contract-change failures must be classified before starting a coding repair.
- The repair worker may push only to the authorized PR branch.
- Merge authority remains separate and explicit.
- Every attempt retains the failure evidence, scope, changed revision, validation, and terminal outcome.

Open decisions:

- Which repositories require protected pull-request flow.
- Which focused checks remain mandatory before push.
- Whether any repair may start automatically or all repairs require operator disposition.
- Who may merge after CI passes.
- Retry limits and unchanged-failure detection.
- Forgejo event authenticity, delivery, and idempotence contracts.

Existing foundation to reuse:

- Forgejo Actions and repository branch protection.
- Current focused versus integration validation entrypoints.
- Onclave message and task contracts for authenticated asynchronous delivery where appropriate.
- Pi task and goal records for durable intent and outcomes, not as a CI scheduler.
- Hermes only as a possible external-trigger and notification front door.

## Retained research themes from earlier workflow notes

- Keep global instructions lean and put task-specific context in stage prompts.
- Prefer deterministic transitions and artifact checks over interpreted prompt state.
- Measure reviewer yield, duplicates, false positives, readiness changes, cost, duration, and execution failures before adaptive reviewer selection.
- Use representative workflow cases before removing prompt layers or changing reviewer composition.
- Preserve safe counterexamples to detect over-eager findings and unnecessary changes.
- Treat frontend validation as rendered behavior and accessibility evidence, not generic aesthetic prescriptions.
- Keep workflow recipes bounded and avoid creating a second scheduler or task engine.

## Superseded material

- The old assumption that `/goal` is only a passive objective wrapper. Current unattended goals own broader persisted lifecycle and recovery state.
- A standalone public `/review-it` stage. Current Pi performs bounded review inside planning.
- Detached `/loop` as the ordinary operator interface for unattended goals.
- Hierarchical-subagent and worktree-lease mechanisms named by the old unattended goal document.
- Review panels or fixed reviewer counts without measured benefit.
- Duplicate plan, task, validation, and telemetry ledgers describing the same authority state.
- Automatic repair or workflow-policy mutation based only on reviewer or telemetry output.

## Evidence still needed

1. Compare current `/do-it`-owned validation against an independently read-only `/validate-it` on representative changes.
2. Measure whether a separate validation artifact prevents authority drift enough to justify its lifecycle cost.
3. Test safe counterexamples and adjacent findings to measure reviewer restraint.
4. Exercise plan and goal recovery after process loss and changed repository state.
5. Prototype PR-head binding and stale-event rejection in Forgejo without granting automatic repair authority.
6. Define a small evaluation set before adaptive review, repair automation, or command retirement decisions.
