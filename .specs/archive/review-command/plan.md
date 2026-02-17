---
created: 2026-02-17
status: in-progress
---

# Plan: /review Command for OpenCode

## Objective
Create a slash command `/review` that uses GPT-5.3-Codex to review plan files for issues, ambiguities, and unclear instructions.

## Decisions Log (ALL RESOLVED ✓)

| Q# | Decision | Status |
|----|----------|--------|
| Q1 | Model: openai/gpt-5.3-codex | ✓ |
| Q2 | Location: opencode/commands/review.md | ✓ |
| Q3 | Detection: Explicit arg + auto-detect fallback | ✓ |
| Q4 | Updates: Background subagent after each answer | ✓ |
| Q5 | Output: In-place updates + inline explanation | ✓ |
| Q6 | Presentation: One-by-one + optional tracking file | ✓ |

## Implementation Notes
- Must follow 1-3-1 rule for presenting issues
- Must NOT use AskUserQuestion tool
- Should use parallel background subagents when scope warrants
- Should launch background tasks to update files after questions answered
- Use latest GPT-5.*-Codex model (gpt-5.3-codex selected)

## Status

**COMPLETED ✓**

All questions answered, command created at:
- `opencode/commands/review.md`

The command will be available system-wide after next dotbot install (or immediately if `~/.config/opencode` is already symlinked).

## File Location

- Command: `opencode/commands/review.md`
- Symlinked via: `install.conf.yaml` line 28 (`~/.config/opencode: opencode`)
- Scratch pad: `.specs/review-command/plan.md` (this file)

## Quick Test

```bash
# Test auto-detect
cd .specs/archive/onyx
/review

# Test explicit path
/review .specs/archive/onyx/plan.md
```
