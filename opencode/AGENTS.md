# OpenCode Global Instructions

Rules that apply to all OpenCode sessions. Project-specific rules in each repo's `AGENTS.md` take precedence.

## Windows Shell Safety

**MUST NOT use `2>nul`, `>nul`, or `2>&1 >nul` on Windows.** On Windows (PowerShell, cmd, Git Bash), redirecting to `nul` can create a literal file named `nul` that is difficult to delete. This is a well-known Windows filesystem issue.

Instead:

```bash
# Wrong - creates a literal 'nul' file on Windows
some_command 2>nul
some_command >nul 2>&1

# Correct - use /dev/null (works in Git Bash, MSYS2, WSL)
some_command 2>/dev/null
some_command >/dev/null 2>&1

# Correct - PowerShell equivalent
some_command 2>$null
some_command >$null 2>&1
```

If you detect the shell is PowerShell, use `$null`. If Bash/zsh (including Git Bash), use `/dev/null`. Never use `nul`.
