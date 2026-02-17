# Debug Log Audit

## Summary
- Total files analyzed: 69
- Date range: 2026-01-11 to 2026-02-17
- Files with notable issues: 68
- Total ERROR-level log entries: 4,099
- Total tool PostToolUseFailure events: 447
- Total hook-denied tool calls: 90

## Findings by Category

### Tool Failures

**Bash tool (352 PostToolUseFailure events)**
- Sessions with 67 and 60 Bash failures respectively (Feb 1 sessions: 39d64090, 95432620).
- Many commands failed with generic Shell command failed -- suggests Ansible/Docker deploy commands during menos deployment.
- One failure lasted 111,830ms (~2 min) and another 45,376ms (~45 sec) indicating hanging processes.
- Pattern: multiple rapid sequential Bash failures within seconds indicating repeated retry behavior.


**Read tool (39 PostToolUseFailure events)**
- Subtype 1 EISDIR: agent attempting to Read a directory path rather than a file.
  Observed on: onyx/, onyx/api/src, onyx/shared/src, menos/, menos/api/migrations, menos/.claude/rules, .specs/onyx.
  Cluster of 5 directory-read errors on Feb 17.
- Subtype 2 MaxFileReadTokenExceededError: file too large (26,783 tokens, 61,626 tokens, 30,076 tokens).
  Same file retried multiple times without offset/limit. Feb 16 session: 7 consecutive attempts on same 61,626-token file.
- Subtype 3 File does not exist: agents reading paths that do not exist.
  Clusters of 10+ errors in quick succession in Feb 17 sessions.

**Write tool (4 PostToolUseFailure events)**
- TypeError [ERR_INVALID_ARG_TYPE]: data argument Received undefined.
  Write called with undefined content. Both atomic and non-atomic write failed. Occurred Feb 1-2.

**Edit tool (18 PostToolUseFailure events)**
- Hook denials on Edit (26 denials total), primarily Jan 11 session. Permission restriction was active at that time.

**WebFetch tool (10 PostToolUseFailure events)**
- AxiosError 403 (5 occurrences) -- pages blocking automated access.
- Same blocked URLs attempted twice in quick succession.

### Permission Denials (Hook-Driven)

**Total: 90 hook-denied tool calls**

Breakdown by tool:
- Bash: 36 denials
- Write: 27 denials
- Edit: 26 denials
- AskUserQuestion: 3 denials
- ExitPlanMode: ~8 denials

**ExitPlanMode denials** -- Recurring pattern: Feb 15 (3 in ~90 seconds), Feb 2 (2), Feb 17 (2).
User repeatedly rejected plan mode exit proposals. Plans were not sufficiently detailed or accepted.

**AskUserQuestion denials** -- Jan 31, Feb 1, Feb 16. User denied Claude asking a question.

**Bash hook denials (PreToolUse hook)** -- Feb 16 session: 5 Bash denials via PreToolUse hook error.
Then PermissionRequest hook error. Custom hook blocking Bash before user approval sought.

### Hook Failures

**PreToolUse hook errors**
- Hook PreToolUse:Bash error + Hook denied tool use for Bash -- Feb 16 (3 occurrences). Hook returned error before deny.
- Hook PermissionRequest:Bash error -- Feb 16. Hook crashed processing a permission request.
- Hook PermissionRequest:AskUserQuestion error -- Feb 17 (2 occurrences).
- Hook PermissionRequest:ExitPlanMode error -- Feb 17 (2 occurrences). Hook erroring rather than cleanly deciding.

**Diagnostics path mismatch errors (ERROR level)**
- ERROR: Diagnostics file path mismatch: expected C:\Users\Mike\.claude\CLAUDE.md, got file://c:\users\mike\.claude\claude.md/
  IDE MCP diagnostics server comparing Windows absolute path to file URI format.
  Case sensitivity mismatch. Affects CLAUDE.md and skill SKILL.md files.
  Observed Feb 15 (multiple per session). Does not block operation but is ERROR-level noise.

### Repeated Retries

**Read on oversized files** -- Feb 16: same 61,626-token file read attempted 7 times consecutively
(02:13:12 through 02:13:33, ~21 seconds). Agent did not use offset/limit despite error each time.

**Sequential Bash failures** -- Feb 1: 14 failures from 17:28:10 to 17:31:10 (under 3 min),
then another cluster at 18:06-18:12. Suggests Ansible deploy commands failing, agent retrying variations.

**File-not-exist retries** -- Feb 17: clusters of 10-20 consecutive File does not exist errors within seconds.
Agent attempts multiple non-existent paths in rapid succession.

**WebFetch 403 retries** -- Same blocked URLs attempted twice within seconds.

### API/Connection Issues

**Aborted requests** -- 14 API error (attempt 1/11): Request was aborted events across Feb 15-17.
User-initiated Escape cancellations, not server errors. ~1-2 per session.

**Connection errors** -- 2 undefined Connection error entries. Single attempt, not retried.

**Request timed out** -- 1 occurrence (Feb 15 18:01:38).

**AbortError** -- 8 instances across Jan-Feb. User cancellations mid-response.

**Streaming fallback** -- Error streaming, falling back to non-streaming mode: Content block input is not a string
-- 10 occurrences on Feb 17. Transient error; auto-recovered. Happens in bursts of 3 for same response.

### Other Issues

**MCP plugin-not-found** -- superpowers@superpowers-marketplace fires 2x every session startup.
Consistent across all Feb 15-17 sessions. Non-blocking but noisy.

**MCP ide WebSocket disconnect/reconnect** -- 5 disconnects, all auto-reconnect in <220ms. Not causing failures.

**Tool search disabled for Haiku** -- model does not support tool_reference blocks.
Fires up to 7x per session when Haiku is used as subagent. Noisy but expected.

**Write tool with undefined content** -- Signals agent built file content from pipeline returning undefined
(failed JSON parse or template substitution). Cascades to both atomic and non-atomic write failure.

## Recommendations

1. **Read retry discipline** -- On MaxFileReadTokenExceededError, never retry identically.
   Always use offset+limit or switch to Grep. Suggested rule addition:
   'On MaxFileReadTokenExceededError, use offset+limit or Grep. Never retry without parameters.'

2. **Directory-vs-file discipline** -- EISDIR errors cluster on directory paths (menos/, onyx/, src).
   Suggested rule: 'Never attempt Read on a path that lacks a file extension or is known to be a
   directory. Use Glob to list directory contents instead.'

3. **Stop retrying on hook denial** -- After a hook denies a tool call, do not retry variations.
   Stop, explain what was attempted, and ask for user guidance.

4. **ExitPlanMode repeated denials** -- When ExitPlanMode is denied, ask for specific feedback
   and revise plan in text before attempting again. Suggested rule: 'If ExitPlanMode is denied,
   ask for feedback and revise plan -- do not re-attempt exit immediately.'

5. **Diagnostics path mismatch** -- Low priority but persistent ERROR noise from IDE MCP server.
   Address by normalizing paths to consistent case/format in hook configuration.

6. **superpowers MCP plugin** -- Remove from MCP config if never available. Fires 2x every
   session startup and is confirmed never to load.

7. **Haiku tool search warning** -- Use Sonnet 4+ for subagents that need tool search capability.
   Haiku warning is expected behavior but clutters debug logs.

8. **Deploy-related Bash failures** -- Feb 1 session had 67 Bash failures during menos deployment
   debugging. Reinforces existing CLAUDE.md rule: test migrations locally first, one deploy cycle only.

9. **Write tool undefined content** -- Validate before Write calls. Verify content is a non-empty
   string before calling Write tool. Undefined content triggers failure in both write paths.
