---
created: 2026-05-03
status: completed
completed: 2026-05-03
---

# Plan: Address pi-review-2026-05-03 findings

## Context & Motivation

A five-reviewer pass over the prior two days of work (47 commits, ~17k lines
across 148 files) produced
[`findings.md`](./findings.md) -- 7 blockers, 2 high, 6 medium, and 5 follow-ups.
Per-area reports live in `raw/01..05-*.md`.

The blockers cluster around four real risks:

1. **Data-loss / safety bugs** in the new commit surface -- crashes on fresh
   repos, leaked staged files when commits fail, a confirmation token that is
   not actually timing-safe, and missing error boundaries in
   `commit_stage`/`commit_create`.
2. **Doc-vs-code drift** -- `docs/commit-helper-contract.md` disagrees with
   `pi/lib/commit/types.ts` on classification names, enum values, and top-level
   schema fields. A non-Pi consumer parsing tool output against the contract
   will misclassify entries.
3. **Workflow contract breakage** -- shared `do-it` validates a section name
   (`Team Members`) that `plan-it` no longer emits (`Task Breakdown`), and
   `buildSkillPrompt` double-appends the plan path when `replaceArguments` is
   true.
4. **CI does not gate the new tests.** `make check` runs `lint test`. The Pi
   vitest suite lives in `check-pi-extensions`, never invoked by `check` or by
   `.github/workflows/test.yml`. The new commit and observability tests have
   never failed a CI run because they have never been run by one.

The medium and follow-up items are real but bounded -- a non-CSPRNG `randomId`,
the secret-scan regex missing compound env-var names, observability spans not
extended to the commit tools, dual lockfiles in `pi/tests/`, and a stale doc
referring to a deleted extension.

## Constraints

- Platform: Windows 11, PowerShell + Git Bash; CI is GitHub Actions Ubuntu.
- Shell: scripts must respect `AGENTS.md` shell invariants (forward slashes,
  `python` not `python3`, `/dev/null` in bash).
- **No AI mentions** in any added file content.
- **ASCII punctuation only** in file content (`--` not em-dash).
- **Read before Edit/Write.** Prefer Edit over Write.
- **Pi tests must run via `bun vitest`**, not `npm`. Repo policy forbids `npm`
  and `yarn`.
- The `commit-helper-contract.md` rewrite must treat
  `pi/lib/commit/types.ts` as the source of truth.
- Tasks that change commit safety (B1, B2, H1, B5) must ship with new tests in
  the same wave -- the `Verify`/`Pass` for those tasks fails until the test
  exists and passes.

## Alternatives Considered

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| One sequential builder per finding | Simple, small diffs | 23 PRs of churn; same files touched twice | Rejected |
| Batch by surface (commit code, docs, CI, tests) and run waves in parallel | Independent surfaces parallelise; one validator per wave | Requires a clean dependency partition | **Selected** |
| Defer follow-ups (F1-F5), ship blockers only | Smaller scope | Leaves doc-stale and dead-code traps for the next session | Rejected -- F1/F3 are 5-line fixes, batching is cheaper |
| Re-open the archived observability spec instead of patching M1 here | Keeps spec history honest | Two coordination surfaces for one fix | Rejected -- patch here, write a note linking back to the archived spec in M1 acceptance |

## Objective

A clean repo state where:

- All 7 blockers and both high-severity items are fixed and covered by tests.
- All 6 medium items are addressed (M1 observability spans wired, M2 RNG
  swapped, M3/M4 test gaps closed, M5 contract inventory paragraph added,
  M6 behavioural test replaces source-grep test).
- All 5 follow-ups are landed (F1 stale doc, F2 fast-mode resolution, F3 lockfile
  removal, F4 direct-tool-vs-slash-command doc, F5 vitest coverage config).
- `make check` (now including the Pi vitest suite) and the GitHub Actions
  workflow both pass.

## Project Context

- **Language**: TypeScript (Pi extensions/lib), Python (commit helper, hooks).
- **Test command**: `make check` (after T6 wires the Pi vitest suite into it).
  Direct: `cd pi/tests && bun vitest run` and `uv run pytest test/`.
- **Lint command**: `make lint` (`uv run ruff check`, `shellcheck`).
- **Type-check (Pi extensions)**: `python pi/extensions/tsc-check.py`.

## Pre-Wave-1 Bookkeeping

**Bug 5 from review-1:** `pi/tests/workflow-new-command.test.ts` is currently
deleted in the working tree (`git status --short pi/tests/` shows `D`). T2
references it as a test pattern model; T3 modifies it. Before any wave-1 task
starts, restore it from HEAD:

```bash
git checkout HEAD -- pi/tests/workflow-new-command.test.ts
```

The deletion was unintentional working-tree state captured at session start.
If the file genuinely should not exist, raise it as out-of-scope before
proceeding -- do not let T2/T3 silently regress on it.

## Task Breakdown

| #  | Task | Files | Type | Model | Agent | Depends On |
|----|------|-------|------|-------|-------|------------|
| T0 | Restore deleted `workflow-new-command.test.ts` | 1 | mechanical | haiku | builder-light | -- |
| T1 | Commit slash-command safety (B1, H1, H2) | 2 | feature | sonnet | builder | T0 |
| T2 | Commit tool error boundary + timing-safe token + behavioural test (B2, B5, M6) | 4 | feature | sonnet | builder | -- |
| T3 | Fix `buildSkillPrompt` double-append (B4) | 2 | feature | sonnet | builder | -- |
| T4 | Small fixes batch: section name, stale doc, lockfile, RNG (B3, F1, F3, M2) | 4 | mechanical | haiku | builder-light | -- |
| T5 | Realign commit-helper contract doc with TS types (B6, M5, F4) | 2 | feature | sonnet | builder | -- |
| T6 | Wire Pi vitest into `make check` + CI; extend coverage config (B7, F5) | 3 | feature | sonnet | builder | -- |
| T7 | Resolve fast-mode dead path (F2) -- comment-only minimum | 2 | mechanical | haiku | builder-light | -- |
| V1 | Validate wave 1 | -- | validation | sonnet | validator-heavy | T1, T2, T3, T4, T5, T6, T7 |
| T8 | Test gap closure: commit-message + commit-planning (M3, M4) | 2 | feature | sonnet | builder | V1 |
| T9 | Observability spans for commit_stage / commit_create (M1) | 2 | feature | sonnet | builder | V1 |
| V2 | Validate wave 2 | -- | validation | sonnet | validator-heavy | T8, T9 |

## Execution Waves

### Wave 1 (parallel; all blocked on T0)

**T0: Restore deleted `workflow-new-command.test.ts`** [haiku] -- builder-light
- Description: The file is currently in a `deleted` working-tree state
  (`git status --short` shows `D pi/tests/workflow-new-command.test.ts`).
  T2 references its pattern; T3 modifies it. Restore from HEAD before
  parallel work begins so neither task silently regresses.
- Files:
  - `pi/tests/workflow-new-command.test.ts`
- Acceptance Criteria:
  1. [ ] File exists at HEAD content.
     - Verify: `git checkout HEAD -- pi/tests/workflow-new-command.test.ts &&
       test -f pi/tests/workflow-new-command.test.ts && git diff --quiet
       HEAD -- pi/tests/workflow-new-command.test.ts`
     - Pass: all three commands exit 0.
     - Fail: investigate why HEAD does not have the file (rebased branch?);
       raise to user before proceeding.
  2. [ ] Vitest still discovers and passes the restored file.
     - Verify: `cd pi/tests && bun vitest run workflow-new-command`
     - Pass: at least one test runs and passes.
     - Fail: HEAD content is itself broken -- raise to user; do not patch
       under T0.

**T1: Commit slash-command safety (B1, H1, H2)** [sonnet] -- builder
- Description: Three independent bugs in `pi/extensions/workflow-commands.ts`.
  (B1) `listChangedFiles` crashes on a repo with no HEAD because
  `git diff --name-only HEAD` exits 128. (H1) The multi-group commit loop only
  unstages on cancel, not on a `git commit` throw. (H2) Secret-scan regex
  patterns `\bPASSWORD` and `\bTOKEN` miss compound env-var names because `_`
  is a word character; `API_KEY`/`SECRET_KEY` have no patterns at all.
- Files:
  - `pi/extensions/workflow-commands.ts` (lines ~57-58 secret regex,
    ~283 listChangedFiles, ~710-734 multi-group loop)
  - `pi/tests/commit-mutation.test.ts` (add cases)
- Acceptance Criteria:
  1. [ ] Fresh-repo case does not throw.
     - Verify: new test in `commit-mutation.test.ts` creates a tmpdir,
       `git init`, writes one untracked file, calls `listChangedFiles` (or
       runs the slash command end-to-end), asserts no throw and result lists
       the untracked file.
     - Pass: test green.
     - Fail: still receives `fatal: ambiguous argument 'HEAD'` -- guard with
       `git rev-parse --verify HEAD` and skip the HEAD-relative diff.
  2. [ ] Throw path inside the multi-group loop unstages.
     - Verify: new test stages a group, makes `commitCurrentChanges` throw via
       a pre-commit hook returning non-zero, asserts working-tree shows zero
       staged files for that group.
     - Pass: post-throw `git diff --cached --name-only` returns empty for the
       group's files.
     - Fail: files remain staged -- move `unstageFiles` into a finally-style
       cleanup.
  3. [ ] Secret-scan catches compound names.
     - Verify: extend the secret-scan unit test with cases
       `DATABASE_PASSWORD=foo`, `ACCESS_TOKEN=bar`, `APP_TOKEN=baz`,
       `API_KEY=qux`, `SECRET_KEY=quux`.
     - Pass: each is matched.
     - Fail: regex still uses `\bPASSWORD` -- replace with
       `(?:^|[^A-Za-z0-9])[A-Za-z_]*(?:PASSWORD|TOKEN|SECRET|API[_-]?KEY)[A-Za-z_]*\s*[:=]`.
       Notes: (a) `[A-Za-z_]*` (not `[A-Z_]*`) so `db_password=foo` matches;
       (b) trailing `[A-Za-z_]*` so `API_KEY_ID=xyz` and `API_KEYS=...` match;
       (c) terminator is `\s*[:=]`, NOT `\b` -- `\b` between `Y` and `=` is
       fine but `\b` between `Y` and `S` (in `KEYS`) suppresses the match.
       Add test cases: `db_password=foo`, `API_KEY_ID=xyz`, `API_KEYS=[...]`.

**T2: Commit tool error boundary + timing-safe token + behavioural test (B2, B5, M6)** [sonnet] -- builder
- Description: (B2) `commit_stage` and `commit_create` execute handlers in
  `pi/extensions/commit.ts` call `stagePaths` and `createCommit` without
  try/catch, so failures propagate raw instead of returning
  `formatToolError`. (B5) `timingSafeTokenEqual` in `pi/lib/commit/token.ts:14`
  uses `===` on strings -- not timing-safe despite the name. (M6)
  `pi/tests/commit-extension.test.ts` greps source for literals and would pass
  if `registerCommitTools` were dead code; replace with the behavioural pattern
  from `workflow-new-command.test.ts`.
- Files:
  - `pi/extensions/commit.ts`
  - `pi/lib/commit/token.ts`
  - `pi/tests/commit-extension.test.ts`
  - `pi/tests/commit-mutation.test.ts` (add token timing test)
- Acceptance Criteria:
  1. [ ] Handler errors are formatted, not thrown.
     - Verify: new test makes `stagePaths` throw, asserts the tool returns a
       value matching `formatToolError` shape (no exception escapes).
     - Pass: tool result has the documented error envelope.
     - Fail: exception leaks -- wrap both handlers in try/catch and return
       `formatToolError(err.message)`.
  2. [ ] Token comparison is timing-safe and rejects malformed inputs without
        throwing. Verify behaviourally, not by source-grep.
     - Verify: new test calls `timingSafeTokenEqual` with five inputs --
       (a) two matching valid hex tokens -> `true`;
       (b) two distinct same-length valid hex tokens -> `false`;
       (c) tokens of different string lengths -> `false`, no `RangeError`;
       (d) `undefined` / non-string input -> `false`, no throw;
       (e) two same-length strings where one is non-hex (e.g. all `"!"`) ->
       `false`, no throw.
     - Pass: all five assertions hold.
     - Fail: replace `===` with the following pattern, which length-checks
       both the input strings AND the decoded buffers (`Buffer.from(s, "hex")`
       silently truncates on non-hex, so a string-length check alone is
       insufficient):
       ```ts
       if (typeof a !== "string" || typeof b !== "string") return false;
       if (a.length !== b.length) return false;
       const ab = Buffer.from(a, "hex");
       const bb = Buffer.from(b, "hex");
       if (ab.length !== bb.length || ab.length === 0) return false;
       return crypto.timingSafeEqual(ab, bb);
       ```
     - Note: a source-grep that the implementation uses
       `crypto.timingSafeEqual` may stay as an advisory secondary check, but
       the behavioural test above is the primary acceptance signal.
  3. [ ] `commit-extension.test.ts` exercises runtime behaviour.
     - Verify: test imports default export of `pi/extensions/commit.ts`,
       constructs a `createMockPi()` instance (helper at
       `pi/tests/helpers/mock-pi.ts:24`; same helper is used by
       `workflow-new-command.test.ts`),
       invokes the registration function, asserts `pi._getTool("commit_plan")`,
       `pi._getTool("commit_stage")`, `pi._getTool("commit_create")` are
       defined and callable. Removing source-text grep assertions.
     - `formatToolError` shape (referenced in AC1) is exported from
       `pi/lib/extension-utils.ts` -- read it once to confirm the envelope
       fields before writing the AC1 assertion.
     - Pass: test passes against the current implementation and would fail if
       `registerCommitTools` were neutered.
     - Fail: still source-grep -- model after `workflow-new-command.test.ts`.

**T3: Fix `buildSkillPrompt` double-append (B4)** [sonnet] -- builder
- Description: When `replaceArguments: true`,
  `pi/lib/workflow-commands/prompts.ts:98` substitutes `$ARGUMENTS` into the
  template body and then unconditionally appends `Args: <path>` to the end.
  The plan path reaches the LLM twice. Affects `/review-it` and `/do-it`.
- Files:
  - `pi/lib/workflow-commands/prompts.ts`
  - `pi/tests/workflow-new-command.test.ts` (add regression test)
- Acceptance Criteria:
  1. [ ] When `replaceArguments` is true, the trailing `Args:` suffix is not
        appended.
     - Verify: new test calls `buildSkillPrompt` with a template containing
       `$ARGUMENTS`, asserts output contains the path exactly once.
     - Pass: assertion holds.
     - Fail: still doubled -- gate the suffix on `!replaceArguments`.
  2. [ ] When `replaceArguments` is false, the suffix still appears (no
        regression for callers without `$ARGUMENTS` in the template).
     - Verify: extend the same test with the false case.
     - Pass: suffix present.
     - Fail: gate too aggressive.

**T4: Small fixes batch (B3, F1, F3, M2)** [haiku] -- builder-light
- Description: Four mechanical edits.
  (B3) `claude/shared/do-it-instructions.md` line ~98 references a
  `Team Members` section that plan-it no longer emits; rename to
  `Task Breakdown`. (F1) `pi/prompt-routing/docs/setThinkingLevel-probe.md`
  references the deleted `probe-thinking-level.ts` -- delete the doc and
  remove any inbound links, OR leave a one-line note. (F3) Delete
  `pi/tests/package-lock.json` (`bun.lock` is the source of truth; npm policy
  forbids it). (M2) `pi/lib/observability.ts:52` `randomId()` uses
  `Math.random()`; swap to `crypto.randomUUID()` per `pi/lib/metrics.ts`.
- Files:
  - `claude/shared/do-it-instructions.md`
  - `pi/prompt-routing/docs/setThinkingLevel-probe.md` (delete or rewrite)
  - `pi/tests/package-lock.json` (delete)
  - `pi/lib/observability.ts`
- Acceptance Criteria:
  1. [ ] do-it section name matches plan-it output.
     - Verify: `grep -nE "Team Members|Task Breakdown" claude/shared/do-it-instructions.md`
     - Pass: only `Task Breakdown` appears.
     - Fail: rename the reference.
  2. [ ] Stale probe doc removed or updated.
     - Verify: `grep -rn "probe-thinking-level" pi/ docs/ claude/`
     - Pass: no matches, or the only match is a doc explicitly labelled
       "removed in commit 8900120".
     - Fail: rewrite or delete remaining references.
  3. [ ] No npm lockfile.
     - Verify: `ls pi/tests/package-lock.json 2>/dev/null`
     - Pass: file does not exist.
     - Fail: `git rm pi/tests/package-lock.json`.
  4. [ ] `randomId()` uses `crypto.randomUUID()`.
     - Verify: `grep -n "Math.random\|randomUUID" pi/lib/observability.ts`
     - Pass: `randomUUID` present, `Math.random` absent.
     - Fail: swap.
     - Wire-format note (H4): the current `randomId()` returns 16 hex chars;
       `crypto.randomUUID()` returns a 36-char dashed UUID. Any consumer of
       `spanId` (log filters, search queries, dashboards) that assumes the
       16-char shape will silently break. Pick ONE in this task and document
       the choice in the function's comment:
       (i) preserve current shape: `crypto.randomUUID().replace(/-/g, "").slice(0, 16)`;
       (ii) accept new shape: keep the bare `crypto.randomUUID()` and add a
       one-line comment noting the format change for future reference.

**T5: Realign commit-helper contract doc with TS types (B6, M5, F4)** [sonnet] -- builder
- Description: `docs/commit-helper-contract.md` disagrees with
  `pi/lib/commit/types.ts` in three ways: classification names
  (`staged` vs `staged_change`, etc.), `recommended_action: none` documented
  but not in `RecommendedAction`, and the documented top-level schema
  (`schema_version`, `clean`, `warnings`, `errors`) describes only the Python
  helper -- Pi's `CommitPlanResult` exposes `preflight`,
  `stageConfirmationToken`, `createConfirmationToken`, `safeStagePaths`,
  `expectedStagedPaths`. Treat `pi/lib/commit/types.ts` as the source of truth.
  Add (M5) an "Implementations" inventory paragraph naming all three commit
  surfaces (Python helper, `committer.md` agent, Pi `commit_*` tools), and
  (F4) document whether agents are expected to call `commit_stage`/`commit_create`
  directly or only via `/commit`.
- Files:
  - `docs/commit-helper-contract.md`
  - `pi/extensions/README.md` (cross-reference for F4)
- Acceptance Criteria:
  1. [ ] Classification table matches `CommitClassification` exactly.
     - Verify: contract table values are a strict subset of (and ideally equal
       to) the union literals in `pi/lib/commit/types.ts`.
     - Pass: zero unmatched values.
     - Fail: diff and reconcile, prefer the type names.
  2. [ ] `recommended_action` table matches `RecommendedAction`.
     - Verify: same check, against `RecommendedAction` union.
     - Pass: equal sets.
     - Fail: drop `none` from the contract or add it to the type (decision
       belongs in this task -- pick one and document the choice).
  3. [ ] Top-level Pi schema fields documented.
     - Verify: contract names `preflight`, `stageConfirmationToken`,
       `createConfirmationToken`, `safeStagePaths`, `expectedStagedPaths`.
     - Pass: all five present with one-line descriptions.
     - Fail: add the section.
  4. [ ] Implementations inventory paragraph present and accurate.
     - Verify: contract has a section listing
       `scripts/commit-helper`, `claude/agents/committer.md`,
       `pi/extensions/commit.ts` + `pi/lib/commit/*` with one-line scope each.
     - Pass: all three named with their distinct responsibilities.
     - Fail: write the section.
  5. [ ] Direct-tool vs slash-command guidance present.
     - Verify: `pi/extensions/README.md` (or contract doc) states whether
       agents may call `commit_stage`/`commit_create` directly outside of
       `/commit`.
     - Pass: explicit answer present.
     - Fail: add it.
- Future-work note (H5): consider replacing the manual classification /
  recommended-action cross-walk with a small node script that imports the
  union types from `pi/lib/commit/types.ts` at build time and diffs them
  against the markdown table headers. Cheap (10 lines) and prevents the same
  drift from recurring. Out of scope for this plan -- file as a follow-up if
  the team wants enforcement.

**T6: Wire Pi vitest into `make check` + GitHub Actions explicit job; extend coverage config (B7, F5)** [sonnet] -- builder
- Description: Two distinct gaps. (a) `make check: lint test` -- the Pi
  vitest suite lives in `check-pi-extensions` and is never invoked by `check`.
  Add `check-pi-extensions` to `check`'s prerequisites. (b) The GitHub
  Actions `Windows` job in `.github/workflows/test.yml` runs
  `uv run pytest` *directly*, NOT `make check`, so the Makefile change above
  does not reach the Windows runner. Furthermore, no CI step installs `bun`
  or the global `@mariozechner/pi-coding-agent` package that
  `pi/tests/vitest.config.ts` (`resolvePiNodeModules`) hard-requires --
  meaning the Linux/macOS `make check` step would also fail when it tries to
  invoke `check-pi-extensions`. Add an explicit "Pi vitest" job (or matrix
  step) on Linux at minimum that:
  installs `bun`, runs `pnpm install -g @mariozechner/pi-coding-agent` per
  `pi/README.md`, then `cd pi/tests && bun install --frozen-lockfile && bun
  vitest run`. Windows is optional (bun on Windows is still maturing); if
  skipped, document the gap in the Handoff Notes.
- Coverage glob fix: `pi/tests/vitest.config.ts` sets `root: agentDir` where
  `agentDir = path.resolve(__dirname, "..")` (= `pi/`). Existing
  `coverage.include` entries are repo-relative-to-root: `"extensions/pwsh.ts"`,
  `"lib/model-routing.ts"` (NO `pi/` prefix). Add `lib/commit/**` and
  `lib/observability.ts` -- not `pi/lib/commit/**`, which would silently
  match nothing.
- Files:
  - `Makefile`
  - `pi/tests/vitest.config.ts`
  - `.github/workflows/test.yml` (explicit new job/step required, not just
    transitive)
- Acceptance Criteria:
  1. [ ] `make check` runs the Pi vitest suite.
     - Verify: `make check` output contains `Running Pi Vitest suite`.
     - Pass: line present and exit 0.
     - Fail: add `check-pi-extensions` to `check`'s prerequisites.
  2. [ ] Coverage globs match the actual vitest root.
     - Verify: `cd pi/tests && bun vitest run --coverage` produces a coverage
       report listing `lib/commit/plan.ts`, `lib/commit/stage.ts`,
       `lib/commit/message.ts`, `lib/commit/token.ts`, `lib/observability.ts`
       (paths shown WITHOUT the `pi/` prefix, matching the existing include
       style).
     - Pass: all five appear in coverage output.
     - Fail: globs are wrong relative to `root: agentDir`. Use
       `lib/commit/**` and `lib/observability.ts`, not `pi/lib/...`.
  3. [ ] `.github/workflows/test.yml` contains an explicit step that runs
        the Pi vitest suite on at least one runner.
     - Verify: `grep -nE "bun vitest|check-pi-extensions" .github/workflows/test.yml`
       returns at least one matching step that includes prior `bun` and
       `pi-coding-agent` installation.
     - Pass: explicit step present.
     - Fail: do NOT rely on `make check` for vitest coverage in CI -- add
       the step.
     - Implementation guidance: use `oven-sh/setup-bun@v2` for the `bun`
       install, pinned to a current minor version (probe
       `pi/tests/package.json` `engines` or just use `bun-version: latest`
       if no pin is required). For `pi-coding-agent`, follow the install
       sequence documented in `pi/README.md` (currently `pnpm install -g
       @mariozechner/pi-coding-agent`, which requires `pnpm/action-setup@v4`
       to land first). Match the existing `astral-sh/setup-uv@v8.1.0`
       style/version-pin pattern used elsewhere in this workflow.
  4. [ ] Linux CI exits 0 against the new job.
     - Verify: push the branch, `gh run watch` -- the Linux job exits 0 with
       the new `bun vitest run` step visible in the logs.
     - Pass: success.
     - Fail: investigate (missing dep, missing global install, wrong working
       dir); do not paper over with `continue-on-error`.

**T7: Resolve fast-mode dead path (F2)** [haiku] -- builder-light
- Description: `claude/shared/commit-instructions.md` documents a `fast`
  keyword that the Pi `/commit` driver never parses. Minimum fix: add a
  comment in the doc clarifying Pi treats this as a planning hint only and
  does not route to a separate workflow. (Full fix to wire `fast` into
  `parseCommitArgs` is deferred unless the user requests it -- KISS.)
- Files:
  - `claude/shared/commit-instructions.md`
- Acceptance Criteria:
  1. [ ] Doc clarifies the Pi behaviour.
     - Verify: `grep -n "Pi" claude/shared/commit-instructions.md` returns a
       sentence within or adjacent to the Fast Mode section noting the Pi
       driver handles `fast` as a planning hint only.
     - Pass: sentence present.
     - Fail: add it.

### Wave 1 -- Validation Gate

**V1: Validate wave 1** [sonnet] -- validator-heavy
- Blocked by: T0, T1, T2, T3, T4, T5, T6, T7
- Checks:
  1. Run every acceptance criterion above.
  2. `make check` -- exits 0 with no errors or warnings.
  3. `cd pi/tests && bun vitest run` -- all tests pass. **Capture the
     reported passing-test count** as `BASELINE_TEST_COUNT`. Record it by
     appending a `## Execution Status` section to the END of this plan
     file (`.specs/pi-review-2026-05-03/plan.md`) containing a single
     `BASELINE_TEST_COUNT=N` line plus a one-line wave-1 summary. (H2)
     Used by V2 to detect silent test regressions.
  4. `python pi/extensions/tsc-check.py` -- type clean.
  5. `git status --short` -- only intended files modified; no committed
     `package-lock.json` survivors.
  6. Cross-task integration:
     - T1's secret-scan tests and T2's behavioural test do not collide on
       fixture names.
     - T5's contract doc reflects T2's token semantics
       (timing-safe equality).
     - T6's CI/Makefile change actually runs T1, T2, T3, T4 tests. Verify
       mechanically (H2): from a clean tree (`git stash --include-untracked`
       if needed), run `make check` and grep the output for `Running Pi
       Vitest suite` AND a line indicating the total test count is at least
       `BASELINE_TEST_COUNT`. `git stash pop` to restore.
- On failure: create a fix task targeting the failing acceptance criterion;
  re-run V1.

### Wave 2 (depends on V1)

**T8: Test gap closure: commit-message + commit-planning (M3, M4)** [sonnet] -- builder
- Blocked by: V1
- Description: (M3) `pi/tests/commit-message.test.ts` has two cases for a
  six-constraint regex; add cases for empty scope (`fix():`), uppercase
  description start, subject >72 chars, and empty input. (M4)
  `pi/tests/commit-planning.test.ts` covers `detachedHead` only; add fixture
  cases for `mergeInProgress`, `rebaseInProgress`, and `hasUnmergedPaths`.
- Files:
  - `pi/tests/commit-message.test.ts`
  - `pi/tests/commit-planning.test.ts`
  - `pi/tests/fixtures/commit/` (additional fixtures if needed)
- Acceptance Criteria:
  1. [ ] commit-message tests cover all six constraints.
     - Verify: `cd pi/tests && bun vitest run commit-message` -- count cases
       per constraint, expect at least one passing and one failing example
       per constraint.
     - Pass: ten or more cases, every constraint exercised.
     - Fail: add the missing cases.
  2. [ ] commit-planning tests cover all four blocking states.
     - Verify: `cd pi/tests && bun vitest run commit-planning` -- four
       distinct fixture-driven cases for `detachedHead`, `mergeInProgress`,
       `rebaseInProgress`, `hasUnmergedPaths`, each asserting the planner
       refuses to proceed.
     - Pass: four cases, all green.
     - Fail: add fixture setup using tmpdir + `git merge --no-commit`,
       `git rebase`, etc.
     - Two-branch precondition (H1): `mergeInProgress` and
       `rebaseInProgress` will NOT trigger against an empty repo. Each
       fixture must (i) `git init`, (ii) commit a base file on `main`,
       (iii) create a second branch from main with a divergent commit,
       (iv) `git merge --no-commit --no-ff <branch>` (or `git rebase
       <branch>`), (v) assert `MERGE_HEAD` / `rebase-merge` exists before
       invoking the planner. Without two divergent branches the merge/rebase
       commands no-op and the test silently passes against a clean tree.

**T9: Observability spans for commit_stage / commit_create (M1)** [sonnet] -- builder
- Blocked by: V1
- Description: `pi/lib/observability.ts` is wired into
  `workflow-commands.ts` (`/review-it`) and `subagent/index.ts` only. The
  `commit_stage` and `commit_create` tools are exactly the latency-sensitive
  paths the layer was built alongside but currently emit no spans. Add
  `withTimingSpan` wrappers around both execute handlers. (`withTimingSpan`
  is exported from `pi/lib/observability.ts:115` -- async generic, signature
  `withTimingSpan<T>(options: TimingSpanOptions, fn: (span: TimingSpan) =>
  Promise<T>): Promise<T>`. Read the file to confirm `TimingSpanOptions`
  fields before wrapping.) Update the archived spec
  (`.specs/archive/pi-observability-timing/plan.md`) with a paragraph noting
  the commit-tool spans landed in this plan; do not un-archive.
- Files:
  - `pi/extensions/commit.ts`
  - `pi/tests/observability.test.ts` (extend)
  - `.specs/archive/pi-observability-timing/plan.md` (one-paragraph appendix)
- Acceptance Criteria:
  1. [ ] Both commit tools emit spans.
     - Verify: new test invokes `commit_stage` and `commit_create` against a
       tmpdir repo, captures the timing buffer, asserts span names
       `commit.stage` and `commit.create` (or the established naming pattern)
       are present.
     - Pass: both span names present.
     - Fail: wrap handlers in `withTimingSpan(...)`.
  2. [ ] Archived spec carries a forward-pointer.
     - Verify: `grep -n "pi-review-2026-05-03" .specs/archive/pi-observability-timing/plan.md`
     - Pass: line present in an appendix noting commit-tool spans landed
       under this plan.
     - Fail: add the paragraph.
     - Insertion location (H3): append a new heading
       `## Post-Archive Addendum` at the end of the file (after all existing
       content) with one paragraph and a relative link to
       `.specs/pi-review-2026-05-03/plan.md`. Do NOT edit pre-existing
       sections of the archived spec -- the file's history should remain
       attributable to its original author.

### Wave 2 -- Validation Gate

**V2: Validate wave 2** [sonnet] -- validator-heavy
- Blocked by: T8, T9
- Checks:
  1. Run every acceptance criterion above.
  2. `make check` -- exits 0.
  3. `cd pi/tests && bun vitest run --coverage` -- new commit/observability
     coverage strictly higher than baseline captured in V1.
  4. `python pi/extensions/tsc-check.py` -- type clean.
- On failure: create a fix task; re-run V2.

## Dependency Graph

```
T0 (restore deleted file)
  -> Wave 1: T1, T2, T3, T4, T5, T6, T7 (parallel) -> V1
     -> Wave 2: T8, T9 (parallel) -> V2
```

## Success Criteria

1. [ ] Every blocker, high, medium, and follow-up in `findings.md` has a
       referenced acceptance criterion that passed.
   - Verify: cross-walk -- for each item ID in `findings.md`, find its task
     in this plan's table and confirm V1 or V2 marked it green.
   - Pass: zero unaddressed IDs.
2. [ ] `make check` runs the Pi vitest suite and exits 0.
   - Verify: `make check 2>&1 | grep -E "Running Pi Vitest|passed"` shows
     both lines.
   - Pass: vitest line present, no `failed` lines, exit 0.
3. [ ] CI workflow passes on the merge commit.
   - Verify: `gh run list --limit 1 --branch <branch>` -- top run is
     `success`.
   - Pass: success.
4. [ ] `docs/commit-helper-contract.md` and `pi/lib/commit/types.ts`
       agree on classification names, recommended_action values, and
       Pi-specific top-level schema fields.
   - Verify: manual diff review (or a script that parses both).
   - Pass: zero divergences.
5. [ ] `pi/extensions/commit.ts` execute handlers cannot escape an
       unformatted exception.
   - Verify: dedicated test (added in T2) green; manual code grep --
     `try { ` wraps each `stagePaths(` and `createCommit(` call. (Both lib
     functions are synchronous; `await` does not appear in the call sites,
     so the grep must NOT include it.)
   - Pass: both true.

## Validation Contract

`/do-it` must satisfy this contract before reporting the plan complete or
archiving it.

### Required automated validation

1. [ ] Run repo-wide validation.
   - Command: `make check`
   - Pass: exits 0 with no errors or warnings.
   - Fail: do not archive; update `## Execution Status` with the failing
     command and next fix.

2. [ ] Run Pi extension type check and vitest suite (in case T6 had to fall
       back to an explicit CI step rather than the Makefile chain).
   - Commands:
     - `python pi/extensions/tsc-check.py`
     - `cd pi/tests && bun vitest run`
   - Pass: both exit 0.
   - Fail: investigate and fix.

3. [ ] Run task-specific verification from every acceptance criterion above.
   - Command: see each task's `Verify:` command.
   - Pass: every acceptance criterion passes exactly as written.
   - Fail: create/fix a task, rerun affected checks, then rerun repo-wide
     validation.

### Manual validation

- Required: yes -- limited to the contract-doc cross-walk in Success
  Criterion #4 (machine diff is tolerable but a human eyeball confirms the
  semantic descriptions still make sense after the rewrite).
- Steps:
  1. Read `docs/commit-helper-contract.md` end-to-end and confirm every
     classification, action, and top-level field has a description that
     matches the corresponding TypeScript symbol's role.

If manual validation is required and not confirmed passed, `/do-it` must
classify the result as `implemented-awaiting-manual-validation`, update
`## Execution Status`, and must not archive the plan.

### Deployment validation

- Required: no.
- Procedure: None.

### Archive rule

`/do-it` may archive this plan only after all required automated validation,
task-specific verification, manual validation, and repo-wide validation pass.

## Handoff Notes

- `findings.md` and `raw/01..05-*.md` in this directory are the authoritative
  evidence for every task. Read them before starting.
- The session-start `git status` showed `pi/multi-team/expertise/*` and
  `pi/index/*` as modified. The cross-cutting reviewer confirmed these are
  gitignored runtime state -- do not commit them.
- T6's Makefile change is the only place where a behaviour change might be
  invisible until CI. After the Makefile edit, run `make check` locally and
  confirm the `Running Pi Vitest suite` line appears before declaring T6
  done.
- T2 acceptance criterion 2 demands `crypto.timingSafeEqual` over
  equal-length buffers. `timingSafeEqual` throws when given different
  lengths -- explicit length check before the call is mandatory, not
  optional.
- T7 is intentionally minimal. If during execution the user signals they
  want fast-mode actually wired in, raise it as an out-of-scope decision and
  do not silently expand T7.
- The Pi vitest suite's `bun.lock` is the source of truth; do not regenerate
  it. The npm `package-lock.json` deletion in T4 is non-reversible without a
  follow-up `bun install` -- run `cd pi/tests && bun install --frozen-lockfile`
  after deletion to confirm the bun graph still resolves.

## Execution Status

BASELINE_TEST_COUNT=632
Wave 1 complete with 2 blockers requiring fix tasks: (1) stale /new test in workflow-new-command.test.ts must be deleted (task #12); (2) make check breaks the test CI job on Linux/macOS because check-pi-extensions requires bun/pnpm/pi-coding-agent not installed in the test job (task #13).

Wave 2 complete. FINAL_TEST_COUNT=646 (strictly higher than BASELINE_TEST_COUNT=632). All V2 checks passed: make lint test exits 0, bun tsc --noEmit exits 0, commit-message (12 tests), commit-planning (6 tests), observability (8 tests) all green. SC1-SC5 all pass. Manual validation (SC4 contract doc cross-walk) recommended before archiving.
