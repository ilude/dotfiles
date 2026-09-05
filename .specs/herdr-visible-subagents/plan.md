---
created: 2026-08-31
updated: 2026-09-05
status: ready
---

# Add visible Herdr execution surfaces for governed Pi subagents and background terminals

## Objective

Pi must optionally host governed subagents and managed background terminals in visible Herdr panes while preserving their separate lifecycle authorities. The primary orchestrator and Team Lead layouts must expose active child terminals without making terminal state authoritative for work completion. Long-lived servers, watchers, and concurrent shell work may run in owned Herdr panes while the existing `BackgroundTerminalManager` remains authoritative for process state, bounded output, completion delivery, `/ps`, and `bg_kill`.

## Reconciled execution scope

The owned worktree `.worktrees/herdr-visible-subagents` on `workflow/herdr-visible-subagents` is the implementation authority. Its T1-T7 completion, protocol-5 source, pilot evidence, live-attempt history, and later scope decisions are preserved. The primary-only revision in `478b0869` inspected the wrong checkout: its T2 reopening, new T12-T16 live pilots, restored visible Team Lead status wall, and reset live limits are withdrawn. This reconciliation does not discard implementation or rerun completed work.

Current scope overrides superseded historical requirements below:

- At most four active visible children; T7's rejection is terminal. Eight-pane geometry may remain for idle display. No active eight-child rerun.
- Team Lead orchestration remains headless, with at most four root-selected visible descendants and headless overflow. The lead pane/status wall and same-pane lead continuation are deferred. Preserve session continuation and surface-fingerprint rejection without creating a lead pane.
- T8b is the previously authorized single replacement pilot: one in-bound edit plus cleanup. T9b is optional and skipped without further authorization. T10b is one stdout/stderr natural-exit pilot; reload, kill, retained failure, and manual-close permutations are deterministic coverage, not additional live attempts.
- Current read authority includes `log_analytics`, `web_search`, and `web_fetch` in addition to the original four file-reading tools. The owned source predates this update. T8a reconciles that authority and current affinity/provider constraints with the existing surface; it does not reopen T2-T7 or rerun their unchanged evidence.
- Finish remaining implementation, fixture authoring, helper integration, contracts, and changelog before one root-owned final validation batch. T11 runs the deterministic batch, then the already bounded T8b/T10b pilots run sequentially. No per-task typecheck/test loop or new review round.
- This plan is the execution ledger. Resume the existing ownership record; do not create a second worktree or task mirror. Preserve current worktree changes and verify prepared-plan identity across session handoff.

References: `pi/skills/workflow/do-it.md`, `pi/skills/pi-extension/references/contracts/workflow-lifecycle.md`, `subagents-and-tasks.md`, `background-terminals.md`, and `pi/skills/herdr/references/automation.md` in the primary repository contain the current workflow contracts. Runtime integration belongs in the owned worktree. Earlier experiment counts describe recorded runs, not newly observed validation.

## Completion Evidence

- Evidence: Governed read-only and modifying children, Team Lead packages, and managed background terminals run on explicit Herdr surfaces while their existing managers remain authoritative; accepted layouts, lifecycle behavior, bounded result or output delivery, reload policy, authority controls, and owned-resource cleanup pass focused and live checks.
- Fails when: Headless defaults change, terminal state or transcript text becomes authoritative, child or background authority expands, process capacity releases before proven settlement, reload or cancellation loses owned state, output/result delivery duplicates or disappears, or any unowned Herdr resource is changed.
- A read-only pane-hosted Pi child has the same closed tool authority as its headless equivalent, registers with the authenticated broker, and returns a nonblank validated deliverable without transcript scraping.
- Foreground and background Herdr runs compose through the existing run manager with process state, process outcome, and deliverable outcome remaining separate.
- Cancellation, reload, pane closure, and Herdr failure settle without closing unowned panes or bypassing Team Lead cutoff and reconciliation bounds.
- The primary layout shows one through four direct workers above the primary orchestrator; the fifth worker creates one dedicated tab containing all active direct workers, up to eight.
- A Team Lead remains headless and may govern at most four root-selected visible descendants; additional eligible descendants remain headless. The lead-pane status wall is deferred.
- `prefix+z` allows focused interaction and restores the prior layout without changing broker identity or authority.
- `bg_start` can explicitly host a managed server or watcher in an owned Herdr pane while preserving damage-control preflight, bounded stdout/stderr capture, `/ps`, natural completion, `bg_kill`, reload survival, and process-tree cleanup without transcript scraping.
- Focused tests, live Herdr checks, Pi typecheck, and `git diff --check` pass.

## Boundaries

### In scope

- An optional Herdr execution surface behind the existing subagent run manager.
- Windows `pane run` plus recognized-agent detection as the Pi launch fallback.
- Focus-isolated read-only capability checks and a production read-only pilot before broader authority is enabled.
- Owned pane and tab lifecycle, layout, reload cancellation, and surface telemetry.
- Read-only production pilot, followed by modifying agents and Team Leads only after their gates pass.
- Clear operator labels for read-only, modifying, and Team Lead tools.
- An optional Herdr execution surface for `bg_start` and corresponding owned-pane lifecycle for `bg_kill`, natural completion, manual pane closure, reload, and failure.
- A manager-owned output and exit relay for pane-hosted background commands; terminal transcript scraping is never an output or completion source.
- Existing API names are retained; `subagent_inspect` and `subagent_modify` aliases are not pursued.

### Out of scope for the first production slice

- Installing another Herdr orchestration package.
- Replacing the existing broker, subagent run manager, or `BackgroundTerminalManager`.
- Sharing subagent broker permits, completion transport, run-manager state, or visible-slot accounting with background terminals.
- Transcript scraping as canonical result or background-terminal output delivery.
- Changing the broker's default active-descendant ceiling of eight or its configurable range of 1 through 16.
- Automatic retries or deadline extension.
- Broker-based child clarification; visible children use their existing direct Pi UI prompts and Herdr blocked-state reporting in this plan.
- Visible modifying agents, visible Team Leads, continuation changes, or public tool renaming before the read-only pilot passes.
- Editing the archived `.specs/archive/pi-herdr-full-integration/plan.md` or `.specs/archive/reliable-teamlead-settlement/plan.md`.

### Preserve

- Headless execution remains the default.
- Herdr execution is explicit and fails when the requested surface is unavailable.
- The broker authenticates child identity and transports admission, cancellation, and run-bound completion inputs; the existing run manager exclusively commits terminal run outcomes and process-permit settlement.
- Process settlement never implies deliverable completion. An accepted child completion may establish the deliverable before a persistent visible Pi process exits. The process stops through a server-independent bounded termination path before its permit releases; visual pane closure and reflow may occur later.
- Empty required deliverables fail.
- Read-only agents cannot modify files, use raw shell tools, or delegate.
- Modifying authority remains bounded by the existing enforced boundary.
- Dependency gates and active mutation owners remain foreground unless explicitly detached.
- Required read targets validate existing authority before run registration, broker permit acquisition, and process start; they never grant authority.
- Team Lead admission cutoff, reconciliation reserve, recursive cancellation, deterministic deliverable reduction, and consume-once continuation remain authoritative.
- Eight is the default active-descendant scheduler ceiling, not a fixed layout or package ceiling; `PI_SUBAGENT_MAX_ACTIVE_DESCENDANTS` may retain its existing configured range from 1 through 16.
- Only panes and tabs created and recorded by the current run may be closed automatically.
- Direct operator interaction is bounded steering and never expands child authority.
- The installed Herdr integration remains the sole Herdr lifecycle reporter.
- `BackgroundTerminalManager` remains the sole authority for managed background process lifecycle, bounded stdout/stderr retention, completion delivery, `/ps`, and `bg_kill`; it shares only low-level Herdr ownership primitives and process-tree termination with subagents.
- Existing `bg_start` damage-control analysis occurs before manager registration, pane creation, or process start. Headless background execution remains the default, and an explicit unavailable Herdr surface fails without fallback.
- Background terminals remain process-local, survive session replacement within the Pi process, and terminate on Pi process exit under the existing contract.

## Accepted workflow decisions

1. The first implementation retains `subagent_read`, `subagent_write`, and `subagent_teamlead` as API names.
2. Operator labels become `Read-only subagent`, `Modifying subagent`, and `Team Lead package`.
3. A later naming migration introduces `subagent_inspect` and `subagent_modify` with temporary compatibility aliases. `subagent_teamlead` retains its name.
4. `surface` applies to the requested child only. Visible descendant policy is explicit and root-controlled.
5. Herdr remains opt-in and headless remains the default.
6. Successful panes close only after broker result capture. Routine parent-cancelled panes close after bounded process settlement. Failed panes remain visible after settlement; actively blocked panes remain visible while the nonterminal run continues.
7. Active blocked runs retain their controller and process permit while awaiting steering, completion, cancellation, or deadline. Blocked is not a terminal outcome: completion may still succeed, while cancellation or deadline settles the run as cancelled or timed out. Settled failed surfaces consume only visible capacity until the operator closes them. Cancelled panes do not remain merely for review of work the parent no longer needs.
8. `/reload` does not preserve active visible runs. It cancels them through the normal bounded path, closes their owned panes after process settlement, and never recreates them automatically.
9. Layout management acts only on owned-pane start, owned-pane closure, or threshold migration. It does not continuously force an ideal grid.
10. `prefix+z` is the supported focused-interaction mechanism. No pane promotion registry is required.
11. Operator interaction is exceptional steering: zoom the child, nudge it or answer a blocker in the existing session, then let it continue normally. Steering remains attached to the same run, task, authority, deadline, and validation requirements.
12. The operator never has to mark a child complete. The child completes normally by sending its run-bound result; the run manager settles it and the parent integrates the result.
13. Tool-name migration remains separate from the first Herdr implementation.
14. A layout displays at most eight pane-hosted descendants. Explicit per-item Herdr requests beyond visible capacity fail before spawn; a Team Lead's root-controlled descendant-visibility policy means "up to eight visible", with additional scheduler-admitted descendants remaining headless.
15. Visible capacity and broker scheduling capacity are separate contracts. Retained failed panes consume visible capacity but do not consume a settled process permit. Visible slots are reserved atomically before pane or process creation and released on partial-launch cleanup, successful or cancelled cleanup, or explicit cleanup of a retained failed pane.
16. Team Lead continuation preserves the original execution surface. A visible eligible partial resumes in its existing pane and saved session when available; a headless eligible partial remains headless. Continuation remains parent-controlled and requires no operator approval.
17. `bg_start` receives `surface?: "headless" | "herdr"`; headless remains the compatibility default and explicit Herdr use requires a valid Herdr environment.
18. A pane-hosted background command is still a `BackgroundTerminalManager` entry, not a subagent run. It does not acquire a broker permit, register a subagent completion handler, consume subagent visible capacity, or participate in Team Lead layouts.
19. The actual managed command runs in the owned pane. A manager-owned relay carries stdout, stderr, and exit state into the existing bounded capture and completion path; Herdr transcript and agent state are never parsed as canonical output or settlement.
20. Natural success and `bg_kill` close the owned pane after process-tree settlement. A failed command may retain its pane for diagnosis without retaining an active process; explicit cleanup closes only the recorded owned pane. Manual pane closure requests termination only for the exact active managed terminal. Herdr loss preserves manager truth and uses the independent PID-tree path.

## Layout contract

### Primary orchestrator with one through four visible direct children

```text
+-----------+-----------+-----------+-----------+
| Agent 1   | Agent 2   | Agent 3   | Agent 4   | top third
+-----------+-----------+-----------+-----------+
|                                               |
| Primary orchestrator                          | bottom two thirds
|                                               |
+-----------------------------------------------+
```

- Panes are created only when a child starts.
- Children fill the top band from left to right.
- Creation and layout changes do not steal focus.
- When the final top-band child closes and no retained pane remains, the primary pane returns to full-tab size.

### Threshold migration at worker five

When a fifth direct child starts:

1. Create one owned `Subagents` tab without focusing it.
2. Move all active direct-child panes into that tab when doing so does not disturb a zoomed pane.
3. Arrange up to eight direct children in two rows of four.
4. Restore the primary orchestrator to its full tab.
5. Keep subsequent direct children in that tab until it becomes empty.
6. Do not move workers back merely because the active count falls below five.
7. Remove the owned tab only when all owned panes have closed and no retained failure or blocked pane remains.

```text
+-----------+-----------+-----------+-----------+
| Agent 1   | Agent 2   | Agent 3   | Agent 4   |
+-----------+-----------+-----------+-----------+
| Agent 5   | Agent 6   | Agent 7   | Agent 8   |
+-----------+-----------+-----------+-----------+
```

### Deferred visible Team Lead status wall

The diagram below is historical design evidence, not remaining implementation scope. T9a instead keeps the Team Lead headless with at most four visible leaves. The former design assigned one dedicated owned tab:

```text
+-----------------------------------------------+
| Team Lead                                     |
+-----------+-----------+-----------+-----------+
| Worker 1  | Worker 2  | Worker 3  | Worker 4  |
+-----------+-----------+-----------+-----------+
| Worker 5  | Worker 6  | Worker 7  | Worker 8  |
+-----------+-----------+-----------+-----------+
```

- The label is `Team Lead`, not `Parent`; the root Pi session remains the package owner.
- The tab is created only when Team Lead visibility is explicitly selected.
- Descendant visibility is separately selected by the root.
- Failed and blocked leaf panes remain until explicit cleanup and count against the eight visible slots.
- The tab remains while any retained pane exists.
- The layout never changes the broker's configured active-descendant ceiling. Additional scheduler-admitted descendants remain headless under the package visibility policy; an explicit per-item Herdr request fails when no visible slot is available.

### Visible managed background terminals

- The first explicit `surface: "herdr"` background terminal creates one owned pane without changing focus. Visible background terminals use a dedicated owned `Background terminals` tab rather than subagent or Team Lead layouts.
- Additional visible background terminals enter that tab under the existing manager's active/tracked capacity bounds. Layout changes occur only on owned start, owned closure, or explicit retained-pane cleanup and never change manager capacity.
- `prefix+z` supports direct operator interaction with the actual server or watcher process. Such interaction does not alter damage-control history, process ownership, completion delivery, or cleanup authority.
- When the final owned background pane closes and no retained failure remains, remove only the owned background tab.
- Zoom may defer visual closure or reflow, but it never defers process-tree termination, exit proof, manager settlement, or completion delivery.

## Open questions and experimental evidence

Every question records direct evidence in this plan before its blocking production phase begins. An unresolved blocking question stops that phase. A nonblocking question may be deferred only with a stated reason and preserved fallback behavior.

### Q1: Restricted TUI loadout

- Type: Experiment
- Status: Resolved
- Assumption: A pane-hosted Pi TUI can receive the same closed authority as a headless read child while loading the required Herdr lifecycle integration.
- Evidence required: Captured callable tool schema, one successful allowed read, and absence of edit, raw shell, and delegation tools.
- Blocks: Read-only production pilot.
- Resolution: A live Herdr-hosted Pi TUI launched with `--tools read,grep,find,ls --no-skills` exposed exactly `find`, `grep`, `ls`, and `read` in the provider request and successfully read this plan. Edit, write, raw shell, and delegation tools were absent.
- Plan impact: Preserve the existing closed positive allowlist when constructing the TUI launch. Tool authority is feasible and no broader interactive tool set is required.

### Q2: Authenticated broker settlement

- Type: Experiment
- Status: Resolved - assumption rejected
- Assumption: A pane-hosted child can register and deliver a nonblank result through the existing authenticated broker without terminal transcript parsing.
- Evidence required: Inspect the existing broker protocol and prove or reject a native completion path.
- Blocks: Read-only production pilot.
- Resolution: The current tree broker authenticates identity and supports handshake, ping, acquire, register, release, and cancel, but has no deliverable frame. A temporary broker extension carried one live result, proving feasibility only by changing the protocol; that experimental code and worktree were removed.
- Plan impact: Production work must first choose and review one authenticated bounded result channel. Transcript scraping remains rejected. No broker change is implied by the layout experiments.

### Q3: Single lifecycle ownership

- Type: Design decision followed by implementation experiment
- Status: Design resolved; implementation unproved
- Assumption: The existing run manager can supervise a Herdr-hosted process while Herdr state remains optional process evidence rather than a second run state machine.
- Evidence required: One run showing that an explicit run-bound child result settles the assignment exactly once, a retained TUI may remain idle afterward, operator steering stays on the same run, and Herdr idle or done alone cannot force completion.
- Blocks: Execution-surface integration.
- Resolution: The existing broker will gain one bounded run-bound completion message. The broker authenticates and transports completion and cancellation inputs but never commits a terminal run outcome. The run manager owns one atomic terminal transition: the first valid completion, cancellation, deadline, or failure input that commits wins, and every later terminal input is rejected idempotently. The parent separately decides how the accepted result affects the larger objective. The operator normally observes only, may use `prefix+z` to nudge the same session or answer a blocker, and never manually marks completion.
- Plan impact: Keep the broker as transport and the run manager as the sole settlement owner. Accept the deliverable without requiring the persistent Pi TUI to exit, then stop its process through bounded cleanup before releasing its permit; visual pane closure may be deferred independently. A Team Lead pane may remain idle only for its bounded eligible-continuation decision. Track retained failed surfaces separately from completed runs. Add no alternate watcher, transcript parser, or operator completion workflow.

### Q4: Bounded cancellation

- Type: Design decision followed by implementation experiment
- Status: Design resolved; implementation unproved
- Assumption: Startup, active-turn, blocked-prompt, pane-closure, parent-shutdown, and Team Lead cutoff cancellation settle within existing bounds.
- Evidence required: Timed startup and active cancellation cases plus one bounded Team Lead tree covering admission cutoff, queued-descendant removal, active-descendant cancellation, reconciliation reserve, broker settlement, and owned-pane cleanup.
- Blocks: Modifying agents and Team Leads.
- Resolution: Cancellation is an input to the run manager's atomic terminal transition. If it wins, cancellation first requests a clean stop, then uses the existing bounded server-independent PID/process-tree termination path if the child does not stop. Completion that committed first remains successful; completion received after cancellation loses is rejected idempotently. Governed capacity releases only after process settlement. Routine parent-cancelled panes close automatically because the parent has already decided their work is unnecessary. Failed panes remain visible for diagnosis; an actively blocked run remains nonterminal and governed until completion, cancellation, deadline, or failure. Manually closing an active nonterminal pane requests cancellation and the already-closed pane is not recreated.
- Plan impact: Add no cancellation-specific review workflow or retained-pane clutter. Preserve existing deadline, cutoff, queued-removal, reconciliation, and recursive-cancellation behavior; verify the Herdr adapter only closes owned panes and cannot convert pane closure into success. If the server-independent process path cannot prove exit, retain the process permit and fail the rollout gate rather than infer settlement.

### Q5: Reload behavior

- Type: Design decision followed by implementation experiment
- Status: Design resolved; implementation unproved
- Assumption: `/reload` can terminate active visible runs cleanly without duplicate settlement, orphaned owned panes, or effects on unrelated Herdr resources.
- Evidence required: Prove the reload hook runs while the current controller and ownership state remain available, or prove the replacement extension can safely resume cleanup from the persisted snapshot. Then show reload with one active visible child produces one cancellation, bounded process settlement, one owned-pane cleanup, rejection of late completion, and no change to an unowned pane.
- Blocks: Read-only production pilot.
- Resolution: Live rebinding is unnecessary for the expected workflow. `/reload` cancels active visible runs through the normal Q4 path, closes their owned panes after process settlement, rejects late results, and does not recreate or resume them. The operator should avoid reload while visible work is active, but accidental reload has explicit cleanup behavior.
- Plan impact: Remove persistent live-run rebinding and duplicate-pane recovery from the implementation. T4 must choose and prove one reload ordering: cleanup completes before unload, or cleanup resumes from snapshots after reload. Reuse bounded cancellation and owned-resource cleanup, and report which visible runs reload interrupted.

### Q6: Windows launch fidelity

- Type: Experiment
- Status: Resolved at the launcher boundary
- Assumption: `herdr pane run` plus auto-detection preserves the resolved model, effort, skills, cwd, session, and authority launch configuration.
- Evidence required: Focus-isolated child output and saved-session metadata matching explicit launch inputs without global settings mutation.
- Blocks: Read-only production pilot.
- Resolution: In dedicated unfocused workspace `w12`, `pane run` launched and auto-detected Pi in the requested repository cwd with `openai-codex/gpt-5.6-sol`, low thinking, `--no-skills`, and exactly `find`, `grep`, `ls`, and `read`. The child read this plan and returned `Q6_SESSION_OK`. Its 39,564-byte persistent session contained the matching model and thinking entries plus assistant messages. The active operator pane remained `wX:p7` before, during, and after the experiment. The owned workspace and scratch session were removed. Production role identity and full run-manager fingerprint composition remain part of Q3 rather than the launcher boundary.
- Plan impact: Retain the Windows `pane run` fallback with explicit model, thinking, skills, tools, cwd, session, and child environment. Require focus-before/focus-after assertions in live adapter validation.

### Q7: Team Lead continuation surface

- Type: Design decision followed by implementation experiment
- Status: Design resolved; implementation unproved
- Assumption: A saved eligible partial Team Lead session can continue on a Herdr surface under the existing consume-once identity and authority checks.
- Evidence required: One eligible visible partial continuing in the same pane and session, one successful completion, second-use rejection, expiry and cancellation rejection, and authority-broadening rejection without session-path exposure.
- Blocks: Visible Team Lead continuation.
- Resolution: Preserve existing continuation semantics. The parent decides whether a partial result is sufficient; when continuation is needed, the consume-once identifier resumes the same Team Lead task, saved session, authority, model, effort, role, and execution surface under a new bounded deadline. A visible Team Lead resumes in its existing pane when available; headless remains headless. Completed leaves are not rerun automatically, and no operator approval or manual completion action is added.
- Plan impact: Reuse the existing continuation path and add Herdr pane identity to its execution fingerprint and ownership checks. Retain an eligible partial Team Lead pane only for the bounded continuation decision; close it when continuation is declined or expires.

### Q8: Primary top-band layout

- Type: Experiment
- Status: Resolved
- Assumption: Herdr can construct the top one-third worker band above the existing primary pane without replacing the root process.
- Evidence required: Live one-through-four worker layout with exact geometry and stable primary pane identity.
- Blocks: Primary orchestrator layout rollout.
- Resolution: A live layout produced four equal top panes at approximately 71x25 and the unchanged primary pane at 285x51 in a 285x76 area. Ratios `0.333` vertically and `0.25`, `0.333333`, `0.5` horizontally produced equal quarters.
- Plan impact: Construct the worker band through deterministic binary splits and one initial pane swap so the existing primary process occupies the bottom two-thirds.

### Q9: Fifth-worker migration

- Type: Experiment
- Status: Resolved at the Herdr process boundary
- Assumption: Herdr can move all active direct-worker panes into one new tab without restarting processes or changing pane IDs.
- Evidence required: Unzoomed pane migration with stable pane and foreground process identity plus primary-tab restoration.
- Blocks: Eight-worker layout rollout.
- Resolution: Four live shell panes moved to one new tab without changing pane IDs and the primary pane returned to full-tab size. A separate focus-isolated experiment moved active Pi pane `w14:p2` between tabs; its Node PID remained `41368`, shell PID remained `47088`, and pane ID remained `w14:p2`. The operator pane remained `wX:p7`, and owned workspace `w14` was removed. Broker delivery continuity is part of Q3 rather than pane movement.
- Plan impact: Pane and process continuity across unzoomed moves is proven. Production verification must still inspect resulting topology after every move because Q10 showed a successful command can be a no-op while zoomed.

### Q10: Zoom during migration

- Type: Experiment
- Status: Resolved
- Assumption: Threshold migration must defer while an affected pane is zoomed, then complete after zoom restoration.
- Evidence required: Move attempts while zoomed and unzoomed with topology inspection.
- Blocks: Eight-worker layout rollout.
- Fallback: Put worker five in the new tab and defer migration of existing panes until the affected tab is no longer zoomed.
- Resolution: While the source tab was zoomed, Herdr returned successful move responses but left the panes and topology unchanged. The same moves succeeded immediately after unzooming.
- Plan impact: Detect zoom before migration, defer all source-tab moves while zoomed, and verify resulting tab and pane topology after every move.

### Q11: Closure and grid restoration

- Type: Experiment
- Status: Resolved - assumption rejected while zoomed
- Assumption: Closing successful panes preserves usable geometry and does not disturb another pane's zoom state.
- Evidence required: Close one sibling while another pane is zoomed and inspect topology before and after.
- Blocks: Automatic successful-pane cleanup.
- Resolution: Closing a sibling while another pane was zoomed automatically cleared zoom and reflowed the underlying layout. Unzoom after the close was therefore already a no-op.
- Plan impact: Process termination and permit release remain bounded and do not wait for zoom. Defer only visual pane closure and layout reflow while any pane in the tab is zoomed; resume that visual cleanup after the operator restores the normal layout.

### Q12: Team Lead status-wall usability

- Type: Experiment and operator acceptance
- Status: Resolved
- Assumption: A Team Lead and eight leaves remain identifiable in one tab even when detailed interaction requires zoom.
- Evidence required: Live status-wall geometry and operator acceptance that panes are status surfaces rather than full reading surfaces.
- Blocks: Visible Team Lead layout rollout.
- Resolution: The earlier eight-pane status-wall geometry at the current 285x76 area gave the Team Lead 285x25 and each of eight worker panes approximately 71x25. The layout was mechanically correct and panes remained identifiable. Smaller terminal sizes were not tested; the operator accepted that any visible output improves on none and detailed review uses `prefix+z`.
- Plan impact: The status-wall layout is deferred; supported visible topology is at most four active workers. Do not block on arbitrary smaller-size targets, but preserve zoom and avoid focus-changing automated zoom tests.

### Q13: Manual pane closure

- Type: Design decision followed by implementation experiment
- Status: Design resolved; implementation unproved
- Assumption: Closing an active child pane produces a deterministic cancelled run and never a successful deliverable.
- Evidence required: Manual close during startup and active work, with one cancellation, no accepted late result, and no duplicate cleanup.
- Blocks: Read-only production pilot.
- Resolution: Manual closure is an intentional operator stop only while the owning run remains nonterminal. It submits cancellation to the same atomic terminal transition, releases governed capacity after process settlement, rejects completion only when cancellation committed first, and does not recreate the already-closed pane. Pane disappearance after completion committed is cleanup evidence and cannot replace success.
- Plan impact: Treat pane disappearance as cancellation input only for a nonterminal run that owns that exact pane. It cannot imply success, replace a committed outcome, or trigger cleanup of another resource.

### Q14: Herdr server loss

- Type: Design decision followed by adapter validation
- Status: Design resolved; implementation unproved
- Assumption: Loss of the Herdr command or server boundary fails active surface operations explicitly while preserving broker and task truth.
- Evidence required: Adapter-level interruption tests; a live interruption only in an isolated Herdr server boundary that cannot affect operator work.
- Blocks: Production rollout.
- Resolution: Do not fall back silently to headless execution. Fail new visible launches explicitly. Every child launch retains a server-independent process handle and PID/process-tree identity. If Herdr supervision is lost, submit bounded cancellation to the run manager and use that independent process path for termination and settlement; preserve canonical task state and owned-resource metadata for later visual cleanup, and never act on unrelated panes.
- Plan impact: Make Herdr unavailability an execution-surface failure, not a broker reset. If the independent process path cannot prove exit, keep the permit held and fail the rollout gate explicitly. Do not stop the operator's shared Herdr server merely to validate this policy.

### Q15: Retained pane lifecycle

- Type: Design decision followed by implementation experiment
- Status: Design resolved; implementation unproved
- Assumption: Failed panes can remain visible without retaining active run-manager controllers or preventing later explicit cleanup.
- Evidence required: A retained failed pane after logical settlement, detached metadata, released governed capacity, and explicit owned-pane cleanup.
- Blocks: Failure retention rollout.
- Resolution: Separate governed run state from visual resource state. An actively blocked run is nonterminal and still holds its broker permit, controller, cancellation ownership, deadline, and running-task state so the operator may help it continue. It leaves that state only through successful completion, cancellation, deadline, or failure. After failure settles and process exit is proven, its retained pane holds none of those execution resources and consumes only visible capacity until the operator closes it or invokes owned-resource cleanup.
- Plan impact: Distinguish active blocked runs from retained failed surfaces. Represent only the latter as owned surface records detached from live runs; closing one performs visual cleanup and cannot alter the already-settled task outcome.

### Q16: Performance and Windows process churn

- Type: Experiment
- Status: Resolved; more than four active visible children rejected
- Assumption: One, four, and eight interactive TUI children remain operationally acceptable relative to headless children.
- Evidence required: Startup latency, memory, idle and active CPU, cancellation latency, parent responsiveness, and Windows process-churn diagnostics when indicated.
- Blocks: Enabling more than four visible children by default.
- Resolution: Idle evidence showed eight Pi TUIs near 1 GB aggregate memory with negligible idle CPU. The completed active collector in `.tmp/t7-measurements.json` measured one visible child at 308 MB working set, 0.80-second parent response, and 7.10-second cancellation; four at 1.13 GB, 2.19 seconds, and 24.53 seconds; and eight at 2.18 GB, 9.56 seconds, and 46.98 seconds. The eight-child parent probe exceeded the 5-second responsiveness bound. All scenarios used the isolated named session and removed owned resources. No Windows churn diagnostic was triggered because the run produced no qualifying churn or event evidence.
- Plan impact: Keep at most four active visible children as the supported default and direct excess eligible work to the existing headless path. Eight-pane layout support may remain for idle status display, but T9 and later live fixtures must not exceed four active visible children. T7 is complete and may not be rerun without explicit operator authorization recorded in the live attempt ledger.

### Q17: Surface field placement

- Type: Design decision informed by implementation
- Status: Resolved
- Decision: `surface` is per item so mixed batches remain possible. Default is `headless`.
- Reopen when: Contract normalization or run composition cannot preserve one surface per item without duplicate execution paths.
- Resolution: Use per-item `surface?: "headless" | "herdr"` in the read-only pilot.
- Plan impact: Modern adapter normalizes the field before run registration.

### Q18: Visible descendant policy

- Type: Design decision informed by implementation
- Status: Resolved
- Decision: Visibility does not implicitly propagate. A root-controlled descendant surface policy is required for visible Team Lead leaves and means up to eight visible descendants; additional scheduler-admitted descendants remain headless. Explicit per-item Herdr requests fail before spawn when visible capacity is exhausted.
- Reopen when: Authenticated tree context cannot propagate display ownership without granting children layout authority, or experiments show that bounded headless overflow cannot preserve package result composition.
- Resolution: Use authenticated root-owned layout context and keep visible admission separate from broker process permits.
- Plan impact: The Team Lead feasibility gate must prove both headless overflow and explicit visible-capacity rejection before production rollout.

### Q19: Continuation fingerprint membership

- Type: Design decision informed by Q7
- Status: Resolved
- Assumption: Surface is not authority, but changing between TUI and headless launch modes changes process ownership, result transport, and cleanup behavior.
- Evidence required: Contract comparison between the two launch modes.
- Blocks: Visible Team Lead continuation.
- Resolution: Include execution surface in the continuation fingerprint. Visible continuation stays visible and headless continuation stays headless. No cross-surface continuation is required by the accepted workflow.
- Plan impact: Reject continuation when the requested surface differs from the partial attempt. This removes pane creation or teardown from continuation and keeps session, transport, and ownership behavior stable.

### Q20: Persistent ownership metadata

- Type: Design decision followed by implementation validation
- Status: Design resolved; implementation unproved
- Assumption: Existing run-manager state can retain the minimum pane and tab ownership needed for active-run cleanup without introducing a second registry.
- Evidence required: Field-level ownership inventory, atomic visible-slot reservation behavior, reload-hook ordering, and Q5 reload-cancellation evidence after an adapter exists.
- Blocks: Read-only production pilot.
- Resolution: `SubagentRunSnapshot` already retains logical workspace identity, PID, session path, run identity, parent identity, status, outcomes, and execution fingerprint. It does not currently retain execution surface, Herdr workspace ID, tab ID, pane ID, owned-resource flags, layout group, or cleanup/retention state. These fields are required for active-run cleanup and retained-pane ownership, not live reload rebinding.
- Plan impact: Extend the existing snapshot rather than create a second registry. The minimum additional surface record is `surface`, Herdr workspace/tab/pane IDs, explicit ownership for each resource, layout group or package identity, and cleanup/retention state. Keep Herdr agent status advisory and do not duplicate canonical process or deliverable state.

### Q21: Background-terminal output and exit relay

- Type: Design decision followed by implementation experiment
- Status: Design resolved; implementation unproved
- Assumption: A command running in a Herdr pane can preserve the existing manager-owned bounded stdout/stderr and completion contracts without transcript scraping.
- Evidence required: One pane-hosted command with distinguishable stdout and stderr, output exceeding the in-memory bound and spilling through the existing capped log path, one natural exit, and no dependency on pane transcript text or Herdr lifecycle state.
- Blocks: Visible background-terminal pilot.
- Resolution: Launch the actual command through a small manager-owned relay in the pane. The relay forwards stdout and stderr through an authenticated, size-bounded process-local channel into the existing `BackgroundTerminalManager` capture and reports the real exit status. The manager records the process/PID tree independently and remains the only settlement owner.
- Plan impact: Reuse existing bounded buffers, spill files, completion formatting, and process-tree cleanup. Add no second output store, transcript parser, background run manager, or subagent broker dependency. Missing or malformed relay state fails the visible start or active run explicitly rather than inventing output or success.

### Q22: Background-terminal pane and reload lifecycle

- Type: Design decision followed by implementation validation
- Status: Design resolved; implementation unproved
- Assumption: Owned background panes can survive `/reload`, close deterministically on success or `bg_kill`, retain failure for diagnosis, and react safely to manual closure or Herdr loss.
- Evidence required: Reload with one active visible server preserves one manager entry and owned-pane identity; natural success and `bg_kill` settle once before owned closure; manual exact-pane closure terminates the active process; retained failure releases process resources but remains explicitly cleanable; Herdr loss preserves manager truth and affects no unowned pane.
- Blocks: Visible background-terminal rollout.
- Resolution: Store surface ownership on the existing process-global manager entry. Session replacement reattaches handlers to that entry rather than cancelling it. Pane disappearance is termination input only for the exact active entry; after settlement it is visual evidence only. Herdr loss never implies process exit and uses the server-independent PID-tree path.
- Plan impact: Background reload semantics intentionally differ from visible subagents: managed terminals survive session replacement under their existing contract. Cleanup closes only recorded owned panes/tabs, and failure to prove process exit retains manager and ownership state.

## Limited experiment protocol

- Do not create a worktree or modify production code merely to answer a Herdr capability or layout question.
- Use a dedicated `hvs-experiment` workspace in an isolated named headless Herdr session, never the operator's interactive session or active workspace.
- Live validation must not transiently or finally change the operator's focused workspace, tab, pane, or any other interactive-session resource. Validate against the isolated session's IDs only.
- Use uniquely named `hvs-` workspaces, tabs, panes, agents, and session files.
- Pass `--no-focus` for every supported create, split, and move operation.
- Do not automate zoom or another focus-sensitive operation without explicit operator permission.
- Record every owned Herdr workspace, pane, and tab ID before launch.
- Close successful experimental resources after evidence capture and close only owned resources.
- Stop at the first unexpected focus change, live-state mutation, or need to modify the broker or run manager; record the unanswered boundary instead of expanding the experiment.
- Store expected large output in gitignored `.tmp/` or an OS temporary directory.
- Update the relevant question's Status, Resolution, and Plan impact immediately after each experiment.

### Live attempt policy

- Each remaining live-validation task retains its recorded attempt cap and authorization; it runs only after the single T11 deterministic validation batch passes.
- A live evaluation has three terminal outcomes: supported, rejected by valid threshold evidence, or blocked because valid evidence could not be produced. Rejection completes an evaluation task; it is not an implementation defect to repair.
- After any terminal outcome, clean only exact owned resources and stop. Cleanup success does not authorize another attempt.
- Retries, raised timeouts, expanded workloads, changed thresholds, or replacement fixtures require explicit operator authorization recorded in this plan before execution.
- Use only the isolated named headless Herdr session. Never query, focus, create, move, close, or otherwise mutate an interactive-session resource.
- Subsequent live packages may use at most four active visible children and must run sequentially. Eight-child layouts may remain available for idle status display, but eight active visible children are not a supported default.
- Before each live scenario, record its exact target and command, why existing evidence is insufficient, resource ceiling, timeout owner, cleanup boundary, and terminal outcomes. Reuse that preflight within the unchanged scenario; do not create a per-command paperwork loop.
- Separate implementation, live evaluation, and evidence interpretation. A changed implementation invalidates prior live evidence only when it changes the contract that evidence exercised.

## Live attempt ledger

| Task | Attempt | Preconditions | Result | Cleanup | Disposition |
| --- | ---: | --- | --- | --- | --- |
| T7 | 1 | Focused Herdr surface/layout tests and Pi typecheck passed | Four active visible children remained within the 5-second parent-response bound; eight reached 9.56 seconds | Isolated workspace and owned processes removed | Reject more than four active visible children by default; no T7 rerun |
| T8 (original combined fixture) | 1 | Schema, adapter, launcher-authority tests and Pi typecheck passed | Fixture-blocked: the model-dependent combined mutation/escape scenario produced no in-bound edit and no observable escape attempt; this does not establish a product failure | Owned isolated workspace closed by the outer trap; three exact task-created temporary directories remain because damage control denied recursive cleanup | Invalid fixture; does not consume T8b's attempt |

Authorization, not an attempt: T8b has one replacement attempt explicitly authorized on 2026-09-04 after correcting the invalid combined fixture. T9b has no authorization and is skipped. T10b retains its one planned attempt. Pending scenarios are not ledger rows because rows count executed attempts. Append a row only after an actual attempt; the historical failed combined T8 fixture is preserved above and is not counted as T8b.

## Remainder preflight and execution topology

This preflight applies to T4-T11. It prevents implementation or live validation from outrunning an unproved runtime, ownership, or timeout assumption.

### Cross-task gates

For T8a-T11 the Retrospective rules below override this preflight wherever they conflict; in particular no Team Lead packages are used for remaining tasks.

- Materialize each package's shared interfaces and file leases before a Team Lead delegates modifying leaves. Leaves receive non-overlapping files; the root integrates shared call sites and owns authoritative validation.
- Team Lead packages may parallelize code, fixtures, and independent review. They must not parallelize live Herdr mutations, reload scenarios, load measurements, final integration checks, or recovery from a failed live mutation.
- Before every live package, prove worktree/runtime generation parity: resolved Pi CLI, child extension sources, linked dependencies, protocol generation, model, and temporary agent directory must describe the same implementation. Use one small fixture such as `pi/package.json`, not this plan.
- One outer scenario owns the live deadline. Startup handshake, process termination, and manager waits may have narrower internal bounds, but no equal or shorter test timeout may cancel the broker first. Long-lived servers have no command-lifetime timeout.
- Retain exact owned failure surfaces until diagnostic evidence is captured. Process exit, broker release, deliverable settlement, visual cleanup, and visible-slot release remain separate observations.
- Reuse T1/T3 evidence unless launcher, authority, ownership, generation, or timeout behavior changes. Do not rerun unchanged capability experiments.
- Stop the current package at the first unowned cleanup, focus change, duplicate delivery, wrong-run event, unproved PID settlement, timeout-owner conflict, or live mutation failure. Recover that exact boundary before continuing.

### Dependency and parallelism graph

```text
T7 -> T8a -> T9a ----> T11 -> T8b -> T10b -> T12
T6 -> T10a ----------> T11
T9b: skipped; no additional live authorization
```

The remaining deterministic slices may proceed independently. The root owns every live command and the T11 integration join.

### Preflight risk register

- T4: The current production adapter does not yet provide a proved pane-close or Herdr-loss event source. Reload currently risks waiting for process settlement without proving visual cleanup, visible background cancellation, or timeout composition. Retained cleanup must survive the selected reload path without reconstructing ownership from labels or topology.
- T5: Completion may arrive before surface attachment, during launch failure, after cancellation, twice, or blank. Foreground and background visible reads require distinct run/pane identity and cancellation isolation. Public schema work must remain last after internal lifecycle behavior passes.
- T6: Herdr may return success for a zoom-blocked no-op move. Topology, zoom, focus, move, close, and reflow require one adapter command/result seam and post-command topology verification.
- T7: Completed active measurements reject more than four active visible children by default. Preserve the four-child ceiling; do not rerun T7 or synthesize model traffic merely to fill panes.
- T8a/T8b: Visible modifying launch must generalize T3 without weakening concrete file-tool boundaries. A disposable repository must contain an in-bound target and an out-of-bound canary; shell authority is not a filesystem sandbox.
- T9a/T9b: Continuation fingerprints currently omit surface and stable pane ownership. Descendant visibility needs an explicit root-controlled, non-propagating policy separate from broker capacity, with visible exhaustion rejected and policy overflow remaining headless.
- T10a/T10b: The existing manager assumes a local child process and cannot infer command exit from relay EOF. The relay requires authenticated bounded frames, separate stdout/stderr, one command exit, independent PID settlement, atomic manager reservation, reload-stable ownership/watch state, and damage-control completion before any resource creation.
- T11: Final checks must not compensate for focused failures with broad suites or repeat T1/T3 live evidence. It joins two independently validated tracks and serializes the remaining live checklist.

### Validation fixtures and timeout ownership

| Package | Minimal non-live fixture | Root-owned live fixture | Timeout authority |
| --- | --- | --- | --- |
| T4 | Completion/cancel race matrix, exact-pane events, reload ordering, cleanup retry, process-lost adapter | None; T4 is adapter-only and T5 owns supported manual-close/reload checks | Mocked cancellation owns logical transition; mocked PID watcher owns settlement |
| T5 | Omitted/headless/Herdr schema normalization, launch/completion race matrix, overlapping run identities | One foreground plus one background small read, one manual close, and one reload with an unowned canary pane | Outer scenario exceeds the configured child bound |
| T6 | Recorded topology with zoomed successful no-op, unzoomed move, stable identities, final-tab cleanup | Sequential 1-4 then fifth-worker migration in one disposable workspace | Outer scenario only; visual deferral has no process deadline authority |
| T7 | Measurement collector calibration against one visible and one headless read | Completed sequential one, four, and eight active reads; no rerun | Root measurement scenario; rejected more than four active visible children |
| T8a/T8b | Disposable repo with allowed target and untouched canary | T8b owns the live fixture: one operator-preflighted attempt with one in-bound edit; T8a is deterministic only | Outer scenario plus existing child deadline |
| T9a/T9b | Two-leaf continuation, consume-once failures, visible exhaustion and headless overflow | T9b optionally owns the live fixture: one operator-preflighted attempt with two visible read leaves and the four-visible-child ceiling; T9a is deterministic only | Existing Team Lead hard deadline; outer scenario only contains it |
| T10a/T10b | Authenticated relay, malformed frames, split UTF-8, spill, delayed PID exit, shared-tab ownership, two-instance reload | T10b owns the live fixture: one server start/`/ps`/reload/`bg_kill`, one natural exit, one retained failure; T10a is deterministic only | Manager owns command lifetime; handshake and settlement have separate narrow bounds |
| T11 | Focused schema/contract/shared-impact suites | Only still-mandatory scenarios not already passed unchanged | Each owning scenario; aggregate checks add no nested timeout |

## Retrospective and execution rules for T8-T11

### Root causes observed in T3-T8

1. Herdr external-contract behavior was discovered live instead of from maintained docs and the installed schema (`.tmp/herdr-api-schema.json`): the `move_result` wrapper, `same_tab` no-op, required `--split`, agent wait cancelled by pane move, and child inheriting the parent `HERDR_PANE_ID`.
2. Harness/fixture defects were treated as product defects and retried: the T7 `working` status gate, the T8 `processOutcome` enum and `closeTaskDatabase()` without a directory, and the model-dependent forbidden-action fixture.
3. The missing stop condition allowed reruns after evidence answered the question: T7 ran repeatedly after the rejection result existed.
4. Tasks bundled several claims into one live pilot.
5. One interactive-session touch occurred when `--no-focus` was trusted.

### Rules

- Before any live command, inspect the relevant maintained Herdr documentation and installed schema. Test the parsed response contract; do not add prose/source-spelling assertions.
- Every claim assertable with a mocked adapter or direct function call is deterministic and never live.
- A live pilot asserts exactly one observable behavior plus cleanup.
- Live tests use only processOutcome values `succeeded` | `failed` | `cancelled` and close task stores with `closeTaskDatabase(directory)`.
- Never write a fixture whose success depends on the child model voluntarily doing something forbidden or doing two things.
- One attempt per task; after any outcome, record the ledger row and stop; retries need an operator line in the ledger.
- Use only session `hvs-validation` (`HERDR_SESSION` and `HERDR_SOCKET_PATH` pinned).
- Max four active visible children.
- Delegated leaves never run live Herdr; the root runs live commands itself.
- Do not use Team Lead packages for remaining tasks; use at most one developer leaf per deterministic slice and one code-reviewer leaf.
- Prefer the smallest model that can do the slice.

### Live preflight template

- Target session/socket: `hvs-validation`; pin `HERDR_SESSION` and `HERDR_SOCKET_PATH`.
- Exact command: record the complete command and arguments.
- Resource ceiling: record the owned resources and max four active visible children.
- Timeout owner: name the outer scenario owner and internal bounds.
- Acceptance condition and attempt end: state the one observable behavior, cleanup boundary, and outcome that ends the attempt.

## Tasks

- [x] **T1: Establish baseline and capability evidence**
  - Files: `.specs/herdr-visible-subagents/plan.md` and gitignored `.tmp/` experiment artifacts only.
  - Questions: Q1, Q6, Q8-Q12, and the idle-load portion of Q16; Q20 has only a completed field inventory.
  - Change: Establish the clean repository baseline and run only focus-isolated, no-production-code capability, launch, layout, movement, zoom, closure, and idle-capacity experiments under the limited experiment protocol.
  - Done when: Baseline checks pass, every created Herdr resource is accounted for and removed, operator focus remains unchanged, temporary production experiments are discarded, and each answered question records direct evidence and its plan impact.
  - Verify: Focused baseline subagent tests, Pi typecheck, `git diff --check`, runtime version checks, and before/after Herdr focus and owned-resource inspection.
  - Evidence: The removed experimental worktree established a passing 196-test baseline, Pi typecheck, and `git diff --check`. Focus-isolated no-code experiments proved exact read-only TUI tools, Windows launch fidelity, persistent sessions, stable process identity across pane moves, accepted layouts and zoom constraints, and eight-idle-child resource use near 1 GB. Q16 active-load evidence and Q20 production ownership validation remain open. Temporary broker code was discarded and no production runtime code was retained.

- [x] **T2: Add run-bound completion transport**
  - Files: `pi/extensions/subagent/tree-runtime.ts`, `pi/extensions/subagent/run-manager.ts`, `pi/extensions/subagent/index.ts`, `pi/extensions/subagent-completion.ts`, `pi/tests/subagent-tree-runtime.test.ts`, `pi/tests/subagent-run-manager.test.ts`, `pi/tests/subagent-completion.test.ts`, `pi/tests/subagent.test.ts`, and `pi/skills/pi-extension/references/contracts/subagents-and-tasks.md`.
  - Questions: Q2, Q3.
  - Change: Add one bounded completion operation to the existing authenticated tree broker and connect it to the current run-manager settlement path. Child-side lifecycle integration emits completion after the assigned turn; this is not a model-callable tool. The broker transports the child result but does not decide task success. Keep the headless structured-event path unchanged.
  - Done when: The admitted child can submit one nonblank result; wrong-run, malformed, empty, oversized, duplicate, late, and post-cancellation messages are rejected; structured results validate against their requested schema; the run manager atomically commits the first valid terminal input and rejects later inputs idempotently; accepted completion settles the logical deliverable exactly once without requiring process exit or terminal parsing. T2 uses a test process seam and does not claim persistent-TUI process cleanup or permit-release validation.
  - Readiness gate: Before editing production code, identify the exact broker frame, authentication and size bounds, run-manager atomic transition, child emission hook, and unchanged headless path in the owning contracts and implementation. The gate fails if completion and cancellation can commit independently or if a transcript, pane state, or process exit determines the deliverable.
  - Readiness evidence: Satisfied by code inspection. Add a protocol-versioned `complete` frame in `pi/extensions/subagent/tree-runtime.ts`; require the authenticated caller run to equal the completed run; retain the 64 KiB frame bound and reject completion payloads above 16 KiB or 2,000 lines before transition. Refactor `SubagentRunManager.settle()` in `run-manager.ts` into an observable synchronous first-winner terminal transition used by completion, cancellation, deadline, and failure inputs, while process termination and permit release remain separate. Register a parent-owned run-bound validator before launch so structured completion validates before commit. Emit visible completion from a new child-only `agent_end` extension rather than the installer-owned `herdr-agent-state.ts`. Preserve the existing `runSingleAgent()` JSON stdout, structured-correction, process-close, and background-delivery paths for headless runs. Current cancellation commits only later in `runSingleAgent()` cleanup, so reconciling it through the atomic transition is the first T2 implementation slice.
  - Verify: Focused broker protocol, run-manager atomic settlement and completion/cancellation race, foreground, background-delivery, empty-deliverable, and unchanged-headless-path tests.
  - Evidence: The protocol-5 completion frame is strict-self authenticated, bounded to 16 KiB and 2,000 lines, and validated by a parent-owned run-bound validator. The run manager uses an observable first-winner terminal transition; losing inputs do not mutate the snapshot. An explicit child marker prevents headless emission. Focused run-manager, broker, completion-emitter, and subagent tests passed with 153 tests; Pi typecheck and `git diff --check` passed.

- [x] **T3: Add internal Herdr surface ownership and restricted launch**
  - Files: `pi/extensions/subagent/herdr-surface.ts`, `pi/extensions/subagent/run-manager.ts`, `pi/extensions/subagent/index.ts`, `pi/tests/herdr-surface.test.ts`, `pi/tests/subagent-run-manager.test.ts`, `pi/tests/subagent.test.ts`, and the owning subagent contract.
  - Depends on: T2
  - Questions: Q1, Q6, Q20.
  - Change: Add one internal execution-surface seam and extend existing run snapshots with Herdr workspace, tab, pane, explicit ownership, layout/package, and cleanup/retention fields. Implement the Windows `pane run` launch path and supported non-Windows launch path with exact model, effort, skills, cwd, session, role, environment, and closed tool authority. Do not expose a public surface field yet.
  - Done when: One read-only TUI child completes through T2, edit/write/shell/delegation remain absent, headless behavior is unchanged, Herdr status cannot force deliverable completion, a server-independent process handle and PID tree are recorded, visual capacity is reserved atomically before creation, partial launch releases its reservation, and cleanup targets only recorded owned resources. Persistent-process permits release only after independent process settlement is proven; visual pane closure may remain deferred.
  - Verify: Adapter unit tests, role-loadout tests, malformed Herdr-response tests, atomic visible-slot reservation and partial-launch tests, server-independent process-settlement tests, focused run-manager tests, one focus-isolated live restricted child through an internal test entrypoint, typecheck, and contract updates for changed stable behavior.
  - Evidence: Protocol-5 completion and the internal Herdr surface compose through the existing run manager. The Windows launcher uses an authenticated private status file for launcher/direct-child PID identity, a resolved Node CLI invocation prefix, initial and transient process-enumeration stabilization, and independent PID-tree settlement. Normalized adapter responses, post-creation validation cleanup, explicit completion-extension loading, visible-slot reservation, settled/retained/cleaned ownership states, and failure retention have focused coverage. The opt-in live test ran in unfocused owned workspace `w15`: a read-only child exposed only `read`, `grep`, `find`, and `ls`, read `pi/package.json`, returned validated `T3_LIVE_OK` through the broker, settled its process handle, released broker and visible capacity, closed only its owned tab, and left operator focus on `wX:p9`. All `w15` resources were removed afterward.

- [x] **T4: Prove cancellation and failure cleanup**
  - Files: `pi/extensions/subagent/herdr-surface.ts`, `pi/extensions/subagent/run-manager.ts`, `pi/extensions/subagent/index.ts`, focused subagent lifecycle tests, and the owning subagent contract.
  - Depends on: T3
  - Team Lead package: Use one foreground Team Lead with at most three workers after a read-only Herdr API probe. Lease (1) `run-manager.ts` plus reload/cancellation integration, (2) `herdr-surface.ts` plus exact event/cleanup adapter tests, and (3) lifecycle race/reload tests plus contract review. The root resolves shared `index.ts` integration, validates the composed package, and performs no live run in this task.
  - Questions: Q4, Q5, Q13-Q15, Q20.
  - Change: Integrate bounded cancellation, reload cancellation, manual pane closure, parent shutdown, retained failed-surface records, active-blocked ownership, partial-launch cleanup, and explicit Herdr-unavailable behavior. Validate server loss through mocks or an isolated Herdr server only; never stop the operator's shared server.
  - Done when: Each case uses the atomic terminal transition and settles once; completion and cancellation races preserve whichever committed first; capacity releases only after independently proven process settlement; routine cancelled panes close; active blocked runs remain nonterminal and retain execution ownership; settled failed panes detach after process exit; reload hook ordering and ownership persistence prove one bounded cleanup path; no unowned resource closes.
  - Verify: Focused cancellation/race tests, owned-resource tests, reload ordering and persisted-cleanup tests, and adapter-level manual-closure and Herdr-loss tests. Live manual closure and reload workflow checks move to T5, where a supported pilot surface exists.

- [x] **T5: Ship the read-only Herdr pilot**
  - Files: `pi/extensions/subagent/contracts.ts`, `pi/extensions/subagent/modern-adapter.ts`, `pi/extensions/subagent/index.ts`, `pi/extensions/subagent/herdr-surface.ts`, focused subagent tests, and the owning subagent contract.
  - Depends on: T4
  - Team Lead package: After T4 passes, use at most three workers with disjoint leases for (1) `contracts.ts` and schema tests, (2) `modern-adapter.ts` and normalization tests, and (3) foreground/background composition fixtures. The Team Lead must return one integrated non-live result; the root owns the sequential manual-close, reload, and overlapping-read live pilot.
  - Questions: Q17, Q20.
  - Change: Add per-item `surface?: "headless" | "herdr"` to `subagent_read`, default it to headless, reject explicit Herdr use outside a valid environment, and retain existing foreground/background behavior. Update callable schema, labels, owning stable contracts, and telemetry normalization in the same change.
  - Done when: One foreground and one background visible read overlap with distinct run and pane identities, complete automatically with exactly-once delivery, and demonstrate cancellation isolation; operator nudging stays on the same governed run; success and routine cancellation stop their processes within bounds; zoom may defer only visual cleanup; failure remains inspectable; empty output fails; headless regression tests remain unchanged.
  - Verify: Focused schema, modern-adapter, broker, settlement, overlapping foreground/background delivery and cancellation-isolation tests, plus live read-only manual-closure and reload workflow checks.
  - Evidence: Per-item surface normalization defaults to headless and explicit Herdr launches require an active environment. The production adapter waits for exact pane readiness and a stable recognized Pi before submitting the task through `herdr agent prompt`; authenticated completion uses the owning child deadline and process termination is idempotent. The live public pilot passed manual exact-pane closure, reload cancellation, process settlement, unowned-canary preservation, and owned-resource cleanup.

- [x] **T6: Add adaptive direct-worker layout**
  - Files: `pi/extensions/subagent/herdr-surface.ts`, `pi/extensions/subagent/index.ts`, `pi/tests/herdr-surface.test.ts`, `pi/tests/subagent.test.ts`, and the owning Herdr/subagent contract.
  - Depends on: T5
  - Team Lead package: First materialize one topology/zoom/focus adapter interface. Then use at most three workers for (1) adapter command parsing and topology verification in `herdr-surface.ts`, (2) pure layout decision logic and fixtures in a separate layout module/test, and (3) `index.ts` composition plus ownership review. Do not let two leaves edit `herdr-surface.ts` or run live layouts. The root serially runs 1-4 and fifth-worker live checks.
  - Questions: Q8-Q11.
  - Change: Add the one-through-four top band and fifth-worker migration to one two-row `Subagents` tab. Respect zoom, focus, user resizing, retained-pane capacity, and the independent configured broker ceiling.
  - Done when: Pane and process identities survive unzoomed moves; zoom defers migration, visual closure, and reflow but never process termination or permit release; focus is preserved; atomic visible-capacity reservation makes concurrent exhaustion fail before spawn; partial launch releases the slot; headless overflow remains unaffected.
  - Verify: Layout adapter tests and focus-isolated live 1-4, fifth-worker, move, closure, and cleanup checks.
  - Evidence: The adapter now consumes the installed CLI's `result.move_result` wrapper, rejects accepted no-op moves by reason, and uses the documented required split target for existing-tab moves. Band reflow is incremental, zoom defers mutation, and the owned `Subagents` root shell is removed only after the first worker joins its tab. Focused layout/surface tests passed with 23 tests and Pi typecheck passed. The opt-in live T6 scenario sequentially placed one through four workers with the unchanged primary pane, migrated exactly five worker panes into one unfocused `Subagents` tab with no extra shell pane, preserved focus, cleaned every worker, restored the primary-only topology, and removed the disposable workspace. Prior Q9 evidence established stable active Pi PID and pane identity across same-workspace moves.

- [x] **T7: Validate active capacity and read-only pilot behavior**
  - Files: `.specs/herdr-visible-subagents/plan.md`, gitignored `.tmp/` measurements, and Windows churn diagnostics only when triggered by observed evidence.
  - Depends on: T6
  - Team Lead package: Live load generation remains root-owned and sequential. A Team Lead may use read-only leaves after each scenario to analyze captured timing, memory, CPU, cancellation, responsiveness, and optional churn evidence in disjoint artifacts. No child may create panes, start model traffic, or rerun a measurement.
  - Questions: Q12, Q16.
  - Change: Measure one, four, and eight active read-only children during real pilot work, compare the headless baseline, and record startup, memory, CPU, cancellation latency, and parent responsiveness. Run the Windows churn diagnostic only when observed behavior or event evidence indicates it.
  - Done when: Evidence supports or rejects enabling more than four active visible children by default and records a direct bounded fallback. Synthetic model traffic is not required solely to fill panes.
  - Verify: Isolated-session one-, four-, and eight-child pilot measurements, headless comparison, cancellation timing, parent responsiveness, owned-resource cleanup, proof that the user's interactive focus and resources were never targeted, and the churn diagnostic only when its trigger is observed.
  - Evidence: `.tmp/t7-measurements.json` records matched headless and visible scenarios. One visible child used 308 MB working set with 0.80-second parent response and 7.10-second cancellation. Four used 1.13 GB with 2.19-second parent response and 24.53-second cancellation. Eight used 2.18 GB with 9.56-second parent response and 46.98-second cancellation. The 5-second responsiveness bound therefore rejects more than four active visible children by default. The isolated workspace and owned processes were removed; no interactive-session target was addressed. No Windows churn diagnostic was run because no qualifying process-churn or event trigger was observed. T7 is terminal and must not be rerun without explicit operator authorization.

- [ ] **T8a: Finish visible-write fixtures and current authority integration**
  - Files: Existing subagent contracts, modern adapter, launcher, run manager and authority tests; `pi/tests/herdr-write.live.test.ts`.
  - Depends on: T7
  - Change: Preserve already authored fixture repairs (`processOutcome: succeeded`, `closeTaskDatabase(directory)`, one in-bound edit). Complete the deterministic pane-close cancellation regression. Reconcile the current primary read/Team Lead allowlists and selected-skill exceptions with the owned launcher without losing protocol-5/surface work. Preserve current provider restrictions, single-item Luna affinity and saved-session leases; include surface in reuse eligibility rather than silently changing execution mode. Do not blindly overwrite dirty files with primary versions.
  - Done when: Source inspection establishes integrated authority/fixture changes and authored regressions; completed T2-T7 work remains intact. Governed file/search containment remains distinct from arbitrary shell sandboxing. Runtime proof is deferred to T11.
  - Verify: deterministic Inspect the integrated source and regression coverage. Run no intermediate tests or typecheck. Existing out-of-bound coverage lives in `workspace-policy.test.ts` and `tool-failure-decisions.test.ts`; fingerprint coverage in `subagent-t1.test.ts` and `subagent-run-manager.test.ts`; headless coverage in `subagent.test.ts`. Add only coverage needed for changed authority/surface composition.

- [ ] **T8b: Single live in-bound edit pilot**
  - Files: `pi/tests/herdr-write.live.test.ts`, isolated fixture resources, this ledger.
  - Depends on: T11
  - Change: Run the previously authorized replacement attempt, not the invalid combined mutation/escape scenario.
  - Done when: One visible Luna write leaf changes `allowed.txt` from `ALLOWED_INITIAL` to `ALLOWED_CHANGED`, reports `succeeded`, proves process settlement and owned cleanup, and the isolated workspace closes. Record supported, rejected or blocked once; a rejected evaluation does not prove feature acceptance.
  - Verify: live Run only the write pilot after final deterministic validation; assert the one in-bound edit and cleanup. Pin the named session/socket and exact workspace/pane/tab, use the integrated `PI_LIVE=T8` gate and resolved owned CLI, and close only owned resources in the outer trap. Stop after the attempt.
  - Max attempts: 1
  - Session: Existing isolated named headless `hvs-validation`; pin `HERDR_SESSION` and `HERDR_SOCKET_PATH`, never the interactive session.
  - Terminal outcomes: supported | rejected | blocked
  - Original combined-fixture evidence: The model-dependent allowed-plus-forbidden scenario produced no in-bound edit or observable escape attempt. `exitCode: 0` and `processOutcome: succeeded` did not prove the requested edit. The harness used the wrong outcome enum and mishandled task-store cleanup. The owned workspace closed; three task-created temporary directories remained after denied recursive cleanup. This was a fixture failure, not product failure. The replacement was expressly authorized on 2026-09-04; this revision grants no additional attempt. Preserve the original ledger row.

- [ ] **T9a: Team Lead surface plumbing, deterministic only**
  - Files: Subagent `contracts.ts`, `modern-adapter.ts`, `index.ts`, `herdr-surface.ts`, `run-manager.ts`, focused tests and owning contract.
  - Depends on: T8a
  - Change: Accept surface policy on `subagent_teamlead` items while keeping the coordinator headless, with at most four root-selected visible descendants and headless overflow. Preserve non-propagating authority, broker capacity, cutoff, reconciliation and continuation. Keep `restrictedHerdrLaunch` rejecting coordinator-pane launches. Surface is part of the continuation fingerprint.
  - Done when: Source and authored mocked-adapter tests cover the visible-leaf cap, explicit capacity rejection, headless overflow, fingerprint rejection and no coordinator pane. No lead-pane/status-wall implementation or additional live scenario.
  - Verify: deterministic Inspect policy-to-launch-to-continuation composition; defer executable checks to T11. Stop if implementation requires broader authority or another lifecycle owner.

- [x] **T9b: Optional live Team Lead pilot**
  - Required: false
  - State: skipped
  - Change: None; the owned plan makes this pilot optional and unauthorized by default.
  - Done when: Skipped with reason: no additional live Team Lead attempt is authorized or required for the accepted deterministic-only T9a scope.
  - Verify: deterministic Preserve the skip; no live command. A later operator request must specify its own bounded authorization before changing this disposition.

- [ ] **T10a: Deterministic visible background terminal**
  - Files: `pi/extensions/background-terminal/manager.ts`, `index.ts`, a small Herdr adapter/relay, focused tests and owning background-terminal contract.
  - Depends on: T6
  - Change: Add `bg_start.surface`, default headless, through the manager's existing `spawnProcess` seam. Keep the manager as sole owner of entries, bounded output, exit, completion and kill. Reuse low-level Herdr ownership/process primitives only; no subagent permits, state or display slots. The actual command runs in an owned Background terminals pane through authenticated bounded stdout/stderr/exit relay.
  - Done when: Source and authored tests cover damage-control before registration/pane creation/spawn, relay authentication/bounds/backpressure, output drain before exit delivery, independent PID settlement, natural completion, kill consuming the automatic follow-up, retained failure, exact manual closure, reload-stable ownership and manager truth on Herdr loss. Preserve current capacity, spill/log cleanup and headless behavior. Deterministic coverage includes the reload/kill cases deliberately excluded from T10b.
  - Verify: deterministic Inspect manager/relay composition and authored fixtures; run checks in T11. Missing safe relay or process-settlement evidence blocks acceptance; transcript or pane status never substitutes for output or exit.

- [ ] **T10b: Single live background pilot**
  - Files: Background live fixture, isolated resources, this ledger.
  - Depends on: T11, T8b
  - Change: Run one visible command that prints distinguishable stdout and stderr and exits 0. No server/reload/kill scenario is added; T10a covers those behaviors deterministically.
  - Done when: The manager and `/ps` expose the exact command, both streams and real exit status are retained, completion is delivered once, process exit is proven, and only the owned pane/tab closes. Record one terminal evaluation and cleanup result.
  - Verify: live Run the authored natural-exit fixture with exact pinned session/socket/workspace identities; the outer scenario owns timeout and cleanup. Record the exact command before launch. Stop after the attempt; no automatic retry or replacement workload.
  - Max attempts: 1
  - Session: Existing isolated named headless `hvs-validation`; pin `HERDR_SESSION` and `HERDR_SOCKET_PATH`, never the interactive session.
  - Terminal outcomes: supported | rejected | blocked

- [ ] **T11: Integrate the remainder and run final deterministic validation**
  - Files: Owning Pi contracts, changed schemas/rendering, `CHANGELOG.md`, focused tests, `pi/tests/helpers/live-herdr.ts`, existing live fixtures and this plan.
  - Depends on: T8a, T9a, T10a
  - Change: Finish all integration before checks. Preserve the existing requested shared live helper: isolated workspace creation/closure, environment pinning, agent directory setup and `closeTaskDatabase(directory)` before removal. Migrate existing subagent live fixtures to `PI_LIVE=<task>` and remove superseded gates; unset `PI_LIVE` skips all live tests. Reconcile contracts and changelog with the narrowed accepted scope. Keep current tool names; no aliases.
  - Done when: Authored implementation, fixtures and documentation are integrated and the one deterministic Validation batch passes. T8b and T10b remain separate bounded acceptance evaluations within that same final phase.
  - Verify: deterministic Run the Validation batch once, without autofix or extra review rounds. Classify failures before repair and retain the shared allowance across tasks/resume. No live commands in T11.

- [ ] **T12: Accept the completed scope for closeout**
  - Files: This plan, accumulated validation evidence, owned workflow Git state.
  - Depends on: T8b, T10b
  - Change: Reconcile evidence against the accepted remainder, document T9b's skip and T7's terminal rejection, and prepare normal archive/commit/merge closeout.
  - Done when: Required authored work and final checks pass, the two required live pilots are supported, and owned cleanup is resolved. Mark task acceptance before archival; overall completion still requires the Retention closeout verifier.
  - Verify: deterministic Inspect current evidence without rerunning unchanged checks. If a required pilot is rejected/blocked, stop with that evidence rather than claiming completion or granting a retry. Preserve failed-closeout state for exact recovery.

## Independent adversarial review

Review completed after T1 and before production implementation. It found twelve actionable issues; this revision incorporates all of them:

- The run manager now owns one atomic terminal transition for completion, cancellation, deadline, and failure inputs.
- Broker authority is narrowed to authentication and input transport; it cannot commit cancellation or another terminal outcome.
- Process termination and permit release are separated from zoom-deferred visual pane closure.
- Every visible launch requires a server-independent process handle and PID-tree settlement path; inability to prove exit blocks rollout and retains the permit.
- Reload requires explicit hook-ordering and ownership-persistence evidence rather than assuming snapshots are sufficient.
- Manual pane closure requests cancellation only while the run remains nonterminal and cannot replace an accepted completion.
- Blocked is defined only as an active nonterminal state; only failed terminal panes are retained.
- T2 proves transport and atomic logical settlement through a test process seam; T3 and T4 own persistent-process and cleanup proof.
- T3 uses an internal test entrypoint; supported live manual-closure and reload checks occur in the T5 pilot.
- T5 includes overlapping foreground and background runs with identity, delivery, and cancellation isolation.
- Visible capacity is reserved atomically before creation and released on partial-launch or lifecycle cleanup.
- T1 and execution status distinguish completed experiments from partially resolved or implementation-unproved questions.

Historical review disposition: its T2 gate is complete in the owned worktree. The current reconciled remainder and execution status supersede that original readiness conclusion.

## Validation

T1-T7 evidence remains valid for unchanged inputs. Finish T8a/T9a/T10a and T11 integration before one root-owned final phase: T11 deterministic batch, T8b single authorized replacement, T10b single natural-exit pilot, T12 acceptance. The earlier per-task checks, fixture matrix and review notes are historical where their timing conflicts with this section. Do not rerun T7 or add live Team Lead/status-wall checks.

- [ ] T11: From the owned worktree's `pi/`, run `pnpm test herdr-surface.test.ts herdr-layout-t6.test.ts subagent-herdr-schema.test.ts subagent-herdr-modern-adapter.test.ts subagent-run-manager.test.ts subagent-tree-runtime.test.ts subagent-completion.test.ts subagent.test.ts subagent-t1.test.ts workspace-policy.test.ts tool-failure-decisions.test.ts background-terminal-manager.test.ts background-terminal.test.ts damage-control.test.ts herdr-surface.live.test.ts herdr-write.live.test.ts` once, with `PI_LIVE` unset. Add only newly authored Team Lead/relay/helper test files required by this outcome to that invocation. Existing live fixtures must skip; missing named coverage is not a pass.
- [ ] T11: Run `pnpm run typecheck` once from owned `pi/` for shared broker/manager/schema integration.
- [ ] T11: Run `git diff --check` once from the owned repository.
- [ ] T8b: Run the integrated one-edit pilot once under its preserved authorization; record result and cleanup in the ledger.
- [ ] T10b: Run the integrated stdout/stderr natural-exit pilot once; record result and cleanup in the ledger.
- [ ] T12: Inspect complete acceptance, recorded skips, limits, resource cleanup and canonical plan state. Reuse unchanged passing checks.

Before a live attempt, verify the actual isolated `hvs-validation` socket, installed Herdr schema, owned CLI/runtime generation, current provider route, exact resources, max four active visible children, outer timeout, and cleanup. Never touch the operator's interactive Herdr session, even for inspection. The root runs live commands; deterministic leaf assignments run no intermediate checks and never run live commands. Follow pushed completion instead of status polling. No new Team Lead delegation package is introduced for remaining implementation.

Classify failures as fixture/harness, product, external-contract misunderstanding or protocol violation. The remaining final phase permits at most one focused development repair batch and one targeted deterministic rerun for the whole outcome; it does not renew earlier consumed allowances or authorize a live retry. Record used checks and remaining allowance in Execution Status. Stop and report unresolved failures after the allowance; no new session, task, fixture, timeout or helper migration resets it. A live attempt ends after one supported/rejected/blocked result and exact cleanup; another attempt requires explicit operator authorization.

## Rollback boundary

- The headless surface remains independently usable throughout rollout.
- Before the read-only pilot is accepted, removing the Herdr adapter and `surface` schema restores prior behavior without task or session migration.
- A failed Herdr launch never silently falls back to headless because explicit visibility intent must remain observable.
- Removing the background Herdr adapter and `bg_start.surface` restores the prior manager-owned headless behavior without migrating terminal records or logs.
- Rollback closes only currently owned experimental or production panes and tabs after their subagent broker or background-manager process boundaries settle.
- No rollback changes the installed Herdr package, global Pi package list, saved task records, or archived plans.

## Retention

Keep incomplete work at `.specs/herdr-visible-subagents/plan.md` in the existing owned workflow. After acceptance, mark required tasks/validation complete, archive the spec directory to `.specs/archive/herdr-visible-subagents/` in that worktree, commit in-scope nonignored artifacts, merge `--no-ff` into the primary branch and verify archive/merge/ownership before removing only the owned worktree and branch. Do not force-add ignored files. Preserve recovery state on failure. Normal explicit `/do-it` no-merge/in-place options retain their owning semantics; this plan selects neither exception.

The primary must be clean for merge. Do not stash, discard, commit or absorb unrelated primary edits to force closeout. Reconcile the primary plan with this execution copy before resume; matching copies resolve setup divergence without changing ownership metadata or resetting the branch.

## Execution Status

- State: T1-T7 complete in the owned worktree; original T8 live fixture blocked; T9b explicitly skipped. Remaining authored work starts at T8a, not T2.
- Blocker: No plan-design or task-graph blocker for T8a. The original three temporary directories from the failed T8 fixture have unresolved cleanup in the historical record; inspect exact recorded identities and current existence before any removal, never guess or use broad cleanup. Resolve that boundary before another live attempt.
- Resume verification: Both plan copies are identical. Current `validatePlanFile` passes ready and execution-preflight modes for both copies; `resolveWorkflowPlanWorkspace` selects the existing owned worktree and `selectNextPlanTask` selects T8a. T1-T7 remain checked, T9b is skipped, and T8b/T10b each retain one attempt with no executed rows. No ownership or branch metadata was changed.
- Reconciliation: The 2026-09-05 primary-only T2 reopening was incorrect. Protocol 5, completion emitter, surface/layout source and tests exist in the owned worktree. Preserve all dirty/untracked implementation files and T1-T7 evidence. Main's newer authority/workflow changes must compose with those files rather than overwrite them.
- Next: T8a source/fixture/current-authority integration. T10a is independently ready; T9a follows T8a. T11 finishes integration and runs the final deterministic batch, followed by T8b, T10b and T12. No new live work was authorized by reconciliation.
- Validation progress: No implementation tests or live attempts ran during this plan reconciliation. Historical focused passes and T7 measurements remain recorded above. The remaining final-phase checks have not run; preserve the shared one-repair/targeted-rerun cap and any earlier consumed allowance. T8b retains exactly one previously authorized replacement attempt; T10b retains one planned attempt; T7 cannot rerun and T9b is skipped.
- Resume: `/do-it .specs/herdr-visible-subagents/plan.md`
