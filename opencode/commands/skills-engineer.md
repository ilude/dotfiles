---
description: Orchestrate skill lifecycle — review, write, or optimize skills
argument-hint: <review|write|optimize> [skill-name or topic]
---

# Skills Engineer Command

Orchestrate skill review, creation, and optimization. The skills-engineer SKILL.md provides domain knowledge; this command routes to the right workflow.

## Step 1: Parse Mode

Input: $ARGUMENTS

**If empty:** Use AskUserQuestion to ask:
- "What would you like to do?" with options:
  - Review an existing skill (audit quality and activation)
  - Write a new skill (research + generate)
  - Optimize an existing skill (review + research + improve)

**If provided**, extract mode and target:
- `review <skill-name>` → Review mode
- `write <topic>` → Write mode
- `optimize <skill-name>` → Optimize mode

## Step 2: Validate Target

**For review/optimize:**
1. Check if `~/.claude/skills/<skill-name>/SKILL.md` exists
2. If not found, list available skills: `ls ~/.claude/skills/`
3. Ask user to pick from the list if skill not found

**For write:**
1. Check if `~/.claude/skills/<topic>/` already exists
2. If exists, ask: "Skill directory already exists. Review it instead, or overwrite?"

## Step 3: Execute Mode

---

### Review Mode

1. Read `~/.claude/skills/<skill-name>/SKILL.md` and any sibling markdown files (sub-skills)
2. Score against quality checklist:

| Dimension | 1 (Poor) | 3 (Adequate) | 5 (Excellent) |
|-----------|----------|--------------|----------------|
| **Structure** | Missing sections, no frontmatter | Has core sections, basic frontmatter | Complete template, clear hierarchy |
| **Completeness** | Missing anti-patterns or quick ref | Has most sections, thin content | All sections with practical examples |
| **Activation Precision** | Vague triggers ("when coding") | Reasonable triggers, some overlap | Specific triggers, no false positives |
| **Token Efficiency** | >400 lines, restates Claude defaults | 250-400 lines, some bloat | 250-400 lines, every line earns its place |

3. Check specifics:
   - Frontmatter: `name` matches directory, `description` contains trigger keywords
   - "Auto-activate when" line exists with specific, non-overlapping triggers
   - Anti-patterns section present with concrete examples
   - Quick reference section present
   - Cross-platform notes where relevant (Windows/Linux/macOS)
   - No content Claude already knows by default (standard language syntax, etc.)

4. Output structured review:
```
## Skill Review: <skill-name>

### Scores
| Dimension | Score | Notes |
|-----------|-------|-------|
| Structure | X/5 | ... |
| Completeness | X/5 | ... |
| Activation Precision | X/5 | ... |
| Token Efficiency | X/5 | ... |
| **Overall** | **X/5** | |

### Recommendations
1. [Specific actionable improvement]
2. [Specific actionable improvement]
3. [Specific actionable improvement]
```

---

### Write Mode

**Phase A: Gather Requirements**

Use AskUserQuestion for each (one at a time):

1. "What domain does this skill cover?" (if not obvious from topic)
2. "Auto-activate or manual-only (`/command` invocation)?"
   - Auto-activate: Needs trigger criteria
   - Manual-only: Needs slash command name
3. "Does this need sub-skills? (e.g., a main SKILL.md + specialized sub-files)"
   - Yes: Ask for sub-skill names
   - No: Single SKILL.md

**Phase B: Research** (parallel Task agents, sonnet)

Launch two parallel searches:
- Agent 1: Academic/formal sources for the domain (`"<topic> best practices research 2024 2025"`)
- Agent 2: Practical/industry sources (`"<topic> patterns anti-patterns common mistakes"`)

**Phase C: Generate** (Task agent, opus)

Generate SKILL.md following the standard template structure:
- Frontmatter with name and description
- Auto-activate triggers (specific, measurable)
- Core principles grounded in research
- Step-by-step workflow
- Anti-patterns with concrete examples
- Quick reference section
- Sources section (if research was performed)

Target length: 250-400 lines for main skill, 100-250 for sub-skills.

**Phase D: Self-Review**

Run the review checklist against the generated skill. Fix any issues scoring below 3/5 before presenting.

**Phase E: Present**

Show the generated skill content. Ask: "Create at `~/.claude/skills/<topic>/SKILL.md`?"

---

### Optimize Mode

**Phase A: Review** (reuse Review Mode)

Run full review to get current scores and identify weaknesses.

**Phase B: Research** (parallel Task agents, sonnet)

Launch parallel searches targeting the weakest dimensions:
- Academic best practices for the skill's domain
- Industry patterns and anti-patterns
- Competing approaches and frameworks

**Phase C: Improve** (Task agent, opus)

Apply optimizations:
- Ground existing rules in research (add WHY, not just WHAT)
- Tighten verbose sections (compress without losing meaning)
- Improve trigger specificity (reduce false positives/negatives)
- Add missing sections (anti-patterns, quick reference, sources)
- Remove content Claude already knows by default

Preservation rules:
- Keep practical examples from real usage
- Keep anti-patterns that came from experience
- Keep quick references and commands
- Add theory to explain WHY, don't replace practical content

**Phase D: Present Diff**

Show before/after comparison:
- Token count: before vs after
- Score changes per dimension
- Summary of what changed and why

Ask: "Apply changes?" Options:
- Apply (write to file)
- Show full draft (display complete optimized skill)
- Cancel

---

## Step 4: Save Research

If web research was performed in any mode, save sources to `~/.claude/research/<skill-name>-sources.md`.

## Sub-Agent Configuration

| Phase | Agent | Model | Purpose |
|-------|-------|-------|---------|
| Mode detection | Main | sonnet | Fast parsing |
| Research | Task (parallel) | sonnet | Web searches |
| Synthesis/Generation | Task | opus | Complex reasoning, writing |
| Review scoring | Main | sonnet | Checklist evaluation |
| User presentation | Main | - | Interaction |

## Edge Cases

1. **Skill has no SKILL.md but directory exists**: Treat as write mode with existing directory
2. **Skill has sub-skills**: Review/optimize each file, maintain coherence across files
3. **Research finds nothing**: Fall back to existing knowledge, note limited sources
4. **Already well-optimized (all 5/5)**: Report "no significant improvements found"
5. **Very large skill (>500 lines)**: Flag for splitting into main + sub-skills
