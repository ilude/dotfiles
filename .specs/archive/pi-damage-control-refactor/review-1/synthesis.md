---
date: 2026-05-08
status: synthesis-complete
---

# Review: Pi Damage-Control Refactor and Hardening

## Review Panel
| Reviewer | Base Agent | Assigned Expert Persona | Why selected | Adversarial angle | Artifact |
|----------|------------|-------------------------|--------------|-------------------|----------|
| reviewer | reviewer (recovered by coding-light) | Completeness & explicitness reviewer | Mandatory standard reviewer for standalone executability | Assume a fresh `/do-it` session lacks hidden context | `.specs/pi-damage-control-refactor/review-1/reviewer.md` |
| security-reviewer | security-reviewer (recovered by coding-light) | Red-team safety reviewer | Mandatory standard reviewer for safety-critical hook changes | Assume probes/logs accidentally expose real secrets | `.specs/pi-damage-control-refactor/review-1/security-reviewer.md` |
| product-manager | product-manager | Scope/simplicity reviewer | Mandatory standard reviewer for over-engineering and sequencing | Assume the plan overbuilds beyond the proven failure | `.specs/pi-damage-control-refactor/review-1/product-manager.md` |
| qa-engineer | qa-engineer | Verification realism and regression-safety reviewer | Damage-control correctness depends on tests proving pre-execution blocks | Assume tests pass against mocks while runtime path stays broken | `.specs/pi-damage-control-refactor/review-1/qa-engineer.md` |
| typescript-pro | typescript-pro | TypeScript module/runtime and dependency reviewer | Plan splits TS modules and may add YAML dependency | Assume typecheck passes but Pi runtime module resolution fails | `.specs/pi-damage-control-refactor/review-1/typescript-pro.md` |
| devops-pro | devops-pro | Pi runtime rollout and operational safety reviewer | Source/runtime extension copies or symlinks can diverge | Assume repo tests pass while installed Pi loads stale code | `.specs/pi-damage-control-refactor/review-1/devops-pro.md` |

## Standard Reviewer Findings
### reviewer
- Missing executable source-vs-runtime verification despite noting `~/.pi/agent/extensions` may diverge.
- Manual restart/live probe lacks a proof that the new extension version is loaded.
- Parser dependency placement is ambiguous across `pi/extensions` and `pi/tests`.
- Tests must not touch real secret files.
- The plan references `## Execution Status` but omitted the section.

### security-reviewer
- Live smoke against real `.env` is unsafe after a prior failure exposed secrets.
- Existing debug logs could contain prior unredacted incidents and must be quarantined or inventoried without printing.
- New dependency path needs supply-chain/lockfile review.
- Rollback omits docs, lockfiles, and runtime-copied extension files.
- Archive gate lacks diff/log secret scan.

### product-manager
- The plan may overbuild after the parser fix unless it includes go/no-go criteria after the small cleanup.
- Wave 2 modularizes parser code that Wave 3 intends to replace; ordering should be reversed or merged.
- Existing `pi/lib/yaml-mini.ts` may remove the need for a new `yaml` dependency.
- T2 modularization checks are subjective.
- Manual live smoke could be optional unless runtime-path checks indicate risk.

## Additional Expert Findings
### qa-engineer
- Real-rules tests must exercise the Pi adapter/permission handler, not just pure helpers.
- Live secret probes should use synthetic fixtures or test-only blocked paths.
- Debug redaction tests need table-driven fixtures and stdout/stderr assertions.
- Ask-rule tests should inject platform context to be deterministic on Windows/Linux.
- Modularization gates need enforceable dependency/circularity checks.

### typescript-pro
- New relative ESM imports in production extension modules must use runtime-compatible `.js` specifiers.
- Runtime dependency resolution from `~/.pi/agent/extensions` must be proven before adding a YAML package.
- TypeBox validation import path must be specified if used; otherwise use plain type guards.
- Tests need a clear public API strategy after module split.

### devops-pro
- Preflight/final gates must archive realpath/checksum evidence for repo vs runtime files, including new modules.
- Restarted Pi smoke must prove no module-resolution error before safety probes.
- First live probe should be harmless and synthetic, not real `.env`.
- Rollback must cover runtime-copied files.
- Final cleanup should find generated debug logs outside tracked source.

## Suggested Additional Reviewers
- qa-engineer -- selected as verification realism reviewer because the plan's safety claim depends on regression tests catching pre-execution secret-read failures.
- typescript-pro -- selected as module/runtime reviewer because the plan changes ESM module boundaries and package dependencies.
- devops-pro -- selected as runtime rollout reviewer because Pi source files and `~/.pi/agent/extensions` runtime files can diverge.

## Bugs (must fix before execution)
1. Add executable runtime/source preflight and reload verification. Evidence: plan constraints mention runtime copies/symlinks but no task or gate records realpath/checksum/runtime load status.
2. Remove live probes against real secret-bearing `.env`. Evidence: manual validation runs `cat .env >/dev/null` despite the prior incident exposing `.env`.
3. Reorder parser/schema hardening before modular extraction or merge the waves. Evidence: Wave 2 extracts parser modules before Wave 3 replaces the hand-rolled parser.
4. Add `## Execution Status`. Evidence: Validation Contract instructs `/do-it` to update that section, but the plan lacks it.
5. Specify dependency/runtime resolution and ESM `.js` import requirements before adding any new parser package. Evidence: T2/T3 create sibling modules and may add `yaml` without runtime import proof.

## Hardening
1. Prefer reusing `pi/lib/yaml-mini.ts` with schema/type guards before adding a new `yaml` dependency.
2. Add table-driven redaction tests with synthetic secret-looking fixtures and stdout/stderr assertions.
3. Add deterministic platform-injected ask-rule tests.
4. Add a lockfile/dependency-review gate if a new parser dependency is still required.
5. Replace subjective modularization checks (`readable`, `wc -l`) with concrete import/export and duplication checks.
6. Expand rollback/archive cleanup to cover docs, lockfiles, runtime copies, generated logs, and secret scans.

## Simpler Alternatives / Scope Reductions
1. Keep all three options only because the user explicitly requested them, but add a go/no-go checkpoint after Wave 1 so `/do-it` can stop after the minimal hardening path if the remaining work is not justified.
2. Avoid a new YAML dependency unless `yaml-mini` cannot parse the current real rules plus required validation fixtures.
3. Treat manual live smoke as a confidence check after automated and runtime-identity verification, not as the first safety proof.

## Automation Readiness
- Agent-runnable operational steps: not ready until runtime/source preflight, runtime import smoke, and synthetic live-smoke commands are added.
- Credential/auth flow clarity: no credentials required, but real `.env` access must be removed from live probes.
- Evidence and archive gates: need named artifacts for runtime identity, debug-log quarantine, dependency review, and secret-scan results.
- Manual-only steps and justification: Pi restart can remain manual, but the plan must define exact reload/status evidence before any probe.
- Checklist: needs new unchecked items for the preflight task/gate and an `## Execution Status` section.

## Contested or Dismissed Findings
1. Product suggestion to collapse to only small cleanup was not fully applied because the user explicitly requested a plan for all three options. It was converted into a Wave 1 go/no-go checkpoint.
2. `yaml` package addition is not rejected outright; it is downgraded to conditional after checking `pi/lib/yaml-mini.ts` capability.

## Verification Notes
1. Missing `## Execution Status` confirmed with `git grep -n "^## Execution Status" -- .specs/pi-damage-control-refactor/plan.md`, which returned no match.
2. Existing `yaml-mini` confirmed with `git grep -n "parseYamlMini\|yaml-mini" -- pi/lib pi/extensions`; results include `pi/lib/yaml-mini.ts` and `pi/extensions/agent-team.ts` importing it.
3. Runtime/source divergence risk confirmed by `ls -li pi/extensions/damage-control.ts ~/.pi/agent/extensions/damage-control.ts`; current files share an inode in this checkout, but the plan must require this evidence for future sessions.
4. `.js` import convention confirmed by grepping Pi extension imports; examples include `pi/extensions/prompt-router.ts` importing `./transcript-runtime.js`.

## Reviewer Artifact Status
| Reviewer | Artifact | Status | Notes |
|----------|----------|--------|-------|
| reviewer | `.specs/pi-damage-control-refactor/review-1/reviewer.md` | read | initial reviewer lacked write tool; targeted recovery wrote usable artifact |
| security-reviewer | `.specs/pi-damage-control-refactor/review-1/security-reviewer.md` | read | initial artifact missing despite success preview; targeted recovery wrote usable artifact |
| product-manager | `.specs/pi-damage-control-refactor/review-1/product-manager.md` | read | preview ignored; artifact used |
| qa-engineer | `.specs/pi-damage-control-refactor/review-1/qa-engineer.md` | read | preview ignored; artifact used |
| typescript-pro | `.specs/pi-damage-control-refactor/review-1/typescript-pro.md` | read | preview ignored; artifact used |
| devops-pro | `.specs/pi-damage-control-refactor/review-1/devops-pro.md` | read | preview ignored; artifact used |

## Timing Notes
| Step | Duration | Notes |
|------|----------|-------|
| Initial review panel | unavailable | 6 reviewers, 6/6 subagent calls succeeded; per-reviewer timing unavailable |
| Artifact reads | unavailable | all expected reviewer artifacts read after two targeted recovery artifacts |
| Recovery calls | unavailable | reviewer and security-reviewer artifacts recovered with coding-light |
| Verification | unavailable | used `git grep`, import grep, and `ls -li` |
| Synthesis | unavailable | artifact path `.specs/pi-damage-control-refactor/review-1/synthesis.md` |

## Auto-Apply Plan
- Applied fixes artifact: `.specs/pi-damage-control-refactor/review-1/applied-fixes.md`
- Known-blocker fixes artifact: `.specs/pi-damage-control-refactor/review-1/known-blocker-fixes.md` (no prior blockers found)
- Section integrity check: passed after plan rewrite and after standalone repair pass
- Standalone-readiness result: `STANDALONE READY` from `.specs/pi-damage-control-refactor/review-1/standalone-readiness-pass-2.md`
- Repair passes used: 1

## Review Artifact
Wrote full synthesis to: `.specs/pi-damage-control-refactor/review-1/synthesis.md`

## Overall Verdict
**Ready to execute** after auto-applied plan fixes and one standalone-readiness repair pass.

## Recommended Next Step
- Execute via `/do-it .specs/pi-damage-control-refactor/plan.md`.
