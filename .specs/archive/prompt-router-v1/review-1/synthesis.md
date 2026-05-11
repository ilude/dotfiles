---
date: 2026-05-11
status: synthesis-complete
---

# Review: Prompt Router V1 Completion

## Review Panel
| Reviewer | Base Agent | Assigned Expert Persona | Why selected | Adversarial angle | Artifact |
|----------|------------|-------------------------|--------------|-------------------|----------|
| reviewer | reviewer | Completeness & explicitness reviewer | Mandatory standard review for hidden assumptions and /do-it readiness | Assume fresh executor lacks conversation context | `.specs/prompt-router-v1/review-1/reviewer.md` |
| security-reviewer | security-reviewer | Red-team safety/privacy reviewer | Mandatory standard review for secrets, rollback, privacy, operational breakage | Assume evidence/logging leaks sensitive data or rollback is unsafe | `.specs/prompt-router-v1/review-1/security-reviewer.md` |
| product-manager | product-manager | Simplicity and scope reviewer | Mandatory standard review for overbuild and scope mismatch | Assume V1 is bloated beyond PRD-critical runtime behavior | `.specs/prompt-router-v1/review-1/product-manager.md` |
| typescript-pro | typescript-pro | TypeScript extension contract and runtime hook reviewer | Plan changes Pi TypeScript router hooks, route decisions, status/explain | Assume implementers miss same-turn hook and type-contract edge cases | `.specs/prompt-router-v1/review-1/typescript-pro.md` |
| python-pro | python-pro | Python classifier/eval reproducibility reviewer | Plan changes classify/evaluate scripts and fixtures | Assume eval works locally but fails in fresh /do-it due to artifacts or dirty outputs | `.specs/prompt-router-v1/review-1/python-pro.md` |
| qa-engineer | qa-engineer | Verification realism and regression coverage reviewer | Plan relies on tests proving router UX, telemetry, eval, same-turn behavior | Assume greps pass without proving runtime behavior | `.specs/prompt-router-v1/review-1/qa-engineer.md` |
| devops-pro | devops-pro | Automation/readiness and local operational safety reviewer | Plan must run on Windows Git Bash with pnpm/uv/make and archive safely | Assume shell/path/dependency/archive assumptions fail in fresh session | `.specs/prompt-router-v1/review-1/devops-pro.md` |

## Standard Reviewer Findings
### reviewer
- High: Wave 1 listed T1/T2/T3 as parallel despite all touching `pi/extensions/prompt-router.ts` and `pi/tests/prompt-router.test.ts`; this could race in /do-it.
- High: P0 evidence command used bare redirection and did not record cwd, timestamp, exit code, or sanitized summary.
- Medium: Route profile source of truth was too vague.
- Medium: Artifact availability expectations contradicted command gates.
- Medium: Manual validation lacked exact procedure.

### security-reviewer
- High: Broad grep evidence can capture secrets/raw prompts before sanitization.
- High: Rollback lacked a pre-change patch/snapshot and exact owned path set.
- Medium: Telemetry excerpt opt-in lacked setting/default/redaction detail.
- Medium: Manual validation did not require synthetic-only prompts.
- Medium: Provider trust needed fail-closed config validation and visible denied reasons.

### product-manager
- High: Plan risked over-expanding V1 into telemetry rotation, full eval unification, archive ceremony, and docs beyond runtime acceptance.
- High: New `RouteProfileResolution` abstraction could be overbuilt before proving existing `RouteDecision` cannot satisfy V1.
- Medium: Full mode matrix and `shadow_eval.py` retirement may be follow-on unless blocking V1.
- Medium: Telemetry should start with minimal useful fields and no raw prompt.
- Medium: Manual validation should be replaced by command-surface tests where possible.

## Additional Expert Findings
### typescript-pro
- High: One-turn hold was not explicitly tested for expiry/consumption.
- High: Explicit model selection contract was undefined; provider payload could still overwrite user-selected model.
- Medium: `RouteState` needed a strict union, not free-form strings.
- Medium: Same-turn and background telemetry paths needed shared privacy/schema expectations.
- Medium: Need a check preventing helper files at top-level `pi/extensions/*.ts`.

### python-pro
- High: Python eval tests may already be red due `_compute_metrics(..., classifier_name)` signature mismatch; plan needed an owning fix/check.
- Medium: Eval validation currently writes generated docs JSON and can dirty the worktree.
- Medium: Mode-matrix command contradicted allowed non-default artifact failures.
- Low: `shadow_eval.py` grep can pass while script remains active and divergent.

### qa-engineer
- High: Several acceptance checks were grep-only and could pass without runtime behavior.
- High: `/router-status` and `/router-explain` command-surface behavior was deferred to ambiguous manual validation.
- Medium: Same-turn tests needed provider payload assertions across normal, continuation, override, denied fallback.
- Medium: Eval gates allowed unsupported modes to hide missing metrics.
- Medium: Privacy tests needed recursive string scanning, not one sentinel substring.

### devops-pro
- High: Archive step was destructive/ambiguous for resumable /do-it.
- Medium: Some validation commands omitted dependency setup.
- Medium: Shell pipelines/intentional nonzero checks could mask failures.
- Medium: Durable evidence should avoid `/tmp` and use `.specs/.../evidence`.
- Low: Manual validation lacked launch/capture specifics.

## Suggested Additional Reviewers
- typescript-pro -- relevant because router implementation is a Pi TypeScript extension with hook timing/type-contract risks.
- python-pro -- relevant because classifier/eval scripts, artifact availability, and JSONL fixtures are Python-owned.
- qa-engineer -- relevant because the plan's success depends on proving runtime behavior, not just code text.
- devops-pro -- relevant because /do-it needs robust Windows Git Bash commands, evidence, dependency setup, and archive safety.

## Bugs (must fix before execution)
1. Wave 1 dependency race: tasks sharing core router files were marked parallel.
2. Evidence capture was not robust/sanitized enough for /do-it.
3. Default classifier artifact expectations and mode-matrix failure behavior were contradictory.
4. Command-surface and same-turn provider payload behavior were under-tested.
5. Explicit model selection contract was missing.
6. Archive rule could move the active plan destructively.

## Hardening
1. Keep V1 telemetry/eval minimal and defer nonessential rotation/full analytics unless needed for acceptance.
2. Require strict `RouteState` union and profile source-of-truth table/settings.
3. Require recursive telemetry privacy tests and synthetic-only manual prompts.
4. Add top-level extension-file check to avoid accidental auto-discovered helper extensions.
5. Route eval artifacts into `.specs/prompt-router-v1/evidence/`.

## Simpler Alternatives / Scope Reductions
1. Use existing `RouteDecision`/profile mapping minimally before adding a new resolver module.
2. Make default-mode runtime-comparable eval mandatory, but allow non-default modes to report explicit artifact/unsupported reasons.
3. For V1, no excerpts by default; document existing purge path rather than implementing rotation unless tests show no owner.

## Automation Readiness
- Agent-runnable operational steps: improved by serializing shared-file tasks and tightening evidence/eval commands.
- Credential/auth flow clarity: no credentials required; manual Pi session remains local-only with synthetic prompts.
- Evidence and archive gates: hardened to sanitize/scan evidence and copy-first archive.
- Manual-only steps and justification: manual validation remains, but command-surface tests are now required where possible and manual prompts/capture are bounded.
- Checklist: consistent with one item per task/gate/final gate; no boxes marked complete by review.

## Contested or Dismissed Findings
1. Product-manager suggested cutting eval and telemetry substantially. Dismissed as a full cut because the PRD requires eval/telemetry acceptance, but applied as scope reduction: minimal V1 contracts, defer full analytics/rotation.
2. Python non-default mode failures were not treated as must-fix if artifact reasons are explicit; default `t2` remains mandatory.
3. Manual validation exact launch command remains non-blocking because local Pi launch can vary; plan now requires recording the exact command and prefers automated command-surface tests.

## Verification Notes
1. Confirmed parallel race by plan table lines assigning T1/T2/T3 all after V0 while all list overlapping files.
2. Confirmed evidence weakness in P0 command using redirection and later evidence contract requiring cwd/exit/sanitized summary.
3. Confirmed archive ambiguity in Archive rule moving active plan/evidence.
4. Confirmed missing `Execution Status`; added required section.
5. Confirmed plan now has coherent headings and no checked checklist items.

## Reviewer Artifact Status
| Reviewer | Artifact | Status | Notes |
|----------|----------|--------|-------|
| reviewer | `.specs/prompt-router-v1/review-1/reviewer.md` | read | initial write failed; recovered via inline reviewer output and coordinator-written artifact |
| security-reviewer | `.specs/prompt-router-v1/review-1/security-reviewer.md` | read | initial artifact missing despite success; recovered via inline reviewer output and coordinator-written artifact |
| product-manager | `.specs/prompt-router-v1/review-1/product-manager.md` | read | artifact usable |
| typescript-pro | `.specs/prompt-router-v1/review-1/typescript-pro.md` | read | initial artifact missing despite success; recovered via inline reviewer output and coordinator-written artifact |
| python-pro | `.specs/prompt-router-v1/review-1/python-pro.md` | read | artifact usable |
| qa-engineer | `.specs/prompt-router-v1/review-1/qa-engineer.md` | read | artifact usable |
| devops-pro | `.specs/prompt-router-v1/review-1/devops-pro.md` | read | artifact usable |

## Timing Notes
| Step | Duration | Notes |
|------|----------|-------|
| Initial review panel | unknown | 7 reviewers launched; per-reviewer timing unavailable |
| Artifact reads | unknown | all expected artifacts read after targeted recovery |
| Recovery calls | unknown | reviewer, security-reviewer, and typescript-pro artifact recovery needed |
| Verification | unknown | static plan reads/grep; no implementation tests run |
| Synthesis | unknown | `.specs/prompt-router-v1/review-1/synthesis.md` |

## Auto-Apply Plan
- Applied fixes artifact: `.specs/prompt-router-v1/review-1/applied-fixes.md`
- Known-blocker fixes artifact: not run/no prior blockers
- Section integrity check: passed (`grep -n '^## '`, no checked boxes)
- Standalone-readiness result: `STANDALONE READY`
- Repair passes used: 0

## Review Artifact
Wrote full synthesis to: `.specs/prompt-router-v1/review-1/synthesis.md`

## Overall Verdict
**Ready to execute**

## Recommended Next Step
- execute via `/do-it .specs/prompt-router-v1/plan.md`
