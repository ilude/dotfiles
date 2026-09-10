---
created: 2026-09-10
status: ready
completed: null
---

# Add Strategist and make delegation guidance discoverable

## Goal and scope

Add a `strategist` advisory role and fix the missing model-visible role catalog in the default Pi profile. Normally consult Strategist before assigning work through `subagent`, reusing its advice for related assignments rather than consulting again for every call. Give dispatching agents compact guidance for assignment boundaries, prerequisite order, model/effort choice, and recovery from failed assignments.

User requirements and settled intent:

- Strategist advises on execution boundaries, dependencies, and worker selection. Consultation is the recommended path before `subagent` assignments, not an approval gate. The orchestrator or Team Lead decides and proceeds; Strategist does not dispatch, edit plans, or expand scope. Consulting Strategist itself does not require a prior consultation.
- Normally assign one plan `T?` section per implementation worker. Keep review and validation assignments separately bounded. Inspect and incorporate the prerequisite worker's result before launching a fresh worker whose assignment depends on it. Split by responsibility, not mechanically by file. Independent reads and disjoint writes can run in parallel.
- Use observable facts wherever possible: named requirements, available inputs, prerequisite results, interacting interfaces, and unresolved decisions. State the evidence for model/effort choices; label remaining judgment rather than presenting it as fact. Avoid scoring, routing tables, mandatory report formats, and effort ladders.
- Allow one automatic stronger-family retry when a worker attempted the assignment but its result shows it could not solve it despite having the required inputs and working tools. Carry existing work and evidence. A crash, timeout, missing prerequisite, environment failure, or unresolved user decision alone is not evidence that a stronger model is needed.
- Distinguish the orchestrator (the primary model interacting with the user), named agent roles, running subagents, and model/effort selections.
- `/do-it` remains execution of settled intent, not another planning or review phase.

Non-goals: runtime auto-routing/retries, new tools or tool parameters, telemetry, safety machinery, transport/lifecycle changes, new coordinator levels, council redesign, changing other roles' model defaults, Herdr registration fixes, legacy-profile work, and module changes. Post-review finding triage belongs to the separate [Steward plan](../steward-review-guidance/plan.md), not Strategist. This plan does not depend on Steward.

Authorization: this request authorizes a plan only. No active instructions or implementation have been changed. Execution requires a subsequent instruction such as `/do-it`; that invocation authorizes task-local commits and integration under its existing rules, but not push or deployment.

## Fresh-context handoff

All paths below are relative to `C:/Users/mglenn/.dotfiles`, unless absolute or marked proposed. Read applicable `AGENTS.md` files before acting. This work belongs entirely to the dotfiles repository and `pi/profiles/default/`.

Required implementation reading:

- `pi/README.md`, `pi/profiles/default/docs/subagents.md`.
- `pi/profiles/default/extensions/subagents.ts` and `extensions/subagent-child.ts`.
- `pi/profiles/default/lib/subagents/{definitions,launch,runtime,rpc}.ts`.
- `pi/profiles/default/agents/teamlead.md` and `prompts/do-it.md`.
- `pi/profiles/default/skills/agent-process/SKILL.md`, feedback AIF-027/AIF-029 in `references/instruction-feedback.md`, and failure APR-020 in `references/failure-log.md`.
- Testing skill when changing tests. Installed SDK `docs/extensions.md`, `docs/prompt-templates.md`, and `examples/extensions/prompt-customizer.ts` for the touched APIs. Resolve these inside the installed `@earendil-works/pi-coding-agent` package, not repository `docs/`.

Verified on 2026-09-10 at `2bea40d2` on `main`:

- Checkout was clean before creating this plan. Recheck before execution and preserve subsequent unrelated work.
- Root `subagents.ts` loads definitions with project trust, but its `before_agent_start` adds generic delegation text without a role catalog.
- Definitions contain names, descriptions, optional model/effort defaults, tools, delegates, and prompt bodies. Trusted nearest `.pi/agents/` definitions override profile definitions. Invalid overrides disable affected names; invalid coordinator delegate references also remove the coordinator.
- `childLaunch()` exports only the definition body as `PI_SUBAGENT_PROMPT`. Frontmatter is not automatically model-visible. Child authority separately freezes tools and delegates.
- Runtime already carries the resolved definition catalog into nested launches. `LaunchSpec` has no explicit prompt-context field. Both visible and headless children use `childLaunch()`.
- Team Lead can currently delegate to explorer, developer, reviewer, validator, researcher, and advisor. It has no generated model-visible delegate catalog.
- The previous oversized audit ended with a process exit and no usable report. That is not proof of a reasoning-capability failure.

Profiles and runs:

- Verified planning profile: `C:/Users/mglenn/.dotfiles/pi/profiles/default`, from the active profile environment.
- Intended execution profile: default, in the dedicated task worktree. Do not inspect or test legacy.
- Actual planning activity: source, SDK, and existing-test inspection only. The 2026-09-10 revision at `40a4b771` on `main` incorporated the operator's recommended-consultation and direct, evidence-based wording decisions. The active plan remains unimplemented; `lib/subagents/guidance.ts` is absent. Existing web-tool/changelog edits are unrelated and must be preserved. No new implementation, model-routing experiment, or live catalog validation was run.
- Record execution checks separately by date, profile/path, scope, and result.

Proposed execution worktree: `C:/Users/mglenn/.dotfiles-worktrees/strategist-delegation-guidance`; proposed branch: `feat/strategist-delegation-guidance`. Originating integration target: `C:/Users/mglenn/.dotfiles`, branch `main`. Record actual values before implementation; do not silently substitute a different target.

## Implementation contract

### Shared guidance and catalog

Proposed technical approach: one small pure module, `pi/profiles/default/lib/subagents/guidance.ts`, for shared policy text and catalog rendering. Routine function boundaries may change. Do not introduce a routing framework or duplicate policy across role files.

Generate compact, stable-order entries from resolved definitions: role name, short description, model default or explicit-model-required indication, and effective effort default (`low` when absent). Use exact provider/model IDs from definitions rather than inventing launch aliases. Describe these as defaults, not proof a provider/model is currently available. Do not include full prompts, file contents, or tool schemas in the catalog.

Audience behavior:

| Audience | Model-visible context |
| --- | --- |
| Orchestrator | Shared delegation guidance and all currently resolved roles; council remains explicit-user-request only. |
| Coordinator, including Team Lead | Shared guidance and only its frozen permitted delegates present in the launch catalog. No added authority. |
| Strategist launched by orchestrator | Shared decision guidance and roles the orchestrator can select, labeled recommendation-only. |
| Strategist launched by Team Lead | Shared decision guidance and only roles its caller may dispatch, labeled recommendation-only. No recommendation to dispatch coordinators outside that caller's authority. |
| Ordinary leaf | Existing role/authority prompt only, without a role catalog or coordinator guidance. |

Keep catalog visibility separate from dispatch permission. Strategist remains a leaf with an empty delegates list even though it sees recommendation options. Respect resolved project overrides, disabled definitions, and existing frozen child configuration. Root prompt generation should use current trusted definitions through the existing loader; child context should be composed once from the launch snapshot, not rediscovered inside a child with potentially different cwd or trust.

A compact composed prompt string on the internal launch spec, exported through existing `PI_SUBAGENT_PROMPT`, is a suitable mechanism. Derive nested Strategist's recommendation audience from its actual parent's frozen delegates and catalog in the runtime. Do not mutate shared definition bodies or put prompt text into argv, logging, authority metadata, or public schemas. Preserve identical composition across visible/headless hosting and retained-child configuration.

### Selection and recovery guidance

Include the recommended pre-`subagent` consultation and reuse guidance in the shared caller text so both orchestrator and Team Lead receive it. No consultation flag, approval record, or runtime ordering check is added.

Use these evidence anchors to inform judgment, not deterministic dispatch gates:

- **Clarity:** name the requested outcome and agreed checks; identify missing inputs or an unverified proposed solution.
- **Coupling:** name prerequisite worker results and interfaces that must agree; distinguish assignments that can finish without each other's edits.
- **Unresolved reasoning:** name the outstanding design choice, competing explanations, or observed failure cases. Do not infer complexity from file count or invent hypothetical cases to justify escalation.
- Luna low/medium/high fits most well-defined work with understood solutions. Match effort to remaining reasoning, not task prestige or file count.
- Luna xhigh or Sol low can address a named unresolved design choice or interacting interfaces. Sol medium/high can address decisions spanning several implementation layers or multiple evidenced failure cases; name those layers/cases rather than relying on a complexity label. These are selection examples, not automatic escalation conditions. Ask the user when differing interpretations would change requested behavior, scope, or agreed acceptance.
- Astra low/medium/high is available when justified. Astra above high is user-selected only; this restriction must not prohibit Luna xhigh.
- Briefly state the evidence for the choice in ordinary dispatch/consultation context, without a required schema or repeating the same rationale in every message.

After a worker finishes unsuccessfully, inspect its result and prerequisites first. If the result shows an attempted but unsolved assignment with required inputs and working tools, a caller may make one automatic stronger-family retry for the same bounded assignment: Luna to Sol, or Sol to Astra. A crash, timeout, or tool failure alone does not establish this condition. Carry partial work, evidence, and the actual failure forward. Do not chain a Luna-to-Sol retry into another automatic Sol-to-Astra retry for that assignment. Choose effort proportionately rather than stepping through every level. If Team Lead already used the retry, it must tell its parent so the orchestrator does not restart the allowance. This is prompt guidance, not new retry state or runtime enforcement. Preserve existing explicit user constraints.

Keep existing surface selection, retained conversation controls, question-answer handling, outcome delivery, council restriction, and soft agent-count guidance. Avoid repeating these rules across injection paths.

### Strategist and `/do-it`

Recommended new-role defaults for this implementation: `openai-codex/gpt-5.6-luna`, effort `high`, tools `[read, grep, find, ls, subagent_parent]`, skills `[]`, delegates `[]`. These are proposed configuration choices, not a claim that this model has already been validated for the role. Preserve all existing roles' defaults, including reviewer.

The role gives concise advice for the caller's proposed assignments: task boundaries, prerequisite order, suitable roles and model/effort, and the evidence for those choices. It may recommend direct execution instead of more workers. Ask the parent for missing facts that change the assignment; do not invent user requirements. No forced output format, plan rewrite, implementation, dispatch, or fallback plan. Related assignments reuse the advice; a new tool call alone is not a reason to repeat consultation.

Add Strategist to Team Lead's delegates. Keep Team Lead's role-specific body short because shared policy is injected centrally.

Add an explicit recommended tool reference to `/do-it`, along these lines:

> Normally consult `subagent` with `agent: "strategist"` before assigning work through `subagent`. Reuse its advice for related assignments rather than consulting again for every call. Advice stays within the user's request and accepted plan; it does not reopen scope or acceptance or require approval to proceed.

Do not duplicate shared model-selection policy in `/do-it`, and do not change argument parsing, execution authorization, worktree handling, or closeout behavior.

## Execution guidance

Create or resume the recorded task worktree and branch; record actual path and integration target before edits. Carry this task-owned uncommitted plan into the worktree without deleting its source prematurely. Preserve unrelated work.

Normally delegate one implementation task below at a time. Inspect and incorporate its result before launching a worker for a dependent task. The task list does not require an agent for every task. Choose implementation details without changing requested behavior, settled decisions, task scope, or agreed acceptance checks; ask before changing those. Continue independent work around concrete blockers. Keep task evidence and any blocker/next-action/action-owner record current. Do not add unrelated audits or speculative improvements.

## Tasks

- [ ] **T1: Define shared audience-aware delegation context**
  - Depends on: none.
  - Add proposed `lib/subagents/guidance.ts` and proposed `tests/subagent-guidance.test.ts`, under the default profile.
  - Implement compact policy/catalog composition with explicit dispatch versus recommendation audiences, using `AgentDefinition` data. Keep ordinary-leaf output empty. No filesystem reads or dispatch behavior in this helper.
  - Verify audience filtering, deterministic entries, absent defaults, and non-mutation using small synthetic definitions. Check policy includes recommended pre-`subagent` consultation with advice reuse, evidence-based selection, Luna xhigh, Astra's user-only above-high restriction, and one cross-family retry without a rigid ladder. Avoid full-prose snapshots.
  - Done when the helper has a clear caller contract and focused tests pass.
  - Evidence: Not started.

- [ ] **T2: Wire context into root and frozen child prompts**
  - Depends on: T1.
  - Files: `extensions/subagents.ts`, `lib/subagents/{runtime,rpc,launch}.ts`; touch `extensions/subagent-child.ts` only if composition requires it. Both transports already consume the shared launcher.
  - Replace root's duplicated generic paragraph with shared guidance and its resolved catalog. Compose coordinator/Strategist launch context once; preserve definition bodies and child authority. Restrict nested Strategist recommendations using the actual parent's permitted delegates.
  - Extend focused tests at the prompt assembly/launch boundary, plus existing runtime tests where parent context matters. Use existing transport fixtures, not real model calls or a new orchestration harness.
  - Verify trusted overrides appear, untrusted/invalid overrides do not leak, coordinator catalogs match allowed delegates, nested Strategist gets the caller's subset without dispatch permission, ordinary leaves lack extra context, and an existing child's composed prompt stays frozen after later catalog changes. Check visible/headless launch composition and unchanged model/effort arguments.
  - Done when root and child launch-boundary tests demonstrate the audience contract and existing authority tests remain green.
  - Evidence: Not started.

- [ ] **T3: Add Strategist and document recommended consultation**
  - Depends on: T2.
  - Add proposed `agents/strategist.md`; update `agents/teamlead.md`, `prompts/do-it.md`, `docs/subagents.md`, and root `CHANGELOG.md`.
  - Implement the role/defaults above, add Team Lead permission, and keep role-specific instructions short. Document terminology, generated catalog visibility, shared selection/recovery guidance, explicit consultation syntax, and reload/frozen-child limits. Record why this addresses AIF-027/APR-020 without attributing the process exit to model weakness.
  - Extend `tests/subagent-definitions.test.ts` for the actual bundled Strategist definition and Team Lead delegate relationship. Check the role is read-only, has no delegates, and does not alter other defaults. Use focused content assertions for `/do-it`'s explicit role reference, recommended consultation/advice reuse, and preserved execution semantics, not a large prose snapshot.
  - Done when the resolved profile loads without new definition errors, the role and recommended invocation are covered, and docs/changelog match implemented behavior.
  - Evidence: Not started.

- [ ] **T4: Validate the integrated change**
  - Depends on: T3.
  - From the task worktree's `pi/profiles/default`, run `pnpm run typecheck` and `pnpm test subagent-guidance.test.ts subagent-definitions.test.ts subagent-loader.test.ts subagent-runtime.test.ts subagent-rpc.test.ts subagent-child-outcomes.test.ts`, plus any new focused prompt/launch test file created in T2 or T3.
  - Run `git diff --check` at the task repository root. If worktree dependencies are absent, use the repository's documented pnpm frozen-install and default-profile dependency-link setup, not another package manager.
  - Review assembled prompt examples once for root, Team Lead, root Strategist, nested Strategist, and ordinary leaf. Confirm one shared policy copy where applicable, no catalog on ordinary leaves, and no model-family names presented as agent roles.
  - Fix demonstrated task-relevant failures. Stop when these checks pass; do not add live-provider benchmarks or unrelated suites as acceptance gates.
  - Done when finite checks pass and actual date/profile/path/results are recorded. Synthetic prompt/transport checks establish wiring, not model compliance or live Herdr behavior.
  - Evidence: Not started.

- [ ] **T5: Archive, commit, integrate, and clean up**
  - Depends on: T4 and execution authorization.
  - Follow closeout below. Keep integration/cleanup unfinished until actually verified. With `--no-merge`, record the intentional exception and retain the committed worktree.
  - Done when authorized integration and cleanup are verified, or explicitly report the applicable blocked/skipped outcome without claiming completion.
  - Evidence: Not started.

## Validation and current handoff

- Status: ready for user review and execution authorization. Technical defaults/mechanisms above are the proposed implementation, not already active behavior.
- Completed: planning and source inspection only. The 2026-09-10 revision received a single read-through for execution handoff, wording, and scope consistency; task-owned Markdown links and whitespace were checked. No implementation tests were run for this revision.
- Next: after authorization, create/record the dedicated worktree and begin T1.
- Open consequential decisions: none identified. Existing reviewer and other role defaults remain unchanged.
- Verification limits: no live Strategist run, model/effort efficacy evaluation, or live Herdr prompt inspection. These are non-blocking limits, not required operator acceptance steps. Observe ordinary assignments after rollout rather than adding evaluation infrastructure here.

## Closeout

After implementation and agreed checks pass, record integration pending. Confirm `.specs/archive/strategist-delegation-guidance/` is unused, move this whole spec directory there in the task worktree, repair affected links, and commit implementation and archived spec on the task branch. Do not archive unfinished implementation.

Unless `--no-merge` was requested, merge into the recorded originating checkout/branch without stashing, discarding, or committing unrelated target work. Resolve routine conflicts within settled intent; ask only for consequential input or prerequisites outside agent authority. If blocked, retain the worktree and record the precise reason, next action, and action owner. Handle the original task-owned uncommitted plan copy without losing unique content; after integration, verify no active copy remains.

Verify the target contains the implementation and archive. Then set archived frontmatter to `status: completed` and the actual completion date, record integration evidence, and commit that metadata on the target. Remove the task worktree only after verifying it contains no uncommitted or unmerged work. Leave cleanup unchecked and report cleanup pending if removal cannot finish. Rerun affected checks only if conflict resolution changed checked content. No push or deployment without separate authorization. Operator manual/live testing does not delay closeout.

Final execution response must lead with one explicit outcome: 🟢 **COMPLETED**, 🔴 **NOT COMPLETE: MERGE BLOCKED**, 🔴 **NOT COMPLETE: USER INPUT REQUIRED**, 🔵 **IMPLEMENTED: MERGE SKIPPED AS REQUESTED**, or 🟡 **CLEANUP PENDING**. For blocked/pending outcomes, give Reason and Action needed with the responsible party before successes. Then concisely report checks, archived/active spec path, branch/commits, merge target/result, and any retained worktree. Do not present archival or passed tests as completed integration.
