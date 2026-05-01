---
created: 2026-04-30
status: draft
completed: 2026-04-30
---

# Plan: Bias Resistance Rules

## Context & Motivation

The user wants agents to investigate before validating user hypotheses, and to make their own confidence visible so the user can detect overconfidence. The motivating principle, in their words: **"if I am not sure you should not be sure."** The agent should generate alternatives when the user hedges (`I think`, `seems like`, `probably`, etc.) instead of validating the user's first theory, and should label its own recommendations with confidence tiers so the user can calibrate.

This plan was crystallized from a long grilling session that started from a 10-batch proposal and ended at 6 surgical edits. The original proposal was reduced because:

- A new `bias-resistance` skill would have directly overlapped `claude/skills/brainstorming/` (alternatives generation) and `claude/skills/analysis-workflow/adversarial.md` (counter-argument). Competing activation triggers would have caused drift.
- Per-agent edits (builders, leads, orchestrator, code-reviewer) restated rules already covered by a top-level rule plus auto-activating skills.
- "Option-order shuffle" defenses were theater in an LLM context (the model evaluates internally before rendering output, so reordering the rendered list does not undo the internal evaluation). Replaced with score-before-order.
- Multi-agent-specific bullets in `pi/AGENTS.md` were universal high-level behaviors already covered by the new top-level rule.

The user explicitly chose a single commit, no test-prompt file, lightweight real-world observation as the validation strategy.

## Constraints

- Platform: Windows 11 (development host); shell: bash (Git Bash / MSYS2)
- File rule: ASCII punctuation only -- no em-dashes or en-dashes anywhere in file content. Use `--` or `-`.
- Skill structure: edits must match the existing style of the target file (read neighboring section before writing).
- Mirror invariant: `claude/CLAUDE.md` and `pi/AGENTS.md` are the canonical harness pair; rules added to one must be mirrored in the other.
- No new files created. All six edits extend existing files.
- Single commit. No per-file or per-layer commits.
- Validation strategy: lightweight real-world observation. No test-prompt file is created.

## Alternatives Considered

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| New `bias-resistance` skill + symlink + 6 agent edits + 2 global edits (10 batches) | Unified mental model; per-batch rollback granularity | Direct overlap with `brainstorming` and `adversarial`; competing skill activation; same rule restated in 8+ places (drift risk); per-agent rules duplicate auto-activating skill content | Rejected: scope-creep against repo's KISS rule; drift surface unacceptable |
| Top-level rule only, no skill edits | Minimal change; one source of truth | Misses concrete worked examples; loses opportunity to strengthen `brainstorming` and `debugging.md` activation triggers for hedge phrases | Rejected: top-level rule needs at least the hedge-trigger anchor in `debugging.md` for the user's stated debugging-pain case |
| Top-level rule + extend existing skills (6 edits, 1 commit) | Canonical-skill-plus-pointer; no duplication; fires through existing activation pathways; skill triggers cover hedge phrases via debugging.md | All-or-nothing rollback if a single rule misfires; no test-prompt artifact for regression detection | **Selected** -- matches user's preferences for KISS, lightweight validation, single commit |

## Objective

After this plan executes, agents will:

1. Generate 2-3 independent alternatives when the user hedges (any context, any skill).
2. Surface their own confidence (high / medium / low) on recommendations so the user can spot overconfidence.
3. Score options on independent merit before ordering recommendations in the `brainstorming` skill.
4. Detect false-compromise solutions and trend-bias toward popular patterns inside `brainstorming`.
5. Apply hedge-phrase triggers in the debugging path via `analysis-workflow/debugging.md`.
6. Use neutral dispatch prompts and contrarian follow-ups on suspicious unanimity inside `/review-it`.
7. Require concrete alternatives with specific rejected-because tradeoffs for medium/large tasks in `/plan-it`, and flag wave-level architectural convergence as possible trend bias.

End state: 6 files modified in a single commit. No new files. No restructuring of existing skills.

## Project Context

- **Language**: Markdown (skill and rules content); no executable code changes
- **Test command**: none -- validation is lightweight real-world observation per user choice
- **Lint command**: none defined for skill content; manual diff review

## Task Breakdown

| # | Task | Files | Type | Model | Agent | Depends On |
|---|------|-------|------|-------|-------|------------|
| T1 | Add user-certainty-calibration rule to claude/CLAUDE.md | 1 | mechanical | haiku | builder-light | -- |
| T2 | Mirror the rule in pi/AGENTS.md | 1 | mechanical | haiku | builder-light | -- |
| T3 | Extend brainstorming skill (score-before-order, false-compromise, opposite-context, debugging cross-ref) | 1 | feature | sonnet | builder | -- |
| T4 | Extend analysis-workflow/debugging.md with Hypothesis Validation section | 1 | feature | sonnet | builder | -- |
| T5 | Extend pi/skills/workflow/review-it.md (neutral dispatch + contrarian follow-up) | 1 | feature | sonnet | builder | -- |
| T6 | Extend pi/skills/workflow/plan-it.md (medium/large alternatives + wave convergence) | 1 | feature | sonnet | builder | -- |
| V1 | Validate all six edits | -- | validation | sonnet | validator-heavy | T1, T2, T3, T4, T5, T6 |
| T7 | Single commit of all six files | 6 | mechanical | haiku | builder-light | V1 |

## Execution Waves

### Wave 1 (parallel)

**T1: Add user-certainty-calibration rule to claude/CLAUDE.md** [haiku] -- builder-light
- Description: Insert a single new bullet in the "Critical Rules (Always Apply First)" section, placed immediately after the "No sycophancy phrases" bullet. The bullet must cover both directions: (a) hedge-phrase detection triggers alternative generation; (b) recommendations must surface a confidence tier with the cause of that confidence.
- Files: `claude/CLAUDE.md`
- Exact insertion text:

  > **User certainty calibration** -- (1) When the user hedges ("I think", "seems like", "probably", "maybe", "I suspect", "might be", "could be", "looks like", "pretty sure") about a technical hypothesis (code, systems, causation), generate 2-3 independent alternatives before evaluating their theory. Skip this when the hedge is conversational filler with no technical hypothesis ("I think we're done"). Do not collapse uncertainty by validating their theory. (2) When making recommendations, surface your own confidence with one-line justification: high (verified against evidence/code -- state what was verified), medium (best practice but not verified for this context -- state what was not verified), low (pattern matching, no verification -- state what assumption is unconfirmed). If the user is not sure, you must not be sure -- and if you are sure, the user should be able to see why.

  Insertion text must be a single unbroken line (no editor word-wrap) so the harness-pair diff check (T2 criterion 2) compares cleanly.

- Acceptance Criteria:
  1. [ ] Bullet appears immediately after "No sycophancy phrases" in the Critical Rules section.
     - Verify: `grep -n -A1 "No sycophancy phrases" ~/.dotfiles/claude/CLAUDE.md`
     - Pass: next non-blank line begins with `- **User certainty calibration**`
     - Fail: bullet missing or placed elsewhere -- re-edit at the correct location
  2. [ ] No em-dashes or en-dashes introduced.
     - Verify: `grep -P '\xe2\x80\x93\|\xe2\x80\x94' ~/.dotfiles/claude/CLAUDE.md`
     - Pass: no matches (exit 1)
     - Fail: matches found -- replace with `--` or `-`

**T2: Mirror the rule in pi/AGENTS.md** [haiku] -- builder-light
- Description: Insert the same bullet into the "Agent Behavioral Rules" section of `pi/AGENTS.md`, placed immediately after the "No sycophancy" bullet (note the slightly different wording in the pi file). The wording of the rule itself must match T1's text verbatim to keep the harness pair in sync.
- Files: `pi/AGENTS.md`
- Acceptance Criteria:
  1. [ ] Bullet appears immediately after the "No sycophancy" bullet in Agent Behavioral Rules.
     - Verify: `grep -n -A1 "No sycophancy" ~/.dotfiles/pi/AGENTS.md`
     - Pass: next non-blank line begins with `- **User certainty calibration**`
     - Fail: bullet missing or placed elsewhere
  2. [ ] Rule body matches T1 verbatim (after the bold label).
     - Verify: `diff <(grep -A2 "User certainty calibration" ~/.dotfiles/claude/CLAUDE.md) <(grep -A2 "User certainty calibration" ~/.dotfiles/pi/AGENTS.md)`
     - Pass: identical content
     - Fail: drift between harness pair -- align both to the same text
  3. [ ] No em-dashes or en-dashes.
     - Verify: `grep -P '\xe2\x80\x93\|\xe2\x80\x94' ~/.dotfiles/pi/AGENTS.md`
     - Pass: no matches (exit 1)

**T3: Extend brainstorming skill** [sonnet] -- builder
- Description: Make four additions to `claude/skills/brainstorming/SKILL.md`. Place each in the most natural existing section. Match existing formatting (markdown tables, bullet style, code blocks).
  1. **Score-before-order** -- add to the section that introduces the trade-offs table (currently `## The Process` -> `### 3. Compare Trade-offs`). New paragraph above the table:
     > Score each option against the criteria *independently* before deciding the recommendation. Order the final presentation by independent assessment, not by the order options came to mind. This guards against first-idea anchoring.
  2. **Pattern 4 (false-compromise detection)** -- new bullet under `## Anti-Patterns` -> `**Don't:**`:
     > Propose a "best of both" solution without verifying the tradeoff is real. If you cannot name a specific cost the compromise pays, pick a side instead.
  3. **Pattern 5 strengthening (opposite-context)** -- new section inserted between `## Brainstorming Prompts` and `## Example`:
     ```
     ## Trend Bias Check
     
     Before recommending an industry-popular pattern (microservices, GraphQL, NoSQL, event-driven, monorepo, etc.), name one specific scenario in this project's context where the opposite choice would be correct. If you cannot, the recommendation is trend-driven, not context-driven.
     ```
  4. **Cross-reference to debugging.md** -- new row in the `## When to Brainstorm` table:
     | User-proposed cause hypothesis ("I think it's X") | Yes -- see [debugging.md](../analysis-workflow/debugging.md) |
- Files: `claude/skills/brainstorming/SKILL.md`
- Acceptance Criteria:
  1. [ ] All four additions present.
     - Verify: `grep -c "Score each option against the criteria\|best of both\|Trend Bias Check\|User-proposed cause hypothesis" ~/.dotfiles/claude/skills/brainstorming/SKILL.md`
     - Pass: count is 4
     - Fail: any addition missing -- locate gap and re-edit
  2. [ ] No em-dashes or en-dashes introduced.
     - Verify: `grep -P '\xe2\x80\x93\|\xe2\x80\x94' ~/.dotfiles/claude/skills/brainstorming/SKILL.md`
     - Pass: no matches (exit 1)
  3. [ ] Existing sections preserved (no accidental deletion).
     - Verify: `git -C ~/.dotfiles diff --stat claude/skills/brainstorming/SKILL.md`
     - Pass: only insertions reported, no deletions of existing content lines
     - Fail: deletions present -- restore from git and reapply additions

**T4: Extend analysis-workflow/debugging.md with Hypothesis Validation** [sonnet] -- builder
- Description: Add a new section titled `## Hypothesis Validation` immediately before `## The Process` (the REPRODUCE -> ISOLATE step-by-step sequence). This places it after the Core Principle intro and before the debugging procedure. Content must explicitly enumerate the hedge phrases as triggers and require generation of 2-3 alternative causes before evaluating the user's theory. Cross-reference back to the top-level rule in `claude/CLAUDE.md`.
- Files: `claude/skills/analysis-workflow/debugging.md`
- New section content:
  ```
  ## Hypothesis Validation
  
  When the user proposes a debugging hypothesis with hedged language -- "I think", "seems like", "probably", "maybe", "I suspect", "might be", "could be", "looks like", "pretty sure" -- generate 2-3 alternative causes *independently* before evaluating their theory.
  
  **Rule (from `claude/CLAUDE.md` user-certainty-calibration):** if the user is not sure, the agent must not be sure.
  
  Procedure:
  1. List 2-3 candidate causes that fit the observed evidence, generated without reference to the user's hypothesis.
  2. Score each against available evidence (logs, types, recent changes, test output).
  3. *Then* evaluate the user's hypothesis as one of the candidates, with the same scoring rigor.
  4. Report the ranked list with confidence tiers (high / medium / low). If the user's hypothesis ranks below another candidate, say so.
  
  Skip this when the user is *not* hedging and is reporting an observed fact ("the test fails with X error"), or when the cause is verifiable in one read.
  ```
- Acceptance Criteria:
  1. [ ] Section present with the heading `## Hypothesis Validation`.
     - Verify: `grep -n "^## Hypothesis Validation" ~/.dotfiles/claude/skills/analysis-workflow/debugging.md`
     - Pass: exactly one match
     - Fail: missing or duplicated -- fix
  2. [ ] All hedge-phrase triggers present.
     - Verify: `grep -c "I think\|seems like\|probably\|I suspect\|might be\|looks like" ~/.dotfiles/claude/skills/analysis-workflow/debugging.md`
     - Pass: count >= 1 line containing all of them
     - Fail: triggers incomplete
  3. [ ] No em-dashes or en-dashes.
     - Verify: `grep -P '\xe2\x80\x93\|\xe2\x80\x94' ~/.dotfiles/claude/skills/analysis-workflow/debugging.md`
     - Pass: no matches

**T5: Extend pi/skills/workflow/review-it.md** [sonnet] -- builder
- Description: Add a `### Pre-Review Bias Check` subsection immediately before the opening paragraph of `## Step 3: Launch Independent Reviews First` (around line 111 in the current file). Two rules:
  1. Reviewer dispatch prompts must be neutral. The coordinator does not preview their own opinion of the plan to the reviewers.
  2. When reviewers converge unanimously on a popular pattern (microservices, GraphQL, NoSQL, event-driven, etc.), dispatch one targeted contrarian follow-up asking a reviewer to argue the opposite position with concrete evidence before synthesis.
- Do NOT include the original "shuffle reviewer order" rule. Sub-agent return order has natural variance.
- Files: `pi/skills/workflow/review-it.md`
- Acceptance Criteria:
  1. [ ] Subsection `### Pre-Review Bias Check` exists in the dispatch section.
     - Verify: `grep -n "Pre-Review Bias Check" ~/.dotfiles/pi/skills/workflow/review-it.md`
     - Pass: at least one match
  2. [ ] No reference to "shuffle" in the new content.
     - Verify: `grep -i "shuffle" ~/.dotfiles/pi/skills/workflow/review-it.md`
     - Pass: no matches (or only matches predating this change in unrelated context)
  3. [ ] No em-dashes or en-dashes.
     - Verify: `grep -P '\xe2\x80\x93\|\xe2\x80\x94' ~/.dotfiles/pi/skills/workflow/review-it.md`
     - Pass: no matches

**T6: Extend pi/skills/workflow/plan-it.md** [sonnet] -- builder
- Description: Two additions:
  1. In Step 7 (Self-Validate) checklist, add a new validation rule:
     > - [ ] Every task classified as `medium` or `large` has at least one concrete alternative in `Alternatives Considered` with a specific rejected-because tradeoff. Generic rejections like "more complex" or "less flexible" do not count -- the rejection must cite a specific tradeoff against the project's stated constraints.
  2. In Step 5 (Organize into Waves), add a new bullet:
     > - When all tasks in a wave converge on the same architectural pattern (all microservices-flavored, all event-driven, all message-queue-based, etc.), flag this in the plan's `Alternatives Considered` section. Convergence may reflect trend bias rather than fit. Name one scenario where the opposite pattern would be correct for this project.
- Files: `pi/skills/workflow/plan-it.md`
- Acceptance Criteria:
  1. [ ] New validation rule present in Step 7.
     - Verify: `grep -n "rejected-because" ~/.dotfiles/pi/skills/workflow/plan-it.md`
     - Pass: at least one match in or after the line containing `## Step 7`
  2. [ ] New convergence-flag bullet present in Step 5.
     - Verify: `grep -n "trend bias\|architectural pattern" ~/.dotfiles/pi/skills/workflow/plan-it.md`
     - Pass: at least one match in or after the line containing `## Step 5`
  3. [ ] No em-dashes or en-dashes.
     - Verify: `grep -P '\xe2\x80\x93\|\xe2\x80\x94' ~/.dotfiles/pi/skills/workflow/plan-it.md`
     - Pass: no matches

### Wave 1 -- Validation Gate

**V1: Validate all six edits** [sonnet] -- validator-heavy
- Blocked by: T1, T2, T3, T4, T5, T6
- Checks:
  1. All acceptance criteria for T1-T6 pass (run each verification command).
  2. Harness-pair sync: rule body in `claude/CLAUDE.md` and `pi/AGENTS.md` is identical (T2 criterion 2).
  3. Em-dash/en-dash sweep across all six modified files: `for f in claude/CLAUDE.md pi/AGENTS.md claude/skills/brainstorming/SKILL.md claude/skills/analysis-workflow/debugging.md pi/skills/workflow/review-it.md pi/skills/workflow/plan-it.md; do grep -P '\xe2\x80\x93\|\xe2\x80\x94' ~/.dotfiles/$f && echo "FAIL: $f"; done` -- expect no FAIL output.
  4. Cross-task integration: `claude/skills/brainstorming/SKILL.md` cross-ref points to a real file: `test -f ~/.dotfiles/claude/skills/analysis-workflow/debugging.md` -- pass on exit 0.
  5. No unintended file changes: `git -C ~/.dotfiles status --porcelain` lists exactly the six expected files modified, no others.
- On failure: identify which acceptance criterion failed, dispatch a fix task targeting that file, re-validate.

### Wave 2

**T7: Single commit of all six files** [haiku] -- builder-light
- Blocked by: V1
- Description: Stage exactly the six modified files and create one conventional-commit-format commit. Do not stage any other files. Do not push.
- Files: `claude/CLAUDE.md`, `pi/AGENTS.md`, `claude/skills/brainstorming/SKILL.md`, `claude/skills/analysis-workflow/debugging.md`, `pi/skills/workflow/review-it.md`, `pi/skills/workflow/plan-it.md`
- Commit message:
  ```
  feat(rules,skills): add bias-resistance rules and skill extensions
  
  Top-level user-certainty-calibration rule (hedge detection +
  confidence-surfacing) mirrored in claude/CLAUDE.md and pi/AGENTS.md.
  Extends brainstorming with score-before-order, false-compromise
  detection, and trend-bias check. Adds Hypothesis Validation section
  to debugging skill. Tightens review-it dispatch and plan-it
  alternatives gate.
  ```
- Acceptance Criteria:
  1. [ ] Exactly six files committed.
     - Verify: `git -C ~/.dotfiles diff-tree --no-commit-id -r --name-only HEAD`
     - Pass: output lists exactly the six expected file paths (commit-message-length-independent)
     - Fail: extra or missing files -- amend or reset and redo
  2. [ ] Commit subject matches conventional-commit format.
     - Verify: `git -C ~/.dotfiles log -1 --pretty=%s`
     - Pass: starts with `feat(rules,skills):`
  3. [ ] Working tree clean after commit (no leftover untracked files from this work).
     - Verify: `git -C ~/.dotfiles status --porcelain`
     - Pass: no output for files in the six paths above

### Wave 2 -- Validation Gate

(None required; T7 is itself a verification step gated on V1.)

## Dependency Graph

```
Wave 1: T1, T2, T3, T4, T5, T6 (parallel) -> V1
Wave 2: T7 (commit, gated on V1)
```

## Success Criteria

1. [ ] All six files contain their respective additions and are committed in a single commit.
   - Verify: `git -C ~/.dotfiles log -1 --stat`
   - Pass: one commit, six files, additions only
2. [ ] Harness-pair (claude/CLAUDE.md + pi/AGENTS.md) carries identical user-certainty-calibration rule body.
   - Verify: `diff <(grep -A2 "User certainty calibration" ~/.dotfiles/claude/CLAUDE.md) <(grep -A2 "User certainty calibration" ~/.dotfiles/pi/AGENTS.md)`
   - Pass: identical
3. [ ] Skill activation pathways unchanged for the three files that have activation blocks.
   - Verify: `grep -l "Auto-activate when\|Activate when" ~/.dotfiles/claude/skills/brainstorming/SKILL.md ~/.dotfiles/claude/skills/analysis-workflow/debugging.md ~/.dotfiles/pi/skills/workflow/review-it.md`
   - Pass: 3 paths returned. (`plan-it.md` is excluded by design -- it is a coordinator/crystallizer instruction file, not a SKILL with an activation block; the plan adds none.)
4. [ ] User-facing observation plan: after install, the user notes in real conversations whether the agent (a) generates alternatives when the user hedges, (b) labels recommendations with confidence tiers, (c) does not over-fire on trivial requests. No automated check; the user's own observation over time is the validation.

## Handoff Notes

- Read each target file before editing. Match the surrounding section style (table format, bullet style, heading depth).
- The Pi-side files (`pi/AGENTS.md`, `pi/skills/workflow/*.md`) live in the Pi subtree but the harness-pair sync rule means changes to `claude/CLAUDE.md` rule body must match `pi/AGENTS.md` rule body verbatim.
- The user has explicitly chosen NOT to create a test-prompt file. Do not add one as a "convenience".
- The user has explicitly chosen a single commit. Do not split into per-layer commits.
- If during execution any rule appears to overlap with content already present (e.g., brainstorming already has "What if we did the opposite?" prompt), preserve the existing content and add the new section anyway -- the existing prompt is informal, the new "Trend Bias Check" section is enforceable.
- After commit, do NOT push. The user may want to review and revise before pushing.
- The brainstorming `SKILL.md` frontmatter `description` field is intentionally NOT updated for hedge-phrase triggers. Hedge detection is routed through `analysis-workflow/debugging.md` (T4) and the top-level rule (T1/T2). The brainstorming cross-reference row (T3) is informational, reached only after a brainstorming session is already active. Do not "helpfully" add hedge phrases to brainstorming's frontmatter -- it would create competing activation triggers with the analysis-workflow skill.
