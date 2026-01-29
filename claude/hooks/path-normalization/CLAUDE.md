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

The hook uses **transparent fixes** for deterministic cases (zero-retry latency) and **blocks** only for ambiguous cases:

| Input Path | Decision | Action |
|------------|----------|--------|
| `claude/skills/test.py` | ALLOW | Pass through |
| `~/.claude/skills/test.py` | ALLOW | Pass through |
| `claude\skills\test.py` | **FIX** | Auto-correct to `claude/skills/test.py` |
| `C:/Users/.../project/file.py` | **FIX** | Auto-correct to `file.py` (relative to cwd) |
| `C:/Users/name/.dotfiles/...` | **FIX** | Auto-correct to `~/.dotfiles/...` |
| `D:/Random/path/file.py` | BLOCK | Suggest `file.py` (ambiguous - outside project/home) |

### How Transparent Fixes Work

The hook uses the PreToolUse `updatedInput` feature (Claude Code v2.0.10+) to modify paths before the tool executes:

```json
{
  "hookSpecificOutput": {
    "permissionDecision": "allow",
    "updatedInput": {"file_path": "corrected/path.py"},
    "additionalContext": "Path was auto-corrected..."
  }
}
```

**Benefits:**
- Zero retry loops (faster, cheaper)
- Transparent to Claude
- Deterministic path resolution

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
  "decision": "fixed",
  "reason": "absolute path within project",
  "suggested_path": "test.py",
  "cwd": "C:\\Users\\mglenn\\.dotfiles",
  "session_id": ""
}
```

**Decision values:** `allowed` (pass through), `fixed` (auto-corrected via updatedInput), `blocked` (rejected with suggestion)

### Step 2: Analyze the log entry

Find the log entry for the failed operation and check the `decision` and `suggested_path`:

| Decision | suggested_path | Verdict | Action |
|----------|----------------|---------|--------|
| `fixed` | Clean relative path | Hook working correctly | Should have succeeded automatically |
| `blocked` | Clean relative path | Hook working correctly | Claude should retry with suggested path |
| `fixed` | Same as input | **BUG in hook** | Fix the path correction logic |
| `blocked` | Still has backslashes | **BUG in hook** | Fix the suggestion logic |
| `allowed` | - | Possible issue | Hook didn't catch problematic path - check detection logic |

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

- **Do NOT** assume the bug is in this hook when you see "unexpectedly modified" - first check the logs to see what path was actually passed
- **Do NOT** use `Path.name` on cross-platform paths - use string operations after normalizing separators
- **Do NOT** call `Path.resolve()` on UNC paths - it triggers network I/O
- **Do NOT** mutate `tool_input` - always create new objects for `updatedInput`

## References

### Claude Code Hooks Documentation

- [Hooks Reference](https://code.claude.com/docs/en/hooks) - Official PreToolUse schema, exit codes, `updatedInput` feature
- [Feature Request: Enhance PreToolUse Hooks #4368](https://github.com/anthropics/claude-code/issues/4368) - `updatedInput` feature request and implementation
- [ClaudeLog Hooks Guide](https://claudelog.com/mechanics/hooks/) - Performance best practices, timeout handling
- [DataCamp Claude Code Hooks Tutorial](https://www.datacamp.com/tutorial/claude-code-hooks) - Practical examples
- [GitButler Claude Code Hooks](https://docs.gitbutler.com/features/ai-integration/claude-code-hooks) - Integration patterns

### Python Cross-Platform Path Handling

- [pathlib vs os.path Trade-offs](https://www.pythonsnacks.com/p/paths-in-python-comparing-os-path-and-pathlib) - When to use each
- [Python pathlib Documentation](https://docs.python.org/3/library/pathlib.html) - Official reference
- [Avoiding Windows Backslash Problems](https://lerner.co.il/2018/07/24/avoiding-windows-backslash-problems-with-pythons-raw-strings/) - Raw strings and escaping
- [Handle Windows Paths in Python - Sentry](https://sentry.io/answers/handle-windows-paths-in-python/) - Common pitfalls
- [wslPath Library](https://github.com/akikuno/wslPath) - WSL path conversion patterns

### Implementation Patterns

- [disler/claude-code-hooks-mastery](https://github.com/disler/claude-code-hooks-mastery) - All 8 hook lifecycle events
- [karanb192/claude-code-hooks](https://github.com/karanb192/claude-code-hooks) - Security-focused PreToolUse examples
- [affaan-m/everything-claude-code](https://github.com/affaan-m/everything-claude-code) - Battle-tested production hooks
