# Classifier Experiments: Alternative Architectures vs Former T2 Baseline

Eval set: `eval_v3.jsonl` (n=564, held-out). Training set: `train_v3.jsonl + dev_v3.jsonl` (n=3248).

## What was tried and why

Three experiments were run against the former T2 baseline (LinearSVC on TF-IDF 1-3gram):

**1. LightGBM + TF-IDF SVD + hand features**
LightGBM is a gradient-boosted tree model that handles dense input well. TF-IDF (6000 features, 1-3gram)
was compressed to 150 SVD components, then augmented with 25 hand-crafted features:
prompt length, word count, avg word length, code fence presence, question mark, newline count,
and keyword indicators for architecture/security/debug/refactor/design domains, plus
domain token hits (python, typescript, rust, sql, kubernetes, etc.).
Chosen because ensemble methods can capture non-linear interactions between keyword signals
that a linear SVC cannot, and the hand features encode domain-specific routing priors.

**2. HistGradientBoosting + TF-IDF SVD + hand features**
Same feature pipeline as above (SVD(100) + hand features), using sklearn's
HistGradientBoostingClassifier -- no external dependency, faster install than LightGBM.
Included as a dependency-free fallback and independent data point.

**3. Haiku safety-margin sweep on T2-equivalent SVC**
The same LinearSVC architecture as T2, but with a post-hoc threshold: if the softmax
probability on a Haiku prediction falls below a threshold (swept 0.55, 0.60, 0.65, 0.70, 0.75),
the prediction is promoted to the highest-probability Sonnet label.
This tests whether a simple confidence gate can trade catastrophic errors for over-routing
without retraining a new model class.

## Results

| Model                              | top-1  | catastrophic | Haiku recall | Sonnet recall | Opus recall |
|------------------------------------|--------|:------------:|:------------:|:-------------:|:-----------:|
| T2 former baseline                 | 0.6241 | 38           | 0.8603       | 0.6872        | 0.8974      |
| LightGBM TF-IDF SVD + hand feat.  | 0.6631 | 23           | 0.8865       | 0.8101        | 0.9103      |
| HistGB TF-IDF SVD + hand feat.     | 0.6454 | 27           | 0.8646       | 0.7821        | 0.9295      |
| T2 SVC margin sweep (thresh=0.55)  | 0.4504 | 0            | 0.0306       | 0.8883        | 0.8974      |

Full margin sweep detail:

| Haiku threshold | top-1  | catastrophic | Haiku recall |
|-----------------|--------|:------------:|:------------:|
| 0.55            | 0.4504 | 0            | 0.0306       |
| 0.60            | 0.4468 | 0            | 0.0218       |
| 0.65            | 0.4397 | 0            | 0.0000       |
| 0.70            | 0.4397 | 0            | 0.0000       |
| 0.75            | 0.4397 | 0            | 0.0000       |

## Honest comparison vs former T2 baseline

**LightGBM** is the clear winner among the alternative architectures:
- top-1 improved from 0.6241 to 0.6631 (+3.9pp)
- catastrophic reduced from 38 to 23 (-39%)
- Sonnet recall improved from 0.6872 to 0.8101 (+12.3pp), the biggest pain point in T2

**HistGB** is a modest improvement over T2 but lags LightGBM on all metrics.
Training time (196s) is nearly 4x LightGBM (52s) with worse results.

**Margin sweep** eliminates catastrophic errors entirely but at an extreme cost:
Haiku recall collapses to 0.03 at thresh=0.55 (nearly all Haiku prompts are promoted
to Sonnet), and top-1 drops to 0.45. This is not a viable approach for production --
it replaces catastrophic under-routing with extreme over-routing.

Neither experiment clears the historical v3 experiment gate (top-1 >= 0.75,
catastrophic == 0). That gate is a historical evaluation threshold, not a
current production setting or production-qualification claim. The oracle ceiling
is estimated at ~0.75-0.76 due to effort labeling ambiguity (documented in
[classifier-training.md](classifier-training.md)).

## Recommendation: does any experiment justify a swap?

**Do not swap yet. The LightGBM result is promising enough to pursue further but not
ready for production.**

Arguments for LightGBM:
- +3.9pp top-1 improvement is meaningful
- Catastrophic reduced by 15 cases (-39%) -- this is the highest-priority metric
- Sonnet recall improvement is the largest per-tier gain, fixing T2's main weakness
- LightGBM is already installed in the environment (no new dep cost)

Arguments against swapping now:
- catastrophic is still 23, nowhere near the historical v3 experiment gate of 0
- top-1 is 0.6631 vs the historical 0.75 experiment gate -- gap remains large
- SVD compression loses information; a direct sparse LightGBM fit (without SVD)
  might close the gap further and is worth trying
- The LightGBM experiment used class_weight="balanced" + SVD(150);
  hyperparameter search (num_leaves, learning_rate, n_estimators, SVD components)
  was not done -- there is likely more headroom
- Combining LightGBM features with a direct sparse TF-IDF (via LightGBM's native
  sparse support) may outperform the SVD path

**Next step if pursuing LightGBM:** drop the SVD, feed raw sparse TF-IDF directly
(LightGBM handles sparse natively), add hyperparameter search on num_leaves and
learning_rate, and re-evaluate. If catastrophic can be driven below 10 and top-1
above 0.68, a swap case becomes compelling.

## Historical snapshots

### 2026-03-31 history.jsonl attempt

The attempt extracted 4,644 prompts, labeled 782, retained 594 usable labels,
and merged 363 balanced examples. The resulting evaluation was 77.98% accuracy,
one HIGH-to-LOW inversion, and 591 us mean inference. C values 1, 10, 100, and
1000 did not resolve the failure. Domain skew and vocabulary overlap made the
tier signal unreliable, so the change was reverted. The durable lesson is to
manually curate additions and maintain an independent OOD evaluation set; do
not bulk import history.

### Superseded legacy runtime snapshot

At that time, the legacy runtime used 181 handcrafted examples and a
37-example holdout. Its interface (`router.py`) and legacy data path remain for
compatibility and historical reference, but are not the production v3 runtime.
The tracked v3 SHA256 sidecars and the pre-wave-4 data backup at
`data/synthetic_route_labels.pre_wave4.jsonl` remain subject to the documented
integrity and migration rules. Current production uses ConfGate because
`pi/settings.json` selects it and the prompt-router extension passes
`--classifier confgate`; the standalone parser defaults to T2.
