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

## TCA-003 - Visible subagents rejected after Herdr caller identity mismatch

- **Review date:** 2026-09-15.
- **Profiles and interval:** default; exact originating session `01a09d86-a834-7524-8ab1-6127ce9a1bd9`, records from 2026-09-15T14:35:36Z through 14:36:17Z. Initial discovery searched default-profile records in `[2026-09-15T00:00:00-04:00, 2026-09-16T00:00:00-04:00)`.
- **Method and coverage:** Complete bounded literal search selected 698 files and examined 124,597 records / 525,205,772 bytes, with no malformed, oversized, excluded, or timestamp-gap records. One active-session append beyond the captured horizon was outside the scan. Exact follow-up recovered both launches and their settlement records. Current implementation and a live read-only Herdr pane check were inspected. Legacy was not selected.
- **Finding:** The visible strategist launch failed before any turn after about 4.2 seconds, and the visible researcher retry failed before any turn after 86 ms. Both reported `Herdr target identity changed`, remained in transport `starting`, and exited without creating or owning a child pane. The researcher model did not run and produced no research. Cleanup completed with no owned process, pane, or launcher work applicable.
- **Classification:** Subagent mechanism failure in visible-surface startup. `VisibleChild.start` validates the caller pane through `inspectPane`; that guard throws only when Herdr's `pane get <HERDR_PANE_ID>` response contains a different `pane_id`. The repeated result establishes a persistent caller-context mismatch in this session, not a model, prompt, WSO2, or researcher failure. A stale inherited `HERDR_PANE_ID` after a Herdr identity change is plausible but not proved because the historical raw response and pane topology were not recorded.
- **Recovery and status:** The parent accurately disclosed the eventual researcher failure, but its earlier statement that research had been dispatched preceded asynchronous settlement. No research was completed. A current `herdr_pane read` succeeds in a different session, so this review does not establish a system-wide or currently active Herdr failure. No code remediation was made.

## TCA-004 - Inform reply included a task ID

- **Review date:** 2026-09-15.
- **Profiles and interval:** default; exact session `01a0a6d7-eaca-742d-9013-0a6d6481c862`, records around 2026-09-16T00:46:33Z through 00:47:22Z. Discovery searched default-profile records in `[2026-09-15T00:00:00-04:00, 2026-09-16T00:00:00-04:00)`.
- **Method and coverage:** Complete bounded literal search selected 719 files and examined 143,681 records / 569,152,804 bytes, with no malformed, oversized, excluded, or timestamp-gap records. Exact follow-up recovered the inbound ask, failed call, corrected retry, successful result, and final interpretation. Legacy was not selected.
- **Finding:** The orchestrator replied to an inbound ask with `type: "inform"` while also passing `task_id`. The unified tool contract explicitly rejects `task_id` and `timeout_ms` for inform messages. The supplied task ID also differed from the inbound message's task ID. Validation rejected the call locally before publication.
- **Classification:** Tool-use failure. `onclave_message` honored its contract and accurately rejected an invalid parameter combination; this was not a transport, broker, or tool mechanism defect.
- **Recovery and status:** Nineteen seconds later the orchestrator retried the same inform without `task_id`; publication to the intended full instance ID succeeded. No message was lost from the corrected reply, and no runtime remediation was made.
