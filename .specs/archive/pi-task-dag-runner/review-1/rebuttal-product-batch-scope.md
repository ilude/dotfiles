---
reviewer: product-manager
persona: mvp-scope-adjudicator
status: complete
---

# Findings

- category: promised durability versus crash recovery
  severity: must-fix
  severity_rationale: The MVP promises a durable, resumable mixed work graph, not merely a convenient multi-create request. A crash that leaves a subset of new records or asymmetric dependency edges makes the persisted graph misleading and prevents a reliable resume or retry. Deferring recovery while retaining this promise is not an honest MVP boundary.
  evidence: "The plan calls the target 'one optional durable work graph' and says users may choose records for 'persistence, dependencies, resumability' (plan.md:15); its objective promises one batch that creates a dependency graph (plan.md:65), and T1 requires reverse edges to exactly match the requested graph (plan.md:222-229). It nevertheless defers 'Crash-atomic multi-file batch commits' (plan.md:91). The registry writes each task by temp-file rename (pi/lib/task-registry.ts:280-287), then separately rewrites each blocker to maintain blocks (pi/lib/task-registry.ts:300-325). Therefore a process or I/O failure can persist a partial graph despite successful deterministic validation."
  required_fix: "Keep crash-safe batch recovery in MVP, but do not build claims, leases, queues, worker recovery, or a distributed scheduler. Add one registry-local transaction manifest for batch creation: compute the complete forward and reverse-edge target set before mutation; persist a manifest with every affected record's pre-batch image before replacing any task file; on registry initialization and before later registry mutations, detect an unfinished manifest and idempotently restore the exact pre-batch snapshot, then remove the manifest. A successful batch removes the manifest only after all target records are installed. Add injected write/rename-failure tests at each commit phase proving a subsequent registry open restores either the complete pre-batch graph or, on normal completion, the complete requested graph. State that the operation is crash-recoverable rather than cross-process transactional."
  confidence: high

- category: scope classification
  severity: hardening
  severity_rationale: A journal that recovers only batch-creation records is the smallest mechanism needed for the user-facing durable graph outcome. Extending it to generic single-record updates, cross-process execution ownership, automatic scheduling, or crash-resumable in-memory workers does not improve the promised batch outcome and would turn the MVP into scheduler infrastructure.
  evidence: "The explicit deferrals exclude durable claims, leases, self-claiming workers, restartable in-memory queues, autonomous scheduling, and cross-process waiting (plan.md:85-91). The intended workflow is a same-session batch, bounded execute_many, and one await (plan.md:69-78); await expressly handles only same-coordinator active executions (plan.md:73, 499)."
  required_fix: "Amend the deferral and T1 scope to say: batch creation has local crash recovery for registry-file consistency; execution ownership and cross-process scheduling remain deferred. Do not require rollback of already-started workers, durable worker claims, or a general-purpose transaction layer. This preserves the current simplification recommendation while making the word 'durable' true for the only new multi-file mutation."
  confidence: high
