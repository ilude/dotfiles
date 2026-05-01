---
date: 2026-04-30
status: synthesis-complete
---

# Plan Review Synthesis: bias-resistance

## Review Panel

| Reviewer | Role | Findings | Verified Issues |
|----------|------|----------|-----------------|
| Completeness & Explicitness | Missing assumptions, ambiguous instructions, unverifiable criteria | 6 findings | 3 confirmed |
| Adversarial / Red Team | Failure modes, cascading failures, zombie state | 5 findings | 3 confirmed |
| Outside-the-Box / Simplicity | Proportionality, over-engineering, under-engineering | 4 findings | 1 confirmed |
| Skills Engineering | Activation pathways, cross-references, insertion precision | 5 findings | 4 confirmed |
| Rule Effectiveness | Trigger reliability, over-firing, rule conflicts, enforceability | 6 findings | 4 confirmed |

---

## Outside-the-Box Assessment

The approach is fundamentally sound. The decision to extend 6 existing files rather than create a new skill is correct -- it avoids competing activation triggers and keeps the change set minimal. The "Alternatives Considered" section demonstrates real prior analysis. The only legitimate proportionality concern is whether the brainstorming cross-reference row in "When to Brainstorm" pulls enough weight to justify its existence; it is not a blocking issue. The plan correctly scopes to the minimum needed to cover hedge-phrase detection in both the global rules and the debugging path.

One genuine simplicity gap: T5 targets `review-it.md` which is itself a coordinator instruction file (not a structured document with labeled sections), making the insertion point description ("locate the paragraph that describes dispatching reviewers") ambiguous for an executor with no prior context. This is a hardening issue, not a blocking bug.

---

## Bugs (must fix before executing)

### BUG-1 [CRITICAL] -- grep -P unicode escape syntax fails on Windows Git Bash

**Who flagged:** Adversarial + Skills Engineering (verified independently)

**Verification:** Confirmed. Running `grep -P '[\x{2013}\x{2014}]'` on Git Bash (Windows) exits with:
`grep: character value in \x{} or \o{} is too large`. Exit code 2 (error), not exit code 1 (no match). The V1 validation loop would interpret this as an error, not a clean pass, and the em-dash sweep would never succeed.

**Affected tasks:** T1, T2, T3, T4, T5, T6 acceptance criteria (em-dash checks) + V1 check 3

**Fix:** Replace all occurrences of `grep -P '[\x{2013}\x{2014}]'` with the UTF-8 byte sequence form:

```
grep -P '\xe2\x80\x93\|\xe2\x80\x94'
```

Or use Python for portability (already available per CLAUDE.md):

```
python -c "import sys; d=open(sys.argv[1]).read(); sys.exit(0 if any(c in d for c in 'â€“â€”') else 1)" <file>
```

Confirmed: `printf '\xe2\x80\x94' | grep -P '\xe2\x80\x94'` exits 0 (match found) on this system. The UTF-8 byte form works correctly.

---

### BUG-2 [HIGH] -- T7 commit verification command breaks with multi-line commit message

**Who flagged:** Adversarial (verified)

**Verification:** Confirmed. The plan's commit message has a subject line + blank line + 3-line body. `git show --stat HEAD | tail -n +5 | head -n 7` skips only 4 header lines (commit/author/date/blank), then returns: subject, blank, body-line-1, body-line-2, body-line-3, blank, first-file -- which gives at most 1 file visible inside the `head -n 7` window, not 6. The validator would see an incomplete file list and incorrectly flag failure.

**Affected tasks:** T7, V1 (T7 acceptance criterion 1)

**Fix:** Replace the verification command with one that is message-length-independent:

```
git -C ~/.dotfiles diff-tree --no-commit-id -r --name-only HEAD
```

Pass condition: output lists exactly the 6 expected file paths.

---

### BUG-3 [HIGH] -- Success Criteria #3 grep-l command fails for plan-it.md (no trigger keyword present)

**Who flagged:** Skills Engineering (verified)

**Verification:** Confirmed. `grep -l "Auto-activate when|Activate when|Trigger"` across the 4 skill files returns only 3 paths -- `plan-it.md` contains none of these strings. It is a command/crystallizer file, not a SKILL.md with an activation block. The Success Criteria check would report 3/4 files and appear to fail even after a correct execution.

**Affected tasks:** Success Criteria item 3

**Fix:** Either remove `plan-it.md` from the grep-l command (since it has no activation trigger and the plan does not add one), or replace the check with a targeted per-file grep:

```bash
grep -l "Auto-activate when\|Activate when" \
  ~/.dotfiles/claude/skills/brainstorming/SKILL.md \
  ~/.dotfiles/claude/skills/analysis-workflow/debugging.md \
  ~/.dotfiles/pi/skills/workflow/review-it.md
# Pass: 3 paths returned (plan-it.md has no trigger block and none is being added)
```

---

### BUG-4 [HIGH] -- T4 insertion point "after the intro / triggers, before existing investigation steps" is ambiguous

**Who flagged:** Completeness (verified)

**Verification:** Confirmed. `debugging.md` has this structure:
- Line 1: title + auto-activate line
- Line 7: `## Core Principle: Scientific Method for Software`
- Line 18: `---`
- Line 20: `## The Process` (REPRODUCE -> ISOLATE -> HYPOTHESIZE -> TEST -> FIX -> VERIFY)

"After the intro / triggers, before existing investigation steps" could mean: (a) after line 5 `---` before `## Core Principle`, (b) after `## Core Principle` before `## The Process`, or (c) inside `## The Process` before step 3 (Hypothesize). Interpretation (b) -- after Core Principle, before The Process -- is the most logical fit, but it is not stated explicitly.

**Affected tasks:** T4

**Fix:** Replace the insertion description with an explicit anchor:

> Add `## Hypothesis Validation` immediately before `## The Process` (the REPRODUCE -> ISOLATE line). This places it after the Core Principle intro and before the step-by-step debugging sequence.

---

## Hardening Suggestions (optional improvements)

### H-1 [MEDIUM] -- T5 insertion point in review-it.md needs a precise line anchor

`review-it.md` is a 324-line instruction file. "Locate the paragraph that describes dispatching reviewers" is ambiguous because the entire file is about dispatching reviewers. The relevant location is `## Step 3: Launch Independent Reviews First` (line 111). The plan should say: "Add `### Pre-Review Bias Check` subsection immediately before the opening paragraph of `## Step 3: Launch Independent Reviews First`."

**Proportionality:** Low effort fix, prevents executor guessing.

---

### H-2 [MEDIUM] -- T2 harness-sync diff check (grep -A0) is fragile if rule text spans multiple lines

The plan's diff verification uses `grep -A0 "User certainty calibration"` to capture the rule for comparison. If the rule is stored as a single long markdown bullet (which is the standard format in both files), this works. However, if any editor wraps the line at 80 chars during the edit, `grep -A0` only returns the first fragment. Add `-A2` as a safety margin, or note explicitly in the plan that the rule must be inserted as a single unbroken line.

**Proportionality:** Low effort annotation, prevents a silent false-pass on drift detection.

---

### H-3 [MEDIUM] -- T3 "Trend Bias Check" section is placed after "Brainstorming Prompts" but before "Example"

The plan says "new section after `## Brainstorming Prompts`". In the current file, `## Example` follows immediately after `## Brainstorming Prompts` (line 110). The executor should be told whether to insert between Brainstorming Prompts and Example, or after Example. "After Brainstorming Prompts" is technically correct but could land in an unintended spot if the executor misreads the section order. Recommend: "Insert `## Trend Bias Check` between `## Brainstorming Prompts` and `## Example`."

---

### H-4 [MEDIUM] -- No carve-out for trivial scope in the hedge-phrase rule (over-firing risk)

The rule triggers on ANY hedge phrase anywhere in user input, including conversational filler like "I think we're done" or "I probably need to restart." There is no stated exception for non-technical or trivial requests. The existing `claude/CLAUDE.md` has no similar carve-out pattern to follow, so this is a design gap, not a style inconsistency. Recommend adding to the T1/T2 rule text: "Skip this when the hedged statement does not contain a hypothesis about code, systems, or technical causation."

**Proportionality:** MEDIUM -- without this carve-out, the rule will fire on non-debugging conversational statements and produce noise. The user's motivating example was the debugging case ("I think it's X"), so this scope restriction is directly consistent with intent.

---

### H-5 [LOW] -- T3 cross-reference row added to "When to Brainstorm" table, but brainstorming SKILL.md frontmatter description does not mention debugging/hypothesis triggers

The plan correctly notes "no frontmatter changes required" in the Handoff Notes. This is consistent -- the cross-reference row is informational (links to debugging.md for the hedge case), not an activation trigger change. The brainstorming skill already fires on "design decisions, architectural choices." Hypothesis investigation is a distinct pathway routed through debugging.md. This split is by design and the plan's rationale is sound. No change needed; flagging for awareness only.

---

### H-6 [LOW] -- Confidence-tier labels (high/medium/low) have no safeguard against agents always picking "medium"

The rule defines high/medium/low tiers but does not require the agent to justify why it chose a specific tier. Without a justification requirement, agents will default to "medium" as the safe choice, making the tier signal meaningless. Recommend appending to the confidence-tier text: "State one specific reason for the tier chosen (what was verified, what was not)."

---

## Dismissed Findings

### DISMISSED-1 -- "brainstorming skill won't activate for hedge phrases because frontmatter only triggers on design decisions"

**Source:** Skills Engineering concern  
**Verdict:** DISMISSED. The plan explicitly routes hedge-phrase detection through `debugging.md` (T4), not through the brainstorming skill activation trigger. The brainstorming cross-reference row (T3) is reached after the user is already inside a brainstorming session. The plan's architecture is correct: hedge phrases -> debugging.md Hypothesis Validation -> (optionally) references brainstorming. No frontmatter change is needed.

---

### DISMISSED-2 -- "parallel T1-T6 tasks could conflict if both T1 and T2 edit overlapping files"

**Source:** Adversarial  
**Verdict:** DISMISSED. T1 targets `claude/CLAUDE.md` and T2 targets `pi/AGENTS.md`. These are distinct files. No overlap is possible.

---

### DISMISSED-3 -- "rule text in T4 section uses em-dash inside backtick-quoted content (the hedge phrase list)"

**Source:** Adversarial  
**Verdict:** DISMISSED. The em-dash in T4's section content appears inside a quoted example: `"I think", "seems like"...`. These are ASCII quotes around ASCII words. Verified: no em-dash or en-dash characters appear in the plan's new section content as written. The plan's own em-dash constraint applies to file content -- the quotes in T4 contain hyphens, not em-dashes.

---

### DISMISSED-4 -- "1-3-1 Rule conflict: the new hedge rule generates alternatives before 1-3-1 can present them"

**Source:** Rule Effectiveness  
**Verdict:** DISMISSED with caveat. The 1-3-1 Rule fires when "a request can be accomplished more simply or goes against established best practices." The new hedge rule fires when the user expresses uncertainty about a technical hypothesis. These are different triggers with different outputs (1-3-1 is a structured option presentation; hedge detection is independent alternative generation). They can fire on the same input without conflict: generate alternatives first, then if a simpler approach exists, apply 1-3-1 to surface it. No interaction bug.

---

## Positive Notes

- The plan's "Alternatives Considered" table is genuinely useful -- it documents why competing approaches were rejected with specific reasoning (overlap, drift surface, LLM evaluation model). An executor can understand the scope boundary.
- Acceptance criteria commands are specific and include Pass/Fail expectations -- this is well above average for a markdown rule plan.
- The harness-pair mirror constraint (T2 mirrors T1 verbatim) is correctly called out and has a verification command. The plan correctly identifies that drift between the two files is a risk.
- The decision to skip a test-prompt artifact is explicitly documented as a user choice, not an oversight -- this prevents an executor from "helpfully" adding one.
- The relative path `../analysis-workflow/debugging.md` in the T3 cross-reference is correct and verified: `claude/skills/brainstorming/SKILL.md` -> `../analysis-workflow/debugging.md` resolves to `claude/skills/analysis-workflow/debugging.md`, which exists.
