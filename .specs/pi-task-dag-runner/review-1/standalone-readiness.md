---
reviewer: standalone-readiness
status: complete
---

# Standalone Readiness

Result: BLOCKED

## Finding 1 - Ownership classification precedence is contradictory

- classification: blocker
- severity: high
- evidence: `.specs/pi-task-dag-runner/plan.md:182` says an active-map entry wins regardless of persisted metadata and returns `active`, and `plan.md:198` explicitly places active-map ownership before execution status. However, `plan.md:187` requires a running record with `execution.status === "failed_to_stop"` to return `failed_to_stop` whether active or inactive. This state is representable: current timeout handling records `failed_to_stop` while the coordinator entry remains active until the runner promise settles (`pi/extensions/tasks/execution.ts:445-468`, with active-map removal attached to promise settlement at `pi/extensions/tasks/execution.ts:270-276`). T3 is required to implement the exact table and exact precedence, so a fresh implementer cannot satisfy both contracts or write one definitive assertion for this row.
- required_fix: Choose one rule for an active-map record whose persisted status is `failed_to_stop`, state it identically in the vocabulary, truth table, precedence paragraph, and caller action, and require focused tests for both the still-active timeout state and the later inactive state. The rule must not permit restart until stop or settlement proves ownership is gone.
- confidence: high - verified against the plan's conflicting normative statements and the current coordinator timeout lifecycle.

## Finding 2 - The public byte-size contract has no deterministic overflow behavior

- classification: blocker
- severity: high
- evidence: `.specs/pi-task-dag-runner/plan.md:99` caps each error at 200 characters while also requiring the complete model-visible result to fit 4,096 UTF-8 bytes. Eight 200-character errors can exceed that limit when characters use multiple UTF-8 bytes, before IDs and JSON overhead are counted. `plan.md:129` requires one result for every supplied ID, and the model-visible envelope at `plan.md:193-195` may also include `outputPath`, but no byte limit or overflow policy is defined for that field. The graph success response has a specific worst-case proof and pre-write enforcement rule (`plan.md:124`); `execute_many` and `await` do not define an equivalent serialization rule that preserves valid JSON and every required positional classification.
- required_fix: Define byte-based limits and a deterministic response-budget algorithm for `execute_many` and `await`. It must preserve all IDs, classifications, order, and valid JSON; specify when optional `error` and `outputPath` fields are byte-truncated or omitted; enforce the 4,096-byte bound after serialization; and test worst-case eight-result Unicode errors and long authorized artifact paths.
- confidence: high - the stated character cap does not imply the stated UTF-8 byte cap, and no overflow behavior is specified.

## Finding 3 - Archive ledger verification counts fields but does not validate item records

- classification: blocker
- severity: medium
- evidence: The archive predicate at `.specs/pi-task-dag-runner/plan.md:238` independently counts 14 checked lines, 14 complete-status lines, and 14 non-`--` evidence lines. It does not associate status and evidence with a checklist ID, reject duplicate IDs, require exactly one status/evidence pair per item, or compare the checklist ID set with the task table and executable sections. Thus one item can have duplicated metadata while another has none and the command can still pass. Both active and archived publication rely on this predicate (`plan.md:572,575`). Independent inspection currently finds each required heading exactly once and in the required relative order, and the current task-table, executable-section, and checklist ID sets all equal the same 14 IDs; the archive command does not preserve that proof as the ledger is edited.
- required_fix: Replace the count-only regex command with a deterministic parser that validates each checklist block by ID: exact expected ID set, no duplicates, checked state, exactly one `Status: complete`, and exactly one non-placeholder evidence value. Also compare that ID set with the task table and executable task/gate headings before active publication and again against the archived plan.
- confidence: high - a duplicated metadata block and a missing metadata block satisfy the current independent totals.

## Verified nonblocking domains

- Required headings occur exactly once and in the required relative order; current task, wave, dependency, and checklist IDs align.
- `make check && make test-ci` supplies aggregate evidence plus an independently truth-preserving root pytest exit.
- T0 includes the Windows/Git-Bash linker tools, asserts the hardcoded `${HOME}/.dotfiles` target, verifies all five linked packages, and T3 explicitly authorizes and dry-runs the exact install-link-typecheck-test recipe order.
- Graph dependency duplicates are consistently rejected after normalization.
- The owned-path baseline is captured before source mutation, targeted hunks are recorded, and rollback requires a byte-identical `cmp` against the baseline.
- Readiness publication requires `Result: STANDALONE READY`, and the archive procedure supplies target-scoped resume branches without overwrite.
- Workspace rejection precedes coordinator access, abort does not stop workers, and schema/result envelopes are otherwise explicitly bounded and positional.
