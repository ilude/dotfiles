---
date: 2026-05-07
status: synthesis-complete
---

# Review: Prompt Router Control Plane and Context-Aware Routing PRD

## Review Panel
| Reviewer | Base Agent | Assigned Expert Persona | Why selected | Adversarial angle | Artifact |
|----------|------------|-------------------------|--------------|-------------------|----------|
| reviewer | reviewer (recovered by coding-light) | Completeness and explicitness reviewer | Mandatory standard PRD readiness review | Assume hidden prerequisites and weak verification will block `/plan-it` | `.specs/prompt-router-roadmap/review-1/reviewer.md` |
| security-reviewer | security-reviewer (recovered by coding-light) | Security and operational safety reviewer | Mandatory standard adversarial review | Assume telemetry, overrides, and provider fallback can leak data or bypass safety | `.specs/prompt-router-roadmap/review-1/security-reviewer.md` |
| product-manager | product-manager | Simplicity and scope reviewer | Mandatory standard scope review | Assume v1 is overbuilt and mixes separable products | `.specs/prompt-router-roadmap/review-1/product-manager.md` |
| typescript-pro | typescript-pro | TypeScript runtime contract reviewer | PRD changes TS router types, settings, status/explain, and event timing | Assume legacy route vocab remains inconsistent unless explicitly bounded | `.specs/prompt-router-roadmap/review-1/typescript-pro.md` |
| python-pro | python-pro | Python classifier/eval harness reviewer | PRD changes classifier modes, Python wire schema, eval and artifact compatibility | Assume runtime and eval diverge unless contract boundaries are named | `.specs/prompt-router-roadmap/review-1/python-pro.md` |
| qa-engineer | qa-engineer (recovered by coding-light) | Router validation and regression reviewer | PRD depends on eval, fixtures, and acceptance criteria to prove routing quality | Assume acceptance criteria can pass while real routing regresses | `.specs/prompt-router-roadmap/review-1/qa-engineer.md` |
| ux-researcher | ux-researcher | Operator trust and workflow UX reviewer | PRD changes route vocabulary, overrides, status, and explain UX | Assume users will distrust ambiguous route/output terminology | `.specs/prompt-router-roadmap/review-1/ux-researcher.md` |

## Standard Reviewer Findings
### reviewer
- High: PRD does not decide or gate the runtime integration point, even though same-turn routing may race.
- High: PRD lacks an implementation-context section naming existing files, scripts, schemas, and fixtures.
- Medium: acceptance criteria rely on manual slash commands without deterministic test hooks.
- Medium: legacy compatibility and migration behavior are underdefined.
- Medium: prompt excerpt logging conflicts with privacy requirements.

### security-reviewer
- High: default `prompt_excerpt` can leak secrets even if full prompts are not logged.
- High: stale/manual pins can override safety-sensitive escalation unless precedence and expiry are defined.
- High: provider/model fallback can cross trust boundaries without explicit provider policy.
- Medium: context capsule metadata and append-only JSONL logs need retention, disabling, permissions, and purge controls.

### product-manager
- High: PRD combines control-plane normalization, context routing, telemetry analytics, and eval expansion into one broad v1.
- High: provider/profile mapping is over-specified before same-turn runtime feasibility is proven.
- Medium: telemetry and unified eval exceed what is needed for initial control-plane correctness.
- Medium: continuation hold needs bounded v1 semantics or deferral.

## Additional Expert Findings
### typescript-pro
- High: settings contract for `router.classifier.mode` is not specified as a shared typed source for runtime/status/logs/eval.
- High: canonical-vs-legacy TS boundary types are not explicit enough across `Tier`, `RuntimeModelSize`, model-tier labels, and stats.
- High: current fire-and-forget input routing can log an applied route without proving it served the same turn.
- Medium: telemetry schema mixes old and new contracts without a parser/migration rule.
- Medium: profile resolution contract is incomplete for unavailable `nano`, policy-only `max`, domains, efforts, and pins.

### python-pro
- High: Python wire contract remains `schema_version: 3.0.0` with `model_tier` labels, while PRD introduces canonical route sizes without defining schema ownership.
- High: classifier mode validation must reject invalid modes and avoid implicit ensemble fallback.
- High: eval paths are divergent; PRD must name the unified entrypoint/shared policy boundary.
- Medium: model artifacts/hash sidecars per mode and hash/excerpt normalization are not specified.

### qa-engineer
- High: continuation acceptance checks only one happy path; needs sequence fixture coverage and negative cases.
- High: metrics like catastrophic under-routing and thrash lack mathematical definitions.
- High: status/log acceptance does not prove the generation-time model matched the applied route.
- Medium: privacy fixtures and mode matrix tests are missing.

### ux-researcher
- High: route naming (`core-low`, `core-coding`, `core-general`) risks confusing route, domain, effort, and profile concepts.
- High: manual override hierarchy is unresolved.
- Medium: `/router-explain` needs a plain-language summary and examples, not just raw fields.
- Medium: downgrade intent and unavailable/policy-only route UX need explicit acceptance criteria.

## Suggested Additional Reviewers
- `typescript-pro` -- relevant because the PRD changes TypeScript runtime types, event timing, settings, status, and logs.
- `python-pro` -- relevant because classifier modes, schemas, artifact hashes, and eval scripts are Python-owned.
- `qa-engineer` -- relevant because routing quality is only as strong as the fixtures, metrics, and regression gates.
- `ux-researcher` -- relevant because route vocabulary and overrides are user-facing trust surfaces.

## Bugs (must fix before execution)
1. **Same-turn routing is not a gated requirement.** The PRD acknowledges late model switching as a risk but still accepts status/log evidence. Required fix: add a hard requirement and acceptance criterion proving the applied route is the effective generation route for the same turn, or require a spike before implementation.
2. **Classifier and canonical-route wire contract is undefined.** Python still emits legacy `model_tier` labels, while the PRD introduces canonical route sizes. Required fix: define v1 schema, mapping location, validation, and mode normalization.
3. **Manual override and provider trust precedence are unsafe/ambiguous.** Pins and cross-provider fallbacks lack hierarchy, expiry, allowlist, and safety-floor rules. Required fix: specify override hierarchy, stale-pin behavior, provider trust policy, and status/explain visibility.
4. **Telemetry privacy defaults are unsafe.** `prompt_excerpt` is required by default without redaction or disable rules. Required fix: default excerpt off or redacted, define hash/excerpt normalization, retention, permissions, rotation, and purge controls.
5. **Eval metrics and fixtures are underdefined.** Catastrophic under-routing, over-routing, thrash, cost quality, and continuation sequence results lack exact definitions. Required fix: add metric definitions, mode matrix, sequence fixtures, and baseline comparison requirements.

## Hardening
1. Add an implementation-context section naming current router files, classifier scripts, settings, logs, tests, eval data, and which artifacts are new.
2. Split v1 vs later scope: control-plane normalization and same-turn proof first; bounded context continuation next; analytics/cost calibration later.
3. Add a glossary separating route size, domain, effort, profile, model, provider, and legacy labels.
4. Add log schema migration/backward compatibility requirements for existing logs.
5. Add explain/status example output requirements for normal, continuation hold, unavailable fallback, and manual pin cases.

## Simpler Alternatives / Scope Reductions
1. Make v1 a control-plane and same-turn proof release, not a full context/eval/analytics overhaul.
2. Start with a minimal Codex mapping plus explicit domain fields instead of auto-selecting specialized Codex models before evidence exists.
3. Limit v1 telemetry to debug fields needed to prove route correctness; defer cost, calibration, and aggregate analytics to a follow-on evaluation PRD.
4. Bound `context-continuation-hold` to one turn with explicit cheap/brief override, or defer it until after control-plane truthfulness lands.

## Automation Readiness
- Agent-runnable operational steps: Not applicable for PRD execution, but PRD needs enough implementation context for `/plan-it` to produce commands and tasks without hidden assumptions.
- Credential/auth flow clarity: Must define provider trust/allowlist behavior and avoid logging secrets; no credentialed implementation steps should be inferred yet.
- Evidence and archive gates: PRD acceptance criteria need deterministic test/log evidence names before planning.
- Manual-only steps and justification: Slash-command manual checks should be backed by deterministic tests or log fixtures.

## Contested or Dismissed Findings
1. Product-manager recommendation to split all context continuation out of v1 was partially dismissed: user intent explicitly includes context-aware routing, so synthesis keeps it but requires bounded one-turn v1 semantics.
2. No targeted rebuttal was run; reviewers converged on compatible fixes rather than outcome-changing disagreements.

## Verification Notes
1. Same-turn risk verified against PRD Risk “Model switching applies too late” and current PRD acceptance criteria relying on status/log checks.
2. Classifier contract risk verified against PRD FR1/FR3 and current plan language requiring legacy label translation without schema ownership.
3. Privacy risk verified against Telemetry Requirements including default `prompt_excerpt` plus Non-Functional requirement avoiding full raw prompts only.
4. Override risk verified against FR7 and Open Questions asking whether route pins are separate from Pi `/model` manual selection.

## Reviewer Artifact Status
| Reviewer | Artifact | Status | Notes |
|----------|----------|--------|-------|
| reviewer | `.specs/prompt-router-roadmap/review-1/reviewer.md` | read | initial reviewer lacked write tool; recovered with coding-light |
| security-reviewer | `.specs/prompt-router-roadmap/review-1/security-reviewer.md` | read | initial artifact missing despite success preview; recovered with coding-light |
| product-manager | `.specs/prompt-router-roadmap/review-1/product-manager.md` | read | usable |
| typescript-pro | `.specs/prompt-router-roadmap/review-1/typescript-pro.md` | read | usable |
| python-pro | `.specs/prompt-router-roadmap/review-1/python-pro.md` | read | usable |
| qa-engineer | `.specs/prompt-router-roadmap/review-1/qa-engineer.md` | read | initial artifact missing despite success preview; recovered with coding-light |
| ux-researcher | `.specs/prompt-router-roadmap/review-1/ux-researcher.md` | read | usable |

## Timing Notes
| Step | Duration | Notes |
|------|----------|-------|
| Initial review panel | unknown | 7 reviewers; per-reviewer timing unavailable |
| Artifact reads | unknown | all expected artifacts read after targeted recovery |
| Recovery calls | unknown | 3 targeted recovery reviewers |
| Verification | unknown | read artifacts and PRD sections; no code execution needed for PRD findings |
| Synthesis | unknown | `.specs/prompt-router-roadmap/review-1/synthesis.md` |

## Auto-Apply Plan
- Applied fixes artifact: `.specs/prompt-router-roadmap/review-1/applied-fixes.md`
- Known-blocker fixes artifact: not run/no prior blockers
- Section integrity check: PRD heading integrity checked with `grep -n '^## \\|^### \\|^#### ' .specs/prompt-router-roadmap/PRD.md`
- Standalone-readiness result: not applicable to PRD readiness review; PRD is now ready for `/plan-it` handoff
- Repair passes used: 0

## Review Artifact
Wrote full synthesis to: `.specs/prompt-router-roadmap/review-1/synthesis.md`

## Overall Verdict
**Fix bugs first**

## Recommended Next Step
- Apply PRD fixes, then hand off with `/plan-it .specs/prompt-router-roadmap/PRD.md`.
