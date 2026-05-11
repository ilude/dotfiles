---
date: 2026-05-07
status: synthesis-complete
---

# Review: Prompt Router Control Plane and Context-Aware Routing V1

## Review Panel
| Reviewer | Base Agent | Assigned Expert Persona | Why selected | Adversarial angle | Artifact |
|----------|------------|-------------------------|--------------|-------------------|----------|
| reviewer | coding-light recovery | Completeness and explicitness reviewer | Standard review role; original reviewer lacked write tools | Assume `/do-it` starts fresh and cannot infer missing evidence/harness details | `.specs/prompt-router-control-plane/review-1/reviewer.md` |
| security-reviewer | coding-light recovery | Security/red-team reviewer | Standard review role; original artifact missing | Assume logs/manual evidence/rollback leak or miss state | `.specs/prompt-router-control-plane/review-1/security-reviewer.md` |
| product-manager | product-manager | Scope and simplicity reviewer | Standard review role | Assume V1 is over-scoped relative to control-plane need | `.specs/prompt-router-control-plane/review-1/product-manager.md` |
| typescript-pro | typescript-pro | Pi TypeScript extension type/build contract reviewer | Plan changes extension runtime, TS bridge, config, status/explain, Vitest | Assume string mappings compile while runtime paths drift | `.specs/prompt-router-control-plane/review-1/typescript-pro.md` |
| python-pro | python-pro | Python classifier/eval contract reviewer | Plan changes `classify.py`, eval, logs, artifacts | Assume help commands pass while behavior remains wrong | `.specs/prompt-router-control-plane/review-1/python-pro.md` |
| qa-engineer | qa-engineer | Verification realism and regression coverage reviewer | Plan relies on tests, eval, manual gates, evidence | Assume tests prove snapshots, not actual routing | `.specs/prompt-router-control-plane/review-1/qa-engineer.md` |

## Standard Reviewer Findings
### reviewer
- Same-turn proof lacks concrete harness/API seam and artifact path.
- Evidence convention is too weak for durable `/do-it` resume.
- Invalid classifier-mode behavior conflicts between explicit error, fallback reason, and fail-closed.
- Output schemas and permission behavior are underspecified.
- Eval command is not executable until after implementation.

### security-reviewer
- Rollback manifest and archive preflight omit new files/generated artifacts.
- Manual validation could capture real prompt text or sensitive route metadata.
- Telemetry path, permissions, retention, purge, and excerpt fail-closed behavior need concrete requirements.
- Cross-provider fallback/trust-boundary denial needs hard tests.
- Python failure modes need bounded fail-closed behavior without stale state.

### product-manager
- V1 is too large; continuation/eval/telemetry hardening risk hiding the control-plane fix.
- Same-turn feasibility gate comes too late.
- Resolver/trust abstraction risks speculative buildout.
- Manual validation should be supported by scripted snapshots.
- Existing tests/eval should be inventoried before adding new surfaces.

## Additional Expert Findings
### typescript-pro
- Confirmed: current input hook fires `classifyAndRoute(...).catch(...)` and immediately returns continue, so same-turn route proof must precede behavior work.
- Confirmed: current runtime has `Tier = low|mid|high` and `RuntimeModelSize = small|medium|large`; plan must require one canonical `RouterSize` module.
- Confirmed: classifier invocation/status are inconsistent today (`--classifier t2`, `/router-explain` hardcoded `confgate`).
- Confirmed: default prompt excerpts exist in runtime and classifier failure paths.
- Validation gates need fresh pnpm install/typecheck/test commands consistently.

### python-pro
- Help-only Python verification is false-positive prone.
- Eval metrics need formulas, route order, labels, thresholds, and fixtures.
- Artifact/hash sidecar behavior per mode is missing.
- JSONL parser behavior and hash normalization are underspecified.
- Python commands should use `uv run --project` and real fixtures.

### qa-engineer
- Same-turn failure cannot count as V1 success.
- Tests need named fixture assertions and actual provider/model/thinking instrumentation.
- Continuation/override/provider matrix is missing.
- Eval command needs concrete inputs/golden assertions.
- Manual evidence file/path is required and F3 must not say “or not required.”

## Suggested Additional Reviewers
- typescript-pro -- relevant for Pi extension runtime, TypeScript route contracts, pnpm validation, and hook timing.
- python-pro -- relevant for classifier CLI, artifact integrity, eval metrics, and JSONL reader behavior.
- qa-engineer -- relevant for false-positive acceptance criteria, fixture matrix, evidence, and `/do-it` determinability.

## Bugs (must fix before execution)
1. Same-turn proof is sequenced too late and can be treated as success even when blocked. Required fix: create a first blocking gate that either proves same-turn routing or stops the plan with a separate spike; blocked evidence must not satisfy V1 completion.
2. Verification commands are too weak/placeholder-like (`--help`, generic test file, unspecified eval command). Required fix: define named test/eval commands and fixture assertions up front, using `uv run --project` for Python.
3. The plan lacks durable evidence conventions. Required fix: require evidence fields/artifacts under the spec directory for every gate, manual transcript, same-turn proof/blocker, eval output, and archive preflight.
4. Invalid classifier mode and Python failure behavior are ambiguous. Required fix: define fail-closed semantics for invalid mode, timeout, malformed JSON, unknown labels, nonzero exit, and stale-state prevention.
5. Privacy/rollback/archive controls are incomplete. Required fix: use synthetic prompts, sanitized manual evidence, telemetry path/permissions/rotation/purge requirements, rollback manifest, and generated artifact inventory.

## Hardening
1. Require one exported canonical `RouterSize`/ordering module consumed by extension, classifier adapter, resolver, telemetry, eval, and tests; forbid duplicate route unions outside adapters.
2. Add a preflight inventory task to reuse or retire existing tests/eval paths before adding more surfaces.
3. Constrain V1 resolver to concrete runtime/status fields; defer speculative specialized profiles/trust expansion unless needed for PRD acceptance tests.
4. Add compact fixture matrices for continuation, overrides, provider fallback denial, `nano`, `max`, context-window safety, and failure paths.
5. Normalize every validation gate to run fresh pnpm install/typecheck/test commands.

## Simpler Alternatives / Scope Reductions
1. Recommended V1 slice: same-turn proof, canonical route module/adapter, settings-driven classifier mode, truthful status/explain/log fields, and minimal resolver state. Defer broad eval unification and telemetry hardening if they block the control-plane fix.
2. Replace broad manual validation with a scripted synthetic status/explain snapshot harness plus a smaller manual smoke check.

## Automation Readiness
- Agent-runnable operational steps: not ready until exact named test/eval commands and same-turn harness are added.
- Credential/auth flow clarity: no credentials required, but manual Pi validation must use synthetic prompts and sanitized local evidence.
- Evidence and archive gates: insufficient; needs spec-local evidence paths and generated artifact inventory.
- Manual-only steps and justification: manual steps are justified but too broad and unsafe without a template.
- Execution checklist: present, but must add a first blocking same-turn/preflight task, align dependencies, and add `## Execution Status`.

## Contested or Dismissed Findings
1. Product-manager recommendation to remove all eval/telemetry from V1 was partially downgraded. The PRD explicitly requires unified eval/telemetry, but the plan should stage them after the control-plane proof and make the first slice shippable.
2. Security concern about prompt hashes exposing workflow patterns is hardening, not a must-fix bug, because the existing PRD accepts local JSONL telemetry; concrete path/retention/purge controls are still required.

## Verification Notes
1. Same-turn issue confirmed by `pi/extensions/prompt-router.ts:617-624`: `classifyAndRoute(...)` is fire-and-forget before returning `{ action: "continue" }`.
2. Current vocabulary mismatch confirmed by `pi/extensions/prompt-router.ts:180-199`, which uses `Tier`/`AppliedRoute` not canonical router sizes.
3. Classifier/status drift confirmed by `pi/lib/prompt-router/classifier.ts:125-132` beginning a hardcoded classifier invocation and `pi/extensions/prompt-router.ts:689-693` rendering `Classifier: confgate`.
4. Prompt excerpts confirmed by `pi/extensions/prompt-router.ts:422` and `pi/lib/prompt-router/classifier.ts:153/186/216`.

## Reviewer Artifact Status
| Reviewer | Artifact | Status | Notes |
|----------|----------|--------|-------|
| reviewer | `.specs/prompt-router-control-plane/review-1/reviewer.md` | read | original lacked write tools; recovery artifact used |
| security-reviewer | `.specs/prompt-router-control-plane/review-1/security-reviewer.md` | read | original preview reported wrote but artifact missing; recovery artifact used |
| product-manager | `.specs/prompt-router-control-plane/review-1/product-manager.md` | read | usable |
| typescript-pro | `.specs/prompt-router-control-plane/review-1/typescript-pro.md` | read | usable |
| python-pro | `.specs/prompt-router-control-plane/review-1/python-pro.md` | read | usable |
| qa-engineer | `.specs/prompt-router-control-plane/review-1/qa-engineer.md` | read | usable |

## Timing Notes
| Step | Duration | Notes |
|------|----------|-------|
| Initial review panel | unknown | 6/6 subagents completed; per-reviewer timing unavailable |
| Artifact reads | unknown | four artifacts read initially; two recovered then read |
| Recovery calls | unknown | reviewer and security-reviewer recovered via coding-light |
| Verification | unknown | read/grep static verification used against plan and code |
| Synthesis | unknown | wrote `.specs/prompt-router-control-plane/review-1/synthesis.md` |

## Auto-Apply Plan
- Applied fixes artifact: `.specs/prompt-router-control-plane/review-1/applied-fixes.md`
- Known-blocker fixes artifact: `not run/no prior blockers`
- Section integrity check: passed after plan edits
- Standalone-readiness result: STANDALONE READY after two repair passes
- Repair passes used: 2

## Review Artifact
Wrote full synthesis to: `.specs/prompt-router-control-plane/review-1/synthesis.md`

## Overall Verdict
**Fix bugs first**

## Recommended Next Step
- Apply the review fixes to the plan before execution.
- Then execute via `/do-it .specs/prompt-router-control-plane/plan.md`.
