---
created: 2026-08-24
status: ready
---

# Build Repeatable Tool-Failure Triage

## Objective

Provide a deterministic, privacy-bounded Pi analytics workflow that finds recurring tool-call failure candidates, preserves dated addressed or skipped decisions in an append-only ledger, and presents only new, changed, regressed, or explicitly due-for-review candidates for operator triage.

## Completion Evidence

- Evidence: Against a path-free digest of the frozen August 14-24 session manifest and snapshot inputs, the workflow reproduces the confirmed Bash transport, governed selected-skill read, and stale subagent-manager candidate families; records addressed and skipped decisions with dates and typed evidence references; suppresses unchanged skipped candidates from the actionable queue; reopens post-fix recurrences as regressions; and produces the same candidate fingerprints and dispositions on an unchanged read-only snapshot rerun without storing raw prompts, arguments, or outputs.
- Fails when: Raw `isError` totals are treated as defects; candidate identity depends on session filenames, timestamps, paths, secrets, or unstable free text; addressed regressions remain suppressed; skipped decisions must be made repeatedly; ledger edits destroy decision history; concurrent writes lose records; or the workflow creates a second raw telemetry stream instead of reading canonical session JSONL through the existing analytics helper.

## Boundaries

- In scope: `pi/analytics/pi_log_query.py`, focused analytics modules and tests under `pi/analytics/`, a small operator-facing CLI or subcommand for scan/decide/report, a dedicated local-private tool-failure decision root that governs only tool-failure candidate IDs, source registration for bounded analytics queries, and concise operator documentation.
- Out of scope: Automatic code changes, model-generated dispositions, live alerting, background schedulers, web-search retries, semantic defect prevalence estimates, ingestion of overlapping history records, raw transcript exports, and migration of existing workflow-friction learning decisions.
- Preserve: Canonical session JSONL as the failure-event source of truth; snapshot-before-query behavior; explicit schemas and bounded readers; malformed-row failure policy; current privacy rules; process-local and repository ownership boundaries; and existing workflow-friction records.
- Assumptions: A tool-result `isError=true` is only a screening signal. A human disposition remains required because test failures, safety blocks, expected command exits, exploratory misses, and transient external failures may be correct outcomes.

## Tasks

- [ ] **T1: Define and prove deterministic failure-candidate screening**
  - Files: `pi/analytics/pi_log_query.py`, one focused tool-failure analysis module under `pi/analytics/`, `pi/analytics/tests/`, and `pi/skills/pi-log-analytics/reference.md`.
  - Change: Add a bounded direct Python scan over a selected `session_entries` snapshot that joins tool results to their originating calls by `(filename, toolCallId)`, derives a versioned candidate fingerprint from tool name plus a normalized error class and approved stable structural attributes, and retains only safe aggregates and minimized source coordinates for manual verification. Separate expected outcomes from candidates only through deterministic rules with tests; never infer a defect from counts alone. Report a path-free manifest/snapshot-input digest, source window, scanned result count, unmatched and duplicate join counts, malformed omissions, first/last observation, occurrence and session counts, and representative sanitized coordinates. Do not route the full scan through the query command's 1,000-row result limit or refresh a frozen snapshot during a read-only rerun.
  - Done when: A frozen fixture representing the August 14-24 cases yields stable distinct candidates for missing Bash `command`, governed selected-skill path escape, and stale manager ABI; expected nonzero tests and safety blocks remain explicitly unclassified or expected rather than defects; unmatched or duplicate call IDs are diagnosed; changing timestamps, session filenames, absolute home prefixes, or occurrence order does not change candidate identity; and materially changing the normalized error contract creates a new versioned candidate.
  - Verify: From the repository root, run `uv run --no-sync --project pi/analytics pytest pi/analytics/tests -k tool_failure`; run one read-only snapshot-backed scan against the retained local August 14-24 manifest digest and compare only candidate IDs, counts, diagnostics, and sanitized classifications with the reviewed findings.

- [ ] **T2: Add an append-only decision ledger and actionable report**
  - Depends on: T1
  - Files: the T1 analytics module and tests, a focused JSONL ledger module under `pi/analytics/` or the owning Pi state library, `pi/analytics/pi_log_query.py`, `pi/analytics/tests/`, `pi/skills/pi-log-analytics/SKILL.md`, `pi/skills/pi-log-analytics/reference.md`, and the stable observability/tooling contract if public semantics require it.
  - Change: Add explicit `decide` and `report` operations backed by locked append-only JSONL. Store this ledger in a dedicated local-private tool-failure root, separate from workflow-friction learning decisions and statuses; it is the sole disposition authority for tool-failure candidate IDs. Each decision records schema version, record ID, candidate ID and fingerprint version, `decidedAt`, disposition (`addressed` or `skipped`), a bounded sanitized reason, typed evidence references, and optional fix commit/effective-after or revisit-after values. Derive current disposition by physical append order under the same exclusive lock rather than duplicating order in a sequence field. The default actionable report includes undecided and changed candidates, post-effective-date recurrence of addressed candidates as regressions, and skipped candidates whose explicit revisit date is due; it summarizes unchanged skipped and resolved candidates separately rather than hiding their counts. Claim best-effort append history among cooperating writers, not tamper-proof audit integrity.
  - Done when: Tests prove idempotent reruns, deterministic append-order latest-decision selection with equal or reversed timestamps, concurrent-writer safety, malformed and unsupported record diagnostics, unchanged skipped suppression, explicit revisit reopening, post-fix regression reopening, fingerprint-version change reopening, and preservation of historical records. The CLI requires a sanitized reason for skipped decisions and typed evidence plus an effective boundary for addressed decisions, rejects unknown candidate IDs, and rejects or sanitizes credentials, raw arguments or output, and Unix or Windows home paths before ledger append and report rendering.
  - Verify: Run the focused analytics tests, then perform a disposable end-to-end scan/decide/report sequence under `.tmp/pi-log-analytics/`: mark one fixture candidate addressed and one skipped, rerun unchanged, add a post-fix recurrence and a changed fingerprint, and verify only the regression and changed candidate return to the actionable queue. Inspect both ledger bytes and rendered output for attempted secret, absolute-path, and raw-content insertions.

## Validation

- [ ] The frozen fixture and snapshot-backed smoke produce stable candidate IDs for the three confirmed historical failure families without classifying every error-marked result as a defect.
- [ ] Reordering events and changing session identity, timestamps, or sanitized path prefixes leaves fingerprints unchanged; a material normalized contract change creates a new candidate version.
- [ ] The dedicated append-only ledger preserves addressed and skipped history, derives latest state from locked physical append order, rejects invalid decisions, survives concurrent writers, and reports malformed or unsupported records without silently dropping them or conflicting with workflow-friction dispositions.
- [ ] Unchanged skipped candidates stay out of the actionable queue, addressed post-fix recurrences reopen as regressions, and explicit revisit dates or fingerprint changes reopen candidates deterministically.
- [ ] A byte-level privacy inspection confirms the ledger and reports contain no raw prompts, tool arguments, tool output, credentials, absolute home paths, or copied session content; canonical session JSONL and its snapshot remain the only raw event source.

## Retention

Keep incomplete work at `.specs/tool-failure-triage/plan.md`. After completion, `/do-it` archives this directory to `.specs/archive/tool-failure-triage/`.

## Execution Status

- State: Ready; implementation has not started.
- Blocker: None.
- Next: T1.
- Resume: `/do-it .specs/tool-failure-triage/plan.md`
