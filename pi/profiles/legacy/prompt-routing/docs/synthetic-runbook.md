# Synthetic Dataset Runbook

Operational guide for `pi/prompt-routing/tools/generate_synthetic_dataset.py`.
Covers seeded and live modes, the shard/finalize workflow, and how to re-run
individual families. The conceptual design lives in
`synthetic-generation-plan.md`; this doc is about execution.

---

## 1. Modes

There are two execution modes. They share the full pipeline (generator,
adjudicator, per-worker shards, finalize, provenance) and are interchangeable
in every other respect.

### 1.1 Seeded mode (default)

- No network calls. No API keys required.
- Generator and adjudicator are deterministic local functions keyed off
  `(family_id, worker_id, variant_idx)` and `sha256(prompt)`.
- Every provenance row records `"mode": "seeded"` so downstream consumers can
  tell seeded output apart from live output.
- Still honors every invariant the live pipeline is contracted to honor:
  - B5: generator_model and adjudicator_model sit in different families.
  - H7: adjudicator_temperature == 0 and prompt_version_hash recorded per row.
  - H6: per-worker shards under `data/synthetic_shards/{family}/{worker}.jsonl`;
    canonical JSONL files are written only by the finalize step.

Use seeded mode when you need the data pipeline to produce a valid dataset
without burning API budget, or when you are iterating on tooling.

### 1.2 Live mode

- Requires `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` in the environment.
- Replaces `seeded_generate_prompt` and `seeded_adjudicate` with real API
  calls. The call sites are `live_generate_prompt` and `live_adjudicate` in
  `generate_synthetic_dataset.py`; both currently raise `NotImplementedError`
  and are the only edits needed to go live.
- Must be run with rate limiting and concurrency controls appropriate to the
  provider (see section 5).

Provenance always records the true model name from the matrix, regardless of
mode. In seeded mode the model name describes the model that *would have*
been called; the `mode` field is the source of truth for whether the row
came from the network.

---

## 2. Inputs

| Path | Role |
|------|------|
| `data/synthetic-generation-matrix.yaml` | Authoritative family -> model map |
| `prompts/adjudicator_template_v1.txt` | Adjudicator prompt text used to derive `prompt_version_hash` |
| `docs/synthetic-generation-plan.md` | Conceptual plan, volume targets, anti-collapse safeguards |

Editing the adjudicator template bumps `prompt_version_hash`. Every row
labeled under a new template carries the new hash; rows are not implicitly
re-adjudicated. Re-run the generator with `--families <list>` to relabel a
subset under the new template.

---

## 3. Outputs

| Path | Shape | Notes |
|------|-------|-------|
| `data/synthetic_shards/{family_id}/{worker_id}.jsonl` | `{row, provenance}` per line | Raw per-worker shards. Safe to regenerate. |
| `data/synthetic_route_labels.jsonl` | v3 corpus row per line | Deduplicated by prompt text. Consumed by T7. |
| `data/synthetic_provenance.jsonl` | Provenance row per prompt_id | B5 / H7 evidence. |
| `data/synthetic_prompt_families.jsonl` | Family registry | One row per family with metadata. |

Every canonical file is rewritten atomically at the end of each run. Workers
do not touch canonical files. There is no concurrent-append path.

---

## 4. How to run

All commands assume repo root.

### 4.1 Full seeded run

```
python pi/prompt-routing/tools/generate_synthetic_dataset.py \
  --workers 4 --target-total 420
```

`--target-total` is a floor. The script scales each family's
`expected_volume` from the matrix so the sum meets the target. The matrix
baseline already produces >1000 rows; after dedup the canonical file lands
around 700 unique rows.

### 4.2 Regenerate a single family

```
python pi/prompt-routing/tools/generate_synthetic_dataset.py \
  --families F09 F10 --workers 2
```

Only the listed families are regenerated. The finalize step still rewrites
the canonical JSONLs from *all* shards present on disk, so existing shards
for other families are picked up automatically.

### 4.3 Finalize only

```
python pi/prompt-routing/tools/generate_synthetic_dataset.py --skip-generate
```

Useful if shards are already produced (e.g., a previous run crashed after
writing shards but before finalize).

### 4.4 Live mode

```
ANTHROPIC_API_KEY=sk-ant-... \
OPENAI_API_KEY=sk-... \
python pi/prompt-routing/tools/generate_synthetic_dataset.py \
  --live --workers 4 --target-total 400
```

Before the first live run:
1. Implement `live_generate_prompt` and `live_adjudicate` in
   `generate_synthetic_dataset.py`. Keep the return shape identical to the
   seeded functions so the rest of the pipeline is unchanged.
2. Call the adjudicator at `temperature=0`. Do not alter the template string
   without first bumping the documented `prompt_version_hash` expectation.
3. Wrap provider calls in retry + backoff logic. The worker loop is already
   thread-pooled, so do not add process-level parallelism on top.

---

## 5. Rate-limit and cost guidance

Seeded mode has no rate limits. For live mode:

- Default adjudicator (`gpt-5-mini`): keep concurrent requests <= 8 per key.
- Generator fan-out is per family, so start with `--workers 2` and widen
  only after observing stable throughput.
- The matrix is sized so a full run is ~1000 generated prompts + 1000
  adjudications. Budget for roughly 2000 API calls per full regeneration.
- Failures inside a worker abort only that worker's shard. Re-run the
  affected family with `--families` to backfill.

---

## 6. Interpreting shards

A shard line is a single JSON object with two keys:

```
{"row": { ...v3 corpus row... }, "provenance": { ...provenance row... }}
```

Finalize splits these into the two canonical JSONL files and drops duplicate
prompts (first occurrence wins). No other transformation is applied.

If a shard file contains malformed JSON lines, finalize will crash loudly.
Delete the bad shard and re-run the family.

---

## 7. Invariant checks

Run after every regeneration. These are also the acceptance checks for T6.

```
python - <<'PY'
import json
with open('pi/prompt-routing/data/synthetic_provenance.jsonl', encoding='utf-8') as f:
    rows = [json.loads(l) for l in f if l.strip()]
assert all(r['generator_model'] != r['adjudicator_model'] for r in rows), 'B5 violation'
assert all(r['adjudicator_temperature'] == 0 for r in rows), 'H7 temperature violation'
assert all(r.get('prompt_version_hash') for r in rows), 'H7 prompt_version_hash missing'

prompts = []
with open('pi/prompt-routing/data/synthetic_route_labels.jsonl', encoding='utf-8') as f:
    for line in f:
        if line.strip():
            prompts.append(json.loads(line)['prompt'])
uniq = len(set(prompts))
assert len(prompts) >= 300 and uniq / len(prompts) > 0.9, 'diversity gate failed'
print('ok', len(prompts), 'rows,', uniq, 'unique')
PY
```

Then run T4's schema validator:

```
python pi/prompt-routing/tools/validate_corpus.py \
  pi/prompt-routing/data/synthetic_route_labels.jsonl
```

---

## 8. Troubleshooting

- **Unique-rate drops below 90%.** Raise the number of templates or slot
  values in the affected `FAMILY_BANKS` entry. Seeded mode is deterministic,
  so duplicates come from slot-space exhaustion, not RNG collisions.
- **B5 pre-flight check fails.** Edit `synthetic-generation-matrix.yaml` so
  the flagged family pairs a different-family adjudicator.
- **Live mode stalls.** Reduce `--workers`. Log the per-request latency in
  your `live_adjudicate` implementation before retrying.
- **Template change not reflected in hash.** The hash is computed from the
  exact string literal `ADJUDICATOR_TEMPLATE_V1` in
  `generate_synthetic_dataset.py`. Keep that in sync with
  `prompts/adjudicator_template_v1.txt`.
