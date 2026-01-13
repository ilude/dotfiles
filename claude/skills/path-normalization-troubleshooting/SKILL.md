---
name: path-normalization-troubleshooting
description: |
  Auto-troubleshoot path-normalization hook errors. Activate when seeing "path-normalization-hook.py" errors,
  "Use relative path:" messages, or PreToolUse:Write/Edit hook errors mentioning path normalization.
---

# Path Normalization Troubleshooting

When a path-normalization hook error occurs, **immediately investigate** before responding to the user.

## Trigger Patterns

This skill activates when you see ANY of:
- `PreToolUse:Write hook error:` with `path-normalization-hook.py`
- `PreToolUse:Edit hook error:` with `path-normalization-hook.py`
- `Use relative path:` error messages
- `Use forward slashes:` error messages

## Troubleshooting Workflow

### Step 1: Check the logs

```bash
# View today's log (last 20 entries)
tail -20 ~/.claude/logs/path-normalization/$(date +%Y-%m-%d).log
```

### Step 2: Analyze the blocked entry

Find the log entry for the failed operation and check:

```json
{
  "file_path": "C:\\Projects\\Work\\file.md",    // What was passed
  "suggested_path": "file.md",                   // What hook suggested
  "decision": "blocked",
  "reason": "absolute path outside project/home"
}
```

**Key question**: Is `suggested_path` correct?

| suggested_path | Verdict | Action |
|----------------|---------|--------|
| Clean relative path (`file.md`, `docs/file.md`) | Hook working correctly | Retry with suggested path |
| Same as input (`C:\Projects\...`) | **BUG in hook** | Fix the hook (see Step 3) |
| Still has backslashes | **BUG in hook** | Fix the hook (see Step 3) |
| Empty or wrong file | **BUG in hook** | Fix the hook (see Step 3) |

### Step 3: If bug found, investigate the hook

Read the hook documentation first:
```bash
cat ~/.claude/hooks/path-normalization/CLAUDE.md
```

Common bug patterns:
1. **`Path.name` returning full path**: On Unix/WSL, `Path("C:\\path\\file").name` returns the entire string because backslashes aren't separators. Fix: use `normalize_separators()` before Path operations.
2. **`is_within()` failing**: Path comparison failing due to mixed path formats. Fix: normalize both paths before comparison.
3. **`to_windows_path()` not handling input**: Only converts `/c/` and `/mnt/c/` formats, not `C:\`. Fix: add backslash normalization.

### Step 4: Fix and test

1. Edit the hook: `~/.claude/hooks/path-normalization/path-normalization-hook.py`
2. Run tests: `cd ~/.claude/hooks/path-normalization && uv run pytest -v`
3. Add regression test for the specific failure
4. Retry the original operation

## Quick Reference

| Location | Path |
|----------|------|
| Hook script | `~/.claude/hooks/path-normalization/path-normalization-hook.py` |
| Documentation | `~/.claude/hooks/path-normalization/CLAUDE.md` |
| Logs | `~/.claude/logs/path-normalization/YYYY-MM-DD.log` |
| Tests | `~/.claude/hooks/path-normalization/tests/` |

## Example: The Backslash Bug (2026-01-13)

**Error seen**:
```
PreToolUse:Write hook error: Use relative path: 'C:\Projects\Work\Gitlab\gitlab-helm\docs\PORTING_PROGRESS.md'
```

**Log showed**:
```json
{
  "file_path": "C:\\Projects\\Work\\Gitlab\\gitlab-helm\\docs\\PORTING_PROGRESS.md",
  "suggested_path": "C:\\Projects\\Work\\Gitlab\\gitlab-helm\\docs\\PORTING_PROGRESS.md"
}
```

**Problem**: `suggested_path` was the full path, not just `PORTING_PROGRESS.md`.

**Root cause**: On Unix/WSL, `Path("C:\\path\\file").name` returns the entire string because `\` isn't a separator.

**Fix**:
1. Added `normalize_separators()` to convert `\` to `/` before Path operations
2. Changed filename extraction to use string operations: `normalized.rsplit('/', 1)[-1]`
3. Added regression test: `test_windows_backslash_path_suggests_filename_only`

**Verification**:
```bash
cd ~/.claude/hooks/path-normalization && uv run pytest -v
# 74 passed
```
