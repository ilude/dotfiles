---
name: orchestration
description: "On-demand delegation guidance. Use when deciding whether to delegate or split independent work. Not for direct focused work."
---

# Orchestration

**Auto-activate when:** deciding whether to delegate, divide work, or review discovery findings.

## Decision table

| Situation | Action |
| --- | --- |
| One coherent task | Work directly; let the prompt router select model and effort. |
| Fable, Opus, or gpt-5.6-sol at xhigh on complex repository work | Assess whether a meaningful parallel split exists. |
| gpt-5.6-sol at medium effort | Delegate only when the split is clearly beneficial. |
| 2+ independent workstreams | Delegate useful independent assignments; parallelize only independent work. |
| Serial stages of one task | Work directly; do not delegate merely to create a chain. |
| Cross-specialty task | Delegate the specialty boundary. |
| Independent verification needed | Assign a separate verifier. |
| Discovery would consume substantial main context | Delegate discovery. |
| Broad investigation | Delegate focused discovery when it improves coverage or preserves main context. |
| Live incident or failed mutation | Keep diagnosis and recovery direct; delegate only bounded read-only investigation or independent verification. |

## Assignment

Give each delegation a focused scope and requested result.

## Evidence ownership

Subagent reports are advisory. The parent must directly verify critical plan semantics, destructive scope, live state, endpoint health, and completion evidence before acting or reporting success. Never use a subagent summary as the sole basis for a live mutation.
