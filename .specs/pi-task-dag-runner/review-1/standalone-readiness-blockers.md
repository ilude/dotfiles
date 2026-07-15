---
date: 2026-07-15
status: blocked
source: standalone-readiness.md
repair_passes_used: 2
---

# Standalone Readiness Blockers

The two permitted standalone repair passes are exhausted. The plan remains active and must not execute or archive until these blockers are repaired and independently re-reviewed.

## 1. Ownership precedence conflict

- Evidence: The truth table says active-map ownership wins regardless of persisted metadata, but the `failed_to_stop` row applies whether the record is active or inactive. The current coordinator can retain an active entry after persisting `failed_to_stop`.
- Required fix: Choose one classification for active plus `failed_to_stop`, use it consistently in vocabulary, truth table, precedence, caller action, and tests, and forbid restart until ownership is resolved.

## 2. Multi-result byte overflow behavior

- Evidence: Eight Unicode errors capped by character count plus IDs, classifications, and optional output paths can exceed the 4,096-byte model-visible limit.
- Required fix: Define a UTF-8 byte-budget algorithm that preserves every ID/classification/order and valid JSON while deterministically truncating or omitting optional errors and output paths. Add worst-case Unicode and long-path tests.

## 3. Archive ledger parser integrity

- Evidence: The current archive command counts checked items, complete statuses, and evidence lines independently. It does not associate metadata with IDs or reject duplicate/missing blocks.
- Required fix: Parse checklist blocks by ID, require the exact 14-ID set with no duplicates, and require exactly one checked state, complete status, and non-placeholder evidence per ID. Compare with task-table and executable-section IDs in active and archived plans.
