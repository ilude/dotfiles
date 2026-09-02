---
created: 2026-08-31
status: ready
---

# Add visible Herdr execution surfaces for governed Pi subagents and background terminals

## Objective

Pi must optionally host governed subagents and managed background terminals in visible Herdr panes while preserving their separate lifecycle authorities. The primary orchestrator and Team Lead layouts must expose active child terminals without making terminal state authoritative for work completion. Long-lived servers, watchers, and concurrent shell work may run in owned Herdr panes while the existing `BackgroundTerminalManager` remains authoritative for process state, bounded output, completion delivery, `/ps`, and `bg_kill`.

## Completion Evidence

- Evidence: Governed read-only and modifying children, Team Lead packages, and managed background terminals run on explicit Herdr surfaces while their existing managers remain authoritative; accepted layouts, lifecycle behavior, bounded result or output delivery, reload policy, authority controls, and owned-resource cleanup pass focused and live checks.
- Fails when: Headless defaults change, terminal state or transcript text becomes authoritative, child or background authority expands, process capacity releases before proven settlement, reload or cancellation loses owned state, output/result delivery duplicates or disappears, or any unowned Herdr resource is changed.
- A read-only pane-hosted Pi child has the same closed tool authority as its headless equivalent, registers with the authenticated broker, and returns a nonblank validated deliverable without transcript scraping.
- Foreground and background Herdr runs compose through the existing run manager with process state, process outcome, and deliverable outcome remaining separate.
- Cancellation, reload, pane closure, and Herdr failure settle without closing unowned panes or bypassing Team Lead cutoff and reconciliation bounds.
- The primary layout shows one through four direct workers above the primary orchestrator; the fifth worker creates one dedicated tab containing all active direct workers, up to eight.
- A visible Team Lead receives one dedicated tab with the lead above as many as eight visible leaves in two rows of four.
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
- A later compatibility migration to `subagent_inspect` and `subagent_modify` after the execution surface is stable.

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

### Visible Team Lead package

Each visible Team Lead receives one dedicated owned tab:

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

### Q12: Team Lead 1+4+4 usability

- Type: Experiment and operator acceptance
- Status: Resolved
- Assumption: A Team Lead and eight leaves remain identifiable in one tab even when detailed interaction requires zoom.
- Evidence required: Live 1+4+4 geometry and operator acceptance that panes are status surfaces rather than full reading surfaces.
- Blocks: Visible Team Lead layout rollout.
- Resolution: At the current 285x76 area, the Team Lead received 285x25 and each of eight worker panes received approximately 71x25. The layout is mechanically correct and panes remain identifiable. Smaller terminal sizes were not tested; the operator accepted that any visible output improves on none and detailed review uses `prefix+z`.
- Plan impact: Treat 1+4+4 as a status-wall layout. Do not block on arbitrary smaller-size targets, but preserve zoom and avoid focus-changing automated zoom tests.

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
- Status: Partially resolved
- Assumption: One, four, and eight interactive TUI children remain operationally acceptable relative to headless children.
- Evidence required: Startup latency, memory, idle and active CPU, cancellation latency, parent responsiveness, and Windows process-churn diagnostics when indicated.
- Blocks: Enabling more than four visible children by default.
- Resolution: In dedicated unfocused workspace `w13`, one restricted idle Pi reached its TUI in 8.3 seconds; adding three took 21.6 seconds; adding four more took 24.7 seconds. Eight idle Pi TUIs used 987.6 MB aggregate working set and 912.8 MB private memory, and accumulated 0.0 CPU seconds across a five-second idle sample. The operator pane remained `wX:p7` before, during, and after. The owned workspace was removed. Active-turn cost, cancellation latency, headless comparison, and churn diagnostics remain open.
- Plan impact: Eight visible idle children are feasible but carry approximately 1 GB of process memory. Do not block the eight-pane layout on idle overhead; retain Q4 and the active-load portion of Q16 as rollout gates before making more than four active visible children a default.

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
- Use a dedicated `hvs-experiment` Herdr workspace created without focus and never the operator's active workspace.
- Record the focused workspace, tab, and pane before each experiment and verify that all remain unchanged afterward.
- Use uniquely named `hvs-` workspaces, tabs, panes, agents, and session files.
- Pass `--no-focus` for every supported create, split, and move operation.
- Do not automate zoom or another focus-sensitive operation without explicit operator permission.
- Record every owned Herdr workspace, pane, and tab ID before launch.
- Close successful experimental resources after evidence capture and close only owned resources.
- Stop at the first unexpected focus change, live-state mutation, or need to modify the broker or run manager; record the unanswered boundary instead of expanding the experiment.
- Store expected large output in gitignored `.tmp/` or an OS temporary directory.
- Update the relevant question's Status, Resolution, and Plan impact immediately after each experiment.

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
  - Evidence: The protocol-5 completion frame is strict-self authenticated, bounded to 16 KiB and 2,000 lines, and validated by a parent-owned run-bound validator. The run manager uses an observable first-winner terminal transition; losing inputs do not mutate the snapshot. An explicit child marker prevents headless emission. Focused run-manager, broker, completion-emitter, and subagent tests passed with 158 tests; Pi typecheck and `git diff --check` passed.

- [ ] **T3: Add internal Herdr surface ownership and restricted launch**
  - Files: `pi/extensions/subagent/herdr-surface.ts`, `pi/extensions/subagent/run-manager.ts`, `pi/extensions/subagent/index.ts`, `pi/tests/herdr-surface.test.ts`, `pi/tests/subagent-run-manager.test.ts`, `pi/tests/subagent.test.ts`, and the owning subagent contract.
  - Depends on: T2
  - Questions: Q1, Q6, Q20.
  - Change: Add one internal execution-surface seam and extend existing run snapshots with Herdr workspace, tab, pane, explicit ownership, layout/package, and cleanup/retention fields. Implement the Windows `pane run` launch path and supported non-Windows launch path with exact model, effort, skills, cwd, session, role, environment, and closed tool authority. Do not expose a public surface field yet.
  - Done when: One read-only TUI child completes through T2, edit/write/shell/delegation remain absent, headless behavior is unchanged, Herdr status cannot force deliverable completion, a server-independent process handle and PID tree are recorded, visual capacity is reserved atomically before creation, partial launch releases its reservation, and cleanup targets only recorded owned resources. Persistent-process permits release only after independent process settlement is proven; visual pane closure may remain deferred.
  - Verify: Adapter unit tests, role-loadout tests, malformed Herdr-response tests, atomic visible-slot reservation and partial-launch tests, server-independent process-settlement tests, focused run-manager tests, one focus-isolated live restricted child through an internal test entrypoint, typecheck, and contract updates for changed stable behavior.

- [ ] **T4: Prove cancellation and failure cleanup**
  - Files: `pi/extensions/subagent/herdr-surface.ts`, `pi/extensions/subagent/run-manager.ts`, `pi/extensions/subagent/index.ts`, focused subagent lifecycle tests, and the owning subagent contract.
  - Depends on: T3
  - Questions: Q4, Q5, Q13-Q15, Q20.
  - Change: Integrate bounded cancellation, reload cancellation, manual pane closure, parent shutdown, retained failed-surface records, active-blocked ownership, partial-launch cleanup, and explicit Herdr-unavailable behavior. Validate server loss through mocks or an isolated Herdr server only; never stop the operator's shared server.
  - Done when: Each case uses the atomic terminal transition and settles once; completion and cancellation races preserve whichever committed first; capacity releases only after independently proven process settlement; routine cancelled panes close; active blocked runs remain nonterminal and retain execution ownership; settled failed panes detach after process exit; reload hook ordering and ownership persistence prove one bounded cleanup path; no unowned resource closes.
  - Verify: Focused cancellation/race tests, owned-resource tests, reload ordering and persisted-cleanup tests, and adapter-level manual-closure and Herdr-loss tests. Live manual closure and reload workflow checks move to T5, where a supported pilot surface exists.

- [ ] **T5: Ship the read-only Herdr pilot**
  - Files: `pi/extensions/subagent/contracts.ts`, `pi/extensions/subagent/modern-adapter.ts`, `pi/extensions/subagent/index.ts`, `pi/extensions/subagent/herdr-surface.ts`, focused subagent tests, and the owning subagent contract.
  - Depends on: T4
  - Questions: Q17, Q20.
  - Change: Add per-item `surface?: "headless" | "herdr"` to `subagent_read`, default it to headless, reject explicit Herdr use outside a valid environment, and retain existing foreground/background behavior. Update callable schema, labels, owning stable contracts, and telemetry normalization in the same change.
  - Done when: One foreground and one background visible read overlap with distinct run and pane identities, complete automatically with exactly-once delivery, and demonstrate cancellation isolation; operator nudging stays on the same governed run; success and routine cancellation stop their processes within bounds; zoom may defer only visual cleanup; failure remains inspectable; empty output fails; headless regression tests remain unchanged.
  - Verify: Focused schema, modern-adapter, broker, settlement, overlapping foreground/background delivery and cancellation-isolation tests, plus live read-only manual-closure and reload workflow checks.

- [ ] **T6: Add adaptive direct-worker layout**
  - Files: `pi/extensions/subagent/herdr-surface.ts`, `pi/extensions/subagent/index.ts`, `pi/tests/herdr-surface.test.ts`, `pi/tests/subagent.test.ts`, and the owning Herdr/subagent contract.
  - Depends on: T5
  - Questions: Q8-Q11.
  - Change: Add the one-through-four top band and fifth-worker migration to one two-row `Subagents` tab. Respect zoom, focus, user resizing, retained-pane capacity, and the independent configured broker ceiling.
  - Done when: Pane and process identities survive unzoomed moves; zoom defers migration, visual closure, and reflow but never process termination or permit release; focus is preserved; atomic visible-capacity reservation makes concurrent exhaustion fail before spawn; partial launch releases the slot; headless overflow remains unaffected.
  - Verify: Layout adapter tests and focus-isolated live 1-4, fifth-worker, move, closure, and cleanup checks.

- [ ] **T7: Validate active capacity and read-only pilot behavior**
  - Files: `.specs/herdr-visible-subagents/plan.md`, gitignored `.tmp/` measurements, and Windows churn diagnostics only when triggered by observed evidence.
  - Depends on: T6
  - Questions: Q12, Q16.
  - Change: Measure one, four, and eight active read-only children during real pilot work, compare the headless baseline, and record startup, memory, CPU, cancellation latency, and parent responsiveness. Run the Windows churn diagnostic only when observed behavior or event evidence indicates it.
  - Done when: Evidence supports or rejects enabling more than four active visible children by default and records a direct bounded fallback. Synthetic model traffic is not required solely to fill panes.
  - Verify: Focus-isolated one-, four-, and eight-child pilot measurements, headless comparison, cancellation timing, parent responsiveness, owned-resource cleanup, and the churn diagnostic only when its trigger is observed.

- [ ] **T8: Enable visible modifying agents**
  - Files: `pi/extensions/subagent/contracts.ts`, `pi/extensions/subagent/modern-adapter.ts`, `pi/extensions/subagent/index.ts`, `pi/extensions/subagent/herdr-surface.ts`, focused authority/subagent tests, and the owning subagent contract.
  - Depends on: T7
  - Change: Add the proven surface field to `subagent_write` while preserving foreground default, exact mutation authority, required validation, incident boundaries, and automatic result delivery.
  - Done when: In-bound modification succeeds, out-of-bound modification fails, steering cannot expand authority, manual closure cannot report success, and headless modifying behavior remains unchanged.
  - Verify: Focused authority and adapter tests plus one bounded disposable modifying workflow.

- [ ] **T9: Enable visible Team Leads and governed descendants**
  - Files: `pi/extensions/subagent/contracts.ts`, `pi/extensions/subagent/modern-adapter.ts`, `pi/extensions/subagent/index.ts`, `pi/extensions/subagent/herdr-surface.ts`, `pi/extensions/subagent/run-manager.ts`, focused Team Lead tests, and the owning subagent contract.
  - Depends on: T8
  - Questions: Q7, Q12, Q18, Q19.
  - Change: Add the dedicated 1+4+4 status-wall tab, root-controlled visibility for up to eight descendants, policy-eligible headless overflow, existing cutoff and reconciliation behavior, and same-surface consume-once continuation.
  - Done when: Partial continuation resumes the same visible pane and session; second use, expiry, cancellation, authority broadening, and surface change are rejected; completed leaves do not rerun; cutoff, recursive cancellation, deterministic reduction, and private session paths remain intact.
  - Verify: Focused Team Lead settlement/continuation tests and one bounded focus-isolated visible package.

- [ ] **T10: Add visible managed background terminals**
  - Files: `pi/extensions/background-terminal/index.ts`, `pi/extensions/background-terminal/manager.ts`, a background-terminal Herdr relay/adapter, shared low-level Herdr ownership helpers, `pi/tests/background-terminal.test.ts`, `pi/tests/background-terminal-manager.test.ts`, focused relay/damage-control tests, and `pi/skills/pi-extension/references/contracts/background-terminals.md`.
  - Depends on: T6
  - Questions: Q21, Q22.
  - Change: Add `surface?: "headless" | "herdr"` to `bg_start`, default it to headless, and host explicit Herdr commands in owned panes within one dedicated `Background terminals` tab. Add the manager-owned stdout/stderr and exit relay, surface ownership on existing manager entries, reload reattachment, exact-pane manual-closure handling, retained-failure cleanup, and Herdr-loss behavior. Keep `bg_kill`, `/ps`, bounded buffers, spill logs, completion delivery, damage-control preflight, capacity, and Pi-exit cleanup authoritative in the existing manager. Share no subagent lifecycle state or visible capacity.
  - Done when: A visible command preserves separate stdout/stderr, bounded memory and spill behavior, real exit code, exactly-once natural completion, and `/ps` output without transcript scraping; `bg_kill` and manual pane closure terminate only the exact process tree; reload preserves the active entry and pane; success and cancellation close owned resources after settlement; failure may retain only visual ownership; Herdr loss preserves manager truth; headless behavior is unchanged.
  - Verify: Focused manager, relay protocol, damage-control, extension schema, reload, ownership, manual-closure, Herdr-loss, and no-unowned-cleanup tests plus one focus-isolated live dev-server workflow covering start, `/ps`, reload, and `bg_kill`.

- [ ] **T11: Finalize labels, contracts, and rollout evidence**
  - Files: `.specs/herdr-visible-subagents/plan.md`, owning Pi tooling contracts, affected callable schemas/rendering/telemetry, and focused/shared-impact tests.
  - Depends on: T9, T10
  - Change: Review whether session evidence still justifies later `subagent_inspect` and `subagent_modify` aliases; otherwise retain current APIs and improved labels. Reconcile owning contracts, Pi guidance, schemas, rendering, telemetry, background-terminal semantics, and rollback instructions without changing archived historical plans.
  - Done when: Documentation matches behavior, every question is resolved with implementation evidence or a recorded bounded limitation, focused and shared-impact tests pass, Pi typecheck and `git diff --check` pass, and live checks prove accepted subagent and background-terminal cleanup, output, reload, and layout behavior.
  - Verify: Focused and shared-impact Vitest suites, Pi typecheck, `git diff --check`, canonical plan preflight, and the complete live Herdr validation checklist.

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

Review disposition: no finding was deferred. Production implementation remains gated by T2's explicit readiness check.

## Validation

- [ ] Every task-specific focused check passes at its implementation boundary.
- [ ] Live focus-isolated subagent and background-terminal pilots satisfy their recorded lifecycle, authority, output, layout, reload, and cleanup evidence without changing unowned Herdr resources.
- [ ] Headless subagent and background-terminal regression behavior remains unchanged.
- [ ] Pi typecheck and `git diff --check` pass before closeout.

### Focused unit and adapter checks

- Surface defaulting and explicit Herdr gating.
- Windows launch command and non-Windows agent-start path.
- Restricted role loadout construction.
- Herdr response parsing and malformed output.
- Owned pane and tab tracking.
- Cancellation and partial-launch cleanup.
- Existing process and deliverable outcome composition.
- Reload cancellation and owned-resource cleanup.
- Per-item schema normalization.
- Label and later compatibility-alias behavior.
- Background-terminal surface defaulting and explicit Herdr gating.
- Authenticated bounded stdout/stderr and exit relay behavior.
- Existing manager capture, spill, completion, `/ps`, and `bg_kill` composition.
- Background pane ownership, reload reattachment, manual closure, retained failure, and Herdr loss.

### Broker integration checks

- Authenticated registration and identity mismatch rejection.
- Nonblank result delivery and empty-result rejection.
- Foreground and background composition.
- Parent shutdown and recursive cancellation.
- Required-read-path validation before pane launch.
- Existing Pi UI prompt and Herdr blocked-state behavior remains intact.
- Team Lead cutoff, reconciliation, and continuation.

### Live Herdr checks

- One restricted read child.
- One background read with parent continuation.
- Manual pane closure.
- Reload cancellation and owned-pane cleanup.
- `prefix+z` and restoration.
- Primary 1-4 layout.
- Fifth-worker migration and 2x4 tab.
- Team Lead 1+4+4 tab.
- Successful cleanup and retained failure cleanup.
- No unrelated pane or tab closure.
- One visible dev server with distinct stdout/stderr, `/ps` inspection, reload survival, and `bg_kill`.
- One naturally completing visible background command and one retained failed command with explicit owned cleanup.
- Manual background-pane closure and adapter-level Herdr-loss handling.

### Repository gates

Use the cheapest focused checks that exercise each changed contract. Run broader subagent tests when shared run-manager, broker, settlement, or schema behavior changes. Run focused background-terminal and damage-control suites when the background execution surface or relay changes. Final validation includes focused Vitest suites, `pnpm run typecheck`, and `git diff --check`.

## Rollback boundary

- The headless surface remains independently usable throughout rollout.
- Before the read-only pilot is accepted, removing the Herdr adapter and `surface` schema restores prior behavior without task or session migration.
- A failed Herdr launch never silently falls back to headless because explicit visibility intent must remain observable.
- Removing the background Herdr adapter and `bg_start.surface` restores the prior manager-owned headless behavior without migrating terminal records or logs.
- Rollback closes only currently owned experimental or production panes and tabs after their subagent broker or background-manager process boundaries settle.
- No rollback changes the installed Herdr package, global Pi package list, saved task records, or archived plans.

## Retention

Keep incomplete work at `.specs/herdr-visible-subagents/plan.md`. After every task is complete and final validation passes, archive it to `.specs/archive/herdr-visible-subagents/plan.md` through the normal plan closeout workflow.

## Execution Status

- State: T2 complete and validated; T3 is next.
- Blocker: No operator-policy blocker. T2 readiness is recorded; implementation must stop if the atomic transition, strict self-authenticated completion frame, parent-owned structured validator, or unchanged headless path cannot be preserved.
- Evidence: Q1, Q6, and Q8-Q12 have experimental evidence at their stated boundaries. Q16 has idle-load evidence only. Q2 rejected the existing native-delivery assumption. Q3-Q5, Q7, Q13-Q15, Q20, Q21, and Q22 have resolved designs but still require implementation validation. Q17-Q19 are resolved design decisions. Focus-isolated experiments confirmed persistent sessions, exact read-only launch fidelity, stable Pi PID across pane moves, accepted layouts and zoom constraints, eight-idle-child memory near 1 GB, and unchanged operator focus. The temporary worktree and broker experiment were removed and no production runtime code was retained.
- Next: Implement and validate T3-T6 as the bounded read-only Herdr pilot and direct-layout package. Do not enable modifying agents or Team Leads before that gate passes.
- Resume: `/do-it .specs/herdr-visible-subagents/plan.md`
