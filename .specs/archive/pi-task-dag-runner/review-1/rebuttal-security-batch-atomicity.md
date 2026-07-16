---
reviewer: security
status: complete
finding_count: 1
---

# Findings

- severity: high
  category: "durability / execution integrity"
  confidence: high
  evidence: "Rationale: `createTask()` writes a task, then `maintainReverseEdges()` separately rewrites blockers (`pi/lib/task-registry.ts`). A crash or I/O failure leaves a batch prefix. `listTasks()` has no batch state, and `isTaskReady()` executes any pending task whose present blockers are complete; a prefix root can therefore execute after restart. Staged rollback cannot survive process death, and reconciliation without a durable pre-write marker cannot distinguish a prefix from valid single-task creation. A narrower promise documents, but does not prevent, unsafe execution. Removing batch creation is smallest code-only option but defeats the objective."
  required_fix: "Before T1, make batch publication fail closed: write a durable journal/manifest before any batch record; tag records with its batch ID; exclude uncommitted batches from list/readiness/execution; atomically mark committed only after all task and reverse-edge writes; and on startup roll back uncommitted records plus recorded reverse-edge preimages (or rebuild those edges). Test crashes before and between record and reverse-edge writes, proving no incomplete task is ready/executable. If this recovery scope is rejected, remove same-call batch creation; do not retain the durable mixed-DAG guarantee."
