---
created: 2026-09-28
status: ready
completed: null
---

# Estimate Codex subscription impact by model and effort

## Goal and scope

- Add a Codex-subscription-only tracker to the default Pi profile. It must correlate locally observed OpenAI Codex request usage with changes in the subscription's reported 5-hour and weekly utilization, grouped by resolved model and effective effort.
- Preserve observations as interval evidence and report estimates with explicit confidence. Do not claim exact billing, quota weights, or causal attribution when rounded quota values, delayed accounting, mixed traffic, missing observations, or other Codex clients make that unsupported.
- Track the 5-hour and weekly windows independently. Do not add their percentages or assume equal capacity. Additional model-specific limits, credits, and banked resets remain in the existing display but are outside estimation.
- Retain only allowlisted metadata and numeric usage. Never persist credentials, account IDs, headers, full endpoint bodies, prompts, responses, thinking content, tools, session IDs, transcript paths, repository data, provider request IDs, or unknown future response fields.
- Start collecting prospectively. Do not backfill `codex-cache.jsonl` or Codex CLI rollouts because they lack a reliable combination of effort, quota linkage, and consistent provider ownership.
- Keep current `/usage`, footer, cache-read reporting, Bedrock reporting, and headless no-poll behavior intact. No other providers enter the tracker.
- Authorization: planning alone permits no implementation or Git operations. `/do-it` authorizes this plan's implementation, local worktree, commits, and merge unless `--no-merge` is specified. Push and deployment remain separately unauthorized.

## Fresh-context handoff

All paths are relative to `C:/Users/mglenn/.dotfiles`. Read the root and `pi/profiles/default/AGENTS.md` instructions before acting. Ignore `pi/profiles/legacy/`.

- Owning repository: this dotfiles repository. The feature belongs to the default Pi profile.
- Required reading:
  - `pi/profiles/default/lib/codex-usage.ts`
  - `pi/profiles/default/extensions/codex-status.ts`
  - `pi/profiles/default/extensions/effort.ts`
  - `pi/profiles/default/lib/bedrock/ledger.ts`
  - `pi/profiles/default/tests/usage-context-tps.test.ts`
  - `pi/README.md`, default-profile usage section
  - Installed Pi `docs/extensions.md` and `dist/core/extensions/types.d.ts` for lifecycle contracts
- Verified starting behavior at `main` revision `248c549f` on 2026-09-28:
  - `fetchCodexUsage()` polls the private `wham/usage` endpoint, normalizes `reset_after_seconds` into `reset_at`, and exposes primary/secondary `used_percent`, duration, and reset metadata.
  - `codex-status.ts` polls every five minutes only when UI is available, supports forced `/usage` refreshes, caches successful responses, and appends display-only reports.
  - `message_end` currently stores only `{model,input,cacheRead}` for `openai-codex`; it stores no effort, timestamp, output, cache write, or quota link.
  - Pi exposes `pi.getThinkingLevel()`, but finalized messages do not carry the request's effort. The implementation must snapshot effective effort at the request boundary and correlate that snapshot with the authoritative finalized assistant message rather than read mutable session effort only at `message_end`.
  - Quota percentages are a private, potentially unstable endpoint contract and may be rounded or delayed.
- Investigation found the worktree clean before this plan was written. Recheck before editing and preserve any later overlapping work, especially in `extensions/codex-status.ts`, `lib/codex-usage.ts`, tests, README, and changelog.
- Proposed execution worktree: `.worktrees/codex-subscription-impact-tracker`; proposed branch: `task/codex-subscription-impact-tracker`; integration target: the originating `main` checkout. Record actual values when execution begins.
- Planning profile: default Pi, 2026-09-28. Intended execution profile: default Pi. No implementation or live endpoint validation has been run for this plan.

## Decisions and implementation contract

### Observation contract

Create a dedicated versioned ledger library, proposed `pi/profiles/default/lib/codex-subscription-impact.ts`, and a gitignored profile-local JSONL file. Keep it separate from `codex-cache.jsonl`; the existing cache report and deletion/reset behavior remain unchanged.

Use a discriminated schema with two allowlisted record kinds:

1. `request-usage`
   - schema version and deterministic record identity suitable for retry/reload deduplication when stable lifecycle evidence permits it;
   - locally observed start/end timestamps;
   - provider fixed to `openai-codex`;
   - resolved model ID and the effective effort captured for that request;
   - outcome: completed, error, aborted, or unknown;
   - separate nullable numeric fields for input, cache-read, cache-write, output, and total tokens as Pi reports them;
   - flags for missing usage and boundary ambiguity.
2. `quota`
   - schema version, locally observed poll completion timestamp, and source (`startup`, `poll`, or `command`);
   - success or bounded failure classification, with numeric HTTP status when available and no response/error body;
   - only the main subscription primary/secondary windows: used percent, window duration, and absolute reset epoch;
   - a flag distinguishing a partial reset-credit fetch failure if retained for diagnostics, without storing balances, expirations, credits, or unknown fields.

Do not invent reasoning-token fields that Pi does not expose in its finalized message usage. Do not treat missing values as zero. Keep token components separate because cache and output may affect quota differently and fields may overlap.

### Capture and lifecycle contract

- Capture model and effective effort at the model-request boundary before mutable session settings can change. Associate each request snapshot with the corresponding authoritative assistant `message_end`, accounting for multiple assistant messages, retries, errors, aborts, and reload/shutdown. Do not assume one assistant message per user turn.
- Record only provider `openai-codex`; Bedrock-hosted OpenAI models and all other providers are excluded.
- Record successful and failed quota polls after sanitization. Never hold a filesystem lock during network work.
- Continue quota polling behavior only where it already exists. The tracker must not add a new timer, poll headless processes, or increase endpoint request frequency.
- Multiple Pi processes may write the same profile ledger. Serialize append, deduplication, and bounded compaction with the repository's established `proper-lockfile` pattern. Writes must be asynchronous, bounded, and shutdown-aware so `message_end` does not block on synchronous lock retries.
- Use owner-only file modes where supported and describe Windows modes as best effort, not an ACL guarantee.

### Estimation and confidence contract

For each window, build intervals between consecutive successful quota observations that have the same reset epoch/window identity. Aggregate finalized local request usage by `(model, effort)` within each interval.

- Treat a reported percentage as interval-censored with an initially conservative one-percentage-point rounding uncertainty. A displayed increase is a movement range, not an exact delta. A zero-tick interval is an upper-bound observation, not zero consumption.
- A decrease, changed reset epoch, reset boundary, duration change, manual/banked reset evidence, or unexplained identity change starts a new epoch. Exclude reset-crossing intervals from coefficient estimation.
- Missing polls form one longer interval between successful observations and lower confidence. Do not fabricate intermediate polls.
- Keep failed/aborted requests with reported usage and degrade confidence. Missing usage is unknown consumption, not zero.
- Do not allocate a mixed interval's quota tick proportionally by token count. Estimate nonnegative model-effort coefficients only when accumulated intervals contain enough independent variation to identify them. Otherwise report the mixture or `indeterminate`.
- Account for delayed provider reporting with bounded adjacent-interval/lag sensitivity. Do not move individual requests solely to improve fit.
- Treat quota increases without local requests as evidence of delayed or external Codex activity. External CLI, browser, other-profile, or other-machine use is latent contamination; local estimates are associations or upper bounds, never authoritative conversion rates.
- Confidence is `high`, `medium`, `low`, or `indeterminate`, based on usable tick count, interval purity/identifiability, poll gaps, reset/boundary ambiguity, missing usage/failures, lag sensitivity, and unexplained no-local-usage ticks. High confidence requires at least three clean intervals and two visible ticks for the group plus stable lag sensitivity; it still means strong observational correlation, not provider billing proof.

### Retention and reporting contract

- Retain enough evidence for the current and previous weekly epochs, with a maximum age of 30 days and a hard bounded file/read size selected during implementation from measured serialized records. Preserve newest complete records and compact only after a threshold, under the append lock, using atomic replacement. Readers must tolerate malformed/truncated final lines and unsupported versions.
- Exact duplicate quota snapshots from concurrent writers may be suppressed under the lock using sanitized content, reset identity, and a coarse poll bucket. Do not use account IDs or credentials in identity hashes.
- Extend `/usage` with a compact `Codex impact estimate` section. For each model-effort group and each available window, show observed token volume, usable interval/tick count, percentage-points-per-million-token range or a zero-tick upper bound, confidence, and short contamination/lag flags. Say `collecting data` or `indeterminate` rather than manufacture a rate.
- Keep the footer compact quota display unchanged. The estimator is report-only and excluded from model context.
- If persistence fails, existing quota/cache/Bedrock reporting remains usable and `/usage` states that impact tracking is unavailable without reporting zero.

## Execution guidance

Create or resume the recorded dedicated task worktree and branch. Record the actual path, branch, and originating integration target before editing. Carry this plan into the worktree without deleting its source and preserve unrelated work.

Before delegating, consult Strategist. Assign at most one named task per subagent and use only active catalog roles. Continue independent tasks around blockers. Adapt routine mechanisms to verified source contracts, but ask before changing scope, privacy boundaries, polling frequency, estimation semantics, or acceptance.

Keep checkbox state, evidence, blockers, and next action current. Fix demonstrated task-related defects and stop when the finite checks pass.

## Tasks

- [ ] **T1: Define and validate the Codex observation ledger**
  - Depends on: none.
  - Files/inputs: proposed `pi/profiles/default/lib/codex-subscription-impact.ts`; `pi/profiles/default/.gitignore`; proposed focused test file or the existing usage test.
  - Change: implement strict versioned request/quota schemas, sanitization, field/length validation, bounded readers, async lock-protected append/deduplication, retention compaction, atomic replacement, and best-effort private permissions. Keep networking and UI outside this module.
  - Complexity / split hints: concurrency, retention, and crash-safe replacement form one persistence boundary; schema/reader tests can be separated from writer/compaction tests if needed.
  - Verify: focused Vitest coverage for concurrent writers, duplicates, malformed/truncated rows, unsupported versions, oversized fields, compaction bounds, append during replacement, permission/write failures, and proof that content, credentials, account IDs, headers, sessions, and unknown endpoint fields never persist.
  - Done when: the library can safely preserve and read bounded allowlisted observations across concurrent Pi processes without storing excluded data.
  - If blocked: choose the simplest established Bedrock-ledger-compatible mechanism that meets the contract; ask only if satisfying retention requires changing the agreed evidence horizon.
  - Evidence: Not started.

- [ ] **T2: Capture request effort/usage and sanitized quota observations**
  - Depends on: T1's record interfaces and append API.
  - Files/inputs: `pi/profiles/default/extensions/codex-status.ts`, `pi/profiles/default/lib/codex-usage.ts`, installed extension event types, and focused tests.
  - Change: bind effective effort/model snapshots at the verified request boundary to finalized Codex assistant messages; record all available usage categories/outcomes; sanitize and record existing startup/poll/command quota results and bounded failures without adding polls. Preserve generation cancellation, stale cache behavior, report markers, branches/resumes, reload cleanup, and headless behavior.
  - Complexity / split hints: confirm event ordering against installed Pi source before choosing FIFO, per-message identity, or another correlation mechanism. Retry/reload deduplication must follow proven stable identifiers, not guessed timestamps.
  - Verify: tests for effort changes between requests, model switches, multiple assistant messages, retry/error/abort with and without usage, reload/shutdown, branch/resume, stale/failing polls, partial reset-credit failure, non-Codex exclusion, no extra fetches, and no headless polling.
  - Done when: each observable Codex provider attempt and existing quota poll produces at most one correctly correlated allowlisted observation, with ambiguous cases flagged rather than misattributed.
  - If blocked: record effort as unknown for event sequences that cannot be correlated reliably and surface the limitation; do not read mutable end-of-request state as if exact.
  - Evidence: Not started.

- [ ] **T3: Compute interval estimates and evidence-based confidence**
  - Depends on: T1's validated read model; may use synthetic observations before T2 completes.
  - Parallel with: T2 after T1 establishes interfaces.
  - Files/inputs: proposed estimator module under `pi/profiles/default/lib/`, using the ledger DTOs; focused estimator tests.
  - Change: segment 5-hour and weekly epochs; construct bounded poll intervals; aggregate request usage by model-effort; derive conservative movement ranges; handle zero ticks, resets, missing polls, boundaries, failures, lag sensitivity, external-usage evidence, rank-deficient mixtures, and nonnegative identifiable estimates. Return structured estimates plus reasons for confidence or indeterminacy.
  - Complexity / split hints: keep deterministic interval construction separate from coefficient fitting/confidence classification so each can be tested with small fixtures. Prefer a bounded dependency-free solver unless repository evidence clearly justifies another dependency.
  - Verify: table-driven tests for single-group clean ticks, mixed identifiable and non-identifiable groups, zero ticks, rounded movement, delayed ticks, long gaps, reset/decrease/manual reset, 0/100 censoring, missing usage, external-only ticks, and differing primary/secondary results.
  - Done when: synthetic fixtures produce conservative ranges and confidence labels without proportional mixed-interval attribution or cross-window arithmetic.
  - If blocked: report group mixtures and `indeterminate`; do not weaken identifiability requirements to force per-group numbers.
  - Evidence: Not started.

- [ ] **T4: Add the impact report and document its evidence limits**
  - Depends on: T2 capture and T3 estimator outputs.
  - Files/inputs: `pi/profiles/default/extensions/codex-status.ts`, `pi/profiles/default/lib/codex-usage.ts` or a dedicated formatter, `pi/profiles/default/tests/usage-context-tps.test.ts`, `pi/profiles/default/scripts/usage-smoke.mjs`, `pi/README.md`, and root `CHANGELOG.md`.
  - Change: add the compact estimator section to `/usage`, keep footer and model context unchanged, report persistence/estimation failures explicitly, and document storage, reset/deletion behavior, retention, privacy exclusions, confidence meanings, external-use contamination, and lack of historical backfill. Reconcile the existing README claim about cache observation coverage/model mix with actual output rather than expanding unrelated functionality silently.
  - Verify: rendered-report tests cover collecting, bounded estimate, upper bound, indeterminate, confidence flags, persistence failure, no model-context injection, and unchanged quota/cache/Bedrock sections; update smoke expectations if required.
  - Done when: operators can see useful per-model/effort evidence without mistaking it for an exact subscriber-limit formula.
  - If blocked: keep the existing report operational and show the tracker-specific unavailable reason.
  - Evidence: Not started.

- [ ] **T5: Run bounded default-profile validation and close out**
  - Depends on: T1-T4.
  - Files/inputs: changed default-profile files and this spec.
  - Change: run focused tests, usage typecheck, smoke loader, and the repository's default Pi check appropriate to the final diff. Fix task-related failures only. Record that live private-endpoint behavior remains a non-blocking verification limit unless an already-authenticated bounded manual check is explicitly performed.
  - Verify from `pi/profiles/default/`: `pnpm test usage-context-tps.test.ts <new-focused-test-files>`; `pnpm exec tsc --noEmit -p tests/tsconfig.usage.json`; `node scripts/usage-smoke.mjs`. From repository root: `make check-pi-default` if its scope remains appropriate to the final changes.
  - Done when: agreed checks pass, task evidence is current, and implementation is ready for the closeout below.
  - Evidence: Not started.

## Agreed validation and current handoff

- Status: ready.
- Completed work and evidence: read-only investigation confirmed the private endpoint schema, current five-minute/UI-only polling, missing request-scoped effort in finalized messages, current limited cache ledger, and available extension lifecycle hooks. A statistical review established interval-censored estimation and confidence rules. A persistence review established the allowlist/privacy and concurrency requirements.
- Next: T1, after creating the dedicated worktree and recording its actual branch/target.
- Blockers/open decisions: none. Routine hard byte/row thresholds must be measured during implementation while preserving the fixed 30-day/current-plus-previous-weekly-epoch bound.
- Verification limits: no implementation checks or live endpoint experiments were run. The endpoint is private and observed behavior may change. External Codex activity cannot be distinguished perfectly and must remain a confidence limitation.

## Closeout

After implementation and agreed checks pass, update task evidence and record integration as pending. Confirm `.specs/archive/codex-subscription-impact-tracker/` does not contain another plan, then move this entire spec directory there in the task worktree and repair affected links. Commit implementation and archived spec together on the task branch. Do not archive unfinished implementation.

For authorized `/do-it` execution, dispatch the Integrator from the recorded target checkout after the task commit. The Integrator owns local integration, completion metadata, and clean task-worktree removal. Routine merge conflicts remain agent-owned. If integration is blocked, retain the worktree and report implementation/checks separately from delivery. Under `--no-merge`, skip mutation and retain the committed worktree intentionally.

Push and deployment require separate explicit authorization. Operator live testing does not block archival, commit, or authorized integration.

### Final response

Start with exactly one overall outcome:

- 🟢 **COMPLETED** when checks pass, integration and completion metadata are committed, and cleanup is verified.
- 🔴 **NOT COMPLETE: MERGE BLOCKED** when implementation is committed but integration is blocked.
- 🔴 **NOT COMPLETE: USER INPUT REQUIRED** when a consequential decision or prerequisite prevents completion.
- 🔵 **IMPLEMENTED: MERGE SKIPPED AS REQUESTED** for a successful `--no-merge` execution.
- 🟡 **CLEANUP PENDING** when target changes and metadata are complete but worktree cleanup is unfinished.

For blocked or cleanup-pending outcomes, immediately state the reason, action needed, and owner. Then report checks, spec path, branch/commits, merge result, and any retained worktree. Do not imply automatic resumption or lead a blocked result with successes.
