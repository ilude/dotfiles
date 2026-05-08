## Findings

### 1. Edit/Write `ask` output shape drifts from Bash hook and Claude Code PreToolUse format

**Files:**  
- `claude/hooks/damage-control/edit-tool-damage-control.py:298`, `:365` path via `_check_write_confirm`
- `claude/hooks/damage-control/write-tool-damage-control.py` equivalent
- `claude/hooks/damage-control/bash-tool-damage-control.py:1945-1955`
- `claude/hooks/damage-control/tests/test_edit_write_coverage.py:455-474`, `:570-572`

**Issue:**  
The Bash hook emits the structured Claude Code ask payload:

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "ask",
    "permissionDecisionReason": "..."
  }
}
```

But Edit/Write emit:

```json
{"permissionDecision": "ask", "reason": "..."}
```

Tests currently assert the top-level shape, so they lock in drift rather than catching it.

**Why it matters:**  
If Claude Code only honors `hookSpecificOutput` for PreToolUse `ask`, Edit/Write “confirm” and injection-scan gates may silently allow or behave inconsistently compared with Bash.

**Improvement:**  
Centralize an `_emit_ask(reason)` helper shared by Bash/Edit/Write and update tests to assert the Claude Code `hookSpecificOutput` shape.

---

### 2. Edit/Write path matching is case-sensitive for exact paths on Windows

**File:** `claude/hooks/damage-control/edit-tool-damage-control.py:151-176` and same code in Write

**Evidence:**  
`_match_glob_path()` lowercases both sides (`:142-147`), but `_match_exact_path()` does not (`:151-160`). A Windows-style protected pattern can miss a differently-cased path.

Observed probe:

```text
match_path("c:/users/mglenn/.ssh/id_rsa", "C:/Users/") -> False
```

**Why it matters:**  
Windows paths are case-insensitive. Exact protected paths like `C:/Windows/...`, `.claude/...`, or user-profile paths can be bypassed by casing differences when enforced through Edit/Write.

**Improvement:**  
Normalize exact path matching with `os.path.normcase()` or lowercase only on Windows/Cygwin/MSYS. Add Windows-specific tests for case-insensitive exact directory prefixes.

---

### 3. Config-protection patterns miss nested `CLAUDE.md` / `AGENTS.md` writes in Edit/Write and some Bash write paths

**Files:**  
- `patterns.yaml:1633-1640`, `:1850-1859`, `:1954-1960`
- `edit-tool-damage-control.py:302-306`, `:330-333`
- `bash-tool-damage-control.py:1390-1396`

**Evidence:**  
`patterns.yaml` protects `CLAUDE.md` and `AGENTS.md`, but Edit/Write exact matching only matches the exact relative path, not nested config files.

Observed probe:

```text
edit/write match_path("subdir/CLAUDE.md", "CLAUDE.md") -> False
```

Bash blocks deletion of `subdir/CLAUDE.md` through broader delete matching, but write redirection misses it:

```text
rm subdir/CLAUDE.md          -> blocked
echo x > subdir/CLAUDE.md    -> allowed
```

**Why it matters:**  
Repo guidance explicitly has nested `AGENTS.md` files with local instructions. Nested Claude/agent instruction files are meaningful attack surfaces for prompt/config poisoning, but direct Edit/Write and Bash redirection can bypass the intended confirmation.

**Improvement:**  
Represent basename-sensitive config files as globs, e.g. `**/CLAUDE.md` / `**/AGENTS.md`, or add basename matching for protected config filenames. Add regression tests for root and nested config files across Bash/Edit/Write.

---

### 4. Edit and Write hooks duplicate nearly identical logic, increasing drift risk

**Files:**  
- `edit-tool-damage-control.py`
- `write-tool-damage-control.py`
- compare with Bash implementations of logging, rotation, config lookup, context detection, ask output

**Evidence:**  
Edit/Write contain copied implementations of logging, rotation, path matching, config lookup, context detection, content injection scanning, write confirmation, and blocking. Bash already has a better-factored ask emitter and compiled config path.

**Why it matters:**  
The current ask-output mismatch is likely a result of this duplication. Future fixes to config parsing, platform path behavior, logging, or Claude output format must be made in multiple places.

**Improvement:**  
Extract shared code into a small importable module, e.g. `damage_control_common.py`, with:
- `load_config()`
- `match_path()`
- `emit_ask()`
- `log_decision()`
- `spawn_log_rotation()`
- content-scan helpers

Keep tool-specific files thin wrappers for field names and tool names.

## Additional improvement ideas

- Add schema validation for `patterns.yaml` keys like `bashToolPatterns`, `platforms`, `ask`, `zeroAccessPaths`, and `contexts` so malformed config fails visibly in tests.
- Run a parity test matrix over Bash/Edit/Write for `zeroAccessPaths`, `readOnlyPaths`, `writeConfirmPaths`, and `contentScanPaths`.
- Add platform-targeted tests using monkeypatched `sys.platform` and path casing/separators for Windows, Linux, Git Bash/MSYS, and WSL-style paths.