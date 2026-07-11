---
status: active
---

# Pi orchestration follow-ups

Follow-up work identified while refining Pi orchestration, prompt size, and subagent behavior.

## Status

2. **Open - Replace the mutation blocklist with capability metadata**

   New mutating tools could bypass `fable.ts` until manually added. Tools should declare capabilities such as `read`, `execute`, `mutate-files`, `mutate-git`, or `external-write`; orchestration policy can then enforce categories.

3. **Complete - Fix agents-context accumulation**

   Base global and root-to-cwd instructions remain in the per-request system prompt. Target-specific instructions are injected through Pi's non-persistent `context` hook, historical hidden reports are filtered, target scopes replace instead of accumulate, and mutations wait until the applicable scope has reached a model request. Focused tests cover persistence, scope replacement, retries, and cwd changes. `pi/prompt-routing/AGENTS.md` was reduced from 376 to 93 lines, with experiment history and production governance moved into referenced classifier docs.

5. **Complete - Make agent frontmatter truthful**

   `tools`, `model`, `effort`, and `skills` now map to launcher arguments. Unenforced `domain`, `expertise`, and `maxTurns` fields were removed; assigned path scope is explicitly labeled as prompt guidance rather than a sandbox.

6. **Complete - Reduce child skill exposure**

   Subagents launch with `--no-skills` and only validated agent-specific `--skill` paths. Missing configured skills fail explicitly instead of falling back to the broad catalog.

7. **Complete - Shorten workflow prompts**

   `/plan-it` (271 -> 103 lines), `/do-it` (341 -> 144), and `/review-it` (576 -> 317) are now state-machine prompts with one output contract each. Templates own plan/report/synthesis structure, `pi/tests/workflow-prompts.test.ts` guards load-bearing phrases, and global policy restatements were removed with per-file deletion ledgers under `.tmp/prompt-compression/`.

8. **Complete - Remove overlapping or no-op tools**

   The unified `task` tool now owns planning, dependencies, lifecycle updates, background execution, cancellation, and bounded output. The separate `todo` and model-facing `task_*` tools were retired; `/tasks` remains the operator UI, and legacy `.pi/todo.json` state imports idempotently into the durable registry.

9. **Complete - Add orchestration telemetry**

   `orchestration_run` and `orchestration_interaction` events now record parent and worker models, fan-out, inline and artifact bytes, normalized token usage, latency, status, and known or unavailable cost. `/orchestration-stats [days]` reports bounded observational summaries and workflow-friction correlation. An isolated cross-platform smoke runner verifies a real delegated interaction and exact run-to-interaction joins. Causal savings claims remain deferred until matched cohort data exists.

10. **Open - Run a live smoke test after `/reload`**

    Automated coverage is strong, but actual provider dispatch has not been exercised. Use one harmless read-only task under Sol, Fable, and Opus and verify that all children route through `openai-codex/gpt-5.6-*`.
