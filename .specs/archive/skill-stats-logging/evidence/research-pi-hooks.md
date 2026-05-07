## Concise findings

- **Authoritative Pi extension docs: strong fit**
  - URL: `https://raw.githubusercontent.com/badlogic/pi-mono/main/packages/coding-agent/docs/extensions.md`
  - Key clues:
    - Extensions can be placed outside `node_modules` in `~/.pi/agent/extensions/` or `.pi/extensions/`, auto-discovered, and hot-reloaded with `/reload`.
    - `resources_discover` can contribute `skillPaths`.
    - `input` fires before skill/template expansion and can see raw `/skill:name`.
    - `before_agent_start` fires after expansion and exposes `event.systemPromptOptions.skills` — likely the best authoritative hook for observing what skills Pi loaded into prompt context.
    - `pi.appendEntry(customType, data)` persists extension state in the session and does **not** enter LLM context.
    - `pi.sendMessage()` can inject visible/custom messages into the session.
  - Confidence: **High**

- **Session format docs: durable custom entries**
  - URL: `https://raw.githubusercontent.com/badlogic/pi-mono/main/packages/coding-agent/docs/session-format.md`
  - Key clues:
    - `CustomEntry` has `type: "custom"` and is explicitly for extension state persistence; it does **not** participate in LLM context.
    - `CustomMessageEntry` has `type: "custom_message"` and can participate in LLM context/display.
    - This supports recording skill-load events durably in session JSONL via `pi.appendEntry("skill-load-event", {...})`.
  - Confidence: **High**

- **Local repo examples confirm patterns already in use**
  - Paths:
    - `pi/extensions/pi-instructions.ts`: uses `before_agent_start` to append system prompt.
    - `pi/extensions/00-echo-slash-commands.ts`: wraps `registerCommand`, uses `sendMessage`, `registerMessageRenderer`.
    - `pi/extensions/context.ts`: reads `ctx.sessionManager`, handles custom messages, filters context via `pi.on("context")`.
    - `pi/extensions/commit-guard.ts`: intercepts tool calls via `pi.on("tool_call")`.
    - `pi/README.md`: source-vs-runtime policy says commit curated `pi/extensions/`, but not generated `pi/sessions/`, `pi/history/`, logs, caches, `node_modules/`.
  - Confidence: **High**

## Recommendation

Implement a repo-owned Pi extension under `pi/extensions/` that records skill-load events during `before_agent_start` by inspecting `event.systemPromptOptions.skills`, then persists them with `pi.appendEntry("skill-load-event", data)`. For manual `/skill:name` intent, optionally also observe `input` before expansion.