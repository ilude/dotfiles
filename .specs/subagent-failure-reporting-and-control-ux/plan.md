---
created: 2026-09-09
status: draft
completed: null
---

# Report real subagent failures and clarify controls

## Goal and scope

User requirement: address the subagent errors and duplicated presentation investigated from the operator's screenshots. Preserve meaningful failure causes, make available controls clear, and avoid assignments that require inaccessible evidence.

Proposed bounded implementation:
- Preserve terminating tool failures instead of replacing them with a blank-output diagnosis.
- Align delegation instructions with existing workspace access.
- Explain continuation eligibility accurately and mark rejected tool operations as native errors.
- Render each status, error, and timing field once in a combined tool row without losing useful metadata.

Non-goals: new live-steering API, external documentation grants, automatic retries, accepting blank output as success, general failure recovery, a new telemetry store, pane retention changes, layout/title changes, legacy changes, or refactor-review backlog items. Active-child reload teardown/migration/recovery is explicitly excluded under AIF-022. Ordinary cleanup remains required but its separate reliability work is not absorbed here. Do not constrain interactive steering of the orchestrator or change command delivery.

Authorization: planning only. No implementation, commit, merge, push, or deployment authorized by this request. Mechanisms below are proposals for approval, not previously settled operator requirements. Authorization to execute this plan includes local task commits and integration into the recorded target unless explicitly restricted; push and deployment remain separate.

## Context for a fresh session

All code paths below are relative to `C:/Users/mglenn/.dotfiles` (the dotfiles repository). No module changes are planned. Read applicable instructions again before execution.

- Merge target: dotfiles `main`, verified during planning.
- Proposed execution branch: `fix/subagent-failure-reporting`.
- Proposed worktree: sibling `../dotfiles-subagent-failure-reporting`; not created. Verify it is unoccupied before use.
- Required predecessor: `.specs/default-subagent-cleanup-failures/plan.md` must finish and merge into `main` before this plan's implementation starts. Read its archived plan if already integrated. Create the UX worktree from that updated `main`, or safely integrate the predecessor into an existing worktree. Record the cleanup integration commit and verify it is an ancestor of the UX worktree HEAD before T1.
- Existing concurrent changes during planning: `pi/profiles/default/skills/agent-process/references/failure-log.md` and `instruction-feedback.md`. Preserve them; do not commit them as task work. Recheck on execution and integration.
- This plan is initially uncommitted in the main checkout. Carry its task-owned contents into the worktree without discarding the original or concurrent edits.

Required reading:
- Root `AGENTS.md`, `pi/README.md`, default-profile instructions, `pi/profiles/default/docs/subagents.md`.
- `pi/profiles/default/extensions/subagents.ts` and `extensions/subagent-child.ts`.
- `pi/profiles/default/lib/subagents/{workspace,child-surface,rpc,visible,presentation,launch}.ts`.
- Relevant tests named in the tasks and the default `testing` skill before modifying tests.
- AIF-020/021/022 and APR-011/014 in the existing agent-process feedback/failure logs. Preserve useful transcript metadata, settled operator decisions, and narrow scope.
- Installed Pi extension/TUI documentation before changing those APIs. Resolve it from the installed package as described by the active instructions, not a hardcoded pnpm-store hash.

### Verified starting behavior

Investigation on 2026-09-09 established:

1. Original child `dc618e6a-209c-4106-b187-5f0d386d2278` (Clara) was running, connected, and `retained: false` when a parent `message` was rejected at 14:12:01 UTC. `RpcChild.message()` checks retention/liveness before working state. Retention alone would not have permitted a message during active work.
2. Native child session `01a08681-7a38-738d-84da-3e1902868792` ends with assistant record `f93c859d`, a `toolUse` read of the installed SDK's `docs/extensions.md`, followed by tool-result record `aa5e283d` at 14:12:21.410 UTC: `Native path is outside the assigned workspace`. There is no subsequent final assistant reply. The original assignment requested installed Pi docs.
3. `guardNativePath()` allows the workspace and exact selected skill files for read. The child authority extension returns `block: true, terminate: true` for violations. Pi's installed core carries `result.terminate` on `tool_execution_end`; it ends a tool batch when all finalized calls terminate.
4. `child-surface.ts` records assistant text and model error/abort, but ignores terminating tool errors. `visible.ts` consequently receives empty text without the denial reason; `rpc.ts` substitutes `Blank output is not assignment completion`. Headless handling has the same missing failure category and must be covered too.
5. `presentation.ts` updates the call header with state/timing/error and separately renders them in the result body, causing the screenshot duplication.
6. The rejected control operation is persisted with native `isError: false`. `extensions/subagents.ts` returns an extra `isError` property, but the installed core treats a normally returned tool execution as successful unless the supported error path changes it.
7. A second helper, `d8c01ad5-4bb0-46fe-93a9-2db8d09a50bd`, failed with the same generic label during investigation. Its underlying cause was not verified. Do not claim another proven workspace denial or make investigating all historical failures a prerequisite.

These are bounded log/source findings, not a failure-rate survey. Original evidence queried only two exact default-profile sessions. Do not copy private transcripts, reasoning, or absolute user-specific paths into regression fixtures.

### Pi profiles

- Planning profile: default, verified from `PI_CODING_AGENT_DIR=C:\Users\mglenn\.dotfiles\pi\profiles\default` and `scripts/pp` default mapping.
- Intended implementation/validation profile: the task worktree's `pi/profiles/default` source and dependencies. Disposable fixtures must load task-worktree code, not the production checkout by accident.
- Legacy and other named profiles remain unchanged.

| Date | Actual profile/path | Work or check | Result |
| --- | --- | --- | --- |
| 2026-09-09 | default / `pi/profiles/default` in main checkout | Source/log investigation and plan creation | No implementation or runtime validation of fixes |

## Decisions and contracts

| Decision | Status | Proposed choice |
| --- | --- | --- |
| D1: Real failure provenance | Proposed | Capture terminating tool error metadata from the actual event stream; use the existing bounded authenticated result channel, not session scraping. |
| D2: Documentation access | Proposed minimal solution | Keep path authority unchanged. Tell parent/child explicitly what native reads allow; parent supplies needed external excerpts in the assignment or answers a permitted factual question. No arbitrary outside reads or automatic documentation-grant system. |
| D3: Messaging | Verified current contract, clarification proposed | `message` continues only a live, settled, retained conversation. It does not steer active work. `answer` remains for pending factual questions; retention does not grant live messaging. |
| D4: Native tool error semantics | Proposed | Invalid/rejected control operations use the SDK-supported error path. Successfully inspecting or waiting for a child is not itself an invocation failure merely because the child's outcome is failed. Return that outcome as structured data. |
| D5: Rendering ownership | Proposed | Combined tool call owns identity, assignment, configuration; result owns state/activity, outcome, error and timing. Standalone outcome messages remain self-contained. Before a result exists, the call may show requested wait mode and start timing. |

Terminal outcome handling must distinguish:
- Normal final reply with nonblank text: completion, subject to existing partial/blocked reporting contracts.
- Model error/abort: preserve existing explicit failure.
- Terminating tool failure ending the run: preserve tool name and bounded reason, with failure taking precedence over incidental assistant commentary or an earlier result.
- Ordinary recoverable tool error followed by a valid final reply: successful completion, not a sticky failure.
- Actually blank settled output without a more specific cause: retain blank-output failure.

Do not classify every tool error as terminal. A mixed tool batch can continue despite one terminating result; clear or supersede pending terminal evidence only when the actual next-turn/final-outcome evidence warrants it. Reset assignment-scoped evidence on retained continuation so a prior failure or reply cannot leak into a new assignment. Reuse a small shared reducer only if both transports need it; do not create a general event framework.

Error records should retain available child identity and assignment/outcome metadata through existing inspection and delivery. Bound and sanitize diagnostic text; do not add entire tool inputs or raw logs to progress output.

Use the prerequisite cleanup implementation's final resource-state and cleanup-error representation. Do not invent a competing cleanup contract, erase a completed assignment because resource closure failed, or render a still-owned live resource as successfully closed. This plan adds failure provenance and presentation on top of that behavior; it does not reimplement resource termination or retry policy.

## Execution guidance

**Worktree isolation:** Wait for the cleanup prerequisite to finish and merge, then create or update the recorded dedicated branch/worktree to contain it before implementation. Verify commit ancestry and read its final contract; an intended future merge is insufficient. Preserve other checkout changes. Bring the task-owned plan into it without losing the original. Do not relink production Herdr plugins or profile launchers to a disposable worktree.

**When assumptions fail:** Reassess the mechanism against these outcomes. Use a simpler in-scope solution. Ask before broadening authority, adding steering/retries, changing lifecycle, or modifying installed SDK source.

**Before expanding work:** Name the existing requirement and evidence requiring the addition. Do not turn unapproved alternatives into checklist items or finish criteria.

**At checkpoints:** Confirm work still addresses the observed failures rather than starting another architecture or historical-log audit. If drift occurs, remove task-created extras safely without touching pre-existing changes, restore the finite finish criteria, and continue required work.

## Tasks

- [ ] **T1 — Pin down terminal event and native tool-error contracts with regression fixtures**
  - Depends on: completed and merged default-subagent-cleanup-failures implementation, its integration commit verified in this worktree, execution authorization and worktree setup.
  - Inputs: installed Pi core/extension contracts; `extensions/{subagent-child,subagents}.ts`; `lib/subagents/{workspace,child-surface,rpc}.ts`; existing `tests/subagent-loader.test.ts` and `tests/subagent-rpc.test.ts`.
  - Do: build a small deterministic reproduction of a child attempting a read outside a disposable workspace. Use actual authority and installed Pi event behavior, with only model/transport boundaries scripted. Establish how the terminating reason reaches both transports, and which supported mechanism marks a rejected control invocation as an error. Add proposed `tests/subagent-terminal-outcomes.test.ts` and extend existing fixtures only where useful.
  - Verify: the pre-fix case exposes the real denial locally but loses it at parent settlement; the native-control probe reproduces the incorrect success flag. Record evidence without private transcript payloads.
  - Done when: the failure path is reproducible offline and expected post-fix assertions exercise production handlers, not a mocked outcome classifier.
  - Boundary: if the installed SDK cannot expose required information, document the exact missing seam and ask before changing the SDK. Do not infer terminal state from text matching alone.
  - Evidence: Not started.

- [ ] **T2 — Preserve terminating failure reasons on both child surfaces**
  - Depends on: T1.
  - Files: `lib/subagents/{child-surface,rpc,visible}.ts`; `extensions/subagent-child.ts` only if required by the verified seam; a proposed small `lib/subagents/terminal-outcome.ts` only if shared handling is simpler; T1 fixtures and existing child-outcome/RPC tests.
  - Do: track the needed assistant/terminal-tool outcome evidence and propagate it over existing bounded result handling. Respect the decision table above. Preserve ordinary settlement, partial/blocked reports, automatic delivery, retained continuation, and owned cleanup.
  - Verify: denied external read yields a failed child with `read` and the actual workspace denial on both surfaces; blank remains failure; model errors remain specific; nonfatal tool errors can recover; commentary cannot mask a terminating denial; mixed-batch continuation and a fresh retained assignment do not inherit stale terminal state.
  - Done when: the original failure sequence produces a specific parent-visible diagnosis with no fallback to blank output and no change in authority or retry behavior.
  - Evidence: Not started.

- [ ] **T3 — Make access and control contracts visible and operationally accurate**
  - Depends on: T1; combine overlapping edits with T2 as needed.
  - Files: `extensions/{subagents,subagent-child}.ts`, `lib/subagents/rpc.ts`, `docs/subagents.md`, existing `tests/subagent-rpc.test.ts`, `tests/subagent-loader.test.ts`, `tests/subagent-workspace.test.ts`; proposed `tests/subagent-control-errors.test.ts` if a separate integration fixture is clearer.
  - Do: explain workspace/selected-skill read scope at the owning delegation and child surfaces, with parent-supplied evidence as the route for external docs. Name `retain` and settled-only `message` behavior explicitly. Distinguish active/waiting, nonretained, dead-process, and user-intervention rejections without claiming a live child is dead. Use the SDK-supported error mechanism for invalid operations rather than relying on a returned extra `isError` field. Preserve failed assignment records as data for successful inspect/wait calls.
  - Verify: a running child remains unchanged after rejection; retained-but-running is also rejected clearly; settled/live/retained continuation works; settled/nonretained and dead children give accurate errors; user intervention stays protected. Verify native result error flags through the installed execution boundary, not only returned object properties. Confirm access guard tests still reject the external doc read.
  - Done when: tool descriptions and runtime errors agree, documentation needs have a usable in-scope route, and invalid controls are actual native errors without losing useful UI text.
  - Evidence: Not started.

**Scope checkpoint after T2/T3:** No access widening, automatic retry, live-steering API, active-child reload handling, or lifecycle redesign should have entered the implementation. Do not replace these corrective tasks with generic exception handling.

- [ ] **T4 — Remove duplication from combined transcript rows**
  - Depends on: T2/T3 error contracts.
  - Files: `lib/subagents/presentation.ts`, `tests/subagent-presentation.test.ts`.
  - Do: separate combined call/result field ownership according to D5. Preserve human names, assignment, model/effort, surface, progress, timing, errors, bounded output and expanded details. Keep standalone background-result messages complete. Correct invalid-control fallback rendering as needed after T3.
  - Verify: render the whole call plus result with shared context, not just components independently. Assert one status/error/timing representation for a failed child, active progress, and a successful result; check pre-result display, expanded view, standalone completion/failure, and invalid-control error text. Do not remove metadata merely to make duplication assertions pass.
  - Done when: the screenshot failure record displays one readable error and timing block with all relevant metadata still available.
  - Evidence: Not started.

- [ ] **T5 — Run bounded acceptance and document changed behavior**
  - Depends on: T2–T4.
  - Files: `docs/subagents.md`, root `CHANGELOG.md`, relevant tests. Do not modify concurrent feedback-log changes to make integration convenient.
  - Do: document real failure provenance, access boundaries, continuation semantics, and presentation behavior. Run the finite validation below and record actual profile/source paths. Use the installed loader with deterministic model input to check event-to-parent propagation; no live provider calls are required to prove this known denial path.
  - Verify: focused tests, default typecheck, and `git diff --check`. Review the combined rendered transcript fixture against the original screenshot fields. Fix only demonstrated task-relevant failures and rerun affected checks.
  - Done when: all named checks pass or a concrete environmental blocker is reported; do not claim attached-client acceptance from component tests.
  - Evidence: Not started.

- [ ] **T6 — Archive and integrate the completed task**
  - Depends on: T5 and execution authorization covering integration.
  - Do: update evidence and completion date, move the whole spec directory to `.specs/archive/subagent-failure-reporting-and-control-ux/` after checking the destination, commit implementation and archived plan in the task branch, and merge into dotfiles `main`. Reconcile the task-owned original plan without discarding unrelated target changes. Do not push.
  - Verify: target contains implementation and archived plan, no active duplicate remains, and any conflict-resolution changes receive affected checks. Remove the worktree only when integrated and free of uncommitted/unmerged work.
  - Done when: local integration is complete, or implementation/validation and the exact integration blocker are reported separately with the worktree retained.
  - Evidence: Not started.

## Validation and finish

Proposed finite acceptance, from the task worktree's `pi/profiles/default`:

```sh
pnpm test subagent-terminal-outcomes.test.ts subagent-control-errors.test.ts subagent-rpc.test.ts subagent-child-outcomes.test.ts subagent-loader.test.ts subagent-workspace.test.ts subagent-presentation.test.ts
pnpm run typecheck
```

The first two filters refer to proposed test files. If integrated into existing named tests, record that change rather than leaving nonexistent filters that imply coverage. Use existing pnpm dependencies and repository setup instructions only if dependencies need linking. Do not add credentials or reinstall unrelated tools for offline checks.

From the worktree root: `git diff --check`.

The deterministic installed-runtime regression must reach parent settlement and native tool-result classification. Merely testing `guardNativePath()` or a fabricated result object is insufficient. Physical Herdr focus/layout and model quality are not changed here and do not require another live layout/model test. Attached-client visual confirmation may be reported separately; it is not silently inferred from offline checks or added as an execution blocker.

Stop when these checks and T6 are complete. No full-suite repetition, provider retry experiments, broad history census, or unrelated architecture cleanup is required.

## Current handoff

- Status: draft for approval; implementation not started.
- Completed: bounded investigation, repository/profile verification, plan creation, fresh-reader dependency/finish review.
- Next: wait for cleanup implementation/checks and integration; after execution authorization, create/update the UX worktree to include it, record/verify its commit, then perform T1.
- Implementation prerequisite: cleanup's resulting resource-state/error contract must be present before work starts, not reconciled only at the final merge.
- Open decisions: no mechanism is operator-approved yet. The proposed scope uses parent-supplied external evidence and clarification of existing continuation, not new documentation grants or live child steering. If either new capability is requested, revise scope before execution.
- Verification limits: original Clara's workspace denial is proven; the second helper's cause remains unknown. No fixes or new acceptance checks have run.

## Completion and archive

At finish, set `status: completed` and the actual `completed: YYYY-MM-DD`; record profile-sensitive results and archive the directory in the task branch before the implementation/archive commit and merge. Never overwrite an existing archive. Preserve unrelated target work. If integration is blocked, keep the worktree and distinguish validated implementation from delivered changes. Push and deployment require separate authorization.
