---
date: 2026-05-12
status: synthesis-complete
---

# Review: Dolos Private Archive Workflow Plan

## Review Panel
| Reviewer | Base Agent | Assigned Expert Persona | Why selected | Adversarial angle | Artifact |
|----------|------------|-------------------------|--------------|-------------------|----------|
| reviewer | reviewer | Completeness & explicitness reviewer | Mandatory plan completeness review | Assume hidden prerequisites break `/do-it` | `.specs/dolos-private-archive/review-2/reviewer.md` |
| security-reviewer | security-reviewer | Archive/key safety reviewer | Mandatory security review | Assume decrypt, logging, and race failures leak or corrupt private data | `.specs/dolos-private-archive/review-2/security-reviewer.md` |
| product-manager | product-manager | Product/scope reviewer | Mandatory simplicity review | Assume the MVP is over-scoped for the core user outcome | `.specs/dolos-private-archive/review-2/product-manager.md` |
| backend-dev-go-state | backend-dev | Go CLI state-machine implementation reviewer | Dolos requires state/index/archive transitions | Assume parallel work diverges on state semantics | `.specs/dolos-private-archive/review-2/backend-dev-go-state.md` |
| devops-pro-git-docker | devops-pro | Git/worktree/Docker automation reviewer | Plan touches Git hooks, worktrees, Docker, metadata | Assume platform and active-hook behavior breaks | `.specs/dolos-private-archive/review-2/devops-pro-git-docker.md` |
| qa-engineer-validation | qa-engineer | Verification realism reviewer | Plan relies on temp repos, generated keys, malicious fixtures | Assume tests false-pass without exact commands | `.specs/dolos-private-archive/review-2/qa-engineer-validation.md` |

## Standard Reviewer Findings
### reviewer
- High: age SSH prerequisite/library decision is not front-loaded.
- High: unpack promotion semantics for existing `private/` are ambiguous.
- Medium: preflight T1 can run in parallel with modifying tasks.
- Medium: migration grep checks can false-pass.
- Medium: repo-local `.dolos` artifact/key policy is unclear.

### security-reviewer
- High: transactional unpack/rollback needs explicit algorithm and tests.
- High: evidence/log hygiene must scan `.specs` outputs for canary/private leakage.
- Medium: `.dolos/authorized_keys` parsing/canonicalization needs stricter contract.
- Medium: pack needs a local/upstream freshness stance.
- Medium: real-repo non-mutating metadata/scan validation should be required after migration.

### product-manager
- High: MVP is too broad and includes Phase 2 `/commit` helper work.
- High: T9 contradicts “Phase 2 deferred.”
- Medium: task slicing by internals creates coordination risk.
- Medium: Docker as blocking gate may be over-specified.
- Medium: opaque single-archive churn needs explicit product acceptance/status UX.

## Additional Expert Findings
### backend-dev-go-state
- High: plan references PRD state table but does not embed a state/transition contract.
- High: T4/T5/T6 parallelism depends on shared transaction semantics not yet defined.
- Medium: crash-point recovery matrix is missing.
- Medium: package boundaries are not specified enough for unit-testability.
- Medium: CLI exit code/output contract is too vague.

### devops-pro-git-docker
- High: `git check-ignore ... || true` can false-pass.
- High: hook install/update behavior is not validated against active hooks.
- Medium: install contract for `bin/dolos` vs checkout-local use is unclear.
- Medium: build script executable bit or `bash` invocation needs explicit handling.

### qa-engineer-validation
- High: legacy migration grep checks need exact negative assertions/allowlist.
- High: end-to-end temp repo smoke lacks a named command/test.
- Medium: malicious archive tests need table-driven constructors and explicit skips.
- Medium: linked worktree state isolation needs a named test.
- Medium: generated keys/scratch/evidence leakage checks need stronger validation.

## Suggested Additional Reviewers
- backend-dev -- Go CLI state-machine and archive contract review.
- devops-pro -- Git/worktree/Docker/hook automation review.
- qa-engineer -- Fixture realism and validation coverage review.

## Bugs (must fix before execution)
1. Make preflight/tool proof a blocking first wave before any modifying work.
2. Remove executable Phase 2 `/commit` integration from this MVP plan; keep it as deferred/backlog unless explicitly requested later.
3. Add age SSH support proof before pack implementation.
4. Embed a state/transition and transaction contract task before pack/unpack/status commands.
5. Define transactional unpack promotion/rollback semantics and crash-point tests.
6. Replace false-passing grep/check-ignore commands with failing assertions and allowlists.
7. Clarify repo-local `.dolos` policy: commit `authorized_keys`, do not generate real artifact from real `private/`, use temp artifacts in tests.
8. Add exact named validation commands/tests for end-to-end temp repo, worktree isolation, active hook install, and evidence hygiene.

## Hardening
1. Make local Go build/test primary and Docker build parity optional unless Docker is available.
2. Add strict `.dolos/authorized_keys` parser/canonicalization/fingerprint summary requirements.
3. Require package boundaries/interfaces for pure state, archive validation, Git/index store, crypto adapter, and CLI.
4. Add real-repo non-mutating `status`/`scan`/metadata validation after migration.
5. Document acceptance of opaque single-archive churn and require status output to explain freshness without binary diff inspection.

## Simpler Alternatives / Scope Reductions
1. MVP should be standalone Dolos (`init/status/pack/unpack/scan`) plus hook no-mutate migration only.
2. `/commit` freshness/auto-pack belongs in a later plan after dogfooding standalone Dolos.
3. Avoid build-system refactoring; support local Go build first, Docker parity second.

## Automation Readiness
- Agent-runnable operational steps: mostly clear after fixes; original plan needed a blocking preflight and exact test commands.
- Credential/auth flow clarity: no real credentials required; generated keys only. Plan must prohibit real `private/` and real key use in tests.
- Evidence and archive gates: adequate after adding evidence hygiene and negative assertions.
- Manual-only steps and justification: no manual gate required; risk remains local/reversible.
- Execution Checklist: needed dependency and T9 removal fixes.

## Contested or Dismissed Findings
1. Security suggestion that `pack` should fetch/check upstream directly was downgraded: MVP removes `/commit` integration and uses local state only; remote freshness remains Phase 2.
2. Docker blocking concern was applied as hardening: retain Docker parity because user requested reuse of existing Docker build pattern, but make local Go validation primary where available.
3. Linked-worktree testing remains in MVP because per-worktree index is a core safety claim, not a Phase 2-only concern.

## Verification Notes
1. T9 contradiction confirmed in plan: Objective says Phase 2 deferred, while Task Breakdown includes T9 as executable Wave 3 work.
2. False-pass checks confirmed in plan: `git check-ignore ... || true` and `git grep ... || true` appear in validation/pass criteria.
3. Preflight dependency bug confirmed in Dependency Graph: T1, T2, T3 were parallel despite T1 preserving WIP before edits.
4. Age prerequisite gap confirmed in Constraints/Handoff: plan says verify age SSH behavior during implementation but has no blocking early task.

## Reviewer Artifact Status
| Reviewer | Artifact | Status | Notes |
|----------|----------|--------|-------|
| reviewer | `.specs/dolos-private-archive/review-2/reviewer.md` | read | usable |
| security-reviewer | `.specs/dolos-private-archive/review-2/security-reviewer.md` | read | usable |
| product-manager | `.specs/dolos-private-archive/review-2/product-manager.md` | read | usable |
| backend-dev-go-state | `.specs/dolos-private-archive/review-2/backend-dev-go-state.md` | read | usable |
| devops-pro-git-docker | `.specs/dolos-private-archive/review-2/devops-pro-git-docker.md` | read | usable |
| qa-engineer-validation | `.specs/dolos-private-archive/review-2/qa-engineer-validation.md` | read | initial artifact missing despite WROTE; targeted recovery succeeded |

## Timing Notes
| Step | Duration | Notes |
|------|----------|-------|
| Initial review panel | unknown | 6/6 returned; per-reviewer timing unavailable |
| Artifact reads | unknown | all expected artifacts read after targeted QA recovery |
| Recovery calls | unknown | one targeted qa-engineer recovery |
| Verification | unknown | static plan reads/grep only |
| Synthesis | unknown | `.specs/dolos-private-archive/review-2/synthesis.md` |

## Auto-Apply Plan
- Applied fixes artifact: `.specs/dolos-private-archive/review-2/applied-fixes.md`
- Known-blocker fixes artifact: not run/no prior blockers
- Section integrity check: pending after edits
- Standalone-readiness result: pending
- Repair passes used: 0

## Review Artifact
Wrote full synthesis to: `.specs/dolos-private-archive/review-2/synthesis.md`

## Overall Verdict
**Fix bugs first**

## Recommended Next Step
- Apply fixes to the plan, then run standalone-readiness before `/do-it`.
