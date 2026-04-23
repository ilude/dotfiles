---
date: 2026-04-22
status: synthesis-complete
---

# Plan Review Synthesis: pi-router-training-data

Note: the subagent-launcher tool was not available in this environment, so the
coordinator performed the five persona analyses directly against the repo
(Read/Grep/Glob/Bash verification) rather than dispatching parallel agents.
Findings that could not be verified against the repo were downgraded per the
severity-calibration rules.

## Review Panel

| Reviewer | Role | Findings | Verified Issues |
|---|---|---|---|
| R1 Completeness & Explicitness | cold-start executability | 6 | 4 |
| R2 Adversarial / Red Team | failure modes / cascades | 6 | 4 |
| R3 Outside-the-Box / Simplicity | proportionality | 5 | 3 |
| R4 ML Data Quality & Synthetic Labeling | adjudication, contamination | 6 | 5 |
| R5 Evaluation & Metrics Design | metric soundness, leakage | 6 | 5 |

## Outside-the-Box Assessment

The plan is proportionate in spirit -- it explicitly rejects starting from
scratch and keeps legacy labels as priors -- but it over-specifies ceremony
relative to the actual data scale (N >= 500 examples target, a few hundred
synthetic rows). Seven new doc files, three new directories, a bespoke
validator, a generation matrix YAML, a runbook, and a readiness report is a
lot of scaffolding for what is ultimately a curation + small-scale synthetic
expansion job. The selected approach is still the right one; the ceremony is
what should be trimmed, not the objective.

The more important structural concern (raised by R4/R5 and not addressed in
the plan) is that "cheapest acceptable route" is being adjudicated by an LLM
without any empirical grounding -- no candidate route is ever actually run to
check whether it would have produced an acceptable answer. This is a known
failure mode for synthetic routing data and deserves an explicit call-out
before execution, not after.

## Bugs (must fix before executing)

### B1. "Non-trivial" seed threshold is not reachable from the plan's own sources (HIGH)
- Flagged by: R1, R4
- Verified: `pi/prompt-routing/labeled_history.csv` has 1,882 data rows, but
  AGENTS.md already states only ~80-100 are expected to survive curation, and
  the existing 1,582-example corpus is the other candidate pool. T5
  acceptance demands `count >= 200` route-labeled examples across
  `seed_route_labels.jsonl` + `curated_history_route_labels.jsonl`. Reaching
  200 route-relabeled rows in T5 while respecting the "curated, not
  bulk-import" constraint is plausible but tight, and the plan gives no
  guidance on what to do if the curator can honestly only produce, say, 120.
- Fix: Add an explicit fallback to T5: "If curated seed < 200, document the
  shortfall in `seed-labeling-summary.md` and defer to T6 synthetic backfill
  rather than relaxing curation standards. The 200 threshold is a target,
  not a license to bulk-import."

### B2. `make test` in V3 runs the whole repo test suite, not just prompt-routing (HIGH)
- Flagged by: R1, R2
- Verified: repo-root `Makefile` defines `test: test-pytest` and
  `test-pytest: pytest -v ...` at repo scope. V3 says "`make test` -- repo
  tests still pass, or any new failures are confined to intentionally added
  v3 corpus tooling." That wording assumes the operator can cleanly
  attribute failures to their changes, but this repo's full pytest run
  spans dotfiles, hooks, menos submodule, etc. A pre-existing flake in
  an unrelated area will block V3 with no clear adjudication rule.
- Fix: Scope V3's test command to `cd pi/prompt-routing && python -m pytest
  tests/ -q`, and only optionally run full `make test` as an advisory check.

### B3. `training_corpus_v3.json` is required by T4 acceptance but never populated (HIGH)
- Flagged by: R1, R4
- Verified: T4's first acceptance check runs
  `python tools/validate_corpus.py data/training_corpus_v3.json`. But T4 only
  *implements* the validator and schema; the actual corpus population happens
  in T5/T6/T7. The file will not exist, or will be empty, when T4 runs.
- Fix: Either (a) T4's acceptance check should target a small committed
  example fixture (e.g. `data/training_corpus_v3.example.json` with 2-3
  synthetic rows the T4 author writes), or (b) the acceptance check should
  simply be "validator runs `--help` and exits 0 + unit tests pass", with the
  real corpus validation deferred to T7.

### B4. Legacy HIGH->LOW inversion guarantee is not carried into v3 eval (HIGH)
- Flagged by: R5, R2
- Verified: AGENTS.md codifies "Zero HIGH->LOW inversions" as a hard
  constraint and the existing corpus achieves 0. The plan promotes this to a
  "migration-era proxy" for catastrophic under-routing but never defines the
  operational detection rule for v3. "Catastrophic under-routing" appears in
  T7 acceptance only as a grep target; no threshold, no definition, no gate
  value is given.
- Fix: In `eval-v3-metrics.md` (T7), require a concrete operational
  definition, e.g. "catastrophic under-routing = ground-truth cheapest
  acceptable route is model_tier >= Sonnet AND predicted route is
  model_tier = Haiku with effort <= medium; gate: 0 instances on eval set."
  Add this as a T7 acceptance criterion, not just a rubric phrase.

### B5. Adjudicator is not separated from generator -- self-affirmation risk not mitigated (HIGH)
- Flagged by: R4
- Verified: Plan says large models do both synthesis of hard prompts *and*
  final route adjudication (T3 and Handoff Notes). If the same model family
  (e.g. Opus) writes an "architecture" prompt and then adjudicates which
  route is cheapest-acceptable, its judgment is contaminated by whatever
  assumptions it baked into the prompt.
- Fix: Require that for synthetic rows, adjudicator != generator at the model
  level (or at minimum at the vendor/family level), and record both in
  `synthetic_provenance.jsonl`. Add a T6 acceptance check:
  `rg -n "generator_model_size.*adjudicator_model_size" ...` AND a unit
  assertion that `row['generator_model'] != row['adjudicator_model']`.

### B6. No defined train/dev/eval split discipline -- leakage risk is silent (HIGH)
- Flagged by: R5, R4
- Verified: T7 creates `train_v3.jsonl`, `dev_v3.jsonl`, `eval_v3.jsonl` but
  the plan never states the split rule. Near-duplicate synthetic prompts
  ("rephrase X three ways") will end up in both train and eval unless
  deduplication is split-aware. The plan's only uniqueness check
  (`uniq / len > 0.9` in T6) runs on exact-string duplicates, not semantic
  paraphrases, and runs *before* the split.
- Fix: Require split by prompt *family* id (from
  `synthetic_prompt_families.jsonl`), not by individual row; add a T7
  acceptance check that no family id appears in more than one split; keep
  the exact-string dedup but add a near-duplicate check (simhash or
  embedding cosine > 0.9) within eval.

## Hardening Suggestions (optional improvements)

1. **Trim doc scaffolding** (R3, MEDIUM, high priority). Collapse
   `corpus-v3-schema.md` + `labeling-rubric.md` + `synthetic-generation-plan.md`
   + `synthetic-prompt-families.md` + `route-adjudication.md` into 2 docs:
   one schema/rubric, one synthetic runbook. Seven docs for ~500 rows is
   inversion of effort.

2. **Define "acceptable" empirically at least once** (R4, MEDIUM). Before
   trusting LLM adjudication, run the candidate routes on a small sample
   (20-40 prompts across tiers) and record actual outputs. Use those as
   calibration anchors for the adjudicator prompt. This is cheap and
   replaces pure LLM judgment with a small empirical prior.

3. **Stratify eval by route tier AND domain** (R5, MEDIUM). T7 says "build
   an evaluation set" with no stratification rule. A 100-row eval that is
   70% coding and 10% each of three other domains will hide regressions in
   minority domains. Require at least 15 examples per `(route tier, domain)`
   cell, or explicitly document which cells are under-powered.

4. **Specify a numeric READY threshold up front** (R5, MEDIUM). T7
   acceptance 3 accepts any doc that contains `READY` or `NOT READY`. That
   lets an optimistic operator declare READY at any quality level. Define
   the bar in the plan: e.g. "READY iff cheapest-route top-1 >= 0.75 on
   eval AND catastrophic under-routing = 0 AND per-tier recall >= 0.6."

5. **Add rollback guidance** (R2, LOW). Plan creates many new files but has
   no "how to back out" section. For a one-time redesign this is low
   priority, but a one-line "if V3 fails, revert commit X and the legacy
   corpus+model are unchanged" would close the loop.

6. **Parallel-write safety for T6** (R2, LOW). T6 says "parallel" synthetic
   generation but writes to single JSONL files. If two workers append
   concurrently, rows can interleave mid-line. Either serialize final writes
   or require per-worker shard files that a finalize step concatenates.

7. **Pin adjudicator temperature / decoding** (R4, LOW). Plan doesn't
   specify determinism knobs for adjudication. For reproducibility and to
   make "bad batch" removal meaningful, temperature=0 and recorded
   model+prompt-version-hash in provenance would make purges precise.

## Dismissed Findings

- "Plan assumes `docs/`, `tools/`, `prompts/` exist" -- **Dismissed.** Plan
  explicitly addresses this in Cold-Start Execution Notes and each task
  creates missing dirs. Verified: these three dirs indeed do not exist in
  `pi/prompt-routing/`, and the plan's guidance is correct.
- "No mention of existing OOD eval set" -- **Dismissed.** `data/ood_eval.json`
  exists and the plan's T7 produces `eval_v3.jsonl` independently; carrying
  OOD forward is implementation detail, not a plan gap.
- "Corpus only has 181 examples" (implied by some sections of plan context) --
  **Not a plan bug.** Verified corpus contains 1,582 examples (508/462/612).
  The plan's framing in "Context & Motivation" is schema-focused, not
  size-focused, so this isn't a contradiction, but the plan would be
  clearer if it acknowledged current N.
- "Parallel agents will race on git" -- **Dismissed.** Plan's parallel waves
  touch disjoint file sets per task; operator coordination handles this.

## Positive Notes

- Plan correctly identifies that a policy-layer-only fix is incomplete and
  pulls the label schema itself forward. That is the right call.
- Alternatives Considered table is concrete and the rejection reasons are
  grounded in actual repo history (2026-03-31 bulk-import failure).
- Cold-Start Execution Notes (especially the "Verify blocks are post-task"
  rule) preempts the classic "acceptance check fails before task runs"
  confusion.
- Handoff Notes pin the readiness report as the authoritative artifact and
  require an explicit READY / NOT READY string -- good discipline.
- Provenance-on-every-synthetic-row is called out as a hard requirement; the
  only gap is generator != adjudicator (B5).
- Locked output contract (`router-v3-output-contract.md`) as a deliverable
  is excellent: it prevents downstream router work from reopening the data
  design question.
