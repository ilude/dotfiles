---
name: analysis-workflow
description: "Analyze, validate, debug, troubleshoot, critique, red-team, adversarial, or what-could-go-wrong questions. Not for PR/diff review; use code-review."
---

# Analysis Workflow

## Boundary

| Need | Use |
| --- | --- |
| Debugging, validation, root-cause analysis, red-team critique | `analysis-workflow` |
| Reviewing a diff/branch/PR/commit for findings | `code-review` |
| Logs, metrics, traces, alerts, SLOs | `logging-observability` |
| Failed live mutation | Follow the active repository incident policy |

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
- Retrying without evidence that distinguishes a new hypothesis.
