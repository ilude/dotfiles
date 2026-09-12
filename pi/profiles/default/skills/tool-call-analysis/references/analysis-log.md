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

## TCA-002 - Strategist resolved to OpenRouter Solar

- **Review date:** 2026-09-12.
- **Profiles and interval:** default; exact session `01a09676-4a94-7182-a6b2-1b99e2eb1270`, records around 2026-09-12T17:25:24Z through 17:26:27Z.
- **Method and coverage:** Exact literal search and bounded follow-up recovered the subagent call, launch result, cancellation, and surrounding interpretation. Current default-profile model definition, resolver, shortcut, documentation, and tests were inspected. No legacy sessions were selected.
- **Finding:** The orchestrator explicitly passed `model: "sol"`, overriding the strategist definition's `openai-codex/gpt-5.6-sol`. The subagent runtime sent the bare value through Pi's native model resolver, which selected authenticated `openrouter/upstage/solar-pro4`. The launch mechanism reported that canonical result accurately. `/sol` is a command shortcut, not a valid subagent model alias.
- **Classification:** Subagent-use failure caused by an incorrect bare model override. This is not evidence of provider fallback or a transport/model-resolution mechanism defect. The later explanation that the documented strategist alias unexpectedly resolved was inaccurate.
- **Recovery and status:** The operator interrupted the parent wait and the orchestrator cancelled the child before it returned advice. Current role configuration remains explicit; no runtime or instruction change is authorized by this review.
