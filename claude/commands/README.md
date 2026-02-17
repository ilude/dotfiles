# Personal Claude Code Commands

This directory contains custom slash commands available across all your projects.

## Available Commands

### `/prd`

**Purpose**: Generate a PRD.md template for RALPH loop usage with acceptance criteria guidelines.

**Location**: `~/.claude/commands/prd.md`

**What it does**:
1. **Creates Structured PRD**: Template with acceptance criteria sections
2. **Includes Guidelines**: Examples of good vs bad criteria
3. **Verification Methods**: Shows how to make criteria testable

**Usage**:
```bash
/prd
```

Claude will ask for:
- Project name
- Brief description/goals

**Output Format**:
```markdown
# Project: {name}

## Tasks

### Task 1: {Task Name}

**User Story**: As a {role}, I want {feature} so that {benefit}

**Acceptance Criteria**:
1. [ ] {Specific outcome}
   - Verification: {Test command}
2. [ ] {Another outcome}
   - Verification: {Test command}
```

**Best Practice**: Define explicit acceptance criteria for each task before starting `ralph`.

---

### `/research <topic>`

**Purpose**: Deep-dive research agent for technical concepts with academic grounding and practical guidance.

**Location**: `~/.claude/commands/research.md`

**What it does**:
1. **Asks Clarifying Questions**: Understands your goals (can select multiple: learn/evaluate/implement/compare), familiarity level, and preferred format
2. **Multi-Source Research**: Parallel searches across academic papers, technical articles, GitHub repos, and community discussions
3. **Synthesizes Findings**: Organizes research into cohesive narrative matching your intent
4. **Flexible Output**: Adapts format to your needs (narrative, structured, or code-focused)
5. **Optional Save**: Offers to save research to `~/.claude/research/<topic>.md`

**Usage**:
```bash
# Basic usage
/research "event sourcing patterns"

# With flags
/research "CQRS" --academic        # Focus on papers
/research "Redis vs Kafka" --compare  # Comparison mode
/research "microservices" --practical # Implementation focus
```

**Example Flow**:
```
/research "consensus algorithms"

Phase 1: Understanding your needs...
  Q1: What are your goals? → UNDERSTAND + EVALUATE (multi-select)
  Q2: Familiarity level? → BASIC (know the concept)
  Q3: Output format? → STRUCTURED (scannable reference)

Phase 2: Researching...
  [4 parallel agents searching academic, technical, code, community sources]

Phase 3: Synthesizing...
  Combining UNDERSTAND (theory/fundamentals) + EVALUATE (trade-offs)
  Creating comparison framework for Raft, Paxos, Byzantine

Phase 4: Formatting...
  Structured comparison with trade-off matrix and use cases

[Displays research...]

Save to file?
  1. Yes → ~/.claude/research/consensus-algorithms.md
  2. Custom path
  3. No
```

**When to Use**:
- Learning a new technology or pattern
- Evaluating options for architectural decisions
- Need implementation guidance with best practices
- Want comprehensive research with diverse sources

**Key Features**:
- **Adaptive**: Questions customize the research approach
- **Parallel Search**: Fast despite breadth (4 concurrent agents)
- **Source Diversity**: Academic + practical + code + community
- **Format Flexibility**: Narrative, structured, or code-focused
- **No Auto-Save**: Simple and predictable

---

## How to Create New Commands

1. Create a markdown file in `~/.claude/commands/`
2. Add frontmatter with description:
   ```markdown
   ---
   description: Brief description of what this command does
   ---
   ```
3. Write instructions for Claude
4. Commands become available as `/command-name`

Example:
```markdown
---
description: Commit changes with conventional commit format
---

# Commit Command

When this command is run:
1. Check git status
2. Generate commit message following conventional commits
3. Ask user for confirmation
4. Commit with attribution
```

---

## Best Practices

- **Keep commands focused** - One clear purpose per command
- **Be explicit** - Guide Claude step-by-step
- **Include examples** - Show what good looks like
- **Handle edge cases** - What if files don't exist?
- **Be educational** - Explain WHY, not just WHAT

---

## Future Command Ideas

- `/commit [push]` - Smart commit with conventional commits (✅ Implemented)
- `/review` - Code review checklist
- `/test` - Run tests with smart reporting
- `/doc` - Generate/update documentation
- `/refactor` - Suggest refactorings
- `/migrate` - Help with migrations/upgrades

---

**Created**: 2025-11-04
**Updated**: 2026-01-14 (Added /research command)
