# Applied Fix Plan

| Finding | Category | Plan section(s) to edit | Edit intent | Checklist impact |
|---------|----------|-------------------------|-------------|------------------|
| Missing operator journeys | Bug | Users / Jobs, new Operator Journeys | Add concrete fresh-clone, edit-pack, pull-update, divergence, and init journeys | None; PRD has no execution checklist |
| Index/status underspecified | Bug | Requirements, Acceptance Criteria | Add local index schema, update rules, state precedence table requirement | None |
| Git freshness underspecified | Bug | Requirements, Acceptance Criteria | Add exact upstream/merge-base algorithm, no-upstream/fetch-failure behavior, `/commit` phase boundaries | None |
| Key model ambiguous | Bug | Requirements, Risks, Open Questions | Make `.dolos/authorized_keys` mandatory, remove fallback, define identity lookup and `--identity` | None |
| Archive/scratch safety gaps | Bug | Non-Functional Requirements, Acceptance Criteria | Add scratch permissions/cleanup, resource limits, malicious tar matrix, atomic promotion | None |
| Migration inventory unclear | Bug | Requirements, Acceptance Criteria, Plan Handoff | Inventory scripts/hooks/docs/tests and define wrapper/removal expectations | None |
| Build/artifact rules unclear | Bug | Requirements, Acceptance Criteria | Specify repo `bin/dolos(.exe)` output and `.gitignore`/`.gitattributes` requirements | None |
| Scope too broad | Hardening | Goals, Requirements, Non-Goals | Phase standalone CLI before `/commit`; keep `/commit` specified as phase 2 | None |
| Multi-archive premature abstraction | Hardening | Non-Goals, Requirements | Keep MVP single-archive; reserve naming/index shape only | None |
| Worktree/concurrency gaps | Hardening | Requirements, Non-Functional Requirements, Acceptance Criteria | Add per-worktree state, locks, linked-worktree expectations | None |
