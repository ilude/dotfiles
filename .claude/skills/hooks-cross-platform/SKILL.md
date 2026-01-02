# Cross-Platform Hooks and Status Scripts

Guidelines for writing Claude Code hooks and status scripts that work on Windows (PowerShell, Git Bash), WSL, and Linux.

## Activation

Activate when:
- Creating or modifying files in `.claude/hooks/`
- Creating or modifying `.claude/claude-status`
- Writing shell scripts that will run in Claude Code context
- Debugging hook execution failures

## Critical Rules

### 1. Shebang Lines

**Bash scripts**: Always use `#!/usr/bin/env bash` (NOT `#!/bin/bash`)
```bash
#!/usr/bin/env bash
# This finds bash in PATH - works on all platforms
```

**Python scripts**: Use `#!/usr/bin/env python` (NOT `python3`)
```python
#!/usr/bin/env python
# Windows often has 'python', not 'python3' in PATH
```

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
    # Python fallback (guaranteed available)
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

When running in WSL but receiving Windows paths from JSON:

```bash
# Convert C:/Users/... or C:\Users\... to /mnt/c/Users/...
to_wsl_path() {
    local p="$1"
    p="${p//\\//}"  # Backslash to forward slash
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

Strip drive letters and mount points for consistent display:

```bash
normalize_path() {
    local p="$1"
    p="${p//\\//}"          # Backslash to forward slash
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

Hooks receive input via stdin and output via stdout. Use JSON for data exchange to avoid quoting issues:

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

### 10. Tab Delimiter for Multi-Value Parsing

Handle spaces in paths by using tab delimiter:

```bash
# Use tab as delimiter to handle spaces in values
IFS=$'\t' read -r var1 var2 <<< $(python -c "
import json, sys
data = json.load(sys.stdin)
print(data.get('field1', '') + '\t' + data.get('field2', ''))
")
```

### 11. Silent Error Handling

Hooks should fail silently to avoid breaking Claude Code:

```python
try:
    # Hook logic
    print(json.dumps(result))
except Exception as e:
    # Log to stderr, return empty success
    print(json.dumps({"error": str(e)}), file=sys.stderr)
    print(json.dumps({}))
```

```bash
# Exit gracefully on errors
some_command 2>/dev/null || exit 0
```

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

## Complete Example: Cross-Platform Bash Hook

```bash
#!/usr/bin/env bash
# Cross-platform hook example

set -e

# Cross-platform home
USER_HOME="${HOME:-$USERPROFILE}"

# Read JSON from stdin
stdin_input=$(cat)

# Parse with jq or Python fallback
if command -v jq &>/dev/null; then
    cwd=$(echo "$stdin_input" | jq -r '.cwd // ""')
else
    cwd=$(echo "$stdin_input" | python -c "
import json, sys
data = json.load(sys.stdin)
print(data.get('cwd', ''))
")
fi

# WSL path conversion if needed
is_wsl() {
    [[ -n "$WSL_DISTRO_NAME" || -f /proc/sys/fs/binfmt_misc/WSLInterop ]]
}

if is_wsl; then
    cwd="${cwd//\\//}"
    if [[ "$cwd" =~ ^([A-Za-z]):/(.*) ]]; then
        cwd="/mnt/${BASH_REMATCH[1],,}/${BASH_REMATCH[2]}"
    fi
fi

# Do work with $cwd...

# Output JSON result
echo '{"hookSpecificOutput": {"additionalContext": "processed"}}'
```

## Complete Example: Cross-Platform Python Hook

```python
#!/usr/bin/env python
"""Cross-platform hook example."""
import json
import sys
import os
from pathlib import Path

def main():
    try:
        # Read input
        data = json.load(sys.stdin)
        cwd = Path(data.get('cwd', os.getcwd()))

        # pathlib handles cross-platform paths
        config_file = cwd / '.config' / 'settings.json'

        # os.path.expanduser works everywhere
        home = Path(os.path.expanduser('~'))

        # Do work...
        result = {"hookSpecificOutput": {"additionalContext": "done"}}
        print(json.dumps(result))

    except Exception as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        print(json.dumps({}))

if __name__ == "__main__":
    main()
```

## Debugging Hooks

1. Check `~/.claude/debug/` for error logs
2. Test script directly: `echo '{"cwd":"/tmp"}' | ./hooks/my-hook.py`
3. Verify line endings: `file hooks/my-hook.sh` (should show "ASCII text", not "with CRLF")
4. Check shebang: `head -1 hooks/my-hook.sh`
5. Verify permissions: `ls -la hooks/` (scripts need execute bit on Unix)

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
