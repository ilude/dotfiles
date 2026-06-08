---
name: analysis-workflow
description: "Structured investigation workflow. Use for analyze, validate, debug, troubleshoot, critique, red-team, adversarial checks, or what-could-go-wrong questions. Not for PR/diff code review; use code-review."
---

# Analysis Workflow

**Auto-activate when:** investigating failures, validating claims, debugging behavior, critiquing a design, red-teaming a plan, or answering "what could go wrong?".

## Boundary

| Need | Use |
| --- | --- |
| Debugging, validation, root-cause analysis, red-team critique | `analysis-workflow` |
| Reviewing a diff/branch/PR/commit for findings | `code-review` |
| Logs, metrics, traces, alerts, SLOs | `logging-observability` |

## Core Principle

Structured evidence beats analysis theater. Form hypotheses, test them, and separate observed facts from guesses.

## Practical Steps

1. State the question or failure mode.
2. Gather direct evidence before proposing fixes.
3. List plausible hypotheses and what would falsify each.
4. Run the cheapest decisive check first.
5. Distinguish confirmed facts, likely causes, and unknowns.
6. Recommend the smallest next action backed by evidence.

## Debugging Checklist

- What changed recently?
- Can the issue be reproduced?
- What exact input/state triggers it?
- Which layer first diverges from expected behavior?
- What evidence would disprove the leading theory?

## Anti-Patterns

- Producing long critique without checking evidence.
- Treating correlation as cause.
- Jumping to broad refactors before isolating the fault.
- Reporting risks without probability, impact, or mitigation.

## Quick Reference

If you cannot name the evidence that changed your belief, you are guessing.
