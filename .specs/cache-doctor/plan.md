---
created: 2026-08-25
status: ready
---

# Explain observed Codex cache misses

## Objective

Add an opt-in `/cache-doctor` command that uses the existing bounded, metadata-only Codex cache metrics to report observed cache-read coverage and request-shape changes without modifying provider requests, `/usage`, prompt construction, tool visibility, model configuration, or persistent state.

## Completion Evidence

- Evidence: Focused tests demonstrate that `/cache-doctor` reads at most the existing 100-request metrics window, deduplicates records through the existing cache summarizer, reports observed cache-read share plus stable, runtime-context-change, immediate-tool-change, and shape-flags-unavailable counts, labels unavailable provider usage as unavailable, avoids causal or savings claims, immediately acknowledges the command before reading metrics, and displays one bounded TUI-only report without network access, session-context insertion, or provider mutation.
- Fails when: The command rewrites prompts, compresses skills, changes cache keys, retention, affinity, provider/model configuration, `/usage` output, metric persistence, or tool visibility; starts a provider turn or network request; scans transcripts; invents missing usage; presents overlapping request-shape observations as mutually exclusive causes; or lacks direct regression coverage for stable, changed, overlapping, unavailable, empty, and deduplicated inputs.

## Boundaries

- In scope: `pi/extensions/codex-status.ts`, its focused tests in `pi/tests/codex-status.test.ts`, and the stable operator-facing cache diagnostic semantics in `pi/skills/pi-extension/references/contracts/cache-friendly-extension.md`.
- Out of scope: Installing or vendoring `pi-cache-optimizer`; prompt/system-instruction reordering; skill-list compression; `prompt_cache_key`, session-affinity, Anthropic breakpoint, or `models.json` changes; new footer content; new files for runtime state; Bedrock diagnosis; changes to the default `/usage` report.
- Preserve: The 100-request bound, event/message deduplication, metadata-only metrics trust boundary, missing-value semantics, current `/usage` format, existing Codex quota refresh and footer behavior, and the rules that diagnostic commands remain TUI-only and do not trigger a provider turn.
- Assumptions: `/cache-doctor` diagnoses only the currently instrumented `openai-codex` boundary. Request-shape flags are observational and may overlap; they are not proof that a specific change caused a cache miss.

## Tasks

- [ ] **T1: Add the bounded Codex cache diagnostic**
  - Files: `pi/extensions/codex-status.ts`, `pi/tests/codex-status.test.ts`, `pi/skills/pi-extension/references/contracts/cache-friendly-extension.md`
  - Change: Extend the existing Codex cache summary with a deterministic diagnostic formatter and register `/cache-doctor` beside `/usage`. Reuse `readRecentEvents`, the existing 100-request bound, and existing deduplication rather than adding storage or another metrics reader. The report must show the observed cache-read share and request counts classified independently as stable, runtime-context changed, and immediate tools changed; count a record under `shape flags unavailable` when either request-shape flag is not a boolean. Explicitly state that categories can overlap, counts cover only observed flags where applicable, and observations do not establish causality. For empty or provider-incomplete windows, report unavailable values without zero-filling. The handler must issue an immediate acknowledgement before the local metrics read, perform no quota refresh or other network call, and display the bounded result through `ctx.ui.notify` only, without `pi.sendMessage` or other session-context insertion. Update the owning contract only with these accepted operator-facing semantics. Keep all prompt, provider, model, footer, and `/usage` behavior untouched.
  - Done when: Focused tests cover deterministic formatting for stable requests, context changes, tool changes, a request carrying both change flags, missing shape flags, unavailable usage, an empty window, duplicate event/message records, and command registration/output; an ordering assertion proves acknowledgement precedes the metrics read, and tests also prove no session message or provider turn is requested and the existing `/usage` formatter remains unchanged.
  - Verify: `cd pi && pnpm test codex-status.test.ts && pnpm run typecheck`

## Validation

- [ ] `cd pi && pnpm test codex-status.test.ts` passes.
- [ ] `cd pi && pnpm run typecheck` passes.
- [ ] `git diff --check -- pi/extensions/codex-status.ts pi/tests/codex-status.test.ts pi/skills/pi-extension/references/contracts/cache-friendly-extension.md` reports no whitespace errors; scoped diff inspection finds no prompt rewriting, provider/model mutation, new persistence, or unrelated `/usage` changes.

## Retention

Keep incomplete work at `.specs/cache-doctor/plan.md`. After completion, `/do-it` archives this directory to `.specs/archive/cache-doctor/`.

## Execution Status

- State: Ready; implementation has not started.
- Blocker: None.
- Next: T1.
- Resume: `/do-it .specs/cache-doctor/plan.md`
