# Applied Fix Plan

| Finding | Category | Plan section(s) to edit | Edit intent | Checklist impact |
|---------|----------|-------------------------|-------------|------------------|
| Same-turn routing not gated | Bug | Requirements, Acceptance Criteria, Possible Implementation Details | Add explicit same-turn generation evidence requirement and spike-first gate | None; PRD has no execution checklist |
| Classifier/canonical wire contract undefined | Bug | Requirements, Possible Implementation Details | Define v1 classifier wire contract, mapping location, strict mode validation, artifact compatibility | None |
| Manual override/provider trust ambiguous | Bug | Requirements, Open Questions | Add override hierarchy, stale pin/session behavior, hard safety floors, provider trust/allowlist | None |
| Telemetry privacy unsafe | Bug | Telemetry Requirements, Non-Functional Requirements | Make excerpt logging opt-in/redacted, define hash/excerpt normalization, retention/rotation/purge | None |
| Eval metrics/fixtures underdefined | Bug | Requirements, Acceptance Criteria | Define metrics, mode matrix, continuation fixture coverage, baseline comparison | None |
| Missing implementation context | Hardening | New Implementation Context section | List current files/scripts/logs/tests/eval fixtures and new artifacts | None |
| Scope too broad | Hardening | Goals, Requirements, Possible Implementation Details | Clarify v1 priorities and defer broad analytics/cost calibration | None |
| Naming confusion | Hardening | New Glossary section, FR2, FR4 | Define route size/domain/effort/profile/model/provider/legacy terms and output separation | None |
| Log schema migration | Hardening | Telemetry Requirements | Add versioned schema and backwards parser/ignore rule | None |
| Explain UX examples | Hardening | FR4, Acceptance Criteria | Require one-line summary and example cases | None |
