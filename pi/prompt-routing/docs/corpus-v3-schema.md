# Prompt Router v3 Corpus Schema and Labeling Rubric

Status: draft (Wave 1, T1)
Scope: defines the row-based training corpus format for the cost-first prompt
router, and the rubric annotators (human or model-assisted) use to choose the
cheapest acceptable `(model tier, effort tier)` per prompt.

The v3 corpus replaces the legacy flat `low` / `mid` / `high` arrays in
`data/training_corpus.json` with one JSON object per row (JSONL on disk). The
legacy complexity labels are preserved per row as seed metadata so the old
classifier can still be reproduced during migration.

---

## 1. Action Space

The router's decision is a pair of ordinal tiers, not a single label.

### 1.1 Model tier

Ordered cheapest to most expensive. Each tier maps to a concrete Claude model
at serving time; the corpus stores the tier name, not the model id, so the
mapping can be updated without rewriting labels.

| Tier    | Typical model | Role                                                   |
|---------|---------------|--------------------------------------------------------|
| Haiku   | claude-haiku  | Cheap, fast, adequate for mechanical / factual work.   |
| Sonnet  | claude-sonnet | Default for multi-step coding / analysis.              |
| Opus    | claude-opus   | Reserved for architecture, security, deep reasoning.   |

Ordering: `Haiku < Sonnet < Opus`.

### 1.2 Effort tier

Ordered cheapest to most expensive. Effort controls reasoning / thinking
budget at serve time.

| Tier   | Semantics                                                            |
|--------|----------------------------------------------------------------------|
| none   | No extended thinking; direct response.                               |
| low    | Short scratchpad / brief reasoning.                                  |
| medium | Default reasoning depth for nontrivial work.                         |
| high   | Extended thinking for hard / ambiguous / multi-constraint problems.  |

Ordering: `none < low < medium < high`.

### 1.3 Route

A `route` is a pair `{ "model_tier": <Haiku|Sonnet|Opus>, "effort": <none|low|medium|high> }`.
Cost is monotone in both dimensions: escalating either tier is strictly more
expensive than keeping it fixed. The router's objective is to pick the
cheapest route that still produces an acceptable answer (see rubric below).

---

## 2. Row Schema

Each training example is one JSON object. Datasets on disk are JSONL
(`pi/prompt-routing/data/*.jsonl`). Required fields are marked R; optional
fields are marked O.

| Field                         | R/O | Type                  | Description                                                                                                                                            |
|-------------------------------|-----|-----------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------|
| `prompt_id`                   | R   | string (uuid or slug) | Stable unique id for the row. Used for dedup, split assignment, and provenance joins.                                                                  |
| `family_id`                   | R   | string                | Prompt family id. All paraphrases / variants of the same underlying task share one `family_id`. Splits (train/dev/eval) are assigned by `family_id`.   |
| `prompt`                      | R   | string                | The user-visible prompt text. No surrounding system context, no chat history.                                                                          |
| `source`                      | R   | enum                  | Origin of the row: one of `seed_v2`, `history_curated`, `synthetic_small`, `synthetic_medium`, `synthetic_large`, `external_routellm`, `ood_handwritten`. |
| `domain`                      | R   | string                | Short domain tag: `devops`, `python`, `typescript`, `sql`, `architecture`, `security`, `writing`, `data_science`, `general`, etc.                      |
| `task_type`                   | R   | enum                  | One of `factual`, `mechanical_edit`, `code_write`, `code_debug`, `code_review`, `explain`, `plan`, `design`, `analysis`, `rewrite`, `chat`.            |
| `ambiguity`                   | R   | enum                  | One of `clear`, `borderline`, `ambiguous`. See rubric section 3.4.                                                                                     |
| `cheapest_acceptable_route`   | R   | object                | The chosen label. A single `route` object (see 1.3). This is the primary training target.                                                              |
| `route_judgments`             | O   | array of objects      | Optional multi-candidate judgments. Each entry is `{ route, verdict, rationale }` where verdict is `acceptable` / `insufficient` / `overkill`.         |
| `complexity_tier`             | O   | enum                  | Legacy seed metadata: `low`, `mid`, `high`. Preserved from v2 corpus when available. Used for migration analysis, not for training the v3 target.      |
| `labels`                      | O   | object                | Convenience wrapper mirroring key label fields (see 2.4). Downstream training code must treat top-level fields as canonical.                           |
| `provenance`                  | O   | object                | Generator / adjudicator metadata for synthetic rows (see 2.2).                                                                                         |
| `notes`                       | O   | string                | Free-form annotator commentary. Never consumed by training code.                                                                                       |

### 2.1 `cheapest_acceptable_route` shape

```json
{
  "model_tier": "Sonnet",
  "effort": "medium"
}
```

Exactly one route per row. This is the label the v3 classifier learns to
predict.

### 2.2 `provenance` shape (synthetic rows)

```json
{
  "generator_model": "claude-haiku",
  "generator_model_size": "small",
  "adjudicator_model": "claude-opus",
  "adjudicator_model_size": "large",
  "prompt_version_hash": "sha256:...",
  "temperature": 0.0,
  "generated_at": "2026-04-22T14:30:00Z"
}
```

`generator_model` and `adjudicator_model` must differ at the model-family
level on every synthetic row (B5 in the plan). Adjudication runs at
`temperature = 0` and records the adjudicator prompt's version hash (H7).

### 2.3 `route_judgments` shape (optional)

When multi-candidate judgments are available (useful for calibration and for
training a pairwise cost-quality head later), rows may carry up to four
candidate verdicts:

```json
[
  { "route": { "model_tier": "Haiku",  "effort": "low"    }, "verdict": "insufficient", "rationale": "Missed error-handling branch." },
  { "route": { "model_tier": "Sonnet", "effort": "medium" }, "verdict": "acceptable",   "rationale": "Correct fix, concise." },
  { "route": { "model_tier": "Opus",   "effort": "high"   }, "verdict": "overkill",     "rationale": "Same answer as Sonnet, more cost." }
]
```

When `route_judgments` is present, `cheapest_acceptable_route` MUST equal the
cheapest route whose verdict is `acceptable`. This invariant is enforced by
`tools/validate_corpus.py` in T4.

### 2.4 `labels` shape (optional convenience object)

Some corpus sources (e.g. seed rows migrated from the v2 classifier) emit a
`labels` wrapper that mirrors the primary label fields for compatibility with
tooling that reads the legacy format. The object is optional; its presence
does not affect training.

```json
{
  "cheapest_acceptable_route": {"model_tier": "Sonnet", "effort": "high"},
  "complexity_tier": "high",
  "route_judgments": [...]
}
```

Rules when `labels` is present:

- `labels.cheapest_acceptable_route` is REQUIRED and must exactly match the
  top-level `cheapest_acceptable_route`. Downstream code MUST treat the
  top-level field as canonical; `labels.cheapest_acceptable_route` is a
  redundant convenience copy.
- `labels.complexity_tier` and `labels.route_judgments` are optional mirrors
  of the corresponding top-level fields. They are not independently validated
  beyond type checks.

`tools/validate_corpus.py` enforces the match between
`labels.cheapest_acceptable_route` and the top-level field when `labels` is
present.

---

## 3. Labeling Rubric

The rubric answers one question per row: what is the cheapest route whose
output would be considered an acceptable answer to this prompt?

### 3.1 Verdict definitions

Every candidate route, when evaluated, receives one of three verdicts.

- `acceptable` -- The route's output is correct, complete enough to act on,
  and free of safety-relevant errors. A reasonable engineer receiving this
  answer would not need to re-ask at a higher tier. Small stylistic
  imperfections do not demote the verdict.
- `insufficient` -- The route's output is wrong, materially incomplete, or
  contains a safety-relevant error (e.g., an architectural suggestion that
  would break in production, a security-sensitive recommendation that omits
  a critical caveat, code that does not compile or silently corrupts state).
  Any insufficient verdict is disqualifying for that route.
- `overkill` -- The route's output is correct, but a strictly cheaper route
  (lower model tier OR same model tier with lower effort) also produces an
  acceptable answer. Overkill routes are not wrong; they are just not the
  cheapest acceptable choice.

### 3.2 How to pick `cheapest_acceptable_route`

1. Enumerate candidate routes in cost order, cheapest first:
   `(Haiku, none) < (Haiku, low) < (Haiku, medium) < (Haiku, high) <
    (Sonnet, none) < ... < (Opus, high)`.
   In practice annotators evaluate a small candidate set (typically 3-4
   routes spanning the tiers) rather than the full 12-cell grid.
2. For each candidate, assign a verdict per 3.1. Use real outputs when
   possible (H2 empirical anchors) and model-assisted adjudication
   otherwise.
3. `cheapest_acceptable_route` is the cheapest candidate whose verdict is
   `acceptable`. Everything cheaper is `insufficient`; everything strictly
   more expensive than the chosen route is `overkill`.

### 3.3 Model tier selection guidance

Use model tier to capture capability ceilings.

- `Haiku` is appropriate when the prompt is a factual lookup, a mechanical
  edit with a small diff, a single-file question answerable from the prompt
  text alone, or a rewrite / format task. Haiku is the default guess for
  `task_type in {factual, mechanical_edit, explain (simple), rewrite}` with
  `ambiguity == clear`.
- `Sonnet` is appropriate when the prompt requires multi-step reasoning,
  coordinated edits across a small number of files, debugging with
  nontrivial context, or moderate analysis. Sonnet is the default guess for
  `task_type in {code_write, code_debug, code_review, analysis, plan}` with
  `ambiguity in {clear, borderline}`.
- `Opus` is appropriate when the prompt involves architecture trade-offs,
  security reasoning, distributed-systems correctness, cross-cutting
  refactors, or high-ambiguity design work. Opus is the default guess for
  `task_type in {design, plan (cross-cutting), analysis (security-sensitive)}`
  and for any row with `ambiguity == ambiguous` where getting it wrong is
  expensive.

Never promote to `Opus` solely because the prompt is long. Length is not a
complexity signal (see AGENTS.md "apply the terraform changes" example).

### 3.4 Effort tier selection guidance

Effort captures reasoning depth within a given model tier.

- `none` -- The answer is a direct recall or a one-shot template fill. Only
  valid at `Haiku` and `Sonnet` for trivial `factual` / `mechanical_edit`
  rows.
- `low` -- A short plan / scratch step is useful but not required. Typical
  for clear `code_write` / `code_debug` at `Sonnet`.
- `medium` -- Default when the model benefits from a structured internal
  plan. Typical for `analysis`, `plan`, most `code_review`.
- `high` -- The model needs extended thinking to avoid obvious mistakes:
  multiple interacting constraints, non-local correctness, or adversarial
  cases. Typical for `design`, `security`, and `ambiguous` rows at `Opus`.

Rule of thumb: raise effort before promoting model tier when the bottleneck
is reasoning depth rather than capability. Promote model tier before raising
effort when the bottleneck is capability (e.g., Haiku consistently gives a
wrong algorithmic answer no matter how much effort you give it).

### 3.5 Ambiguity handling

`ambiguity` is a row-level tag, independent of the chosen route.

- `clear` -- A competent annotator would pick the same route with high
  confidence. Most seed rows and most `factual` / `mechanical_edit` rows are
  clear.
- `borderline` -- Two adjacent routes (e.g., `(Haiku, medium)` vs
  `(Sonnet, low)`) are both plausibly cheapest acceptable. Pick the one a
  cost-conscious reviewer would defend, and record the alternative in
  `route_judgments` when practical.
- `ambiguous` -- The correct route depends on unstated intent, missing
  context, or a safety trade-off. When `ambiguity == ambiguous`, prefer the
  safer (higher-tier) route if the cost of an `insufficient` answer is
  materially worse than the cost of `overkill`. This is the v3 analogue of
  the legacy "zero HIGH->LOW inversions" invariant: ambiguous rows bias
  up, not down.

### 3.6 Tie-break rules

When two cost-equivalent routes are both acceptable (rare, but possible when
a Haiku+high row matches a Sonnet+low row on nominal cost), prefer the one
with the higher model tier and lower effort. Higher model tier generalizes
better; lower effort keeps latency predictable.

---

## 4. Migration from v2 (`low` / `mid` / `high`)

The legacy `complexity_tier` field is a coarse prior, not a v3 label.
Migration heuristic used by T2 / T5 to seed candidate routes (annotators
override freely):

| Legacy `complexity_tier` | Prior guess for `cheapest_acceptable_route` |
|--------------------------|---------------------------------------------|
| `low`                    | `{ model_tier: Haiku,  effort: low    }`    |
| `mid`                    | `{ model_tier: Sonnet, effort: medium }`    |
| `high`                   | `{ model_tier: Opus,   effort: high   }`    |

A row is only kept at its legacy prior if a human (or adjudicator at
`temperature=0` with a pinned prompt hash) confirms the verdict on at least
one candidate route. Uncurated bulk migration is explicitly out of scope;
see AGENTS.md "Corpus Expansion - What Was Tried and Why It Failed".

---

## 5. Example Record

A fully populated row from `seed_route_labels.jsonl`:

```json
{
  "prompt_id": "seed-0001",
  "family_id": "fam-auth-bcrypt-upgrade",
  "prompt": "Our Node service still hashes user passwords with SHA-256 and a static salt. Walk me through upgrading to bcrypt without breaking existing logins, including the migration path for stored hashes.",
  "source": "seed_v2",
  "domain": "security",
  "task_type": "design",
  "ambiguity": "borderline",
  "cheapest_acceptable_route": {
    "model_tier": "Sonnet",
    "effort": "high"
  },
  "route_judgments": [
    {
      "route": { "model_tier": "Haiku", "effort": "medium" },
      "verdict": "insufficient",
      "rationale": "Produced bcrypt code but skipped the dual-hash migration window; would break existing logins on first deploy."
    },
    {
      "route": { "model_tier": "Sonnet", "effort": "high" },
      "verdict": "acceptable",
      "rationale": "Covered dual-write, lazy rehash on successful login, and rollback plan. Good enough to ship."
    },
    {
      "route": { "model_tier": "Opus", "effort": "high" },
      "verdict": "overkill",
      "rationale": "Same migration plan as Sonnet plus extra threat-model commentary the user did not ask for."
    }
  ],
  "complexity_tier": "high",
  "provenance": {
    "generator_model": "human",
    "generator_model_size": "n/a",
    "adjudicator_model": "claude-opus",
    "adjudicator_model_size": "large",
    "prompt_version_hash": "sha256:0f3a1c9b2d4e5f67a8b9c0d1e2f3a4b5",
    "temperature": 0.0,
    "generated_at": "2026-04-22T14:30:00Z"
  },
  "notes": "Borderline because a careful Haiku+high response could arguably cover the migration; adjudication showed Haiku missed the dual-hash window in 3/5 runs, so Sonnet is the cheapest reliably acceptable route."
}
```

Key points illustrated by this example:
- The row carries both the legacy `complexity_tier` (seed metadata) and the
  new `cheapest_acceptable_route` (training target).
- `route_judgments` makes the cost-quality trade-off explicit and verifiable
  by `tools/validate_corpus.py`: the cheapest `acceptable` verdict matches
  `cheapest_acceptable_route`.
- `ambiguity` is `borderline`, and the rubric biased toward the safer route
  because an `insufficient` answer on a security-sensitive migration is
  materially worse than an `overkill` one.

---

## 6. Validation Hooks (implemented in T4)

`pi/prompt-routing/tools/validate_corpus.py` will enforce:

1. All required fields present and typed correctly.
2. `cheapest_acceptable_route.model_tier in {Haiku, Sonnet, Opus}` and
   `cheapest_acceptable_route.effort in {none, low, medium, high}`.
3. If `route_judgments` is present, the cheapest `acceptable` verdict matches
   `cheapest_acceptable_route` (section 2.3 invariant).
4. `source` is one of the enum values in section 2.
5. Synthetic rows (`source` starting with `synthetic_`) have a complete
   `provenance` block with `generator_model != adjudicator_model` and
   `temperature == 0`.
6. `family_id` is populated; splits in T7 will enforce family-disjointness.

Rows failing validation are rejected at build time rather than silently
dropped.
