# Role-specific concerns and review status

This index preserves the distinctions between the eight review perspectives. The consolidated ID list is authoritative for the complete candidate set; these notes prevent role context and status evidence from being flattened into an approval signal.

## Review provenance

| Source review | Role-specific emphasis | Status evidence retained |
| --- | --- | --- |
| `api-ux.md` | Callable schemas, project-agent discoverability, action-specific task inputs, error envelopes, background handles, and artifact combinations. | Findings are high-value, both, or quick-win candidates; not approved. |
| `candidate-synthesis.md` | Consolidation and deduplication across the review set. | Defines the S/U/Q/M/T recommendation IDs archived in [findings](findings.md). |
| `flexibility.md` | API shape, internal unions, result classification, shared capability predicates, task contracts, and legacy projections. | Findings are proposed seams and compatibility cautions; not approved. |
| `maintainability.md` | Monolith boundaries, process supervision, rendering duplication, broker transport, workflow contracts, and task-registry seams. | Large/medium/small effort and regression-risk judgments are preserved in the consolidated evidence. |
| `orchestration-internals.md` | Effective mutation authority, stable routing, bounded phase concurrency, output limits, background completion, reload state, and broker RPC deadlines. | Safety and resilience gaps remain unresolved research. |
| `safety.md` | Shell-only scope escapes, trusted discovery, dependency/workspace isolation, reverse-edge persistence, lifecycle indirection, release retry, and unused exports. | Containment findings are unresolved and must not be weakened by simplification. |
| `task-lifecycle.md` | Startup pruning, dependency graph integrity, atomicity, tombstones, timestamps, malformed records, workspace guards, and lifecycle ownership. | Persistence and lifecycle concerns remain open; no migration decision was made. |
| `tests.md` | Ambient identity isolation, deterministic process fixtures, scope wiring, transition tables, redaction behavior, prose assertions, and fixture organization. | T1 is **confirmed**; T2 and T3 are **confirmed gaps**; T4 is a **confirmed rule issue**; T5 is a **preference**. These labels describe review evidence, not approval. |
| `workflow-ux.md` | Direct delegation ergonomics, read-only intent, task correlation, task recovery, background status, typed workflow disclosure, retrieval, and renderer consistency. | Product/workflow tradeoffs remain unresolved, including the intentional coordinator-only task correlation boundary. |

## Cross-cutting unresolved concerns

- Do not merge durable task lifecycle with live subagent process lifecycle.
- Do not infer mutation authority from prompts or caller-declared capabilities alone; preserve effective-tool checks, canonical leases, command-tool removal, and direct path enforcement.
- Do not bypass trusted project-agent discovery, confirmation, workspace checks, authenticated tree admission, role/depth limits, cancellation ordering, or deferred advanced-tool activation.
- Do not replace runtime validation with provider schemas alone, delete legacy durable fields without migration evidence, or turn partial persistence into a generic success/failure result.
- Do not treat a candidate ID as a commitment. A future implementation would need a fresh source review, explicit scope, and contract-specific validation.

## Status vocabulary

- **Candidate research** - a proposed improvement retained for later evaluation.
- **Confirmed** - the reviewer reported direct evidence for the condition.
- **Confirmed gap** - the reviewer reported missing coverage or an unprotected seam.
- **Confirmed rule issue** - the reviewer reported a test or policy-boundary mismatch.
- **Preference** - a maintainability or presentation preference, not a demonstrated defect.

## Related notes

- [Consolidated findings](findings.md)
- [Cloudflare and Astro issue triage](../cloudflare-astro-issue-triage.md)
