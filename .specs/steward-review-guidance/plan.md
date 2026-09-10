---
created: 2026-09-10
status: ready
completed: null
---

# Add Steward to keep review follow-up within the agreed task

## Goal and scope

Add a `steward` advisory agent to the default Pi profile. Normally consult it after reviewer or validator findings arrive, before assigning follow-up fixes. Steward compares findings and proposed fixes with the user's request, corrections, and agreed checks so review does not silently become more requirements, safety gates, or unfinished remediation.

User requirements and settled decisions:

- Strategist advises how to assign work before execution. Steward advises what review-driven follow-up belongs in the task after implementation. Keep these roles separate.
- Both consultations are the recommended workflow at their stated tool/result boundaries, not exceptional fallbacks or mandatory approvals. The orchestrator or Team Lead retains the decision and execution responsibility.
- Use direct instructions and observable evidence wherever possible. Name the affected requirement, observed failure, or failed agreed check. Distinguish inference and proposed improvements from established facts. Do not replace judgment with scoring or runtime enforcement.
- Keep consultation concise and flexible. No required finding categories, report template, severity matrix, approval record, or repeated consultation for each finding.
- Steward advises on existing findings, not another open-ended review. It must not add acceptance criteria or turn hypothetical risks into required infrastructure.

Non-goals: changing Strategist's responsibility or other roles' model defaults; new review/validation phases; automatic invocation or blocking; new tools, tool parameters, transport, lifecycle, retry state, telemetry, evaluation frameworks, or safety systems; planning-skill/global `AGENTS.md` edits; legacy-profile and module work. General instruction wording is a separate operator discussion, not a task in this plan.

Authorization: planning only. No active agent or execution guidance is changed by this plan. A subsequent `/do-it` or equivalent authorizes implementation and task-local commits/integration under the closeout below, not push or deployment.

## Fresh-context handoff

All paths are relative to `C:/Users/mglenn/.dotfiles` unless absolute or marked proposed. Read applicable `AGENTS.md` files. All implementation belongs to `pi/profiles/default/`, with the root changelog and this spec as supporting artifacts.

Required reading:

- `pi/README.md`, `pi/profiles/default/docs/subagents.md`.
- `pi/profiles/default/agents/{teamlead,reviewer,validator}.md` and `prompts/do-it.md`.
- `pi/profiles/default/lib/subagents/definitions.ts`, `pi/profiles/default/tests/subagent-definitions.test.ts`.
- After the prerequisite below: `lib/subagents/guidance.ts` and `tests/subagent-guidance.test.ts`, under the default profile, plus the prerequisite's implemented prompt-boundary tests if needed to understand the shared helper.
- `pi/profiles/default/skills/agent-process/SKILL.md`, its feedback AIF-003/AIF-004/AIF-023/AIF-027/AIF-029, and incidents APR-002/APR-005/APR-007/APR-020. Read the testing skill before changing tests.
- Installed Pi `docs/prompt-templates.md` for native prompt behavior. Resolve it under the installed `@earendil-works/pi-coding-agent` package, not repository `docs/`. No new SDK API is proposed.

### Prerequisite and verified starting state

Implement and integrate [Strategist delegation guidance](../strategist-delegation-guidance/plan.md) first. It supplies the shared caller guidance/catalog used here. This is an implementation dependency, not a requirement for users to obtain Strategist approval before consulting Steward. Before execution, locate that spec at its active or archived path, read its actual checklist/status, and inspect the integrated implementation. Do not assume an archive path alone proves completion. If it has not been implemented, report that prerequisite and do not duplicate its module in this task. Repair the link when the prerequisite moves to `.specs/archive/strategist-delegation-guidance/`.

Verified on 2026-09-10 at `40a4b771`, branch `main`:

- Strategist's plan is active with `status: ready` and unchecked T1–T5. `pi/profiles/default/lib/subagents/guidance.ts` does not yet exist.
- Profile roles are discovered from `agents/*.md`; a valid new leaf needs no separate runtime registration. Root dispatch uses resolved definitions. Team Lead has an explicit permitted-delegates list.
- Reviewer reports evidence-based findings. Validator runs assigned checks and reports results; its shell authority is not an OS read-only boundary. Preserve both roles' existing tools and defaults.
- `prompts/do-it.md` executes settled intent and finite checks, forbids added audits/acceptance requirements, and owns existing worktree/closeout instructions. It currently has no Steward reference.
- The Strategist plan proposes centrally composed caller guidance. Steward can remain an ordinary leaf without a role catalog or shared dispatcher prompt. Only its callers need the consultation guidance.
- Existing definition tests use the real loader and synthetic profile directories. Strategist plans to add bundled-role assertions and shared guidance tests. Extend those rather than build a separate test harness.

Planning profile verified from `PI_CODING_AGENT_DIR`: `C:/Users/mglenn/.dotfiles/pi/profiles/default`. Planning activity was file inspection and one bounded Luna-medium explorer inspection of integration points; no implementation, tests, live Steward invocation, or model efficacy evaluation was run. Source/configuration inspection establishes wiring opportunities, not proof that an advisory agent prevents churn.

Preserve unrelated current edits in `CHANGELOG.md`, `pi/profiles/default/docs/web-tools.md`, `pi/profiles/default/extensions/web-tools/index.ts`, and `pi/profiles/default/tests/web-tools.test.ts`. Recheck actual Git state before execution. This session's Strategist plan revision and AIF-029 feedback entry are related context, not permission to commit other pending work.

Proposed execution worktree: `C:/Users/mglenn/.dotfiles-worktrees/steward-review-guidance`; branch: `feat/steward-review-guidance`. Originating integration target: `C:/Users/mglenn/.dotfiles`, branch `main`. Record actual path/branch/target before implementation. Execute and test using the default profile in that worktree; do not inspect or test legacy.

## Implementation contract

### Role and evidence

Proposed implementation defaults: `name: steward`, model `openai-codex/gpt-5.6-luna`, effort `high`, tools `[read, grep, find, ls, subagent_parent]`, skills `[]`, delegates `[]`. Luna high is a starting configuration for comparing bounded findings and requirements, not a measured quality threshold. Preserve existing override behavior and all other role defaults; do not introduce a Steward-specific escalation policy.

The caller supplies the relevant user request and corrections, accepted plan/checks when present, implementation summary or diff, reviewer/validator findings, and any proposed fixes. Use existing results and file references, not a new dossier or artifact format. Do not presume children inherit the full parent conversation. Because Steward has no shell, the caller supplies Git diffs or command output when needed. Steward may read cited source to check a finding and ask its parent for missing facts; it does not launch audits or run extra checks.

The role body should express these decisions in short plain language, not reproduce this plan:

- Compare findings with the actual request, corrections, and agreed checks. Identify the affected requirement or demonstrate the task-related regression; if neither is established, say so. A reviewer severity label or use of the word security is not evidence by itself.
- Distinguish an observed failure or source-demonstrated defect from an untested possibility. Runtime reproduction is not required for a defect that source evidence establishes. Do not require exhaustive proof before a local correction.
- Recommend a fix that addresses the stated defect without adding unrelated behavior. If a proposed fix introduces a new subsystem, dependency, approval step, or acceptance check, explain why the requested behavior needs it; do not assume the finding authorizes it.
- Do not discard a finding solely because it predates the change; explain whether it prevents the requested behavior or an agreed check from passing. Conversely, unrelated pre-existing problems do not become this task's work.
- Recommend a user question when resolving a finding requires changing the agreed behavior, scope, or acceptance, or when two interpretations of the request would produce different behavior. Ask the parent for discoverable facts; do not send routine technical decisions to the user.
- When requested behavior works, agreed checks pass, and no demonstrated task-related defect remains, recommend closeout. Optional improvements and unperformed operator manual testing do not prevent it. Passing checks alone do not erase an evidenced defect.

Advice can recommend a bounded fix, a question, deferring an improvement, or proceeding to closeout. These are examples, not required output enums or a reporting schema. Steward neither approves work nor edits, dispatches, rewrites plans, or changes acceptance. The caller owns the decision; keep any explanation of disagreement in normal task context rather than a new approval record. Necessary functionality must not be removed merely to reduce line count.

### Caller guidance and placement

Add a compact recommendation to the prerequisite's shared caller guidance, delivered to the orchestrator and Team Lead through its existing composition. Use explicit tool/result names, along these lines:

> Normally consult `subagent` with `agent: "steward"` after receiving reviewer or validator findings, before assigning follow-up fixes. Supply the request, agreed checks, findings, and proposed fixes together. Reuse its advice for the same findings; consult again for new findings or a changed proposed fix, not merely because another check ran. If there are no findings, continue the existing task or closeout. Steward advises; the caller decides and proceeds.

This does not require launching a reviewer or validator when the task did not call for one. It does not require waiting for every concurrent assignment before addressing available findings. Group available related findings instead of launching one Steward per finding. No special bypass parameter or explanation is needed when the caller handles an obvious local fix directly. Do not turn Steward unavailability into an approval blocker or automatically launch replacement advisors.

Add `steward` to Team Lead's permitted delegates. Root and coordinator catalogs should discover the definition through the prerequisite's existing logic; Steward itself remains an ordinary leaf with no dispatcher guidance or recommendation catalog. No changes to child transport, authority, or runtime ordering are needed.

Add one short explicit Steward consultation reference to `/do-it`, pointing to post-review/validation findings and advice reuse. Keep detailed evidence guidance in the role body and the caller rule in the shared module; do not copy them throughout role files. Preserve Strategist's pre-assignment recommendation. `/do-it` remains execution of settled intent, not another planning or review phase. Preserve argument handling, local Git authority, worktree handling, outcome labels, and closeout.

Document both agents as recommended consultation at different points, with no mandatory approvals. Documentation must not present the role as proven churn prevention or as a deterministic finding filter.

## Execution guidance

After the prerequisite is integrated and this plan is authorized, create or resume the recorded dedicated worktree. Carry any task-owned uncommitted plan content without deleting its source prematurely. Preserve unrelated edits.

Normally assign one implementation task below per worker and incorporate its result before assigning dependent work. Use the integrated Strategist guidance before subagent assignments; reuse advice. Choose implementation details without changing requested behavior, settled decisions, scope, or agreed checks. Ask before changing those. Continue independent work around a specific blocker; do not add unrelated audits or acceptance gates. Keep task checkboxes, evidence, and any blocker/next action/action owner current. Do not stop after an actionable task merely to promise continuation.

## Tasks

- [ ] **T1: Add the Steward definition and Team Lead permission**
  - Depends on: integrated Strategist implementation.
  - Files: proposed `pi/profiles/default/agents/steward.md`; existing `agents/teamlead.md` and `tests/subagent-definitions.test.ts` under that profile.
  - Add the leaf with the defaults and evidence-based remit above; add Team Lead's delegate entry without changing other permissions/defaults.
  - Extend the real bundled-definition loader assertions for role discovery, exact read-only tools, empty skills/delegates, model/effort, Team Lead access, and preservation of existing defaults. Do not mock away definition loading.
  - Done when `pnpm test subagent-definitions.test.ts` from the task's default profile passes with no new bundled definition errors.
  - Evidence: Not started.

- [ ] **T2: Add post-finding consultation guidance and documentation**
  - Depends on: T1.
  - Files under the default profile: `lib/subagents/guidance.ts`, `tests/subagent-guidance.test.ts`, `prompts/do-it.md`, `docs/subagents.md`; root `CHANGELOG.md`.
  - Add the shared caller recommendation and short `/do-it` reference. Preserve Strategist guidance, ordinary-leaf prompt behavior, and all existing execution/closeout semantics. Document why review findings do not automatically authorize more requirements.
  - Extend existing guidance tests for Steward catalog presence in the root and permitted Team Lead audiences, its absence of dispatcher context as an ordinary leaf, and the caller's explicit consultation reference. Use focused content assertions for advice reuse and `/do-it` reference/argument preservation, not full prose snapshots. No new runtime mechanism or prompt-composition path.
  - Done when `pnpm test subagent-guidance.test.ts subagent-definitions.test.ts` passes and the role, shared text, and docs agree about recommended consultation rather than approval.
  - Evidence: Not started.

- [ ] **T3: Validate the integrated change**
  - Depends on: T2.
  - From the task worktree's `pi/profiles/default`, run `pnpm run typecheck` and `pnpm test subagent-guidance.test.ts subagent-definitions.test.ts subagent-loader.test.ts`. At the task repository root run `git diff --check`. If dependencies are absent, use the repository's documented pnpm frozen-install and default-profile dependency-link setup.
  - Review the assembled caller/Steward prompts once: a failed agreed check permits a bounded correction; a speculative improvement does not create acceptance work; a pre-existing defect is evaluated by its effect on the task; no findings require no Steward call. This is a wording review, not a live-model behavior test or new fixture framework.
  - Confirm `/do-it` argument forms, execution authority, and outcome/closeout instructions are unchanged except for the consultation reference. Fix demonstrated failures from these changes, then stop.
  - Done when the named checks pass and actual date/profile/path/results and verification limits are recorded. No provider benchmark, live Herdr run, operator acceptance, or exhaustive review suite is required.
  - Evidence: Not started.

- [ ] **T4: Archive, commit, integrate, and clean up**
  - Depends on: T3 and execution authorization.
  - Follow closeout below. Keep integration and cleanup unfinished until verified; with `--no-merge`, record the intentional exception and retain the committed worktree.
  - Done when authorized integration and cleanup are verified, or report the specific blocked/skipped outcome without claiming completion.
  - Evidence: Not started.

## Validation and current handoff

- Status: ready for review and execution authorization, with implementation ordered after Strategist integration.
- Completed: planning/source inspection and one read-through for execution handoff, wording, and scope consistency. Task-owned Markdown links and whitespace were checked. No agent, shared guidance, or execution prompt changes implemented; no implementation tests run.
- Next: review this plan; execute Strategist first, then authorize this plan. Do not execute the prerequisite merely because this plan references it.
- Open user decisions: none identified. Technical defaults above are the proposed implementation, not already validated behavior.
- Verification limits: no live Steward run or measured reduction in churn. Offline loader/prompt checks establish configuration and instruction delivery, not model compliance. Observe normal use after rollout rather than add evaluation machinery here.

## Closeout

After implementation and the agreed checks pass, record integration pending. Confirm `.specs/archive/steward-review-guidance/` is unused, move this entire spec directory there in the task worktree, and repair affected links, including the Strategist/Steward cross-references. Commit implementation and archived spec on the task branch. Do not archive unfinished implementation.

Unless `--no-merge` applies, merge into the recorded originating checkout/branch without stashing, discarding, or committing unrelated target work. Resolve conflicts within the agreed scope; ask only for a user decision or prerequisite outside agent authority. If blocked, retain the worktree and record the reason, next action, and action owner. Preserve unique content in any original task-owned plan copy; verify no active copy remains after integration. With `--no-merge`, keep the committed worktree and report the intentional exception rather than claiming integration.

Verify the target contains implementation and archive. Then set archived frontmatter to `status: completed` and the actual `completed` date, record integration evidence, and commit that metadata on the target. Remove the task worktree only after verifying no uncommitted or unmerged work remains. Leave cleanup unchecked and report cleanup pending if removal fails. Rerun checks only if conflict resolution changed checked content. No push or deployment without separate authorization. Operator manual/live testing does not delay closeout.

Final execution response starts with one explicit outcome: 🟢 **COMPLETED**, 🔴 **NOT COMPLETE: MERGE BLOCKED**, 🔴 **NOT COMPLETE: USER INPUT REQUIRED**, 🔵 **IMPLEMENTED: MERGE SKIPPED AS REQUESTED**, or 🟡 **CLEANUP PENDING**. For blocked/pending outcomes give Reason and Action needed, including who must act, before successes. Then report checks, spec path, branch/commits, integration target/result, and any retained worktree. Passed tests or archival alone do not establish completion.
