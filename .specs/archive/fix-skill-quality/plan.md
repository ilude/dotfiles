# Team Plan: Fix Skill Quality Issues

## Objective
Fix all issues found in the skills review, organized by severity: critical description violations, skeleton/stub skills, token bloat, and minor issues across 15 skills in `claude/skills/`.

## Project Context
- **Language**: Shell/Python (dotfiles repo)
- **Test command**: `make test`
- **Lint command**: `make lint`

## Team Members
| Name | Agent | Role |
|------|-------|------|
| fix-skill-quality-builder | builder (sonnet) | Implement all skill fixes |
| fix-skill-quality-validator | validator (haiku) | Verify fixes are correct |

## Tasks

### Task 1: Fix critical description violations and skeleton skills
- **Owner**: fix-skill-quality-builder
- **Blocked By**: none
- **Description**: Fix the 7 most critical skill issues:

  **CRITICAL - Description Summarizes Workflow (rewrite to trigger-only, <500 chars, start with "Use when..." or action verb):**
  1. `claude/skills/git-workflow/SKILL.md` - Description is ~800 chars and lists workflow steps. Rewrite to ONLY triggering conditions, e.g.: "Activate when working with git operations, commits, or branch management. Enforces security-first workflow, semantic commits, and safe push behavior."
  2. `claude/skills/claude-code-workflow/SKILL.md` - Description ~600+ chars listing features. Rewrite to: "Claude Code AI-assisted development workflow. Activate when discussing Claude Code usage, AI-assisted coding, prompting strategies, context management, or Claude Code-specific patterns."
  3. `claude/skills/youtube-transcript/SKILL.md` - Description includes implementation details (Task tool pattern). Rewrite to just triggering conditions.

  **CRITICAL - Skeleton/Stub Skills (add Overview + Quick Reference):**
  4. `claude/skills/go/SKILL.md` - Add 2-3 sentence overview of Go philosophy + quick reference table with common commands (go test, go fmt, go vet, go mod tidy) + brief error handling pattern
  5. `claude/skills/rust/SKILL.md` - Add overview of Rust philosophy (memory safety, zero-cost abstractions) + quick reference table (cargo build, cargo test, cargo fmt, cargo clippy) + ownership basics
  6. `claude/skills/ruby/SKILL.md` - Add overview of Ruby ecosystem + quick reference table + brief mention of key patterns
  7. `claude/skills/csharp/SKILL.md` - Add overview of C#/.NET ecosystem + quick reference table + brief mention of async/await, LINQ, records

  **Rules for ALL changes:**
  - Read each file BEFORE editing
  - Keep skeleton additions concise: aim for ~150-200 words added, not full rewrites
  - Do NOT change existing sub-file references (core.md, testing.md, etc.)
  - Do NOT add RFC 2119 boilerplate
  - Description field: ONLY `name` and `description` in YAML frontmatter
  - Description must NOT summarize skill workflow (critical CSO rule)

- **Acceptance Criteria**:
  - [ ] git-workflow description is <500 chars and contains NO workflow summary
  - [ ] claude-code-workflow description is <500 chars and contains NO workflow summary
  - [ ] youtube-transcript description is <500 chars and contains NO workflow summary
  - [ ] go/SKILL.md has Overview section + Quick Reference table (not just file list)
  - [ ] rust/SKILL.md has Overview section + Quick Reference table
  - [ ] ruby/SKILL.md has Overview section + Quick Reference table
  - [ ] csharp/SKILL.md has Overview section + Quick Reference table
  - [ ] All descriptions start with action verb or "Use when..."
  - [ ] No YAML frontmatter fields other than name and description
- **Verification Command**: `make test`

### Task 2: Fix medium and low priority issues
- **Owner**: fix-skill-quality-builder
- **Blocked By**: Task 1
- **Description**: Fix remaining skill issues:

  **MEDIUM - Token Bloat / Scope Creep:**
  1. `claude/skills/python/SKILL.md` - Remove redundant uv warnings (keep ONE clear statement), trim Philosophy section to 1-2 lines, remove generic async patterns. Target: ~600 words from ~1100.
  2. `claude/skills/docker/SKILL.md` - Move DevContainer section to a separate file `claude/skills/docker/devcontainer.md` and replace inline content with a brief reference. Keep Docker core content.
  3. `claude/skills/terraform/SKILL.md` - Move "Common Patterns" section (count vs for_each, dynamic blocks, data sources) to a separate file `claude/skills/terraform/patterns.md` and replace with brief reference.
  4. `claude/skills/llmstxt/SKILL.md` - Move "Tools & Ecosystem" section to separate file `claude/skills/llmstxt/tools.md`. Trim "Directory Listings" to a single link.
  5. `claude/skills/ansible/SKILL.md` - Remove RFC 2119 boilerplate. Keep only AWS cloud inventory example, replace Azure/GCP with "See Ansible docs for other providers". Trim Variable Precedence to top 4 items.

  **LOW - Minor Fixes:**
  6. `claude/skills/development-philosophy/SKILL.md` - Remove "(project, gitignored)" from description field
  7. `claude/skills/analysis-workflow/SKILL.md` - Add trigger keywords to frontmatter description
  8. `claude/skills/typescript/SKILL.md` - Remove RFC 2119 boilerplate (lines near top)
  9. `claude/skills/api-design/SKILL.md` - Remove RFC 2119 boilerplate
  10. `claude/skills/docs/SKILL.md` - Remove RFC 2119 boilerplate at top
  11. `claude/skills/war-report/SKILL.md` - Remove redundant "Auto-activate when:" and "Purpose:" lines (already in frontmatter)

  **Rules:**
  - Read each file BEFORE editing
  - When moving content to separate files, add a brief reference line in the main SKILL.md
  - Do NOT change skill behavior or add new content beyond what's specified
  - Preserve existing structure and formatting where not explicitly changed

- **Acceptance Criteria**:
  - [ ] python/SKILL.md word count reduced to ~600 (from ~1100)
  - [ ] docker/SKILL.md DevContainer content moved to devcontainer.md with reference
  - [ ] terraform/SKILL.md patterns moved to patterns.md with reference
  - [ ] llmstxt/SKILL.md tools section moved to tools.md with reference
  - [ ] ansible/SKILL.md: no RFC 2119, only AWS inventory, top-4 variable precedence
  - [ ] development-philosophy description has no "(project, gitignored)"
  - [ ] No RFC 2119 boilerplate in typescript, api-design, or docs skills
  - [ ] war-report has no redundant Auto-activate/Purpose lines
- **Verification Command**: `make test`

### Task 3: Validate all skill fixes
- **Owner**: fix-skill-quality-validator
- **Blocked By**: Task 1, Task 2
- **Description**: Validate all skill changes are correct and complete. Check:

  **For each of the 7 critical fixes (Task 1):**
  - Read the SKILL.md file
  - Verify description is <500 chars (count chars in description field)
  - Verify description does NOT summarize workflow (no step lists, no feature enumerations)
  - Verify description starts with action verb or "Use when..."
  - Verify YAML frontmatter has ONLY `name` and `description` fields
  - For skeleton skills: verify Overview section exists AND Quick Reference table exists
  - For skeleton skills: verify existing sub-file references are preserved

  **For each of the 11 medium/low fixes (Task 2):**
  - Verify python/SKILL.md is ~600 words (use `wc -w`)
  - Verify moved content exists in new files (devcontainer.md, patterns.md, tools.md)
  - Verify main SKILL.md references the new files
  - Verify NO RFC 2119 boilerplate ("The key words MUST, MUST NOT...") in typescript, api-design, docs, ansible
  - Verify development-philosophy description has no "(project, gitignored)"
  - Verify war-report has no "Auto-activate when:" or "Purpose:" redundant lines

  **Cross-cutting checks:**
  - Run `make test` to verify no breakage
  - Grep all modified SKILL.md files for "RFC 2119" to confirm removal
  - Spot-check that moved content in separate files is complete (not truncated)

- **Acceptance Criteria**:
  - [ ] All 7 critical fixes verified correct
  - [ ] All 11 medium/low fixes verified correct
  - [ ] `make test` passes
  - [ ] No RFC 2119 boilerplate in any modified skill
  - [ ] All new separate files contain complete moved content
  - [ ] Report structured pass/fail results

## Dependency Graph
Task 1 (builder: critical fixes) → Task 2 (builder: medium/low fixes) → Task 3 (validator: verify all)
