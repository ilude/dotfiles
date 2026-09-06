# Radical simplification proposal

## Accepted direction

Subsequent planning clarification: retain `plan-it` and `do-it` as instruction sets, including useful adversarial planning reviews and parallel subagents. Planning, execution, and `/goal` work use a worktree by default unless the operator requests otherwise. This supersedes any current-checkout or no-default-worktree recommendation below. Worktree isolation does not require retaining procedural controllers. The operator subsequently selected preservation of existing flags/defaults, including fresh-session execution, automatic archive/commit/merge/cleanup and existing exceptions. Those choices supersede suggestions below to make these operations opt-in or remove all command adapters. The ready [reset plan](../pi-development-flow-reset/plan.md) retains only necessary host transport around instruction-guided work; its accepted behavior governs implementation. No operator closeout decision remains open.

The operator has clarified that incremental cleanup is insufficient. The goal is a substantially smaller system that relies on the agent to do the work, test it, diagnose and address failures, and continue to completion. Remove existing ceremony; reintroduce a mechanism only if experience demonstrates that it is needed.

The operator further identified damage control and `/commit` as satisfactory, with only some parts of the subagent system worth retaining. The current `/do-it`, workflow systems, and development-flow instructions/skills are rejected as the design baseline.

Preservation and replacement boundaries:

- Preserve the existing damage-control system and its behavior. Do not redesign it, weaken it, or build parallel permission machinery as part of this simplification.
- Preserve `/commit` and its current behavior. Remove unwanted workflow coupling elsewhere rather than folding `/commit` into a replacement development lifecycle.
- Retain subagent capabilities selectively. Useful assignment, execution, result delivery, cancellation, and containment are candidates; current topology, orchestration, task coupling, and procedural metadata are not presumed desirable. The operator has not identified every satisfactory subagent component individually.
- Remove or replace `/do-it` and the managed workflow architecture rather than treating their present defaults and contracts as features that must survive. A retained command name does not require retaining its implementation.
- Replace the development-process portions of instructions and skills rather than appending corrective rules. Preserve useful technical knowledge, repository facts, and independent safety constraints, not the old development itinerary.

This supersedes the earlier conservative proposal to retain much of the managed workflow while trimming its gates. It is a direction for implementation, not a claim that runtime changes have been made. Preserving existing partial work and explicit in-flight obligations remains necessary; it does not require preserving the rejected architecture.

## The operating model

The request supplies the outcome and constraints. The agent inspects the affected system, implements the work, uses relevant checks, addresses understood failures, and continues until the requested result is verified or there is a genuine blocker.

That is ordinary work, not a lifecycle requiring forms, stage transitions, review receipts, or permission to proceed from one development activity to another.

- The user decides material behavior, scope, tradeoffs, and acceptance.
- The agent chooses and revises execution methods within that intent.
- Testing is part of delivering working results. A failure is evidence to understand, not automatic permission to broaden scope and not an automatic reason to ask the user to authorize another ordinary repair.
- Passing evidence remains valid while its covered inputs remain unchanged.
- The agent asks when a consequential decision, missing authority, unavailable dependency, or lack of a supported way forward genuinely requires the user.
- No promise of one-pass success, unlimited blind retries, or guaranteed completion despite unavailable external dependencies.

The implementation should make this the uncomplicated path. Do not build a new framework to enforce these sentences.

## Remove whole mechanisms

| System | Proposed disposition |
| --- | --- |
| Mandatory planning lifecycle | Delete review stages, review bookkeeping, readiness transitions, and controller coupling whose purpose is enforcing planning procedure. Planning becomes an ordinary capability and an optional useful document. |
| Mandatory review process | Delete fixed reviewer roles, ordering, final subtractive review, and review receipts as completion requirements. Keep the ability to request a focused review when it answers a real question. |
| Universal validation schedule | Delete the rule forbidding development checks until all implementation is authored. Choose checks when they resolve a relevant uncertainty or verify completed work; do not institute a test-after-every-edit mandate instead. |
| Universal development repair allowance | Delete the fixed one-repair/one-rerun budget and its cross-task, worker, message, and compaction bookkeeping. Continue diagnosis-led repair within scope; stop speculative repetition or surface a real blocker. |
| Mandatory task materialization and completion mapping | Delete compulsory root tasks, plan-to-task mirrors, generated condition mappings, and repeated completion attestations whose only role is allowing work or goal completion. Preserve useful existing work records. |
| `/do-it` and managed workflow architecture | Remove or replace the current system, not merely its default mode. Ordinary execution must not require planning, worktree setup, session replacement, archival, merge, or closeout verification. Reuse useful standalone operations without preserving the old lifecycle. Leave `/commit` unchanged. |
| Automatic validation settlement machinery | Target the changed-file collection and automatic settlement route for deletion where explicit-only operation has removed its purpose. Preserve an explicit validator only where it has a real caller. Automatic model repair is already removed; do not claim to remove it again. |
| Instructions and tests preserving retired procedure | Delete them with their runtime owners. Do not leave the old system documented, tested, or reachable behind a new simplicity mode. |

This is not a blanket deletion of every file containing workflow code. A file may also contain useful path containment, process cleanup, Git recovery, or dispatch logic. Keep the necessary operation, not the procedural subsystem around it. Exact file deletion follows its actual remaining callers rather than a line-count target.

## What remains

### Direct tools and skills

Reading, editing, command execution, testing, research, and ordinary Git operations remain directly usable. Replace development-flow instructions with a small amount of outcome-focused guidance, rather than editing around their current structure. Retain technical skills for language/runtime knowledge, external contracts, and known traps, not a mandatory development itinerary. Remove duplicated generic process instructions and exhaustive proof requirements for routine procedural steps. Damage control and `/commit` are explicitly preserved, not redesign candidates.

### Commands as conveniences

Retain useful command names as thin entrypoints to ordinary capabilities:

- Planning helps create a useful plan; it does not initialize permission to work.
- Execution starts requested work; it does not necessarily create a managed project.
- A goal keeps the outcome active, including unattended continuation where requested.
- Commit, merge, worktree, and session controls perform their named operations with appropriate checks.

Retained operations should be accessible to the agent without requiring the operator to type a command to initialize procedural state. Reuse native Pi facilities and direct functions before writing another custom controller.

The earlier recommendation to freeze `/do-it` defaults is withdrawn. Its existing architecture and defaults are not preservation requirements. If `/do-it` remains, it should be a thin convenience for direct execution, not the current managed lifecycle behind fewer visible controls. Fresh-session, worktree, archive, and merge operations can remain independently available when wanted. This does not waive explicit closeout obligations for existing active work.

### Minimal durable progress and continuation

Long-running work must survive interruption. Preserve the original objective, real constraints, useful progress, known failures, and next action in an existing plan, task, or session mechanism as appropriate. Do not require the same information in several systems.

Unattended continuation retains meaningful start, stop, resume, cancellation, and result behavior. It does not require canonical plan readiness, a task graph, or a collection of completion judgments merely to keep working. Operational process state is different from a work checklist.

### Optional delegation

Keep subagents for independently useful work, specialist knowledge, or context isolation. Do not require delegation, Team Leads, or another handoff because an assignment returned unfinished. Finish and integrate coupled work rather than repeatedly commissioning broad replacements.

Existing optional task IDs must not become compulsory. Inventing a task ID is an execution mistake, not evidence that the runtime needs another task-creation layer.

### Concrete protection at actual operations

Keep controls that prevent a specific harmful action:

- Protect secrets and enforce actual read/write authority.
- Identify the correct repository, branch, browser target, process, and terminal.
- Preserve unrelated changes and recoverable partial work.
- Cancel and clean up the intended resources, without freeing or terminating another worker's resources.
- Respect explicit resource limits and user-defined live-attempt caps.
- Keep stateful rollout, backup, rollback, and incident protections where actual live mutations require them.

Do not turn these into a general permission gate for ordinary coding. An unready plan is not a reason to refuse an authorized source inspection. An incorrect unit-test assumption is not a production incident.

## What work should look like

For the benchmark, the agent preserves the actual synthetic-data, sample, correctness, isolation, and resource-measurement requirements; implements a coherent adapter-to-runner-to-report path; tests it; diagnoses mismatches; and repairs them without requiring the user to replenish a generic local repair allowance. Explicit limits on live benchmark attempts remain binding.

For worker coordination, the agent implements the actual concurrency, cancellation, terminal, and cleanup behavior using the existing manager where suitable. It verifies the complete transition rather than expanding abstract ownership machinery or collecting separately authored pieces without integration.

For a small code change, the agent reads the affected code, makes the appropriate change, runs the relevant check, and finishes. No plan, durable task, delegated review, archive, or automatic merge is added merely because those facilities exist.

For a consequential ambiguity, the agent asks the user before choosing different behavior. Removing procedure does not grant permission to invent requirements.

## Why this is more than another instruction edit

Current instructions already contain advice to avoid unnecessary ceremony, preserve acceptance, and delegate proportionally. Current sessions still show unfinished packages, repeated review/repair handoffs, and operator intervention. Adding stronger wording alone is not an adequate response.

The change must remove the runtime dependencies, record formats, callers, prompts, documentation, and tests that sustain the unwanted procedure. Do not keep the old framework with exemptions, a mode flag, compatibility paths without real consumers, or a replacement policy engine.

Not all churn is caused by mandatory policy. Some comes from poor comprehension, incorrect fixtures, broad delegation, and weak integration despite existing guidance. Radical simplification removes competing obligations and artificial blockers; it cannot guarantee sound judgment. The remaining system must be judged by whether work actually gets completed, not by reduced instruction length or gate counts.

## Implementation boundary

The implementation should be one coherent removal of the procedural system, not another series of small controller fixes and added exceptions. Work can still be organized safely without creating mandatory waves or multiplying acceptance gates.

Owning areas include:

- `pi/extensions/goal.ts` and workflow command/lifecycle code.
- Plan, goal, task, and closeout integrations that exist to enforce procedure.
- `pi/extensions/quality-gates.ts` and its real consumers.
- `pi/AGENTS.md`, workflow prompts, planning/testing/orchestration guidance, agent definitions, `skills-engineer`, and the missing capability/invariant guidance in `pi-extension`.
- Owning contracts, documentation, and tests for the removed behavior.

Existing incomplete work must remain recoverable. Inspect active plans, tasks, loops, worktrees, and closeout state before retiring their consumers. Preserve real progress and explicit obligations; do not bulk-delete state or retroactively waive an active task's live limits. Use a narrow transition path only where existing state actually needs it.

No runtime or instruction implementation has been performed by this investigation. Until an approved change lands, the current operating instructions and active-work constraints still apply.

## Evidence and verification

The diagnosis and contrasts remain in [current-session evidence](current-session-evidence.md), [system evidence and history](system-evidence.md), and [first-pass findings](findings.md). They establish mechanisms and observed effects, not prevalence or model-internal causes. The first-pass technical inputs are supporting material, not a limit on the removal scope.

Verify the replacement through ordinary work, conversational command access, failure recovery, and interruption/resume. Retain focused tests for real host integration, exact intent, target isolation, cancellation, and preservation. Remove tests that only prove the retired procedure was followed. Do not construct an anti-ceremony test framework or require a benchmark program to justify each deletion.

Add ceremony back only in response to a demonstrated recurring failure that cannot be addressed more directly. That is a design preference, not a new approval ledger, scoring system, or mandatory review ritual.
