---
created: 2026-09-07
status: completed
completed: 2026-09-07
---

# Consolidated Bedrock access and cost estimation

## Goal and scope

Implement one default-profile-owned Bedrock integration for provider-scoped authentication, curated Mantle/Runtime routing, route-aware local cost estimates, and small operator-facing management/reporting surfaces.

User-approved direction:
- Consolidate the three legacy capabilities rather than copying independent extensions wholesale.
- Keep authentication, discovery/routing, execution, and accounting separate internally but share their resolved configuration and request facts.
- Keep a single accounting source for the footer and `/usage`; use the same pricing basis for session cost where Pi supports it.
- Keep the work focused on the behavior discussed here.

Non-goals:
- Budgets, warning thresholds, spending enforcement, AWS billing reconciliation, account-wide spend, or cloud resource changes.
- Cost-optimized model selection, prompt routing, post-failure cross-endpoint replay, or new model families beyond legacy's curated Claude/GPT policy.
- A generic provider framework, dashboard, daemon, model-callable management tool, telemetry platform, or new test framework.
- Legacy universal `/refresh-models`, visibility rules for other providers, Fable delegation, orchestration, or other legacy workflows.
- Historical session scanning, legacy ledger/auth/catalog migration, historical repricing commands, or changes to legacy itself.
- Changing Codex as the startup provider/model, shell setup, launchers, Onclave, or any submodule.

Authorization: this request authorizes writing the plan only. Implementation, credential changes, paid live requests, commits, and pushes are not authorized by creating this plan.

## Context for a fresh session

All repository paths below are relative to the dotfiles repository root. Read current applicable `AGENTS.md` files before acting.

Existing sources to read:
- `pi/README.md` for profile ownership and current footer/usage behavior.
- `pi/profiles/legacy/extensions/aws-bedrock-env.ts`, `bedrock-mantle.ts`, and `bedrock-cost.ts`.
- `pi/profiles/legacy/lib/bedrock-auth.ts`, `bedrock-model-policy.ts`, `bedrock-model-refresh.ts`, `bedrock-pricing.ts`, and `bedrock-cost-ledger.ts`.
- `pi/profiles/default/extensions/operator-footer.ts`, `codex-status.ts`, and the cost-reporting portion of `context.ts`.
- `pi/profiles/default/package.json`, `vitest.config.ts`, `tests/tsconfig.usage.json`, `tests/usage-context-tps.test.ts`, and `scripts/usage-smoke.mjs`.
- Installed Pi `docs/custom-provider.md`, `docs/extensions.md`, and the relevant provider example under `examples/extensions/custom-provider-anthropic/`. Resolve these under the installed package, not this repository. Follow related auth/model/session/TUI documentation before implementing those seams.
- `pi/profiles/default/skills/testing/SKILL.md` before authoring tests.

Verified starting facts, 2026-09-07:
- Planning runtime is Pi 0.85.0; its documented native provider API supports provider-owned authentication, scoped environment, discovery/persistence, and streaming.
- Legacy `aws-bedrock-env.ts` writes `process.env.AWS_PROFILE` and `AWS_REGION`; it is not a provider-isolated implementation.
- Legacy Mantle already uses the native provider interface, Pi streaming adapters, and `@aws/bedrock-token-generator` 1.1.0. It preserves logical model IDs and records the target as `responseModel`.
- Runtime fallback reads generated inventory from legacy `settings.json`; the new integration must not import that catalog or retain that storage design.
- Legacy pricing covers Fable 5 and 5.1 only, treats priced Mantle IDs as cross-region, assumes one-hour writes, ignores incoming cost totals, and reprices monthly history on reads. Legacy documentation describes five-minute Fable caching. Actual current rates and cache behavior have not been verified.
- Default `operator-footer.ts` already records `usage.cost.total` for both Bedrock providers in `operator-footer-usage.json`. It owns the `bedrock` status key and must stop being a second accounting writer.
- Default `/usage` is registered by `codex-status.ts`. Its startup/new-session reports are display-only custom entries with reload deduplication. Preserve that behavior and Codex quota/cache reporting.
- Default `/context` already sums assistant-message cost. Prefer supplying normalized message usage rather than adding another pricing implementation there.

Existing work to preserve: the worktree contains unrelated web-fetch gateway changes, including `pi/README.md`, `CHANGELOG.md`, default web-tool files/tests, `.specs/web-fetch-gateway/`, and a dirty homelab-infra submodule. Recheck status before implementation and edit overlapping documentation narrowly.

### Pi profiles

- Planning profile: verified `default`, `pi/profiles/default/`; `PI_CODING_AGENT_DIR` resolved to `C:\Users\mglenn\.dotfiles\pi\profiles\default`.
- Intended implementation/validation profile: `default`, launched by bare `pp`; isolated temporary profiles may load its implementation for smoke checks.
- Legacy is reference-only and must remain unchanged. No runtime imports from `pi/profiles/legacy/`.

| Date | Actual profile/path | Work or check | Result |
| --- | --- | --- | --- |
| 2026-09-07 | default / pi/profiles/default | Source inspection and planning | No implementation, AWS calls, credential inspection, or runtime validation |

## Decisions and contracts

### Public behavior

- Keep public provider ID `bedrock-mantle`, with display name `Amazon Bedrock`, for the curated unified provider. Leave native `amazon-bedrock` available; do not override its unrelated catalog or remove it.
- Retain legacy curation: latest supported Fable, Opus, Sonnet, Haiku and tiers of the newest supported GPT release. Do not infer capabilities for unknown models by copying an older family's metadata.
- Select routes before the request. Prefer Mantle for the same supported Claude release when advertised there; otherwise use the supported Runtime inference profile. GPT uses Mantle Responses. Preserve legacy's newest-family selection rather than downgrading just to prefer Mantle.
- Do not replay a failed request through another transport. Preserve ordinary Pi/provider retry behavior, without adding another retry layer.
- `/bedrock` inspects resolved non-secret configuration and current routes; `/bedrock refresh` refreshes only this integration's inventory. No other subcommands are required.
- Authentication stays under Pi `/login`. Reports do not enter model context or trigger an LLM turn.
- `/usage` adds month-to-date model/provider token and estimate breakdown, including unpriced coverage. Footer retains its compact right-hand Bedrock segment and distinguishes incomplete/unavailable estimates from zero.
- `/context` uses normalized stored usage for new requests where supported and discloses missing pricing rather than implying complete spend. Preserve its existing context-estimation behavior.

### Configuration and inventory

- Common resolved AWS identity by default, separate Mantle and Runtime regions, and only the existing explicit transport identity override where needed.
- Preserve baseline region defaults: Mantle `us-east-1`; Runtime uses scoped/ambient/configured AWS region with `us-east-2` as the legacy fallback. Machine-specific profiles are not guessed or copied from legacy.
- Use native scoped credential storage and AWS credential resolution. Explicit scoped credentials must not accidentally combine with unrelated ambient credentials. Never mutate global AWS environment or persist generated short-lived bearer tokens.
- Discovery and inference consume the same resolved target. Inventory must not be reused as verified discovery for another region/identity configuration.
- Reuse Pi's native refresh/cache lifecycle where it fits. Store only necessary generated inventory locally, outside tracked settings. No new recurring discovery polling.
- Bound discovery I/O and token work with cancellation/deadlines supported by the chosen APIs. Failure retains usable last-known inventory with disclosed staleness, not fabricated successful discovery. Missing auth must not break normal Codex startup.

### Route and accounting boundary

Proposed internal data contract, finalized against actual Pi types in T1:

```text
ResolvedRoute:
  logical provider/model, transport, actual target model/profile ID,
  endpoint region, known pricing geography and cache-write behavior

UsageRecord:
  stable local record ID, timestamp, session reference when available,
  logical provider/model, resolved route facts,
  input/output/cache-read/cache-write counts,
  pricing status (estimated | unpriced), USD components/total when known,
  pricing basis/version and unknown reason when needed
```

- Never persist credentials, headers, prompts, responses, tool content, or full provider payloads in inventory or the ledger.
- Observe each finalized request once, including error/abort usage when supplied. Reload/resume/fork must not re-record restored messages. This is observed local usage, not a billing audit or a guarantee of recovering usage lost in a process crash.
- Cover requests through the unified provider and native `amazon-bedrock` observed by the active profile. Do not build interception for arbitrary unobserved SDK calls or import legacy subagent accounting.
- Calculate estimates from actual target/region/cache facts and a known pricing basis. Pi model metadata is an estimate source only when applicable to that exact route. Unknown pricing facts stay unpriced; do not assume zero, one-hour cache writes, or a universal Mantle surcharge.
- Record the estimate/basis at observation time; reads sum recorded values and never reprice history. No automatic pricing scraper or exhaustive price-catalog project.
- Use one profile-local ledger with safe concurrent writes and bounded read behavior. Choose the smallest mechanism that satisfies this, not a general storage layer.
- Preserve the existing default footer ledger file unchanged. If it contains historical totals, retain them as a separately labeled pre-port aggregate baseline, counted once without inventing model/token detail. No import from legacy. T1 must settle a simple non-duplicating cutover before removing its writer.
- Ledger failures must not replay or fail a completed inference request; display that the estimate is incomplete/unavailable.

## Execution guidance

**Before expanding work:** Which existing requirement needs this addition, and what evidence justifies it? Do not turn optional improvements into tasks or completion criteria.

**At scope checkpoints:** Check for drift into billing management, general provider infrastructure, broad migration, repeated verification, or unrelated profile cleanup. Continue required work without another audit or approval gate.

**Recovery when drift is found:** Stop the detour. Remove only unnecessary code, tests, and plan items introduced by this task without disturbing existing/concurrent work. Note anything that cannot safely be removed, restore the agreed completion criteria, and resume the next task.

## Tasks

- [x] **T1: Resolve the necessary SDK, accounting, and pricing seams**
  - Depends on: none.
  - Inputs: sources/docs above; installed Pi native Bedrock provider and stream/usage types; existing default footer ledger implementation.
  - Do: inspect the smallest relevant seams for shared auth, inventory refresh, route metadata retention, message usage normalization, and direct Runtime observation. Verify cache semantics and a small initial pricing set against official AWS sources; record source URLs/date and mark unresolved combinations unpriced. Select ledger format/cutover and concrete dependencies. Record these implementation decisions here without a separate design document.
  - Verify: one small offline SDK probe if source inspection cannot establish a required seam; no credential reads or live inference needed.
  - Done when: T2-T4 have concrete hook/storage choices, initial price coverage is explicit, and actual route facts can reach accounting without affecting model context.
  - If blocked: name the specific unsupported seam and propose the smallest in-scope adjustment. Do not patch installed Pi or silently reduce agreed routing/accounting coverage.
  - Evidence: Used Pi native provider refresh, scoped auth, stream adapters, message replacement, exact-target catalog prices, and a lock-protected JSONL ledger. AWS pricing source: https://aws.amazon.com/bedrock/pricing/, checked 2026-09-07; unknown exact targets remain unpriced.

- [x] **T2: Implement shared auth, inventory, and curated request routing**
  - Depends on: T1.
  - Proposed new paths: `pi/profiles/default/extensions/bedrock/index.ts`; focused implementation modules under `pi/profiles/default/lib/bedrock/` for auth, discovery/routes, and provider execution. File splitting is an implementation detail, not a required framework.
  - Existing files: default `package.json` and `pnpm-lock.yaml`; ignore rules only as necessary for generated local state.
  - Do: adapt useful legacy provider/policy code into the owning default subsystem, reuse Pi transports and native login/refresh, and remove dependency on legacy settings/catalog/helpers. Resolve and retain immutable route facts per request. Declare only needed direct dependencies using pnpm. Keep normal native Runtime access and Codex startup unchanged.
  - Verify: auth isolation and precedence, distinct regions, fresh/cached discovery, curated routes, unavailable-route errors, streaming/tool-call forwarding, context replay, and no cross-transport retry through focused T5 fixtures.
  - Done when: both Mantle protocols and Runtime fallback use shared resolved configuration, logical identity survives responses, and loading without AWS configuration does not break Codex.
  - Evidence: Added the default-owned provider and focused modules under `lib/bedrock/`; dependencies are declared in the default profile. Legacy remains reference-only.

Scope checkpoint: the public surface is still one Bedrock integration, not a port of universal refresh, model visibility, or delegation.

- [x] **T3: Implement route-aware estimation and the single usage ledger**
  - Depends on: T1 and T2.
  - Proposed files: pricing/accounting/ledger modules under `pi/profiles/default/lib/bedrock/`; T2 entry point for the accounting lifecycle.
  - Do: normalize observed usage for unified and native Runtime requests, price only known route/cache combinations, preserve estimate basis and unknown reasons, and persist once without replaying session history. Implement the bounded concurrent-safe ledger and pre-port aggregate cutover selected in T1. Normalize Pi message cost through the supported seam so session reporting and monthly accounting share a basis.
  - Verify: known/unknown pricing, route/cache distinctions, immutable historical estimates, reload/resume/fork deduplication, concurrent writers, corrupted/unavailable storage behavior, and old aggregate counted once through T5 tests.
  - Done when: there is one accounting writer and one estimate basis, unrelated providers are untouched, and ledger failure cannot trigger another inference request.
  - Evidence: Added exact-target observation-time estimates, stable deduplication IDs, bounded reads, concurrent append locking, immutable records, and read-only pre-port baseline handling.

- [x] **T4: Connect the existing reports and minimal management command**
  - Depends on: T2 and T3.
  - Existing files: default `extensions/operator-footer.ts`, `extensions/codex-status.ts`, and the cost portion of `extensions/context.ts` only where necessary; `lib/reload-monitor.ts` only if generated-state exclusions require adjustment.
  - Do: remove footer-owned Bedrock writes/status conflicts; consume the shared estimate. Add `/bedrock` and `/bedrock refresh` in the Bedrock entry point. Append the Bedrock section to the existing display-only usage reporting path without duplicating `/usage` registration or report lifecycle state. Retain Codex quota/cache handling, scheduler/TPS layout, and narrow-width behavior.
  - Verify: report totals and coverage agree with the ledger; Bedrock reporting still works when Codex quota retrieval fails; report entries stay out of model context; refresh touches only Bedrock inventory; normal reload/new-session behavior is preserved.
  - Done when: operator can inspect configuration/routes, refresh inventory, and view accurate known spend plus explicit gaps without another dashboard or command family.
  - Evidence: Added `/bedrock` and scoped refresh; `/usage`, `/context`, and the footer consume the consolidated subsystem. Footer-owned Bedrock writes were removed.

Scope checkpoint: no budgets, thresholds, historical repricing, generic management tools, or unrelated footer/context redesign have been added.

- [x] **T5: Run the finite checks and document the delivered contract**
  - Depends on: T2-T4. Author focused tests alongside those tasks; run the final batch after integration.
  - Proposed files: `pi/profiles/default/tests/bedrock-provider.test.ts`, `bedrock-accounting.test.ts`, `bedrock-reporting.test.ts`, `tsconfig.bedrock.json`, and `scripts/bedrock-smoke.mjs`.
  - Existing files: relevant usage/footer tests, `pi/profiles/default/docs/bedrock.md` (new), `pi/README.md`, and root `CHANGELOG.md`.
  - Do: test the observable behaviors listed in T2-T4 using real pricing/routing/ledger code and temporary files. Mock AWS HTTP/SDK boundaries, not the behavior under test. Add an offline installed-Pi loader smoke because the existing Vitest setup aliases the coding-agent package. Keep test support local and small. Document setup, defaults, commands, route policy, initial pricing coverage, unknowns, old-total handling, and rollback without deleting local state.
  - Verify: run the commands below, inspect only the final scoped diff for exclusions and preservation, and record results with actual profiles. Fix demonstrated relevant failures and rerun affected checks only.
  - Done when: agreed offline checks pass, docs/changelog match the delivered behavior, and live-verification limits are explicit. Stop rather than expanding coverage into another audit.
  - Evidence: All 17 focused tests, both planned TypeScript checks, and both installed-Pi offline smokes passed under the default profile. Documentation and changelog were updated. No live AWS request ran.

## Agreed validation and finish

Planned commands from `pi/profiles/default/` (new test/smoke paths are not available yet):

```sh
pnpm test bedrock-provider.test.ts bedrock-accounting.test.ts bedrock-reporting.test.ts usage-context-tps.test.ts scheduler-footer.test.ts
pnpm exec tsc --noEmit -p tests/tsconfig.bedrock.json
pnpm exec tsc --noEmit -p tests/tsconfig.usage.json
node scripts/bedrock-smoke.mjs
node scripts/usage-smoke.mjs
```

The focused Bedrock typecheck must include every added Bedrock module and changed reporting seam. No dependency reinstallation unless needed; use the repository's pnpm frozen-install/link workflow when setup is required.

The offline smoke loads the real installed Pi SDK and default-owned Bedrock extension in an empty temporary profile, with synthetic auth/transport data and no network. Assert registration, lifecycle accounting/reporting, and shutdown rather than just successful import. Vitest fixtures prove routing and pricing behavior, not live AWS access.

Live validation is opt-in and not authorized by this planning request. Document at most one small request per transport (Mantle Anthropic, Mantle Responses, Runtime) with explicit model/region and capped output for a later operator-authorized smoke. Do not create AWS resources, change account configuration, hunt for working regions, or issue repeated paid probes. If no live check is authorized, completion must say live AWS access/pricing reconciliation was not verified; passing offline checks is not a live compatibility claim.

## Current handoff

- Status: completed 2026-09-07.
- Completed work: consolidated provider, scoped auth, routing, accounting, reports, commands, focused tests, documentation, and offline loader validation.
- Next: none. Live transport probes remain operator-authorized validation, not an implementation requirement.
- Open decisions: none.
- Verification limits: no live AWS request or AWS billing reconciliation ran; offline mocks and loader checks are not a live compatibility claim.

## Completion and archive

When implementation and the agreed checks finish, set `status: completed` and the actual `completed: YYYY-MM-DD`, record results and actual profile runs, and move this entire directory to `.specs/archive/bedrock-integration/`. Verify the destination is unused and repair inbound links. Leave incomplete work active. Archiving does not authorize committing, pushing, deployment, or deleting unrelated work.
