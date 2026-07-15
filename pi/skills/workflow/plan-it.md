# /plan-it State Machine

Crystallize conversation context plus `$ARGUMENTS` into a standalone executable plan.
Do not implement the plan.

## States

`RESOLVE_INPUT -> INSPECT_CONTEXT -> CLARIFY? -> BUILD_PLAN -> VALIDATE_PLAN_CONTRACT -> WRITE_ARTIFACT -> REPORT`

### RESOLVE_INPUT

- Read the full conversation and `$ARGUMENTS`; additional context may refine or override earlier decisions.
- PRDs are optional. Resolve input precedence exactly: explicit `PRD.md` path in `$ARGUMENTS`; PRD artifact just created or directly referenced in the conversation; otherwise conversation context.
- Never discover or select the latest filesystem PRD by default.
- If no substantive goal exists, transition to `CLARIFY` and ask: "What should this plan accomplish? Describe the goal and any constraints."
- If `worktree` or `wt` is a standalone `$ARGUMENTS` parameter, enable worktree mode and exclude that token from the goal.
- Transition to `INSPECT_CONTEXT` when the planning input is identified.

### INSPECT_CONTEXT

- Extract goal, rationale, decisions, rejected approaches, constraints, findings, changed files, prior validation and results, blockers, and open questions.
- Inspect project markers, platform and shell, likely test and lint commands, repository conventions, and existing `.specs/` slugs.
- Classify What, Why, and Scope as clear or execution-critically ambiguous.
- Apply the risk rubric: low = local, personal, reversible, automated; medium = shared-ish or operational but backed up with known rollback; high = work/shared impact, paid or data-costing resources, destructive or irreversible effects, data loss, secret exposure, unclear rollback, hardware action, or irreducibly subjective approval.
- Separate approval before a dangerous action from validation after execution.
- Transition to `CLARIFY` only for execution-critical ambiguity; otherwise transition to `BUILD_PLAN`.

### CLARIFY

- Present 2-3 interpretations with trade-offs and a recommendation.
- Ask at most 2 clarifying questions total, then proceed with the best interpretation and record assumptions.
- If manual-gate necessity is uncertain, ask one concise question naming the possible catastrophic risk and whether to include a manual gate; never add an uncertain gate by default.
- Return to `INSPECT_CONTEXT` after answers, or transition to `BUILD_PLAN` after the question limit.

### BUILD_PLAN

- Read `templates/plan-template.md` before writing. It is authoritative for plan structure, the checklist invariant, transactional marking rule, validation contract, manual-gate wording, and archive rule. Do not restate those template sections outside the generated plan.
- Define the MVP as the smallest user-visible outcome that works in one focused session. Put nice-to-have hardening, broad refactors, exhaustive edge cases, migrations, and uncertain integrations in Explicit Deferrals unless requested now; deferrals cannot block archive.
- Decompose the MVP into tasks with concrete deliverables, files, dependencies, exact verification and pass/fail signals, and mutation boundaries.
- Treat review findings as backlog inputs, not a single implementation batch. Separate migrations, stateful replacements, hardening, backup redesign, and orchestration changes into distinct waves even when all are in scope.
- For stateful infrastructure, permit at most one independent service replacement per rollout wave until its direct endpoint and state gate passes. Record current backup evidence, restore command, rollback boundary, and the plan/apply target for that service.
- Add an incident transition: the first failed live mutation blocks later rollout waves until the affected service is recovered and its original endpoint and state checks pass.
- Every task has both a **Model** and an **Agent** assigned.

| Scope | Indicators | Model | Agent |
|---|---|---|---|
| 1-2 files, mechanical | rename, config, test, typo | small | closest specialist or builder-light equivalent |
| 3-5 files, feature | implement, refactor, integrate | medium | closest specialist or coordinating lead |
| 6+ files, architectural | migrate, redesign, cross-cutting | large | coordinating lead or heavy builder equivalent |

- Use only relative tiers `small`, `medium`, and `large`; name an explicit agent, including an exploration or planning agent for research-only tasks.
- Use this exact generated-plan table header: `| # | Task | Files | Type | Model | Agent | Depends On |`.
- Group independent tasks into waves. Each wave has exactly one validator gate; later-wave tasks depend on the prior gate; IDs and dependencies agree everywhere.
- Size a validator small for small-only work, medium when its wave has medium or large work, and large for especially risky or architectural work.
- For every medium or large task, record a concrete alternative and rejected-because trade-off. If all wave tasks converge on one architectural pattern, record the possible trend bias and when the opposite pattern fits.
- Populate `Automation Plan` with every operation's command or wrapper, credential-source expectation, mutation boundaries, and evidence signal.
- Populate `Validation Contract` and `Telemetry & Evidence Contract` through the authoritative template.
- Until runtime emits all fields, record workflow evidence in the plan, checklist, review artifacts, or existing evidence helpers whenever practical: episode ID (`episode_id`), phase ID (`phase_id`), task ID (`task_id`), validation command (`validation_command`), `status`, `archive_status`, `started_at`, `completed_at`, and non-secret evidence paths. Do not invent plan-specific telemetry scripts or cross-shell writers solely to satisfy this contract.
- Record adaptive review fields: `plan_profile`, `review_panel_decision`, expected reviewer count, selected reviewer personas and reasons, complexity score, risk score, and expected high-risk areas.
- In worktree mode: preflight unresolved merge/rebase state and branch/worktree collisions; create a dedicated branch and worktree before implementation; run every implementation and validation command there; commit locally only after all gates pass; never push, merge, rebase, cherry-pick, or fast-forward back; leave changes uncommitted or mark commit blocked when any gate is pending or failed. Reflect this mode in all relevant template sections.
- Transition to `VALIDATE_PLAN_CONTRACT` when the draft is complete.

### VALIDATE_PLAN_CONTRACT -- Self-Validate Before Presenting

- Confirm the plan is standalone, project-specific, scoped to an executable MVP, and has honest deferrals.
- Confirm risk, blast radius, rollback, approval, and validation decisions are explicit and justified.
- Confirm stateful rollout waves use one-service canaries with backup/restore evidence and that failure blocks unrelated rollout work.
- Confirm every task has Model, Agent, dependency, Verify, Pass, Fail, files, and mutation boundaries.
- Confirm checklist, task, wave, gate, and dependency IDs map one-to-one and all template invariants hold.
- Confirm every wave has one correctly sized validation gate and coherent dependencies.
- Build a dependency truth table: every command, variable, wrapper, file, and behavior used by a task or gate must exist before that task runs. Reject plans that add a prerequisite in a later wave.
- Inspect the repository implementation behind every planned wrapper. Check shell scope, exit-code precedence, cleanup on success/failure/interruption, and whether the command proves its stated pass condition.
- Use safe read-only probes such as dry-runs, config rendering, exact version queries, or static command inspection when they can decide readiness. Do not mutate implementation during planning.
- Confirm the plan uses the documented host/container boundary and declares every host executable it invokes.
- Confirm Automation Plan, Validation Contract, success criteria, archive conditions, and telemetry fields are complete and executable without plan-specific process machinery.
- Confirm end-to-end success criteria test the MVP rather than only task internals.
- A plan that fails any repository-aware readiness check must return to `BUILD_PLAN`; do not write it and defer deterministic repair to `/review-it`.
- On success, transition to `WRITE_ARTIFACT`.

### WRITE_ARTIFACT

- Create a lowercase hyphenated slug of at most 30 characters without colliding with an existing `.specs/` slug.
- Write `.specs/{slug}/plan.md` using `templates/plan-template.md` exactly as the structural source of truth.
- Transition to `REPORT` only after the file is written.

### REPORT

Follow the output contract below and stop.

## Output Contract

First line: `[OK] PLAN CREATED: no code was executed.`

Then provide a 2-3 sentence summary, the task table, dependency graph, plan path, and:

## Outcome
- **Status:** `PLAN CREATED`
- **Reason:** plan file was written; implementation has not run
- **Plan state:** active draft at `.specs/{slug}/plan.md`
- **Recommended next action:** review first unless the task is low-risk and the user explicitly wants execution

Output both commands verbatim:

```bash
/review-it .specs/{slug}/plan.md
/do-it .specs/{slug}/plan.md
```

Ask whether to review or edit first, use `/review-it`, or execute with `/do-it`.
Final line: `FINAL STATUS: PLAN CREATED -- no code executed.`
