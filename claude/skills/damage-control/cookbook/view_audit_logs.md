# Viewing and Analyzing Damage Control Audit Logs

Audit logs provide a complete record of all damage control decisions, showing what was blocked, allowed, or flagged for confirmation.

## Log Location

Audit logs are stored in:
```
~/.claude/logs/damage-control/
```

Each hook type creates its own log file:
- `bash-tool.log` - Bash command evaluations
- `edit-tool.log` - File edit evaluations
- `write-tool.log` - File write evaluations

## Basic Log Viewing

View all logs in real-time:
```bash
tail -f ~/.claude/logs/damage-control/*.log
```

View all logs as JSON (parseable):
```bash
cat ~/.claude/logs/damage-control/*.log | jq
```

View the last N entries:
```bash
tail -50 ~/.claude/logs/damage-control/bash-tool.log | jq
```

## Filtering by Decision

### View Only Blocked Decisions

Block commands that were prevented:
```bash
cat ~/.claude/logs/damage-control/*.log | jq 'select(.decision == "BLOCK")'
```

### View Only Allowed Decisions

Commands that were allowed to proceed:
```bash
cat ~/.claude/logs/damage-control/*.log | jq 'select(.decision == "ALLOW")'
```

### View Only Ask Decisions

Commands that triggered confirmation prompts:
```bash
cat ~/.claude/logs/damage-control/*.log | jq 'select(.decision == "ASK")'
```

## Filtering by Tool Type

### Bash Commands Only

```bash
cat ~/.claude/logs/damage-control/bash-tool.log | jq
```

### File Edits Only

```bash
cat ~/.claude/logs/damage-control/edit-tool.log | jq
```

### File Writes Only

```bash
cat ~/.claude/logs/damage-control/write-tool.log | jq
```

## Filtering by Pattern

View entries that matched a specific dangerous pattern:

```bash
# All entries matching rm-rf pattern
cat ~/.claude/logs/damage-control/*.log | jq 'select(.matched_pattern | contains("rm"))'

# All entries matching git-force pattern
cat ~/.claude/logs/damage-control/*.log | jq 'select(.matched_pattern | contains("git-force"))'
```

## Filtering by File Path

View all operations targeting a specific file:

```bash
# All operations on ~/.ssh directory
cat ~/.claude/logs/damage-control/*.log | jq 'select(.path | contains(".ssh"))'

# All operations on credentials
cat ~/.claude/logs/damage-control/*.log | jq 'select(.path | contains("credentials"))'
```

## Common Analysis Queries

### Count decisions by type

```bash
cat ~/.claude/logs/damage-control/*.log | jq -r '.decision' | sort | uniq -c
```

### Find recently blocked commands

```bash
cat ~/.claude/logs/damage-control/bash-tool.log | \
  jq 'select(.decision == "BLOCK")' | \
  jq -r '[.timestamp, .command] | @csv' | \
  tail -20
```

### View all git-related blocks

```bash
cat ~/.claude/logs/damage-control/bash-tool.log | \
  jq 'select(.decision == "BLOCK" and .command | contains("git"))'
```

### Find dangerous pattern triggers

```bash
cat ~/.claude/logs/damage-control/*.log | \
  jq 'select(.decision == "BLOCK") | {timestamp, matched_pattern, reason}' | \
  jq -s 'group_by(.matched_pattern) | map({pattern: .[0].matched_pattern, count: length})'
```

### View audit trail for specific operation

```bash
# Show all operations on ~/.credentials over time
cat ~/.claude/logs/damage-control/*.log | \
  jq 'select(.path == "~/.credentials") | {timestamp, tool, decision, command_or_path}'
```

## Advanced Analysis

### Export logs to CSV for spreadsheet analysis

```bash
cat ~/.claude/logs/damage-control/*.log | \
  jq -r '[.timestamp, .tool, .decision, .command_or_path, .matched_pattern] | @csv' \
  > damage-control-audit.csv
```

### Find trends in blocking

```bash
# Show blocking patterns by hour
cat ~/.claude/logs/damage-control/*.log | \
  jq -r 'select(.decision == "BLOCK") | .timestamp' | \
  cut -d'T' -f1-2 | \
  sort | uniq -c
```

### Compare decision rates by tool

```bash
cat ~/.claude/logs/damage-control/*.log | \
  jq -s 'group_by(.tool) | map({
    tool: .[0].tool,
    blocks: (map(select(.decision == "BLOCK")) | length),
    allows: (map(select(.decision == "ALLOW")) | length),
    asks: (map(select(.decision == "ASK")) | length),
    total: length
  })'
```

## Log Cleanup

### Archive old logs

```bash
# Keep only last 7 days
find ~/.claude/logs/damage-control/ -name "*.log" -mtime +7 -exec gzip {} \;
```

### Clear all logs (careful!)

```bash
rm ~/.claude/logs/damage-control/*.log
```

## Log Format

Each log entry is a JSON object with:

| Field | Description |
|-------|-------------|
| `timestamp` | ISO 8601 timestamp of the decision |
| `tool` | Which hook made the decision (Bash, Edit, Write) |
| `decision` | ALLOW, BLOCK, or ASK |
| `command_or_path` | The command or path that was evaluated |
| `matched_pattern` | The security pattern that triggered (if blocked) |
| `reason` | Human-readable reason for the decision |
| `confidence` | Confidence score (0-100) for the decision |

Example:
```json
{
  "timestamp": "2025-01-06T14:32:15Z",
  "tool": "Bash",
  "decision": "BLOCK",
  "command": "rm -rf /home/user/important",
  "matched_pattern": "rm-recursive-destructive",
  "reason": "Matches dangerous rm -rf pattern",
  "confidence": 100
}
```
