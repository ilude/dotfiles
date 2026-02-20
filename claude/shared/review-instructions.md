# /review Command

Review a plan file for issues, ambiguities, questions, and unclear instructions. Uses GPT-5.3-Codex for deep analysis and enforces one-issue-at-a-time 1-3-1 interaction.

## Usage

```
/review                          # Auto-detect plan.md in current/.specs directories
/review path/to/plan.md          # Review specific plan file
```

## Process

### 1. Identify Target File (Deterministic, Sequential)

- Command argument values are injected by OpenCode before execution:
  - Full argument string: `$ARGUMENTS`
  - First positional argument: `$1`
- Select explicit path source in this exact order:
  1. Use `$ARGUMENTS` when non-empty.
  2. Otherwise use `$1` when non-empty.
- Normalize explicit argument before use: trim surrounding whitespace and remove one pair of matching outer quotes (`"..."` or `'...'`).
- If an explicit argument is provided after normalization, use it as the target file and skip auto-detection entirely.
- With an explicit path, do not run `Glob` for candidate discovery.
- Validate the provided path is readable; if not, return a direct file-not-found/readability error for that exact path.
- If no explicit argument remains after normalization, auto-detect in this exact order (sequentially, not in parallel):
  1. Check `./plan.md`; if present, select it and stop.
  2. Check `./.specs/**/plan.md` under the repository root `.specs/` only.
- Repository root for detection is the current working directory when `/review` starts.
- During auto-detection, exclude nested project trees/submodules (for example, `menos/.specs/**`) unless the user explicitly asks for cross-project search.
- If multiple candidates remain, sort paths lexicographically and ask the user to choose one path.
- Do not broaden discovery scope unless the user explicitly requests it.
- Prefer OpenCode tools (`Read`/`Glob`) over shell file discovery.

### 1.5 Execution Mode (Required)

Default mode is **review-then-apply**.

- **review-then-apply (default):** review + 1-3-1 issue discussion, then apply all accepted resolutions to the passed-in plan file after the final issue is discussed.
- **analysis-only (explicit only):** review + 1-3-1 issue discussion, no file edits.

Mode transition rules:
- Start in `review-then-apply`.
- Switch to `analysis-only` only when the user explicitly asks for no edits.
- In `review-then-apply`, do not end the run or ask cleanup questions before applying accepted fixes.

### 2. Initial Review & Assessment

Read the plan file and perform comprehensive analysis:

**Look for:**
- **Ambiguities**: Vague requirements, undefined terms, unclear scope
- **Logical gaps**: Missing steps, undefined dependencies, impossible sequences
- **Unclear instructions**: Actions without clear success criteria, undefined methods
- **Missing context**: Unstated assumptions, missing prerequisites
- **Contradictions**: Conflicting requirements or goals
- **Scope creep indicators**: Open-ended language, "maybe", "consider"
- **Resource issues**: Undefined timelines, missing skill requirements

**Assess scope:**
- Count estimated issues
- Determine if tracking file is warranted (>5 issues or complex dependencies)

Issue hygiene requirements:
- Maintain an internal issue registry with a short "root cause" tag per issue.
- Do not raise derivative issues that are only restatements of already-resolved root causes.
- If a newly found issue depends on a prior decision, present it as a dependency follow-up and state that linkage explicitly.

### 2.5 Repo Grounding Pass (Before Path/Command Issues)

Before raising any issue about paths, commands, file locations, or tooling assumptions:
- Validate against the real repository layout using `Read`/`Glob`.
- Cite the concrete file path(s) that support the concern.
- If repository evidence is missing, do not present the issue yet.

### 3. Scratchpad (Required Internal State)

Create and maintain a per-plan scratchpad file for issue registry and background task state:

```text
scratchpad_file="${plan_file}.review-scratchpad.md"
```

Required scratchpad structure:

```markdown
---
created: <ISO timestamp>
plan_file: <path>
mode: review-then-apply|analysis-only
status: in-progress
---

# Review Scratchpad

## Root Cause Registry
## Issue Queue
## Decisions
## Background Tasks
## Failures
## Final Reanalysis Notes
```

Rules:
- Scratchpad is mandatory for every `/review` run.
- Use it as the source of truth for dedupe and resolved root causes.
- Record background task transitions: `queued -> running -> success|failed`.

Task state model:
- `queued`, `running`, `success`, `failed`, `cancelled`.
- `success`, `failed`, and `cancelled` are terminal states.

### 4. Create Tracking File (optional, user-requested)

Only create a tracking file when the user explicitly asks for one.

If requested:

```bash
tracking_file="${plan_file}.review-tracking.md"
cat > "$tracking_file" <<EOF
---
created: $(date -Iseconds)
plan_file: $plan_file
total_issues: <count>
status: in-progress
---

# Review Tracking: $(basename "$plan_file")

## Issues Found

| # | Severity | Issue Summary | Status |
|---|----------|---------------|--------|
EOF
```

Tracking file status values:
- `open`, `queued`, `running`, `resolved`, `failed`, `deferred`.

### 5. Present Issues One-by-One (1-3-1 Rule)

For each issue found, present using the 1-3-1 format. This is a hard interaction contract.

---

**Issue [N]: [Brief Title]**

**Problem:** [1-2 sentence description of the issue]

**Goal:** [What needs to be resolved/clarified]

| Option | Pros | Cons |
|--------|------|------|
| **1: [Approach 1]** | [Pros] | [Cons] |
| **2: [Approach 2]** | [Pros] | [Cons] |
| **3: [Approach 3]** | [Pros] | [Cons] |
| **4: [All of the above / Hybrid]** | [Pros] | [Cons] |

**Recommendation: Option [N]** — [Brief justification]

How would you like to resolve this?

---

**Wait for user response before proceeding.**

Rules:
- Present exactly one issue at a time.
- Do not present batches of issues unless user explicitly asks for a batch summary.
- Do not claim a total issue count unless it is deterministic.
- Do not ask the same root issue multiple times with different wording.

### 6. Record Decision and Continue

After each user answer:
- Record the selected option in scratchpad decisions.
- Do not edit the plan yet in `review-then-apply` mode.
- Move to the next issue and repeat until all material issues are discussed.

### 7. Apply Accepted Resolutions (Required in review-then-apply)

After the final issue question is answered:
- Apply all accepted resolutions to the passed-in plan file in a single deterministic edit pass.
- Do not introduce extra inferred changes beyond accepted resolutions.
- If subagent tooling is unavailable, fall back to local edits and record fallback in scratchpad.
- Apply timeout + bounded retry for apply operations.
- Default policy: timeout `120s`, retries `1`, retry delay `5s`.

### 8. Report Apply Status

Present concise status to user:

```
Applied: [Brief description of what was applied to <plan_file>]
```

Include a one-line status marker after apply attempt:
- `Applied` (all accepted fixes written)
- `Partially applied` (some fixes failed; list them)
- `Not applied` (analysis-only mode only)
- `Blocked` (apply failed)

### 9. Final Full Reanalysis (After Apply)

When apply phase ends:
- Re-read the updated plan file.
- Verify each accepted decision is reflected.
- Remove resolved/derivative issues from registry.
- If any accepted fix is missing, apply remaining fixes before declaring completion.

### 10. Cleanup

When all issues resolved:

```bash
if [[ -f "$tracking_file" ]]; then
    # Archive tracking file with completion timestamp
    mv "$tracking_file" "${tracking_file%.md}.completed.md"
    echo "Review complete. Tracking archived to: ${tracking_file%.md}.completed.md"
fi

echo "Plan review complete. All issues resolved."
```

Scratchpad cleanup is required at end of run:
- Ask user exactly once: `Delete`, `Archive (.completed)`, or `Keep` scratchpad.
- Apply the selected cleanup action to `${plan_file}.review-scratchpad.md`.

Cleanup ordering rule:
- In `review-then-apply`, cleanup prompt is allowed only after accepted fixes have been applied (or a blocked state is explicitly reported).

If user stops mid-run before final apply:
- Ask user once: `apply-now`, `discard-pending`, or `abort-now`.
- `apply-now`: apply all accepted decisions gathered so far, then proceed to cleanup.
- `discard-pending`: keep discussion only, do not edit, then proceed to cleanup.
- `abort-now`: stop immediately and leave scratchpad in-progress.

## Review Checklist

When analyzing a plan file, verify:

- [ ] Clear objective statement exists
- [ ] Scope is well-defined (what's in/out)
- [ ] Prerequisites are listed
- [ ] Dependencies are identified and ordered
- [ ] Success criteria are measurable
- [ ] Timeline/estimates are realistic
- [ ] Resource requirements are specified
- [ ] Risks are identified with mitigations
- [ ] Decision rationale is documented
- [ ] No undefined acronyms or terms

## Example Issues to Catch

| Issue Type | Example | Better Alternative |
|------------|---------|-------------------|
| Vague scope | "Implement the feature" | "Implement user authentication with email/password login" |
| Missing timeline | "Do this soon" | "Complete by 2026-02-20 (3 business days)" |
| Undefined success | "Make it fast" | "Achieve <100ms response time for 95th percentile" |
| Open-ended | "Consider adding X" | "Decision: Add X (yes/no) - if yes, create follow-up task" |
| Hidden dependency | "Deploy to production" | "Deploy to production (requires: CI tests passing, ops approval)" |

## Anti-Patterns to Flag

| Anti-Pattern | Why It's Bad | How to Fix |
|--------------|--------------|------------|
| "Just do it" instructions | No context, can't verify correctness | Add context and success criteria |
| Circular dependencies | Task A needs B, B needs A | Identify cycle and break with intermediate milestone |
| Infinite scope | "Fix all bugs" | Define specific bugs or time-box the effort |
| Missing decision rationale | "We chose X" | Add "because [specific reason and trade-offs]" |
| Assumed knowledge | "Use the standard approach" | Specify which standard, link to docs |

## Background Subagent Template

When launching updates, use this agent:

```yaml
Name: plan-updater
Model: openai/gpt-5.3-codex
Tools: file-read and file-edit tools available in runtime (for example Read + apply_patch)

Instructions:
You are a precise plan file editor. Your task:
1. Read the plan file at the specified path
2. Apply the user's resolution to address the specific issue
3. Make minimal, targeted edits to resolve the issue
4. Preserve all other content and formatting
5. Return concise status with task id, outcome, and exact changed locations

Constraints:
- Do not restructure the entire file unless necessary
- Preserve existing YAML frontmatter
- Maintain consistent formatting
- If unsure about placement, ask for clarification
- Respect timeout/retry policy from caller
```

## Notes

- Never use AskUserQuestion tool — present issues inline for discussion
- One question at a time — complete resolution before moving to next issue
- Default behavior is review-then-apply; analysis-only must be explicitly requested
- Tracking file is opt-in only (create only when requested)
- Command is idempotent — safe to re-run on same plan file
- File discovery fallback steps must be sequential (no parallel globbing for fallback logic)
- Keep auto-detection bounded to repo-root scope unless user explicitly expands scope
- In `review-then-apply`, complete all issue questions first, then apply accepted fixes in one pass and reanalyze
- Prefer repository-grounded evidence over abstract plan-only assumptions when available
