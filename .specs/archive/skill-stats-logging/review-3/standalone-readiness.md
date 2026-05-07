# Standalone Readiness Review

Result: **BLOCKED**

## Blockers

1. **blocker — Structured event schema is internally inconsistent.**
   - Conflict: `T2` still requires `customType: "skill-load"` with payload under `content.schemaVersion` / `content.*`, while `Review 3 Applied Amendments` says canonical Pi custom entries are `type: "custom"`, `customType: "skill-load"`, payload under `data`, not `content`.
   - Required fix: Update all executable schema/validation/parser wording in `T2`, `Validation Contract`, `Success Criteria`, and any command/evidence descriptions to use one canonical shape: Pi custom entry with `type: "custom"`, `customType: "skill-load"`, and safe payload under `data`.

2. **blocker — Forward-logging implementation path is contradictory and can produce misleading usage data.**
   - Conflict: Objective, Automation Plan, `G1`, and `T4` still instruct logging one event per skill from `before_agent_start` / `event.systemPromptOptions.skills`, but Review 3 says that field is only prompt skill inventory and explicit skill invocations must be instrumented in `pi/extensions/skill-loader.ts` or a proven pre-expansion input hook.
   - Required fix: Rewrite Objective, Automation Plan, `G1`, and `T4` so explicit skill-load logging uses the repo-owned skill command path or proven pre-expansion input hook. If prompt inventory is logged at all, label it `source: "prompt_skill_inventory"` and exclude it from default usage totals unless correlated with an explicit invocation.

3. **blocker — `G1` decision gate has stale required evidence and permits the wrong Wave 2 implementation.**
   - Conflict: `G1` requires recording `before_agent_start`, `event.systemPromptOptions.skills`, and `pi.appendEntry("skill-load", data)` as the identified APIs, then proceeding to Wave 2. That contradicts Review 3's requirement that `before_agent_start` is insufficient for explicit usage logging.
   - Required fix: Change `G1` to require evidence of either `pi/extensions/skill-loader.ts` instrumentation feasibility or a proven pre-expansion input hook before T4 proceeds. If only prompt inventory is available, require a user scope decision before implementation and prevent marking forward logging complete.
