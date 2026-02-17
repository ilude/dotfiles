# Skills Audit Report

**Skills audited:** 27
**Source:** ~/.claude/skills/
**Scope:** Activation triggers, content quality, CLAUDE.md alignment, cross-skill conflicts

---

## Summary

The 27 skills are broadly well-structured, but four critical issues require immediate action:

1. `code-review` hardcodes `origin/dev` as the merge base branch -- this repo uses `origin/main`, causing every review to diff against the wrong branch
2. `code-review` explicitly prohibits "Verified Safe" sections, but the agent system prompt requires them -- direct contradiction
3. `development-philosophy` says "Execute immediately. Never ask permission" -- directly contradicts CLAUDE.md ALWAYS Ask rule and 1-3-1 Rule
4. `development-philosophy` has 15+ broad trigger keywords overlapping 8+ other skills, causing it to activate in almost every context

---

## Per-Skill Analysis

### analysis-workflow
**Triggers:** analyze, review, validate, critique, debug, troubleshoot, red-team, adversarial
**Assessment:** MODERATE

- review trigger overlaps with `code-review` skill -- when user says review this code, both skills activate with competing methodology instructions
- debug and troubleshoot triggers overlap with `logging-observability`
- Sub-files (structured-analysis.md, debugging.md, adversarial.md) confirmed to exist
- Content quality is good; methodology is sound

**Recommendation:** Narrow review trigger to analyze and validate only; let `code-review` own review exclusively.

---

### ansible
**Triggers:** Ansible YAML files, playbooks, inventory files, roles, handlers, ansible-playbook, ansible-lint, molecule, Ansible Galaxy
**Assessment:** GOOD

- Trigger specificity is excellent -- only fires on explicit Ansible artifacts
- No conflicts with other skills
- Minor: does not cross-reference `terraform` skill for hybrid infra workflows

**Recommendation:** Add cross-reference to `terraform` in frontmatter description.

---

### api-design
**Triggers:** designing APIs, API patterns, REST, GraphQL, authentication tokens
**Assessment:** MODERATE

- authentication tokens trigger overlaps with `development-philosophy` (security triggers) and `git-workflow` (token secrets scanning)
- Could activate during security discussions unrelated to API design
- Content is solid for REST/GraphQL design

**Recommendation:** Remove authentication tokens from trigger -- it is too broad. Narrow to API design, REST design, GraphQL schema.

---

### brainstorming
**Triggers:** design decisions, architectural choices, problems with multiple solutions
**Assessment:** MODERATE

- Instructs generate 3+ options before acting -- this aligns with CLAUDE.md 1-3-1 Rule
- BUT `development-philosophy` also activates on design decisions and says Execute immediately -- direct contradiction when both fire
- The brainstorming skill is correct; development-philosophy is the conflicting party

**Recommendation:** No changes to this skill. Fix `development-philosophy` trigger overlap (see critical issues).

---

### claude-code-workflow
**Triggers:** Claude Code usage, prompting strategies, context management, /snapshot, /pickup, hooks, multi-instance, browser automation, ruleset optimization, CLAUDE.md optimization, multi-agent projects
**Assessment:** MODERATE

- References CURRENT.md and STATUS.md in content -- these files are not created by any known command; dangling references
- Sub-files confirmed: browser-orchestration.md, context-management.md, marketplace-manager.md, multi-agent-projects.md, multi-instance.md, ruleset-optimization.md
- The .spec/ reference in body should be .specs/ (CLAUDE.md uses .specs/ with trailing s)
- References older model names that may be outdated

**Recommendation:** Remove or document CURRENT.md and STATUS.md references. Fix .spec/ to .specs/. Update model references.

---

### code-review
**Triggers:** code review, review code, review changes, review PR, review diff, review branch, review commit, PR review, pull request review, git diff, git show, compare changes
**Assessment:** CRITICAL -- 2 blockers

**BLOCKER 1 -- Wrong base branch:**
SKILL.md line 33 and line 214: MERGE_BASE=
The dotfiles repo uses origin/main as the default branch, not origin/dev. This diffs against the wrong base, potentially including unrelated commits or failing if origin/dev does not exist.

**BLOCKER 2 -- Verified Safe contradiction:**
SKILL.md line 156: Do NOT include Verified Safe sections.
The agent system prompt for this repo requires a Verified Safe section in every review output. These two instructions cannot both be followed simultaneously.

**Recommendation:**
1. Change origin/dev to try multiple bases: git merge-base origin/main HEAD 2>/dev/null || git merge-base origin/dev HEAD 2>/dev/null || git merge-base origin/master HEAD 2>/dev/null
2. Remove the Verified Safe prohibition OR add a note that the agent system prompt overrides this rule when present

---

### csharp
**Triggers:** .cs, .csproj, .sln files, dotnet CLI, NuGet, Entity Framework, LINQ, dependency injection, xUnit/NUnit
**Assessment:** GOOD

- Thin wrapper pattern -- appropriate for language skill
- Trigger specificity is excellent
- Sub-files (core.md, testing.md) follow expected pattern

**Recommendation:** None.

---

### database
**Triggers:** .sql files, database schemas, migrations, ORMs, query optimization, indexing, transactions, EXPLAIN plans, PostgreSQL, MySQL, SQLite, DynamoDB, Redis
**Assessment:** MODERATE

- Trigger includes Redis and DynamoDB, but skill body is almost entirely focused on relational SQL
- Redis and DynamoDB have fundamentally different query patterns -- activating this skill for Redis work could give misleading advice
- No mention of SurrealDB despite active use in the menos submodule

**Recommendation:** Either expand content to cover NoSQL patterns for Redis/DynamoDB, or remove them from triggers. Add SurrealDB coverage if menos is actively developed.

---

### development-philosophy
**Triggers:** planning, architecture, design decisions, MVP, over-engineering, simplicity, fail-fast, experiment-driven, comments, docstrings, documentation philosophy, POLA, security design, threat modeling, authentication, authorization, API security, secrets, encryption, security review
**Assessment:** CRITICAL -- 2 blockers

**BLOCKER 1 -- Autonomy contradiction with CLAUDE.md:**
SKILL.md lines 12, 44, 230: Execute immediately. Never ask permission for obvious steps.
CLAUDE.md global rules: ALWAYS Ask, do not assume -- Never guess or fill in blanks. And the 1-3-1 Rule: Do not proceed implementing any option until I confirm.
These are directly contradictory. When development-philosophy activates, it overrides the ask-first behavior the user has configured as a global rule.

**BLOCKER 2 -- Overly broad trigger set:**
The 20+ trigger keywords cause this skill to activate in almost every technical conversation. Overlaps with: brainstorming (design decisions), api-design (authentication, API security), docs (comments, docstrings), analysis-workflow (planning, reviewing), planning (planning phases), code-review (security review), docker (security design).
Result: Execute immediately fires during contexts where the user explicitly wants deliberation.

Also: line 116 uses .spec/ path -- should be .specs/ per project convention.

**Recommendation:**
1. Replace Execute immediately. Never ask permission with language that defers to CLAUDE.md ask-first rules.
2. Drastically narrow triggers. Suggested: keep only MVP, over-engineering, experiment-driven, fail-fast. Remove: planning, architecture, design decisions, comments, docstrings, POLA, security-related terms.
3. Fix .spec/ to .specs/.

---

### docker
**Triggers:** Dockerfile, docker-compose.yml, .dockerignore, .devcontainer, devcontainer.json, Docker, containers, images, container orchestration, podman
**Assessment:** MINOR

- References Kubernetes as out-of-scope with note see Kubernetes skill -- no Kubernetes skill exists
- Trigger specificity is good otherwise

**Recommendation:** Remove the see Kubernetes skill reference or replace with: container orchestration outside Docker/Compose is out of scope.

---

### docs
**Triggers:** documentation, .md markdown files, README, CHANGELOG, docs/ folders, mkdocs, docusaurus, technical writing
**Assessment:** MINOR

- Content states use 4-space nesting for lists -- this is a markdownlint-specific preference, not a universal rendering requirement. CommonMark allows 2-space nesting.
- documentation philosophy trigger overlaps with `development-philosophy`

**Recommendation:** Qualify the 4-space nesting rule as for markdownlint compatibility rather than as a universal requirement.

---

### git-workflow
**Triggers:** git operations, commits, branches, .git/ files, .gitignore, .gitattributes, commit, push, merge, rebase, reset, filter-branch, history rewrite
**Assessment:** MODERATE

**Conflict with CLAUDE.md on --no-verify:**
SKILL.md line 143: MUST NOT skip hooks (--no-verify) without explicit request EXCEPT when creating multiple atomic commits.
CLAUDE.md global rules: NEVER skip hooks without explicit user request (no exceptions listed). The skill creates an exception the global rule does not permit.
The /commit skill already handles the run-tests-once then --no-verify pattern for explicit user invocations -- git-workflow is duplicating that logic with a conflicting policy.

reset trigger is overly broad -- fires on casual reset my thinking type user utterances.

**Recommendation:**
1. Remove the --no-verify multi-commit exception from git-workflow. That logic belongs in /commit only.
2. Narrow reset trigger to git reset (require git qualifier).

---

### go
**Triggers:** .go files, go.mod, go.sum, Go patterns, goroutines, channels, interfaces, go test, go vet, Go concurrency
**Assessment:** GOOD

- Thin wrapper pattern with excellent trigger specificity
- Sub-files (core.md, testing.md) confirmed
- No conflicts

**Recommendation:** None.

---

### llmstxt
**Triggers:** llms.txt, /llms.txt endpoints, llms-full.txt, AI-readable documentation, machine-readable docs, llmstxt.org
**Assessment:** GOOD

- Narrow, specific triggers -- will not fire spuriously
- References tools.md sub-file (not confirmed to exist at ~/.claude/skills/llmstxt/tools.md)

**Recommendation:** Verify tools.md exists.

---

### logging-observability
**Triggers:** logging, observability, tracing, debugging, structured logging, log aggregation, performance metrics, monitoring, correlation ID, trace ID
**Assessment:** MODERATE

- debugging trigger overlaps with `analysis-workflow` (debug trigger)
- When user says I am debugging this issue, both skills activate with potentially different diagnostic methodologies
- Content is solid and focused on observability

**Recommendation:** Remove debugging from triggers. Keep structured logging, observability, tracing, monitoring, correlation ID, trace ID. Debugging methodology belongs to analysis-workflow.

---

### planning
**Triggers:** acceptance criteria, PRDs, requirements, user stories, verification criteria, converting vague requirements into testable outcomes
**Assessment:** MODERATE

- References commands: /prd, /plan-with-team, /do-this, /ptc -- /ptc has not been independently confirmed as a separate command vs a skill alias
- planning phases trigger used by development-philosophy description -- overlap when both fire together
- Content quality is excellent for acceptance criteria methodology

**Recommendation:** Confirm /ptc command path. Narrow trigger to not overlap with development-philosophy planning keyword -- require acceptance criteria or PRD specifically.

---

### python
**Triggers:** Python files, pyproject.toml, uv, pip, pytest, Python code patterns
**Assessment:** MODERATE

**Conflict with CLAUDE.md on docstrings:**
The skill (python/core.md) instructs: Provide docstrings for all public modules, classes, and functions. CLAUDE.md rule: Do not add docstrings to code you did not change. Directly contradictory in existing Python codebases.

SKILL.md has two sections titled Quick Reference -- duplicate heading creates navigation ambiguity.

**Recommendation:**
1. Qualify docstring instruction: Add docstrings to new public APIs you create; do not add docstrings to existing code you did not modify.
2. Rename one Quick Reference section to distinguish them.

---

### research-archive
**Triggers:** saving research findings, referencing prior investigations, citing sources, documenting references, /research command
**Assessment:** MODERATE

- research is an extremely common English word -- fires on utterances like I researched this or my research shows
- Skill instructs proactive file creation in ~/.claude/research/ -- conflicts with CLAUDE.md No proactive file creation rule. Not documented as an intentional exception.

**Recommendation:**
1. Narrow trigger to /research command invocation or explicit save my research phrasing.
2. Add note: This skill is an intentional exception to the no-proactive-file-creation rule.

---

### ruby
**Triggers:** .rb files, Gemfile, Gemfile.lock, Rakefile, .gemspec, Ruby/Rails patterns, bundler, ActiveRecord, migrations, RSpec, minitest, Rails generators
**Assessment:** GOOD

- Thin wrapper pattern -- appropriate for language skill
- Sub-files confirmed: core.md, testing.md, rails.md, hanami.md
- Trigger specificity is excellent

**Recommendation:** None.

---

### rust
**Triggers:** .rs files, Cargo.toml, Cargo.lock, Rust patterns, ownership, borrowing, lifetimes, traits, cargo build/test/run, Result/Option types, borrow checker
**Assessment:** GOOD

- Thin wrapper with excellent trigger specificity
- Sub-files (core.md, testing.md) confirmed
- No conflicts

**Recommendation:** None.

---

### shell
**Triggers:** .sh, .bash, .ps1, Makefile files, shell/CLI patterns
**Assessment:** MINOR

- .ps1 trigger activates a skill that is heavily bash-focused -- PowerShell users get bash advice
- References 7 sub-files; not all confirmed to exist

**Recommendation:** Either split into bash and PowerShell sections, or explicitly document PowerShell coverage scope. Verify all sub-file paths.

---

### skills-engineer
**Triggers:** SKILL.md, skills, skill creation, skill review, skill optimization, agent files, agent definitions, command files, meta-skill, activation triggers, frontmatter
**Assessment:** MODERATE

- Quality checklist defines 250-400 lines as standard skill length, but the thin-wrapper pattern (rust, go, ruby, csharp) produces skills of 20-40 lines -- intentional but violates the checklist without documenting the exception
- Two source URLs in the skill for quality research may be stale
- No mention that thin-wrapper is a valid pattern exempt from line count requirements

**Recommendation:** Add explicit documentation: Exception: language thin-wrappers targeting sub-files may be 20-50 lines.

---

### terraform
**Triggers:** .tf files, HCL, terraform init/plan/apply, remote backends, infrastructure as code with Terraform
**Assessment:** MINOR

- References patterns.md sub-file -- not confirmed to exist at ~/.claude/skills/terraform/patterns.md
- No cross-reference to terraform/ansible hybrid workflows

**Recommendation:** Verify patterns.md exists. Add cross-reference to ansible skill.

---

### typescript
**Triggers:** .ts, .tsx, .js, .jsx files, package.json, TypeScript/JavaScript patterns
**Assessment:** MODERATE

**Internal contradiction on Bun:**
The skill says CRITICAL: MUST use Bun commands in the body. But the description also says Detect from lock files, Respect project package manager. A project using npm or pnpm receives MUST use Bun instructions even when Bun is not installed.

**Trigger too broad:**
.js and package.json triggers fire for Node.js, npm, pnpm, Deno, and Bun projects equally. The Bun-specific instructions will be incorrect for the majority of these activations.

**Recommendation:**
1. Change MUST use Bun to: Prefer Bun if bun.lockb exists; otherwise detect and use the project package manager.
2. Narrow trigger: require bun.lockb for auto-activation, or make Bun preference conditional rather than absolute.

---

### ux-design-workflow
**Triggers:** design systems, UI components, build a UI, design this, user interface patterns, accessibility, WCAG
**Assessment:** MINOR

- design this is an extremely broad trigger -- fires on non-UI contexts (design this database schema, design this API)
- Sub-files not confirmed to exist

**Recommendation:** Replace design this with design this UI or design this component. Verify sub-file paths exist.

---

### war-report
**Triggers:** war report, weekly report, activity report, WAR, weekly work accomplishments
**Assessment:** MINOR

- get-user-commits.py script CONFIRMED to exist and functional
- Script path is hardcoded as a Windows path -- will fail in WSL or Linux environments
- Trigger specificity is excellent

**Recommendation:** Use ~ or HOME variable instead of hardcoded Windows user path for cross-platform compatibility.

---

### youtube-transcript
**Triggers:** YouTube transcripts, video_id references, YouTube URLs, video metadata/pipeline results, /yt command, fetch_video script
**Assessment:** GOOD

- Narrow, specific triggers that will not fire spuriously
- Content is accurate for the menos API integration
- Authentication requirement (RFC 9421 HTTP signatures) is not mentioned upfront

**Recommendation:** Add authentication requirement note near the top: All API calls require RFC 9421 HTTP signatures via signing.py.

---

## Cross-Skill Conflicts

### Conflict 1: Autonomy (CRITICAL)
**Skills:** development-philosophy vs CLAUDE.md global rules
**Contradiction:** development-philosophy says Execute immediately. Never ask permission. CLAUDE.md says ALWAYS Ask, do not assume and the 1-3-1 Rule requires presenting options before acting.
**When it fires:** Any conversation involving planning, architecture, design, MVP, security, documentation -- which is most technical conversations.
**Impact:** The skill actively overrides user-configured behavior. User gets autonomous execution when they have explicitly configured ask-first behavior.
**Resolution:** development-philosophy must defer to CLAUDE.md ask-first rules. Remove or qualify Execute immediately language.

---

### Conflict 2: Hook Skipping (MODERATE)
**Skills:** git-workflow vs CLAUDE.md global rules
**Contradiction:** git-workflow permits --no-verify for multi-commit atomic operations. CLAUDE.md says NEVER skip hooks without explicit user request with no exceptions.
**When it fires:** Any multi-commit workflow -- common during feature work.
**Resolution:** Remove the exception from git-workflow. The /commit skill handles this correctly as an explicit user invocation.

---

### Conflict 3: Docstrings (MODERATE)
**Skills:** python vs CLAUDE.md global rules
**Contradiction:** python skill instructs adding docstrings to all public APIs. CLAUDE.md says do not add docstrings to code you did not change.
**When it fires:** Any Python work in an existing codebase.
**Resolution:** Qualify in python skill to only apply to newly written code.

---

### Conflict 4: Bun vs Project Manager (MODERATE)
**Skills:** typescript internal contradiction
**Contradiction:** Skill says MUST use Bun and also Detect from lock files, Respect project package manager.
**When it fires:** Any .ts/.js/.jsx file, any package.json file.
**Resolution:** Make Bun preference conditional on bun lock file presence.

---

### Conflict 5: Proactive File Creation (MODERATE)
**Skills:** research-archive vs CLAUDE.md global rules
**Contradiction:** research-archive creates files proactively in ~/.claude/research/. CLAUDE.md prohibits proactive file creation.
**When it fires:** Any mention of research (very broad trigger).
**Resolution:** Document the intentional exception explicitly in the skill. Narrow the trigger.

---

### Conflict 6: Review Methodology (MODERATE)
**Skills:** code-review vs analysis-workflow
**Contradiction:** Both activate on review triggers. code-review is MUST-only, no false positives. analysis-workflow has a competing structured analysis methodology. When both fire, the user gets two competing frameworks.
**Resolution:** Narrow analysis-workflow to remove review from its triggers.

---

### Conflict 7: Debugging Methodology (MINOR)
**Skills:** logging-observability vs analysis-workflow
**Contradiction:** Both activate on debug/debugging triggers with different methodologies.
**Resolution:** Remove debugging from logging-observability triggers.

---

## Trigger Overlap Analysis

| Trigger Word | Skills That Activate | Risk |
|---|---|---|
| review | code-review, analysis-workflow | Competing methodologies |
| planning | development-philosophy, planning, brainstorming | Autonomy vs ask-first conflict |
| debug/debugging | analysis-workflow, logging-observability | Competing methodologies |
| authentication | development-philosophy, api-design, git-workflow | Mixed security contexts |
| design decisions | development-philosophy, brainstorming | Autonomy vs deliberate options |
| architecture | development-philosophy, brainstorming | Same conflict |
| documentation | development-philosophy, docs | Autonomy vs deliberate guidance |
| reset | git-workflow | Fires on non-git reset usage |
| research | research-archive | Too common, fires spuriously |
| design this | ux-design-workflow | Fires on non-UI design requests |

---

## Prioritized Recommendations

### Critical (fix before next session)

1. **code-review: Fix base branch** -- Change hardcoded origin/dev to multi-branch fallback: git merge-base origin/main HEAD 2>/dev/null || git merge-base origin/dev HEAD 2>/dev/null || git merge-base origin/master HEAD 2>/dev/null. Affects SKILL.md lines 33 and 214.

2. **code-review: Resolve Verified Safe conflict** -- The skill prohibits Verified Safe sections but the repo review agent requires them. Either remove the prohibition or document that the agent system prompt takes precedence.

3. **development-philosophy: Remove autonomy override** -- Replace Execute immediately. Never ask permission with language that defers to CLAUDE.md ask-first rules.

4. **development-philosophy: Narrow triggers** -- Reduce from 20+ keywords to 5-7 core terms (MVP, over-engineering, fail-fast, experiment-driven, KISS). Remove security, authentication, documentation, and planning terms that have dedicated skills.

### Moderate (address this week)

5. **git-workflow: Remove --no-verify exception** -- The exception conflicts with CLAUDE.md. The /commit skill handles this correctly already.

6. **python: Qualify docstring rule** -- Add: for new code only; do not add docstrings to existing code you did not modify.

7. **typescript: Fix Bun contradiction** -- Make Bun the default only when the Bun lock file is detected; otherwise detect and respect the project package manager.

8. **analysis-workflow: Narrow review trigger** -- Remove review from triggers to avoid conflict with code-review skill.

9. **logging-observability: Remove debugging trigger** -- Debugging methodology belongs to analysis-workflow.

10. **research-archive: Narrow trigger and document exception** -- Trigger on /research command invocation or explicit save research phrasing. Document the proactive file creation as an intentional exception.

11. **database: Address NoSQL gap** -- Either remove Redis/DynamoDB from triggers or add NoSQL-specific content.

### Minor (address when convenient)

12. **claude-code-workflow: Fix dangling references** -- Remove or document CURRENT.md and STATUS.md references. Fix .spec/ to .specs/.

13. **docker: Remove non-existent Kubernetes skill reference.**

14. **docs: Qualify 4-space nesting rule** -- Note this is markdownlint preference, not universal CommonMark requirement.

15. **war-report: Use platform-agnostic path** -- Replace hardcoded Windows path with HOME variable expansion.

16. **skills-engineer: Document thin-wrapper exception** -- Note that language thin-wrappers are exempt from the 250-400 line count requirement.

17. **llmstxt/terraform: Verify sub-file existence** -- Confirm tools.md and patterns.md exist at expected paths.

---

## Verified Safe

The following skills were reviewed and found to have no significant issues:

- **ansible** -- Excellent trigger specificity, no conflicts
- **brainstorming** -- Correct methodology; conflicts originate in development-philosophy, not here
- **csharp** -- Clean thin wrapper, appropriate triggers
- **go** -- Clean thin wrapper, appropriate triggers
- **ruby** -- Clean thin wrapper, appropriate triggers
- **rust** -- Clean thin wrapper, best-in-class trigger specificity
- **youtube-transcript** -- Narrow triggers, accurate content (minor auth note recommendation only)