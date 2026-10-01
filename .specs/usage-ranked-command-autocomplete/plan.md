---
created: 2026-09-30
status: ready
completed: null
---

# Learn slash-command preferences across default Pi instances

## Goal and scope

Rank matching slash-command names by learned usage instead of Pi's fuzzy score and registration order. Learn from actual interactive submissions, persist across sessions and processes, and prime the ranking from the preceding seven days of recorded profile commands.

Settled user decisions:
- Pi's existing fuzzy matching determines candidate eligibility. Usage score descending determines ordering; command name alphabetically breaks ties. Missing usage is zero. An exact name match receives no additional ranking priority.
- `/new-instance` can outrank `/new` for `/new` when used more often.
- `/reload` precedes `/resume` when their usage scores tie, including when both lack history.
- Usage has a 14-day half-life.
- All default-profile instances share usage across repositories. Legacy and other profiles are outside scope.
- Rename the public `/refresh-models` command to `/sync-models`, without retaining a `/refresh-models` alias that would compete for `/re`.
- Keep typing fast: ranking uses cached memory, not storage queries or subprocesses.

Non-goals: changing fuzzy candidate eligibility, argument/file completion, command execution semantics, model ranking, other profiles, telemetry services, or reconstructing unrecorded built-in history.

Authorization: this plan does not authorize implementation, commits, merges, or pushes. `/do-it` authorizes the selected plan's implementation, dedicated worktree, local commits, and merge unless `--no-merge` is specified. Push requires separate authorization.

## Fresh-context handoff

Repository paths are relative to `~/.dotfiles`. For brevity, paths beginning `extensions/`, `lib/`, `tests/`, `scripts/`, or `commands/` below are profile-relative under `pi/profiles/default/`. Read root `AGENTS.md` and `pi/profiles/default/AGENTS.md` before execution.

- Owner: dotfiles, default Pi profile only. No EISA application changes or submodule changes.
- Planning checkout: `C:/Users/mglenn/.dotfiles`, branch `main`, revision `879055df2d7262ff721d7b790a814f285cc1e5aa` on 2026-09-30. Recheck the revision and status before execution.
- Preserve the existing unrelated modification to `pi/profiles/default/skills/agent-process/references/instruction-feedback.md`, plus any subsequent changes.
- Integration target: the originating dotfiles checkout on `main`, not the task branch. Proposed task branch: `feat/usage-ranked-command-autocomplete`; record the actual dedicated task worktree at execution. Use prepared-run coordinates when supplied rather than inventing a second worktree.
- Verified planning profile: `PI_CODING_AGENT_DIR=C:/Users/mglenn/.dotfiles/pi/profiles/default`. Intended execution profile: default. Resolve live state through native `getAgentDir()`, not the worktree or a hardcoded planning path.
- Required local evidence: `pi/README.md`, `pi/profiles/default/lib/profile-command.ts`, `extensions/profile-reload.ts`, `lib/reload-monitor.ts`, `extensions/refresh-models.ts`, `scripts/model-catalog-smoke.mjs`, and profile `package.json` and `.gitignore`.
- Read installed Pi extension and TUI documentation and `examples/extensions/modal-editor.ts` for UI integration. Installed version at planning: `@earendil-works/pi-coding-agent` and `pi-tui` 0.99.1. Resolve current package paths at execution instead of copying the pnpm store hash.

### Verified facts and limits

- `InteractiveMode.createBaseAutocompleteProvider()` constructs built-ins, templates, extensions, and skills. `CombinedAutocompleteProvider.getSuggestions()` fuzzy-filters names, matching skill bare names first. `fuzzyFilter()` orders by score only, preserving input order on ties. Bare `/` preserves source order.
- `ctx.ui.addAutocompleteProvider(factory)` publicly wraps the provider. Delegate completion application and preserve the provider's other capabilities, trigger characters, options, cancellation, and asynchronous results.
- Built-ins return from the interactive submit handler before the session input event. Extension commands also dispatch before `input`. `pi.on('input')` cannot be the usage capture mechanism.
- `ctx.ui.setEditorComponent()` supports a `CustomEditor` subclass. Pi assigns `newEditor.onSubmit = defaultEditor.onSubmit` after construction. The base editor invokes that callback with final expanded, trimmed text after autocomplete processing. `submitValue` itself is private and must not be overridden.
- No default-profile source currently calls `setEditorComponent()` or `addAutocompleteProvider()`. Source evidence supports a thin submission-observing editor, but attached TUI behavior has not been tested during planning.
- Preserve native editor behavior, including keybindings, history, paste, autocomplete, application actions, and working-status presentation. Installed `CustomEditor` has an `embedWorkingStatus` option.
- Planning shell Node v25.9.0 successfully opened `node:sqlite` and reported SQLite 3.51.3. This proves local availability, not loader/lifecycle integration. No additional SQLite dependency is needed on this verified runtime.
- `registerProfileCommand()` appends `customType: 'profile-command'` with the invocation string in `data`. These are authoritative seed records for profile-owned extension commands. Built-ins are outside that recording mechanism.
- Read-only analytics scanned all 2,232 selected default-profile session files, 1,948,892,288 bytes, with no malformed records for `[2026-09-23T22:46:47Z, 2026-09-30T22:46:47Z)`. Stored counts included branch 93, commit 57, clear 41, new-instance 33, and refresh-models 2. These are not deduplicated invocation counts. Nothing was imported during planning. Broad DuckDB staging took about 112 seconds; do not stage the corpus into DuckDB just to bootstrap this feature.

## Implementation contract

### Ranking and learning

- Reorder only command-name suggestions at the initial slash-command token, including bare `/`. Leave argument, path, forced file-completion, and other completion contexts untouched.
- Use a snapshot of the cached scores for each request. Background refresh must not move the selection in a menu already displayed; refreshed data applies to subsequent requests.
- At common evaluation time `t`, each invocation at `u` contributes `2^(-(t-u)/(14 days))`. Store an equivalent compact per-command decayed accumulator and reference timestamp. Update atomically by decaying its previous value to the new timestamp and adding one.
- Alphabetical comparison is case-insensitive and deterministic for command names. Do not add fuzzy-score or exact-match preference back as a secondary ranking rule.
- Record the command token only, never its arguments or prompt contents. Count an interactive submission once, before delegating to native dispatch. Selecting, highlighting, or Tab-completing without submitting does not count. Count attempted invocation rather than waiting for command success.
- Use a thin `CustomEditor` subclass with the public `onSubmit` callback. Because Pi installs that callback after construction, preserve later assignments while wrapping the final callback exactly once, for example with an instance property descriptor. Do not override private editor methods, intercept raw Enter as a proxy for submission, patch installed Pi, or change command handlers to capture built-ins.
- Delegate the original callback unchanged after usage recording. Persistence must complete promptly before dispatching `/reload`, `/quit`, or session-changing commands, so disposal does not lose the increment. A usage storage failure must not prevent the user's command from running; surface a concise warning and retain a usable in-memory ranking.

### Shared state and lifecycle

- Proposed state directory: `getAgentDir()/command-usage/`, containing SQLite and its sidecars. Ignore the entire directory in the profile `.gitignore`. It is outside reloadable source roots and must not cause `[reload]` on usage updates.
- Use SQLite transactions for increments and bootstrap publication so concurrent Pi instances cannot overwrite each other's contributions. Keep transaction boundaries short; do not hold a write transaction while scanning history.
- Load/cache scores on interactive startup. Refresh the cache approximately every five seconds outside autocomplete requests. Local submissions update the cache immediately; other instances observe persisted changes on the next refresh.
- Resolve store identity by active profile. Session replacement in the same process does not reset shared usage. Reload reopens the same store without reimporting or duplicating callbacks. Clean up session-owned timers and handles idempotently; do not start them merely by loading the extension factory.
- No per-keystroke I/O, history scans, database locks, process launches, or model calls. Keep the store small and avoid new services. Choose the simplest storage execution mechanism that meets this contract; bound contention rather than allowing an indefinite submission stall.

### One-time seed

- Freeze a shared cutoff when the database is first initialized. Import the seven-day interval `[cutoff - 7 days, cutoff)`, so live submissions after initialization cannot also enter the seed. Use the same cutoff in every contender.
- Run a streaming, read-only scan of default-profile session JSONL asynchronously on first use. Do not block editor readiness or scan on later starts after a successful import. Do not select by filename date alone: an older session can have recent records.
- Initially support the verified `custom/profile-command` records. Do not infer commands from assistant/tool text, prose mentioning `/commands`, or lifecycle events standing in for unrecorded built-ins.
- Deduplicate copied records across forked sessions using entry identity with timestamp and invocation as necessary to distinguish collisions. Preserve invocation timestamps for decay. Map historical `refresh-models` to `sync-models` before aggregation.
- Publish seed contributions and the completed marker atomically and idempotently. Concurrent import attempts must not double-count or replace live increments. A failed or interrupted scan must not be recorded as complete. Report parse/read exclusions honestly without modifying source history.
- After completion, refresh the cached ranking. Store only the command statistics and minimal import metadata, not a transcript corpus or raw command arguments. No ongoing session-log indexing or recurring import.

### Public command rename

- Register `/sync-models [provider]` instead of `/refresh-models [provider]`. Update usage errors, operator messages, current documentation, tests, and smoke assertions that describe the public command.
- Preserve model discovery, pricing research, provider behavior, cache location `model-cache/refresh-models/`, and internal diagnostic identifiers where changing them is unnecessary. Keeping the source filename `extensions/refresh-models.ts` is acceptable. Do not rewrite archived plans or session history.
- Seed historical usage under `sync-models`, never resurrect `refresh-models` as a suggestion.

## Execution guidance

Create/resume the recorded task worktree and record its actual path, branch, and integration target before editing. Carry task-owned uncommitted plan content without deleting its source. Preserve unrelated changes.

Before delegation, consult `strategist` unless the user explicitly requests a single-agent handoff, including a Team Lead. A Team Lead follows its own Strategist-first workflow. Assign at most one named task per subagent, splitting oversized assignments further. Use roles from the active catalog. T1 and T2 are independent; integrate both before T3. T4 follows T3.

Adapt mechanisms within the fixed intent. Ask before changing scope, decisions, or acceptance. Continue independent work around blockers. Do not add audits, mandatory reviewers, optional enhancements, recovery systems, or manual acceptance gates. Fix evidenced task-related defects and stop when the finite checks pass. Keep checkboxes, evidence, blockers, next action, and action owner accurate.

## Tasks

- [ ] **T1: Rename the public model synchronization command**
  - Depends on: none. Parallel with T2.
  - Own: `extensions/refresh-models.ts`, related model-refresh tests and smoke assertions, existing current model documentation in `pi/README.md` and `pi/profiles/default/docs/bedrock.md`. Do not rename internal caches or archived history.
  - Change: expose only `/sync-models`, preserving arguments and behavior. Update public-name messages and assertions.
  - Verify from `pi/profiles/default`: `pnpm test refresh-models.test.ts bedrock-pricing-research.test.ts`; `node scripts/model-catalog-smoke.mjs`.
  - Done when: the real installed loader registers `sync-models` and not `refresh-models`, and focused behavior tests pass.
  - Evidence: Not started.

- [ ] **T2: Implement shared decayed usage storage and seed import**
  - Depends on: none. Parallel with T1.
  - Own: proposed `lib/command-usage/` pure scoring, SQLite store, and streaming seed importer; proposed focused store/seed tests; profile `.gitignore`.
  - Produce: a small explicit interface to initialize/read a score snapshot, record a timestamped invocation, import the frozen seed, and close resources. No UI ownership in this task.
  - Change: transactional decayed increments, shared cutoff/completion metadata, one-time deduplicated seed with historical rename mapping, and state exclusion from Git.
  - Verify: real temporary SQLite with concurrent independent-process writers; deterministic decay with fixed clocks; retained scores after reopen; idempotent and concurrent imports while live increments occur; fork duplicates; recent records in older files; seven-day boundaries; malformed/read-error reporting; source files unchanged. Test temporary profiles, not the operator's live usage store.
  - Run from `pi/profiles/default`: `pnpm test command-usage-store.test.ts command-usage-seed.test.ts` (proposed names).
  - Done when: the exported interface supplies correct shared scores and seed data without double counting or transcript persistence.
  - Complexity: bootstrap atomicity and preserving live increments are the main interacting contracts. Keep the scan outside write transactions.
  - Evidence: Not started.

- [ ] **T3: Integrate cached autocomplete ranking and submission learning**
  - Depends on: integrated T2 storage interface and T1 public rename.
  - Own: proposed `extensions/command-usage.ts`, `lib/command-usage/` ranking/editor adapter modules, and proposed UI/ranking tests. Coordinate any shared T2 helper edits after integration.
  - Change: install the provider wrapper and thin native-behavior editor in interactive sessions; capture final submissions, persist before dispatch, refresh shared cached state, and clean up correctly across session changes/reload/shutdown. Use no input-event or raw-key approximation.
  - Verify with the real Pi TUI/provider where practical: `/new` selects learned `/new-instance`; zero-score `/re` orders reload before resume; `/sync-models` does not match `/re`; bare `/` uses the same order; tied scores use alphabetical names; skill naming remains intact; argument/path contexts delegate unchanged.
  - Exercise real editor autocomplete plus Enter, typed commands, Tab then cancellation, callback reassignment, application shortcuts, history/paste, working-status options, repeated lifecycle events, native dispatch under storage failure, and persistence before simulated reload/quit disposal. Assert no store or filesystem access during suggestion requests.
  - Verify cross-instance cached refresh against real temporary shared storage, with controlled refresh timing. Use a bounded ranking timing observation and report its input size and result, not a brittle machine-dependent timing gate.
  - Run from `pi/profiles/default`: `pnpm test command-usage-ranking.test.ts command-usage-editor.test.ts command-usage-lifecycle.test.ts` (proposed names).
  - Done when: suggestions learn from real submissions and subsequent instances/requests without changing native completion or command behavior.
  - Evidence: Not started.

- [ ] **T4: Validate, document, and prepare local delivery**
  - Depends on: T3 and completed T1/T2 checks.
  - Own: narrow updates to `pi/README.md` describing current ranking, state, decay, seed limitations, and `/sync-models`; root `CHANGELOG.md`; proposed `scripts/command-usage-smoke.mjs`; this plan's evidence and closeout state.
  - Change: add an offline installed-Pi loader check using the existing smoke pattern. Resolve the CLI from the installed package's `bin.pi`, use an isolated temporary profile, and exercise extension loading and supported UI contracts without credentials/network/model calls. Do not execute unbundled CLI/server internals.
  - Verify from `pi/profiles/default`: all focused T1/T2/T3 tests together; `pnpm run typecheck`; `node scripts/model-catalog-smoke.mjs`; `node scripts/command-usage-smoke.mjs`. Fix task-related defects established by these checks; disclose unrelated baseline failures rather than expanding scope.
  - Confirm state and SQLite sidecars are Git-ignored, usage files are outside monitored reload source roots, and no source session logs were changed. Recheck preservation in the originating checkout.
  - Done when: agreed automated checks pass, current documentation is accurate, and implementation is ready for closeout. Attached operator TUI testing is a non-blocking verification limit, not an implementation gate.
  - Evidence: Not started.

- [ ] **T5: Archive, commit, integrate, and clean up authorized execution**
  - Depends on: T4. Applies when implementation is authorized through `/do-it` or equivalent explicit authorization.
  - Archive and commit under the closeout contract below. Dispatch the Integrator from the recorded target checkout after the task commit; record actual archive, commits, merge result, and cleanup.
  - Done when: authorized delivery and cleanup are verified, or explicitly requested `--no-merge` is accurately recorded.
  - Evidence: Not started.

## Validation and current handoff

- Status: ready for authorized implementation; no implementation performed.
- Completed evidence: source/API inspection, available SQLite runtime probe, and read-only seven-day default-profile history aggregation.
- Next: authorize execution, then ready independent T1/T2 assignments.
- Open user decisions: none.
- Verification limits: custom editor attachment, SQLite through the extension loader, usage import, ranking timing, and multi-instance operation have not been tested. Planning observations are not implementation passes.

## Closeout

After implementation and agreed checks pass, record integration as pending. Confirm `.specs/archive/usage-ranked-command-autocomplete/` is free, move the entire spec directory there in the task worktree, repair affected links, and commit implementation plus archived spec together. Do not archive unfinished implementation.

For authorized `/do-it`, dispatch the Integrator after the task commit from the recorded target checkout. It owns local integration, completion metadata, and clean task-worktree removal. Direct/run-here communication remains with the orchestrator. Prepared Herdr execution uses its runtime-admitted same-tab Integrator successor: publish readiness, finish any explicitly authorized orchestrator-only obligations, retire the exact origin gracefully, then clean up from the surviving Integrator pane. Keep panes and worktree on pre-retirement blockers; do not treat readiness as completion.

If integration is blocked, retain the worktree and record the reason, next action, and owner with integration/cleanup unchecked. `--no-merge` keeps the committed task worktree and skips Integrator mutation intentionally. Push is not authorized. Operator manual/live testing never blocks archival, commit, or authorized integration.

### Final response contract

Lead with one outcome and explicit text: 🟢 **COMPLETED**, 🔴 **NOT COMPLETE: MERGE BLOCKED**, 🔴 **NOT COMPLETE: USER INPUT REQUIRED**, 🔵 **IMPLEMENTED: MERGE SKIPPED AS REQUESTED**, or 🟡 **CLEANUP PENDING**.

For a blocker or cleanup remainder, state **Reason** and **Action needed**, owner, and exact next action before reporting successes. Then give concise checks, spec path, branch/commits, merge result, and retained worktree or cleanup paths. Completion means checks passed, authorized integration and metadata are committed, and cleanup verified. Leave unfinished steps unchecked; do not substitute passing checks or archival for delivery.
