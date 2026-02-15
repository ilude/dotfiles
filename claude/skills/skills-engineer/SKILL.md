---
name: skills-engineer
description: "Domain knowledge for writing, reviewing, and optimizing SKILL.md files, agent definitions, and command files for Claude Code and OpenCode. Activate when working on SKILL.md, skills, skill creation, skill review, skill optimization, agent files, agent definitions, command files, meta-skill, activation triggers, or frontmatter."
---

# Skills Engineering

**Auto-activate when:** Working on SKILL.md files, creating or reviewing skills, optimizing skill content, writing agent definitions or command files, discussing activation triggers, editing frontmatter, or any meta-skill work for Claude Code or OpenCode.

## Core Principle: Progressive Disclosure

Skills consume context window budget. Every token must earn its place.

**Information hierarchy:** metadata (~100 tokens) -> instructions (<5000 tokens) -> resources (on demand)

**Total budget:** All skill descriptions combined should stay under 15,000 characters (~2% of context window). Individual skills that exceed 500 lines have diminishing returns -- split into sub-skills.

---

## Agent Skills Standard

### Frontmatter (Required)

Every SKILL.md begins with YAML frontmatter:

```yaml
---
name: skill-name
description: "Activation triggers and scope. Use when [specific triggers]."
---
```

**Field rules:**

| Field | Constraints | Example |
|-------|-------------|---------|
| `name` | 1-64 chars, kebab-case, MUST match directory name | `code-review` |
| `description` | 1-1024 chars, includes activation trigger keywords | `"Evidence-based code review. Triggers: review code, PR review, diff review."` |

**Claude Code extensions** (ignored by other tools):

| Field | Purpose |
|-------|---------|
| `argument-hint` | Placeholder text for user-invocable skills |
| `disable-model-invocation` | Prevent auto-activation (manual only) |
| `user-invocable` | Expose as slash command |
| `model` | Override model for this skill |
| `context` | Additional context files to load |
| `agent` | Run as sub-agent |
| `hooks` | Pre/post execution hooks |

**String substitution variables:** `$ARGUMENTS`, `$N` (positional), `${CLAUDE_SESSION_ID}`, `` !`command` `` (shell output)

---

## SKILL.md Structure

Follow this section order for consistency across all skills:

```
1. Frontmatter (YAML)
2. # Title
3. **Auto-activate when:** line
4. ## Core Principle (WHY this skill exists)
5. ## Practical Steps / Patterns (HOW to apply it)
6. ## Anti-Patterns (what NOT to do)
7. ## Quick Reference (tables, checklists, commands)
8. ## Sources (optional, academic + industry)
```

**Content ordering within sections:** WHY -> HOW -> PROOF -> WHAT NOT -> REMEMBER

This high-to-low utility ordering ensures the most actionable content loads first if context is truncated.

---

## Activation Trigger Design

Triggers determine when a skill auto-activates. Three levels:

### Level 1: Implicit (File Patterns)

Activate based on file types or config files present in the project:

| Trigger Type | Examples |
|-------------|----------|
| File extensions | `.py`, `.ts`, `.tf`, `.rs` |
| Config files | `pyproject.toml`, `Dockerfile`, `tsconfig.json` |
| Directory patterns | `.github/workflows/`, `terraform/`, `.spec/` |

### Level 2: Explicit (User Keywords)

Activate based on what the user says or requests:

| Trigger Type | Examples |
|-------------|----------|
| Action verbs | "code review", "brainstorm", "optimize prompt" |
| Domain terms | "terraform module", "docker compose", "API design" |
| Slash commands | `/code-review`, `/research`, `/optimize-skill` |

### Level 3: Conditional (Parent Context)

Sub-skills activated by a parent skill's context. Use `context` field or cross-reference with `See also:` links.

**Reliability note:** Baseline auto-activation is ~20%. Forced evaluation hooks can push this to ~84%. Write descriptions with strong, specific trigger keywords to maximize activation rate.

### Trigger Quality Rules

- **Specific and measurable** -- file patterns, exact keywords, config file names
- **No vague triggers** -- never use "infrastructure", "development", "coding" alone
- **Test mentally** -- "If a user says X, should this skill activate?" If ambiguous, the trigger is too broad
- **Include negative examples** in the description if needed: "NOT for general Python questions"

---

## Quality Checklist

Before finalizing any skill, verify all items:

- [ ] **Frontmatter**: `name` matches directory, `description` includes specific triggers
- [ ] **Length**: 250-400 lines (main skill), 100-250 (sub-skill)
- [ ] **Activation triggers**: specific and measurable (file patterns, keywords, config files)
- [ ] **No vague triggers**: nothing like "infrastructure" or "development" alone
- [ ] **Anti-patterns section**: included with concrete examples
- [ ] **Quick reference**: table, checklist, or command grid included
- [ ] **Cross-platform**: no Claude-specific features that break OpenCode
- [ ] **No defaults**: does not teach what the model already does well
- [ ] **Academic grounding**: cited where the domain has established theory
- [ ] **Auto-activate line**: present after the title heading
- [ ] **Section order**: follows the standard structure (Core -> Steps -> Anti-Patterns -> Reference -> Sources)

---

## Cross-Platform Compatibility

Skills should work across tools that support the agent skills standard.

| Tool | Project Path | Global Path |
|------|-------------|-------------|
| Claude Code | `.claude/skills/` | `~/.claude/skills/` |
| OpenCode | `.opencode/skills/` | `~/.config/opencode/skills/` |

**Compatibility rules:**
- OpenCode reads `.claude/skills/` as fallback
- Standard frontmatter fields (`name`, `description`) work everywhere
- Claude-specific fields (`allowed-tools`, `model`, `context`) are silently ignored by other tools
- Avoid tool-specific features in the main skill body; use frontmatter extensions instead

---

## Agent & Command Definitions (Reference)

Skills often live alongside agent and command definitions. Know the formats:

### Claude Code Agents

Location: `.claude/agents/*.md`

```markdown
---
name: agent-name
description: "What this agent does"
model: claude-sonnet-4-20250514
allowed-tools: ["Read", "Grep", "Glob"]
---

Instructions for the agent...
```

### OpenCode Agents

Location: `.opencode/agents/*.md`

```markdown
---
name: agent-name
description: "What this agent does"
tools:
  read: true
  write: false
  bash: false
temperature: 0.3
---

Instructions for the agent...
```

### Command Files

Location: `.claude/commands/*.md` or `.opencode/commands/*.md`

Commands are user-invocable via slash syntax (`/command-name`). They can reference `$ARGUMENTS` for user input.

---

## Optimization Patterns

When reviewing or improving existing skills:

### Content Principles

| Principle | Application |
|-----------|-------------|
| **Ground in research** | Cite academic papers when the domain has established theory |
| **High-to-low utility** | WHY -> HOW -> PROOF -> WHAT NOT -> REMEMBER |
| **Tool grids** | Tables for quick command/option reference |
| **Anti-patterns teach** | Show what NOT to do (prevents common mistakes) |
| **Cross-reference** | `See also:` links to related skills |
| **Scannable format** | Headers, tables, bullet points over prose paragraphs |

### When to Split

A skill should be split into sub-skills when:
- Main file exceeds 500 lines
- Distinct sub-topics activate independently
- Users only need part of the skill for most tasks

Sub-skill pattern:
```
skills/parent-skill/
  SKILL.md           # Main skill (250-400 lines)
  sub-topic-a.md     # Referenced via See also or context field
  sub-topic-b.md     # Referenced via See also or context field
```

### Token Budget Awareness

| Skill Size | Lines | When Appropriate |
|------------|-------|------------------|
| Micro | <100 | Single focused pattern (e.g., commit message format) |
| Standard | 250-400 | Most skills -- one coherent domain |
| Large | 400-500 | Complex domains with multiple facets |
| Split required | >500 | Too large -- extract sub-skills |

---

## Anti-Patterns

| Anti-Pattern | Problem | Fix |
|--------------|---------|-----|
| Duplicating model defaults | Wastes context tokens on things the model already knows | Only teach what the model gets wrong or doesn't know |
| Vague description | Activates too broadly, polluting unrelated sessions | Use specific trigger keywords and file patterns |
| Over 500 lines | Diminishing returns, eats context budget | Split into main skill + sub-skills |
| Missing/mismatched frontmatter | Skill won't activate or activates wrong | `name` must match directory exactly |
| Large embedded code samples | Bloats token count | Reference files instead, or use minimal examples |
| Hardcoded paths | Breaks on other platforms or user accounts | Use `~` or `$HOME`, document platform differences |
| Prose-heavy sections | Hard to scan during time-pressured work | Convert to tables, bullet points, checklists |
| No anti-patterns section | Users repeat common mistakes | Always include what NOT to do |
| Teaching syntax basics | Model already knows language syntax | Focus on project conventions, not language tutorials |

---

## Quick Reference

### New Skill Checklist

```
1. Create directory: ~/.claude/skills/<skill-name>/
2. Create SKILL.md with frontmatter (name matches directory)
3. Write description with specific activation triggers
4. Add auto-activate line after title
5. Follow section order: Core -> Steps -> Anti-Patterns -> Reference -> Sources
6. Verify against quality checklist
7. Test activation: mention trigger keywords and verify skill loads
```

### Frontmatter Template

```yaml
---
name: my-skill-name
description: "Brief scope statement. Activate when [trigger1], [trigger2], [trigger3]. Use for [domain]. Not for [exclusion]."
---
```

### Section Templates

**Core Principle:**
```markdown
## Core Principle: [Name]

[1-3 sentences explaining WHY this skill exists and what problem it solves]
```

**Anti-Patterns:**
```markdown
## Anti-Patterns

| Anti-Pattern | Problem | Fix |
|--------------|---------|-----|
| [Bad practice] | [Why it's bad] | [What to do instead] |
```

---

## Sources

### Specifications
- [Agent Skills Specification](https://agentskills.io/specification) - Standard frontmatter fields and structure
- [Claude Code Skills Docs](https://code.claude.com/docs/en/skills) - Claude-specific extensions

### Practical Guides
- [obra/superpowers writing-skills](https://github.com/obra/superpowers/blob/main/skills/writing-skills/SKILL.md) - Skill authoring patterns
- [Skills Activation Reliability](https://scottspence.com/posts/how-to-make-claude-code-skills-activate-reliably) - Improving auto-activation rates

### Academic Foundations
- CASCADE (2024) - Meta-skills: skills for acquiring and composing skills
- Reflexion (Shinn et al., 2023) - Self-reflection patterns improve agent task performance
