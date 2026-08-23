---
created: 2026-08-23
status: complete
completed: 2026-08-23
---

# Pi Extension Cache Optimization

## Objective

Change the current Pi extensions so semantically unchanged goal, task, and path-instruction context no longer rewrites the Codex `instructions` field, preserve a stable top-level tool prefix wherever existing authority rules permit, and expose cache-read/write results in `/usage` so extension changes can be evaluated. This plan supersedes the completed measurement-only plan at `.specs/archive/codex-prompt-cache-telemetry/plan.md`; its mocked usage response did not establish that the extensions had no cache problem and is not a gate for this work.

## Completion Evidence

- Evidence: Captured `openai-codex` request fixtures show identical `instructions`, stable `prompt_cache_key`, and an unchanged immediate-tool prefix across consecutive turns when goal/task/instruction semantics do not change; changed runtime context appears as a bounded trailing custom message rather than rewriting `instructions`; intentional workflow/tool transitions are identifiable cache boundaries; provider-reported cache reads/writes and request-shape transitions appear in `/usage`; goal, task, instruction, feature-memory, tool authority, compaction, and session lifecycle tests pass; the Pi extension skill contains the verified cache-friendly rules.
- Fails when: Goal/task/path context still changes `instructions` during ordinary turns, stale runtime context reaches the model after state changes, context is duplicated on every turn, cache optimization exposes a state-gated or unauthorized tool, tool order changes without a semantic toolset change, cache metrics cannot be joined to the request shape that produced them, missing usage is reported as zero, or the implementation stops after adding measurement tests without changing extension behavior.

## Boundaries

- Work from current `main` after `de4b0752`; retain `pi/tests/prompt-cache-measurement.test.ts` as adapter evidence but do not treat its fabricated usage values as observed cache performance.
- The installed Codex adapter already sends `prompt_cache_key` from the Pi session ID. Preserve and regression-test that mechanism rather than inventing another cache-key layer.
- Extension-local stabilization does not depend on explicit OpenAI breakpoints or a live cache experiment. Unsupported provider controls must not block goal, task, instruction, tool-order, or telemetry fixes.
- Preserve the meaning and authority of goal, task, nested instruction, feature-memory, workflow, review, plan, commit, and delegation controls. Dynamic context may move from the system prompt to a hidden custom context message only when the same current information remains present for the model.
- Preserve state-gated tool invisibility where it is an authority or workflow invariant. Cache misses at real state transitions are acceptable and must be recorded; do not keep unauthorized tools visible merely to stabilize a request.
- Use the existing append-only metrics JSONL and existing `/usage` owner. Do not create a second logger, cache command, generalized provider framework, randomized cohort system, quota experiment lifecycle, or retention mechanism.
- Limit provider-specific behavior to `openai-codex` in this change. Provider-neutral field names are allowed, but no second provider implementation is in scope.
- Do not modify generated sessions, histories, traces, metrics, caches, snapshots, installed `node_modules`, or module repositories.

## Tasks

- [x] **T1: Move dynamic extension context out of Codex instructions**
  - Files: `pi/lib/runtime-context.ts`; `pi/extensions/goal.ts`; `pi/extensions/tasks.ts`; `pi/extensions/agents-context.ts`; focused tests in `pi/tests/runtime-context.test.ts`, `pi/tests/goal.test.ts`, `pi/tests/task-tools.test.ts`, `pi/tests/tasks.test.ts`, `pi/tests/agents-context.test.ts`, and `pi/tests/prompt-cache-measurement.test.ts` or a renamed replacement if the old name becomes misleading.
  - Change: Extend the existing runtime-context helper with one deterministic operation that removes the prior hidden custom message for an owning context type and appends exactly one current bounded replacement at the end of the active model context. Convert goal and task reminders from `before_agent_start` system-prompt mutation to hidden custom context messages. Reuse the same replacement rule for nested AGENTS context instead of maintaining a separate timestamp-bearing replacement shape. Keep the base system prompt, native context files, and static model instructions unchanged. Recompute content only from semantic goal/task/instruction state; do not include wall-clock time, delivery counters, random IDs, or process-local values. Reinject current context after resume, fork, reload, cwd/instruction invalidation, and compaction without accumulating duplicate copies. A state change must replace the prior effective context and explicitly supersede stale content. Preserve the existing feature-memory one-time custom-message behavior and verify that it composes with the new replacement contexts.
  - Done when: Consecutive captured Codex requests with unchanged goal/task/instruction state have byte-identical `instructions` and exactly one current custom message per active context type; changing each context changes only its trailing custom message; clearing/completing a goal or task removes its effective message; compaction/resume restores current context once; nested instruction deferral still blocks and retries the same mutation boundary; no reminder or instruction content is lost.
  - Verify: Run `cd pi && pnpm test runtime-context.test.ts goal.test.ts task-tools.test.ts tasks.test.ts agents-context.test.ts feature-memory.test.ts active-turn-compaction.test.ts prompt-cache-measurement.test.ts`, then `cd pi && pnpm run typecheck` before expanding into T2.
  - Result: Goal, task, and AGENTS runtime context now uses one replaceable hidden custom message per type; the focused 100-test set and TypeScript check passed, followed by a focused task-hook repair check with 42 passing tests and TypeScript.

- [x] **T2: Stabilize tool serialization and record real cache boundaries**
  - Dependencies: T1
  - Files: `pi/lib/tool-activation.ts`; `pi/extensions/tool-search.ts`; `pi/extensions/tool-visibility.ts`; `pi/extensions/feature-memory.ts`; `pi/extensions/commit.ts`; `pi/extensions/review-artifact.ts`; goal/task/workflow tool owners only where tests demonstrate an unnecessary toolset transition; `pi/extensions/session-configuration-fingerprint.ts` or one narrowly owned request-metrics extension; `pi/extensions/transcript-provider.ts` only if the existing normalized usage event is the correct join point; focused tool, workflow, transcript, and prompt-cache tests.
  - Change: Prove the actual selected `openai-codex` model metadata and adapter behavior for Pi's existing deferred-tool path: the extension wrapper derives `addedToolNames` from tools activated during `tool_search`, and the adapter may serialize those definitions as transcript-local additional/deferred tools. When that installed path is supported, keep `tool_search` activations out of the top-level immediate-tool prefix; when it is unsupported, preserve current activation rather than inventing another dispatcher. Keep deterministic registration order for immediate tools and emit no `setActiveTools` call when the effective ordered set is unchanged. Inspect only activation owners demonstrated by focused fixtures to cause a redundant transition; retain every authority/state-gated visibility change and remove only no-op or duplicate transitions. Do not alter state-gated semantics to obtain a cache hit. At the last extension-observable request boundary, retain the current `instructions` hash and ordered immediate-tool hash for the active turn. At `message_end`, append one bounded `prompt_cache_request` metric using the existing session/turn/message identity with model, whether context or immediate tools changed since the previous request, and normalized input/cache-read/cache-write usage or an explicit unavailable outcome. Do not add a generalized tracing, retry, concurrency, or multi-provider correlation layer.
  - Done when: Repeated requests with no semantic tool transition retain identical ordered immediate tools; a `tool_search` activation uses the installed wrapper/adapter deferred representation when the current Codex model supports it, or preserves existing activation when it does not; state-gated tools remain absent and non-invocable before activation; redundant activation calls do not change the serialized toolset; two-turn and post-tool-result fixtures emit one bounded metric per completed request without raw prompts or tool schemas; missing usage remains unavailable.
  - Verify: Run `cd pi && pnpm test tool-visibility.test.ts tool-search.test.ts commit-extension.test.ts review-artifact.test.ts workflow-dispatch.test.ts subagent.test.ts transcript-integration.test.ts session-configuration-fingerprint.test.ts prompt-cache-measurement.test.ts prompt-cache-metrics.test.ts`; run `cd pi && pnpm run typecheck`.
  - Result: The installed wrapper/deferred-tool path is fixture-proven, ordered tool fingerprints preserve provider order, and completed Codex responses emit bounded prompt/cache metrics including dynamic-context and tool boundaries. The 144-test T2 suite and TypeScript passed; a follow-up identity/context check passed 5 tests and TypeScript.

- [x] **T3: Report cache effectiveness and preserve extension design guidance**
  - Dependencies: T1, T2
  - Files: `pi/extensions/codex-status.ts` as `/usage` owner; a shared bounded metrics reader only if needed; `pi/extensions/usage.ts` only when its existing log parser must preserve cache-write data; `pi/tests/codex-status.test.ts`, `pi/tests/usage.test.ts`, and the T2 request-metrics test; `pi/skills/pi-extension/SKILL.md`; `pi/skills/pi-extension/references/tooling-contracts.md`; a focused cache-friendly extension contract under `pi/skills/pi-extension/references/contracts/`; existing observability, instruction-context, tool-discovery, goal, task, or compaction contracts only when their accepted behavior changed.
  - Change: Extend `/usage` with a bounded local cache section for `openai-codex` by reading the T2 `prompt_cache_request` metrics directly. Report requests with usage, requests with unavailable usage, input tokens, cache-read tokens, cache-write tokens, cache-read share using the installed adapter's proven token semantics, and counts split into stable, context-change, and immediate-tool-change requests for a short recent window. Group by model only when more than one model is present. Deduplicate by the metric event ID and existing session/message identity; do not rescan or join raw transcripts, create an analytics database, or merge Codex CLI history or account-wide quota percentages into request-attributed cache results. Preserve the current live quota and Bedrock sections. Update the Pi extension skill to require stable system instructions, trailing replaceable semantic context, deterministic tool order, deferred discoverability when the provider supports it, explicit authority-transition exceptions, request-to-usage cache metrics, and compaction checks. Index one focused contract and state OpenAI/Codex-specific facts separately from provider-neutral rules.
  - Done when: Fixture-backed `/usage` output distinguishes stable requests from context/tool boundaries, reports cache reads/writes and unavailable coverage without zero-filling, preserves existing quota/Bedrock output, and does not claim subscription-limit causality; the skill and indexed contract direct future extension work to the implemented cache-friendly patterns and contain no unsupported cross-provider claim.
  - Verify: Run `cd pi && pnpm test codex-status.test.ts usage.test.ts prompt-cache-metrics.test.ts`; run `cd pi && pnpm run typecheck`; invoke the report against bounded fixtures and inspect stable, context-change, tool-change, cache-write, and unavailable cases; reread the complete skill and linked contract once against the implemented behavior.
  - Result: `/usage` now reads bounded `prompt_cache_request` metrics and reports complete/unavailable coverage, uncached input, cache reads/writes, cache-read share of all processed input, and stable/context/tool boundaries while preserving quota and Bedrock output. The 21-test T3 suite and TypeScript passed; the skill and indexed caching contract were inspected against implementation.

## Validation

- [x] Captured Codex fixtures prove stable `instructions`, session cache key, dynamic-context replacement, and deterministic immediate tools across unchanged turns.
- [x] Goal, task, nested instruction, feature-memory, workflow, delegation, and compaction behavior remains executable after context placement changes.
- [x] Request-shape metrics join provider-reported cache usage and preserve unavailable states.
- [x] `/usage` reports observed local cache behavior without attributing account quota changes to individual requests.
- [x] The Pi extension skill and cache contract describe the implemented behavior and exceptions.

## Retention

Keep this canonical plan at `.specs/pi-extension-cache-optimization/plan.md` while any task is incomplete. After all tasks and validation pass, `/do-it` archives the complete directory to `.specs/archive/pi-extension-cache-optimization/`. The prior archived measurement plan remains historical evidence and is not reopened.

## Execution Status

- State: complete
- Result: T1-T3 and all validation checks passed; the plan is ready for canonical archive.
- Resume: `/do-it .specs/pi-extension-cache-optimization/plan.md`
