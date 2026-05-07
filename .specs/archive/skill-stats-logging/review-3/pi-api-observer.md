# Pi API Observer Review

## Finding 1 — High — `before_agent_start.systemPromptOptions.skills` logs available/injected skills, not proven skill usage

**Evidence:** Plan T4 says to “observe loaded skills in `before_agent_start` using `event.systemPromptOptions.skills`, then persist one safe custom entry per loaded skill.” Pi types define `BeforeAgentStartEvent.systemPromptOptions: BuildSystemPromptOptions`; `Skill` objects include `name`, `description`, `filePath`, `baseDir`, `sourceInfo`, and `disableModelInvocation`. This hook exposes the skills used to build the system prompt, but the plan does not prove that each listed skill was explicitly invoked or actually used by the model.

**Required fix:** Treat these events as `source: "prompt_skill_inventory"` or similar unless correlated with explicit `/skill:<name>` input/expanded prompt evidence. Do not include inventory events in default “usage” rankings as if they were invoked skills.

## Finding 2 — High — Explicit slash-command skill loads are not separately captured before expansion

**Evidence:** Research notes say `input` fires before skill/template expansion and can see raw `/skill:name`, while `before_agent_start.prompt` is “after expansion.” The plan relies on `before_agent_start` for forward logging and only “optionally” mentions `input` in research notes, so explicit `/skill:<name>` intent can be lost or conflated with auto/default skill prompt inventory.

**Required fix:** Add an `input` hook or equivalent pre-expansion capture for explicit `/skill:<name>` commands, then correlate it to the following `before_agent_start` event. Emit distinct sources such as `explicit_slash_command` vs `auto_prompt_inventory`.

## Finding 3 — Medium — Duplicate logging across turns will inflate counts

**Evidence:** Plan T4 emits one event per `event.systemPromptOptions.skills` during every `before_agent_start`. Existing repo comments in `transcript-provider.ts` distinguish `turn_start` from `before_agent_start`, and Pi types document `before_agent_start` as fired after user submits prompt but before the agent loop. If the same default/auto skills are included on each user turn, the plan records repeated “skill-load” entries even when no new explicit skill action occurred.

**Required fix:** Define turn/session de-duplication for forward logs before aggregation: include a stable `turnId`/entry id when available, and count inventory events separately from invocation events. For usage totals, count at most one explicit load per `{session, turn, skill, source}` and exclude repeated prompt inventory from usage rankings.

## Finding 4 — High — Structured entry schema uses `content`, but `appendEntry` persists `data`

**Evidence:** Plan T2 requires `customType: "skill-load"`, `content.schemaVersion: 1`, and `content` fields. Pi API types define `appendEntry<T>(customType, data?)`, and session types define `CustomEntry<T>` as `type: "custom"`, `customType`, `data?: T`. `content` belongs to `custom_message`, not `custom` entries.

**Required fix:** Change schema/parser contract to `type: "custom"`, `customType: "skill-load"`, `data: { schemaVersion: 1, ... }`. Ensure parser prioritizes `data`, not `content`, for appendEntry records.

## Finding 5 — Medium — `customType` naming is inconsistent across plan evidence

**Evidence:** Main plan/schema says `pi.appendEntry("skill-load", data)`, but research artifacts recommend `"skill-load-event"` and `"skill-load-log"` in different places. A scanner keyed to one name will silently miss events written under another.

**Required fix:** Standardize one discriminator before implementation, preferably `customType: "skill-load"`, and update all research-derived handoff notes/tests to reject or explicitly migrate older experimental names.
