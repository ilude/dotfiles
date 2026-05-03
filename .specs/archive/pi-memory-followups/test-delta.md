# T4 Test Delta -- Snapshot Retirement

This file records every test deleted, rewritten, or kept under T4 (snapshot
retirement). No tests were marked `.skip` -- removed tests are deleted.

## pi/tests/agent-chain.test.ts

Pre-T4 it() count: 26 (one of the test files where vitest reported `0 test`
in the baseline run because of a pre-existing pi-ai/pi-tui pnpm-resolution
failure that aborted suite registration; the 26 figure is the source-level
count via `grep -c '^\s*it('`).

Post-T4 it() count: 9.

### Deleted (17)

These tests directly exercised the snapshot loader, regenerator, snapshot
state file, or provider-assisted similarity matrix -- all of which were
removed when the snapshot library was retired.

- `rebuilds a missing snapshot synchronously on read`
- `preserves raw-log history while reading from a fresh mental-model snapshot`
- `does not replay the full raw log when a fresh snapshot exists`
- `rebuilds stale snapshots to include new entries`
- `surfaces safe fallback behavior when the last rebuild fails`
- `defaults read_expertise to concise output while full mode keeps task-specific history`
  (the concise filter helpers lived inside the snapshot library and have
  been removed; the read tool now returns category-grouped raw output)
- `concise mode hides observations from other projects`
- `concise mode hides domain-specific strong decisions`
- entire `provider-assisted similarity matrix` describe block (8 tests):
  - `uses the deterministic-only baseline when provider-assisted similarity is disabled or unavailable`
  - `provider-enabled ambiguous merge approval merges borderline observations after deterministic pre-grouping`
  - `provider-enabled ambiguous merge rejection keeps borderline observations separate`
  - `falls back to deterministic compaction on low confidence provider responses`
  - `falls back to deterministic compaction when the provider times out or fails`
  - `falls back to deterministic compaction on malformed provider responses`
  - `reports why enabled similarity is inactive when provider setup is unavailable`
  - `never sends strong_decision or key_file categories into the provider-assisted path`
- `stale snapshot: when repoId changes, snapshot is rebuilt from current layer`

### Rewritten (1)

- `append_expertise writes raw history and marks snapshot state stale`
  -> `append_expertise writes a raw JSONL record without a sidecar state file`
  Reason: `append_expertise` no longer writes the
  `*-mental-model.state.json` sidecar. The new test asserts the JSONL log
  is written and the sidecar is absent.

### Kept (8 unchanged)

- `registers expertise and session-log tools`
- `read_expertise reports first session when no expertise exists`
- `deduplicates repeated observations while preserving strong_decision and key_file entries`
  (renamed in source to `renders category-grouped output and dedupes repeated observations`
  for clarity; assertions unchanged in spirit -- still verifies `dotfiles: same noisy fact`,
  `keep npm on Windows`, `pi/extensions/agent-chain.ts -- expertise tools`)
- `GIT_REMOTE_FIXTURES covers all required remote format categories`
- `WINDOWS_NORMALIZATION_FIXTURES covers all required reserved-name variants`
- `mixed state: read_expertise returns entries from both global and project-local layers`
- `read order: project-local entries are surfaced before global entries`
- `dedupe: overlapping summaries from global and project-local layers appear only once`

## pi/tests/expertise-layering.test.ts

Pre-T4 it() count: 13 (vitest baseline reported `13 tests | 11 failed | 2 passed`).

Post-T4 it() count: 12.

### Deleted (1)

- `stale snapshot: snapshot is rebuilt when the stored repo-id diverges from detected repo-id`
  Exercised the snapshot rebuild-on-stale path that has been removed; the
  assertion `expect(result.details.rebuildStatus).toBe("ready")` is no
  longer meaningful because `rebuildStatus` has been dropped from the
  `read_expertise` details payload.

The unused `snapshotPath()` and `statePath()` helper functions and the
companion file-header comment line `stale snapshot rebuild on repo-id
cutover` were also removed. The `vi.mock("@mariozechner/pi-ai", ...)`
factory was removed because `completeSimple` is no longer reachable from
agent-chain.ts.

### Kept (12 unchanged)

- `project-local: append_expertise writes to project-local dir when cwd is inside a git repo`
- `global: append_expertise writes to global dir when cwd is outside any git repo`
- `read order: project-local entries appear before global entries in read_expertise output`
- `read output merges layer categories without provenance metadata`
- `mixed state: legacy global logs remain readable alongside project-local logs`
- `drift (L8): both old and new slug paths appear in read output and drift is flagged`
- `dedupe: project-local entry with same summary as global entry is not duplicated`
- `dual-read: global Pi/tooling knowledge remains in read output even when project-local layer exists`
- `sensitive_repo: append_expertise writes go to global only when sensitive_repo is set in repo config`
- `sensitive_repo: no redaction-free path -- blocked entry does not appear in project-local dir at all`
- `project-local dir is a child of global expertise dir, keyed by repo slug`
- `global log and project-local log have non-overlapping file paths`

## pi/tests/runtime-smoke.test.ts

Pre/post it() count: 6/6. No deletions. The string `expertise-snapshot.ts`
remains in the FORBIDDEN_NAMES set as a defensive guard against future
helpers accidentally re-introduced under `pi/extensions/`. The string is
load-bearing for the structural test even though the file no longer exists.

## pi/tests/snapshot-restore-smoke.test.ts (added)

New file. 4 tests, all pass:

- `restores a known-good archive and reports parsed == total`
- `throws when an archived JSON file is corrupt`
- `throws when a mental-model file lacks ExpertiseSnapshot top-level keys`
- `findLatestArchive picks the lex-greatest directory under the archive root`

## Skipped-test delta

Pre-T4 baseline: 0 skipped tests across the suite.
Post-T4: 0 skipped tests across the suite.

T4 acceptance criteria #6 (no new skipped tests introduced) is satisfied.
