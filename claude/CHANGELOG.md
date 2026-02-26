# Personal Ruleset Changelog

This file tracks changes to the personal Claude Code ruleset (`~/.claude/CLAUDE.md`) and associated skills/commands.

---

## 2026-02-26: Fix Windows console window flashing caused by uv in hooks

**Fixed:**
- Replaced `uv run` with bare `python` in all hook commands in `settings.json` — `uv.exe` spawns visible `conhost.exe` windows on the hook execution path in Claude Code v2.1.45+
- Removed redundant `bash -c` wrapper from all Python hook commands (was spawning an unnecessary extra bash layer)
- Normalized outlier hook patterns: PermissionRequest no longer uses `-l` (login shell) or bare `python` without `uv`; statusLine uses `$HOME` instead of `~`
- Added `pip install pyyaml tree-sitter tree-sitter-bash` to both `install` and `install.ps1` for hook dependencies
- Updated tracking doc with diagnostic findings and posted follow-up comments to #28138 and #14828
- Cleaned up duplicate uv binaries (orphaned pip installs shadowing WinGet version)

**Root cause:** Claude Code v2.1.45+ lost `windowsHide: true` on the hook spawn path. Any hook command that launches a Windows console-subsystem binary (like `uv.exe`) allocates a visible `conhost.exe`. Bare `python` runs inside the existing bash process so no new console is allocated.

**Files:** `claude/settings.json`, `claude/tracking/windows-console-flashing.md`, `install`, `install.ps1`

---

## 2026-02-26: /review-plan file persistence — findings survive context compaction

**Changed:**
- All reviewer agents now write findings to files at `.specs/{plan-name}/review-{N}/{reviewer-slug}.md`
- Rebuttal agents read peer findings from files and write rebuttals to `rebuttal-{slug}.md`
- Synthesis step reads from files (canonical source) rather than conversation context
- Final synthesis written to `review-{N}/synthesis.md` for permanent record
- New "Review Output Directory" section documents the file structure, naming conventions, and derivation rules
- Step 1 now includes creating the output directory (`mkdir -p`)
- Step 3 explicitly instructs main agent to re-read findings from files before rebuttal round
- Step 4 explicitly instructs main agent to re-read from files before synthesis
- Rebuttal prompt templates updated to use Read tool for file-based input

**Why:** During a real review, context compaction between Step 2 (5 reviewer agents) and Step 3 (rebuttal round) caused all verbatim reviewer findings to be lost. The synthesis had to reconstruct from a compaction summary, skipping the formal rebuttal round entirely. File persistence eliminates this failure mode.

**Files:** `~/.dotfiles/claude/shared/review-plan-instructions.md`

---

## 2026-02-25: Major /review-plan redesign — dynamic panels, outside-the-box expert, rebuttal round

**Changed:**
- Dynamic expert panel — main agent analyzes plan content and composes the reviewer panel (4-8 experts) instead of hardcoded 4
- 3 mandatory reviewers (Completeness, Adversarial, Outside-the-Box) + dynamic selection from suggested pool
- New "Outside-the-Box / Simplicity" mandatory reviewer — questions the approach itself, checks industry best practices via web search, evaluates proportionality of complexity to goal (`max_turns: 8`)
- Suggested expert pool with 6 archetypes (Ops/SRE, Security, Database, Networking, Cost, Compliance) as starting points; pool is a reference, not a constraint — custom reviewers encouraged
- Rebuttal round (Step 3) — after all reviewers complete, domain experts respond to OtB findings with AGREE/PARTIAL/DISAGREE. Uses haiku, `max_turns: 1` for speed. Consensus determines whether complexity is justified or the plan should simplify.
- Enforce parallel launch — all Task calls must be in a single message (mandatory)
- `max_turns: 5` for standard reviewers, `max_turns: 8` for Outside-the-Box
- Cap findings at 8 per reviewer
- Outside-the-Box assessment + rebuttal summary gets its own prominent section in output
- Remove redundant "Suggested Plan Edits" section — findings already contain suggestions
- Panel is presented to user before launch (but launched immediately, no approval wait)

**Files:** `~/.dotfiles/claude/shared/review-plan-instructions.md`

---

## 2026-02-25: Create /review-plan command

**Added:**
- `/review-plan` command — launches 4 parallel expert reviewers (Ops/SRE, Security, Completeness, Adversarial/Red Team) against a plan file
- Thin command file at `~/.dotfiles/claude/commands/review-plan.md`
- Full instructions at `~/.dotfiles/claude/shared/review-plan-instructions.md`

**Files:** `~/.dotfiles/claude/commands/review-plan.md`, `~/.dotfiles/claude/shared/review-plan-instructions.md`

---

## 2026-02-21: Add workflow orchestration rules

**Added:**
- "Plan mode default" critical rule — enter plan mode for non-trivial tasks, re-plan on failure
- "Workflow Orchestration" section with task tracking (`tasks/todo.md`, `tasks/lessons.md`), demand elegance, autonomous bug fixing, and verification-before-done
- Self-improvement loop: update `tasks/lessons.md` after any user correction

**Changed:**
- KISS principle — added "every change should touch minimal code"
- Subagent guidance — expanded to "use liberally, one focused task per subagent, throw more compute at complex problems"

**Files:** `claude/CLAUDE.md`

---

## 2026-02-17: Eliminate provenance-based work avoidance

**Added:**
- New critical rule: "Never use provenance to avoid requested work" — blocks using "pre-existing", "not my changes", etc. as reasons to skip user-requested work

**Changed:**
- "Fix ALL errors and warnings" — removed escape hatch language ("prove it's pre-existing"), replaced with "fix them all regardless of who introduced them"
- "Never revert user changes" → renamed to "No unsolicited destructive git actions" — narrowed scope to destructive actions only, no longer implies skipping requested work on files you didn't author
- `/commit` instructions now explicitly state to commit ALL uncommitted files matching auto-stage rules, regardless of who made the changes

**Files:** `claude/CLAUDE.md`, `claude/shared/commit-instructions.md`

---

## 2026-02-16: Add root cause analysis rules and common pitfalls

**Added:**
- Technology capabilities verification rule (search docs before claiming limitations)
- Root Cause Analysis section (investigate before fixing, never mask symptoms)
- Common pitfalls: removing functionality as fix, multiple deploy cycles, silent query failures

**Files:** ~/.claude/CLAUDE.md

---

## 2026-02-15: CLAUDE.md Cleanup & Skill Trigger Expansion

**Removed:**
- Session History Capture section (never produced meaningful entries, only "session_end" stubs)
- Auto-Activating Skills cheat sheet (redundant with skill frontmatter descriptions)
- Research archive reference line (already covered in research-archive skill)

**Changed:**
- Broadened activation triggers in 11 SKILL.md files: docs, llmstxt, code-review, docker, database, csharp, terraform, ansible, go, ruby, rust
- Added missing file patterns, CLI commands, and language concepts to each skill's description
- Added changelog maintenance instruction to CLAUDE.md (replacing passive reference)

**Impact:**
- ~42 lines of redundant instructions removed from CLAUDE.md
- Skills now auto-activate on broader set of relevant keywords and file patterns

**Files:**
- `~/.claude/CLAUDE.md`
- `~/.claude/skills/{docs,llmstxt,code-review,docker,database,csharp,terraform,ansible,go,ruby,rust}/SKILL.md`

---

## 2025-11-10: Ruleset Optimization (History Analysis)

**First `/optimize-ruleset personal` run:**
- Analyzed all 242 history entries (Nov 7-10, 2025)
- Created CHECKPOINT file for incremental future runs
- Identified 7 patterns from actual usage

**HIGH priority additions** (based on 3+ occurrences):
- **KISS principle** added to Critical Rules: "Default to SIMPLEST solution. No features 'just in case'. MVP first."
- **Absolute paths** added to Communication: "Always provide absolute paths in responses (not relative)"
- **Real-time checklist tracking** enhanced in TodoWrite: "mark [x] IMMEDIATELY after each completion"
- **Idempotent scripts** added to Common Pitfalls: "ALL setup/install scripts MUST be safely re-runnable"

**MEDIUM priority additions** (2 occurrences):
- **Complete tasks** added to Tool Preferences: "Complete ALL steps of clear-scope tasks without asking between steps"
- **Detect state directly** added to Common Pitfalls: "Detect state from system directly" (avoid tracking files)
- **Fail-fast** already covered in development-philosophy skill (no change needed)

**Results:**
- Before: 82 lines, 410 words (~533 tokens)
- After: 87 lines, 468 words (~608 tokens)
- Added: +75 tokens (14% increase)
- Addresses: 9 checklist reminders, 3 KISS violations, 3 idempotency issues, 32 path clarifications per session

**Token efficiency maintained:**
- Personal ruleset stays minimal (87 lines, under 100-line target)
- 10 skills (13,616 tokens) load only when relevant
- Progressive disclosure architecture preserved

---

## 2025-11-10: Skills Consolidation from GitHub Copilot Analysis

**Analyzed 7 GitHub Copilot projects** and consolidated best practices into Claude Code skills:
- agent-spike, mentat-cli, joyride-python, ContextMenuEditor, onboard, attempt-one, onramp
- 18 .specstory chat histories analyzed
- ~6,000 lines of Copilot instructions reviewed

**Created GitHub Copilot template repository:**
- Location: `/c/Projects/copilot-instructions-template/`
- 9 consolidated instruction files (python, dockerfile, devcontainer, testing, makefile, ignore-files, self-explanatory-code, copilot_customization, mcp_services)
- 4 prompt files (commit, check, test, lint)
- Ready for reuse across projects

**Enhanced python-workflow skill:**
- Merged patterns from copilot-python-workflow
- Added UV-exclusive commands table (✅ correct vs ❌ incorrect)
- Added CRITICAL section for zero warnings tolerance
- Added CQRS/IoC architecture patterns
- Enhanced testing workflow (targeted during dev, full before commit)
- Self-explanatory code philosophy
- Optimized for Haiku 4.5 (directive language, tables, examples preserved)

**Enhanced container-projects skill:**
- Merged patterns from copilot-container-workflow
- Added CRITICAL section for Docker Compose V2 (no `version:`, use `docker compose`)
- Added 12-factor app compliance table
- Added security-first practices (non-root users, Alpine images)
- Multi-stage build examples
- Health check patterns
- DevContainer configuration
- DNS configuration (.internal vs .local)
- Optimized for Haiku 4.5 (doubled practical examples, 3 tables for scanning)

**Created testing-workflow skill:**
- New standalone skill for testing patterns
- CRITICAL: Zero warnings tolerance with status table
- Targeted testing during development
- Full suite before commits
- >80% coverage on critical paths
- AAA pattern, fixtures, mocking, parametrization
- Pre-commit requirements checklist
- Optimized for Haiku 4.5

**Enhanced development-philosophy skill:**
- Merged copilot-communication-style and copilot-autonomous-execution patterns
- Added BE BRIEF communication (action over commentary, one sentence max)
- Added autonomous execution workflow (7 steps)
- Self-recovery from errors
- Complete tasks fully before returning
- Execute immediately, don't ask permission
- Optimized for Haiku 4.5

**Updated CLAUDE.md:**
- Updated skill descriptions to reflect enhanced capabilities
- Added testing-workflow to core workflows
- Consolidated "Copilot-Derived Patterns" into core workflows
- Updated Python skill: uv-exclusive, zero warnings, CQRS
- Updated Containers skill: Compose V2, 12-factor, multi-stage
- Updated Development Philosophy: BE BRIEF, autonomous execution
- Maintained under 100 lines (85 lines)

**All Copilot references removed:**
- Skills rewritten as native Claude Code guidance
- Adapted applyTo frontmatter → activation triggers
- Adapted .github/ directory → .claude/ directory
- Adapted copilot-instructions.md → CLAUDE.md references
- No "Copilot" branding in any skill

**Token efficiency:**
- Skills auto-activate based on project signals
- Examples preserved for pattern recognition
- Directive language for Haiku 4.5
- Tables and lists for scanability

---

## 2025-11-08: Git Workflow & Commit Command Optimization

**Optimized commit.md for Haiku 4.5:** (38% reduction)
- Before: 114 lines, 478 words, ~621 tokens
- After: 87 lines, 297 words, ~386 tokens
- Removed philosophical framing and skill references
- Inlined critical security patterns and commit types
- Pure procedural checklist format
- HEREDOC template provided inline

**Optimized git-workflow/SKILL.md:** (36% reduction)
- Before: 139 lines, 761 words, ~989 tokens
- After: 97 lines, 485 words, ~631 tokens
- Removed duplicate push behavior section
- Reduced examples from 6 to 2
- Converted commit types to table format
- Consolidated security warnings
- Removed meta-commentary

**Architecture Benefits:**
- Total system: 1,610 → 1,017 tokens (37% reduction)
- Command is purely procedural with inline data
- Skill contains philosophy and rationale
- No help separation needed (simpler workflow than prompt engineering)
- Follows "Commands execute, skills educate" principle

**Haiku 4.5 Improvements:**
- Direct checklist format in command
- No "consult skill" indirection
- Critical data (patterns, types) inline for execution
- Removed verbose headers and examples

---

## 2025-11-08: Prompt Engineering Optimization & Help Separation

**Created `/prompt-help` command for documentation:**
- New dedicated help command (106 lines, ~260 tokens)
- Routes help requests to skill for documentation
- Handles "all techniques" or specific technique queries
- Clean separation: execution vs documentation

**Optimized prompt-engineering skill:** (56% reduction)
- Before: 499 lines, ~4,209 tokens
- After: 328 lines, ~1,872 tokens
- Consolidated 3 quick references into 1 decision tree
- Converted selection guide to compact decision tree format
- Compressed anti-patterns to table format
- Streamlined effectiveness indicators
- Kept all 7 technique templates intact (essential functionality)

**Updated optimize-prompt.md:**
- Now 106 lines, ~411 tokens (previously had help content removed)
- Help mode redirects to `/prompt-help` command
- Pure execution logic, no documentation overhead

**Architecture Benefits:**
- Normal optimization: Loads 2,283 tokens (optimize + skill)
- Help request: Loads 2,132 tokens (prompt-help + skill)
- ~40% token savings vs combined approach
- Clean command separation: optimize, help, skill

---

## 2025-11-08: Major Command & Skill Optimization for Haiku 4.5

**Optimized for Haiku 4.5 Compatibility:**

**Changed:**
- **ruleset-optimization skill**: Removed procedural overlap, kept philosophy only (36% reduction)
  - Before: 262 lines, ~1,414 tokens
  - After: 161 lines, ~900 tokens
  - Removed numbered workflow steps, kept principles and guidelines

- **optimize-ruleset.md command**: Massive streamlining (81% reduction!)
  - Before: 1,792 lines, ~9,673 tokens
  - After: 356 lines, ~1,821 tokens
  - Removed philosophical explanations (now references skill)
  - Simplified to direct procedural steps
  - Kept all critical bash commands and logic

- **analyze-permissions.md command**: Enhanced with clear phases (+124% for clarity)
  - Before: 91 lines, ~580 tokens
  - After: 299 lines, ~1,300 tokens
  - Added 6-phase structure for better Haiku execution
  - Added explicit error handling and edge cases

- **optimize-prompt.md command**: Integrated help functionality
  - Added frontmatter with argument-hints for all 7 techniques + help
  - Merged prompt-help.md content into main command
  - Deleted redundant prompt-help.md file

**Key Principle Applied:**
- **"Commands execute, skills educate"** - Clear separation of concerns
- Commands: Direct procedural steps (WHAT and HOW)
- Skills: Philosophy and principles (WHY and WHEN)

**Total Impact:**
- System-wide token reduction: **66%** (11,667 → 4,021 tokens)
- optimize-ruleset alone: **7,852 tokens saved per invocation**
- Better Haiku 4.5 compatibility through:
  - Direct imperatives ("Run X" not "Consider running X")
  - Numbered lists instead of nested explanations
  - No meta-commentary or educational asides
  - Clear phase structure throughout

**Files Modified:**
- `~/.claude/skills/ruleset-optimization/SKILL.md`
- `~/.claude/commands/optimize-ruleset.md`
- `~/.claude/commands/analyze-permissions.md`
- `~/.claude/commands/optimize-prompt.md` (enhanced)
- `~/.claude/commands/prompt-help.md` (deleted - merged into optimize-prompt)

**Backups Created:**
- `.backup` files preserved for all modified files

---

## 2025-11-05: Prompt Engineering Skill and Commands

**Added:**
- Created `prompt-engineering` skill with 7 advanced techniques
- Created `/optimize-prompt` command for transforming prompts
- Created `/prompt-help` command for documentation

**Details:**
- Based on "The Mental Models of Master Prompters" YouTube video
- Techniques include: meta-prompting, recursive-review, deep-analyze, multi-perspective, deliberate-detail, reasoning-scaffold, temperature-simulation
- Manual invoke only (not auto-activate) to control token usage
- Intelligent technique selection when user doesn't specify techniques
- Composable: Can combine multiple techniques (e.g., `deep-analyze,multi-perspective`)

**Files:**
- `~/.claude/skills/prompt-engineering/SKILL.md`
- `~/.claude/commands/optimize-prompt.md`
- `~/.claude/commands/prompt-help.md`

**Impact:**
- Enables transformation of basic prompts into high-quality structured prompts
- Provides systematic approaches for verification, multi-perspective analysis, and detailed reasoning
- Token-aware (1.5-4x cost depending on techniques used)

---

## 2025-11-04: Ruleset Optimization via /optimize-ruleset

**Changed:**
- Added Context Efficiency Philosophy as PRIMARY principle
- Enhanced terminology section with explicit "local vs project" distinction
- Updated skill references with CRITICAL rules (uv run, never push, STATUS.md first)
- Emphasized security-first git workflow

**Impact:**
- Total optimization: ~28% context reduction achieved in agent-spike project
- Skills now include history-learned rules to prevent future errors
- Clearer distinction between personal and project rulesets

---

## 2025-11-04: Moved Context-Specific Sections to Skills

**Created Skills:**
- `python-workflow` skill (~18 lines saved in non-Python projects)
- `multi-agent-ai-projects` skill (~7 lines saved)
- `web-projects` skill (~6 lines saved)
- `container-projects` skill (~6 lines saved)

**Impact:**
- Total potential savings: ~37 lines when working in non-matching projects
- Skills auto-activate based on project context (files, configs, patterns)
- Improved token efficiency through progressive disclosure

**Files:**
- `~/.claude/skills/python-workflow/SKILL.md`
- `~/.claude/skills/multi-agent-ai-projects/SKILL.md`
- `~/.claude/skills/web-projects/SKILL.md`
- `~/.claude/skills/container-projects/SKILL.md`

---

## 2025-11-04: Git Workflow Moved to Skill

**Created:**
- `git-workflow` skill in `~/.claude/skills/git-workflow/`

**Changes:**
- Moved all git workflow guidelines from CLAUDE.md to skill
- Skill auto-activates when git operations detected
- Saves ~70 lines of context in non-git sessions

**Impact:**
- Progressive disclosure improves token efficiency
- Git guidelines available when needed, not baseline overhead

**File:**
- `~/.claude/skills/git-workflow/SKILL.md`

---

## 2025-11-04: Enhanced Git Workflow Section

**Added:**
- Extracted core principles from `/commit` command
- Security-first approach (scan before committing)
- Documented logical commit grouping (docs, test, feat, fix, etc.)
- Specified commit message format with HEREDOC
- Added verification and push behavior rules

**Impact:**
- Ensures consistent git workflow regardless of how commits are requested
- Security scanning always runs first
- Standardized commit message format across all commits

---

## 2025-11-04: Initial Personal Ruleset Creation

**Created:**
- `~/.claude/CLAUDE.md` (personal ruleset applying to all projects)

**Included:**
- Terminology clarification (local vs personal ruleset)
- Documented uv best practices for Python projects
- Added todo list management guidelines
- Included multi-agent project patterns
- Context efficiency philosophy
- Security & privacy guidelines
- Session management patterns

**Context:**
- Created during multi-agent learning project
- Established foundation for skills-based architecture
- Emphasized progressive disclosure and token efficiency

**Impact:**
- Centralized personal preferences across all projects
- Foundation for context-efficient ruleset architecture
- Clear separation between personal and project-specific rules

---

## Changelog Conventions

**Entry Format:**
```markdown
## YYYY-MM-DD: Brief Description

**Added/Changed/Removed/Fixed:**
- Bullet points describing changes

**Details:**
- Additional context if needed

**Files:**
- List of files created/modified

**Impact:**
- What changed for the user
- Performance/efficiency gains
- Behavioral changes
```

**Categories:**
- **Added**: New features, skills, commands
- **Changed**: Modifications to existing functionality
- **Removed**: Deprecated or deleted features
- **Fixed**: Bug fixes or corrections
