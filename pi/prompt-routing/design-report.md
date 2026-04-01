# Prompt Routing Classifier — Design Report

**Author**: ML Research Lead  
**Date**: 2026-03-31  
**Status**: Final (post-evaluation)

---

## 1. Problem Statement

Route incoming prompts to one of three Claude model tiers based on task complexity:

| Tier | Model | Prompt Characteristics |
|------|-------|----------------------|
| `low` | Haiku | Factual lookups, syntax questions, single-step tasks |
| `mid` | Sonnet | Multi-step reasoning, code tasks with context, moderate analysis |
| `high` | Opus | Architectural design, security analysis, complex reasoning chains |

**Hard constraints:**
- ≥85% accuracy on holdout set
- Zero HIGH→LOW inversions (worst-case misrouting — Opus-complexity task sent to Haiku)
- <1ms inference (pure local, no remote calls)

---

## 2. Approach Survey

Three approaches were evaluated before committing:

### 2a. TF-IDF + Linear Classifier (selected)
- **Pros**: Sub-millisecond inference, no GPU, no remote calls, interpretable features, strong on vocabulary-driven complexity signals
- **Cons**: No semantic understanding; relies on n-gram surface patterns
- **Assessment**: Complexity tiers in practice correlate strongly with vocabulary (e.g., "shard", "consensus protocol", "race condition" → HIGH; "append", "sort", "variable" → LOW). TF-IDF captures this well.

### 2b. Sentence Embeddings (e.g., sentence-transformers)
- **Pros**: Semantic understanding, generalizes better to paraphrases
- **Cons**: Requires transformer inference; even the smallest models exceed 1ms; adds heavy dependency; overkill for vocabulary-driven classification
- **Verdict**: Eliminated by the <1ms inference constraint.

### 2c. Heuristic Features (prompt length, clause count, vocabulary richness)
- **Pros**: Extremely fast, interpretable
- **Cons**: Length ≠ complexity (board review flagged this); "What is 15% of 200?" is short and LOW, but many HIGH prompts require only a paragraph. Fails the "HIGH class must include ambiguous cases where length alone doesn't signal complexity" data quality constraint.
- **Verdict**: Useful as auxiliary signal, but insufficient as primary classifier.

---

## 3. Model Selection — Board Review Consensus

Three teams reviewed classifier options on the TF-IDF feature basis:

| Team | Preferred Model | Rationale |
|------|----------------|-----------|
| Planning | ComplementNB | Conservative, lower false-positive rate on HIGH class |
| Engineering | SGDClassifier | Sharp decision boundaries, fast convergence |
| **Consensus** | **LinearSVC + CalibratedClassifierCV** | Sharpness of linear kernel + calibrated probabilities for threshold tuning |

**Why LinearSVC over ComplementNB**: ComplementNB showed higher false-positive rate on HIGH in cross-validation — risk of routing Opus-complexity prompts to Sonnet.

**Why LinearSVC over SGDClassifier**: SGDClassifier exhibited threshold instability under distribution shift (Validation team concern). LinearSVC converges to the global optimum for the given C.

**Why CalibratedClassifierCV wrapper**: Provides probability estimates via Platt scaling, enabling future threshold tuning without retraining the base model.

---

## 4. Feature Engineering

```
TfidfVectorizer(
    max_features=10000,   # vocabulary cap — sufficient for ~180 training examples
    ngram_range=(1, 2),   # bigrams capture "race condition", "distributed system" etc.
    sublinear_tf=True     # log(1 + tf) dampens high-frequency term dominance
)
```

**Key complexity signals captured by bigrams:**
- LOW: "what is", "how do", "in python"
- MID: "unit tests", "async await", "connection pooling"
- HIGH: "distributed consensus", "race conditions", "zero downtime", "multi-tenant"

---

## 5. Training Corpus

180 labeled examples, 60 per class (±0 imbalance):
- **LOW** (60): Factual/syntax questions, single-function tasks, definition lookups
- **MID** (60): API endpoints, algorithm implementations, middleware, CI/CD tasks
- **HIGH** (60): Distributed systems design, security analysis, architectural decisions, consensus protocols

Split: stratified 80/20 → 144 train / 36 test (12 per class in holdout).

---

## 6. Hyperparameter Search

Grid search over `C ∈ {0.01, 0.1, 1.0, 10.0}` with 5-fold stratified cross-validation. Best C selected by mean CV accuracy. Final model retrained on full 80% training set.

---

## 7. Serialization & Security

**Format**: `pickle` (standard sklearn serialization)  
**Security risk**: `pickle.load()` executes arbitrary Python. Mitigations:
1. SHA256 sidecar file (`model.pkl.sha256`) written immediately after training
2. `evaluate.py` verifies SHA256 before loading — hard exits on mismatch
3. Model generated locally; never load from untrusted source

---

## 8. Artifacts

| File | Owner | Purpose |
|------|-------|---------|
| `data.py` | Data Engineer | Labeled corpus (180 examples) |
| `train.py` | Data Engineer + Model Engineer | TF-IDF + LinearSVC training pipeline |
| `model.pkl` | Model Engineer | Serialized sklearn Pipeline |
| `model.pkl.sha256` | Model Engineer | Integrity sidecar |
| `test_set.pkl` | Data Engineer | Held-out test split |
| `training-log.txt` | Model Engineer | CV scores, hyperparameter choices |
| `evaluate.py` | Eval Engineer | Holdout evaluation harness |
| `eval-report.md` | Eval Engineer | Acceptance gate results |
| `design-report.md` | ML Research Lead | This document |

---

## 9. Acceptance Criteria

- [x] Accuracy ≥85% on holdout set
- [x] HIGH→LOW inversions = 0
- [x] Inference <1ms per prompt
- [x] SHA256 sidecar present and verified
- [x] `evaluate.py --holdout` exits 0

*Verification results documented in `eval-report.md`.*

---

---

## 10. Board Review — Planning Lead

**Reviewer**: Planning Lead  
**Date**: 2026-03-31  
**Stance**: Conditional Approve — concerns about conservative routing bias and corpus coverage

### Primary Concern: Over-Routing to LOW

My original preference was ComplementNB specifically because it errs conservative on the HIGH class — it is better to send an ambiguous prompt *up* a tier than down. The shipped LinearSVC achieves 100% accuracy on a 37-example holdout, which is an encouraging signal but not sufficient evidence that it handles the cases I care about most.

The Planning team's concern has always been **false negatives on HIGH** — prompts that *should* go to Opus but get routed to Sonnet or Haiku. The eval report confirms zero HIGH→LOW inversions, but does not report the HIGH→MID false negative rate on novel prompts outside the training distribution.

### Corpus Scope Risk

181 examples is small. The corpus covers well-defined prompt archetypes ("Design a distributed consensus protocol", "What is Python?") but real user traffic contains:

- **Ambiguous framing**: "Can you help me think through a design?" — is this HIGH or MID?
- **Domain shifts**: prompts in non-English, code-heavy prompts with minimal natural language, conversational follow-ups without context
- **Compound requests**: "Explain what a variable is, then design a multi-tenant auth system" — which tier wins?

None of these appear in the corpus. The model will route them based on TF-IDF surface vocabulary, which may not generalise.

### Specific Questions for the ML Team

1. What is the HIGH→MID false negative rate? The eval report only gates on HIGH→LOW. A flood of HIGH→MID misroutes degrades quality without triggering the inversion alarm.
2. Has the model been tested on prompts *not* in the original training vocabulary? Out-of-vocabulary prompt patterns (e.g., a HIGH prompt with no domain-specific jargon) may fall through to LOW.
3. Is there a fallback policy when confidence is low? LinearSVC (without calibration) has no probability output — the model cannot express uncertainty. A mid-confidence ambiguous prompt and a high-confidence obvious prompt are indistinguishable to downstream consumers.

### Recommendations

1. **Add a confidence floor**: Reintroduce `CalibratedClassifierCV` when sklearn 1.9 stabilises the `cv='prefit'` replacement, or add a `decision_function` threshold check — route to the tier *above* the predicted class when margin is within a configurable epsilon.
2. **Grow the corpus to 500+ examples**: Specifically add ambiguous framing, cross-domain prompts, and non-English examples before the next retraining cycle.
3. **Log HIGH→MID misroutes in production**: Add a telemetry counter so we can observe whether Opus is being systematically under-utilized.

**Planning Lead sign-off**: Approve for initial deployment with the monitoring commitment in `eval-report.md §9`. Block any production scale-up until the corpus reaches 500 examples.

---

## 11. Post-Build Decision: CalibratedClassifierCV in Production

`cv='prefit'` was removed in scikit-learn 1.8.0. Benchmarked alternatives:

| Config | Mean Inference | Decision |
|--------|---------------|----------|
| `CalibratedClassifierCV(cv=5)` | ~3700 us | Rejected: 5x SVM ensemble |
| `CalibratedClassifierCV(ensemble=False)` | ~1557 us | Rejected: exceeds 1ms |
| `LinearSVC` direct | ~490 us | **Shipped** |

`CalibratedClassifierCV(cv=5)` is used in the **grid search phase** for stable C selection. The production `model.pkl` is `TfidfVectorizer + LinearSVC` — meets all hard constraints with zero compromise on accuracy or inversion safety.

---

## 12. Board Review — Engineering Lead

**Reviewer**: Engineering Lead  
**Date**: 2026-03-31  
**Stance**: Approve — implementation is clean and operationally sound; three actionable hardening items

### What the Team Got Right

The implementation makes the right engineering trade-offs throughout:

- **Pipeline encapsulation**: `TfidfVectorizer + LinearSVC` is correctly wrapped in a single sklearn `Pipeline`. A single `pipeline.predict(texts)` call handles both transform and classification — no caller-side feature extraction, no state leakage between requests.
- **Reproducible training**: Fixed `random_state=42` throughout (split, CV, LinearSVC). Any engineer can re-run `train.py` and get byte-for-byte identical `model.pkl`.
- **SHA256 sidecar**: Written atomically immediately after `model.pkl` is closed. The verification-before-load pattern in `evaluate.py` is correct.
- **Stratified split**: `train_test_split(..., stratify=labels)` is the right call. An unstratified split on 181 examples could accidentally produce a 0-example class in the holdout.
- **Inference benchmark methodology**: 20-run warm-up before 2000-run timing window is correct. Discards JIT/import overhead. Mean is the right gate metric on this workload; p99 on Windows is dominated by scheduler quantums, not model latency.

### Hardening Items

**1. No `router.py` production interface**

The model-engineer's spec called for a `router.py` that loads the model once at startup, verifies SHA256, and exposes a `route(prompt: str) -> str` function. This was not built. Currently the only way to call the model is to directly `pickle.load()` + call `pipeline.predict()`. In production, every call site would need to duplicate the load-and-verify logic.

*Required*: Add `prompt-routing/router.py` with:
```python
def route(prompt: str) -> str:  # returns 'low' | 'mid' | 'high'
    ...
```
Model loaded once at module import, SHA256 verified on first load, thread-safe for concurrent calls.

**2. `pickle` is the wrong serialisation format for a shipped artifact**

The SHA256 check mitigates the worst-case attack, but `pickle` is still a footgun. The model is a `Pipeline` containing a `TfidfVectorizer` and a `LinearSVC`. Both are serialisable as pure numpy arrays + metadata. `joblib.dump` / `joblib.load` is the sklearn-standard alternative — same security surface, but with better cross-platform and cross-version compatibility guarantees than `pickle`. Recommend switching to `joblib` for the next retraining cycle; no code changes needed beyond the dump/load calls.

**3. Pinned sklearn version is missing**

The `model.pkl` was serialised with sklearn 1.8.0. Loading it with a different sklearn version (especially a minor bump that changes internal Pipeline serialisation) will raise `AttributeError` or silently produce wrong predictions. There is no `requirements.txt` or `pyproject.toml` pinning `scikit-learn==1.8.0` in `prompt-routing/`.

*Required before production*: Add `prompt-routing/requirements.txt`:
```
scikit-learn==1.8.0
numpy>=2.0
```

### Minor Observations

- `train.py` re-runs the full grid search on every invocation even when only `best_C` matters. For 181 examples this is negligible (< 5 seconds), but worth noting for when the corpus grows.
- The `__pycache__` directory is committed to the repo. Add `**/__pycache__/` and `*.pkl` to `.gitignore` for this directory.
- CV std dev of 0.0525 at `C=0.01` is higher than at `C=1.0` (0.0478). The gap is small but consistent with LinearSVC being under-regularised at very low C on a sparse high-dimensional input. The selected `C=1.0` is correct.

### Verdict

**Engineering Lead sign-off**: Approve for deployment. Require `router.py` and `requirements.txt` before any caller integrates the model. `joblib` migration is a nice-to-have for the next cycle, not a blocker.

---

## 13. Board Review — Validation Lead

**Reviewer**: Validation Lead  
**Date**: 2026-03-31  
**Stance**: Conditional Approve — gate passes; four items must be resolved before production scale-up

### Gate Verdict: PASS on Hard Constraints

All four acceptance criteria pass. The validation team does not block this release. However, the following items represent gaps that must be addressed before this system handles production traffic at scale.

### QA Findings

**1. Holdout is 37 examples — perfect accuracy is suspicious, not reassuring**

A 37-example holdout with 100% accuracy on a 3-class problem is a yellow flag, not a green one. With a vocabulary-driven TF-IDF model trained on 144 examples drawn from the same distribution as the 37-example holdout, near-perfect in-distribution performance is expected. It tells us the model memorised the signal in the training vocabulary. It does not tell us the model generalises.

The QA team requires an **out-of-distribution evaluation set**: 50+ prompts written independently of the training corpus, covering paraphrases of known prompts, prompts with novel vocabulary, and adversarial cases (e.g., a simple-sounding prompt that requires Opus reasoning). This is not a blocker for initial deployment but is required before the model handles > 10% of production traffic.

**2. Test suite covers the happy path; adversarial cases are missing**

The `tests/` suite (54 tests) correctly covers:
- Corpus integrity and balance
- Routing correctness on corpus-drawn examples
- HIGH→LOW inversion safety
- SHA256 verification failure modes
- Acceptance gate exit codes

Gaps the QA team flags:
- No test for **out-of-vocabulary prompts** (e.g., a prompt containing no words from the training vocabulary). Expected behaviour: the model should degrade gracefully, not raise an exception.
- No test for **unicode / non-ASCII input** (e.g., a prompt in French, or a prompt containing emoji). `TfidfVectorizer` handles these but the routing outcome is undefined.
- No test for **concurrent inference** — `pipeline.predict()` on the same `Pipeline` object from multiple threads. sklearn Pipelines are not guaranteed thread-safe for predict calls that share mutable state.
- No **regression test that pins the model SHA256**. If someone re-runs `train.py`, the model changes silently. A test that asserts `model.pkl.sha256 == KNOWN_GOOD_DIGEST` would catch accidental retraining.

**3. Inference p99 exceeds SLA on the test machine**

The eval report acknowledges p99 of 1103–1192 us on Windows. The validation team accepts the Windows scheduler jitter explanation for development, but requires a **Linux benchmark** before production sign-off. If the production host is Linux (likely), the p99 should be measured there. The acceptance gate must gate on p99, not just mean, when an SLA is in effect.

**4. No rollback procedure documented**

If a bad `model.pkl` is deployed (wrong accuracy, regression in inversions), there is no documented rollback path. The SHA256 sidecar detects tampering but does not help if the retrained model is legitimately worse. Require: git-tag each `model.pkl` + `model.pkl.sha256` pair at training time so the previous version can be restored.

### Security Findings

**Accepted risks (mitigated)**:
- `pickle` deserialization: SHA256 pre-verification implemented. Acceptable.
- Model file permissions: Not enforced by code. Acceptable with documented procedure.

**Open risk**:
- SHA256 sidecar and model are co-located on the same filesystem. An attacker with write access can update both atomically. For a higher-assurance deployment, the SHA256 should be stored out-of-band (e.g., in a secrets manager or signed with a private key). Not required for current threat model but should be noted in the runbook.

### Validation Lead Sign-Off

**Approve for initial deployment** (< 10% traffic). Block scale-up until:
- [ ] Out-of-distribution evaluation set (50+ examples) evaluated
- [ ] OOV and unicode handling tested
- [ ] Linux p99 benchmark completed
- [ ] Model versioning / rollback procedure documented

---

## 14. Research Findings — Routing Strategy Literature Review

**Date**: 2026-03-31  
**Trigger**: Three external findings reviewed against empirical model data.

---

### Finding 1 — Uncertainty-Based Routing (AutoMix, "Uncertainty-Based Two-Tier Selection")

**What the papers say:** Route based on the confidence score, not just the predicted class. Rather than hard class boundaries, use: if P(high) > 0.7 → Opus, elif P(mid) > 0.6 → Sonnet, else → Haiku. The claim is this directly addresses HIGH→LOW inversions, since uncertain cases default down to the cheapest model.

**What our data shows:** Tested exhaustively on the 317-example holdout.

| Scheme | Accuracy | Inversions | Notes |
|--------|----------|-----------|-------|
| Current: argmax + P(high)>0.20 floor | **90.9%** | **0** | Production |
| P(high)>0.70 → Opus, P(mid)>0.60 → Sonnet, else Haiku | 72.9% | **38** | Paper's exact scheme |
| P(high)>0.60 → Opus, P(mid)>0.60 → Sonnet, else Haiku | 80.4% | **14** | More permissive |
| P(high)>0.60 → Opus, P(low)>0.50 → Haiku, else Sonnet | 86.4% | **0** | Better formulation |

The paper's scheme (P(high)>0.70) creates **38 inversions** — worse than baseline.

**Root cause:** The paper assumes well-calibrated probabilities (Brier < 0.01). Our `softmax(decision_function)` approximation has Brier = 0.044. With this calibration, 31% of true-HIGH prompts have P(high) < 0.70 — they land in the "else → Haiku" bucket.

P(high) distribution for true-HIGH examples:

| Percentile | P(high) value |
|-----------|--------------|
| p25 | 0.679 |
| p50 | 0.787 |
| p75 | 0.843 |
| p90 | 0.896 |
| > 0.70 | 69% |

Crucially: **P(high) > 0.50 = 0% of true-LOW** and **0% of true-MID**. This means the correct uncertainty formulation for our model is not the paper's scheme but a *confident-LOW-to-Haiku* rule:

> if P(high) > T_high → Opus, elif P(low) > T_low → Haiku, else → Sonnet

This routes uncertain cases to **Sonnet** (the middle tier), not Haiku. With T_high=0.60, T_low=0.50 this achieves 86.4% accuracy and zero inversions — but is still 4.5 points below the current argmax+floor scheme.

**Conclusion:** The paper's technique requires properly calibrated probabilities to outperform argmax + conservative floor. With Brier ≈ 0.007 (CalibratedClassifierCV), the uncertainty thresholds would likely work as described. With Brier ≈ 0.044 (softmax approximation), argmax + P(high)>0.20 floor is already optimal.

**Recommendation:** Re-evaluate uncertainty routing after switching to CalibratedClassifierCV (pending Linux inference benchmark). The confident-LOW-to-Haiku formulation (P(high)>T, P(low)>T, else Sonnet) is the correct implementation for safety-first routing regardless of calibration quality.

---

### Finding 2 — KNN Over TF-IDF for Hard Cases

**What the paper suggests:** Store labeled example embeddings; route by nearest-neighbor label. KNN would outperform TF-IDF for ambiguous mid/high prompts where vocabulary alone doesn't signal complexity (e.g., `"apply the terraform changes"` — short, imperative, no complexity markers).

**Assessment:** Correct diagnosis, wrong scope for v1.

The chat-log corpus analysis confirmed this: TF-IDF accuracy on DevOps/infrastructure chat prompts was 58% vs 91% on coding prompts, precisely because operational prompts lack vocabulary-level complexity signals. A KNN router over sentence embeddings would handle `"apply the terraform changes"` correctly — it would find the nearest labeled example by semantic similarity, not by n-gram overlap.

**Why not v1:** Requires an embedding model. Even the smallest viable model (all-MiniLM-L6-v2, 22MB) runs at 5–15ms on CPU — 10× over the 1ms inference budget. ONNX-quantized variants may reach 3–5ms.

**v2 upgrade path:**
1. If the inference budget is relaxed to 10ms (acceptable for per-session routing, not per-turn), all-MiniLM-L6-v2 becomes viable
2. The KNN router would use the existing labeled corpus as the reference set — no retraining needed, just embedding the 1,582 examples
3. A hybrid approach (TF-IDF for high-confidence cases, KNN for low-confidence cases) would keep mean inference near 1ms while improving accuracy on the hard cases

**Corpus implication:** The KNN router's quality depends directly on the diversity of labeled examples. The DevOps/infrastructure prompts in `labeled_history.csv` (594 examples, currently excluded from training) would become the most valuable part of the KNN reference set — they cover operational vocabulary that the coding-focused JSON files don't.

---

### Finding 3 — RouteLLM Generalization: Task Complexity vs. Model Identity

**What the paper found:** A BERT classifier trained on GPT-3.5 vs GPT-4 preference data transferred to other model pairs (e.g., Claude Haiku vs Opus) without retraining. Routers generalize when they learn *task complexity* rather than *model-specific response quality*.

**How this applies to the current corpus:** The current `training_corpus.json` labels are already aligned with this principle:

- `low` = "simple factual lookups, syntax questions, single-step tasks" — complexity-based
- `mid` = "multi-step tasks, moderate analysis, code with context" — complexity-based
- `high` = "architecture decisions, security, distributed systems, scale" — complexity-based

Labels are **not** anchored to Haiku/Sonnet/Opus by name or capability. They describe what kind of reasoning the prompt requires. This means:

1. When Anthropic releases claude-haiku-4 or claude-opus-5, the routing labels remain valid — we're routing by task complexity, not by "what haiku-3 can handle"
2. The classifier transfers to other provider pairs (e.g., GPT-4o-mini vs GPT-4o) without retraining, by the RouteLLM finding
3. The corpus growth strategy should preserve this property: new examples should be labeled by what they require, not by testing them against a specific model

**One gap:** The current HIGH tier is over-indexed toward distributed systems / architecture vocabulary (the handcrafted corpus and the `coding_prompts_high.json` files). HIGH prompts from other domains (legal analysis, scientific reasoning, creative direction) are absent. A RouteLLM-style classifier trained on preference data would capture these naturally; ours would mis-route them to LOW. This is the primary argument for eventually incorporating `routellm/gpt4_dataset` into the training corpus.

**Corpus labeling principle to enforce going forward:**

> Label by "what reasoning does this require?", not "which model should handle it?". A prompt should be HIGH if it requires architectural thinking, multi-constraint reasoning, or expert judgment — regardless of whether the current Opus can answer it well.
