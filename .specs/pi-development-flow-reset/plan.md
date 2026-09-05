---
created: 2026-09-05
status: draft
---

# Replace managed development workflows with direct, prompt-guided work

## Objective

Replace the custom development workflow machinery with instruction-only planning and execution commands that capture the user's intent, resolve consequential questions, use adversarial review to find missing behavior and integration gaps, divide work into simple dependency-aware steps suitable for parallel subagents, and guide implementation, testing, diagnosis, and completion without procedural permission gates. Preserve damage control, `/commit`, useful subagent execution, and recoverable unattended work.

## Completion Evidence

- Evidence: Native Pi prompt discovery exposes exactly one `plan-it` and one `do-it` command. Expanding either prompt delivers its arguments into ordinary model context without initializing planning/review/readiness/task/worktree controllers. Registered extensions no longer intercept those names or require their lifecycle records for ordinary tool access.
- Evidence: Direct inspection of the revised instructions shows intent capture, questions rather than invented consequential decisions, adversarial coverage of omitted features/callers/integration, simple real dependencies, useful parallel assignments, root integration, relevant tests, and diagnosis-led repair. No mandatory review receipts, exhaustive step certificates, universal development repair counts, or duplicated completion ledgers remain in active development guidance.
- Evidence: Focused loader, extension, goal/loop, and preservation tests pass. Damage control and `/commit` retain their behavior; subagent execution/results/cancellation remain available without mandatory plan/task materialization. Incomplete work is retained rather than reset or deleted.
- Fails when: The old managed workflow remains active behind a prompt or mode flag; commands collide; a plan or review state grants permission to work; instructions still require the retired procedure; normal test failures force counter-based reauthorization; user intent or useful partial work is lost; or protected damage-control/commit behavior changes.
- Limits: Static prompt inspection verifies the authored instructions, not future model judgment. No live model benchmark or safety-certification project is required. Efficient means useful bounded work with real parallel opportunities, not an invented duration or throughput target.

## Boundaries

- In scope: Pi development-flow command ownership, runtime planning/execution gates, goal/task/workflow coupling, development-process guidance in `pi/AGENTS.md`, relevant Pi skills/agents, owning contracts/docs, and focused tests. The root `AGENTS.md` may lose only conflicting development-process prescriptions; preserve repository, platform, package-manager, and independent safety rules. Update root `CHANGELOG.md` for the delivered behavior.
- Out of scope: Damage-control implementation/configuration/semantics; `/commit` behavior and secret/staging/push policies; other clients; modules and upstream SDK changes; new orchestration platforms; live benchmarks; broad skill rewrites unrelated to development flow; improvements to currently active benchmark or worker-delivery implementations.
- Preserve: `pi/extensions/damage-control*`, `pi/extensions/damage-control/`, their settings and rule semantics; the `/commit` command and `pi/lib/commit/`, `pi/lib/workflow-commands/commit-orchestration.ts`, `pi/skills/workflow/commit.md`; subagent process execution, results, cancellation and actual containment; technical skill knowledge; exact user constraints and explicit live-attempt limits; useful goal/loop start/stop/resume; existing files, task results, worktrees and archives.
- Commit seam: `/commit` currently shares `pi/extensions/workflow-commands.ts` with the rejected lifecycle. Registration/helpers may be isolated as a behavior-preserving move where necessary; this is not permission to redesign commit behavior. Prefer leaving the commit module path intact if deleting other registrations suffices.
- Shared checkout: Observed primary HEAD is `4aa7c2b6d82059412bdb6e25c7a443d4711e7b6b`. Background-terminal/subagent delivery changes and investigation notes are present from independent work. They do not block planning and must not be overwritten or adopted as this plan's work.
- Implementation workspace: For this transition only, the current `/do-it` must establish and own one implementation worktree before implementation. Implementation, test authoring, integration, validation, archive and commit occur there. The runtime being removed must not be reloaded into the executing host before its current closeout is finished; validate the replacement in isolated test hosts. Do not build a permanent compatibility lifecycle merely to execute this removal.
- Existing work: Do not migrate or delete active plans, task records, sessions, loop state or worktrees in bulk. Retain the records/files; adapt existing consumers only where continued use requires it. Resolve an ambiguous interrupted mutation from actual files/Git/process state, not a new state framework. Shared-process code changes do not authorize restarting another instance.
- Assumptions: Native Pi prompt templates are sufficient for instruction-only commands. The current plan's mandatory execution/closeout rules are transition requirements, not automatically the future command defaults.

## Operator decision before readiness

**D1: Future execution workspace and Git behavior.** Instruction-only commands can still instruct automatic worktree creation, session changes, archive, commit and merge, or can leave these as separately requested operations. The latest request rejects the runtime machinery but does not explicitly select the future Git/session default. Recommendation: ordinary execution in the current selected workspace/session, with commit through the unchanged `/commit` command and worktree/archive/merge only when requested or already required by the accepted task. The alternative is to retain some automatic operations as instructions, without a workflow controller. Do not silently choose between these in T2/T3.

The question concerns the replacement's behavior, not current Git cleanliness or anticipated merge state. This plan is not execution-ready until D1 is answered and its affected instructions and acceptance are updated.

## Selected mechanism and source contracts

Use native prompt templates, not a smaller custom workflow runner. Installed `pi/node_modules/@earendil-works/pi-coding-agent/docs/prompt-templates.md` documents global `prompts/*.md`, filename-derived command names, frontmatter, `$ARGUMENTS` expansion, and nonrecursive discovery. `pi/prompts/handoff.md` is an existing local native-template example. `pi/skills/pi-command/SKILL.md` assigns prompt-only commands to `pi/prompts/`.

A thin TypeScript controller would preserve an unnecessary registration/dispatch dependency. Native templates satisfy the requested instruction-only behavior. The tradeoff is intentional: plan quality and review are carried out by the agent, not certified by a runtime state machine.

Preservation contracts: `pi/skills/pi-extension/references/contracts/commit-workflow.md`, `damage-control.md`, `subagents-and-tasks.md`, and `goal-and-loop.md`. Existing `workflow-lifecycle.md` describes the system being replaced, not immutable product acceptance. Installed extension APIs and local source are the authority for retained command/tool registration and session persistence. Inspect a retained external API before using it; do not guess SDK exports or queue semantics.

Supporting diagnosis: `.specs/pi-autonomy-and-workflow-ceremony/{system-wide-proposal,current-session-evidence,system-evidence}.md`. Latest operator clarification overrides the earlier suggestion to remove adversarial planning review entirely: retain useful adversarial review in the instructions, remove its runtime enforcement.

## Tasks

- [ ] **T1: Separate protected commit behavior from removable workflow code**
  - Files: `pi/extensions/workflow-commands.ts`, `pi/lib/workflow-commands/prompts.ts`, `pi/lib/workflow-commands/commit-orchestration.ts`, `pi/tests/workflow-commands.test.ts`, `pi/tests/workflow-commands-pure.test.ts`, `pi/tests/commit-planning.test.ts`, `pi/tests/commit-mutation.test.ts`.
  - Change: Identify the commit registration and its actual helper/import closure. Remove its dependency on non-commit lifecycle setup with the least structural movement needed, preserving command arguments, staging, grouping, secret review, commit, push, submodule and failure behavior. Keep unrelated commands present until T3 dispositions their consumers. Author or preserve commit regression coverage. Inspect this representative separation before expanding deletion; do not run an early test gate.
  - Done when: Commit registration/helper ownership is explicit in source and independent of removable planning/execution lifecycle initialization, with unchanged behavior assertions authored. No damage-control or commit-policy edits are included.
  - Verify: deterministic Source-review registration, callers and authored tests against the commit contract; behavioral verification waits for T4. If isolation requires a commit behavior change, stop this task and report the conflict rather than widening scope.

- [ ] **T2: Author instruction-only commands and replace development-flow guidance**
  - Files: New `pi/prompts/plan-it.md`, `pi/prompts/do-it.md`; retired `pi/skills/workflow/plan-it.md`, `pi/skills/workflow/do-it.md`, `pi/skills/workflow/templates/plan-template.md`; development-process portions of `pi/AGENTS.md`, root `AGENTS.md`, `pi/skills/{planning,analysis-workflow,architecture-design,testing,orchestration,skills-engineer,pi-command,pi-extension}/`; applicable `pi/agents/{planner,reviewer,developer,teamlead,validator,test-reviewer}.md`; `pi/skills/workflow/{goal,loop-prompt}.md` only if present and referenced; `pi/README.md`, owning workflow/goal/quality/command-context contracts, `CHANGELOG.md`; new `pi/tests/development-prompts.test.ts`.
  - Change: Resolve D1 before prescribing future workspace/Git behavior. Make planning capture the exact outcome, inspect discoverable facts, ask about consequential gaps, cover affected features/callers/integration early, and use adversarial reviewers without stage counters or guaranteed-correctness claims. Produce simple tasks with real dependencies and disjoint useful parallel packages; do not force delegation where it adds handoffs. Make execution integrate the work, test relevant behavior, diagnose and address failures, preserve progress, and finish without a universal repair budget. Replace conflicting active development-flow instructions instead of appending exceptions. Preserve technical guidance and independent safety rules. Remove obsolete command bodies/template requirements rather than keeping duplicate instructions. Author loader/argument-expansion tests, not prose-spelling assertions.
  - Done when: One authoritative prompt per command contains the accepted intent and D1 decision; active instructions no longer prescribe retired development procedure, while optional parallel subagents and adversarial planning review remain. Documentation distinguishes current-transition constraints from replacement behavior.
  - Verify: deterministic Read changed content for semantic consistency and inspect authored prompt-loading tests; executable checks wait for T4. If a missing consequential behavior remains, ask the operator instead of supplying an assumption. Do not add a review framework to test the instructions.

- [ ] **T3: Delete procedural runtime and integrate retained capabilities**
  - Files: `pi/extensions/workflow-commands.ts`, `pi/lib/workflow-commands/plan-lifecycle.ts`, `pi/lib/{plan-state,plan-archive,workflow-worktree,workflow-observation,workflow-prompt,workflow-friction,workflow-telemetry}.ts`; actual consumers in `pi/extensions/{goal,loop,tasks,tool-visibility,operator-status,workflow-friction-review}.ts`, `pi/lib/goal-state.ts`, `pi/extensions/summarize/index.ts`, `pi/lib/recovery-handoff.ts`, and `pi/extensions/subagent/{index,run-manager,workflow-runtime}.ts` only where they consume removed procedural state; `pi/extensions/quality-gates.ts`; owning tests including workflow, plan, goal, loop, quality-gates and tool-visibility tests.
  - Change: Remove extension interception of the two prompt commands, planning review/readiness controllers, mandatory plan/task/condition mappings, procedural tool blocks, runtime development-attempt counters, and automatic managed-workflow routing/closeout paths selected for removal by D1. Remove exclusive consumers and stale discovery/status/telemetry registrations. Keep or relocate a helper only if a retained capability actually calls it; shared message delivery, commit recovery or summary behavior is not deleted merely because its file says workflow. Remove the explicit-only automatic-validation collection route if its actual consumers confirm it has no supported purpose. Preserve useful goal/loop continuation with the existing persistence/process facilities, exact intent, stop/resume and partial results, without mandatory plan certification. Do not redesign subagent scheduling, delivery or SDK integration; remove only proven procedural coupling and leave independent ongoing fixes untouched. Integrate T1/T2 and author focused retained-operation regressions; delete tests solely enforcing removed procedure.
  - Done when: Source has no live route into the retired controllers or duplicate prompt registrations; retained commands/tools/consumers compose without them; goal/loop progress remains recoverable; no old runtime is retained behind a mode flag or speculative compatibility framework; all replacement and preservation tests are authored.
  - Verify: deterministic Inspect the complete registration/import/caller transition and authored fixtures against installed APIs, including native prompts coexisting with protected commit/damage-control registration. Executable checks wait for T4. If deletion reaches a real protected consumer, retain the needed operation and report any scope conflict rather than inventing a fallback or deleting behavior.
  - Depends on: T1, T2

- [ ] **T4: Validate the integrated replacement and protected behavior**
  - Files: `pi/tests/development-prompts.test.ts`, retained commit/command/goal/loop/tool-visibility/damage-control tests, `pi/package.json`, isolated temporary test repositories and host fixtures.
  - Change: Run the final Validation batch after implementation, test authoring and integration settle. Exercise the new prompt-loading path and retained runtime capabilities without live model calls or production mutations. Record observed evidence and remaining gaps in this plan.
  - Done when: Completion Evidence passes; prompt expansion is observed through native loading, obsolete registrations/gates are absent from the test host, retained goal/loop recovery passes, protected commit/damage-control tests pass, and changed TypeScript integrates without errors. Instruction quality is reported as reviewed guidance, not guaranteed model behavior.
  - Verify: deterministic Run the checks in Validation once; classify any failure and follow this transition's shared repair allowance. If affected checks still fail after the allowed targeted rerun, stop patching and report the cause or missing decision; do not reset the allowance by changing the policy being delivered.
  - Depends on: T3

## Execution Strategy

For this transition, implementation, test authoring and integration settle first, followed by one root-owned final validation batch. The operator has requested early design coverage, not early executable testing or TDD. The new prompts may allow diagnosis-led checking without imposing this transition's universal schedule or repair counter on future work.

T1 and T2 can be assigned to two parallel bounded subagents after D1 is resolved: they own disjoint code/test and prompt/guidance surfaces. The root owns integration and T3's shared caller deletions. Further delegation is optional only for a clearly independent package; do not divide a coupled runtime transition by arbitrary file lists or repeatedly delegate unfinished integration. Do not create a task-registry mirror of this plan.

The current host must finish this plan's existing closeout after T4 without reloading the removed lifecycle. New-host behavior is tested in isolation. If actual closeout requires a source path that T3 would delete before the current host can finish, resolve that concrete transition dependency before deletion; prefer completing via already available operations over adding a permanent compatibility subsystem.

## Validation

- [ ] T4: From the owned worktree's `pi/`, run `pnpm test development-prompts.test.ts workflow-commands.test.ts workflow-commands-pure.test.ts commit-planning.test.ts commit-mutation.test.ts goal.test.ts goal-state.test.ts loop.test.ts loop-runner.test.ts tool-visibility.test.ts damage-control.test.ts`. Keep surviving tests at these paths or update this command to their actual replacement names before the final batch. Expected: native loader/argument expansion, single registration, direct work without lifecycle prerequisites, retained continuation, and protected behavior pass. Do not retain obsolete tests just to preserve this filter list.
- [ ] T4: From the same `pi/`, run `pnpm run typecheck`. Expected: retained extension imports/types compile after cross-cutting deletion. This is justified by shared registration/consumer removal, not a universal gate for prose changes.
- [ ] T4: Directly inspect the final prompt/guidance changes against the accepted intent and D1, and inspect the final change set to confirm damage-control semantics, commit policy, unrelated working-tree changes and live state were not changed. Do not add source-spelling assertions or an unrelated repository-wide suite.
- Timing: After implementation, test authoring and integration settle; the root runs the batch. No live evaluation is planned.
- On failure: Classify first, then at most one focused repair batch and one targeted rerun for the whole transition. If any check still fails, stop patching, reassess the mechanism, assumptions and harness, and report before further execution. User direction is required for more repair or validation. This current execution allowance is not part of the replacement development policy.

## Retention

Keep incomplete work at `.specs/pi-development-flow-reset/plan.md` in the primary repository until materialized into the owned implementation worktree. For this transition, after completion `/do-it` archives the spec to `.specs/archive/pi-development-flow-reset/`, commits in-scope nonignored artifacts on its workflow branch, merges with `--no-ff` into the primary branch, verifies merged HEAD, and removes only its owned worktree and branch. Do not force-add ignored specs. Dirty primary state, unmerged work or conflicts preserve the implementation worktree and plan for recovery; they are execution context, not planning blockers. No live rollout or background-session restart is authorized.

## Execution Status

- State: Draft; implementation has not started.
- Blocker: D1, future execution workspace/session and Git default.
- Next: Obtain the D1 decision, update T2/T3 and acceptance, then conduct adversarial correctness/coverage review and the current invocation's final subtractive review.
- Current frontier: Planning; no implementation task is authorized by this draft.
- Validation progress: No development checks run; one shared repair batch and targeted rerun remain for implementation. Planning reviews and deterministic plan validation are pending.
- Resume: `/do-it .specs/pi-development-flow-reset/plan.md`
