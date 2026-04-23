# Shadow Eval: Legacy vs v3 T2 Router + T3 Policy -- Cost and Safety Report

**Configuration:** T2 LinearSVC classifier + full T3 policy (hysteresis, uncertainty fallback, effort cap, cooldown) on pseudo-sessions of 8 prompts.

**Gate verdict: FAIL** -- see failing gates below.

---

## Summary

| Metric | Value |
|--------|-------|
| projected_cost_delta | +$4.3407 (+49.9%) |
| catastrophic_under_routing_delta (per-prompt) | 10 |
| session_catastrophic_delta | 10 |
| thrash_count (v3) | 119 |
| Rows replayed | 564 |
| Sessions (8 prompts each) | 71 |
| Rows skipped (classifier failure) | 0 |
| Source | pi\prompt-routing\data\eval_v3.jsonl |

## Cost Projection

| Router | Total projected cost (USD) |
|--------|--------------------------|
| Legacy | $8.7069 |
| v3 T2+policy | $13.0476 |
| Delta  | +$4.3407 (+49.9%) |

Cost gate (v3 <= legacy): **FAIL**

## Catastrophic Under-Routing

Definition: ground-truth cheapest acceptable route is >= Sonnet, but
predicted route is Haiku at effort <= medium.

### Per-prompt

| Router | Catastrophic count |
|--------|--------------------|
| Legacy | 0 |
| v3 T2+policy | 10 |
| Delta  | 10 |

Per-prompt catastrophic delta gate (<= 0): **FAIL**

### Session-level

A session is marked catastrophic if any prompt within it is catastrophic.

| Router | Catastrophic sessions |
|--------|-----------------------|
| Legacy | 0 / 71 sessions |
| v3 T2+policy | 10 / 71 sessions |
| Delta  | 10 |

Session catastrophic delta gate (<= 0): **FAIL**

## Thrash Count

Definition: consecutive model switches across replay sequence.

| Router | Thrash count |
|--------|-------------|
| Legacy | 242 |
| v3 T2+policy | 119 |
| Delta  | -123 |

Thrash gate: tolerated per hysteresis spec (no hard threshold in T4.5).

## Gate Summary

| Gate | Result |
|------|--------|
| v3 cost <= legacy cost | FAIL |
| per-prompt catastrophic_under_routing_delta <= 0 | FAIL |
| session-level catastrophic_delta <= 0 | FAIL |

> FAIL: v3 projects $13.0476 vs legacy $8.7069.

> FAIL: v3 introduces 10 catastrophic under-routing events vs legacy 0 (delta=+10) at per-prompt level.
> At session level: v3=10 vs legacy=0 (delta=+10).

## Methodology

**Replay source:** pi\prompt-routing\data\eval_v3.jsonl

**Session grouping:** 8 consecutive prompts per pseudo-session.
Each session starts with fresh T3 hysteresis state (simulating a new Pi conversation).

**T3 policy applied:** N_HOLD=3, K_CONSEC=2, DOWNGRADE_THRESHOLD=0.85,
COOLDOWN_TURNS=2, UNCERTAIN_THRESHOLD=0.55, maxLevel=high.

**Classifier:** V3Classifier (T2 LinearSVC, production model).

**Legacy router:** flat complexity_tier -> model_tier mapping (low->Haiku,
mid->Sonnet, high->Opus), no policy state, no effort control.

**Known limitations:**
- Session boundaries are artificial (corpus order, not real user sessions).
- Token counts are estimated as char_count / 4 (minimum 10).
- Output tokens assumed fixed at 500 per turn.
- Thrash computed on corpus-order prompts, not real session order.

**Pricing used:**

| Model  | Input ($/MTok) | Output ($/MTok) |
|--------|----------------|-----------------|
| Haiku  | $0.80          | $4.00           |
| Sonnet | $3.00          | $15.00          |
| Opus   | $15.00         | $75.00          |
