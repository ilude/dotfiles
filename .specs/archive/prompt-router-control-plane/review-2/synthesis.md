---
date: 2026-05-07
status: synthesis-complete
---

# Review: Provider-Architecture Spike

## Review Panel
| Reviewer | Base Agent | Assigned Expert Persona | Why selected | Adversarial angle | Artifact |
|----------|------------|-------------------------|--------------|-------------------|----------|
| reviewer | reviewer | Completeness & explicitness reviewer | Required standard reviewer | Assume a fresh `/do-it` session has no context | `.specs/prompt-router-control-plane/review-2/reviewer.md` |
| security-reviewer | security-reviewer | Safety/security reviewer | Required standard reviewer | Assume routing can cross trust/credential boundaries unsafely | `.specs/prompt-router-control-plane/review-2/security-reviewer.md` |
| product-manager | product-manager | Simplicity/scope reviewer | Required standard reviewer | Assume proposed architecture is larger than the blocker requires | `.specs/prompt-router-control-plane/review-2/product-manager.md` |
| typescript-pro | typescript-pro | Pi TypeScript extension hook/provider seam reviewer | Routing seam is TypeScript extension/runtime behavior | Assume implementers patch around the hook without proving dispatch ordering | `.specs/prompt-router-control-plane/review-2/typescript-pro.md` |
| qa-engineer | qa-engineer | Same-turn proof and regression harness reviewer | Success depends on a non-false-positive harness | Assume tests can pass while real generation still uses old state | `.specs/prompt-router-control-plane/review-2/qa-engineer.md` |
| devops-pro | devops-pro | Repo automation/worktree execution reviewer | `/do-it` needs repeatable worktree, validation, evidence gates | Assume a fresh session mutates the wrong checkout or skips validation | `.specs/prompt-router-control-plane/review-2/devops-pro.md` |
| ux-researcher | ux-researcher | Router operator/status usability reviewer | Operators need trustworthy status/explain proof | Assume users cannot tell whether routing worked | `.specs/prompt-router-control-plane/review-2/ux-researcher.md` |

## Standard Reviewer Findings
### reviewer
- High: no concrete Pi seam/API or target files/functions are named.
- High: pass condition does not tie observed dispatch parameters to the actual provider invocation.
- Medium: route-decision terms are undefined.
- Medium: awaited-path timeout/failure behavior is missing.
- Medium: exact commands/evidence paths are missing.

### security-reviewer
- High: provider trust boundary, credential availability, and deny-by-default behavior are not carried into the spike.
- High: provider-level evidence schema does not explicitly forbid raw prompts/endpoints/tokens/private paths.
- Medium: timeout, malformed JSON, invalid route, resolver exception, and observer failure behavior are missing.
- Medium: atomicity/rollback is undefined if mutable setters remain.
- Medium: rollback/archive criteria are missing.

### product-manager
- High: spike jumps to a new resolution layer without first checking existing `before_provider_request` hook.
- High: same-turn online classification lacks latency budget and timeout UX.
- Medium: resolver consolidation should be split from feasibility proof.
- Medium: provider-switching semantics are undefined.
- Low: first proof can use a smaller evidence field set.

## Additional Expert Findings
### typescript-pro
- High: exact typed seam contract is absent; current code has `input` and `before_provider_request`, but no stated dispatch-owned route API.
- High: ordering assertion must prove classifier/resolver finish before dispatch starts.
- Medium: atomically passing provider/model/thinking requires an immutable decision object, not separate `setModel`/`setThinkingLevel` mutations.
- Medium: resolver module ownership and production/harness reuse are unspecified.
- Medium: Pi TypeScript validation must include extension typecheck.

### qa-engineer
- High: harness can false-pass by reading stale/global state unless conflicting routes and per-turn decision IDs are used.
- High: timestamps are insufficient; deterministic await-barrier order trace is required.
- Medium: negative tests for classifier/resolver/provider failure are missing.
- Medium: multi-turn/out-of-order classifier completion correlation is missing.
- Medium: status/explain/logs must carry the same decision ID used by dispatch.

### devops-pro
- High: the spike is not an executable plan: target files/functions, discovery commands, validation harness, and gate commands are absent.
- High: worktree guard is absent despite parent plan requiring isolated worktree execution.
- Medium: exact validation commands and unrelated-suite failure handling are missing.
- Medium: evidence schema and archive scan are missing.
- Medium: stop/rollback criteria are missing when no seam exists.

### ux-researcher
- High: no human-readable success signal like `same_turn_applied: true`.
- High: no correlation ID tying status, explain, logs, and dispatch for the exact turn.
- Medium: privacy-preserving operator proof for real prompts is missing.
- Medium: raw/applied differences need controlled reason values.
- Medium: manual smoke checklist lacks expected visible output.

## Suggested Additional Reviewers
- typescript-pro -- relevant because the seam and harness are TypeScript extension/runtime concerns.
- qa-engineer -- relevant because same-turn proof can easily false-pass without deterministic order and negative cases.
- devops-pro -- relevant because worktree isolation, commands, evidence, and archive gates are currently underspecified.
- ux-researcher -- relevant because operator-facing route proof/status must be trustworthy without exposing prompts.

## Bugs (must fix before execution)
1. The artifact is a spike note, not an executable `/do-it` plan: it lacks Objective, Task Breakdown, Execution Waves, Success Criteria, Validation Contract, Execution Checklist, target files/functions, commands, evidence gates, and archive criteria.
2. The seam is undefined: the plan must first compare/discover `before_provider_request` and generation-dispatch seams, then name the exact event/API/file/function or stop with blocker evidence.
3. The same-turn proof can false-pass unless it requires deterministic ordering, conflicting ambient/default/classifier routes, per-turn decision IDs, and actual provider invocation correlation.
4. Safety/privacy behavior is incomplete: provider trust, credential checks, no raw prompt/endpoint/token/private-path evidence, timeout/error fallback, and stale-route prevention must be specified.
5. Atomic dispatch semantics are missing: separate mutable setters cannot satisfy same-turn proof unless replaced by or wrapped in one immutable decision object consumed by dispatch.

## Hardening
1. Add latency budget and timeout UX for awaited classification.
2. Split feasibility proof from resolver/control-plane cleanup.
3. Add controlled `route_resolution_reason` and `same_turn_applied` operator fields.
4. Add multi-turn out-of-order completion and negative failure tests.
5. Add rollback manifest, generated artifact inventory, git status, and raw-prompt/secret scan gates.

## Simpler Alternatives / Scope Reductions
1. First test whether existing `before_provider_request` can provide the awaited same-turn seam before designing a new provider/model resolution layer.
2. Reuse existing router mapping/policy functions for the first proof; defer single-resolver consolidation until same-turn dispatch is proven.
3. Minimize initial proof fields to decision id/hash, decision tuple, dispatch tuple, and deterministic event order; add richer route telemetry later.

## Automation Readiness
- Agent-runnable operational steps: Not ready; the spike lacks concrete commands, target files, and validation gates.
- Credential/auth flow clarity: Not ready; provider trust and missing-credential behavior are absent.
- Evidence and archive gates: Not ready; durable sanitized evidence schema, secret scans, rollback, and archive criteria are missing.
- Manual-only steps and justification: Not ready; manual smoke expected outputs are absent.
- Execution checklist: Missing.

## Contested or Dismissed Findings
1. No targeted rebuttal was run; reviewers were aligned on outcome-changing bugs. No high-severity finding was dismissed.

## Verification Notes
1. Confirmed undefined seam: plan says only “synchronous/awaited pre-generation seam”; code search found `pi.on("before_provider_request")` in `pi/extensions/direct-personality.ts` and `pi/extensions/transcript-provider.ts`, while router uses `pi.on("input")` and `setModel`/`setThinkingLevel` in `pi/extensions/prompt-router.ts`.
2. Confirmed missing executable plan sections by reading `.specs/prompt-router-control-plane/provider-architecture-spike.md`; it contains Problem, Evidence, Proposed architecture, Next validation gate, and Out of scope only.
3. Confirmed TypeScript validation gap: the spike has no `cd pi/extensions && pnpm run typecheck` gate.

## Reviewer Artifact Status
| Reviewer | Artifact | Status | Notes |
|----------|----------|--------|-------|
| reviewer | `.specs/prompt-router-control-plane/review-2/reviewer.md` | read | initial reviewer lacked write tool; recovered with coding-light |
| security-reviewer | `.specs/prompt-router-control-plane/review-2/security-reviewer.md` | read | initial artifact missing despite success preview; recovered with coding-light |
| product-manager | `.specs/prompt-router-control-plane/review-2/product-manager.md` | read | usable |
| typescript-pro | `.specs/prompt-router-control-plane/review-2/typescript-pro.md` | read | usable |
| qa-engineer | `.specs/prompt-router-control-plane/review-2/qa-engineer.md` | read | usable |
| devops-pro | `.specs/prompt-router-control-plane/review-2/devops-pro.md` | read | usable |
| ux-researcher | `.specs/prompt-router-control-plane/review-2/ux-researcher.md` | read | usable |

## Timing Notes
| Step | Duration | Notes |
|------|----------|-------|
| Initial review panel | unknown | 7 reviewers launched; per-reviewer timing unavailable |
| Artifact reads | unknown | 5 usable, 2 missing/unusable before recovery |
| Recovery calls | unknown | reviewer and security-reviewer recovered via coding-light |
| Verification | unknown | used plan read and grep for runtime seams |
| Synthesis | unknown | `.specs/prompt-router-control-plane/review-2/synthesis.md` |

## Auto-Apply Plan
- Applied fixes artifact: `.specs/prompt-router-control-plane/review-2/applied-fixes.md`
- Known-blocker fixes artifact: `not run/no prior blockers`
- Section integrity check: passed
- Standalone-readiness result: STANDALONE READY
- Repair passes used: 1

## Review Artifact
Wrote full synthesis to: `.specs/prompt-router-control-plane/review-2/synthesis.md`

## Overall Verdict
**Fix bugs first**

## Recommended Next Step
- Apply review fixes to convert the spike into an executable plan, then run standalone readiness before `/do-it`.
