---
created: 2026-05-26
status: completed
completed: 2026-05-26
---

# Plan: Prompt Router Curation Pipeline MVP

## Context & Motivation

The Pi prompt router needs better training data, but earlier attempts to bulk-import session history degraded classifier quality. The failure mode was noisy labels and domain ambiguity: observed model choice, thinking level, trace length, or generated labels are useful signals, but they are not ground truth for the router's actual target: the cheapest acceptable `(model_tier, effort)` route.

Recent research and source review found several potentially useful external datasets: `championswimmer/pi-coding-sessions`, `jedisct1/agent-traces-swival`, `smolagents/codeagent-traces`, `routellm/gpt4_dataset`, and `CARROT-LLM-Routing/SPROUT`. The MVP should pull bounded samples from multiple sources, normalize them into one schema, score them with deterministic features plus the current router, and produce triaged candidate outputs for later review or retraining. This plan intentionally stops before retraining, promotion, or broad LLM-judge labeling.

## Constraints

- Platform: Windows checkout at `C:/Users/mglenn/.dotfiles`, using bash for git/Python commands and PowerShell only for Windows-native tasks.
- Shell: bash is preferred for repo commands; `uv` is the Python runner for `pi/prompt-routing`.
- Project rules: read before edit, prefer deterministic scripts, no bulk corpus mutation, no runtime network dependency in the live router, no automatic model artifact promotion.
- Prompt-routing project is a uv project at `pi/prompt-routing` with `pyproject.toml` and tracked `uv.lock`.
- Generated raw pulls, caches, and intermediate scored rows should be ignored by default.
- Small accepted corpora may be tracked only after manual promotion, which is out of MVP scope.
- Broad human review is not the primary workflow; review is only for ambiguous or high-risk exceptions.
- Broad LLM-judge labeling is deferred. A later sampled comparison may decide whether it is worth adding.
- External network pulls are allowed for bounded dataset samples, but MVP pullers must use stdlib HTTP/file handling or already-present dependencies. Do not add `datasets`, `huggingface_hub`, `requests`, or `httpx` unless this plan is revised and `uv.lock` is intentionally updated.
- Source pulls must use pinned dataset revisions, immutable raw URLs, or recorded commit/revision metadata where available. Every source must enforce timeout, byte, row, and prompt-size limits before parsing/writing.
- Production training files and model artifacts must not be mutated by the MVP pipeline.
- Current-router weak labels must use the v3 ConfGate interface through `pi/prompt-routing/classify.py --classifier confgate`; legacy `router.py route()` must not be used for MVP scoring unless a later plan explicitly adds a compatibility comparison.
- `accepted_route` is nullable and must remain unset in MVP outputs. Automated triage may emit `proposed_route`, but only a later manual promotion/review workflow may populate `accepted_route`.
- Generated raw pulls, caches, scored rows, and per-status JSONL files under `pi/prompt-routing/experiments/curation/` must be ignored by git before any network/sample run. Summaries must omit raw full prompt text by default.

## Risk & Manual Gate Decision

Manual gates are exceptional. Decide based on blast radius and rollback, not generic confidence. Be conservative for work/shared systems and data/resources that cost money; treat personal/local GitHub repos as localized-to-user when changes are reversible and validated.

- **Risk level:** low
- **Blast radius:** personal-local-repo
- **Rollback:** easy through git for source changes; generated experiment outputs can be deleted
- **Manual approval before action:** not required
- **Manual validation after action:** not required
- **Decision reason:** The MVP adds local scripts/tests and writes bounded generated outputs under an experiment directory. It does not retrain, promote corpus rows, modify production model artifacts, or perform paid/API judging. Automated tests and dry-run/sample execution can validate behavior.

## Alternatives Considered

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| Bulk-import external labels | Fast and high-volume | Repeats prior failure mode; noisy labels can poison the corpus | Rejected: unsafe without curation and fixed gates |
| Single external complexity classifier | Simple scoring path | Measures apparent prompt complexity, not cheapest acceptable route | Rejected as sole signal; possible later auxiliary feature |
| Manual-first review queue | Higher label quality | Too slow and conflicts with automation preference | Rejected as primary workflow; keep only exception review |
| Deterministic features plus current router | Local, auditable, cheap, fits MVP | Weak labels are not final training truth | **Selected** for MVP candidate triage |
| Broad LLM-judge labeling | Could improve labels | Adds cost, judge bias, and more moving parts before schema is proven | Deferred to later sampled comparison |
| Include retraining in MVP | Gives immediate metric feedback | Expands scope and risks mixing ingestion bugs with model changes | Deferred until curation outputs are proven stable |

## Objective

Implement the MVP curation pipeline for prompt-router training candidates. When complete, an executor can run bounded sample pulls from multiple external sources, normalize prompt rows, compute deterministic features, call the current v3 ConfGate router via `classify.py --classifier confgate` for weak labels, triage rows into four statuses, and write JSONL outputs plus a prompt-safe summary report under `pi/prompt-routing/experiments/curation/` without mutating production corpus or model artifacts. This MVP proves ingestion and triage viability only; it does not claim model-quality improvement.

## MVP Boundary

The smallest useful outcome is a deterministic command that creates inspectable curation outputs from bounded external samples. This is enough to answer whether external sources produce normalized, attributed, triaged candidate rows before investing in retraining, promotion, or LLM judging. The plan is intentionally limited to one focused implementation session: source registry, sampler, normalizers, scoring/triage, CLI/report, tests, and validation.

## Explicit Deferrals

- Model retraining and candidate-vs-baseline metric comparison. The MVP may report candidate/source counts and triage distribution, but must not claim classifier improvement.
- Promotion of accepted candidates into tracked production training data.
- Broad LLM-judge labeling.
- NVIDIA or other external complexity classifier integration.
- Large-source ingestion for `nebius/SWE-agent-trajectories` and `nlile/misc-merged-claude-code-traces-v1` if their size or schema makes them unsuitable for the first bounded pull.
- Full active-learning clustering, near-duplicate detection, and embedding-based diversity sampling.
- UI or Pi extension runtime changes.

## Project Context

- **Language**: Python for `pi/prompt-routing`; TypeScript exists for Pi extensions but is not in MVP scope.
- **Test command**: `uv run --project pi/prompt-routing python -m pytest pi/prompt-routing/tests/`
- **Lint command**: `make lint-python` for repo-owned linting. If adding a prompt-routing scoped ruff command, run it from `pi/prompt-routing` as `uv run --project . ruff check .` only after confirming ruff is available in that project environment.
- **Repo-wide validation**: `make test-quick` and targeted prompt-routing tests for this MVP; `make check` is stronger but may be expensive and can be run if time permits.
- **Existing spec slug**: `.specs/prompt-router-curation-pipeline/` already exists and contains the PRD.

## Automation Plan

| Operation | Command/wrapper | Credentials | Evidence |
|-----------|-----------------|-------------|----------|
| Preflight | `git status --short && uv sync --project pi/prompt-routing --locked` | none | command exits 0; no production training/model files unexpectedly modified; `.gitignore` includes `pi/prompt-routing/experiments/curation/**` before any pull |
| Source sample pull | `uv run --project pi/prompt-routing python pi/prompt-routing/curation_pipeline.py pull --limit-per-source 25 --output-dir pi/prompt-routing/experiments/curation/latest --timeout-seconds 20 --max-bytes-per-source 5000000 --max-prompt-chars 12000` | public network only | raw/cache files under allowed experiment directory; source revision/URL/byte counts recorded; no tracked corpus/model changes |
| Normalize, score, triage | `uv run --project pi/prompt-routing python pi/prompt-routing/curation_pipeline.py run --limit-per-source 25 --output-dir pi/prompt-routing/experiments/curation/latest --timeout-seconds 20 --max-bytes-per-source 5000000 --max-prompt-chars 12000` | public network only | `candidates.jsonl`, status JSONL files, `manifest.json`, and prompt-safe `summary.md` exist |
| Task tests | `uv run --project pi/prompt-routing python -m pytest pi/prompt-routing/tests/ -k curation -v` | none | exits 0 |
| Prompt-routing tests | `uv run --project pi/prompt-routing python -m pytest pi/prompt-routing/tests/ -v` | none | exits 0 |
| Repo quick validation | `make test-quick` | none | exits 0 with no errors |
| Scan generated run | `uv run --project pi/prompt-routing python pi/prompt-routing/curation_pipeline.py scan --output-dir pi/prompt-routing/experiments/curation/latest` | none | exits 0 and prints/writes a pass result when no credential/private-key/token/email/local-path leaks beyond allowed metadata are found |
| Cleanup generated runs | `uv run --project pi/prompt-routing python pi/prompt-routing/curation_pipeline.py cleanup --output-dir pi/prompt-routing/experiments/curation/latest --dry-run` then rerun without `--dry-run` only for validated run dirs | none | lists/removes only files under the allowed curation experiment root |
| Rollback source edits | `git restore --staged --worktree -- <changed source paths>` only if explicitly requested; otherwise leave changes for review | none | git status shows expected state after user-approved rollback |

## Curation Policy Details

### Router scoring contract

- MVP weak labels must call the v3 ConfGate route-level classifier via `pi/prompt-routing/classify.py --classifier confgate` or a direct import of the same ConfGate implementation.
- Required weak-label fields: classifier name, command/import path, schema version, primary route, candidates, confidence, optional ensemble rule, router/model hash metadata when available, and failure details when unavailable.
- Legacy `router.py route()` and legacy `low|mid|high` labels are out of scope for MVP scoring.

### Candidate state and route semantics

- `accepted_route`: nullable; must remain null for all automated MVP outputs. Only a later manual promotion/review workflow may populate it.
- `proposed_route`: optional weak route proposal derived from router scoring and deterministic rules. It is never training truth.
- Allowed MVP statuses: `reject`, `needs_review`, `holdout_candidate`, `auto_accept_candidate`.
- Status transitions during MVP are recomputed per run from raw/normalized inputs; no MVP output may transition directly into production training data.

### Ordered triage rules

1. `reject`: missing prompt, empty prompt after trimming, oversized prompt, malformed source row, unknown/incompatible license, source policy violation, unsafe path/source metadata, or duplicate row that violates deterministic ID rules.
2. `needs_review`: classifier failure, low confidence, conflicting weak signals, under-routing risk, security/refactor/debug ambiguity, continuation without context, or any rule uncertainty.
3. `holdout_candidate`: valid row selected by deterministic hash partition for OOD/holdout candidate output, with acceptable license and no safety blockers.
4. `auto_accept_candidate`: valid row with acceptable license, successful v3 router weak label, no under-routing/safety flags, no ambiguity flags, and not selected for holdout. This status means accepted for candidate-output export only; it does not mean training label acceptance.

Each rule must emit stable reason codes. Rule order is part of the contract and must be tested.

### Source and run manifest requirements

Every run must write `manifest.json` with schema version, pipeline version/config hash, git SHA when available, source URLs/revisions, limits, source licenses, router scoring interface/version/hash metadata when available, counts by status/source/license, skipped-source reasons, and generated file list.

## Execution Checklist

This checklist is the durable resume ledger for `/do-it`. Every executable task, validation gate, and final completion gate has exactly one matching checkbox. Checked means verified complete; unchecked means pending, in-progress, blocked, or invalidated.

`/do-it` must mark each item `[x]` immediately after that item passes its required verification and before starting any dependent or next sequential step. `/review-it` must preserve checked state, add unchecked items for new executable work, and never mark implementation or validation work complete.

### Wave 1

- [x] T1: Define curation schemas and output policy
  - Status: completed
  - Evidence: implemented and verified by targeted curation tests, prompt-routing tests, CLI final-smoke, scan, make test-quick, and make lint-python
- [x] T2: Implement bounded external source pullers and normalizers
  - Status: completed
  - Evidence: implemented and verified by targeted curation tests, prompt-routing tests, CLI final-smoke, scan, make test-quick, and make lint-python
- [x] V1: Validate wave 1
  - Status: completed
  - Evidence: implemented and verified by targeted curation tests, prompt-routing tests, CLI final-smoke, scan, make test-quick, and make lint-python

### Wave 2

- [x] T3: Implement deterministic feature extraction and router scoring
  - Status: completed
  - Evidence: implemented and verified by targeted curation tests, prompt-routing tests, CLI final-smoke, scan, make test-quick, and make lint-python
- [x] T4: Implement automated triage and summary reporting
  - Status: completed
  - Evidence: implemented and verified by targeted curation tests, prompt-routing tests, CLI final-smoke, scan, make test-quick, and make lint-python
- [x] V2: Validate wave 2
  - Status: completed
  - Evidence: implemented and verified by targeted curation tests, prompt-routing tests, CLI final-smoke, scan, make test-quick, and make lint-python

### Wave 3

- [x] T5: Add CLI orchestration and experiment output safeguards
  - Status: completed
  - Evidence: implemented and verified by targeted curation tests, prompt-routing tests, CLI final-smoke, scan, make test-quick, and make lint-python
- [x] T6: Add tests and documentation for MVP usage
  - Status: completed
  - Evidence: implemented and verified by targeted curation tests, prompt-routing tests, CLI final-smoke, scan, make test-quick, and make lint-python
- [x] V3: Validate wave 3
  - Status: completed
  - Evidence: implemented and verified by targeted curation tests, prompt-routing tests, CLI final-smoke, scan, make test-quick, and make lint-python

### Final Gates

- [x] F1: Task-specific verification complete
  - Status: completed
  - Evidence: implemented and verified by targeted curation tests, prompt-routing tests, CLI final-smoke, scan, make test-quick, and make lint-python
- [x] F2: Repo-wide validation complete
  - Status: completed
  - Evidence: implemented and verified by targeted curation tests, prompt-routing tests, CLI final-smoke, scan, make test-quick, and make lint-python
- [x] F3: Manual validation not required or completed
  - Status: completed
  - Evidence: implemented and verified by targeted curation tests, prompt-routing tests, CLI final-smoke, scan, make test-quick, and make lint-python
- [x] F4: Deployment validation complete or not required
  - Status: completed
  - Evidence: implemented and verified by targeted curation tests, prompt-routing tests, CLI final-smoke, scan, make test-quick, and make lint-python
- [x] F5: Archive preflight complete
  - Status: completed
  - Evidence: implemented and verified by targeted curation tests, prompt-routing tests, CLI final-smoke, scan, make test-quick, and make lint-python

## Task Breakdown

| # | Task | Files | Type | Model | Agent | Depends On |
|---|------|-------|------|-------|-------|------------|
| T1 | Define curation schemas and output policy | 2-3 files: `pi/prompt-routing/curation*.py`, possible `.gitignore` entry, docs stub | feature | medium | python-pro | -- |
| T2 | Implement bounded external source pullers and normalizers | 2-4 files: curation modules/tests | feature | medium | python-pro | -- |
| V1 | Validate wave 1 | -- | validation | medium | validation-lead | T1, T2 |
| T3 | Implement deterministic feature extraction and router scoring | 2-3 files: feature/scoring modules/tests | feature | medium | python-pro | V1 |
| T4 | Implement automated triage and summary reporting | 2-3 files: triage/report modules/tests | feature | medium | python-pro | V1 |
| V2 | Validate wave 2 | -- | validation | medium | validation-lead | T3, T4 |
| T5 | Add CLI orchestration and experiment output safeguards | 2-3 files: CLI module/tests/docs | feature | medium | python-pro | V2 |
| T6 | Add tests and documentation for MVP usage | 2-4 files: tests and docs/README updates | feature | medium | qa-engineer | V2 |
| V3 | Validate wave 3 | -- | validation | medium | validation-lead | T5, T6 |
| F1 | Task-specific verification complete | -- | validation | small | validation-lead | V3 |
| F2 | Repo-wide validation complete | -- | validation | medium | validation-lead | F1 |
| F3 | Manual validation not required or completed | -- | validation | small | validation-lead | F2 |
| F4 | Deployment validation complete or not required | -- | validation | small | validation-lead | F3 |
| F5 | Archive preflight complete | -- | validation | small | validation-lead | F4 |

## Execution Waves

### Wave 1 (parallel)

**T1: Define curation schemas and output policy** [medium] -- python-pro
- Description: Define dataclasses or typed dictionaries for normalized candidates, trace features, weak labels, triage status, source metadata, and run manifests. Establish output path conventions under `pi/prompt-routing/experiments/curation/`, including mandatory gitignore coverage before any generated rows are written. Use a single top-level script (`pi/prompt-routing/curation_pipeline.py`) plus top-level helper modules if needed; do not introduce a package layout that conflicts with `package = false` unless commands are changed accordingly.
- Files: `pi/prompt-routing/curation_pipeline.py` and optional top-level helper modules, tests under `pi/prompt-routing/tests/`, `.gitignore` update for generated experiment outputs.
- Acceptance Criteria:
  1. [ ] Candidate schema includes `schema_version`, deterministic `id`, `source`, `source_dataset`, `source_url`, `source_revision`, `source_row_id`, `license_name`, `license_url`, `prompt`, `metadata`, `trace_features`, `weak_labels`, `proposed_route`, nullable `accepted_route`, `review_status`, `reason_codes`, and `notes`.
     - Verify: `uv run --project pi/prompt-routing python -m pytest pi/prompt-routing/tests/test_curation_schema.py -v`
     - Pass: schema tests pass, reject rows missing required fields, prove IDs are stable across reordered inputs, and prove `accepted_route` stays null for MVP automation.
     - Fail: missing fields, order-dependent IDs, untyped free-form records, or tests do not exercise required fields.
  2. [ ] Output policy prevents accidental production corpus/model mutation and prompt-data tracking.
     - Verify: inspect `.gitignore`, run fixture write, then run `git status --short -- pi/prompt-routing/data pi/prompt-routing/models pi/prompt-routing/model.pkl pi/prompt-routing/model.pkl.sha256 pi/prompt-routing/experiments/curation`.
     - Pass: `.gitignore` contains `pi/prompt-routing/experiments/curation/**`; generated JSONL/raw/cache files are ignored; production corpus/model paths are unchanged.
     - Fail: implementation writes to `data/`, `models/`, model pickle paths, or leaves raw/generated curation outputs visible as untracked files.

**T2: Implement bounded external source pullers and normalizers** [medium] -- python-pro
- Description: Implement a source registry with bounded pull support for at least three initial external sources using stdlib HTTP/file handling or existing dependencies only. Prefer sources with raw JSON/JSONL or easily sampled files. Normalize each row into the shared candidate schema with license and source attribution. If a source is unavailable or gated, record a skipped-source entry in the summary and proceed, but fixture-backed source-shape coverage must remain at three. Enforce per-source timeout, byte limit, row limit, prompt-size limit, strict schema validation, and pinned revision/URL capture where available.
- Files: `pi/prompt-routing/curation_pipeline.py` or source-specific modules under `pi/prompt-routing/curation/`, tests under `pi/prompt-routing/tests/`.
- Acceptance Criteria:
  1. [ ] At least three external source shapes can produce normalized candidate rows from minimal raw fixtures captured from real source formats.
     - Verify: `uv run --project pi/prompt-routing python -m pytest pi/prompt-routing/tests/test_curation_sources.py -v`
     - Pass: tests cover three raw-to-normalized source normalizers and all rows include prompt text, source URL/revision/row ID, and license metadata.
     - Fail: fewer than three source normalizers work, fixtures are already-normalized hand-shaped rows, or source attribution is missing.
  2. [ ] Network pull limits and source license policy are enforced deterministically.
     - Verify: run a bounded pull with `--limit-per-source 5 --timeout-seconds 20 --max-bytes-per-source 5000000 --max-prompt-chars 12000` and inspect the summary counts/license counts.
     - Pass: no source emits more than 5 normalized candidates; oversized records are rejected; unknown or incompatible licenses cannot become `auto_accept_candidate` or `holdout_candidate`.
     - Fail: pulls are unbounded, byte/time/prompt-size limits are absent, counts vary without input changes, or unknown licenses are auto-accepted.

### Wave 1 -- Validation Gate

**V1: Validate wave 1** [medium] -- validation-lead
- Blocked by: T1, T2
- Checks:
  1. Run T1 and T2 acceptance commands.
  2. `uv run --project pi/prompt-routing python -m pytest pi/prompt-routing/tests/ -k 'curation_schema or curation_sources' -v` exits 0.
  3. Confirm generated outputs from fixture/sample runs do not touch `pi/prompt-routing/data/`, `pi/prompt-routing/models/`, `pi/prompt-routing/model.pkl`, or `pi/prompt-routing/model.pkl.sha256`.
  4. Confirm unavailable/gated sources are reported as skipped, not silent successes.
  5. Confirm raw fixtures represent three real source shapes and are not already-normalized synthetic rows.
- On failure: create a fix task, re-run the affected checks, then re-run V1.

### Wave 2 (parallel)

**T3: Implement deterministic feature extraction and router scoring** [medium] -- python-pro
- Blocked by: V1
- Description: Add deterministic prompt and trace feature extraction for normalized candidates, including prompt length, message count, tool-call count when available, file-touch count when available, command/test count, error/debug loop indicators, code fence/stack trace flags, continuation intent, and architecture/security/refactor/debug intent flags. Add current-router scoring by invoking `uv run --project pi/prompt-routing python pi/prompt-routing/classify.py --classifier confgate <prompt>` or an equivalent direct import of the same ConfGate classifier. The weak label schema must record `schema_version`, `primary`, `candidates`, `confidence`, `ensemble_rule` when present, router/model/hash metadata when available, and classifier failure details. Legacy `router.py route()` must not be used. Classifier unavailable/failure must mark rows `needs_review` or `reject`, not crash the whole run.
- Files: `pi/prompt-routing/curation_pipeline.py` or feature/scoring modules, tests under `pi/prompt-routing/tests/`.
- Acceptance Criteria:
  1. [ ] Feature extraction is deterministic and source-agnostic.
     - Verify: `uv run --project pi/prompt-routing python -m pytest pi/prompt-routing/tests/ -k curation_features -v`
     - Pass: identical fixture input produces identical feature output and expected boolean/count fields.
     - Fail: output order or counts vary across runs, or source-specific shapes leak into feature results.
  2. [ ] Current-router weak labels use v3 ConfGate and are recorded without making them final truth.
     - Verify: run scoring on a fixture or bounded sample and inspect one row's `weak_labels`.
     - Pass: row includes v3 `primary`, `confidence`, `candidates`, `schema_version`, optional `ensemble_rule`, router metadata, and leaves `accepted_route` unset while optionally setting `proposed_route`.
     - Fail: legacy `router.py route()` is used, router labels overwrite `accepted_route`, or classifier failure crashes the pipeline.

**T4: Implement automated triage and summary reporting** [medium] -- python-pro
- Blocked by: V1
- Description: Implement ordered deterministic rules that assign exactly one status to each scored row: `reject`, `needs_review`, `holdout_candidate`, or `auto_accept_candidate`. Generate explicit reason codes and summary counts by source, status, route, skipped source, license, and rejection reason. Keep rules conservative: ambiguous, risky, low-confidence, malformed, unknown-license, oversized, classifier-failure, or under-routing-risk rows must not be auto-accepted. `auto_accept_candidate` means only "automatically accepted for candidate output," not training truth; `accepted_route` remains null.
- Files: `pi/prompt-routing/curation_pipeline.py` or triage/report modules, tests under `pi/prompt-routing/tests/`.
- Acceptance Criteria:
  1. [ ] Every scored row receives exactly one valid triage status with deterministic ordered rules and reasons.
     - Verify: `uv run --project pi/prompt-routing python -m pytest pi/prompt-routing/tests/test_curation_triage.py -v`
     - Pass: tests cover all four statuses, ordered rule precedence, reason codes, unknown-license handling, malformed rows, low-confidence rows, classifier failure, and `accepted_route is None`.
     - Fail: rows can have missing/multiple statuses, reasons are absent, rule order is ambiguous, or weak labels populate `accepted_route`.
  2. [ ] Summary report is sufficient to audit a run without broad manual review and without exposing raw prompts.
     - Verify: run triage on fixtures and inspect generated `summary.md` or `summary.json`.
     - Pass: report includes manifest reference, counts by source/status/license, skipped sources, rejection reasons, and row IDs/hashes for each status; it does not include full raw prompt text by default.
     - Fail: report omits counts, hides skipped sources, includes full prompt text, or requires manual per-row review to understand the run.

### Wave 2 -- Validation Gate

**V2: Validate wave 2** [medium] -- validation-lead
- Blocked by: T3, T4
- Checks:
  1. Run T3 and T4 acceptance commands.
  2. `uv run --project pi/prompt-routing python -m pytest pi/prompt-routing/tests/ -k 'curation_features or curation_triage' -v` exits 0.
  3. Run a fixture end-to-end score/triage command and verify outputs contain `weak_labels`, `trace_features`, `review_status`, and reasons.
  4. Confirm classifier failure or unavailable dependencies create `needs_review` or skipped/failure records rather than crashing the entire run.
- On failure: create a fix task, re-run affected checks, then re-run V2.

### Wave 3 (parallel)

**T5: Add CLI orchestration and experiment output safeguards** [medium] -- python-pro
- Blocked by: V2
- Description: Add a single CLI entry point for the MVP with bounded sample execution, deterministic output directory creation, and production-path safeguards. The CLI should support a fixture/local dry run and a network-backed bounded run. It must canonicalize `--output-dir` and refuse paths outside `pi/prompt-routing/experiments/curation/`, including `..`, absolute external paths, symlink escapes where detectable, production corpus/model paths, and pre-existing file collisions. It should write normalized/scored candidates, per-status JSONL files, `manifest.json`, and a prompt-safe summary report under `pi/prompt-routing/experiments/curation/<run-id>/` or `latest/`. It should also provide `scan --output-dir <run-dir>` to fail on credential/private-key/token/email/local-path leak patterns beyond allowed metadata, plus a cleanup/list command that operates only on validated run directories under the curation root.
- Files: `pi/prompt-routing/curation_pipeline.py` or package CLI module, tests under `pi/prompt-routing/tests/`, possible docs update.
- Acceptance Criteria:
  1. [ ] CLI can run a fixture/local dry run without network.
     - Verify: `uv run --project pi/prompt-routing python pi/prompt-routing/curation_pipeline.py run --fixture --limit-per-source 5 --output-dir pi/prompt-routing/experiments/curation/test-run`
     - Pass: command exits 0 and writes candidate/status/report files under the output directory only.
     - Fail: command requires network for fixture mode, writes outside the requested output directory, or summary includes full prompt text.
  2. [ ] CLI can run a bounded network sample when network is available.
     - Verify: `uv run --project pi/prompt-routing python pi/prompt-routing/curation_pipeline.py run --limit-per-source 5 --output-dir pi/prompt-routing/experiments/curation/network-smoke`
     - Pass: command exits 0 only when at least one public source produces nonzero candidates; otherwise it exits with or records a `network_blocked` result that prevents archive. Skipped unavailable sources include explicit reasons.
     - Fail: unhandled network error aborts all sources, all sources are skipped but final validation still passes, or sample bounds are ignored.
  3. [ ] Production training and model artifacts remain unchanged.
     - Verify: `git status --short pi/prompt-routing/data pi/prompt-routing/models pi/prompt-routing/model.pkl pi/prompt-routing/model.pkl.sha256`
     - Pass: no changes appear for production corpus/model artifacts from curation runs.
     - Fail: any production corpus or model artifact changes.

**T6: Add tests and documentation for MVP usage** [medium] -- qa-engineer
- Blocked by: V2
- Description: Add focused tests for raw source normalizers, feature extraction, triage, output confinement, CLI fixture mode, network-blocked behavior, summary prompt-safety, scan behavior, and cleanup/list behavior. Use named test files or collection-count checks so targeted commands cannot pass by collecting zero tests. Document the MVP command, expected outputs, limitations, no-retraining/no-promotion boundary, scan command, and manual-promotion boundary in prompt-routing docs or the PRD plan handoff notes.
- Files: `pi/prompt-routing/tests/test_curation_*.py`, possible `pi/prompt-routing/docs/curation-pipeline.md` or `pi/prompt-routing/AGENTS.md` pointer update.
- Acceptance Criteria:
  1. [ ] Tests cover schema, sources, features, triage, CLI fixture mode, and output confinement.
     - Verify: `uv run --project pi/prompt-routing python -m pytest pi/prompt-routing/tests/ -k curation -v`
     - Pass: curation tests pass, collect at least one test per targeted command, and fail if required fields/statuses/output safeguards are removed.
     - Fail: tests are smoke-only, selectors collect zero tests, or failure modes are not covered.
  2. [ ] Documentation explains MVP usage and boundaries.
     - Verify: inspect the added docs or doc section.
     - Pass: docs include commands, outputs, ignored/tracked policy, no-retraining/no-promotion boundary, and deferred LLM-judge scope.
     - Fail: docs imply generated candidates are production-ready or omit safety boundaries.

### Wave 3 -- Validation Gate

**V3: Validate wave 3** [medium] -- validation-lead
- Blocked by: T5, T6
- Checks:
  1. Run T5 and T6 acceptance commands.
  2. `uv run --project pi/prompt-routing python -m pytest pi/prompt-routing/tests/ -k curation -v` exits 0.
  3. Run fixture CLI and bounded network smoke. Fixture mode must produce candidates for at least three source shapes; network smoke must produce candidates from at least one public source or mark the run `network_blocked` and prevent archive.
  4. Confirm generated outputs are under `pi/prompt-routing/experiments/curation/`, raw/generated JSONL/cache files are ignored, summaries omit full raw prompts, and production corpus/model artifacts are unchanged.
  5. Confirm docs state that retraining, promotion, broad LLM judging, and production artifact updates are deferred.
  6. Confirm cleanup/list only targets validated run directories under the curation experiment root.
- On failure: create a fix task, re-run affected checks, then re-run V3.

## Dependency Graph

```
Wave 1: T1, T2 (parallel) -> V1
Wave 2: T3, T4 (parallel, both depend on V1) -> V2
Wave 3: T5, T6 (parallel, both depend on V2) -> V3
Final: V3 -> F1 -> F2 -> F3 -> F4 -> F5
```

## Success Criteria

1. [ ] The MVP command creates curation outputs from bounded samples without touching production corpus/model artifacts.
   - Verify: `uv run --project pi/prompt-routing python pi/prompt-routing/curation_pipeline.py run --limit-per-source 5 --output-dir pi/prompt-routing/experiments/curation/success-smoke --timeout-seconds 20 --max-bytes-per-source 5000000 --max-prompt-chars 12000 && git status --short -- pi/prompt-routing/data pi/prompt-routing/models pi/prompt-routing/model.pkl pi/prompt-routing/model.pkl.sha256 pi/prompt-routing/experiments/curation`
   - Pass: command exits 0 only if at least one public source produces candidates; generated outputs exist under the experiment directory and ignored generated files do not appear as untracked; production corpus/model status is clean.
2. [ ] Normalized rows and triage outputs satisfy the PRD schema and statuses.
   - Verify: `uv run --project pi/prompt-routing python -m pytest pi/prompt-routing/tests/ -k curation -v`
   - Pass: tests pass and assert required schema fields, deterministic IDs, manifest fields, source/license metadata, weak labels, trace features, four triage statuses, explicit reasons, and nullable `accepted_route`.
3. [ ] Summary report can be used to decide whether sources are worth later retraining work.
   - Verify: inspect `pi/prompt-routing/experiments/curation/success-smoke/summary.md` or `summary.json`.
   - Pass: report includes manifest reference, source counts, skipped sources, status counts, license counts, rejection reasons, row IDs/hashes, no full raw prompt text, and no claim of production promotion or model improvement.

## Validation Contract

`/do-it` must satisfy this contract before reporting the plan complete or archiving it.

### Automation completeness

- Required: yes
- `/do-it` must be able to run all agent-runnable validation/deployment steps through documented commands, scripts, playbooks, or wrappers.
- Credentials are not required for MVP public-source pulls. If a gated source requires authentication, the source must be marked skipped or deferred rather than prompting for credentials during MVP execution.
- MVP pullers must not add new network/data dependencies under locked uv. If stdlib/raw access cannot support a source, skip/defer the source and record why.
- Manual-only steps are not required because the work is local, reversible, non-destructive, and automatically validated.

### Required automated validation

1. [ ] Run targeted curation validation.
   - Command: `uv run --project pi/prompt-routing python -m pytest pi/prompt-routing/tests/ -k curation -v`
   - Pass: exits 0 with no errors or warnings
   - Fail: do not archive; fix curation tests and rerun

2. [ ] Run prompt-routing test suite.
   - Command: `uv run --project pi/prompt-routing python -m pytest pi/prompt-routing/tests/ -v`
   - Pass: exits 0 with no errors or warnings
   - Fail: do not archive; fix regressions and rerun

3. [ ] Run repo quick validation.
   - Command: `make test-quick`
   - Pass: exits 0 with no errors or warnings
   - Fail: do not archive; document failure and fix if related

4. [ ] Run task-specific CLI smoke.
   - Command: `uv run --project pi/prompt-routing python pi/prompt-routing/curation_pipeline.py run --limit-per-source 5 --output-dir pi/prompt-routing/experiments/curation/final-smoke --timeout-seconds 20 --max-bytes-per-source 5000000 --max-prompt-chars 12000`
   - Pass: exits 0 only if at least one public source produces candidates; writes candidates/status/report/manifest files; production corpus/model artifacts unchanged; ignored generated outputs do not appear in git status
   - Fail: do not archive; fix pipeline/source handling or classify as network-blocked and leave F1/F5 incomplete

5. [ ] Run generated artifact safety checks.
   - Command: `git status --short -- pi/prompt-routing/experiments/curation pi/prompt-routing/data pi/prompt-routing/models pi/prompt-routing/model.pkl pi/prompt-routing/model.pkl.sha256 && uv run --project pi/prompt-routing python pi/prompt-routing/curation_pipeline.py scan --output-dir pi/prompt-routing/experiments/curation/final-smoke`
   - Pass: no production corpus/model artifacts changed; generated JSONL/raw/cache files are ignored; summaries contain no full raw prompts; scan exits 0 and reports no credential/private-key/token/email/local-path leaks beyond allowed metadata
   - Fail: do not archive; fix ignore/redaction/confinement and rerun

Do not require exact test function names, exhaustive evidence files, or audit-grade traceability beyond the command outputs, manifest, generated safety scan, and generated summary report.

### Manual validation

Manual validation is exceptional. It should be `Required: no` unless the plan includes destructive operations, data-loss risk, irreversible external side effects, shared/work production impact, paid/billing/data-costing resources, secret exposure risk, hardware/physical checks, or genuinely subjective user judgment that cannot be replaced by safe automation.

- Required: no
- Justification: Automated validation is sufficient. The MVP is local, non-destructive, and does not promote data or model artifacts.
- Steps:
  1. None.

If manual validation is not required, `/do-it` may mark the manual gate complete after recording why automated evidence is sufficient.

### Deployment validation

- Required: no
- Procedure: None. This MVP adds local curation tooling and does not deploy or change runtime routing behavior.

If deployment is skipped because it is not required, `/do-it` may mark the deployment gate complete after confirming no runtime/deployment step exists.

### Archive rule

`/do-it` may archive this plan only after all required automated validation, task-specific verification, deployment non-applicability, manual-validation non-applicability, and repo-wide validation pass. Do not archive if production corpus/model artifacts were modified, if generated outputs are outside the experiment directory, if raw/generated JSONL/cache files are trackable, if summaries contain full raw prompts, if secret/PII scan fails, if all public network sources are skipped, or if any deferred scope was accidentally implemented without validation.

## Handoff Notes

- Use `pi/prompt-routing/AGENTS.md` and `.specs/prompt-router-curation-pipeline/PRD.md` as authoritative context.
- Prefer a single top-level Python script plus top-level helper modules under `pi/prompt-routing` rather than a package layout, because `pyproject.toml` has `package = false` and existing commands execute file scripts.
- The live Pi router must not gain network dependencies.
- If a Hugging Face source is gated, unavailable, or too large for bounded sampling, record it as skipped in the summary and continue; however, final archive still requires at least one public source with nonzero candidates plus three fixture-backed source shapes.
- Keep generated raw prompts and scored candidate rows local/ignored by default unless a later manual promotion explicitly approves tracking.
- Do not retrain models, update SHA256 model sidecars, use legacy router scoring, or edit production corpus data in this MVP.
- Update the Execution Status section during `/do-it`; `/review-it` must not mark checklist items complete.

## Execution Status

- Status: completed-and-archived
- Last updated: 2026-05-26
- Last completed wave/gate: F5 archive preflight complete
- Next wave/gate to run: none
- Implemented: curation pipeline CLI, schemas, source pullers/normalizers, deterministic features, v3 ConfGate weak labels, ordered triage, summary/report output, scan/list/cleanup safeguards, tests, docs, and gitignore protection for generated curation outputs.
- Validation passed:
  - `uv sync --project pi/prompt-routing --locked`
  - `uv run --project pi/prompt-routing python -m pytest pi/prompt-routing/tests/ -k curation -v` -- 17 passed
  - `uv run --project pi/prompt-routing python -m pytest pi/prompt-routing/tests/ -v` -- 154 passed, 6 skipped
  - `uv run --project pi/prompt-routing python pi/prompt-routing/curation_pipeline.py run --limit-per-source 5 --output-dir pi/prompt-routing/experiments/curation/final-smoke --timeout-seconds 20 --max-bytes-per-source 5000000 --max-prompt-chars 12000` -- passed with public candidates from routellm_gpt4_dataset and smolagents_codeagent_traces; carrot_sprout was explicitly skipped after timeout
  - `git status --short -- pi/prompt-routing/experiments/curation pi/prompt-routing/data pi/prompt-routing/models pi/prompt-routing/model.pkl pi/prompt-routing/model.pkl.sha256` -- no production corpus/model changes and generated curation files ignored
  - `uv run --project pi/prompt-routing python pi/prompt-routing/curation_pipeline.py scan --output-dir pi/prompt-routing/experiments/curation/final-smoke` -- scan passed
  - `make test-quick` -- 199 passed
  - `make lint-python` -- passed
- Manual validation: not required; risk decision says automated evidence is sufficient for local, reversible, non-promoting MVP outputs.
- Deployment validation: not required; no runtime routing or deployment step exists.
- Archive preflight: passed; all checklist items complete, required validation passed, no manual/deployment gate remains, generated outputs are ignored, and production corpus/model artifacts are unchanged.
