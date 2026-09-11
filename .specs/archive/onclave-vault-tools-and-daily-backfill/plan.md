---
created: 2026-09-11
status: ready
completed: null
---

# Onclave vault tools and supervised daily transcript backfill

## Goal and settled scope

Replace the Python Onclave API wrappers with a shared TypeScript client and deferred Pi tools. Replace Claude's detached transcript-backfill hook with a short-lived TypeScript worker owned by the user's native OS scheduler.

User decisions:
- One daily run, with one missed-run catch-up at the next login. No additional upload attempt on every login.
- Windows Scheduled Task, macOS launchd LaunchAgent, Linux systemd user timer/service. No crontab or alternate scheduler fallback. Unsupported/unavailable scheduling produces an actionable installer warning without aborting the rest of installation.
- Local-first: if no complete transcript cache entries exist, make no Onclave or credential-provider network requests.
- Video-ID confirmation and completed remote processing are sufficient to delete the local cache. Exact transcript equality is not required, including when remote content predates the local copy.
- Setup may write local configuration with the Onclave endpoint and signing-key path, never key contents. Execution must not depend on interactive shell initialization.
- No CLI parity or Claude compatibility layer. Retire replaced Python API wrappers and obsolete Claude YouTube instructions/hooks. Preserve explicit local YouTube fetchers in Python.
- Expose Onclave operations as tools discoverable through `tool_search`; provide a YouTube skill for workflow guidance. The scheduled worker calls the shared library directly, without Pi, a model, Python, curl, or an untracked child.

Non-goals: general cron engine, always-running Pi daemon, modifications to Pi's existing process-local `schedule` tool, Herdr/VS Code process fixes, broad subprocess audit, local YouTube library migration, new deployment or server behavior unrelated to consuming the existing API.

Authorization: this request authorizes planning only. A later execution request authorizes implementation, task-local commits, and local integration subject to the repository constraints below. Push, service deployment, and registering a live scheduled task on the operator's machine require separate authorization. Automated registration tests use fixtures or injected command runners, not live registration.

## Fresh-context handoff

Paths are dotfiles-root-relative unless prefixed `Onclave:` (relative to `modules/onclave/`). Read applicable instructions before editing, including root `AGENTS.md`, `modules/onclave/AGENTS.md`, and relevant Claude/Pi instructions and skills.

Owners:
- Onclave owns the reusable client/signing contract and Pi vault-tool implementation.
- Dotfiles owns default-profile activation/skills/prompts, local cache scheduling/configuration, installer integration, and retirement of workstation wrappers.
- Infrastructure/site inventory remains in its owning private repositories. Do not copy live inventory or credentials into tracked files.

Starting targets verified 2026-09-11:
- Dotfiles: `C:/Users/mglenn/.dotfiles`, branch `main`.
- Onclave canonical checkout: `modules/onclave/`, branch `feature/v2-broker-core`, which must remain attached to/tracking `origin/feature/v2-broker-core`.
- Planning profile: repository default profile as supplied by the current harness. Intended execution/check profile: default only. Legacy is excluded from inspection, changes, and testing. Shared adapter changes must not deliberately change communication behavior.
- Earlier `git --version` removal is already committed as `014c34a` in Onclave. Do not reimplement it. Recheck worktree state and preserve all unrelated changes before execution.

Required source reading:
- `Onclave: extensions/onclave-pi/src/lib/http-signer.ts`, `http-client.ts`, `bws.ts`, and adapter entry point.
- `Onclave: services/core/src/vault/routes.ts`, `jobs.ts`, relevant vault route/auth tests.
- `tools/onclave-youtube/` API wrapper modules, `pyproject.toml`, and their tests.
- `claude/hooks/onclave-circuit/{backfill,probe,lib}.py`, `claude/settings.json`, `claude/shared/yt-instructions.md`.
- `pi/profiles/default/extensions/tool-search.ts`, `lib/tool-activation.ts`, representative deferred-tool lifecycle, `prompts/{yt,yt-local}.md`, command registry, and profile package/build configuration.
- `install`, `install.ps1`, `wsl/install`, and applicable installer test patterns.
- Before Pi implementation read the installed Pi extension/skills documentation and relevant examples fully as required by repository instructions; use the `pi-extension` and `testing` skills for their respective changes.

Verified source facts, not deployed-service claims:
- `/api/v1/ingest` accepts `url`, `transcript_text`, `transcript_format: plain`, metadata, and a 5 MB transcript limit.
- Existing YouTube content is found by resource/video ID. A repeated ingest uses its stored transcript, not the newly supplied one. Active jobs are reused, but completed content can receive a new processing job on another POST.
- Python backfill forgets returned IDs between runs, checks a five-minute deadline only between entries, and uses a potentially stale availability hint. Its detached child starts before configuration/pending-work checks. These behaviors are not to be copied.
- TS `http-signer.ts` already implements the Python signing contract with Node crypto, using an unencrypted OpenSSH Ed25519 key. Default key path is `~/.ssh/id_ed25519`; preserve that application identity, with explicit configurable path, rather than applying Git key selection rules.
- Existing TS HTTP client is communication-specific, not a general vault client. Extract shared signing/request components without pulling agent registration into the worker.
- `tool_search` searches registered tools by name/description and activates matches. Skills provide instructions, not automatic registration. The YouTube skill should direct discovery; no new skill-triggered loader is needed.
- Default dependencies include TypeScript, tsx, jiti, and proper-lockfile. Select existing build/locking patterns where suitable; scheduled execution is compiled JS via an absolute Node path.
- Pi `/yt` already instructs no automatic local-fetch fallback; `/yt-local` remains explicit. Preserve that distinction.

## Implementation contract

### Client and tool surface

Expose a supported Onclave-owned client export (proposed `Onclave: packages/client/`, final path adaptable to workspace patterns). It owns signing, endpoint normalization, typed vault responses, HTTP errors, cancellation, and bounded request execution. Neither worker nor vault tool calls need peer discovery/registration. Preserve current communication tools and their explicit-user-directed communication rules.

Cover existing API-wrapper capabilities: ingest URL/local transcript; find by video ID; fetch content/transcript; list; search; channel listing; job lookup/statistics; reprocess; embedding reindex; annotations. Group related operations into a small number of discoverable tools rather than preserving one script per tool. No generic unrestricted HTTP tool. Preserve useful current parameters and response fields, not CLI output formatting or unused command spellings. Long processing returns job IDs/status; the existing `schedule` tool can follow up when requested instead of occupying a tool in a long polling loop. Any short wait remains cancellable and bounded.

Register tools in an Onclave-owned adapter surface with a thin default-profile loader/wiring. Defer only the new vault tools at session start using existing default-profile activation patterns. Avoid coupling deferral to shared cross-profile communication initialization. Discovery terms include YouTube, transcript, ingestion, content, search, channel, jobs, annotations, reprocess, and embeddings. Discovery/listing and skill reading must not initialize network/auth work.

### Backfill worker

Proposed dotfiles-owned TS source under `tools/onclave-backfill/`, compiled entry point and launcher paths chosen using repository build conventions. The durable installed checkout, not a temporary task worktree, is the registration target.

- Acquire a singleton before due-state changes or uploads; scheduler-level no-overlap plus a cross-process lock handles manual/test entry and multiple launch triggers.
- Read a durable local last-attempt/due record. Normal/login invocations do work only when at least 24 hours are due; missed days coalesce to one attempt, never a backlog of runs. First valid installation is due. An empty-cache scan counts as that day's attempt. Missing configuration or network failure records a bounded failure and waits until the next daily attempt, not a login retry loop.
- A native daily trigger plus login/start trigger and the shared due gate realizes consistent behavior across platforms. Do not assume launchd `StartInterval` alone persists missed runs across logout/reboot. Validate generated triggers against native documentation during T4.
- Inspect valid video-ID directories, `.complete`, transcript presence/nonempty/size, and required metadata before loading credentials or making HTTP calls. Skip invalid/incomplete entries with bounded diagnostics. No availability-hint gate and no unnecessary separate health request.
- Persist accepted content/job IDs atomically per cache entry, bound to its video ID and configured endpoint. Resume by checking status, not posting again. Recover ambiguous upload outcomes through video-ID lookup before resubmission. Existing completed matching content permits cleanup; active work is observed; failed jobs retain local data and may be retried on a later daily attempt using the supported API. Do not create rapid retry loops.
- On upload, use the existing transcript and metadata payload. Check remote video identity before accepting completion for deletion. Delete the whole video cache only after matching video identity and completed processing; preserve failures, timeouts, malformed replies, and unrelated cache entries.
- Use a five-minute whole-run deadline with individual requests capped by remaining time. No mandatory minute-long wait per entry: unfinished jobs can resume tomorrow. Ensure a repeatedly failing early entry does not indefinitely starve later valid entries within the finite budget.
- Use Node HTTP/crypto directly. Abort outstanding work on shutdown; release owned locks, retain retry state, and exit. Account for forced termination with recoverable stale-lock handling. No detached child, shell wrapper at runtime, or background model.
- Keep bounded local logs/status without transcript bodies, keys, signatures, or credential values. Surface last attempt/result and pending state through setup/status support.

### Configuration and installers

One explicit local configuration contains endpoint, key path, cache/state paths, and durable executable/artifact location where needed. Resolve endpoint at setup from existing configured sources without copying secret material. If unavailable, warn with exact corrective setup command; never invent an endpoint. Runtime reads this configuration after the local pending-work check and does not invoke BWS. Configuration/state files are gitignored and are not stored in the infrastructure inventory repository.

Native definitions:
- Windows: per-user limited Scheduled Task, interactive user context, daily and login triggers, missed-start support, ignore-new-instance policy, execution limit.
- macOS: per-user LaunchAgent, daily/calendar and load trigger as appropriate, shared due gate for missed login catch-up, standard output/error or equivalent bounded worker logging.
- Linux: systemd user oneshot service and daily persistent timer plus user-manager startup activation for catch-up. No enable-linger or system-wide service changes; systemd unavailable means warning, not cron fallback.

Setup is idempotent, safely quotes/encodes paths with spaces, captures native nonzero exits as actionable warnings at the installer boundary, and leaves unrelated tasks/services untouched. Provide setup/status/disable/uninstall entry points for this job, not a general job manager. On Windows ensure registration targets the intended user even when the installer is elevated. Build/config prerequisites must succeed before registering a runnable definition. WSL uses its own Linux user environment and cache; no Windows scheduler invocation from WSL or assumed cross-OS shared lock.

Retire detached Claude hooks rather than leave them as an installation-failure fallback. Warn that automatic backfill is unavailable if registration fails; local transcripts remain intact. Preserve unrelated Claude hooks and settings.

## Execution and integration guidance

Planning does not authorize execution. When execution is requested, record actual worktree paths/branches and clean/dirty starting evidence before code changes. Proposed dotfiles branch/worktree: `task/onclave-vault-tools-and-daily-backfill` in a sibling task directory. Onclave changes must remain in the canonical module checkout as explicitly requested; this is an exception to separate module worktrees, not permission to switch its branch. Coordinate writes so no worker edits the same owning surface concurrently.

Continue independent tasks around blockers. Adapt equivalent implementation details within settled intent; ask before changing scope, daily behavior, deletion semantics, supported platforms, or validation. Do not turn optional improvements or reviewer suggestions into acceptance requirements.

Repository publication constraint: module commits must be committed and pushed before the parent gitlink is committed. Execution alone does not authorize push. Therefore finish independent implementation/checks and commit module work locally, then request permission to push that module branch when needed. Until confirmed publication, do not commit an unpublished gitlink or declare coordinated integration complete. Never force-push/amend/rebase pushed module commits. Pull the module before updating the parent pin, preserving unrelated changes. This is a concrete closeout prerequisite, not a new approval sequence.

## Tasks

- [x] **T1: Shared Onclave client and portable vault contracts**
  - Depends on: none.
  - Extract/reuse existing signer and request behavior into a supported client export. Add typed methods for the listed vault capabilities and endpoint/key configuration without agent registration. Update communication imports only as necessary, preserving their behavior.
  - Inspect each Python wrapper's actual options and corresponding server route; record the finite operation-to-method mapping in this spec or tests before removal.
  - Verify signer compatibility with server verification, authenticated request paths/bodies, URL normalization, error/status handling, cancellation and deadlines using in-process/local HTTP tests. Run Onclave typecheck and focused client/auth/communication tests.
  - Done when T2/T3 can use the client without importing Pi runtime or spawning another program.
  - Evidence: Implemented in Onclave commits `1f6b92b` and `647aff3`. `pnpm run check` passed with 253 tests passed and 1 skipped; focused client, vault-tool, vault-auth, and communication tests passed (46 tests); `git diff --check` passed on 2026-09-11.

- [x] **T2: Deferred vault tools and YouTube skill**
  - Depends on: T1.
  - Add bounded Onclave tool definitions and thin default wiring; implement startup deferral through existing activation behavior. Add proposed `pi/profiles/default/skills/youtube/SKILL.md`; update `/yt` to use discovered tools, preserving repository-comparison/no-unsolicited-edit behavior. Keep `/yt-local` explicit and Python-backed.
  - Verify each operation mapping, parameter validation, cancellation, content output bounds, failures and job-ID returns. Offline loader check: tools start inactive, search activates matches, unrelated tools stay unchanged, new-session deferral works, and discovery invokes no network. Verify tool execution does not register an Onclave communication agent.
  - Done when Pi's supported API workflow has no Python CLI dependency and skill guidance names real registered capabilities.
  - Evidence: Implemented in Onclave commits `037bf07` and `647aff3` plus dotfiles default-profile wiring. Default `pnpm run typecheck`, focused `pnpm test tests/tool-search.test.ts tests/tool-visibility.test.ts` (7 tests), and `pnpm run check:runtime` passed on 2026-09-11. Discovery remains offline and the four grouped tools cover all retired API operations.

- [x] **T3: Daily local-first backfill worker**
  - Depends on: T1; independent of T2.
  - Implement compiled worker, configuration loader, due-state, singleton, persisted remote IDs, video confirmation, bounded processing, cleanup, and status. Reuse existing complete-cache format from Python fetchers without rewriting those integrations.
  - Verify fixture-based empty/incomplete/corrupt/oversize entries; no-network/no-key-read empty run; first/daily/not-due/catch-up behavior; concurrent invocations; matching completed remote content; existing active/failed content; upload-response loss recovery; endpoint-bound resume; timeout/abort retention; stale-lock recovery; deletion limited to confirmed video directory; a failing entry does not starve the entire queue.
  - Done when one directly owned Node process can complete the daily attempt with no detached subprocess and preserve all unconfirmed data.
  - Evidence: Implemented under `tools/onclave-backfill/`. Worker typecheck, build, and 27 tests passed on 2026-09-11, including local-first, crash-safe due state, rotating fairness, resume, timeout, and deletion checks.

- [x] **T4: Cross-platform native scheduler setup**
  - Depends on: T3.
  - Implement generated native definitions and setup/status/disable/uninstall scripts, with explicit absolute executable/artifact/config paths. Verify native semantics from official systemd, launchd, and Task Scheduler documentation, especially logout/login missed-run behavior, without assuming the earlier chat snippets are production-ready.
  - Integrate after usable default runtime/build prerequisites in `install`, `install.ps1`, and the applicable WSL install path. Record actual entry points; avoid duplicate registration through nested installers.
  - Test Linux, macOS and Windows rendering/command plans, quoting, repeated registration, unsupported/missing scheduler, failed build/config/native command, intended Windows user identity, and uninstall ownership through injected runners. Installer failures must visibly warn and continue subsequent independent steps. Assert no cron fallback and no runtime shell sourcing.
  - Done when setup produces a daily/login-triggered job with shared due gating and correct nonfatal failure behavior on all three platform adapters.
  - Evidence: Implemented fixture-rendered Windows, macOS, and Linux scheduler setup/status/disable/uninstall plus nonfatal installer integration. Worker scheduler tests are included in the 27 passing tests; `shellcheck --severity=warning install wsl/install`, `shfmt -d -i 4 -ci install wsl/install`, PowerShell parsing, 28 Pester tests, and affected installer tests passed on 2026-09-11. No live task was registered.

- [x] **T5: Retire superseded clients and document migration**
  - Depends on: T2, T3, T4.
  - Remove replaced Python HTTP wrappers/shared-only helpers and their superseded tests/dependencies/entry points from `tools/onclave-youtube/`. Preserve `fetch_transcript.py`, `fetch_metadata.py`, their needed shared helpers/dependencies/tests, and local cache contents.
  - Remove Claude backfill/probe registrations and obsolete circuit implementation if unused; remove obsolete Claude YouTube command/instruction surfaces and their owning links/references, not unrelated Claude features. Do not inspect/change legacy Pi to hunt references.
  - Update default Pi documentation, root installation/development docs, scheduler operational guidance and root `CHANGELOG.md`. Explain daily fail-fast, login catch-up, deletion semantics, local configuration, unsupported-scheduler warning and removal of Claude API workflow. Update applicable WSL links in step with cross-platform link changes.
  - Verify bounded active-source reference searches excluding legacy and archives; no live default/Claude caller points at removed scripts. Run retained local-fetcher tests and installer/link tests affected by retirement.
  - Done when there is one supported Pi API path and no detached Claude backfill fallback.
  - Evidence: Removed the superseded Python API modules/tests/dependencies and Claude API/circuit surfaces while retaining the two local fetchers. Updated default Pi, root, scheduler, Claude, environment, and changelog guidance. Active-source searches excluding archives, `uv run pytest tests/test_fetch_transcript.py` (2 passed), backfill tests (24 passed), installer tests (10 passed), and Claude link tests (15 passed) passed on 2026-09-11.

- [ ] **T6: Finite integrated validation and coordinated closeout**
  - Depends on: T1-T5.
  - Run `pnpm run check` from Onclave (its typecheck + Vitest); run default profile `pnpm run typecheck`, focused new/changed Vitest files via `pnpm test <filters>` without `--`, and `pnpm run check:runtime`. Add/run the offline new-tool loader smoke within those checks.
  - Run worker/client build and their focused tests under their owning pnpm packages. Run `uv run pytest` with the exact retained local-fetcher and changed installer test filters; run shellcheck and shfmt check for changed shell scripts, PowerShell parser/fixture tests for changed PowerShell. Record final exact filters/commands and results, not hypothetical passes. Run `git diff --check` in each owning repository.
  - No live uploads, deletion of real cached transcripts, task registration, or macOS/Linux live certification is necessary for agent-owned completion. Report those unperformed platform/live checks as verification limits. Fix demonstrated task defects; do not rerun unaffected checks without cause.
  - Commit Onclave work locally, resolve module publication prerequisite above, then update parent gitlink only after confirmed push. Finish archival/integration below. Leave this checkbox unchecked until integration and required cleanup are actually finished.
  - Evidence: Agent-owned implementation checks passed on 2026-09-11: Onclave `pnpm run check` (253 passed, 1 skipped), focused cross-surface tests (46 passed), default-profile typecheck/focused tests/runtime smoke, worker typecheck/build/tests (27 passed), retained fetcher tests (2 passed), installer/config tests (37 passed), Pester tests (28 passed), PowerShell parse, shellcheck, shfmt check, and `git diff --check`. Coordinated publication, parent gitlink commit, archival, merge, metadata, and cleanup remain pending, so T6 remains unchecked.

## Validation status and next action

- Status: implementation and agent-owned checks passed; integration is blocked on separately authorized module publication.
- Execution target recorded 2026-09-11: originating checkout `C:/Users/mglenn/.dotfiles`, branch `main`, starting commit `e2b6f7c9`; task worktree `C:/Users/mglenn/.dotfiles-onclave-vault-tools-and-daily-backfill`, branch `task/onclave-vault-tools-and-daily-backfill`.
- Next: user authorizes pushing Onclave commits `1f6b92b`, `037bf07`, and `647aff3` to `origin/feature/v2-broker-core`; executor then verifies publication, commits the parent gitlink, archives the spec, merges to the recorded target, records completion metadata, and cleans the task worktree.
- Open product decisions: none.
- Known integration prerequisite: module push permission is separate and needed before committing the parent gitlink. Action owner: user grants publication permission; executor handles remaining Git integration.
- Verification limits: no live API upload/deletion, credential use, scheduler registration, or macOS/Linux native certification was performed. The deployed API version and original Windows suspension cause remain unverified. An exploratory full default-profile suite had unrelated dependency/baseline failures outside the focused agreed checks; the changed default-profile checks passed.

## Closeout contract

After implementation and finite checks pass, update evidence and record integration pending. Once the module publication prerequisite is satisfied, confirm `.specs/archive/onclave-vault-tools-and-daily-backfill/` is unused, move this whole spec directory there in the dotfiles task worktree, repair affected links, and commit the task changes and archive. Do not archive unfinished implementation or silently publish a module commit.

Merge the dotfiles task branch into its recorded originating `main` checkout unless execution explicitly says `--no-merge`. Preserve unrelated target changes without stashing, discarding, or committing them. Resolve routine task conflicts yourself; ask only for consequential scope decisions or missing external permission. If blocked, retain worktree and record reason, exact next action and owner. Do not treat archived files or passing checks as complete delivery.

After integration verify target code/gitlink/archive, absence of an active plan copy, and module branch attachment. Set archived metadata to completed with actual date, record integration commits, and commit the metadata update on target. Remove only the task worktree after confirming no uncommitted/unmerged work. Rerun checks only if conflict resolution changed checked content. Deployment, live scheduler setup and optional operator testing do not block archival/local integration and remain separately authorized.

Final execution response begins with one explicit outcome: 🟢 COMPLETED (checks, integration, metadata and cleanup done); 🔴 NOT COMPLETE: MERGE BLOCKED or USER INPUT REQUIRED; 🔵 IMPLEMENTED: MERGE SKIPPED AS REQUESTED; or 🟡 CLEANUP PENDING. For blocked outcomes lead with reason, action needed and owner, then concise checks, archived/current spec path, commits, integration result and retained worktree. Keep unfinished integration/cleanup checkboxes accurate.
