---
created: 2026-08-24
status: completed
completed: 2026-08-24
---

# Turn Tool Failures into an Investigation Shortlist

## Objective

Make `/find-fails` identify recent tool failures and repeated happy-path friction that should not be happening, present a bounded reason-bearing investigation pool, and use an isolated tool-free typed model stage to recommend a small investigation scope for operator approval without diagnosing, mutating code, or changing the ledger.

## Completion Evidence

- Evidence: Deterministic fixtures prove scan-owned recent-window evidence, ledger and expected-failure precedence, stale and weak-evidence suppression, separate identification of recent implementation/runtime defects and recurring model-to-tool or retry-ceremony friction, and stable ranking of at most 10 reason-bearing cards; focused command tests then prove `/find-fails` runs one isolated active-model stage with no tools or prior conversation, validates a recommendation containing 1-3 supplied candidate IDs, renders investigation value and evidence limits, and stops for operator refinement before content-bearing diagnosis or mutation.
- Fails when: `/find-fails` still emits an unprioritized flat queue; lifetime totals override staleness; current internal, runtime, ledger-override, or unclassified evidence disappears without an omitted-group signal and recovery command; repeated invalid model calls or avoidable retry ceremony cannot become investigation opportunities because they are expected errors; the model receives raw transcript content, arguments, output, paths, hashed coordinates, or prior conversation; invents IDs outside the deterministic pool; diagnoses or fixes issues; can call tools; mutates the ledger; or continues without operator input; ranking varies on unchanged input; or sensitive data enters cards, prompts, fingerprints, or reports.

## Boundaries

- In scope: Scan-owned 7/14/30-day occurrence/session evidence and timestamp diagnostics; deterministic queue admission; investigation-opportunity rules, reason codes, ranking, bounded cards, overflow recovery; `/find-fails` rendering and one isolated typed scope-recommendation stage; focused analytics/extension/typed-agent boundary tests; and owning analytics and observability documentation.
- Out of scope: Full tool-call/result retrieval, transcript excerpts, diagnosis, implementation plans, code changes, automatic fixes, automatic or model-generated dispositions, ledger schema changes, interactive pickers, a separate `/investigate-fails` command, configurable thresholds or weights, statistical severity/rate scoring, exposure denominators, alerts, schedulers, retention/deletion, provider/runtime repairs, and resolving the current candidate queue.
- Preserve: Exact structural classifiers and candidate IDs; `--include-expected`; append-only ledger history; changed, revisit-due, regression, resolved, and skipped semantics; privacy-bounded scan/report fields; malformed-row diagnostics; immediate visible command acknowledgement; and explicit operator control before investigation or mutation.
- Assumptions: `session_entries.timestamp` is the authoritative observation timestamp. `scan_connection` captures one trusted current UTC `asOf` value at scan start, injectable in tests; recent windows are inclusive `[asOf - N days, asOf]`; and missing, malformed, or future observations contribute to lifetime totals only, increment a bounded diagnostic, and cannot create first/last, recent-window, or ledger-regression evidence. Scope selection sends only the allowlisted card fields to the current configured model through `pi/lib/typed-agent.ts`; the command visibly states that this operational metadata will be sent to that provider. The previously discussed limit of up to 10 full call/result samples applies to a future operator-approved diagnosis flow, not this plan.

## Tasks

- [x] **T1: Add trustworthy recent-window evidence and queue gates**
  - Files: `pi/analytics/tool_failure_triage.py`, `pi/analytics/tests/test_tool_failure_triage.py`
  - Change: Add scan-level `asOf`, bounded timestamp omissions, and per-candidate `occurrences7d/sessions7d`, `occurrences14d/sessions14d`, and `occurrences30d/sessions30d`. Normalize accepted timestamps to UTC and derive first/last/source-window/regression evidence from that same set. Preserve lifetime counts and candidate identity. Apply this precedence: fingerprint changes, revisit-due skips, and post-effective-date regressions always qualify; unchanged skipped/resolved remain omitted; existing expected suppression remains intact for the actionable queue; `internal-missing-method` qualifies with 1 occurrence in 14 days; `required-runtime-unavailable` with 2 sessions in 14 days; `external-service-failure` with 3 sessions in 7 days or 10 in 30 days; other classified candidates with 3 occurrences across 2 sessions in 14 days; and unclassified candidates conservatively with 1 valid 30-day observation. Candidates with zero 30-day observations are stale; other nonqualifying candidates are below-threshold. Changed/regressed expected safety or secret-scan candidates follow ledger precedence; unchanged blocks remain excluded later.
  - Done when: Table-driven tests prove exact UTC 7/14/30-day boundaries, same-session deduplication, invalid/future timestamp rejection, lifetime/recent separation, every gate immediately below and at threshold, unclassified first-recent-observation review, staleness overriding lifetime volume, timestamp-safe ledger precedence, unchanged IDs, and deterministic counts under reordered rows.
  - Verify: `uv run --no-sync --project pi/analytics pytest pi/analytics/tests/test_tool_failure_triage.py -k "window or threshold or timestamp or deterministic or private"`

- [x] **T2: Build a bounded prioritized investigation pool**
  - Depends on: T1
  - Files: `pi/analytics/tool_failure_triage.py`, `pi/analytics/pi_log_query.py`, `pi/analytics/tests/test_tool_failure_triage.py`, `pi/analytics/tests/test_pi_log_query.py`
  - Change: Project the existing scan result into deterministic investigation cards rather than adding persistent candidate state. Each card has allowlisted bounded fields: candidate ID; tool; one normalized structural label; one reason code; accepted last observation; and one named gate-driving window with its occurrence/session counts. Render, but do not store, one neutral explanation of at most 160 characters from a fixed template for each reason. Use reason codes `ledger-changed`, `ledger-regression`, `ledger-revisit`, `internal-contract-defect`, `runtime-unavailable`, `model-contract-friction`, `retry-ceremony`, `external-failure`, `classified-recurrence`, and `unclassified-review`; explanations call evidence an investigation opportunity, not proof of severity, cause, or fixability. Build a maximum 10-card pool directly with reservable tier capacity of 3 ledger overrides, 3 internal/runtime, 2 model-contract/retry friction, and 2 external/classified/unclassified, then fill unused capacity from the next stable candidates. Within each tier sort by the reason's gate-driving sessions descending, occurrences descending, then candidate ID. Exclude only unchanged safety blocks, secret-scan blocks, ordinary nonzero commands, stale groups, and unchanged resolved/skipped groups. Return aggregate expected, stale, below-threshold, omitted-by-card-limit, timestamp, and join-diagnostic counts. Materialize neutral `observed` output only for CLI `--include-observed` and qualifying `overflow` only for `--include-overflow`; keep both independent from `--include-expected`.
  - Done when: One fixture per reason and exclusion plus one overfull fixture prove neutral explanations, expected UX-friction admission without defect relabeling, ledger override precedence, reserved capacity, exact 10-card/field bounds, stable gate-specific ordering, observed/overflow recovery, each flag independently and all flags together, and schema privacy.
  - Verify: `uv run --no-sync --project pi/analytics pytest pi/analytics/tests/test_tool_failure_triage.py pi/analytics/tests/test_pi_log_query.py`

- [x] **T3: Recommend an operator-approved investigation scope**
  - Depends on: T2
  - Files: `pi/extensions/tool-failure-triage.ts`, `pi/tests/tool-failure-command.test.ts`, `pi/skills/pi-log-analytics/SKILL.md`, `pi/skills/pi-log-analytics/reference.md`, `pi/skills/pi-extension/references/contracts/observability.md`
  - Change: Render cards in this order: ledger attention, internal/runtime, model-tool friction, then other recurrence. Within each card show ID/reason first, tool/structural label second, and gate-driving recent breadth/freshness last. Show suppression/data-quality totals, exact `--include-observed`, `--include-overflow`, and `--include-expected` recovery commands, and end with the operator instruction to accept or refine candidate IDs. Use one stage-named error format with an exact `/find-fails` retry; skip model work for an empty pool. For a nonempty pool, visibly state that structural metadata will be sent to the active provider, then define the focused semantic stage in the command module with `defineAgent` from `pi/lib/typed-agent.ts`, giving it no tools or prior conversation. Send only candidate ID, reason code, structural tool/label, gate window/counts, and freshness. Its validated output selects 1-3 unique supplied IDs and provides bounded investigation-value reasons and evidence limitations. Deterministically reject duplicate or out-of-pool IDs. Render the validated recommendation as a custom message without triggering another turn, and stop for normal operator response. No separate module, framework, or investigation command is added.
  - Done when: Focused tests prove immediate acknowledgement; one bounded 10-card grouped rendering with overflow/recovery guidance; empty and stage-failure behavior; required report-schema validation; no typed-agent call on empty/failure; exactly one isolated tool-free call on success; minimal model input without session messages, transcripts, coordinates, paths, arguments, or outputs; deterministic duplicate/out-of-pool/final-schema rejection; and no follow-up provider turn, transcript read, or ledger mutation. Existing typed-agent tests remain authoritative for model resolution, correction, cancellation, and disposal. Documentation puts the shortest workflow in the skill, detailed rules/flags in the analytics reference, and only the stable isolation/privacy/operator-stop contract in observability documentation.
  - Verify: `cd pi && pnpm test tool-failure-command.test.ts && pnpm run typecheck`

## Validation

- [x] Focused fixtures prove every recent-window gate, ledger override, UX-friction recommendation rule, exclusion, priority reservation, card/field bound, overflow path, and diagnostic recovery path.
- [x] `/find-fails` renders at most 10 deterministic cards, skips model work for an empty pool, and otherwise runs one isolated no-tool typed stage whose validated result contains 1-3 supplied IDs before stopping for operator refinement.
- [x] `uv run --no-sync --project pi/analytics ruff check pi/analytics/tool_failure_triage.py pi/analytics/pi_log_query.py pi/analytics/tests/test_tool_failure_triage.py pi/analytics/tests/test_pi_log_query.py`, the affected Python tests, `cd pi && pnpm test tool-failure-command.test.ts && pnpm run typecheck`, and `git diff --check` pass.
- [x] Schema/diff inspection confirms no raw prompts, arguments, tool output, paths, filenames, credentials, full transcript retrieval, classifier/fingerprint changes, tool behavior changes, ledger writes, or normal-session provider turn were added.

## Retention

Keep incomplete work at `.specs/tool-failure-actionability-threshold/plan.md`. `/do-it` must materialize it in the owned implementation worktree, run validation, archive it to `.specs/archive/tool-failure-actionability-threshold/`, commit the workflow branch, merge it with `--no-ff` into the clean primary branch, verify merged HEAD, and remove only its owned worktree and branch. Any dirty, unmerged, or conflict state preserves the worktree and recoverable plan.

## Execution Status

- State: Complete
- Blocker: None.
- Result: Recent-window gates, deterministic prioritized cards, recovery views, and the isolated scope recommendation passed 66 analytics tests, 9 focused command tests, Ruff, typecheck, and diff checks.
- Next: Archive.
- Resume: `/do-it .specs/tool-failure-actionability-threshold/plan.md`
