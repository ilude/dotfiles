# Code Review: pi commit extension + observability

**Files reviewed:** 16 files (new: commit.ts, lib/commit/*, lib/observability.ts, lib/memory-index.ts, lib/memory-retrieve.ts; modified: subagent/index.ts, workflow-commands.ts, package.json, tsconfig.json)
**Scope:** 0c65053..HEAD (single commit: bbeaa3b feat(pi): add commit helper and observability timing)

---

## Summary

The commit helper pipeline is structurally sound -- token gating, preflight checks, and staged-set revalidation work correctly. Two confirmed bugs: `listChangedFiles` crashes on a repo with no commits yet, and the multi-group commit loop leaves files staged on `git commit` failure with no cleanup. Secret scanning has a confirmed false-negative class for compound env-var names. Observability wiring is correct and the sanitization allowlist is effective.

---

## Findings

### BLOCKER

None.

---

### HIGH

**1. /commit fails with opaque error on new repository (no initial commit)**

- **File:** `pi/extensions/workflow-commands.ts:283`
- **Issue:** `listChangedFiles` calls `gitOrThrow(cwd, ["diff", "--name-only", "HEAD"])`. In a repository with no commits, `HEAD` does not resolve and git exits 128 with `fatal: ambiguous argument 'HEAD'`. The `git status --short` guard at line 646 returns `?? file.txt` output for untracked files, so the "clean tree" early-return does NOT fire. Execution reaches `prepareCommitSelection` -> `getCommitContext` -> `listChangedFiles`, which throws. The error propagates to `ctx.ui.notify` as a raw git fatal message with no useful guidance.
- **Verified:** Reproduced with `git init && touch foo.txt && git diff --name-only HEAD` -- exit 128.
- **Suggested fix:** In `listChangedFiles`, detect the initial-commit case by checking `git rev-parse --verify HEAD` first. If it fails, treat the HEAD diff as empty and rely solely on `--cached` and `ls-files --others`. A targeted fix: catch the gitOrThrow call for HEAD diff and return an empty array when stderr contains "unknown revision".

---

### MEDIUM

**2. Multi-group commit loop leaves files staged on git commit failure**

- **File:** `pi/extensions/workflow-commands.ts:708-726`, catch at line 734
- **Issue:** The loop calls `stageFiles(group.files)` at line 710, then `commitCurrentChanges` at line 724. If `commitCurrentChanges` throws (pre-commit hook rejection, locked index, missing git identity), the outer catch at line 734 only calls `activity.finish()` and re-throws. There is no `unstageFiles` call on this failure path. The working tree is left with `group.files` staged, which surprises the user on the next `/commit` invocation. The cancel path at line 719-722 correctly calls `unstageFiles`, so the logic exists -- it just is not applied on throw.
- **Suggested fix:** Track the in-progress group in a variable before `stageFiles` is called. In the catch block (or a `try/finally` wrapping `commitCurrentChanges`), call `unstageFiles(ctx.cwd, inProgressGroupFiles, activity)` before re-throwing.

**3. Secret patterns miss compound env-var names (confirmed false-negative class)**

- **File:** `pi/extensions/workflow-commands.ts:57-58`
- **Issue:** The `PASSWORD` and `TOKEN` patterns use `\b` word-boundary prefix. Underscore `_` is a word character, so `\b` does not assert a boundary before `PASSWORD` in `DATABASE_PASSWORD` or before `TOKEN` in `ACCESS_TOKEN`. Compound names -- the most common real-world form -- are silently skipped.
- **Verified:** `DATABASE_PASSWORD = foo` does not match; `PASSWORD = foo` does.
- **Suggested fix:** Drop the `\b` prefix and use a lookbehind that allows the word to appear after `_`, `=`, whitespace, or start-of-line, e.g. `/(?<![A-Za-z])PASSWORD\s*=\s*.+/g`. Also consider adding `SECRET`, `API_KEY`, `SECRET_KEY`, and `PRIVATE_KEY` assignment patterns.

---

### LOW

**4. scanFileForSecrets reads entire file with no size limit**

- **File:** `pi/extensions/workflow-commands.ts:331`
- **Issue:** `fs.readFileSync(absolutePath, "utf8")` reads the full file into memory before scanning. No file size check exists. Large binary or generated files (lock files, compiled assets) will not crash the scan but will consume unbounded memory.
- **Suggested fix:** Add `if (fs.statSync(absolutePath).size > 1_000_000) return [];` after the existing `isFile()` check at line 324.

**5. Span ID uses Math.random() instead of crypto.randomUUID()**

- **File:** `pi/lib/observability.ts:52-54`
- **Issue:** `randomId()` combines `Math.random()` (8 hex chars) with `Date.now()` (8 hex chars) = 16 hex characters of low-quality randomness. In a session generating many spans, collisions are possible and would corrupt span-parent correlation in the metrics log. `crypto` is already imported in `metrics.ts` in the same directory.
- **Suggested fix:** Replace `randomId()` with `crypto.randomUUID()` (available since Node 14.17, already used in `lib/metrics.ts`).

---

### QUESTIONS

**Q1: Is withTimingSpan intentionally omitted from /commit?**

`/review-it` and `/do-it` (lines 799-816) are wrapped with `withTimingSpan`; `/commit` is not. Given that `/commit` involves LLM calls and multiple git operations, it would produce the most useful timing data. If the omission is intentional (e.g., because `/commit` has its own activity system), a comment would prevent confusion.

**Q2: isIgnored spawns one subprocess per file**

`lib/commit/plan.ts:73` maps `isIgnored(repoRoot, entry.path)` over every status entry, spawning `git check-ignore -q -- <file>` N times. For repositories with many changed files, this is O(N) subprocesses. `git check-ignore --stdin` accepts multiple paths in a single invocation and would reduce this to O(1).

---

## Verified Safe

The following were investigated and confirmed not issues:

- **Git injection:** All invocations use `spawnSync("git", args, {shell: false})` with typed arrays. No string interpolation into shell commands anywhere in the new code.
- **Token timing safety:** `timingSafeTokenEqual` is not cryptographically timing-safe, but the token is a local commit integrity guard, not authentication. Timing attacks are not a real threat surface here.
- **Merge conflict handling (DD/AA cases):** `DD` (both-deleted) does not match the `U`-check in `classify()`, but `preflightGitState` checks `MERGE_HEAD` existence, which is present for any merge in progress. The preflight block fires before any staging is attempted.
- **Detached HEAD:** Detected via `symbolic-ref --quiet` exit code; added to the blocked list; both `stagePaths` and `createCommit` check `preflight.ok` first.
- **PII in observability:** `sanitizeTimingMetadata` uses a strict 11-key allowlist. Unknown keys are dropped. String values are capped at 120 characters. No user content, file paths, or prompt text can reach the metrics log through this path.
- **Subagent concurrent execution:** `mapWithConcurrencyLimit` shares `nextIndex` across worker closures. Safe -- JS is single-threaded; the read/increment of `nextIndex` is synchronous with no `await` between the read and the next iteration.
- **memory-index.ts lock:** Uses `fs.openSync(lock, "wx")` (exclusive create) with 50-retry/20ms backoff. The `finally` block closes and removes the lock on error. Correct for single-host use.
- **tsconfig.json:** `strict: true` is present. No strictness regression.
- **package.json:** No new dependencies beyond the existing `@mariozechner/*` stack. Version range style is consistent with existing entries.
