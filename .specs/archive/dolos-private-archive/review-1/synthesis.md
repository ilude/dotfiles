---
date: 2026-05-12
status: synthesis-complete
---

# Review: Dolos Private Archive Workflow PRD

## Review Panel
| Reviewer | Base Agent | Assigned Expert Persona | Why selected | Adversarial angle | Artifact |
|----------|------------|-------------------------|--------------|-------------------|----------|
| reviewer | reviewer | PRD completeness reviewer | Mandatory standard reviewer for ambiguity and hidden assumptions | Assume `/plan-it` will mis-scope any undefined behavior | `.specs/dolos-private-archive/review-1/reviewer.md` |
| security-reviewer | security-reviewer | Archive/key safety reviewer | Mandatory standard reviewer for secret, archive, and decrypt risk | Assume malicious/corrupt artifacts and unsafe key defaults | `.specs/dolos-private-archive/review-1/security-reviewer.md` |
| product-manager | product-manager | Product/simplicity reviewer | Mandatory standard reviewer for scope control | Assume the MVP is bundling too many workflows | `.specs/dolos-private-archive/review-1/product-manager.md` |
| backend-dev-state-machine | backend-dev | CLI state-machine and archive contract reviewer | Dolos relies on local index/artifact/source transitions | Assume implementers miss stale/no-index/partial-failure states | `.specs/dolos-private-archive/review-1/backend-dev-state-machine.md` |
| devops-pro-git-docker | devops-pro | Git/worktree/Docker build workflow reviewer | PRD changes Git workflows, worktree state, hooks, and Go Docker build | Assume worktree/upstream/build conventions break cross-machine use | `.specs/dolos-private-archive/review-1/devops-pro-git-docker.md` |
| qa-engineer-validation | qa-engineer | Verification realism and regression coverage reviewer | Acceptance criteria must prove archive safety and migration behavior | Assume tests false-pass without real malicious fixtures/Git remotes | `.specs/dolos-private-archive/review-1/qa-engineer-validation.md` |

## Standard Reviewer Findings
### reviewer
- High: `/commit` integration is underspecified across modes and trigger conditions.
- High: Dolos local index schema and update rules are missing.
- High: Git freshness comparison lacks exact refs/edge cases.
- Medium: SSH identity/decryption lookup is not defined.
- Medium: old workflow migration lacks inventory and compatibility decisions.

### security-reviewer
- High: recipient/key authorization model must forbid implicit local-key fallback and validate `.dolos/authorized_keys`.
- High: scratch permissions, cleanup, and logging are not acceptance-tested.
- High: archive bomb/resource-exhaustion limits are missing.
- Medium: atomic promotion/rollback details are incomplete.
- Medium: concurrent pack/unpack and `/commit` race controls are missing.

### product-manager
- High: MVP bundles CLI, build generalization, key handling, tar safety, state model, `/commit`, and migration at once.
- High: minimum operator journeys are not explicit.
- Medium: status predicates and allowed actions need a state table.
- Medium: future multi-archive language invites premature abstraction.
- Medium: `/commit` auto-pack may be premature unless phased or scoped tightly.

## Additional Expert Findings
### backend-dev-state-machine
- High: local index contract needs schema, archive identity, digests, manifest version, and update points.
- High: status state precedence needs a truth table.
- Medium: direct `dolos pack` stale-artifact behavior needs preconditions/force rules.
- Medium: pack/unpack/index atomicity and recovery after interruption are not specified.
- Medium: multi-archive compatibility needs reserved invariants without implementing full multi-archive semantics.

### devops-pro-git-docker
- High: local state must explicitly be per-worktree.
- High: upstream freshness algorithm needs merge-base/upstream details.
- Medium: hook ownership after migration is unclear.
- Medium: `.gitignore`/`.gitattributes` rules for `.dolos` artifacts are missing.
- Medium: build output path must not copy `claude-status-go`'s `~/.claude` install behavior.

### qa-engineer-validation
- High: failed unpack tests must prove live `private/` is unchanged with sentinel files.
- High: malicious tar entry matrix must be acceptance-tested.
- Medium: multi-recipient SSH key tests and malformed `.dolos/authorized_keys` tests are missing.
- Medium: Git freshness tests need real temp remotes/clones.
- Medium: legacy hook/script regression tests must prove no `.encrypted` staging and no unrelated commit age requirement.

## Suggested Additional Reviewers
- backend-dev -- relevant for CLI state transitions, index schema, artifact/source invariants.
- devops-pro -- relevant for Git upstream/worktree behavior, hooks, and Docker build/install conventions.
- qa-engineer -- relevant for proving safety invariants with realistic fixtures and regression tests.

## Bugs (must fix before execution)
1. Define local index schema, update rules, and status state precedence before planning implementation.
2. Define exact Git freshness algorithm and `/commit` mode boundaries before planning integration.
3. Make `.dolos/authorized_keys` mandatory for MVP and specify age SSH identity behavior; remove local public-key fallback from MVP.
4. Add scratch permissions/cleanup, archive resource limits, malicious tar fixtures, and atomic promotion/rollback requirements.
5. Add operator journeys so MVP scope can be planned without conversation context.
6. Specify migration inventory for old `.encrypted` scripts/hooks/tests/docs.
7. Specify build/install output and `.gitignore`/`.gitattributes` behavior for `.dolos` artifacts.

## Hardening
1. Phase MVP into standalone Dolos CLI first, with `/commit` integration as a separate phase but with requirements retained.
2. Add per-worktree state contract and linked-worktree test expectations.
3. Add Dolos lock and pre/post-pack status checks to avoid concurrent operations.
4. Limit future multi-archive support to naming conventions and per-archive index shape; do not implement multiple archives in MVP.
5. Add real temp origin/clone validation requirements for remote freshness behavior.

## Simpler Alternatives / Scope Reductions
1. Treat explicit `status/init/pack/unpack` as Phase 1; defer `/commit` auto-pack to Phase 2 after standalone behavior is validated.
2. Keep MVP single-archive and reject archive names other than `private` even if internal structs use archive IDs.
3. Avoid shared build-tool refactoring unless it is needed to avoid immediate duplication; matching the Docker args/output convention is sufficient.

## Automation Readiness
- Agent-runnable operational steps: PRD is not an execution plan, but it must provide enough precise requirements for `/plan-it`; current gaps are fixable by tightening requirements.
- Credential/auth flow clarity: not ready until `.dolos/authorized_keys` is mandatory and SSH identity lookup/failure behavior is specified.
- Evidence and archive gates: not plan-level yet, but PRD acceptance criteria must require malicious tar, Git remote, hook, and key fixtures.
- Manual-only steps and justification: no manual gate required for PRD readiness; implementation plan can use generated temp keys and fixtures.

## Contested or Dismissed Findings
1. Product suggestion to defer `/commit` entirely was partially accepted: the PRD should phase `/commit` integration but keep it specified because user explicitly wants `/commit` to participate.
2. Multi-archive concerns are hardening, not a must-have feature: the PRD should reserve conventions without implementing multiple archives.
3. Initial reviewer artifact failure was tooling-related; findings were recovered inline and persisted with constrained artifact write.

## Verification Notes
1. Local index gap verified in PRD Requirements: only mentions `git rev-parse --git-path dolos/index.json`, with no schema or update rules.
2. Git freshness gap verified in PRD Functional Requirements: `/commit push` fetch/block behavior lacks merge-base/upstream algorithm.
3. Key model gap verified in PRD Open Questions: local SSH public-key fallback remained open; reviewers recommend making `.dolos/authorized_keys` mandatory.
4. Archive safety test gap verified in Acceptance Criteria: no malicious tar/resource-exhaustion matrix exists.

## Reviewer Artifact Status
| Reviewer | Artifact | Status | Notes |
|----------|----------|--------|-------|
| reviewer | `.specs/dolos-private-archive/review-1/reviewer.md` | read | initial reviewer lacked write tool; inline recovery findings were persisted by coordinator using constrained artifact write |
| security-reviewer | `.specs/dolos-private-archive/review-1/security-reviewer.md` | read | first recovery claimed write but artifact was missing; second recovery wrote usable artifact |
| product-manager | `.specs/dolos-private-archive/review-1/product-manager.md` | read | usable |
| backend-dev-state-machine | `.specs/dolos-private-archive/review-1/backend-dev-state-machine.md` | read | usable |
| devops-pro-git-docker | `.specs/dolos-private-archive/review-1/devops-pro-git-docker.md` | read | usable |
| qa-engineer-validation | `.specs/dolos-private-archive/review-1/qa-engineer-validation.md` | read | usable |

## Timing Notes
| Step | Duration | Notes |
|------|----------|-------|
| Initial review panel | unknown | 5/6 succeeded; per-reviewer timing unavailable |
| Artifact reads | unknown | all expected reviewer artifacts read after targeted recovery |
| Recovery calls | unknown | reviewer inline recovery persisted; security reviewer retried twice due missing artifact |
| Verification | unknown | static PRD/read verification only |
| Synthesis | unknown | `.specs/dolos-private-archive/review-1/synthesis.md` |

## Auto-Apply Plan
- Applied fixes artifact: `.specs/dolos-private-archive/review-1/applied-fixes.md`
- Known-blocker fixes artifact: not run/no prior blockers
- Section integrity check: PRD heading check pending after edits
- Standalone-readiness result: pending
- Repair passes used: 0

## Review Artifact
Wrote full synthesis to: `.specs/dolos-private-archive/review-1/synthesis.md`

## Overall Verdict
**Fix bugs first**

## Recommended Next Step
- Apply the PRD fixes, then hand off to `/plan-it .specs/dolos-private-archive/PRD.md`.
