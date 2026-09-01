---
created: 2026-08-31
status: draft
---

# Add visible Herdr execution surfaces for governed Pi subagents

## Objective

Pi must optionally host governed subagents in visible Herdr panes while preserving the existing broker, authority, task, deadline, continuation, background-delivery, and deliverable-settlement contracts. The primary orchestrator and Team Lead layouts must expose active child terminals without making terminal state authoritative for work completion.

## Completion evidence

- A read-only pane-hosted Pi child has the same closed tool authority as its headless equivalent, registers with the authenticated broker, and returns a nonblank validated deliverable without transcript scraping.
- Foreground and background Herdr runs compose through the existing run manager with process state, process outcome, and deliverable outcome remaining separate.
- Cancellation, reload, pane closure, and Herdr failure settle without closing unowned panes or bypassing Team Lead cutoff and reconciliation bounds.
- The primary layout shows one through four direct workers above the primary orchestrator; the fifth worker creates one dedicated tab containing all active direct workers, up to eight.
- A visible Team Lead receives one dedicated tab with the lead above as many as eight visible leaves in two rows of four.
- `prefix+z` allows focused interaction and restores the prior layout without changing broker identity or authority.
- Focused tests, live Herdr checks, Pi typecheck, and `git diff --check` pass.

## Boundaries

### In scope

- An optional Herdr execution surface behind the existing subagent run manager.
- Windows `pane run` plus recognized-agent detection as the Pi launch fallback.
- Broker-connected read-only feasibility experiments in an isolated Git worktree.
- Owned pane and tab lifecycle, layout, reload recovery, cancellation, and surface telemetry.
- Read-only production pilot, followed by modifying agents and Team Leads only after their gates pass.
- Clear operator labels for read-only, modifying, and Team Lead tools.
- A later compatibility migration to `subagent_inspect` and `subagent_modify` after the execution surface is stable.

### Out of scope for the first production slice

- Installing another Herdr orchestration package.
- Replacing the existing broker or process-local run manager.
- Transcript scraping as canonical result delivery.
- Changing the broker's default active-descendant ceiling of eight or its configurable range of 1 through 16.
- Automatic retries or deadline extension.
- Broker-based child clarification; visible children use their existing direct Pi UI prompts and Herdr blocked-state reporting in this plan.
- Visible modifying agents, visible Team Leads, continuation changes, or public tool renaming before the read-only pilot passes.
- Editing the archived `.specs/archive/pi-herdr-full-integration/plan.md` or `.specs/archive/reliable-teamlead-settlement/plan.md`.

### Preserve

- Headless execution remains the default.
- Herdr execution is explicit and fails when the requested surface is unavailable.
- The broker remains authoritative for identity, authority, result delivery, and settlement.
- Process settlement never implies deliverable completion.
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

## Accepted workflow decisions

1. The first implementation retains `subagent_read`, `subagent_write`, and `subagent_teamlead` as API names.
2. Operator labels become `Read-only subagent`, `Modifying subagent`, and `Team Lead package`.
3. A later naming migration introduces `subagent_inspect` and `subagent_modify` with temporary compatibility aliases. `subagent_teamlead` retains its name.
4. `surface` applies to the requested child only. Visible descendant policy is explicit and root-controlled.
5. Herdr remains opt-in and headless remains the default.
6. Successful panes close only after broker result capture. Failed and blocked panes remain visible.
7. Failed and blocked panes consume visible capacity until the operator closes them.
8. `/reload` must rebind existing owned panes instead of duplicating or abandoning them.
9. Layout management acts only on owned-pane start, owned-pane closure, or threshold migration. It does not continuously force an ideal grid.
10. `prefix+z` is the supported focused-interaction mechanism. No pane promotion registry is required.
11. A user-steered child remains attached to the same run, task, authority, and validation requirements.
12. Tool-name migration remains separate from the first Herdr implementation.
13. A layout displays at most eight pane-hosted descendants. Explicit per-item Herdr requests beyond visible capacity fail before spawn; a Team Lead's root-controlled descendant-visibility policy means "up to eight visible", with additional scheduler-admitted descendants remaining headless.
14. Visible capacity and broker scheduling capacity are separate contracts. Retained failed or blocked panes consume visible capacity but do not consume a settled process permit.

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

- Type: Experiment
- Status: Open
- Assumption: The existing run manager can supervise a Herdr-hosted process while Herdr state remains optional process evidence rather than a second run state machine.
- Evidence required: One run showing canonical process state, process outcome, and deliverable outcome with Herdr idle or done unable to force completion.
- Blocks: Execution-surface integration.
- Resolution:
- Plan impact:

### Q4: Bounded cancellation

- Type: Experiment
- Status: Open
- Assumption: Startup, active-turn, blocked-prompt, pane-closure, parent-shutdown, and Team Lead cutoff cancellation settle within existing bounds.
- Evidence required: Timed startup and active cancellation cases plus one bounded Team Lead tree covering admission cutoff, queued-descendant removal, active-descendant cancellation, reconciliation reserve, broker settlement, and owned-pane cleanup.
- Blocks: Modifying agents and Team Leads.
- Resolution:
- Plan impact:

### Q5: Reload rebinding

- Type: Experiment
- Status: Open
- Assumption: `/reload` can rebind run, pane, tab, and ownership metadata without duplicate panes or lost background delivery.
- Evidence required: A running background child survives reload, returns one result, and is cleaned up once.
- Blocks: Read-only production pilot.
- Resolution:
- Plan impact:

### Q6: Windows launch fidelity

- Type: Experiment
- Status: Resolved at the launcher boundary
- Assumption: `herdr pane run` plus auto-detection preserves the resolved model, effort, skills, cwd, session, and authority launch configuration.
- Evidence required: Focus-isolated child output and saved-session metadata matching explicit launch inputs without global settings mutation.
- Blocks: Read-only production pilot.
- Resolution: In dedicated unfocused workspace `w12`, `pane run` launched and auto-detected Pi in the requested repository cwd with `openai-codex/gpt-5.6-sol`, low thinking, `--no-skills`, and exactly `find`, `grep`, `ls`, and `read`. The child read this plan and returned `Q6_SESSION_OK`. Its 39,564-byte persistent session contained the matching model and thinking entries plus assistant messages. The active operator pane remained `wX:p7` before, during, and after the experiment. The owned workspace and scratch session were removed. Production role identity and full run-manager fingerprint composition remain part of Q3 rather than the launcher boundary.
- Plan impact: Retain the Windows `pane run` fallback with explicit model, thinking, skills, tools, cwd, session, and child environment. Require focus-before/focus-after assertions in live adapter validation.

### Q7: Team Lead continuation surface

- Type: Experiment and design decision
- Status: Open
- Assumption: A saved eligible partial Team Lead session can continue on a Herdr surface under the existing consume-once identity and authority checks.
- Evidence required: One eligible partial, one successful continuation, second-use rejection, and authority-narrowing rejection without session-path exposure.
- Blocks: Visible Team Lead continuation.
- Resolution:
- Plan impact:

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
- Plan impact: Defer automatic successful-pane closure and layout reflow while any pane in the tab is zoomed. Cleanup resumes after the operator restores the normal layout.

### Q12: Team Lead 1+4+4 usability

- Type: Experiment
- Status: Partially resolved
- Assumption: A Team Lead and eight leaves remain identifiable in one tab even when detailed interaction requires zoom.
- Evidence required: Live 1+4+4 geometry and operator acceptance that panes are status surfaces rather than full reading surfaces.
- Blocks: Visible Team Lead layout rollout.
- Resolution: At the current 285x76 area, the Team Lead received 285x25 and each of eight worker panes received approximately 71x25. The layout is mechanically correct and panes remain identifiable. Smaller terminal sizes were not tested; the operator accepted that any visible output improves on none and detailed review uses `prefix+z`.
- Plan impact: Treat 1+4+4 as a status-wall layout. Do not block on arbitrary smaller-size targets, but preserve zoom and avoid focus-changing automated zoom tests.

### Q13: Manual pane closure

- Type: Experiment
- Status: Open
- Assumption: Closing an active child pane produces a deterministic failed or cancelled run and never a successful deliverable.
- Evidence required: Manual close during startup and active work, with canonical settlement and no duplicate cleanup.
- Blocks: Read-only production pilot.
- Resolution:
- Plan impact:

### Q14: Herdr server loss

- Type: Experiment
- Status: Open
- Assumption: Loss of the Herdr command or server boundary fails active surface operations explicitly while preserving broker and task truth.
- Evidence required: A safely contained server or socket interruption with observed run outcome and no unrelated pane closure.
- Blocks: Production rollout.
- Resolution:
- Plan impact:

### Q15: Retained pane lifecycle

- Type: Experiment
- Status: Open
- Assumption: Failed and blocked panes can remain visible without preventing run-manager disposal, reload, or later explicit cleanup.
- Evidence required: A retained failed pane after logical settlement, reload, detached metadata, and explicit owned-pane cleanup.
- Blocks: Failure retention rollout.
- Resolution:
- Plan impact:

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
- Status: Provisionally resolved
- Decision: `surface` is per item so mixed batches remain possible. Default is `headless`.
- Reopen when: Contract normalization or run composition cannot preserve one surface per item without duplicate execution paths.
- Resolution: Use per-item `surface?: "headless" | "herdr"` in the read-only pilot.
- Plan impact: Modern adapter normalizes the field before run registration.

### Q18: Visible descendant policy

- Type: Design decision informed by implementation
- Status: Provisionally resolved
- Decision: Visibility does not implicitly propagate. A root-controlled descendant surface policy is required for visible Team Lead leaves and means up to eight visible descendants; additional scheduler-admitted descendants remain headless. Explicit per-item Herdr requests fail before spawn when visible capacity is exhausted.
- Reopen when: Authenticated tree context cannot propagate display ownership without granting children layout authority, or experiments show that bounded headless overflow cannot preserve package result composition.
- Resolution: Use authenticated root-owned layout context and keep visible admission separate from broker process permits.
- Plan impact: The Team Lead feasibility gate must prove both headless overflow and explicit visible-capacity rejection before production rollout.

### Q19: Continuation fingerprint membership

- Type: Design decision informed by Q7
- Status: Open
- Assumption: Surface is an execution presentation choice rather than authority, but TUI versus headless mode may affect safe session continuation.
- Evidence required: Q7 results plus execution-fingerprint comparison.
- Blocks: Visible Team Lead continuation.
- Resolution:
- Plan impact:

### Q20: Persistent ownership metadata

- Type: Experiment and design decision
- Status: Partially resolved by field inventory
- Assumption: Existing run-manager state can retain the minimum pane and tab ownership needed for reload without introducing a second registry.
- Evidence required: Field-level ownership inventory plus Q5 live reload evidence after an adapter exists.
- Blocks: Read-only production pilot.
- Resolution: `SubagentRunSnapshot` already retains logical workspace identity, PID, session path, run identity, parent identity, status, outcomes, and execution fingerprint. The manager is stored under a `globalThis` symbol with ABI validation and is intentionally reused across compatible extension reloads. It does not currently retain execution surface, Herdr workspace ID, tab ID, pane ID, owned-resource flags, layout group, or cleanup/retention state. Q5 remains open because no adapter exists to rebind those fields against live Herdr topology.
- Plan impact: Extend the existing snapshot rather than create a second registry. The minimum additional surface record is `surface`, Herdr workspace/tab/pane IDs, explicit ownership for each resource, layout group or package identity, and cleanup/retention state. Keep Herdr agent status advisory and do not duplicate canonical process or deliverable state.

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

- [x] **T1: Establish the experimental worktree and baseline**
  - Change: Create the owned worktree and branch, verify the current focused subagent settlement suite and Pi typecheck, and record installed Pi and Herdr versions. Do not change production schemas.
  - Done when: The worktree is clean, baseline checks pass or existing failures are recorded, and all live Herdr resources created by later tasks have a deterministic ownership prefix.
  - Verify: Focused subagent tests, `pnpm run typecheck`, `git diff --check`, `pi --version`, `herdr --version`, and `herdr status server`.
  - Evidence: Created and later removed the owned `workflow/herdr-visible-subagents` worktree after it expanded beyond the intended throwaway scope. Before removal, the eight focused files passed with 196 tests; `pnpm run typecheck` and `git diff --check` passed. Runtime versions were Pi `0.84.4`, Herdr `0.8.2-preview.2026-08-31-b1ff4582e968`, protocol 21, Node `v25.9.0`, and pnpm `11.23.0`; `herdr status server` reported running and compatible. The temporary broker and completion extensions were not retained. Further capability questions use the limited no-code protocol above.

- [ ] **T2: Prove restricted TUI authority and broker delivery**
  - Depends on: T1
  - Questions: Q1, Q2, Q3, Q6
  - Change: Build the smallest throwaway execution slice that launches one read-only TUI child through Herdr with the current role loadout and broker credentials. Do not add public `surface` schema yet.
  - Done when: Allowed and prohibited tool evidence passes, authenticated nonblank broker delivery succeeds, malformed or mismatched delivery fails, and no terminal transcript parsing determines completion.
  - Stop when: Exact read-only authority or broker delivery cannot be preserved. Record falsifying evidence and revise the plan before production work.

- [ ] **T3: Prove cancellation, reload, and failure recovery**
  - Depends on: T2
  - Questions: Q4, Q5, Q13, Q14, Q15, Q20
  - Change: Exercise startup and active cancellation, manual pane closure, root reload, root shutdown, retained failures, and a safely contained Herdr boundary interruption. Also run one bounded Team Lead tree through admission cutoff, queued-descendant removal, active-descendant cancellation, and reconciliation reserve.
  - Done when: Every case produces one canonical settlement, the Team Lead tree reconciles within its existing reserve, no owned resource is cleaned twice, no unowned resource is closed, and reload delivers one background result.
  - Stop when: Herdr process ownership requires a parallel scheduler or cannot satisfy existing cancellation, cutoff, or reconciliation bounds.

- [ ] **T4: Prove primary and Team Lead layouts**
  - Depends on: T2
  - Questions: Q8, Q9, Q10, Q11, Q12
  - Change: Build disposable live tabs for the primary 1-4 layout, fifth-worker migration, 2x4 direct-worker tab, Team Lead 1+4+4 tab, closure reflow, and zoom behavior.
  - Done when: Pane identities survive moves, focus remains stable, zoom restores correctly, and all owned experiment resources are cleaned.

- [ ] **T5: Measure visible-child capacity**
  - Depends on: T2
  - Questions: Q16
  - Change: Measure one, four, and eight interactive children against the headless baseline. Run the repository's Windows process-churn diagnostic only when observed system behavior or relevant event evidence indicates it.
  - Done when: Evidence supports or rejects enabling more than four visible children and records any bounded fallback.

- [ ] **T6: Record experiment resolutions and pass the production feasibility gate**
  - Depends on: T3, T4, T5
  - Change: Fill every experiment-backed question's Resolution and Plan impact fields. Separate confirmed facts from deferred policy decisions.
  - Done when: Q1-Q6, Q8-Q16, and Q20 are resolved or explicitly block production. No production schema changes begin before this gate passes.

- [ ] **T7: Add clear labels and the execution-surface seam**
  - Depends on: T6
  - Change: Update operator labels without renaming APIs. Add one execution-surface abstraction behind the current run manager, keep headless behavior unchanged, and implement Herdr launch, observation, cancellation, and owned-resource cleanup without duplicating lifecycle state. Update the owning stable subagent and Herdr contracts in the same change.
  - Done when: Existing headless tests remain unchanged in behavior, surface selection is internal, Herdr metadata cannot force deliverable completion, and the stable contracts describe the new labels and internal ownership boundary.

- [ ] **T8: Ship the read-only Herdr pilot**
  - Depends on: T7
  - Questions: Q17, Q20
  - Change: Add per-item `surface?: "headless" | "herdr"` to the read-only modern interface, default it to headless, fail explicit Herdr requests outside a valid environment, and route foreground and background results through the existing run manager. Update the owning stable contract in the same change.
  - Done when: One foreground and one background governed read complete through the broker, empty output fails, reload rebinds, cancellation settles, owned cleanup follows the accepted policy, and the callable schema and stable contract agree.

- [ ] **T9: Add the primary orchestrator layout**
  - Depends on: T8
  - Change: Add the one-through-four top band and fifth-worker migration to one 2x4 `Subagents` tab. Respect zoom, focus, retained-pane capacity, user resizing, and the separate configured broker ceiling. Update the owning Herdr workflow contract in the same change.
  - Done when: The live layout contract and all Q8-Q11 evidence pass through the production adapter, explicit visible-capacity exhaustion fails before spawn, and additional scheduler-admitted headless work remains unaffected.

- [ ] **T10: Enable visible modifying agents**
  - Depends on: T8
  - Change: Permit the Herdr surface for modifying leaves while preserving foreground default, exact authority, required validation, and incident boundaries. Update the owning stable subagent contract in the same change.
  - Done when: In-bound modification succeeds, out-of-bound modification fails, manual interaction cannot expand authority, pane closure cannot report success, and the stable contract matches executable behavior.

- [ ] **T11: Resolve Team Lead surface feasibility before production**
  - Depends on: T3, T4, T5, T9, T10
  - Questions: Q7, Q12, Q18, Q19
  - Change: Use throwaway Team Lead runs to prove root-controlled descendant visibility, up-to-eight visible capacity with headless overflow under a configured scheduler ceiling above eight, explicit per-item capacity rejection, private consume-once continuation, and the execution-fingerprint decision. Do not add the public Team Lead surface contract in this task.
  - Done when: Q7, Q12, Q18, and Q19 have recorded resolutions; second-use and authority-narrowing continuation cases fail; no session path is exposed; and the evidence either admits or blocks production Team Lead work.
  - Stop when: Surface selection weakens continuation identity, bypasses cutoff or reconciliation, or requires child-controlled layout authority.

- [ ] **T12: Enable visible Team Leads and descendants**
  - Depends on: T11
  - Change: Add the proven explicit root-controlled descendant visibility, dedicated 1+4+4 Team Lead tab, existing cutoff and reconciliation behavior, visible-capacity policy, and consume-once continuation on the Herdr surface. Update the owning stable subagent and Herdr contracts in the same change.
  - Done when: Configured broker ceilings remain unchanged, up to eight workers are visible, additional policy-eligible descendants remain headless, explicit capacity exhaustion rejects before spawn, admission cutoff and recursive cancellation pass, deterministic deliverable reduction remains intact, and continuation never exposes a session path.

- [ ] **T13: Evaluate canonical tool-name migration**
  - Depends on: T12
  - Change: Review session evidence after the surface is stable. If confusion remains material, introduce `subagent_inspect` and `subagent_modify` with thin compatibility aliases and canonical telemetry normalization, updating the owning stable contract in the same change. Otherwise retain existing API names and improved labels.
  - Done when: The evidence-backed naming decision is recorded. If aliases are introduced, old and new names converge before run registration and produce identical authority, lifecycle, and telemetry behavior.

- [ ] **T14: Final contract consistency and validation**
  - Depends on: T13
  - Change: Review the already-updated stable contracts, Pi guidance, callable schemas, operator rendering, telemetry, and rollback instructions for consistency. Preserve archived plans as historical evidence; do not defer first-time contract updates to this task.
  - Done when: Documentation matches executable behavior, focused and shared-impact tests pass, Pi typecheck and `git diff --check` pass, and live Herdr checks prove the accepted layouts and cleanup behavior.

## Validation strategy

### Focused unit and adapter checks

- Surface defaulting and explicit Herdr gating.
- Windows launch command and non-Windows agent-start path.
- Restricted role loadout construction.
- Herdr response parsing and malformed output.
- Owned pane and tab tracking.
- Cancellation and partial-launch cleanup.
- Existing process and deliverable outcome composition.
- Reload serialization or reconstruction.
- Per-item schema normalization.
- Label and later compatibility-alias behavior.

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
- Reload rebinding.
- `prefix+z` and restoration.
- Primary 1-4 layout.
- Fifth-worker migration and 2x4 tab.
- Team Lead 1+4+4 tab.
- Successful cleanup and retained failure cleanup.
- No unrelated pane or tab closure.

### Repository gates

Use the cheapest focused checks that exercise each changed contract. Run broader subagent tests when shared run-manager, broker, settlement, or schema behavior changes. Final validation includes focused Vitest suites, `pnpm run typecheck`, and `git diff --check`.

## Rollback boundary

- The headless surface remains independently usable throughout rollout.
- Before the read-only pilot is accepted, removing the Herdr adapter and `surface` schema restores prior behavior without task or session migration.
- A failed Herdr launch never silently falls back to headless because explicit visibility intent must remain observable.
- Rollback closes only currently owned experimental or production panes and tabs after their broker boundaries settle.
- No rollback changes the installed Herdr package, global Pi package list, saved task records, or archived plans.

## Retention

Keep incomplete work at `.specs/herdr-visible-subagents/plan.md`. After every task is complete and final validation passes, archive it to `.specs/archive/herdr-visible-subagents/plan.md` through the normal plan closeout workflow.

## Execution status

- State: Evidence gathering; production implementation not started.
- Blocker: Q2 established that the current broker has no deliverable channel, and Q3 cannot be proved until one bounded authenticated result-channel design is selected and integrated with the existing run manager.
- Evidence: Q1, Q6, Q8, Q9, Q10, and Q11 are resolved at their stated boundaries. Q12, Q16, and Q20 have bounded partial evidence. Focus-isolated experiments confirmed persistent sessions, exact read-only launch fidelity, stable Pi PID across pane moves, eight-idle-child memory near 1 GB, and unchanged operator focus. The temporary worktree and broker experiment were removed and no production runtime code was retained.
- Next: Stop capability experiments that require a production adapter. Review the smallest authenticated bounded result-channel options against the existing run-manager settlement path, then revise T2 before implementation.
