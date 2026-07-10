---
name: orchestration
description: "On-demand delegation guidance. Use when deciding whether to delegate, split independent work, or synthesize broad investigation artifacts. Not for direct focused work."
---

# Orchestration

**Auto-activate when:** deciding whether to delegate, divide work, or coordinate discovery findings.

## Decision table

| Situation | Action |
| --- | --- |
| One coherent task | Work directly; let the prompt router select model and effort. |
| Fable, Opus, or gpt-5.6-sol at xhigh on complex repository work | Assess whether a meaningful parallel split exists. |
| gpt-5.6-sol at medium effort | Delegate only when the split is clearly beneficial. |
| 2+ independent workstreams | Delegate; parallelize only independent assignments. |
| Serial stages of one task | Work directly; do not delegate merely to create a chain. |
| Cross-specialty task | Delegate the specialty boundary. |
| Independent verification needed | Assign a separate verifier. |
| Discovery would consume substantial main context | Delegate discovery. |
| Broad investigation | Use file-only discovery workers, then one synthesis subagent. |

## Assignment contract

Every delegation states:

- Deliverable
- Scope
- Allowed changes
- Evidence required
- Stop condition

## Artifact pattern

Discovery workers write only their assigned artifacts. The synthesis subagent reads those artifacts, resolves overlaps and gaps, and returns one decision-ready result. Keep implementation direct unless the decision table calls for delegation.
