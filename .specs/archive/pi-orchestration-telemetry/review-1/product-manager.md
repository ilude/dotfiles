---
reviewer: product-manager
status: complete
finding_count: 4
---

# Findings

- severity: high
  category: decision-outcome mismatch
  confidence: high
  evidence: "Severity rationale: the stated decision cannot be made from the promised MVP. Objective says to compare direct versus delegated work and determine whether delegation saves Fable/Opus API spend and Sol context, but Explicit Deferrals reject matched cohorts and causal evaluation; T6 only prints an observational caveat; Success Criteria 1 validates one delegated smoke run, not a direct comparison, savings calculation, or decision threshold."
  required_fix: "Choose one falsifiable MVP outcome: either narrow Objective and Success Criteria to descriptive accounting of direct versus delegated observations, or add a minimal comparison contract with matched inputs, normalized cost basis, and a defined savings/context rule. Do not retain language that implies the observational report determines savings while causal evaluation is deferred."

- severity: high
  category: scope inflation
  confidence: high
  evidence: "Severity rationale: T6 is a reporting product substantially broader than the follow-up decision need. Its description requires collection diagnostics, direct/delegated counts, cost, bytes, token breakdowns, p50/p95 latency, concurrency overlap, status quality, orphan/pending handling, friction classification joins, and tables by two model dimensions; the Objective only requires models, fan-out, bytes, tokens, latency, cost, and a deterministic report."
  required_fix: "Make T6 MVP report only direct versus delegated counts, parent/worker usage and known/unavailable cost, fan-out, bytes, and one latency summary, with deterministic ordering. Defer friction classification, quality distributions, concurrency-overlap formula, per-model tables, and orphan/pending analytics unless each is tied to an explicit user decision or acceptance test."

- severity: medium
  category: duplicated infrastructure
  confidence: medium
  evidence: "Severity rationale: T1 expands the existing task registry solely to preserve a second normalized copy of worker usage, while T3/T4 also emit that same usage into the existing metrics stream. T1 explicitly adds processedTokens, contextPeakTokens, turns, costUsd, and costSource to TaskUsage and persists them on completed, failed, cancelled, and unexpected-error paths; the Objective requires telemetry events, not richer /tasks records."
  required_fix: "Keep the smallest usage correction needed to produce accurate orchestration events. Prefer accumulating the normalized usage in the existing execution state and emitting it from T3/T4; only extend TaskUsage fields that are required by the existing /tasks user outcome or prove that event emission cannot access them. Remove persistence-path and legacy-compatibility work that does not affect the telemetry report."

- severity: medium
  category: low-value lifecycle work
  confidence: high
  evidence: "Severity rationale: T5 imports the existing workflow-friction lifecycle but adds interaction telemetry for every eligible top-level interaction and T6 joins every report to reviews.jsonl. The stated decision is spend/context comparison; the plan's own Alternatives already rejects a new collector because friction lifecycle reuse is sufficient, and Explicit Deferrals exclude causal evaluation, making classifications and the task-execute counting repair ancillary to the MVP outcome."
  required_fix: "Retain only the smallest interaction correlation hook needed to identify direct versus delegated usage and parent model totals. Move friction classification joins and the unrelated task-execute subagent-count repair to a follow-up unless a success criterion demonstrates that they change the routing/spend decision."
