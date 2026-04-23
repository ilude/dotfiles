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
| genA | 500 | 0 | 0 | 254 | 246 |
| genB | 500 | 0 | 0 | 480 | 20 |
| genC | 500 | 500 | 0 | 0 | 0 |
| genD | 500 | 0 | 0 | 0 | 500 |
| **total** | 2000 | 500 | 0 | 734 | 766 |

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

- genA: Haiku/low=57, Haiku/medium=38, Haiku/none=57, Sonnet/low=56, Sonnet/medium=38 (synthetic_small=246)
- genB: Haiku/medium=5, Sonnet/low=5, Sonnet/medium=10 (synthetic_medium=20)
- genC: 0 rows kept
- genD: Opus/high=300, Opus/medium=150, Sonnet/high=50 (synthetic_large=500)

## Canonical file

- Before merge: 1216 rows
- Appended: 766 rows
- After merge: 1982 rows
- Backup: `data/synthetic_route_labels.pre_wave4.jsonl`

## Dedup method

Prompts are normalized by lowercasing and collapsing whitespace, then compared as exact strings. A new-shard row matching the normalized prompt of any canonical row is dropped (`dup_canonical`). Remaining new-shard rows are deduped against each other in shard order genA, genB, genC, genD; subsequent duplicates are dropped (`dup_cross_shard`).

