---
status: active
---

# Pi orchestration follow-ups

Follow-up work identified while refining Pi orchestration, prompt size, and subagent behavior.

## Status

1. **Open - Hide blocked tools from orchestrator parents**

   Blocked tools still consume prompt/schema context and appear callable. Apply a model-specific active-tool profile and restore the previous profile on model switch.

2. **Open - Replace the mutation blocklist with capability metadata**

   New mutating tools could bypass `fable.ts` until manually added. Tools should declare capabilities such as `read`, `execute`, `mutate-files`, `mutate-git`, or `external-write`; orchestration policy can then enforce categories.

3. **Open - Fix agents-context accumulation**

   Nested `AGENTS.md` content is persisted through hidden messages. `pi/prompt-routing/AGENTS.md` alone is 376 lines. Inject relevant instructions ephemerally and move historical detail into referenced docs.

4. **Completed - Trim always-loaded instructions**

   Moved frontmatter and explanatory architecture material out of `pi/PI-INSTRUCTIONS.md`, corrected the owning reference documentation, and reduced root `AGENTS.md` to repository invariants and pointers.

5. **Open - Make agent frontmatter truthful**

   `domain`, `skills`, `expertise`, `effort`, and `maxTurns` are partly or wholly advisory. Either enforce them or remove claims that imply enforcement, especially path permissions and reasoning effort.

6. **Open - Reduce child skill exposure**

   Subagents currently receive the broad skill catalog. Parse agent-specific skills and launch children with `--no-skills` plus only relevant explicit skills, reducing initial context.

7. **Open - Shorten workflow prompts**

   `/plan-it`, `/review-it`, and `/do-it` repeat global safety, planning, validation, and reporting rules. Convert each into a short state machine with one output contract.

8. **Open - Remove overlapping or no-op tools**

   `task_execute`, `task_stop`, and `task_output` are deferred no-ops. `todo` and durable `task_*` tools overlap. Expose one task surface per workflow.

9. **Open - Add orchestration telemetry**

   Record parent model, worker models, fan-out, inline versus artifact bytes, tokens, latency, and cost. Use the data to determine whether delegation saves Fable/Opus API spend and Sol context.

10. **Open - Run a live smoke test after `/reload`**

    Automated coverage is strong, but actual provider dispatch has not been exercised. Use one harmless read-only task under Sol, Fable, and Opus and verify that all children route through `openai-codex/gpt-5.6-*`.
