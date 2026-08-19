---
name: analysis-workflow
description: "Analyze, validate, debug, troubleshoot, critique, red-team, adversarial, or what-could-go-wrong questions. Not for PR/diff review; use code-review."
---

# Analysis Workflow

## Boundary

| Need | Use |
| --- | --- |
| Debugging, validation, root-cause analysis, or adversarial critique | `analysis-workflow` |
| Reviewing a diff, branch, PR, or commit | `code-review` |
| Logs, metrics, traces, alerts, or SLOs | `logging-observability` |
| Failed live mutation | The repository incident policy |

## Process

1. State the question, failure, or decision.
2. Gather direct evidence, including any working example that exercises the relevant boundary.
3. List plausible explanations or assumptions and what would disprove each one.
4. If feasibility is unproven, select the minimum materially different executable slices needed to decide it.
5. Run the cheapest decisive check or authorized slice first.
6. Stop when further evidence is unlikely to change the conclusion or next action.
7. Report confirmed facts, likely causes, unknowns, and the smallest evidence-backed next action.

## Conditional Reference

For a hard or recurring bug, nondeterministic failure, performance regression, unclear reproduction path, or investigation requiring temporary instrumentation, read [Diagnosing bugs](diagnosing-bugs.md). Use the short process above for straightforward failures.

## Debugging questions

- What exact input and state reproduce the problem?
- Which layer first differs from expected behavior?
- What changed?
- What evidence would disprove the leading explanation?
