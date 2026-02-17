# Commands & Agents Audit

**Audited:** 2026-02-17
**Reviewer:** code-reviewer agent

---

## Commands Analysis

### Per-Command Findings

#### `/analyze-permissions` -- `claude/commands/analyze-permissions.md`

No issues. Script `~/.claude/scripts/permission-analyzer.py` confirmed to exist. Error handling table is thorough. Safety categories are clear and consistent with CLAUDE.md security-first rule.

#### `/commit` -- `claude/commands/commit.md`

**Issue (LOW):** Shared instructions use `--no-verify` on commits after the pre-commit hook already ran once. The global CLAUDE.md prohibits `--no-verify` without explicit user request. The optimization rationale is buried and not surfaced to agents reading the system prompt. The justification needs to be explicit to avoid appearing as a rule conflict.

#### `/dig-into` -- `claude/commands/dig-into.md`

Delegates to `claude/shared/dig-into-instructions.md`. No issues with frontmatter. **Missing from `opencode/commands/`** -- only Claude Code can access this command. May be intentional if dig-into relies on Claude-specific tools (Task subagent_type=Explore). Should be documented either way.

#### `/do-this` -- `claude/commands/do-this.md` (delegates to shared)

No issues. The shared `do-this-instructions.md` is well-structured. Agent routing table is clear. Error recovery paths are documented. TeamCreate/TeamDelete patterns are consistent with agent architecture.

#### `/idea` -- `claude/commands/idea.md`

**Issue (LOW):** Instructs "Push after every 2-3 commits minimum." This conflicts with CLAUDE.md: "Do not push to the remote repository unless the user explicitly asks you to do so."

**Issue (LOW):** Instructs "FREQUENT git commits (every meaningful change)" and "Commit after creating .specs directory / after each phase." CLAUDE.md says "Only create commits when requested by the user." Auto-committing at lifecycle stages contradicts this. The /idea command may be designed as an intentional exception, but this is not stated.

#### `/optimize-prompt` -- `claude/commands/optimize-prompt.md`

**Issue (MEDIUM):** References the `structured-analysis` skill via "Use Skill tool: structured-analysis." This skill does NOT exist at `~/.claude/skills/structured-analysis/`. Will silently fail or skip skill invocation. Referenced in multiple commands.

**Issue (LOW):** Output format includes "Estimated token cost: ~{multiplier}x original." CLAUDE.md states: "Never generate metrics, statistics, or numbers that should come from source systems." Token multipliers are estimates, not sourced from an authoritative system.

#### `/pickup` -- `claude/commands/pickup.md`

**Issue (HIGH):** References `session-context-management` skill that does NOT exist at `~/.claude/skills/session-context-management/`. The command delegates nearly all implementation to this skill. Without it, `/pickup` produces incomplete output.

**Issue (LOW):** Hardcodes warning emoji in output format. CLAUDE.md states: "Only use emojis if the user explicitly requests it."

#### `/plan-with-team` -- `claude/commands/plan-with-team.md` (delegates to shared)

No issues. Shared instructions are thorough with clear wave orchestration, validation gates, error recovery, and archive steps.

#### `/prd` -- `claude/commands/prd.md`

No issues. References the `planning` skill which exists at `~/.claude/skills/planning/SKILL.md`.

**Observation:** The `/acceptance-criteria` command documented in README.md does not exist at `claude/commands/acceptance-criteria.md`. README is advertising a non-existent command.

#### `/prompt-help` -- `claude/commands/prompt-help.md`

Same `structured-analysis` skill reference issue as `/optimize-prompt`. Skill does not exist. Command requires it via Skill tool invocation.

#### `/ptc` -- `claude/commands/ptc.md`

**Issue (LOW):** Install step uses `uv pip install -e .` which is legacy uv syntax. The install step is not idempotent -- does not check if the package is already installed. `~/.claude/tools/ptc-wrapper` confirmed to exist.

#### `/repo-watch` -- `claude/commands/repo-watch.md`

`~/.claude/repo-watch/` scripts confirmed to exist. No major issues. Well-structured with clear subcommands, error paths, and idempotent ignored-feature tracking.

**Issue (LOW):** Step 7 says "Implement selected features using appropriate sub-agents based on category" with no further instructions. No routing table or agent selection guidance for the implementation phase.

#### `/research` -- `claude/commands/research.md` (delegates to shared)

Delegation pattern is correct. No surface issues.

#### `/skills-engineer` -- `claude/commands/skills-engineer.md`

Audit mode requires `~/.claude/scripts/skill-analyzer.py` -- confirmed to exist. Ruleset mode references the `claude-code-workflow` skill directory which exists. Sub-agent model configuration uses correct tier names.

No blocking issues.

#### `/snapshot-tracking` -- `claude/commands/snapshot-tracking.md`

No issues. Idempotent, portable, uses atomic writes. Error handling is explicit.

#### `/snapshot` -- `claude/commands/snapshot.md`

**Issue (HIGH):** References `session-context-management` skill that does NOT exist. The command says "Follow skill instructions: See Multi-Instance Support section in skill for complete implementation." Without this skill, the command has no implementation guidance for core write operations on CURRENT.md and STATUS.md.

**Issue (LOW):** Hardcodes warning emoji in output format. Same concern as `/pickup`.

#### `/yt` -- `claude/commands/yt.md` (delegates to shared)

Delegation pattern is correct.

#### `README.md` -- `claude/commands/README.md`

**Issue (MEDIUM):** Documents `/optimize-ruleset` as a separate command at `~/.claude/commands/optimize-ruleset.md`, but no such file exists. This functionality is now in `/skills-engineer ruleset`. README is outdated.

**Issue (MEDIUM):** Documents `/acceptance-criteria` command at `~/.claude/commands/acceptance-criteria.md` -- file does not exist. README is advertising non-existent commands.

---

### Claude vs OpenCode Consistency

#### commit.md comparison

| Aspect | Claude | OpenCode |
|--------|--------|----------|
| Frontmatter model | model: haiku | model: anthropic/claude-haiku-4-5 |
| Content source | shell exec via !cat | direct file ref via @ |
| Shared source | claude/shared/commit-instructions.md | same |
| Sync status | Same shared source | Same shared source |

**Finding:** The two files use different syntax for the same operation. Claude Code uses shell execution (!cat), OpenCode uses direct file reference (@). Shared content is identical -- correct architecture, not a bug. Model IDs differ intentionally: Claude uses shorthand, OpenCode uses fully qualified provider ID.

#### `review.md` -- OpenCode only (no Claude equivalent)

The OpenCode `review.md` is a real file (not a symlink), added specifically for OpenCode. Claude has no `/review` command for plan file review. Intentionally diverged.

**Issue (HIGH):** `opencode/commands/review.md` specifies `model: openai/gpt-5.3-codex`. GPT-5.3-Codex is not a known real model as of Feb 2026. The background subagent template also hardcodes this model. If OpenCode attempts to route to this model, the command will fail at runtime. Must be verified against OpenCode supported model list and updated to an available model.

**Issue (MEDIUM):** The OpenCode `review.md` creates a tracking file using a bash heredoc in Step 3. This shell syntax is inside an OpenCode command context. OpenCode may not execute shell commands the same way as Claude Code. The tracking file creation may silently fail. Should be rewritten as a Write tool call.

**Missing from OpenCode:** `dig-into` has no OpenCode equivalent. If intentional, document it. If unintentional, add a symlink.

---

## Agents Analysis

### Per-Agent Findings

#### `builder.md` -- Sonnet, general builder

No issues. Workflow is clear and complete. Self-validation steps cover Python, TypeScript, Shell, Go. Failure escalation path is defined. KISS and read-before-edit constraints align with CLAUDE.md.

#### `builder-light.md` -- Haiku, simple tasks

No issues. Scope guardrail ("If a task feels too complex... flag it to the team lead") is a good escape valve.

#### `builder-heavy.md` -- Opus, complex tasks

No issues. Architectural documentation constraint is appropriate for its scope. Validation steps consistent with other builders.

**Observation:** All three builder agents have identical validation command lists. If a new language is added, all three need updating -- no single source of truth.

#### `code-reviewer.md` -- Sonnet, read-only review

No issues. Read-only constraint is explicit. MUST vs MAY methodology is correctly referenced. Output format is well-defined. Confidence threshold (>80%) is concrete and useful.

#### `csharp-pro.md` -- Sonnet, C# expert

No issues with workflow or quality standards.

**Issue (LOW):** Description states "Rules from rules/csharp/ auto-activate." There is no `rules/` directory in the dotfiles repo. Should reference `skills/csharp/` which exists, or remove the claim.

#### `devops-pro.md` -- Sonnet, DevOps

No issues with workflow or constraints. Security-first constraints are explicit.

**Issue (LOW):** Description states "Rules from rules/docker.md and rules/shell/ auto-activate." Same `rules/` path issue. Should reference `skills/docker/` and `skills/shell/` which exist, or remove the claim.

#### `python-pro.md` -- Sonnet, Python expert

No issues. `uv run` constraint is correctly specified and aligns with CLAUDE.md Common Pitfalls.

**Issue (LOW):** Description states "Rules from rules/python/ auto-activate." Same `rules/` path issue. Should reference `skills/python/`.

#### `skills-engineer.md` (agent) -- Opus, skill lifecycle

No issues. WebSearch and WebFetch tools are correctly listed for research tasks. SKILL.md template is thorough. No tool/task mismatches.

#### `terraform-pro.md` -- Sonnet, Terraform

No issues with workflow or constraints. Hard MUST NOT constraints are appropriate for IaC work.

**Issue (LOW):** Description states "Rules from rules/terraform/ auto-activate." Same `rules/` path issue. Should reference `skills/terraform/`.

#### `typescript-pro.md` -- Sonnet, TypeScript

**Issue (MEDIUM):** Constraint states "Use `bun` or project package manager for all commands." This is inconsistent with the validation steps in shared builder agents, which hardcode `npx @biomejs/biome check` and `npm test`. If a project uses bun, the typescript-pro agent will conflict with validation commands. The agent has no override for validation commands.

**Issue (LOW):** Description states "Rules from rules/typescript/ auto-activate." Same `rules/` path issue. Should reference `skills/typescript/`.

#### `validator.md` -- Haiku, lightweight validation

No issues. Read-only constraint is explicit. "No Tests Available?" fallback is practical.

#### `validator-heavy.md` -- Sonnet, cross-builder validation

No issues. Cross-builder conflict detection ("Integration check") is a valuable addition over the basic validator. Output format is well-structured.

---

### Capability Gaps

| Agent | Gap |
|-------|-----|
| All -pro agents | `rules/` path in description field is incorrect; should be `skills/` |
| `typescript-pro` | Validation commands hardcoded as npm/npx but agent specifies bun as preferred package manager |
| All builders | No single source of truth for validation commands -- repeated across builder-light, builder, builder-heavy |
| `code-reviewer` | No git fetch step before merge-base -- may fail silently if remote refs are stale |

---

## Cross-Reference Issues

### Commands conflicting with CLAUDE.md

| Command | Rule Violated | Severity |
|---------|--------------|----------|
| `/idea` | Auto-commits at lifecycle stages without explicit user request | LOW |
| `/idea` | Instructs pushing after every 2-3 commits without user consent | LOW |
| `/pickup`, `/snapshot` | Hardcode emoji in output format -- CLAUDE.md says no emoji without request | LOW |
| `/commit` (shared) | Uses `--no-verify`; justified but appears to contradict system-level prohibition | LOW |
| `opencode/commands/review.md` | References non-existent model `openai/gpt-5.3-codex` | HIGH |

### Missing skills referenced by commands

| Command | Missing Skill | Impact |
|---------|--------------|--------|
| `/optimize-prompt` | `structured-analysis` | Command has no skill to invoke -- will fail or skip skill invocation |
| `/prompt-help` | `structured-analysis` | Same impact |
| `/pickup` | `session-context-management` | Core functionality delegates entirely to missing skill |
| `/snapshot` | `session-context-management` | Core functionality delegates entirely to missing skill |

### README.md documents non-existent commands

- `/optimize-ruleset` -- documented in README, no file exists (superseded by `/skills-engineer ruleset`)
- `/acceptance-criteria` -- documented in README, no file exists

---

## Recommendations

### HIGH Priority

1. **Fix `opencode/commands/review.md` model reference.** `openai/gpt-5.3-codex` does not exist as a known model. Replace with a real available model (verify against OpenCode supported model list). Also update the background subagent template which uses the same model.

2. **Create or delete `session-context-management` skill.** Both `/pickup` and `/snapshot` entirely defer implementation to this skill. Without it, these commands produce incomplete output. Either create the skill at `~/.claude/skills/session-context-management/SKILL.md` or move the implementation inline into the commands.

3. **Create or delete `structured-analysis` skill.** Both `/optimize-prompt` and `/prompt-help` require it via Skill tool. Without it, the optimization pipeline fails. Either create the skill at `~/.claude/skills/structured-analysis/SKILL.md` or document that these commands are non-functional.

### MEDIUM Priority

4. **Update README.md.** Remove documentation for `/optimize-ruleset` and `/acceptance-criteria` -- these commands do not exist. Add documentation for `/skills-engineer` (which covers ruleset optimization) and note that acceptance criteria guidance is in `/prd`.

5. **Fix typescript-pro validation mismatch.** Agent says to use bun but builder validation patterns hardcode `npm test` and `npx @biomejs/biome`. Either add bun-aware validation to typescript-pro, or clarify that validation commands are project-specific overrides.

6. **Fix -pro agent description paths.** `devops-pro`, `terraform-pro`, `typescript-pro`, `csharp-pro`, `python-pro` all say "Rules from rules/X auto-activate" but `rules/` is not a real path. Change to "Skills from skills/X auto-activate" or remove the claim. Affected files: `csharp-pro.md`, `devops-pro.md`, `python-pro.md`, `terraform-pro.md`, `typescript-pro.md`.

7. **Fix `opencode/commands/review.md` tracking file creation.** The bash heredoc syntax in Step 3 may not execute correctly in OpenCode command context. Rewrite as a Write tool call or verify OpenCode supports shell heredocs.

### LOW Priority

8. **Add explicit exception note to `commit-instructions.md`.** The `--no-verify` usage needs a clear annotation explaining it overrides the system-level prohibition by design (tests already ran in pre-commit optimization step). Prevents agents from flagging it as a rule conflict.

9. **Resolve `/idea` auto-commit and push conflicts with CLAUDE.md.** Either add a note that `/idea` is an intentional exception to the no-unsolicited-commit rule, or change the command to ask before committing and pushing.

10. **Remove hardcoded emoji from `/pickup` and `/snapshot` output templates.** Replace warning emoji with plain text `WARNING:` or `BLOCKER:` to comply with the no-emoji rule.

11. **Add `dig-into.md` to `opencode/commands/` or document it as Claude-only.** Currently missing from OpenCode. If it uses Claude-specific tools (Task subagent_type=Explore), note this explicitly.

12. **Centralize builder validation commands.** Create a shared validation reference that all builder agents include, so adding a new language only requires one change.

