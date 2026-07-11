---
date: 2026-07-10
status: resolved
---

# Standalone Readiness Blockers

Resolution 2026-07-10: B1 was fixed in a user-requested follow-up pass. The
Automation Plan now snapshots every plan-owned path into a baseline with
`paths.txt`, a sha256 manifest, and a porcelain status file; rollback removes all
listed paths first (deleting files created during execution, including new
evidence), restores baseline files, and fails closed on `sha256sum -c --quiet`
plus `cmp -s` of before/after porcelain status. The procedure was validated
against a git fixture covering a pre-existing evidence file, a modified file, a
newly created file, a newly created evidence file, and an unrelated dirty file.
Standalone readiness re-ran and returned STANDALONE READY
(`standalone-readiness-pass-3.md`).

## B1 (resolved): Dirty-worktree rollback is not fail-closed

- Classification: blocker
- Evidence: The Automation Plan snapshots the entire pre-existing
  `.specs/pi-orchestration-telemetry/execution-evidence` directory, but rollback
  copies baseline files over the current directory without deleting files created
  during execution. New logs can therefore survive rollback. The row also says to
  "compare `git status --porcelain=v1` to `status-before.txt`" without an executable
  comparison command or failure condition.
- Required fix: Before restoring, remove each plan-owned path that was snapshotted,
  then restore existing baseline paths and remove absent-manifest paths. Add a
  fail-closed comparison such as writing current porcelain status to a temporary
  file and running `cmp -s` against `status-before.txt`; also verify a hash manifest
  for all baseline plan-owned files. Test the rollback procedure against a fixture
  containing a pre-existing evidence file plus a newly created evidence file.
- Why unresolved: The standalone-readiness state machine allows at most two repair
  passes after the initial check. Both passes were used; a third plan edit is not
  permitted in this review run.

## Nonblocking hardening

- Add an executable backup, selective event-ID purge, and post-purge verification
  procedure for non-scratch append-only metrics. Scratch telemetry already has an
  executable directory deletion path.
