---
date: 2026-03-30
status: synthesis-complete
---

# Plan Review Synthesis: Pi / Claude Code Parity

## Review Panel

| Reviewer | Role | Findings | Verified Issues |
|----------|------|----------|-----------------|
| R1 | Completeness & Explicitness | 8 | 5 |
| R2 | Adversarial / Red Team | 8 | 5 |
| R3 | Outside-the-Box / Simplicity | 5 | 4 |
| R4 | Pi Extension API Correctness | 6 | 6 |
| R5 | Security & Integration | 6 | 4 |
| R6 | Windows Platform | 6 | 5 |

---

## Outside-the-Box Assessment

The plan's architecture is sound and proportionate for the stated goal. The extension-per-concern pattern matches what already exists. The three areas of genuine over-engineering are: (1) the skill-template-injection approach for workflow commands when inline strings would suffice at MVP, (2) committing to 5 language-specialist agents before a routing mechanism exists to dispatch them, and (3) a new commit-guard extension when damage-control.ts's pluggable rules YAML already handles bash interception. These are all Hardening-tier items — the plan will work as written. The most material concern is the auto-discovery vs explicit-loading split, which creates a silent double-load risk when users run `just full` after T1/T2 are placed in the extensions directory.

---

## Bugs (must fix before executing)

### CRITICAL

**B1 — Tilde paths in Node.js fs calls will throw ENOENT [R6, R1]**
- Affects: T1 (quality-gates.ts), T2 (session-hooks.ts), T4 (workflow-commands.ts)
- Root cause: `fs.readFileSync("~/.dotfiles/...")` does not expand tilde in Node.js. `~` is a shell feature, not an OS feature. Every hardcoded `~/` path in extension code will throw `ENOENT` on first invocation.
- Verified: Existing extensions (damage-control.ts, agent-chain.ts) use `path.join(os.homedir(), ...)` exclusively — never raw tilde strings. The pattern is established and must be followed.
- Fix: Replace all `"~/.dotfiles/..."` path strings in generated TypeScript with `path.join(os.homedir(), ".dotfiles", ...)`. Same for `"~/.pi/..."` → `path.join(os.homedir(), ".pi", ...)`.

**B2 — `tool_result` event field name is `content` not `output` [R4]**
- Affects: T1 (quality-gates.ts)
- Root cause: The plan says `event.output` is the tool result content. The actual `ToolResultEvent` interface (verified in `types.d.ts` line 558) has `event.content: (TextContent | ImageContent)[]` and `event.isError: boolean`. There is no `event.output` field. Code reading `event.output` gets `undefined` silently — lint warnings will never be injected.
- Verified: `ToolResultEventBase` in `dist/core/extensions/types.d.ts` lines 554-560.
- Fix: Update T1 task description and Handoff Notes to use `event.content` and `event.isError`. Return shape for modifying: `{ content: [...modifiedContent], details: undefined }` per `ToolResultEventResult` interface (line 651-655).

**B3 — Double-loading of new extensions when using `just full` [R2, R1]**
- Affects: T5 (justfile update), all users of named justfile recipes
- Root cause: `~/.pi/agent` is a junction to `~/.dotfiles/pi` (confirmed by `pi-link-setup`). Auto-discovery scans `~/.pi/agent/extensions/` (= `~/.dotfiles/pi/extensions/`) for ALL `.ts` files. The default `pi` recipe uses auto-discovery and loads everything. The `full` recipe uses `--no-extensions` + explicit `-e` flags. When T5 adds quality-gates.ts and session-hooks.ts to `full` with `-e` flags, running `just full` correctly loads them explicitly. BUT: any user who runs bare `pi` (the default recipe) will get all extensions auto-discovered, including the new ones. This is actually the desired behavior for the default recipe.
- The real bug: T5 says to update `full` to add the new extensions via `-e`. If T5 also adds a `guard` recipe that references `commit-guard.ts` (which doesn't exist until T7, two waves later), running `just guard` between waves will fail with `ENOENT`.
- Verified: `justfile` line 26 confirms `full` uses `--no-extensions`. `loader.js` confirms auto-discovery scans `~/.pi/agent/extensions/`.
- Fix: The guard recipe in T5 must either (a) check for file existence before invoking or (b) be commented out as `# guard (add after T7)` until T7 completes. Document the default-vs-full recipe split explicitly in T5.

**B4 — `session_start` event has no session ID accessible [R2, R1]**
- Affects: T2 (session-hooks.ts)
- Root cause: The plan says T2 should archive to `~/.pi/agent/history/{ISO-date}-{session-id}.jsonl`. The `SessionStartEvent` interface (verified in `types.d.ts` line 322) is `{ type: "session_start" }` — no session ID field. The session ID must be obtained from `ctx.sessionManager.currentSession` or similar. The plan provides no guidance on how to obtain the session ID.
- Verified: `SessionStartEvent` in `types.d.ts` line 321-323. `ExtensionContext.sessionManager` is a `ReadonlySessionManager` (line 188).
- Fix: T2 task description must specify how to obtain the session identifier: use `ctx.sessionManager` to access the current session file path and derive an ID from it, or use a timestamp-only filename as fallback.

### HIGH

**B5 — `pi.sendUserMessage()` signature is on `pi`, not `ctx` — but it IS confirmed to exist [R4]**
- Affects: T4, T6 (workflow-commands.ts)
- Status: CONFIRMED VALID. `sendUserMessage` exists on `ExtensionAPI` (line 769 of `types.d.ts`): `sendUserMessage(content: string | (TextContent | ImageContent)[], options?: { deliverAs?: "steer" | "followUp" }): void`. The plan's Handoff Notes reference `pi.sendUserMessage(text)` which is correct — `pi` is the ExtensionAPI passed to the factory function, and `sendUserMessage` is accessible within closures in the command handler.
- Remaining concern: `pi` must be captured in closure scope from the factory function. Command handlers receive `(args, ctx)` — `pi` is NOT on ctx. The builder must close over `pi` from the outer factory scope.
- Fix: Handoff Notes should explicitly state: "`pi.sendUserMessage()` is available in command handlers by closing over `pi` from the extension factory scope — it is NOT available on `ctx`."

**B6 — `tool_result` handler return shape mismatch [R4]**
- Affects: T1 (quality-gates.ts)
- Root cause: The plan's Handoff Notes say the return shape is `{ content, details, isError }`. The actual `ToolResultEventResult` interface (line 651-655 of `types.d.ts`) is: `{ content?: (TextContent | ImageContent)[], details?: unknown, isError?: boolean }` — all optional. The `content` field must be `(TextContent | ImageContent)[]`, not a plain string. A common mistake is returning `{ content: "warning message" }` as a string, which would be rejected.
- Fix: Handoff Notes must specify: return `{ content: [{ type: "text", text: "..." }, ...event.content] }` to prepend a warning. The existing `content` from `event.content` must be preserved or the entire tool result is replaced.

**B7 — `tool_result` write/edit tool name matching [R4, R1]**
- Affects: T1 (quality-gates.ts)
- Root cause: The plan says quality-gates should trigger on "write and edit tool names." The `ToolResultEvent` union includes `WriteToolResultEvent` (toolName: "write") and `EditToolResultEvent` (toolName: "edit"). However, the plan suggests checking `event.toolName` for these. This is correct in principle, but the plan's acceptance criterion says "triggers on write and edit tool names" without mentioning that this should use the type-narrowing pattern (`isWriteToolResult`, `isEditToolResult` — exported from the package, line 597-598 of `types.d.ts`) rather than string comparison on `event.toolName`. String comparison works but is fragile if tool names change.
- Severity: LOW — string comparison functions identically for current tool names.

**B8 — Validation gates (V1, V2, V3) have no defined execution method [R1, R2]**
- Affects: V1, V2, V3
- Root cause: Pi has no test runner. The plan acknowledges this ("No test runner for Pi extensions"). But V1/V2/V3 are listed as `validator-heavy` tasks with `sonnet` model. There is no stated method for the validator to confirm extensions work. The only viable validation is: (a) manually start Pi with the new extension, (b) trigger a write/edit tool call, (c) observe whether lint feedback appears. None of this is specified.
- Fix: Each validation gate must include explicit manual verification steps: which Pi recipe to run, which command to exercise the new functionality, and what observable output proves it works.

---

## Hardening Suggestions (optional improvements)

**H1 — validators.yaml path should gracefully degrade with a logged warning, not silent skip [R5, R1]**
- The plan says quality-gates should skip gracefully when the yaml file doesn't exist. Silent skip means no quality enforcement and no user awareness. Load the config once at extension init (not per-file-write), log a `ctx.ui.notify()` warning if the file is missing, then skip per-file.
- Priority: HIGH

**H2 — commit-guard bash tool_call pattern matching needs word-boundary protection [R2, R5]**
- T7 intercepts bash tool_call to detect `git commit`. A substring match on `"git commit"` will match `echo "git commit"`, `grep "git commit"`, and `cat COMMIT_MSG`. Should use word-boundary regex or check that `git` is the command, not part of a string argument.
- Priority: HIGH

**H3 — Secret scanning in /commit template is incomplete [R5]**
- Current patterns: `sk-`, `AKIA`, `-----BEGIN`. Missing: `ghp_` (GitHub PAT), `github_pat_`, `npm_`, `xoxb-`/`xoxp-` (Slack), `eyJ` (JWT prefix), `PASSWORD=`, `TOKEN=`. For a feature users will trust, expand the pattern list.
- Priority: MEDIUM

**H4 — session-hooks.ts git operations should use `pi.exec()`, not `child_process.exec()` [R6, R2]**
- `pi.exec()` is available on the `ExtensionAPI` (line 781 of `types.d.ts`): `exec(command: string, args: string[], options?: ExecOptions): Promise<ExecResult>`. This is the correct cross-platform exec method — it runs in the project's cwd context and handles path resolution. Using `child_process.exec("git fetch --quiet")` spawns `cmd.exe` on Windows and doesn't inherit MSYS2's PATH.
- Priority: HIGH

**H5 — quality-gates.ts should cache validators.yaml parse at init, not re-parse per tool_result [R3]**
- Loading and YAML-parsing on every write/edit tool result is wasteful. damage-control.ts loads rules once at extension init (`const rules = loadRules()` called before handlers are registered). quality-gates.ts should follow the same pattern.
- Priority: MEDIUM

**H6 — Language-specialist agents need a dispatch mechanism to be useful [R3]**
- Adding python-pro, typescript-pro etc. without a routing mechanism means users must manually invoke them. Consider deferring T8 or making it dependent on a routing command (extend /chain or /team to accept a language hint) rather than shipping 5 agents with no discovery path.
- Priority: MEDIUM

**H7 — workflow-commands.ts /commit and /plan-it could use inline templates at MVP [R3]**
- The plan's hybrid approach (registerCommand + external skill .md files loaded via fs.readFileSync) adds file path dependency and tilde-expansion complexity. For MVP, the instruction templates can be inline strings. Externalizing to .md files is a nice-to-have that can be added in a follow-up.
- Priority: LOW

**H8 — `just full` vs default recipe auto-discovery behavior should be documented [R1, R2]**
- The justfile has two distinct loading models: `pi` (auto-discovers ALL extensions in `~/.dotfiles/pi/extensions/`) and `just full` (explicit `-e` flags, `--no-extensions`). When new extensions are added, they auto-load in the default recipe immediately but require manual `-e` updates to `full`. This should be documented as a comment in the justfile.
- Priority: LOW

---

## Dismissed Findings

**D1 — "pi.sendUserMessage() doesn't exist" [R4 initial concern]**
DISMISSED. Confirmed present in `ExtensionAPI` at `types.d.ts` line 769. The method exists and has the correct signature for the plan's usage.

**D2 — "Auto-discovery path ~/.pi/agent/extensions/ doesn't match dotfiles path" [R1 initial concern]**
DISMISSED. `pi-link-setup` creates a junction from `~/.pi/agent` to `~/.dotfiles/pi`. The paths are identical at the filesystem level. Extensions placed in `~/.dotfiles/pi/extensions/` are automatically visible at `~/.pi/agent/extensions/`.

**D3 — "ctx.ui.notify() not available in session_start handlers" [R4 initial concern]**
DISMISSED. `ExtensionContext.ui: ExtensionUIContext` is defined at line 181 of `types.d.ts` and is present in ALL event handlers including session_start. The `notify()` method is at line 63.

**D4 — "damage-control.ts and quality-gates.ts conflict" [R5]**
DISMISSED. damage-control intercepts `tool_call` (before tool executes — can block). quality-gates intercepts `tool_result` (after tool executes — can modify output). These are different phases with no interaction. The execution model is sequential within each phase, not concurrent.

**D5 — "Session double-loading when running `pi` and `just full`" [R2]**
DISMISSED as stated. Running `pi` auto-discovers. Running `just full` uses `--no-extensions` + explicit flags. These are mutually exclusive invocations — the user runs one or the other, not both simultaneously.

---

## Positive Notes

- The plan's API constraints section is largely accurate: `tool_call` and `tool_result` event names are correct, `session_start` and `session_shutdown` are valid event names, `registerCommand` signature matches the real API, and the existing codebase patterns (damage-control.ts, agent-chain.ts) provide a clear implementation template.
- Choosing `tool_result` for quality-gates (non-blocking feedback) vs `tool_call` for commit-guard (blocking check) is the correct split for their respective use cases.
- The wave structure with validation gates is appropriate for the dependency chain. T1+T2+T3 are genuinely independent and can safely run in parallel.
- The plan's "symlink validators.yaml" vs "read directly" decision in Alternatives Considered correctly chose reading directly — it avoids symlink complexity on Windows.
- The plan correctly identifies that `pi.sendUserMessage()` exists and is the right mechanism for workflow command dispatch (verified against `types.d.ts`).
- Existing extensions use `os.homedir()` + `path.join()` consistently — the pattern is established and the builder can follow it directly.
