# Security Review Findings

## Finding 1
severity: HIGH
evidence: Plan requires mode state “local to the current Pi extension instance/session,” but T3 acceptance says use “shared closure/module state” and only tests reset on new extension registration. If Pi reuses a module process across conversations/windows, strict modes can leak between sessions or reset unexpectedly, weakening operator assumptions.
required_fix: Store mode on a per-extension/per-session object provided by Pi runtime, or prove via runtime API/tests that each session gets isolated extension module state. Add a regression test for two concurrently registered extension instances with independent modes.

## Finding 2
severity: MEDIUM
evidence: T4 says run `evaluateShellMode` “at the start” and “Continue to run baseline checks after mode checks when not blocked.” In whitelist/noshell, dangerous commands and no-delete checks never run, so audit/reasons become generic mode blocks instead of identifying destructive/secret intent.
required_fix: Evaluate baseline dangerous/no-delete classifications for telemetry before returning mode block, without prompting or allowing execution. Ensure recordBlock includes both mode and matched baseline rule where applicable.

## Finding 3
severity: MEDIUM
evidence: The plan adds `/damage-control mode default` as an unguarded relaxation from whitelist/noshell. There is no requirement to record who/what changed the mode, previous mode, timestamp, or visible transcript beyond a notification.
required_fix: Add an append-only session audit/status record for mode transitions including previous/new mode and command alias used. Consider confirmation or explicit warning when moving from stricter modes to `default`.

## Finding 4
severity: MEDIUM
evidence: PowerShell rules target direct tokens like `Invoke-Expression`, `iex`, `Set-MpPreference`, and download pipelines. The plan does not require tests for common PowerShell evasions: case folding, backtick escaping, quoted command names, `&(...)`, aliases/functions shadowing, or `-EncodedCommand` passed directly to the `pwsh` tool without a nested `pwsh` token.
required_fix: Add adversarial tests for these realistic pwsh forms and normalize/tokenize enough to catch them, or document precise non-goals so users do not overtrust the new coverage.

## Finding 5
severity: LOW
evidence: Evidence archiving saves full test/typecheck logs and implementation diff under `.specs/.../evidence` with no redaction/secret scan step. This repo handles dotfiles and damage-control rules involving secret paths; accidental command output or diffs could persist sensitive local paths or credentials.
required_fix: Add a required evidence redaction/secret-scan gate before archival, covering logs and diffs. At minimum run the repo’s secret scanning/check command if available and document that evidence contains no secrets.
