---
created: 2026-04-22
updated: 2026-04-22
status: phase-1-complete
completed: 2026-04-22
---

# Plan: pi tool-output reduction (tokenjuice-seeded)

## Context & Motivation

Pi agent sessions burn context on verbose bash tool output (`git status`, `pnpm test`, `docker build`, etc.). Investigation of `github.com/vincentkoc/tokenjuice` showed a well-designed JSON-rule compaction model: per-command rules with `skipPatterns` / `keepPatterns` / `headTail` / `counters`, a 3-layer overlay (builtin < user < project), and a `selectInlineText` passthrough guard that refuses to compact when it would not actually help.

Tokenjuice's weaknesses are coverage (22 hand-authored rule categories, grows slowly) and drift (CLI output formats change across versions). The pi codebase already has a working local classifier stack (`pi/prompt-routing/`: sklearn `TfidfVectorizer` + `LinearSVC` + `CalibratedClassifierCV`, `model.pkl`, `classify.py`, `router.py`, `train.py`) that can be reused later to route among ambiguous rule candidates once Phase 2's LLM codegen produces real label diversity.

**Phase 1 (Option A)**: vendor tokenjuice's JSON rules + port its pipeline to Python, wire it to pi's Bash PostToolUse path, add a corpus logger with secret scrubbing. Deterministic rule matching only; NO classifier in Phase 1 (training labels would be self-referential to the matcher). The corpus is still recorded so Phase 2 has training data.

**Phase 2 (Option B)**: use the Phase 1 corpus to (1) run an offline/background LLM pipeline that emits *schema-valid JSON rules* (not arbitrary code) from captured sample outputs, validate them against the corpus, and cache by `(command, version_fingerprint)`; (2) train a classifier as a *router* among overlapping rule candidates once codegen creates non-deterministic label diversity. Hot path stays deterministic.

## Constraints

- Platform: Windows 11 primary, must also work on Linux + WSL + macOS. Use `pathlib` for cross-platform path handling.
- Shell: bash (Unix-style) for invocations; no PowerShell-isms in Python code.
- Python stack mirrors `pi/prompt-routing/`: scikit-learn 1.8, numpy >=2.0, `TfidfVectorizer` + `LinearSVC` + `CalibratedClassifierCV`, pickle model artifacts.
- Package shape: `pi/tool-reduction/` directory (hyphen matches `pi/prompt-routing` convention). Scripts invoked directly (`python pi/tool-reduction/reduce.py`), NOT as `python -m`. Tests use `sys.path` insertion like prompt-routing does. Avoids the `-m` package-name friction that hyphens create.
- TypeScript extension layer (`pi/extensions/`) calls into Python reducer via subprocess; no ports of rules into TS.
- Hot path must remain deterministic: no LLM calls, no classifier, no ML during bash tool execution in Phase 1. Phase 2 classifier is added explicitly and runs only as a router (never transforms output).
- Idempotent: all setup scripts safely re-runnable.
- ASCII punctuation only in files (no em/en dashes), EXCEPT vendored tokenjuice JSON rules under `pi/tool-reduction/rules/builtin/` which are preserved byte-identical. V1 dash scan excludes that path.
- No AI mentions in comments, docs, or code.
- KISS: Phase 1 must be shippable and valuable without Phase 2. No daemon / long-lived process in Phase 1; per-call Python subprocess is acceptable. A background updater agent is a Phase 2 concern.
- POLA: match `pi/prompt-routing/` conventions (file names, module shape, sklearn usage).
- Linter: `ruff` (decided now, not deferred). Add `pi/tool-reduction/pyproject.toml` with a minimal `[tool.ruff]` block in T1.

## Alternatives Considered

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| **Phase 1 deterministic-only + Phase 2 classifier+codegen (this plan)** | Phase 1 ships fast, avoids circular classifier labels, corpus still records training data; Phase 2 introduces classifier when LLM codegen creates real label diversity | Two-phase rollout | **Selected** |
| Classifier in Phase 1 as argv-match fallback | Matches original intent | Structural label leakage - labels come from the same argv matcher it's supposed to augment; classifier ceiling is matcher's behavior, so it adds no routing signal | Rejected (review finding B3) |
| Pure heuristic compactor (no ML, no JSON rules) | Simplest; no training data; no drift | No command-specific wins | Rejected: ceiling too low |
| LLM-in-the-loop on hot path | Maximum adaptability | Latency, non-determinism, sandboxing, cost per call | Rejected: violates determinism constraint |
| Fork tokenjuice as a subprocess (use TS tool directly) | Reuses upstream rules + updates | Node runtime in hot path on Windows, no pi-native corpus | Rejected: runtime friction |
| Long-lived Python daemon for reducer | Avoids Python cold-start per bash call | Daemon lifecycle, crash-restart, rule hot-reload complexity | Rejected for Phase 1 per user direction; revisit in Phase 2 |

## Objective

A Python package at `pi/tool-reduction/` that:

1. Loads tokenjuice-format JSON rules from a 3-layer overlay.
2. Given `(argv, exit_code, stdout, stderr)`, returns a compacted output or passthrough, deterministically, via argv pattern matching only.
3. Exposes a CLI entry `python pi/tool-reduction/reduce.py` (or equivalent direct script) for the pi Bash hook to call.
4. Logs every reduction to a jsonl corpus (with secret scrubbing) for Phase 2 training + eval.
5. Has an eval harness that reports bytes-saved, passthrough rate, and a false-positive rate measured against a manually labeled subset of the corpus.

Phase 2 adds: novelty detector, offline LLM JSON-rule codegen pipeline, schema-validated rule cache, drift detection, AND a sklearn classifier (trained on the corpus) that routes among overlapping rule candidates where argv matching is ambiguous.

## Project Context

- **Language**: Python 3.12+ + TypeScript glue in `pi/extensions/`
- **Test command**: `cd pi/tests && bun vitest run` (TS); `pytest pi/tool-reduction/tests` (Python; uses `sys.path` insertion per prompt-routing pattern)
- **Lint command**: `oxlint` (TS); `ruff check pi/tool-reduction/` (Python, configured in T1)
- **Existing patterns to match**: `pi/prompt-routing/{classify,router,train,data,evaluate}.py`, `pi/prompt-routing/model.pkl`, `pi/prompt-routing/requirements.txt` (verified: uses `TfidfVectorizer` + `LinearSVC` + `CalibratedClassifierCV`, NOT hashing vectorizer)
- **Tokenjuice source**: `github.com/vincentkoc/tokenjuice`. Files of interest: `src/core/reduce.ts` (applyRule pipeline), `src/core/rules.ts` (loader), `src/rules/**/*.json` (rule corpus), and the JSON schema file (exact filename TBD in T1 - do not assume `tokenjuice-rule.schema.json`; find it via directory listing of upstream).

## Task Breakdown

| # | Task | Files | Type | Model | Agent | Depends On |
|---|------|-------|------|-------|-------|------------|
| T1 | Vendor tokenjuice rules + schema + pyproject | ~25 json, 1 README, 1 pyproject | mechanical | haiku | builder-light | - |
| T2 | Port applyRule pipeline to Python (with ReDoS guard) | 3-4 py | feature | sonnet | builder | - |
| T3 | Passthrough guard + clamp utilities | 1 py, 1 test | mechanical | haiku | builder-light | - |
| T4 | Secret scrubber + jsonl corpus logger (atomic append) | 2 py, 2 tests | feature | sonnet | builder | - |
| V1 | Validate wave 1 | - | validation | sonnet | validator-heavy | T1, T2, T3, T4 |
| T5 | 3-layer rule loader + argv matcher | 2 py, tests | feature | sonnet | builder | V1 |
| T6 | Reducer orchestrator CLI (deterministic, no classifier) | 1 py, tests | feature | sonnet | builder | V1 |
| V2 | Validate wave 2 | - | validation | sonnet | validator-heavy | T5, T6 |
| T7 | Pi Bash PostToolUse hook (with timeout, windowsHide) | 1-2 ts, tests | feature | sonnet | builder | V2 |
| T8 | Eval harness + lost-signal labeling protocol | 2 py, 1 labeling doc, tests | feature | sonnet | builder | V2 |
| V3 | Validate Phase 1 end-to-end | - | validation | sonnet | validator-heavy | T7, T8 |
| T9 | Novelty detector | 1 py, tests | feature | sonnet | builder | V3 |
| T10 | Offline LLM JSON-rule codegen pipeline | 3-4 py, tests | architecture | opus | builder-heavy | V3 |
| T11 | Rule cache + version fingerprinting + trust boundary | 2 py, tests | feature | sonnet | builder | V3 |
| V4 | Validate Phase 2 codegen + cache | - | validation | sonnet | validator-heavy | T9, T10, T11 |
| T12 | Drift detection + re-codegen trigger | 1 py, tests | feature | sonnet | builder | V4 |
| T13 | Classifier training (router for overlapping rule candidates) | 2 py, tests | feature | sonnet | builder | V4 |
| T14 | Background updater agent (schedules codegen + drift + retrain) | 1-2 py, tests | feature | sonnet | builder | V4 |
| V5 | Validate Phase 2 end-to-end | - | validation | sonnet | validator-heavy | T12, T13, T14 |

## Execution Waves

### Wave 1 (parallel) - Phase 1 foundations

**T1: Vendor tokenjuice rules + schema + pyproject** [haiku] - builder-light
- Description: Vendor `github.com/vincentkoc/tokenjuice` rule content into `pi/tool-reduction/rules/builtin/`, preserving category subdirectories. Verify actual schema filename in upstream `src/` or repo root (do NOT assume `tokenjuice-rule.schema.json`) and copy to `pi/tool-reduction/rule.schema.json`. Add `pi/tool-reduction/rules/UPSTREAM.md` with `vincentkoc/tokenjuice@<sha>` pinned. Add `pi/tool-reduction/pyproject.toml` with `[tool.ruff]` configuration (line length 100, target-version py312). Add `pi/tool-reduction/requirements.txt` (jsonschema, ruff, pytest; match prompt-routing's numpy/sklearn pins ONLY if Phase 2 sklearn usage is present - else omit sklearn for Phase 1 to keep install minimal).
- Files: `pi/tool-reduction/rules/builtin/**/*.json`, `pi/tool-reduction/rule.schema.json`, `pi/tool-reduction/rules/UPSTREAM.md`, `pi/tool-reduction/pyproject.toml`, `pi/tool-reduction/requirements.txt`
- Acceptance Criteria:
  1. [ ] All upstream rule files present, byte-identical to upstream commit.
     - Verify: `ls pi/tool-reduction/rules/builtin/git/status.json pi/tool-reduction/rules/builtin/cloud/gh.json`
     - Pass: both files exist; `sha256sum` matches upstream
     - Fail: re-copy from pinned commit
  2. [ ] Schema file validates at least one rule.
     - Verify: `python -c "import json, jsonschema; s=json.load(open('pi/tool-reduction/rule.schema.json')); r=json.load(open('pi/tool-reduction/rules/builtin/git/status.json')); jsonschema.validate(r, s); print('ok')"`
     - Pass: prints `ok`
     - Fail: schema/rule mismatch -> confirm upstream filename and contents
  3. [ ] `ruff check pi/tool-reduction/` runs (even on empty src) and exits 0.
     - Pass: exit 0
     - Fail: pyproject missing or misconfigured

**T2: Port applyRule pipeline to Python (pure functions, ReDoS-guarded)** [sonnet] - builder
- Description: Translate tokenjuice's `src/core/reduce.ts` pipeline into `pi/tool-reduction/pipeline.py` as pure functions: `strip_ansi`, `skip_patterns`, `keep_patterns`, `dedupe_adjacent`, `trim_empty_edges`, `extract_counters`, `head_tail`, `apply_on_empty`, `preserve_on_failure`. Each takes `(lines: list[str], rule_dict)` and returns `(lines, facts)`. No I/O, no rule loading. Match tokenjuice semantics exactly - port from source. Compile all rule regexes with a complexity guard: reject patterns > 500 chars or containing catastrophic-backtracking red flags (nested quantifiers on overlapping char classes); wrap each regex application in a per-line timeout of 50 ms via `signal.alarm` on Unix / threaded watchdog on Windows. Document the guard behavior.
- Files: `pi/tool-reduction/pipeline.py`, `pi/tool-reduction/tests/test_pipeline.py`, `pi/tool-reduction/regex_guard.py`
- Acceptance Criteria:
  1. [ ] Each pipeline function has a unit test with fixtures derived from tokenjuice's own test cases where available.
     - Verify: `pytest pi/tool-reduction/tests/test_pipeline.py -v`
     - Pass: all tests green
     - Fail: compare to `tokenjuice/src/core/reduce.ts`
  2. [ ] `strip_ansi` handles CSI, OSC, and DEC private sequences.
     - Verify: script imports strip_ansi and runs on `'\x1b[31mred\x1b[0m'`
     - Pass: `['red']`
     - Fail: port upstream ANSI regex verbatim
  3. [ ] ReDoS guard: a crafted pattern like `(a+)+$` applied to `'a' * 1000 + 'b'` is rejected at compile OR times out at 50 ms without hanging the process.
     - Verify: `pytest pi/tool-reduction/tests/test_pipeline.py::test_redos_guard -v`
     - Pass: test green
     - Fail: guard missing or ineffective

**T3: Passthrough guard + clamp utilities** [haiku] - builder-light
- Description: Port `selectInlineText` and `clampText` / `clampTextMiddle` from tokenjuice to `pi/tool-reduction/guards.py`. `select_inline_text(raw, compact, max_inline_chars, tiny_max)` returns `raw` if `len(raw) <= max_inline_chars` and `len(compact) >= len(raw)`, or if `len(raw) < tiny_max`. Confirm upstream's `tiny_max` default value before hard-coding (read `src/core/reduce.ts` to find the actual constant).
- Files: `pi/tool-reduction/guards.py`, `pi/tool-reduction/tests/test_guards.py`
- Acceptance Criteria:
  1. [ ] Passthrough guard never returns compact larger than raw.
     - Verify: `pytest pi/tool-reduction/tests/test_guards.py::test_never_inflates -v`
     - Pass: green (property-based matrix)
     - Fail: fix comparison
  2. [ ] Tiny output bypasses compaction using upstream-matching threshold.
     - Verify: upstream `TINY_OUTPUT_MAX_CHARS` cited in comment + test asserts same threshold
     - Pass: test green
     - Fail: align with upstream

**T4: Secret scrubber + jsonl corpus logger (atomic append)** [sonnet] - builder
- Description: Two modules.
  - `pi/tool-reduction/scrub.py`: `scrub_secrets(text: str) -> str`. Redact patterns matching: GitHub tokens (`gh[a-z]_[A-Za-z0-9]{36,}`, `github_pat_...`), Stripe (`sk_live_...`, `sk_test_...`, `pk_live_...`), AWS (`AKIA[0-9A-Z]{16}`, `ASIA[0-9A-Z]{16}`, AWS session tokens, secret access keys when adjacent to `aws_secret_access_key`), Google (`AIza[0-9A-Za-z_-]{35}`, `ya29\...`), Slack (`xox[baprs]-...`), JWT (`eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+`), Bearer tokens in `Authorization:` headers, SSH private key blocks (`-----BEGIN ... PRIVATE KEY-----` through `-----END ... PRIVATE KEY-----`), URL-embedded passwords (`://[^/@:]+:[^/@]+@`), `.env`-style `KEY=value` where KEY matches `*_TOKEN|*_SECRET|*_KEY|*_PASSWORD|PASSWORD|SECRET`. Replace with `[REDACTED:<kind>]`. Test fixtures include at least one example of each kind plus a negative control (plain text unchanged).
  - `pi/tool-reduction/corpus.py`: `log_reduction(record: dict, path: Path)` applying `scrub_secrets` to `stdout_sample` / `stderr_sample` BEFORE writing. Record schema: `{ts, argv, exit_code, bytes_before, bytes_after, rule_id, reduction_applied, stdout_sample, stderr_sample}` (no `classifier_confidence` in Phase 1 - classifier does not exist yet; field reserved for Phase 2). Sample = first 2 KB + last 2 KB post-scrub. Default path: `~/.cache/pi/tool-reduction/corpus.jsonl` (cross-platform `pathlib.Path.home()`). **Atomic append** using a cross-platform file lock: `portalocker` on all platforms (or fcntl on Unix + msvcrt on Windows if we avoid the dependency). Rotate daily (filename includes date: `corpus-YYYY-MM-DD.jsonl`), not by size.
- Files: `pi/tool-reduction/scrub.py`, `pi/tool-reduction/corpus.py`, `pi/tool-reduction/tests/test_scrub.py`, `pi/tool-reduction/tests/test_corpus.py`
- Acceptance Criteria:
  1. [ ] Scrubber test matrix covers every listed secret kind + one negative control.
     - Verify: `pytest pi/tool-reduction/tests/test_scrub.py -v`
     - Pass: all kinds redacted, plain text untouched
     - Fail: add or fix patterns
  2. [ ] Concurrent append: 10 processes each appending 100 records produces exactly 1000 valid jsonl lines, no interleaving.
     - Verify: `pytest pi/tool-reduction/tests/test_corpus.py::test_concurrent_append -v` (uses `multiprocessing`)
     - Pass: 1000 complete lines, each parseable
     - Fail: lock not held during write
  3. [ ] Log path works on Windows, Linux, macOS via `pathlib.Path.home()`.
     - Pass: `python -c "from corpus import default_path; print(default_path())"` prints an absolute path under home
     - Fail: replace any `os.environ` hacks with Path.home()
  4. [ ] Secret scrub runs BEFORE sample truncation so redactions are preserved.
     - Verify: fixture with a token in position 3000 (beyond the 2KB head cutoff) still shows `[REDACTED:github]` somewhere in the stored record (scrub first, then truncate).
     - Pass: redaction visible
     - Fail: reorder pipeline

### Wave 1 - Validation Gate

**V1: Validate wave 1** [sonnet] - validator-heavy
- Blocked by: T1, T2, T3, T4
- Checks:
  1. Acceptance criteria for T1-T4 all pass.
  2. `pytest pi/tool-reduction/tests -v` - all wave 1 tests green.
  3. `ruff check pi/tool-reduction/` - no warnings.
  4. No em/en-dashes or AI-mentions in any new file EXCLUDING vendored `pi/tool-reduction/rules/builtin/`:
     `grep -rE "[\xe2\x80\x93\xe2\x80\x94]|AI-assisted|Claude|generated by" pi/tool-reduction/ --exclude-dir=rules/builtin || true`
     - Pass: empty output
     - Fail: scrub the offending non-vendored files
  5. Cross-task: T2 pipeline functions consume rule dicts with the exact key names used in T1's vendored JSON (spot-check `git/status.json` fields against pipeline parameters).
- On failure: fix task, re-validate.

### Wave 2 - Rule loader + orchestrator

**T5: 3-layer rule loader + argv pattern matcher** [sonnet] - builder
- Blocked by: V1
- Description: `pi/tool-reduction/rules.py` with `load_rules(builtin_dir, user_dir, project_dir)` merging by `id` (last wins), validating each against the schema, returning a compiled index. `classify_argv(argv, rules)` returns `(rule_id, confidence=1.0)` on full argv match, else `(None, 0.0)`. User dir: `~/.config/pi/tool-reduction/rules/`. Project dir: `./.pi/tool-reduction/rules/`. Log (at WARN) any `id` collision during overlay merge so users see when a user/project rule shadows a builtin.
- Files: `pi/tool-reduction/rules.py`, `pi/tool-reduction/tests/test_rules.py`
- Acceptance Criteria:
  1. [ ] Overlay order is builtin < user < project (last wins by id).
     - Verify: `pytest pi/tool-reduction/tests/test_rules.py::test_overlay_order -v`
     - Pass: green
     - Fail: fix merge direction
  2. [ ] Schema validation rejects malformed rules without crashing the loader.
     - Verify: drop `bad.json` = `{}` in a tmp builtin dir; loader returns valid rules only
     - Pass: bad rule logged + skipped, good rules loaded
     - Fail: wrap per-file validation in try/except
  3. [ ] Rule-id collisions log a WARN line naming both source files.
     - Verify: `pytest pi/tool-reduction/tests/test_rules.py::test_collision_logged -v`
     - Pass: caplog shows the WARN
     - Fail: add log statement in merge

**T6: Reducer orchestrator CLI (deterministic only)** [sonnet] - builder
- Blocked by: V1
- Description: `pi/tool-reduction/reduce.py` exposes `reduce_execution(argv, exit_code, stdout, stderr) -> CompactResult` and a CLI `python pi/tool-reduction/reduce.py` reading a JSON request on stdin (`{argv, exit_code, stdout, stderr}`) and writing JSON on stdout (`{inline_text, facts, rule_id, bytes_before, bytes_after, reduction_applied}`). Pipeline: load rules -> classify_argv -> apply_rule (T2) -> select_inline_text (T3) -> scrub + log to corpus (T4) -> emit response. If no rule matches: passthrough (no classifier in Phase 1). Rules are loaded ONCE per invocation (per-call subprocess design - no daemon).
- Files: `pi/tool-reduction/reduce.py`, `pi/tool-reduction/tests/test_reduce.py`, `pi/tool-reduction/tests/fixtures/git-status-sample.txt`
- Acceptance Criteria:
  1. [ ] CLI round-trips a `git status` sample to a compacted form.
     - Verify: pipe a fixture JSON to the CLI, assert `bytes_after < bytes_before`
     - Pass: asserts hold
     - Fail: check T5 classify_argv match
  2. [ ] Unknown command passes through raw.
     - Verify: `argv=["xyznonexistent"]` - response has `reduction_applied=False`, `inline_text == stdout`
     - Pass: passthrough
     - Fail: check fallback path
  3. [ ] Corpus gets one line per invocation, with sample scrubbed.
     - Verify: feed stdin containing `ghp_FAKETOKENFAKETOKENFAKETOKENFAKETOKEN12`; corpus line shows `[REDACTED:github]`
     - Pass: redacted
     - Fail: wire T4 before corpus write

### Wave 2 - Validation Gate

**V2: Validate wave 2** [sonnet] - validator-heavy
- Blocked by: T5, T6
- Checks:
  1. Acceptance criteria for T5, T6 all pass.
  2. `pytest pi/tool-reduction/tests -v` green.
  3. `ruff check pi/tool-reduction/` clean.
  4. Run orchestrator on 3 sample outputs (git status, pnpm install, kubectl get pods) -> all produce `reduction_applied=True` with `bytes_after < bytes_before`.
  5. Passthrough guard verified: craft a short output; confirm raw returned.

### Wave 3 (parallel) - Integration, eval

**T7: Pi Bash PostToolUse hook integration (TS side)** [sonnet] - builder
- Blocked by: V2
- Description: Add `pi/extensions/tool-reduction.ts` registering a PostToolUse hook on the Bash tool. Hook spawns `python pi/tool-reduction/reduce.py` with `child_process.spawn(cmd, args, { windowsHide: true, stdio: ['pipe','pipe','pipe'] })`, pipes request JSON to stdin, reads compacted response, replaces the tool output field. **Timeout: 3000 ms** using an `AbortController` or `setTimeout(() => child.kill(), 3000)`; on timeout OR non-zero exit OR JSON parse failure, fall through to raw output (never break the agent). Use bare `python` path, NOT `uv run` (per `claude/tracking/windows-console-flashing.md` - the flashing cause is `uv.exe`'s own spawn, not a missing `windowsHide`). Log all fallthroughs to pi's session log for debugging.
- Files: `pi/extensions/tool-reduction.ts`, `pi/tests/tool-reduction.test.ts`
- Acceptance Criteria:
  1. [ ] Extension test: mock Bash result with verbose `git status` sample -> hook returns compacted form.
     - Verify: `cd pi/tests && bun vitest run tool-reduction.test.ts`
     - Pass: green
     - Fail: check subprocess JSON IPC
  2. [ ] Python subprocess failure, timeout, and non-JSON output all fall through to raw.
     - Verify: three test cases: `PYTHON=/nonexistent`, a script that `sleep 10`, a script that prints `not json`
     - Pass: all three return raw output, log a warning, do not throw
     - Fail: add try/catch + timeout wrapper
  3. [ ] Windows: no console flashing. Uses bare `python` path and `windowsHide: true`.
     - Verify: grep for `uv run` in the extension - none; grep for `windowsHide` - present
     - Pass: both checks
     - Fail: switch to direct python; add windowsHide option
  4. [ ] Subprocess hard timeout at 3s, not indefinite.
     - Verify: mock Python script that sleeps 10s; extension test returns in < 3500ms with raw fallthrough
     - Pass: under timeout
     - Fail: implement kill
  5. [ ] Latency benchmark recorded (hardening H2).
     - Verify: `pi/tool-reduction/tests/bench_reduce.py` runs the hook 50 times against a `git status` fixture and reports p50, p95, p99 wall time. Output committed as `pi/tool-reduction/docs/baseline-latency.md` with OS + Python version + reducer version captured.
     - Pass: baseline doc present, p95 under 1500 ms on reference hardware
     - Fail: if p95 > 1500 ms on Windows, revisit daemon design in Phase 2 with data in hand

**T8: Eval harness + lost-signal labeling protocol** [sonnet] - builder
- Blocked by: V2
- Description: Two pieces.
  - `pi/tool-reduction/evaluate.py` reads corpus jsonl(s) and reports: (1) total bytes saved %, (2) passthrough rate, (3) rule hit distribution, (4) false-positive rate from a labeled subset. Mirror `pi/prompt-routing/evaluate.py` shape. CLI: `python pi/tool-reduction/evaluate.py --corpus <path> --labeled <labeled.jsonl> --min-reduction 0.30 --max-fp 0.02`. Exit 0 if both gates pass, 1 otherwise.
  - `pi/tool-reduction/docs/labeling-protocol.md`: documents how `lost_signal` is measured. Protocol: sample 100 random records per week from the corpus, side-by-side compare `stdout_sample` vs `inline_text`, human labels `lost_signal: true` iff compact form omits a line the agent would have needed (errors, warnings, unique identifiers, file paths in stack traces). Produce `pi/tool-reduction/tests/fixtures/corpus-labeled-sample.jsonl` with at least 20 pre-labeled rows for test coverage.
- Files: `pi/tool-reduction/evaluate.py`, `pi/tool-reduction/tests/test_evaluate.py`, `pi/tool-reduction/docs/labeling-protocol.md`, `pi/tool-reduction/tests/fixtures/corpus-labeled-sample.jsonl`
- Acceptance Criteria:
  1. [ ] Report runs on synthetic corpus.
     - Verify: `python pi/tool-reduction/evaluate.py --corpus pi/tool-reduction/tests/fixtures/corpus-synthetic.jsonl --labeled pi/tool-reduction/tests/fixtures/corpus-labeled-sample.jsonl`
     - Pass: prints bytes-saved %, passthrough %, per-rule counts, FP rate
     - Fail: check jsonl parse
  2. [ ] Gates: `--min-reduction 0.30 --max-fp 0.02` exits 0 when both met, exits 1 otherwise (test both directions).
     - Pass: both test cases green
     - Fail: fix exit code logic
  3. [ ] Labeling protocol doc exists and is referenced from the V3 gate.
     - Pass: file present, V3 points to it

### Wave 3 - Phase 1 Validation Gate

**V3: Validate Phase 1 end-to-end** [sonnet] - validator-heavy
- Blocked by: T7, T8
- Checks:
  1. Acceptance criteria for T7, T8 pass.
  2. `pytest pi/tool-reduction/tests -v` green.
  3. `cd pi/tests && bun vitest run tool-reduction.test.ts` green.
  4. `ruff check pi/tool-reduction/` clean.
  5. Capture a representative pi session (20 mixed bash commands: git, pnpm, docker, kubectl, curl, jq; script at `pi/tool-reduction/tests/fixtures/representative-session.sh`) with the hook enabled, producing a corpus.
  6. Hand-label the 20 records per the labeling-protocol doc (T8), save as `pi/tool-reduction/tests/fixtures/representative-session-labeled.jsonl`.
  7. Run eval: `python pi/tool-reduction/evaluate.py --corpus <captured> --labeled <labeled> --min-reduction 0.30 --max-fp 0.02`.
     - Pass: exit 0
     - Fail: iterate on lowest-performing rule, rerun
  8. Cross-task: hook (T7) -> orchestrator (T6) -> logger (T4) -> eval (T8) flows end-to-end without manual intervention.
- On failure: fix task, re-validate.

### Wave 4 (parallel) - Phase 2 codegen + cache

**T9: Novelty detector** [sonnet] - builder
- Blocked by: V3
- Description: `pi/tool-reduction/novelty.py` scans corpus(es) and flags records where (a) `rule_id is None` OR (b) `bytes_saved < 10%` across N=5+ calls of the same argv signature. Output: `pi/tool-reduction/codegen-queue.jsonl` with deduplicated `(argv_signature, sample_outputs)` entries.
- Files: `pi/tool-reduction/novelty.py`, `pi/tool-reduction/tests/test_novelty.py`
- Acceptance Criteria:
  1. [ ] Flags an unmatched command after 3+ observations.
     - Verify: `pytest pi/tool-reduction/tests/test_novelty.py::test_flags_unmatched -v`
     - Pass: queue contains the signature
     - Fail: check threshold

**T10: Offline LLM JSON-rule codegen pipeline** [opus] - builder-heavy
- Blocked by: V3
- Description: `pi/tool-reduction/codegen/` package. Given queue entry (argv_signature + 5-10 samples), call Anthropic API (Claude Sonnet, current model) to generate a schema-valid JSON rule. System prompt encodes the full `rule.schema.json` + constraints: preserve error lines on non-zero exit (`failure.preserveOnFailure`), head/tail sized to observed output, counters for recognizable entity patterns, no fields outside the schema. Use Anthropic prompt caching (`cache_control: {type: "ephemeral"}`) on the schema+instructions block - verify the cached block is >= 1024 tokens (the minimum for Claude Sonnet caching) by padding with documentation if needed. Validate output with `jsonschema.validate` BEFORE accepting; test against samples (via T11) BEFORE caching. On schema-invalid response, retry up to 3 times with the validation error fed back. Never emit arbitrary code; only JSON matching the schema.
- Files: `pi/tool-reduction/codegen/__init__.py`, `pi/tool-reduction/codegen/generate.py`, `pi/tool-reduction/codegen/prompt.py`, `pi/tool-reduction/codegen/tests/`
- Acceptance Criteria:
  1. [ ] 100% of accepted generated rules pass `jsonschema.validate`.
     - Verify: `pytest pi/tool-reduction/codegen/tests/test_generate.py::test_schema_always_valid -v`
     - Pass: schema-invalid rules rejected, never cached
     - Fail: tighten prompt + retry loop
  2. [ ] No code-execution path accepts non-JSON output.
     - Verify: mock LLM returning a Python snippet; assert rejection
     - Pass: rejected
     - Fail: hard stop on non-JSON
  3. [ ] Cached prompt block is >= 1024 tokens (cache actually fires).
     - Verify: `pytest pi/tool-reduction/codegen/tests/test_generate.py::test_cache_control_above_minimum -v` - counts tokens in the cached block via `tiktoken` or Anthropic's token counter
     - Pass: >= 1024
     - Fail: pad the schema block with authoritative comments/docs

**T11: Rule cache + version fingerprinting + trust boundary** [sonnet] - builder
- Blocked by: V3
- Description: `pi/tool-reduction/cache.py`. Generated rules cached at `~/.cache/pi/tool-reduction/generated/<argv0>-<fingerprint>.json`. Fingerprint = sha256 of `<argv0> --version` output (fallback `<argv0> -v`, else `'none'`). Cache layer insertion order: `builtin < generated < user < project` (user/project override generated). **Trust boundary**: each cached rule file is written alongside a sidecar `.sig` that contains sha256 of the rule file content; loader refuses any cached rule without a matching sig. On Unix, set cache dir permissions to `0o700` on creation. This prevents a third-party process writing a rule file directly from taking effect (they'd need the sig too, and the sig is only written by the codegen pipeline).
- Files: `pi/tool-reduction/cache.py`, `pi/tool-reduction/tests/test_cache.py`
- Acceptance Criteria:
  1. [ ] Fingerprint changes when tool version changes.
     - Verify: `pytest pi/tool-reduction/tests/test_cache.py::test_fingerprint_version_sensitive -v`
     - Pass: green (mocked subprocess)
     - Fail: check fingerprint computation
  2. [ ] User/project rules override generated rules.
     - Verify: overlay order test
     - Pass: user rule wins over generated rule of same id
     - Fail: fix load order
  3. [ ] Cached rule without matching `.sig` is rejected.
     - Verify: write a `generated/foo-bar.json` manually with no sig; loader skips it and logs a warning
     - Pass: rule not used
     - Fail: add sig check

### Wave 4 - Validation Gate

**V4: Validate Phase 2 codegen + cache** [sonnet] - validator-heavy
- Blocked by: T9, T10, T11
- Checks:
  1. T9-T11 criteria pass.
  2. `pytest pi/tool-reduction/tests pi/tool-reduction/codegen/tests -v` green.
  3. `ruff check pi/tool-reduction/` clean.
  4. End-to-end codegen smoke: pick a synthetic unknown command with 10 samples, run codegen, validate emitted rule's schema, test reduces samples by >= 30% with zero lost error lines on failure samples, cache it (with sig).
  5. Negative tests: schema-invalid generation rejected and NOT cached; unsigned cache entry rejected.

### Wave 5 - Drift + Classifier + Background updater

**T12: Drift detection + re-codegen trigger** [sonnet] - builder
- Blocked by: V4
- Description: `pi/tool-reduction/drift.py`. For each cached rule, compute effectiveness over last N=100 invocations. If `bytes_saved` drops below 50% of initial effectiveness, or `lost_signal` indicators spike, mark stale, invalidate dependent classifier (T13) artifacts (delete `model.pkl`), re-queue in codegen queue.
- Files: `pi/tool-reduction/drift.py`, `pi/tool-reduction/tests/test_drift.py`
- Acceptance Criteria:
  1. [ ] Simulated drift triggers re-queue AND invalidates classifier model.
     - Verify: `pytest pi/tool-reduction/tests/test_drift.py::test_detects_drop_invalidates_model -v`
     - Pass: queue updated, `model.pkl` removed
     - Fail: check rolling-window math + model invalidation hook
  2. [ ] Stable rules NOT re-queued.
     - Pass: green
     - Fail: threshold too sensitive

**T13: Classifier training (router for overlapping rule candidates)** [sonnet] - builder
- Blocked by: V4
- Description: `pi/tool-reduction/train.py` + `pi/tool-reduction/classify.py`. Mirror `pi/prompt-routing/train.py` (verified stack: `TfidfVectorizer` + `LinearSVC` wrapped in `CalibratedClassifierCV`, NOT hashing vectorizer). Reads corpus, features = argv[0..2] tokens + first 5 lines + last 5 lines of stdout + exit_code as categorical. Labels = `rule_id` BUT trained only on records where multiple rule candidates matched the same argv (labels come from codegen + user rules, not the deterministic matcher alone - this is why classifier belongs in Phase 2, not Phase 1). Output: `pi/tool-reduction/model.pkl` + `model.pkl.sha256`. Integrated into `reduce.py` only as a tiebreaker when multiple rules match argv; explicit single-match still bypasses classifier. Confidence threshold tuned via held-out split, NOT hard-coded at 0.7; chosen threshold stored alongside model.
- Files: `pi/tool-reduction/train.py`, `pi/tool-reduction/classify.py`, `pi/tool-reduction/tests/test_classify.py`
- Acceptance Criteria:
  1. [ ] Training completes on corpus with at least 2 overlapping rules.
     - Verify: `python pi/tool-reduction/train.py --corpus <corpus> --out /tmp/model.pkl` prints accuracy >= 0.8 on held-out split
     - Pass: model written
     - Fail: insufficient label diversity -> verify codegen has produced rules
  2. [ ] Classifier ONLY fires when argv matches > 1 rule; single-match bypasses classifier.
     - Verify: `pytest pi/tool-reduction/tests/test_classify.py::test_single_match_bypasses_classifier -v`
     - Pass: green
     - Fail: fix orchestrator branching
  3. [ ] Threshold is learned, not hard-coded.
     - Verify: grep `0.7` in `reduce.py` / `classify.py` - no hits; `model.pkl` sidecar `.threshold.json` exists
     - Pass: both
     - Fail: move threshold to artifact

**T14: Background updater agent** [sonnet] - builder
- Blocked by: V4
- Description: `pi/tool-reduction/updater.py`. Periodic task (cron entry / manual CLI / pi startup hook) that: (1) runs novelty detector (T9), (2) processes codegen queue (T10), (3) runs drift check (T12), (4) re-trains classifier (T13) if new rules were generated. This is the explicit "background process/system/agent" the user deferred to Phase 2. Runs out-of-band; NEVER invoked on the bash hot path. Uses file-based locking to prevent concurrent runs.
- Files: `pi/tool-reduction/updater.py`, `pi/tool-reduction/tests/test_updater.py`
- Acceptance Criteria:
  1. [ ] Updater runs end-to-end against a seeded novelty queue and produces (a) new cached rule, (b) retrained model.pkl.
     - Verify: `pytest pi/tool-reduction/tests/test_updater.py::test_end_to_end -v` (Anthropic API mocked)
     - Pass: both artifacts present post-run
     - Fail: check pipeline wiring
  2. [ ] Concurrent invocations: second invocation exits cleanly (lock held) without duplicating work.
     - Pass: lock test green
     - Fail: add `portalocker` or equivalent
  3. [ ] NOT invoked on hot path: grep `updater` in `reduce.py` / `pi/extensions/tool-reduction.ts` - no hits.

### Wave 5 - Validation Gate

**V5: Validate Phase 2 end-to-end** [sonnet] - validator-heavy
- Blocked by: T12, T13, T14
- Checks:
  1. T12-T14 criteria pass.
  2. Full Python + TS suites green.
  3. End-to-end: seed novelty queue with 3 unknown commands, run updater (T14), then re-run Phase-1 eval on builtin + generated rules. Expect bytes-saved >= 30%, FP rate < 2%, classifier accuracy on overlapping-rule subset >= 0.8.

## Dependency Graph

```
Wave 1: T1, T2, T3, T4 (parallel)          -> V1
Wave 2: T5, T6 (parallel, blocked by V1)   -> V2
Wave 3: T7, T8 (parallel, blocked by V2)   -> V3   [Phase 1 ships]
Wave 4: T9, T10, T11 (parallel, blkd V3)   -> V4
Wave 5: T12, T13, T14 (parallel, blkd V4)  -> V5   [Phase 2 ships]
```

## Success Criteria

1. [ ] Phase 1 end-to-end: 20-command representative session saves >= 30% bytes with < 2% false-positive rate (labeled subset).
   - Verify: `python pi/tool-reduction/evaluate.py --corpus <captured> --labeled <labeled> --min-reduction 0.30 --max-fp 0.02`
   - Pass: exit 0
2. [ ] Phase 1 is shippable standalone (no Phase 2 code required for correctness).
   - Verify: check out V3 commit, run full Phase 1 suite + eval
   - Pass: all green
3. [ ] No classifier, no ML, no LLM, no daemon on Phase 1 hot path.
   - Verify: `grep -rE "sklearn|anthropic|openai|joblib|pickle" pi/tool-reduction/ --exclude-dir=codegen --exclude-dir=tests` up to V3 commit -> no hits
   - Pass: no hits
4. [ ] Phase 2 codegen emits ONLY schema-valid JSON rules.
   - Verify: `grep -rE "exec\(|eval\(|subprocess.*generated" pi/tool-reduction/codegen/` -> no hits (no code execution of generated content)
5. [ ] Phase 2 classifier is router-only (tiebreaker across overlapping rule matches).
   - Verify: grep `classifier` in `reduce.py` - appears only in the multi-match branch
6. [ ] Phase 2 background updater is off the hot path.
   - Verify: no import of `updater` in `reduce.py` or `tool-reduction.ts`
7. [ ] Cross-platform: Python path handling uses `pathlib`.
   - Verify: `grep -rE "\"/c/|C:\\\\|/home/" pi/tool-reduction/` -> no hits outside tests
8. [ ] Secrets never reach corpus: fixture with embedded tokens always produces redacted records.
   - Verify: `pytest pi/tool-reduction/tests/test_corpus.py::test_secrets_redacted_end_to_end -v`
   - Pass: green

## Handoff Notes

- **Tokenjuice upstream**: pin commit SHA in T1's UPSTREAM.md. Verify actual filename of the schema JSON in upstream before copying (the plan previously assumed `tokenjuice-rule.schema.json` without verification).
- **Schema drift**: treat `rule.schema.json` as a vendored artifact; do not mutate locally.
- **Prompt-routing reuse**: verified stack is `TfidfVectorizer` + `LinearSVC` + `CalibratedClassifierCV`. Mirror in T13 exactly; do NOT substitute hashing vectorizer.
- **Package invocation**: scripts are run directly (`python pi/tool-reduction/reduce.py`), NOT via `python -m`. Hyphen in directory name is intentional POLA with `pi/prompt-routing`. Tests use `sys.path.insert(0, ...)` to import siblings.
- **Windows subprocess spawning (T7)**: the root cause in `claude/tracking/windows-console-flashing.md` is `uv.exe` subprocess creation, not a missing `windowsHide`. Fix in T7 is twofold: (a) use bare `python` in the extension spawn, not `uv run`; (b) pass `{ windowsHide: true }` to Node's `child_process.spawn` to belt-and-suspend against any future regression.
- **Corpus privacy**: secret scrubber (T4) ships in Wave 1, NOT deferred. Every record is scrubbed before disk write. Scrubber also runs before Phase 2 codegen transmits samples to Anthropic.
- **Anthropic API key for Phase 2**: required only for codegen / updater, offline. Document in README. Never required on hot path.
- **Eval data**: V3 uses `pi/tool-reduction/tests/fixtures/representative-session.sh` (scripted, deterministic) + a hand-labeled `representative-session-labeled.jsonl` produced via the labeling protocol doc (T8).
- **Classifier rationale**: Phase 1 deliberately omits the classifier (labels self-referential to the argv matcher). Phase 2 introduces the classifier only after LLM codegen creates real label diversity across overlapping rule candidates.
- **No daemon in Phase 1**: per-call Python subprocess (~400-700 ms cold start on Windows) is acceptable trade-off. T7 records a latency baseline (hardening H2) so a Phase 2 daemon decision has data behind it.
- **Corpus segregation across OS contexts (hardening H8)**: `~/.cache/pi/tool-reduction/` resolves to different paths per environment (native Windows `C:\Users\<u>\.cache\...`, WSL `/home/<u>/.cache/...`, macOS `/Users/<u>/.cache/...`). These corpora are kept INTENTIONALLY SEPARATE - different environments often run different CLI versions (e.g., Windows `git.exe` vs WSL `git`), and merging would pollute drift-detection and training signals. No cross-environment sync. T4 documents this in a comment at the top of `corpus.py` and the eval harness accepts multiple `--corpus` paths for users who want to combine them manually.
- **Background updater (T14)**: the single "background process/system/agent" in scope for this project. Runs novelty + codegen + drift + retrain. Strictly out-of-band.

## Completion Log

### Phase 1 -- 2026-04-22

**Waves executed**: 1, 2, 3 (tasks T1-T8 + V1, V2, V3). Phase 2 deferred to a separate session.

**Test outcomes**:
- Python: 144 tests passing (pytest pi/tool-reduction/tests -v)
- TypeScript: 6 tests passing (bun vitest run tool-reduction.test.ts)
- ruff: clean
- V3 gate: PASS (bytes saved 32.4% live corpus, FP rate 0%, passthrough rate 34.4%)

**Key outcomes**:
- 107 tokenjuice rules vendored from vincentkoc/tokenjuice@76b6858 across 22 categories
- Secret scrubber covers 13 secret kinds with concurrent-append corpus logger (portalocker lock)
- Passthrough guard honors upstream TINY_OUTPUT_MAX_CHARS=240
- classify_argv handles argv0 + argvIncludes + gitSubcommands; rules without argv0 are skipped (not wildcarded)
- Lazy rule loading via pre-built argv0 index cut Windows hot-path p95 from 14,908 ms to 621 ms (24x)
- PostToolUse hook uses bare python (not uv run) with windowsHide: true and 3s subprocess timeout + fallthrough to raw on failure

**Fixes applied mid-execution**:
- flags key in schema (case-insensitive counters) -- T2
- classify_argv wildcard-match on rules without argv0 -- T5
- classify_argv missing gitSubcommands handling -- T5 (task #13)
- missing ts field in corpus records -- T6
- Windows hot-path latency (lazy argv0 index) -- T5 (task #14)
- mislabeled passthrough records in test fixture -- T8 (post-V3 cleanup)

**Deferred to Phase 2**:
- Novelty detector (T9)
- Offline LLM JSON-rule codegen (T10)
- Rule cache + version fingerprinting (T11)
- Drift detection (T12)
- Classifier training (T13) -- labels require codegen output for non-self-referential signal
- Background updater agent (T14)

**Open warnings**: None at close. Windows latency baseline recorded in pi/tool-reduction/docs/baseline-latency.md with before/after sections for Phase 2 reference.
