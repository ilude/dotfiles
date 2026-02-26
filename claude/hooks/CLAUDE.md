# Cross-Platform Hooks

Guidelines for writing Claude Code hooks and status scripts that work on Windows (PowerShell, Git Bash), WSL, and Linux.

---

## Activation

Activate when:
- Creating or modifying files in `.claude/hooks/`
- Creating or modifying `.claude/claude-status`
- Writing shell scripts that will run in Claude Code context
- Debugging hook execution failures

---

## Critical Rules

### 0. Windows: Claude Code Runs Hooks via WSL (NOT Git Bash)

**CRITICAL**: On Windows with WSL installed, Claude Code spawns hook commands via **WSL bash**, not Git Bash.

**The Problem:**
- WSL bash runs as **non-interactive, non-login** shell
- `.bashrc`, `.profile`, `.zshenv` are NOT sourced
- `~/.local/bin` is NOT in PATH
- Tools like `uv`, `oh-my-posh` installed in `~/.local/bin` won't be found

**Detection** (hook debug output):
```
HOME: /home/mike           <- WSL home, not /c/Users/Mike
PWD: /mnt/c/Users/Mike/... <- WSL mount path format
Which uv: NOT FOUND        <- Tools in ~/.local/bin missing
Dollar-dash: hB            <- No 'i' (interactive) or 'l' (login)
```

**The Fix**: Use `bash -l` (login shell) in settings.json:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [{
          "type": "command",
          "command": "python $HOME/.claude/hooks/my-hook.py"
        }]
      }
    ]
  }
}
```

**Why bare `python` instead of `uv run`**: On Windows, `uv.exe` is a console-subsystem binary that allocates a visible `conhost.exe` window. Claude Code v2.1.45+ lost `windowsHide: true` on the hook spawn path, so every `uv run` hook flashes a console window. Bare `python` runs inside the existing bash process and doesn't flash. Hook dependencies must be pre-installed in system Python (see `install.ps1` / `install`).

### 1. Shebang Lines

**Bash scripts**: Always use `#!/usr/bin/env bash` (NOT `#!/bin/bash`)

**Python scripts**: Use `#!/usr/bin/env python` (NOT `python3`)

### 2. Line Endings

Scripts MUST use LF (Unix) line endings, not CRLF (Windows).

**Enforce in `.gitattributes`:**
```gitattributes
*.sh text eol=lf
*.py text eol=lf
.claude/claude-status text eol=lf
.claude/hooks/* text eol=lf
```

**Symptoms of CRLF issues:**
- `\r': command not found`
- `bad interpreter: No such file or directory`

### 3. Home Directory Detection

```bash
# Cross-platform: HOME on Unix, USERPROFILE on Windows
USER_HOME="${HOME:-$USERPROFILE}"
```

```python
import os
home = os.path.expanduser('~')  # Works everywhere
```

### 4. Tool Availability Pattern

Always check for tools before using, with fallback:

```bash
# jq-first with Python fallback
if command -v jq &>/dev/null; then
    result=$(echo "$json" | jq -r '.field')
else
    result=$(echo "$json" | python -c "
import json, sys
data = json.load(sys.stdin)
print(data.get('field', ''))
")
fi
```

### 5. WSL Detection

```bash
is_wsl() {
    [[ -n "$WSL_DISTRO_NAME" || -f /proc/sys/fs/binfmt_misc/WSLInterop ]]
}
```

### 6. Windows Path Conversion (for WSL)

```bash
# Convert C:/Users/... or C:\Users\... to /mnt/c/Users/...
to_wsl_path() {
    local p="$1"
    p="${p//\//}"  # Backslash to forward slash
    if [[ "$p" =~ ^([A-Za-z]):/(.*) ]]; then
        local drive="${BASH_REMATCH[1],,}"  # lowercase
        local rest="${BASH_REMATCH[2]}"
        echo "/mnt/$drive/$rest"
    else
        echo "$p"
    fi
}
```

### 7. Path Normalization for Display

```bash
normalize_path() {
    local p="$1"
    p="${p//\//}"          # Backslash to forward slash
    p="${p#[A-Za-z]:}"      # Remove C:
    p="${p#/[a-z]/}"        # Remove /c/
    p="${p#/mnt/[a-z]/}"    # Remove /mnt/c/
    echo "$p"
}
```

### 8. Platform Detection

```bash
if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" ]]; then
    # Windows Git Bash / MSYS2
    WIN_HOME=$(cygpath -w "$USER_HOME" 2>/dev/null || echo "$USERPROFILE")
elif [[ -n "$USERPROFILE" ]]; then
    # Windows without cygpath
    echo "Windows environment"
else
    # Unix (Linux/macOS)
    echo "Unix environment"
fi
```

### 9. JSON Input/Output

Hooks receive input via stdin and output via stdout:

```python
#!/usr/bin/env python
import json
import sys

# Read input
data = json.load(sys.stdin)
prompt = data.get('prompt', '')
cwd = data.get('cwd', '')

# Do work...

# Output result
output = {
    "hookSpecificOutput": {
        "additionalContext": "injected context here"
    }
}
print(json.dumps(output))
```

### 10. Silent Error Handling

Hooks should fail silently to avoid breaking Claude Code:

```python
try:
    # Hook logic
    print(json.dumps(result))
except Exception as e:
    print(json.dumps({"error": str(e)}), file=sys.stderr)
    print(json.dumps({}))
```

```bash
# Exit gracefully on errors
some_command 2>/dev/null || exit 0
```

---

## hooks.json Configuration

```json
{
  "hooks": [
    {
      "name": "my-hook",
      "event": "UserPromptSubmit",
      "script": "hooks/my-hook.py",
      "description": "What this hook does",
      "matchers": [
        {
          "field": "prompt",
          "regex": "^/mycommand"
        }
      ]
    }
  ]
}
```

**Available events:**
- `UserPromptSubmit` - Before prompt is processed
- `SessionStart` - When Claude Code session starts
- `PostToolUse` - After a tool is executed

---

## Debugging Hooks

1. Check `~/.claude/debug/` for error logs
2. Test script directly: `echo '{"cwd":"/tmp"}' | ./hooks/my-hook.py`
3. Verify line endings: `file hooks/my-hook.sh` (should show "ASCII text", not "with CRLF")
4. Check shebang: `head -1 hooks/my-hook.sh`
5. Verify permissions: `ls -la hooks/` (scripts need execute bit on Unix)

---

## Common Pitfalls

| Issue | Symptom | Fix |
|-------|---------|-----|
| `#!/bin/bash` shebang | "bad interpreter" on some systems | Use `#!/usr/bin/env bash` |
| `python3` shebang | "python3 not found" on Windows | Use `python` not `python3` |
| CRLF line endings | `\r': command not found` | Ensure LF endings, add `.gitattributes` |
| Hardcoded `/home/user` | Path not found | Use `${HOME:-$USERPROFILE}` or `os.path.expanduser('~')` |
| Windows paths in WSL | Git/file operations fail | Convert `C:/` to `/mnt/c/` |
| Spaces in paths | Arguments split incorrectly | Use tab delimiter or JSON |
| Missing tool (jq) | Script fails | Always provide Python fallback |
| WSL: uv/tools not found | "command not found" in hooks | Use `bash -l` for login shell |
| WSL: wrong HOME | HOME=/home/mike not Windows | Expected on WSL - use WINHOME or detect platform |
