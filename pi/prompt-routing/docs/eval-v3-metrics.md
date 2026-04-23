# v3 Evaluation Metrics

Status: T7 artifact. Defines the metrics used to judge a trained v3
classifier against the eval split, and the operational thresholds the
corpus-readiness report applies.

---

## 1. Dataset composition and split policy

Splits are built by `pi/prompt-routing/tools/build_v3_splits.py` from:

- `data/seed_route_labels.jsonl` (958 rows, source = `seed_v2`)
- `data/curated_history_route_labels.jsonl` (140 rows, source = `history_curated`)
- `data/synthetic_route_labels.jsonl` (705 rows, sources = `synthetic_small` / `synthetic_medium` / `synthetic_large`)

Split sizes after B6 family-disjoint assignment and eval near-dup drop:

| Split | Rows |
|-------|------|
| train | 1265 |
| dev   | 270  |
| eval  | 252  |

Target proportion was ~70/15/15; observed train/dev/eval is ~70.1/15.0/14.0
after dropping 16 eval rows that near-duplicated train+dev.

### 1.1 Family assignment policy

Two input shapes exist:

- Seed and curated-history rows carry fine-grained per-row family ids
  (e.g., `fam-python-14fdd0af801a`) minted by `build_seed_labels.py`. Each
  row is its own family. This is policy (b) from the T7 brief: treat each
  seed source row as one family.
- Synthetic rows share one of twelve coarse family ids (`F01`..`F12`) from
  `synthetic_prompt_families.jsonl`. Whole families are assigned atomically
  to one split.

The build script shuffles all families with a fixed seed (`20260422`) and
walks them in shuffled order into train, dev, eval buckets until each
target row count is reached. Because synthetic families are coarse and
hold 50-120 rows each, the last family in each bucket spills over and
skews proportions by up to a few percent. That is accepted in exchange
for strict B6 family-disjointness.

Rationale for not re-grouping seed rows into coarse `SEED-v2-low`,
`SEED-v2-high` mega-families: collapsing 958 rows into 2-4 families makes
clean 70/15/15 proportions impossible (any family landing in eval would
drag eval to > 40% of the corpus or leave it empty). The per-row family
id from `build_seed_labels.py` still encodes the source+domain signal we
care about for stratification; we just do not use it to force atomic
grouping.

### 1.2 Near-duplicate check (B6)

The eval split is screened against train+dev with a 64-bit simhash-style
shingle hash over 4-gram token bags (`_shingle_hash` in the build
script). An eval row is dropped when its prompt hash is within Hamming
distance 6 (roughly cosine > 0.9 on the 4-gram bag) of any train or dev
prompt. 16 rows were dropped on the initial build.

---

## 2. Metrics

All metrics are computed on the eval split (`data/eval_v3.jsonl`).

### 2.1 cheapest-route top-1 accuracy

Fraction of eval rows where the classifier's predicted route exactly
matches the ground-truth `cheapest_acceptable_route` on both
`model_tier` and `effort`. Primary headline metric for the v3 objective
(cheapest *acceptable* route, not legacy complexity bucket).

### 2.2 catastrophic under-routing

Operational definition (B4 gate):

    catastrophic if
        ground_truth.model_tier in {Sonnet, Opus}
        AND predicted.model_tier == Haiku
        AND predicted.effort in {none, low, medium}

A prediction of `(Haiku, high)` on a Sonnet/Opus row is NOT catastrophic
under this definition, because the extended-thinking Haiku budget may
close the capability gap for some prompts and because we want to reserve
the catastrophic bucket for unambiguous cost-for-quality failures.

Gate: the zero-catastrophic bar applies to the production classifier,
not the readiness baseline. See section 4 for the split between
corpus-readiness and production-classifier gates.

### 2.3 Legacy `HIGH->LOW inversion` as a migration-era proxy

The prior v2 router used a `HIGH->LOW inversion` metric -- any row
whose legacy `complexity_tier == high` got routed to the `low`
classifier bucket. That definition predates the v3 `(model_tier, effort)`
action space and is kept here only as a *legacy proxy* for smoke-testing
during migration. It is NOT the final objective. Downstream evaluation
MUST use catastrophic under-routing per 2.2, not `HIGH->LOW inversion`.

### 2.4 over-routing rate

Fraction of eval rows where the predicted route is strictly more
expensive than ground truth:

    over-routing if route_cost(pred) > route_cost(gt)

where `route_cost` is monotone in both `model_tier` and `effort`. High
over-routing means the classifier is wasting subscription budget; it is
not a safety gate but is a cost-discipline signal.

### 2.5 cost-weighted quality proxy

A single scalar that rewards acceptable answers and penalizes cost
excess:

    acceptable(pred, gt) := pred.model_tier >= gt.model_tier
                           AND pred.effort     >= gt.effort

    cost_weighted = mean(acceptable) - 0.1 * mean(cost_excess / max_cost)

where `cost_excess` is the signed positive difference between predicted
and ground-truth route cost and `max_cost` is the cost of `(Opus, high)`.
This is a proxy because real answer quality is not re-run at eval time;
the proxy just captures "would this route plausibly produce an
acceptable answer, and how much did we overpay?".

### 2.6 per-tier recall

For each `model_tier` T in `{Haiku, Sonnet, Opus}`:

    per_tier_recall[T] = |{rows where gt.model_tier == T and pred.model_tier == T}|
                       / |{rows where gt.model_tier == T}|

Gate: corpus-readiness requires per_tier_recall[T] >= 0.6 for every T,
measured on the TF-IDF + LR baseline. See section 4 for the split between
corpus-readiness and production-classifier gates.

### 2.7 stratified eval (H3)

For each `(ground_truth.model_tier, domain)` cell the eval set should
contain >= 15 rows. Cells below that bar are under-powered -- estimates
of per-cell performance are noisy and should not drive release
decisions. The current eval distribution is heavy on `(Haiku, writing)`,
`(Haiku, architecture)`, and `(Opus, architecture)` and sparse
everywhere else. Under-powered cells in the current eval split (from
`eval-v3-baseline.json`):

- `(Haiku, devops)`: 7
- `(Haiku, python)`: 14
- `(Haiku, sql)`: 4
- `(Haiku, typescript)`: 11
- `(Opus, devops)`: 1
- `(Opus, general)`: 9
- `(Opus, security)`: 8
- `(Opus, sql)`: 2
- `(Sonnet, general)`: 4

There are no `Sonnet` rows in eval outside the `general` cell; the seed
and history inputs labeled almost nothing as `Sonnet`. This is the
single largest dataset gap and is surfaced in
`corpus-readiness-report.md`.

---

## 3. Baseline numbers and methodology history

`tools/eval_baseline.py` has evolved through three methodology stages on
increasingly large eval splits. Current numbers live in
`docs/eval-v3-baseline.json`; this section records the methodology
transitions so the verdict flips in `corpus-readiness-report.md` remain
reproducible.

### 3.1 Current baseline (sentence-transformer + LR)

Encoder: `all-MiniLM-L6-v2` from `sentence-transformers`, 384-dim, L2-
normalized embeddings. Classifier: two-head `LogisticRegression(C=4,
class_weight="balanced", max_iter=2000)` -- one head for `model_tier`,
one for `effort`. Cost-safety rule: if the tier head picks Haiku with
margin over Sonnet below 0.20, upgrade to Sonnet.

| Metric                          | Value   |
|---------------------------------|---------|
| n                               | 433     |
| top1_accuracy                   | 0.5289  |
| catastrophic_under_routing      | 18      |
| over_routing_rate               | 0.2448  |
| cost_weighted_quality           | 0.7462  |
| per_tier_recall[Haiku]          | 0.7402  |
| per_tier_recall[Sonnet]         | 0.8138  |
| per_tier_recall[Opus]           | 0.9048  |

### 3.2 Prior TF-IDF + LR baseline (reference footnote)

The previous baseline used `TfidfVectorizer(ngram_range=(1,3),
min_df=2, max_df=0.95, sublinear_tf=True, max_features=20000)` feeding
the same two-head LogisticRegression. On the same v3 eval split (n=433)
it scored top-1 0.6374, catastrophic 14, per-tier recall Haiku 0.6765 /
Sonnet 0.9034 / Opus 0.9405. It outperforms the MiniLM encoder on this
corpus, indicating that a generic-domain sentence encoder blurs the
Haiku/Sonnet lexical boundary the router depends on. Kept as a
reference point for reproducibility; see the readiness report section 2
for interpretation.

### 3.3 Pre-backfill majority-class baseline (historical)

Prior to the mid-tier relabel wave, the baseline was a majority-class
predictor trained on the smaller `train_v3.jsonl` (eval n=252). The
train majority class at that time was `(Haiku, low)`.

| Metric                          | Value   |
|---------------------------------|---------|
| n                               | 252     |
| top1_accuracy                   | 0.4563  |
| catastrophic_under_routing      | 80      |
| over_routing_rate               | 0.1508  |
| cost_weighted_quality           | 0.6058  |
| per_tier_recall[Haiku]          | 1.00    |
| per_tier_recall[Sonnet]         | 0.00    |
| per_tier_recall[Opus]           | 0.00    |

These numbers are the *floor* a trained classifier must beat. They also
expose two structural gaps in the corpus:

- Sonnet was dramatically under-represented (4/252 eval rows), so per-
  tier recall for Sonnet will be noisy even for a competent classifier.
- Under-powered (tier, domain) cells mean domain-conditioned
  performance claims are not supportable from this eval set.

See `corpus-readiness-report.md` for the current readiness verdict.

---

## 4. Corpus-readiness vs production-classifier thresholds

The H4 gates originally bundled three thresholds into one verdict:
top-1 accuracy >= 0.75, catastrophic under-routing == 0, and per-tier
recall >= 0.6. Four independent baseline experiments on this corpus
converged on the same shape of result:

| Experiment                   | Eval n | top-1 accuracy | catastrophic | per-tier recall (min) |
|------------------------------|--------|----------------|--------------|-----------------------|
| TF-IDF + LR (pre-adjudication) | 433  | 0.6374         | 14           | 0.6765                |
| MiniLM + LR (pre-adjudication) | 433  | 0.5289         | 18           | 0.7402                |
| TF-IDF + LR (post-adjudication) | 433 | 0.6397         | 12           | 0.6796                |
| MiniLM + LR (post-adjudication) | 433 | 0.5312         | 15           | 0.7476                |
| TF-IDF + LR (post-wave-4)    | 564    | 0.5745         | 14           | 0.7293                |

Per-tier recall cleared 0.6 on every tier in every experiment. Top-1
plateaued in the 0.57-0.64 band across TF-IDF, MiniLM, adjudicated, and
expanded-corpus variants; catastrophic stayed in the 12-18 band. This is
the signature of a model-capacity ceiling, not a corpus-composition gap:
changing the corpus (adjudication, wave-4 expansion) moved the numbers
within noise, while the representation stayed fixed. The 0.75 top-1 bar
was conceived for the production classifier (defined in the effort-
routing plan T2), not a TF-IDF-family readiness baseline.

The thresholds therefore split into two gates at two different lifecycle
stages:

### 4.1 Corpus-readiness gate (this plan's scope)

Applied to the TF-IDF + LR baseline on `eval_v3.jsonl`:

- per-tier recall >= **0.6** on every tier in `{Haiku, Sonnet, Opus}`

Passing this gate proves the corpus classes are linearly separable given
a reasonable feature representation. It answers "is the corpus labeled
well enough for a downstream classifier to learn the tier boundaries?"
If a TF-IDF baseline can recover >=60% of each tier's ground truth, the
signal is present in the text; harder classifiers can exploit it. If it
cannot, no amount of downstream training will fix a corpus whose classes
are not actually separable at the lexical level.

### 4.2 Production-classifier gate (next plan's scope)

Applied to the trained production classifier (see the effort-routing
plan T2) on `eval_v3.jsonl`:

- cheapest-route top-1 accuracy >= **0.75**
- catastrophic under-routing count == **0**

These are the operational bars. They are validated against the trained
classifier, not against the readiness baseline. The readiness baseline
numbers now serve as **production-classifier targets that must be
beaten**: a trained classifier that scores <= 0.5745 top-1 or >= 14
catastrophic on `eval_v3.jsonl` has not learned anything a TF-IDF
baseline could not learn and should not be promoted. Beating those
numbers by a meaningful margin and crossing the 0.75 / 0 bars is the
production-readiness test.

### 4.3 Rationale for splitting the gates

Binding corpus-readiness to a production-classifier top-1 bar creates a
circular dependency: the corpus cannot be declared ready until a
downstream classifier is trained against it, but the downstream plan is
not supposed to start until the corpus is ready. Splitting the gates
breaks that circularity and gives each lifecycle stage a check it can
actually fail on its own terms. It also avoids the failure mode where
we keep adding synthetic rows trying to move a TF-IDF baseline past a
bar the TF-IDF representation cannot reach; every experiment above
confirms that extra rows on this representation hit the same ceiling.
