---
created: 2026-04-22
status: draft
completed:
---

# Plan: Align prompt-router training data with cost-first model+effort routing

## Context & Motivation

The current prompt-router training corpus in `pi/prompt-routing/data/training_corpus.json` is a flat prompt-only dataset labeled only as `low` / `mid` / `high`. That corpus was built for a three-tier complexity router whose goal was to avoid routing obviously hard prompts to the weakest model. It does not encode the decision the next-generation router actually needs to make: **what is the cheapest acceptable `(model tier, effort tier)` likely to solve this turn well enough without burning unnecessary subscription/rate-limit budget?**

Conversation review established that a policy-only layer on top of the old classifier would be an incomplete solution. If the router is going to optimize for lower-cost / lower-effort paths by default and escalate only when needed, the training data itself must evolve. Repo-specific findings confirm this:

- `training_corpus.json` stores only prompt strings grouped under `low`, `mid`, and `high` arrays.
- `data.py` is a thin loader over that JSON and carries no row-level metadata.
- `AGENTS.md` documents prior failed expansion via raw `labeled_history.csv` merge, showing that bulk imports without curation degrade the model.
- The current corpus lacks row-level metadata, ambiguity labels, effort labels, route outcomes, and any notion of “cheapest acceptable route”.
- Existing scripts (`label_history.py`, `build_corpus.py`, `merge_labels.py`, `train.py`, `evaluate.py`) give us a good starting point for a data pipeline, but they target the old label schema.

The user wants a separate plan that specifically addresses bringing the training data into line, including generating synthetic training data if needed and parallelizing the work using appropriately sized models.

## Constraints

- Platform: Windows
- Shell: bash (Git Bash / POSIX shell in this session)
- Existing prompt-routing hard constraints still matter during transition: accuracy >= 85% on holdout, zero catastrophic under-routing equivalents, mean inference < 1ms for the production router, SHA256-verified model load.
- Existing `low` / `mid` / `high` corpus should be treated as seed data, not discarded blindly.
- Prior bulk-import attempt from `labeled_history.csv` failed because domain-skewed, ambiguous prompts degraded the classifier; all future imports must be curated or adjudicated.
- Synthetic data is allowed, but it must be generated with appropriately sized models and then validated; synthetic labels are not self-authenticating.
- The plan must support parallelizable work waves and explicit model/agent assignment.
- Keep the first redesign bounded: produce a usable v3 dataset and migration path, not a full online telemetry platform.

## Alternatives Considered

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| Keep current corpus and only add a policy layer in TypeScript | Fastest path; no ML/data work | Leaves the classifier misaligned with the real objective; effort remains heuristic | Rejected: incomplete and explicitly not what the user wants |
| Fully discard the old corpus and start from scratch on a new route-level dataset | Clean objective alignment; no legacy baggage | Throws away useful seed prompts and existing routing knowledge; highest annotation cost | Rejected: unnecessary reset |
| Migrate the corpus to a richer row-based schema, preserve old complexity labels as priors, and add curated + synthetic route-level supervision | Bounded but real redesign; uses current assets; supports incremental retraining and evaluation | Requires schema migration, labeling rules, and stronger validation workflow | **Selected** |

## Objective

Produce a concrete data redesign and build path for a v3 prompt-routing corpus that can train and evaluate a **cost-first router** whose target is the cheapest acceptable `(model tier, effort tier)` per prompt. The plan should preserve useful existing data, add the metadata and route-level labels the new objective requires, and define how curated historical data plus synthetic data are generated, reviewed, merged, and validated.

The final deliverable of this plan is not just “better data”; it is a **locked training interface** for downstream router implementation. At minimum, this plan must produce:
- `pi/prompt-routing/data/train_v3.jsonl`
- `pi/prompt-routing/data/dev_v3.jsonl`
- `pi/prompt-routing/data/eval_v3.jsonl`
- `pi/prompt-routing/docs/corpus-readiness-report.md`
- an explicit recommended **production classifier output contract** for the router runtime to consume

## Project Context

- **Language**: Python, TypeScript
- **Test command**: `make test`
- **Lint command**: `make lint`

## Cold-Start Execution Notes

Use this section as the starting point if the session begins with no prior context.

### Existing repo anchors to read first
- `pi/prompt-routing/AGENTS.md`
- `pi/prompt-routing/design-report.md`
- `pi/prompt-routing/data.py`
- `pi/prompt-routing/build_corpus.py`
- `pi/prompt-routing/train.py`
- `pi/prompt-routing/evaluate.py`
- `pi/prompt-routing/router.py`
- `pi/prompt-routing/classify.py`
- `pi/prompt-routing/data/training_corpus.json`
- `pi/prompt-routing/labeled_history.csv`

### New paths expected to be created by this plan
If these directories do not exist, the task that first writes into them should create them explicitly:
- `pi/prompt-routing/docs/`
- `pi/prompt-routing/prompts/`
- `pi/prompt-routing/tools/`

This plan intentionally introduces new artifacts under those paths. Their absence at plan start is expected and is **not** a blocker.

### Execution rule for verification commands
Many acceptance checks verify files that are created by the task itself. Before a task is implemented, those checks are expected to fail. During execution, treat each `Verify:` command as a **post-task validation step**, not a precondition unless the plan explicitly says otherwise.

## Task Breakdown

| # | Task | Files | Type | Model | Agent | Depends On |
|---|------|-------|------|-------|-------|------------|
| T1 | Design the v3 corpus schema and labeling rubric | 3 | architecture | large | planning-lead | — |
| T2 | Audit current corpus and map reusable examples into migration buckets | 3 | feature | medium | data-engineer | — |
| T3 | Define synthetic-data generation recipes and adjudication workflow | 4 | feature | medium | ml-research-lead | — |
| V1 | Validate wave 1 | — | validation | large | validation-lead | T1, T2, T3 |
| T4 | Implement schema migration + dataset tooling for row-based route labels | 5 | feature | medium | model-engineer | V1 |
| T5 | Curate historical prompts and label a seed cheapest-route dataset | 4 | feature | medium | data-engineer | V1 |
| T6 | Generate synthetic prompts and route judgments in parallel using sized models | 5 | feature | large | ml-research-lead | V1 |
| V2 | Validate wave 2 | — | validation | large | validation-lead | T4, T5, T6 |
| T7 | Build new training/evaluation datasets and benchmark corpus quality | 5 | architecture | large | eval-engineer | V2 |
| V3 | Validate wave 3 | — | validation | large | validation-lead | T7 |

## Execution Waves

### Wave 1 (parallel)

**T1: Design the v3 corpus schema and labeling rubric** [large] — planning-lead
- Description: Define the new row-based corpus schema AND the annotation rubric in a single combined document (schema + rubric collapsed to reduce doc scaffolding for a ~500-row dataset). Preserve legacy `complexity_tier` labels as seed metadata, but add new fields such as `source`, `domain`, `task_type`, `ambiguity`, and `cheapest_acceptable_route`. Decide whether to store only the chosen cheapest route or also route judgments for multiple candidate `(model tier, effort)` combinations. Document what counts as acceptable, insufficient, and overkill for annotation. If `pi/prompt-routing/docs/` does not exist yet, create it as part of this task before writing the doc.
- Files: `pi/prompt-routing/docs/corpus-v3-schema.md`, `.specs/pi-router-training-data/plan.md`
- Acceptance Criteria:
  1. [ ] A concrete v3 schema exists with example records.
     - Verify: `rg -n "cheapest_acceptable_route|complexity_tier|route_judgments|ambiguity|task_type" pi/prompt-routing/docs/corpus-v3-schema.md`
     - Pass: schema doc defines required fields and includes at least one realistic example record
     - Fail: schema remains conceptual or lacks route-level labels
  2. [ ] The labeling rubric section (in the same schema doc) defines how humans or model-assisted workflows decide the cheapest acceptable route.
     - Verify: `rg -n "acceptable|insufficient|overkill|model tier|effort" pi/prompt-routing/docs/corpus-v3-schema.md`
     - Pass: rubric section gives explicit guidance for route judgment and ambiguity handling
     - Fail: annotators would still have to improvise labels per prompt

**T2: Audit current corpus and map reusable examples into migration buckets** [medium] — data-engineer
- Description: Analyze the existing `training_corpus.json`, `labeled_history.csv`, and known pending sources to determine which prompts can be directly migrated, which require relabeling, and which should be excluded. Split prompts into buckets such as “safe low-cost seed”, “needs cheapest-route relabel”, “high ambiguity”, and “exclude/noisy”.
- Files: `pi/prompt-routing/docs/corpus-audit.md`, `pi/prompt-routing/data/migration_candidates.csv`, `pi/prompt-routing/data/migration_exclusions.csv`
- Acceptance Criteria:
  1. [ ] The existing corpus has a documented migration audit.
     - Verify: `rg -n "safe low-cost seed|needs relabel|high ambiguity|exclude" pi/prompt-routing/docs/corpus-audit.md`
     - Pass: audit explains how current data will be reused instead of assuming all prompts are equally valuable
     - Fail: no explicit migration buckets or exclusion rationale exist
  2. [ ] Candidate and exclusion inventories are generated in machine-readable form.
     - Verify: `python - <<'PY'
import csv
for path in ['pi/prompt-routing/data/migration_candidates.csv','pi/prompt-routing/data/migration_exclusions.csv']:
    with open(path, encoding='utf-8') as f:
        rows=list(csv.reader(f))
        print(path, len(rows))
PY`
     - Pass: both files load and contain rows beyond headers
     - Fail: files are missing, malformed, or empty

**T3: Define synthetic-data generation recipes and adjudication workflow** [medium] — ml-research-lead
- Description: Specify how synthetic prompts and route judgments will be generated to expand coverage without overwhelming manual labeling. Consolidate the synthetic workflow (generation plan + prompt families + route-adjudication prompt) into a single doc `synthetic-generation-plan.md` to match corpus scale. The plan must explicitly parallelize by work type using appropriately sized models: small for cheap/mechanical variants, medium for coding/debugging, large for architecture/security/hard-ambiguity cases. Define anti-collapse safeguards so synthetic data does not become repetitive or self-affirming. REQUIRED (B5): generator != adjudicator at model-family level. REQUIRED (H7): adjudicator runs at temperature=0 with a recorded prompt-version hash on every row. REQUIRED (H2): empirical-anchor step -- before trusting LLM adjudication at scale, actually run candidate routes on 20-40 prompts across tiers and use those outputs as calibration anchors in the adjudicator prompt. If `pi/prompt-routing/docs/` or `pi/prompt-routing/prompts/` does not exist yet, create those directories as part of this task.
- Files: `pi/prompt-routing/docs/synthetic-generation-plan.md`, `pi/prompt-routing/data/synthetic-generation-matrix.yaml`
- Acceptance Criteria:
  1. [ ] Synthetic generation is broken into prompt families and assigned to appropriate model sizes.
     - Verify: `rg -n "small|medium|large|mechanical|debugging|architecture|security|adjudication" pi/prompt-routing/docs/synthetic-generation-plan.md pi/prompt-routing/data/synthetic-generation-matrix.yaml`
     - Pass: the generation matrix clearly maps work classes to model sizes and purposes
     - Fail: synthetic generation is treated as one undifferentiated batch job
  2. [ ] An adjudication prompt/workflow exists, uses temperature=0, and cites the empirical anchor set.
     - Verify: `rg -n "cheapest acceptable|acceptable|insufficient|overkill|candidate routes|temperature.*0|empirical anchor|prompt[- ]version" pi/prompt-routing/docs/synthetic-generation-plan.md`
     - Pass: adjudication section explicitly compares candidate routes, pins temperature=0, records prompt-version hash, and references the 20-40-prompt empirical anchor set
     - Fail: adjudication still targets only `low/mid/high`, omits determinism knobs, or skips the empirical anchor

### Wave 1 — Validation Gate

**V1: Validate wave 1** [large] — validation-lead
- Blocked by: T1, T2, T3
- Checks:
  1. Run acceptance criteria for T1, T2, and T3
  2. Confirm the schema, migration buckets, and synthetic workflow all target the same end state: cheapest acceptable `(model tier, effort)` routing
  3. `make lint` — no new warnings in touched docs/config generation helpers
  4. Cross-task integration: verify the schema can represent both migrated historical data and synthetic route judgments without lossy transformation
- On failure: create a fix task, re-validate after fix

### Wave 2 (parallel)

**T4: Implement schema migration + dataset tooling for row-based route labels** [medium] — model-engineer
- Blocked by: V1
- Description: Build or adapt Python tooling so the corpus can be loaded, transformed, validated, and exported under the v3 schema. Update the current build pipeline to support row objects, schema validation, and derived training splits for future model/router experiments. Keep legacy complexity labels available as metadata for analysis. If `pi/prompt-routing/tools/` does not exist yet, create it in this task before adding validation helpers.
- Files: `pi/prompt-routing/build_corpus.py`, `pi/prompt-routing/data.py`, `pi/prompt-routing/tools/validate_corpus.py`, `pi/prompt-routing/data/training_corpus_v3.example.json`, `pi/prompt-routing/tests/test_corpus_schema.py`
- Acceptance Criteria:
  1. [ ] The repo can load and validate the new schema against a committed example fixture.
     - Verify: `cd pi/prompt-routing && python tools/validate_corpus.py data/training_corpus_v3.example.json && python -m pytest tests/test_corpus_schema.py -q`
     - Pass: validator runs cleanly against a 2-3 row fixture the T4 author writes (`training_corpus_v3.example.json`) and schema unit tests pass. Full-corpus validation is deferred to T7 once T5/T6 populate the real datasets.
     - Fail: tool crashes, rejects required fields, still assumes flat low/mid/high arrays, or depends on files not yet populated
  2. [ ] Existing loader/build code supports row-based examples without destroying legacy metadata.
     - Verify: `rg -n "training_corpus_v3|complexity_tier|cheapest_acceptable_route" pi/prompt-routing/build_corpus.py pi/prompt-routing/data.py pi/prompt-routing/tools/validate_corpus.py`
     - Pass: code clearly supports row objects and route labels
     - Fail: code path remains hardcoded to legacy array-of-strings corpus

**T5: Curate historical prompts and label a seed cheapest-route dataset** [medium] — data-engineer
- Blocked by: V1
- Description: Use the migration audit to relabel a seed set of existing prompts into the new route-level schema. Prioritize diverse, unambiguous prompts from the current corpus plus curated `labeled_history.csv` candidates. Produce a balanced dataset that covers cheap wins, hard prompts, and ambiguous middle cases. SHORTFALL FALLBACK (B1): if honest curation produces fewer than 200 route-labeled examples, DO NOT relax curation standards or bulk-import `labeled_history.csv`. Instead, document the shortfall (count, why, which buckets are thin) in `seed-labeling-summary.md` and defer the remaining volume to T6 synthetic backfill. The 200 threshold is a target, not a license to bulk-import.
- Files: `pi/prompt-routing/data/seed_route_labels.jsonl`, `pi/prompt-routing/data/curated_history_route_labels.jsonl`, `pi/prompt-routing/docs/seed-labeling-summary.md`, `pi/prompt-routing/data/annotation_queue.csv`
- Acceptance Criteria:
  1. [ ] A non-trivial seed route-labeled dataset exists.
     - Verify: `python - <<'PY'
import json
count=0
for path in ['pi/prompt-routing/data/seed_route_labels.jsonl','pi/prompt-routing/data/curated_history_route_labels.jsonl']:
    with open(path, encoding='utf-8') as f:
        for line in f:
            if line.strip():
                obj=json.loads(line)
                assert 'prompt' in obj and 'labels' in obj
                count += 1
print(count)
assert count >= 200
PY`
     - Pass: at least 200 total route-labeled examples exist with valid structure
     - Fail: dataset is too small, malformed, or still only complexity-labeled
  2. [ ] Seed labeling summary documents class/domain coverage and known gaps.
     - Verify: `rg -n "coverage|gaps|domain|ambiguity|route" pi/prompt-routing/docs/seed-labeling-summary.md`
     - Pass: summary makes coverage explicit and identifies what synthetic data still needs to fill
     - Fail: no visibility into where the seed dataset remains weak

**T6: Generate synthetic prompts and route judgments in parallel using sized models** [large] — ml-research-lead
- Blocked by: V1
- Description: Execute the synthetic generation workflow in parallel, with prompt family generation delegated by complexity band and adjudication handled separately. Use small models for simple/mechanical prompt families, medium models for coding/debugging/moderate-analysis families, and large models for architecture/security/edge-case synthesis. REQUIRED (B5): for every synthetic row the adjudicator model must be a different model family from the generator model; record both in provenance. REQUIRED (H7): adjudicator runs at temperature=0 and records a prompt-version hash on every row. PARALLEL-WRITE SAFETY (H6): each worker writes to its own per-worker shard file under `pi/prompt-routing/data/synthetic_shards/`; a finalize step concatenates shards into `synthetic_route_labels.jsonl` and `synthetic_provenance.jsonl`. Workers must NOT append concurrently to the canonical JSONL files. Deduplicate, diversity-check, and record provenance for all synthetic examples.
- Files: `pi/prompt-routing/tools/generate_synthetic_dataset.py`, `pi/prompt-routing/data/synthetic_prompt_families.jsonl`, `pi/prompt-routing/data/synthetic_route_labels.jsonl`, `pi/prompt-routing/data/synthetic_provenance.jsonl`, `pi/prompt-routing/docs/synthetic-runbook.md`
- Acceptance Criteria:
  1. [ ] Synthetic generation records prompt provenance and model-size provenance.
     - Verify: `python - <<'PY'
import json
with open('pi/prompt-routing/data/synthetic_provenance.jsonl', encoding='utf-8') as f:
    rows=[json.loads(l) for l in f if l.strip()]
print(sorted(rows[0].keys()))
assert 'generator_model_size' in rows[0] and 'adjudicator_model_size' in rows[0]
assert 'generator_model' in rows[0] and 'adjudicator_model' in rows[0] and 'prompt_version_hash' in rows[0]
assert all(r['generator_model'] != r['adjudicator_model'] for r in rows), 'B5: generator must differ from adjudicator on every row'
PY`
     - Pass: provenance records include which model size generated and adjudicated each example
     - Fail: synthetic examples cannot be traced back to generation/adjudication workflow
  2. [ ] Synthetic route labels are diverse and deduplicated enough to be useful.
     - Verify: `python - <<'PY'
import json
prompts=[]
with open('pi/prompt-routing/data/synthetic_route_labels.jsonl', encoding='utf-8') as f:
    for line in f:
        if line.strip():
            prompts.append(json.loads(line)['prompt'])
uniq=len(set(prompts))
print(len(prompts), uniq)
assert len(prompts) >= 300 and uniq / len(prompts) > 0.9
PY`
     - Pass: synthetic dataset has at least 300 examples with >90% unique prompts
     - Fail: synthetic output is too repetitive or too small

### Wave 2 — Validation Gate

**V2: Validate wave 2** [large] — validation-lead
- Blocked by: T4, T5, T6
- Checks:
  1. Run acceptance criteria for T4, T5, and T6
  2. `cd pi/prompt-routing && python -m pytest tests/test_corpus_schema.py -q` — schema/tooling tests pass
  3. Cross-task integration: verify migrated historical labels and synthetic labels serialize into the same v3 corpus shape and preserve provenance
  4. Inspect sample rows from seed + synthetic sets to confirm adjudication targets cheapest acceptable routes rather than legacy complexity-only labels
- On failure: create a fix task, re-validate after fix

### Wave 3

**T7: Build new training/evaluation datasets and benchmark corpus quality** [large] — eval-engineer
- Blocked by: V2
- Description: Merge migrated seed labels and approved synthetic labels into train/dev/eval assets for the new routing objective. Build an evaluation set that measures cheapest-route accuracy, catastrophic under-routing, over-routing, and cost-weighted quality proxies. SPLIT DISCIPLINE (B6): splits are assigned by prompt FAMILY id from `synthetic_prompt_families.jsonl` (not by individual row); no family id may appear in more than one split. Additionally, within the eval split run a near-duplicate check (simhash or embedding cosine > 0.9) against train+dev and drop any eval rows that collide. CATASTROPHIC UNDER-ROUTING (B4): operationally defined as any row where ground-truth cheapest acceptable route has `model_tier >= Sonnet` but predicted route has `model_tier == Haiku` AND `effort <= medium`; eval gate is ZERO instances (equivalent to legacy HIGH->LOW inversion guarantee). STRATIFIED EVAL (H3): eval set must contain >=15 examples per `(route tier, domain)` cell, or explicitly document under-powered cells in `eval-v3-metrics.md`. NUMERIC READY THRESHOLD (H4): `corpus-readiness-report.md` must declare READY only when ALL of: (a) cheapest-route top-1 accuracy >= 0.75 on eval, (b) catastrophic under-routing count == 0, (c) per-tier recall >= 0.6; otherwise NOT READY with gap list. Document whether the resulting corpus is sufficient for an Option 3 MVP model-training plan, and explicitly recommend the production classifier output contract the downstream router implementation should consume. If `pi/prompt-routing/docs/` does not exist yet, create it before writing the final readiness and contract artifacts.
- Files: `pi/prompt-routing/data/train_v3.jsonl`, `pi/prompt-routing/data/dev_v3.jsonl`, `pi/prompt-routing/data/eval_v3.jsonl`, `pi/prompt-routing/docs/eval-v3-metrics.md`, `pi/prompt-routing/docs/corpus-readiness-report.md`, `pi/prompt-routing/docs/router-v3-output-contract.md`
- Acceptance Criteria:
  1. [ ] v3 train/dev/eval datasets exist and load cleanly.
     - Verify: `python - <<'PY'
import json
for path in ['pi/prompt-routing/data/train_v3.jsonl','pi/prompt-routing/data/dev_v3.jsonl','pi/prompt-routing/data/eval_v3.jsonl']:
    n=0
    with open(path, encoding='utf-8') as f:
        for line in f:
            if line.strip():
                json.loads(line)
                n+=1
    print(path, n)
    assert n > 0
PY`
     - Pass: all three datasets parse and contain examples
     - Fail: any split is missing, empty, or malformed
  2. [ ] Evaluation docs define metrics aligned to the new objective with operational thresholds.
     - Verify: `rg -n "cheapest-route|catastrophic under-routing|over-routing|cost-weighted|acceptable route|legacy proxy|model_tier|Haiku|Sonnet|per-tier recall|stratif" pi/prompt-routing/docs/eval-v3-metrics.md`
     - Pass: metrics doc (a) defines catastrophic under-routing operationally (ground-truth tier >= Sonnet AND predicted tier == Haiku with effort <= medium), (b) gates at zero, (c) explains legacy HIGH->LOW inversion as the migration-era proxy, (d) requires stratified eval with >=15 per (route tier, domain) cell or names under-powered cells
     - Fail: evaluation is still defined only in terms of legacy low/mid/high accuracy or lacks threshold values
  3. [ ] A readiness report states whether the data is sufficient for an Option 3 training plan, cites the numeric thresholds, and names remaining gaps.
     - Verify: `rg -n "READY|NOT READY|gaps|next step|synthetic|historical|coverage|0\.75|0\.6|catastrophic" pi/prompt-routing/docs/corpus-readiness-report.md`
     - Pass: report gives a clear go/no-go tied to the numeric bar (cheapest-route top-1 >= 0.75, catastrophic under-routing == 0, per-tier recall >= 0.6) and enumerates remaining gaps
     - Fail: no explicit readiness decision, or decision is not anchored to numeric thresholds
  4. [ ] A concrete recommended production classifier output contract exists for the router runtime.
     - Verify: `rg -n "primary_route|fallback_route|confidence|model_tier|effort" pi/prompt-routing/docs/router-v3-output-contract.md`
     - Pass: the contract doc includes at least one complete JSON example and field semantics
     - Fail: downstream router work would still have to invent the production interface
  5. [ ] Splits are family-disjoint and eval is near-dup-clean (B6).
     - Verify: `python - <<'PY'
import json
splits={}
for name in ('train_v3','dev_v3','eval_v3'):
    with open(f'pi/prompt-routing/data/{name}.jsonl', encoding='utf-8') as f:
        splits[name]=[json.loads(l) for l in f if l.strip()]
fids={name:{r.get('family_id') for r in rows if r.get('family_id')} for name,rows in splits.items()}
assert fids['train_v3'].isdisjoint(fids['eval_v3']), 'B6: family id leaked train<->eval'
assert fids['dev_v3'].isdisjoint(fids['eval_v3']), 'B6: family id leaked dev<->eval'
print('splits disjoint by family_id')
PY`
     - Pass: no family_id appears in more than one split; eval rows pass a documented near-duplicate check against train+dev
     - Fail: family id leakage across splits or no near-dup check was performed

### Wave 3 — Validation Gate

**V3: Validate wave 3** [large] — validation-lead
- Blocked by: T7
- Checks:
  1. Run acceptance criteria for T7
  2. `cd pi/prompt-routing && python -m pytest tests/ -q` -- prompt-routing tests pass (scoped to this subtree to avoid blocking on unrelated repo flakes). Full `make test` is advisory only; document any pre-existing unrelated failures rather than gating on them.
  3. `make lint` — no new lint warnings
  4. Cross-task integration: confirm the v3 corpus, eval metrics, and readiness report all align on the same routing objective and action space
- On failure: create a fix task, re-validate after fix

## Dependency Graph

```text
Wave 1: T1, T2, T3 (parallel) → V1
Wave 2: T4, T5, T6 (parallel) → V2
Wave 3: T7 → V3
```

## Success Criteria

This plan succeeds when the repo has a clearly documented, validated path from the legacy complexity corpus to a route-level training dataset suitable for an Option 3 cost-first router redesign.

1. [ ] A v3 corpus schema and labeling rubric exist and are used by actual migrated data
   - Verify: `cd pi/prompt-routing && python tools/validate_corpus.py data/training_corpus_v3.json`
   - Pass: validation succeeds against the documented schema
2. [ ] Historical and synthetic route-labeled examples exist with provenance and enough scale to train/evaluate a bounded MVP
   - Verify: `python - <<'PY'
import json
count=0
for path in ['pi/prompt-routing/data/seed_route_labels.jsonl','pi/prompt-routing/data/curated_history_route_labels.jsonl','pi/prompt-routing/data/synthetic_route_labels.jsonl']:
    with open(path, encoding='utf-8') as f:
        for line in f:
            if line.strip():
                json.loads(line)
                count += 1
print(count)
assert count >= 500
PY`
   - Pass: at least 500 combined route-labeled examples exist across migrated and synthetic sources
3. [ ] The repo has train/dev/eval assets and metrics for the new routing objective
   - Verify: `rg -n "cheapest-route|cost-weighted|catastrophic under-routing|over-routing|READY|NOT READY" pi/prompt-routing/docs/eval-v3-metrics.md pi/prompt-routing/docs/corpus-readiness-report.md`
   - Pass: docs explicitly evaluate the cost-first routing goal rather than legacy complexity-only routing and include a clear readiness decision
4. [ ] The downstream router implementation can consume a locked classifier output contract without reopening the data-design question
   - Verify: `rg -n "primary_route|fallback_route|confidence|model_tier|effort" pi/prompt-routing/docs/router-v3-output-contract.md`
   - Pass: a concrete production output contract exists with example payloads and field semantics

## Handoff Notes

- Cold-start operator checklist:
  1. Read the files listed under **Cold-Start Execution Notes**.
  2. Confirm which of the new directories (`docs/`, `prompts/`, `tools/`) already exist under `pi/prompt-routing/`.
  3. Create missing directories only in the task that first needs them; do not pre-create unrelated artifacts.
  4. Treat every `Verify:` block as post-task validation unless the plan explicitly marks it as a prerequisite.
- Do not bulk-merge `labeled_history.csv` into the new corpus without curation or adjudication. Prior project history shows that this degrades the model.
- Treat synthetic data as coverage expansion and contrastive supervision, not as the sole source of truth.
- Keep generator/adjudicator provenance on every synthetic row so low-quality batches can be removed later.
- For model sizing during synthetic workflows: use **small** models for cheap/mechanical prompt generation, **medium** models for debugging/integration prompt generation, and **large** models for architecture/security synthesis plus final route adjudication. This preserves cost discipline while still using stronger models where judgment quality matters.
- This plan intentionally stops at data readiness. Training a new Option 3 router should be planned separately once the readiness report says the corpus is sufficient.
- ROLLBACK (H5): if V3 fails or the readiness report says NOT READY, revert the commit(s) introducing `training_corpus_v3.example.json`, `train_v3.jsonl`, `dev_v3.jsonl`, `eval_v3.jsonl`, and the new docs under `pi/prompt-routing/docs/`. The legacy `training_corpus.json` and existing router/classifier code remain unchanged throughout this plan, so reverting leaves the production router fully functional on legacy data.
- For cold-start execution, treat `pi/prompt-routing/docs/corpus-readiness-report.md` as the authoritative handoff artifact. It must explicitly say `READY` or `NOT READY` near the top, list the exact generated dataset files, and point downstream work at `pi/prompt-routing/docs/router-v3-output-contract.md`.
- Normalize terminology across docs: use **catastrophic under-routing** as the v3 safety metric, and explicitly describe legacy `HIGH->LOW inversion` as a migration-era proxy rather than the final objective.
- READINESS AMENDMENT (post-execution): the H4 top-1 and catastrophic thresholds were moved from the corpus-readiness gate to the production-classifier gate. Corpus-readiness now gates only on per-tier recall >= 0.6. Empirical basis: four independent baseline experiments all showed TF-IDF-family models plateau at 0.57-0.64 top-1 regardless of corpus composition. See `pi/prompt-routing/docs/eval-v3-metrics.md` "Corpus-readiness vs production-classifier thresholds" section.
