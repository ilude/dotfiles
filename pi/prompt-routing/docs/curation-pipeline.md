# Prompt Router Curation Pipeline

The curation pipeline samples public prompt/trace datasets, normalizes rows, adds deterministic features, records v3 ConfGate weak labels, and writes triaged candidate outputs under `pi/prompt-routing/experiments/curation/`.

## Commands

Fixture run without network:

```bash
uv run --project pi/prompt-routing python pi/prompt-routing/curation_pipeline.py run --fixture --limit-per-source 5 --output-dir pi/prompt-routing/experiments/curation/test-run
```

Bounded public-source sample:

```bash
uv run --project pi/prompt-routing python pi/prompt-routing/curation_pipeline.py run --limit-per-source 5 --output-dir pi/prompt-routing/experiments/curation/network-smoke --timeout-seconds 20 --max-bytes-per-source 5000000 --max-prompt-chars 12000
```

Safety scan:

```bash
uv run --project pi/prompt-routing python pi/prompt-routing/curation_pipeline.py scan --output-dir pi/prompt-routing/experiments/curation/network-smoke
```

List and cleanup generated runs:

```bash
uv run --project pi/prompt-routing python pi/prompt-routing/curation_pipeline.py list
uv run --project pi/prompt-routing python pi/prompt-routing/curation_pipeline.py cleanup --output-dir pi/prompt-routing/experiments/curation/network-smoke --dry-run
```

## Outputs

Each run writes `candidates.jsonl`, one JSONL file per review status, `manifest.json`, and `summary.md`. Summaries include counts, skipped sources, reason codes, and candidate IDs. They do not include full raw prompt text.

Generated curation outputs are ignored by git. Production corpus files, model files, and SHA256 sidecars are not written by this pipeline.

## Boundary

Rows are candidates only. The MVP does not retrain models, promote rows into production training data, update model artifacts, or run broad judge labeling. `accepted_route` remains null for automated outputs; only a later manual promotion workflow may populate it.
