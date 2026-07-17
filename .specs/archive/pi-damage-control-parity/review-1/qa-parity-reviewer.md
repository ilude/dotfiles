# QA Parity Review: Pi Damage-Control Claude Parity Plan

## Findings

### 1. Severity: High — Representative fixtures can falsely prove parity while broad rule classes remain untested

**Evidence:** T5 says “Where full all-352 pattern testing is feasible” and otherwise only requires curated representative outcomes plus compile/mapping checks. The success criteria then claim Pi ask/block outcomes match Claude for representative dangerous commands. A generated compile-only test does not prove each Claude regex matches intended commands, nor that Pi’s normalization preserves flags, anchoring, shell variants, or action semantics across the full rule set.

**Required fix:** Make full-policy parity a required oracle, not optional. Add a generated test that iterates every Claude `bashToolPatterns` entry with at least one stored synthetic positive command per pattern, or require each pattern to carry/derive a fixture. For patterns where a positive fixture cannot be generated, emit an explicit coverage debt file and fail if unreviewed entries exist.

### 2. Severity: High — Expected oracle is underspecified and may encode Pi behavior instead of Claude behavior

**Evidence:** The plan’s tests mostly assert expected outcomes manually in Pi tests. It does not require invoking Claude’s existing damage-control evaluator as the oracle for the same synthetic tool-call cases. This allows test authors to copy assumptions from the new Pi adapter and miss semantic differences in Claude’s Python implementation, especially for regex matching, path normalization, exclusions, and context relaxations.

**Required fix:** Build a parity fixture runner that evaluates the same synthetic cases against Claude’s Python damage-control logic and Pi’s TypeScript engine, then diffs normalized outcomes (`allow|ask|block`, reason/category where stable). Archive this diff as evidence and fail on unapproved mismatches.

### 3. Severity: Medium — Negative controls are not required, so over-blocking can pass unnoticed

**Evidence:** T3/T5 list dangerous positives (`rm`, force push, secret paths) but no safe near-miss cases. A broad adapter bug could block benign commands such as `echo rm -f`, `git push --force-with-lease --dry-run` if Claude allows it, reading allowed exclusions, or writing outside protected paths, and the plan would still pass because it prioritizes catching under-blocking.

**Required fix:** Add negative-control fixtures for every supported rule family: command near-misses, safe git operations, zero-access exclusions, allowed read-only reads, write-confirm paths with non-write operations, and benign content that resembles injection text but is outside scanned contexts. Compare expected outcomes to Claude where applicable.

### 4. Severity: Medium — “No real command execution” is stated but not mechanically enforced

**Evidence:** The safety note says tests must not execute dangerous shell commands, but T4 wires real `bash`/`pwsh` tool-call handlers and the validation commands run normal test suites. There is no required test harness assertion that shell execution functions are mocked/spied and never called for parity fixtures.

**Required fix:** Require a fake executor boundary in Pi handler tests and assert executor calls are zero for ask/block denial paths and only use harmless sentinel commands for allow paths. Add a CI guard/test helper that fails if parity fixtures call real `bash`, `pwsh`, `rm`, `git push`, delete/write primitives, or filesystem paths outside a temp sandbox.

### 5. Severity: Medium — Evidence sufficiency for `/do-it` is vulnerable to stale or partial artifacts

**Evidence:** The checklist asks `/do-it` to mark tasks after verification, and F5 checks evidence files exist/no secrets. It does not require evidence to include command exit codes, timestamps, git SHA/diff stat tied to the tested tree, or coverage counts showing all fixtures/rule classes executed. Existing logs could satisfy file-existence checks after later code changes.

**Required fix:** Define an evidence manifest generated at final gate containing git SHA/status, diff stat, exact commands, exit codes, timestamps, fixture counts by rule family, Claude-vs-Pi mismatch count, and secret-scan result for evidence logs. Make F5 fail if any manifest entry is missing or stale relative to current git diff.
