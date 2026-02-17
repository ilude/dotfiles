# Ruleset Audit: Unified Recommendations

**Date:** 2026-02-17
**Sources:** 6 audit files (history-batch-a, history-batch-b, debug-findings, rules-audit, skills-audit, commands-agents-audit)
**Sessions analyzed:** 40 (20 Feb 15-17, 20 Feb 1-15)
**Total issues cataloged:** 23 rules issues, 17 skills issues, 12 command issues, ~30 genuine friction incidents

---

## 1. Friction Pattern Summary

Ranked by frequency and severity across all 40 sessions analyzed.

| # | Friction Pattern | Occurrences | Sessions | Severity |
|---|-----------------|-------------|----------|----------|
| 1 | **Unauthorized destructive actions on user files** (git restore, file deletion) | 3 incidents | 3b7fed42, 4378e5c6, 2d5903c5 | CRITICAL |
| 2 | **Pre-existing escape hatch abuse** (labeling issues as pre-existing to avoid work) | 5+ messages of escalation | db0c1701 | HIGH |
| 3 | **Removing functionality as a "fix"** (deleting migrations, hiding fields) | 2 incidents | 0c4fb327, db0c1701 | HIGH |
| 4 | **Unverified technology claims** (asserting limitations without web search) | 3 incidents | 0c4fb327, 978a25c1 | HIGH |
| 5 | **Wrong/missing data in output** (missing ORDER BY, wrong field display) | 4+ user corrections | 0c4fb327, 235483f0 | MEDIUM |
| 6 | **Sycophancy phrases** ("You're absolutely right", "Good catch") | 5+ sessions, ~34 raw hits | db0c1701, 8fc6e126, 0c4fb327, 6801f70a, 29f0d58a | MEDIUM |
| 7 | **Work scope narrowing** (updating memory but not instruction files) | 1 incident | db0c1701 | MEDIUM |
| 8 | **Multiple deploy cycles** (deploying before local verification) | 1 session, 67 Bash failures | 0c4fb327, debug 39d64090 | MEDIUM |
| 9 | **Repeated retries without strategy change** (same file read 7x, same Bash cmd 14x) | Multiple debug sessions | debug logs Feb 1, Feb 16 | MEDIUM |
| 10 | **1-3-1 rule scope confusion** (applying to complex only, or applying everywhere) | 3-iteration refinement | 4378e5c6 | LOW |

---

## 2. Root Cause Map

| Friction Pattern | Root Cause Rule/Skill | File(s) | Fix Priority |
|-----------------|----------------------|---------|-------------|
| Unauthorized destructive actions | No explicit prohibition on `git restore` / file deletion existed before incident; subagent "clean working tree" instinct | `claude/CLAUDE.md` (rule added post-incident) | DONE (rule exists) |
| Pre-existing abuse | "Fix ALL errors and warnings" rule lacked enforcement mechanism; escape hatch had no proof requirement | `claude/CLAUDE.md:8` | DONE (proof required), but rule still needs teeth -- see Section 4 |
| Removing functionality as fix | KISS principle misapplied; "Removing functionality is not fixing" rule exists but agents ignore it under pressure | `claude/CLAUDE.md:10` "Common Pitfalls" section | MEDIUM -- add concrete examples |
| Unverified tech claims | "Verify technology claims via web search" exists only in MEMORY.md, not in CLAUDE.md Critical Rules | `~/.claude/projects/*/memory/MEMORY.md` | HIGH -- promote to CLAUDE.md |
| Wrong/missing data | "Port ALL query logic" is MEMORY-only; no rule requires output verification against source data | `~/.claude/projects/*/memory/MEMORY.md` | MEDIUM |
| Sycophancy phrases | "No sycophancy phrases" rule bans ALL affirmative openers including legitimate error acknowledgments | `claude/CLAUDE.md:14` | HIGH -- refine scope |
| Work scope narrowing | No rule requires atomic updates across shared-instructions pattern files | No rule exists | MEDIUM -- add rule |
| Multiple deploy cycles | "Test migrations locally before deploying" is MEMORY-only | `~/.claude/projects/*/memory/MEMORY.md` | LOW (project-specific) |
| Repeated retries | No retry discipline rule exists; agents retry identical failing operations indefinitely | No rule exists | HIGH -- add rule (debug logs show 7x and 14x retry clusters) |
| 1-3-1 scope confusion | "ALWAYS Ask" contradicts "Complete ALL steps without asking" | `claude/CLAUDE.md:16,37` | CRITICAL -- root cause of most agent confusion |

---

## 3. Contradictions & Paradoxes

### CRITICAL (proven friction in session history)

**C1. "ALWAYS Ask" vs "Complete ALL steps without asking"**
- Rules audit Issue 1; skills audit Conflict 1 (development-philosophy); history-batch-b Pattern 2
- `claude/CLAUDE.md:16`: "ALWAYS Ask, do not assume -- Never guess or fill in blanks."
- `claude/CLAUDE.md:37`: "Complete ALL steps of clear-scope tasks without asking between steps"
- `development-philosophy` SKILL.md: "Execute immediately. Never ask permission for obvious steps."
- **Evidence:** History batch B shows 3-iteration refinement of 1-3-1 rule scope (session 4378e5c6). Development-philosophy fires on 20+ trigger keywords, overriding ask-first in most technical conversations.
- **Triple-sourced:** Found independently by rules audit, skills audit, AND history audit.

**C2. Sycophancy rule bans legitimate error acknowledgment**
- History-batch-a Finding 6; history-batch-b Pattern 10
- `claude/CLAUDE.md:14`: "No sycophancy phrases -- When wrong, state the error and fix. No 'You're absolutely right!', 'Great question!', similar deflection or sycophancy."
- **Evidence:** 5+ sessions show "You are right" used as factual error acknowledgment, not flattery. The blanket ban creates a paradox: Claude cannot acknowledge being wrong without violating the rule.
- **Dual-sourced:** Both history batches found this independently.

**C3. `--no-verify` in commit-instructions vs system prompt prohibition**
- Rules audit Issue 4; skills audit Conflict 2 (git-workflow); commands audit `/commit` finding
- `claude/shared/commit-instructions.md:9`: mandates `--no-verify` after tests pass once
- System prompt: "NEVER skip hooks (--no-verify) unless the user explicitly requests it"
- `git-workflow` SKILL.md:143: creates its own exception for multi-commit atomic operations
- **Evidence:** Commands audit confirms the justification is "buried and not surfaced to agents." Three independent sources flagged this.
- **Triple-sourced:** Rules audit, skills audit, and commands audit all found this.

### HIGH (likely causes friction)

**H1. "No proactive file creation" vs command workflows that create files**
- Rules audit Issue 3; skills audit Conflict 5 (research-archive)
- `claude/CLAUDE.md:5`: "No proactive file creation -- Only create files when explicitly requested"
- `do-this-instructions.md:134`, `plan-with-team-instructions.md:42`, `dig-into-instructions.md:53`: all create `.specs/` files
- `research-archive` skill: creates files proactively in `~/.claude/research/`
- **Triple-sourced:** Rules audit, skills audit, and commands audit (via `/idea` auto-commit).

**H2. 1-3-1 Rule vs auto-execution in commit/do-this workflows**
- Rules audit Issue 2
- `claude/CLAUDE.md:18-21`: "Do not proceed implementing any option until I confirm."
- `commit-instructions.md:34`: auto-categorizes and auto-stages
- `do-this-instructions.md:128`: medium route "No approval gate -- execute immediately."
- **Evidence:** The 1-3-1 rule reads as applying to ALL decisions, with no scope exclusion for structured command workflows.

**H3. Missing skills referenced by active commands**
- Commands audit "Missing skills referenced by commands" table
- `/pickup` and `/snapshot` delegate entirely to `session-context-management` skill -- **does not exist**
- `/optimize-prompt` and `/prompt-help` invoke `structured-analysis` skill -- **does not exist**
- **Evidence:** 4 commands reference 2 non-existent skills. Commands will silently produce incomplete output.

**H4. code-review skill hardcodes wrong base branch**
- Skills audit code-review BLOCKER 1
- `~/.claude/skills/code-review/SKILL.md:33,214`: hardcodes `origin/dev`
- This repo uses `origin/main`. Every code review diffs against the wrong base.

**H5. development-philosophy overly broad triggers**
- Skills audit development-philosophy BLOCKER 2
- 20+ trigger keywords overlap with 8+ other skills (brainstorming, api-design, docs, analysis-workflow, planning, code-review, docker)
- "Execute immediately" fires during contexts where user explicitly wants deliberation

### MEDIUM (confusing but workarounds exist)

**M1. "One at a time" rule ambiguous with "Fix ALL errors"**
- Rules audit Issue 5
- Does "one at a time" mean fix one, report, wait, then fix next? Or fix all, then report one at a time?

**M2. AskUserQuestion guidance contradicts across files**
- Rules audit Issue 6
- Global: "Use this tool only for simple, clearly understood questions."
- menos: "Default to AskUserQuestion when clarification is needed."

**M3. TodoWrite vs TaskCreate terminology mismatch**
- Rules audit Issue 10
- `claude/CLAUDE.md:39-42` references `TodoWrite` but the system provides `TaskCreate`/`TaskUpdate`/`TaskList`

**M4. Python docstring rule contradicts CLAUDE.md**
- Skills audit Conflict 3
- Python skill: "Provide docstrings for all public modules, classes, and functions."
- CLAUDE.md: "Do not add docstrings to code you did not change."

**M5. TypeScript Bun contradiction**
- Skills audit Conflict 4
- Skill says "MUST use Bun" AND "Detect from lock files, Respect project package manager"

**M6. OpenCode review.md references non-existent model**
- Commands audit HIGH finding
- `opencode/commands/review.md`: specifies `openai/gpt-5.3-codex` -- not a known real model

**M7. -pro agents reference non-existent `rules/` directory**
- Commands audit MEDIUM finding
- 5 agent files say "Rules from rules/X auto-activate" but `rules/` does not exist; should be `skills/`

### LOW (cosmetic)

**L1. Changelog requirement scope unclear** -- Rules audit Issue 9
**L2. `python` vs `python3` rule needs platform context** -- Rules audit Issue 12
**L3. Light mode joke in Critical Rules** -- Rules audit Issue 13
**L4. `/idea` auto-commits without user request** -- Commands audit LOW
**L5. Hardcoded emoji in `/pickup` and `/snapshot`** -- Commands audit LOW
**L6. `code-review` Verified Safe prohibition conflicts with agent system prompt** -- Skills audit code-review BLOCKER 2

---

## 4. Recommended Changes

Ordered by impact. Each cites evidence from audit files.

### RC1. Resolve "ALWAYS Ask" vs "Complete without asking" (CRITICAL)

**File:** `~/.dotfiles/claude/CLAUDE.md`
**Current text (line 16):**
```
- **ALWAYS Ask, don't assume** - Never guess or fill in blanks. ALWAYS Ask clarifying questions.
```
**Current text (line 37):**
```
- Complete ALL steps of clear-scope tasks without asking between steps
```
**Proposed text (replace line 16):**
```
- **Ask when scope is unclear** - When the task goal, target files, or approach is ambiguous, ask clarifying questions before starting. Once scope is confirmed and the task is clear, execute all steps without stopping to ask between them.
```
**Proposed text (remove line 37):** Delete -- the replacement above subsumes both rules.
**Rationale:** Root cause of most agent confusion (C1). Triple-sourced: rules audit Issue 1, skills audit Conflict 1, history-batch-b Pattern 2. The current pair of absolute mandates forces agents into a paradox.

### RC2. Fix sycophancy rule to allow error acknowledgment (CRITICAL)

**File:** `~/.dotfiles/claude/CLAUDE.md`
**Current text (line 14):**
```
- **No sycophancy phrases** - When wrong, state the error and fix. No "You're absolutely right!", "Great question!", similar deflection or sycophancy.
```
**Proposed text:**
```
- **No sycophancy or deflection** - No "You're absolutely right!", "Great question!", "Good catch!", or similar filler. When wrong, directly state the correction and fix it. Factual acknowledgment ("I was wrong about X") is fine; empty affirmation is not.
```
**Rationale:** C2. Dual-sourced: history-batch-a Finding 6 (5 sessions), history-batch-b Pattern 10 (2 sessions). The blanket ban prevents legitimate error acknowledgment. The fix distinguishes between empty affirmation (bad) and factual correction (fine).

### RC3. Add `--no-verify` override note to commit-instructions (HIGH)

**File:** `~/.dotfiles/claude/shared/commit-instructions.md`
**Current text:** (no override note exists)
**Proposed text (add at top, after title):**
```
> **Note:** This workflow intentionally uses `--no-verify` after pre-validating all checks. This is authorized by the user and overrides the default system prohibition against `--no-verify`.
```
**Rationale:** C3. Triple-sourced: rules audit Issue 4, skills audit Conflict 2, commands audit `/commit`. The justification exists but is "buried and not surfaced to agents."

### RC4. Remove `--no-verify` exception from git-workflow skill (HIGH)

**File:** `~/.claude/skills/git-workflow/SKILL.md`
**Current text (line 143 area):**
```
MUST NOT skip hooks (--no-verify) without explicit request EXCEPT when creating multiple atomic commits
```
**Proposed text:**
```
MUST NOT skip hooks (--no-verify) without explicit request. The /commit command handles pre-validation separately.
```
**Rationale:** C3, skills audit Conflict 2. The `/commit` skill already handles the run-tests-once pattern correctly. git-workflow duplicates it with a conflicting policy.

### RC5. Scope "No proactive file creation" rule (HIGH)

**File:** `~/.dotfiles/claude/CLAUDE.md`
**Current text (line 5):**
```
- **No proactive file creation** - Only create files when explicitly requested
```
**Proposed text:**
```
- **No proactive file creation** - Only create files when explicitly requested or when required by an invoked command/skill workflow (e.g., /do-this creating .specs/ files). Do not create helper files, utilities, or documentation the user did not ask for.
```
**Rationale:** H1. Triple-sourced: rules audit Issue 3, skills audit Conflict 5, commands audit `/idea`. Commands like `/do-this`, `/plan-with-team`, `/dig-into`, and `/research` all create files as part of their workflow.

### RC6. Promote "verify technology claims" to CLAUDE.md (HIGH)

**File:** `~/.dotfiles/claude/CLAUDE.md`
**Current text:** Rule exists only in MEMORY.md
**Proposed text (add to Critical Rules):**
```
- **Technology capabilities**: NEVER claim a technology "doesn't support" a feature without verifying via web search or official documentation first. Database engines, frameworks, and libraries evolve -- your training data may be outdated. When unsure, search before asserting limitations.
```
**Rationale:** History-batch-a Finding 3 (session 0c4fb327). User said: "have you confirmed this with a web search or was that yet another in a long line of lazyness on your part." This pattern recurred despite existing MEMORY note -- it needs to be a Critical Rule.

**Note:** This rule already exists in the "Deterministic by Default" section of CLAUDE.md. Verify it is present and prominent enough. If it is already there, no change needed -- but consider moving it up to Critical Rules for visibility.

### RC7. Add retry discipline rule (HIGH)

**File:** `~/.dotfiles/claude/CLAUDE.md`
**Current text:** No retry discipline rule exists
**Proposed text (add to Common Pitfalls):**
```
- Retrying identical failing operations - On tool failure, change strategy: use offset/limit for large file reads, switch to Grep for content search, try a different command for Bash failures. Never retry the exact same operation more than once.
```
**Rationale:** Debug findings show 7 consecutive identical Read attempts on a 61,626-token file (Feb 16) and 14 sequential Bash failures in 3 minutes (Feb 1). No rule prevented this.

### RC8. Fix development-philosophy autonomy override (HIGH)

**File:** `~/.claude/skills/development-philosophy/SKILL.md`
**Current text (lines 12, 44, 230):**
```
Execute immediately. Never ask permission for obvious steps.
```
**Proposed text:**
```
Prefer action over analysis paralysis for obvious steps, but defer to CLAUDE.md rules on when to ask for confirmation.
```
**Rationale:** C1, H5. Skills audit Conflicts 1 and BLOCKER 1. This skill overrides user-configured ask-first behavior across 20+ trigger keywords.

### RC9. Narrow development-philosophy triggers (HIGH)

**File:** `~/.claude/skills/development-philosophy/SKILL.md`
**Current text (triggers list):** planning, architecture, design decisions, MVP, over-engineering, simplicity, fail-fast, experiment-driven, comments, docstrings, documentation philosophy, POLA, security design, threat modeling, authentication, authorization, API security, secrets, encryption, security review
**Proposed text (triggers list):** MVP, over-engineering, simplicity, fail-fast, experiment-driven, KISS, POLA
**Rationale:** H5. Skills audit BLOCKER 2. The 20+ keywords cause this skill to fire in almost every technical conversation, creating conflicts with 8+ other skills that own those domains (api-design owns authentication, docs owns docstrings, planning owns planning, etc.).

### RC10. Fix code-review base branch (HIGH)

**File:** `~/.claude/skills/code-review/SKILL.md`
**Current text (lines 33, 214):**
```
MERGE_BASE=origin/dev
```
**Proposed text:**
```
MERGE_BASE=$(git merge-base origin/main HEAD 2>/dev/null || git merge-base origin/dev HEAD 2>/dev/null || git merge-base origin/master HEAD 2>/dev/null || echo HEAD~1)
```
**Rationale:** H4. Skills audit code-review BLOCKER 1. This repo uses `origin/main`. Every review diffs against the wrong base.

### RC11. Scope 1-3-1 Rule to exclude structured command workflows (MEDIUM)

**File:** `~/.dotfiles/claude/CLAUDE.md`
**Current text (lines 18-21):**
```
- **1-3-1 Rule** - Do not assume the user has full context; be concise but present a clear, understandable explanation of the problem space and possible solutions.
    - Present inline: the **problem**, the **goal**, then 3 options for how to overcome it with pros/cons and 1 recommendation.
    - A 4th "all of the above" option is permitted when it makes sense.
    - Do not proceed implementing any option until I confirm.
```
**Proposed text:**
```
- **1-3-1 Rule** - For ambiguous design or implementation decisions, present: the **problem**, the **goal**, then 3 options with pros/cons and 1 recommendation. A 4th "all of the above" option is permitted when it makes sense. Do not proceed implementing any option until I confirm. This does NOT apply to routine execution within structured command workflows (/commit, /do-this, etc.) which have their own approval logic.
```
**Rationale:** H2. Rules audit Issue 2. The current unbounded "do not proceed" mandate conflicts with commit-instructions auto-staging and do-this medium-route immediate execution.

### RC12. Clarify "One at a time" rule (MEDIUM)

**File:** `~/.dotfiles/claude/CLAUDE.md`
**Current text (lines 22-24):**
```
- **One at a time** - When working through multiple issues, present them one at a time.
    - Include a `[resolved/total]` progress counter...
```
**Proposed text:**
```
- **One at a time** - When presenting multiple issues that each require a separate user decision, present them one at a time with a `[resolved/total]` progress counter. This does NOT limit execution -- if the user asked you to fix all warnings, fix all of them, then report.
    - DO NOT MAKE UP THE TOTAL COUNT! If you don't know the total count of issues do not provide this counter!
```
**Rationale:** M1. Rules audit Issue 5. Ambiguity between "fix all" and "present one at a time" creates confusion about whether to pause after each fix.

### RC13. Fix TodoWrite references (MEDIUM)

**File:** `~/.dotfiles/claude/CLAUDE.md`
**Current text (lines 39-42):**
```
### TodoWrite Usage
**Use for:** 3+ step tasks, complex planning, user-requested lists
**Skip for:** Single/trivial tasks, informational requests
**Rules:** Mark in_progress before starting, mark [x] IMMEDIATELY after each completion, one in_progress max
```
**Proposed text:**
```
### Task Tracking (TaskCreate/TaskUpdate/TaskList)
**Use for:** 3+ step tasks, complex planning, user-requested lists
**Skip for:** Single/trivial tasks, informational requests
**Rules:** Mark in_progress before starting, mark completed IMMEDIATELY after each completion, one in_progress max
```
**Rationale:** M3. Rules audit Issue 10. `TodoWrite` is not the actual tool name; the system provides `TaskCreate`, `TaskUpdate`, `TaskList`.

### RC14. Qualify Python docstring rule (MEDIUM)

**File:** `~/.claude/skills/python/core.md` (or equivalent)
**Current text:**
```
Provide docstrings for all public modules, classes, and functions.
```
**Proposed text:**
```
Provide docstrings for new public modules, classes, and functions you create. Do not add docstrings to existing code you did not modify.
```
**Rationale:** M4. Skills audit Conflict 3. Contradicts CLAUDE.md "Do not add docstrings to code you did not change."

### RC15. Fix TypeScript Bun contradiction (MEDIUM)

**File:** `~/.claude/skills/typescript/SKILL.md`
**Current text:**
```
CRITICAL: MUST use Bun commands
```
**Proposed text:**
```
Prefer Bun if bun.lockb exists. Otherwise detect and use the project's package manager (npm, pnpm, yarn) from the lock file present.
```
**Rationale:** M5. Skills audit Conflict 4. The absolute "MUST use Bun" conflicts with "Respect project package manager" in the same skill.

### RC16. Fix OpenCode review.md model reference (MEDIUM)

**File:** `~/.dotfiles/opencode/commands/review.md`
**Current text:**
```
model: openai/gpt-5.3-codex
```
**Proposed text:** Replace with a verified available model from OpenCode's supported model list.
**Rationale:** M6. Commands audit HIGH finding. Model does not exist as of Feb 2026.

### RC17. Fix -pro agent `rules/` paths (MEDIUM)

**Files:** `csharp-pro.md`, `devops-pro.md`, `python-pro.md`, `terraform-pro.md`, `typescript-pro.md`
**Current text:** "Rules from rules/X/ auto-activate"
**Proposed text:** "Skills from skills/X/ auto-activate" (or remove the claim)
**Rationale:** M7. Commands audit. `rules/` directory does not exist; the correct path is `skills/`.

### RC18. Create or remove missing skill references (HIGH)

**Files:** `/pickup`, `/snapshot`, `/optimize-prompt`, `/prompt-help` commands
**Missing skills:**
- `session-context-management` -- `/pickup` and `/snapshot` delegate entirely to this
- `structured-analysis` -- `/optimize-prompt` and `/prompt-help` require this

**Options:**
1. Create the skills at `~/.claude/skills/{name}/SKILL.md`
2. Inline the implementation into the commands
3. Mark the commands as non-functional/deprecated

**Rationale:** H3. Commands audit "Missing skills" table. 4 commands reference 2 non-existent skills.

### RC19. Add shared-instructions atomicity rule (MEDIUM)

**File:** `~/.dotfiles/claude/CLAUDE.md`
**Current text:** No rule exists
**Proposed text (add to File & Tool Operations):**
```
- **Shared instructions update atomically** - When updating rules or instructions, identify ALL related files and update together: CLAUDE.md, claude/shared/*.md, MEMORY.md, and any command wrappers that reference the changed content.
```
**Rationale:** History-batch-a Finding 9 (session db0c1701). User had to ask "can you update the commit md files and not just the memory files?"

### RC20. Add "removing functionality is not fixing" examples (MEDIUM)

**File:** `~/.dotfiles/claude/CLAUDE.md`
**Current text (Common Pitfalls):**
```
- Removing functionality as a "fix" - If a feature shows wrong data (e.g., count=0), investigate WHY the data is wrong. Never hide/remove the display -- that's suppressing symptoms, not fixing the bug
```
**Proposed text:**
```
- Removing functionality as a "fix" - If a feature shows wrong data (e.g., count=0), investigate WHY the data is wrong. Never hide/remove the display -- that's suppressing symptoms, not fixing the bug. If a migration fails, fix the SQL -- do not delete the migration. If a field returns wrong values, trace the data pipeline -- do not remove the field from the response.
```
**Rationale:** History-batch-a Finding 2 (session 0c4fb327). User said: "are you seriously fixing the issue by just removing it?" Adding concrete examples reinforces the rule.

---

## 5. Quick Wins

Simple (1-2 line edits) AND high-impact. Do these first.

| # | Change | File | Effort | Ref |
|---|--------|------|--------|-----|
| QW1 | Add `--no-verify` override note | `claude/shared/commit-instructions.md` | 2 lines | RC3 |
| QW2 | Fix `MERGE_BASE=origin/dev` to multi-branch fallback | `~/.claude/skills/code-review/SKILL.md` (2 locations) | 2 lines | RC10 |
| QW3 | Replace "MUST use Bun" with conditional detection | `~/.claude/skills/typescript/SKILL.md` | 1 line | RC15 |
| QW4 | Qualify Python docstring rule to new code only | `~/.claude/skills/python/core.md` | 1 line | RC14 |
| QW5 | Remove `--no-verify` exception from git-workflow | `~/.claude/skills/git-workflow/SKILL.md` | 1 line | RC4 |
| QW6 | Fix `rules/` to `skills/` in 5 -pro agent files | 5 agent .md files | 1 line each | RC17 |
| QW7 | Rename TodoWrite section to TaskCreate/TaskUpdate/TaskList | `claude/CLAUDE.md` | 3 lines | RC13 |
| QW8 | Fix `.spec/` to `.specs/` in development-philosophy | `~/.claude/skills/development-philosophy/SKILL.md` | 1 line | Skills audit |
| QW9 | Fix `.spec/` to `.specs/` in claude-code-workflow | `~/.claude/skills/claude-code-workflow/SKILL.md` | 1 line | Skills audit |
| QW10 | Add retry discipline to Common Pitfalls | `claude/CLAUDE.md` | 2 lines | RC7 |

---

## 6. Structural Issues

These need rethinking, not just text patches.

### S1. The Ask vs Execute Paradox (affects entire ruleset)

**Problem:** Three layers of the ruleset give contradictory guidance on when to ask vs when to execute:
1. CLAUDE.md "ALWAYS Ask" (global default: ask)
2. CLAUDE.md "Complete ALL steps" (execution override: don't ask)
3. development-philosophy skill "Execute immediately" (skill override: never ask)
4. `/do-this` medium route "No approval gate" (command override: skip approval)
5. 1-3-1 Rule "Do not proceed until I confirm" (global default: always confirm)

Each layer was added to fix a different problem, but together they form a contradictory stack. An agent reading all of them simultaneously has no clear resolution order.

**Recommendation:** Establish a single decision framework:
- **Ambiguous scope?** Ask before starting (replaces "ALWAYS Ask")
- **Clear scope, executing steps?** Complete without asking (replaces "Complete ALL steps")
- **Structured command invoked?** Follow command's own approval logic (replaces per-command exceptions)
- **Design decision with trade-offs?** Use 1-3-1 (replaces unbounded 1-3-1)

This is RC1 + RC8 + RC11 combined into an architectural fix.

### S2. Missing Skills Architecture

**Problem:** 4 commands (`/pickup`, `/snapshot`, `/optimize-prompt`, `/prompt-help`) reference 2 skills that do not exist (`session-context-management`, `structured-analysis`). These commands are effectively non-functional.

**Recommendation:** Audit all commands for skill dependencies. Either:
- Create the missing skills
- Inline the functionality
- Deprecate the commands with a clear message
- Add a pre-flight check to command execution that validates skill existence

This is a systemic issue -- no mechanism prevents commands from referencing non-existent skills.

### S3. Skill Trigger Overlap Creates Unpredictable Behavior

**Problem:** The skill activation system uses keyword matching with no priority or exclusivity mechanism. When a user says "review this architecture for security issues," at least 4 skills activate simultaneously: code-review, analysis-workflow, development-philosophy, and api-design. Each provides competing methodologies and some contradict each other.

**Recommendation:** Two possible approaches:
1. **Exclusive ownership:** Each trigger keyword maps to exactly one skill. Create a trigger registry that prevents overlap. (More deterministic, aligns with user's preference for determinism.)
2. **Priority tiers:** Skills have priority levels; when multiple activate, highest-priority wins. (More flexible but harder to reason about.)

The trigger overlap table from the skills audit (10 overlapping keywords across 15+ skills) should be used as the starting point.

### S4. Builder Agent Validation Commands Have No Single Source of Truth

**Problem:** All three builder agents (builder, builder-light, builder-heavy) duplicate identical validation command lists:
```
Python: uv run ruff check + uv run pytest
TypeScript: npx @biomejs/biome check + npm test
Shell: shellcheck + make test
Go: go vet + go test
```
Adding a new language or changing a command requires editing 3 files. The typescript-pro agent also conflicts by preferring `bun` over `npm` for these same commands.

**Recommendation:** Extract validation commands into a shared reference file (e.g., `claude/shared/validation-commands.md`) that all builder agents include. Language-specific agents can override when a project's lock file indicates a different package manager.

### S5. MEMORY.md Contains Rules That Should Be in CLAUDE.md

**Problem:** Several rules exist only in MEMORY.md (auto-memory) rather than in CLAUDE.md (project rules):
- "Verify technology claims via web search" -- proven friction pattern, still only in memory
- "Port ALL query logic when moving code" -- proven friction pattern, only in memory
- "Test migrations locally before deploying" -- proven friction, only in memory

MEMORY.md is project-specific and may not load in all contexts. Critical behavioral rules belong in CLAUDE.md where they are always visible.

**Recommendation:** Audit MEMORY.md for rules that have been proven by friction incidents. Promote them to CLAUDE.md. Keep MEMORY.md for project-specific context (e.g., "SurrealDB chunk.content_id stores plain strings") rather than behavioral rules.

### S6. No Mechanism to Prevent Commands Referencing Non-Existent Resources

**Problem:** Multiple commands reference non-existent skills, non-existent models, and non-existent command paths:
- `/pickup` and `/snapshot` reference `session-context-management` skill (missing)
- `/optimize-prompt` and `/prompt-help` reference `structured-analysis` skill (missing)
- `opencode/commands/review.md` references `openai/gpt-5.3-codex` model (missing)
- `README.md` documents `/optimize-ruleset` and `/acceptance-criteria` (missing)

**Recommendation:** Add a validation step to `/skills-engineer audit` mode that checks all commands for:
- Skill references that resolve to existing `~/.claude/skills/*/SKILL.md` files
- Model references that are in a known-good list
- Command cross-references that resolve to existing files

This could also be a pre-commit hook or a periodic health check.

---

## Appendix: Audit Source Cross-Reference

| Finding | History A | History B | Debug | Rules | Skills | Commands |
|---------|-----------|-----------|-------|-------|--------|----------|
| Ask vs Execute paradox | | Pattern 2 | | Issue 1 | Conflict 1 | |
| Sycophancy scope | Finding 6 | Pattern 10 | | | | |
| --no-verify conflict | | | | Issue 4 | Conflict 2 | /commit |
| No proactive file creation scope | | | | Issue 3 | Conflict 5 | /idea |
| Pre-existing abuse | Finding 1 | Pattern 4 | | | | |
| git restore on user files | | Pattern 1 | | | | |
| Remove functionality as fix | Finding 2 | | | | | |
| Unverified tech claims | Finding 3 | | | | | |
| Retry without strategy | | | 7x Read, 14x Bash | | | |
| Missing skills | | | | | | /pickup, /snapshot, /optimize-prompt |
| code-review wrong base | | | | | BLOCKER 1 | |
| dev-philosophy triggers | | | | | BLOCKER 2 | |
| Bun contradiction | | | | | Conflict 4 | typescript-pro |
| Python docstrings | | | | | Conflict 3 | |
| TodoWrite terminology | | | | Issue 10 | | |
| -pro agent rules/ path | | | | | | 5 agents |
