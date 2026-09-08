# Bounded incident findings

2026-09-08, default-profile read-only session analytics. No transcript content exported.

- Origin session `01a0818c-e3ed-7513-b01d-1df64d202704`; failed child `5d09fdbb-6e74-4931-90bd-dd68b4b96168` launched 17:33:46.704Z and failed 17:49:35.527Z with `Invalid child RPC: Error: JSONL frame exceeds byte limit`.
- Candidate child journal `01a08215-4526-7060-8d4f-adea32267be1` in the exact damage-control-risk-alignment worktree was created 17:33:47.175Z and last written 17:49:35.519Z. Its final assistant message (stopReason stop) timestamp is 17:49:35.517Z, ten milliseconds before the failure. This timing strongly associates the journal with the failed child but the historical record did not retain sessionFile to prove identity directly.
- That journal has 233 message records; largest message JSON is 107,300 bytes; combined assistant/toolResult message JSON is 1,216,183 bytes, exceeding the existing 1,048,576-byte frame bound. These figures are metadata-only aggregate queries, not copied payloads.
- Installed Pi 0.85.0 agent-loop emits `agent_end` with `messages: newMessages`. RPC serializes native events using toJsonEvent; only message_update is compacted, so agent_end retains its aggregate messages. agent_settled follows separately.
- Conclusion: aggregate agent_end is a strongly evidenced failure mechanism and should be reproduced with synthetic non-sensitive message arrays. The exact raw original RPC frame was not captured, so do not claim direct observation of its event type. Bounds must remain explicit, and final-result truncation is independent of transport handling.

Costs/limits: exact-origin query scanned 690,141 bytes; exact child journal queries scanned 1,242,283 bytes each; discovery restricted to default profile and exact cwd. Live file staging is not a snapshot. No legacy scan, model-internal cause claim, or process action.

## Synthetic reproduction

Using installed native toJsonEvent and existing JsonLines on main: an agent_end with 24 synthetic toolResult messages of 50,000 ASCII characters serializes to 1,201,474 bytes. Existing reader throws `JSONL frame exceeds byte limit` before delivering any event, preventing the following agent_settled from being observed. No model, credentials, real message payloads or production processes were involved.

## Review seam
The original runtime.deliver ignored parentId records. The implementation now returns one bounded pending outcome through the existing authenticated heartbeat/application poll, delivers it as a custom follow-up to the coordinator model when idle, and acknowledges it after message_end. Activity remains separate. Coordinator settlement waits for outstanding descendants/outcomes; cancellation/failure forwards remaining outcomes explicitly to the originating orchestrator. User-only prompts bypass coordinator factual answering and go to the originating user. Runtime/native-RPC fixtures and child-extension delivery tests cover these paths.

## Focus feedback and remaining limit

The operator reported focus theft while viewing another Herdr tab/space during this task. No more live production panes were created after that report. The existing visible launch passes --no-focus and contains no restore-focus call. Relevant installed Herdr version and running server both report 0.8.2-preview.2026-08-31-b1ff4582e968. Exact-revision upstream plugin split implementation switches workspace/tab only for focus=true or zoomed placement; this runtime uses split, not zoomed.

`PI_HERDR_FOCUS_LIVE=1 pnpm test herdr-background-focus.test.ts` passed against an isolated server, inert plugin process, and temporary config/registry. It checks caller-targeted pane get/layout preflight, no-focus plugin creation, and exact cleanup while another workspace and then another tab is focused. Focus queries deliberately remove inherited caller IDs to read global focus rather than merely the caller pane. The first test attempt exposed this query-targeting mistake in the fixture, not a product focus change; the corrected checks pass.

This is server-side state evidence, not an attached physical client's experience. The reported live jump remains unreproduced and is not claimed fixed. No speculative restore-focus command, production registry relink, Herdr update/restart, or unrelated process termination was performed. To distinguish the remaining paths, establish whether the live jump lands on the calling parent's tab, the new child's pane, or another location, and correlate its time with the exact creating instance.
