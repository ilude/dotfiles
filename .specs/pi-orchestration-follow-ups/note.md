---
status: active
---

# Pi orchestration follow-ups

Follow-up work identified while refining Pi orchestration, prompt size, and subagent behavior.

## Status

2. **Open - Replace the mutation blocklist with capability metadata**

   New mutating tools could bypass `fable.ts` until manually added. Tools should declare capabilities such as `read`, `execute`, `mutate-files`, `mutate-git`, or `external-write`; orchestration policy can then enforce categories.

3. **Open - Fix agents-context accumulation**

   Nested `AGENTS.md` content is persisted through hidden messages. `pi/prompt-routing/AGENTS.md` alone is 376 lines. Inject relevant instructions ephemerally and move historical detail into referenced docs.

5. **Complete - Make agent frontmatter truthful**

   `tools`, `model`, `effort`, and `skills` now map to launcher arguments. Unenforced `domain`, `expertise`, and `maxTurns` fields were removed; assigned path scope is explicitly labeled as prompt guidance rather than a sandbox.

6. **Complete - Reduce child skill exposure**

   Subagents launch with `--no-skills` and only validated agent-specific `--skill` paths. Missing configured skills fail explicitly instead of falling back to the broad catalog.

7. **Open - Shorten workflow prompts**

   `/plan-it`, `/review-it`, and `/do-it` repeat global safety, planning, validation, and reporting rules. Convert each into a short state machine with one output contract.

8. **Complete - Remove overlapping or no-op tools**

   The unified `task` tool now owns planning, dependencies, lifecycle updates, background execution, cancellation, and bounded output. The separate `todo` and model-facing `task_*` tools were retired; `/tasks` remains the operator UI, and legacy `.pi/todo.json` state imports idempotently into the durable registry.

9. **Open - Add orchestration telemetry**

   Record parent model, worker models, fan-out, inline versus artifact bytes, tokens, latency, and cost. Use the data to determine whether delegation saves Fable/Opus API spend and Sol context.

10. **Open - Run a live smoke test after `/reload`**

    Automated coverage is strong, but actual provider dispatch has not been exercised. Use one harmless read-only task under Sol, Fable, and Opus and verify that all children route through `openai-codex/gpt-5.6-*`.
