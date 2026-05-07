## Concise findings for `/skill-stats`

### 1. Claude Code: hooks + JSONL/OTel are closest analogue

- **Docs:** https://code.claude.com/docs/en/hooks  
- **Monitoring:** https://code.claude.com/docs/en/monitoring-usage  
- **Feature request:** https://github.com/anthropics/claude-code/issues/35319

**Patterns to adapt:**

- Hook lifecycle has `PreToolUse`, `PostToolUse`, `UserPromptExpansion`, `SessionStart`, `SessionEnd`, etc.
- Hooks receive structured JSON on stdin / HTTP body, so usage can be recorded without modifying core runtime.
- Claude Code telemetry supports OpenTelemetry logs/metrics/traces.
- `OTEL_LOG_TOOL_DETAILS=1` includes tool parameters such as Bash commands, MCP tool names, **skill names**, and command names.
- The GitHub issue proposes a very relevant schema:

```json
{"timestamp":"2026-03-17T10:30:00Z","skill":"create-pr","trigger":"slash_command","project":"/path/to/repo"}
```

**Good `/skill-stats` pattern:**

- Append local JSONL event per skill/command/tool invocation.
- Aggregate by skill name, trigger, project, date range.
- Keep additive compatibility: both aggregate counters and per-event records.

---

### 2. OpenCode: plugin hooks expose command/tool events

- **Plugins docs:** https://opencode.ai/docs/plugins/

**Patterns to adapt:**

OpenCode plugins can subscribe to:

- `command.executed`
- `tool.execute.before`
- `tool.execute.after`
- `session.created`
- `session.updated`
- `session.deleted`

Plugins are JS/TS modules loaded globally or per-project:

```ts
export const UsagePlugin = async ({ project, client }) => {
  return {
    "tool.execute.after": async (input, output) => {
      // append event to local stats log
    },
    "command.executed": async (input) => {
      // count command invocation
    }
  }
}
```

**Good `/skill-stats` pattern:**

- Pi can mirror this with a first-class event bus or hook wrapper around skill/command/tool execution.
- Store normalized event types: `skill.invoked`, `command.executed`, `tool.executed`.

---

### 3. Codex CLI: OTel-based usage/tool telemetry

- **Advanced config:** https://developers.openai.com/codex/config-advanced  
- **Grafana integration:** https://grafana.com/docs/grafana-cloud/monitor-infrastructure/integrations/integration-reference/integration-openai-codex/

**Patterns to adapt:**

- Codex stores local state under `~/.codex`, including `history.jsonl`.
- Codex supports lifecycle hooks from `hooks.json` or config.
- Grafana docs describe Codex exporting metrics, logs, and traces through OpenTelemetry for:
  - CLI usage
  - API requests
  - tool invocations
  - performance metrics

**Good `/skill-stats` pattern:**

- Keep local JSONL as the source of truth.
- Optionally add later OTLP export so orgs can dashboard usage in Grafana/Datadog/etc.
- Use anonymized project/user IDs if exporting.

---

### 4. Aider: explicit local analytics log is a strong model

- **Analytics docs:** https://aider.chat/docs/more/analytics.html

**Patterns to adapt:**

Aider tracks:

- model usage
- token counts
- edit formats
- feature/command usage
- exceptions/errors

Important CLI pattern:

```bash
aider --analytics-log filename.jsonl --no-analytics
```

This allows local audit logging without sending telemetry.

**Good `/skill-stats` pattern:**

- Provide a local-only stats mode by default.
- Consider `pi --stats-log path.jsonl` or config equivalent.
- Make privacy explicit: no prompts, code, secrets, or tool content in stats events.

---

### 5. Continue: PostHog-style anonymous product analytics

- **Telemetry docs:** https://docs.continue.dev/customize/telemetry

**Patterns to adapt:**

Continue tracks:

- suggestion accept/reject
- model and command name
- token counts
- IDE/OS metadata
- pageviews

It uses PostHog and has opt-out settings/env vars.

**Good `/skill-stats` pattern:**

- If Pi ever adds remote/org analytics, make it opt-in.
- Track names/counts only, not prompt/code content.
- Separate local stats from remote telemetry.

---

## Recommended implementation shape for `/skill-stats`

Use a local append-only JSONL event log:

```json
{
  "timestamp": "2026-05-07T12:00:00Z",
  "event": "skill.invoked",
  "name": "code-review",
  "trigger": "auto_activation",
  "session_id": "abc123",
  "project": "C:/Users/mglenn/.dotfiles",
  "agent": "orchestrator"
}
```

Then `/skill-stats` aggregates:

- last 7/30/90 days
- top skills
- unused installed skills
- command/tool counts
- usage by project/session/agent
- trend deltas

Best adaptation: **Claude/OpenCode-style hooks for capture + Aider-style local JSONL audit log + optional Codex-style OTel export later.**