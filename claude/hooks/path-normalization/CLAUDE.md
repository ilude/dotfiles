# Path Normalization Hook

## Purpose

This PreToolUse hook works around bugs in Claude Code's Edit/Write tools on Windows. The bugs cause false "File has been unexpectedly modified" errors when using:

1. **Absolute paths** (`C:/Users/...`, `/c/Users/...`, `/mnt/c/Users/...`)
2. **Backslash separators** (`claude\skills\test.py`)

## Issue Status

**Last researched: 2026-01-29**

**Upstream bug status: UNFIXED** - The core path normalization / cache poisoning bug remains open.

### Changelog Reference

- [CHANGELOG.md](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md)

**v2.1.7** added a partial fix:
> "Fixed false 'file modified' errors on Windows when cloud sync tools, antivirus scanners, or Git touch file timestamps without changing content"

This addresses timestamp-based false positives but **does NOT fix** the path separator / cache poisoning issue.

### Related GitHub Issues

| Issue | Title | Status | Notes |
|-------|-------|--------|-------|
| [#7935](https://github.com/anthropics/claude-code/issues/7935) | Edit tool path format issue on Windows | Closed (inactivity) | **Master issue** - Detailed cache poisoning analysis. Closed after 60 days inactivity, NOT because it was fixed |
| [#12805](https://github.com/anthropics/claude-code/issues/12805) | Edit/Write tools fail with 'unexpectedly modified' on Windows (MINGW) | Open | Comprehensive repro with timestamp evidence |
| [#12695](https://github.com/anthropics/claude-code/issues/12695) | Edit Tool False Positive "File unexpectedly modified" on Windows | Open | Cross-referenced from other issues |
| [#17380](https://github.com/anthropics/claude-code/issues/17380) | Edit Tool Calls Periodically Fail on Windows Due to Path Issues | Closed (duplicate) | Documents workaround via CLAUDE.md prompting |
| [#17684](https://github.com/anthropics/claude-code/issues/17684) | Edit tool fails with "unexpectedly modified" when file hasn't changed | Closed (duplicate) | Notes issue accumulates over session |
| [#11684](https://github.com/anthropics/claude-code/issues/11684) | Edit Tool Fails with 'File Unexpectedly Modified' on Windows/Git Bash | Open | Suggests content hash instead of timestamp |

### Root Cause (from #7935 analysis)

The Edit tool maintains an internal file state cache that:
1. Creates cache entries using the **exact path format** from `Read()` operations
2. Looks up entries using a **normalized path** during `Edit()` operations
3. Results in cache misses when `Read(C:/path)` doesn't match `Edit(C:\path)` lookup

**Cache Poisoning Matrix** (from [#7935 comment](https://github.com/anthropics/claude-code/issues/7935#issuecomment-3445397088)):

| Read Format | Edit Format | Result |
|-------------|-------------|--------|
| `C:\path` | `C:\path` | Works |
| `C:\path` | `C:/path` | Works |
| `C:/path` | `C:\path` | FAILS |
| `C:/path` | `C:/path` | FAILS |

**This hook prevents the poisoned state by blocking problematic paths before they reach Claude Code.**

## Solution

The hook blocks problematic paths and suggests the correct format:

| Input Path | Decision | Suggested Fix |
|------------|----------|---------------|
| `claude/skills/test.py` | ALLOW | - |
| `~/.claude/skills/test.py` | ALLOW | - |
| `claude\skills\test.py` | BLOCK | `claude/skills/test.py` |
| `C:/Users/.../file.py` | BLOCK | relative path |
| `/c/Users/.../file.py` | BLOCK | relative path |

## Key Design Decisions

### Why block absolute paths?

Claude Code's Edit tool has internal path handling bugs. Using relative paths with forward slashes avoids these bugs entirely. This is a **workaround**, not a security feature.

### Cross-platform `is_absolute()` detection

**Critical**: Python's `Path.is_absolute()` behaves differently across platforms:
- Windows: `Path("C:/foo").is_absolute()` → `True`
- Unix/WSL: `Path("C:/foo").is_absolute()` → `False`

The hook explicitly checks for Windows drive letters (`C:`) to work correctly regardless of where it runs (Git Bash, MSYS2, WSL, native Windows).

### Path traversal is allowed

`../sibling/file.py` is intentionally allowed. This hook fixes Edit tool bugs, not security boundaries. Claude Code has separate security checks.

## Troubleshooting

### Trigger Patterns (Auto-Activate)

This documentation is relevant when you see ANY of:
- `PreToolUse:Write hook error:` with `path-normalization-hook.py`
- `PreToolUse:Edit hook error:` with `path-normalization-hook.py`
- `Use relative path:` error messages
- `Use forward slashes:` error messages

### Step 1: Check the logs

Logs are written to `~/.claude/logs/path-normalization/YYYY-MM-DD.log` in JSONL format:

```bash
# View today's log
cat ~/.claude/logs/path-normalization/$(date +%Y-%m-%d).log

# View recent blocked paths
grep '"decision": "blocked"' ~/.claude/logs/path-normalization/*.log | tail -20

# View all decisions for a specific file
grep 'path-normalization-hook.py' ~/.claude/logs/path-normalization/*.log
```

### Log entry format

```json
{
  "timestamp": "2026-01-13T11:22:59.529030",
  "tool": "Edit",
  "file_path": "C:/Users/mglenn/.dotfiles/test.py",
  "decision": "blocked",
  "reason": "absolute path in project",
  "suggested_path": "test.py",
  "cwd": "C:\\Users\\mglenn\\.dotfiles",
  "session_id": ""
}
```

### Step 2: Analyze the blocked entry

Find the log entry for the failed operation and check if `suggested_path` is correct:

| suggested_path | Verdict | Action |
|----------------|---------|--------|
| Clean relative path (`file.md`, `docs/file.md`) | Hook working correctly | Retry with suggested path |
| Same as input (`C:\Projects\...`) | **BUG in hook** | Fix the hook (see below) |
| Still has backslashes | **BUG in hook** | Fix the hook |
| Empty or wrong file | **BUG in hook** | Fix the hook |

### Step 3: If bug found, fix and test

1. Edit the hook: `~/.claude/hooks/path-normalization/path-normalization-hook.py`
2. Run tests: `cd ~/.claude/hooks/path-normalization && uv run pytest -v`
3. Add regression test for the specific failure
4. Retry the original operation

### Common issues

| Symptom | Likely Cause | Solution |
|---------|--------------|----------|
| "File has been unexpectedly modified" | Absolute path or backslashes slipped through | Check logs - if path was "allowed" but shouldn't be, fix `is_absolute()` |
| Hook not firing | Hook not in settings.json or tool_name mismatch | Verify `~/.claude/settings.json` has PreToolUse hook for Edit/Write |
| Wrong suggestion | Path detection logic error | Check `is_within()` and `CLAUDE_PROJECT_DIR` |
| `suggested_path` equals full input path | Cross-platform Path.name bug (see below) | Use `normalize_separators()` before Path operations |

### Known bug: Cross-platform `Path.name` failure

**Symptom**: Log shows `suggested_path` is the full absolute path instead of just the filename:
```json
{
  "file_path": "C:\\Projects\\Work\\file.md",
  "suggested_path": "C:\\Projects\\Work\\file.md"  // BUG: should be "file.md"
}
```

**Root cause**: On Unix/WSL, `Path("C:\\path\\file.md").name` returns the **entire string** because backslashes aren't recognized as path separators. Python's pathlib only recognizes `/` on Unix.

**Fix**: The hook uses `normalize_separators()` to convert backslashes to forward slashes before any Path operations, and extracts filenames using string operations:
```python
normalized = normalize_separators(path_str)  # C:/Projects/Work/file.md
filename = normalized.rsplit('/', 1)[-1]     # file.md
```

**Regression test**: `test_windows_backslash_path_suggests_filename_only` in the test suite

### Testing the hook manually

```bash
# Test a path
echo '{"tool_name":"Edit","tool_input":{"file_path":"your/test/path.py"}}' | \
  uv run ~/.dotfiles/claude/hooks/path-normalization/path-normalization-hook.py

# Check exit code (0=allow, 2=block)
echo $?
```

### Running tests

```bash
cd ~/.dotfiles/claude/hooks/path-normalization
uv run pytest -v
```

## Do NOT

- **Do NOT** use `USERPROFILE` environment variable tricks - the issue is Claude Code's Edit tool, not path resolution
- **Do NOT** try to "fix" paths by converting them - just block and suggest the correct format
- **Do NOT** add complex path manipulation - keep it simple, let Claude retry with the suggested path
- **Do NOT** assume the bug is in this hook when you see "unexpectedly modified" - first check the logs to see what path was actually passed
