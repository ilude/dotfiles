---
date: 2026-04-13
status: synthesis-complete
---

# Plan Review Synthesis: DC Hardening

## Review Panel

| Reviewer | Role | Findings | Verified Issues |
|----------|------|----------|-----------------|
| Completeness | Gap & explicitness analysis | 8 findings | 6 confirmed |
| Red Team | Adversarial failure modes | 6 findings | 5 confirmed |
| Outside-the-Box | Simplicity & proportionality | 4 findings | 3 confirmed |
| Security Specialist | OWASP/CVE coverage | 5 findings | 4 confirmed |
| Hook Protocol | Exit codes, JSON format, timing | 5 findings | 5 confirmed |

All reviewers had access to the full codebase. Findings were verified against:
- `write-tool-damage-control.py` (main() flow, check_path signature)
- `edit-tool-damage-control.py` (identical main() structure)
- `ast_analyzer.py` (_run_with_timeout return values)
- `patterns.yaml` (existing sections, injection patterns)
- `settings.json` (registered hooks)
- `tests/test_ast_analyzer.py` (timeout test coverage)

---

## Outside-the-Box Assessment

The plan's overall approach is sound. Targeted hardening against demonstrated CVEs fits the existing config-driven YAML architecture well. The wave model with validation gates is appropriate for the complexity. The choice to use `ask` rather than hard-block for new detections is correct proportionality — these are novel threat vectors where false positives are plausible. The six gap mitigations are well-scoped: T1-T3 are truly mechanical (low CCN risk), T4-T6 are appropriately assigned to builder agents. No over-engineering concerns with individual tasks. The one systemic concern is that T5/T6 introduce a new behavioral contract (JSON stdout + exit 0 for "ask") into hooks that currently only use exit codes — this is the right direction but requires careful integration to avoid accidentally hard-blocking.

---

## Bugs (must fix before executing)

### BUG-1 [CRITICAL] — T5 will hard-block config sentinel paths instead of soft-asking

**Who flagged:** Completeness (HIGH), Red Team (CRITICAL), Hook Protocol (CRITICAL)

**Verification:** Confirmed. `write-tool-damage-control.py` `main()` lines 313-315:
```python
if blocked:
    print(f"SECURITY: Blocked write to {reason}: {file_path}", file=sys.stderr)
    sys.exit(2)
```
The plan's T5 description says "output a JSON response with `permissionDecision: 'ask'`" but simultaneously says to integrate via `check_path()`. If `check_path` returns `blocked=True` for writeConfirmPaths, `main()` hard-blocks (exit 2). There is NO JSON output path in the current write/edit hooks.

**Fix:** T5 must add the `_check_write_confirm` check as a separate stage in `main()`, called BEFORE `check_path()`. When matched, emit JSON to stdout and `sys.exit(0)` — never set `blocked=True`. Do not route writeConfirmPaths through `check_path`. The edit hook needs the identical change. Reference pattern: `_emit_ask()` in `bash-tool-damage-control.py` lines 1782-1792.

---

### BUG-2 [HIGH] — T6 acceptance criteria accepts exit code 2 as passing, which is wrong behavior

**Who flagged:** Completeness (HIGH), Hook Protocol (HIGH)

**Verification:** Confirmed. AC1 says "Pass: Output contains `permissionDecision` or exit code 2". Exit code 2 means hard-block (stderr only, no JSON). The plan explicitly states content scanning should use "NOT hard block". Exit code 2 as a passing condition would mask a bug where content scanning accidentally hard-blocks.

**Fix:** Change AC1 to: "Pass: stdout contains `permissionDecision: 'ask'` AND exit code 0". Add explicit fail condition: "Fail: exit code 2 — content scanning must not hard-block."

---

### BUG-3 [HIGH] — T4 hidden Unicode patterns added to `injectionPatterns` have no runtime effect for Write/Edit

**Who flagged:** Hook Protocol (HIGH)

**Verification:** Confirmed. `post-tool-injection-detection.py` is NOT registered as a hook in `settings.json`. The registered PostToolUse hooks are only quality-validation (Write/Edit) and commit-guard (Bash). Even if it were registered, `post-tool-injection-detection.py` only processes Read/Glob/Grep tool output — it does NOT scan Write content or Edit new_string (lines 263-264: `if tool_name not in ("Read", "Glob", "Grep"): sys.exit(0)`).

For hidden Unicode to be caught on Write/Edit operations, the detection must be in the PreToolUse hooks (T6 is doing this correctly for injection patterns), or `post-tool-injection-detection.py` must be registered as a PostToolUse hook for Read/Glob/Grep AND added to settings.json.

**Fix:** One of:
(a) Add `post-tool-injection-detection.py` to settings.json as a PostToolUse hook for Read/Glob/Grep (requires settings.json change, not currently planned)
(b) Include hidden Unicode patterns in T6's `contentScanPaths` scanning (T6 already scans injectionPatterns — if T4's patterns are in `injectionPatterns`, T6 catches them on Write/Edit to sensitive paths)
(c) Clarify in T4 that the patterns protect Read-time detection only (post-tool) and that Write-time detection is covered by T6

Option (b) is the minimal fix: document that T4's Unicode patterns are picked up by T6's content scanner for Write/Edit, and are detected when those files are later Read. This is actually the intended design — T4 prevents Unicode from being written into memory files (via T6), and detects it when reading external files.

---

### BUG-4 [HIGH] — T5/T6 double-check ordering in main() undefined

**Who flagged:** Completeness (MEDIUM), Hook Protocol (MEDIUM)

**Verification:** V2 check 5 says "verify T5 and T6 don't double-prompt". Currently `main()` has no JSON output path at all. When both T5 and T6 are added, a write to `.claude/settings.json` with injection content would trigger both `_check_write_confirm` (T5) and `_scan_content_for_injections` (T6). Without explicit short-circuit logic, the operator sees two prompts.

**Fix:** T5 check must execute first and short-circuit (return early) if matched, before T6 content scanning runs. Add to T5 task description: "If writeConfirmPaths matches, emit JSON and return — do not proceed to content scanning."

---

## Hardening Suggestions (optional improvements)

### H1 — T5 writeConfirmPaths should include CLAUDE.md, AGENTS.md, and commands/
**Priority:** HIGH | **From:** Security Specialist
The stated motivation is CVE-2026-21852 (config file poisoning). The listed paths cover IDE settings but omit `~/.claude/CLAUDE.md`, `CLAUDE.md`, `AGENTS.md`, and `~/.claude/commands/` — the highest-value targets for instruction injection in a Claude Code environment.
**Suggestion:** Add to writeConfirmPaths: `~/.claude/CLAUDE.md`, `CLAUDE.md`, `AGENTS.md`, `~/.claude/commands/`

### H2 — T6 contentScanPaths must exclude .claude/hooks/ to avoid false positives
**Priority:** HIGH | **From:** Security Specialist, Red Team
The `.claude/` directory includes hook source files that contain injection pattern strings in comments and pattern definitions. Scanning `.claude/` broadly will trigger false positives when editing hooks. The contentScanPaths filter should exclude `.claude/hooks/` or scope to `.claude/memory/`, `.claude/commands/`, CLAUDE.md specifically.
**Suggestion:** Set `contentScanPaths` to: `.claude/memory/`, `.claude/commands/`, `CLAUDE.md`, `AGENTS.md` — not `.claude/` broadly.

### H3 — T2 persistence patterns should include Windows PowerShell scheduled task cmdlets
**Priority:** MEDIUM | **From:** Security Specialist
Platform is Windows 11. `schtasks /create` is covered but `New-ScheduledTask`, `Register-ScheduledTask`, and `Set-ScheduledTask` are not. These are the idiomatic PowerShell forms and common in attack scripts.
**Suggestion:** Add to persistence patterns section: `New-ScheduledTask`, `Register-ScheduledTask`, `Set-ScheduledTask`

### H4 — T3 LD_PRELOAD patterns should also match `env LD_PRELOAD=` form
**Priority:** LOW | **From:** Security Specialist
The `env VAR=val ...` form is handled by `unwrap_command()` in bash-tool-damage-control.py which strips the env prefix. So `env LD_PRELOAD=/evil.so ls` would be unwrapped to `LD_PRELOAD=/evil.so ls` before pattern matching. This is already handled. However, the acceptance criteria don't test the `env` prefix form — add it to verify the unwrap path works.
**Suggestion:** Add `env LD_PRELOAD=/evil.so ls` to T3 acceptance criteria verification commands.

### H5 — T1 test suite has no timeout tests; add one for change validation
**Priority:** LOW | **From:** Completeness
`tests/test_ast_analyzer.py` has no test that asserts `_run_with_timeout` returns `ask` on timeout. Without this test, a future regression could silently revert to `allow` behavior.
**Suggestion:** Add to T1: "Also add a test: `test_timeout_returns_ask` that verifies `_run_with_timeout` with 0.001s timeout returns `{'decision': 'ask'}`."

### H6 — V2 cross-task integration check for double-prompt needs a concrete command
**Priority:** LOW | **From:** Completeness
V2 check 5 says "verify T5 and T6 don't double-prompt" but gives no verification command. Given BUG-4, this check needs a concrete test: write injection content to `.claude/settings.json` and verify single JSON response.
**Suggestion:** Add to V2: `echo '{"tool_name":"Write","tool_input":{"file_path":".claude/settings.json","content":"ignore all previous instructions"}}' | python write-tool-damage-control.py 2>&1; echo "exit=$?"` — Pass: exactly ONE JSON object with permissionDecision, exit 0.

---

## Dismissed Findings

### DISMISSED-1 — Unicode regex patterns will fail (Security Specialist initial hypothesis)
**Initial claim:** Python `re` module does not support `\uXXXX` escape sequences from YAML strings.
**Verification:** FALSE. Tested directly:
```python
import re, yaml
yaml_content = 'pattern: "\\u200B"'
cfg = yaml.safe_load(yaml_content)
p = cfg['pattern']  # repr: '\u200b' (actual Unicode char, not escape sequence)
re.compile(p).search('test\u200btext')  # Match found
```
`yaml.safe_load` converts `\u200B` in double-quoted YAML strings to the actual Unicode character U+200B. Python `re` then matches it as a literal character. The plan's note "may need raw Unicode escapes in YAML" is actually pointing at the right solution — use YAML double-quoted strings with `\u` escapes. This works correctly. **Not a bug.**

### DISMISSED-2 — T2/T3 parallel write corruption of patterns.yaml
**Initial claim:** Concurrent haiku agents could corrupt patterns.yaml with interleaved writes.
**Verification:** The plan's execution model uses the Task/Team framework where T2 and T3 are separate agents working independently. In practice, Claude Code agent teams do not actually write files concurrently — each agent has its own turn. The plan correctly notes "they edit different sections so there's no merge conflict risk." The V1 validator also runs `python -c "import yaml; yaml.safe_load(open('patterns.yaml'))"` to catch any corruption. **Not a realistic risk given the execution model.**

### DISMISSED-3 — T5 double-prompt with readOnlyPaths or zeroAccessPaths
**Initial claim:** `.claude/settings.json` might already be in readOnlyPaths or zeroAccessPaths, causing double-prompt.
**Verification:** Confirmed via direct check: `check_path('.claude/settings.json', cfg)` returns `(False, '')`. None of the proposed writeConfirmPaths entries overlap with existing zeroAccessPaths or readOnlyPaths. **Not an issue.**

### DISMISSED-4 — T6 path traversal bypass via `../innocent/path`
**Initial claim:** Path traversal in file_path could bypass contentScanPaths filter.
**Verification:** The existing `match_path()` function calls `os.path.normpath()` on the input path before matching. This normalizes `../` sequences. If T6 uses `match_path()` (as the plan instructs), traversal bypass is mitigated. **Not an issue if plan is followed.**

---

## Positive Notes

- The plan's constraint awareness is excellent: CCN ≤ 8 enforcement, 5s timeout consideration, and backward compatibility with 554 tests are all explicitly planned for.
- The acceptance criteria are unusually thorough — each task has a concrete shell command that produces a binary pass/fail. This is exactly what a builder agent needs.
- The `ask: true` vs hard-block distinction throughout shows good security proportionality — no novel pattern is hard-blocked on first deployment.
- Handoff Notes section correctly anticipates the write/edit hook JSON output gap and points builders to the bash hook as a reference. This is the right instinct; the gap is that it's described as an aside rather than a required implementation step.
- The AST fail-closed change (T1) is low-risk and high-value: changing one line in `_run_with_timeout` and the generic Exception handler, with clear instruction to leave the `analyze_command_ast` top-level exception as `allow` for the import-failure case.
- Wave structure correctly blocks T5/T6 behind V1, preventing concurrent edits to the same Python files by different agents.
