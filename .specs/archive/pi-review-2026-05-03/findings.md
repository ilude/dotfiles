# Pi Review -- 2026-05-03

Scope: every change committed to this repo over the prior two days
(`git log --since="2 days ago"`, 47 commits, ~17k lines added across 148 files).
Focus: pi customizations, extensions, lib code, skills, workflow instructions,
and supporting docs.

Five parallel reviewers covered different surfaces. Their full reports live in
`raw/`:

- `raw/01-extensions-lib.md` -- TypeScript code in `pi/extensions/` and `pi/lib/`
- `raw/02-skills-instructions.md` -- workflow skills and shared instruction docs
- `raw/03-tests.md` -- test suite quality and coverage
- `raw/04-docs-specs.md` -- documentation drift and archived-spec accuracy
- `raw/05-cross-cutting.md` -- module boundaries, integration, dependency hygiene

This file is the consolidated, deduped, severity-ranked action list.

---

## Blockers (fix before further work on these surfaces)

### B1. `/commit` crashes on a fresh repo
- **Where:** `pi/extensions/workflow-commands.ts:283` -- `listChangedFiles` calls
  `git diff --name-only HEAD`.
- **Impact:** Repo without an initial commit returns exit 128 fatal. The
  "clean tree" guard does not fire because `git status --short` still shows
  untracked files. Crash path is fully reachable.
- **Fix:** Probe `git rev-parse --verify HEAD` first; treat the HEAD-relative
  diff as empty when no HEAD exists, and fall back to `git diff --no-index
  /dev/null <file>` enumeration of untracked content.

### B2. `commit_stage` / `commit_create` have no error boundary
- **Where:** `pi/extensions/commit.ts` execute handlers around `stagePaths` and
  `createCommit`.
- **Impact:** Throws (bad token, `git add` failure, staged-set mismatch)
  propagate raw instead of being formatted by `formatToolError`, violating the
  contract documented in `pi/extensions/README.md`. Calling agent receives an
  unhelpful exception.
- **Fix:** Wrap both handlers in `try/catch` and return
  `formatToolError(err.message)` plus a stable error code.

### B3. Shared `do-it` validates a section name plan-it never emits
- **Where:** `claude/shared/do-it-instructions.md:98` checks for a `Team
  Members` section. `plan-it` (both Pi and shared) emits `Task Breakdown`.
- **Impact:** Any non-Pi do-it consumer (Claude / OpenCode / Copilot) will
  reject or warn on a perfectly valid plan. Pi-native do-it was already fixed;
  this is the only stale variant.
- **Fix:** Change the validator section name to `Task Breakdown` to match the
  Pi-native skill and the plan-it instructions.

### B4. `buildSkillPrompt` double-appends the plan path
- **Where:** `pi/lib/workflow-commands/prompts.ts:98`.
- **Impact:** With `replaceArguments: true` the `$ARGUMENTS` token is
  substituted into the skill template body, then the function unconditionally
  appends `Args: <path>` to the end. The plan path reaches the LLM twice in
  conflicting structural positions for both `review-it` and `do-it`. Surfaces
  as occasional duplicated work or wrong-file analysis.
- **Fix:** Skip the `Args:` suffix when `replaceArguments` is true, or feed
  `$ARGUMENTS` substitution and the suffix from a single source of truth.

### B5. `timingSafeTokenEqual` is not timing-safe
- **Where:** `pi/lib/commit/token.ts:14` -- uses `===` on the strings.
- **Impact:** Function name claims a security property it does not provide.
  String `===` short-circuits on the first differing byte. Mutation tests check
  *functional* rejection, so the false guarantee goes undetected. Confirmation
  tokens guarding `commit_stage` / `commit_create` are vulnerable to a timing
  oracle in any future caller that exposes them across a trust boundary.
- **Fix:** `crypto.timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b,
  "hex"))` with a length check, or `crypto.timingSafeEqual` over a fixed-width
  hash of both inputs. Add a test asserting equal-length comparison time.

### B6. `commit-helper-contract.md` does not match the TypeScript types
- **Where:** `docs/commit-helper-contract.md` vs `pi/lib/commit/types.ts`.
- **Two distinct mismatches:**
  1. **Classification names diverge.** Contract lists `staged`, `modified`,
     `deleted`, `ignored`, `renamed`, `copied`. `CommitClassification` exports
     `staged_change`, `unstaged_change`, `ignored_untracked`, etc.
  2. **`recommended_action: none`** is documented but not present in
     `RecommendedAction` and never emitted by `plan.ts`.
- **Plus:** Top-level schema (`schema_version`, `clean`, `warnings`, `errors`)
  describes the Python helper only. Pi's `CommitPlanResult` exposes
  `preflight`, `stageConfirmationToken`, `createConfirmationToken`,
  `safeStagePaths`, `expectedStagedPaths` -- none documented.
- **Impact:** Any non-Pi consumer parsing tool output against the contract will
  misclassify entries and miss the token fields that gate staging.
- **Fix:** Treat `pi/lib/commit/types.ts` as the source of truth, regenerate
  the contract from it (or commit to a thin schema layer that both reference),
  and add the Pi-specific top-level fields to the doc.

### B7. CI never runs the `pi/tests/` suite
- **Where:** `.github/workflows/test.yml` and `Makefile` `check` target.
  Neither invokes `bun vitest run` (or equivalent) under `pi/tests/`.
- **Impact:** The 30+ test files added this sprint -- including the new commit
  and observability suites -- never gate a merge. Coverage configuration in
  `vitest.config.ts` also omits the new commit and observability source files
  from `coverage.include`.
- **Fix:** Add a `pi-tests` job (or step in the existing test job) that runs
  `cd pi/tests && bun install --frozen-lockfile && bun vitest run`. Update
  `vitest.config.ts` `coverage.include` to cover `pi/lib/commit/**` and
  `pi/lib/observability.ts`.

---

## High severity

### H1. Multi-group commit loop leaks staged files on failure
- **Where:** `pi/extensions/workflow-commands.ts:710-724`.
- After `stageFiles(group.files)`, if `commitCurrentChanges` throws (pre-commit
  hook failure, locked index), the outer catch at line 734 calls
  `activity.finish()` but never `unstageFiles`. The cancel path correctly
  unstages; the throw path does not.
- **Fix:** Move `unstageFiles(group.files)` into a `finally`-style cleanup that
  runs whether the inner block resolved, threw, or was cancelled.

### H2. Secret scan misses every compound env-var name
- **Where:** `pi/extensions/workflow-commands.ts:57-58`.
- Patterns `\bPASSWORD` and `\bTOKEN` do not match `DATABASE_PASSWORD`,
  `ACCESS_TOKEN`, `APP_TOKEN`, etc. -- `_` is a word char, so `\b` does not
  trigger. `API_KEY` and `SECRET_KEY` have no patterns at all. Verified
  empirically.
- **Fix:** Use word-or-underscore-boundary patterns
  (`(?:^|[^A-Za-z0-9])[A-Z_]*(PASSWORD|TOKEN|SECRET|API[_-]?KEY)\b`) and add
  test cases for the compound names listed above.

---

## Medium severity

### M1. Observability layer is partially wired
- **Where:** `pi/lib/observability.ts` is imported by `workflow-commands.ts`
  (`/review-it`) and `subagent/index.ts` only. `commit_stage` / `commit_create`
  -- the latency-sensitive surface built in the same sprint -- have no spans.
  `summarizeTimingSpans` is exported but never called from production paths.
- **Impact:** The archived plan
  (`.specs/archive/pi-observability-timing/plan.md`) claims T5 (per-reviewer,
  panel, recovery spans) and T6 (timing-summary synthesis) are completed; the
  code does not match.
- **Fix:** Add spans to `commit.ts` execute handlers; un-archive the spec or
  add a follow-up plan capturing the remaining T5/T6 work; call
  `summarizeTimingSpans` at the documented integration point in `review-it`.

### M2. `randomId()` uses `Math.random()`
- **Where:** `pi/lib/observability.ts:52`.
- 16 hex chars from a non-CSPRNG. `pi/lib/metrics.ts` already uses
  `crypto.randomUUID()`; one-line swap removes collision risk over long
  sessions and aligns the two helpers.

### M3. `validateCommitMessage` is under-tested
- **Where:** `pi/tests/commit-message.test.ts` -- two cases for a six-constraint
  regex.
- **Untested:** empty scope `fix():`, uppercase description start, subject
  >72 chars, empty input. Each is a realistic typo that could silently relax
  the regex in a future edit.
- **Fix:** Add a parameterised test covering each documented constraint.

### M4. Only one of six preflight blocking states is tested
- **Where:** `pi/tests/commit-planning.test.ts` covers `detachedHead` only.
- **Untested:** `mergeInProgress`, `rebaseInProgress`, `hasUnmergedPaths` --
  the exact states where an automated commit tool is most dangerous. All three
  are reproducible in a tmpdir repo (`git merge --no-commit`, `git rebase -i`,
  conflicting cherry-pick).
- **Fix:** Add a fixture-driven test per blocking state.

### M5. Commit logic exists in three layers without an explicit contract
- `scripts/commit-helper` (Python), `claude/agents/committer.md`, and
  `pi/extensions/commit.ts` + `pi/lib/commit/*` all commit. Cross-cutting and
  docs reviewers both flagged this.
- The split is plausibly intentional (CLI helper, agent, Pi tool) but the
  contract doc names two of the three surfaces and omits `committer.md`.
- **Fix:** Add an "implementations" inventory paragraph to
  `docs/commit-helper-contract.md`, stating which surface owns which
  responsibility and how they share parsing/regex logic (or that they do not
  and the duplication is accepted).

### M6. `commit-extension.test.ts` greps source instead of asserting behavior
- **Where:** `pi/tests/commit-extension.test.ts` reads the source file for
  literals like `'name: "commit_plan"'`. It would still pass if
  `registerCommitTools` were dead code.
- **Fix:** Replace with `createMockPi()` + `import default from
  "../extensions/commit"` + assert `pi._getTool("commit_plan")` is defined and
  callable. The pattern is already used in `workflow-new-command.test.ts`.

---

## Follow-ups (lower urgency, still worth doing)

### F1. `setThinkingLevel-probe.md` references a deleted extension
- `pi/prompt-routing/docs/setThinkingLevel-probe.md:78` points at
  `probe-thinking-level.ts`, deleted in commit `8900120`.
- **Fix:** Rewrite the section to describe whatever superseded the probe, or
  delete the doc and link to the relevant test.

### F2. `commit-instructions.md` Fast Mode is dead in the Pi driver
- The `fast` keyword described in `claude/shared/commit-instructions.md` is
  never parsed by `parseCommitArgs` in `workflow-commands.ts`, and
  `pi/skills/workflow/commit-fast.md` is never loaded by Pi.
- **Fix (minimum):** Add a comment in the doc noting Pi treats this as a
  planning hint only. **Fix (full):** Wire `fast` into `parseCommitArgs` and
  load `commit-fast.md` when present.

### F3. Dual lockfiles in `pi/tests/`
- Both `bun.lock` and `package-lock.json` exist. `package.json` uses bun;
  the npm lock is leftover and represents a different resolved graph.
- **Fix:** Delete `pi/tests/package-lock.json`. Repo policy is "never npm".

### F4. Direct-tool vs slash-command commit path is undocumented
- Agents can call `commit_stage` / `commit_create` directly, *or* invoke
  `/commit`. Both can produce commits; the token-guard contract covers only
  the direct-tool path.
- **Fix:** Document in `pi/extensions/README.md` or
  `docs/commit-helper-contract.md` whether the direct-tool path is intended
  for agents at all, or only for `/commit` internals.

### F5. Coverage config drift
- `vitest.config.ts` `coverage.include` does not list `pi/lib/commit/**` or
  `pi/lib/observability.ts`. Reports will under-state coverage of the new
  surface. (Subsumed by B7's CI fix but worth listing separately so the
  config gets touched.)

---

## Verified clean (notable nulls)

To save the next reviewer time -- these were checked and found OK:

- **No git-injection vectors** in commit code. All `spawnSync` calls use
  `shell: false` and typed argv arrays. (`raw/01`)
- **No leakage of user content / paths / API keys into metrics logs.**
  `sanitizeTimingMetadata` is an effective allowlist. (`raw/01`)
- **`pi/lib/` does not import from `pi/extensions/`.** Module boundary is
  clean. (`raw/05`)
- **`pi/multi-team/expertise/*` and `pi/index/*` are correctly gitignored**
  despite appearing as modified in the session-start `git status` snapshot --
  they are listed under `git status --ignored`, not tracked by `git ls-files`.
  (`raw/05`)
- **`pi-commit-extension` archive is genuine.** All T0-T8 deliverables exist
  in code. (`raw/04`)
- **AGENTS.md / CLAUDE.md package-manager policy is consistent** (different
  phrasing, not contradictory). (`raw/04`)
- **`PI-INSTRUCTIONS.md`, `docs/agent-command-surfaces.md`, and
  `pi/extensions/README.md`** contain no stale file references. (`raw/04`)

---

## Suggested order of operations

1. **Quick wins (single-line / single-test fixes):** B3, M2, F1, F3.
2. **Safety blockers (security/data-loss):** B5, H1, H2, B1.
3. **Contract & wiring (touches multiple files):** B6, B2, B4.
4. **Test gap closure:** B7, M3, M4, M6.
5. **Architecture / observability completion:** M1, M5, F2, F4, F5.

The blockers are independent and can be worked in parallel by separate
agents. Test-gap items should be batched with their corresponding code fixes
(M3+M4 with B5, M6 with B2) so the new tests gate the new behaviour.
