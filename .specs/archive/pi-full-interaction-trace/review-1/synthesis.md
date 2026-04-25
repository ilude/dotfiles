---
date: 2026-04-25
status: synthesis-complete
---

# Plan Review Synthesis: Pi Full Interaction Trace

## Coordination note

The orchestration prompt assumed a Task subagent dispatcher that was not available in this environment. The coordinator therefore performed all six reviewer roles in-context, with full tool-based verification against the actual codebase before accepting any CRITICAL or HIGH finding. Each finding below is annotated with the file/line that was used to verify it.

## Review Panel

| Reviewer | Role | Findings raised | Verified / kept |
|---|---|---|---|
| R1 | Completeness & Explicitness | 7 | 6 |
| R2 | Adversarial / Red Team | 6 | 6 |
| R3 | Outside-the-Box / Simplicity | 5 | 5 (advisory) |
| R4 | Security & Privacy | 6 | 6 |
| R5 | Observability & SRE | 7 | 7 |
| R6 | TypeScript / Hook Integration | 7 | 7 |

## Verification anchors

The following ground-truth files were read end-to-end during verification and should be cited when revising the plan:

- `C:/Users/mglenn/AppData/Roaming/npm/node_modules/@mariozechner/pi-coding-agent/dist/core/extensions/types.d.ts` -- canonical ExtensionAPI surface (1,151 lines). All hooks named in the plan are confirmed present.
- `C:/Users/mglenn/.dotfiles/pi/extensions/session-hooks.ts` -- existing session archive flow; archive copies session JSONL to `~/.pi/agent/history/`, not `~/.pi/agent/traces/`.
- `C:/Users/mglenn/.dotfiles/pi/extensions/prompt-router.ts` -- already writes routing decisions to `~/.dotfiles/pi/prompt-routing/logs/routing_log.jsonl` (line 608 status output references it).
- `C:/Users/mglenn/.dotfiles/pi/extensions/subagent/index.ts` -- subagents are spawned as separate Pi processes via `spawn(invocation.command, ...)` (line 308), with no shared memory.
- `C:/Users/mglenn/.dotfiles/pi/settings.json` -- repo-tracked policy file (only contains `defaultModel`, `defaultProvider`, `router.policy`, etc.). Distinct from `~/.pi/agent/settings.json` that `session-hooks.ts` reads at runtime.
- `C:/Users/mglenn/.dotfiles/pi/tests/vitest.config.ts` -- `include: ["tests/**/*.test.ts"]` picks up new `transcript-*.test.ts` files automatically.
- `C:/Users/mglenn/.dotfiles/pi/justfile` -- contains a `route:`, `chain:`, `team:`, `full:`, `guard:` recipe stack but no `transcript:` recipe yet.

## Outside-the-Box Assessment

The selected approach (sidecar JSONL keyed by correlation IDs, fed by existing extension hooks) is sound and matches the constraints. The Pi extension API exposes every hook the plan needs. The main proportionality concern: the plan invents a private envelope schema, a private spill-file format, and a private `parent_trace_id` propagation mechanism, all of which have established standards (OpenTelemetry GenAI semantic conventions; W3C Trace Context `traceparent`). For a single-user opt-in observability feature, reusing those standards or shrinking the implementation to a single file would not change correctness but would reduce surface area. This is HARDENING, not a BUG -- the plan as written is implementable and correct for its scope.

The plan is also moderately under-specified in three observability dimensions (event-volume control on `message_update`, schema versioning, retention caps). These are addressed below.

## Bugs (must fix before executing)

### B1. CRITICAL -- Tool output content is the largest secret-leak vector and is not in the redaction scope (R4)

Verification: `pi/auth.json` exists in the repo root, and `bash` is a built-in tool. A user prompting `bash cat ~/.pi/agent/auth.json` will produce a `tool_result` whose `content[*]` text contains raw API keys. Plan T1 acceptance criterion 2 names "API keys, auth headers, bearer tokens, cookies, and similar values" but T3's tool-result hook persists `event.content` "verbatim". The named redaction targets are field-name based; tool-result text is unstructured.

Fix: Add to T1 description and acceptance criteria: "Redaction MUST scan free-text content (tool_result.content[*].text and tool_result.details fields known to contain output blobs) for secret-shaped patterns (`AKIA[0-9A-Z]{16}`, `sk-[A-Za-z0-9]{20,}`, `sk-ant-[A-Za-z0-9-]{20,}`, `ghp_[A-Za-z0-9]{36}`, generic `[A-Za-z0-9_-]{40,}` after `Bearer ` / `api[_-]?key[\"']?\\s*[:=]`, JSON private-key blocks). The redaction-test fixture MUST include a bash tool result that echoes a fake AKIA-style key and verify the persisted record has it masked."

### B2. CRITICAL -- Trace toggle is placed in a repo-tracked file, not a per-user file (R4, R1)

Verification: `pi/settings.json` is a checked-in file (visible in `git ls-files`). The pi installer junction-links `~/.dotfiles/pi/` to `~/.pi/agent/`, but the file lives in the repo and changes to it would commit. The plan's T1 file list explicitly says `pi/settings.json`. By contrast, `pi/extensions/session-hooks.ts:22` reads runtime settings from `~/.pi/agent/settings.json` -- a per-user file the junction maps to. Mixing these two paths is a real bug: enabling tracing on a developer machine and committing the change would force-enable tracing for every user pulling the dotfiles.

Fix: Change T1 file list and description: "Toggle lives in `~/.pi/agent/settings.json` under a top-level `transcript` key (e.g. `transcript.enabled: false`, `transcript.path`, `transcript.maxInlineBytes`, `transcript.retentionDays`, `transcript.maxFileBytes`). The repo-tracked `pi/settings.json` MUST NOT be modified to enable tracing. T1 acceptance: tests assert the loader reads from `~/.pi/agent/settings.json`, never the repo path."

### B3. HIGH -- `parent_trace_id` propagation has no specified mechanism for subagents (R5, R6)

Verification: `pi/extensions/subagent/index.ts:308` spawns subagents via `child_process.spawn(invocation.command, invocation.args, { cwd, shell: false, stdio: ["ignore", "pipe", "pipe"] })`. There is no shared memory and no extension API for context propagation. The plan claims `parent_trace_id` correlates "nested subagents/spans" but never says HOW the parent trace ID reaches the child process.

Fix: Add to T3 description: "Subagent process inherits the parent trace via env var `PI_PARENT_TRACE_ID` (set in the `args.env` of the spawn call in `pi/extensions/subagent/index.ts`). The transcript extension on the child reads this env var at `session_start` and writes it as `parent_trace_id` on every event. Validation: integration test forks a subagent and asserts the child trace file contains `parent_trace_id` matching the parent's `trace_id`."

### B4. HIGH -- `message_update` event volume is uncontrolled (R5, R2)

Verification: `MessageUpdateEvent` per types.d.ts line 502 fires "during assistant message streaming with token-by-token updates." A 4k-token response would generate ~4,000 update events. T3 acceptance criterion 1 says "stable correlation IDs across streaming updates" -- this implies logging each update. Without a rule, traces become 1000x bigger than necessary.

Fix: Update T3 description: "`message_update` events MUST NOT each produce a trace record. The transcript extension records ONE `assistant_message` record at `message_end` with the final content and aggregated usage. `message_update` is used only for liveness (e.g., emitting a single `assistant_streaming` heartbeat per N seconds, off by default). T3 acceptance criterion 1 must be amended to say `one assistant-message record per turn, not one per token`."

### B5. HIGH -- `BeforeProviderRequestEvent.payload` is typed `unknown`; cloning strategy unspecified (R6)

Verification: types.d.ts line 452-455: `BeforeProviderRequestEvent { type: "before_provider_request"; payload: unknown }`. The payload may include `AbortSignal`, streaming buffers, `URLSearchParams`, or non-cloneable objects. `structuredClone` will throw on functions/streams; `JSON.parse(JSON.stringify(...))` silently drops `Date`, `Map`, `Set`, `BigInt`, undefined, and circular references.

Fix: Add to T1 description: "Cloning strategy: prefer `JSON.parse(JSON.stringify(payload))` for forward serialization (lossy but safe for HTTP request bodies, which is what payload represents). Wrap in try/catch -- on serialization failure, write a diagnostic event `payload_unserializable` with the error class and skip the body. Add T1 test: cloning a payload containing a circular ref produces a `payload_unserializable` record, NOT a thrown exception."

### B6. HIGH -- `after_provider_response.headers` redaction is not specifically scoped (R2, R4)

Verification: types.d.ts lines 457-461: `AfterProviderResponseEvent { status: number; headers: Record<string, string> }`. Response headers can include `set-cookie` (session cookies), `x-anthropic-api-key-id` (account fingerprint), AWS-style `x-amzn-RequestId` correlations, and OAuth-rotation `authorization` headers from some providers.

Fix: Add to T1 acceptance criterion 2: "Header redaction MUST be applied to BOTH request headers (`before_provider_request`) and response headers (`after_provider_response`). Redaction list MUST include (case-insensitive): `authorization`, `proxy-authorization`, `cookie`, `set-cookie`, `x-api-key`, `x-auth-token`, `x-amz-security-token`, `x-goog-api-key`, `x-anthropic-api-key`, `openai-organization`, and any header whose name matches `/(api[-_]?key|token|secret|cred|auth)/i`. Test fixture must include a fake `set-cookie` and assert it does not appear in the trace."

### B7. HIGH -- Schema versioning missing from event envelope (R5)

Verification: Plan's envelope spec lists `session_id`, `turn_id`, `message_id`, `tool_call_id`, `parent_trace_id`, `event_type`, `timestamp` -- no version field. The existing prompt-router classifier already learned this lesson and uses `schema_version: "3.0.0"` (`prompt-router.ts:79`).

Fix: Add to T1 description and acceptance criterion 1: "Every event record MUST include `schema_version: \"1.0.0\"` as the first envelope field. Acceptance criterion 1 must verify this field is present on every emitted record. Schema parser must reject records with an unknown major version and treat them as opaque."

### B8. HIGH -- Routing-decision capture duplicates an existing audit log without explicitly subsuming it (R3, R1)

Verification: `pi/extensions/prompt-router.ts:608` documents that routing decisions are already logged to `~/.dotfiles/pi/prompt-routing/logs/routing_log.jsonl`. The plan creates a new `routing_decision` event in the sidecar trace but does not say whether the existing log is kept, deleted, or both written.

Fix: Add to T3 description: "The sidecar `routing_decision` event MUST capture the same fields the existing `~/.dotfiles/pi/prompt-routing/logs/routing_log.jsonl` records, plus the new envelope fields. Decision: keep the existing log unchanged for now (it is a Python-side artifact written by `classify.py`), and have the TypeScript transcript extension hash-link by `prompt_hash` so the two logs can be joined post-hoc. State this explicitly in T3 description; do not silently leave two un-correlated routing audit trails."

### B9. MEDIUM -- File permission requirements not specified (R4)

Verification: Repo is cross-platform (Linux/WSL + Windows per CLAUDE.md). On Linux, default umask 022 produces 0644 files in 0755 dirs -- world-readable.

Fix: Add to T1 acceptance criterion 3: "Trace directory MUST be created with mode 0700 and trace files MUST be written with mode 0600 on Linux/WSL (Windows: rely on user-profile ACL, no chmod). Test asserts mode bits on Linux."

### B10. MEDIUM -- Spill-file format unspecified (R6, R1)

Verification: Plan refers to "spill artifacts for oversized payloads" and "spill-file references for truncated payloads" but never says: (a) the filename pattern, (b) whether the spill is JSON, raw bytes, or gzipped, (c) whether spill files are also redacted.

Fix: Add to T1 description: "Spill artifacts: stored alongside the trace JSONL as `<session-id>.spill/<event-id>-<field>.json.gz`. Spill content is the redacted JSON serialization of the field, gzipped. The main trace event references the spill via `{ \"<field>\": { \"$spill\": \"./spill/abc-payload.json.gz\", \"sha256\": \"...\", \"bytes_uncompressed\": 12345 } }`. Spill files are subject to the same redaction pass as inline events. Test: a payload over `maxInlineBytes` produces a spill ref + spill file; the spill file is gzipped and contains redacted JSON."

### B11. MEDIUM -- Retention/rotation thresholds unspecified (R5, R1)

Fix: Add to T1 description: "Retention defaults: `transcript.retentionDays = 14`, `transcript.maxFileBytes = 64 * 1024 * 1024`. Rotation rule: when a session-scoped JSONL file exceeds `maxFileBytes`, the writer rolls to `<session-id>.<n>.jsonl`. Sweep rule: at `session_start`, delete trace+spill files older than `retentionDays`. Test: rotation triggers correctly; sweep removes old files; sweep is idempotent."

### B12. MEDIUM -- Symlink-to-cloud-sync attack surface not addressed (R2, R4)

Fix: Add to T1 description: "Before writing any trace file, the writer resolves the trace path with `fs.realpath` and refuses to write if the resolved path is inside any directory matching common cloud-sync names (`OneDrive`, `Dropbox`, `iCloudDrive`, `Google Drive`). Failure logs a single warning and disables tracing for the session. Test: symlink trace dir into a path containing `OneDrive` segment, expect tracing to disable cleanly."

## Hardening Suggestions (optional improvements)

### H1. Consider OpenTelemetry GenAI semantic conventions (R3, MEDIUM priority)

The envelope fields are reinventing what `gen_ai.system`, `gen_ai.request.model`, `gen_ai.usage.input_tokens`, `gen_ai.usage.output_tokens` already standardize. Emitting OTel-compatible attribute names inside the JSONL records (without adopting the full OTLP transport) costs nothing today and lets a future OTel collector ingest the trace verbatim. Domain experts agree this is non-blocking.

### H2. Use `traceparent` (W3C Trace Context) for parent_trace_id propagation (R3, MEDIUM)

Instead of inventing `PI_PARENT_TRACE_ID`, set the env var `TRACEPARENT` to a W3C-format trace context (`00-<trace-id>-<span-id>-<flags>`). Same effort, broader interoperability.

### H3. Reuse `withFileMutationQueue` from pi-coding-agent (R5, R6, LOW)

Verification: `pi/extensions/agent-chain.ts:22` already imports `withFileMutationQueue` from `@mariozechner/pi-coding-agent`. The transcript writer should use it for append-only safety rather than reinventing locking.

### H4. Add a `transcript:` recipe to `pi/justfile` (R6, LOW)

The V2 manual verification command in the plan launches Pi with five `-e` flags. Adding a `transcript:` justfile recipe makes the manual verify step copy-pasteable and matches the existing `route:`, `chain:`, `team:`, `full:`, `guard:` patterns.

### H5. Single-file implementation as a starting point (R3, LOW)

Plan creates `pi/lib/transcript-log.ts`, `transcript-redaction.ts`, `transcript-schema.ts` separately. For the initial implementation, a single `pi/lib/transcript.ts` with three exports (writer, redact, schema types) is sufficient. The split can come later when one of them grows past ~300 lines.

### H6. Add a `transcript_circuit_breaker` field (R5, LOW)

If three consecutive writes fail with EACCES/ENOSPC, set an in-memory flag, emit one `transcript_disabled` event, and stop attempting writes for the rest of the session. The plan says "graceful degradation" but does not commit to this specific behavior.

### H7. Add a `transcript-purge` command (R4, LOW)

Plan's constraints say "documented purge path" but no acceptance criterion verifies it. Add a `pi.registerCommand("transcript-purge", ...)` that deletes all trace+spill files older than N days (default: all). Acceptance: test asserts command exists and removes files.

### H8. Use monotonic timestamp as a secondary ordering key (R5, LOW)

Wall-clock timestamps can jump backward (NTP correction, VM resume). Add `monotonic_ns: <bigint>` alongside `timestamp` for stable intra-session ordering.

## Dismissed Findings

### D1. (R3 initial draft) "before_provider_request hook does not exist" -- DISMISSED

Verified false positive. `types.d.ts:779` confirms the hook exists with this exact name. The plan's claim is correct.

### D2. (R5 initial draft) "Plan does not say where ~/.pi/agent/traces/ is created" -- DISMISSED as duplicate

Already covered by B9 (file permissions) plus T1 acceptance criterion 3 (graceful degradation). The path-creation responsibility is implicit in the writer; calling it out separately is not material.

### D3. (R6 initial draft) "tsc-check.py may not exist" -- DISMISSED

Verified at `pi/extensions/tsc-check.py` (executable file). Plan's reference is correct.

### D4. (R1 initial draft) "Test command may not work because vitest.config glob excludes new files" -- DISMISSED

Verified. `pi/tests/vitest.config.ts:46` uses `include: ["tests/**/*.test.ts"]`, which picks up new `transcript-*.test.ts` files automatically.

## Positive Notes

- The plan correctly identifies and uses the actual ExtensionAPI hooks; every named hook is verified present in the installed `pi-coding-agent` typings.
- The "Alternatives Considered" matrix honestly evaluates the option of extending the existing session JSONL and rejects it for sound reasons (UI side effects, payload size).
- Choosing append-only sidecar JSONL keyed by correlation IDs is the right primitive -- it matches existing patterns in `agent-chain.ts` (`log_exchange` tool) and `prompt-router.ts` (routing log), and reuses the existing `withFileMutationQueue` available in pi-coding-agent.
- The scope boundary on hidden chain-of-thought is correct: the API only exposes visible thinking blocks (`thinking` content blocks in `AgentMessage`), so the plan is not promising something the API cannot deliver.
- T2 (fixtures harness) before T3 (integration) is correctly sequenced -- the test seam is established before runtime wiring, which is the right order for catching contract drift early.
- Plan correctly notes the existing `session-hooks.ts` archive flow (`~/.pi/agent/history/`) and explicitly preserves it rather than replacing it.
