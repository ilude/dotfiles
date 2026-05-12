# Damage Control Review

**Files reviewed:** `pi/extensions/damage-control.ts`, `damage-control-engine.ts`, `damage-control-rules.ts`, `damage-control-debug.ts`, `pi/lib/damage-control-health.ts`, `pi/damage-control-rules.yaml`, `pi/tests/damage-control.test.ts`
**Scope:** local architecture/feature review; no edits made.

## Architecture

- **Extension entrypoint:** `pi/extensions/damage-control.ts`
  - Loads YAML policy at startup, publishes health, and registers Pi event handlers (`session_start`, `tool_call`) around lines `168-321`.
  - Uses three separate `tool_call` handlers:
    - `bash`: dangerous command rules + no-delete target extraction (`190-240`)
    - `pwsh`: no-delete target extraction (`243-259`)
    - file tools `read/write/edit/find/ls`: canonicalize, zero-access, truncation checks (`262-320`)
  - Records deny/allow decisions into permission registry and metrics via safe wrappers that never block safety flow (`57-105`).

- **Rule engine:** `pi/extensions/damage-control-engine.ts`
  - Path matching / glob-ish matching: `matchesPattern()` (`58-68`)
  - zero-access enforcement with special SSH metadata exception: `checkZeroAccess()` (`94-124`)
  - platform-filtered command rules and optional confirmation: `evaluateDangerousCommand()` (`172-209`)
  - heuristic target extraction for bash, PowerShell, and edit/write truncation (`219-323`)
  - no-delete enforcement after canonicalization (`326-345`).

- **Rules loading/schema:** `pi/extensions/damage-control-rules.ts`
  - Defines schema interfaces (`8-22`)
  - Validates required arrays, command fields, action enum, platforms, regex validity (`50-115`)
  - Loads first available rules from project `.pi`, extension-local repo rules, or home Pi agent rules (`151-180`).

- **Policy:** `pi/damage-control-rules.yaml`
  - Dangerous commands include `rm -rf`, `git reset --hard`, force push, DB drops, `git clean -f`, wrapper destructive commands, secret reads, metadata credential endpoints, exfiltration-ish pipelines, `chmod 777`, and Linux-only ask rules for Docker down (`4-49`).
  - zero-access paths include SSH/key/env/credential/secret patterns (`51-57`).
  - no-delete paths include key project manifests (`59-63`).

## Feature Set

- Fail-closed behavior when rules fail to load: extension blocks covered tools if health is failed (`damage-control.ts:137-143`, `pi/lib/damage-control-health.ts:26-32`).
- UI status on session start plus warning if policy failed (`damage-control.ts:176-187`).
- Dangerous command detection with regex support, platform filters, and `ask` confirmation flow (`damage-control-engine.ts:142-209`).
- File-access protection for zero-access paths, including SSH metadata inspection split:
  - content tools block
  - `ls/find` on SSH-protected patterns can prompt (`damage-control-engine.ts:94-124`).
- No-delete/truncation guard for manifests via bash, pwsh, `write`, and `edit` (`damage-control-engine.ts:219-345`).
- Debug logging is opt-in and redacts common secret shapes (`damage-control-debug.ts:5-24`, `41-74`).
- Test coverage includes platform ask behavior, YAML parsing, regex matching, real tracked rule behavior, no-delete extraction, SSH inspect split, and debug redaction (`pi/tests/damage-control.test.ts:18-120`, `233-345`, `446-612`, `615-690`).

## Strengths

- **Good separation of concerns:** entrypoint wires Pi events; engine is mostly pure/testable; rules parser validates policy before activation.
- **Fail-safe posture:** malformed/missing policy turns covered tools into blocked tools rather than silently disabling protection (`damage-control.ts:137-143`).
- **Practical UX nuance:** Linux Docker down rules use confirmation instead of hard block; SSH metadata inspection can be confirmed for `ls/find`.
- **Auditability:** decisions are recorded with provenance and replay metadata, while logging failures are intentionally non-fatal (`damage-control.ts:57-105`, `146-165`).
- **Tests cover core contracts:** especially real tracked rules and handler integration (`pi/tests/damage-control.test.ts:640-690`).

## Weaknesses / Limits

- **Command parsing is heuristic, not shell-accurate.** Bash and pwsh extraction split on whitespace and simple regexes (`damage-control-engine.ts:212-300`), so quoted paths, variables, command substitutions, aliases, pipelines, and more complex syntax may be missed or mis-parsed.
- **PowerShell dangerous command rules are much narrower.** The `pwsh` handler only checks no-delete targets, not the broader `dangerous_commands` list (`damage-control.ts:243-259`).
- **Pattern matching is intentionally simple.** `matchesPattern()` supports suffix/prefix/basic `*`, basename, and substring matching (`damage-control-engine.ts:58-68`), but not full glob semantics or consistent case normalization across platforms.
- **Rules are loaded once at extension registration.** Runtime edits to the YAML won’t take effect until extension/session reload (`damage-control.ts:168-174`).
- **`domain_constraints` is parsed but unused here.** YAML notes it is a placeholder for agent persona/domain enforcement (`pi/damage-control-rules.yaml:65-67`).

## Overall

This is a compact, Pi-native safety layer with solid modularity and meaningful tests. Its main tradeoff is deliberate simplicity: it protects common high-risk operations well, but should be treated as a guardrail rather than a complete shell/security sandbox.
