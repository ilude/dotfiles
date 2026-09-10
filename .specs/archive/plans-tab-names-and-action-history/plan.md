---
created: 2026-09-09
status: completed
completed: 2026-09-09
---

# Plan tab names and session action history

## Goal and scope

User requirements:

- `/plans` Run in new tab (`d`) names the new Herdr tab after the selected plan's directory stub, not its title or `plan.md`.
- Run here (`r`) names the current Herdr tab the same way. Keep the existing shortcut; the user's earlier reference to `e` was a misunderstanding.
- Invoking `/plans` leaves a visible record in Pi's scrollback transcript.
- Actions performed in the picker leave visible records too. These records need not enter model context.
- Preserve structured action evidence in Pi's session log for later troubleshooting and analysis, subject to native session persistence. Do not create a separate logfile.

Planning only is authorized. Do not implement, commit, merge, push, or deploy during planning. Once execution is authorized, use the worktree and closeout contract below. Push and deployment always require separate permission.

Non-goals: redesigning the picker, recording every navigation key, changing other commands or the legacy profile, a remote telemetry service or dashboard, or replacing existing plan-run reservations.

## Fresh-context handoff

Paths are relative to `C:/Users/mglenn/.dotfiles` unless stated otherwise. This dotfiles repository owns all proposed changes; no module changes are expected. Read applicable `AGENTS.md` files before acting.

Required source:

- `pi/profiles/default/extensions/plans.ts`
- `pi/profiles/default/extensions/session-launch.ts`
- `pi/profiles/default/extensions/herdr-orchestrator-label.ts`
- `pi/profiles/default/lib/herdr-cli.ts`
- `pi/profiles/default/lib/plan-run-runtime.ts` and `lib/plan-runs.ts`
- `scripts/pi-herdr-launch.mjs`
- `pi/profiles/default/lib/log-analytics/registry.ts`
- `pi/profiles/default/extensions/codex-status.ts` for existing display-only entries
- `pi/README.md`, `pi/profiles/default/docs/herdr.md`
- Installed Pi `docs/extensions.md`, `docs/session-format.md`, relevant `docs/tui.md` API, and `examples/extensions/entry-renderer.ts`. Resolve installed documentation from the active Pi package, not repository-relative `docs/`.

Verified starting behavior on 2026-09-09:

- Planning profile: `C:/Users/mglenn/.dotfiles/pi/profiles/default`, model `openai-codex/gpt-6-astra`, medium reasoning. Intended execution profile: default, Sol at low reasoning. No execution-profile run is claimed.
- Originating checkout and integration target: `C:/Users/mglenn/.dotfiles`, branch `main`.
- `plans.ts` defines `o`, `c`, `r`, `d`, `a`. `e` currently does nothing.
- `d` passes `do-it · ${plan.stub}` truncated to 80 characters to `createHerdrPiTab`. Run here does not rename the tab.
- The launcher focuses and renames the returned tab. The child startup labeler separately names its tab after cwd. A parent launch receipt alone must not be assumed to prove the child labeler has already finished.
- `/plans` uses a temporary overlay and notifications, with no `appendEntry` or entry renderer. Extension commands bypass Pi's ordinary `input` event, so a generic input listener would miss invocation.
- The current plan-run files are mutable ownership state, not an append-only action history. Run here does send a real `/do-it` user prompt; absence of picker history does not mean all resulting execution activity is unlogged.
- Installed Pi 0.85.0 supports `appendEntry` plus `registerEntryRenderer`: visible custom entries excluded from model context.
- A bounded offline `SessionManager.create` experiment appended one custom entry to a temporary fresh session: one in-memory entry, zero context messages, and no session file on disk. Installed `dist/core/session-manager.js::_persist` defers a new file until an assistant message. Temporary probe files were removed. This rules out claiming that session entries alone durably cover picker-only sessions.
- Existing analytics exposes `session_entries.record` as JSON and can inspect persisted custom entries. No new analytics source is needed.

Preservation: the original planning checkout had overlapping uncommitted changes. A subsequent status check during this discussion found the checkout clean. Recheck status/diffs and confirm the execution base contains the existing plan-run implementation before editing. Do not reset, stash, commit, or remove unrelated work. If required changes are uncommitted at execution time, use their integrated revision or obtain permission for a scoped transfer. Record the actual base and any transferred files.

Proposed task branch: `task/plans-tab-names-and-action-history`. Proposed sibling worktree: `C:/Users/mglenn/.dotfiles-worktrees/plans-tab-names-and-action-history`. Record actual values before editing.

## Settled decisions

1. **Shortcut:** retain `r` for Run here. Do not change it to `e` or add an alias.
2. **Storage:** action history belongs in Pi's session log only. The user rejected a separate logfile. Use native custom session entries and their visible renderer, with no event ledger, separate writer, gitignore addition, or ledger analytics source. Accept native persistence behavior, including the verified fresh picker-only session limitation; do not modify Pi internals or force persistence through fake messages.

The design decisions are settled and this plan is ready. Execution is not yet authorized.

## Implementation contract

### Tab names

- Use the selected `PlanRecord.stub` as the requested tab name, without a `do-it` prefix or arbitrary 80-character truncation. Preserve exact plan path and reservation-token forwarding.
- Rename only the exact newly returned tab for `d`, or the current inherited `HERDR_TAB_ID` for Run here. Never infer a target from whichever tab has focus.
- Coordinate plan-child startup labeling with the launch title so a late cwd-based label cannot overwrite the stub. Keep the pane name `Orchestrator` and ordinary startup naming unchanged. Do not continuously enforce names or overwrite later manual renames.
- Run here retains its normal behavior outside Herdr, with naming marked not applicable. Inside Herdr, report missing identity or rename failure accurately without duplicating execution. A naming failure should not cancel otherwise valid Run here execution; record naming and command-submission outcomes separately.
- Preserve existing claim-before-execution, idle/follow-up delivery, focus, retry safety, and ambiguous-launch protections. Do not label a submitted prompt as completed execution or a launch receipt as child readiness.

### Transcript and event history

- Use one semantic event contract with a stable schema version and event ID. Display it through `appendEntry`/`registerEntryRenderer`, not `sendMessage` or fake user messages. Existing `/do-it` prompts still reach the model normally.
- Invocation leaves a compact `/plans` transcript row even if there are no plans or the picker closes without acting. Record action requests and outcomes for Open, Copy, Run here, Run in new tab, Archive, and picker close. Archive cancellation, refused execution, discovery/action failures, and uncertain launches must be distinguishable from success.
- Keep navigation/preview rendering temporary. Do not log selection movement, rendering, polling, or ignored pending-launch repeat keys. Requests blocked by existing ownership should produce a bounded refusal record rather than a false start.
- Compact rows show action, selected stub when present, and actual outcome; failures include a bounded useful reason. Capture requests before side effects and outcomes afterward, including the asynchronous `d` callback which currently closes as a generic `close` result. Automatic dismissal after success must not masquerade as user cancellation.
- Store events only through Pi's native custom session-entry API. Do not write directly into Pi-owned session JSONL or create a separate logfile. Persistence follows Pi's normal lifecycle; fresh picker-only sessions are not guaranteed to reach disk.
- Minimum structured data: schema version, event ID, invocation ID, action/phase/outcome, timestamp, elapsed time for completed attempts, profile/session ID, cwd, plan stub and path when available, relevant source/target tab and pane IDs, and bounded error stage/message. An action-attempt ID correlates request and result. Do not log plan contents, clipboard payloads beyond the known selector, environment dumps, or reservation authorization tokens.
- Session-entry recording failures must be visible as logging failures without misreporting whether an external action occurred or encouraging duplicate launches. Retain existing safe-retry distinctions. No invented completion record after process termination.
- Use the existing `session_entries.record` analytics surface for persisted events. Document one outcome-count query and one chronological invocation trace without adding sources or changing limits. History follows native Pi persistence, branch, and compaction behavior.

## Execution guidance

After execution authorization, create/resume the recorded worktree and verify the execution base contains the existing plan-run changes without disturbing unrelated work. Continue independent tasks around blockers. Adapt routine mechanisms based on repository evidence, but ask before changing scope, settled decisions, or acceptance. Keep checkboxes and evidence current; stop adding checks once the agreed finite checks pass.

## Tasks

- [x] **T1: Stub-based tab names**
  - Requires an execution base containing the existing plan-run changes.
  - Update `plans.ts` and the minimum necessary launch/startup-label boundary. Preserve the existing `r` shortcut and labels.
  - Verify exact stub names for both actions, current/returned target identity, plan-path/token preservation, late child startup ordering, no later manual-name overwrite, non-Herdr Run here, and naming failures without duplicate submission.
  - Done when naming requirements pass while existing reservation/focus/failure behavior remains intact.
  - Evidence: 2026-09-09, default profile, task worktree at `C:/Users/mglenn/.dotfiles-worktrees/plans-tab-names-and-action-history`, base `3832d751`: exact stub naming is covered for Run here and new-tab launch, including explicit child startup label handoff without a second tab rename, returned/current identity, preserved plan selector/token inputs, safe failure handling, and one `/do-it` submission on rename failure.

- [x] **T2: Visible semantic action records in the session log**
  - Can proceed independently of T1 once authorized. Session-only storage is settled.
  - Add a small shared event helper, proposed `pi/profiles/default/lib/plan-events.ts`, and register the entry renderer in `plans.ts`. Instrument the command boundary, picker callbacks, and execution outcomes.
  - Use native custom session entries only. Keep live plan-run ownership separate from session action history; add no separate logfile or writer.
  - Verify invocation/empty/close, every semantic action, cancellation, refusal, failure, ambiguous launch, and pending-key suppression. Assert `/do-it` delivery remains exactly once and logging does not trigger a model turn.
  - Verify explicit recording failures. Use a real temporary SessionManager to prove context exclusion and persisted entry replay in a session that Pi does save; do not rely only on mocked append calls. Cover the native fresh-session persistence limitation without requiring a disk file before an assistant response.
  - Evidence: 2026-09-09, default profile, task worktree: native `plan-action-event` entries, phase-distinct compact renderer, request/outcome correlation, bounded errors, discovery/UI/logging failures, model-context exclusion, persisted replay after an assistant message, fresh picker-only persistence limitation, and explicit recording-failure warning are covered by `tests/plan-events.test.ts` and picker integration coverage.

- [x] **T3: Analytics access and operator documentation**
  - Depends on T2.
  - Update `pi/README.md`, applicable Herdr documentation, analytics query reference, and root `CHANGELOG.md` with the behavior, session-only storage, native persistence limitation, and preserved execution behavior. Use the existing analytics source and schema.
  - Verify bounded queries over persisted session-entry fixtures return expected outcomes and one invocation trace. Do not claim analytics can recover a picker-only session that Pi never saved. No new source, dashboard, or telemetry service.
  - Evidence: 2026-09-09, default profile, task worktree: operator docs and query reference describe native session-only storage, persistence limits, existing `session_entries` access, outcome counts, and chronological traces. `tests/log-analytics-store.test.ts` verifies persisted outcome counts and invocation traces without a new source.

- [x] **T4: Finite validation and closeout**
  - Depends on T1-T3.
  - From `pi/profiles/default`, run `pnpm test plans.test.ts session-launch.test.ts herdr-orchestrator-label.test.ts herdr-launch.test.ts plan-run-runtime.test.ts plan-runs.test.ts` plus the event-history and analytics test files actually added/changed, then `pnpm run typecheck`. Read the testing skill before changing tests.
  - Include bounded runtime-level transcript renderer/replay coverage and verify the native fresh-session persistence limitation; do not replace it with mock-call assertions alone. Reuse existing harness patterns without making provider calls or executing real plans.
  - Record actual command/date/profile/results. Attached-client Herdr visual acceptance is a non-blocking verification limit unless performed safely; do not claim it from unit tests.
  - Archive and integrate under the closeout contract below.
  - Evidence: 2026-09-09, from `pi/profiles/default`, `pnpm test plans.test.ts session-launch.test.ts herdr-orchestrator-label.test.ts herdr-launch.test.ts plan-run-runtime.test.ts plan-runs.test.ts plan-events.test.ts log-analytics-store.test.ts` passed: 8 files, 126 tests. `pnpm run typecheck` passed. Task commit `e4bf2bb8` was merged into recorded target `main` by `88172627`; the archived spec and implementation were verified on the target. No provider calls, real plan execution, or attached-client visual acceptance performed.

## Current handoff

- Status: completed on 2026-09-09.
- Completed: implementation and finite checks, task commit `e4bf2bb8`, merge to recorded `main` target as `88172627`, target verification, and completion metadata.
- Next: none. Attached-client Herdr naming/scrollback testing remains a non-blocking verification limit.
- Limits: no provider calls, real plan execution, or attached-client Herdr naming/scrollback test performed.

## Closeout after execution authorization

After implementation and agreed agent-owned checks pass, record integration pending, confirm `.specs/archive/plans-tab-names-and-action-history/` does not already exist, and move this whole spec directory there in the task worktree. Repair affected links and commit the implementation and archived spec together. Do not archive unfinished work.

Merge the task branch into the recorded originating `main` checkout without stashing, discarding, or committing unrelated changes. If integration is blocked, retain the worktree and report integration pending. An explicit `--no-merge` instruction instead leaves the committed worktree with integration intentionally pending.

After successful merge, verify the implementation and archive exist on the target and the active copy is gone. Set the archived plan to `status: completed`, record its completion date, mark T4 complete, and commit that metadata update on the target. Rerun affected checks only if conflict resolution changed checked content. Remove the worktree only when integration succeeded and it contains no uncommitted/unmerged work. Operator manual testing is non-blocking. No push or deployment without separate permission.
