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

## Process

1. State the question, failure, or decision.
2. Gather direct evidence, including a working example at the relevant boundary.
3. List plausible explanations and what would disprove each one.
4. Select the minimum materially different executable slices needed to decide an unresolved question.
5. Run the cheapest decisive check first.
6. Stop when further evidence is unlikely to change the conclusion or next action.
7. Report confirmed facts, likely causes, unknowns, and the smallest evidence-backed next action.

## Conditional References

For hard or recurring bugs, nondeterministic failures, performance regressions, unclear reproduction paths, or investigations requiring temporary instrumentation, read [Debugging](debugging.md).

For security as a primary design concern, read [Security analysis](security-analysis.md).

When selecting an implementation after analysis, including a routine edit that reaches a mechanism choice, first complete comprehension and caller-flow inspection, then read [Solution selection](solution-selection.md). This does not transfer routine diff consistency to this skill or structural ownership from `architecture-design`.

## Questions

- What exact input and state reproduce the problem?
- Which layer first differs from expected behavior?
- What changed?
- What evidence would disprove the leading explanation?
