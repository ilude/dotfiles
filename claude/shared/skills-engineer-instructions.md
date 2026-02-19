# Skills Engineer Command

Orchestrate skill review, creation, and optimization. The skills-engineer SKILL.md provides domain knowledge; this command routes to the right workflow.

## Step 1: Parse Mode

Input: $ARGUMENTS

**If empty:** Use AskUserQuestion to ask:
- "What would you like to do?" with options:
  - Review an existing skill (audit quality and activation)
  - Write a new skill (research + generate)
  - Optimize an existing skill (review + research + improve)
  - Audit skill activations (analyze history for missed triggers)
  - Optimize a CLAUDE.md ruleset (analyze and improve rules files)

**If provided**, extract mode and target:
- `review <skill-name>` → Review mode
- `write <topic>` → Write mode
- `optimize <skill-name>` → Optimize mode
- `audit` → Audit mode
- `ruleset [personal]` → Ruleset mode

## Step 2: Validate Target

**For review/optimize:**
1. Check if `~/.claude/skills/<skill-name>/SKILL.md` exists
2. If not found, list available skills: `ls ~/.claude/skills/`
3. Ask user to pick from the list if skill not found

**For write:**
1. Check if `~/.claude/skills/<topic>/` already exists
2. If exists, ask: "Skill directory already exists. Review it instead, or overwrite?"

**For audit:**
1. No target needed - analyzes all skills against session history
2. Requires `~/.claude/scripts/skill-analyzer.py`

**For ruleset:**
1. No parameter → target is project `.claude/CLAUDE.md`
2. `personal` parameter → target is `~/.claude/CLAUDE.md`
3. Accepts flags: `--no-history`, `--history-only`

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

For each research finding, create a theory-practice mapping:

| Academic Principle | Current Skill Rule | Action |
|-------------------|-------------------|--------|
| [principle] | [existing rule or "(missing)"] | Ground / Add / Expand / Skip |

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

### Audit Mode

Analyze conversation history for skill activation patterns. Detect missed activations and suggest trigger improvements.

**Requires:** `~/.claude/scripts/skill-analyzer.py`

**Phase A: Run Analyzer**

Execute skill-analyzer.py with checkpoint mode (only analyzes new messages since last run):
```bash
python ~/.claude/scripts/skill-analyzer.py --json ./tmp/analyze-skills-temp.json --checkpoint --verbose
```

Use `--reset` flag to re-analyze everything. If script doesn't exist, inform user and exit.

**Phase B: Parse & Present**

Load JSON output. Group suggestions by skill. For each missed activation:
- Skill name and evidence (file touched, import used, error encountered)
- Current activation patterns vs suggested additions
- Confidence level (HIGH = direct file match, MEDIUM = import pattern, LOW = error pattern)

**Phase C: Update Options**

Present choices:
1. Update high-confidence suggestions only
2. Update all suggestions
3. Select individually (ask for each skill)
4. Skip all updates

For each skill to update: read SKILL.md, find "Auto-activates when" section, append new patterns, create .backup file.

**Phase D: Report**

Display summary: skills updated, patterns added, files modified. Remove temp JSON file.

---

### Ruleset Mode

Analyze and optimize CLAUDE.md ruleset files with history-based meta-learning.

For optimization philosophy, see the `ruleset-optimization` skill in `~/.claude/skills/claude-code-workflow/`.

**Parameters:**
- No parameter → optimize project ruleset at `.claude/CLAUDE.md`
- `personal` → optimize personal ruleset at `~/.claude/CLAUDE.md`
- `--no-history` → skip history analysis
- `--history-only` → only analyze history, don't modify ruleset

**Phase A: Target & Context**

Determine target (project vs personal). Create `.claude` directory if needed. Gather project context: directory listing, package manager detection, git status.

**Phase B: History Analysis** (skip if `--no-history`)

Scan session history for workflow antipatterns:

| Pattern | Description |
|---------|-------------|
| Tool misuse | Using bash (grep, find, cat) instead of Read/Glob/Grep |
| Path hardcoding | Manual `.venv/` or absolute paths |
| Correction loops | Repeated corrections indicate unclear rules |
| Missing preconditions | File not found errors suggest skipped verification |

**Phase C: Skills Inventory**

Discover skills in `~/.claude/skills/` and `./.claude/skills/`. Calculate token savings: active (always loaded) vs inactive (conditional).

**Phase D: Deduplication** (project mode only)

Compare project ruleset with personal ruleset. Classify duplication: exact (>80% similarity), hierarchical (50-80%), partial overlap, redundant examples.

**Phase E: Ruleset Analysis**

Detect issues by priority: HIGH (outdated descriptions, inaccuracies, contradictions, missing refs), MEDIUM (poor ordering, missing quick start), LOW (verbose explanations, inconsistent formatting).

**Phase F: Recommendations**

Merge all findings into prioritized report with token impact. Present choices:
1. Apply HIGH+CRITICAL only
2. Apply HIGH+MEDIUM+CRITICAL (recommended)
3. Apply ALL
4. Show draft
5. Analysis only
6. Add history rules only

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
| Audit analysis | Main | sonnet | History parsing, pattern matching |
| Ruleset analysis | Main | sonnet | Rule conflict detection |
| Ruleset optimization | Task | opus | Complex deduplication, rewriting |
| User presentation | Main | - | Interaction |

## Edge Cases

1. **Skill has no SKILL.md but directory exists**: Treat as write mode with existing directory
2. **Skill has sub-skills**: Review/optimize each file, maintain coherence across files
3. **Research finds nothing**: Fall back to existing knowledge, note limited sources
4. **Already well-optimized (all 5/5)**: Report "no significant improvements found"
5. **Very large skill (>500 lines)**: Flag for splitting into main + sub-skills
6. **No skill-analyzer.py**: Audit mode requires the script — inform user and exit
7. **No session history**: Audit skips history analysis, reports no data
8. **Ruleset not found**: Create minimal template and offer to populate
