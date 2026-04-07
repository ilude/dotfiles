---
date: 2026-04-06
status: synthesis-complete
---

# Plan Review Synthesis: Lizard Complexity Refactor

## Review Panel

| Reviewer | Role | Findings | Verified Issues |
|----------|------|----------|-----------------|
| R1 | Completeness & Explicitness | 8 | 8 (all tool-verified) |
| R2 | Adversarial / Red Team | 8 | 7 confirmed, 1 dismissed |
| R3 | Outside-the-Box / Simplicity | 8 | 6 confirmed, 2 contextual |
| R4 | Refactoring Safety / Behavior Preservation | 8 | 7 confirmed, 1 low-risk |
| R5 | Git Submodule Workflow | 8 | 6 confirmed, 2 medium |
| R6 | Parallel Execution / Wave Orchestration | 8 | 5 confirmed, 3 dismissed |

All findings in the Bugs section were verified directly against the codebase using Read, Bash, Grep, and Glob tools.

---

## Outside-the-Box Assessment

The tier-based wave approach is sound for a deliberate backlog clearance effort. The plan correctly rejects the organic ratchet for S0 hotspots and correctly scopes menos as in-scope. CCN 8 is aggressive (SonarQube's default is CCN 15; Radon's B threshold is CCN 10) but this is an explicit user decision documented in the plan as non-negotiable, so it is not a bug — it is a constraint. The orchestration overhead (16 tasks + 3 validators) is proportional to the work: 173 warnings across 4 languages and 2 repos would be ungovernable without structure. The main risks are execution correctness (wrong test commands, missing test directories) rather than architectural over-engineering.

---

## Bugs (must fix before executing)

### CRITICAL

**BUG-1: T5 and T6 acceptance criteria reference non-existent test directories**
- Flagged by: R1, R4, R6
- Verification: `ls /c/Users/mglenn/.dotfiles/menos/api/tests/services/` → `No such file or directory`. Same for `tests/routers/`. The actual test layout is `menos/api/tests/unit/`, `menos/api/tests/integration/`, and `menos/api/tests/smoke/`. Both `test_unified_pipeline.py` and `test_search_router.py` exist under `tests/unit/`.
- Impact: T5 acceptance criterion 2 (`pytest tests/services -q`) and T6 acceptance criterion 2 (`pytest tests/routers -q`) will fail immediately with "no tests ran" or directory-not-found, giving false confidence.
- Fix: Replace `pytest tests/services -q` with `pytest tests/unit/test_unified_pipeline.py tests/unit/test_pipeline_orchestrator.py -q` in T5. Replace `pytest tests/routers -q` with `pytest tests/unit/test_search_router.py -q` in T6.

**BUG-2: Pi test command is wrong throughout the plan (`bun test` vs `bun vitest run`)**
- Flagged by: R1, R2, R6
- Verification: `cat /c/Users/mglenn/.dotfiles/pi/justfile` shows the test recipe is `cd ~/.dotfiles/pi/tests && bun vitest run`. There is no `pi/package.json`. The plan uses `cd pi && bun test` in T2 acceptance criteria (line 155), T13 acceptance criteria (line 412), V2 check 4 (line 366 — absent), V3 check 6, and the Success Criteria compound command. `bun test` without a package.json in `pi/` will either fail or silently find nothing.
- Impact: Every pi-related test verification step fails with an uninformative error, causing validators to report a broken state or silently skip pi tests.
- Fix: Replace all `cd pi && bun test` occurrences with `cd ~/.dotfiles/pi/tests && bun vitest run`. Also add a pi test step to V2 (currently missing).

**BUG-3: T3 test command masks test failures**
- Flagged by: R2, R4
- Verification: T3 acceptance criterion 3 uses `cd claude/hooks/damage-control && python -m pytest tests/ -q 2>/dev/null || echo "no tests"`. The `damage-control/tests/` directory has 8 test files (confirmed: `test_ast_analyzer.py`, `test_integration.py`, `test_exfil_patterns.py`, etc.). The `|| echo "no tests"` branch executes when pytest exits nonzero — i.e., on test failure — silently reporting "no tests" instead of surfacing the regression.
- Impact: A refactor that breaks the damage-control hook test suite would pass T3 acceptance criterion 3, leaving the system in a broken state that V1 might not catch (V1 does not re-run damage-control tests).
- Fix: Remove the `2>/dev/null || echo "no tests"` fallback. Use: `cd claude/hooks/damage-control && python -m pytest tests/ -q`. If the directory truly has no tests, pytest exits 0 with "no tests ran."

**BUG-4: T3 scope understated — file has 12 warnings, plan targets only 2**
- Flagged by: R1, R4
- Verification: `lizard -C 8 -L 250 -a 7 -w claude/hooks/damage-control/bash-tool-damage-control.py` returns 12 warnings: `log_decision` (8 PARAM), `unwrap_command` (CCN 10), `_strip_inline_comment` (CCN 14), `_split_on_shell_operators` (CCN 22), `_split_pipe_chain` (CCN 15), `analyze_git_command` (CCN 41), `is_private_ip` (CCN 13), `extract_host_from_command` (CCN 11), `detect_context` (CCN 10), `check_path_patterns` (CCN 13), `check_command` (CCN 49), `main` (CCN 10). The plan describes only two (CCN 49 + CCN 41). The acceptance criterion "Lizard clean on file" correctly requires all 12 to be fixed, but the description, scope estimate (`~2 files`), and model assignment (sonnet) do not reflect the actual workload.
- Impact: The executor may consider the task complete after fixing the two S0 hotspots and commit, then V1 fails on the other 10 warnings. Sonnet may be insufficient for a 12-function refactor in a 1,889-line security-critical file.
- Fix: Update T3 description to list all 12 warnings. Upgrade model to opus. Update scope to `~1 file, 12 functions`. Note specifically that `log_decision` has 8 PARAM (parameter-object pattern needed).

**BUG-5: T5 scope understated — unified_pipeline.py has 2 warnings including one with 8 params**
- Flagged by: R1, R4
- Verification: `lizard ... unified_pipeline.py` returns 2 warnings: `parse_unified_response:186` (CCN 41) and `process:453` (CCN 17, **8 PARAM**). The plan only describes line 186. The `process` method is an async class method; fixing it requires a parameter-object pattern.
- Impact: Executor fixes only `parse_unified_response`, commits, V1 fails on `process`.
- Fix: Add to T5 description: "Also fix `process` at line 453 (CCN 17, 8 PARAM — use a config/options dataclass to reduce parameter count)."

**BUG-6: T6 scope understated — search.py has 2 warnings**
- Flagged by: R1, R4
- Verification: `lizard ... search.py` returns 2 warnings: `vector_search:114` (CCN 41) and `_filter_by_entities:266` (CCN 20). Plan describes only line 114.
- Impact: Same as BUG-5 — executor commits after fixing vector_search, V1 fails on `_filter_by_entities`.
- Fix: Add to T6 description: "Also fix `_filter_by_entities` at line 266 (CCN 20)."

### HIGH

**BUG-7: Menos submodule is on detached HEAD — `git checkout -b` will not track origin**
- Flagged by: R5, R6
- Verification: `cd /c/Users/mglenn/.dotfiles/menos && git branch --show-current` returns empty (detached HEAD at `ef6ab01`). `git remote show origin` confirms `origin` points to `git@github.com:ilude/menos.git` and `ef6ab01` equals `origin/main HEAD`. The Handoff Notes say `cd menos && git checkout -b <branch>` without verifying or handling the detached HEAD state.
- Impact: On detached HEAD, `git checkout -b <branch>` creates a branch but it has no tracking relationship to origin/main, so `git push` without `-u origin <branch>` will fail. Commits created by T5/T6/T11/T15 will be on an untracked branch.
- Fix: Replace Handoff Notes submodule flow with: `cd menos && git checkout main && git pull --rebase origin main && git checkout -b <branch>`. Add `git push -u origin <branch>` to the post-commit step for every menos task.

**BUG-8: Plan never instructs pushing menos submodule commits — parent pointer references potentially unreachable SHA**
- Flagged by: R5, R6
- Verification: Searched entire plan for "push" — zero occurrences in the context of menos tasks. The menos remote is `git@github.com:ilude/menos.git` (confirmed). A parent repo pointer bump to a SHA that was never pushed to origin means any fresh clone of the parent repo will fail `git submodule update --init`.
- Impact: After V3, the parent repo points to a commit that only exists locally in the menos working tree. Team collaboration and CI are broken until someone manually pushes.
- Fix: Add to every menos task's acceptance criteria: "Push the submodule branch: `cd menos && git push -u origin <branch>`." Add to V1/V3 checklist: "Verify `cd menos && git log origin/<branch>..HEAD` returns empty."

**BUG-9: T5 and T6 run in parallel in Wave 1, but both commit inside the same menos submodule working tree**
- Flagged by: R5, R6
- Verification: Task Breakdown table confirms T5 and T6 have no `Depends On` relationship. Both involve `cd menos && git commit` inside the single menos working tree. Two concurrent agents operating on the same git working tree will corrupt the index (`MERGE_HEAD`, partial staging) or produce interleaved commits.
- Impact: Wave 1 parallel execution results in a corrupted menos working tree, requiring manual recovery.
- Fix: Add `addBlockedBy: [T5]` to T6 (or vice versa), making them serial within Wave 1. Note explicitly: "T5 and T6 must NOT run concurrently — they share the menos working tree."

**BUG-10: T2 acceptance criterion uses `cd pi && bun test extensions/agent-team` — no agent-team tests exist**
- Flagged by: R1, R4 (partially addressed by BUG-2, but distinct issue)
- Verification: `ls /c/Users/mglenn/.dotfiles/pi/tests/` shows no `agent-team*.test.ts`. The pi test suite (vitest) covers `ask-user`, `pwsh`, `todo`, `tool-search`, `web-tools` — not `agent-team`. The plan's fallback "if exists" is in T2 description, not in the acceptance criterion command itself.
- Impact: `bun test extensions/agent-team` with the wrong test framework will silently exit 0 with no tests run, providing no behavior verification for the CCN-51 function.
- Fix: Change T2 acceptance criterion 2 to: "No agent-team test file exists in `pi/tests/`. Add a characterization test at `pi/tests/agent-team.test.ts` before refactoring. Run: `cd ~/.dotfiles/pi/tests && bun vitest run agent-team`."

**BUG-11: T8 is listed in the Task Breakdown table as Wave 1 (`Depends On: V1`) but the table row says V1 — correct. However the Task Breakdown table path `claude/hooks/path-normalization-hook.py` differs from the task body path `claude/hooks/path-normalization/path-normalization-hook.py`**
- Flagged by: R1
- Verification: `ls /c/Users/mglenn/.dotfiles/claude/hooks/path-normalization/path-normalization-hook.py` confirms the correct path is `claude/hooks/path-normalization/path-normalization-hook.py`. The Task Breakdown table (line 102) omits the subdirectory.
- Impact: An executor reading the table row to find the file will fail. Low execution risk since the body is correct, but creates confusion.
- Fix: Update task breakdown table row T8 file column to `claude/hooks/path-normalization/path-normalization-hook.py`.

**BUG-12: PostToolUse hook blocks intermediate refactor states — mid-refactor edits will be rejected**
- Flagged by: R2, R4
- Verification: `claude/settings.json` confirms PostToolUse hooks fire on every `Edit` and `Write` tool use. `quality_validation_hook.py` outputs `{"decision": "block", "reason": "..."}` on lizard violations. If a refactor requires multiple edits (extract helper → update calls → remove old logic), every intermediate Edit where a function still exceeds CCN 8 will be blocked.
- Impact: The executor cannot complete multi-step extractions that require touching the same file twice in succession. This is a systemic blocker for every task in the plan.
- Fix: Add to Handoff Notes: "The PostToolUse hook blocks Edit/Write on files with CCN > 8. To perform multi-step extractions without being blocked at each step: either (a) complete the full extraction in a single Edit/Write call, or (b) temporarily add the file to `skip-validators.txt` for `lizard-complexity` during the refactor, then remove it before committing. Option (b) requires a final `lizard -w` verification before committing to confirm the skip entry is clean."

---

## Hardening Suggestions (optional improvements)

**H1: T3 model assignment (sonnet) is likely insufficient for a 12-function security-critical file**
- Reasoning: bash-tool-damage-control.py is 1,889 lines implementing a complex security policy engine. It has 12 lizard warnings, two of which are CCN 41+ and one is a parameter-count violation. This is at least an opus-level task.
- Proportionality: OtB agrees this is worth upgrading — the damage-control hook is a safety-critical file.
- Recommendation: Upgrade T3 model to opus.

**H2: V2 does not test pi — T7 touches pi/prompt-routing Python files but V2 only checks dotfiles and menos Python tests**
- Verification: V2 checks (lines 363–371): `make test-pytest`, `cd menos/api && pytest -q`, `cd onyx/api && bun test`. No pi validation. T7 refactors 5–6 pi/prompt-routing scripts. The only T7 validation is `--help` smoke tests in T7's own acceptance criteria.
- Recommendation: Add to V2: "Pi prompt-routing smoke: `for f in build_corpus train audit label_history ingest_data_files merge_labels; do python pi/prompt-routing/$f.py --help >/dev/null && echo OK || echo FAIL $f; done`"

**H3: V1 "dropped by at least 7" count is fragile**
- Reasoning: T3 fixes 12 warnings in one file; T5 fixes 2; T6 fixes 2. The minimum S0-tier hotspot count per file is accurate (7 functions ≥ CCN 40), but the test counts total warning reduction, not S0 reduction. A refactor that eliminates 7 S0 functions but creates 5 new S1 warnings would pass V1's count check.
- Recommendation: Change V1 check to: "Re-run each T1..T6 `lizard -w <file>` and verify exit 0 for each file (zero remaining warnings per file), not just a count drop."

**H4: Wave 3 task T12 has no mechanism to enumerate which files T3/T8 already touched**
- Reasoning: T12 description says "excluding files already touched in T3 and T8" but provides no command to determine the actual set of T3/T8 modifications. If T3 extracted helpers into new files, those files may not be tracked.
- Recommendation: Add to T12 prerequisites: "Run `git diff --name-only` or check the commits from T3 and T8 to enumerate actually-modified files before starting the batch."

**H5: T7 argparse smoke test is the only verification — no behavioral equivalence check**
- Reasoning: `--help` exiting 0 proves argparse wiring but not that `main()` still orchestrates correctly. The T7 scripts run ML pipeline operations; a broken argument default or changed return value would not be caught by `--help`.
- Recommendation: Add to T7 acceptance criteria: "If any script has integration test fixtures in `pi/prompt-routing/data/`, run a minimal end-to-end call with the smallest available test fixture."

**H6: T16 Go module — `go test ./...` from `claude/claude-status-go/` requires Go installed and module dependencies resolved**
- Verification: `claude/claude-status-go/main.go` has CCN 13 (under limit? — no, plan says this is a CCN ≤ 8 target). `lizard` reports CCN 13 for `main` at line 131. Go tests require `go` CLI installed and `go mod download`.
- Recommendation: Add to T16 prerequisites: "Verify `go version` and `go mod download` succeed in `claude/claude-status-go/` before refactoring."

**H7: No rollback procedure for submodule commits**
- Reasoning: If V1 fails after T5/T6 have committed inside menos, the executor must roll back. The plan has no rollback steps.
- Recommendation: Add to Handoff Notes: "To roll back menos commits: `cd menos && git reset --hard origin/main` (discards local branch commits). To roll back parent pointer: `cd ~/.dotfiles && git checkout HEAD -- menos`."

**H8: T13 biome check command will fail — pi has no biome.json**
- Verification: `ls /c/Users/mglenn/.dotfiles/pi/biome.json` → not found. `ls /c/Users/mglenn/.dotfiles/pi/extensions/biome.json` → not found. The T13 acceptance criterion 2 says `cd pi && biome check extensions/ 2>&1 | tail -5`. Without a biome config, biome will either error or apply defaults that may flag valid code.
- Recommendation: Remove the biome check from T13 (pi/extensions uses TypeScript but has no biome config). Replace with: `cd pi && npx tsc --noEmit 2>&1 | head -20` or just skip the lint step if pi doesn't have a configured linter.

---

## Dismissed Findings

**DISMISSED-1: "T2 getAgentDir is a trivial 3-line function — CCN 51 claim is wrong"**
- Initial concern: The function at line 31 appeared to be 3 lines (`return path.join(...)`).
- Verification: `lizard` confirms CCN 51, NLOC 112, length 140. The lizard-reported "function" starting at line 31 is `getAgentDir` in a TypeScript context where the function body spans 140 lines due to the file's structure. The CCN 51 claim is correct.
- Result: Not a false positive. T2 is correctly scoped.

**DISMISSED-2: "onyx/api has no test script — `bun test` will fail"**
- Initial concern: `cat onyx/api/package.json` showed no `scripts` section.
- Verification: Bun natively discovers and runs `*.test.ts` files without a scripts entry. `vercel-ai.test.ts`, `claude-agent.test.ts`, and others are confirmed at `onyx/api/src/providers/`. `bun test` without a script works fine.
- Result: False positive. `bun test` in onyx/api is valid.

**DISMISSED-3: "T8 depends on V1 but plan body puts it in Wave 2 — dependency inconsistency"**
- Initial concern: Task Breakdown row for T8 says "Depends On: V1" which matches Wave 2 placement.
- Verification: The Dependency Graph correctly shows T8 in Wave 2 (after V1). No inconsistency.
- Result: False positive.

**DISMISSED-4: "Success Criteria baseline scan excludes tests/* — this would exclude menos source files with test in the name"**
- Initial concern: `-x "*/tests/*"` might accidentally exclude source files.
- Verification: The menos source files are in `menos/api/menos/` not `menos/api/tests/`. The `-x "*/tests/*"` pattern only matches files under a `tests/` directory. No source files are named `tests/`.
- Result: False positive.

---

## Positive Notes

1. **All S0 target file paths are correct and verified.** Every file referenced in T1–T6 exists at the exact claimed path, and lizard confirms the claimed CCN values (T1: CCN 76, T2: CCN 51, T3: CCN 49+41, T4: CCN 48, T5: CCN 41, T6: CCN 41).

2. **Line-level lizard citations are accurate.** The plan's `file:line` format (e.g., `vercel-ai.ts:25`, `evaluate.py:104`) correctly identifies the function start lines. Executors can navigate directly to the target.

3. **Test infrastructure for the two highest-risk menos targets exists.** `menos/api/tests/unit/test_unified_pipeline.py` and `menos/api/tests/unit/test_search_router.py` are confirmed present, providing real behavioral anchoring for T5 and T6.

4. **The Red-Green-Refactor loop is well-specified.** The ordered extraction preference (guard-clause inversion → extract method → dispatch table → parameter object → split by responsibility) gives the executor a deterministic decision tree rather than open-ended judgment.

5. **Validators.yaml thresholds are confirmed correct.** The file contains `-C`, `8` in all four language blocks (Python, TypeScript, JavaScript, Go) matching the plan's stated constraints.

6. **The quality validation hook block format is confirmed.** `{"decision": "block", "reason": "..."}` is the actual output of `quality_validation_hook.py` (line 325), consistent with Claude Code's PostToolUse block protocol.

7. **The damage-control hook test suite is real and substantial.** 8 test files with AST analysis, integration, exfil pattern, injection detection, and sequence detection tests — good characterization coverage exists for T3 (once the failure-masking bug is fixed).

8. **Menos remote is accessible and has a clean state.** `git@github.com:ilude/menos.git` is reachable, origin/main is at `ef6ab01` matching local HEAD, and working tree is clean. The submodule starts in a safe state once the detached HEAD is resolved.
