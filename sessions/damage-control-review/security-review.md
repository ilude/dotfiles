## Prioritized MUST Findings

### 1. HIGH — Pi damage-control can silently run with no rules loaded

**Evidence:** `pi/extensions/damage-control.ts:214-233`

```ts
const candidates = [
  path.join(".pi", "damage-control-rules.yaml"),
  path.join(os.homedir(), ".pi", "agent", "damage-control-rules.yaml"),
];
...
return {
  dangerous_commands: [],
  zero_access_paths: [],
  no_delete_paths: [],
};
```

**Issue:** The tracked rules file is `pi/damage-control-rules.yaml`, but the extension only loads `.pi/damage-control-rules.yaml` relative to CWD or `~/.pi/agent/damage-control-rules.yaml`. If Pi is launched from this repo via the documented justfile extension path, and `~/.pi/agent/damage-control-rules.yaml` is absent/stale, the system falls back to empty allow-all rules with no fail-closed behavior.

**Impact:** All Pi checks become inactive: dangerous commands, zero-access paths, and no-delete paths.

**Remediation:**
- Add an extension-relative fallback: `path.resolve(path.dirname(import.meta.url...), "../damage-control-rules.yaml")` equivalent for ESM.
- Fail closed or emit a blocking startup/runtime error if no rules file is found.
- Add a test that mocks missing candidate files and asserts the extension does **not** return empty rules silently.

---

### 2. HIGH — Pi dangerous command matching is substring-only and misses equivalent destructive forms

**Evidence:** `pi/extensions/damage-control.ts:375-382`, `pi/damage-control-rules.yaml:1-14`

```ts
if (!commandAppliesToCurrentPlatform(rule) || !command.includes(rule.pattern)) continue;
```

Configured patterns include only exact substrings like:

```yaml
- pattern: "rm -rf"
- pattern: "git push --force"
- pattern: "git clean -f"
```

**Issue:** Equivalent dangerous commands bypass the Pi dangerous-command gate because matching requires the literal substring. Examples:
- `rm -fr /tmp/x` bypasses `rm -rf`
- `git push -f` bypasses `git push --force`
- `git clean -fd` bypasses `git clean -f`

**Impact:** Known destructive command variants are allowed in Pi even though the rules intend to block them.

**Remediation:**
- Replace substring matching with compiled regex rules or token/AST-aware command normalization.
- Port the mature regex patterns from `claude/hooks/damage-control/patterns.yaml`.
- Add tests for flag-order aliases and short flags: `rm -fr`, `git push -f`, `git clean -fd`.

---

### 3. MEDIUM — Claude Edit/Write “ask” responses use a different shape than Bash

**Evidence:**  
- Correct Bash shape: `claude/hooks/damage-control/bash-tool-damage-control.py:1945-1955`
- Edit/Write shape: `claude/hooks/damage-control/edit-tool-damage-control.py:362-368`, `claude/hooks/damage-control/write-tool-damage-control.py:361-367`
- Ask-config trigger exists: `claude/hooks/damage-control/patterns.yaml:1850-1852`

Edit/Write emit:

```py
print(json.dumps({"permissionDecision": "ask", "reason": confirm_reason}))
sys.exit(0)
```

Bash emits:

```py
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "ask",
    "permissionDecisionReason": reason,
  }
}
```

**Issue:** `writeConfirmPaths` is intended to ask before edits/writes to sensitive config like `~/.claude/settings.json`, but Edit/Write use a different JSON contract than the working Bash hook. If Claude only honors the `hookSpecificOutput` contract, these “ask” cases degrade to allow.

**Impact:** Sensitive config writes meant to require confirmation may proceed without an actual confirmation prompt.

**Remediation:**
- Make Edit/Write emit the same `hookSpecificOutput` structure as Bash.
- Add an integration/unit test for `~/.claude/settings.json` Write/Edit that asserts the exact hook JSON shape.

---

### 4. MEDIUM — Claude settings do not wire Read through damage-control hooks

**Evidence:** `claude/settings.json:67-116`, `claude/settings.json:163-180`

PreToolUse hooks are only configured for:

```json
"matcher": "Bash"
"matcher": "Edit"
"matcher": "Write"
```

Sensitive Read protection is only in static permissions:

```json
"Read(~/.ssh/**)",
"Read(~/.aws/**)",
...
```

**Issue:** `patterns.yaml` says zero-access paths are “Enforced by: Bash, Edit, Write tools”, and settings confirm there is no Read hook. That means any zero-access patterns not mirrored in `permissions.deny` are not enforced for Read. For example, `patterns.yaml` includes broad secret globs like cert/key/env patterns, but settings only deny a small fixed set of home-dir paths.

**Impact:** Claude Read can access sensitive files covered by damage-control patterns but absent from `permissions.deny`.

**Remediation:**
- Add a Read PreToolUse damage-control hook, or
- Generate/sync `permissions.deny` from `zeroAccessPaths`, or
- Make the static deny list include all high-confidence secret globs.

---

## High-confidence hardening ideas

- Fail closed when damage-control config is missing or malformed; never silently default to empty rule sets.
- Add parity tests comparing Pi rules against Claude patterns for core destructive commands.
- Add audit events for Pi allows/asks, not only denies, so “rule not loaded” and “confirmed ask” paths are observable.
- Add PowerShell dangerous-command rules in Pi, not just no-delete extraction for `pwsh`.
- Add test fixtures for Claude hook JSON contracts across Bash/Edit/Write.