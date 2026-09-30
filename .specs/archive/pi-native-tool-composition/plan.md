---
created: 2026-09-30
status: in-progress
completed: null
---

# Adopt native Pi tool discovery and composition

## Goal and scope

Replace default-profile custom tool discovery/deferral with native Pi 0.99.1 functionality and enable model-written JavaScript tool composition. Supply structured results for the approved custom work tools while preserving their actual permissions, result filtering, bounds, cancellation, and workflows.

Settled user decisions:
- Prefer native functionality unless evidence establishes an essential gap.
- Enable native `tool_search` and `codemode`; use codemode mode `on`, not `only`.
- Enable orchestrator built-ins `grep`, `find`, `ls`, and `powershell` normally, alongside existing defaults. Native search does not discover inactive `direct` tools.
- Codemode is available to the orchestrator and Team Lead, not ordinary subagent roles. Team Lead composition remains restricted to that role's existing tools; adding codemode does not grant shell, write, browser, vault, or Onclave communication authority.
- Native classifier helpers remain available as part of native codemode defaults. Do not migrate the existing Jev client or implement image generation.
- Allow all approved custom work/data tools below to be called from scripts and add structured output contracts.
- Keep `subagent`, `subagent_control`, `commit_run`, and child `subagent_parent` explicit-only through native `model-only` exposure. Review delegation and commit tooling separately later.

Non-goals: legacy-profile changes or validation; custom codemode/search replacement; subagent or commit workflow redesign; classifier-provider migration; image generation; service deployment; new telemetry; general extension audits; new approval gates or rollback systems.

Authorization: on 2026-09-30, the user explicitly authorized this plan's commits and pushes in both Onclave and dotfiles. Publish Onclave changes to `origin/feature/v2-broker-core` before committing the updated dotfiles gitlink; publish dotfiles changes to its recorded integration branch and configured remote after authorized integration and completion metadata. This authorization applies to task changes, not unrelated work, force-pushes, or published-history rewrites. Implementation and worktree/integration operations still start only under a subsequent execution instruction such as `/do-it`; `--no-merge` preserves its intentional integration exception. No deployment is authorized or needed: Onclave changes affect the local Pi adapter, not its services.

## Fresh-context handoff

Repository paths are relative to `C:/Users/mglenn/.dotfiles`. In implementation references and task ownership, `extensions/`, `lib/`, `tests/`, `scripts/`, `skills/`, and profile settings shorthand are relative to `pi/profiles/default/`; module task paths are relative to `modules/onclave/`. Installed Pi documentation/source paths are relative to its installed package. Read applicable instructions before acting.

- Dotfiles owns `pi/profiles/default/`, root documentation, tests, and local runtime wiring.
- `modules/onclave/` independently owns `extensions/onclave-pi/`, adapter dependencies, tests, and its commit history. Keep it attached to and tracking `origin/feature/v2-broker-core`.
- Do not inspect, edit, or run the legacy profile. The shared adapter's existing callers must keep their existing content/details behavior; do not claim legacy runtime validation.
- Planning profile: verified `default`, session `01a0f2d5-5a25-7368-9a4f-4bdab4155be1`. Intended execution profile: default with installed Pi 0.99.1 APIs or a verified compatible successor.
- Integration target: originating dotfiles checkout above, branch `main`. `.git/refs/heads/main` was `0c62b73bb64cc2c6de7bda091d88368b2fb3f487` during authoring; other instances are committing concurrently. Recheck current revisions and dirty state before execution. Do not pin execution to that old revision.
- Proposed task worktree/branch: a dedicated sibling worktree and `task/pi-native-tool-composition`; record actual values at execution. Record an independent Onclave task worktree/branch and canonical module integration target too. Never change the canonical module's prescribed branch.
- A separate user-directed instance handled RPC input dispositions. Current `subagents.ts` already consumes disposition metadata. Preserve that work and coordinate overlapping `lib/subagents/rpc.ts` changes; this plan only adjusts nested activity/error accounting there.
- Root and module status checks were clean during investigation. Later authoring-time shell metadata checks timed out; no claim is made that these earlier observations remain current.

Required implementation references:
- Installed Pi `docs/extensions.md`, `docs/cli.md`, `docs/settings.md`, `docs/sdk.md`, and `examples/sdk/14-codemode-mcp.ts`, plus affected linked API references. Resolve these under the installed package, not the repository root.
- `pi/profiles/default/skills/pi-extension/SKILL.md`, `skills/typescript/SKILL.md`, and `skills/testing/SKILL.md`; use the prompting skill for instruction changes.
- Native `dist/extensions/{tool-search,codemode}/`, `dist/core/nested-tool-calls.js`, and extension runner types/source for uncertain behavior. Offline runtime tests may use the self-contained `dist/bundle/index.js`, not experimental server entrypoints.
- Existing `extensions/tool-search.ts`, `extensions/tool-visibility.ts`, `extensions/subagent-child.ts`, `lib/subagents/launch.ts`, `extensions/scoped-instructions.ts`, `extensions/commands.ts`, and the approved tool implementations.

Verified investigation, 2026-09-30, default profile:
- Native search activates matching inactive deferred/codemode tools additively, excludes hidden/inactive direct tools, requires a nonempty query, and defaults to eight matches. Repeated search only considers tools not yet loaded.
- Native built-in search/codemode register inactive; enable with additive `defaultTools`. Children using `--no-extensions` must explicitly load needed built-ins.
- Native nested calls reach argument validation and permission hooks before execution. A blocked-call probe prevented execution. Execution events include `parentToolCallId`.
- Actual QuickJS probes exercised structured success/error values, parallel calls, cancellation retaining partial output, successful store writes, failed-write discard, restored-session values, and empty new-session state. Nested tool transport was an offline fixture; this was not a live service/provider test.
- Codemode's result conversion does not itself validate returned objects against output schemas. Structured error data resolves as data instead of automatically throwing.
- An actual extension-runner probe reproduced scoped-instruction text augmentation deleting structured content. Nested result text alone is not persisted as conversation history.
- Baseline `pnpm test tool-search.test.ts tool-visibility.test.ts scoped-instructions.test.ts subagent-loader.test.ts` in default passed: 4 files, 37 tests. These pre-migration tests are not proof of the new design.

## Decisions and implementation contract

### Exposure and loading

- Orchestrator settings remove `-builtin:tool-search`, add native search/codemode and the four approved built-ins through additive defaults, and set/retain `codemode.mode: on`. Preserve theme, model, provider, and other unrelated settings.
- Optional tools currently hidden by custom visibility become native `deferred`: image tools, Jev, analytics, Herdr controls, and vault tools. Already-direct work tools remain direct unless an equivalent native detail is needed. Do not broadly turn command-scoped tools into deferred tools.
- Remove both custom search implementations and redundant visibility resets, including Herdr's separate reset. Native `tool_search` and `codemode` already use `model-only`.
- Keep command-driven activation such as `/yt` additive. Preserve command-invocation enforcement. Helpers used by still-needed command activation are not redundant simply because discovery migrated.
- All roles with search permission load native search. Only Team Lead adds codemode to its frozen tool list and explicitly loads it. Child startup must not activate every registered deferred tool. Expose/search only permitted optional registrations; retain the existing runtime authority hook for both direct and nested calls.
- Preserve project role-definition behavior within these decisions; do not grant codemode to an arbitrary role just because it has search permission.
- Adopt the native search interface, ranking, renderer, and discovery guidance. Do not preserve custom list mode, `include_params`, activation switches, or formatting as a second implementation.

### Approved structured/composable tools

| Owning surface | Tools |
| --- | --- |
| Web | `web_search`, `web_fetch` |
| Local data | `image_properties`, `image_transform`, `jev_evaluate`, `log_analytics` |
| Session/scheduler | `pi_session`, `session_messages`, `session_launch`, `schedule` |
| Browser | `browser_session`, `browser_page` |
| Herdr | `herdr_layout`, `herdr_agent`, `herdr_pane` |
| Onclave adapter | `onclave_instances`, `onclave_message`, `onclave_vault_search`, `onclave_vault_content`, `onclave_vault_ingest`, `onclave_vault_jobs` |

Provide useful `outputSchema` and matching `structuredContent`, not an opaque string or universal untyped blob. Reuse already-returned data where valid. For multi-operation tools, expose operation-specific shapes or a practical discriminated response. Preserve meaningful dynamic fields such as analytics SQL rows and selected vault metadata while typing identifiers, lists, receipts, pagination, and status fields used for composition. Routine field naming and schema placement are executor choices.

- Keep conversational `content` and renderer `details` useful and compatible. Structured output is not permission to expose raw backend objects, internal credentials/storage paths, blocked content, or unlimited payloads.
- Web structured output must correspond to the screened, bounded material, with screening/backend metadata. Preserve existing fallback and best-effort screening semantics; do not silently harden unavailable-review behavior.
- Browser output uses existing public state, sanitized URLs, and redacted output. Include actual discovery candidates and exact target IDs, not just counts. Preserve ownership/protected-surface semantics.
- Vault output preserves existing compact/full projections and internal-path exclusions. Ingest/job receipts distinguish accepted/pending from completed. Communication receipts do not prove recipient completion.
- Analytics retains coverage, scope, continuation, truncation, and cost information. Do not create an analytics index of nested calls or rewrite historical records as part of this migration.
- Scheduler exposes full IDs/run times rather than requiring parsing abbreviated display text. Preserve scheduling and process/session lifetime rules.
- Jev's existing structured error-return path must expose an unmistakable success/error distinction. Preserve thrown failures elsewhere rather than converting every error into data. Verify result values against declared schemas in focused tests; do not assume codemode supplies runtime output validation.
- Internal commit-agent `commit_git_review` and `ask_ignore` remain unchanged and outside codemode. Explicit-only lifecycle tools do not need new structured output in this migration.

### Nested compatibility

- Preserve existing damage-control checks through native nested hooks. Script source is not a replacement for analyzing actual nested shell/file operations. No new blanket script approval gate.
- Fix scoped-instruction delivery so nested calls retain structured output and relevant guidance reaches the outer model-facing result. Mark instructions delivered only through the appropriate persisted result, preserving trust, deduplication, errors, and branch reconstruction. Prefer extension-owned result augmentation, not changes to Pi or a custom codemode tool.
- Track in-flight nested/outer activity sufficiently to avoid reporting model work while an outer script still runs. A script may handle an inner failure; do not automatically fail an assignment solely because a handled nested call emitted an error. Preserve actual unhandled outer failures and RPC disposition behavior.
- Existing provenance hooks observe nested starts. Preserve that evidence; add parent linkage only where needed to correctly interpret nested events. Do not introduce separate telemetry.
- Session store/branch behavior remains native. Do not add custom persistence, rollback, or retry behavior around scripts.

## Execution guidance

Create dedicated task worktrees and record actual branches/targets before editing. Preserve unrelated changes and carry task-owned plan content without deleting its source. Consult Strategist before delegating unless the user explicitly requests a single-agent handoff, including a Team Lead. Assign at most one named task per subagent; split tasks if their concrete implementation proves oversized. Reviewers/validators remain read-only.

Tasks below have disjoint primary write ownership. Avoid assigning shared mocks, settings, and integration tests to multiple writers. Continue independent work around blockers. Adapt mechanisms within settled intent, but ask before changing scope, permissions, accepted defaults, or completion criteria. Do not expand the deferred subagent/commit review into acceptance requirements.

## Execution record

- Invocation: `--no-merge .specs/pi-native-tool-composition/plan.md`, 2026-09-30, verified default profile, session `01a0f45a-6d00-75c0-a763-12e00924a8e0`. Task dependencies link installed Pi 0.99.1.
- Dotfiles task: `C:/Users/mglenn/dotfiles-pi-native-tool-composition`, branch `task/pi-native-tool-composition`; integration target `C:/Users/mglenn/.dotfiles`, branch `main`, starting commit `12ed41afa33584f08a7bb51052ec96fe064989fb`.
- Onclave task: `C:/Users/mglenn/dotfiles-pi-native-tool-composition/modules/onclave` (created at sibling `C:/Users/mglenn/onclave-pi-native-tool-composition`, relocated after T8 settled for actual loader/gitlink wiring), branch `task/pi-native-tool-composition`; canonical target `C:/Users/mglenn/.dotfiles/modules/onclave`, branch `feature/v2-broker-core`, starting commit `89411c61ad75a9239452df753f76e928ebb7bc3c`.
- Both originating checkouts were clean. Dedicated worktrees created. T1 through T8 assigned to disjoint implementation owners, including separate T5a/T5b and T6a/T6b.
- Integration and task-worktree cleanup are intentionally pending under `--no-merge`; publish task branches only. Do not advance canonical targets.

## Tasks

- [x] **T1: Preserve scoped instructions across structured and nested results**
  - Depends on: none. Parallel with T2-T8 in their owned files.
  - Owns: `extensions/scoped-instructions.ts` and its focused tests.
  - Change: preserve structured payloads when augmenting direct results; deliver nested-discovered instructions through the outer persisted result, with existing trust/deduplication/branch behavior.
  - Complexity: nested results are not persisted; handle successful/error outer completion and shared source reservations without silently marking undelivered guidance consumed.
  - Verify: scoped-instruction tests including the real runner's structured-content replacement behavior and nested outer-result delivery.
  - Done when: scripts receive structured data and the model receives relevant guidance without duplication or changed trust semantics.
  - Evidence: 2026-09-30 default task worktree, scoped-instructions tests passed (18), focused TypeScript and diff checks passed. Includes real extension-runner structured preservation and persisted outer delivery/error/deduplication coverage. Integrated typecheck remains T9.

- [x] **T2: Migrate native loading, exposure, and frozen role authority**
  - Depends on: none for implementation; consumes T1 before integrated acceptance.
  - Owns: settings, custom search/visibility removal, child registration/loading, Team Lead definition, explicit-only registrations, activation helper cleanup, shared mock adjustments, and discovery/authority tests. T5a/T5b/T7/T8 own native exposure changes in their tool files, keeping this task's write ownership separate.
  - Change: implement the exposure/loading contract and remove competing native-tool replacements. Leave RPC input disposition work intact.
  - Verify: native search/visibility/child-loader/launch tests and command lifecycle tests. Use an actual installed CLI/bundle child load to verify native built-ins and permitted callable tools; ordinary children do not receive codemode or unauthorized deferred tools.
  - Done when: orchestrator and Team Lead can discover/compose permitted tools, ordinary roles retain search without codemode, and explicit-only tools are not script-callable.
  - Evidence: 2026-09-30 default task worktree, loader/launch/command focused tests passed (27 initial); final loader tests passed (10), related loader/child-outcome/launch tests passed (24), default typecheck and diff check passed. Actual installed CLI Team Lead and ordinary-child checks verify native loading, ordinary no-codemode, permitted optional registrations initially inactive, and unauthorized deferred/codemode-only exclusions. Frozen authority and command behavior preserved.

- [x] **T3: Make nested activity and failure tracking accurate**
  - Depends on: none; coordinate `rpc.ts` with the other instance before editing.
  - Owns: `lib/subagents/child-surface.ts`, task-related `lib/subagents/rpc.ts` tracking changes, relevant activity/provenance tests; any needed provenance parent linkage.
  - Change: account for outer/nested calls and script-handled inner failures without altering delegation, ownership, steering, handoff, or commit behavior.
  - Verify: focused visible/headless tracking tests for overlapping nested calls, cancellation, handled inner error, and unhandled outer error; preserve current disposition tests.
  - Done when: an inner completion cannot prematurely report model phase or falsely mark an otherwise successful outer script as an assignment failure.
  - Evidence: 2026-09-30 default task worktree, visible/headless tracking, RPC and provenance focused checks passed (4 files, 27 tests), default typecheck and changed-file diff check passed. Overlap/cancellation/handled-inner/unhandled-outer cases covered. RPC was clean before edits and disposition commit `3aede8cf` was inspected and preserved.

- [x] **T4: Add structured web results without bypassing screening or bounds**
  - Depends on: none. Parallel with other result tasks.
  - Owns: web-tool implementations and web result/screening tests.
  - Change: typed search items and fetched content/metadata; expose only material consistent with existing screening and bounds. Keep these tools directly declared and script-callable.
  - Verify: focused offline web tests with stubbed acquisition/reviewer boundaries; cover no results, screened/unavailable-review content, flagged failures, fallback metadata, and bounded structured payloads.
  - Done when: search-to-fetch scripts use typed results without recovering blocked/unbounded raw data.
  - Evidence: 2026-09-30 default task worktree, web-tool/screening checks passed (45 tests, 6 skipped), web TypeScript check passed. Structured screened/bounded fields and selected backend/review metadata preserve fallback semantics. Local redirect subprocess timeout was intermittent (three passing reruns before change); unused redirect body cancellation now starts without waiting for stream teardown, and full checks passed afterward. This does not prove the original timeout's cause.

- [x] **T5a: Add native deferred image/Jev tools and structured results**
  - Depends on: none. Parallel with other result tasks.
  - Owns: image/Jev tool exposure and result definitions, nearby result-schema helpers if needed, and their focused tests. Do not redesign underlying providers.
  - Change: use native deferred exposure; expose existing image metadata/destination data and typed Jev answers/errors.
  - Verify: focused image and Jev tests; schema checks on successful and existing data-bearing error results.
  - Done when: scripts consume image/Jev results without parsing display text and existing limits/provider behavior remain unchanged.
  - Evidence: 2026-09-30 default task worktree, image/Jev focused tests passed (2 files, 13 tests), success and existing data-bearing error schemas checked; diff check passed. Native deferred exposure implemented without provider changes.

- [x] **T5b: Add native deferred analytics and structured operation results**
  - Depends on: none. Parallel with other result tasks.
  - Owns: analytics tool exposure/result definitions, nearby schema helpers if needed, and focused tool tests. Do not redesign the worker or database.
  - Change: native deferred exposure and analytics operation shapes with bounded rows, coverage, costs, and cursors.
  - Complexity: several dynamic result variants; type useful composition fields without turning arbitrary SQL rows into a fixed domain schema. No broad database test phase.
  - Verify: focused analytics tool tests and schema checks including pagination/truncation/coverage metadata.
  - Done when: analytics pipelines consume operation data without text parsing or lost bounds/evidence.
  - Evidence: 2026-09-30 default task worktree, analytics focused tests passed (5), output schema checks cover all six operations including dynamic rows, pagination, coverage, costs and truncation; diff check passed. No worker/database redesign.

- [x] **T6a: Add structured browser action results**
  - Depends on: none. Parallel with other result tasks.
  - Owns: `browser-control.ts` result definitions and related helpers/tests.
  - Change: typed public session, discovery candidate, target, snapshot, and action data. Keep direct/script availability and existing redaction, ownership, protected-surface, and lifecycle semantics.
  - Verify: focused offline browser tests with schema fixtures for action variants and absent/error cases. No real browser launch needed for schema fixtures.
  - Done when: browser list/select/act pipelines consume useful sanitized data without new authority.
  - Evidence: 2026-09-30 default task worktree, `pnpm test browser-control.test.ts`: 16 tests passed. Structured discovery candidates, sanitized exact page targets and redacted snapshots validated against output schemas. No real browser launched.

- [x] **T6b: Add structured session and scheduler results**
  - Depends on: none. Parallel with other result tasks.
  - Owns: `session-profile.ts`, `session-launch.ts`, `scheduler.ts`, related result helpers/tests.
  - Change: typed session identity/projections, launch receipts, and full scheduler identifiers/times. Preserve direct/script availability and process/session lifetime rules.
  - Verify: focused session/launch/scheduler tests and result schema checks; no real process launch needed for schema fixtures.
  - Done when: session lookups and schedule list/cancel/create pipelines have usable data without lifetime changes.
  - Evidence: 2026-09-30 default task worktree, focused session/launch/scheduler tests passed (3 files, 33 tests), output schema checks and diff check passed. Full schedule IDs/times and launch receipts preserved; no process launched.

- [x] **T7: Add structured Herdr results**
  - Depends on: none. Parallel with other result tasks.
  - Owns: Herdr native exposure/reset removal, result contracts/rendering-compatible changes, and focused Herdr tool tests.
  - Change: native deferred exposure for all three tools, removal of the redundant startup reset, and typed layout/agent/pane results, receipts and bounded text. Preserve shell checks, caller-pane protection, and submitted-versus-completed distinctions.
  - Verify: existing focused Herdr tool tests plus schema assertions for list/read/submit/wait operations and task-relevant failures.
  - Done when: scripts can select exact targets and consume results without bypassing existing controls or implying delivery/completion guarantees.
  - Evidence: 2026-09-30 default task worktree, Herdr focused tests passed (21) and default typecheck passed. Typed projected layout/agent lists, pane reads, agent prompt/wait and pane run/wait schemas validated; safety, caller protection and submitted receipt checks retained. Native deferred registrations replace startup deactivation.

- [x] **T8: Migrate Onclave adapter exposure and structured results in its repository**
  - Depends on: none for implementation; its committed/published module revision is required by T10.
  - Owns: module adapter source/tests, relevant package manifests/lockfile, and material module-owned documentation. Do not duplicate adapter code in dotfiles.
  - Change: vault tools use native deferred exposure; all six approved adapter tools provide structured contracts. Update development/type compatibility for Pi 0.99.1 as needed. Preserve existing content/details consumers and direct connection-dependent activation of communication tools; do not replace connection readiness with deferral.
  - Verify: from module root, `pnpm typecheck` and focused adapter Vitest tests for vault operations/projection, communication, connection/extension registration, presentation, and schemas. Exercise the host 0.99.1 registration contract offline. Do not inspect or run the legacy profile.
  - Done when: native host search/composition reaches projected adapter data while old conversational/renderer contracts remain compatible and module checks pass.
  - Evidence: 2026-09-30 independent module task worktree, module typecheck passed; adapter Vitest suite passed (11 files, 92 tests), changed-file diff check passed. Installed Pi 0.99.1 CLI loaded adapter offline and displayed registered flags. Six structured contracts and deferred vault exposure implemented; legacy runtime not inspected or validated. Candidate remains uncommitted until T9.

- [x] **T9: Integrate native runtime checks and operator guidance**
  - Depends on: T1, T2, T3, T4, T5a, T5b, T6a, T6b, T7, and T8 provide exposed tools, structured contracts, and nested compatibility.
  - Owns: proposed focused native-composition integration test/smoke files under default `tests/` or `scripts/`, affected guidance/skills, `pi/README.md`, and root `CHANGELOG.md`.
  - Change: remove stale custom-search guidance; document native direct/script use, permitted roles, explicit-only tools, meaningful structured errors, and native store/side-effect semantics. Record native defaults rather than duplicating the entire codemode manual.
  - Verify: bounded offline actual QuickJS/installed-runtime checks for search/compose, model-only exclusion, role authority, hook blocking, screened/projected data, nested instructions, parallel independent calls, cancellation, store restoration and branch isolation. Mock external services/models only, not native search/codemode behavior.
  - Run from default: `pnpm run typecheck`, task-relevant Vitest files, and the focused native-runtime smoke if separate. Run module checks against the candidate T8 revision. Fix demonstrated task defects; stop after finite checks pass.
  - Done when: integrated native behavior is exercised, documentation matches implemented behavior, and remaining live/provider checks are accurately described as non-blocking limits.
  - Evidence: 2026-09-30 verified default task profile/path, `node scripts/native-composition-smoke.mjs` passed on installed Pi 0.99.1. Actual native search/QuickJS, native host callable projection/model-only exclusion, real scheduler executor, ExtensionRunner permission blocking, structured nested data with persisted outer scoped guidance, parallel calls, cancellation/partial output, failed-store-write discard and branch-local store restoration exercised offline. Default `pnpm run typecheck` passed; final focused Vitest checks passed (4 files, 42 tests), following per-task passing checks above. Relocated module candidate typecheck passed and focused adapter checks passed (3 files, 39 tests), following T8's full 92-test adapter run. `just check` wrapper could not start due non-TTY pnpm reinstall/removal request; agreed direct module commands passed. Guidance and root changelog updated; no live/provider claim.

- [ ] **T10: Commit, publish the module revision, archive, integrate, and publish dotfiles**
  - Depends on: T9 passes. Task commits and pushes are already authorized.
  - Change: pull inside the canonical Onclave target without rewriting published history before updating the parent pin; preserve unrelated work. Integrate task module work onto its prescribed branch, commit and push module changes first. Then update the dotfiles gitlink to that published revision.
  - Archive the entire spec and commit implementation/archive on the dotfiles task branch. Follow the closeout contract below for authorized local integration and cleanup. After integration and completion metadata, the orchestrator pushes the dotfiles integration branch to its configured remote. `--no-merge` preserves committed task worktrees intentionally; if selected, publish only task branches without merging or advancing integration targets, and still publish the module task revision before the parent gitlink.
  - Done when: module delivery ordering is satisfied, dotfiles implementation and archive are committed, authorized integration/metadata and both repository pushes are recorded, and owned worktree cleanup is verified or intentionally skipped under `--no-merge`.
  - If publication fails or the user later withdraws permission: retain owned module/task work as needed, do not commit an unpublished parent gitlink, and report exact blocker, next action, and owner. Continue independent approved work first.
  - Evidence: Module task commit `a4b7dd9dde3e972cf696dc76e85d8fa8d4263d93` published to `origin/task/pi-native-tool-composition` on 2026-09-30 before parent gitlink staging. Canonical module target remains on `feature/v2-broker-core`; origin target was fetched and matched the task starting commit. `--no-merge` overrides target integration/pull advancement and cleanup. Dotfiles archive/task commit and task-branch publication are next, owned by orchestrator.
  - [x] Implementation and agreed checks passed.
  - [x] Module task revision committed and published before parent gitlink.
  - [ ] Whole spec archived and dotfiles task changes committed.
  - [ ] Dotfiles task branch published.
  - [ ] Integration into recorded canonical targets, intentionally skipped under `--no-merge`.
  - [ ] Task-worktree cleanup, intentionally skipped under `--no-merge`.

Concurrent implementation groups: T1/T2/T3 and the disjoint result tasks T4/T5a/T5b/T6a/T6b/T7/T8 may proceed independently after assignment boundaries are confirmed. T2 owns shared mock changes; integrate that supporting interface before dependent tests use it. T9 consumes all implementation results. T10 handles delivery only after checks and the publication prerequisite.

## Agreed validation and current handoff

- Status: execution in progress; settled behavior, scope, and task commit/push authorization remain unchanged.
- Completed: T1 through T9 implementation and agreed checks. Module task revision is committed and published. See per-task dated evidence above.
- Next: archive/commit dotfiles with the published module gitlink, then publish its task branch and record delivery receipts.
- Blockers/open decisions: no user decision pending. Integration/cleanup are intentionally pending under `--no-merge`. Commits and task-branch pushes in both repositories remain authorized; deployment is excluded.
- Existing unrelated check limit: `pnpm test subagent-coordinator-control.test.ts` reproduced 7 failures/5 passes in unchanged canonical default at `12ed41af` on 2026-09-30 (expected accepted dispatch receipt, actual undefined at lines 81/110). This predates task changes; T3's agreed RPC disposition/tracking tests pass. No unrelated disposition redesign is included.
- Verification limits: no live service, authenticated provider, attached browser, or operator UI acceptance run. Those checks do not block agent-owned completion. Actual future runs must record date, active profile/path, scope, and result separately from these planning probes.

## Closeout

After implementation and agreed checks pass, record local integration pending. Confirm `.specs/archive/pi-native-tool-composition/` is unoccupied, move this entire spec directory there in the task worktree, repair affected links, and commit it with the dotfiles task changes after the module delivery ordering above. Do not archive unfinished implementation.

For authorized `/do-it` execution, dispatch Integrator from the recorded dotfiles target after the task commit with the closeout manifest. Integrator owns local integration, completion metadata, and clean task-worktree removal. Orchestrator owns user decisions and publication, including pushing the final dotfiles integration branch after Integrator returns. Task commits/pushes are already authorized and a later execution command does not revoke that permission unless the user says so. Never force-push or rewrite published module history. `--no-merge` intentionally retains committed worktrees and skips mutation by Integrator; publish task branches only and do not advance integration targets.

Keep unfinished integration/cleanup/publication checkboxes unchecked and record the blocker, exact next action, and owner. Operator manual/live verification does not block archival, commit, or authorized integration/publication. No service deployment is part of closeout.

Final report begins with one explicit outcome: 🟢 COMPLETED; 🔴 NOT COMPLETE: MERGE BLOCKED; 🔴 NOT COMPLETE: USER INPUT REQUIRED; 🔵 IMPLEMENTED: MERGE SKIPPED AS REQUESTED; or 🟡 CLEANUP PENDING. For blocked/pending outcomes, state Reason and Action needed before successes. Then report checks, archive path, module/root commits, integration result, and any retained worktree. Do not label the plan complete until actual delivery and cleanup are accounted for.
