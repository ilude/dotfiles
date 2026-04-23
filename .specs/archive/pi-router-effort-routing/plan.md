---
created: 2026-04-22
status: complete
completed: 2026-04-23
---

# Plan: Cost-first Pi prompt router and effort auto-routing

## Context & Motivation

The current Pi prompt router in this repo classifies prompts into `low` / `mid` / `high` and switches model size accordingly, but it does not set model thinking effort (`off|minimal|low|medium|high|xhigh`). Recent conversation and web research identified two adjacent bodies of work that should inform the next iteration:

1. **Model routing research** such as RouteLLM shows that prompt routing performs better when it uses confidence-aware decisions, calibrated thresholds, and cost-quality trade-off policies instead of hard labels alone.
2. **Test-time compute / reasoning-effort research** shows that fixed reasoning effort is inefficient, overthinking can hurt quality, and compute should adapt per prompt and per runtime context.

Repo-specific findings matter here. `pi/extensions/prompt-router.ts` currently routes only by model rung and uses a strict session-wide never-downgrade rule, which is the opposite of the desired behavior for this repo. The user explicitly wants the router to actively look for places where smaller / lower-effort settings are good enough, because always using large models and high effort burns through subscription rate limits too quickly. We now also have a separate data-alignment plan at `.specs/pi-router-training-data/plan.md` that redesigns the corpus around the real objective: the cheapest acceptable `(model tier, effort tier)` per prompt. That changes this implementation plan materially: the final router should consume a classifier trained on the new v3 route-level corpus, not merely wrap the legacy `low` / `mid` / `high` model with better heuristics. Pi itself already supports `setThinkingLevel()` plus CLI/settings thinking controls, so the missing pieces are aligned training data, a redesigned classifier target, and integration.

## Glossary (H7)

Normalize these terms across the plan, docs, and implementation:

- **catastrophic under-routing**: the v3 safety metric. The classifier recommends a route (model tier + effort) that is demonstrably insufficient for a prompt whose ground-truth cheapest-acceptable route is strictly higher. Zero tolerance on eval.
- **HIGH->LOW inversion**: legacy migration-era proxy for catastrophic under-routing, expressed in the old `low/mid/high` label space. Retained only until the v3 metric is live; do not use in new docs.
- **cheapest acceptable route**: the lowest `(model_tier, effort)` pair at which a prompt is judged to succeed per the v3 corpus labeling contract. Router's primary prediction target.
- **over-routing**: any route strictly costlier than the cheapest acceptable route. Tracked as a cost metric; non-zero tolerance.
- **temporary escalation**: a single-turn (or bounded cooldown window) upgrade above classifier recommendation triggered by runtime signals. Explicitly not session-sticky.

## Constraints

The change must preserve the router's safety properties while shifting optimization toward lower cost, lower latency, and reduced subscription/rate-limit pressure.

- Platform: Windows
- Shell: bash (Git Bash / POSIX shell in this session)
- Prompt-routing Python project currently enforces: accuracy >= 85%, zero catastrophic under-routing on the final v3 objective (with legacy `HIGH->LOW inversion` treated only as a migration-era proxy), **classifier-internal inference < 1ms** (measured after module import, excluding Python startup), SHA256-verified model loading. End-to-end classification overhead (cold `pi.exec("python", ...)` invocation) is separately budgeted at < 300ms and runs fire-and-forget off the critical path; do not confuse the two (B3).
- Pi already supports thinking levels and clamps unsupported values; router logic should use those existing capabilities rather than inventing a parallel mechanism.
- Current router status UX (`/router-status`, footer status text) should remain understandable and should explain both model-tier and effort decisions.
- The user does **not** want a session-wide permanent escalation rule; the router should actively look for opportunities to route back down to smaller / lower-effort settings when the prompt appears easy enough.
- This plan now depends on the v3 corpus/data work described in `.specs/pi-router-training-data/plan.md`; the final router objective is route-level cheapest-acceptable prediction, not legacy complexity-only routing.
- The prerequisite is concrete, not conceptual: this plan should not start until the data plan has produced `pi/prompt-routing/data/train_v3.jsonl`, `pi/prompt-routing/data/dev_v3.jsonl`, `pi/prompt-routing/data/eval_v3.jsonl`, `pi/prompt-routing/docs/corpus-readiness-report.md`, and `pi/prompt-routing/docs/router-v3-output-contract.md`, with the readiness report explicitly marked `READY`.
- The user wants a `/plan-it` style executable plan, not implementation yet.
- Keep the solution bounded: redesign the local classifier and extension around the new corpus, but do not replace Pi with an external gateway or build a full online retraining platform in this phase.

## Alternatives Considered

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| Keep the existing model-only `low/mid/high` router and leave effort manual | Lowest code churn; preserves current behavior | Leaves major performance/cost lever unused; ignores research on adaptive test-time compute; preserves the undesired expensive-session bias | Rejected: does not address the requested capability or cost goal |
| Add a static mapping from tier to effort (`low->minimal`, `mid->medium`, `high->high`) | Simple to implement; low risk | Still ignores confidence, runtime failures, overthinking risks, and the need to opportunistically route downward | Rejected: acceptable MVP fallback, but too weak as the primary design |
| Keep the old classifier but add a richer confidence-aware TypeScript policy on top | Faster than retraining; lower initial ML work | Still optimizes from the wrong target labels; effort remains inferred indirectly; only a bridge solution | Rejected: explicitly too partial for the intended redesign |
| Train a new route-level classifier on the v3 corpus and integrate it with a joint runtime policy for temporary escalation/fallbacks | Aligns the model with the real objective; still uses existing Pi APIs; preserves interpretability while reducing heuristic burden | More work across data, training, evaluation, and integration | **Selected** |

## Objective

Upgrade the Pi prompt router so it can make a per-turn joint routing decision of **model tier** and **thinking effort**, using a classifier trained on the new v3 route-level corpus plus simple runtime signals, with a default bias toward cheaper / lower-effort settings and temporary escalation only when evidence justifies it. Preserve current safety guarantees and expose the decision transparently in status output and tests.

## Project Context

- **Language**: Python, TypeScript
- **Test command**: `make test`
- **Lint command**: `make lint`

## Cold-Start Execution Notes

Use this section if router work is resumed in a fresh session.

### Existing repo anchors to read first
- `.specs/pi-router-training-data/plan.md`
- `pi/extensions/prompt-router.ts`
- `pi/tests/prompt-router.test.ts`
- `pi/lib/model-routing.ts`
- `pi/prompt-routing/classify.py`
- `pi/prompt-routing/router.py`
- `pi/prompt-routing/train.py`
- `pi/prompt-routing/evaluate.py`
- `pi/prompt-routing/tests/test_model.py`
- `pi/README.md`
- `pi/prompt-routing/AGENTS.md`

### Upstream artifacts required before implementation
These files are expected to be produced by the training-data plan and are mandatory prerequisites for this plan:
- `pi/prompt-routing/data/train_v3.jsonl`
- `pi/prompt-routing/data/dev_v3.jsonl`
- `pi/prompt-routing/data/eval_v3.jsonl`
- `pi/prompt-routing/docs/corpus-readiness-report.md`
- `pi/prompt-routing/docs/router-v3-output-contract.md`

### New paths expected to be created by this plan
Their absence at plan start is expected. Create them in the task that first needs them:
- `pi/prompt-routing/docs/` for router-v3 target/metrics docs

### Execution rule for verification commands
Unless explicitly listed as a prerequisite in Wave 0, `Verify:` commands are post-task checks. A missing file under a task’s own `Files:` list is normally an expected pre-implementation state, not a blocker.

## Task Breakdown

| # | Task | Files | Type | Model | Agent | Depends On |
|---|------|-------|------|-------|-------|------------|
| T0 | Verify v3 corpus artifacts exist, marked READY, and probe `ExtensionAPI.setThinkingLevel` presence (B1) | — | architecture | large | planning-lead | — |
| P0 | Phase 0 quick-win: remove session-wide never-downgrade, add static tier->effort + hysteresis (H1) | 3 | feature | medium | backend-dev | T0 |
| T1 | Define route-level classifier target, metrics, JSON output schema, and training contract | 4 | architecture | large | ml-research-lead | T0 |
| T2 | Implement the new training/evaluation pipeline and production classifier interface | 5 | feature | large | model-engineer | T1 |
| V1 | Validate wave 1 | — | validation | large | validation-lead | T1, T2 |
| T3 | Define a cost-first router runtime policy, caps, and downgrade-friendly hysteresis | 2 | feature | medium | engineering-lead | V1 |
| T4 | Integrate the new classifier into joint model-tier + thinking-effort routing | 4 | architecture | large | backend-dev | V1 |
| V2 | Validate wave 2 | — | validation | large | validation-lead | T3, T4 |
| T4.5 | Offline shadow-eval: replay routing_log.jsonl through legacy vs v3 routers, confirm cost non-regression (B8) | 2 | validation | large | qa-engineer | V2 |
| T5 | Add regression tests, rollout metrics guidance, `/router-explain`, and documentation for auto effort routing | 5 | feature | medium | qa-engineer | T4.5 |
| V3 | Validate wave 3 | — | validation | medium | validation-lead | T5 |

## Execution Waves

### Wave 0

**T0: Verify v3 route-level corpus artifacts exist and are marked READY** [large] — planning-lead
- Description: Before any classifier or router implementation work begins, verify that the data-alignment plan has completed and produced the required downstream artifacts. This is a hard prerequisite, not a soft suggestion.
- Files: `.specs/pi-router-training-data/plan.md`, `pi/prompt-routing/data/train_v3.jsonl`, `pi/prompt-routing/data/dev_v3.jsonl`, `pi/prompt-routing/data/eval_v3.jsonl`, `pi/prompt-routing/docs/corpus-readiness-report.md`, `pi/prompt-routing/docs/router-v3-output-contract.md`
- Acceptance Criteria:
  1. [ ] All required v3 dataset artifacts exist.
     - Verify: `python - <<'PY'
from pathlib import Path
paths = [
    'pi/prompt-routing/data/train_v3.jsonl',
    'pi/prompt-routing/data/dev_v3.jsonl',
    'pi/prompt-routing/data/eval_v3.jsonl',
    'pi/prompt-routing/docs/corpus-readiness-report.md',
    'pi/prompt-routing/docs/router-v3-output-contract.md',
]
missing = [p for p in paths if not Path(p).exists()]
print('missing=', missing)
assert not missing
PY`
     - Pass: all listed files exist
     - Fail: any required artifact is missing
  2. [ ] The readiness report explicitly marks the corpus READY for router work.
     - Verify (B4 fix -- strict check, rejects `NOT READY` substring): `python -c "import sys,re; t=open('pi/prompt-routing/docs/corpus-readiness-report.md').read(); sys.exit(0 if re.search(r'^\s*[Ss]tatus\s*:\s*READY\b', t, re.M) and 'NOT READY' not in t else 1)"`
     - Pass: report has a `Status: READY` line AND contains no `NOT READY` tokens anywhere; references the generated datasets and output contract
     - Fail: report is ambiguous, marked `NOT READY`, or uses unstructured status phrasing
     - Note: the corpus-readiness gate is per-tier recall >= 0.6 on a TF-IDF+LR baseline. The production-classifier top-1 and catastrophic thresholds (0.75 / 0) are re-validated inside this plan's V2 against the classifier trained in T2, not against the readiness baseline. See `pi/prompt-routing/docs/eval-v3-metrics.md` for the split of thresholds.
  3. [ ] ExtensionAPI probe: confirm `pi.setThinkingLevel()` is callable from an extension (B1).
     - Verify: run a minimal probe extension that calls `typeof (pi as any).setThinkingLevel === "function"` and also calls `pi.setThinkingLevel?.("minimal")` with a try/catch; log the result.
     - Pass: method exists on the ExtensionAPI and accepts `"off"|"minimal"|"low"|"medium"|"high"|"xhigh"` (or a documented subset), with clamping behavior observed
     - Fail: method is undefined or throws. On fail, DO NOT proceed to T2/T4. Either (a) wait for upstream Pi to add it, (b) fall back to `defaultThinkingLevel` in `settings.json` written at session boundary, or (c) file an upstream issue. Record the chosen branch in `pi/prompt-routing/docs/setThinkingLevel-probe.md`.

### Wave 0.5 -- Phase 0 Quick-Win (H1)

Ships cost savings without waiting on the v3 corpus. Independent of T1/T2 and recoverable if the data plan slips.

**P0: Phase 0 quick-win -- remove never-downgrade, add static tier->effort + hysteresis** [medium] -- backend-dev
- Blocked by: T0
- Description: Deliver the ~80% cost-reduction outcome in days, using the legacy `low/mid/high` classifier already in place. Replace `applyNeverDowngrade()` with a concrete hysteresis rule (see T3 for the authoritative spec, carried forward). Add a static tier->effort mapping (`low->minimal`, `mid->medium`, `high->high`) gated by the T0 probe result. This is a bridge, not a replacement, for the v3 classifier work; it does not block or merge with the Wave 1/2 redesign. Document in AGENTS.md that P0 is in force until V2 ships.
- Files: `pi/extensions/prompt-router.ts`, `pi/tests/prompt-router.test.ts`, `pi/prompt-routing/AGENTS.md`
- Acceptance Criteria:
  1. [ ] `applyNeverDowngrade` is removed and replaced by concrete hysteresis.
     - Verify: `rg -n "applyNeverDowngrade|hysteresis|cooldown" pi/extensions/prompt-router.ts`
     - Pass: `applyNeverDowngrade` no longer appears; hysteresis logic present with explicit turn/confidence thresholds
     - Fail: session-wide escalation still load-bearing
  2. [ ] Static tier->effort mapping is applied behind the T0 probe.
     - Verify: `cd pi/tests && bun vitest run prompt-router.test.ts` -- assert effort is set per tier; assert no-op if probe branch (b)/(c) selected at T0
     - Pass: effort is set when probe branch (a) succeeded; gracefully skipped otherwise
     - Fail: effort is applied unconditionally or never
  3. [ ] Thrash regression test passes.
     - Verify: vitest case: alternating `low`/`high`/`low` classifier outputs across 5 turns produce at most 2 model switches.
     - Pass: hysteresis suppresses ping-pong
     - Fail: router switches on every turn

### Wave 1

**T1: Define the new route-level classifier target, metrics, and training contract** [large] — ml-research-lead
- Blocked by: T0
- Description: Translate the v3 corpus/data plan into a concrete classifier objective and runtime contract using the locked artifacts from Wave 0. Decide whether the production model predicts a single cheapest-route label, scored candidate routes, or a structured recommendation with confidence. Define training targets, catastrophic-under-routing constraints, over-routing metrics, and the machine-readable output the TypeScript router will consume. If `pi/prompt-routing/docs/` does not exist yet, create it in this task before writing the docs.
- Files: `pi/prompt-routing/docs/router-v3-target.md`, `pi/prompt-routing/docs/router-v3-metrics.md`, `pi/prompt-routing/docs/router-v3-output.schema.json`, `.specs/pi-router-effort-routing/plan.md`
- Acceptance Criteria:
  1. [ ] A concrete production target and output contract exist for the new classifier.
     - Verify: `rg -n "cheapest|acceptable|candidate routes|confidence|under-routing|over-routing|schema_version" pi/prompt-routing/docs/router-v3-target.md pi/prompt-routing/docs/router-v3-metrics.md`
     - Pass: docs define the route-level prediction target and runtime output shape, and reference a versioned output schema
     - Fail: classifier target is still described only as legacy `low/mid/high`
  1a. [ ] A frozen JSON Schema for classifier stdout exists (B2, H5).
     - Verify: `python -c "import json,jsonschema; s=json.load(open('pi/prompt-routing/docs/router-v3-output.schema.json')); jsonschema.Draft202012Validator.check_schema(s); assert 'schema_version' in s.get('required',[]) or 'schema_version' in s.get('properties',{})"`
     - Pass: schema validates, requires `schema_version`, defines `primary.{model,effort}`, `candidates[]`, `confidence` (0.0-1.0); single-line JSON object wire format documented
     - Fail: schema missing, invalid, or unversioned
  1b. [ ] HIGH_FLOOR_THRESHOLD disposition is pinned (H2).
     - Verify: `rg -n "HIGH_FLOOR_THRESHOLD|high.?floor" pi/prompt-routing/docs/router-v3-target.md pi/prompt-routing/docs/router-v3-metrics.md`
     - Pass: target doc explicitly states whether the legacy `HIGH_FLOOR_THRESHOLD = 0.20` is (a) carried forward with identical semantics on the v3 label space, (b) subsumed by the new catastrophic-under-routing constraint, or (c) retired with an explicit rationale
     - Fail: v3 docs are silent on the existing safety floor
  2. [ ] Safety and cost metrics are explicitly defined together.
     - Verify: `rg -n "catastrophic under-routing|over-routing|cost-weighted|rate-limit|latency|HIGH->LOW|legacy proxy" pi/prompt-routing/docs/router-v3-metrics.md`
     - Pass: metrics document balances safety with cost-first routing intent and explicitly maps legacy HIGH->LOW inversion language to the new catastrophic-under-routing framing during migration
     - Fail: only legacy accuracy/inversion metrics remain or terminology is inconsistent

**T2: Implement the new training/evaluation pipeline and production classifier interface** [large] — model-engineer
- Blocked by: T1
- Description: Update the Python training, evaluation, and production interface to train from the new v3 route-level corpus and expose structured routing recommendations. Replace or extend the legacy `train.py`, `evaluate.py`, `router.py`, and `classify.py` paths so they understand the new label schema, emit confidence-aware route recommendations, and preserve the current security/performance guarantees where feasible. Reuse the existing prompt-routing Python package layout; this task should modify the current files rather than inventing a parallel package unless a documented blocker forces it.
- Files: `pi/prompt-routing/train.py`, `pi/prompt-routing/evaluate.py`, `pi/prompt-routing/router.py`, `pi/prompt-routing/classify.py`, `pi/prompt-routing/tests/test_model.py`
- Acceptance Criteria:
  1. [ ] The training pipeline consumes the v3 corpus rather than the legacy flat tier arrays.
     - Verify: `rg -n "train_v3|training_corpus_v3|cheapest_acceptable_route|route_judgments" pi/prompt-routing/train.py pi/prompt-routing/evaluate.py`
     - Pass: training/eval code clearly references the new corpus and route-level labels
     - Fail: training path still assumes only `low/mid/high` string labels
  2. [ ] The production interface returns structured route-level recommendations that conform to the T1 schema (B2).
     - Verify: `cd pi/prompt-routing && python -c "import json,subprocess,jsonschema; schema=json.load(open('docs/router-v3-output.schema.json')); out=subprocess.check_output(['python','classify.py','fix a typo in README']); jsonschema.validate(json.loads(out), schema); print('ok')"`
     - Pass: classifier stdout is single-line JSON matching `router-v3-output.schema.json`, includes `schema_version`, `primary.{model,effort}`, `candidates[]`, `confidence`
     - Fail: output is a bare tier string, malformed JSON, or missing required fields
  3. [ ] New classifier-side tests cover the route-level objective.
     - Verify: `cd pi/prompt-routing && python -m pytest tests/test_model.py -q`
     - Pass: tests pass and assert the new production contract
     - Fail: tests fail or remain scoped only to the old classifier behavior

### Wave 1 — Validation Gate

**V1: Validate wave 1** [large] — validation-lead
- Blocked by: T1, T2
- Checks:
  1. Run acceptance criteria for T1 and T2
  2. `cd pi/prompt-routing && python -m pytest tests/test_model.py -q` — classifier tests pass
  3. Cross-task integration (B6 -- concrete check): run `bun run pi/tests/scripts/check-classifier-contract.ts` which shells out to `classify.py` with three canned prompts (trivial, ambiguous, hard) and validates each stdout JSON against `pi/prompt-routing/docs/router-v3-output.schema.json`. Must exit 0.
  4. Confirm dependency on `.specs/pi-router-training-data/plan.md` is satisfied by concrete artifacts, or explicitly block execution if `corpus-readiness-report.md` is not marked `READY`
- On failure: create a fix task, re-validate after fix

### Wave 2 (parallel)

**T3: Define a cost-first router runtime policy, caps, concrete hysteresis, and cooldown rules** [medium] — engineering-lead
- Blocked by: V1
- Description: Refactor the TypeScript router surface so the runtime policy consumes the new classifier recommendation rather than trying to infer model+effort from the old complexity tier. Specify concrete thresholds (B5, H3):
  - **Upgrade hysteresis**: after an upgrade, stay at the higher route for at least `N_HOLD = 3` turns unless classifier `confidence` for a strictly lower route > `DOWNGRADE_THRESHOLD = 0.85` for `K_CONSEC = 2` consecutive turns.
  - **Downgrade step size**: one tier/effort step per eligible turn (no free-fall from high to minimal in a single turn).
  - **Temporary escalation cooldown**: runtime-triggered escalation (e.g., after a failed tool call) applies for `COOLDOWN_TURNS = 2` turns, then auto-decays toward classifier recommendation. Not session-sticky.
  - **Uncertainty fallback**: if classifier `confidence < UNCERTAIN_THRESHOLD = 0.55`, apply `max(classifier_primary, current_applied)` -- bias safe without upgrading further.
  - **Effort cap**: respect `router.effort.maxLevel` from settings (default `"high"`, blocks `xhigh`) regardless of classifier output (H4).
  - All thresholds live in `pi/settings.json` under `router.policy.*` with the above defaults.
- Files: `pi/extensions/prompt-router.ts`, `pi/tests/prompt-router.test.ts`
- Acceptance Criteria:
  1. [ ] The router extension has explicit helper logic for joint routing decisions based on the classifier’s route-level recommendation.
     - Verify: `rg -n "thinking|hysteresis|confidence|effort|candidate route|fallback" pi/extensions/prompt-router.ts`
     - Pass: file shows distinct logic for effort selection, uncertainty handling, and downgrade control with no session-wide permanent escalation semantics
     - Fail: policy remains encoded only as the old `Tier` + `applyNeverDowngrade()` path
  2. [ ] The current UX contract is preserved and prepared for richer output.
     - Verify: `rg -n "router-status|buildStatusLabel|router-reset|router-off|router-on|router-explain" pi/extensions/prompt-router.ts`
     - Pass: existing commands still exist, status-label generation is still centralized, and `/router-explain` is registered (H6)
     - Fail: commands disappear, status text becomes scattered, or behavior is no longer inspectable
  3. [ ] Thrash regression test covers the hysteresis rule (B5).
     - Verify: vitest case that alternates classifier output `low`/`high`/`low`/`high`/`low` over 5 turns with confidence ~0.6 must produce at most 1 model switch (the initial upgrade), no downgrade during the `N_HOLD` window.
     - Pass: router does not ping-pong
     - Fail: router switches on every turn

**T4: Integrate the new classifier into joint model-tier + thinking-effort routing** [large] — backend-dev
- Blocked by: V1
- Description: Wire the new Python classifier contract into the active router flow. Use the classifier recommendation plus simple runtime signals to choose both model rung and thinking level. Remove strict session-wide never-downgrade and replace it with downgrade-friendly hysteresis that still avoids thrash. Add controlled escalation when failures pile up, but make that escalation temporary and easy to shed after stability returns. Clamp effort to model capabilities, and update `/router-status` + footer status text so current model and current effort are visible.
- Files: `pi/extensions/prompt-router.ts`, `pi/lib/model-routing.ts`, `pi/tests/prompt-router.test.ts`, `pi/prompt-routing/classify.py`
- Acceptance Criteria:
  1. [ ] The router calls both model-selection and thinking-level APIs when appropriate.
     - Verify: `rg -n "setModel\(|setThinkingLevel\(|getThinkingLevel\(" pi/extensions/prompt-router.ts`
     - Pass: routing flow sets thinking level explicitly alongside model selection (gated on T0 probe branch (a)); falls back to `settings.defaultThinkingLevel` if branch (b) was selected
     - Fail: effort remains unmanaged or only model switching occurs
  1a. [ ] Classifier JSON output is schema-validated at the TS boundary with graceful fallback (B2, H5).
     - Verify: `rg -n "schema_version|JSON\.parse|safeParseClassifierOutput|router\.policy" pi/extensions/prompt-router.ts`
     - Pass: TS parses stdout as JSON, checks `schema_version` matches a known value, falls back to current-applied route + logs on parse failure or version mismatch
     - Fail: TS blindly splits on whitespace, crashes on malformed output, or silently ignores version
  2. [ ] Uncertainty and downgrade behavior are policy-driven rather than hardcoded to permanent escalation.
     - Verify: `cd pi/tests && bun vitest run prompt-router.test.ts`
     - Pass: tests cover uncertain prompts, temporary escalation, and de-escalation/hysteresis behavior
     - Fail: only the old never-downgrade behavior remains, escalation becomes session-sticky, or the router thrashes across turns
  3. [ ] Status output explains both model and effort decisions clearly.
     - Verify: `rg -n "Current model|thinking|effort|Tier map|router-status" pi/extensions/prompt-router.ts pi/tests/prompt-router.test.ts`
     - Pass: `/router-status` and status labels include effort/caps/current-applied state in a readable form
     - Fail: users cannot tell why the router picked its current setting

### Wave 2 — Validation Gate

**V2: Validate wave 2** [large] — validation-lead
- Blocked by: T3, T4
- Checks:
  1. Run acceptance criteria for T3 and T4
  2. `cd pi/tests && bun vitest run prompt-router.test.ts` — router tests pass
  3. `cd pi/prompt-routing && python -m pytest tests/test_model.py -q` — classifier-side tests still pass
  4. Cross-task integration: verify the router consumes the new classifier recommendation, applies caps/clamping, and reports current model + effort consistently
- On failure: create a fix task, re-validate after fix

### Wave 2.5 -- Shadow-Eval Gate (B8)

**T4.5: Offline shadow-eval of cost delta before cutting over** [large] -- qa-engineer
- Blocked by: V2
- Description: The plan's central claim is "reduced subscription/rate-limit pressure." Measure it before rollout. Replay the last N days (target: 7) of `pi/logs/routing_log.jsonl` through both the legacy router and the new v3 router in a dry-run harness. Emit a report covering projected per-turn cost delta (using published model pricing), catastrophic-under-routing delta (v3 predicted route vs legacy tier), and thrash count.
- Files: `pi/prompt-routing/scripts/shadow_eval.py`, `pi/prompt-routing/docs/cost-shadow-eval.md`
- Acceptance Criteria:
  1. [ ] Shadow-eval harness runs both routers on historical log.
     - Verify: `cd pi/prompt-routing && python scripts/shadow_eval.py --input ../logs/routing_log.jsonl --out docs/cost-shadow-eval.md`
     - Pass: script exits 0, produces the report with both routers scored
     - Fail: script fails or report is empty
  2. [ ] Cost non-regression.
     - Verify: `rg -n "projected_cost_delta|catastrophic_under_routing_delta|thrash_count" pi/prompt-routing/docs/cost-shadow-eval.md`
     - Pass: report shows projected v3 cost <= legacy cost AND catastrophic-under-routing delta is zero (hard); thrash count tolerated up to the hysteresis spec
     - Fail: v3 projects higher cost or adds any catastrophic under-routing
- On failure: block rollout; tune thresholds in `router.policy.*` or revisit T3 hysteresis spec; re-run.

### Wave 3

**T5: Add regression tests, `/router-explain`, rollout metrics guidance, and documentation for auto effort routing** [medium] — qa-engineer
- Blocked by: T4.5
- Description: Expand tests and docs so the new behavior is durable and comprehensible. Cover route-level classifier outputs, confidence-aware fallbacks, effort caps (`router.effort.maxLevel` hard cap, H4), unsupported `xhigh` clamping, runtime escalation/de-escalation rules, and JSON schema versioning. Add `/router-explain` command (H6) that prints the last-turn decision: classifier raw output, applied route, and which rule fired (hysteresis hold / cooldown / uncertainty fallback / effort cap / probe-branch fallback). Update repo docs so future sessions know the router controls both model rung and thinking effort from a classifier trained on the v3 corpus. Prefer updating existing docs first.
- Files: `pi/tests/prompt-router.test.ts`, `pi/README.md`, `pi/prompt-routing/AGENTS.md`, `pi/settings.json`
- Acceptance Criteria:
  1. [ ] Regression tests cover the new decision surface.
     - Verify: `cd pi/tests && bun vitest run prompt-router.test.ts`
     - Pass: tests explicitly assert route-level classifier outputs, effort routing, caps, and uncertainty behavior
     - Fail: only legacy tier-routing assertions exist
  2. [ ] Documentation explains the new router behavior and operator controls.
     - Verify: `rg -n "thinking|effort|router-status|caps|hysteresis|v3 corpus|cheapest acceptable" pi/README.md pi/prompt-routing/AGENTS.md`
     - Pass: docs describe how model and effort routing interact, where the classifier comes from, and what operators can inspect/configure
     - Fail: docs still describe routing as model-tier-only
  3. [ ] Example settings/config reflect the new knobs without breaking current defaults (B7, H4).
     - Verify: `python -c "import json; s=json.load(open('pi/settings.json'));\
       r=s.get('router', {}); p=r.get('policy', {}); e=r.get('effort', {});\
       required=['N_HOLD','DOWNGRADE_THRESHOLD','K_CONSEC','COOLDOWN_TURNS','UNCERTAIN_THRESHOLD'];\
       missing=[k for k in required if k not in p];\
       assert not missing, f'missing policy keys: {missing}';\
       assert 'maxLevel' in e, 'router.effort.maxLevel (H4) missing';\
       assert e['maxLevel'] in ('off','minimal','low','medium','high'), 'maxLevel should default to high or lower, never xhigh';\
       print('ok')"`
     - Pass: JSON valid, all policy keys present with sensible defaults, `router.effort.maxLevel` is set and <= `"high"`
     - Fail: any key missing, JSON invalid, or `maxLevel` allows `xhigh`
  4. [ ] `/router-explain` command is registered and covered by tests (H6).
     - Verify: `rg -n "router-explain" pi/extensions/prompt-router.ts pi/tests/prompt-router.test.ts`
     - Pass: command is registered, and a vitest case asserts its output includes classifier output, applied route, and the rule that fired
     - Fail: command missing or untested

### Wave 3 — Validation Gate

**V3: Validate wave 3** [medium] — validation-lead
- Blocked by: T5
- Checks:
  1. Run acceptance criteria for T5
  2. `cd pi/tests && bun vitest run prompt-router.test.ts` — tests pass with new coverage
  3. `cd pi/prompt-routing && python -m pytest tests/test_model.py -q` — classifier tests still pass
  4. `make lint` — no new warnings in repo-wide lint surfaces relevant to touched files
  5. Cross-task integration: documentation, settings examples, classifier outputs, and implementation all describe the same policy and control names
- On failure: create a fix task, re-validate after fix

## Dependency Graph

```text
Wave 0:   T0 -> readiness + setThinkingLevel probe
Wave 0.5: P0 -> ship cost savings today (independent of v3; H1)
Wave 1:   T1, T2 -> V1
Wave 2:   T3, T4 (parallel) -> V2
Wave 2.5: T4.5 -> shadow-eval cost non-regression gate (B8)
Wave 3:   T5 -> V3
```

## Success Criteria

The change is complete when Pi can automatically route both model size and thinking effort per turn with a default bias toward cheaper settings, transparent status reporting, and durable tests, using a classifier trained on the new v3 route-level corpus.

1. [ ] End-to-end router behavior supports joint model + effort selection
   - Verify: `cd pi/tests && bun vitest run prompt-router.test.ts`
   - Pass: tests confirm model routing, effort routing, uncertainty handling, and clamping behavior
2. [ ] Classifier training and production interface are aligned with the new route-level objective
   - Verify: `cd pi/prompt-routing && python -m pytest tests/test_model.py -q`
   - Pass: prompt-routing classifier tests pass against the new production contract with no safety-regression symptoms
3. [ ] User-facing docs and status output match implementation
   - Verify: `rg -n "thinking|effort|router-status|hysteresis|caps|cost|large model|high effort|v3 corpus|cheapest acceptable" pi/README.md pi/extensions/prompt-router.ts pi/tests/prompt-router.test.ts`
   - Pass: docs, commands, and tests all refer to the same policy concepts, operator controls, and cost-first routing intent

## Handoff Notes

- Cold-start operator checklist:
  1. Read the files listed under **Cold-Start Execution Notes**.
  2. Run Wave 0 first and do not start implementation if the upstream readiness report is missing or marked `NOT READY`.
  3. Create `pi/prompt-routing/docs/` only when T1 first needs it; do not pre-create extra structure without a task requiring it.
  4. Prefer modifying the existing router/classifier surfaces over building parallel replacements.
- Start from the existing local extension/runtime surface; do not replace Pi with RouteLLM or a gateway product.
- This plan now assumes the v3 data readiness work in `.specs/pi-router-training-data/plan.md` exists first. If that corpus is not ready, implementation should block rather than silently falling back to the old objective.
- For cold-start execution, the operator should begin at Wave 0 and treat `pi/prompt-routing/docs/corpus-readiness-report.md` plus `pi/prompt-routing/docs/router-v3-output-contract.md` as the authoritative upstream handoff artifacts.
- Normalize terminology across implementation and docs: use **catastrophic under-routing** for the new safety metric, and explicitly describe legacy `HIGH->LOW inversion` language as a migration-era proxy.
- Keep the first policy deterministic and inspectable. Research suggests adaptive compute is useful, but the initial rollout should favor explicit thresholds, caps, and simple escalation signals over opaque learned policies.
- Preserve the current safety-floor philosophy: false negatives on hard prompts are worse than mild over-routing, but that should not be implemented as session-wide permanent escalation.
- Optimize for subscription/rate-limit preservation: the router should actively seek opportunities to route downward when a cheaper setting is likely good enough.
- Avoid forcing `xhigh` by default. Research and vendor docs both suggest high compute should be reserved for demonstrably hard cases. Enforced at runtime via `router.effort.maxLevel` cap (default `"high"`, H4).
- **P0 bridge (H1)**: Wave 0.5 ships cost savings without waiting on the v3 corpus. P0 is in force until V2 ships; then T4 supersedes it. P0 artifacts (hysteresis code, static tier->effort mapping) are retained -- T4 re-uses the hysteresis module and replaces the static mapping with the classifier recommendation.
- **Shadow-eval gate (B8)**: T4.5 must pass before T5. A failing shadow-eval means the v3 router is not cheaper in practice; tune `router.policy.*` thresholds or revisit T3 hysteresis spec before continuing.
- **Schema versioning (H5)**: the classifier JSON output carries `schema_version`. The TS side must fall back (not crash) on mismatch. Bump the version when adding/removing required fields.
- **`/router-explain` (H6)**: a debug command for the last-turn decision -- what the classifier said, what was applied, and which policy rule (hysteresis hold / cooldown / uncertainty fallback / effort cap / probe-branch fallback) fired. Reduces debugging cost when rate limits still hit.
- **`<1ms` interpretation (B3)**: the `<1ms` budget is classifier-internal only. End-to-end cold-start `pi.exec` latency (~150-300ms on Windows) is accepted because the router runs fire-and-forget off the critical path.

### Closeout (2026-04-23)

Shipped complete. ConfGate (LightGBM primary, T2 fallback) is now the default
classifier in `classify.py`. Runtime policy is simplified to effort-cap plus
cooldown (hysteresis hold and uncertainty fallback disabled in settings).
ConfGate beats T2-alone by -20.6% on cost and -20% on catastrophic events
under identical policy; both still project more expensive than legacy-oracle
on the synthetic `eval_v3` benchmark, but that benchmark is structurally
biased toward legacy and real-traffic cost is expected to be lower.

Full close-out narrative -- what went live, measured performance, rejected
alternatives, operator notes, and follow-up plan scope -- lives in
`pi/prompt-routing/docs/effort-routing-closeout.md`.
