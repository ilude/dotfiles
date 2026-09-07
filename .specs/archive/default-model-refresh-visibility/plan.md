---
created: 2026-09-07
status: completed
completed: 2026-09-07
---

# Port legacy model refresh and visibility without behavioral drift

## Goal and scope

- User requirements: Port legacy model refresh and model visibility into the repository-owned default Pi profile. Preserve the legacy behavior because both features have been fragile; do not redesign, simplify, broaden, or substitute native Pi behavior unless equivalence is demonstrated.
- Non-goals: Refactoring the legacy profile, changing provider authentication, refreshing models automatically in the background, adding providers that legacy did not support, revising the visibility policy, or cleaning up legacy blocklists while porting.
- Authorization: Discussion and planning only. Implementation, commits, pushes, and deployment are not authorized by this plan request.

The user's request and subsequent changes are authoritative. Keep unapproved optional work outside the task checklist and completion criteria.

## Context for a fresh session

All code paths below are relative to the dotfiles repository root. Read `AGENTS.md`, `pi/profiles/default/AGENTS.md`, and current Pi extension/model documentation before acting.

- Owning repository: this dotfiles repository. Default-profile implementation belongs under `pi/profiles/default/`; legacy remains an unchanged reference under `pi/profiles/legacy/`.
- Required legacy reading:
  - `pi/profiles/legacy/extensions/refresh-models.ts`
  - `pi/profiles/legacy/extensions/model-visibility.ts`
  - `pi/profiles/legacy/tests/refresh-models.test.ts`
  - `pi/profiles/legacy/tests/model-visibility.test.ts`
  - `pi/profiles/legacy/lib/settings-file.ts`
  - `pi/profiles/legacy/lib/bedrock-model-refresh.ts`
- Required default-profile reading:
  - `pi/profiles/default/extensions/bedrock/index.ts`
  - `pi/profiles/default/lib/bedrock/provider.ts`
  - `pi/profiles/default/lib/bedrock/model-policy.ts`
  - `pi/profiles/default/settings.json`
  - `pi/profiles/default/package.json`
  - `pi/profiles/default/vitest.config.ts`
  - `pi/profiles/default/tests/pi-web-api.ts`
  - `pi/README.md`
- Upstream API references: Pi 0.85.0 `docs/extensions.md`, especially `ctx.modelRegistry`, `ctx.reload()`, and provider refresh/persistence; and `docs/models.md`.
- Proposed new paths:
  - `pi/profiles/default/extensions/model-catalog.ts` for command/startup integration, unless the parity investigation shows two entry points are required to preserve ordering.
  - `pi/profiles/default/lib/model-visibility.ts` for the copied policy and pure predicates.
  - `pi/profiles/default/lib/model-refresh.ts` for authenticated endpoint refresh, parsing, cache composition, and scope synchronization.
  - `pi/profiles/default/tests/model-visibility.test.ts`
  - `pi/profiles/default/tests/model-refresh.test.ts`
  Exact file boundaries may change only to preserve verified load-order or provider-composition behavior, and must be recorded before implementation.
- Verified starting behavior on 2026-09-07:
  - Legacy `/refresh-models [provider]` directly queries authenticated Codex, Anthropic, OpenRouter, OpenCode, and OpenCode Go catalogs; delegates Amazon Bedrock to a legacy AWS inventory path; persists non-Bedrock catalogs; re-registers providers; rewrites `enabledModels`; and reloads only when effective model state changes.
  - Legacy visibility filters Codex, OpenRouter, OpenCode, OpenCode Go, and Amazon Bedrock at session start using exact lists, prefixes, regexes, dated/version suffix detection, preview detection, and refreshed Bedrock IDs.
  - The default profile has no general refresh or visibility extension. It has a separate native `bedrock-mantle` provider whose `/bedrock refresh` uses `modelRegistry.refresh()` and `models-store.json`.
  - Pi 0.85 native refresh exists, but its built-in remote-catalog refresh is not proven equivalent to the legacy authenticated provider endpoint requests. It must not replace those requests merely because it is newer.
- Existing work to preserve: recheck `git status --short` before implementation. Planning inspection found no reported tracked changes, but runtime/ignored profile files exist and must not be deleted or committed.

### Pi profiles

- Planning profile: `default`, verified by `PI_CODING_AGENT_DIR=C:\Users\mglenn\.dotfiles\pi\profiles\default`.
- Intended implementation/validation profile: `default`, launched by bare `pp`, with source at `pi/profiles/default/`.
- Other affected profiles: `legacy` is reference-only and must remain behaviorally and textually unchanged unless the user separately authorizes a legacy fix.

| Date | Actual profile/path | Work or check | Result / relevant model settings |
| --- | --- | --- | --- |
| 2026-09-07 | default / `pi/profiles/default/` | Planning and source inspection | No implementation or runtime verification; configured default is `openai-codex/gpt-5.6-sol`, low reasoning |

## Decisions and contracts

| Decision | Source/status | Choice or exact question | Affected tasks |
| --- | --- | --- | --- |
| D1 | User requirement | Behavioral fidelity takes priority over architectural modernization. Copy policy and behavior first; make only compatibility adaptations required by the default profile and Pi 0.85. | T1-T6 |
| D2 | User requirement | Do not alter visibility allowlists, blocklists, prefixes, regexes, snapshot/preview rules, provider order, or failure behavior without presenting a demonstrated incompatibility to the user. | T1-T4 |
| D3 | Verified | Native Pi refresh is not assumed equivalent to authenticated provider-catalog refresh. Each substitution requires contract-test evidence for request authentication, endpoint, returned metadata, persistence, and removal semantics. | T1-T3 |
| D4 | Proposed default | Preserve `/refresh-models [provider]`, all-configured-provider behavior, case-insensitive explicit resolution, unsupported-provider notices, per-provider failure isolation, summaries, and conditional reload. | T1-T4 |
| D5 | Proposed default | Preserve exact `enabledModels` rebuilding and ordering because it is part of legacy model visibility in scoped `/model` and Ctrl+P behavior. | T1, T3, T4 |
| D6 | Unresolved | Bedrock ownership differs: legacy refreshes `amazon-bedrock` via AWS CLI, while default intentionally exposes curated `bedrock-mantle` with native refresh. T1 must determine whether the existing default Bedrock path already satisfies every externally visible legacy contract. If not, stop and ask whether to port the legacy Amazon Bedrock path rather than silently translating it. | T1-T4 |
| D7 | Proposed default | Preserve the legacy cache schema and startup restoration for Codex/OpenRouter/OpenCode unless a test proves Pi 0.85 `models-store.json` reproduces malformed-cache handling, metadata composition, stale/current metadata precedence, and persistence exactly. | T1-T3 |

Required contracts:

- No refresh operation invokes `/login`, modifies `auth.json`, or persists tokens/authorization headers.
- Explicit unconfigured and unsupported providers remain actionable errors; all-provider refresh skips unsupported configured providers and continues.
- A provider refresh never publishes an empty catalog.
- Existing known model metadata remains authoritative where the legacy composition rules make it authoritative; discovered IDs receive the same defaults as legacy.
- Visibility never removes every model from a provider by re-registering an empty provider.
- Credential absence preserves the provider’s unfiltered models where legacy did so.
- Settings updates are lock-protected, atomic, formatting-preserving, and preserve unrelated keys.
- Cache/catalog files remain generated and ignored. Source policy and tests are tracked.

## Execution guidance

**Before expanding work:** Identify the exact legacy branch, assertion, or user requirement that needs the addition. Do not modernize adjacent provider code during this port.

**At scope checkpoints:** Compare the implementation and tests against the T1 parity matrix. Any intentional difference requires explicit evidence and, if externally visible, user approval.

**Recovery when drift is found:** Remove unrequired redesigns introduced during this task, retain only compatibility changes needed for Pi 0.85/default-profile ownership, and resume from the parity matrix without disturbing unrelated work.

## Tasks

- [x] **T1 — Freeze a legacy-to-default parity matrix before implementation**
  - Depends on: none.
  - Inputs/files: all required legacy/default paths above; Pi 0.85 provider and model-runtime types/implementation; proposed planning notes in this file.
  - Do: enumerate every observable branch for argument parsing, configured-provider discovery, request URL/headers, payload parsing, metadata precedence/defaults, cache restoration, filtering, settings ordering, notification severity/text intent, failure isolation, and reload conditions. Map each dependency on legacy helper code to either a minimal default-profile copy or an already-equivalent default/Pi 0.85 API. Specifically test or inspect whether native refresh can replace any direct endpoint/cache behavior and whether default Bedrock satisfies D6.
  - Verify: review the completed matrix against every test case in both legacy test files and every conditional branch in the two legacy extensions. Record it under this task or a concise `parity-matrix.md` in this spec directory.
  - Done when: every legacy behavior has an explicit preservation mechanism, a demonstrated equivalent, or a clearly stated unresolved incompatibility. File boundaries are finalized. No implementation begins while an externally visible difference is unresolved.
  - If blocked: ask the user only about the specific behavior that cannot coexist with default-profile Bedrock/provider architecture; do not choose a new behavior.
  - Evidence: Completed 2026-09-07; see `parity-matrix.md`, implementation diff, focused tests, full default-profile test run, typecheck, and offline loader smoke.

- [x] **T2 — Port the visibility policy exactly**
  - Depends on: T1.
  - Inputs/files: `pi/profiles/legacy/extensions/model-visibility.ts`; proposed `pi/profiles/default/lib/model-visibility.ts`; proposed `pi/profiles/default/tests/model-visibility.test.ts`.
  - Do: copy the target providers and all allow/exact/prefix/pattern/generic snapshot rules without policy edits. Adapt only imports, settings-path access, and Pi 0.85 model/provider types. Preserve metadata conversion, credential requirements, registration ordering, single model-registry read, concurrent credential lookup, nonempty-filter guard, and startup notification behavior.
  - Verify: port the complete legacy visibility assertions, including Bedrock refreshed IDs and regional exclusions, then run `cd pi/profiles/default && pnpm test model-visibility.test.ts`.
  - Done when: the focused tests demonstrate the same keep/hide and startup registration outcomes as legacy, with no changed policy entries.
  - If blocked: document the exact Pi 0.85 composition difference and return to D1/D2 rather than weakening a test.
  - Evidence: Completed 2026-09-07; see `parity-matrix.md`, implementation diff, focused tests, full default-profile test run, typecheck, and offline loader smoke.

- [x] **T3 — Port authenticated refresh and persistence semantics**
  - Depends on: T1, T2.
  - Inputs/files: legacy refresh extension/tests/settings helper; proposed `pi/profiles/default/lib/model-refresh.ts`, command integration path, and `pi/profiles/default/tests/model-refresh.test.ts`; default Bedrock files where T1 permits reuse.
  - Do: preserve authenticated endpoint requests and provider-specific parsing; current-metadata/cache composition; additions/removals; provider registration without auth replacement; generated cache persistence; exact curated scope synchronization; atomic settings mutation; per-provider outcomes; and conditional reload. Use native Pi refresh only for provider behavior proven equivalent in T1. Do not duplicate or replace default Bedrock routing beyond the approved D6 result.
  - Verify: port all applicable legacy refresh tests, including Codex cache precedence/context windows, Anthropic headers/metadata, generic API-key providers, settings preservation/order, Bedrock integration contract, and unconfigured-provider failure. Run `cd pi/profiles/default && pnpm test model-refresh.test.ts model-visibility.test.ts`.
  - Done when: focused tests cover every parity-matrix branch and generated data contains no credentials or authorization headers.
  - If blocked: retain the working provider slices and present the specific unresolved provider contract; do not replace it with a generic catalog refresh.
  - Evidence: Completed 2026-09-07; see `parity-matrix.md`, implementation diff, focused tests, full default-profile test run, typecheck, and offline loader smoke.

- [x] **T4 — Integrate lifecycle and command behavior in the default profile**
  - Depends on: T2, T3.
  - Inputs/files: finalized extension entry path(s), `pi/profiles/default/settings.json`, default provider load order, focused tests.
  - Do: ensure cached overlays register at extension load, visibility runs at the same effective lifecycle point as legacy, `/refresh-models [provider]` is registered once, successful changed refreshes become visible in `/model` after reload, and the current model/auth/provider stream implementation remains intact. Keep `settings.json` changes limited to what parity requires.
  - Verify: add an integration test using the actual default test seam/`ModelRuntime` where practical, plus a temp-profile offline smoke that proves extension loading, command registration, cache restoration, and visibility without contacting providers.
  - Done when: one default-profile process can load cached models, apply filtering, invoke refresh with mocked endpoints, preserve auth composition, and expose changed models after the same reload boundary as legacy.
  - If blocked: distinguish a test-seam limitation from a runtime incompatibility; do not claim runtime parity from mocks alone.
  - Evidence: Completed 2026-09-07; see `parity-matrix.md`, implementation diff, focused tests, full default-profile test run, typecheck, and offline loader smoke.

- [x] **T5 — Scope checkpoint and default-profile validation**
  - Depends on: T4.
  - Inputs/files: final diff and T1 parity matrix.
  - Do: compare the final implementation against the parity matrix and remove any unrequired policy, provider, persistence, or UI changes introduced during the port.
  - Verify: from `pi/profiles/default/`, run the two focused test files, `pnpm run typecheck`, and any new offline smoke command established by T4. Fix demonstrated in-scope failures and rerun only affected checks.
  - Done when: all agreed checks pass under the default profile and the diff contains no legacy-profile modification or unapproved behavior change.
  - If blocked: report the exact failing contract and evidence; do not expand into a general Pi test audit.
  - Evidence: Completed 2026-09-07; see `parity-matrix.md`, implementation diff, focused tests, full default-profile test run, typecheck, and offline loader smoke.

- [x] **T6 — Document the preserved behavior**
  - Depends on: T5.
  - Inputs/files: `pi/README.md`, `CHANGELOG.md`, completed parity matrix, final commands and limitations.
  - Do: document `/refresh-models`, supported providers, authenticated refresh without relogin, persistence/reload behavior, exact visibility/scoped-model effects, Bedrock handling selected under D6, and finite validation commands. Record the user-facing port in the changelog without claiming live provider validation if only mocks/offline smoke ran.
  - Verify: compare documentation to implemented command output, supported-provider constants, settings behavior, and actual validation evidence.
  - Done when: operators can understand what is refreshed, what is hidden, what is persisted, and when reload occurs, without consulting the legacy profile.
  - If blocked: state the unverified live behavior rather than generalizing from tests.
  - Evidence: Completed 2026-09-07; see `parity-matrix.md`, implementation diff, focused tests, full default-profile test run, typecheck, and offline loader smoke.

## Agreed validation and finish

- Focused visibility and refresh Vitest files pass under `pi/profiles/default/`.
- Default-profile `pnpm run typecheck` passes.
- The offline integration smoke from T4 passes and does not read or mutate real credentials, settings, or generated catalogs.
- Tests demonstrate that unrelated settings survive exact `enabledModels` synchronization and that cache/catalog persistence excludes credentials and authorization headers.
- The final diff leaves `pi/profiles/legacy/` unchanged and matches the T1 parity matrix.
- Live authenticated calls are not required unless separately authorized and suitable credentials are available; mocks and offline smoke must be labeled as such.

## Current handoff

- Status: Completed. Bedrock compatibility uses the existing native `bedrock-mantle` refresh path and does not restore the legacy AWS CLI inventory.
- Completed work: parity review, implementation, tests, documentation, and offline runtime loading.
- Next: none.
- Blockers/open decisions: D6 only. All other defaults favor exact legacy parity in response to the user’s fragility warning.
- Verification limits: authenticated live provider requests were not run; endpoint behavior is covered by mocks and Bedrock by existing provider tests plus offline loader validation.

## Completion and archive

When the described work and agreed checks finish, set `status: completed` and `completed: YYYY-MM-DD` above, record the result and actual profile runs, and move this entire directory to `.specs/archive/default-model-refresh-visibility/`. Repair inbound links and never overwrite an existing archive. Leave incomplete work active. Archiving does not authorize committing, pushing, deploying, or deleting unrelated work.
