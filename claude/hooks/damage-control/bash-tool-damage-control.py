# /// script
# requires-python = ">=3.8"
# dependencies = ["pyyaml", "tree-sitter>=0.23.0", "tree-sitter-bash>=0.23.0"]
# ///
"""
Claude Code Security Firewall - Python/UV Implementation
=========================================================

Blocks dangerous commands before execution via PreToolUse hook.
Loads patterns from patterns.yaml for easy customization.

Exit codes:
  0 = Allow command (or JSON output with permissionDecision)
  2 = Block command (stderr fed back to Claude)

Environment variables:
  CLAUDE_DISABLE_HOOKS - Comma-separated list of hook names to disable
                         Use "damage-control" to disable this hook

  ┌─────────────────────────────────────────────────────────────────────┐
  │ WARNING FOR AI ASSISTANTS (Claude, Copilot, etc.):                  │
  │                                                                     │
  │ CLAUDE_DISABLE_HOOKS is for HOOK DEVELOPMENT ONLY.                  │
  │                                                                     │
  │ You may ONLY use this variable when ALL conditions are met:         │
  │   1. You are directly modifying THIS hook's code                    │
  │   2. Working directory is ~/.dotfiles OR ~/.claude                  │
  │   3. The hook is blocking edits to itself (circular dependency)     │
  │                                                                     │
  │ NEVER use this to bypass security checks during normal work.        │
  │ If a hook blocks an operation, FIX THE ISSUE instead of disabling.  │
  └─────────────────────────────────────────────────────────────────────┘

JSON output for ask patterns:
  {"hookSpecificOutput": {"hookEventName": "PreToolUse",
    "permissionDecision": "ask", "permissionDecisionReason": "..."}}
"""

import fnmatch
import json
import os
import re
import subprocess
import sys
import time
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Callable, Optional

import yaml

HOOK_NAME = "damage-control"


def is_hook_disabled() -> bool:
    """Check if this hook is disabled via CLAUDE_DISABLE_HOOKS env var."""
    disabled_hooks = os.environ.get("CLAUDE_DISABLE_HOOKS", "")
    return HOOK_NAME in [h.strip() for h in disabled_hooks.split(",")]


# ============================================================================
# CONFIGURATION COMPILATION AND CACHING
# ============================================================================

# Module-level cache for compiled configuration
_compiled_config_cache: Optional[dict[str, Any]] = None


def compile_regex_patterns(patterns: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Pre-compile regex patterns from bashToolPatterns config.

    Args:
        patterns: List of pattern dictionaries from YAML config.

    Returns:
        List of pattern dictionaries with added 'compiled' field containing
        compiled regex objects. Invalid patterns are skipped with warning.
    """
    compiled = []
    for idx, item in enumerate(patterns):
        pattern = item.get("pattern", "")
        if not pattern:
            continue

        try:
            # Pre-compile with IGNORECASE flag (used throughout check_command)
            compiled_regex = re.compile(pattern, re.IGNORECASE)
            # Create new dict with compiled pattern added
            compiled_item = item.copy()
            compiled_item["compiled"] = compiled_regex
            compiled.append(compiled_item)
        except re.error as e:
            # Skip invalid patterns with warning (don't crash)
            print(
                f"Warning: Invalid regex pattern at index {idx}: {pattern} - {e}",
                file=sys.stderr,
            )
            continue

    return compiled


def _build_glob_path_obj(path: str) -> Optional[dict[str, Any]]:
    """Build pre-processed glob path object, or None if invalid."""
    path_obj: dict[str, Any] = {"original": path, "is_glob": True}
    try:
        glob_regex_str = glob_to_regex(path)
        path_obj["glob_regex"] = re.compile(glob_regex_str, re.IGNORECASE)
        return path_obj
    except re.error as e:
        print(f"Warning: Invalid glob pattern: {path} - {e}", file=sys.stderr)
        return None


def _build_literal_path_obj(path: str) -> Optional[dict[str, Any]]:
    """Build pre-processed literal path object, or None if invalid."""
    path_obj: dict[str, Any] = {"original": path, "is_glob": False}
    try:
        expanded = os.path.expanduser(path)
        path_obj["expanded"] = expanded
        path_obj["escaped_expanded"] = re.escape(expanded)
        path_obj["escaped_original"] = re.escape(path)
        return path_obj
    except Exception as e:
        print(f"Warning: Failed to process path: {path} - {e}", file=sys.stderr)
        return None


def preprocess_path_list(paths: list[str]) -> list[dict[str, Any]]:
    """Pre-process path list for fast matching.

    For glob patterns: pre-compile glob-to-regex conversion
    For literal paths: pre-compute expanded path and escaped forms
    """
    processed = []
    for path in paths:
        if not path:
            continue
        builder = _build_glob_path_obj if is_glob_pattern(path) else _build_literal_path_obj
        path_obj = builder(path)
        if path_obj is not None:
            processed.append(path_obj)
    return processed


def compile_config(config: dict[str, Any]) -> dict[str, Any]:
    """Compile configuration for fast pattern matching.

    Pre-processes all patterns and paths at load time:
    - Compiles all regex patterns with IGNORECASE
    - Pre-processes all path lists (glob-to-regex, expanduser, re.escape)
    """
    compiled = config.copy()
    compiled["bashToolPatterns_compiled"] = compile_regex_patterns(
        config.get("bashToolPatterns", [])
    )
    compiled["zeroAccessPaths_compiled"] = preprocess_path_list(config.get("zeroAccessPaths", []))
    compiled["zeroAccessExclusions_compiled"] = preprocess_path_list(
        config.get("zeroAccessExclusions", [])
    )
    compiled["readOnlyPaths_compiled"] = preprocess_path_list(config.get("readOnlyPaths", []))
    compiled["noDeletePaths_compiled"] = preprocess_path_list(config.get("noDeletePaths", []))
    return compiled


def get_compiled_config() -> dict[str, Any]:
    """Get compiled configuration, using module-level cache."""
    global _compiled_config_cache

    if _compiled_config_cache is None:
        raw_config = load_config()
        _compiled_config_cache = compile_config(raw_config)

    return _compiled_config_cache


# ============================================================================
# AUDIT LOGGING
# ============================================================================


def get_log_path() -> Path:
    """Get path to daily audit log file.

    Creates ~/.claude/logs/damage-control/ directory if it doesn't exist.
    Returns path in format: ~/.claude/logs/damage-control/YYYY-MM-DD.log
    """
    logs_dir = Path(os.path.expanduser("~")) / ".claude" / "logs" / "damage-control"
    logs_dir.mkdir(parents=True, exist_ok=True)

    date_str = datetime.now().strftime("%Y-%m-%d")
    return logs_dir / f"{date_str}.log"


# Secret-redaction patterns: (regex, flags)
_REDACTION_PATTERNS: list[tuple[str, int]] = [
    (r"apikey\s*=\s*[\w\-\.]+", re.IGNORECASE),
    (r"api_key\s*=\s*[\w\-\.]+", re.IGNORECASE),
    (r"token\s*=\s*[\w\-\.]{20,}", re.IGNORECASE),
    (r"bearer\s+[\w\-\.]+", re.IGNORECASE),
    (r"password\s*=\s*\S+", re.IGNORECASE),
    (r"passwd\s*=\s*\S+", re.IGNORECASE),
    (r"pwd\s*=\s*\S+", re.IGNORECASE),
    (r"-p\S+", 0),  # MySQL -pPassword or similar
    (r"AKIA[0-9A-Z]{16}", 0),
    (r"secret\s*=\s*\S+", re.IGNORECASE),
    (r"credential\s*=\s*\S+", re.IGNORECASE),
    (r"GITHUB_TOKEN\s*=\s*\S+", re.IGNORECASE),
    (r"NPM_TOKEN\s*=\s*\S+", re.IGNORECASE),
    (r"DOCKER_PASSWORD\s*=\s*\S+", re.IGNORECASE),
]


def redact_secrets(command: str) -> str:
    """Redact sensitive information from command string.

    Returns the command with secrets replaced by ***REDACTED***.
    """
    redacted = command
    for pattern, flags in _REDACTION_PATTERNS:
        try:
            redacted = re.sub(pattern, "***REDACTED***", redacted, flags=flags)
        except re.error:
            pass
    return redacted


def _truncate_for_log(text: str, limit: int = 200) -> str:
    """Truncate text to limit chars, appending ellipsis when truncated."""
    if len(text) <= limit:
        return text
    return text[:limit] + "..."


@dataclass
class DecisionFlags:
    """Metadata flags accompanying a security decision log entry."""

    unwrapped: bool = False
    semantic_match: bool = False


def log_decision(
    tool_name: str,
    command: str,
    decision: str,
    reason: str,
    pattern_matched: str = "",
    flags: Optional[DecisionFlags] = None,
    context: Optional[str] = None,
) -> None:
    """Log security decision to audit log in JSONL format.

    One JSON object per line, containing timestamp, tool, command (truncated),
    redacted command, decision (blocked/ask/allowed), reason, flags, and context.
    """
    flags = flags or DecisionFlags()
    try:
        log_entry = {
            "timestamp": datetime.now().isoformat(),
            "tool": tool_name,
            "command": _truncate_for_log(command),
            "command_redacted": _truncate_for_log(redact_secrets(command)),
            "decision": decision,
            "reason": reason,
            "pattern_matched": pattern_matched,
            "user": os.getenv("USER", "unknown"),
            "cwd": os.getcwd(),
            "unwrapped": flags.unwrapped,
            "semantic_match": flags.semantic_match,
            "context": context,
        }
        with open(get_log_path(), "a") as f:
            f.write(json.dumps(log_entry) + "\n")
    except Exception as e:
        print(f"Warning: Failed to write audit log: {e}", file=sys.stderr)


def _build_rotation_kwargs() -> dict[str, Any]:
    """Build platform-specific subprocess kwargs for fire-and-forget rotation."""
    kwargs: dict[str, Any] = {
        "stdout": subprocess.DEVNULL,
        "stderr": subprocess.DEVNULL,
    }
    if sys.platform == "win32":
        kwargs["creationflags"] = subprocess.DETACHED_PROCESS | subprocess.CREATE_NO_WINDOW
    else:
        kwargs["start_new_session"] = True
    return kwargs


def _rotation_recently_ran(ts_file: Path) -> bool:
    """Return True if rotation has run within the last hour (debounce)."""
    try:
        if ts_file.exists() and (time.time() - ts_file.stat().st_mtime) < 3600:
            return True
        ts_file.touch()
    except OSError:
        pass
    return False


def spawn_log_rotation() -> None:
    """Fire-and-forget log rotation. Non-blocking, cross-platform.

    Debounced: only spawns the rotation subprocess if >1 hour has elapsed
    since the last rotation attempt.
    """
    rotate_script = Path(__file__).parent / "log_rotate.py"
    if not rotate_script.exists():
        return
    if _rotation_recently_ran(Path(__file__).parent / ".last-rotation"):
        return
    try:
        subprocess.Popen(
            [sys.executable, str(rotate_script)],
            **_build_rotation_kwargs(),
        )
    except OSError:
        pass


# ============================================================================
# SHELL WRAPPER UNWRAPPING
# ============================================================================


def extract_system_call(python_code: str) -> Optional[str]:
    """Extract shell commands from Python code strings.

    Detects patterns like os.system('cmd'), subprocess.run(['cmd', 'args']), etc.
    """
    if not python_code:
        return None

    string_patterns = [
        r'os\.system\s*\(\s*["\']([^"\']+)["\']\s*\)',
        r'subprocess\.(?:run|call|check_call|check_output|Popen)\s*\(\s*["\']([^"\']+)["\']\s*\)',
    ]
    for pattern in string_patterns:
        match = re.search(pattern, python_code)
        if match:
            return match.group(1)

    list_pattern = r"subprocess\.(?:run|call|check_call|check_output|Popen)\s*\(\s*\[([^\]]+)\]"
    match = re.search(list_pattern, python_code)
    if match:
        parts = re.findall(r'["\']([^"\']+)["\']', match.group(1))
        if parts:
            return " ".join(parts)

    return None


_SHELL_WRAPPERS = ("bash", "sh", "zsh", "ksh", "dash")
_PYTHON_WRAPPERS = ("python", "python2", "python3")


def _try_unwrap_shell_dash_c(command: str) -> Optional[str]:
    """If command is `<shell> -c "..."`, return the inner command."""
    for shell in _SHELL_WRAPPERS:
        pattern = rf'\b{shell}\s+-c\s+(["\'])(.+?)\1'
        match = re.search(pattern, command)
        if match:
            return match.group(2)
    return None


def _try_unwrap_python_dash_c(command: str) -> Optional[str]:
    """If command is `<python> -c "..."`, return the extracted shell call or code."""
    for python_cmd in _PYTHON_WRAPPERS:
        pattern = rf'\b{python_cmd}\s+-c\s+(["\'])(.+?)\1'
        match = re.search(pattern, command)
        if match:
            python_code = match.group(2)
            return extract_system_call(python_code) or python_code
    return None


def _try_unwrap_env(command: str) -> Optional[str]:
    """If command is an `env VAR=val ...` invocation, return the inner command."""
    # Anchor to start (or after | ; &) to avoid matching `poetry env remove` etc.
    env_pattern = r"(?:^|[|;&]+\s*)env\s+(?:[A-Z_][A-Z0-9_]*=[^\s]+\s+)*(.+)"
    match = re.search(env_pattern, command)
    return match.group(1) if match else None


def unwrap_command(command: str, depth: int = 0) -> tuple[str, bool]:
    """Recursively unwrap shell wrapper commands.

    Detects bash/sh/zsh/ksh/dash -c, python -c, and env VAR=val wrappers.
    Returns (unwrapped_command, was_unwrapped). Recursion is capped at depth 5.
    """
    if depth >= 5:
        return command, depth > 0

    if not command or not command.strip():
        return command, False

    command = command.strip()

    for unwrapper in (_try_unwrap_shell_dash_c, _try_unwrap_python_dash_c, _try_unwrap_env):
        inner = unwrapper(command)
        if inner is not None:
            return unwrap_command(inner, depth + 1)

    return command, depth > 0


# ============================================================================
# READ-ONLY COMMAND DETECTION
# ============================================================================

# Commands that only read/query information and don't access file contents
# These can safely reference zero-access paths without triggering blocks
READONLY_GIT_COMMANDS = [
    r"\bgit\s+check-ignore\b",
    r"\bgit\s+ls-files\b",
    r"\bgit\s+ls-tree\b",
    r"\bgit\s+status\b",
    r"\bgit\s+diff\s+--name",
    r"\bgit\s+log\s+--name",
    r"\bgit\s+rev-parse\b",
    r"\bgit\s+branch\b",
    r"\bgit\s+remote\b",
    r"\bgit\s+config\b",
    r"\bgit\s+show-ref\b",
    # git rm --cached only removes from index, not filesystem
    r"\bgit\s+rm\s+.*--cached\b",
]


def is_readonly_git_command(command: str) -> bool:
    """Check if command is a read-only git command that doesn't access file contents."""
    return any(re.search(p, command, re.IGNORECASE) for p in READONLY_GIT_COMMANDS)


# ============================================================================
# SSH IDENTITY COMMAND DETECTION
# ============================================================================

# Commands that USE an SSH key without exposing its contents.
# ssh/scp/sftp -i tell the binary which key to use internally; the contents
# never reach the caller's context. ssh-keygen -l prints only a fingerprint.
# ssh-keyscan fetches server public keys, never private material. These are
# silent-allowed against ssh-protected zeroAccessPaths patterns.
SSH_USE_COMMANDS = [
    # ssh -i path/to/key user@host ...
    r"\bssh\s+.*-i\s+",
    # scp -i path/to/key ...
    r"\bscp\s+.*-i\s+",
    # sftp -i path/to/key ...
    r"\bsftp\s+.*-i\s+",
    # git operations that pass SSH key via GIT_SSH_COMMAND or -c core.sshCommand
    r"\bGIT_SSH_COMMAND\s*=\s*",
    # ssh-keygen -l (fingerprint, doesn't print private key)
    r"\bssh-keygen\s+.*-l\b",
    # ssh-keyscan (fetches server public keys, not private)
    r"\bssh-keyscan\b",
]

# Commands that INSPECT metadata of an SSH-protected path.
# ls/stat/file return filenames, sizes, mtimes -- not key contents, but enough
# metadata that an explicit confirmation gate is appropriate. These ASK rather
# than silent-allow against ssh-protected zeroAccessPaths patterns.
SSH_INSPECT_COMMANDS = [
    r"^\s*ls\s+",
    r"^\s*stat\s+",
    r"^\s*file\s+",
]

# Backward-compat union for any caller that doesn't care about the split.
SSH_SAFE_COMMANDS = SSH_USE_COMMANDS + SSH_INSPECT_COMMANDS

# zeroAccessPaths globs that are SSH-related and therefore eligible for the
# USE silent-allow / INSPECT ask treatment. Includes ~/.ssh/ canonical key
# directory and the cert globs covering keys placed elsewhere (AWS .pem,
# PuTTY .ppk, PKCS#12 .p12/.pfx).
_SSH_PROTECTED_PATTERN_ORIGINALS = frozenset(
    {
        "~/.ssh/",
        "~/.ssh",
        "$HOME/.ssh/",
        "$HOME/.ssh",
        "*.pem",
        "*.ppk",
        "*.p12",
        "*.pfx",
    }
)


def is_ssh_use_command(command: str) -> bool:
    """True if command USES an SSH key without exposing contents (silent-allow)."""
    return any(re.search(p, command, re.IGNORECASE) for p in SSH_USE_COMMANDS)


def is_ssh_inspect_command(command: str) -> bool:
    """True if command inspects path metadata (ask, not silent-allow)."""
    return any(re.search(p, command, re.IGNORECASE) for p in SSH_INSPECT_COMMANDS)


def is_ssh_safe_command(command: str) -> bool:
    """Backward-compat: True if command is USE or INSPECT.

    Prefer is_ssh_use_command / is_ssh_inspect_command in new code.
    """
    return is_ssh_use_command(command) or is_ssh_inspect_command(command)


def _is_ssh_protected_pattern(path_obj: dict[str, Any]) -> bool:
    """True if a zeroAccessPaths entry represents an SSH-related path/glob."""
    original = path_obj.get("original", "")
    if not original:
        return False
    if original in _SSH_PROTECTED_PATTERN_ORIGINALS:
        return True
    return original.rstrip("/\\") in {
        s.rstrip("/\\") for s in _SSH_PROTECTED_PATTERN_ORIGINALS
    }


def _is_ssh_dir_path(path_obj: dict[str, Any]) -> bool:
    """Backward-compat alias.

    Originally narrow (~/.ssh/ only); now covers *.pem/*.ppk/*.p12/*.pfx
    too, since those are equivalent SSH-related zero-access patterns.
    """
    return _is_ssh_protected_pattern(path_obj)


# ============================================================================
# BASH COMMENT STRIPPING
# ============================================================================


def strip_bash_comments(command: str) -> str:
    """Strip bash comments from a command string.

    Removes full-line and inline comments while preserving #-in-quotes,
    parameter expansion (${var#pattern}) and shebang lines.
    """
    result_lines = []
    for line in command.split("\n"):
        stripped = line.lstrip()
        if stripped.startswith("#") and not stripped.startswith("#!"):
            continue
        cleaned = _strip_inline_comment(line)
        if cleaned.strip():
            result_lines.append(cleaned)
    return "\n".join(result_lines)


@dataclass
class _QuoteState:
    """Tracks single/double quote state during a left-to-right scan."""

    in_single: bool = False
    in_double: bool = False

    def update(self, ch: str) -> None:
        if ch == "'" and not self.in_double:
            self.in_single = not self.in_single
        elif ch == '"' and not self.in_single:
            self.in_double = not self.in_double

    @property
    def in_quotes(self) -> bool:
        return self.in_single or self.in_double


def _is_comment_start(line: str, i: int) -> bool:
    """Return True if `#` at position i begins an inline comment."""
    return i == 0 or line[i - 1] in (" ", "\t")


def _strip_inline_comment(line: str) -> str:
    """Remove inline comment from a single line, respecting quotes.

    Only strips # that is preceded by whitespace (or is at start)
    and is outside of single/double quotes.
    """
    state = _QuoteState()
    i = 0
    while i < len(line):
        c = line[i]
        # Handle escape (not inside single quotes)
        if c == "\\" and not state.in_single and i + 1 < len(line):
            i += 2
            continue
        if c == "#" and not state.in_quotes and _is_comment_start(line, i):
            return line[:i].rstrip()
        state.update(c)
        i += 1
    return line


# ============================================================================
# DRY-RUN DETECTION
# ============================================================================

# Tools that support --dry-run as a valid simulation/preview flag.
_DRY_RUN_TOOLS = [
    r"^\s*helm\b",
    r"^\s*kubectl\b",
    r"^\s*docker\s+compose\b",
    r"^\s*docker\b",
    r"^\s*argocd\s+app\s+sync\b",
]


def _has_valid_dry_run(command: str) -> bool:
    """Check if command uses --dry-run with a tool that actually supports it."""
    if not re.search(r"--dry-run\b", command):
        return False
    return any(re.search(pattern, command, re.IGNORECASE) for pattern in _DRY_RUN_TOOLS)


# ============================================================================
# READ-ONLY SEARCH PIPELINE DETECTION
# ============================================================================

# Read-only commands whose arguments may contain dangerous-looking strings
# that should NOT trigger bashToolPatterns. Only the first command in a pipe
# chain is checked against this list.
READONLY_SEARCH_COMMANDS = [
    # Search tools
    r"^\s*grep\b",
    r"^\s*egrep\b",
    r"^\s*fgrep\b",
    r"^\s*rg\b",
    r"^\s*ag\b",
    r"^\s*ack\b",
    r"^\s*git\s+grep\b",
    r"^\s*git\s+log\b",
    r"^\s*git\s+show\b",
    r"^\s*git\s+diff\b",
    # File search tools
    r"^\s*find\b",
    # Display-only commands
    r"^\s*echo\b",
    r"^\s*printf\b",
    r"^\s*cat\s*<<",
    # Read-only CLI subcommands
    r"^\s*kubectl\s+get\b",
    r"^\s*kubectl\s+describe\b",
    r"^\s*kubectl\s+logs?\b",
    r"^\s*kubectl\s+top\b",
    r"^\s*kubectl\s+cluster-info\b",
    r"^\s*kubectl\s+api-resources\b",
    r"^\s*kubectl\s+explain\b",
    r"^\s*helm\s+list\b",
    r"^\s*helm\s+ls\b",
    r"^\s*helm\s+status\b",
    r"^\s*helm\s+get\b",
    r"^\s*helm\s+show\b",
    r"^\s*helm\s+search\b",
    r"^\s*terraform\s+show\b",
    r"^\s*terraform\s+state\s+list\b",
    r"^\s*terraform\s+output\b",
    r"^\s*terraform\s+plan\b(?!.*-var-file=\S*\.tfvars)",
    # Modern search tools
    r"^\s*fd\b",
    r"^\s*locate\b",
    r"^\s*plocate\b",
    # Directory/file info
    r"^\s*ls\b",
    r"^\s*tree\b",
    r"^\s*stat\b",
    r"^\s*file\b",
    r"^\s*du\b",
    # Command lookup
    r"^\s*which\b",
    r"^\s*type\b",
    r"^\s*command\s+-v\b",
    # Path resolution
    r"^\s*readlink\b",
    r"^\s*realpath\b",
    # File comparison/inspection
    r"^\s*diff\b",
    r"^\s*colordiff\b",
    r"^\s*strings\b",
    r"^\s*hexdump\b",
    r"^\s*xxd\b",
    # Additional git read-only
    r"^\s*git\s+status\b",
    r"^\s*git\s+branch\b",
    r"^\s*git\s+remote\b",
    r"^\s*git\s+tag\b",
    r"^\s*git\s+stash\s+list\b",
    r"^\s*git\s+config\b",
    r"^\s*git\s+rev-parse\b",
    r"^\s*git\s+ls-files\b",
    r"^\s*git\s+ls-tree\b",
    r"^\s*git\s+cat-file\b",
    r"^\s*git\s+check-ignore\b",
    r"^\s*git\s+name-rev\b",
    r"^\s*git\s+describe\b",
]

# Commands with no filesystem side effects — transparent to the read-only check.
INERT_COMMANDS = [
    r"^\s*cd\b",
    r"^\s*pushd\b",
    r"^\s*popd\b",
    r"^\s*export\b",
    r"^\s*true\b",
    r"^\s*:$",
]

# Safe pipe targets (read-only display/transform tools).
READONLY_PIPE_TARGETS = [
    r"^\s*head\b",
    r"^\s*tail\b",
    r"^\s*sort\b",
    r"^\s*uniq\b",
    r"^\s*wc\b",
    r"^\s*less\b",
    r"^\s*more\b",
    r"^\s*cat\b",
    r"^\s*cut\b",
    r"^\s*tr\b",
    r"^\s*awk\b",
    r"^\s*sed\b",
    r"^\s*column\b",
    r"^\s*fmt\b",
    r"^\s*fold\b",
    r"^\s*nl\b",
    r"^\s*tac\b",
    r"^\s*rev\b",
    r"^\s*grep\b",
    r"^\s*egrep\b",
    r"^\s*fgrep\b",
    r"^\s*rg\b",
    r"^\s*jq\b",
    r"^\s*yq\b",
    r"^\s*bat\b",
    r"^\s*echo\b",
    r"^\s*printf\b",
    r"^\s*paste\b",
    r"^\s*strings\b",
    r"^\s*sha256sum\b",
    r"^\s*md5sum\b",
    r"^\s*expand\b",
    r"^\s*unexpand\b",
    r"^\s*diff\b",
    r"^\s*colordiff\b",
    r"^\s*hexdump\b",
    r"^\s*xxd\b",
    r"^\s*file\b",
    r"^\s*stat\b",
    r"^\s*basename\b",
    r"^\s*dirname\b",
]


def _flush_segment(current: list[str], segments: list[str]) -> list[str]:
    """Flush the in-progress char buffer into segments and return a fresh buffer."""
    segments.append("".join(current).strip())
    return []


def _consume_escape(buf: list[str], text: str, i: int, state: _QuoteState) -> Optional[int]:
    """If text[i] starts a backslash escape, append the pair to buf and return new i."""
    if text[i] == "\\" and not state.in_single and i + 1 < len(text):
        buf.append(text[i])
        buf.append(text[i + 1])
        return i + 2
    return None


def _try_split_operator(
    command: str,
    i: int,
    current: list[str],
    segments: list[str],
) -> tuple[list[str], int]:
    """Handle a potential operator at command[i].

    Returns ``(buffer, advance)`` where ``buffer`` is the next ``current`` list
    (a fresh list when an operator was consumed) and ``advance`` is the number
    of characters to step over.
    """
    consumed = _consume_operator(command, i, command[i])
    if consumed == 0:
        current.append(command[i])
        return current, 1
    return _flush_segment(current, segments), consumed


def _split_on_shell_operators(command: str) -> list[str]:
    """Split command on &&, ||, ;, & respecting quoted strings.

    Handles ``&&``, ``||``, ``;``, and ``&`` (background). Pipe chains (|)
    are kept intact within each segment.
    """
    segments: list[str] = []
    current: list[str] = []
    state = _QuoteState()
    i = 0
    n = len(command)

    while i < n:
        new_i = _consume_escape(current, command, i, state)
        if new_i is not None:
            i = new_i
            continue

        c = command[i]
        if state.in_quotes or c not in (";", "&", "|"):
            current.append(c)
            state.update(c)
            i += 1
            continue

        current, advance = _try_split_operator(command, i, current, segments)
        i += advance

    if current:
        segments.append("".join(current).strip())

    return [s for s in segments if s]


def _consume_operator(command: str, i: int, c: str) -> int:
    """Return number of chars consumed if a shell operator starts at i, else 0.

    Recognises ``;``, ``&``, ``&&``, ``||``. A bare ``|`` is NOT a segment
    operator (pipes stay intact within segments) and returns 0.
    """
    next_c = command[i + 1] if i + 1 < len(command) else ""
    if c == ";":
        return 1
    if c == "&":
        return 2 if next_c == "&" else 1
    if c == "|" and next_c == "|":
        return 2
    return 0


def _split_pipe_chain(segment: str) -> list[str]:
    """Split a command segment on | (pipe) respecting quoted strings.

    Must be called AFTER _split_on_shell_operators so that || is already removed.
    """
    parts: list[str] = []
    current: list[str] = []
    state = _QuoteState()
    i = 0
    n = len(segment)

    while i < n:
        new_i = _consume_escape(current, segment, i, state)
        if new_i is not None:
            i = new_i
            continue
        c = segment[i]
        if not state.in_quotes and c == "|":
            current = _flush_segment(current, parts)
        else:
            current.append(c)
            state.update(c)
        i += 1

    if current:
        parts.append("".join(current).strip())

    return [p for p in parts if p]


def _matches_any(text: str, patterns: list[str]) -> bool:
    """Return True if any regex in patterns matches text (case-insensitive)."""
    return any(re.search(p, text, re.IGNORECASE) for p in patterns)


def _is_readonly_search_pipeline(segment: str) -> bool:
    """Check if a pipe chain is a read-only search pipeline."""
    pipe_parts = _split_pipe_chain(segment)
    if not pipe_parts:
        return False
    if not _matches_any(pipe_parts[0], READONLY_SEARCH_COMMANDS):
        return False
    return all(_matches_any(target, READONLY_PIPE_TARGETS) for target in pipe_parts[1:])


def is_readonly_search_command(command: str) -> bool:
    """Check if a compound command is a read-only search operation."""
    segments = _split_on_shell_operators(command)
    if not segments:
        return False

    has_search = False
    for seg in segments:
        if _is_readonly_search_pipeline(seg):
            has_search = True
        elif _matches_any(seg.strip(), INERT_COMMANDS):
            continue
        else:
            return False
    return has_search


# ============================================================================
# GIT SEMANTIC ANALYSIS
# ============================================================================


def _has_combined_short_flag(args: list[str], flag_chars: str) -> bool:
    """Return True if any short-flag bundle (e.g. ``-fb``) contains any of flag_chars."""
    for arg in args:
        if arg.startswith("-") and not arg.startswith("--") and len(arg) > 1:
            if any(ch in arg[1:] for ch in flag_chars):
                return True
    return False


def _checkout_discards_via_dash(args: list[str]) -> bool:
    """True if `git checkout -- <paths>` form is present (discards local changes)."""
    if "--" not in args:
        return False
    dash_idx = args.index("--")
    return dash_idx < len(args) - 1


def _analyze_git_checkout(args: list[str]) -> tuple[bool, str]:
    """Semantic analysis for `git checkout ...`."""
    # Safe: -b or --branch creates a new branch
    if "-b" in args or "--branch" in args:
        return False, ""

    if _checkout_discards_via_dash(args):
        return True, "git checkout with -- discards uncommitted changes"

    if "--force" in args or "-f" in args or _has_combined_short_flag(args, "f"):
        return True, "git checkout --force discards uncommitted changes"

    return False, ""


def _analyze_git_push(args: list[str], args_str: str) -> tuple[bool, str]:
    """Semantic analysis for `git push ...`."""
    # Safe: --force-with-lease (handled by patterns.yaml with ask: true)
    if "--force-with-lease" in args_str:
        return False, ""

    if "--force" in args or "-f" in args:
        return True, "git push --force can overwrite remote history without safety checks"

    if _has_combined_short_flag(args, "f"):
        return True, "git push -f can overwrite remote history without safety checks"

    return False, ""


def _analyze_git_reset(args: list[str]) -> tuple[bool, str]:
    """Semantic analysis for `git reset ...`."""
    if "--soft" in args or "--mixed" in args:
        return False, ""
    if "--hard" in args:
        return True, "git reset --hard permanently discards uncommitted changes"
    return False, ""


def _analyze_git_clean(args: list[str]) -> tuple[bool, str]:
    """Semantic analysis for `git clean ...`."""
    if "-f" in args or "-d" in args:
        return True, "git clean removes untracked files permanently"
    if _has_combined_short_flag(args, "fd"):
        return True, "git clean removes untracked files permanently"
    return False, ""


# Dispatch table mapping git subcommand → analyzer.
# Each analyzer accepts (args, args_str) and returns (is_dangerous, reason).
_GIT_ANALYZERS: dict[str, Callable[[list[str], str], tuple[bool, str]]] = {
    "checkout": lambda args, _s: _analyze_git_checkout(args),
    "push": _analyze_git_push,
    "reset": lambda args, _s: _analyze_git_reset(args),
    "clean": lambda args, _s: _analyze_git_clean(args),
}


def analyze_git_command(command: str) -> tuple[bool, str]:
    """Analyze git commands for dangerous operations based on semantic understanding.

    Distinguishes between safe and dangerous git operations:
    - Safe: git checkout -b feature, git push --force-with-lease
    - Dangerous: git checkout -- ., git reset --hard, git push --force

    Returns (is_dangerous, reason) — reason is empty when is_dangerous is False.
    """
    if not command or not command.strip():
        return False, ""

    command = command.strip()
    if not command.startswith("git "):
        return False, ""

    parts = command.split()
    if len(parts) < 2:
        return False, ""

    subcommand = parts[1]
    args = parts[2:]
    analyzer = _GIT_ANALYZERS.get(subcommand)
    if analyzer is None:
        return False, ""
    return analyzer(args, " ".join(args))


def is_glob_pattern(pattern: str) -> bool:
    """Check if pattern contains glob wildcards."""
    return "*" in pattern or "?" in pattern or "[" in pattern


def glob_to_regex(glob_pattern: str) -> str:
    """Convert a glob pattern to a regex pattern for matching in commands."""
    result = ""
    for char in glob_pattern:
        if char == "*":
            result += r"[^\s/]*"
        elif char == "?":
            result += r"[^\s/]"
        elif char in r"\.^$+{}[]|()":
            result += "\\" + char
        else:
            result += char
    # Prevent matching method names like json.dumps when pattern is *.dump
    result += r"(?!\w)"
    return result


# ============================================================================
# OPERATION PATTERNS - Edit these to customize what operations are blocked
# ============================================================================
# {path} will be replaced with the escaped path at runtime

WRITE_PATTERNS = [
    (r">\s*{path}", "write"),
    (r"\btee\s+(?!.*-a).*{path}", "write"),
]

APPEND_PATTERNS = [
    (r">>\s*{path}", "append"),
    (r"\btee\s+-a\s+.*{path}", "append"),
    (r"\btee\s+.*-a.*{path}", "append"),
]

EDIT_PATTERNS = [
    (r"\bsed\s+-i.*{path}", "edit"),
    (r"\bperl\s+-[^\s]*i.*{path}", "edit"),
    (r"\bawk\s+-i\s+inplace.*{path}", "edit"),
]

MOVE_COPY_PATTERNS = [
    (r"\bmv\s+.*\s+{path}", "move"),
    (r"\bcp\s+.*\s+{path}", "copy"),
]

DELETE_PATTERNS = [
    (r"\brm\s+.*{path}", "delete"),
    (r"\bunlink\s+.*{path}", "delete"),
    (r"\brmdir\s+.*{path}", "delete"),
    (r"\bshred\s+.*{path}", "delete"),
]

PERMISSION_PATTERNS = [
    (r"\bchmod\s+.*{path}", "chmod"),
    (r"\bchown\s+.*{path}", "chown"),
    (r"\bchgrp\s+.*{path}", "chgrp"),
]

TRUNCATE_PATTERNS = [
    (r"\btruncate\s+.*{path}", "truncate"),
    (r":\s*>\s*{path}", "truncate"),
]

# Combined patterns for read-only paths (block ALL modifications)
READ_ONLY_BLOCKED = (
    WRITE_PATTERNS
    + APPEND_PATTERNS
    + EDIT_PATTERNS
    + MOVE_COPY_PATTERNS
    + DELETE_PATTERNS
    + PERMISSION_PATTERNS
    + TRUNCATE_PATTERNS
)

# Patterns for no-delete paths (block ONLY delete operations)
NO_DELETE_BLOCKED = DELETE_PATTERNS

# ============================================================================
# CONFIGURATION LOADING
# ============================================================================


def get_config_path() -> Path:
    """Get path to patterns.yaml, checking multiple locations."""
    # 1. Check project hooks directory (installed location)
    project_dir = os.environ.get("CLAUDE_PROJECT_DIR")
    if project_dir:
        project_config = (
            Path(project_dir) / ".claude" / "hooks" / "damage-control" / "patterns.yaml"
        )
        if project_config.exists():
            return project_config

    # 2. Check script's own directory (installed location)
    script_dir = Path(__file__).parent
    local_config = script_dir / "patterns.yaml"
    if local_config.exists():
        return local_config

    # 3. Check skill root directory (development location)
    skill_root = script_dir.parent.parent / "patterns.yaml"
    if skill_root.exists():
        return skill_root

    return local_config  # Default, even if it doesn't exist


def load_config() -> dict[str, Any]:
    """Load patterns from YAML config file."""
    config_path = get_config_path()

    if not config_path.exists():
        print(f"Warning: Config not found at {config_path}", file=sys.stderr)
        return {
            "bashToolPatterns": [],
            "zeroAccessPaths": [],
            "readOnlyPaths": [],
            "noDeletePaths": [],
        }

    with open(config_path, encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


# ============================================================================
# ALLOWED HOSTS (Exfiltration Whitelist)
# ============================================================================

# Module-level cache for allowed hosts
_allowed_hosts_cache: Optional[list[str]] = None


def get_allowed_hosts_path() -> Path:
    """Get path to allowed-hosts.yaml."""
    return Path(__file__).parent / "allowed-hosts.yaml"


def load_allowed_hosts() -> list[str]:
    """Load allowed hosts from YAML config file."""
    global _allowed_hosts_cache

    if _allowed_hosts_cache is not None:
        return _allowed_hosts_cache

    config_path = get_allowed_hosts_path()
    if not config_path.exists():
        _allowed_hosts_cache = []
        return _allowed_hosts_cache

    try:
        with open(config_path, encoding="utf-8") as f:
            config = yaml.safe_load(f) or {}
            _allowed_hosts_cache = config.get("allowedHosts", [])
    except Exception as e:
        print(f"Warning: Failed to load allowed-hosts.yaml: {e}", file=sys.stderr)
        _allowed_hosts_cache = []

    return _allowed_hosts_cache


def _parse_ipv4_octets(host: str) -> Optional[list[int]]:
    """Return the four octets of an IPv4 address, or None if `host` isn't IPv4."""
    parts = host.split(".")
    if len(parts) != 4:
        return None
    try:
        octets = [int(p) for p in parts]
    except ValueError:
        return None
    if not all(0 <= o <= 255 for o in octets):
        return None
    return octets


def _is_rfc1918(octets: list[int]) -> bool:
    """Return True if octets are in 10/8, 172.16/12, or 192.168/16."""
    if octets[0] == 10:
        return True
    if octets[0] == 172 and 16 <= octets[1] <= 31:
        return True
    if octets[0] == 192 and octets[1] == 168:
        return True
    return False


def is_private_ip(host: str) -> bool:
    """Check if host is a private/local IP address (RFC1918 + localhost)."""
    if host in ("localhost", "127.0.0.1", "::1") or host.startswith("127."):
        return True
    octets = _parse_ipv4_octets(host)
    if octets is None:
        return False
    return _is_rfc1918(octets)


def host_matches_pattern(host: str, pattern: str) -> bool:
    """Check if host matches an allowed pattern.

    Supports exact match, wildcard prefix (`*.example.com`), and wildcard
    suffix (`192.168.*`).
    """
    host = host.lower()
    pattern = pattern.lower()
    if host == pattern:
        return True
    if "*" in pattern:
        return fnmatch.fnmatch(host, pattern)
    return False


def is_allowed_host(host: str) -> bool:
    """Check if host is allowed (private IP or in allowedHosts list)."""
    if not host:
        return False
    if is_private_ip(host):
        return True
    return any(host_matches_pattern(host, p) for p in load_allowed_hosts())


def _extract_url_host(command: str) -> Optional[str]:
    """Extract host from `http(s)://host[:port]/path`."""
    match = re.search(r"https?://([^/:]+)", command, re.IGNORECASE)
    return match.group(1) if match else None


def _extract_nc_host(command: str) -> Optional[str]:
    """Extract host from `nc/ncat/netcat [-flags] host port`."""
    match = re.search(r"\b(?:nc|ncat|netcat)\s+(?:-[^\s]+\s+)*([^\s-][^\s]*)\s+\d+", command)
    if not match:
        return None
    host = match.group(1)
    return host if not host.startswith("-") else None


def _extract_dev_tcp_host(command: str) -> Optional[str]:
    """Extract host from `/dev/tcp/host/port` or `/dev/udp/host/port`."""
    match = re.search(r"/dev/(?:tcp|udp)/([^/]+)/", command)
    return match.group(1) if match else None


def _extract_dns_host(command: str) -> Optional[str]:
    """Extract host from `dig/nslookup/host` invocations."""
    match = re.search(r"\b(?:dig|nslookup|host)\s+(?:@([^\s]+)|[^\s]+\.([^\s]+))", command)
    if not match:
        return None
    return match.group(1) or (match.group(2) if match.group(2) else None)


def _extract_ssh_host(command: str) -> Optional[str]:
    """Extract host from `ssh [user@]host`."""
    match = re.search(r"\bssh\s+(?:[^\s]+@)?([^\s]+)", command)
    if not match:
        return None
    host = match.group(1)
    if "@" in host:
        host = host.split("@")[1]
    return host if not host.startswith("-") else None


_HOST_EXTRACTORS: tuple[Callable[[str], Optional[str]], ...] = (
    _extract_url_host,
    _extract_nc_host,
    _extract_dev_tcp_host,
    _extract_dns_host,
    _extract_ssh_host,
)


def extract_host_from_command(command: str) -> Optional[str]:
    """Extract destination host from network commands.

    Tries URL, nc/netcat, /dev/tcp, dig/nslookup/host, and ssh forms in order
    and returns the first match.
    """
    for extractor in _HOST_EXTRACTORS:
        host = extractor(command)
        if host:
            return host
    return None


# ============================================================================
# CONTEXT DETECTION
# ============================================================================


def _detect_documentation_context(
    tool_input: dict[str, Any], contexts_config: dict[str, Any]
) -> Optional[str]:
    """Detect documentation context for Edit/Write tools by file extension."""
    doc_ctx = contexts_config.get("documentation", {})
    if not doc_ctx.get("enabled", False):
        return None
    file_path = tool_input.get("file_path", "")
    extensions = doc_ctx.get("detection", {}).get("file_extensions", [])
    if any(file_path.endswith(ext) for ext in extensions):
        return "documentation"
    return None


def _detect_commit_message_context(
    tool_input: dict[str, Any], contexts_config: dict[str, Any]
) -> Optional[str]:
    """Detect commit-message context for Bash tool by command pattern."""
    commit_ctx = contexts_config.get("commit_message", {})
    if not commit_ctx.get("enabled", False):
        return None
    command = tool_input.get("command", "")
    for pattern in commit_ctx.get("detection", {}).get("command_patterns", []):
        try:
            if re.search(pattern, command, re.IGNORECASE):
                return "commit_message"
        except re.error:
            continue
    return None


def detect_context(
    tool_name: str, tool_input: dict[str, Any], config: dict[str, Any]
) -> Optional[str]:
    """Detect if we're in a special context that allows relaxed checks.

    Contexts are defined in patterns.yaml and can relax certain security checks
    when operating in specific scenarios.
    """
    contexts_config = config.get("contexts", {})
    if tool_name in ("Edit", "Write"):
        return _detect_documentation_context(tool_input, contexts_config)
    if tool_name == "Bash":
        return _detect_commit_message_context(tool_input, contexts_config)
    return None


# ============================================================================
# PATH CHECKING
# ============================================================================


def _check_glob_path_patterns(
    command: str,
    path_obj: dict[str, Any],
    patterns: list[tuple[str, str]],
    path_type: str,
) -> tuple[bool, str]:
    """Check command against patterns for a glob path object."""
    glob_regex_compiled = path_obj.get("glob_regex")
    if not glob_regex_compiled:
        return False, ""

    glob_regex_str = glob_regex_compiled.pattern
    path_str = path_obj["original"]

    for pattern_template, operation in patterns:
        try:
            cmd_prefix = pattern_template.replace("{path}", "")
            if cmd_prefix and re.search(cmd_prefix + glob_regex_str, command, re.IGNORECASE):
                return True, f"Blocked: {operation} operation on {path_type} {path_str}"
        except re.error:
            continue
    return False, ""


def _check_literal_path_patterns(
    command: str,
    path_obj: dict[str, Any],
    patterns: list[tuple[str, str]],
    path_type: str,
) -> tuple[bool, str]:
    """Check command against patterns for a literal path object."""
    escaped_expanded = path_obj.get("escaped_expanded", "")
    escaped_original = path_obj.get("escaped_original", "")
    if not escaped_expanded or not escaped_original:
        return False, ""

    path_str = path_obj["original"]
    for pattern_template, operation in patterns:
        pattern_expanded = pattern_template.replace("{path}", escaped_expanded)
        pattern_original = pattern_template.replace("{path}", escaped_original)
        try:
            if re.search(pattern_expanded, command) or re.search(pattern_original, command):
                return True, f"Blocked: {operation} operation on {path_type} {path_str}"
        except re.error:
            continue
    return False, ""


def check_path_patterns(
    command: str,
    path_obj: dict[str, Any],
    patterns: list[tuple[str, str]],
    path_type: str,
) -> tuple[bool, str]:
    """Check command against a list of patterns for a specific path."""
    if path_obj["is_glob"]:
        return _check_glob_path_patterns(command, path_obj, patterns, path_type)
    return _check_literal_path_patterns(command, path_obj, patterns, path_type)


# ============================================================================
# COMMAND CHECKING
# ============================================================================


@dataclass
class CheckResult:
    """Result of evaluating a command against the security firewall."""

    blocked: bool = False
    ask: bool = False
    reason: str = ""
    pattern_matched: str = ""
    was_unwrapped: bool = False
    semantic_match: bool = False

    def as_tuple(self) -> tuple[bool, bool, str, str, bool, bool]:
        """Return the legacy 6-tuple representation used by callers/tests."""
        return (
            self.blocked,
            self.ask,
            self.reason,
            self.pattern_matched,
            self.was_unwrapped,
            self.semantic_match,
        )


@dataclass
class CompiledRules:
    """Pre-compiled rules grouped by check stage."""

    patterns: list[dict[str, Any]] = field(default_factory=list)
    zero_access: list[dict[str, Any]] = field(default_factory=list)
    zero_access_exclusions: list[dict[str, Any]] = field(default_factory=list)
    read_only: list[dict[str, Any]] = field(default_factory=list)
    no_delete: list[dict[str, Any]] = field(default_factory=list)


@dataclass
class CommandContext:
    """Per-command state shared across the check pipeline."""

    original: str
    unwrapped: str
    was_unwrapped: bool
    relaxed_checks: set[str]
    is_readonly_search: bool = False
    has_dry_run: bool = False


def _extract_compiled_rules(config: dict[str, Any]) -> CompiledRules:
    """Pull compiled rules out of config, compiling on the fly if needed."""
    if "bashToolPatterns_compiled" in config:
        return CompiledRules(
            patterns=config.get("bashToolPatterns_compiled", []),
            zero_access=config.get("zeroAccessPaths_compiled", []),
            zero_access_exclusions=config.get("zeroAccessExclusions_compiled", []),
            read_only=config.get("readOnlyPaths_compiled", []),
            no_delete=config.get("noDeletePaths_compiled", []),
        )
    # Backward compatibility: tests pass raw configs
    return CompiledRules(
        patterns=compile_regex_patterns(config.get("bashToolPatterns", [])),
        zero_access=preprocess_path_list(config.get("zeroAccessPaths", [])),
        zero_access_exclusions=preprocess_path_list(config.get("zeroAccessExclusions", [])),
        read_only=preprocess_path_list(config.get("readOnlyPaths", [])),
        no_delete=preprocess_path_list(config.get("noDeletePaths", [])),
    )


def _resolve_exfil_host(ctx: CommandContext) -> Optional[str]:
    """Best-effort host extraction; falls back to original if unwrapping truncated."""
    host = extract_host_from_command(ctx.unwrapped)
    if not host and ctx.was_unwrapped:
        host = extract_host_from_command(ctx.original)
    return host


def _check_exfil_bypass(item: dict[str, Any], ctx: CommandContext) -> bool:
    """Return True if this exfil pattern should be bypassed (allowed host)."""
    if not item.get("exfil", False):
        return False
    host = _resolve_exfil_host(ctx)
    return bool(host and is_allowed_host(host))


def _normalized_platform_aliases() -> set[str]:
    """Return current platform aliases understood by YAML pattern metadata."""
    current = sys.platform.lower()
    aliases = {current}
    if current.startswith("linux"):
        aliases.update({"linux"})
    elif current == "darwin":
        aliases.update({"macos", "mac", "osx"})
    elif current in {"win32", "cygwin", "msys"}:
        aliases.update({"windows", "win"})
    return aliases


def _pattern_applies_to_current_platform(item: dict[str, Any]) -> bool:
    """Return True when a YAML pattern should apply on the current OS."""
    aliases = _normalized_platform_aliases()

    platforms = item.get("platforms")
    if platforms:
        wanted = {str(platform).lower() for platform in platforms}
        if aliases.isdisjoint(wanted):
            return False

    excluded = item.get("exclude_platforms")
    if excluded:
        banned = {str(platform).lower() for platform in excluded}
        if not aliases.isdisjoint(banned):
            return False

    return True


def _evaluate_yaml_pattern(
    item: dict[str, Any], idx: int, ctx: CommandContext
) -> Optional[CheckResult]:
    """Apply a single compiled YAML pattern to ctx; return CheckResult on match."""
    compiled_regex = item.get("compiled")
    if not compiled_regex or not _pattern_applies_to_current_platform(item):
        return None
    try:
        # Check both unwrapped and original command; original is needed to detect
        # environment variable injections like 'env VAR=val cmd' which unwrap to just 'cmd'
        unwrapped_match = compiled_regex.search(ctx.unwrapped)
        original_match = ctx.was_unwrapped and compiled_regex.search(ctx.original)
        if not (unwrapped_match or original_match):
            return None
    except re.error:
        return None

    if _check_exfil_bypass(item, ctx):
        return None  # Allowed host — skip this pattern

    reason = item.get("reason", "Blocked by pattern")
    pattern_id = f"yaml_pattern_{idx}"
    if item.get("ask", False):
        return CheckResult(
            ask=True, reason=reason, pattern_matched=pattern_id, was_unwrapped=ctx.was_unwrapped
        )
    return CheckResult(
        blocked=True,
        reason=f"Blocked: {reason}",
        pattern_matched=pattern_id,
        was_unwrapped=ctx.was_unwrapped,
    )


def _is_env_injection(pattern_str: str) -> bool:
    """Return True if pattern targets environment-variable injection vectors."""
    return any(
        x in pattern_str
        for x in ("LD_PRELOAD", "DYLD_INSERT_LIBRARIES", "LD_LIBRARY_PATH")
    )


def _stage_yaml_patterns(rules: CompiledRules, ctx: CommandContext) -> Optional[CheckResult]:
    """Stage 1: scan compiled YAML patterns.

    Skipped for relaxed contexts. However, environment-variable-based attacks
    (LD_PRELOAD, DYLD_INSERT_LIBRARIES, etc.) are ALWAYS checked even if the
    underlying command is readonly, because they affect arbitrary processes.
    """
    skip_patterns = "bashToolPatterns" in ctx.relaxed_checks or ctx.has_dry_run

    for idx, item in enumerate(rules.patterns):
        # Skip readonly/dry-run relaxation for environment injection patterns
        pattern_str = item.get("pattern", "")
        is_env_injection = _is_env_injection(pattern_str)

        if skip_patterns and not is_env_injection:
            continue
        if ctx.is_readonly_search and not is_env_injection:
            continue

        result = _evaluate_yaml_pattern(item, idx, ctx)
        if result is not None:
            return result
    return None


def _zero_access_glob_match(path_obj: dict[str, Any], ctx: CommandContext) -> Optional[CheckResult]:
    """Check a single zero-access glob path object against the unwrapped command."""
    glob_regex_compiled = path_obj.get("glob_regex")
    if not glob_regex_compiled:
        return None
    try:
        if not glob_regex_compiled.search(ctx.unwrapped):
            return None
    except re.error:
        return None
    return CheckResult(
        blocked=True,
        reason=(f"Blocked: zero-access pattern {path_obj['original']} (no operations allowed)"),
        pattern_matched="zero_access_glob",
        was_unwrapped=ctx.was_unwrapped,
    )


def _build_zero_access_literal_patterns(
    path_obj: dict[str, Any],
) -> tuple[Optional[str], Optional[str]]:
    """Return (expanded, original) regex strings for a literal zero-access path.

    File paths get a non-word suffix to prevent ``.env`` from matching ``.env.example``.
    Directory paths use no suffix because the trailing ``/`` already delimits.
    """
    escaped_expanded = path_obj.get("escaped_expanded", "")
    escaped_original = path_obj.get("escaped_original", "")
    if not escaped_expanded and not escaped_original:
        return None, None
    is_directory = path_obj.get("original", "").endswith("/")
    suffix = "" if is_directory else r"(?![a-zA-Z0-9_.-])"
    pattern_expanded = (escaped_expanded + suffix) if escaped_expanded else None
    pattern_original = (escaped_original + suffix) if escaped_original else None
    return pattern_expanded, pattern_original


def _zero_access_literal_match(
    path_obj: dict[str, Any], ctx: CommandContext
) -> Optional[CheckResult]:
    """Check a single zero-access literal path object against the unwrapped command."""
    pattern_expanded, pattern_original = _build_zero_access_literal_patterns(path_obj)
    if pattern_expanded is None and pattern_original is None:
        return None

    matched = (pattern_expanded and re.search(pattern_expanded, ctx.unwrapped)) or (
        pattern_original and re.search(pattern_original, ctx.unwrapped)
    )
    if not matched:
        return None
    return CheckResult(
        blocked=True,
        reason=(f"Blocked: zero-access path {path_obj['original']} (no operations allowed)"),
        pattern_matched="zero_access_literal",
        was_unwrapped=ctx.was_unwrapped,
    )


def _excl_matches_glob(excl: dict[str, Any], command: str) -> bool:
    """Check if a glob exclusion matches the command."""
    glob_regex = excl.get("glob_regex")
    return bool(glob_regex and glob_regex.search(command))


def _excl_matches_literal(excl: dict[str, Any], command: str) -> bool:
    """Check if a literal exclusion matches the command."""
    try:
        for key in ("escaped_expanded", "escaped_original"):
            pattern = excl.get(key, "")
            if pattern and re.search(pattern, command, re.IGNORECASE):
                return True
    except re.error:
        pass
    return False


def _command_matches_exclusion(exclusions: list[dict[str, Any]], command: str) -> bool:
    """Check if command references any excluded path."""
    matcher = {True: _excl_matches_glob, False: _excl_matches_literal}
    return any(matcher[excl["is_glob"]](excl, command) for excl in exclusions)


def _check_single_zero_access(
    path_obj: dict[str, Any], ctx: CommandContext
) -> Optional[CheckResult]:
    """Run the appropriate zero-access matcher for one path_obj/ctx pair."""
    if path_obj["is_glob"]:
        return _zero_access_glob_match(path_obj, ctx)
    return _zero_access_literal_match(path_obj, ctx)


def _segment_context(segment: str, parent: CommandContext) -> CommandContext:
    """Build a CommandContext scoped to one segment of a compound command."""
    return CommandContext(
        original=segment,
        unwrapped=segment,
        was_unwrapped=parent.was_unwrapped,
        relaxed_checks=parent.relaxed_checks,
        is_readonly_search=False,
        has_dry_run=False,
    )


def _stage_zero_access(rules: CompiledRules, ctx: CommandContext) -> Optional[CheckResult]:
    """Stage 2: enforce zero-access paths (skipped for read-only git metadata queries).

    SSH-protected patterns (~/.ssh/, *.pem, *.ppk, *.p12, *.pfx) are evaluated
    per command segment so a compound like `ssh -i key.pem && cat key.pem`
    correctly blocks on the second segment. Per-segment rules:
    - segment is USE (ssh -i, scp -i, sftp -i, GIT_SSH_COMMAND=,
      ssh-keygen -l, ssh-keyscan)        -> silent allow
    - segment is INSPECT (ls, stat, file) -> queue ask (block wins later)
    - any other segment touching the protected path -> block

    Non-ssh patterns retain the original whole-command behavior.
    """
    if "zeroAccessPaths" in ctx.relaxed_checks or is_readonly_git_command(ctx.unwrapped):
        return None

    has_exclusion = bool(rules.zero_access_exclusions) and _command_matches_exclusion(
        rules.zero_access_exclusions, ctx.unwrapped
    )

    segments: list[str] = _split_on_shell_operators(ctx.unwrapped) or [ctx.unwrapped]
    pending_ask: Optional[CheckResult] = None

    for path_obj in rules.zero_access:
        if has_exclusion:
            continue

        if not _is_ssh_protected_pattern(path_obj):
            result = _check_single_zero_access(path_obj, ctx)
            if result is not None:
                return result
            continue

        # SSH-protected pattern: per-segment classification.
        for seg in segments:
            seg_ctx = _segment_context(seg, ctx)
            seg_result = _check_single_zero_access(path_obj, seg_ctx)
            if seg_result is None:
                continue
            if is_ssh_use_command(seg):
                continue  # silent allow this segment
            if is_ssh_inspect_command(seg):
                if pending_ask is None:
                    original = path_obj.get("original", "")
                    pending_ask = CheckResult(
                        ask=True,
                        reason=(
                            f"Inspecting {original} reveals filenames/metadata; "
                            "confirm before proceeding."
                        ),
                        pattern_matched="ssh_inspect_ask",
                        was_unwrapped=ctx.was_unwrapped,
                    )
                continue
            return seg_result

    return pending_ask


def _stage_read_only(rules: CompiledRules, ctx: CommandContext) -> Optional[CheckResult]:
    """Stage 3: enforce read-only paths (block all modifications)."""
    if "readOnlyPaths" in ctx.relaxed_checks:
        return None
    for path_obj in rules.read_only:
        blocked, reason = check_path_patterns(
            ctx.unwrapped, path_obj, READ_ONLY_BLOCKED, "read-only path"
        )
        if blocked:
            return CheckResult(
                blocked=True,
                reason=reason,
                pattern_matched="readonly_path",
                was_unwrapped=ctx.was_unwrapped,
            )
    return None


def _stage_no_delete(rules: CompiledRules, ctx: CommandContext) -> Optional[CheckResult]:
    """Stage 4: enforce no-delete paths (block deletions only)."""
    if "noDeletePaths" in ctx.relaxed_checks:
        return None
    for path_obj in rules.no_delete:
        blocked, reason = check_path_patterns(
            ctx.unwrapped, path_obj, NO_DELETE_BLOCKED, "no-delete path"
        )
        if blocked:
            return CheckResult(
                blocked=True,
                reason=reason,
                pattern_matched="nodelete_path",
                was_unwrapped=ctx.was_unwrapped,
            )
    return None


def _run_ast_analyzer(unwrapped: str, config: dict[str, Any]) -> Optional[dict[str, Any]]:
    """Lazy-load and run the AST analyzer; return raw result dict or None on any failure."""
    try:
        from ast_analyzer import ASTAnalyzer  # type: ignore[import-not-found]
    except Exception:
        return None
    try:
        analyzer = ASTAnalyzer()
        if not analyzer.is_available():
            return None
        return analyzer.analyze_command_ast(unwrapped, config)
    except Exception:
        return None


def _ast_result_to_check_result(
    ast_result: dict[str, Any], was_unwrapped: bool
) -> Optional[CheckResult]:
    """Translate an AST analyzer result dict into a CheckResult (or None for allow)."""
    decision = ast_result.get("decision", "allow")
    if decision == "block":
        reason = ast_result.get("reason", "Blocked by AST analysis")
        return CheckResult(
            blocked=True,
            reason=f"Blocked: {reason}",
            pattern_matched="ast_analysis",
            was_unwrapped=was_unwrapped,
        )
    if decision == "ask":
        reason = ast_result.get("reason", "AST analysis requires confirmation")
        return CheckResult(
            ask=True,
            reason=reason,
            pattern_matched="ast_analysis",
            was_unwrapped=was_unwrapped,
        )
    return None


def _stage_ast_analysis(config: dict[str, Any], ctx: CommandContext) -> Optional[CheckResult]:
    """Stage 5: AST-based veto pass. Lazy import keeps tree-sitter optional."""
    if "bashToolPatterns" in ctx.relaxed_checks or ctx.is_readonly_search or ctx.has_dry_run:
        return None
    ast_result = _run_ast_analyzer(ctx.unwrapped, config)
    if ast_result is None:
        return None
    return _ast_result_to_check_result(ast_result, ctx.was_unwrapped)


def _build_command_context(
    command: str, config: dict[str, Any], context: Optional[str]
) -> CommandContext:
    """Unwrap, strip comments, and compute per-command flags."""
    context_config: dict[str, Any] = {}
    if context:
        context_config = config.get("contexts", {}).get(context, {})
    relaxed_checks = set(context_config.get("relaxed_checks", []))

    unwrapped_cmd, was_unwrapped = unwrap_command(command)
    unwrapped_cmd = strip_bash_comments(unwrapped_cmd)

    return CommandContext(
        original=command,
        unwrapped=unwrapped_cmd,
        was_unwrapped=was_unwrapped,
        relaxed_checks=relaxed_checks,
        is_readonly_search=is_readonly_search_command(unwrapped_cmd),
        has_dry_run=_has_valid_dry_run(unwrapped_cmd),
    )


def check_command(
    command: str, config: dict[str, Any], context: Optional[str] = None
) -> tuple[bool, bool, str, str, bool, bool]:
    """Check if command should be blocked or requires confirmation.

    Returns: (blocked, ask, reason, pattern_matched, was_unwrapped, semantic_match)
      - blocked=True, ask=False: Block the command
      - blocked=False, ask=True: Show confirmation dialog
      - blocked=False, ask=False: Allow the command
    """
    ctx = _build_command_context(command, config, context)
    rules = _extract_compiled_rules(config)

    # Semantic git analysis runs first (after unwrapping, before regex patterns).
    if "semantic_git" not in ctx.relaxed_checks:
        is_dangerous_git, git_reason = analyze_git_command(ctx.unwrapped)
        if is_dangerous_git:
            return CheckResult(
                ask=True,
                reason=git_reason,
                pattern_matched="semantic_git",
                was_unwrapped=ctx.was_unwrapped,
                semantic_match=True,
            ).as_tuple()

    for stage in (
        _stage_yaml_patterns,
        _stage_zero_access,
        _stage_read_only,
        _stage_no_delete,
    ):
        result = stage(rules, ctx)
        if result is not None:
            return result.as_tuple()

    ast_result = _stage_ast_analysis(config, ctx)
    if ast_result is not None:
        return ast_result.as_tuple()

    return CheckResult(was_unwrapped=ctx.was_unwrapped).as_tuple()


# ============================================================================
# MAIN
# ============================================================================


def _read_hook_input() -> dict[str, Any]:
    """Read JSON hook input from stdin, exiting non-zero on parse failure."""
    try:
        return json.load(sys.stdin)
    except json.JSONDecodeError as e:
        print(f"Error: Invalid JSON input: {e}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"Error reading input: {e}", file=sys.stderr)
        sys.exit(1)


def _decision_label(is_blocked: bool, should_ask: bool) -> str:
    """Map boolean decision flags to a log label."""
    if is_blocked:
        return "blocked"
    return "ask" if should_ask else "allowed"


def _emit_block(reason: str, command: str) -> None:
    """Print block reason to stderr and exit with code 2."""
    print(f"SECURITY: {reason}", file=sys.stderr)
    print(
        f"Command: {command[:100]}{'...' if len(command) > 100 else ''}",
        file=sys.stderr,
    )
    sys.exit(2)


def _emit_ask(reason: str) -> None:
    """Emit JSON to trigger Claude Code's confirmation dialog and exit cleanly."""
    output = {
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "ask",
            "permissionDecisionReason": reason,
        }
    }
    print(json.dumps(output))
    sys.exit(0)


def main() -> None:
    if is_hook_disabled():
        sys.exit(0)

    config = get_compiled_config()
    input_data = _read_hook_input()

    tool_name = input_data.get("tool_name", "")
    tool_input = input_data.get("tool_input", {})

    if tool_name != "Bash":
        sys.exit(0)

    command = tool_input.get("command", "")
    if not command:
        sys.exit(0)

    context = detect_context(tool_name, tool_input, config)
    is_blocked, should_ask, reason, pattern_matched, was_unwrapped, semantic_match = check_command(
        command, config, context=context
    )

    log_decision(
        tool_name=tool_name,
        command=command,
        decision=_decision_label(is_blocked, should_ask),
        reason=reason,
        pattern_matched=pattern_matched,
        flags=DecisionFlags(unwrapped=was_unwrapped, semantic_match=semantic_match),
        context=context,
    )

    spawn_log_rotation()

    if is_blocked:
        _emit_block(reason, command)
    if should_ask:
        _emit_ask(reason)
    sys.exit(0)


if __name__ == "__main__":
    main()
