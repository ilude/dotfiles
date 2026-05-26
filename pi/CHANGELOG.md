# Pi Changelog

## 2026-05-26: Document workflow eval telemetry operations

**Why:** Pi workflow telemetry now records dispatch events and defines lifecycle
data for future adaptive review sizing. Pi workflow maintainers need clear
rules for what runtime telemetry not to commit and which docs/tests to update
when the contract changes.

**Added:**
- Workflow eval telemetry guidance: runtime JSONL stays local by default,
  DuckDB files are rebuildable caches, and workflow telemetry contract changes
  must update the Pi telemetry docs and prompt-contract tests.
- Operations documentation and a local telemetry query helper.

**Files:** `pi/docs/workflow-eval-telemetry.md`,
`pi/docs/workflow-eval-operations.md`, `pi/scripts/workflow-eval-query.py`,
`pi/CHANGELOG.md`

---
