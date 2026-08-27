---
name: domain-modeling
description: "Domain-Driven Design (DDD) with Eric Evans concepts: ubiquitous language, concrete domain scenarios, invariants, entity identity and lifecycle, bounded contexts, aggregates, commands, domain events, or context maps. Use when clarifying business behavior or model boundaries. Not for generic API design; use api-design. Not for requirements and acceptance criteria; use planning. Not for broad architecture strategy; use development-philosophy."
---

# Domain Modeling

## Boundary

Use Domain-Driven Design only when demonstrated business or operational complexity would make the solution clearer: meaningful identity or lifecycle, rules spanning operations, related state requiring consistent transitions, conflicting domain terminology, or bounded-context relationships. Use the concepts as thinking tools, not as a required process, document set, architecture, or vocabulary test. Do not use them for low-level query execution, resource lifetime, ordinary validation, error reporting, module placement, or technical concurrency unless those mechanics directly express a larger domain model. Each introduced concept must name the complexity it simplifies; otherwise prefer ordinary functions, types, modules, or database constraints.

Do not require `CONTEXT.md`, ADRs, event storming, repositories, tactical patterns, or artifact writes. Suggest or create an artifact only when the user requests it or another workflow owns it.

## Modeling process

Adapt the depth to the problem. Prefer a few concrete examples over a complete taxonomy.

1. **Start with behavior.** Describe a concrete scenario: who intends what, under which conditions, what state changes, what outcome is observable, and which cases fail. Completion means the scenario exposes the domain decision being modeled.
2. **Align language.** Identify the terms people use, define them in their domain meaning, and record disagreements rather than silently choosing one. Completion means important terms have one usable meaning in the current discussion or an explicit unresolved distinction.
3. **Find rules and lifecycle.** State invariants and permitted transitions. Distinguish things with identity and continuity from values defined by their attributes; locate creation, change, and ending rules with the owner of those rules. Completion means valid and invalid transitions have an accountable owner.
4. **Choose boundaries.** Ask where a rule must be consistent together and who owns the state. Use an aggregate or other consistency boundary only when it explains that need; keep it no larger than necessary. Define a bounded context where a model and its language are coherent, even if the same term means something else elsewhere. Completion means each proposed boundary has a stated consistency, ownership, or language reason.
5. **Describe collaboration.** Use commands for meaningful intent and events for facts that matter to other decisions, only when they clarify the scenario. For bounded contexts, name the relationship, translation, dependency, and ownership of change. Completion means relevant cross-boundary effects and unresolved assumptions are visible; irrelevant event or integration machinery is not added.
6. **Communicate the result.** Explain the chosen model, alternatives rejected, tradeoffs, and open questions in the requested output or existing artifact. Completion means another reader can trace the model back to the scenarios and rules without a new mandatory document.

## Guardrails

- Model behavior and decisions before classes, tables, endpoints, or message schemas.
- Keep one term's meaning local to its bounded context; do not force a universal model across contexts.
- Protect invariants at the boundary that owns them. Prefer models whose values and transitions correspond to valid domain states, but encode stable invariants rather than temporary policy. Do not make an aggregate a graph of every related object or a proxy for a database transaction.
- Treat commands as requests and events as facts. Neither implies a message broker, event sourcing, or eventual consistency by itself.
- Prefer explicit translation between contexts over accidental sharing. Name an upstream, downstream, or other relationship only when it helps explain change and dependency.
- If the domain does not need a DDD construct, say so and use the simpler model.

## Optional reference

Read [Tactical DDD reference](tactical-reference.md) only when code-level patterns or tactical terminology are specifically useful.

## Sources

- [Eric Evans, Domain-Driven Design Reference](https://www.domainlanguage.com/wp-content/uploads/2016/05/DDD_Reference_2015-03.pdf)
- [Domain Language DDD resources](https://domainlanguage.com/ddd/)
- [Domain Language strategic design overview](https://domainlanguage.com/ddd/strategic-design/)
