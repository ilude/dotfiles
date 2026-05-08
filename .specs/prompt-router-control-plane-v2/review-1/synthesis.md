---
date: 2026-05-08
status: synthesis-complete
---

# Review: Prompt Router Control Plane V2 on Awaited Provider Seam

## Review Panel
| Reviewer | Base Agent | Assigned Expert Persona | Why selected | Adversarial angle | Artifact |
|----------|------------|-------------------------|--------------|-------------------|----------|
| reviewer | reviewer, recovered by coding-light | Completeness & explicitness reviewer | Mandatory standard reviewer | Assume hidden prerequisites and vague gates will break `/do-it` | `.specs/prompt-router-control-plane-v2/review-1/reviewer.md` |
| security-reviewer | security-reviewer, recovered by coding-medium | Security/red-team reviewer | Mandatory standard reviewer | Assume evidence/logging leaks or fail-open routing | `.specs/prompt-router-control-plane-v2/review-1/security-reviewer.md` |
| product-manager | product-manager | Simplicity/scope reviewer | Mandatory standard reviewer | Assume the plan is over-scoped for first executable slice | `.specs/prompt-router-control-plane-v2/review-1/product-manager.md` |
| typescript-route-decision-reviewer | typescript-pro | TypeScript route-decision contract and build/toolchain reviewer | Plan changes TS extension routing, shared contracts, and Vitest gates | Assume implementers duplicate types or rely on ambient state | `.specs/prompt-router-control-plane-v2/review-1/typescript-route-decision-reviewer.md` |
| python-classifier-eval-reviewer | python-pro | Python classifier/eval contract reviewer | Plan changes classifier CLI, eval runner, artifacts, hash parity | Assume TS and Python drift or gates invoke nonexistent CLI flags | `.specs/prompt-router-control-plane-v2/review-1/python-classifier-eval-reviewer.md` |
| qa-validation-realism-reviewer | qa-engineer, recovered by coding-light | Validation realism and false-positive gate reviewer | Plan depends on evidence gates and test filtering | Assume tests pass while behavior is unproven | `.specs/prompt-router-control-plane-v2/review-1/qa-validation-realism-reviewer.md` |
| devops-automation-readiness-reviewer | devops-pro | Automation readiness/worktree/archive reviewer | Plan depends on worktree, archive, pnpm/uv/make gates | Assume `/do-it` starts fresh and commands run in wrong tree | `.specs/prompt-router-control-plane-v2/review-1/devops-automation-readiness-reviewer.md` |

## Standard Reviewer Findings
### reviewer
- High: targeted/full test commands were underspecified.
- High: legacy-label audit lacked exact grep/allowlist/fail criteria.
- Medium: classifier artifact/hash inventory lacked a runnable command.
- Medium: manual validation template was referenced but never created.
- Medium: archive grep used `|| true` and lacked scanner failure semantics.

### security-reviewer
- High: archive preflight did not fail closed on matches.
- High: telemetry/evidence permissions were only “best effort.”
- Medium: opt-in excerpts lacked approval, retention, and archive exclusion rules.
- Medium: subprocess timeout/resource limits were missing.
- Medium: provider credential/boundary inventory was missing.

### product-manager
- High: plan scope is large; first slice should avoid accidental platform-project expansion.
- High: eval metrics were not tied to release decisions.
- Medium: evidence capture was too manual.
- Medium: T1 should inventory/reuse existing route definitions first.
- Medium: continuation heuristics and override policy are multiple policy engines; keep sequencing strict.

## Additional Expert Findings
### typescript-pro
- High: `RouteDecision` must move to a shared module, not remain extension-local.
- High: status/explain/log fields need an immutable trace snapshot, not mutable last-state reads.
- High: TS/Python cannot literally import one TS route module; needs language-neutral schema/parity tests.
- Medium: context/override state must be keyed by decision/request ID.
- Medium: targeted tests must be backed by full Pi test gates.

### python-pro
- High: `classify.py --prompt-file` is aspirational against current CLI and would classify the flag text unless implemented.
- High: unknown classifier mode currently falls through to ensemble; plan requires nonzero fail-closed.
- Medium: `evaluate.py --config/--data/--sequences/--json` is aspirational against current CLI.
- High: Python classifier/eval still use legacy labels; parity must be Wave 1, not deferred.
- Medium: Python logging can emit `prompt_excerpt`; privacy must be hardened/disabled before early classifier/eval runs.

### qa-engineer
- High: success criteria were not mapped to exact assertions/spec names.
- High: aspirational commands need command-contract checks before use as gates.
- High: privacy validation was too late.
- Medium: resume ledger needed command history and next safe action.
- Medium: repair loops needed regression/failing-command evidence.

### devops-pro
- High: relative worktree commands could run in the wrong checkout.
- High: archive source was ambiguous between original checkout and worktree.
- Medium: evidence capture lacked command/cwd/timestamp/exit-code wrapper requirements.
- Medium: archive scan excluded plan/review artifacts and used `|| true`.
- Medium: rollback drill was missing.

## Suggested Additional Reviewers
- `typescript-pro` -- route-decision contract, shared module, and Vitest/toolchain risks.
- `python-pro` -- classifier CLI/eval contracts, artifact/hash checks, and TS/Python drift.
- `qa-engineer` -- validation realism, false-positive gates, checklist/resume quality.
- `devops-pro` -- worktree, archive, evidence, and fresh-session automation readiness.

## Bugs (must fix before execution)
1. Worktree/archive execution was unsafe from a fresh session; fixed with `WORKTREE_ROOT`/`ORIGINAL_ROOT` guard, worktree plan-copy gate, and single archive source.
2. Several commands were aspirational (`--prompt-file`, eval flags); fixed by adding command-contract checks and requiring implementation before use as gates.
3. `RouteDecision`/route vocabulary could drift or remain extension-local; fixed by requiring shared TS contract modules plus language-neutral TS/Python parity schema/tests.
4. Privacy checks occurred too late and archive scan failed open; fixed by adding Wave 0 privacy/log-disable preflight and fail-closed archive triage.
5. Checklist did not enumerate all executable gates; fixed by splitting W0, V1, V4, and F5 sub-gates.

## Hardening
1. Added evidence wrapper requirements for command/cwd/timestamp/tool versions/stdout-stderr summary/exit status.
2. Added manual-validation template creation in W0.
3. Added classifier artifact/hash inventory evidence and legacy-label audit evidence.
4. Added timeout/output-size/subprocess cleanup requirements.
5. Added rollback drill with checksums and explicit permission/ACL validation.

## Simpler Alternatives / Scope Reductions
1. Keep V2 sequencing strict: same-turn foundation, canonical route/mode truth, resolver/status, then context/eval/telemetry. Do not expand advanced metrics beyond listed gates unless recorded as `deferred_aggregates` rationale.
2. Reuse provider-spike definitions where possible before creating new modules.

## Automation Readiness
- Agent-runnable operational steps: ready after fixes; commands now start from verified `WORKTREE_ROOT` and include command-contract checks.
- Credential/auth flow clarity: improved; provider inventory must record sanitized availability only and fail closed.
- Evidence and archive gates: ready; evidence wrapper, archive scan semantics, review-artifact copy, and archive source are explicit.
- Manual-only steps and justification: ready; template creation and sanitized expected fields are explicit.
- Execution checklist: ready after split gates and named evidence additions.

## Contested or Dismissed Findings
1. Product-manager recommendation to split out all context/eval/telemetry work was downgraded to hardening/scope discipline, not a blocker, because the plan is intentionally comprehensive and now has stricter sequencing and evidence gates.
2. No targeted rebuttal was needed; findings were convergent and fixes were compatible.

## Verification Notes
1. Confirmed `RouteDecision` currently appears in `pi/extensions/prompt-router.ts`, supporting shared-contract finding.
2. Confirmed `classify.py` references `--classifier` parsing but no `--prompt-file` support in current grep output.
3. Confirmed `evaluate.py` has hardcoded `EVAL_DATA` and grep did not show planned `--config/--data/--sequences/--json` flags.
4. Confirmed existing prompt-routing logs/docs contain `prompt_excerpt` references, supporting early privacy hardening.
5. Confirmed updated plan has required headings exactly once and standalone readiness returned `STANDALONE READY`.

## Reviewer Artifact Status
| Reviewer | Artifact | Status | Notes |
|----------|----------|--------|-------|
| reviewer | `.specs/prompt-router-control-plane-v2/review-1/reviewer.md` | read | initial reviewer lacked write tool; recovered with coding-light |
| security-reviewer | `.specs/prompt-router-control-plane-v2/review-1/security-reviewer.md` | read | initial artifact missing; recovered with coding-medium |
| product-manager | `.specs/prompt-router-control-plane-v2/review-1/product-manager.md` | read | usable |
| typescript-pro | `.specs/prompt-router-control-plane-v2/review-1/typescript-route-decision-reviewer.md` | read | usable |
| python-pro | `.specs/prompt-router-control-plane-v2/review-1/python-classifier-eval-reviewer.md` | read | usable |
| qa-engineer | `.specs/prompt-router-control-plane-v2/review-1/qa-validation-realism-reviewer.md` | read | initial artifact missing; recovered with coding-light |
| devops-pro | `.specs/prompt-router-control-plane-v2/review-1/devops-automation-readiness-reviewer.md` | read | usable |

## Timing Notes
| Step | Duration | Notes |
|------|----------|-------|
| Initial review panel | unknown | 7 reviewers launched; per-reviewer timing unavailable |
| Artifact reads | unknown | all expected reviewer artifacts read after targeted recovery |
| Recovery calls | unknown | reviewer/security/qa artifacts recovered; no full panel rerun |
| Verification | unknown | used grep/read against plan and code |
| Synthesis | unknown | `.specs/prompt-router-control-plane-v2/review-1/synthesis.md` |

## Auto-Apply Plan
- Applied fixes artifact: `.specs/prompt-router-control-plane-v2/review-1/applied-fixes.md`
- Known-blocker fixes artifact: not run/no prior blockers
- Section integrity check: passed
- Standalone-readiness result: STANDALONE READY
- Repair passes used: 2

## Review Artifact
Wrote full synthesis to: `.specs/prompt-router-control-plane-v2/review-1/synthesis.md`

## Overall Verdict
**Ready to execute**

## Recommended Next Step
- execute via `/do-it .specs/prompt-router-control-plane-v2/plan.md`
