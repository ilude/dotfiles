---
created: 2026-09-06
status: completed
completed: 2026-09-06
---

# Finish the default Damage Control port with a bounded refactor

## Goal and scope

Preserve working legacy behavior plus the operator's agreed changes. Consolidate the staged port using pragmatic SOLID principles and GoF patterns where they remove coupling or duplication. Do not restart, expand parser coverage, or retain additions merely because they were implemented.

- **Fixed requirement:** Luna authorizes reviewable calls, including false positives and clearly intended safe work. It cannot override confirmed blocks or mandatory user approval. Do not ask the operator to settle this again.
- Preserve independent default ownership, per-call approval, quiet routine work/blocks, protected paths, database prohibitions, bounded context/breaker, explicit recovery, and `/commit`/direct operator shell exemptions.
- Authorization: inspect, update this plan, and perform the bounded refactor and remaining completion work. No commit, push, wholesale restart, policy expansion, or changes to unrelated work.
- Non-goals: new commands, analyzers, dialects, dependencies, telemetry, caches of approvals, plugin registries, generalized permission frameworks, or broad security audits. Model/provider/effort remain Luna/high with zero retries and the existing deadline.

## Context for a fresh session

All code paths are repository-root-relative. This dotfiles repository owns the work; do not change module repositories.

- Runtime root below: `pi/profiles/default/lib/damage-control/`.
- Test root below: `pi/profiles/default/tests/damage-control/`.
- Read applicable `AGENTS.md` files, this plan, and the files named by the next task.
- [Behavior contract](../../../pi/profiles/default/docs/damage-control-port.md): agreed behavior and AC1-AC16.
- The superseded implementation plan was deleted at the operator's request. This is the sole execution plan; prior verification snapshots are recorded below.
- [Setup guide](../../../pi/profiles/default/docs/damage-control-setup.md): existing setup and staged recovery.
- Preserve the current dirty tree, including scheduler/footer, web-tool work, `.specs/web-fetch-gateway/`, deleted `pi/AGENT_GLOBAL.md`, and any module changes. Recheck status before editing.
- Production bootstrap and both launchers are activated. Existing sessions need `/reload`; the current session was not reloaded by this work. Tests consume production sources, and staged copies were removed.

### Profiles and evidence

- Planning profile: verified `PI_CODING_AGENT_DIR=C:\Users\mglenn\.dotfiles\pi\profiles\default`.
- Implementation/tests: default profile, through its pnpm manifest. Shared launcher/setup checks only where affected. Legacy remains unchanged.

| Date | Actual profile | Work/check | Result |
| --- | --- | --- | --- |
| 2026-09-06 | Default | Source inspection and revised plan | F1-F7 below; no runtime changes or new test runs |
| Prior build, 2026-09-06 | Default, Windows | Typecheck, default suite, runtime smoke | 178 passed, five skipped; loader fault/repair checks passed |
| Prior build, 2026-09-06 | Isolated default, Linux | Frozen install, links, typecheck, suite, loader | 172 passed, four skipped; predates the final common-code cleanup |
| Prior build, 2026-09-06 | Default | Synthetic Luna/high evaluation | 9/9 outcomes; six review calls, 2.7-4.75s; no submitted actions executed |

These are snapshot results, not new verification or proof of optimal performance. Existing installation proofs stand unless affected setup/dependency changes invalidate them.

## Pre-refactor findings and disposition

| ID | Source evidence | Disposition |
| --- | --- | --- |
| F1 | `adapters.ts` already normalizes native tools; `engine.ts:decide` is pure; `GateDependencies.review` is injected. `enforcement.ts` has one optional review followed by recomposition. Legacy `reviewDamageControlAsk` and `startShadowJudge` are separate paths. | Keep the default adapter, engine, and reviewer boundaries. Do not invent another pipeline, strategy registry, or shadow observer. |
| F2 | `enforcement.ts` owns Pi lifecycle, Docker mount mapping/enrichment, filesystem inventory/protection, cleanup classification, and dispatch. | Extract resource analysis behind a small function interface. Keep pending calls, event registration, cancellation, result accounting, and prompt dispatch in enforcement. |
| F3 | `fileEffects` places read/grep paths in both sources and targets; enforcement iterates their concatenation, repeating canonicalization and, for grep, inventory. Tree inspection also starts by matching a root already checked by enforcement. `initialize` loads five grammars separately from `shell.ts:grammar` and its cache. | Remove duplicate per-call inspection and use one grammar owner. Do not cache filesystem or Docker facts across calls. |
| F4 | Shell grep/rg handling extracts operands/options; `paths.ts:rgInventoryArgs` scans the argv again. Option arity is already shared. `sqlExecutableText` embeds SQL lexical handling in the shell walker. | Consolidate search argument interpretation and isolate the existing SQL text classifier. Preserve executable substitutions, pattern-file reads, inventory safety, and current SQL outcomes. No new search flags/dialects. |
| F5 | `Context.buildEvidence` concatenates prior and current effects, discarding prior call IDs even though effect IDs are invocation-local. `judge.ts:projectEvidence` rejects any redaction or omission before Luna, including bounded-history omissions. | Separate current effects from labeled historical evidence. Replace blanket historical-omission/redaction refusal with a safe projection that distinguishes missing current decision facts from contextual warnings. This corrects an overbroad implementation filter; it does not grant additional rule authority. |
| F6 | Judge already has one bounded completion, exact model/high effort, strict schema, redaction, cancellation and late-result rejection. Existing tests assert one completion and invalid-rule dismissal rejection. | Retain these controls. No unmeasured latency claim or rewrite of working cancellation. Reuse the existing synthetic corpus after the evidence/prompt change. |
| F7 | Setup and old R4 require assistant-created `/fixture-*` commands. The driver is test-only, not normal `pp` functionality. Real-loader and recovery tests independently cover concrete failures. | Remove the fixture-command handoff and its unused driver after checking references. Keep meaningful automated loader, recovery, and prompt tests. Terminal observations must remain accurately labeled, not turned into another user test product. |

No runtime feature is approved merely by appearing in the old checklist. This pass changes the named boundaries and evidence filter only. Other conservative behavior, including unresolved remote binds/search scope, is not silently relaxed or expanded.

## Design decisions

- **Adapter:** keep `adapt`/`fileEffects`; no per-tool class hierarchy.
- **Strategy/dependency inversion:** retain injected functions for analysis, metadata and review. Extract a boundary only where it separates actual responsibilities. Do not build a service container or general chain-of-responsibility framework.
- **Single responsibility:** Pi lifecycle, resource analysis, pure policy decisions, evidence projection/model review, and UI each have one owner.
- **Complete-invocation evaluation:** enrichment produces all effects/matches before `decide`. A quiet cleanup or earlier approval cannot hide another protection.
- **Judge evidence:** `untrusted.effects` describes this call only. Add historical entries carrying original call identity and effect separately; historical data is evidence, never authorization or a new current-call match. Redact and bound both collections. Candidate dismissal IDs refer only to this call's matches.
- **Safe projection:** invalid/oversized current evidence or redaction hiding a current target/rule identity still needs input. Safe credential redaction in operation/context text and omission of older history can be passed as explicit warnings when current structured facts remain intact. Luna must ask if missing information matters. Never send raw secrets, silently omit current effects, or allow the judge to waive unresolved protected scope.
- Preserve call IDs/fingerprints/generation checks on both sides of asynchronous review. Keep failure/timeout/print behavior and one-call approvals.

## Tasks

- [x] **T0: Inspect and replace the remaining-work plan.**
  - Read current adapter/engine/enforcement, shell/resource code, context/judge/prompt, relevant judge tests and legacy judge paths.
  - Done: findings F1-F7 identify concrete changes and working components to preserve. This plan supersedes R0-R6. Documentation links and whitespace checks passed; no runtime code changed or runtime tests ran.

- [x] **T1: Extract resource analysis from Pi lifecycle handling.** Depends on T0.
  - Existing: `enforcement.ts`, `docker.ts`, `paths.ts`, `types.ts`, `context.ts` under the runtime root.
  - Proposed new: `analysis.ts` for request analysis/path protection and `docker-analysis.ts` for Docker effect enrichment/mount mapping. Keep Docker subprocess execution in existing `docker.ts`.
  - Extract the current analyze/enrich/check/classify block. Return `{ analysis, createdPaths }`; keep success-only creation recording in enforcement. Pass narrow creation lookups (`wasCreated`, `wasDockerCreated`) rather than the whole `Context` or a Pi context. Preserve injected metadata/search dependencies and cancellation.
  - Enforcement retains native-source validation, exemptions, breaker, pending identity, events, `decide -> optional review -> decide -> optional prompt`, and final freshness check. Do not create a second decision pipeline.
  - Verify from default: `pnpm test tests/damage-control/enforcement.test.ts tests/damage-control/docker.test.ts tests/damage-control/lifecycle.test.ts` and `pnpm run typecheck`.
  - Done when resource code has no Pi UI/event dependency and existing gate outcomes/lifecycle assertions pass unchanged in meaning.

- [x] **T2: Remove demonstrated duplicate work.** Depends on T1.
  - Existing: `adapters.ts`, extracted analysis, `paths.ts`, `shell.ts`, `enforcement.ts`.
  - Inspect each unique operand once per effect/action/cwd while preserving sources/targets in evidence and every distinct effect. Reuse results only within the pending call. Avoid duplicate root matches when walking descendants.
  - Expose one required-grammar readiness function from the existing shell grammar owner; initialization warms all five through that owner instead of loading a second set. Keep required-grammar failure and uncached reload repair intact.
  - Add narrow assertions to existing tests for one inventory call on native grep and preservation of distinct operands/actions. Do not build a performance harness.
  - Verify: affected adapter/path/enforcement/shell tests, typecheck, and `pnpm run check:runtime` because readiness changes. Runtime smoke must retain all five fault/repair cases.
  - Done when duplicated work is removed without weakening coverage or introducing cross-call metadata caches.

- [x] **T3: Consolidate search parsing and isolate SQL classification.** Depends on T2.
  - Existing: `shell.ts`, `paths.ts`, `types.ts`; proposed new `search.ts` and `sql.ts` under the runtime root.
  - Move filename inventory and shared search argument interpretation into `search.ts`. Shell and inventory consume the same parsed operand/pattern-file/scope description. Keep native find behavior separate from shell grep/rg where semantics differ; preserve `trackedWork` behavior without adding another abstraction for it.
  - Move the existing SQL literal/comment classifier into `sql.ts`, called by the current SQL console branch. Keep policy matching in its current owner. Do not rewrite the whole command dispatcher or add handlers for hypothetical commands.
  - Use plain typed functions. Do not export the mutable shell walker state or introduce analyzer inheritance to make extraction possible.
  - Verify: `pnpm test tests/damage-control/shell.test.ts tests/damage-control/search-integration.test.ts tests/damage-control/paths.test.ts tests/damage-control/docker.test.ts` and typecheck. Reuse stdin/recursive/pattern-file/SQL cases; retain confirmed database blocks and reviewable ambiguous SQL.
  - Done when argv interpretation has one owner, SQL lexical code is isolated, and the existing cases retain their intended outcomes.

- [x] **T4: Improve judge evidence without changing approval authority.** Depends on T3.
  - Existing: `types.ts`, `context.ts`, `judge.ts`, `judge-prompt.md`, `enforcement.ts`, `scripts/damage-control-eval.ts` within default.
  - Implement the current/history distinction and safe-projection contract above. Keep one reviewer entry point and one completion; do not add a shadow call, retry, model fallback, approval reuse, or telemetry.
  - Update existing context/evidence/judge tests: colliding historical/current effect IDs stay distinguishable; history truncation alone does not permanently disable Luna; safely redacted context can reach review; obscured current target/rule identity still asks; synthetic secrets never leave projection. Preserve schema, malicious-evidence, authority, timeout/cancellation and stale-result checks.
  - Verify from default: `pnpm test tests/damage-control/context.test.ts tests/damage-control/evidence.test.ts tests/damage-control/judge.test.ts tests/damage-control/engine.test.ts tests/damage-control/lifecycle.test.ts` and typecheck.
  - Run the existing finite `pnpm run eval:damage-control` once after evidence/prompt work settles. Record outcomes/call count/latency, not an optimality claim. Do not expand the live corpus or execute submitted actions. Missing model access is a concrete verification blocker, not permission to change providers.
  - Done when Luna receives sufficient, clearly scoped safe evidence, routine/mandatory/block tiers still make zero review calls, and valid reviewable allows remain effective.

- [x] **T5: Remove the invented manual test workflow.** Depends on T4.
  - Original input: the now-removed `tests/damage-control/fixtures/interactive-driver.js`, setup guide, runtime smoke/recovery fixtures and their references.
  - Check references, then remove the unused interactive driver and fixture-command instructions. Preserve actual status/recovery commands, real-loader tests and prompt/recovery behavioral tests. Do not replace the slash commands with another operator test interface.
  - Verify references with `rg`; run a focused test only if its code/imports changed.
  - Done when neither setup nor completion requires operating assistant-created fixture commands. No claim that visual terminal acceptance occurred.

- [x] **T6: Run the final scoped checks.** Depends on T5.
  - From default: `pnpm run typecheck`, `pnpm test --maxWorkers=1`, `pnpm run check:runtime` once after refactoring settles. Record current totals/skips, not inherited counts.
  - Run affected path/search/shell tests on native Linux if those platform-sensitive paths changed; no new frozen install exercise unless dependency/setup changes require it. Use available native Linux tooling in isolation; do not change normal WSL configuration. Report unavailable tooling rather than claiming a platform check passed.
  - Use AC1-AC16 in the behavior contract and the existing tests named by these tasks. Record affected verification results here without inventing another acceptance matrix.
  - Done when scoped checks pass and T4's live evidence check is recorded. Fix demonstrated failures and rerun affected checks only.

- [x] **T7: Activate and finish documentation.** Depends on T6.
  - Installed the staged bootstrap at `pi/profiles/default/extensions/damage-control/index.js`, with production-relative implementation/profile paths.
  - Reviewed/applied the existing staged launcher changes to `scripts/pp` and `scripts/pp.ps1`, preserving profile forwarding. Tests now copy production sources; removed superseded bootstrap/launcher fixtures and the applied patch.
  - Verify syntax/readiness and focused launcher/recovery checks: default `pnpm test tests/damage-control/recovery.test.ts`; root `uv run pytest test/test_pp.py test/test_pi_profile_setup.py`, applicable Ruff checks, `node --check` on the bootstrap/preflight/recovery JS, and lint on changed shell scripts. Leave unrelated formatting alone.
  - Verify actual installed-loader startup/reload and existing tests for `/commit`, direct operator shell, command/footer compatibility without executing a real commit or destructive action. No legacy suite. Use the supported loader and existing tests rather than a new user-facing fixture.
  - Record real-terminal label/color/Escape/recovery observations if available through normal use. If not observable from this API, disclose that limitation; do not claim they passed or reinstate old R4 as an invented prerequisite. Actual recovery always requires the product's interactive operator confirmation; testing never bypasses it.
  - Update `pi/README.md`, default setup/contract status and root `CHANGELOG.md` with actual activation/recovery behavior. Preserve historical evidence and unrelated edits. Final diff review is limited to intended changes.
  - Done when enforcement/recovery are wired, scoped checks pass, documentation matches actual behavior, and remaining observation limits are reported. No commit/push. Stop.

## Agreed validation and finish

Use existing behavioral acceptance cases, not file length or class count, as the baseline. Structural refactors preserve outcomes; T4's explicit evidence-filter correction is the named behavior change. A changed test must still establish the intended outcome, including reviewer/dialog call counts. Do not weaken hard-block checks into generic denial checks.

No repeat of passing setup/model/platform proofs unless relevant changes invalidate them. No broad suites, destructive fixture execution, credentials copied to fixtures, or new speculative restrictions. Read maintained Pi docs/examples before changing an API boundary; the proposed refactors do not require a new Pi API.

## Execution evidence, 2026-09-06

- T1: extracted `analysis.ts` and `docker-analysis.ts`, retaining event/cancellation/result ownership in enforcement. Windows default: 48 focused tests passed.
- T2: operand grouping is per effect and call; all evidence operands remain present. Root matching occurs once, and required grammar readiness uses the shell cache. Windows default: 57 focused tests and all five real-loader fault/repair cases passed.
- T3: `search.ts` interprets operands, pattern-file reads and safe inventory options once; `sql.ts` owns the unchanged SQL text classifier. Existing supported compact `-e`/`-f` options now share that interpretation instead of inventory treating them differently from shell effects. Windows default: 65 focused tests passed, one platform skip.
- T4: current and historical effects are separate, with historical call IDs/timestamps. Projection retains current identities, warns on safe redaction/history loss, and trims only older history to its budget. Relevant tests passed after updating the lifecycle assertion to the new evidence shape. Live Luna/high: 9/9 expected outcomes, six calls, 2.895-5.121 seconds, zero submitted actions executed.
- T5: removed the unused interactive driver and operator fixture workflow. Production prompts/recovery tests remain.
- T6: Windows default full suite: 219 passed, seven skipped. Runtime smoke: eight native schemas, five grammars, integrity rejection and all five failure/repair cases passed. Native Linux focused path/shell/search/Docker: 66 passed. WSL had no native Node; verified temporary Node/pnpm and pinned test dependencies were isolated and removed afterward. No full-profile reinstall proof or WSL configuration change.
- Typecheck scope adjustment: full default `tsc` reports only two pre-existing concurrent gateway-test errors (`tests/web-tools-gateway-transport.test.ts:10,15`, inferred `this.emit`). Those files are outside this task and untouched. Compiling all 33 Damage Control source/test/evaluation roots with the same default compiler options reports zero diagnostics. This scoped result supports activation; the full-profile typecheck is explicitly not claimed green. Do not turn unrelated test-type fixes into Damage Control requirements.

- T7: activation-specific production-loader startup/reload passed, with `/commit` and footer coexistence and direct operator shell exemption. All five production-bootstrap fault/repair cases passed. Nine recovery tests and 28 live-source launcher/setup tests passed, along with JS/Bash syntax, ShellCheck, shfmt and Ruff checks. Setup, contract, runtime README, root README and changelog now describe actual activation and limits. Final scoped source/diff review found no further required changes.

## Completion

- Completed T0-T7 on 2026-09-06. Bootstrap/launchers are enabled for normal default `pp`; existing sessions need `/reload`. No current-session reload, commit or push was performed.
- Known verification limit: two unrelated full-profile gateway-test type errors remain; Damage Control roots compile cleanly. Unrelated/concurrent work is preserved.
- Real-terminal colors/Escape/recovery interaction remain visually unverified, not silently marked passed. Explicit recovery still requires actual interactive confirmation.
- The completed spec is archived at `.specs/archive/damage-control-port/`; inbound links point there. No further test or implementation work is required by this plan.
