# Standalone-readiness review

Verdict: **STANDALONE READY**

Review question: Could a brand-new Pi session safely run `/plan-it .specs/pi-tasks-control-plane/PRD.md` with no prior conversation and produce a complete MVP execution plan?

## Blockers

None.

## Hardening

- **hardening** — The PRD references upstream issues/PRs by URL and summarizes the borrowed requirements, but it does not cite exact upstream README line anchors or local file line anchors. This is acceptable for handoff because the product decisions are copied into the PRD, but adding exact source snapshots/line references would reduce re-research during planning.
- **hardening** — The schema/versioning section intentionally delegates the exact `TaskRecordV1 optional fields` vs `TaskRecordV2 migration` choice to `/plan-it`. This is safe because the PRD bounds both acceptable strategies and requires fixture tests, but the planner should make that choice explicitly in the plan.

## Nits

- **nit** — The acceptance criteria use `Pass`/`Fail` labels instead of the planning skill's exact `Expected result` wording. They are still objective and command-verifiable.

## Readiness checklist

- Necessary standalone context: present.
- Cited references and borrowed upstream rationale: present.
- MVP decisions resolved: present.
- Scope boundaries and deferred work: present.
- Assumptions/product constraints: present.
- Acceptance criteria with commands/evidence: present.
- Validation gates: present, including pnpm-only Pi validation.
- Implementation constraints and repo paths: present.
- No `/do-it` execution checklist or task-wave requirements applied: confirmed.
