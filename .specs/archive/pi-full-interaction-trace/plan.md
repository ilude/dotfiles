---
created: 2026-04-24
status: completed
completed: 2026-04-25
---

# Plan: Pi Full Interaction Trace

## Context & Motivation

The goal is to add a complete, auditable interaction trace for Pi sessions that captures more than the existing saved conversation. During this conversation, we confirmed that Pi already stores session history as JSONL files under `~/.pi/agent/sessions/` and that those files already contain a tree of user, assistant, tool-result, bash-execution, model-change, and visible thinking content blocks. We also confirmed that this repo already archives a session conversation log on shutdown in `pi/extensions/session-hooks.ts`, and that multi-team agent exchange logs use append-only JSONL via `log_exchange` in `pi/extensions/agent-chain.ts`.

What is still missing is a sidecar trace of runtime behavior: exact provider request payloads before they are sent, all tool parameters, tool outputs as Pi received them, truncation metadata, route/model changes, prompt-router classifier decisions, and higher-level orchestration events such as subagent runs. The user explicitly wants parameters and output of tooling calls as well as all LLM interactions. The scope boundary is now explicit: capture visible/model-exposed reasoning artifacts and tool-call plans, but do not attempt to capture hidden chain-of-thought that providers do not expose or should not be persisted.

We also verified that Pi's extension API already exposes the right hooks to implement this repo-locally: `before_provider_request`, `after_provider_response`, `message_start` / `message_update` / `message_end`, `tool_call`, `tool_result`, `tool_execution_*`, `model_select`, `turn_*`, and `session_*`. The plan now uses those hooks to write an opt-in, append-only sidecar trace with explicit correlation IDs, rather than changing the primary session JSONL format.

## Constraints

- Platform: Windows
- Shell: bash (Git Bash/MSYS2-style bash tool in this session)
- Use Pi's existing extension hooks rather than modifying hidden provider internals unless a real hook gap is proven.
- Do not try to persist raw hidden chain-of-thought; only persist visible thinking blocks, model-returned tool-call requests, and other exposed metadata.
- Capture tool output at the tool runner boundary — i.e. exactly what Pi received, including truncation/full-output metadata — not every internal subprocess inside a custom tool unless that tool emits nested trace events on purpose.
- Preserve existing session JSONL behavior; avoid breaking `/tree`, compaction, or session replay semantics.
- Make transcript logging append-only and opt-in/configurable, with a default-off kill switch, explicit user consent, secret redaction for API keys, auth headers, tokens, cookies, and similar sensitive fields, and a documented purge path.
- Use explicit correlation keys for trace records: `session_id`, `message_id`, `turn_index`, `tool_call_id`, and `parent_trace_id` for nested subagents/spans.
- Store traces outside the repo and outside any synced project tree by default (for example under `~/.pi/agent/traces/`), with rotation/retention rules and graceful degradation if disk or permissions fail.
- Pi-specific tests in this repo run through Bun/Vitest (`pi/justfile`), while repo-wide Python validation exists separately via `pyproject.toml` and `Makefile`.

## Alternatives Considered

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| Extend the existing session JSONL format directly with extra custom messages | Single file per session; integrates with current session IDs and archival flow | Pollutes the primary session transcript, risks UI/context side effects, and makes large provider payloads/tool results awkward | Rejected: too coupled to Pi's user-facing session format |
| Add a sidecar trace JSONL keyed by session and message/tool correlation IDs and fed by extension hooks | Append-only, preserves current session format, captures provider/tool/runtime events without changing session replay semantics, easy to redact and rotate | Requires correlation between session file and trace file; adds a second artifact to manage | **Selected** |
| Wait for or require an upstream pi-coding-agent core patch before doing anything | Potentially universal and cleaner long-term | Blocks immediate progress even though the current extension API already exposes `before_provider_request`, `tool_call`, `tool_result`, `message_*`, and session hooks | Rejected: use repo-local hooks now; upstream refinements can follow later |
| Persist raw hidden reasoning if/when a provider exposes it | Maximum observability | Security/privacy risk, inconsistent provider support, and contradicts the safer scope recommendation from this conversation | Rejected: persist visible thinking only |

## Objective

Implement an opt-in, append-only sidecar transcript for Pi sessions that records all user-visible LLM interactions, prompt-router decisions, and tool interactions in JSONL form, correlated by session, message, turn, tool call, and subagent span, with secret redaction and explicit truncation metadata. When complete, an operator should be able to inspect the trace plus any referenced spill artifacts and reconstruct: the exact provider payload sent, the assistant message returned, tool-call requests, tool-call parameters, tool outputs as returned to Pi, raw classifier recommendations, applied route/model changes, and session/subagent lifecycle events — without altering the existing core session JSONL contract.

## Project Context

- **Language**: TypeScript extensions with Python helper scripts/tests in the surrounding repo
- **Test command**: `cd pi/tests && bun vitest run`
- **Lint command**: none detected — tasks must use `python pi/extensions/tsc-check.py` for TypeScript validation
- Default trace output path: `~/.pi/agent/traces/` (or equivalent per-user path outside the repo)
- Default logging mode: off until explicitly enabled by the user or package configuration

## Task Breakdown

| # | Task | Files | Type | Model | Agent | Depends On |
|---|------|-------|------|-------|-------|------------|
| T1 | Build sidecar trace schema, writer, redaction, settings, retention, purge command, and routing-decision contract | 5 | architecture | large | engineering-lead | — |
| T2 | Add transcript fixtures and validation harness for provider/tool/router event snapshots | 5 | feature | medium | qa-engineer | — |
| T3 | Wire transcript capture into provider, router, tool, session, and subagent hooks | 7 | architecture | large | backend-dev | V1 |
| V1 | Validate wave 1 | — | validation | large | validation-lead | T1, T2 |
| V2 | Validate wave 2 | — | validation | large | validation-lead | T3 |

## Execution Waves

### Wave 1 (parallel)

**T1: Build sidecar trace schema, writer, redaction, settings, retention, purge command, and routing-decision contract** [large] — engineering-lead
- Description: Define the sidecar event schema and implement the shared append-only logging utility that all later hooks will use. This includes choosing the trace location (default `~/.pi/agent/traces/<session-id>.jsonl` with optional spill artifacts for oversized payloads) and the event envelope fields: `schema_version: "1.0.0"` (first envelope field; parser MUST reject records with unknown major version and treat them as opaque), `session_id`, `turn_id`, `message_id`, `tool_call_id`, `trace_id`, `parent_trace_id`, `event_type`, `timestamp` (ISO wall clock), and `monotonic_ns` (BigInt secondary ordering key, stable across NTP corrections / VM resume). Where applicable, prefer OpenTelemetry GenAI semantic-convention attribute names (`gen_ai.system`, `gen_ai.request.model`, `gen_ai.usage.input_tokens`, `gen_ai.usage.output_tokens`) inside payload fields so a future OTel collector can ingest the trace verbatim.
  
  The runtime toggle lives in `~/.pi/agent/settings.json` under a top-level `transcript` key (`transcript.enabled: false` by default, plus `transcript.path`, `transcript.maxInlineBytes`, `transcript.retentionDays`, `transcript.maxFileBytes`). The repo-tracked `pi/settings.json` MUST NOT be modified to enable tracing; the loader reads from `~/.pi/agent/settings.json` only (per the same pattern as `pi/extensions/session-hooks.ts`).
  
  Implementation lives in a single `pi/lib/transcript.ts` module that exports the writer, redaction helpers, and schema types. The split into separate files can come later if any export grows past ~300 lines. The writer reuses `withFileMutationQueue` from `@mariozechner/pi-coding-agent` (already imported by `pi/extensions/agent-chain.ts`) for append-only safety rather than reinventing locking.
  
  Cloning strategy: prefer `JSON.parse(JSON.stringify(payload))` for forward serialization (lossy but safe for HTTP request bodies, which is what `BeforeProviderRequestEvent.payload` represents). Wrap in try/catch -- on serialization failure, write a diagnostic event `payload_unserializable` with the error class and skip the body. The logger MUST NOT throw on unserializable payloads.
  
  Redaction MUST cover three surfaces: (a) request and response headers from `before_provider_request` and `after_provider_response`, case-insensitive list `authorization`, `proxy-authorization`, `cookie`, `set-cookie`, `x-api-key`, `x-auth-token`, `x-amz-security-token`, `x-goog-api-key`, `x-anthropic-api-key`, `openai-organization`, plus any header name matching `/(api[-_]?key|token|secret|cred|auth)/i`; (b) field-name redaction on payload bodies for the same key patterns; (c) free-text scanning of tool outputs (`tool_result.content[*].text` and `tool_result.details` fields) for secret-shaped patterns including `AKIA[0-9A-Z]{16}`, `sk-[A-Za-z0-9]{20,}`, `sk-ant-[A-Za-z0-9-]{20,}`, `ghp_[A-Za-z0-9]{36}`, generic `[A-Za-z0-9_-]{40,}` after `Bearer ` or `api[_-]?key["']?\s*[:=]`, and JSON private-key blocks. Source objects MUST remain unchanged after redaction.
  
  Spill artifacts: stored alongside the trace JSONL as `<session-id>.spill/<event-id>-<field>.json.gz`. Spill content is the redacted JSON serialization of the field, gzipped. The main trace event references the spill via `{ "<field>": { "$spill": "./spill/<event-id>-<field>.json.gz", "sha256": "...", "bytes_uncompressed": 12345 } }`. Spill files are subject to the same redaction pass as inline events.
  
  File permissions: trace directory created with mode 0700; trace and spill files written with mode 0600 on Linux/WSL (Windows: rely on user-profile ACL, no chmod).
  
  Symlink defense: before writing, the writer resolves the trace path with `fs.realpath` and refuses to write if the resolved path is inside any directory matching common cloud-sync names (`OneDrive`, `Dropbox`, `iCloudDrive`, `Google Drive`). Failure logs a single warning and disables tracing for the session.
  
  Retention defaults: `transcript.retentionDays = 14`, `transcript.maxFileBytes = 64 * 1024 * 1024`. Rotation: when a session-scoped JSONL file exceeds `maxFileBytes`, the writer rolls to `<session-id>.<n>.jsonl`. Sweep: at `session_start`, delete trace+spill files older than `retentionDays`. Sweep is idempotent.
  
  Circuit breaker: if three consecutive writes fail with EACCES/ENOSPC, set an in-memory flag, emit one `transcript_disabled` event, and stop attempting writes for the rest of the session.
  
  The schema includes a dedicated `routing_decision` event contract that captures enough information to evaluate the prompt-router classifier later. The routing record includes the exact classified prompt or stable `prompt_hash` plus excerpt, raw classifier output, applied route after policy, rule fired, confidence, and any fallback/cap/hysteresis metadata. The implementation reuses the existing session ID and archive behavior from `pi/extensions/session-hooks.ts` rather than inventing a parallel identity model.
  
  A `transcript-purge` command is registered in `pi/extensions/transcript-purge.ts` via `pi.registerCommand("transcript-purge", ...)` that deletes all trace+spill files older than its argument (default: all). A `transcript:` recipe is added to `pi/justfile` matching the existing `route:`, `chain:`, `team:`, `full:`, `guard:` recipe stack so the manual verification flow is copy-pasteable.
- Files: `pi/lib/transcript.ts` (new, single module exporting writer/redaction/schema), `pi/extensions/transcript-purge.ts` (new, registers `transcript-purge` command), `pi/extensions/session-hooks.ts` (modified, reads runtime toggle from `~/.pi/agent/settings.json`), `pi/justfile` (modified, add `transcript:` recipe), `pi/tests/transcript-log.test.ts` (new)
- Acceptance Criteria:
  1. [ ] A shared logger can append deterministic JSONL events with required envelope fields and configurable output path.
     - Verify: `cd pi/tests && bun vitest run transcript-log.test.ts`
     - Pass: Tests show stable JSONL serialization with `schema_version: "1.0.0"` as the first envelope field, `session_id`, `turn_id`, `message_id` or `tool_call_id` when applicable, `event_type`, ISO `timestamp`, BigInt `monotonic_ns`, and no duplicate/overwritten lines. Schema parser rejects records with an unknown major version and treats them as opaque.
     - Fail: Missing required fields (especially `schema_version` or `monotonic_ns`), nondeterministic ordering, or overwritten files indicate the core logger is not safe to build on.
  2. [ ] Redaction removes common secrets before anything is written to disk and never mutates live hook payloads.
     - Verify: `cd pi/tests && bun vitest run transcript-log.test.ts`
     - Pass: Tests prove (a) header redaction is applied to BOTH request headers (`before_provider_request`) and response headers (`after_provider_response`) covering `authorization`, `proxy-authorization`, `cookie`, `set-cookie`, `x-api-key`, `x-auth-token`, `x-amz-security-token`, `x-goog-api-key`, `x-anthropic-api-key`, `openai-organization`, and any header matching `/(api[-_]?key|token|secret|cred|auth)/i`; (b) free-text content scanning masks AKIA keys, `sk-` and `sk-ant-` tokens, GitHub `ghp_` tokens, Bearer-prefixed values, and JSON private-key blocks within `tool_result.content[*].text` and `tool_result.details` (fixture must include a bash tool result that echoes a fake AKIA-style key and verify the persisted record has it masked); (c) cloning a payload with circular refs produces a `payload_unserializable` diagnostic record and does NOT throw; (d) source objects remain unchanged.
     - Fail: Any fixture leaks raw secret material, misses `set-cookie` or in-content tokens, mutates the original event object, or throws on unserializable payloads; stop and fix redaction before integration work.
  3. [ ] Enablement, storage, and retention behavior are explicit and safe.
     - Verify: `cd pi/tests && bun vitest run transcript-log.test.ts`
     - Pass: Tests show (a) loader reads `transcript.enabled` from `~/.pi/agent/settings.json` and NEVER from the repo path `pi/settings.json`; (b) tracing defaults off until explicitly enabled; (c) trace directory is created with mode 0700 and trace+spill files with mode 0600 on Linux/WSL (Windows skips chmod); (d) writer refuses to write when `fs.realpath` resolves into a directory containing `OneDrive`, `Dropbox`, `iCloudDrive`, or `Google Drive` segments and disables tracing for the session with one warning; (e) rotation triggers when a session JSONL file exceeds `maxFileBytes` (default 64 MiB), rolling to `<session-id>.<n>.jsonl`; (f) `session_start` sweep removes trace+spill files older than `retentionDays` (default 14) and is idempotent; (g) three consecutive write failures emit one `transcript_disabled` event and stop further writes for the session; (h) writer fails gracefully when disk/permissions are unavailable.
     - Fail: Logging silently writes into the repo, reads the wrong settings file, lacks correct mode bits, leaks files into cloud-sync directories, cannot be turned off, or crashes the session when the trace path is unavailable.
  4. [ ] The schema includes a first-class routing decision record and a registered purge command.
     - Verify: `cd pi/tests && bun vitest run transcript-log.test.ts`
     - Pass: Tests prove `routing_decision` records can store `prompt_hash`/excerpt, raw classifier recommendation, applied route, confidence, rule fired, and policy-adjustment metadata without ambiguity; the `transcript-purge` command is registered via `pi.registerCommand` and removes trace+spill files older than its argument (default: all).
     - Fail: Router-related data is only implied by later model changes, lacks enough fields to distinguish classifier error from policy override, or the `transcript-purge` command is missing/non-functional.

**T2: Add transcript fixtures and validation harness for provider/tool/router event snapshots** [medium] — qa-engineer
- Description: Create deterministic fixtures and helper assertions that model the event stream this plan expects to capture. The harness should cover current Pi session message types already documented in upstream docs (`assistant`, `toolResult`, `bashExecution`, visible `thinking` blocks) plus the new sidecar trace records for provider requests, tool-call inputs, truncation metadata, lifecycle events, routing decisions, multi-turn correlation, parallel tool execution, and subagent nesting. This task exists so the later integration work can be verified without relying only on manual interactive sessions.
- Files: `pi/tests/transcript-fixtures.test.ts` (new), `pi/tests/transcript-correlation.test.ts` (new), `pi/tests/helpers/transcript-fixtures.ts` (new), `pi/tests/vitest.config.ts`, `pi/README.md`
- Acceptance Criteria:
  1. [ ] Fixture tests encode the expected mapping from existing Pi session/message structures into sidecar trace events.
     - Verify: `cd pi/tests && bun vitest run transcript-fixtures.test.ts transcript-correlation.test.ts`
     - Pass: Tests cover provider request payloads, assistant message content with visible thinking/tool calls, tool results with `details`, bash truncation/full-output metadata, routing decisions with classifier-vs-applied-route fields, parallel completion ordering, and nested subagent correlation.
     - Fail: Snapshot drift, untyped fixtures, or missing coverage for core event families means wave 2 will not have a reliable guardrail.
  2. [ ] The repo documents the selected scope boundary and storage semantics.
     - Verify: `rg -n "sidecar trace|visible thinking|hidden chain-of-thought|spill|retention|default off" pi/README.md`
     - Pass: `pi/README.md` contains explicit wording on selected scope, the hidden-thinking exclusion, spill-file references, retention, and the default-off enablement model.
     - Fail: Missing scope docs means future implementers may re-open already settled design decisions.

### Wave 1 — Validation Gate

**V1: Validate wave 1** [large] — validation-lead
- Blocked by: T1, T2
- Checks:
  1. Run acceptance criteria for T1 and T2
  2. `cd pi/tests && bun vitest run` — all tests pass
  3. `python pi/extensions/tsc-check.py` — no new TypeScript validation errors
  4. Cross-task integration: fixture-generated events round-trip through the shared logger/redaction layer without special-case test-only translation code
  5. Confirm the logger does not mutate live hook payloads and respects default-off/retention behavior
  6. Confirm the runtime toggle is read from `~/.pi/agent/settings.json` and that `pi/settings.json` is unchanged in `git status`
  7. Confirm `transcript-purge` command is registered and removes files older than its argument
  8. Confirm symlink defense: a trace path resolving into a `OneDrive`/`Dropbox`/`iCloudDrive`/`Google Drive` segment disables tracing
- On failure: create a fix task, re-validate after fix

### Wave 2

**T3: Wire transcript capture into provider, router, tool, session, and subagent hooks** [large] — backend-dev
- Blocked by: V1
- Description: Implement the actual runtime capture using Pi extension hooks. Use `before_provider_request` for exact request payload logging (clone via `JSON.parse(JSON.stringify(...))` with try/catch fallback to a `payload_unserializable` diagnostic), `after_provider_response` for response status and redacted response headers (apply the header redaction list to BOTH request and response sides; `set-cookie`, `authorization`, OAuth-rotation tokens MUST NOT appear in persisted records), prompt-router instrumentation for classifier output and policy application, `tool_call` + `tool_result` + `tool_execution_*` for tool parameters/results/durations/errors, `model_select` for model changes, and `session_start` / `session_shutdown` for trace lifecycle.
  
  `message_update` events MUST NOT each produce a trace record. The transcript extension records ONE `assistant_message` event at `message_end` per turn with the final content, aggregated usage, and stop reason. `message_update` may emit at most one `assistant_streaming` heartbeat per N seconds (off by default) for liveness, never per token. This avoids exploding trace size by 1000x on long responses.
  
  Subagent correlation: parent-to-child trace propagation uses the W3C Trace Context env var `TRACEPARENT` (`00-<trace-id>-<span-id>-<flags>`) injected into `args.env` of the `child_process.spawn` call in `pi/extensions/subagent/index.ts`. The transcript extension on the child reads `TRACEPARENT` at `session_start` and writes the parent span ID into `parent_trace_id` on every event. Validation: integration test forks a subagent and asserts the child trace file contains `parent_trace_id` matching the parent's emitted span.
  
  Routing-decision capture: the sidecar `routing_decision` event MUST capture the same fields the existing `~/.dotfiles/pi/prompt-routing/logs/routing_log.jsonl` records (which is written by the Python `classify.py`), plus the new envelope fields. Decision: keep the existing log unchanged for now and have the TypeScript transcript extension hash-link by `prompt_hash` so the two logs can be joined post-hoc. Do not silently leave two un-correlated routing audit trails.
  
  Clone payloads before redaction/serialization so the logger never mutates live objects. Extend subagent/session-related extensions so nested agent work is represented as child events or correlated spans. Keep existing session files intact and write all new data to the sidecar trace, with spill-file references when an event exceeds the configured `transcript.maxInlineBytes`.
- Files: `pi/extensions/transcript-provider.ts` (new), `pi/extensions/transcript-tools.ts` (new), `pi/extensions/prompt-router.ts`, `pi/extensions/session-hooks.ts`, `pi/extensions/subagent/index.ts`, `pi/README.md`, `pi/tests/transcript-integration.test.ts` (new)
- Acceptance Criteria:
  1. [ ] Provider, router, and message hooks persist complete LLM interaction records without relying on hidden provider internals.
     - Verify: `cd pi/tests && bun vitest run transcript-integration.test.ts`
     - Pass: Integration tests prove a single prompt yields correlated `llm_request`, `routing_decision`, `assistant_message` (exactly ONE record per turn at `message_end`, NOT one per streaming token), tool-call metadata, usage, and stop-reason records in the sidecar trace with stable correlation IDs. Response headers in `llm_response` records have `set-cookie`, `authorization`, and other listed sensitive headers redacted. The `routing_decision` record's `prompt_hash` matches the corresponding entry in `~/.dotfiles/pi/prompt-routing/logs/routing_log.jsonl`.
     - Fail: Missing request payloads, missing router decisions, mismatched IDs, absent final assistant content, OR per-token-update spam (more than one `assistant_message` record per turn), OR sensitive response headers persisted unredacted means the LLM boundary is not fully covered.
  2. [ ] Tool lifecycle hooks persist exact tool parameters and returned output as Pi received them, including truncation/error metadata.
     - Verify: `cd pi/tests && bun vitest run transcript-integration.test.ts`
     - Pass: Tests cover `tool_call`, `tool_execution_start/end`, and `tool_result` records for built-in/local tools with parameters, output, error state, and truncation/full-output-path metadata, including out-of-order parallel completion.
     - Fail: Logged results omit input parameters, mutate returned content unexpectedly, or miss truncation flags/full-output references.
  3. [ ] Manual end-to-end run produces a usable sidecar trace for an interactive session.
     - Verify: `cd pi && just transcript` (recipe launches Pi with the transcript extensions; falls back to `pi --no-extensions -e ~/.dotfiles/pi/extensions/transcript-provider.ts -e ~/.dotfiles/pi/extensions/transcript-tools.ts -e ~/.dotfiles/pi/extensions/prompt-router.ts -e ~/.dotfiles/pi/extensions/session-hooks.ts`)
     - Pass: After a prompt that triggers at least one tool call and one router decision, the newest trace file under `~/.pi/agent/traces/` contains correlated session lifecycle, router, LLM, and tool events with redacted secrets and correct file mode 0600 on Linux/WSL; oversized payloads are represented by spill-file references (`<session-id>.spill/<event-id>-<field>.json.gz`) rather than silently truncated data loss; if a child subagent is invoked, the child trace file's `parent_trace_id` matches the parent's emitted span; running `transcript-purge` removes trace+spill files older than the supplied age.
     - Fail: No trace file, incomplete event families, missing classifier-policy data, raw secrets, world-readable mode bits on Linux, missing subagent correlation, or unexplained payload loss indicates runtime capture is not production-safe.

### Wave 2 — Validation Gate

**V2: Validate wave 2** [large] — validation-lead
- Blocked by: T3
- Checks:
  1. Run acceptance criteria for T3
  2. `cd pi/tests && bun vitest run` — all tests pass
  3. `python pi/extensions/tsc-check.py` — no new TypeScript validation errors
  4. Cross-task integration: trace files correlate provider requests, routing decisions, assistant outputs, tool calls/results, and session/subagent events under one session/turn model without breaking existing archived session JSONL behavior
  5. Confirm trace disable/cleanup behavior works when the per-user trace path is unavailable or turned off
  6. Confirm exactly ONE `assistant_message` record per turn (no per-token `message_update` spam in the trace)
  7. Confirm subagent correlation: forking a subagent produces a child trace whose `parent_trace_id` matches the parent's span (via `TRACEPARENT` env propagation)
  8. Confirm `routing_decision` records hash-link by `prompt_hash` to entries in `~/.dotfiles/pi/prompt-routing/logs/routing_log.jsonl`
  9. Confirm response headers from `after_provider_response` (especially `set-cookie`, `authorization`) are redacted in persisted records
  10. Confirm circuit breaker: simulate three consecutive write failures and verify a single `transcript_disabled` event is emitted and further writes are skipped
- On failure: create a fix task, re-validate after fix

## Dependency Graph

```text
Wave 1: T1, T2 (parallel) → V1
Wave 2: T3 → V2
```

## Success Criteria

A complete implementation should give operators a per-session sidecar trace that, together with any referenced spill artifacts, supplements but does not replace the normal session JSONL.

1. [ ] End-to-end trace reconstruction works for a session with at least one tool call.
   - Verify: `cd pi/tests && bun vitest run transcript-log.test.ts transcript-fixtures.test.ts transcript-integration.test.ts`
   - Pass: All targeted transcript tests pass and demonstrate correlation across session, provider, assistant, and tool events, including at least one multi-turn and one parallel-tool scenario.
2. [ ] User-facing outcome matches the requested scope.
   - Verify: `rg -n "schema_version|llm_request|routing_decision|tool_call|tool_result|visible thinking|redact|spill|retention|default off|parent_trace_id|monotonic_ns|transcript_disabled" ~/.pi/agent/traces/*.jsonl pi/README.md`
   - Pass: Trace files and docs show provider requests, routing decisions, tool parameters, tool outputs, visible thinking/tool-call artifacts, redaction behavior (including in-content tool-output redaction and response-header redaction), spill references, retention/default-off behavior, schema versioning, monotonic ordering, subagent `parent_trace_id` propagation via `TRACEPARENT`, and circuit-breaker `transcript_disabled` semantics, while hidden chain-of-thought is explicitly excluded.

## Handoff Notes

- Pi already persists core session history as JSONL under `~/.pi/agent/sessions/` and this repo already archives those files on shutdown via `pi/extensions/session-hooks.ts`; do not regress that behavior.
- The current Pi extension API is sufficient for this plan because it exposes `before_provider_request`, `after_provider_response`, `message_*`, `tool_call`, `tool_result`, `tool_execution_*`, `model_select`, `turn_*`, and `session_*` hooks.
- Use sidecar traces for the new high-fidelity event stream rather than stuffing large provider payloads into the primary session file.
- Treat raw hidden chain-of-thought as out of scope even if a future provider can expose it; only persist visible thinking blocks and model-emitted tool-call artifacts.
- If a custom tool performs multi-step internal subprocess work and the team later wants that detail too, add nested trace events inside that custom tool as a follow-up rather than bloating the base hook layer now.
- Correlation should be based on explicit IDs (`session_id`, `message_id`, `turn_id`, `tool_call_id`, `parent_trace_id`, `trace_id`) rather than on ordering alone. Use `monotonic_ns` (BigInt) as a secondary intra-session ordering key that survives wall-clock jumps.
- Prompt-router capture must log enough information to distinguish classifier quality from policy effects: raw classifier output, applied route, confidence, rule fired, and fallback/cap/hysteresis metadata. The sidecar `routing_decision` record hash-links by `prompt_hash` to the existing `~/.dotfiles/pi/prompt-routing/logs/routing_log.jsonl` (Python-side); both logs are kept and joined post-hoc rather than duplicated.
- The runtime toggle lives in `~/.pi/agent/settings.json` under a `transcript` key. NEVER add it to the repo-tracked `pi/settings.json` -- that would force-enable tracing for every dotfiles user.
- Subagent correlation uses W3C Trace Context (`TRACEPARENT` env var) injected into the spawned subagent process in `pi/extensions/subagent/index.ts`. Same effort as a bespoke `PI_PARENT_TRACE_ID`, but interoperable with any OTel-aware tooling.
- Schema is versioned (`schema_version: "1.0.0"`); parsers MUST reject unknown major versions and treat such records as opaque rather than crashing.
- Streaming discipline: ONE `assistant_message` record per turn at `message_end`, never per-token. `message_update` may emit at most one heartbeat per N seconds for liveness, off by default.
- Redaction is three-tiered: (1) headers on both `before_provider_request` and `after_provider_response`, (2) field-name redaction in payload bodies, (3) free-text scanning of `tool_result.content[*].text` and `tool_result.details` for secret-shaped patterns. The bash tool can echo `~/.pi/agent/auth.json` -- in-content scanning is required, not optional.
- Cloning uses `JSON.parse(JSON.stringify(...))` wrapped in try/catch; on serialization failure the writer emits `payload_unserializable` and never throws.
- Storage hardening: trace dir 0700 / files 0600 on Linux/WSL; `fs.realpath` defense against trace dirs symlinked into `OneDrive`/`Dropbox`/`iCloudDrive`/`Google Drive`; spill files are gzipped JSON at `<session-id>.spill/<event-id>-<field>.json.gz` with `sha256` and `bytes_uncompressed` in the inline reference; retention defaults `retentionDays = 14`, `maxFileBytes = 64 MiB`.
- Circuit breaker: three consecutive write failures (EACCES/ENOSPC) emit one `transcript_disabled` event and stop further writes for the session.
- Operational ergonomics: `pi/justfile` gets a `transcript:` recipe matching the existing `route:`/`chain:`/`team:`/`full:`/`guard:` stack; `transcript-purge` is registered via `pi.registerCommand` for the documented purge path.
- Where field names are visible to a future OTel collector, prefer GenAI semantic-convention attribute names (`gen_ai.system`, `gen_ai.request.model`, `gen_ai.usage.input_tokens`, `gen_ai.usage.output_tokens`) so the trace can be ingested verbatim later.
- The writer uses `withFileMutationQueue` from `@mariozechner/pi-coding-agent` (already imported by `pi/extensions/agent-chain.ts`) for append-only safety -- do not reinvent locking.
