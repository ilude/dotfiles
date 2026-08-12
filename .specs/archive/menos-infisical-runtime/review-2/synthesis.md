---
date: 2026-05-03
status: synthesis-complete
---

# Review: Bring menos deployment into Infisical runtime secret flow

## Review Panel
| Reviewer | Base Agent | Assigned Expert Persona | Why selected | Key area reviewed | Adversarial angle |
|----------|------------|-------------------------|--------------|-------------------|-------------------|
| reviewer | reviewer | Completeness & explicitness reviewer | Mandatory standard reviewer | Assumptions, ambiguity, acceptance testability | Assume an implementer has no prior chat context |
| security-reviewer | security-reviewer | Red-team deployment-secrets reviewer | Mandatory standard reviewer | Secret exposure, rollback safety, auth failure handling | Assume partial failures and secret leakage paths |
| product-manager | product-manager | Scope/simplicity challenger | Mandatory standard reviewer | Over-engineering, scope fit, reuse | Assume complexity will create delivery risk |
| devops-pro | devops-pro | Ansible rollout and operational safety reviewer | Plan is deployment/automation heavy | Check-mode, task ordering, rollback, idempotency | Assume operator mistakes and interrupted deploys |
| qa-engineer | qa-engineer | Verification realism reviewer | Plan relies on many acceptance checks | False-positive validations, deterministic gates | Assume checks pass while behavior is broken |
| python-pro | python-pro | Python utility/toolchain reviewer | New Python utilities are central | Runtime/dependency/tooling contract, CLI verification | Assume script works locally but fails in CI/container |
| backend-dev | backend-dev | Config contract and state-transition reviewer | Plan changes secret source + compose behavior | Key mapping drift, interpolation coupling, migration order | Assume one key mismatch breaks runtime |

## Standard Reviewer Findings
### reviewer
- Wave sequencing is still internally inconsistent (T6 appears under Wave 1 section but depends on Wave 2 tasks).
- Manual/live validation is strong but fallback criteria are weak when staging is unavailable.
- Suggested owner/date columns are helpful but non-blocking.

### security-reviewer
- `--diff` in preflight validation conflicts with secret-bearing workflow and may leak sensitive deltas if guardrails drift.
- Secret-at-rest risk remains inherent to host `.env`; acceptable for scope, but lifecycle controls should be explicit.
- Placeholder validation should be stricter than a small deny-list.

### product-manager
- Some plan complexity can be reduced by tightening sequencing and removing contradictory checks.
- Dependency wording around T5/T6 can confuse execution order.
- Diff-based validation in secret flow should be simplified/removed.

## Additional Expert Findings
### devops-pro
- T6 is misplaced in narrative wave structure versus its dependencies.
- `--check --tags preflight --diff` is operationally risky for secret workflows.
- Redaction policy should be validated by explicit checklist/evidence.

### qa-engineer
- Sequence mismatch around T6 is still a test-planning bug.
- `--diff` with secret-focused tasks is a validation anti-pattern unless globally suppressed.
- Vault-pass verification criteria need more concrete expected behavior.

### python-pro
- Plan validation/examples use `python ...` while repo policy requires `uv` for Python tooling.
- Compose determinism check appears in T4 criteria but is not explicitly bound into T3 preflight task acceptance.

### backend-dev
- T6 placement remains contradictory with T3/T4 dependency.
- Atomic remote replacement behavior should be explicitly proven in acceptance checks.
- Compose config preflight should be explicitly located before compose pull/build in T3 acceptance.

## Suggested Additional Reviewers
- `devops-pro` -- rollout safety, check-mode behavior, and failure recovery are core to this plan.
- `qa-engineer` -- acceptance criteria quality determines whether migration is actually safe.
- `python-pro` -- new Python helper/validation scripts are first-class deliverables and must match repo tooling policy.
- `backend-dev` -- key-contract and compose interpolation coupling can silently break runtime.

## Bugs (must fix before execution)
1. **T6 wave placement is still inconsistent** (HIGH)
   - T6 is listed under the Wave 1 section but depends on T3/T4 and is in Wave 2 dependency graph.
   - Must fix: move T6 entirely into Wave 2 narrative and keep all dependency references consistent.

2. **V2 still uses `--diff` in secret-sensitive preflight flow** (HIGH)
   - Plan simultaneously mandates secret redaction/no-diff on secret-bearing tasks.
   - Must fix: remove `--diff` from V2 preflight command (or explicitly prove global diff suppression for all secret-bearing tasks).

3. **Python command policy mismatch (`python` vs `uv`)** (HIGH)
   - Repo policy states Python tooling uses `uv`; plan examples/checks currently use raw `python`.
   - Must fix: convert plan commands to `uv run python ...` (or policy-aligned equivalent) for T1/T6/V1 checks.

4. **Compose determinism preflight is not explicitly anchored in T3 acceptance** (MEDIUM)
   - T4 references `docker compose config` preflight, but T3 acceptance criteria do not require that task step directly.
   - Must fix: add explicit T3 acceptance criterion that preflight runs `docker compose config` before compose pull/build.

## Hardening
1. Add explicit redaction evidence checklist artifact (e.g., command/output checklist proving no secret values surfaced).
2. Strengthen placeholder/value-quality validation beyond deny-list (format/length/schema assertions for required keys).
3. Add non-live fallback validation path when staging host is unavailable (clearly separated from live gate).

## Simpler Alternatives / Scope Reductions
1. Keep current architecture, but simplify V2 by dropping `--diff` entirely in preflight checks.
2. Reduce ambiguity by collapsing duplicate sequencing statements into a single authoritative dependency table + one wave graph.

## Contested or Dismissed Findings
1. **“Add task owner/date columns”** -- dismissed as non-blocking process improvement, not execution safety bug.
2. **“Host `.env` at-rest is unacceptable”** -- downgraded to hardening: current phase explicitly keeps compose `.env` model.

## Verification Notes
1. **T6 inconsistency confirmed** by direct plan inspection: T6 appears in Wave 1 section while `Depends On: T3, T4` and dependency graph places it in Wave 2.
2. **`--diff` issue confirmed** in V2 command text: `ansible-playbook playbooks/deploy.yml --check --tags preflight --diff`.
3. **Python tooling policy mismatch confirmed** via `AGENTS.md`: “Python tooling uses `uv`”, while plan verification commands use `python ...`.
4. **T3 compose-config gap confirmed** by comparing T3 acceptance criteria vs T4 preflight mention; requirement is implied, not explicitly required in T3 checks.

## Timing Notes
| Step | Duration | Notes |
|------|----------|-------|
| Initial review panel | unknown | 7 reviewers launched in parallel; completed successfully |
| Recovery calls | unknown | compact follow-up prompts used to recover concise findings |
| Verification | unknown | `read`-based verification against plan + `AGENTS.md` |
| Synthesis | unknown | wrote artifact to `.specs/menos-infisical-runtime/review-2/synthesis.md` |

per-reviewer timing unavailable

## Overall Verdict
**Fix bugs first**

## Recommended Next Step
- apply selected review fixes to the plan
- then execute via `/do-it .specs/menos-infisical-runtime/plan.md`
