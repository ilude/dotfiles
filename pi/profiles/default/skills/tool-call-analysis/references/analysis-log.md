# Tool-call analysis log

Durable review history for the `tool-call-analysis` skill. This log records coverage and findings; it is not executable policy. Append new reviews and preserve corrections to older entries.

## TCA-001 - Weekly Pi session failure and anomaly review

- **Review date:** 2026-09-11.
- **Profiles:** default and legacy.
- **Interval:** `[2026-09-07 00:00:00 EDT, 2026-09-10 23:18:54 EDT]`.
- **Selected input:** 325 default sessions, 0 legacy sessions, 233,244,567 transcript bytes. A session qualified when it contained at least one record in the interval.
- **Method:** Canonical manifest partitioned into eight mutually exclusive byte-balanced shards for parallel semantic review. Shard 2 was retried with direct JSONL streaming after its original reviewer crashed. Initial manifest scanning reported no file-read or JSON parse failures.
- **Artifacts:** `C:/Projects/Work/Gitlab/monorepo/.specs/session-review-2026-09-07/manifest.json`, shard manifests in the same directory, and `consolidated-review.md`.
- **Coverage limits:** Several reviewers returned abbreviated ledgers rather than complete aggregates, so no trustworthy global tool-error count was established. Later discussion found that the consolidation did not consistently distinguish mechanism failures, tool-use failures, command/application outcomes, interpretation failures, normal subagent lifecycle events, and isolated incidents.
- **Verified recurring mechanism:** Custom subagent native-path confinement produced repeated `Native path is outside the assigned workspace` errors across independent sessions. It was removed under APR-024; focused tests passed, while live post-reload behavior remained unverified at review closeout.
- **Other remediated mechanism:** `log_analytics` hit custom deadline and memory controls during exhaustive work and its renderer crashed on partial streaming arguments. Limits were revised and the renderer received regression coverage under APR-026.
- **Rejected recurring claims:** Missing terminal synthesis, unmatched calls, and several subagent lifecycle examples were promoted without sufficient cross-session evidence. Direct follow-up on eight terminal-status examples found six explicit final answers, one normal child waiting for its parent, and one genuine missing final response. The isolated event does not establish recurrence.
- **Status:** Original report retained as historical evidence but its broad tool/subagent issue framing is superseded by APR-027, AIF-043, and the current classification skill. A new deterministic aggregation is required before claiming additional recurring mechanisms.
