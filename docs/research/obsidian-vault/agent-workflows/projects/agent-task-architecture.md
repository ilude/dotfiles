---
status: archived-research
source: ../../../../../.tmp/research/agent-task-architecture/report.md
archived: 2026-08-27
---

# Durable agent task architecture (archived research)

> Archived research captured on 2026-08-22. This is context, not an approved roadmap or implementation commitment.

## Why this matters

Long-horizon reliability is not provided by a larger context window or durable memory alone. A task system must preserve goals, dependencies, attempts, artifacts, validation evidence, and repair history while distinguishing worker completion from acceptance.

## Findings

- SQLite is a strong candidate for a single-host Pi control plane because it can provide atomic multi-record transitions, dependency queries, referential integrity, attempt history, evidence linkage, recovery, and cross-session projections. It is useful for those forces, not because SQL, GoF patterns, or SOLID inherently make agents reliable.
- The useful domain model separates goal and immutable goal revisions, plan, bounded task and acceptance criteria, typed dependencies (`requires`, `verifies`, `conflicts-with`, `supersedes`), run, leased attempt, artifact with provenance, rerunnable validation, observation, blocker, and explicit repair that preserves the prior plan.
- A candidate local design is normalized SQLite state plus an append-only transition/event table in the same transaction; domain repositories and a Unit of Work; explicit lifecycle/DAG rules; ready, blocked, stale-evidence, abandoned-attempt, and root-completion projections; optimistic versions and idempotency keys; WAL, foreign keys, bounded busy timeouts, short transactions; and one service per Pi process. External effects need durable intents and receipts with reconciliation, not an unprovable exactly-once claim.
- Existing references cover different slices: LangGraph is closest to resumable agent graphs; Temporal best explains workflow/run/attempt semantics but is too operationally heavy locally; Prefect is a heavier middle ground; Dagster is strong on artifact lineage; Airflow has mature DAG semantics but the wrong interactive scheduler model; OpenHands persists coding sessions but not dependency graphs; SWE-agent separates execution from evaluation; AutoGen and CrewAI provide coordination abstractions without equivalent durability and acceptance layers. A long-running Claude harness reinforces explicit requirements, progress, Git history, incremental work, and end-to-end checks.
- Research separates task horizon, context length, and system memory. Horizon Gap, HORIZON, and MemoryArena report that planning, memory, and interdependent multi-session failures become more important as horizons increase. ReAct, Reflexion, LATS, Voyager, environment-grounded benchmarks, SayCan, and LLM-Modulo support interleaved observation, typed feedback, procedural skills, external verification, executable affordances, and verifier-checked proposals.

## What it solves and does not solve

SQLite can make local state authoritative and transactional, enforce dependencies and uniqueness, support readiness and evidence queries, and retain transition history without one-file-per-record coordination. It does not solve goal drift, bad decomposition, evidence quality, unsafe external retries, prompt injection in stored content, multi-host consensus, high availability, fairness, priority, cancellation, retry limits, or premature completion unless those are separately modeled and enforced.

## Adoption gates and current relevance

As of 2026-08-27, this remains a research candidate relevant to Pi's local workflow-control-plane direction, not a selected architecture. Prototype only if the boundary stays one host and a local filesystem. Before adoption, failure-injection and concurrency tests should show that acknowledged tasks do not disappear; invalid transitions and dependency cycles are rejected; abandoned attempts recover; required descendants and validations block root closure; retries reconcile duplicate-effect risk; stale validation cannot close changed work; backup/restore works; and representative concurrency has no surfaced busy errors. Compare startup and readiness queries materially against the current filesystem approach. Escalate to a workflow engine if multi-host workers, durable timers, compensation, high availability, or deterministic replay become central.

## KISS recommendation

Do not build a generic workflow DSL, distributed scheduler, graph database, or full event-sourced replay engine. If repeated pain justifies a reversible slice, first prototype the smallest single-host SQLite schema and state transitions with failure-injection tests, preserving the current filesystem boundary until the evidence supports promotion.

## Primary sources

- [SQLite appropriate uses](https://sqlite.org/whentouse.html), [WAL](https://sqlite.org/wal.html), [isolation](https://sqlite.org/isolation.html), [foreign keys](https://sqlite.org/foreignkeys.html), and [backup API](https://sqlite.org/backup.html)
- [LangGraph persistence](https://docs.langchain.com/oss/javascript/langgraph/persistence)
- [Temporal workflows](https://docs.temporal.io/workflow-definition) and [activities](https://docs.temporal.io/activities)
- [Prefect tasks and states](https://docs.prefect.io/v3/concepts/tasks) and [states](https://docs.prefect.io/v3/concepts/states)
- [Dagster assets](https://docs.dagster.io/guides/build/assets) and [runs](https://docs.dagster.io/guides/operate/runs)
- [Anthropic long-running harness](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)
- [Horizon Gap survey](https://arxiv.org/abs/2608.06663), [HORIZON](https://arxiv.org/abs/2604.11978), and [MemoryArena](https://arxiv.org/abs/2602.16313)
- [ReAct](https://arxiv.org/abs/2210.03629), [Reflexion](https://arxiv.org/abs/2303.11366), [LATS](https://arxiv.org/abs/2310.04406), and [Voyager](https://arxiv.org/abs/2305.16291)
- [SWE-bench](https://arxiv.org/abs/2310.06770), [SWE-agent](https://arxiv.org/abs/2405.15793), [AgentBench](https://arxiv.org/abs/2308.03688), [WebArena](https://arxiv.org/abs/2307.13854), [OSWorld](https://arxiv.org/abs/2404.07972), [tau-bench](https://arxiv.org/abs/2406.12045), [AgentDojo](https://arxiv.org/abs/2406.13352), and [LLM-Modulo](https://arxiv.org/abs/2402.01817)

## Related notes

- [Durable task dependency systems](../workflow-ideas/durable-task-dependency-systems.md)
