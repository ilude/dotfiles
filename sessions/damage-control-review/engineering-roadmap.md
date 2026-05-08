## Architecture review: damage-control in the extension ecosystem

### Overall read

Pi’s damage-control layer is useful but currently split across **three overlapping safety systems**:

1. **Claude damage-control hooks**: mature Python system with rich policy, ask/block semantics, audit logs, shell unwrapping, semantic git/read-only-pipeline handling.
2. **Pi `damage-control.ts`**: smaller TypeScript port with basic command substring matching, zero-access/no-delete paths, partial `ask`, and registry/metrics logging for denies.
3. **Operator layer**: `/permissions`, `/doctor`, status footer, task/permission registry, metrics — good primitives, but damage-control only lightly plugs into them.

The main issue is not lack of safety; it is **policy drift and duplicated control surfaces**.

---

## Key findings

### 1. Pi and Claude damage-control policy have already drifted

- Claude canonical policy is `claude/hooks/damage-control/patterns.yaml`.
  - Very rich: IMDS exfiltration, git semantic handling, shell unwrapping, read-only search false-positive avoidance, ask/block/exfil metadata, path classes.
- Pi policy is `pi/damage-control-rules.yaml`.
  - Much smaller: simple dangerous command list, zero-access paths, no-delete paths.
  - Uses substring matching: `command.includes(rule.pattern)`.
  - Does not share Claude’s semantic parser or most patterns.

**Risk:** behavior differs by client. A command blocked in Claude may pass in Pi, or Pi may false-positive/false-negative differently.

**Recommendation:** make Claude patterns the conceptual source of truth, but do not blindly port the full Python system. Define a **shared normalized policy schema** and migrate Pi/Claude toward it incrementally.

---

### 2. Pi damage-control is not really an “operator permission” system yet

`permission-registry.ts` supports:

- allow/deny decisions
- provenance: `manual_once`, `session`, `rule`, `unknown`
- session approvals
- replay payloads

But Pi damage-control today mostly records **deny/rule** decisions only.

Notable gaps:

- Allowed tool calls are not recorded.
- `safeRecordAllow` exists but is unused.
- Session approvals exist in the registry but are not consulted by `damage-control.ts`.
- `action: "ask"` uses UI confirmation but does not persist `manual_once` allow/deny decisions.
- `/permissions retry <id>` records intent but cannot actually replay the blocked tool call because damage-control does not capture replay payloads.

**Risk:** `/permissions` looks like a control center, but it is mostly an audit tail for denies.

**Recommendation:** either simplify `/permissions` wording to reflect reality, or complete the missing loop: ask decisions → registry → session approvals → damage-control consults approvals.

---

### 3. `/doctor` integration is too shallow for damage-control

`operator-status.ts` checks:

- Pi version
- task registry
- permission registry
- session approvals/recent decisions

But it does not check:

- whether `damage-control.ts` is loaded
- which rules file was loaded
- whether project-local `.pi/damage-control-rules.yaml` overrides global rules
- malformed/empty rules
- stale policy compared to Claude source
- recent damage-control denies by rule
- whether metrics logging is enabled/writable
- whether permission registry and metrics disagree

**Risk:** `/doctor` can say “all checks passed” while damage-control is absent, empty, or using a stale policy.

**Recommendation:** add a compact **damage-control health section** to `/doctor --verbose`.

---

### 4. Package/test command drift in `pi/justfile`

`pi/README.md` and repo instructions say Pi TypeScript validation is **pnpm-only**:

```bash
cd pi/extensions && pnpm run typecheck
cd pi/tests && pnpm run test
```

But `pi/justfile` still uses Bun for tests:

```just
test:
    cd ~/.dotfiles/pi/tests && bun vitest run
```

This directly contradicts the stated policy.

**Quick fix:** update `pi/justfile` test recipes to use pnpm, or mark the justfile as legacy if intentionally not canonical.

---

### 5. Quality gates still depend on Claude hook config

`pi/extensions/quality-gates.ts` loads:

```ts
~/.dotfiles/claude/hooks/quality-validation/validators.yaml
```

This is another cross-client dependency. It may be intentional reuse, but architecturally it means Pi’s validation behavior is anchored in Claude’s hook tree.

**Recommendation:** either:
- move shared validation config to a neutral path, e.g. `pi/lib`/`config` or `agent-safety/`, or
- explicitly document Claude hook config as shared source.

---

### 6. Metrics are promising but underused

`metrics.ts` is a good shared JSONL event stream. Damage-control records `permission_decision` only for denies.

Potential missing events:

- `damage_control_rules_loaded`
- `damage_control_blocked`
- `damage_control_asked`
- `damage_control_confirmed`
- `damage_control_policy_error`
- `permission_session_approval_used`

**Recommendation:** keep metrics lightweight; don’t build a full analytics system yet. Just emit enough to make `/doctor` and troubleshooting useful.

---

## Pragmatic roadmap

### Quick wins

1. **Fix `pi/justfile` validation drift**
   - Replace Bun test recipes with pnpm recipes matching `README.md`.
   - This is the clearest correctness issue.

2. **Add rule-load visibility**
   - Have `damage-control.ts` expose or record:
     - selected rules file path
     - rule counts
     - parse/load errors
   - Surface this in `/doctor --verbose`.

3. **Record ask outcomes**
   - For `action: "ask"`:
     - user confirms → record `allow/manual_once`
     - user denies/no UI → record `deny/rule` or `deny/manual_once`
   - This makes `/permissions` more truthful.

4. **Clarify `/permissions retry`**
   - Current behavior records replay intent but does not retry.
   - Rename messaging to “recorded retry intent” or defer command until real replay payloads exist.

5. **Document Pi vs Claude policy relationship**
   - In `pi/README.md` or `pi/damage-control-rules.yaml`, state whether Pi rules are:
     - independent minimal baseline, or
     - intended port/subset of Claude patterns.

---

### Medium changes

1. **Create a shared safety policy schema**
   - Neutral file/path, not Claude-specific.
   - Model:
     - command rules
     - path rules
     - action: `allow | ask | block`
     - severity/tags: `destructive`, `secret`, `exfil`, `git`, etc.
     - platform filters
   - Generate or adapt Claude/Pi configs from it.

2. **Make damage-control consult session approvals**
   - Registry already has `session-approvals.json`.
   - Add matching logic before blocking ask-level rules.
   - Keep block-level rules non-bypassable unless explicitly designed otherwise.

3. **Unify operator status**
   - `/doctor` should report:
     - damage-control loaded: yes/no
     - rule source path
     - command/path rule counts
     - recent denies
     - metrics writable
     - permission registry writable
     - active session approvals
   - Footer should stay quiet unless elevated approvals exist.

4. **Replace substring command matching for high-value patterns**
   - Keep simple matching for MVP.
   - Add targeted semantic parsing only for:
     - `rm`
     - `git reset/clean/push/rm`
     - shell wrappers like `bash -c`
     - exfil endpoints
   - Avoid porting every Claude feature at once.

5. **Move shared validation/security configs out of `claude/`**
   - Suggested neutral structure:
     ```text
     agent-policy/
       damage-control.yaml
       validators.yaml
     claude/hooks/...        # adapters
     pi/extensions/...       # adapters
     opencode/...            # docs/wrappers
     ```

---

### Avoid / overengineering cautions

- **Do not build a full SIEM.** Metrics + `/doctor` + `/permissions` are enough.
- **Do not port the entire Claude Python hook system into Pi line-for-line.** Port the policy and the few semantic checks that matter.
- **Do not make every allow decision logged by default** unless there is a clear debugging need; deny/ask/session events give most value with less noise.
- **Do not make session approvals bypass hard blocks.** Keep catastrophic operations and secret reads non-bypassable unless the user explicitly confirms per action.
- **Do not add more control centers.** Improve `/doctor` and `/permissions`; avoid separate `/damage-control-status` unless it is just an alias/subsection.

---

## Recommended next architecture direction

Treat damage-control as a **shared policy + thin client adapters** system:

```text
shared safety policy
        │
        ├── Pi adapter: damage-control.ts + /doctor + /permissions + metrics
        ├── Claude adapter: Python hooks + audit logs
        └── OpenCode docs/wrappers as needed
```

That gives you one conceptual source of truth while preserving each client’s native enforcement mechanism.