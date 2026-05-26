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

Routellm-only paginated sample:

```bash
uv run --project pi/prompt-routing python pi/prompt-routing/curation_pipeline.py run --source routellm_gpt4_dataset --limit-per-source 1000 --output-dir pi/prompt-routing/experiments/curation/routellm-1000 --timeout-seconds 60 --max-bytes-per-source 80000000 --max-prompt-chars 12000
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

## Retraining Gate Experiment

The next-phase experiment keeps candidate rows local and ignored under `pi/prompt-routing/experiments/retraining/`. It initializes fixed gates before export or evaluation, separates candidate, holdout, needs-review, and rejected rows, then trains an experiment-only candidate model without writing production artifacts.

Initialize gates, export a curation run, and evaluate:

```bash
uv run --project pi/prompt-routing python pi/prompt-routing/curation_experiment.py init-gates --output-dir pi/prompt-routing/experiments/retraining/retrain-candidates --fail-if-exists
uv run --project pi/prompt-routing python pi/prompt-routing/curation_experiment.py export --curation-dir pi/prompt-routing/experiments/curation/retrain-candidates --output-dir pi/prompt-routing/experiments/retraining/retrain-candidates
uv run --project pi/prompt-routing python pi/prompt-routing/curation_experiment.py evaluate --experiment-dir pi/prompt-routing/experiments/retraining/retrain-candidates
```

One-step local run from an existing curation directory:

```bash
uv run --project pi/prompt-routing python pi/prompt-routing/curation_experiment.py run --curation-dir pi/prompt-routing/experiments/curation/retrain-candidates --output-dir pi/prompt-routing/experiments/retraining/retrain-candidates
```

Prepare a sandbox promotion review queue after an experiment:

```bash
uv run --project pi/prompt-routing python pi/prompt-routing/curation_experiment.py prepare-promotion-review --experiment-dir pi/prompt-routing/experiments/retraining/retrain-candidates --output-dir pi/prompt-routing/experiments/retraining/promotion-review-retrain-candidates
```

Scan and cleanup generated retraining outputs:

```bash
uv run --project pi/prompt-routing python pi/prompt-routing/curation_experiment.py scan --output-dir pi/prompt-routing/experiments/retraining/retrain-candidates
uv run --project pi/prompt-routing python pi/prompt-routing/curation_experiment.py cleanup --output-dir pi/prompt-routing/experiments/retraining/retrain-candidates --dry-run
```

Fixed gates are written to `gates.json` before candidate export or evaluation. The initial gates require: top-1 accuracy not more than 0.02 below baseline, catastrophic under-routing not above baseline, per-tier recall not more than 0.05 below baseline for nonempty tiers, over-routing rate not more than 0.10 above baseline, and mean latency not more than 1.25x baseline.

The experiment status values are:

- `passed`: candidate metrics satisfy all fixed safety and cost gates.
- `gate_failed`: tooling ran correctly, but candidate quality failed at least one predefined gate. This is a valid experiment outcome and does not promote anything.
- `tool_failed`: required inputs, metrics, denominators, gates, path confinement, or artifact safety checks failed. The command exits nonzero.

Reports include row counts, denominators, baseline-vs-candidate metrics, gate metadata, partition hashes, production artifact snapshots, and generated file classifications. `review_packet.md`, `report.md`, and summaries omit full raw prompt text. Full prompts may appear only in ignored local experiment input files.

Weak labels from `auto_accept_candidate` rows are experimental input only. They are reported separately from production or manually accepted labels and cannot make a candidate pass quality gates by themselves. `needs_review` rows are separated into a prompt-safe exception packet; broad judge labeling and production model updates are deferred to later work. Promotion review queues preserve source, license, provenance, prompt, weak route, and null `accepted_route`; a reviewer must explicitly set `accepted_route` before any row can become production training data.

## Boundary

Rows are candidates only. The MVP and retraining experiment do not promote rows into production training data, update model artifacts, or run broad judge labeling. `accepted_route` remains null for automated outputs; only a later manual promotion workflow may populate it.
