# Prompt Routing Instructions

## Purpose

`pi/prompt-routing/` preserves the retired local prompt-classifier experiment:
curated data, models, evaluation code, and research documentation. Pi does not
load this directory at runtime. Keep it only for reproducibility and future
research.

## Mandatory gates

Do not revive, ship, or promote the classifier unless all mandatory production
gates pass:

- Holdout accuracy is at least 85%.
- HIGH-to-LOW inversions are zero.
- Mean local inference is under 1 ms with no remote calls.
- Before every model load, its SHA256 sidecar exists and verifies the artifact.

Treat a missing sidecar or hash mismatch as a hard failure. Do not bypass,
weaken, or silently recover from it.

## Retired runtime

The former TypeScript extension, Pi settings, commands, and operator diagnostics
have been removed. `classify.py`, `classifier_confgate.py`, `router.py`, and the
model artifacts remain offline research surfaces only. Running them manually
must not be described as active Pi behavior.

## Read before editing

Read the relevant source, tests, and linked documentation before changing
classifier behavior, data, artifacts, evaluation, or runtime integration:

1. [`Pi README`](../README.md) and
   [`docs/classifier-experiment-pipeline.md`](docs/classifier-experiment-pipeline.md)
   for experiment, promotion, and curation workflow.
2. [`docs/classifier-training.md`](docs/classifier-training.md),
   [`docs/classifier-experiments.md`](docs/classifier-experiments.md), and
   [`docs/router-v3-output.schema.json`](docs/router-v3-output.schema.json) when
   applicable.
3. `.specs/prompt-router-curation-pipeline/PRD.md` if present, before ingestion,
   weak labeling, review queue, retraining, or external-data work.
4. Any documentation linked by the files above that applies to the change.

Keep long workflow instructions in those documents. Do not duplicate them here.

## Dependencies and artifacts

This is a uv project. `pyproject.toml` and tracked `uv.lock` are authoritative.
Use `uv sync --locked` for setup and `uv run --project pi/prompt-routing ...`
for commands. `requirements.txt` is export-only compatibility output, not an
install or dependency input.

Tracked source includes scripts, tests, curated corpus data, documentation,
`pyproject.toml`, and `uv.lock`. Generated-but-tracked artifacts include
`models/*.joblib` and their `models/*.sha256` sidecars. The tracked
`data/synthetic_route_labels.pre_wave4.jsonl` is the pre-wave-4 data backup.
Do not delete, untrack, or replace a tracked model, sidecar, or backup without
a reviewed migration and passing gates. Local virtual environments, caches, and
logs are ignored runtime state.

## Data and promotion rules

Do not bulk import history, audit, or external rows. Manually curate candidate
rows, preserve independent OOD evaluation, compare with the production
ConfGate baseline, and run the documented promotion workflow. Record durable
experiment rationale in `docs/classifier-experiments.md`.

## Required validation

Run these exact commands after relevant research changes:

```bash
uv run --project pi/prompt-routing pytest pi/prompt-routing/tests
uv run --project pi/prompt-routing python pi/prompt-routing/evaluate.py --json
```

Report the gate results and changed artifact hashes. Do not claim production
promotion when the exact workflow or required evidence was not run.
