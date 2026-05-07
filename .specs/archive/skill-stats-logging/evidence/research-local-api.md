## Findings

- **Yes: Pi has extension APIs for durable custom session data without editing `node_modules`.**
  - `@mariozechner/pi-coding-agent/dist/core/extensions/types.d.ts`
    - `ExtensionAPI.appendEntry(customType, data?)`
    - Docs: `docs/extensions.md` → `pi.appendEntry(customType, data?)`
    - Session type: `dist/core/session-manager.d.ts`
      - `CustomEntry<T>` with `type: "custom"`, `customType`, `data`
      - Explicitly “Does NOT participate in LLM context”
      - Restore via `ctx.sessionManager.getEntries()`

- **Yes: Pi exposes prompt/skill expansion state at runtime.**
  - `dist/core/extensions/types.d.ts`
    - `BeforeAgentStartEvent`
      - `prompt`: raw user prompt **after expansion**
      - `systemPrompt`: fully assembled system prompt
      - `systemPromptOptions: BuildSystemPromptOptions`
    - `BuildSystemPromptOptions.skills?: Skill[]`
  - `dist/core/system-prompt.d.ts`
    - `BuildSystemPromptOptions`
      - `contextFiles`
      - `skills`
      - `appendSystemPrompt`
      - `promptGuidelines`
  - `dist/core/skills.d.ts`
    - `Skill`
      - `name`
      - `description`
      - `filePath`
      - `baseDir`
      - `sourceInfo`
      - `disableModelInvocation`

- **Best mechanism for durable forward skill-load logging: enabled.**
  - Use `pi.on("before_agent_start", handler)` to inspect `event.systemPromptOptions.skills` and `event.systemPrompt`.
  - Use `pi.appendEntry("skill-load-log", {...})` to persist observations in the session JSONL without sending them to the model.
  - On reload/resume, reconstruct from `ctx.sessionManager.getEntries()`.

## Exact symbols/files

| Purpose | File | Symbol/API | Enables durable skill logging? |
|---|---|---|---|
| Extension lifecycle/events | `.../dist/core/extensions/types.d.ts` | `ExtensionAPI.on("before_agent_start", ...)` | Yes: observe expanded prompt + loaded skills |
| Prompt expansion details | `.../dist/core/extensions/types.d.ts` | `BeforeAgentStartEvent.systemPromptOptions` | Yes |
| Raw prompt after expansion | `.../dist/core/extensions/types.d.ts` | `BeforeAgentStartEvent.prompt` | Yes |
| Persist extension state | `.../dist/core/extensions/types.d.ts` | `ExtensionAPI.appendEntry(customType, data?)` | Yes |
| Stored custom entry shape | `.../dist/core/session-manager.d.ts` | `CustomEntry<T>` | Yes, durable and not in LLM context |
| Read past entries | `.../dist/core/session-manager.d.ts` | `ReadonlySessionManager.getEntries()` | Yes |
| Loaded skill schema | `.../dist/core/skills.d.ts` | `Skill`, `LoadSkillsResult`, `loadSkills()` | Yes |
| System prompt inputs | `.../dist/core/system-prompt.d.ts` | `BuildSystemPromptOptions.skills` | Yes |
| Resource discovery | `.../docs/extensions.md` | `resources_discover` returning `skillPaths`, `promptPaths` | Indirect: can observe/contribute resource paths |
| Runtime docs | `.../docs/extensions.md` | `before_agent_start`, `appendEntry`, `getCommands()` | Confirms intended usage |

## Repo-local relevant files

- `pi/extensions/skill-loader.ts`
  - Registers discovered `SKILL.md` files as slash commands at `session_start`.
  - Uses `discoverSkills()` and `pi.registerCommand()`.
  - Command handler calls `pi.sendUserMessage(renderSkillBody(...))`.
  - This is **slash-command skill loading**, separate from core system-prompt skill injection.

- `pi/lib/skill-discovery.ts`
  - Repo-local skill discovery for auto-registered slash commands.

- `pi/extensions/session-hooks.ts`
  - Shows `session_start` usage and session ID via `ctx.sessionManager.getSessionId()`.

- `pi/extensions/transcript-provider.ts`
  - Existing durable-ish observability pattern around provider/message lifecycle, but not specifically skill load logging.

## Conclusion

Durable forward skill-load logging is possible without editing `node_modules`:

```ts
pi.on("before_agent_start", (event, ctx) => {
  pi.appendEntry("skill-load-log", {
    prompt: event.prompt,
    skills: event.systemPromptOptions.skills?.map((s) => ({
      name: s.name,
      filePath: s.filePath,
      sourceInfo: s.sourceInfo,
    })),
  });
});
```

Use `appendEntry`, not `sendMessage`, if the log should persist but stay out of LLM context.