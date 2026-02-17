---
created: 2026-02-17
completed: 2026-02-17
---

# Team Plan: Ruleset & History Audit

## Objective

Mine conversation history and debug logs for friction patterns between user and Claude, then audit all skills, rules, commands, and agents for ambiguities, contradictions, and paradoxical statements that cause or enable those friction patterns. Produce actionable recommendations for ruleset improvements.

## Project Context

- **Language**: Shell / Markdown (dotfiles repo)
- **Test command**: `make test`
- **Lint command**: `shellcheck`

## Scope

### History Files (40 JSONL, ~60MB total)
- Location: `~/.claude/projects/C--Users-Mike--dotfiles/*.jsonl`
- Date range: Feb 1-17, 2026
- Largest files: 12MB, 6.8MB, 5MB — need splitting across agents

### Debug Files (69 TXT)
- Location: `~/.claude/debug/*.txt`

### Rules & Skills to Audit
- `claude/CLAUDE.md` — main global rules
- `CLAUDE.md` — project-level dotfiles rules
- 27 SKILL.md files in `~/.claude/skills/`
- 6 shared instruction files in `claude/shared/`
- ~15 command files in `claude/commands/`
- 12 agent definition files in `claude/agents/`
- 2 opencode command files

## Complexity Analysis

| Task | Est. Files | Change Type | Model | Agent |
|------|-----------|-------------|-------|-------|
| T1: Mine history batch A (20 newer files) | 20 | research | sonnet | code-reviewer |
| T2: Mine history batch B (20 older files) | 20 | research | sonnet | code-reviewer |
| T3: Mine debug logs for friction | 69 | research | sonnet | code-reviewer |
| T4: Audit CLAUDE.md rules + shared instructions | 9 | research | opus | code-reviewer |
| T5: Audit skills (27 SKILL.md files) | 27 | research | sonnet | code-reviewer |
| T6: Audit commands + agents | 27 | research | sonnet | code-reviewer |
| T7: Cross-reference & synthesize recommendations | 0 | architecture | opus | builder-heavy |

## Team Members

| Name | Agent | Model | Role |
|------|-------|-------|------|
| audit-miner-1 | code-reviewer | sonnet | History mining — newer sessions |
| audit-miner-2 | code-reviewer | sonnet | History mining — older sessions |
| audit-miner-3 | code-reviewer | sonnet | Debug log mining |
| audit-rules-1 | code-reviewer | opus | CLAUDE.md + shared instructions audit |
| audit-rules-2 | code-reviewer | sonnet | Skills audit |
| audit-rules-3 | code-reviewer | sonnet | Commands + agents audit |
| audit-synth | builder-heavy | opus | Cross-reference & final recommendations |
| audit-validator | validator-heavy | sonnet | Wave validation |

## Execution Waves

### Wave 1 (parallel — all research)
- T1: Mine history batch A (Feb 15-17, 20 newer JSONL files) [sonnet] — audit-miner-1
- T2: Mine history batch B (Feb 1, 10 older JSONL files) [sonnet] — audit-miner-2
- T3: Mine debug logs [sonnet] — audit-miner-3
- T4: Audit CLAUDE.md rules + shared instructions [opus] — audit-rules-1
- T5: Audit all 27 skills [sonnet] — audit-rules-2
- T6: Audit commands + agents [sonnet] — audit-rules-3

### Wave 1 Validation
- V1: Validate wave 1 [sonnet] — audit-validator, blockedBy: [T1, T2, T3, T4, T5, T6]

### Wave 2 (synthesis)
- T7: Cross-reference history friction with rules audit, synthesize recommendations [opus] — audit-synth, blockedBy: [V1]

### Wave 2 Validation
- V2: Validate wave 2 [sonnet] — audit-validator, blockedBy: [T7]

## Dependency Graph
Wave 1: T1, T2, T3, T4, T5, T6 (parallel) → V1 → Wave 2: T7 → V2

## Task Details & Acceptance Criteria

### T1: Mine History Batch A (audit-miner-1)

Read the 20 most recent JSONL files in `~/.claude/projects/C--Users-Mike--dotfiles/`. For each file, extract user messages and assistant messages. Search for friction patterns:

**Friction signals to search for:**
- User corrections: "no", "that's wrong", "I said", "don't do that", "stop", "why did you"
- Retries/redos: user asking for the same thing again after a failed attempt
- User frustration: "I already told you", "again?", "this is the Nth time"
- Provenance avoidance: "pre-existing", "not my changes", "I didn't create", "left untouched", "leave alone", "skip"
- Work skipping: Claude saying "I'll leave that" or "that's outside scope" when user asked for it
- Rule misapplication: Claude citing a rule to avoid doing something the user asked for
- Repeated failures: same error hit multiple times before resolution
- Sycophancy: "You're absolutely right", "Great question", "Great catch"

**Output**: Write findings to `.specs/ruleset-audit/history-batch-a.md` with:
- Session ID (filename)
- Friction pattern type
- Exact quotes (user message + Claude response)
- Which rule/skill may have caused the behavior

1. [ ] All 20 JSONL files from Feb 15-17 are read and analyzed
   - Verification: `.specs/ruleset-audit/history-batch-a.md` exists and references all 20 files
   - Expected: File lists findings organized by friction pattern type
2. [ ] Each finding includes session ID, pattern type, and exact quotes
   - Verification: Read the output file, check structure
   - Expected: Every finding has the three required fields
3. [ ] Root cause attribution attempted for each finding
   - Verification: Each finding has a "likely rule/skill cause" field
   - Expected: At least a hypothesis for what rule enabled the behavior

### T2: Mine History Batch B (audit-miner-2)

Same as T1, but for the 20 older JSONL files (Feb 1 and earlier). Write to `.specs/ruleset-audit/history-batch-b.md`.

1. [ ] All older JSONL files are read and analyzed
   - Verification: `.specs/ruleset-audit/history-batch-b.md` exists
   - Expected: Findings organized by friction pattern type
2. [ ] Each finding includes session ID, pattern type, and exact quotes
   - Verification: Read the output file
   - Expected: Structured findings with quotes
3. [ ] Root cause attribution attempted
   - Verification: Each finding has cause hypothesis
   - Expected: Links to specific rules or behavioral patterns

### T3: Mine Debug Logs (audit-miner-3)

Read all 69 debug TXT files in `~/.claude/debug/`. Search for:
- Error patterns, crashes, tool failures
- Permission denials
- Hook failures
- Repeated retries of the same operation
- Timeout issues

Write to `.specs/ruleset-audit/debug-findings.md`.

1. [ ] All 69 debug files are scanned
   - Verification: `.specs/ruleset-audit/debug-findings.md` exists
   - Expected: Summary of error patterns found
2. [ ] Findings categorized by error type
   - Verification: Read output file
   - Expected: Clear categories (tool failures, permissions, hooks, timeouts, etc.)

### T4: Audit CLAUDE.md Rules + Shared Instructions (audit-rules-1)

Read and critically analyze these files for ambiguities, contradictions, and paradoxes:
- `~/.dotfiles/claude/CLAUDE.md` (global rules)
- `~/.dotfiles/CLAUDE.md` (project rules)
- `~/.dotfiles/claude/shared/commit-instructions.md`
- `~/.dotfiles/claude/shared/do-this-instructions.md`
- `~/.dotfiles/claude/shared/plan-with-team-instructions.md`
- `~/.dotfiles/claude/shared/research-instructions.md`
- `~/.dotfiles/claude/shared/dig-into-instructions.md`
- `~/.dotfiles/claude/shared/yt-instructions.md`
- `~/.dotfiles/menos/.claude/CLAUDE.md` (menos project rules)

**What to look for:**
- Rules that contradict each other
- Rules that can be misread to justify avoiding work
- Ambiguous phrasing that leads to inconsistent behavior
- Rules that are too broad (catch things they shouldn't)
- Rules that are too narrow (miss cases they should cover)
- Paradoxical combinations (e.g., "always ask" vs "complete all steps without asking")
- Escape hatches that are too easy to exploit

Write to `.specs/ruleset-audit/rules-audit.md`.

1. [ ] All 9 files read and analyzed
   - Verification: `.specs/ruleset-audit/rules-audit.md` references all files
   - Expected: Every file listed with findings or "no issues found"
2. [ ] Each issue includes the exact text, the problem, and a suggested fix
   - Verification: Read output file
   - Expected: Structured findings with original text, analysis, and recommendation
3. [ ] Cross-rule contradictions identified
   - Verification: Output has a "contradictions" section
   - Expected: Pairs of rules that conflict, with explanation

### T5: Audit Skills (audit-rules-2)

Read all 27 SKILL.md files in `~/.claude/skills/` and analyze for:
- Ambiguous activation triggers (could fire when they shouldn't)
- Contradictions with CLAUDE.md rules
- Overlapping skills that could conflict
- Instructions that are vague or could be misinterpreted
- Skills that reference outdated patterns or tools

Write to `.specs/ruleset-audit/skills-audit.md`.

1. [ ] All 27 SKILL.md files read and analyzed
   - Verification: `.specs/ruleset-audit/skills-audit.md` lists all 27 skills
   - Expected: Each skill listed with findings or "no issues"
2. [ ] Activation trigger ambiguities identified
   - Verification: Output has trigger analysis section
   - Expected: Skills with overly broad or conflicting triggers flagged
3. [ ] Cross-skill conflicts identified
   - Verification: Output has conflicts section
   - Expected: Pairs of skills that could interfere listed

### T6: Audit Commands + Agents (audit-rules-3)

Read all command files (`claude/commands/*.md`, `opencode/commands/*.md`) and agent definitions (`claude/agents/*.md`). Analyze for:
- Commands that contradict CLAUDE.md rules
- Agent definitions that are too vague or too restrictive
- Missing error handling guidance
- Inconsistencies between Claude and OpenCode command versions
- Agent capability mismatches (assigned tasks they can't do with their tools)

Write to `.specs/ruleset-audit/commands-agents-audit.md`.

1. [ ] All command and agent files read
   - Verification: `.specs/ruleset-audit/commands-agents-audit.md` lists all files
   - Expected: Every file analyzed
2. [ ] Inconsistencies between Claude and OpenCode versions identified
   - Verification: Output has cross-tool comparison section
   - Expected: Differences flagged with recommendation to sync or diverge intentionally
3. [ ] Agent capability gaps identified
   - Verification: Output has agent analysis section
   - Expected: Mismatches between assigned tasks and available tools flagged

### V1: Wave 1 Validation

1. [ ] All 6 output files exist in `.specs/ruleset-audit/`
   - Verification: `ls ~/.dotfiles/.specs/ruleset-audit/*.md`
   - Expected: history-batch-a.md, history-batch-b.md, debug-findings.md, rules-audit.md, skills-audit.md, commands-agents-audit.md
2. [ ] Each file has structured findings (not empty or placeholder)
   - Verification: Read each file, check for substance
   - Expected: Real findings with quotes, analysis, and recommendations
3. [ ] Files are well-organized and cross-referenceable
   - Verification: Consistent structure across files
   - Expected: Can be consumed by T7 synthesis agent

### T7: Cross-Reference & Synthesize (audit-synth)

Read all 6 audit output files from Wave 1. Cross-reference history friction patterns with rules/skills audit findings. Produce a single recommendations document.

Write to `.specs/ruleset-audit/recommendations.md` with:

1. **Friction Pattern Summary** — Top friction patterns found in history, ranked by frequency
2. **Root Cause Map** — Which rules/skills caused or enabled each friction pattern
3. **Contradictions & Paradoxes** — All cross-rule conflicts, with severity
4. **Recommended Changes** — Specific, actionable edits to files, ordered by impact
5. **Quick Wins** — Changes that are simple and high-impact (do first)
6. **Structural Issues** — Deeper problems that need rethinking, not just patching

Acceptance criteria:
1. [ ] Recommendations file exists and has all 6 sections
   - Verification: Read `.specs/ruleset-audit/recommendations.md`
   - Expected: All sections present with substance
2. [ ] Each recommendation cites specific evidence from history or audit files
   - Verification: Recommendations reference session IDs or file:line
   - Expected: No unsupported claims
3. [ ] Recommendations are actionable (specific file + specific change)
   - Verification: Each recommendation names the file to edit and the proposed text
   - Expected: Could be implemented directly from the recommendations

### V2: Wave 2 Validation

1. [ ] Recommendations file is complete and well-structured
   - Verification: Read `.specs/ruleset-audit/recommendations.md`
   - Expected: All 6 sections, actionable content, evidence-based
2. [ ] No recommendation contradicts existing rules without acknowledging the tradeoff
   - Verification: Cross-check recommendations against current CLAUDE.md
   - Expected: Tradeoffs explicitly stated
