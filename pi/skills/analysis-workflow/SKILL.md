---
name: analysis-workflow
description: "Analysis, diagnosis, adversarial critique, or coding mechanism selection, including routine edits. Not for diff review, architecture design, planning, or routine edit consistency."
---

# Analysis Workflow

## Boundary

| Need | Use |
| --- | --- |
| Analysis, diagnosis, root-cause investigation, or adversarial critique | `analysis-workflow` |
| Evidence-based reuse and minimal solution selection | `analysis-workflow` |
| Reviewing a diff, branch, PR, or commit | `code-review` |
| Module, interface, seam, dependency, or structural design | `architecture-design` |
| Requirements, acceptance criteria, or implementation planning | `planning` |
| Routine edits to existing code | `least-astonishment` |
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

## Conditional References

For a hard or recurring bug, nondeterministic failure, performance regression, unclear reproduction path, or investigation requiring temporary instrumentation, read [Diagnosing bugs](diagnosing-bugs.md). Use the short process above for straightforward failures.

When selecting an implementation after analysis, including a routine edit that reaches a mechanism choice, first complete comprehension and caller-flow inspection, then read [Solution selection](solution-selection.md) for evidence-based reuse and minimal implementation. This does not transfer routine diff consistency to this skill or structural ownership from `architecture-design`.

For a security-primary design or review, read [Security analysis](security-analysis.md) and apply its threat, secret, validation, and least-privilege checks.

## Debugging questions

- What exact input and state reproduce the problem?
- Which layer first differs from expected behavior?
- What changed?
- What evidence would disprove the leading explanation?
