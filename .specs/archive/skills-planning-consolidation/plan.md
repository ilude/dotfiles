---
created: 2026-02-15
completed: 2026-02-15
---

# Team Plan: Skills & Planning Consolidation

## Objective
Consolidate underused commands into their natural homes:
1. Merge `analyze-skills`, `optimize-skill`, `optimize-ruleset` into `skills-engineer` as new modes (audit, ruleset)
2. Roll `acceptance-criteria` into a new `planning` skill + enhance `plan-with-team`
3. Clean up deleted commands from opencode symlinks

## Tasks

### T1: Enhance skills-engineer.md
Add two new modes to the existing review/write/optimize:
- **audit** mode (from analyze-skills): history-based activation analysis via skill-analyzer.py
- **ruleset** mode (from optimize-ruleset): CLAUDE.md optimization with history analysis
- Enhance **optimize** mode with optimize-skill's research depth (theory-practice mapping, pillar template)

### T2: Create planning skill
New `~/.claude/skills/planning/SKILL.md` with:
- Acceptance criteria methodology (from acceptance-criteria.md)
- PRD structure awareness (references /prd command)
- PTC as available research tool (references /ptc command)
- Auto-activates on: planning, acceptance criteria, PRD, requirements, user stories

### T3: Enhance plan-with-team-instructions.md
Add acceptance criteria guidance to Step 3 (plan generation):
- Inline methodology for writing verifiable ACs
- Reference planning skill for deeper guidance

### T4: Update prd.md
Replace `/acceptance-criteria` reference with planning skill reference

### T5: Cleanup
- Delete: analyze-skills.md, optimize-skill.md, optimize-ruleset.md, acceptance-criteria.md
- Update: opencode/commands/.gitignore
- Update: CLAUDE.md manual-only skills list

## Dependency Graph
T1, T2, T3 (parallel) → T4 (depends on T2) → T5 (cleanup)
