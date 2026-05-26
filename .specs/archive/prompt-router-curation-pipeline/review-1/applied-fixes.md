# Applied Fix Plan

| Finding | Category | Plan section(s) to edit | Edit intent | Checklist impact |
|---------|----------|-------------------------|-------------|------------------|
| Ambiguous router scoring interface | Bug | Constraints, Automation Plan, T3, Validation Contract, Handoff Notes | Specify v3 ConfGate via `classify.py --classifier confgate`, required weak-label fields, and legacy-router non-use | No new task; T3/V2 updated |
| Underspecified triage/status semantics | Bug | Constraints, T4, Success Criteria, Handoff Notes | Add ordered triage table, reason codes, nullable `accepted_route`, `proposed_route`, and status transition contract | No new task; T4/V2 updated |
| Hidden dependency/network policy | Bug | Constraints, Automation Plan, T2, T5, Validation Contract | Require stdlib HTTP/file access for MVP; no new dependencies unless plan is revised; pin source revisions/URLs where possible; add byte/time/row limits | No new task; T2/T5 updated |
| Output ignore/path/summary safety | Bug | Constraints, Automation Plan, T1, T5, V3, Success Criteria, Validation Contract | Add mandatory gitignore rule, output-dir confinement, summary no-raw-prompts, secret/PII scan, cleanup/list command | No new task; T1/T5/V3/F gates updated |
| Network false-pass risk | Bug | T2, T5, V3, Success Criteria, Validation Contract | Require three real-source-shape fixtures and at least one successful bounded public-source network pull or network-blocked status that prevents archive | No new task; validation gates updated |
| Schema/run manifest gaps | Bug | T1, T2, T3, T4, Success Criteria | Add schema_version, deterministic ID algorithm, source URL/revision/row ID/license URL, run manifest with pipeline/router/config/source metadata | No new task; T1/T2/T3/T4 updated |
| Pytest selector and fixture weaknesses | Hardening | T6, Validation Contract | Require named test files or collection-count checks; raw source fixtures; negative cases | No new task; T6/F gates updated |
| Module layout/CWD ambiguity | Hardening | Constraints, T1, T5, Automation Plan | Prefer single top-level script plus helper modules; commands from repo root; path normalization tests from repo root and project root | No new task; T1/T5 updated |
| Simplicity/scope claim | Hardening | Objective, Success Criteria, Explicit Deferrals | Clarify MVP proves ingestion/triage usefulness only, not model improvement | No new task |
| Missing Execution Status heading | Automation readiness | Plan end | Add `## Execution Status` initialized pending for `/do-it` resume/update | No checklist item added |
