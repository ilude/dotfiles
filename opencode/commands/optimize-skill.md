---
description: Analyze and optimize a skill using academic research and structural improvements
---

# Optimize Skill Command

Improve any skill by grounding it in academic research while preserving practical experience.

## Parameters
- `<skill-name>`: Name of skill directory (e.g., `code-review`, `git-workflow`)
- `--research-only`: Only gather research, don't modify
- `--structure-only`: Only restructure, skip research phase

## Process Overview

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  PHASE 1        │     │  PHASE 2        │     │  PHASE 3        │
│  Understand     │────▶│  Research       │────▶│  Synthesize     │
│  (sonnet)       │     │  (sonnet)       │     │  (opus)         │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                                        │
┌─────────────────┐     ┌─────────────────┐            │
│  PHASE 5        │     │  PHASE 4        │◀───────────┘
│  Apply          │◀────│  Restructure    │
│  (confirm)      │     │  (opus)         │
└─────────────────┘     └─────────────────┘
```

---

## PHASE 1: Understand the Skill (sonnet)

**Goal:** Extract the core problem domain and current approach.

1. Read `~/.claude/skills/<skill-name>/SKILL.md`
2. Check for sub-skills in same directory
3. Extract:
   - **Problem domain**: What problem does this skill solve?
   - **Current techniques**: What methods/rules does it use?
   - **Pain points**: What issues prompted creating this skill?
   - **Key terms**: Domain-specific vocabulary for research

**Output:** Domain summary with 5-10 search terms.

**Example:**
```
Domain: Code review false positive reduction
Terms: "static analysis false positives", "code review precision",
       "interprocedural analysis", "path feasibility", "LLM code review"
```

---

## PHASE 2: Academic Research (sonnet, parallel)

**Goal:** Find established solutions to the skill's problem domain.

Launch parallel search agents for:
1. **Academic papers**: `"<domain> academic research 2024 2025"`
2. **Techniques**: `"<domain> techniques precision accuracy"`
3. **LLM-specific**: `"LLM <domain> false positive reduction"`
4. **Foundational**: `"<domain> theory fundamentals"`

For each promising result, fetch and extract:
- Core principles/frameworks
- Generalizable techniques
- Metrics/benchmarks
- Key terminology

**Output:** Research summary with 3-5 key principles and sources.

---

## PHASE 3: Synthesize Findings (opus)

**Goal:** Map academic principles to practical skill improvements.

For each academic principle:
1. **Does it explain WHY current rules work?** → Add as foundation
2. **Does it suggest NEW verification steps?** → Add as technique
3. **Does it contradict current rules?** → Evaluate which is correct
4. **Is it too theoretical?** → Skip or simplify

Create mapping table:

| Academic Principle | Current Skill Rule | Action |
|-------------------|-------------------|--------|
| Must vs May analysis | "Trace backwards" | Ground existing rule in theory |
| Path feasibility | (missing) | Add new verification pillar |
| Context completeness | "Check callers" | Expand with interface contracts |

**Output:** Integration plan with theory-practice mappings.

---

## PHASE 4: Restructure Skill (opus)

**Goal:** Rewrite skill with academic grounding while preserving practical value.

### Structure Template

```markdown
---
name: <skill-name>
description: "<trigger description>"
---

# <Skill Title>

**Invoke:** `/<skill-name>` or triggers

---

## Core Principle: <Foundational Concept>

[Academic principle that explains WHY this skill works]
[Simple explanation with concrete example]

---

## Step 1: <First Major Step>

[Practical instructions grounded in theory]

## Step 2: <Verification Framework>

[Organized around academic pillars, not ad-hoc rules]

### Pillar 1: <Academic Concept>
**Question:** [What to ask yourself]
**Verification:** [How to check]
**Example:** [Real-world case]

### Pillar 2: ...

---

## Anti-Patterns

[Practical traps, explained by theory where possible]

---

## Quick Reference

[Commands, checklists]

---

## Sources

### Academic Foundations
- [Paper 1](url) - key finding
- [Paper 2](url) - key finding

### Industry Practice
- [Source 1](url)
- [Source 2](url)
```

### Preservation Rules

- **Keep practical examples** from real usage
- **Keep anti-patterns** that came from experience
- **Keep quick references** and commands
- **Add theory** to explain WHY rules work, not replace them
- **Remove** only redundant or superseded content

---

## PHASE 5: Apply Changes

Present to user:
1. **Summary of changes**: What's new, what's preserved, what's removed
2. **Token impact**: Before/after size
3. **Key improvements**: Which false positives this prevents

Options:
- **Apply**: Write changes, offer to commit
- **Show draft**: Display full restructured skill
- **Research only**: Show findings without changes

---

## Sub-Agent Configuration

| Phase | Agent | Model | Why |
|-------|-------|-------|-----|
| 1. Understand | Task | sonnet | Simple extraction |
| 2. Research | Task (parallel) | sonnet | Multiple quick searches |
| 2b. Fetch | WebFetch | - | Get paper details |
| 3. Synthesize | Task | opus | Complex reasoning |
| 4. Restructure | Task | opus | Writing quality |
| 5. Apply | Main | - | User confirmation |

---

## Example Invocation

```
/optimize-skill code-review

Phase 1: Understanding skill...
  Domain: Code review false positive reduction
  Current techniques: 5-point checklist, diff scoping, caller verification

Phase 2: Researching...
  [Agent 1] Academic: Found IEEE survey on SA false positives
  [Agent 2] Techniques: Found LLM4FPM, LLM4PFA papers
  [Agent 3] LLM-specific: Found context completeness research
  [Agent 4] Foundational: Found must/may analysis theory

Phase 3: Synthesizing...
  Mapped 3 academic principles to current rules
  Identified 2 new verification techniques

Phase 4: Restructuring...
  - Added: MUST vs MAY as core principle
  - Added: Three Verification Pillars framework
  - Preserved: All anti-patterns from experience
  - Preserved: Quick reference commands
  - Removed: Redundant checklist (absorbed into pillars)

Apply changes? [Apply / Show draft / Cancel]
```

---

## Edge Cases

1. **No academic research found**: Fall back to industry blogs, StackOverflow patterns
2. **Skill has sub-skills**: Process main skill first, then offer to optimize sub-skills
3. **Conflicting research**: Present both views, let user decide
4. **Skill is already well-structured**: Report "no significant improvements found"
5. **Very large skill**: Process in sections, maintain coherence

---

## Success Criteria

- Finds relevant academic principles for the domain
- Maps theory to practice without losing practical value
- Preserves real-world examples and anti-patterns
- Improves structure and reduces redundancy
- Provides clear sources for academic claims
- Results in measurably better outcomes (fewer false positives, etc.)
