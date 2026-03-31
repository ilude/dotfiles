# Active Listener Skill

Read the conversation history before every response. Never respond blind.

## When to Use

Always. Before every response, read the current session's conversation log:

```
.pi/multi-team/sessions/{SESSION_ID}/conversation.jsonl
```

## What to Extract

- What has already been decided (don't re-litigate)
- What other agents have already done (don't duplicate)
- What the user actually asked (not what you assumed)
- What your lead specifically assigned to you (not the whole problem)

## JSONL Schema

Each line is a JSON object:

```json
{"role": "user", "agent": null, "content": "...", "session_id": "...", "timestamp": "ISO8601"}
{"role": "assistant", "agent": "orchestrator", "content": "...", "session_id": "...", "timestamp": "ISO8601"}
{"role": "assistant", "agent": "backend-dev", "content": "...", "session_id": "...", "timestamp": "ISO8601"}
```

Fields: `role` (user/assistant), `agent` (null for user, agent name for assistants), `content`, `session_id`, `timestamp`.

## Anti-Patterns to Avoid

- Starting work without reading what came before
- Re-asking questions already answered in the log
- Duplicating work another agent already completed
- Ignoring constraints your lead established earlier in the conversation
