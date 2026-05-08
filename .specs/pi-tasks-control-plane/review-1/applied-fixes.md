# Applied Fix Plan

| Finding | Category | Plan section(s) to edit | Edit intent | Checklist impact |
|---------|----------|-------------------------|-------------|------------------|
| Unresolved core semantics | Bug | Goals, Requirements, Open Questions | Decide defaults for storage, deletion, auto-cascade, skipped, stop semantics | PRD branch; no execution checklist required |
| Over-scoped MVP | Bug | Goals, Requirements, Phasing, Acceptance Criteria | Split MVP/Phase 2/Phase 3 and make upstream parity non-goal | PRD branch; no execution checklist required |
| Output/metadata security policy missing | Bug | Non-Goals, Security/Data Safety, Acceptance Criteria | Define redaction, retention, prompt-injection boundaries, and tests | PRD branch; no execution checklist required |
| Schema migration/data-integrity vague | Bug | Requirements, Data Model Decisions, Acceptance Criteria | Define schema version strategy, state transitions, dependency invariants, delete/tombstone behavior | PRD branch; no execution checklist required |
| Vague verification | Bug | Acceptance Criteria, Final Verification | Name target test files and commands | PRD branch; no execution checklist required |
| Tool schema/runtime registration not verified | Bug | Tool Contract, Acceptance Criteria | Add explicit schemas and mocked ExtensionAPI registration tests | PRD branch; no execution checklist required |
| Pi TypeScript module boundaries | Hardening | Implementation Boundaries | Name top-level extension entrypoint and helper locations | PRD branch; no execution checklist required |
| UX defaults and warning behavior | Hardening | UX Contract | Define default modes, priority ordering, nudge defaults, warnings, orphan flow | PRD branch; no execution checklist required |
| Widget fallback | Hardening | UX Contract, Phasing | Separate mandatory pure renderer from optional widget adapter | PRD branch; no execution checklist required |
| Concurrency/locking tests | Hardening | Data Model Decisions, Acceptance Criteria | Add partial-write/concurrent-writer coverage | PRD branch; no execution checklist required |
| Mutation/idempotency contracts | Hardening | Data Model Decisions, Tool Contract | Define typed outcomes and idempotency guidance | PRD branch; no execution checklist required |
