---
created: 2026-08-31
updated: 2026-09-05
status: ready
---

# Add visible Herdr execution surfaces for governed Pi subagents and background terminals

## Objective

Pi must optionally host governed subagents and managed background terminals in visible Herdr panes while preserving their separate lifecycle authorities. The primary orchestrator and Team Lead layouts must expose active child terminals without making terminal state authoritative for work completion. Long-lived servers, watchers, and concurrent shell work may run in owned Herdr panes while the existing `BackgroundTerminalManager` remains authoritative for process state, bounded output, completion delivery, `/ps`, and `bg_kill`.

## Current baseline and workflow reconciliation

Reviewed against dotfiles HEAD `0097a0d3` on 2026-09-05. This revision changes the plan only; it does not launch Herdr, implement runtime code, or repeat historical tests.

- T1 retains its historical capability evidence, not current production acceptance. T2 is reopened: `tree-runtime.ts` currently declares protocol 4 and only handshake, ping, acquire, register, release, and cancel requests. `subagent-completion.ts` and its named test are absent. `run-manager.ts` settles on process status and removes the controller; it does not implement the claimed separate visible-deliverable transition. The previous 158-test/protocol-5 claim cannot establish completion in this checkout.
- Current read authority is `read`, `grep`, `find`, `ls`, `log_analytics`, `web_search`, and `web_fetch`, not the four-tool experimental loadout. Team Leads have file-reading tools, analytics, and read/write delegation, but no direct shell or mutation. Write workers retain configured execution tools; validation and Git-diff execution belong there without granting unrelated source edits.
- Implementation, test authoring, and integration precede one root-owned final validation phase. Historical task IDs and passing evidence remain, but old per-task runtime gates now belong to final acceptance. Implementing a later surface does not enable it for production before the read-only pilot passes. Source inspection is not runtime proof.
- Herdr automation requires a dedicated named session and pinned socket. An unfocused workspace on the default interactive socket is not isolation. Current move responses include `result.move_result.changed` and `reason`; moves require `--split` for an existing tab and cancel active Herdr agent waits in that workspace. Explicit child pane/tab environment is required.
- The canonical plan is the execution ledger. Default `/do-it` prepares one owned implementation worktree, validates the execution copy before session replacement, and resumes only matching prepared state. Do not mirror these tasks into the durable registry unless separately requested or required by an unattended goal. Do not reset validation or live-attempt limits on handoff.

Owning references: [workflow lifecycle](../../pi/skills/pi-extension/references/contracts/workflow-lifecycle.md), [execution workflow](../../pi/skills/workflow/do-it.md), [subagents and tasks](../../pi/skills/pi-extension/references/contracts/subagents-and-tasks.md), [background terminals](../../pi/skills/pi-extension/references/contracts/background-terminals.md), and [Herdr automation](../../pi/skills/herdr/references/automation.md). Prefer the owning contracts and current source over stale summary text. Read the installed Herdr API schema before adapter implementation; historical experiments are not a schema substitute.

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
- Read-only production pilot, followed by enabling modifying agents and Team Leads only after their final-phase pilot gates pass; author their implementation before that validation phase.
- Clear operator labels for read-only, modifying, and Team Lead tools.
- An optional Herdr execution surface for `bg_start` and corresponding owned-pane lifecycle for `bg_kill`, natural completion, manual pane closure, reload, and failure.
- A manager-owned output and exit relay for pane-hosted background commands; terminal transcript scraping is never an output or completion source.
- Preserve the accepted deferral of `subagent_inspect` and `subagent_modify`; no aliases or naming migration ship in this plan.

### Out of scope for the first production slice

- Installing another Herdr orchestration package.
- Replacing the existing broker, subagent run manager, or `BackgroundTerminalManager`.
- Sharing subagent broker permits, completion transport, run-manager state, or visible-slot accounting with background terminals.
- Transcript scraping as canonical result or background-terminal output delivery.
- Changing the broker's default active-descendant ceiling of eight or its configurable range of 1 through 16.
- Automatic retries or deadline extension.
- Broker-based child clarification; visible children use their existing direct Pi UI prompts and Herdr blocked-state reporting in this plan.
- Production enablement of visible modifying agents, visible Team Leads, or visible continuation before the read-only pilot passes; public tool renaming throughout this plan.
- Editing the archived `.specs/archive/pi-herdr-full-integration/plan.md` or `.specs/archive/reliable-teamlead-settlement/plan.md`.

### Preserve

- Headless execution remains the default.
- Herdr execution is explicit and fails when the requested surface is unavailable.
- The broker authenticates child identity and transports admission, cancellation, and run-bound completion inputs; the existing run manager exclusively commits terminal run outcomes and process-permit settlement.
- Process settlement never implies deliverable completion. An accepted child completion may establish the deliverable before a persistent visible Pi process exits. The process stops through a server-independent bounded termination path before its permit releases; visual pane closure and reflow may occur later.
- Empty required deliverables fail.
- Read-only agents cannot modify files, use raw shell tools, or delegate.
- Preserve the existing enforced boundary for governed file tools and recognized recursive searches. It is not a general sandbox for arbitrary programs launched by write workers. Herdr controls remain parent-owned and never enter child tool authority.
- Preserve current provider routing and restrictions, including Bedrock Claude root restrictions on Team Leads and saved-session continuation; never change model/provider to make a surface test pass silently.
- Preserve single-item Luna read/write `affinityTaskId` semantics, canonical saved-session leasing, immutable profile/skills/role/depth/authority identity, and task correlation. Include surface in reuse eligibility; never silently cross between headless and visible execution.
- Preserve the 64-turn child ceiling, eight-minute read timeout, existing Team Lead budgets, and no added wall-clock deadline for modifying workers.
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
3. The previously accepted later naming migration to `subagent_inspect` and `subagent_modify` remains deferred outside this execution package. Current APIs, including `subagent_teamlead`, remain unchanged.
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

The Q1-Q22 records below retain historical experiments and accepted designs. Their resolved labels apply only to their stated historical boundaries, not production readiness. Current corrections here and in Current baseline take precedence. Source and external-contract uncertainty blocks the affected implementation; behavioral proof is deferred to final validation and gates production enablement, not intermediate development checks. An unresolved acceptance question prevents closeout.

### Q1: Restricted TUI loadout

- Type: Experiment
- Status: Resolved
- Assumption: A pane-hosted Pi TUI can receive the same closed authority as a headless read child while loading the required Herdr lifecycle integration.
- Evidence required: Captured callable tool schema, one successful allowed read, and absence of edit, raw shell, and delegation tools.
- Blocks: Read-only production pilot.
- Resolution: A live Herdr-hosted Pi TUI launched with `--tools read,grep,find,ls --no-skills` exposed exactly `find`, `grep`, `ls`, and `read` in the provider request and successfully read this plan. Edit, write, raw shell, and delegation tools were absent.
- Plan impact: The four-tool experiment proves restricted TUI feasibility only. T3 must use the current seven-tool read allowlist from `contracts.ts`, load the analytics/web extensions explicitly, retain exact selected-skill read exceptions, and deny shell, mutation, discovery activation, delegation, and Onclave. No new interactive authority is required.

### Q2: Authenticated broker settlement

- Type: Experiment
- Status: Resolved - assumption rejected
- Assumption: A pane-hosted child can register and deliver a nonblank result through the existing authenticated broker without terminal transcript parsing.
- Evidence required: Inspect the existing broker protocol and prove or reject a native completion path.
- Blocks: Read-only production pilot.
- Resolution: The current tree broker authenticates identity and supports handshake, ping, acquire, register, release, and cancel, but has no deliverable frame. A temporary broker extension carried one live result, proving feasibility only by changing the protocol; that experimental code and worktree were removed.
- Plan impact: T2 must implement the accepted Q3 authenticated bounded completion channel. Current protocol 4 still has no such channel. Transcript scraping remains rejected; layout experiments do not establish broker delivery.

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
- Plan impact: Retain the Windows `pane run` fallback with explicit model, thinking, skills, tools, cwd, session, and child environment. Set `HERDR_PANE_ID` and `HERDR_TAB_ID` to the created target rather than inheriting the root values; pin the intended socket. Resolve the current available model rather than pinning the experimental model. Require focus-before/focus-after assertions in live adapter validation.

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
- Plan impact: Detect zoom before migration, defer all source-tab moves while zoomed, and verify resulting tab and pane topology after every move. Parse current `result.move_result.changed` and `reason`; a successful RPC is not proof of a move. Use installed-schema `--split` semantics. Moves cancel Herdr agent waits in the workspace, so broker settlement must not depend on those waits.

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
- Plan impact: Treat verified pane disappearance on the reachable pinned Herdr session as cancellation input only for a nonterminal run that owns that exact pane. Transport failure is Q14, not proof that a pane closed. Neither condition implies success, replaces a committed outcome, or triggers cleanup of another resource.

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

### Q20: Process-local ownership metadata

- Type: Design decision followed by implementation validation
- Status: Design resolved; implementation unproved
- Assumption: Existing run-manager state can retain the minimum pane and tab ownership needed for active-run cleanup without introducing a second registry.
- Evidence required: Field-level ownership inventory, atomic visible-slot reservation behavior, reload-hook ordering, and Q5 reload-cancellation evidence after an adapter exists.
- Blocks: Read-only production pilot.
- Resolution: `SubagentRunSnapshot` already retains logical workspace identity, PID, session path, run identity, parent identity, status, outcomes, and execution fingerprint. It does not currently retain execution surface, Herdr workspace ID, tab ID, pane ID, owned-resource flags, layout group, or cleanup/retention state. These fields are required for active-run cleanup and retained-pane ownership, not live reload rebinding.
- Plan impact: Extend existing process-local manager state rather than add a durable registry. Surface ownership needs the pinned Herdr session/socket identity as well as workspace/tab/pane IDs, explicit ownership, layout/package identity, and cleanup/retention state. Ownership must outlive run-history pruning while retained panes exist. Preserve the manager ABI check on reload; incompatible live state must fail explicitly rather than drop controllers, permits, or cleanup records. Keep Herdr status advisory; do not duplicate canonical process or deliverable state.

### Q21: Background-terminal output and exit relay

- Type: Design decision followed by implementation experiment
- Status: Design resolved; implementation unproved
- Assumption: A command running in a Herdr pane can preserve the existing manager-owned bounded stdout/stderr and completion contracts without transcript scraping.
- Evidence required: One pane-hosted command with distinguishable stdout and stderr, output exceeding the in-memory bound and spilling through the existing capped log path, one natural exit, and no dependency on pane transcript text or Herdr lifecycle state.
- Blocks: Visible background-terminal pilot.
- Resolution: Launch the actual command through a small manager-owned relay in the pane. The relay forwards stdout and stderr through an authenticated, size-bounded process-local channel into the existing `BackgroundTerminalManager` capture and reports the real exit status. The manager records the process/PID tree independently and remains the only settlement owner.
- Plan impact: Reuse existing bounded buffers, spill files, completion formatting, and process-tree cleanup. Add no second output store, transcript parser, background run manager, or subagent broker dependency. Missing or malformed relay state fails explicitly. Specify startup authentication, frame/stream bounds, backpressure, disconnect behavior, and exit-versus-output-drain ordering before launch. Prove stdin and signal forwarding for the supported server/watcher workflow; do not claim arbitrary full-screen or TTY-dependent application compatibility from a piped-output relay.

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
- Use a dedicated named `hvs-` Herdr session and pin `HERDR_SOCKET_PATH` to its nondefault socket. Verify `HERDR_ENV=1`, session identity, installed schema, and ownership before controlling resources. Use an unfocused workspace within that isolated session; never run automation against the default interactive socket.
- Record the focused workspace, tab, and pane before each experiment and verify that all remain unchanged afterward.
- Use uniquely named `hvs-` workspaces, tabs, panes, agents, and session files.
- Pass `--no-focus` for every supported create, split, and move operation.
- Do not automate zoom or another focus-sensitive operation without explicit operator permission.
- Record every owned Herdr workspace, pane, and tab ID before launch.
- Close successful experimental resources after evidence capture and close only owned resources.
- The root owns live checks. Stop at the first unexpected focus change, unplanned mutation, wrong socket, unowned-resource effect, unproved process exit, or failed check; record one attempt and cleanup result instead of expanding the experiment. No automatic live retry. Broker/run-manager changes belong to implementation tasks, never ad hoc experiment repair.
- Store expected large output in gitignored `.tmp/` or an OS temporary directory.
- Update the relevant question's Status, Resolution, and Plan impact immediately after each experiment.

## Tasks

Task IDs T1-T11 are preserved. T2 is reopened against current source. For T2-T6 and T8-T10, `Done when` means authored implementation and regression coverage, not observed behavior. Their runtime criteria remain required by T11-T16. No task authorizes intermediate development checks.

- [x] **T1: Establish baseline and capability evidence**
  - Files: This plan and historical temporary experiment artifacts only.
  - Change: Completed focus-isolated capability, launch, layout, movement, zoom, closure, and idle-capacity experiments.
  - Done when: Historical resources were accounted for and removed, and findings were recorded in Q1, Q6, Q8-Q12 and the idle portion of Q16.
  - Verify: deterministic Retain recorded evidence; do not rerun the historical baseline during planning or call it current validation.
  - Evidence: The prior removed experimental worktree recorded a passing 196-test baseline, typecheck, and whitespace check. Experiments recorded exact four-tool TUI authority, persistent sessions, stable Pi PID across moves, accepted geometry and zoom limitations, eight-idle-child memory near 1 GB, and unchanged operator focus. These results do not establish current seven-tool parity, current API schema, isolated-socket compliance, active-load behavior, or production cleanup. Temporary broker code was discarded.

- [ ] **T2: Add run-bound completion transport**
  - Files: `pi/extensions/subagent/tree-runtime.ts`, `run-manager.ts`, `index.ts`, new `pi/extensions/subagent-completion.ts`, focused broker/run-manager/completion/subagent tests, and the owning subagent contract.
  - Depends on: T1
  - Questions: Q2, Q3.
  - Change: Add a versioned, strict-self-authenticated completion frame to the existing broker; register a parent-owned run-bound validator before launch. Retain the 64 KiB broker frame limit and bound completion to 16 KiB and 2,000 lines. Add child-only lifecycle emission, not a model-callable completion tool. Keep headless structured-event and structured-correction paths unchanged.
  - Done when: Source implements one observable first-winner logical transition for completion, cancellation, deadline, and failure, with separate process termination and permit settlement. Authored tests cover wrong-run, empty, malformed, oversized, duplicate, late and post-cancellation inputs, requested structured schemas, race order, and unchanged headless behavior. Accepted completion must not delete the controller or report process exit while a persistent TUI is alive.
  - Verify: deterministic Inspect the complete transition and child hook against installed Pi docs and a working lifecycle example before expansion; execute authored checks only in T11. If the hook cannot distinguish assignment completion from queued steering or unrelated turns, stop the affected implementation and revise the method without weakening run identity.
  - Evidence correction: The prior plan claimed protocol 5 and 158 passing tests. At reviewed HEAD the broker is protocol 4, the emitter/test are absent, and `settle()` removes controllers on process-status settlement. That historical claim is not completion evidence for this checkout.

- [ ] **T3: Add internal Herdr surface ownership and restricted launch**
  - Files: New `pi/extensions/subagent/herdr-surface.ts`, existing subagent `run-manager.ts` and `index.ts`, focused surface/run-manager/authority tests, and the owning subagent contract. Low-level sharing with T10 may live under `pi/lib/`; no module repository changes.
  - Depends on: T2
  - Questions: Q1, Q6, Q20.
  - Change: Add one internal surface seam using current installed Herdr schema. Extend process-local ownership with exact session/socket/workspace/tab/pane identity, ownership flags, layout/package identity, and visual cleanup state. Preserve the manager ABI boundary. Implement the required Windows `pane run` path and schema-supported non-Windows path using the existing resolved role/model/effort/skills/cwd/session/environment configuration.
  - Done when: Source and authored tests cover the current seven-tool read allowlist, exact selected-skill exceptions, inherited Onclave denial, atomic visible-slot reservation before resource creation, partial-launch cleanup, and an independently verified process identity/termination path. Launch readiness cannot be inferred from `pane run` success or agent detection. Parent-owned authenticated registration must bind the actual child process to the run; PID reuse or missing process proof fails closed.
  - Verify: deterministic Inspect one representative internal read-child path and negative authority/response fixtures; defer executable and live proof to T11/T12. Do not expose a public field before T4's cleanup is authored. Missing external schema or a viable independent process-settlement mechanism blocks this task, not unrelated planning work.

- [ ] **T4: Integrate cancellation and failure cleanup**
  - Files: Subagent surface, run manager, index, focused lifecycle tests, and the owning subagent contract.
  - Depends on: T3
  - Questions: Q4, Q5, Q13-Q15, Q20.
  - Change: Integrate startup/active/blocked cancellation, visible-run reload cancellation, parent exit, exact manual pane closure, partial-launch cleanup, retained failed surfaces, and Herdr loss into the T2 transition. Retain cancellation ownership after logical completion until process exit is proven.
  - Done when: Source and tests cover first-winner races, bounded process-tree settlement before permit release, zoom-deferred visual cleanup only, active blocked ownership, detached failed-pane retention, and no unowned cleanup. Reload ordering is explicitly implemented using the process-global manager, not hypothetical disk recovery. Run-history pruning cannot lose retained ownership. Headless session-replacement behavior remains unchanged; visible reload cancellation is an explicit surface-specific addition.
  - Verify: deterministic Inspect lifecycle ordering and ABI compatibility; author transition-level regressions rather than separate patch tests. Run tests in T11 and supported manual-close/reload checks in T12. Failure to preserve an independent cleanup path stops expansion.

- [ ] **T5: Integrate the read-only Herdr pilot surface**
  - Files: Subagent `contracts.ts`, `modern-adapter.ts`, `index.ts`, surface adapter, relevant normalization/rendering tests, and the owning subagent contract.
  - Depends on: T4
  - Questions: Q17, Q20.
  - Change: Add per-item `surface?: "headless" | "herdr"` to `subagent_read`, with explicit unavailable-surface errors and unchanged headless default. Keep independent reads background and dependency gates foreground. Apply the accepted operator labels through existing renderers. Reuse existing telemetry only where surface normalization is necessary; no new telemetry subsystem.
  - Done when: Callable schema and integrated launch path match; tests cover mixed batches, preflight before registration/spawn/background acknowledgement, overlap and cancellation isolation, exactly-once delivery, blank-result failure, unchanged headless behavior, and no authority expansion through steering. Surface participates in Luna affinity eligibility and canonical saved-session leasing; cross-surface reuse rejects before spawn. Current provider restrictions remain intact.
  - Verify: deterministic Inspect schema-to-launch-to-delivery composition and tests; T11/T12 prove behavior. Do not claim the pilot shipped or enable broader visible authority from source inspection alone.

- [ ] **T6: Add adaptive direct-worker layout and pilot fixtures**
  - Files: Subagent surface/index, focused layout tests, isolated live-validation fixtures under `pi/tests/` or `pi/scripts/`, and the owning Herdr/subagent contract.
  - Depends on: T5
  - Questions: Q8-Q11, Q16.
  - Change: Implement the top band for one through four workers and fifth-worker migration to a two-row Subagents tab. Author fixtures for T12 and the T7 active/headless comparison. Use current move-result fields, explicit target environment, and topology verification; do not make cancelled Herdr waits authoritative.
  - Done when: Source and tests preserve pane/process identity, root focus, user resizing, zoom deferral, concurrent slot admission, retained-pane capacity, and configured broker capacity. Measurement fixtures collect startup, memory, CPU, cancellation and parent-response evidence without changing runtime defaults. Model-independent fixtures drive races, capacity, closure and failure; actual provider checks remain bounded integration evidence.
  - Verify: deterministic Inspect layout and fixture contracts; run them only in the final phase. Missing move/zoom schema blocks the affected adapter. Do not repeatedly fill panes with synthetic provider traffic.

- [ ] **T7: Evaluate active capacity and read-only pilot behavior**
  - Files: This plan and private temporary measurement artifacts; the existing Windows churn diagnostic only when triggered.
  - Depends on: T12
  - Questions: Q12, Q16.
  - Change: Run one bounded active-load comparison using the T6 fixture, comparing one, four and eight visible read workers with matching headless work and recording resource use, cancellation and parent responsiveness.
  - Done when: One supported, rejected or blocked evaluation is recorded with measurements and cleanup. A rejected more-than-four recommendation retains explicit opt-in eight-pane capability and a conservative no-default-expansion recommendation; it does not silently lower the accepted layout capacity or change headless defaults.
  - Verify: live Observe operational viability of the active capacity profile; terminate owned processes, prove exit, and remove only owned surfaces after the measurement. Record unavailable evidence rather than retrying or inventing a performance threshold. Source policy still requires no default visibility expansion without supporting evidence.
  - Max attempts: 1
  - Session: Dedicated `hvs-capacity` Herdr session with pinned nondefault socket and isolated Pi state; actual socket and resource IDs recorded before launch.
  - Terminal outcomes: supported | rejected | blocked

- [ ] **T8: Implement visible modifying agents without early rollout**
  - Files: Subagent contracts, modern adapter, index, surface adapter, authority tests, and the owning subagent contract.
  - Depends on: T6
  - Change: Add the surface to `subagent_write` through the same lifecycle seam. Preserve configured shell/mutation authority, foreground mutation ownership, headless behavior, and incident boundaries. Validation workers may execute assigned checks only in the root's final validation phase.
  - Done when: Implementation and regression fixtures cover in-bound writes, governed out-of-bound rejection, steering without expanded authority, manual-close races, and exact saved-session leasing. Do not claim arbitrary shell containment. Production enablement remains blocked on T12; task completion records authored work only.
  - Verify: deterministic Inspect the reused seam and negative authority fixtures; executable tests run in T11 and the disposable modifying workflow in T13. Stop if surface support requires broadening authority.

- [ ] **T9: Implement visible Team Leads and governed descendants**
  - Files: Subagent contracts, modern adapter, index, surface/run manager, Team Lead settlement/continuation tests, and the owning subagent contract.
  - Depends on: T8
  - Questions: Q7, Q12, Q18, Q19.
  - Change: Implement the dedicated 1+4+4 tab, authenticated root-controlled descendant visibility, headless overflow, cutoff/reconciliation, and same-surface consume-once continuation. A Team Lead retains its current delegation-only execution authority.
  - Done when: Source and tests cover eight leaf display slots separately from the lead and broker permits; explicit visible-capacity rejection; scheduler-admitted headless overflow; expiry, second-use, cancellation, authority and surface rejection; and no rerun of completed leaves. Saved-session leases prevent concurrent writers, and stale pane ownership cannot resume another process. An idle retained continuation process still holds its permit until proven stopped; idle never means released capacity. Missing original-pane availability must resolve under the accepted ownership contract before launch, never by guessing a replacement.
  - Verify: deterministic Inspect continuation and tree-cutoff composition; run tests in T11 and the visible package in T14. Do not use a provider route that forbids Team Leads or saved-session continuation. Production enablement waits for the read-only gate.

- [ ] **T10: Implement visible managed background terminals**
  - Files: `pi/extensions/background-terminal/index.ts`, `manager.ts`, new relay/adapter, shared low-level ownership/process helpers, focused manager/relay/schema/damage-control tests, and `pi/skills/pi-extension/references/contracts/background-terminals.md`.
  - Depends on: T4
  - Questions: Q21, Q22.
  - Change: Add optional `bg_start.surface` through the existing manager. Host the actual command in its owned Background terminals tab, with authenticated bounded stdout/stderr/exit relay, stdin/signal forwarding, reload reattachment, exact manual-close handling and retained failure cleanup. Share only low-level ownership primitives and process-tree termination, not subagent state, permits or display slots.
  - Done when: Source and fixtures cover damage-control before registration/creation/spawn, relay startup and malformed frames, bounded buffering/spill/backpressure, drain-before-exit delivery, natural completion, and awaited `bg_kill` consuming the follow-up exactly once. Manager entries and pane identities survive session replacement; process exit triggers tree cleanup and log removal. Herdr loss never establishes exit. Retained visual ownership survives tracked-entry pruning until explicit cleanup.
  - Verify: deterministic Inspect the relay protocol and lifecycle against the existing manager and author focused regressions; run tests in T11 and the exact background workflow in T15. Missing safe authentication, stream bounds, or process proof blocks this task. It does not depend on direct-worker grid layout or Team Lead rollout.

- [ ] **T11: Integrate contracts and run final deterministic validation**
  - Files: Owning Pi contracts, affected guidance/schemas/rendering, `CHANGELOG.md`, implementation and regression files from T2-T6/T8-T10, and this plan.
  - Depends on: T9, T10
  - Change: Finish integration, accepted labels, operator cleanup instructions, contract changes, and the material-change changelog before running the final deterministic batch. Keep aliases deferred. Document live scenarios using the implemented entrypoints and installed schema.
  - Done when: All authored work is integrated and the deterministic Validation batch passes with no unclassified gate failures. This establishes readiness for live evaluation, not production acceptance.
  - Verify: deterministic Execute the named final checks once after integration; record results and affected inputs. On failure apply the single shared repair allowance or stop. No separate full-suite, benchmark, or review pass is implied.

- [ ] **T12: Validate the isolated read-only pilot and direct layout**
  - Files: T6 fixture, private live artifacts, this plan; runtime files are not edited during the attempt.
  - Depends on: T11
  - Change: Run one isolated read-only surface workflow through `subagent_read`, including foreground/background overlap and direct layout lifecycle, using fixture-driven terminal cases and one actual restricted Pi assignment.
  - Done when: The workflow returns a nonblank authenticated deliverable once, proves actual seven-tool loadout without forbidden authority, and satisfies the read-only/layout live criteria below with cleanup. Only a supported result unlocks production enablement of visible writes and Team Leads; rejected or blocked results do not prove acceptance even if the evaluation itself terminates.
  - Verify: live Observe governed read execution from launch through result, cancellation/reload/manual-close and owned cleanup; verify stable IDs and focus before/after migration. Use fixtures for deterministic races rather than relying on a model to choose them. Operator-driven zoom is checked only with explicit permission. Stop after this attempt and record its row.
  - Max attempts: 1
  - Session: Dedicated `hvs-read-pilot` Herdr session with pinned nondefault socket and isolated Pi state; record actual identities before launch.
  - Terminal outcomes: supported | rejected | blocked

- [ ] **T13: Validate a bounded visible modifying workflow**
  - Files: Disposable worktree-local fixture, private artifacts, this plan.
  - Depends on: T12
  - Change: Run one visible write assignment against disposable sentinel files after T12 is supported; do not mutate unrelated repository or live infrastructure state.
  - Done when: In-bound modification and result delivery succeed, governed out-of-bound modification rejects, no steering expands authority, and exact process/pane cleanup completes. Failure cases are fixture-driven, not dependent on a model voluntarily attempting a forbidden edit.
  - Verify: live Observe the visible modifying assignment and sentinel effects, then terminate owned processes and remove only owned surfaces. A rejected/blocked result leaves modifying acceptance unproved.
  - Max attempts: 1
  - Session: Dedicated `hvs-write-pilot` Herdr session with pinned nondefault socket and isolated Pi state.
  - Terminal outcomes: supported | rejected | blocked

- [ ] **T14: Validate a bounded visible Team Lead workflow**
  - Files: Team Lead fixture, private artifacts, this plan.
  - Depends on: T13
  - Change: Run one bounded visible package on a provider route that permits Team Leads and continuation; demonstrate the 1+4+4 layout and same-pane eligible-partial continuation using controlled fixture outcomes.
  - Done when: The package preserves tree budgets/cutoff/reconciliation and automatic result reduction, resumes the eligible partial once in the owned session, does not rerun completed leaves, and cleans owned resources. Deterministic T11 coverage supplies rejection/race permutations; do not multiply provider calls to repeat them.
  - Verify: live Observe package identity, accepted continuation, result and cleanup; stop on unproved process exit, missing original identity, or a rejected/blocked result. No operator approval step is added to normal continuation.
  - Max attempts: 1
  - Session: Dedicated `hvs-teamlead-pilot` Herdr session with pinned nondefault socket and isolated Pi state.
  - Terminal outcomes: supported | rejected | blocked

- [ ] **T15: Validate the visible background-terminal workflow**
  - Files: Background relay fixture, private artifacts, this plan.
  - Depends on: T11
  - Change: Run one isolated `bg_start` -> `/ps` -> `/reload` -> `bg_kill` workflow, with bounded companion natural-success, failed-retention, and manual-close fixtures in the same session.
  - Done when: The actual pane-hosted command preserves distinguishable stdout/stderr, bounded spill, stdin/signal forwarding, real exit status, reload identity and exactly-once output delivery. Successful/terminated commands close only owned surfaces after exit; failed retention remains explicitly cleanable. No subagent permit or display slot is acquired.
  - Verify: live Observe the managed command lifecycle and output, then prove all fixture process trees stopped and clean only owned resources. Herdr-loss failure injection remains deterministic unless a separate isolated server boundary is already available; never interrupt the shared operator server.
  - Max attempts: 1
  - Session: Dedicated `hvs-background-pilot` Herdr session with pinned nondefault socket and isolated Pi state.
  - Terminal outcomes: supported | rejected | blocked

- [ ] **T16: Accept the integrated outcome for closeout**
  - Files: This plan, owning contracts, recorded validation artifacts and owned workflow Git state.
  - Depends on: T7, T12, T13, T14, T15
  - Change: Reconcile every required Completion Evidence item with observed results and documented limits; prepare the accepted plan for the separate Retention closeout boundary.
  - Done when: Required deterministic and live behavior checks pass, Q1-Q22 have current proof or an acceptance-compatible recorded limitation, and no process or owned-resource cleanup remains unresolved. A rejected live evaluation is not successful feature acceptance; Q16 may reject default expansion without rejecting explicit eight-pane support. This checkbox records acceptance, not a completed Git closeout.
  - Verify: deterministic Inspect the accumulated evidence and final changed inputs. Reuse passing checks whose inputs are unchanged; no automatic rerun. Mark acceptance before archive preflight, then follow Retention; overall completion still requires verified closeout. Stop before archival if required behavior remains unproved.

## Remaining-work review

The 2026-09-05 source/contract review replaces the earlier pre-T2 readiness conclusion:

- Reopened T2 rather than relying on missing protocol-5 code and historical test counts. T3 is not currently ready.
- Updated read authority and protected Team Lead execution restrictions, provider limits, optional task correlation and single-item Luna session affinity.
- Moved behavioral checks to the final phase while preserving read-only-before-broader-production gates. T8/T9 can be authored without a premature rollout. T7 remains live evaluation, not an implementation dependency. T10 depends on ownership/lifecycle primitives, not the subagent layout feature.
- Replaced workspace-only isolation with session/socket isolation, current move-result parsing, cancelled-wait handling and explicit child pane/tab environment.
- Added bounded live metadata and a single attempt ledger; missing live prerequisites block the attempt, not earlier safe implementation.
- Corrected logical completion versus persistent-process settlement, ownership retention under pruning, reload ABI compatibility, and background relay drain/delivery risks. These are requirements of the existing accepted lifecycle, not new managers.
- Kept accepted surface/layout/continuation decisions. Deferred aliases, automatic visibility expansion, durable surface registries, new lifecycle reporters, transcript-based result delivery and extra telemetry. No additional review pass is required during execution.

Design assessment: one adapter per lifecycle owner is appropriate; a shared lifecycle manager is not. The highest remaining risk is independent process settlement after logical completion or Herdr loss, followed by current-authority TUI loading, reload ordering, and relay I/O correctness. The file list may change when source evidence supports a simpler complete mechanism; accepted authority and behavior must not change silently.

## Execution Strategy

- This update is planning only. `/do-it` must establish/resume the owned implementation worktree before code changes and verify the prepared plan's bytes, canonical path, branch, execution mode and closeout policy across handoff. Do not overwrite an existing progressed execution copy with this revision; reconcile divergent copies through the existing workflow.
- Implement T2-T6 and T8-T10, author all regression/live fixtures, and integrate contracts/changelog first. Source-review the representative transition before expansion; do not run intermediate tests, typechecks, builds or smoke checks.
- T11 starts the single root-owned final validation phase. Then evaluate T12 before enabling writes/Team Leads, T7 after the read pilot, T13 then T14 for broader authority, and T15 independently after deterministic integration. Finish with T16. These are ordered acceptance checks within one phase, not a separate validation budget per task.
- Independent read inspection/review may run in background with the closed read tools. Command execution requires a bounded write/validator assignment, and no child runs intermediate validation or live commands. Keep dependency gates and the active mutation owner foreground. Completion is pushed; status is exceptional diagnosis, not polling.
- Preserve the plan as the sole ledger unless separate tracking is requested or an unattended goal requires its normal root-task mapping. Record any acceptance-affecting method revision here before reassignment.

## Validation

Timing: After implementation, test authoring and integration settle. T11-T16 form one final phase. Historical T1 tests are not rerun just to recreate a baseline. Record exact added fixture filters and live entrypoints when authored; do not substitute unrelated checks if a required workflow is unavailable.

- [ ] T11 deterministic: From the owned worktree's `pi/`, run `pnpm test subagent-tree-runtime.test.ts subagent-run-manager.test.ts subagent-completion.test.ts subagent.test.ts herdr-surface.test.ts background-terminal-manager.test.ts background-terminal.test.ts damage-control.test.ts` once, adding only newly authored fixture/relay files required by these contracts to that invocation. Expected: protocol authentication/bounds, transition races, authority/affinity, lifecycle, schema, layout and relay checks pass. The absent completion/surface tests must be authored first; missing filters cannot count as coverage.
- [ ] T11 deterministic: Run `pnpm run typecheck` once from that `pi/` directory because broker/manager/schema integration changes shared TypeScript boundaries.
- [ ] T11 deterministic: Run `git diff --check` once from the owning implementation repository. No generic aggregate gate unless changed shared impact requires it.
- [ ] T12-T15 live: Record the observed workflow results in the ledger below, including the exact socket and resources, timing/process proof and cleanup. Required behavior must be supported before acceptance.
- [ ] T7 live: Record the active/headless comparison and supported recommendation or explicit no-default-expansion limitation. No new arbitrary latency or memory threshold is inferred from historical measurements.
- [ ] T16 deterministic: Direct inspection reconciles Completion Evidence and Q1-Q22 against current source and retained passing results, and normal canonical-plan closeout preflight verifies machine-consumed state.

### Required behavioral coverage

- Broker: self-authentication, run identity, nonblank/structured output, frame bounds, late/duplicate rejection, first-winner races, persistent process separation, headless equivalence and bounded foreground/background output.
- Launch/authority: current read allowlist, selected-skill exception, Team Lead delegation-only tools, configured write tools, required-read preflight, catalog/provider constraints, unavailable surface, canonical saved-session leases and cross-surface rejection.
- Lifecycle: startup/active/blocked cancellation, parent exit, foreground/background isolation, reload ABI/cleanup ordering, exact manual close, Herdr loss, process-exit proof before permit release, and retained ownership surviving history pruning. Inability to prove exit is a failure, never inferred success.
- Layout: one through four workers above an unchanged root; fifth-worker migration and two rows of four; stable pane/PID identity; installed-schema no-op results; cancelled Herdr waits; focus preservation; zoom deferring visuals only; retained capacity and atomic reservation cleanup; Team Lead plus eight leaves and broker capacity independence.
- Team Leads: cutoff, queued removal, recursive cancellation, reconciliation reserve, reduction, eligible partial reuse, expiry/second-use/authority/surface rejection, no completed-leaf replay, provider restrictions, and bounded retention.
- Background: damage-control before side effects, authenticated bounded relay, stdout/stderr separation, spill/backpressure, input/signals, drain-before-exit ordering, `/ps`, natural completion, kill consuming completion, reload survival, retained failure cleanup, exact manual close and independent process cleanup.

### Failure and attempt bounds

Classify the first failed final check as fixture/harness, product, external-contract misunderstanding or protocol violation before editing. At most one focused development repair batch and one targeted rerun of affected deterministic checks is allowed for the entire requested outcome. Preserve unchanged passing checks. If failures remain, stop patching, reassess mechanism and harness, and report before further execution. A changed signature, delegation, task boundary, or resumed session does not reset the allowance.

Each live task has one attempt. Before it starts, the root verifies authorization, actual isolated target/socket, installed schema, cap, stop condition and cleanup. Record one ledger row after the attempt and stop that evaluation. Fixture or external-contract failure never authorizes another live attempt; inspect maintained docs and installed schema for the latter. Another live attempt requires explicit operator authorization, recorded in the existing ledger. No process polling or background timer substitutes for pushed completion or the scheduler.

## Live attempt ledger

| Task | Attempt | Preconditions | Result | Cleanup | Disposition |
| --- | --- | --- | --- | --- | --- |

Historical T1 experiments remain in Q1-Q22; no T7/T12-T15 attempt has run under this revision. Planning performs no live action.

## Rollback boundary

- Headless remains the compatibility default throughout. Explicit Herdr failure never silently falls back.
- Before production enablement, remove the optional surface wiring and adapter only after exact owned processes settle. Retain safe ownership records for any visual cleanup still pending; never discard unproved live state to satisfy rollback.
- Background rollback keeps the existing manager/output contracts and headless entries. Subagent rollback keeps the broker/run manager/task separation. Neither closes unowned resources, changes the installed Herdr package or global Pi packages, nor rewrites task/session history.
- Existing stateful-infrastructure backup/restore rules still apply if a later request introduces a live stateful target; this plan authorizes only isolated local fixtures and owned terminal resources.

## Retention

Keep incomplete work at `.specs/herdr-visible-subagents/plan.md`. After all required behavior is accepted, `/do-it` archives the complete directory to `.specs/archive/herdr-visible-subagents/` in its owned implementation worktree, commits in-scope nonignored artifacts, merges `--no-ff` into the primary branch, verifies merged HEAD and archive/ownership state, and removes only its owned worktree/branch through normal closeout verification. Ignore rules remain authoritative; never force-add an ignored spec. Failed or incomplete closeout preserves the recovery worktree and plan. An explicit workflow no-merge/in-place option retains its owning contract; this plan does not select either exception.

## Execution Status

- State: Ready for implementation; T1 historical experiments retained, T2 reopened, T3-T16 incomplete.
- Blocker: No operator design decision blocks T2. Current installed Herdr schema and independent process identity/termination proof are implementation prerequisites; isolated-session availability and authorization are later live prerequisites, not assumed facts.
- Next: T2, in the `/do-it` owned implementation worktree. Do not resume at T3 from the previous status.
- Current frontier: T2 transport and terminal-transition implementation; no current visible runtime implementation or final acceptance is established by this plan.
- Validation progress: This revision used source/contract inspection and the current `parseLinkedPlan`/`selectNextPlanTask` parser: 16 tasks, valid dependency graph, only T1 checked, T2 selected next, and five live tasks with valid one-attempt/session/outcome metadata. Historical T1 results remain scoped to the removed experiment; the prior T2 claim is contradicted by current source. No development tests or live attempts ran during this update. One shared final-phase repair batch and targeted deterministic rerun remain; each future live task has its stated cap.
- Resume: `/do-it .specs/herdr-visible-subagents/plan.md`
