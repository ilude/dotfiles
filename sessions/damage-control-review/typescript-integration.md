## Review scope

Inspected `pi/extensions/damage-control.ts` against relevant Pi extension ecosystem pieces:

- `pi/lib/extension-utils.ts`
- `pi/lib/permission-registry.ts`
- `pi/lib/permission-rules.ts`
- `pi/lib/metrics.ts`
- `pi/extensions/permissions.ts`
- `pi/extensions/operator-status.ts`
- `pi/extensions/session-hooks.ts`
- `pi/extensions/quality-gates.ts`
- `pi/extensions/prompt-router.ts`

No files modified.

## Architecture observations

- `pi/extensions/damage-control.ts` is still mostly a standalone policy engine:
  - custom YAML-ish parser at `damage-control.ts:128`
  - custom glob/path matcher at `damage-control.ts:271`
  - custom permission recording helpers at `damage-control.ts:54`
  - custom ask/confirm flow at `damage-control.ts:315` and `damage-control.ts:375`
- It partially integrates with the operator layer:
  - denies are written to `pi/lib/permission-registry.ts` via `recordDecision()`
  - deny metrics are emitted via `pi/lib/metrics.ts`
  - `/permissions` and `/doctor` can read those decisions
- It does **not** currently consume the session approval mechanism from `pi/lib/permission-registry.ts`, even though `/permissions` and `operator-status` expose session approvals as first-class state.
- It does **not** use `pi/lib/permission-rules.ts`, despite that file’s header saying it is “Used by damage-control today” at `pi/lib/permission-rules.ts:6`.

## Likely bugs / integration gaps

### 1. Session approvals are displayed but not enforced

`operator-status` shows `elevated (N)` based on `listSessionApprovals()` at `pi/extensions/operator-status.ts:338`, and `/permissions reset` clears them at `pi/extensions/permissions.ts:127`.

But `damage-control.ts` never calls `listSessionApprovals()` or checks approval patterns before blocking:

- bash handler: `damage-control.ts:563`
- pwsh handler: `damage-control.ts:583`
- file-tool handler: `damage-control.ts:595`

So session approvals appear operational in the UI, but damage-control does not honor them. This makes the permission registry/status integration misleading.

**Recommendation:** Before returning a deny, resolve whether a matching session approval exists using `pi/lib/permission-rules.ts` style matching or a dedicated helper in `permission-registry.ts`.

---

### 2. “Ask” approvals are not recorded as allows

`evaluateDangerousCommand()` and `checkZeroAccess()` return `undefined` when the user confirms:

- `damage-control.ts:330`
- `damage-control.ts:385`

But the callers do not record an allow decision, and `safeRecordAllow()` is unused except for `void safeRecordAllow` at `damage-control.ts:636`.

Result:

- `/permissions allows` will not show successful manual confirmations.
- metrics only contain deny events, not allow events.
- provenance `"manual_once"` / `"session"` is documented but not actually emitted by damage-control.

**Recommendation:** On confirmed `ask`, record an allow with provenance `"manual_once"` and emit a `permission_decision` metrics event with `outcome: "allow"`.

---

### 3. `permission-rules.ts` claims usage that does not exist

`pi/lib/permission-rules.ts:6` says the helper is “Used by damage-control today,” but `damage-control.ts` uses `matchesPattern()` instead.

This creates two rule dialects:

- damage-control patterns: suffix/prefix/includes matching in `damage-control.ts:271`
- permission rules: `Tool(glob)` syntax in `permission-rules.ts:80`

**Recommendation:** Either:
1. migrate damage-control to `parsePermissionRule()` / `matchesPermissionRule()`, or
2. fix the stale comment in `permission-rules.ts`.

The better ecosystem fit is option 1.

---

### 4. Project-local rule loading is cwd-sensitive at extension startup

`loadRules()` checks `.pi/damage-control-rules.yaml` via a relative path at `damage-control.ts:216`.

Because this runs once inside the extension factory at `damage-control.ts:561`, it depends on Pi’s process cwd at extension load time, not necessarily the active `ctx.cwd` used later by tool handlers.

**Recommendation:** Resolve project-local rules from `ctx.cwd` lazily on `session_start` or per tool call with caching keyed by cwd/repo root. This would align with other extensions that use `ctx.cwd` at runtime, e.g. `session-hooks.ts:44`.

---

### 5. Rules are static for the whole session

`const rules = loadRules()` at `damage-control.ts:561` means changes to either:

- `.pi/damage-control-rules.yaml`
- `~/.pi/agent/damage-control-rules.yaml`

are not picked up until extension reload/session restart.

**Recommendation:** Add lightweight reload support:
- load on `session_start`
- expose `/damage-control-status` or include rule file status in `/doctor`
- optionally reload when mtime changes

---

### 6. Metrics are incomplete and lack session context

`safeRecordDeny()` emits `permission_decision` metrics at `damage-control.ts:70`, but does not include session id. `recordEvent()` supports `session` at `pi/lib/metrics.ts:37`.

Also only denies emit metrics; allows do not.

**Recommendation:** Pass session id from `ctx.sessionManager.getSessionId()` where available, and emit both allow and deny decisions.

---

### 7. Permission registry replay is currently ineffective for damage-control denials

`/permissions retry <id>` expects `replayPayload` when available at `pi/extensions/permissions.ts:13`, but `safeRecordDeny()` records no `replayPayload` at `damage-control.ts:62`.

Result: damage-control denials are visible but not replayable.

**Recommendation:** Include a minimal replay payload for denied tool calls:

```ts
{
  toolName,
  input: event.input,
  cwd: ctx.cwd
}
```

Only if this does not risk storing secrets. For sensitive-path denials, consider redacting path/content fields.

---

### 8. `find` / `ls` path input may be incomplete

File tools are handled using only `input.path` at `damage-control.ts:601`.

If Pi’s `find` or `ls` tools use different input names such as `pattern`, `query`, `directory`, or `paths`, zero-access checks can silently skip. Other code already accounts for alternate field names, e.g. `quality-gates.ts` checks both `path` and `file_path` at `pi/extensions/quality-gates.ts:51`.

**Recommendation:** Audit actual Pi tool schemas and centralize target extraction for file tools.

---

### 9. Dangerous PowerShell commands are not checked

The bash handler checks `dangerous_commands` at `damage-control.ts:569`, but the pwsh handler only checks no-delete targets at `damage-control.ts:583`.

If `damage-control-rules.yaml` includes dangerous shell patterns that have PowerShell equivalents, they will not be enforced for `pwsh`.

**Recommendation:** Either:
- apply `dangerous_commands` to `pwsh` too with `tool/platform` metadata, or
- split rules into `bash_dangerous_commands` and `pwsh_dangerous_commands`.

---

### 10. Custom YAML parser is fragile

`parseDamageControlRules()` only supports a narrow subset of YAML:

- inline arrays only for `platforms`
- no block arrays for `platforms`
- no comments after values
- no nested structures except ignored `domain_constraints`
- no quoted strings with escaped quotes

Other Pi code already uses YAML helpers, e.g. `quality-gates.ts` imports `loadYamlViaPython` from `pi/lib/yaml-helpers`.

**Recommendation:** Replace the hand parser with `pi/lib/yaml-helpers.ts` or `pi/lib/yaml-mini.ts`, then validate the parsed shape.

## Recommended integration priorities

1. **Make `/permissions` real:** honor `listSessionApprovals()` in damage-control and record confirmed asks as `"manual_once"` allows.
2. **Unify rule matching:** migrate damage-control matching to `pi/lib/permission-rules.ts` or extract shared matching helpers so `/permissions`, status, and damage-control speak one rule language.
3. **Improve observability:** include session id, allow events, replay payloads, and a `/doctor` rule-load check for active damage-control config.