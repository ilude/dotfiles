# Findings

First-pass findings only; the system-wide investigation is incomplete. These findings overrepresent recent failures and do not yet explain the broader machinery-generation pattern. Implementation not started. References describe source inspected at baseline `4549dca9545c38d460719a69698a75da9091b51d`, unless marked historical. These are selected cases, not a prevalence study. No executable reproduction or development validation was run.

## Conclusion

The problem is not simply insufficient autonomy. Useful execution is coupled to procedural state, while the system does not consistently preserve the user's full intent or test its real host boundaries. Strong specific mandates override existing general advice to simplify. The resulting failures encourage repeated operator requests, speculative reconstruction, and local repairs that leave the coupling intact.

Simplify the coupling and instructions together. Keep authority, ownership, preservation, and truthful outcome reporting; remove mandatory review bookkeeping and arbitrary repair counters. Do not implement a new framework to enforce simplicity.

## F1: Goal startup has a concrete cross-extension identity defect

**Established by installed source and observed failure.**

- `pi/lib/workflow-commands/plan-lifecycle.ts:83-110` stores controllers in a WeakMap keyed by the supplied host object.
- `pi/extensions/workflow-commands.ts:2606` registers with its extension's `pi`; `pi/extensions/goal.ts:1871` looks up with another extension's `pi`.
- Installed Pi 0.84.4 `dist/core/extensions/loader.js:209-233,459-464` constructs a separate API object for each extension. Sharing a runtime/event bus does not make those API objects identical.
- Session `01a07226-506e-79df-81a1-729d2718ed7f`, entries `45931e31` and `92638f1c`, reports the unavailable controller followed by blocked work.

This is not merely a possible load-order problem. Correcting the key would repair that defect, but not the mandatory lifecycle dependency or failed-startup behavior. See [installed mechanisms](upstream-and-history.md).

## F2: Failed initialization leaves a procedural blockade

**Observed result; source-established transition defect.**

`goal.ts:1824-1924` prepares a worktree, writes a plan scaffold, and sets `foregroundGoal` before planning startup succeeds. Its catch reports the error without unwinding the in-memory state. `goal.ts:649-704,1648-1673` then blocks modifying-capable tools when the foreground plan lacks its durable task mapping; shells are classified by tool name, not by whether this particular command only inspects state.

In the same session, entries `0a2e501a` and `071894c3` reject inspection and an explicitly authorized prompt-file write. Neither action needed the missing plan lifecycle for safety. The failed start must not be described as having made no changes: setup can already have prepared files and a worktree.

**Important distinction:** raw foreground goals without a linked plan are not universally tool-blocked. The hook returns early when `foregroundGoal.plans` is absent. Their mandatory materialization affects goal bookkeeping/completion, not all ordinary file operations.

## F3: Commands and tools expose different capabilities

**Observed operator handoff; source-established missing entrypoint.**

Session `01a07238-e41b-74ca-be95-2090d77cef77`, entries `3d3aa01e`, `b222415c`, `46af2a9f`, `611f9546`: a conversational request for `/plan-it` produces a draft, `plan_progress draft` rejects absent lifecycle, and the response asks the user to invoke the slash command manually.

`workflow-commands.ts:2606-2697,3150-3217` initializes planning through the command/controller while the tool only transitions existing lifecycle state. Goal startup/status/stop/resume are also command surfaces; progress/completion tools are activated according to state. A useful capability is not agent-accessible merely because a command wrapper exists.

Pi already supplies tools, shared functions, an event bus, session persistence, and queued command dispatch. No generic command executor or new workflow engine is necessary. Session-changing operations genuinely need command context; that does not require another operator turn. Queued dispatch must respect the installed `expandPromptTemplates` option, not merely send slash-command text.

## F4: Objective loss creates room for invented requirements

**Observed altered reconstruction; source-supported contributing context loss.**

Original benchmark objective: first session entry `2b93a4b2`. Attempted preservation: `63f2cee1`. The replacement omitted synthetic-only inputs, dataset sizes, sample counts, cancellation/responsiveness, primary deadlines, and closeout restrictions, and added an integration exception. The write failed, so that attempt did not create an altered prompt file.

`pi/lib/slash-command-echo.ts:31-44` records a TUI-only custom entry. Pi does not include that entry in model context. `goal.ts:510-552,774-813` delivers previews/summaries/hashes and creates a preview-based scaffold; `857-865` writes only that scaffold for an inline objective. The failing startup occurs before the successful planning prompt and goal-state append. The original full text survives in the transcript and in temporary in-memory goal state, but is not reliably available to the next model turn through this failed transition.

Missing context contributes; it does not authorize reconstruction. Recover the exact source or ask when it cannot be recovered. Preserving a prompt means preserving its requirements, not summarizing them into a new specification.

Separate risk: turning acceptance into mandatory 1-8 conditions and independent integration judgments can encourage invented obligations. Source alone does not prove those fields caused this particular rewrite. Existing `do-it.md` already forbids silently strengthening or weakening acceptance and treats reviewer advice as advisory unless it maps to the request, an invariant, or safety.

## F5: Fixed validation policy demonstrably causes operator interruption

**Observed interruption; test/harness and product issues must remain distinct.**

In session `01a071ed-54b9-77e2-a881-7935addaaba0`, entry `0e84b0f7`, the response reports a passing single-lead test, a failing parallel test, and an unrelated type error, then asks permission to continue because the repair limit was reached. Entries `3129a30b`, `2b4b84cd`, `4612b121`, and `fe251b0a` show the extra explanation/authorization exchange.

The parallel assertion compared process-start positions rather than worker identity. The proposed correction used `PI_SUBAGENT_RUN_ID`; entry `f25e04b0` also acknowledges an unexamined difference in saved metadata between launch paths. The former is a harness assumption; the latter requires tracing the product path. Neither justifies blindly changing production code until tests pass.

`pi/AGENTS.md`, testing/orchestration guidance, workflow prompts, and agent definitions impose implementation-first validation and one shared repair/rerun allowance. Commit `65aedd54` propagated this policy. The counter stopped work as designed; it did not improve the initial test's fidelity. The user's earlier desire to reduce test/fix churn explains the policy direction, but does not prove this particular counter is the best mechanism.

Replace arbitrary interruption with evidence-based reassessment within existing authority. Do not promise a universal one-pass implementation or unlimited retries. Preserve explicit live-attempt limits and stop after a failed live mutation according to the existing incident boundary.

## F6: Review state can promote advice into mandatory work

**Current source mechanism; causal contribution beyond selected cases remains uncertain.**

`plan-lifecycle.ts:273-353` requires standard readiness to end with one completed subtractive review, rejects further subject-matter review after it starts, caps subject-matter records, and requires supported findings to be covered. Quick mode removes reviews but retains the lifecycle prerequisite.

A review outcome is not an operator decision. This machinery gives a recorded finding procedural force even when it may be unnecessary for the user's result. A mandatory review to prevent overengineering is itself unnecessary ceremony when no independent review benefit is established.

Related guidance:
- `pi-extension/SKILL.md` says to enforce mandatory behavior in tools/hooks but does not distinguish safety/consistency invariants from preferences or require shared agent access to command capabilities.
- `skills-engineer/SKILL.md` calls for exhaustive completion criteria for every step. Combined with formal planning templates this can expand a simple instruction into a workflow contract.
- Generic subtractive guidance already exists. Adding another general warning would leave these stronger mandates unchanged.

## F7: Guidance and tests preserve inconsistent abstractions

**Source-established drift and coverage gaps.**

- `goal.ts:1877-1882` requests retired planning stages. Current `plan-it.md` retires them.
- The README's task-free foreground-goal description conflicts with `goal_progress materialize_goal` creating a root task (`goal.ts:1985-2002`).
- `goal.test.ts` loads the goal extension independently, mocks worktree setup into the same directory, and does not register the workflow controller. These useful unit tests do not reproduce independent extension APIs or the complete fresh-goal startup path.
- Workflow dispatch tests inspect sent prompts/calls; that alone cannot prove actual queued command dispatch in the installed host.
- `plan-lifecycle.test.ts` explicitly protects review counts/order; those assertions should disappear with the policy, not force its retention.
- `workflow-startup.test.ts:87-172` contains valuable real-files/Git cases: failed setup preserves context and bytes, divergence is refused, and prepared work dispatches once. Preserve those behaviors.

A later regression should reproduce real API identities and actual delivery, not add a test that expects the current missing-controller failure to be acceptable.

## F8: Textual live-attempt bookkeeping affects selection before execution

**Parser behavior established; no observed runtime cap exhaustion in the cited draft.**

`pi/lib/plan-state.ts:121-136,211-229` counts every matching six-column ledger row against the task's attempt cap; it does not require an executed/result-bearing attempt. A matching pending placeholder therefore counts. A matching `rejected` row also affects completion/dependency selection. The initial second-session draft included a pending attempt row, making this a concrete authoring/parser mismatch risk, not proof that a benchmark run actually exhausted its cap.

Do not treat the current benchmark draft as a frozen artifact: separate ongoing work may revise it. Do not introduce a mandatory runtime attestation subsystem merely to fix a placeholder convention. Keep planned checks separate from observed attempts; distinguish an evaluation correctly rejecting a hypothesis from an implementation failing acceptance. Preserve limits explicitly requested by the user or required for live safety.

## F9: Narrow retrieval becomes all-history work

**Observed resource-bound failures and disproportionate tool selection.**

The first session and this investigation encounter approximately 3.37 GB staged input against the analytics 512 MiB limit despite a session-specific request. Exact transcript reads succeed. The first session also uses the all-history usage report (2,416 files) for a session-ID question before reading the ID from the environment.

Keep the resource bound; select relevant input before staging. The all-history tool choice was not required by the runtime. This is a supporting efficiency issue, not the main goal-startup cause or evidence for replacing DuckDB.

## Counterevidence and limits

- Direct source/documentation research in `01a071ed...`, entries `f3bdbb94` and `369ae81f`, produces bounded recommendations and separates confirmed findings from missing stderr/live verification without starting a new planning lifecycle. It is a useful direct-research example, not proof the entire session was successful.
- Historical July operator objections to plan linting and commit confirmation demonstrate recurring dissatisfaction, not proof those exact old mechanisms still exist. `497fad73` and `1dbc1a95` removed substantial machinery.
- No frequency, cost saving, model ranking, or general causal estimate is claimed from this selected sample.
- Read-only worker suggestions were independently qualified; see [integration notes](runtime-and-tests.md). No recommendation to remove a genuine safety guard is accepted solely on a worker's summary.
