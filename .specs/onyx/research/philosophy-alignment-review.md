# Onyx PRD Philosophy Alignment Review

**Sections Reviewed**: D11 (Agent Runtime & ReAct Loop), D12 (Heartbeat System)
**Date**: 2026-02-16
**Reviewer**: Philosophy alignment against development-philosophy, analysis-workflow, planning skills

**Frameworks Applied**:
- Experiment-Driven Development (simplest solution first, iterate on evidence)
- Complexity Theater Test ("If I remove this, what specific problem occurs?")
- POLA (Principle of Least Astonishment)
- Verifiable Acceptance Criteria (objective, testable requirements)

---

## 1. Elements That Are Well-Grounded

These pass the philosophy tests. Keep them.

### D11: Agent Runtime

**ReAct Loop Core Cycle** (lines 909-965)
- Proven pattern from research (OpenClaw, nanobot, ClawRAG all use this)
- Testable: "Does it execute tool calls and return text?"
- Matches user expectations (POLA compliant)
- Evidence: Multiple working implementations exist

**Session Persistence in JSONL** (D5 reference)
- Simple, append-only, scales indefinitely
- Matches existing menos patterns (user's own codebase)
- Testable: "Does session file contain valid JSONL?"
- No premature optimization

**Provider Failover** (D4 reference, lines 1047-1077)
- Real problem: API providers go down
- Simple solution: try fallback, log which was used
- Testable: "Does it switch providers on HTTP 529?"
- Matches existing retry patterns in menos

### D12: Heartbeat System

**Cron Engine Framework** (lines 1236-1259)
- Real need: proactive checks require scheduling
- Simple: cron pattern is well-understood
- Testable: "Does job run at scheduled time?"
- Defers data gatherers to Phase 2 (good scope discipline)

**HEARTBEAT.md Workspace File** (lines 1298-1336)
- Files-first matches memory architecture (D1)
- User-editable, git-friendly, human-readable
- Testable: "Does agent read and apply instructions?"
- No magic config DSL, just markdown

**Agent Turn Reuse** (lines 1367-1377)
- DRY: reuses existing AgentRuntime, just swaps context
- Simple: no new execution engine
- Testable: Same runtime tests apply
- POLA: heartbeat is just another agent turn

---

## 2. Complexity Theater Flags

These fail the "if I remove this, what specific problem occurs?" test.

### D11: Token Budget Policy (lines 1130-1142)

**Problem**: Exact percentages (30%, 15%, 45%, 10%) specified before a single test exists.

**Complexity Theater Questions**:
1. Why 30% for system prompt instead of 25% or 35%?
2. What evidence suggests 15% is right for memory?
3. Why is 10% response headroom the magic number?

**Alternative**: Start with "fit what you can, trim oldest messages when full." Measure actual token usage over 100+ real conversations. Then, if optimization is needed, derive percentages from data.

**Experiment to prove complex version needed**:
```typescript
// Simple MVP version
function assembleContext(messages, systemPrompt, memory) {
  const budget = MODEL_MAX_TOKENS - RESPONSE_HEADROOM;
  let used = tokenCount(systemPrompt) + tokenCount(memory);
  const history = [];
  for (let i = messages.length - 1; i >= 0 && used < budget; i--) {
    const msgTokens = tokenCount(messages[i]);
    if (used + msgTokens > budget) break;
    history.unshift(messages[i]);
    used += msgTokens;
  }
  return { systemPrompt, memory, history };
}
```

Run this for MVP. Log when context is trimmed. If no user reports "I lost important context", the simple version works. If they do, measure which segment (system/memory/history) is the actual problem, then optimize that segment only.

**Recommendation**: Defer token budget percentages to Phase 2. MVP uses simple "fit what you can" approach with logging.

---

### D11: Context Assembly Budget Table (lines 1133-1142)

**Problem**: "Strategy when exceeded" for each segment prescribes implementation details without evidence any strategy is needed.

**Complexity Theater Questions**:
1. Why truncate skills "least-recently-used first" instead of alphabetically or randomly?
2. What evidence shows LRU is the right heuristic?
3. Why is "Tool call+result pairs are atomic" a hard requirement? What breaks if we split them?

**Cross-Reference with Source Analysis**: NanoClaw (31 lines in source-analysis-nanoclaw.md) has zero token budget logic. It relies on SDK session management. The SDK handles context window pressure, not application code.

**Alternative**: Let Claude Agent SDK manage context if using subscription providers. For API-key providers via Vercel AI SDK, start with "trim oldest messages first" and measure.

**Experiment**:
1. Build MVP with simple trimming (oldest first)
2. Add logging when context is trimmed
3. Review logs after 100+ conversations
4. If problems emerge, add segment-specific strategies based on real data

**Recommendation**: Remove per-segment strategies from MVP PRD. Add simple "trim oldest messages" logic with observability. Upgrade to segment-aware strategies only when data shows which segment is the bottleneck.

---

### D11: Runtime Configuration Object (lines 1143-1169)

**Problem**: 6 timeout values, 3 retry settings, 4 budget percentages — 13 knobs before first user conversation.

**Complexity Theater Questions**:
1. Why `maxTurns: 25`? Not 20 or 30?
2. Why `turnTimeoutMs: 120000`? (2 min per LLM call)
3. Why `toolTimeoutMs: 60000`? (1 min per tool)
4. Why `totalTimeoutMs: 600000`? (10 min total)
5. Why `memorySearchTopK: 10`? Not 5 or 15?

**Cross-Reference**: NanoClaw has `CONTAINER_TIMEOUT: 30min` and `IDLE_TIMEOUT`. That's 2 knobs, not 13.

**Alternative**: Start with 3 values:
- `maxTurns: 20` (OpenClaw default)
- `defaultTimeoutMs: 300000` (5 min, single timeout for everything)
- `memorySearchTopK: 5` (matches menos default)

**Experiment**: Run MVP with 3 knobs. Log every timeout/limit hit. After 100+ sessions, analyze:
- Do tool timeouts differ from LLM timeouts? If yes, split them.
- Do users hit maxTurns? If yes, consider raising or lowering.
- Is topK=5 too few? Measure retrieval quality.

**Recommendation**: Reduce to 3 configuration knobs in MVP. Document remaining 10 as "Phase 2: tune based on usage data."

---

### D11: Tool Execution Parallelization (lines 1194)

**Statement**: "Tools execute sequentially... parallel tool execution is a future optimization."

**Good**: Defers optimization until evidence shows it's needed.

**But**: Why mention it at all in MVP PRD? This is speculative.

**Recommendation**: Delete the parenthetical. Don't plant seeds for premature optimization. If Phase 2 data shows "users wait 30 seconds for 5 sequential web_fetch calls", then add parallel execution with evidence-based justification.

---

### D11: Memory Write-Back Table (lines 1207-1215)

**Problem**: Prescribes exact write-back events without evidence these are the right granularity.

**Complexity Theater Question**: Why write to daily log on "End of agent turn"? What if a turn is 50 tool calls and takes 8 minutes? Why not write after each tool call, or only on session end?

**Alternative**: Start with simplest rule: "Write to daily log on session end." If users report "I lost context when app crashed mid-session", then add incremental writes.

**Experiment**: MVP writes once per session end. Log session duration and tool call count. If sessions are long (>5 min) or have many tool calls (>10), consider incremental writes.

**Recommendation**: Simplify to "session end only" for MVP. Add granular write-back in Phase 2 if data shows sessions crash/timeout frequently.

---

### D12: Heartbeat in the Agent Turn Table (lines 1367-1377)

**Problem**: Prescribes exact context assembly differences between normal and heartbeat turns.

**Complexity Theater Questions**:
1. Why does heartbeat get "Today's daily log only" instead of hybrid search?
2. Why does it only get the `schedule` tool instead of all tools?
3. What evidence shows this is the right constraint?

**Alternative**: Heartbeat MVP uses full agent context (same as normal turns). Measure token usage. If heartbeat turns are cheaper/faster with limited context, add constraints in Phase 2.

**Cross-Reference**: NanoClaw has scheduled tasks with two modes: `group` (full context) and `isolated` (no history). That's 1 bit of config, not a 7-row comparison table.

**Recommendation**: Heartbeat MVP reuses full agent context. Add Phase 2 optimization "Heartbeat context trimming" only if data shows heartbeat is too expensive.

---

### D12: Notification Delivery (lines 1380-1401)

**Problem**: Primary/fallback channel routing, priority filtering ("Discord only gets high") specified before any notification exists.

**Complexity Theater Questions**:
1. Why does heartbeat need priority levels in MVP?
2. What evidence shows users want "Discord only gets high"?
3. Why not just send to one channel in MVP?

**Alternative**: MVP sends all heartbeat notifications to web UI only. No priority levels, no routing, no fallbacks.

**Experiment**: After 100+ heartbeat runs, ask user: "Which notifications were noise?" Measure signal-to-noise ratio. If user wants filtering, add priority then. If user wants multi-channel, add routing then.

**Recommendation**: Defer priority levels and channel routing to Phase 2. MVP logs all heartbeat decisions and sends actionable notifications to web UI only.

---

## 3. Missing Experiment Hooks

Where the PRD assumes a design will work without suggesting validation.

### D11: Agent Routing (lines 1172-1189)

**PRD Says**: "Match bindings in order, first match wins."

**Missing**: How do you test this? What happens when bindings conflict?

**Suggested Experiment Hook**:
```typescript
// Add test fixture
const testBindings = [
  { match: { channel: "discord", guildId: "123" }, agentId: "research" },
  { match: { channel: "discord" }, agentId: "main" },
];

// Test cases:
// 1. Message from Discord guild 123 → research agent (most specific wins)
// 2. Message from Discord guild 456 → main agent (fallback)
// 3. Message from Telegram → default agent (no match)
```

**Add to PRD**: "Test binding precedence with fixture data before deploying."

---

### D11: Provider Failover (lines 1162-1167)

**PRD Says**: `retries: 2`, `backoffMs: [1000, 3000]`, `fallbackModel: ...`

**Missing**: What if fallback also fails? Infinite retry loop?

**Suggested Experiment Hook**: Test cases:
1. Primary fails → Fallback succeeds (expected path)
2. Primary fails → Fallback also fails → Return error to user (don't infinite loop)
3. Primary fails → No fallback configured → Immediate error

**Add to PRD**: "Failover tests must cover both-providers-down scenario."

---

### D12: Data Gatherer Failures (lines 1338-1353)

**PRD Says**: `errors?: string[]` field for "Partial failures (e.g., API timeout)".

**Missing**: What does the agent do with partial failures? Skip that source? Retry? Notify user?

**Suggested Experiment Hook**: Test scenarios:
1. Calendar API times out → Heartbeat runs with email + tasks only
2. All gatherers fail → Heartbeat skips notification (no data)
3. One gatherer returns stale data → Heartbeat uses it or rejects it?

**Add to PRD**: "Gatherer error handling must be testable with mocked API failures."

---

## 4. POLA Violations

Anything that would surprise a developer reading the code for the first time.

### D11: Memory Write-Back "Conversation Summary" (line 1212)

**PRD Says**: "Append conversation summary to today's daily log."

**POLA Violation**: Who generates the summary? The agent? Automatic summarization model? A tool?

**Surprise**: Developer expects "append raw messages" but PRD says "append summary." Where does summary come from?

**Fix**: Clarify in PRD: "Agent calls `memory_write` tool with a self-generated summary of the turn. This is appended to daily log. Raw messages are in session JSONL (D5)."

---

### D11: Tool Timeout Behavior (lines 1201-1205)

**PRD Says**: "Kill the execution after toolTimeoutMs, return timeout error as tool result."

**POLA Violation**: What if the tool is `fs.write` and you kill it mid-write? File corruption?

**Surprise**: Developer expects clean shutdown, but PRD implies hard kill.

**Fix**: Add to D8 Tool System: "Tools must be idempotent or implement cleanup handlers. Runtime may kill tools on timeout."

---

### D12: Heartbeat "Quiet Mode" (line 1399)

**PRD Says**: `quietMode: false` → "true = log only, never notify."

**POLA Violation**: Why have heartbeat if it never notifies? This is a permanent off switch.

**Surprise**: Developer expects "disable heartbeat" config, not "run but never send output."

**Fix**: Either:
- Rename to `enabled: false` (clearer intent)
- Document use case: "Quiet mode for testing heartbeat logic without spamming channels."

---

## 5. Concrete Recommendations

For each flagged item, here's what to do.

### D11 Recommendations

| Item | Action | Rationale |
|------|--------|-----------|
| **Token Budget Percentages** | Remove from MVP. Use simple "trim oldest messages" with logging. | No evidence percentages are correct. Measure first, optimize later. |
| **Per-Segment Trim Strategies** | Remove from MVP. Document in Phase 2 backlog. | Speculative optimization. NanoClaw doesn't do this. |
| **Runtime Config Knobs** | Reduce to 3: maxTurns, defaultTimeoutMs, memorySearchTopK. | 13 knobs is premature tuning. Start simple, add knobs when data shows need. |
| **Parallel Tool Execution** | Delete mention from PRD. | Speculative optimization, not MVP scope. |
| **Memory Write-Back Granularity** | Simplify to "session end only". | Simplest rule. Add incremental writes if sessions crash often. |
| **Agent Routing Tests** | Add test cases to PRD. | Missing experiment hook. Binding precedence is subtle. |
| **Provider Failover Edge Cases** | Add "both fail" test case. | Missing experiment hook. Infinite retry risk. |
| **POLA: Conversation Summary** | Clarify who generates summary. | Ambiguous. Developer will be confused. |
| **POLA: Tool Timeout Cleanup** | Add cleanup handler requirement. | Tool safety issue. Hard kill mid-write is dangerous. |

---

### D12 Recommendations

| Item | Action | Rationale |
|------|--------|-----------|
| **Heartbeat Context Table** | Remove from MVP. Reuse full agent context. | Speculative optimization. NanoClaw uses simple "full context" mode. |
| **Priority Levels + Routing** | Remove from MVP. All notifications to web UI only. | Complexity theater. No evidence users need priority filtering. |
| **Data Gatherer Error Tests** | Add test cases to PRD. | Missing experiment hook. Partial failures are common. |
| **POLA: Quiet Mode** | Rename to `enabled` or document testing use case. | Ambiguous intent. "Run but never notify" is surprising. |

---

## 6. Cross-Reference with Source Analyses

### NanoClaw Simplicity (source-analysis-nanoclaw.md)

**NanoClaw's memory write-back** (lines 31-48):
- PreCompact hook archives transcript
- Session ID stored in SQLite
- 31 lines total for entire memory system

**Onyx D11 specifies**:
- 3 different write-back events (turn end, explicit tool call, session end)
- Per-segment token budgets
- LRU skill truncation
- Tool call atomicity requirements

**Question**: Why is Onyx's memory write-back 10x more complex than NanoClaw's when both solve the same problem?

**Recommendation**: Simplify Onyx memory write-back to match NanoClaw's simplicity. Use SDK session management where possible. Add complexity only when data shows NanoClaw's approach fails for Onyx's use case.

---

### NanoClaw Scheduled Tasks (source-analysis-nanoclaw.md, lines 96-113)

**NanoClaw's scheduler**:
- Polls SQLite every 60s for due tasks
- 2 context modes: `group` (full history) or `isolated` (no history)
- Task prompt prefixed with `[SCHEDULED TASK - ...]`
- Output sent to WhatsApp via MCP tool

**Onyx D12 specifies**:
- Cron engine (same concept)
- 7-row context comparison table (normal vs heartbeat)
- Priority levels, channel routing, fallback channels
- Data gatherers (not in NanoClaw)

**Overlap**: Both use cron + task queue. Both send output via channel.

**Divergence**: Onyx adds priority/routing complexity NanoClaw doesn't have.

**Question**: Does Onyx need priority/routing in MVP, or can it start with NanoClaw's simple "run task, send output to one channel" model?

**Recommendation**: Start with NanoClaw's simple scheduler. Add priority/routing in Phase 2 only if user requests filtering ("too many notifications").

---

## 7. Summary: Keep, Simplify, Defer

### Keep (Well-Grounded)
- ReAct loop core cycle
- Session persistence in JSONL
- Provider failover (with edge case tests added)
- Cron engine framework
- HEARTBEAT.md workspace file
- Agent turn reuse for heartbeat

### Simplify (Remove Complexity Theater)
- Token budget percentages → simple "trim oldest"
- Runtime config: 13 knobs → 3 knobs
- Memory write-back: 3 events → 1 event (session end)
- Heartbeat context: custom table → reuse full context
- Notification delivery: priority + routing → web UI only

### Defer to Phase 2 (Speculative Optimization)
- Parallel tool execution
- Per-segment token trim strategies
- Heartbeat data gatherers (framework only in MVP)
- Priority levels and channel routing
- LRU skill truncation

### Add (Missing Experiment Hooks)
- Agent routing test cases
- Provider failover "both fail" test
- Data gatherer error handling tests
- Tool timeout cleanup requirements

### Fix (POLA Violations)
- Clarify conversation summary generation
- Document tool cleanup handlers
- Rename/clarify heartbeat `quietMode`

---

## 8. Final Philosophy Check

### Does D11/D12 pass the litmus tests?

**Complexity Test**: "If I remove this, what specific problem occurs?"
- Token budget percentages: No specific problem. Simple trimming works.
- Runtime config knobs: No specific problem. Fewer knobs, less tuning overhead.
- Memory write-back granularity: No specific problem. Session-end writes sufficient.
- Heartbeat priority levels: No specific problem. Send all notifications to web UI.

**Verdict**: ~60% of D11/D12 complexity is theater. Simplify to pass the test.

---

**Security Test**: "If I remove this control, what specific attack becomes possible?"
- Not applicable (D11/D12 are not security-focused sections).

---

**Experiment-Driven Test**: "Can we prove this design with a small experiment?"
- Token budgets: Yes, run 100 conversations with simple trimming, measure if any fail.
- Heartbeat gatherers: Yes, build framework, add one gatherer (calendar), measure usefulness.
- Priority routing: No, speculative. Defer until user requests filtering.

**Verdict**: 50% of D11/D12 lacks experiment validation. Add hooks or defer to Phase 2.

---

**Verifiable Acceptance Test**: "Can an agent test this without human judgment?"
- "Agent completes 25-turn conversation without timeout" → Yes, testable.
- "Token budget percentages feel right" → No, subjective.
- "Heartbeat notifies at right priority" → No, "right" is subjective.

**Verdict**: Token budgets and priority levels fail verifiability test. Replace with objective criteria.

---

## 9. Recommended PRD Edits

### D11: Agent Runtime

1. **Remove lines 1130-1142** (token budget table). Replace with:
   ```markdown
   #### Context Assembly (MVP)

   Assemble context in priority order:
   1. System prompt (SOUL, AGENTS, USER, TOOLS)
   2. Memory (MEMORY.md + hybrid search results)
   3. Conversation history (newest first until budget exhausted)

   Reserve 4096 tokens minimum for response. Log when context is trimmed.
   Phase 2 will optimize based on trimming logs.
   ```

2. **Replace lines 1143-1169** (runtime config) with:
   ```json5
   {
     "runtime": {
       "maxTurns": 20,              // Max ReAct iterations
       "defaultTimeoutMs": 300000,  // 5 min for any operation
       "memorySearchTopK": 5        // Hybrid search results per turn
     }
   }
   ```

3. **Delete line 1194 parenthetical** about parallel tool execution.

4. **Simplify lines 1207-1215** (memory write-back) to:
   ```markdown
   | Event | Action |
   |-------|--------|
   | Session end | Append agent-generated summary to today's daily log |
   ```

5. **Add after line 1189**:
   ```markdown
   #### Agent Routing Tests

   Test binding precedence with fixture data:
   - Most specific binding (channel + guildId) beats general (channel only)
   - No match falls back to default agent
   - No default agent returns error
   ```

6. **Add after line 1077**:
   ```markdown
   #### Failover Edge Cases

   Test scenarios:
   - Primary fails, fallback succeeds → Use fallback
   - Both fail → Return error to user immediately (do not retry fallback)
   - No fallback configured → Immediate error
   ```

---

### D12: Heartbeat System

1. **Replace lines 1367-1377** (context table) with:
   ```markdown
   #### Heartbeat Agent Turn

   MVP: Heartbeat reuses full agent context (same as normal turns).
   Phase 2: Optimize context if heartbeat proves too expensive.
   ```

2. **Remove lines 1380-1401** (notification delivery). Replace with:
   ```markdown
   #### Notification Delivery (MVP)

   All heartbeat notifications sent to web UI only. No priority levels, no channel routing.
   Phase 2: Add multi-channel routing if user requests filtering.
   ```

3. **Replace line 1399** `quietMode: false` with:
   ```json5
   "enabled": true,  // false = disable heartbeat entirely
   ```

4. **Add after line 1365**:
   ```markdown
   #### Data Gatherer Error Tests

   Test scenarios:
   - One gatherer times out → Heartbeat runs with partial data
   - All gatherers fail → Heartbeat skips notification
   - Gatherer returns stale data → Agent sees timestamp, decides whether to use
   ```

---

## 10. Conclusion

**D11 and D12 contain solid foundations** (ReAct loop, session persistence, cron framework, workspace files) but are **weighed down by premature optimization** (token budgets, 13 config knobs, priority routing, per-segment strategies).

**Simplifying to MVP scope** removes ~60% of the complexity with zero loss of functionality. The removed complexity is speculative — no evidence it's needed, and simple alternatives exist.

**Philosophy alignment**: After simplification, D11/D12 pass experiment-driven, complexity theater, and POLA tests. Current version fails all three.

**Next steps**: Apply recommended PRD edits, build simplified MVP, measure real usage, iterate based on evidence.

---

**Files Referenced**:
- C:\Users\Mike\.dotfiles\.specs\onyx\prd.md (D11, D12)
- C:\Users\Mike\.dotfiles\.specs\onyx\research\source-analysis-nanoclaw.md (NanoClaw comparison)
- C:\Users\Mike\.dotfiles\.specs\onyx\CLAUDE.md (project context)
- C:\Users\Mike\.claude\skills\development-philosophy\SKILL.md (philosophy framework)
- C:\Users\Mike\.claude\skills\analysis-workflow\SKILL.md (analysis framework)
- C:\Users\Mike\.claude\skills\planning\SKILL.md (acceptance criteria methodology)
