# Wave-4 Synthetic Expansion -- Generation Report

Four generator agents produced 2000 input rows (500 per shard) under cross_family=false (Anthropic-only generation). This report documents the merge into the canonical synthetic_route_labels.jsonl.

## Inputs

| Shard | Path | Focus |
|-------|------|-------|
| genA  | data/synthetic_shards/genA/chunk.jsonl | Haiku + Sonnet-low |
| genB  | data/synthetic_shards/genB/chunk.jsonl | Sonnet-medium |
| genC  | data/synthetic_shards/genC/chunk.jsonl | Sonnet-high + Opus-low |
| genD  | data/synthetic_shards/genD/chunk.jsonl | Opus-medium/high |

## Per-shard merge summary

| Shard | Scanned | Invalid (dropped) | Dup vs canonical | Dup cross-shard | Kept |
|-------|---------|-------------------|------------------|-----------------|------|
| genA | 500 | 0 | 500 | 0 | 0 |
| genB | 500 | 0 | 500 | 0 | 0 |
| genC | 500 | 500 | 0 | 0 | 0 |
| genD | 500 | 0 | 500 | 0 | 0 |
| genE | 250 | 0 | 250 | 0 | 0 |
| genF | 250 | 0 | 250 | 0 | 0 |
| genG | 250 | 0 | 250 | 0 | 0 |
| genH | 250 | 0 | 250 | 0 | 0 |
| realClaude | 250 | 0 | 0 | 0 | 250 |
| realPi | 300 | 0 | 0 | 0 | 300 |
| **total** | 3550 | 500 | 2500 | 0 | 550 |

## Dropped (invalid) rows

### genC: 500 row(s) dropped

Validation failures against the v3 schema (tools/validate_corpus.py). Per coordinator policy, malformed rows are skipped rather than silently normalized.

Sample of failing rows (up to 5):

- `GC-000000`
  - row GC-000000: source 'synthetic' is not valid; must be one of ['external_routellm', 'history_curated', 'ood_handwritten', 'seed_v2', 'synthetic_large', 'synthetic_medium', 'synthetic_small']
  - row GC-000000: provenance missing required field 'temperature'
- `GC-3779b9`
  - row GC-3779b9: source 'synthetic' is not valid; must be one of ['external_routellm', 'history_curated', 'ood_handwritten', 'seed_v2', 'synthetic_large', 'synthetic_medium', 'synthetic_small']
  - row GC-3779b9: provenance missing required field 'temperature'
- `GC-6ef372`
  - row GC-6ef372: source 'synthetic' is not valid; must be one of ['external_routellm', 'history_curated', 'ood_handwritten', 'seed_v2', 'synthetic_large', 'synthetic_medium', 'synthetic_small']
  - row GC-6ef372: task_type 'plan_migration' is not valid; must be one of ['analysis', 'chat', 'code_debug', 'code_review', 'code_write', 'design', 'explain', 'factual', 'mechanical_edit', 'plan', 'rewrite']
  - row GC-6ef372: provenance missing required field 'temperature'
- `GC-a66d2b`
  - row GC-a66d2b: source 'synthetic' is not valid; must be one of ['external_routellm', 'history_curated', 'ood_handwritten', 'seed_v2', 'synthetic_large', 'synthetic_medium', 'synthetic_small']
  - row GC-a66d2b: provenance missing required field 'temperature'
- `GC-dde6e4`
  - row GC-dde6e4: source 'synthetic' is not valid; must be one of ['external_routellm', 'history_curated', 'ood_handwritten', 'seed_v2', 'synthetic_large', 'synthetic_medium', 'synthetic_small']
  - row GC-dde6e4: task_type 'review' is not valid; must be one of ['analysis', 'chat', 'code_debug', 'code_review', 'code_write', 'design', 'explain', 'factual', 'mechanical_edit', 'plan', 'rewrite']
  - row GC-dde6e4: provenance missing required field 'temperature'

## Kept-row route distribution (by shard)

- genA: 0 rows kept
- genB: 0 rows kept
- genC: 0 rows kept
- genD: 0 rows kept
- genE: 0 rows kept
- genF: 0 rows kept
- genG: 0 rows kept
- genH: 0 rows kept
- realClaude: Haiku/low=104, Haiku/none=53, Opus/medium=2, Sonnet/high=31, Sonnet/low=18, Sonnet/medium=42 (history_curated=250)
- realPi: Haiku/low=112, Haiku/none=44, Opus/high=8, Opus/medium=26, Sonnet/high=18, Sonnet/medium=92 (history_curated=300)

## Canonical file

- Before merge: 2982 rows
- Appended: 550 rows
- After merge: 3532 rows
- Backup: `data/synthetic_route_labels.pre_wave4.jsonl`

## Dedup method

Prompts are normalized by lowercasing and collapsing whitespace, then compared as exact strings. A new-shard row matching the normalized prompt of any canonical row is dropped (`dup_canonical`). Remaining new-shard rows are deduped against each other in shard order genA, genB, genC, genD; subsequent duplicates are dropped (`dup_cross_shard`).

