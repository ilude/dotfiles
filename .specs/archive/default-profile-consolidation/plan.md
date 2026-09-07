---
created: 2026-09-07
status: completed
completed: 2026-09-07
---

# Consolidate default Pi profile customization

## Goal and scope

- User requirement: plan all six refactors identified in the preceding review, applying SOLID and DRY where demonstrated duplication or coupling exists.
- Outcomes: consistent profile identity, shared model conversion, separated refresh responsibilities, UI-independent reload ownership, pure context/report functions, and shared auxiliary runtime configuration.
- Preserve existing commands, tool contracts, provider behavior, safety boundaries, session persistence, and resource lifetimes. Prefer small functions and narrow interfaces over inheritance or a general extension framework.
- Non-goals: new features, broad test infrastructure changes, merging feature policies, modifying upstream Pi, changing other profiles, or changing submodules.
- Authorization: user requested execution to completion without expanding scope. Implementation and agreed validation are authorized. No commit, push, deployment, or live runtime reload is requested.

## Context for a fresh session

All code paths are relative to the dotfiles repository root. Proposed paths below are not existing implementations. Read applicable `AGENTS.md` files before acting.

- Owner: dotfiles, primarily `pi/profiles/default/`.
- Required reading: root `AGENTS.md`, `pi/profiles/default/AGENTS.md`, `pi/README.md`, this plan, and each task's source files.
- Before implementation, read installed Pi `docs/extensions.md` completely and relevant linked documentation/examples. For session work read `docs/session-format.md`; for runtime factory work read `docs/sdk.md`; for footer changes read `docs/tui.md`. Resolve these against the installed Pi package, not this checkout. Follow the testing skill when changing tests.
- Verified by source inspection on 2026-09-07: repeated profile directory resolution; duplicate model compatibility normalization; refresh command combines transport, parsing, persistence, reconciliation, settings and presentation; `/clear` imports reload state from the footer; context calculations and presentation share one extension; web screening and commit construct the same profile-local model runtime configuration.
- This was a bounded source review, not a complete architecture audit. Inspect task-local call sites before moving code.
- Existing work to preserve: session-profile metadata logging, documentation and tests from the preceding request. At execution start these were committed and the checkout was clean; the implementation preserves them.

### Pi profiles

- Planning profile: verified `default`, `PI_CODING_AGENT_DIR=C:\Users\mglenn\.dotfiles\pi\profiles\default`.
- Launcher mapping: bare `pp` selects `pi/profiles/default/`; `pp -p legacy` selects legacy; named profiles use their own directories.
- Intended implementation/validation profile: `default`, `pi/profiles/default/`, using pnpm.
- Other profiles: legacy and arbitrary named profiles are unchanged. Shared helpers here remain default-profile-owned.

| Date | Actual profile/path | Work or check | Result |
| --- | --- | --- | --- |
| 2026-09-07 | default / pi/profiles/default | Planning and source inspection | No refactor implementation or runtime verification |
| 2026-09-07 | default / pi/profiles/default | T1-T6 implementation and focused checks | Passed; per-task evidence below |
| 2026-09-07 | default / pi/profiles/default | Final typecheck and full Vitest suite | Typecheck passed; 36 files passed, 1 skipped; 229 tests passed, 6 live-web tests skipped |
| 2026-09-07 | default / pi/profiles/default | Model catalog loader smoke, report parity, diff review | Offline Pi 0.85.0 loader passed; 2 report parity cases passed; diff check passed |

## Decisions and contracts

| Decision | Source/status | Choice | Tasks |
| --- | --- | --- | --- |
| Scope | User-selected | Cover all six reviewed opportunities | T1-T6 |
| Profile directory | Proposed implementation default | Use native `getAgentDir()` instead of independent environment/home fallbacks; derive the profile label through one helper | T1 |
| Profile label compatibility | Verified | Native `getAgentDir()` expands tilde but does not resolve symlink aliases; its fallback is `~/.pi/agent`. One helper uses the directory label, retaining `default`, named profiles and `agent` fallback. Historical metadata is not rewritten | T1 |
| Model conversion | Verified preservation constraint | Shared compatibility normalization; refresh retains remote > existing > legacy thinking-map precedence | T2-T3 |
| Reload ownership | Proposed implementation default | A profile-owned non-UI service owns monitor state/lifecycle; footer consumes state and `/clear` queries it | T4 |
| Auxiliary runtime | Proposed implementation default | Share configuration/factory only, not instances, cancellation, tools, permissions, or lifetime | T6 |
| Error and lifecycle behavior | Preservation requirement | Keep existing per-feature error handling, timing, cleanup, cache semantics and user-visible output | All |

Proposed module names are defaults, not reasons to create extra layers. If inspection reveals a consequential behavior conflict, record the exact conflict and ask rather than folding a behavior change into refactoring.

## Execution guidance

**Before expanding work:** Which existing requirement needs this addition, and what evidence justifies it? Do not turn optional improvements into tasks or completion criteria.

**At scope checkpoints:** Check whether recent work advances the agreed requirements or has drifted into repeated verification, speculative cases, or unnecessary complexity. Continue required work without starting another audit.

**Recovery when drift is found:** Stop the detour and remove unnecessary code, tests, and plan items introduced during execution without disturbing pre-existing or concurrent work. Note anything that cannot safely be removed. Restore the agreed completion criteria and resume the next required step.

## Tasks

All pnpm commands below run from `pi/profiles/default/`. Test paths are repository-root-relative when named in Inputs/files.

- [x] **T1 — Centralize active profile identity and paths**
  - Depends on: implementation authorization.
  - Inputs/files: `pi/profiles/default/extensions/{session-launch,session-profile,operator-footer}.ts`, `pi/profiles/default/lib/codex-usage.ts`, `pi/profiles/default/lib/bedrock/ledger.ts`, `pi/profiles/default/lib/settings-file.ts`; native `getAgentDir()` implementation; `scripts/pp` and `scripts/pp.ps1` for naming semantics only.
  - Do: resolve native directory and label semantics first; introduce proposed `pi/profiles/default/lib/profile.ts` only for the common label/path contract native Pi does not supply. Replace repeated active-directory fallbacks. Preserve existing settings-file compatibility exports if needed. Do not centralize unrelated home-directory paths such as Codex CLI auth.
  - Verify: focused proposed `tests/profile.test.ts` for supported directory/label semantics; existing `session-profile.test.ts`, `usage-context-tps.test.ts`, `bedrock-accounting.test.ts`, `browser-control.test.ts`. Cover affected session-launch command construction without launching real terminals.
  - Done when: targeted consumers share native directory resolution and one label helper, normal launcher labels are unchanged, and session metadata remains outside model context without duplicate same-profile entries on reload/resume.
  - Evidence: 2026-09-07, default profile. Native directory resolution adopted; `profile.ts` owns labels. Profile/launch, session metadata, usage, Bedrock and browser checks passed in the combined 52-test T1-T3 run. Terminal spawning mocked.

- [x] **T2 — Share model compatibility and definition conversion**
  - Depends on: implementation authorization; ordered after T1 for incremental delivery.
  - Inputs/files: `pi/profiles/default/extensions/model-visibility.ts`, `pi/profiles/default/extensions/refresh-models.ts`; their existing tests.
  - Do: introduce proposed `pi/profiles/default/lib/models/compat.ts` for legacy map normalization and the genuinely shared definition fields. Retain provider/refresh-specific fields and precedence at their owning layer. Avoid forcing different definition contracts into one lossy converter.
  - Verify: `pnpm test model-visibility.test.ts refresh-models.test.ts`; add focused cases to those tests for legacy maps, absent compatibility, preserved definition fields, and remote/existing precedence as needed.
  - Done when: duplicated normalization is removed and both paths produce equivalent definitions under their existing contracts.
  - Evidence: 2026-09-07, default profile. `lib/models/compat.ts` owns normalization/shared definition fields. `model-compat.test.ts` verifies field preservation and precedence; model-visibility/refresh tests passed in the combined 52-test run.

**Scope checkpoint:** T1-T2 should remove concrete duplication, not establish a new framework or change naming/provider policy.

- [x] **T3 — Separate model refresh transport, persistence and reconciliation**
  - Depends on: T2.
  - Inputs/files: `pi/profiles/default/extensions/refresh-models.ts`, `pi/profiles/default/extensions/model-visibility.ts`, `pi/profiles/default/lib/settings-file.ts`, `pi/profiles/default/tests/refresh-models.test.ts`, `pi/profiles/default/scripts/model-catalog-smoke.mjs`, `pi/profiles/default/docs/bedrock.md`.
  - Do: extract proposed `lib/models/catalog.ts` for requests/parsers, `lib/models/cache.ts` for cache IO/migration, and `lib/models/reconcile.ts` for definition reconciliation under the default profile. Keep command registration, lifecycle coordination and presentation in the extension. Separate settings mutation from pure reconciliation. Use narrow request/storage dependencies only where they decouple actual side effects. Preserve native Bedrock delegation and existing startup cache restoration.
  - Verify: `pnpm test refresh-models.test.ts model-visibility.test.ts` and `node scripts/model-catalog-smoke.mjs`. Retain focused coverage of provider failure isolation, cache round trips/migration, curated scope, and reload decisions. No live catalog calls required.
  - Done when: extension coordinates independently testable catalog/cache/reconciliation functions without changing command output, authentication rules, timeout behavior or persisted formats.
  - Evidence: 2026-09-07, default profile. Catalog, cache, reconciliation, shared types and parsing values extracted under `lib/models/`; settings mutation remains in the command coordinator, outside pure reconciliation. Existing refresh/visibility tests passed; `model-catalog-smoke.mjs` passed through Pi 0.85.0's real loader offline.

- [x] **T4 — Give reload monitoring a non-UI owner**
  - Depends on: T1.
  - Inputs/files: `pi/profiles/default/extensions/operator-footer.ts`, `pi/profiles/default/extensions/clear.ts`, `pi/profiles/default/lib/reload-monitor.ts`, `pi/profiles/default/tests/usage-context-tps.test.ts`; inspect direct reload-monitor consumers/tests before moving lifecycle code.
  - Do: introduce proposed `pi/profiles/default/lib/profile-reload.ts` and, if necessary for independent lifecycle registration, proposed `extensions/profile-reload.ts`. Move monitor instance, timer and lifecycle ownership out of the footer. Expose a narrow read/subscription interface for presentation and a reload-needed query for `/clear`. Keep resource discovery inputs and error-state semantics intact; avoid duplicate timers or footer-dependent initialization.
  - Verify: proposed `tests/profile-reload.test.ts` covering change detection, reload reset, failure indication, subscription cleanup and single-timer lifecycle; `pnpm test profile-reload.test.ts usage-context-tps.test.ts scheduler-footer.test.ts`. Use fake timers and temporary resources, not live profile mutation.
  - Done when: `/clear` no longer imports the footer; monitoring retains its existing two-second cadence and replacement/reload behavior; footer rendering does not own monitoring state.
  - Evidence: 2026-09-07, default profile. `profile-reload.ts` library owns state/timer/subscriptions; the new extension owns session hooks. Clear/footer consume it. Three focused files passed, 13 tests, covering cadence, reset/error state, one timer, listener cleanup, footer-free monitoring and existing clear/footer behavior.

**Scope checkpoint:** T3-T4 should preserve external behavior while clarifying ownership. Do not add provider support or expand reload discovery coverage.

- [x] **T5 — Separate context analysis from report rendering and Pi integration**
  - Depends on: implementation authorization; ordered after T4.
  - Inputs/files: `pi/profiles/default/extensions/context.ts`, `pi/profiles/default/tests/usage-context-tps.test.ts`, native session/context types.
  - Do: extract proposed `pi/profiles/default/lib/context-analysis.ts` for pure estimates/buckets/usage and `lib/context-report.ts` for formatting. Keep native session collection and command registration in the extension. Replace `ctx: any` at the report boundary with native types or narrow explicit input data. Do not recreate upstream context/compaction machinery.
  - Verify: `pnpm test usage-context-tps.test.ts`; add proposed `tests/context-analysis.test.ts` only for moved logic not adequately covered. Compare representative report output before/after; preserve custom-message inclusion, metadata exclusion and native compacted context handling.
  - Done when: calculations/rendering accept data rather than a broad runtime context and `/context` retains existing output and accounting semantics.
  - Evidence: 2026-09-07, default profile. Pure analysis/report modules extracted; the command collector uses `ExtensionCommandContext`. All 9 existing usage/context tests passed. A temporary Vitest comparison against HEAD verified byte-identical empty and compacted/injected/usage reports (2 cases), then fixtures were removed. An initial standalone Jiti comparison hit the known unrelated experimental pi-server import issue; the existing Vitest alias resolved it without dependency changes.

- [x] **T6 — Share auxiliary model runtime configuration without sharing runtimes**
  - Depends on: T1.
  - Inputs/files: `pi/profiles/default/extensions/web-tools/index.ts`, `pi/profiles/default/commands/commit/reviewer.ts`; corresponding web and commit tests; native `ModelRuntime.create()` API/lifecycle.
  - Do: introduce proposed `pi/profiles/default/lib/model-runtime.ts` providing the common profile-local auth/models/store configuration or a thin creation function. Migrate web screening and commit callers. Keep each caller's caching, cancellation, tool permissions, budgets and cleanup local. Do not add Damage Control or other consumers unless identical configuration is actually present and needed for this scope.
  - Verify: `pnpm test commit-reviewer.test.ts web-tools.test.ts`; focused proposed `tests/model-runtime.test.ts` checks the shared paths, `allowModelNetwork: false`, signal forwarding and independently created runtimes. Confirm actual lifetime handling at the caller tests without network calls or real commits.
  - Done when: shared configuration is defined once and caller lifetimes and security boundaries remain independent.
  - Evidence: 2026-09-07, default profile. `createProfileModelRuntime` shares creation configuration only. Web keeps successful-runtime caching; commit creates per invocation. Runtime factory, commit reviewer and web tests passed, 18 tests; model execution remains mocked.

- [x] **T7 — Integrate, document and close the refactor**
  - Depends on: T1-T6.
  - Do: update `pi/README.md` where ownership guidance changed and add one concise architectural entry to root `CHANGELOG.md`, preserving preceding session-profile work. Review changed imports/exports for extension-to-extension coupling and unintended policy changes, restricted to this diff. Record task evidence and actual execution profile.
  - Verify: `pnpm run typecheck`, `pnpm test`, and repository-root `git diff --check`. Do not repeat already-passing task checks unless their inputs changed. If a failure is demonstrably unrelated, record it and distinguish it from refactor regressions rather than expanding the task.
  - Done when: all six outcomes and finite checks are accounted for, documentation matches ownership, and no feature-policy/runtime-lifetime changes slipped into consolidation.
  - Evidence: 2026-09-07, default profile. README ownership guidance and root changelog updated. Diff reviewed for policy/lifetime changes. Final `pnpm run typecheck` passed; `pnpm test`: 229 passed, 6 intentionally gated live-web tests skipped (36 passing files, 1 skipped). `git diff --check` passed. No dependency, other-profile or submodule changes.

## Agreed validation and finish

- Use existing test infrastructure, real pure functions and temporary filesystem resources. Mock network, terminal launch and model-execution boundaries rather than testing implementation wiring alone.
- Task-local checks plus T7 are the bounded validation set. Live provider calls, real terminal/browser launches and real commits are not required.
- Do not claim runtime activation from offline tests. `/reload` or a fresh default-profile launch is needed to activate changed extensions when the operator chooses.
- Stop after agreed checks pass and outcomes are verified; no additional broad SOLID audit is required.

## Current handoff

- Status: completed on 2026-09-07.
- Completed work: T1-T7. Six scoped consolidations implemented with preserved behavior and passing agreed checks.
- Next: none. Operator can activate with `/reload` or a fresh default-profile launch.
- Blockers/open decisions: none.
- Verification limits: offline checks only; no live reload, provider calls, terminal launches or real commits. The six opt-in live-web tests were not run. No commit or push performed.

## Completion and archive

When implementation and agreed checks finish, set `status: completed` and the actual `completed: YYYY-MM-DD`, summarize results and actual profile runs, and move this entire directory to `.specs/archive/default-profile-consolidation/`. Check that the destination is absent, repair affected links, and confirm the active copy is gone. Leave unfinished work active. Archiving does not authorize commits, pushes or deleting unrelated work.
