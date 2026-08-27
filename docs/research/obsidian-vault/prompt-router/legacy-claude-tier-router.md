---
status: archived-research
source: retired pi/prompt-routing design and evaluation reports
date: 2026-03-31
---

# Archived research: Claude-tier TF-IDF router

## Archive status and scope

This note consolidates the final design and evaluation reports for the retired
local classifier experiment. It is historical research, not a production
approval or a description of current Pi routing.

The experiment classified prompts into three Claude tiers:

| Label | Model | Intended prompts |
| --- | --- | --- |
| `low` | Haiku | Factual lookups, syntax questions, single-step tasks |
| `mid` | Sonnet | Multi-step reasoning, contextual code tasks, moderate analysis |
| `high` | Opus | Architecture, security analysis, and complex reasoning chains |

Current Pi routing has moved on to model/effort route policy involving current
Sol/Terra paths and route-level cost/quality experiments. It does not load this
Claude-tier classifier at runtime. See [current status](current-status.md) and
the [experiment log](experiment-log.md) for the current research context.

## Original constraints and decision

The hard constraints were:

- holdout accuracy of at least 85%;
- zero `HIGH->LOW` inversions, where an Opus-complexity prompt is sent to Haiku;
- under 1 ms local inference with no remote calls.

The selected architecture was a scikit-learn `Pipeline` containing
`TfidfVectorizer` and `LinearSVC`. TF-IDF was chosen because the working
assumption was that complexity correlated strongly with vocabulary: terms such
as `shard`, `consensus protocol`, and `race condition` suggested HIGH, while
`append`, `sort`, and `variable` suggested LOW. It was interpretable, required
no GPU or network call, and was expected to meet the latency budget.

Alternatives were rejected for specific reasons:

- Sentence embeddings offered better paraphrase and semantic generalization,
  but the smallest transformer models exceeded 1 ms and added a heavy
  dependency.
- Hand-built features such as prompt length, clause count, and vocabulary
  richness were fast but insufficient: length is not complexity, and HIGH
  prompts can be short. They were considered auxiliary signals only.

The feature configuration was:

```python
TfidfVectorizer(
    max_features=10000,
    ngram_range=(1, 2),
    sublinear_tf=True,
)
```

Bigrams were intended to capture signals such as `what is` and `how do` for
LOW, `unit tests` and `connection pooling` for MID, and `distributed consensus`,
`race conditions`, `zero downtime`, and `multi-tenant` for HIGH.

## Model selection and calibration decision

Planning, Engineering, and Validation teams considered ComplementNB,
SGDClassifier, and LinearSVC. The consensus was LinearSVC plus
`CalibratedClassifierCV`: LinearSVC supplied sharp linear boundaries, while
calibration would provide probabilities for threshold tuning.

- ComplementNB was rejected because cross-validation showed more HIGH
  false positives and therefore greater risk of unnecessary upward routing.
- SGDClassifier was rejected because its threshold was unstable under
  distribution shift.
- Calibration was intended to support future confidence thresholds without
  retraining.

That consensus changed during implementation. scikit-learn 1.8.0 removed
`cv='prefit'`. The available calibrated configurations were too slow:
`CalibratedClassifierCV(cv=5)` measured about 3,700 us and
`ensemble=False` about 1,557 us. Direct LinearSVC measured about 490 us and was
shipped as the production artifact. Calibration remained in grid-search/CV
work for stable C selection, not in the production inference pipeline.

A later uncertainty experiment used softmax over `decision_function` as an
approximate probability. The current legacy baseline, argmax with a
`P(high)>0.20` safety floor, reached 90.9% accuracy with zero inversions on a
317-example evaluation. The paper-style rule `P(high)>0.70 -> Opus,
P(mid)>0.60 -> Sonnet, else Haiku` reached only 72.9% and caused 38 inversions.
A safer formulation, `P(high)>T_high`, then `P(low)>T_low`, else Sonnet, reached
86.4% with zero inversions at 0.60/0.50. The reported reason was poor
calibration: approximate softmax had Brier 0.044, while calibrated output was
expected to be about 0.007. Re-evaluation after real calibration was recommended.

## Corpus, training, and artifacts

The design report describes 180 labeled examples, 60 per class, split
stratified 80/20 into 144 training and 36 test examples (12 per class). The
board review calls the corpus 181 examples, and the evaluation report calls
the holdout 37 examples with supports 12/12/13. These counts are retained as
reported evidence rather than silently reconciled; together they indicate a
small, near-balanced in-distribution corpus.

Coverage was:

- LOW: factual and syntax questions, definitions, and single-function tasks;
- MID: endpoints, algorithms, middleware, and CI/CD;
- HIGH: distributed systems, security, architecture, and consensus protocols.

Training used a stratified five-fold grid search over `C` values 0.01, 0.1,
1.0, and 10.0. The reported CV results were:

| C | Mean accuracy | Std. dev. |
| ---: | ---: | ---: |
| 0.01 | 0.9022 | 0.0525 |
| 0.1 | 0.9022 | 0.0525 |
| **1.0** | **0.9094** | **0.0478** |
| 10.0 | 0.9094 | 0.0478 |

`C=1.0` was selected as the first peak value. `random_state=42` was fixed for
splitting, CV, and LinearSVC to make retraining reproducible. The pipeline
encapsulated vectorization and prediction so callers did not duplicate feature
extraction or leak state.

The associated artifact set was:

| Artifact | Purpose |
| --- | --- |
| `data.py` | 180-example labeled corpus |
| `train.py` | TF-IDF + LinearSVC training pipeline |
| `model.pkl` | serialized sklearn pipeline |
| `model.pkl.sha256` | integrity sidecar |
| `test_set.pkl` | held-out test split |
| `training-log.txt` | CV and hyperparameter results |
| `evaluate.py` | holdout evaluation harness |
| `eval-report.md` | acceptance results |
| `design-report.md` | design and review record |

The production artifact was described as TF-IDF plus direct LinearSVC, not the
board's calibrated production design.

## Evaluation and integrity evidence

The acceptance report marked all four gates PASS:

| Criterion | Threshold | Result |
| --- | --- | --- |
| Holdout accuracy | >=85% | 100.0% |
| HIGH->LOW inversions | 0 | 0 |
| Mean inference | <1 ms | 0.513 ms |
| SHA256 sidecar | present and matching | match |

The confusion matrix was perfect on the reported 37-example holdout: 12 LOW,
12 MID, and 13 HIGH, with no off-diagonal errors. Timing used a 20-run warmup
and 2,000 single-prompt predictions. Mean was reported as 490-513 us and median
as 408 us. Windows p99 was 1,103-1,192 us, above the nominal SLA; the report
attributed this to scheduler jitter and recommended a Linux benchmark before
production sign-off. The claimed inference path was sparse TF-IDF transform
(over a 1,635-token vocabulary) plus one LinearSVC prediction, with no model
load per request.

The recorded model digest was:

```text
c563c0e36f91da657fea78d0660acc494f3193e07472325b2355af2e140d43b0
```

The evaluator verified the sidecar before `pickle.load()` and exited on a
mismatch. The security assessment correctly identified pickle deserialization
as arbitrary-code execution. Its controls were local generation, never loading
an untrusted model, adjacent SHA256 verification before every load, and
restricted artifact-directory permissions. The residual limitation was that
an attacker able to write both the model and sidecar could replace both; an
out-of-band digest or signature was recommended for higher assurance.

## Board findings and conditional approval

The Planning Lead conditionally approved initial deployment but objected to
conservative routing bias and corpus coverage. The holdout did not report
HIGH->MID false negatives. Missing cases included ambiguous framing, non-English
or code-heavy prompts, contextless follow-ups, compound requests, and HIGH
prompts without domain jargon. Recommendations were a confidence floor or
upward margin fallback, a corpus of 500+ examples focused on those gaps, and
production telemetry for HIGH->MID misroutes. Scale-up was blocked until the
corpus reached 500 examples.

The Engineering Lead approved the implementation but required:

1. a startup-loaded, thread-safe `router.py` interface with `route(prompt)`,
   including SHA256 verification;
2. migration from pickle to joblib in the next retraining cycle; and
3. a pinned `scikit-learn==1.8.0` environment plus compatible NumPy constraint.

Other engineering observations were that the grid search was acceptable at
this size, `__pycache__` and pickle files should be ignored, and the selected
C value was consistent with the small CV comparison.

The Validation Lead marked the hard gate PASS but made scale-up conditional on
four gaps:

- an independently written OOD set of at least 50 prompts, including paraphrase,
  novel vocabulary, and adversarial short-but-hard prompts;
- OOV, Unicode, and concurrent-inference tests;
- a Linux p99 benchmark, with p99 used as the SLA gate where applicable; and
- model versioning and a documented rollback path.

The same review noted that the 37-example perfect holdout was likely
in-distribution memorization rather than proof of generalization. It accepted
pickle and filesystem permissions for the stated threat model, while retaining
the co-located-sidecar risk.

The final evaluation recommendation was therefore approval for initial routing
at less than 10% traffic, with monitoring for predicted versus actual tier,
monthly retraining, and any HIGH->LOW inversions. It was not evidence for
unrestricted production scale-up.

## Further research recorded in the report

### Embedding KNN

Embedding KNN was judged promising for ambiguous operational prompts such as
`apply the terraform changes`, where surface vocabulary is weak. The chat-log
analysis reported TF-IDF accuracy of 58% on DevOps/infrastructure prompts versus
91% on coding prompts. A MiniLM-scale embedding model was estimated at 5-15 ms
on CPU (quantized ONNX at 3-5 ms), outside the 1 ms v1 budget. A possible v2 was
a hybrid: TF-IDF for high-confidence cases and KNN for uncertain cases, using
1,582 labeled examples including the 594 excluded infrastructure rows. The
corpus's diversity was identified as central to KNN quality.

### Complexity versus model identity

The report aligned the labels with task complexity rather than named-model
preference: LOW meant simple work, MID moderate contextual work, and HIGH
architecture, security, scale, or multi-constraint reasoning. That principle
could transfer across model families, but the corpus was over-indexed on
architecture and distributed-systems vocabulary. Legal, scientific, and
creative high-complexity domains were absent. Future labeling was to answer
"what reasoning does this require?" rather than "which current model should
handle it?" The report suggested RouteLLM-style preference data as one possible
future source.

## KISS recommendation

Keep this as an archive only. Do not restore the Claude-tier TF-IDF/LinearSVC
classifier or interpret its perfect small holdout as current routing evidence.
For present work, use the current Sol/Terra model-and-effort routing context,
route-level corpus work, independent OOD evaluation, and the safeguards in the
current prompt-router documentation. If the legacy experiment is revisited,
treat it as a reproducibility baseline and first resolve its corpus-count,
calibration, p99, interface, version-pinning, rollback, and OOD gaps.

## Related notes

- [Prompt-router research index](index.md)
- [Current status](current-status.md)
- [Experiment log](experiment-log.md)
- [Next steps](next-steps.md)
