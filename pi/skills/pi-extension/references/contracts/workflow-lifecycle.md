# Interactive Workflow Lifecycle

- Ownership: `/plan-it`, `/review-it`, and `/do-it` are separate skill-backed workflows. Their state-gated tools are active only while the owning workflow can validly call them.
- Planning: `/plan-it` creates one canonical `.specs/{slug}/plan.md`. Record draft and risk, use bounded review only for material risk, apply supported findings, resolve genuine blockers with the operator, and call ready only after deterministic plan validation passes.
- Plan contract: include objective, observable completion evidence, mutation boundaries, executable tasks, real dependencies, validation, retention/archive instructions, and current status. Do not invent scheduler state or duplicate ledgers.
- Review: `/review-it` assesses the supplied artifact. Supported must-fix and necessary clarity repairs apply by default; explicit review-only requests remain non-mutating. Reviewer output is advisory until verified against the artifact and repository.
- Execution: when `/do-it` receives a canonical plan, that plan is the sole execution ledger. Resume from the first unchecked dependency-ready task and update it after each verified result. Do not mirror its checklist into durable tasks unless separately requested.
- Raw work: bounded direct work needs no plan or durable task. Create one root task only when raw work is likely to span compaction, delegation, or delayed continuation.
- Validation: run the smallest checks that directly exercise the completion evidence. A reported command, stale result, or model summary does not substitute for observed validation.
- Archive: activate `plan_archive` only during canonical plan execution. After all tasks and validation pass and status is complete, atomically move the entire spec directory to `.specs/archive/{slug}`. Reject incomplete plans, unsafe paths, and collisions.
- Compatibility: legacy lifecycle stages may be read for restoration, but removed review/adjudication stages are not current workflow gates.
