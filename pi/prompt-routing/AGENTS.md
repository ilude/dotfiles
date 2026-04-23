# Prompt Routing Classifier — Project AGENTS.md

Agent instructions specific to the `prompt-routing/` project. These take
precedence over the global Pi AGENTS.md for any work in this directory.

---

## What This Is

A local scikit-learn classifier that routes incoming prompts to one of three
Claude model tiers based on complexity:

| Label | Model | When to use |
|-------|-------|-------------|
| `low` | Haiku | Factual lookups, syntax questions, single-step tasks |
| `mid` | Sonnet | Multi-step tasks, code with context, moderate analysis |
| `high` | Opus | Architecture decisions, security analysis, distributed systems |

**Hard constraints (never regress these):**
- Accuracy ≥ 85% on holdout set
- Zero HIGH→LOW inversions — routing an Opus-complexity prompt to Haiku is the
  worst possible failure mode
- Mean inference < 1ms (pure local sklearn, no remote calls)
- SHA256 sidecar must be present and match `model.pkl` before any load

---

## Current Model State

| Item | Value |
|------|-------|
| Algorithm | TF-IDF (ngram 1-2, sublinear_tf, max_features=7000) + LinearSVC (C=1.0) |
| Probability | softmax(decision_function) -- Brier(HIGH)=0.044, passes <0.10 gate |
| Confidence floor | P(high) > 0.20 -> escalate low to mid (3% traffic, 0 inversions) |
| Training corpus | 1,582 examples -- 508 low / 462 mid / 612 high |
| Corpus source | `data/training_corpus.json` v2.2 |
| Holdout accuracy | 92.1% base / 90.9% safety-adjusted (317-example holdout) |
| HIGH->LOW inversions | 0 (base) / 0 (after floor) |
| Brier(HIGH) | 0.0442 (gate: < 0.10) |
| Mean inference | ~610 us |
| model.pkl SHA256 | `934190784b7561257879821cf6ab8f02d9036a76209ed2ac9f1fa510d904a2cb` |

`data.py` is a thin loader -- reads from `data/training_corpus.json`.
Routing uses a P(high) > 0.20 confidence floor (router.py `HIGH_FLOOR_THRESHOLD`).
To change the threshold: update both `router.py` and `evaluate.py`, then re-run
`evaluate.py --holdout` to verify the threshold analysis table.

## Corpus Expansion — What Was Tried and Why It Failed

### Attempt: history.jsonl labeling (2026-03-31)

**What we did:**
1. Extracted ~4,644 usable prompts from `~/.dotfiles/claude/history.jsonl`
2. Used `label_history.py` to batch-label 782 candidates via `claude -p --model opus`
3. Filtered to 594 high-confidence usable labels
4. Merged 363 new examples (121 per class, capped for balance) into `data.py`
5. Retrained → **model failed the acceptance gate**

**Results on expanded 544-example corpus:**

| Metric | Original (181) | Expanded (544) | Gate |
|--------|---------------|----------------|------|
| Holdout accuracy | 100% | 77.98% | ≥ 85% ❌ |
| HIGH→LOW inversions | 0 | 1 | = 0 ❌ |
| Mean inference | 490 µs | 591 µs | < 1ms ✓ |

Tried C ∈ {1, 10, 100, 1000} — accuracy stuck at 77–78%, inversion persisted
across all C values. The failure is **structural, not a hyperparameter problem.**

**Root cause — domain skew and vocabulary overlap:**

The `history.jsonl` data comes from a single user's DevOps/infrastructure
conversations. In that domain, low/mid/high prompts share so much surface
vocabulary that TF-IDF bigrams cannot reliably separate them:

- `"what does cross platform compatibility look like for various language choices?"`
  → Opus labeled HIGH (architectural language stack decision), model predicted LOW
  (matched "what does X look like" LOW pattern). Genuinely ambiguous.
- `"Configure CloudWatch Agent to scrape localhost:9586/metrics"` → labeled LOW
  but predicted MID (config task vocabulary bleeds into mid tier)
- `"apply the terraform changes"` → labeled MID but predicted HIGH (infrastructure
  action vocabulary with no complexity signal)

The original 181-example corpus was handcrafted with deliberately distinct
vocabulary per tier. The history.jsonl data has real-world tier ambiguity that
a linear TF-IDF classifier cannot resolve without more signal.

**Outcome:** Reverted `data.py` to original 181 examples. `model.pkl` SHA256
matches the pre-expansion hash. All 54 tests pass.

---

## What the Corpus Actually Needs

### Problem 1: Too small for production confidence (Validation Lead)

37-example holdout with 100% accuracy on in-distribution data is not
meaningful validation. The model memorises the vocabulary of the training
corpus. It has never been tested on prompts written independently of the
training distribution.

**Required before > 10% production traffic:**
An out-of-distribution evaluation set of 50+ prompts, written independently
of `data.py`, covering:
- Paraphrases of known prompts with different vocabulary
- Prompts with no domain-specific jargon (e.g., a HIGH architectural question
  phrased as a simple question)
- Prompts from domains not in `data.py` (data science, legal, writing)
- Adversarial cases: SHORT prompts that require Opus, LONG prompts that only
  need Haiku

### Problem 2: Domain skew — history.jsonl is not suitable as-is (Planning Lead)

The history.jsonl corpus is ~80% DevOps/infrastructure. In that domain:
- LOW and MID overlap heavily (operational questions vs. implementation tasks)
- MID and HIGH overlap heavily (config tasks vs. architecture decisions)
- Very few genuinely LOW-tier prompts (most are operational, not definitional)

Adding it raw degrades the classifier. It needs curation, not bulk import.

### Problem 3: No external benchmark data (ML Research Lead)

The most relevant external dataset is `routellm/gpt4_dataset` (~108k prompts,
HuggingFace, Apache 2.0 license). It has a `mixtral_score` field (1–5) that
measures how much better GPT-4 is vs Mixtral — a noisy proxy for routing tier.

The "IPR dataset with 1.5M prompts" referenced in session notes could not be
verified to exist under that name. The closest candidates are:
- `routellm/gpt4_dataset`: 108k records, has quality scores, freely available
- `lmsys/lmsys-chat-1m`: 1M conversations, no quality labels, gated access

### Problem 4: No calibrated confidence (Engineering Lead)

`LinearSVC` has no probability output. The router cannot express "I'm not
sure" — a marginally classified prompt and an obvious one look identical to
callers. This means there is no fallback when the model is uncertain.

---

## Recommended Corpus Expansion Path

In priority order:

**Step 1 — OOD evaluation set (unblocks > 10% traffic)**
Write 50–75 prompts independently of `data.py`. Aim for 15–25 per class.
Focus on the ambiguous boundary cases: short HIGHs, long LOWs, prompts with
no domain jargon. Add to `tests/test_model.py` as parametrized OOD assertions.

**Step 2 — Curated history.jsonl additions**
From the 594 labels in `labeled_history.csv`, manually review and select only
the prompts where the tier signal is unambiguous. Rough selection criteria:
- LOW: definitional, factual, or single-command ("what is X", "show me Y")
  with no implicit architectural context
- MID: concrete multi-step task with clear deliverable and no scale/design concerns
- HIGH: explicitly involves design decisions, trade-offs, scale, or security —
  NOT just "big" prompts

Estimated usable after curation: ~80–100 examples (not 363).

**Step 3 — External data from routellm/gpt4_dataset**
Use `mixtral_score` as a pre-filter (score 1–2 → LOW candidates, score 4–5 →
HIGH candidates), then batch-label a sample with `claude -p --model opus` the
same way history.jsonl was processed. This is the fastest path to 100+ new
HIGH examples from a diverse prompt distribution.

**Step 4 — Probabilistic routing**
Once the corpus is ≥ 500 curated examples, revisit `CalibratedClassifierCV`.
In sklearn 1.8.0 `cv='prefit'` was removed; `ensemble=False` was 1.5ms (too
slow). Monitor sklearn changelog for a single-model calibration path that fits
the <1ms budget. Until then, expose `LinearSVC.decision_function()` scores so
callers can implement their own confidence threshold.

---

## Scripts

| Script | Purpose |
|--------|---------|
| `router.py` | **Production interface** -- `from router import route; tier = route(prompt)` |
| `audit.py` | Daily audit -- compare routing log vs Opus labels, flag divergences |
| `data.py` | Training corpus -- edit this to add examples |
| `train.py` | Retrain pipeline -- run after editing `data.py` |
| `evaluate.py --holdout` | Acceptance gate -- must exit 0 before shipping |
| `label_history.py` | Batch-label history.jsonl via `claude -p --model opus` |
| `merge_labels.py` | Merge labeled CSV into `data.py` -- supports `--source` for audit CSVs |
| `tests/` | 54 unit tests -- run with `python -m pytest tests/` |

**Using the router:**
```python
from router import route
tier = route("Your prompt here")   # returns 'low' | 'mid' | 'high'

from router import route_batch
tiers = route_batch(["prompt1", "prompt2", ...])
```
Every call is logged to `logs/routing_log.jsonl`. Set `LOG_ROUTING=0` to disable.

**Daily audit workflow:**
```bash
python audit.py                        # audit unreviewed entries, write report
python audit.py --model sonnet         # faster / cheaper
python audit.py --since 2026-04-01     # only recent entries
python audit.py --dry-run              # preview without API calls
```
Outputs `logs/audit_YYYY-MM-DD.json` and `logs/audit_YYYY-MM-DD_divergences.csv`.
CRITICAL divergences (router=low, opus=high) are printed prominently -- these
are production HIGH->LOW inversions, the worst failure mode.

**Corpus feedback loop:**
```bash
# 1. Audit, review divergences CSV, remove rows you disagree with
python audit.py

# 2. Merge reviewed divergences
python merge_labels.py --source logs/audit_YYYY-MM-DD_divergences.csv --dry-run
python merge_labels.py --source logs/audit_YYYY-MM-DD_divergences.csv

# 3. Retrain and verify
python train.py && python evaluate.py --holdout && python -m pytest tests/
```

**history.jsonl labeling workflow:**
```bash
python label_history.py --signal high,low --resume
python merge_labels.py --cap <N> --dry-run
python merge_labels.py --cap <N>
python train.py && python evaluate.py --holdout && python -m pytest tests/
```

**Do not merge** without reviewing samples first. Bulk import without curation
breaks the classifier (see 2026-03-31 attempt above). Always check the confusion
matrix for inversion regressions before committing.
---

## Files — Do Not Edit Without Reading This First

| File | Notes |
|------|-------|
| `model.pkl` | Regenerated by `train.py` — do not edit directly |
| `model.pkl.sha256` | Written atomically by `train.py` — always co-located |
| `test_set.pkl` | Regenerated by `train.py` — holdout split, not labels |
| `labeled_history.csv` | Append-only output of `label_history.py` — safe to grow |
| `data.py` | Core training corpus — validate syntax after any edit |

`*.pkl` files are gitignored (or should be). Never commit `model.pkl` to the
repo — it changes every retrain and contains serialised Python objects.

---

## Pi Extension

The router is wired into Pi as an automatic extension.

**Location:** `~/.dotfiles/pi/extensions/prompt-router.ts`
(symlinked to `~/.pi/agent/extensions/prompt-router.ts` via dotfiles)

**Behavior:**
- Every interactive prompt is classified before the agent starts
- Model switches automatically: Haiku / Sonnet / Opus based on tier
- Never-downgrade rule: session stays at the highest tier reached
- Slash commands (`/commit`, `/yt`, etc.) are not classified -- model unchanged

**Commands:**
| Command | Effect |
|---------|--------|
| `/router-status` | Show current tier, session max, last classification |
| `/router-reset` | Reset session max back to low, re-enable routing |
| `/router-off` | Disable routing (keep current model) |
| `/router-on` | Re-enable routing |

**Footer indicator:** A status item shows the active tier after each prompt.
- `▸ Haiku` -- low tier
- `▸▸ Sonnet` -- mid tier
- `▸▸▸ Opus` -- high tier

**Routing log:** Every classified prompt is appended to
`prompt-routing/logs/routing_log.jsonl` with tier, probabilities, and
floor-applied flag. Run `python audit.py` to compare against Opus labels.

---

## v3 ConfGate Classifier Live (SUPERSEDES Phase 0)

Phase 0 (static tier->effort bridge) is **superseded** by the v3 ConfGate
shipment. The live extension at `pi/extensions/prompt-router.ts` now consumes
the v3 route-level classifier directly and applies the simplified runtime
policy described below.

### Classifier: ConfGate (default)

`classify.py` defaults to `--classifier confgate`. ConfGate uses LightGBM as
the primary route predictor and consults T2 (LinearSVC) only when LGB's
confidence falls below `CONF_GATE = 0.50`. Implementation:
`classifier_confgate.py`. Both backing joblibs are SHA256-verified at load:
`models/router_v3_lgbm.joblib` and `models/router_v3.joblib`.

Wire output conforms to `docs/router-v3-output.schema.json` (schema_version
`3.0.0`) and carries an optional `ensemble_rule` field for observability
(values: `lgb-confident`, `agree`, `t2-overrides`, `lgb-fallback`).

Fallback on classifier failure: malformed JSON, unknown `schema_version`, or
missing required fields all route through the TypeScript null-fallback path.
The router keeps the previous applied route, logs a warning via
`ctx.ui.notify`, and does not crash.

### Runtime policy (ship config)

The session-wide permanent escalation rule (`applyNeverDowngrade`) was retired.
The hysteresis state machine remains in the code but is effectively disabled
under ship settings:

| Knob | Ship value | Meaning |
|------|------------|---------|
| `router.policy.N_HOLD` | `0` | Hysteresis hold disabled -- any hold inflated cost in shadow-eval |
| `router.policy.K_CONSEC` | `1` | Coupled to `N_HOLD` |
| `router.policy.COOLDOWN_TURNS` | `2` | Runtime escalation cooldown on failure signals |
| `router.policy.UNCERTAIN_THRESHOLD` | `0.55` | Dormant; retained for future use |
| `router.policy.UNCERTAIN_FALLBACK_ENABLED` | `false` | Disabled -- fallback blocked legitimate downgrades |
| `router.policy.DOWNGRADE_THRESHOLD` | `0.85` | Downgrade confidence gate (dormant at N_HOLD=0) |
| `router.effort.maxLevel` | `high` | Effort cap -- blocks `xhigh` regardless of classifier output |

Full per-key reference in `docs/settings-doc.md`.

### Known trade-off

Shadow-eval on the synthetic `eval_v3` benchmark showed both the v3 classifier
(ConfGate and T2) routing more expensive than legacy-oracle in absolute terms.
The benchmark is structurally biased toward legacy: it derives prompts from
`complexity_tier`, which is itself the oracle the legacy router uses. Real
traffic is expected to be cheaper because:

1. Legacy routes `mid` -> Sonnet uniformly with no effort control; real-world
   Sonnet/low prompts get the same cost as Sonnet/high.
2. ConfGate's joint `(tier, effort)` predictions capture the easy Haiku-tier
   and low-effort slices that legacy flattens.

Re-measure on real `routing_log.jsonl` once 30 days of traffic accumulates.

### Legacy files (retained)

The earlier `low/mid/high` TF-IDF + LinearSVC classifier (`model.pkl`,
`router.py route()`, `data/training_corpus.json`) is retained as the P0 bridge
fallback but is not on the runtime path under the v3 shipment.
