---
created: 2026-03-30
status: draft
completed:
---

# Plan: Pi / Claude Code Parity

## Context & Motivation

A full gap analysis (web-researched and code-audited) was completed comparing the Claude Code dotfiles setup against the Pi agent setup built in the previous session. The Claude Code setup has four categories of functionality Pi currently lacks:

1. **Enforcement extensions** (hooks equivalent): quality validation on write/edit, session pre-flight checks, session archiving, and commit safety guards. Web research confirmed Pi has the necessary events — `tool_result` (PostToolUse), `session_start`, `session_shutdown` — they just haven't been used yet. The existing `damage-control.ts` only covers `tool_call` (PreToolUse blocking).

2. **Workflow commands**: Claude Code has `/commit`, `/plan-it`, `/review-plan`, `/do-this`, and `/research` as slash commands. Pi has `/chain` and `/team`. The gap leaves Pi users without structured git commit workflow, plan crystallization, adversarial plan review, smart task routing, or background research dispatch.

3. **Behavioral rules in AGENTS.md**: Claude Code's CLAUDE.md contains ~12KB of battle-tested agent behavioral rules (fix all warnings regardless of provenance, no unsolicited destructive git, verify before acting, KISS, root cause analysis before fixing). Only a fraction made it into `pi/AGENTS.md`. Agents operating without these rules drift into bad patterns every session.

4. **Language-specialist agents**: Claude Code has 9 domain agents (python-pro, typescript-pro, rust-pro, devops-pro, etc.). Pi's agent roster is role-based (orchestrator/leads/workers) but lacks language-specialist depth for common tasks.

The existing `quality-validation` hook in Claude Code (`claude/hooks/quality-validation/`) and its `validators.yaml` config are authoritative references — the Pi quality-gates extension should follow the same config structure and linter detection logic.

## Constraints

- Platform: Windows 11, Git Bash/MSYS2
- Shell: bash (Unix syntax, `/dev/null` not `nul`)
- Pi extensions: TypeScript, auto-discovered from `~/.pi/agent/extensions/` (no compile step — jiti runtime)
- Pi bundled packages: `yaml` (not js-yaml), `@mariozechner/pi-coding-agent` for `withFileMutationQueue`, `ExtensionAPI`
- Pi events confirmed available: `tool_result`, `session_start`, `session_shutdown`, `tool_call`, `input`, `before_agent_start`
- `ctx.cwd` (second arg to handler) is the working directory in tool event handlers
- `tool_result` handler signature: `pi.on("tool_result", (event, ctx) => { return { content, details, isError } | undefined })`
  - **`event.content`** is the tool output: `(TextContent | ImageContent)[]` — NOT `event.output` (field does not exist)
  - Return content must be `{ content: [{ type: "text", text: "..." }, ...event.content] }` — NOT a plain string
- `session_start` and `session_shutdown` handler signature: `pi.on("session_start", (event, ctx) => void)`
  - `SessionStartEvent` is `{ type: "session_start" }` only — no session ID on the event
  - Session ID must be retrieved from `ctx.sessionManager` (not the event)
- Existing `validators.yaml` at `~/.dotfiles/claude/hooks/quality-validation/validators.yaml` is the canonical linter config — Pi quality-gates should reference the same file rather than duplicating it
  - **Load once at extension init** (module-level), not per `tool_result` invocation — parsing YAML on every file write is wasteful
- Pi `registerCommand` handler: `pi.registerCommand(name, { description, handler: async (args, ctx) => void })`
  - `pi.sendUserMessage()` lives on the **`pi` object** (ExtensionAPI), not on `ctx` — command handlers must close over the outer `pi` reference from the factory function scope
- **Never use `child_process.exec()`** for spawning git or linter processes — on Windows/MSYS2 this spawns `cmd.exe` and misses MSYS2 git. Use **`pi.exec()`** (available on ExtensionAPI) for all child process operations
- **Never use `~/` in `fs` calls** — Node.js does not expand tilde. Always use `path.join(os.homedir(), "...")` for home-relative paths
- No test runner for Pi extensions (TypeScript loaded at runtime via jiti)
- All install scripts must be idempotent
- No AI mentions in comments or code

## Alternatives Considered

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| Single monolithic extension with all new features | One file to maintain | Grows unmanageable; hard to selectively load | Rejected: existing pattern is one extension per concern |
| Port Claude Code hooks as Python scripts called from Pi extension | Reuses existing Python logic exactly | Two-language system; adds complexity; hooks.py not designed to be called externally | Rejected: rewrite cleanly in TypeScript |
| Symlink `validators.yaml` so Pi and Claude Code share one config | Single source of truth | Pi quality-gates reads file at runtime anyway; symlink adds fragility | **Selected**: Pi quality-gates reads directly from `~/.dotfiles/claude/hooks/quality-validation/validators.yaml` |
| Skill files for workflow commands (`.md` instruction templates) vs `registerCommand` in extension | Skills are simpler to write | Skills are guidance, not commands — no `/commit` slash command surface | **Selected hybrid**: `registerCommand` in `workflow-commands.ts`; instruction templates stored as `.md` files in `pi/skills/workflow/` and injected by the command handler |
| Phase 1+2 as one wave | Faster start | Dependencies between items; phase 2 items are lower priority | Rejected: wave-gated delivery reduces risk |

## Objective

Pi produces the same day-to-day experience as Claude Code for: (1) automatic quality enforcement on file writes, (2) session lifecycle safety, (3) structured git commits, (4) plan crystallization and adversarial review, (5) smart task routing, and (6) language-specialist agent dispatch. AGENTS.md encodes the same behavioral contract as CLAUDE.md so agents don't require re-training each session.

## Project Context

- **Language**: TypeScript (extensions), Markdown (agents/skills/AGENTS.md)
- **Test command**: none detected — tasks define their own verification
- **Lint command**: `shellcheck` for any shell scripts; no TS linter (jiti runtime, no compile)

## Task Breakdown

| # | Task | Files | Type | Model | Agent | Depends On |
|---|------|-------|------|-------|-------|------------|
| T1 | Build `quality-gates.ts` extension | 1 | feature | sonnet | builder | — |
| T2 | Build `session-hooks.ts` extension | 1 | feature | sonnet | builder | — |
| T3 | Port CLAUDE.md behavioral rules → `pi/AGENTS.md` | 1 | mechanical | haiku | builder-light | — |
| V1 | Validate wave 1 | — | validation | sonnet | validator-heavy | T1, T2, T3 |
| T4 | Build `workflow-commands.ts` + `/commit` and `/plan-it` skill templates | 3 | feature | sonnet | builder | V1 |
| T5 | Update justfile with new extension recipes | 1 | mechanical | haiku | builder-light | V1 |
| V2 | Validate wave 2 | — | validation | sonnet | validator-heavy | T4, T5 |
| T6 | Expand `workflow-commands.ts` with `/review-plan`, `/do-this`, `/research` | 3 | feature | sonnet | builder | V2 |
| T7 | Build `commit-guard.ts` extension | 1 | feature | sonnet | builder | V2 |
| T8 | Build language-specialist agents (5 agents) | 5 | mechanical | haiku | builder-light | V2 |
| V3 | Validate wave 3 | — | validation | sonnet | validator-heavy | T6, T7, T8 |

## Execution Waves

### Wave 1 (parallel)

**T1: Build `quality-gates.ts`** [sonnet] — builder
- Description: Implement a Pi extension using the `tool_result` event to run linters after every `write` or `edit` tool call. Parse `validators.yaml` **once at module init** (not per invocation) using `path.join(os.homedir(), ".dotfiles/claude/hooks/quality-validation/validators.yaml")`. For each written file: detect language by extension, find the matching validator block, check that the configured linter is on PATH via `pi.exec("which lintername")`, run it via `pi.exec()`, and inject a warning into the tool result if it fails. Failure should modify the `tool_result` content but NOT set `isError: true`. Return shape: `{ content: [{ type: "text", text: warningText }, ...event.content] }` — content is `event.content` (the existing `(TextContent | ImageContent)[]`), NOT `event.output` (does not exist). Follows the two-handler pattern established in `damage-control.ts`.
- Files:
  - `~/.dotfiles/pi/extensions/quality-gates.ts` (create)
- Acceptance Criteria:
  1. [ ] Extension file exists and imports from `@mariozechner/pi-coding-agent` and `yaml`
     - Verify: `ls ~/.dotfiles/pi/extensions/quality-gates.ts`
     - Pass: file listed
     - Fail: file missing — create it
  2. [ ] `validators.yaml` loaded at module init using `path.join(os.homedir(), ...)` — NOT inside the handler, NOT with `~/`
     - Verify: read file, confirm YAML parse is at top-level (outside `export default function`), using `os.homedir()`
     - Pass: top-level parse with os.homedir path
     - Fail: YAML parsed inside the handler body, or `~/` string used directly
  3. [ ] Extension registers a `tool_result` handler that filters on `write` and `edit` tool names
     - Verify: read file, confirm `pi.on("tool_result"` with `event.toolName` check
     - Pass: handler present with correct filter
     - Fail: handler missing or wrong event name
  4. [ ] Handler uses `event.content` (not `event.output`) as the existing tool output
     - Verify: `grep "event\.content" ~/.dotfiles/pi/extensions/quality-gates.ts`
     - Pass: `event.content` referenced; `event.output` absent
     - Fail: `event.output` used — will silently be undefined
  5. [ ] Return content is an array: `[{ type: "text", text: warningText }, ...event.content]`
     - Verify: read file, confirm spread of `event.content` in return
     - Pass: array spread present
     - Fail: plain string returned — wrong type
  6. [ ] Linter invoked via `pi.exec()`, not `child_process.exec()` or `spawn()`
     - Verify: `grep "pi\.exec\|child_process" ~/.dotfiles/pi/extensions/quality-gates.ts`
     - Pass: `pi.exec` used, `child_process` absent
     - Fail: `child_process` import present — will fail on Windows/MSYS2

**T2: Build `session-hooks.ts`** [sonnet] — builder
- Description: Implement a Pi extension using `session_start` and `session_shutdown` events. On `session_start`: run `git fetch --quiet` and check if the current branch is behind its remote using `pi.exec()` (NOT `child_process`); if so, notify via `ctx.ui.notify()`. On `session_shutdown`: retrieve the session ID from `ctx.sessionManager` (the event itself is `{ type: "session_shutdown" }` only — no ID on the event), then archive the conversation log to `path.join(os.homedir(), ".pi/agent/history", ...)` using `os.homedir()` — never `~/`. Both operations must be wrapped in try/catch and fail silently — never throw, never block the session.
- Files:
  - `~/.dotfiles/pi/extensions/session-hooks.ts` (create)
- Acceptance Criteria:
  1. [ ] Extension file exists with both `session_start` and `session_shutdown` handlers
     - Verify: `ls ~/.dotfiles/pi/extensions/session-hooks.ts`
     - Pass: file listed
     - Fail: missing
  2. [ ] `session_start` handler uses `pi.exec()` for git commands (not `child_process`)
     - Verify: `grep "pi\.exec\|child_process" ~/.dotfiles/pi/extensions/session-hooks.ts`
     - Pass: `pi.exec` used, `child_process` absent
     - Fail: `child_process` import — will fail on Windows/MSYS2
  3. [ ] `session_start` handler notifies with warning when behind remote, silently passes when up to date or no remote
     - Verify: read file, confirm conditional notify + try/catch wrapping both git commands
     - Pass: conditional branch present, outer try/catch present
     - Fail: throws on no-remote repos, or always notifies
  4. [ ] `session_shutdown` handler retrieves session ID from `ctx.sessionManager`, NOT from the event
     - Verify: `grep "sessionManager\|event\.id\|event\.session" ~/.dotfiles/pi/extensions/session-hooks.ts`
     - Pass: `ctx.sessionManager` referenced; no `event.id` or `event.session`
     - Fail: `event.id` used — will be undefined, archive filename is `undefined.jsonl`
  5. [ ] All paths use `path.join(os.homedir(), ...)` — no `~/` strings in fs calls
     - Verify: `grep "~/" ~/.dotfiles/pi/extensions/session-hooks.ts`
     - Pass: no matches
     - Fail: any `~/` in fs calls — Node.js does not expand tilde

**T3: Port CLAUDE.md behavioral rules → `pi/AGENTS.md`** [haiku] — builder-light
- Description: Read `~/.dotfiles/claude/CLAUDE.md`. Extract the behavioral rules that apply to agent operation (not Claude Code-specific tooling). Append them to `~/.dotfiles/pi/AGENTS.md` under a new `## Agent Behavioral Rules` section. Key rules to port: fix ALL warnings regardless of provenance, no unsolicited destructive git, verify before acting, KISS principle, no proactive file creation, root cause analysis before fixing, plan mode for 3+ step tasks, 1-3-1 format for alternatives. Adapt language from "Claude" to "you" (agent-neutral). Do not copy Claude Code-specific sections (hook config, tool names, Windows console flashing workaround).
- Files:
  - `~/.dotfiles/pi/AGENTS.md` (edit — append section)
- Acceptance Criteria:
  1. [ ] `pi/AGENTS.md` contains a `## Agent Behavioral Rules` section
     - Verify: `grep -n "Agent Behavioral Rules" ~/.dotfiles/pi/AGENTS.md`
     - Pass: line number returned
     - Fail: section missing
  2. [ ] Section contains at least 8 rules covering: fix-all-warnings, no-destructive-git, verify-before-acting, KISS, no-proactive-file-creation, root-cause-analysis, plan-mode, 1-3-1
     - Verify: read `pi/AGENTS.md`, count rule bullet points in the new section
     - Pass: 8+ rules present, each a single actionable statement
     - Fail: fewer than 8, or rules are vague/generic

### Wave 1 — Validation Gate

**V1: Validate wave 1** [sonnet] — validator-heavy
- Blocked by: T1, T2, T3
- Manual execution (no test runner — run each check explicitly):
  1. `ls ~/.dotfiles/pi/extensions/quality-gates.ts ~/.dotfiles/pi/extensions/session-hooks.ts` — both files present
  2. Read `quality-gates.ts`: confirm `tool_result` handler; `event.content` used (not `event.output`); return is `{ content: [{ type:"text", ... }, ...event.content] }`; YAML loaded at module init with `os.homedir()`; `pi.exec()` used (no `child_process`); no `~/` in paths
  3. Read `session-hooks.ts`: confirm `pi.exec()` for git; `ctx.sessionManager` for session ID (not `event.id`); `os.homedir()` for archive path; try/catch on both handlers; no `~/` strings
  4. Read `pi/AGENTS.md`: confirm `## Agent Behavioral Rules` section with 8+ rules
  5. Import check in both extensions: `yaml` (not `js-yaml`), `@mariozechner/pi-coding-agent`, node built-ins only — no other npm packages
  6. `grep -r "~/" ~/.dotfiles/pi/extensions/quality-gates.ts ~/.dotfiles/pi/extensions/session-hooks.ts` — expect no matches
- On failure: create fix task, re-validate after fix

---

### Wave 2 (parallel, blocked by V1)

**T4: Build `workflow-commands.ts` + skill templates** [sonnet] — builder
- Description: Create a new Pi extension `workflow-commands.ts` that registers two slash commands: `/commit` and `/plan-it`. `pi.sendUserMessage()` lives on the **`pi` object** (the ExtensionAPI parameter in the factory function) — command handlers must close over `pi` from the outer scope, not use `ctx`. Load skill templates using `path.join(os.homedir(), ".dotfiles/pi/skills/workflow/commit.md")` — never `~/`. `/commit` template: stage all changes, scan for secrets (patterns: `sk-`, `AKIA`, `-----BEGIN`, `ghp_`, `github_pat_`, `npm_`, `xoxb-`, `xoxp-`, `eyJ`, `PASSWORD=`, `TOKEN=`), generate a conventional commit message, confirm before running `git commit`. `/plan-it` template: adapt from `~/.dotfiles/claude/shared/plan-it-instructions.md` — preserve core behavior (context extraction → completeness check → task decomposition → wave organization → write to `.specs/`) but use Pi-native language.
- Files:
  - `~/.dotfiles/pi/extensions/workflow-commands.ts` (create)
  - `~/.dotfiles/pi/skills/workflow/commit.md` (create)
  - `~/.dotfiles/pi/skills/workflow/plan-it.md` (create)
- Acceptance Criteria:
  1. [ ] Extension registers `/commit` and `/plan-it` commands
     - Verify: `grep -n "registerCommand" ~/.dotfiles/pi/extensions/workflow-commands.ts`
     - Pass: two registerCommand calls present
     - Fail: missing one or both
  2. [ ] `pi.sendUserMessage()` called on `pi` (outer scope), not on `ctx`
     - Verify: read file, confirm `pi.sendUserMessage` (not `ctx.sendUserMessage`)
     - Pass: correct reference
     - Fail: `ctx.sendUserMessage` used — method does not exist on ctx
  3. [ ] All file paths use `path.join(os.homedir(), ...)` — no `~/` strings
     - Verify: `grep "~/" ~/.dotfiles/pi/extensions/workflow-commands.ts`
     - Pass: no matches
     - Fail: any `~/` present — tilde not expanded by Node.js
  4. [ ] `commit.md` template includes expanded secret pattern list
     - Verify: `grep -c "ghp_\|github_pat_\|npm_\|AKIA\|xoxb\|PASSWORD\|TOKEN" ~/.dotfiles/pi/skills/workflow/commit.md`
     - Pass: 4+ patterns present
     - Fail: fewer — incomplete secret scanning
  5. [ ] `plan-it.md` template includes the core 6 steps: extract context, detect environment, validate completeness, decompose tasks, organize waves, write to `.specs/`
     - Verify: `grep -c "##\|Step" ~/.dotfiles/pi/skills/workflow/plan-it.md`
     - Pass: 6+ structural markers
     - Fail: fewer — template is incomplete

**T5: Update justfile with new extension recipes** [haiku] — builder-light
- Description: Read `~/.dotfiles/pi/justfile`. Update the `full` recipe to include `quality-gates.ts` and `session-hooks.ts`. Add a `guard` recipe — but **comment it out with a note** since `commit-guard.ts` does not exist until T7 (Wave 3). An uncommented `guard` recipe referencing a missing file will throw ENOENT if run. Add an inline comment: `# Uncomment after T7 creates commit-guard.ts`. Keep all existing recipes unchanged.
- Files:
  - `~/.dotfiles/pi/justfile` (edit)
- Acceptance Criteria:
  1. [ ] `full` recipe now includes `quality-gates.ts` and `session-hooks.ts`
     - Verify: `grep -A2 "^full" ~/.dotfiles/pi/justfile`
     - Pass: both extension paths in the full recipe command
     - Fail: recipe not updated
  2. [ ] `guard` recipe exists but is commented out with a note referencing T7
     - Verify: `grep "guard\|commit-guard" ~/.dotfiles/pi/justfile`
     - Pass: commented block present with T7 note
     - Fail: recipe is active (runnable before T7) — will throw ENOENT
  3. [ ] Existing recipes (`default`, `solo`, `safe`, `chain`, `team`) still present and unchanged
     - Verify: `just --list`
     - Pass: all 5 original recipes listed, no errors
     - Fail: any original recipe missing or broken

### Wave 2 — Validation Gate

**V2: Validate wave 2** [sonnet] — validator-heavy
- Blocked by: T4, T5
- Manual execution:
  1. `ls ~/.dotfiles/pi/extensions/workflow-commands.ts ~/.dotfiles/pi/skills/workflow/commit.md ~/.dotfiles/pi/skills/workflow/plan-it.md` — all three files present
  2. Read `workflow-commands.ts`: two `registerCommand` calls; `pi.sendUserMessage` (not `ctx.sendUserMessage`); template paths use `path.join(os.homedir(), ...)`; no `~/` strings
  3. `grep -c "ghp_\|github_pat_\|npm_\|AKIA\|xoxb\|PASSWORD\|TOKEN" ~/.dotfiles/pi/skills/workflow/commit.md` — expect 4+
  4. Read `plan-it.md`: 6-step structure present, `.specs/` output referenced
  5. `grep -A2 "^full" ~/.dotfiles/pi/justfile` — quality-gates.ts and session-hooks.ts in full recipe
  6. `grep "guard" ~/.dotfiles/pi/justfile` — guard recipe is commented out (not runnable)
  7. `just --list` — original 5 recipes still listed, no errors
  8. `grep "~/" ~/.dotfiles/pi/extensions/workflow-commands.ts` — expect no matches
- On failure: create fix task, re-validate after fix

---

### Wave 3 (parallel, blocked by V2)

**T6: Expand `workflow-commands.ts` with `/review-plan`, `/do-this`, `/research`** [sonnet] — builder
- Description: Add three more commands to the existing `workflow-commands.ts` extension. Create the corresponding skill templates. `/review-plan`: loads plan from the path in args, dispatches parallel adversarial review — spawn 3 reviewer subagents (security lens, architecture lens, scope-creep lens), each reads the plan and returns findings. `/do-this`: analyzes the task in args — if 1-2 files and simple, dispatch directly; if 3-5 files, use `/team engineering-lead`; if 6+ files or architectural, invoke `/plan-it` first then `/team`. `/research`: dispatches 2-3 parallel subagent researchers on the topic, each from a different angle (primary source, practical implications, alternatives/tradeoffs), writes synthesis to `.specs/{topic-slug}/research.md`.
- Files:
  - `~/.dotfiles/pi/extensions/workflow-commands.ts` (edit — add 3 commands)
  - `~/.dotfiles/pi/skills/workflow/review-plan.md` (create)
  - `~/.dotfiles/pi/skills/workflow/do-this.md` (create)
  - `~/.dotfiles/pi/skills/workflow/research.md` (create)
- Acceptance Criteria:
  1. [ ] Extension now registers 5 total commands (commit, plan-it + 3 new)
     - Verify: `grep -c "registerCommand" ~/.dotfiles/pi/extensions/workflow-commands.ts`
     - Pass: count is 5
     - Fail: fewer than 5
  2. [ ] `/do-this` template includes the complexity routing logic (1-2 files → direct, 3-5 → team, 6+ → plan-it + team)
     - Verify: `grep -c "files\|simple\|complex\|team" ~/.dotfiles/pi/skills/workflow/do-this.md`
     - Pass: routing thresholds mentioned
     - Fail: no routing logic — just a generic dispatch

**T7: Build `commit-guard.ts` extension** [sonnet] — builder
- Description: Implement a Pi extension using `tool_call` interception on the `bash` tool. Use a **word-boundary regex** to detect `git commit` — e.g. `/\bgit\s+commit\b/` — to avoid false positives on strings like `echo "git commit instructions"`. When matched, check: (1) `-m` flag present (skip this check if `--amend` is present), (2) message follows conventional commit format (`type(scope): description`), (3) no `--no-verify`. Valid types: `feat|fix|docs|chore|refactor|test|perf|ci|build`. Block with an informative reason if any check fails. Follows the single bash-handler pattern from `damage-control.ts`.
- Files:
  - `~/.dotfiles/pi/extensions/commit-guard.ts` (create)
- Acceptance Criteria:
  1. [ ] Extension uses word-boundary regex to match `git commit`
     - Verify: `grep "\\\\b\|\\bword\|\\bgit" ~/.dotfiles/pi/extensions/commit-guard.ts`
     - Pass: word-boundary regex present (e.g. `/\bgit\s+commit\b/`)
     - Fail: plain string `.includes("git commit")` — will false-positive on echo/comments
  2. [ ] Extension blocks `git commit` without `-m` (unless `--amend` present)
     - Verify: read file, confirm `-m` check with `--amend` exclusion
     - Pass: both checks present
     - Fail: blocks `git commit --amend` — legitimate use case
  3. [ ] Extension blocks conventional commit format violations
     - Verify: `grep "feat\|fix\|docs\|chore" ~/.dotfiles/pi/extensions/commit-guard.ts`
     - Pass: type list present in regex
     - Fail: no format check
  4. [ ] Extension blocks `--no-verify` flag
     - Verify: `grep "no-verify" ~/.dotfiles/pi/extensions/commit-guard.ts`
     - Pass: matched and blocked
     - Fail: missing

**T8: Build language-specialist agents** [haiku] — builder-light
- Description: Create 5 language-specialist agent persona files for Pi by adapting the corresponding Claude Code agent definitions. Adapt frontmatter for Pi format (comma-separated tools, description field, expertise path, domain constraints). Each agent should reference the appropriate expertise file path under `multi-team/expertise/`. Read each source agent from `~/.dotfiles/claude/agents/` and adapt for Pi's frontmatter schema.

  Agents to create:
  - `python-pro.md` — from `claude/agents/python-pro.md`
  - `typescript-pro.md` — from `claude/agents/typescript-pro.md`
  - `rust-pro.md` — from `claude/agents/rust-pro.md`
  - `devops-pro.md` — from `claude/agents/devops-pro.md`
  - `terraform-pro.md` — from `claude/agents/terraform-pro.md`
- Files:
  - `~/.dotfiles/pi/agents/python-pro.md` (create)
  - `~/.dotfiles/pi/agents/typescript-pro.md` (create)
  - `~/.dotfiles/pi/agents/rust-pro.md` (create)
  - `~/.dotfiles/pi/agents/devops-pro.md` (create)
  - `~/.dotfiles/pi/agents/terraform-pro.md` (create)
- Acceptance Criteria:
  1. [ ] All 5 files exist in `~/.dotfiles/pi/agents/`
     - Verify: `ls ~/.dotfiles/pi/agents/*-pro.md`
     - Pass: 5 files listed (python-pro, typescript-pro, rust-pro, devops-pro, terraform-pro)
     - Fail: any missing
  2. [ ] Each file has valid Pi frontmatter: `name`, `description`, `model`, `tools` (comma-separated string), `expertise` path
     - Verify: read each file, check frontmatter fields
     - Pass: all 5 fields present in all 5 files, tools is a comma-separated string (not YAML list)
     - Fail: any file uses YAML list for tools, or missing description field (Pi skips agents without description)
  3. [ ] Model is `anthropic/claude-sonnet-4-6` for all (not haiku — these are complex tasks)
     - Verify: `grep "model" ~/.dotfiles/pi/agents/*-pro.md`
     - Pass: all show sonnet model
     - Fail: any shows haiku or opus

### Wave 3 — Validation Gate

**V3: Validate wave 3** [sonnet] — validator-heavy
- Blocked by: T6, T7, T8
- Manual execution:
  1. `grep -c "registerCommand" ~/.dotfiles/pi/extensions/workflow-commands.ts` — expect 5
  2. `ls ~/.dotfiles/pi/skills/workflow/` — expect: commit.md, plan-it.md, review-plan.md, do-this.md, research.md (5 files)
  3. Read `commit-guard.ts`: word-boundary regex (`/\bgit\s+commit\b/`); `-m` check with `--amend` exclusion; `--no-verify` block; conventional commit type list
  4. `ls ~/.dotfiles/pi/agents/*-pro.md` — expect 5 files
  5. Read each pro agent: `name`, `description`, `model: anthropic/claude-sonnet-4-6`, `tools` as comma-separated string (not YAML list), `expertise` path present
  6. `grep "~/" ~/.dotfiles/pi/extensions/workflow-commands.ts ~/.dotfiles/pi/extensions/commit-guard.ts` — expect no matches
  7. Import check across all new/modified extensions: `yaml`, `@mariozechner/pi-coding-agent`, node built-ins only
  8. Uncomment `guard` recipe in justfile now that `commit-guard.ts` exists
  9. `just --list` — all recipes including `guard` listed without errors
  10. `grep -r "AI-assisted\|Claude-generated\|generated by" ~/.dotfiles/pi/` — expect no matches
- On failure: create fix task, re-validate after fix

## Dependency Graph

```
Wave 1: T1, T2, T3 (parallel) → V1
Wave 2: T4, T5 (parallel, blocked by V1) → V2
Wave 3: T6, T7, T8 (parallel, blocked by V2) → V3
```

## Success Criteria

1. [ ] All 5 extensions exist in `~/.dotfiles/pi/extensions/`
   - Verify: `ls ~/.dotfiles/pi/extensions/`
   - Pass: damage-control.ts, agent-chain.ts, agent-team.ts, quality-gates.ts, session-hooks.ts, workflow-commands.ts, commit-guard.ts listed (7 total)
2. [ ] `just full` recipe includes all extensions
   - Verify: `grep "full" ~/.dotfiles/pi/justfile`
   - Pass: all extension paths present
3. [ ] `pi/AGENTS.md` has `## Agent Behavioral Rules` section with 8+ rules
   - Verify: `grep -A 30 "Agent Behavioral Rules" ~/.dotfiles/pi/AGENTS.md | grep -c "^\-"`
   - Pass: count ≥ 8
4. [ ] All 5 pro agents exist with valid Pi frontmatter
   - Verify: `ls ~/.dotfiles/pi/agents/*-pro.md` + spot-read one file
   - Pass: 5 files, each has name/description/model/tools fields
5. [ ] All 5 workflow skill templates exist
   - Verify: `ls ~/.dotfiles/pi/skills/workflow/`
   - Pass: commit.md, plan-it.md, review-plan.md, do-this.md, research.md

## Handoff Notes

### Imports
Always use `import { Type } from "@mariozechner/pi-ai"` for TypeBox schemas and `import { type ExtensionAPI, withFileMutationQueue } from "@mariozechner/pi-coding-agent"` for the API. Only `yaml` and node built-ins (`fs`, `path`, `os`) are safe to import — no other npm packages.

### Paths — never use `~/`
Node.js `fs` calls do NOT expand tilde. Always use:
```ts
import * as os from "node:os";
import * as path from "node:path";
const filePath = path.join(os.homedir(), ".dotfiles/pi/...");
```

### `tool_result` event
- Handler: `pi.on("tool_result", (event, ctx) => { ... })`
- `event.toolName` — the tool that ran (`"write"`, `"edit"`, etc.)
- `event.input` — the tool's input arguments
- `event.content` — the tool output as `(TextContent | ImageContent)[]` — **NOT `event.output`** (does not exist)
- Return to modify: `{ content: [{ type: "text", text: warningText }, ...event.content] }`
- Return `undefined` to pass through unchanged

### `session_start` / `session_shutdown` events
- `SessionStartEvent` is `{ type: "session_start" }` only — no session ID on the event
- Session ID: use `ctx.sessionManager` to retrieve
- Return value ignored — wrap everything in try/catch
- Never throw — an uncaught error can crash the Pi session

### Child processes — always use `pi.exec()`
Never import `child_process` in extensions. On Windows/MSYS2 it spawns `cmd.exe` and misses MSYS2 git. Use `pi.exec(command, options?)` from the ExtensionAPI for all shell operations.

### `pi.sendUserMessage()`
Lives on the **`pi` object** (the ExtensionAPI factory parameter), not on `ctx`. Command handlers must close over `pi` from the outer factory scope:
```ts
export default function(pi: ExtensionAPI) {
  pi.registerCommand("commit", {
    handler: async (args, ctx) => {
      await pi.sendUserMessage("...");  // pi from outer scope
    }
  });
}
```

### justfile `guard` recipe
Commented out in T5 because `commit-guard.ts` doesn't exist until T7. V3 includes a step to uncomment it once T7 is complete.

### Language-specialist agent expertise files
Add blank YAML stubs for all 5 new pro agents to `~/.dotfiles/pi/multi-team/expertise/` using `path.join(os.homedir(), ...)`:
```yaml
schema_version: 1
last_updated: SESSION_ID
system_overview: {}
key_files: {}
```
