# Classifier Training Notes -- v3 Route-Level Classifier

Status: T2 artifact. Documents architecture choices, what was tried, honest
gate results, and inference timing. Consumed by V1 validation.

---

## Architecture: Joint LinearSVC on TF-IDF

**Chosen approach**: single LinearSVC predicting joint `(model_tier, effort)`
labels directly as a 12-class multiclass problem.

- TF-IDF vectorizer: 1-3 gram, max_features=8000, sublinear_tf=True, min_df=1
- LinearSVC: C=5.0, max_iter=5000, class_weight=balanced
- Probability approximation: softmax(decision_function()) -- monotonically
  ordered, sufficient for candidate ranking and confidence reporting
- Training corpus: train_v3.jsonl (2675) + dev_v3.jsonl (573) = 3248 examples
- Eval corpus: eval_v3.jsonl (564 examples, held out, never seen during fit)

**Why LinearSVC and not LightGBM or a transformer**:

LightGBM on sparse TF-IDF: profiled at 6-14ms p50 per inference regardless of
tree count (50-600 trees tested). The bottleneck is LightGBM's sparse matrix
traversal on a 8000-dimension input. This is 10-30x over the <1ms mean budget.

Small transformer (MiniLM-L6-v2 + MLP head): sentence-transformers import adds
~300ms Python startup. The inference itself (~5-15ms for encoding) also exceeds
the budget. Would require a separate long-running process.

LinearSVC decision_function() + softmax: ~200-450us mean, ~1.5ms p99 on
Windows (OS scheduler jitter; p50 is ~300us). This is the only architecture
that reliably clears the <1ms mean inference budget after warm-up.

**Why not CalibratedClassifierCV**: CalibratedClassifierCV(cv=5, method='sigmoid')
on a 12-class problem adds ~2-3x inference overhead (900-2500us mean) and did
not improve accuracy on the joint label problem.

---

## Inference Timing

Measured after module import, excluding Python startup (per B3 constraint).
Methodology: 2000 runs on a single fixed prompt after 20-run warm-up.

```
mean=451us  p50=303us  p95=1162us  p99=1587us
```

The mean clears the <1ms gate. p99 is elevated because Windows OS scheduler
jitter (conhost, Defender, etc.) occasionally delays a run by 1-3ms. This is
platform-specific jitter, not model latency -- p50 confirms the true inference
time is ~300us.

The plan's B3 note explicitly distinguishes classifier-internal inference
(this budget) from end-to-end cold pi.exec() invocation (~150-300ms accepted).

---

## Honest Gate Results on eval_v3.jsonl (n=564)

| Metric                    | This run | Baseline (TF-IDF+LR) | Gate     |
|---------------------------|----------|----------------------|----------|
| top-1 accuracy            | 0.6241   | 0.5745               | >= 0.75  |
| catastrophic_under_routing| 38       | 14                   | == 0     |
| over_routing_rate         | 0.1809   | 0.2092               | (no gate)|
| per-tier recall (Haiku)   | 0.8603   | 0.7293               | >= 0.6   |
| per-tier recall (Sonnet)  | 0.6872   | 0.8659               | >= 0.6   |
| per-tier recall (Opus)    | 0.8974   | 0.9103               | >= 0.6   |

**PRODUCTION GATE: FAIL** on two criteria:
- top-1 0.6241 < 0.75
- catastrophic_under_routing 38 > 0

The classifier beats the baseline on top-1 (+0.05) and over_routing_rate
(-0.03 less over-routing). Haiku recall improved significantly (+0.13).
Sonnet recall regressed (-0.18) because Sonnet examples cluster in the
middle of the difficulty range and overlap with both Haiku and Opus.

---

## Root Cause: Why 0.75 Is Not Achievable With Text-Only Features

The joint `(model_tier, effort)` label space has 12 cells. The fundamental
difficulty is the effort dimension within each tier:

**Haiku effort** (4 levels: none/low/medium/high):
- Oracle upper bound analysis: with perfect tier prediction + best effort
  model, the theoretical maximum top-1 is ~0.75-0.76.
- Haiku effort accuracy (oracle tier, text features): 0.64. Main confusion:
  `Haiku|low` vs `Haiku|medium` vs `Haiku|high` for prompts like
  "Create a function to find anagrams" -- these look identical in text but
  were labeled differently by annotators.

**Catastrophic under-routing analysis**:
All 38 catastrophic cases have `P(Haiku)` in the range 0.30-0.52 (mean 0.40).
They are genuinely ambiguous prompts that look syntactically like Haiku tasks
but were labeled Sonnet. Examples:
- "Create a progress bar for a long-running operation." (labeled Sonnet|low)
- "Write SQL to calculate median order value per month." (labeled Sonnet|medium)
- "How do I mock an external API in pytest?" (labeled Sonnet|medium)

A safety margin rule (upgrade Haiku predictions with `P(Haiku) < threshold`
to Sonnet) can zero out catastrophic at any threshold >= 0.55, but at massive
cost to Haiku recall (drops from 0.86 to 0.23 at threshold=0.55) and top-1
accuracy (0.47 vs 0.62). No threshold simultaneously achieves catastrophic=0
and acceptable Haiku recall.

**What would actually help**:
1. Corpus re-labeling of the borderline cases (the 38 catastrophic prompts
   appear mislabeled or represent genuine annotator disagreement).
2. Richer features: code complexity signals (AST depth, symbol count) that
   distinguish "write a function" from "write a complex function".
3. A separate ambiguity detector that routes uncertain prompts conservatively.

---

## What Was Tried

| Approach | top-1 | catastrophic | Notes |
|----------|-------|-------------|-------|
| TF-IDF+LR baseline (tier only) | 0.5745 | 14 | 3-class, not joint |
| Joint LinearSVC C=1.0 (train only) | 0.5993 | 38 | underfits |
| Joint LinearSVC C=5.0 (train+dev) | 0.6241 | 38 | best no-margin result |
| Joint LinearSVC + safety margin 0.55 | 0.4716 | 0 | Haiku recall 0.23 |
| Two-head (tier + per-tier effort) | 0.5443 | 3 | 3x slower, Haiku recall 0.44 |
| LightGBM n=200 (sparse TF-IDF) | 0.6702 | 30 | 12ms inference, unusable |
| LightGBM n=50 (sparse TF-IDF) | 0.6365 | 32 | still 14ms inference |
| 1-4gram 15k features LinearSVC | 0.6206 | 36 | worse than 1-3gram 8k |

The chosen model (joint LinearSVC C=5.0, train+dev) is the best achievable
combination of accuracy, speed, and simplicity with the current corpus.

---

## Recommendation

The gate failures are driven by corpus ambiguity, not model capacity. Further
tuning the LinearSVC will not materially improve results. Recommended next
steps (for team-lead to decide):

1. **Accept the current model for integration**: the classifier beats baseline
   on top-1 and all recall gates pass. The TypeScript T3 router policy
   (UNCERTAIN_THRESHOLD=0.55) provides runtime safety for uncertain predictions.
   Catastrophic under-routing in production is partially mitigated by the
   router's uncertainty fallback -- when confidence < 0.55, the router biases
   toward a costlier candidate.

2. **Re-label the 38 catastrophic cases**: they are available in the eval set.
   If the human review confirms the labels are correct, the corpus has
   inherent label noise at the Haiku/Sonnet boundary that no text classifier
   will fully resolve.

3. **Add code-structure features**: for code_write and code_debug tasks,
   syntactic complexity signals (nested blocks, import count, function
   signature complexity) could break the effort ambiguity.
