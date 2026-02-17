# ToolResult Duality — Design Pattern Reference

**Status:** Deferred to post-MVP. Document for future implementation if needed.

**Source:** PicoClaw (the only reference project implementing this pattern)

---

## What It Is

A tool result architecture that separates what the LLM sees from what the user sees. Instead of every tool returning a single string result, tools return a structured object with optional audience-specific overrides.

**Core concept:** Different consumers (LLM, user, UI, async handlers) may need different representations of the same operation result.

---

## Why It Matters

Some tool outputs are noisy for users but essential for the LLM:
- **File reads** — User doesn't need to see every `read_file` call; LLM needs the content to understand context
- **Directory listings** — LLM might process 100+ paths; user wants a formatted summary
- **Web search results** — LLM needs raw JSON/links to reason; user wants a formatted preview
- **Memory searches** — Internal retrieval shouldn't clutter the conversation; LLM needs full scores/metadata

Some operations need different representations:
- **Async operations** — Tool returns immediately ("Task started"), result delivered later via callback
- **Silent operations** — Background indexing/caching should not appear in the conversation transcript at all

---

## PicoClaw's Implementation

Four result types:

```typescript
interface ToolResult {
  content: string;           // Default: sent to both LLM and user
  forUser?: string;          // Optional: override what user sees
  silent?: boolean;          // Optional: suppress user output entirely
  async?: boolean;           // Optional: result will be delivered later
}
```

**Semantics:**
- `content` — What the LLM sees. Always present.
- `forUser` — What the user sees. If omitted, user sees `content`. If set, user sees this instead (may differ in format, detail level, or truncation).
- `silent: true` — Suppress user-facing output entirely. LLM still sees `content`. Useful for background operations.
- `async: true` — Tool returns immediately with an acknowledgment. Actual result delivered later (e.g., via callback or separate message). Useful for long-running operations.

**Example usage:**

```typescript
// read_file: User doesn't need to see it, LLM does
read_file("/path/to/file") → {
  content: "full file contents for LLM analysis",
  silent: true
}

// web_search: LLM gets raw results, user gets formatted summary
web_search("climate change") → {
  content: "[{url, title, snippet, relevance_score}, ...]",  // for LLM
  forUser: "Top results:\n1. [link](url) - snippet\n2. ..."  // for user
}

// spawn_subagent: Returns acknowledgment immediately, notifies later
spawn_subagent("task") → {
  content: "Subagent started with ID xyz",
  async: true
}
// Later, callback delivers actual result

// memory_search: Purely internal, no UI output
memory_search("recent tasks") → {
  content: "[{id, score, text}, ...]",
  silent: true
}

// Standard tool: Same thing to everyone
ask_user("confirm?") → {
  content: "User input: yes"
  // No overrides; user sees this, LLM sees this
}
```

---

## Use Case Matrix

| Tool | LLM sees | User sees | Silent | Async |
|------|----------|-----------|--------|-------|
| `read_file` | Full content | Nothing | Yes | — |
| `write_file` | Confirmation | "Written X bytes" | — | — |
| `exec` | Full output + exit code | Truncated output (first 500 chars) | — | — |
| `web_search` | Raw JSON (urls, snippets, scores) | Formatted markdown (links + previews) | — | — |
| `spawn_subagent` | "Subagent started" | "Subagent started" | — | Yes |
| `memory_search` | Full results (scores, text) | Nothing | Yes | — |
| `index_file` | Success message | Nothing | Yes | — |
| `ask_user` | User's response | User's response | — | — |

---

## Trade-Offs

**Advantages:**
- Reduces token waste by not sending noisy operations to the user
- Allows different formatting for different consumers (raw for LLM, pretty for user)
- Enables async feedback ("task started") without blocking on completion
- Aligns with transparency goals (user doesn't see every internal operation)

**Disadvantages:**
- Adds interface complexity to every tool definition (requires careful documentation)
- May conflict with full-transparency goals if some users want to see everything
- Web UI may want to show all tool results anyway for debugging/audit purposes
- Requires coordination: if `silent: true` is set but user *expects* feedback, confusion results
- Potential for over-silencing — developers might suppress useful information by default

---

## When to Add

**Not in MVP.** Reasons:
1. The core system needs to be functional first. We'll quickly discover which tools actually benefit from this separation based on real usage patterns.
2. May not be necessary at all — if transcript volume is manageable, silencing isn't critical.
3. Adds one more knob to tune. MVP should minimize knobs.

**Add in Phase 2 if:**
- Transcripts grow too large due to read_file/memory_search clutter
- Users report token waste from noisy operations
- Multi-turn conversations hit context limits frequently
- Web UI needs cleaner conversation displays (hiding internal operations)

**Defer the full pattern if:**
- Simple truncation of long results (first 500 chars for user) solves the problem
- Silencing can be achieved with a per-tool `visible: false` flag (simpler interface)

---

## Simple Alternative (Simpler MVP Path)

If ToolResult duality feels too complex, consider a simpler approach:

```typescript
interface ToolResult {
  content: string;      // Sent to LLM
  userContent?: string; // Optional user override (truncated, formatted version)
}
```

Benefits:
- Still allows user/LLM separation
- No `silent` or `async` — adds complexity for rare cases
- Defaults to "show everything to user" unless tool explicitly sets `userContent`
- Easy to extend later

This covers ~80% of the use cases without the full complexity.

---

## Implementation Notes

If we do add this post-MVP:
1. **Update tool interface** — Every tool definition gets optional `forUser`, `silent`, `async` fields
2. **Audit all tools** — Go through each tool and decide if it needs overrides
3. **Test transcript impact** — Measure before/after token usage and context growth
4. **Document per-tool** — Add to tool docstrings explaining the strategy
5. **UI handling** — Web UI may need separate "show all operations" debug mode if we use `silent: true`
6. **Logging** — Ensure we can still audit what happened (silent operations should be logged, just not shown to user)

---

## Reference

- **PicoClaw's implementation:** Separates LLM context from user messages using these overrides
- **Why only PicoClaw?** Other projects keep the same result everywhere. May indicate either: (a) they don't have transcript bloat issues, or (b) they decided the complexity wasn't worth it
- **Revisit trigger:** When Phase 1 MVP is deployed and we see actual usage patterns, reevaluate based on measured token waste and user feedback
