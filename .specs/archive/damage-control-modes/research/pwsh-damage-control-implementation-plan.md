# Pi Damage-Control PowerShell Coverage Inspection

**Scope inspected:** `pi/extensions/damage-control.ts`, `damage-control-engine.ts`, `damage-control-rules.ts`, `pi/damage-control-rules.yaml`, `pi/tests/damage-control.test.ts`, `pi/extensions/pwsh.ts`, `pi/tests/pwsh.test.ts`
**Files edited:** None

## Summary

PowerShell support currently exists only for `no_delete_paths` protection via `extractPwshDeleteTargets()` in the `pwsh` tool handler. The `dangerous_commands` engine is only applied to `bash`, so PowerShell-specific dangerous commands like `Remove-Item -Recurse -Force`, `Stop-Computer`, `Format-Volume`, etc. are not covered by the configurable dangerous-command rules today.

## Current Behavior

### Startup / pwsh availability

- `pi/extensions/pwsh.ts` registers the `pwsh` tool only during `session_start`.
- It only registers on Windows 11:
  - `isWindows11()` gate.
  - Then `pi.exec("pwsh", ["--version"], { timeout: 5000 })`.
  - If unavailable, it warns and does not register the tool.
- `damage-control.ts` independently registers a `tool_call` handler for `event.toolName === "pwsh"`.
- That is fine: damage-control does not need to detect pwsh availability. If the tool is never registered, the handler simply never sees `pwsh` calls.

**Clean recommendation:** Do not add pwsh availability detection to damage-control. Keep startup detection owned by `pwsh.ts`; keep damage-control tool-name based and passive.

## Mode / action interactions

Existing dangerous command semantics:

```ts
action?: "block" | "ask";
platforms?: string[];
exclude_platforms?: string[];
```

- Default action is block.
- `action: "ask"` prompts only when `ctx.hasUI && ctx.ui.confirm`.
- If no UI or confirmation denied, it blocks.
- Platform filtering already supports `windows`, `win`, `win32`.

**Clean recommendation:** Reuse `evaluateDangerousCommand()` for pwsh exactly like bash, including `ask` behavior and `safeRecordAllow(..., "manual_once", ...)`.

PowerShell dangerous-command handling should happen before `no_delete_paths`, matching bash ordering:

1. fail-closed rules check
2. dangerous command evaluation
3. no-delete target extraction/check

That preserves least astonishment with the existing bash flow.

## Rule schema options

### Current schema limitation

`dangerous_commands` are global. A regex added for PowerShell may also be evaluated against bash unless constrained by regex specificity or platform.

Example safe-ish current approach:

```yaml
- pattern: "pwsh recursive force delete"
  regex: "\\bRemove-Item\\b(?=[^|;&]*\\b-Recurse\\b)(?=[^|;&]*\\b-Force\\b)"
  reason: "Recursive force delete can cause irreversible data loss"
  platforms: ["windows"]
```

But this constrains by platform, not tool/shell. If PowerShell is available on non-Windows later, or if bash command text contains that string, behavior may surprise.

### Least-astonishment schema addition

Add optional tool/shell targeting:

```ts
tools?: string[];
```

or narrower:

```ts
shells?: Array<"bash" | "pwsh">;
```

Then filter inside `evaluateDangerousCommand(command, rules, { toolName: "pwsh", ... })`.

**Recommendation:** Add `tools?: string[]` to `DangerousCommand`, because Pi rules operate on tool calls, not strictly shells. Validate as array of strings, preserve in parsing tests, and filter using the current `event.toolName`.

Backward compatibility is straightforward:
- Missing `tools` means rule applies to all command tools, preserving current behavior.
- Existing rules require no migration.

## Integration points

### `damage-control.ts`

Add dangerous evaluation to the existing pwsh handler, mirroring bash:

```ts
const dangerous = await evaluateDangerousCommand(command, rules.dangerous_commands, {
  ui: ctx.ui,
  hasUI: true,
  toolName: "pwsh",
  onConfirm: ...
});
```

Then record/debug/block exactly like bash, using `"pwsh"`.

### `damage-control-engine.ts`

- Extend evaluator context with optional `toolName`.
- Add rule applicability check for `tools`.
- Keep platform filtering unchanged.
- Avoid PowerShell parsing in the engine beyond regex matching; configurable regexes are enough for dangerous commands.

### `damage-control-rules.ts`

- Extend `DangerousCommand` with `tools?: string[]`.
- Validate `tools` as array of strings.
- Parsing naturally preserves it via object cast, but tests should assert it.

### `damage-control-rules.yaml`

Add PowerShell-specific entries with `tools: ["pwsh"]`, for example:

```yaml
- pattern: "pwsh recursive force delete"
  regex: "\\bRemove-Item\\b(?=[^|;&]*\\b-Recurse\\b)(?=[^|;&]*\\b-Force\\b)"
  reason: "Recursive force delete can cause irreversible data loss"
  tools: ["pwsh"]
```

Potential initial coverage:
- `Remove-Item -Recurse -Force`
- `Remove-Item -LiteralPath ... -Recurse -Force`
- `Clear-Content` / `Set-Content` destructive variants may already be partially covered by no-delete extraction, but only for protected filenames.
- High-risk system commands like `Format-Volume`, `Clear-Disk`, `Initialize-Disk`, `Remove-Partition`, `Stop-Computer`, `Restart-Computer` if desired.

## Tests needed

Add focused tests; avoid needing real pwsh availability.

### Pure engine/schema tests

- Parses and preserves `tools: ["pwsh"]`.
- Rejects malformed `tools: "pwsh"`.
- Rule with `tools: ["pwsh"]` matches when evaluator context has `toolName: "pwsh"`.
- Same rule does not match with `toolName: "bash"`.
- Missing `tools` still matches both, preserving compatibility.

### Handler tests

In `damage-control.test.ts`, extend the existing mocked registered-handler style:

- Registered `pwsh` handler blocks a synthetic PowerShell dangerous command from tracked or inline rules.
- `action: "ask"` on a pwsh rule calls `ctx.ui.confirm`.
- Confirmed pwsh dangerous command returns `undefined` and records allow path similarly to bash.
- Pwsh dangerous command runs before no-delete check.

### Real tracked rules smoke test

Extend `"real tracked rules block synthetic secret reads and destructive commands"` or add a sibling test:

```ts
evaluateDangerousCommand(
  "Remove-Item -Recurse -Force ./synthetic-build",
  loaded.rules.dangerous_commands,
  { toolName: "pwsh" }
)
```

## Least-astonishment recommendation

Implement this as a small symmetry change:

- Do not touch `pwsh.ts` startup detection.
- Do not introduce PowerShell AST parsing yet.
- Reuse the existing dangerous-command rule flow.
- Add only one schema field, `tools`, with backward-compatible default behavior.
- Keep PowerShell rules declarative in `damage-control-rules.yaml`.

That gives clean coverage without surprising existing bash behavior or coupling damage-control to whether PowerShell is installed.
