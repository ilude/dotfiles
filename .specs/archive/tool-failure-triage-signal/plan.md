---
created: 2026-08-24
status: completed
completed: 2026-08-24
---

# Reduce Tool-Failure Triage Noise

## Objective

Make `/find-fails` present current, structurally actionable tool failures by default while retaining deterministic access to expected error-marked outcomes and preserving existing tool, safety, privacy, and decision-ledger behavior.

## Completion Evidence

- Evidence: A sanitized fixture matrix and retained scan digest `f724abcae1ac42cc7010193f4773d63c3aa1321120d60a63e757b961ac3d66e2` classify only exact, approved signatures for instruction deferrals, exact-match and path misses, ordinary command exits, policy and governed-boundary enforcement, secret-scan blocks, invalid lifecycle sequencing, and invalid caller arguments as expected; keep ambiguous timeouts and aborts, internal exceptions, valid-call transport defects, unavailable required runtimes, and external-service failures actionable; suppress every approved expected family from the default report with candidate-group counts; recover undecided expected groups through `tool-failure-report SCAN --include-expected`; and preserve regression, ledger, privacy, and candidate-identity behavior.
- Fails when: Tool `isError` semantics or safety enforcement change; counts or broad words such as `failed`, `timeout`, `aborted`, `not found`, or `not permitted` determine defect status; an approved expected family remains in the default queue; an ambiguous timeout, internal exception, post-fix regression, or unknown signature is suppressed; diagnostic mode cannot recover the exact suppressed candidate IDs; candidate identity gains sensitive or unstable material or collapses materially different structural contracts; or an existing structurally valid addressed or skipped decision loses its effect. The historical `tf-v1-48d005ff14c097241d0b` skip remains in the append-only ledger but does not apply after its broad `not permitted` contract is corrected.

## Boundaries

- In scope: Deterministic error classification and candidate contracts in `pi/analytics/tool_failure_triage.py`; focused analytics fixtures and tests; default and diagnostic report behavior exposed through `pi/analytics/pi_log_query.py`; `/find-fails` rendering in `pi/extensions/tool-failure-triage.ts`; its focused TypeScript test; and the owning analytics and observability documentation.
- Out of scope: Changing tool execution or `isError` behavior, weakening damage control or governed paths, automatic code repair, model-generated dispositions, count-based severity claims, categorical suppression of timeouts or aborts, new telemetry or session fields, web-search retries, subagent runtime changes, rewriting or deleting the local decision ledger, and manually resolving genuinely unclassified residual candidates.
- Preserve: Canonical session JSONL and snapshots as the only raw source; privacy-bounded fingerprints and reports; append-only ledger history and effective-after regression handling; stable candidate IDs for unchanged normalized contracts; explicit malformed-row policy; and `/find-fails` as a local read-only view that does not start a provider turn.
- Assumptions: The retained `.tmp/pi-log-analytics/tool-failure-scan.json` still has manifest digest `f724abcae1ac42cc7010193f4773d63c3aa1321120d60a63e757b961ac3d66e2` and its private ledger still yields the reviewed 32-item baseline; fixture tests remain authoritative if that disposable local baseline is absent or has changed.

## Tasks

- [x] **T1: Classify representative expected and actionable contracts**
  - Files: `pi/analytics/tool_failure_triage.py`, `pi/analytics/tests/test_tool_failure_triage.py`
  - Change: Extend the deterministic classifier with exact signatures derived from the reviewed corpus. Classify instruction-discovery retry deferrals, exact-match and uniqueness misses, missing paths and invalid offsets, ordinary explicit command exits, policy and governed-boundary enforcement, secret scanning, invalid lifecycle sequencing, and invalid caller arguments as expected only when a rule-specific structural signature proves that contract. Keep ambiguous timeouts and aborts, missing methods and other internal exceptions, valid-call transport defects, unavailable required runtimes, external-service failures, and unknown signatures actionable. Give materially different contracts distinct privacy-safe normalized contract discriminators without using arguments, paths, output, session identity, timestamps, or counts. Preserve IDs and classifications for existing structurally valid decided contracts. The reviewed `tf-v1-48d005ff14c097241d0b` decision is an explicit exception because its broad `not permitted` contract merged unrelated external permission failures; retain that record as history without applying it to corrected candidates. If another proposed rule touches a ledger-decided ID, retain its contract or stop for an explicit compatibility mapping rather than orphaning the decision.
  - Done when: Focused tests cover each approved family and precedence, include ambiguous timeout, abort, trusted-runtime invalid-state, and structural-collision counterexamples, prove materially different contracts do not share IDs, keep unknown signatures unclassified, preserve the nine addressed and three structurally valid skipped IDs while retaining the corrected broad skip as historical ledger state, and confirm serialized scans contain no fixture arguments, raw output, home paths, or credentials.
  - Verify: `uv run --no-sync --project pi/analytics pytest pi/analytics/tests/test_tool_failure_triage.py -k "classif or deterministic or private"`

- [x] **T2: Suppress expected noise while retaining diagnostic access**
  - Depends on: T1
  - Files: `pi/analytics/tool_failure_triage.py`, `pi/analytics/pi_log_query.py`, `pi/analytics/tests/test_tool_failure_triage.py`, `pi/analytics/tests/test_pi_log_query.py`, `pi/extensions/tool-failure-triage.ts`, `pi/tests/tool-failure-command.test.ts`, `pi/skills/pi-log-analytics/SKILL.md`, `pi/skills/pi-log-analytics/reference.md`, `pi/skills/pi-extension/references/contracts/observability.md`
  - Change: Evaluate ledger state before classification suppression so changed, revisit-due, and post-effective-date regression states always remain actionable. For otherwise-undecided expected candidates, omit them from the default report and count suppressed candidate groups in numeric `summary.expectedSuppressed`; `tool-failure-report SCAN --include-expected` includes those groups with status `expected` and reports `expectedSuppressed: 0` while retaining normal ledger filtering for resolved and unchanged-skipped candidates. Keep `/find-fails` argument-free and default-only, require the new summary field in its parser, and render the numeric count. Make `pi/skills/pi-log-analytics/reference.md` the CLI syntax owner; the skill and observability contract state default semantics and reference that owner without duplicating syntax.
  - Done when: Tests prove default group-count suppression, CLI-only diagnostic inclusion, regression precedence even for an expected-class candidate, unchanged resolved/skipped/revisit/changed behavior, required numeric summary parsing and rendering, and no provider turn or ledger mutation. Against the unchanged retained scan and ledger, every approved expected family has zero default actionable groups, diagnostic mode recovers the exact suppressed IDs, all nine addressed and three structurally valid skipped decisions retain their effects while the corrected broad skip remains historical only, and internal exceptions, external-service failures, and unclassified residuals remain visible.
  - Verify: `uv run --no-sync --project pi/analytics pytest pi/analytics/tests/test_tool_failure_triage.py pi/analytics/tests/test_pi_log_query.py && cd pi && pnpm test tool-failure-command.test.ts && pnpm run typecheck`

## Validation

- [x] Focused classifier tests prove expected deferrals are suppressed while an internal missing-method error remains actionable, without count-based or sensitive fingerprint material.
- [x] The two affected analytics test files, `pnpm test tool-failure-command.test.ts`, `pnpm run typecheck`, focused Ruff checks, and `git diff --check` pass.
- [x] Against retained scan digest `f724abcae1ac42cc7010193f4773d63c3aa1321120d60a63e757b961ac3d66e2`, the default report has zero actionable groups from every approved expected family and a nonzero candidate-group `expectedSuppressed` count; `--include-expected` returns those exact IDs with `expectedSuppressed: 0`; and the nine addressed plus three structurally valid skipped decisions retain their effects while `tf-v1-48d005ff14c097241d0b` remains ledger history only.
- [x] A schema allowlist inspection of both retained-corpus report modes confirms that only bounded structural candidate fields, statuses, and numeric summaries are emitted, with no raw prompt, arguments, paths, credentials, or tool output.
- [x] Diff inspection confirms files that execute tools, set `isError`, enforce safety or governed boundaries, manage ledger history, retry operations, or call external services remain unchanged.

## Retention

Keep incomplete work at `.specs/tool-failure-triage-signal/plan.md`. After completion, `/do-it` archives this directory to `.specs/archive/tool-failure-triage-signal/`.

## Execution Status

- State: Complete
- Blocker: None.
- Result: Exact structural classification and default expected suppression passed 49 analytics tests, 6 focused extension tests, typecheck, Ruff, retained-corpus ledger compatibility, privacy allowlist, and diff checks.
- Next: Archive.
- Resume: `/do-it .specs/tool-failure-triage-signal/plan.md`
