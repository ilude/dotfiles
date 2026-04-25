---
created: 2026-04-06
status: draft
completed:
---

# Plan: Lizard Complexity Refactor

## Context & Motivation

During a session to add cyclomatic complexity measurement to the dotfiles
repo, we wired the `lizard` analyzer into the existing PostToolUse quality
validator (`claude/hooks/quality-validation/`). Thresholds landed at
**CCN ≤ 8, length ≤ 250, parameters ≤ 7** after the user negotiated down
from lizard's defaults (`-C 15 -L 1000 -a 100`). These thresholds were
explicitly chosen as a guardrail against AI-generated code sprawl and will
eventually apply across every repo the user owns.

The hook now blocks **new** violations on every edited file, but it does
not fix the **backlog**. A full baseline scan returned **173 first-party
warnings** (117 in dotfiles + 56 in the menos submodule) across Python,
TypeScript, JavaScript, and Go source files. The goal of this plan is to
drive that backlog to zero deterministically.

Key decisions already locked in during the conversation:

- Menos **is** in scope (it's the user's own code, not third-party).
- Vendored code (`dotbot/lib/`, `node_modules/`, `.svelte-kit/`) is
  excluded via `exclude_paths` in `validators.yaml` and stays excluded.
- `dotbot/dotbot/` (first-party dotbot orchestration, 8 warnings) is in
  scope.
- Thresholds are non-negotiable — no skip-list entries, no `# noqa`, no
  threshold bumps as shortcuts.
- Red-Green-Refactor per function: pin the failure with a test, extract
  until lizard exits 0, re-verify tests.

## Constraints

- **Platform**: Windows 11, bash (Git Bash / WSL mirror).
- **Shell**: bash with Unix syntax (forward slashes, `/dev/null`).
- **Thresholds**: `-C 8 -L 250 -a 7` — immutable for this plan.
- **Validator**: `claude/hooks/quality-validation/validators.yaml`
  already enforces the thresholds on every edit via PostToolUse.
- **Menos is a git submodule** (`git@github.com:ilude/menos.git`).
  Refactors land as commits inside the submodule, then push the refactor
  branch, then bump the parent repo's pointer. Never edit menos files
  without committing to the submodule and pushing the branch -- otherwise
  the parent pointer bump references a SHA only present locally and breaks
  fresh clones / CI.
- **Submodule integration branch pattern (IMPORTANT — defect caught in
  Wave 1 V1)**: Within a single submodule, tasks MUST NOT branch off the
  remote `main` independently. Each subsequent submodule task must
  branch from the **previous completed submodule task's branch tip**, or
  merge prior task branches together before pushing. The parent pointer
  can only reference ONE SHA at a time, so bumping it after Task B
  overwrites Task A's reference if A and B are on divergent branches.
  **Correct flow for a wave with multiple menos tasks**:
  1. First menos task of the wave: `git fetch origin && git checkout main && git pull --rebase origin main && git checkout -b refactor/lizard-waveN-menos-A`
  2. Second menos task: `git checkout refactor/lizard-waveN-menos-A && git pull origin refactor/lizard-waveN-menos-A && git checkout -b refactor/lizard-waveN-menos-B`
  3. Or: each task uses the SAME branch name (e.g., `refactor/lizard-waveN-menos`) and each agent pulls before committing and pushes after.
  The parent pointer is bumped once per task, always to the latest menos
  SHA that contains all prior refactor work.
- **Detached HEAD**: Both submodules start in detached HEAD state at the
  parent's recorded pointer. The FIRST task of each wave must run
  `git checkout main && git pull --rebase origin main` before creating
  the refactor branch to escape detached HEAD.
- **Onyx-touching tasks**: T1 (vercel-ai.ts), T10 (context.ts), T14
  (onyx S2 batch). Each follows the menos submodule flow.
- **Menos-touching tasks**: T5 (unified_pipeline.py), T6 (search.py,
  serial after T5), T11 (agent.py + export_summaries.py), T15 (menos
  S2 batch).
- **Python scripts** run via bare `python` (not `uv run`) in hooks due to
  the Windows console-window flashing bug; this does not affect
  refactoring itself.
- **No proactive file creation** — helpers added during refactors must be
  justified by immediate use, not speculative reuse.
- **No backward-compat shims** — refactors can break internal APIs if no
  external caller exists; verify via grep before deleting.

## Alternatives Considered

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| Organic ratchet (hook-only, no plan) | Zero upfront cost; warnings fix themselves when files are touched | Slow, nondeterministic convergence; S0 hotspots never get touched in normal work | Rejected — the worst offenders need dedicated attention |
| Big-bang refactor across all 173 warnings | One mega-PR; done in one pass | Unreviewable; high merge conflict risk; can't validate per-function | Rejected — violates reviewability and risk-isolation preferences |
| Tier-based waves with per-function tasks | Reviewable per task; S0 isolation; parallel where files don't conflict; clear stop condition | Requires orchestration; many tasks | **Selected** — matches user's existing builder/validator team pattern |
| Exclude menos and treat as separate effort | Clean ownership boundary | User explicitly chose (b) re-run with menos included | Rejected — user decision |

## Objective

Baseline scan command returns **zero warnings** across first-party code
(dotfiles + menos, excluding vendored and build paths), with:

- No entries added to `skip-validators.txt` for `lizard-complexity`.
- No threshold changes in `validators.yaml`.
- All existing tests passing for every touched package.
- No dead code, no speculative abstractions introduced during refactor.
- Menos changes committed to the submodule and the parent repo's
  submodule pointer bumped to match.

## Project Context

- **Languages**: Python 3.12+, TypeScript (Bun), JavaScript, Go.
- **Python test commands**:
  - dotfiles: `make test-pytest` (from `~/.dotfiles`)
  - quality-validation hook: `cd claude/hooks/quality-validation && python -m pytest tests/ -q`
  - menos: `cd menos/api && pytest`
- **Python lint**: `ruff check <file> && ruff format --check <file>`
- **TypeScript lint**: `biome check <file>` (onyx has `onyx/biome.json`)
- **Go tests**: `go test ./...` from the relevant module root
- **Go lint**: `go vet ./...`
- **Complexity check (per file)**: `lizard -C 8 -L 250 -a 7 -w <file>`
- **Complexity check (full repo baseline)**: see Success Criteria.

## Task Breakdown

| # | Task | Files | Type | Model | Agent | Depends On |
|---|------|-------|------|-------|-------|------------|
| T1 | Refactor `vercel-ai.ts:25` (CCN 76) via dispatch table | ~3 | architecture | opus | builder-heavy | — |
| T2 | Refactor `agent-team.ts:31 getAgentDir` (CCN 51) | ~2 | feature | sonnet | builder | — |
| T3 | Refactor all 12 warnings in `bash-tool-damage-control.py` (incl. CCN 49 + 41 + 10 more) | ~1 | architecture | opus | builder-heavy | — |
| T4 | Refactor `evaluate.py:104 run_holdout` (CCN 48) | ~2 | feature | sonnet | builder | — |
| T5 | Refactor menos `unified_pipeline.py` (CCN 41 + CCN 17/8-param) | ~2 | feature | sonnet | builder | — |
| T6 | Refactor menos `search.py` (CCN 41 + CCN 20) | ~2 | feature | sonnet | builder | T5 |
| V1 | Validate wave 1 (S0 tier) | — | validation | sonnet | validator-heavy | T1..T6 |
| T7 | Refactor `pi/prompt-routing/` CLI `main()` cluster (5 files, CCN 9–36) | ~6 | architecture | opus | builder-heavy | V1 |
| T8 | Refactor `claude/hooks/path-normalization/path-normalization-hook.py` (CCN 29) | ~2 | feature | sonnet | builder | V1 |
| T9 | Refactor `claude/scripts/skill-analyzer.py:784` (CCN 28) | ~2 | feature | sonnet | builder | V1 |
| T10 | Refactor `onyx/api/src/agents/context.ts:17` (CCN 25) | ~2 | feature | sonnet | builder | V1 |
| T11 | Refactor menos `services/agent.py:185` + `scripts/export_summaries.py:78` | ~3 | feature | sonnet | builder | V1 |
| V2 | Validate wave 2 (S1 tier) | — | validation | sonnet | validator-heavy | T7..T11 |
| T12 | Batch-refactor S2 warnings in `claude/hooks/` | ~8 | feature | sonnet | builder | V2 |
| T13 | Batch-refactor S2 warnings in `pi/extensions/` | ~6 | feature | sonnet | builder | V2 |
| T14 | Batch-refactor S2 warnings in `onyx/api/` | ~6 | feature | sonnet | builder | V2 |
| T15 | Batch-refactor S2 warnings in `menos/api/menos/` | ~8 | feature | sonnet | builder | V2 |
| T16 | Catch-all: `dotbot/dotbot/`, `claude/scripts/`, `claude/commands/`, `onyx/e2e/`, `pi/skills/`, `menos/api/scripts/` | ~12 | feature | sonnet | builder | V2 |
| V3 | Final validation (S2 tier + end-to-end baseline) | — | validation | sonnet | validator-heavy | T12..T16 |

## Execution Waves

### Wave 1 — S0 (CCN > 40): highest-severity

Five tasks (T1, T2, T3, T4, T5) run in parallel. **T6 depends on T5**
because both commit inside the shared `menos/` submodule working tree,
which is a single git worktree — they must serialize to avoid corrupting
the index. Each task follows the Red-Green-Refactor loop: characterize
current behavior with a test if none exists, extract until lizard
passes, re-run the suite.

**T1: Refactor `onyx/api/src/providers/vercel-ai.ts:25`** [opus] — builder-heavy
- Description: Replace the current CCN-76 switch-over-model/provider
  function with a dispatch table keyed by model id. Each arm becomes a
  standalone handler function with CCN ≤ 5. This is the single largest
  refactor in the plan and almost certainly merits its own PR.
- Files: `onyx/api/src/providers/vercel-ai.ts`, one new test file if
  no provider tests exist, possibly a new `onyx/api/src/providers/vercel/handlers/` dir
- Acceptance Criteria:
  1. [ ] Lizard clean on file
     - Verify: `lizard -C 8 -L 250 -a 7 -w onyx/api/src/providers/vercel-ai.ts`
     - Pass: exit 0, no warnings
     - Fail: any function still > CCN 8 — continue extraction
  2. [ ] Biome clean on file
     - Verify: `cd onyx && biome check api/src/providers/vercel-ai.ts`
     - Pass: "Checked 1 file" with no errors
     - Fail: fix formatting/lint issues before proceeding
  3. [ ] Provider tests pass
     - Verify: `cd onyx/api && bun test providers/vercel-ai`
     - Pass: all tests green
     - Fail: restore behavior; the dispatch refactor must be
       behavior-preserving

**T2: Refactor `pi/extensions/agent-team.ts:31 getAgentDir`** [sonnet] — builder
- Description: CCN 51 nested path-resolution (function spans 140 lines
  from line 31). Invert guard clauses, pull platform-specific resolution
  into helpers (one per OS family), and return early on the common path.
- Files: `pi/extensions/agent-team.ts`, new `pi/tests/agent-team.test.ts`
  (no test currently exists — must be created before refactor)
- Acceptance Criteria:
  1. [ ] Characterization test exists before refactor begins
     - Verify: `test -f pi/tests/agent-team.test.ts && echo EXISTS`
     - Pass: file exists and covers getAgentDir happy path, one boundary
       (platform override), one error path (missing dir)
     - Fail: create the file and commit it as a separate
       `test(pi): characterize agent-team before refactor` commit
  2. [ ] Lizard clean on file
     - Verify: `lizard -C 8 -L 250 -a 7 -w pi/extensions/agent-team.ts`
     - Pass: exit 0
     - Fail: extract more helpers
  3. [ ] Pi vitest suite passes (including new characterization test)
     - Verify: `cd ~/.dotfiles/pi/tests && bun vitest run agent-team`
     - Pass: all tests green, at least one test exercised getAgentDir
     - Fail: pin behavior regression, re-extract
  4. [ ] No callers broken
     - Verify: `grep -rn "getAgentDir" pi/`
     - Pass: all call sites still compile
     - Fail: update callers

**T3: Refactor `claude/hooks/damage-control/bash-tool-damage-control.py`** [opus] — builder-heavy
- Description: 1,889-line security-critical file with **12 lizard
  warnings** (not just the two S0 hotspots). The full list:
    - `check_command` (line 1568) — CCN 49
    - `analyze_git_command` (line 970) — CCN 41
    - `_split_on_shell_operators` — CCN 22
    - `_split_pipe_chain` — CCN 15
    - `_strip_inline_comment` — CCN 14
    - `is_private_ip` — CCN 13
    - `check_path_patterns` — CCN 13
    - `extract_host_from_command` — CCN 11
    - `unwrap_command` — CCN 10
    - `detect_context` — CCN 10
    - `main` — CCN 10
    - `log_decision` — **8 PARAM** (parameter-object pattern needed)
  Both `check_command` and `analyze_git_command` are rule-dispatch
  functions that share the same dispatch-table extraction pattern. The
  file has 8 real tests in `claude/hooks/damage-control/tests/` — use
  them to anchor every extraction. This is an opus-level task because
  of the file's security-critical role and the number of functions to
  refactor.
- Files: `claude/hooks/damage-control/bash-tool-damage-control.py`,
  tests under `claude/hooks/damage-control/tests/`
- Acceptance Criteria:
  1. [ ] Lizard clean on file (all 12 warnings resolved)
     - Verify: `lizard -C 8 -L 250 -a 7 -w claude/hooks/damage-control/bash-tool-damage-control.py`
     - Pass: exit 0, zero warnings
     - Fail: extract more handlers — enumerate remaining warnings and
       continue
  2. [ ] Ruff clean on file
     - Verify: `ruff check claude/hooks/damage-control/bash-tool-damage-control.py && ruff format --check claude/hooks/damage-control/bash-tool-damage-control.py`
     - Pass: "All checks passed!" and "1 file already formatted"
     - Fail: run `ruff format` and fix remaining lint issues
  3. [ ] Damage-control test suite passes (do NOT mask failures)
     - Verify: `cd claude/hooks/damage-control && python -m pytest tests/ -q`
     - Pass: all tests green (the suite has 8 real test files; any
       pytest exit != 0 is a regression to investigate, never ignored)
     - Fail: restore the extraction, add characterization for the
       failing case, re-extract
  4. [ ] Hook end-to-end smoke
     - Verify: `echo '{"tool_name":"Bash","tool_input":{"command":"ls"}}' | python claude/hooks/damage-control/bash-tool-damage-control.py; echo "exit=$?"`
     - Pass: exit 0 (benign command passes through)
     - Fail: restore dispatch wiring
  5. [ ] Security-critical path preserved
     - Verify: `echo '{"tool_name":"Bash","tool_input":{"command":"curl http://169.254.169.254/latest/meta-data/"}}' | python claude/hooks/damage-control/bash-tool-damage-control.py; echo "exit=$?"`
     - Pass: non-zero exit (IMDS exfil attempt should still be blocked)
     - Fail: dispatch regression leaked a malicious command through

**T4: Refactor `pi/prompt-routing/evaluate.py:104 run_holdout`** [sonnet] — builder
- Description: CCN 48 eval loop with inline branching. Extract per-model
  scoring, per-tier aggregation, and result formatting into helpers.
- Files: `pi/prompt-routing/evaluate.py`, possibly new
  `pi/prompt-routing/evaluate_helpers.py` if extraction is large
- Acceptance Criteria:
  1. [ ] Lizard clean on file
     - Verify: `lizard -C 8 -L 250 -a 7 -w pi/prompt-routing/evaluate.py`
     - Pass: exit 0
     - Fail: extract more helpers
  2. [ ] Ruff clean
     - Verify: `ruff check pi/prompt-routing/evaluate.py && ruff format --check pi/prompt-routing/evaluate.py`
     - Pass: clean
     - Fail: format and re-verify
  3. [ ] Evaluate runs end-to-end (smoke test if no unit tests)
     - Verify: `cd pi/prompt-routing && python evaluate.py --help`
     - Pass: help output shown, exit 0
     - Fail: argparse wiring broken — restore

**T5: Refactor menos `menos/api/menos/services/unified_pipeline.py`** [sonnet] — builder
- Description: Fix **both** lizard warnings in this file:
    - `parse_unified_response` at line 186 — CCN 41 (ingest pipeline
      orchestration; extract each stage into its own method, reduce the
      orchestrator to a linear pipeline dispatch)
    - `process` at line 453 — CCN 17, **8 PARAM** (async class method;
      use a config/options dataclass to reduce parameter count to ≤7
      and split branching into helpers to reduce CCN to ≤8)
  The `menos/api/tests/unit/test_unified_pipeline.py` test file exists
  and provides real behavioral anchoring — use it.
- Files: `menos/api/menos/services/unified_pipeline.py`,
  `menos/api/tests/unit/test_unified_pipeline.py`, possibly
  `menos/api/tests/unit/test_pipeline_orchestrator.py`
- **IMPORTANT**: Menos submodule is on detached HEAD at start. Before
  any edits: `cd ~/.dotfiles/menos && git checkout main && git pull --rebase origin main && git checkout -b refactor/lizard-unified-pipeline`
- Acceptance Criteria:
  1. [ ] Lizard clean on file (both warnings resolved)
     - Verify: `lizard -C 8 -L 250 -a 7 -w menos/api/menos/services/unified_pipeline.py`
     - Pass: exit 0, zero warnings
     - Fail: extract more stages / reduce process() param count
  2. [ ] Menos pytest passes for the unified pipeline tests
     - Verify: `cd ~/.dotfiles/menos/api && pytest tests/unit/test_unified_pipeline.py -q`
     - Pass: all tests green
     - Fail: behavior regression — add characterization test, re-extract
  3. [ ] Menos submodule committed and pushed
     - Verify: `cd ~/.dotfiles/menos && git status && git log origin/refactor/lizard-unified-pipeline..HEAD 2>&1`
     - Pass: working tree clean, `git log origin/...` empty (all commits
       reachable from origin after `git push -u origin refactor/lizard-unified-pipeline`)
     - Fail: commit and push before V1
  4. [ ] Parent repo sees new submodule pointer
     - Verify: `cd ~/.dotfiles && git status menos`
     - Pass: shows modified submodule pointer (to be bundled into V1)
     - Fail: submodule commit was not made inside the submodule

**T6: Refactor menos `menos/api/menos/routers/search.py`** [sonnet] — builder
- Blocked by: **T5** (both T5 and T6 commit inside the same menos
  submodule working tree — they MUST serialize to avoid corrupting the
  git index. T5 must complete and push before T6 starts.)
- Description: Fix **both** lizard warnings in this file:
    - `vector_search` at line 114 — CCN 41 (query parsing + filter
      dispatch; extract query parsing into a dedicated parser, filter
      dispatch into a registry, keep the route handler thin)
    - `_filter_by_entities` at line 266 — CCN 20 (entity filter
      logic; extract per-entity-type handlers)
  The `menos/api/tests/unit/test_search_router.py` test file exists.
- Files: `menos/api/menos/routers/search.py`,
  `menos/api/tests/unit/test_search_router.py`
- **IMPORTANT**: Before starting, verify T5's branch is pushed and the
  menos working tree is clean. Then: `cd ~/.dotfiles/menos && git checkout main && git pull --rebase origin main && git checkout -b refactor/lizard-search-router`
- Acceptance Criteria:
  1. [ ] Lizard clean on file (both warnings resolved)
     - Verify: `lizard -C 8 -L 250 -a 7 -w menos/api/menos/routers/search.py`
     - Pass: exit 0, zero warnings
     - Fail: extract more helpers
  2. [ ] Menos pytest passes for the search router tests
     - Verify: `cd ~/.dotfiles/menos/api && pytest tests/unit/test_search_router.py -q`
     - Pass: all tests green
     - Fail: regression — add characterization test and re-extract
  3. [ ] Menos submodule committed and pushed
     - Verify: `cd ~/.dotfiles/menos && git status && git log origin/refactor/lizard-search-router..HEAD 2>&1`
     - Pass: working tree clean, `git log origin/...` empty
     - Fail: push before V1

### Wave 1 — Validation Gate

**V1: Validate wave 1 (S0 tier)** [sonnet] — validator-heavy
- Blocked by: T1, T2, T3, T4, T5, T6
- Checks:
  1. **Per-file lizard clean (not just count drop)** — re-run each
     T1..T6 lizard verification and confirm **exit 0 for every targeted
     file**. A count-based check is gameable; per-file exit 0 is
     definitive. Files to re-check:
     - `onyx/api/src/providers/vercel-ai.ts`
     - `pi/extensions/agent-team.ts`
     - `claude/hooks/damage-control/bash-tool-damage-control.py`
     - `pi/prompt-routing/evaluate.py`
     - `menos/api/menos/services/unified_pipeline.py`
     - `menos/api/menos/routers/search.py`
  2. Dotfiles Python tests: `make test-pytest` — all pass.
  3. Menos Python tests: `cd ~/.dotfiles/menos/api && pytest -q` — all pass.
  4. Damage-control hook tests: `cd ~/.dotfiles/claude/hooks/damage-control && python -m pytest tests/ -q` — all pass (no failure masking).
  5. Onyx API tests: `cd ~/.dotfiles/onyx/api && bun test providers/vercel-ai` — all pass.
  6. Pi vitest suite: `cd ~/.dotfiles/pi/tests && bun vitest run agent-team` — all pass.
  7. **Submodule branches pushed to origin** — verify all refactor
     branches created during Wave 1 are reachable from `origin`:
     - `cd ~/.dotfiles/menos && git log origin/refactor/lizard-unified-pipeline..HEAD` — empty
     - `cd ~/.dotfiles/menos && git log origin/refactor/lizard-search-router..HEAD` — empty
     - `cd ~/.dotfiles/onyx && git log origin/refactor/lizard-vercel-ai..HEAD` — empty
     (If any is non-empty, the submodule branch was not pushed and
     the parent pointer bump references an unreachable SHA.)
  8. Submodule working trees are clean:
     - `cd ~/.dotfiles/menos && git status --porcelain` — empty output
     - `cd ~/.dotfiles/onyx && git status --porcelain` — empty output
  9. Parent repo shows new menos AND onyx submodule pointers staged or
     committed.
- On failure: Create targeted fix task for the specific failing check;
  re-run V1.

### Wave 2 — S1 (CCN 21–40): parallel, scoped by owning area

**T7: Refactor `pi/prompt-routing/` CLI `main()` cluster** [opus] — builder-heavy
- Description: Five files share the same anti-pattern — a giant
  `main()` doing argparse dispatch + orchestration + formatting.
  Targets: `build_corpus.py:242` (CCN 36), `train.py:92` (CCN 29),
  `audit.py:148` (CCN 29), `label_history.py:216` (CCN 25),
  `ingest_data_files.py:126` (CCN 9), `merge_labels.py:135` (CCN 15).
  Extract a common pattern: `parse_args() -> run(args) -> main()` where
  each `run()` is the orchestrator and each sub-step is its own helper.
- Files: 5–6 files in `pi/prompt-routing/`
- Acceptance Criteria:
  1. [ ] Lizard clean on all targeted files
     - Verify: `lizard -C 8 -L 250 -a 7 -w pi/prompt-routing/build_corpus.py pi/prompt-routing/train.py pi/prompt-routing/audit.py pi/prompt-routing/label_history.py pi/prompt-routing/ingest_data_files.py pi/prompt-routing/merge_labels.py`
     - Pass: exit 0, no warnings
     - Fail: continue extraction on the flagged file
  2. [ ] Ruff clean on all files
     - Verify: `ruff check pi/prompt-routing/ && ruff format --check pi/prompt-routing/`
     - Pass: clean
     - Fail: run `ruff format pi/prompt-routing/` and re-verify
  3. [ ] Each script's `--help` still works
     - Verify: `for f in build_corpus train audit label_history ingest_data_files merge_labels; do python pi/prompt-routing/$f.py --help >/dev/null && echo "$f: OK" || echo "$f: FAIL"; done`
     - Pass: all six print "OK"
     - Fail: restore argparse wiring on the failing script
  4. [ ] Minimal fixture smoke (behavioral, not just argparse)
     - Verify: if any fixture exists under `pi/prompt-routing/data/`,
       run a minimal end-to-end call with the smallest available
       fixture (e.g., `python pi/prompt-routing/audit.py --input pi/prompt-routing/data/<smallest>.json --dry-run` or equivalent).
       For scripts without a `--dry-run`, use the smallest test corpus.
     - Pass: exit 0 and output matches pre-refactor baseline (capture
       with `diff` against a pre-refactor run if possible)
     - Fail: behavioral regression in `run()` wiring — restore and
       re-extract with explicit test pinning

**T8: Refactor `claude/hooks/path-normalization/path-normalization-hook.py:265`** [sonnet] — builder
- Description: CCN 29. Platform/path branching — extract per-platform
  normalizers and dispatch by detected platform.
- Files: `claude/hooks/path-normalization/path-normalization-hook.py`,
  tests under `claude/hooks/path-normalization/tests/` if present
- Acceptance Criteria:
  1. [ ] Lizard clean
     - Verify: `lizard -C 8 -L 250 -a 7 -w claude/hooks/path-normalization/path-normalization-hook.py`
     - Pass: exit 0
     - Fail: extract more platform helpers
  2. [ ] Ruff clean
     - Verify: `ruff check claude/hooks/path-normalization/path-normalization-hook.py && ruff format --check claude/hooks/path-normalization/path-normalization-hook.py`
     - Pass: clean
  3. [ ] Hook smoke test
     - Verify: `echo '{"tool_name":"Read","tool_input":{"file_path":"C:/Users/mglenn/.dotfiles/README.md"}}' | python claude/hooks/path-normalization/path-normalization-hook.py; echo "exit=$?"`
     - Pass: exit 0
     - Fail: restore dispatch wiring

**T9: Refactor `claude/scripts/skill-analyzer.py:784`** [sonnet] — builder
- Description: CCN 28. Likely a per-skill analysis loop with many
  classification branches. Extract classifier table.
- Files: `claude/scripts/skill-analyzer.py`
- Acceptance Criteria:
  1. [ ] Lizard clean
     - Verify: `lizard -C 8 -L 250 -a 7 -w claude/scripts/skill-analyzer.py`
     - Pass: exit 0
  2. [ ] Ruff clean
     - Verify: `ruff check claude/scripts/skill-analyzer.py && ruff format --check claude/scripts/skill-analyzer.py`
     - Pass: clean
  3. [ ] Script still runs
     - Verify: `python claude/scripts/skill-analyzer.py --help 2>&1 | head -3`
     - Pass: exit 0 or argparse help shown
     - Fail: restore CLI wiring

**T10: Refactor `onyx/api/src/agents/context.ts:17`** [sonnet] — builder
- Description: CCN 25. Agent context assembly — likely many conditional
  field population. Extract field builders and use a context
  composition pattern.
- Files: `onyx/api/src/agents/context.ts`
- Acceptance Criteria:
  1. [ ] Lizard clean
     - Verify: `lizard -C 8 -L 250 -a 7 -w onyx/api/src/agents/context.ts`
     - Pass: exit 0
  2. [ ] Biome clean
     - Verify: `cd onyx && biome check api/src/agents/context.ts`
     - Pass: no errors
  3. [ ] Tests pass
     - Verify: `cd onyx/api && bun test agents/context`
     - Pass: all green, or "no tests matched" (add characterization test in that case)

**T11: Refactor menos `services/agent.py` + `scripts/export_summaries.py`** [sonnet] — builder
- Description: CCN 27 (`services/agent.py:185`) and CCN 21
  (`scripts/export_summaries.py:78`). Both extract orchestration logic
  into sub-functions.
- Files: `menos/api/menos/services/agent.py`, `menos/api/scripts/export_summaries.py`
- **IMPORTANT**: Before starting, verify menos working tree is clean
  and ensure T15 is not running concurrently (both touch `menos/`).
  Then: `cd ~/.dotfiles/menos && git checkout main && git pull --rebase origin main && git checkout -b refactor/lizard-agent-export`
- Acceptance Criteria:
  1. [ ] Lizard clean on both
     - Verify: `lizard -C 8 -L 250 -a 7 -w menos/api/menos/services/agent.py menos/api/scripts/export_summaries.py`
     - Pass: exit 0
  2. [ ] Menos tests pass
     - Verify: `cd ~/.dotfiles/menos/api && pytest -q`
     - Pass: all green
  3. [ ] Submodule committed and pushed
     - Verify: `cd ~/.dotfiles/menos && git status && git log origin/refactor/lizard-agent-export..HEAD 2>&1`
     - Pass: working tree clean, `git log origin/...` empty
     - Fail: `git push -u origin refactor/lizard-agent-export`

### Wave 2 — Validation Gate

**V2: Validate wave 2 (S1 tier)** [sonnet] — validator-heavy
- Blocked by: T7, T8, T9, T10, T11
- Checks:
  1. **Per-file lizard clean** — re-run each T7..T11 lizard
     verification. Every targeted file exits 0. Files to re-check:
     - `pi/prompt-routing/{build_corpus,train,audit,label_history,ingest_data_files,merge_labels}.py`
     - `claude/hooks/path-normalization/path-normalization-hook.py`
     - `claude/scripts/skill-analyzer.py`
     - `onyx/api/src/agents/context.ts`
     - `menos/api/menos/services/agent.py`, `menos/api/scripts/export_summaries.py`
  2. Dotfiles Python tests: `make test-pytest` — all pass.
  3. Menos Python tests: `cd ~/.dotfiles/menos/api && pytest -q` — all pass.
  4. Onyx API tests: `cd ~/.dotfiles/onyx/api && bun test` — all pass.
  5. Pi vitest suite: `cd ~/.dotfiles/pi/tests && bun vitest run` — all pass.
  6. Pi prompt-routing smoke: `for f in build_corpus train audit label_history ingest_data_files merge_labels; do python pi/prompt-routing/$f.py --help >/dev/null && echo OK || echo "FAIL $f"; done` — all six print OK.
  7. Hook self-test: editing a modified file through the PostToolUse
     hook does not produce new block decisions for lizard or ruff.
  8. Menos submodule is clean and T11's branch is pushed to origin:
     `cd ~/.dotfiles/menos && git status --porcelain && git log origin/refactor/lizard-agent-export..HEAD` — both empty.
- On failure: Create targeted fix task, re-run V2.

### Wave 3 — S2 (CCN 9–20): batch cleanup by directory

Each T12..T16 task handles its directory's S2 warnings in a single pass,
applying the same extraction patterns used in waves 1–2. Because the
same file may contain multiple S2 warnings, tasks batch by file and
scope tightly to the given directory.

**T12: Batch-refactor `claude/hooks/` S2 warnings** [sonnet] — builder
- Description: Remaining `claude/hooks/` functions at CCN 9–20 (excluding
  files already touched in T3 and T8). Typical fixes: extract helper per
  branch, replace long `if/elif` chains with a dict dispatch.
- **Prerequisite — enumerate T3/T8 modified files before starting**:
  Run `cd ~/.dotfiles && git log --name-only --pretty=format: V1..V2 -- 'claude/hooks/**' | sort -u` (or inspect T3 and T8 commits directly with `git show <sha> --name-only`) to determine the exact set of files to exclude from this batch. Re-run the baseline scan to enumerate which `claude/hooks/` files still have lizard warnings after V2.
- Files: ~8 files under `claude/hooks/` (regenerate list via baseline scan)
- Acceptance Criteria:
  1. [ ] Subdirectory lizard clean
     - Verify: `lizard -C 8 -L 250 -a 7 -w -l python claude/hooks`
     - Pass: exit 0
     - Fail: continue extraction on flagged file
  2. [ ] Ruff clean on directory
     - Verify: `ruff check claude/hooks && ruff format --check claude/hooks`
     - Pass: clean
  3. [ ] Quality-validation hook tests still pass
     - Verify: `cd claude/hooks/quality-validation && python -m pytest tests/ -q`
     - Pass: all 39 tests pass
     - Fail: regression in validator or helper code

**T13: Batch-refactor `pi/extensions/` S2 warnings** [sonnet] — builder
- Description: Remaining `pi/extensions/` functions at CCN 9–20
  (excluding `agent-team.ts` already in T2). Includes
  `commit-guard.ts`, `damage-control.ts`, `prompt-router.ts`,
  `pwsh.ts`, `quality-gates.ts`, `web-tools.ts`, `subagent/agents.ts`.
- Files: ~6 files under `pi/extensions/`
- Acceptance Criteria:
  1. [ ] Subdirectory lizard clean
     - Verify: `lizard -C 8 -L 250 -a 7 -w -l typescript pi/extensions`
     - Pass: exit 0
  2. [ ] TypeScript type-check passes (pi has no biome config)
     - Verify: `cd ~/.dotfiles/pi && npx tsc --noEmit 2>&1 | tail -20`
     - Pass: no errors
     - Fail: type regression from refactor
  3. [ ] Pi vitest suite passes
     - Verify: `cd ~/.dotfiles/pi/tests && bun vitest run`
     - Pass: all green
     - Fail: pin regression with characterization test

**T14: Batch-refactor `onyx/api/` S2 warnings** [sonnet] — builder
- Description: Remaining `onyx/api/` TypeScript functions at CCN 9–20
  (excluding `vercel-ai.ts` and `agents/context.ts` already covered).
- Files: ~6 files under `onyx/api/src/`
- Acceptance Criteria:
  1. [ ] Subdirectory lizard clean
     - Verify: `lizard -C 8 -L 250 -a 7 -w -l typescript onyx/api/src`
     - Pass: exit 0
  2. [ ] Biome clean
     - Verify: `cd onyx && biome check api/src`
     - Pass: no errors
  3. [ ] Onyx API tests pass
     - Verify: `cd onyx/api && bun test`
     - Pass: all green

**T15: Batch-refactor menos `api/menos/` S2 warnings** [sonnet] — builder
- Description: Remaining functions in `menos/api/menos/` at CCN 9–20,
  excluding files covered by T5, T6, T11.
- Files: ~8 files under `menos/api/menos/`
- **IMPORTANT**: Before starting, verify menos working tree is clean.
  Then: `cd ~/.dotfiles/menos && git checkout main && git pull --rebase origin main && git checkout -b refactor/lizard-menos-s2`
- Acceptance Criteria:
  1. [ ] Subdirectory lizard clean
     - Verify: `lizard -C 8 -L 250 -a 7 -w -l python menos/api/menos`
     - Pass: exit 0
  2. [ ] Ruff clean
     - Verify: `cd ~/.dotfiles/menos/api && ruff check menos && ruff format --check menos`
     - Pass: clean
  3. [ ] Menos tests pass
     - Verify: `cd ~/.dotfiles/menos/api && pytest -q`
     - Pass: all green
  4. [ ] Submodule committed and pushed
     - Verify: `cd ~/.dotfiles/menos && git status && git log origin/refactor/lizard-menos-s2..HEAD 2>&1`
     - Pass: working tree clean, `git log origin/...` empty
     - Fail: `git push -u origin refactor/lizard-menos-s2`

**T16: Catch-all remaining S2 warnings** [sonnet] — builder
- Description: Pick up stragglers: `dotbot/dotbot/` (8 warnings),
  `claude/scripts/` (remaining after T9), `claude/commands/` (5),
  `onyx/e2e/` (7), `pi/skills/` (2), `menos/api/scripts/` (remaining
  after T11), `claude/claude-status-go/` (1, CCN 13 in main()),
  `claude/repo-watch/` (1).
- **Prerequisites**:
  - For `claude/claude-status-go/`: verify Go toolchain is installed
    and deps resolved: `go version && cd ~/.dotfiles/claude/claude-status-go && go mod download`. If Go is not installed on the target machine, skip this file and document it in the final synthesis.
  - For any menos file touched: follow the menos submodule flow
    (checkout main, rebase, new branch, push).
- Files: ~12 files across the above dirs
- Acceptance Criteria:
  1. [ ] Each touched file lizard clean
     - Verify: re-run the baseline scan and confirm these directories
       report zero warnings
     - Pass: zero warnings in those dirs
  2. [ ] Language-appropriate lint clean on each touched file
     - Verify: `ruff check <python files>`, `biome check <ts/js files>`,
       `go vet ./...` for Go files
     - Pass: all clean
  3. [ ] Tests pass where they exist; smoke test scripts where they don't
     - Verify: run per-file smoke where no tests exist (e.g., `--help` or
       `-h`)
     - Pass: no regressions

### Wave 3 — Validation Gate

**V3: Validate wave 3 and final end-to-end** [sonnet] — validator-heavy
- Blocked by: T12, T13, T14, T15, T16
- Checks:
  1. Re-run each T12..T16 lizard directory scan. All exit 0.
  2. **Full-repo baseline scan returns zero warnings** (see Success
     Criteria command).
  3. All dotfiles tests pass: `make test-pytest`.
  4. All menos tests pass: `cd ~/.dotfiles/menos/api && pytest -q`.
  5. Onyx API tests pass: `cd ~/.dotfiles/onyx/api && bun test`.
  6. Pi vitest suite passes: `cd ~/.dotfiles/pi/tests && bun vitest run`.
  7. Hook end-to-end: simulate edit on a random source file via JSON
     stdin; confirm exit 0 and no block output.
  8. No entries have been added to `skip-validators.txt` for
     `lizard-complexity`.
  9. No changes to thresholds in `validators.yaml` (still `-C 8 -L 250 -a 7`).
  10. **Both menos and onyx submodules: all refactor branches pushed**:
      - `cd ~/.dotfiles/menos && git status --porcelain` — empty
      - `cd ~/.dotfiles/onyx && git status --porcelain` — empty
      - For each refactor branch created during the plan in both submodules,
        verify `git log origin/<branch>..HEAD` returns empty
  11. Parent repo has committed menos AND onyx submodule pointer bumps.
- On failure: Create targeted fix task, re-run V3. Do not mark the plan
  complete until V3 is fully green.

## Dependency Graph

```
Wave 1: T1, T2, T3, T4 (parallel)
        T5 ---> T6  (serial — shared menos working tree)
                 \
                  `---> V1

Wave 2: T7, T8, T9, T10, T11 (parallel)  <--- V1
                                          |
                                          v
                                         V2

Wave 3: T12, T13, T14, T15, T16 <--- V2
        (parallel, but T15 must not run concurrently with any other
         menos-touching task — serialize inside the wave if needed)
                                          |
                                          v
                                         V3 (final gate)
```

**Serialization constraints:**
- **Wave 1**: T5 and T6 both commit inside the single menos working
  tree. T6 is blocked by T5.
- **Wave 2**: T11 commits inside menos. If any other Wave 2 task (T7–T10)
  ever touches menos in a future iteration, it must be serialized with
  T11. Currently none do.
- **Wave 3**: T15 commits inside menos. T16 may also touch menos
  (`menos/api/scripts/`). T16 must wait for T15 to finish and push
  before starting any menos edits, or T16 must skip menos files and
  defer them to a follow-up.

## Success Criteria

1. [ ] **Baseline scan returns zero warnings**
   - Verify:
     ```bash
     lizard -C 8 -L 250 -a 7 -w \
       -x "*/.venv/*" -x "*/node_modules/*" -x "*/.git/*" \
       -x "*/dist/*" -x "*/build/*" -x "*/__pycache__/*" \
       -x "*/.svelte-kit/*" -x "*/.specs/*" \
       -x "*/tests/*" -x "*/test_*" \
       -x "*/dotbot/lib/*" \
       -x "*/onyx/frontend/*" \
       -x "*/playwright-report/*" \
       -l python -l javascript -l typescript -l go . 2>&1 | grep -c "warning:"
     ```
   - Pass: `0`
   - Fail: any remaining warnings → identify tier and create a fix task
2. [ ] **All test suites pass**
   - Verify: `make test-pytest && (cd ~/.dotfiles/menos/api && pytest -q) && (cd ~/.dotfiles/onyx/api && bun test) && (cd ~/.dotfiles/pi/tests && bun vitest run)`
   - Pass: every suite exits 0
3. [ ] **Validator config unchanged (same thresholds)**
   - Verify: `grep -A1 'lizard-complexity' claude/hooks/quality-validation/validators.yaml | grep -c '"-C", "8"'`
   - Pass: `4` (one per language block)
   - Fail: thresholds were loosened — revert and re-refactor
4. [ ] **No new skip-list entries**
   - Verify: `grep -c 'lizard-complexity' ~/.claude/hooks/quality-validation/skip-validators.txt 2>/dev/null || echo 0`
   - Pass: `0`
5. [ ] **Menos submodule pointer is committed in parent AND all refactor branches are pushed to origin**
   - Verify:
     ```bash
     cd ~/.dotfiles && git status menos  # expect clean
     cd ~/.dotfiles/menos && git branch --list 'refactor/lizard-*' | while read -r b; do
       b="${b#* }"
       count=$(git log "origin/$b..HEAD" 2>/dev/null | wc -l)
       [ "$count" = "0" ] && echo "$b: pushed" || echo "$b: UNPUSHED ($count commits)"
     done
     ```
   - Pass: parent `git status menos` is clean AND every refactor branch reports "pushed"
   - Fail: any "UNPUSHED" branch → `cd menos && git push -u origin <branch>` and re-bump the parent pointer
6. [ ] **Hook still functional end-to-end**
   - Verify: `echo '{"tool_name":"Edit","tool_input":{"file_path":"C:/Users/mglenn/.dotfiles/README.md"}}' | python claude/hooks/quality-validation/quality_validation_hook.py; echo "exit=$?"`
   - Pass: exit 0, no block output
7. [ ] **Plan file archived**
   - Verify: `ls .specs/archive/lizard-refactor/plan.md`
   - Pass: file exists (moved from `.specs/lizard-refactor/`)

## Handoff Notes

- **Red-Green-Refactor loop** (applies to every task):
  1. *Red*: run lizard on the target file, confirm the flagged function,
     record current CCN/length/params. If the file has no tests,
     characterize current behavior (happy path, one boundary, one error)
     **before** extracting. Commit the characterization test separately.
  2. *Green*: apply refactorings in this order of preference:
     guard-clause inversion → extract method → replace conditional with
     dispatch table → parameter object → split by responsibility. Stop
     when lizard reports zero warnings for the file.
  3. *Refactor*: run tests + linters, re-verify lizard, commit with
     message `refactor(<scope>): reduce <function> complexity (CCN <old> -> <new>)`.
- **Helper sizing**: each extracted helper should target CCN ≤ 5 so it
  never becomes the next hotspot.
- **Never disable the validator** as a shortcut (`skip-validators.txt`,
  `# noqa`, threshold bump). If blocked, document why in an `open_questions`
  section at the bottom of this plan and escalate.
- **Menos submodule flow** (the submodule starts in a **detached HEAD**
  state at the parent's recorded pointer — you MUST check out main
  first, or your new branch will be created off a detached commit with
  no tracking relationship to origin):
  ```bash
  cd ~/.dotfiles/menos
  git status                             # verify clean
  git checkout main                      # leave detached HEAD
  git pull --rebase origin main          # sync with remote
  git checkout -b refactor/lizard-<slug> # new branch tracks nothing yet
  # ... do the refactor, commit ...
  git push -u origin refactor/lizard-<slug>  # REQUIRED — parent pointer
                                             # bump is unreachable without this
  cd ~/.dotfiles
  git add menos                          # stage the new submodule pointer
  ```
  Never stage menos files from the parent repo's working tree. Always
  commit inside the submodule first. **Never skip the `git push` step** —
  a parent pointer bump to an unpushed SHA will break every fresh clone
  of the parent repo and any CI that runs `git submodule update --init`.
- **Submodule working-tree races**: Only one task at a time may operate
  inside the menos working tree, because it's a single git worktree.
  T5 and T6 are serialized via dependency; T11 must not run until T7/T8/
  T9/T10 have completed *or* they must not touch menos; T15 must run
  alone among Wave 3 tasks that touch menos. If you find yourself
  wanting to parallelize menos tasks, either use `git worktree add` on
  the submodule (advanced) or just serialize them.
- **Rolling back menos commits** (if a validation gate fails):
  ```bash
  cd ~/.dotfiles/menos
  git reset --hard origin/main          # discard local branch commits
  git branch -D refactor/lizard-<slug>  # delete the branch
  # If the branch was pushed and you want to remove it from origin:
  git push origin --delete refactor/lizard-<slug>
  cd ~/.dotfiles
  git checkout HEAD -- menos            # revert parent pointer to last committed
  ```
  **Warning**: `git reset --hard` is destructive. Only run it if you
  are certain the commits you're discarding are not wanted elsewhere.
  Confirm with the user before executing rollback in a shared workspace.
- **Hook self-enforcement**: after each commit, the PostToolUse hook will
  block any future edit that reintroduces a CCN > 8 function in the file.
  This means the ratchet is automatic — no manual re-verification needed
  between tasks.
- **Mid-refactor hook blocking** — IMPORTANT: the PostToolUse hook runs
  on every Edit/Write tool call, so a file with CCN > 8 will emit a
  `{"decision":"block"}` after every intermediate edit until the
  refactor is complete. Two safe ways to handle multi-step extractions:
  1. **Preferred — single Edit/Write**: craft the full extraction in
     one Edit call (multiple chunks via `replace_all` or staged edits
     using a temp file written in one shot) so the hook only evaluates
     the final, clean state.
  2. **Escape hatch — temporary skip**: add the target file to
     `~/.claude/hooks/quality-validation/skip-validators.txt` with
     `lizard-complexity` entry, perform the staged edits, then REMOVE
     the skip entry and run `lizard -w <file>` manually before
     committing. **Never commit with the skip entry still active.**
     V1/V2/V3 all check for residual skip entries and will fail if one
     is left behind.
- **Windows specifics**: use forward slashes in paths. Use `python` not
  `python3`. `uv run` is avoided in hooks due to console-flashing bug;
  refactoring itself can use normal tooling.
- **Hook's own source is already compliant** as of baseline commit
  `2e51f7d` (`main()` refactored from CCN 18 to 6 via extraction of
  `parse_hook_input`, `check_validator_available`,
  `format_validator_error`, `run_validator_suite`, and `is_path_excluded`).
  Use this refactor as a reference for the S2 batch tasks.
- **Baseline count**: 173 warnings (117 dotfiles + 56 menos). Re-run the
  scan command at the start of each wave to regenerate the working set.
