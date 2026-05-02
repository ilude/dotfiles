# T3 Embedder Decision Spike

Status: **safe placeholder only; real model acceptance intentionally unmet**.

## Decision

- choice: `local-placeholder-384` deterministic local smoke artifact for Wave 1 T3 safety.
- package version: none; uses Bun runtime plus Node built-ins (`node:crypto`, `node:fs/promises`). No new dependency or lockfile mutation.
- source/revision: generated local placeholder, revision `2026-05-02`.
- resolved URL/path: local path `~/.pi/agent/models/local-placeholder-384/artifact.txt`; no URL and no runtime network.
- lockfile entry: not applicable because no package was added. This is a blocker for production semantic retrieval, not a final embedder pin.
- first-run: creates the tiny local artifact if absent, then verifies SHA256 before embedding; observed smoke below.
- warm: reuses the same local artifact and verifies SHA256; no download path exists.
- bundle size: `<1 MB` placeholder artifact (164 bytes, effectively 0.0002 MB). Real model target remains ~33 MB for q8 `Xenova/bge-small-en-v1.5` if later approved.
- SHA256: `bec3125ffd49b8e836c05fa3041f3df56ca8ec438e03d8d2810ac9bc48225590` for `artifact.txt`.

## Why not download a real model in this task?

The T3 plan asks to evaluate `transformers.js` with `Xenova/bge-small-en-v1.5` and optionally Ollama, including first-run download time, then pin the chosen artifact under `~/.pi/agent/models/`. In this execution, a broad production integration or opportunistic network/model download is too risky because:

1. It would mutate dependency manifests/lockfiles or global model cache state beyond the requested minimal spike.
2. The model supply-chain record requires a resolved model artifact URL/revision and SHA256 before use; doing that robustly needs an approved download path and follow-up validation.
3. The user explicitly allowed a safe minimal spike and asked not to make broad production integration.

Therefore the real embedder acceptance is **not met** yet for production retrieval. This spike only proves the air-gapped loading pattern: local artifact, checksum fail-closed, deterministic 384-dimensional vector, and no runtime network.

## Smoke behavior

`spikes/embed-smoke.ts`:

- Ensures `~/.pi/agent/models/local-placeholder-384/artifact.txt` exists with deterministic LF content.
- Verifies SHA256 matches this document before producing any vector.
- Produces a deterministic normalized `Float32Array` with `dim=384` using SHA256-derived values.
- Prints one verification line containing `dim=384` and `sha256-ok`.

## Follow-up needed before T4-T6 production retrieval

Replace the placeholder with a real local-only embedder decision record:

- candidate package and exact version, e.g. `@xenova/transformers` or current successor package;
- model source, revision/commit, resolved artifact URL(s), local path(s), lockfile entry, and SHA256 for every file loaded;
- measured first-run and warm latencies on this machine for 100 sample log entries;
- offline second-run proof with network disabled or an explicit local-files-only setting.
