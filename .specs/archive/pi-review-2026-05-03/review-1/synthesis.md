---
date: 2026-05-03
status: synthesis-complete
---

# Plan Review Synthesis: pi-review-2026-05-03

## Review Panel

Note: the harness available in this session does not expose a `Task` /
`Agent` tool for spawning parallel Sonnet subagents. The five reviewer
personas were executed in-thread by the coordinator using the same
calibration block, the same source files, and direct codebase verification
via Read/Grep/Bash. Findings below are still attributed to the persona that
produced them.

| Reviewer | Role | Findings | Verified Issues |
|----------|------|----------|-----------------|
| R1 | Completeness & Explicitness | 6 | 4 |
| R2 | Adversarial / Red Team | 5 | 4 |
| R3 | Outside-the-Box / Simplicity | 4 | 2 |
| R4 | Security & Crypto | 4 | 3 |
| R5 | Test Strategy & Coverage | 6 | 5 |

## Outside-the-Box Assessment

The plan's overall shape is proportionate: 7 builder tasks for 20 findings,
batched by surface, with one validation gate per wave. The choice to keep
T7 (fast mode) as a comment-only minimum is correctly KISS given the stated
constraints, and the choice to patch the archived observability spec rather
than un-archive it (T9) is sensible.

The two things the plan under-engineers are both in T6: (a) the GitHub
Actions Windows job runs `pytest` directly and never calls `make check`, so
adding `check-pi-extensions` as a `make check` prereq does not make CI
exercise the new vitest suite on Windows, and (b) CI does not install `bun`
or `pi-coding-agent` globally, which `pi/tests/vitest.config.ts` requires
to resolve `@mariozechner/pi-coding-agent`. Without those, "wire vitest
into CI" cannot succeed as written.

The one thing the plan slightly over-engineers is T2's M6 rewrite combined
with the source-grep self-test in T2 acceptance criterion #2 -- the same
anti-pattern T2 is fixing. See B3 below.

## Bugs (must fix before executing)

### Bug 1 [CRITICAL]: T6 will not gate the new tests in CI on Windows
- Flagged by: R2, R3, R5
- Verified: `.github/workflows/test.yml` lines 39-46 -- Linux/macOS runs
  `make check`, but the Windows job runs
  `uv run pytest test/ claude/hooks/*/tests/ -v --tb=short` directly. No
  `make check` invocation. Adding `check-pi-extensions` to `check` prereqs
  in the Makefile is necessary but not sufficient. Furthermore, no CI step
  installs `bun`, `pnpm`, or the global `@mariozechner/pi-coding-agent`
  package, which `pi/tests/vitest.config.ts` (the `resolvePiNodeModules`
  function) hard-requires.
- Specific fix to plan: T6 description must add a step "Add a `Pi vitest`
  job (or matrix step) that installs `bun`, runs
  `pnpm install -g @mariozechner/pi-coding-agent` (per
  `pi/README.md`), then `cd pi/tests && bun install --frozen-lockfile &&
  bun vitest run`. This must run on Linux at minimum; Windows is optional
  because `bun` Windows support is still maturing." Add an acceptance
  criterion: "(4) `.github/workflows/test.yml` contains an explicit step
  that runs the Pi vitest suite on at least one runner; do not rely on
  `make check` for vitest coverage in CI."

### Bug 2 [HIGH]: T2's `crypto.timingSafeEqual` fix has a hex-decoding gap
- Flagged by: R4
- Verified: `pi/lib/commit/token.ts` builds tokens with `digest("hex")` --
  64 lowercase hex chars. The plan prescribes
  `crypto.timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"))`.
  `Buffer.from(s, "hex")` silently truncates on the first non-hex
  character, so an attacker-supplied `"!"` string yields a zero-length
  buffer, which then mismatches the 32-byte expected token's length.
  Combined with the plan's mandated explicit length check, this is safe --
  but the length check must be performed on the **decoded buffers**, not
  on the input strings, or a 64-char attacker string of garbage hex would
  pass the string-length test and then crash `timingSafeEqual` (different
  decoded lengths throw `RangeError`).
- Specific fix to plan: amend T2 acceptance criterion 2 to require:
  ```ts
  if (typeof a !== "string" || a.length !== b.length) return false;
  const ab = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  if (ab.length !== bb.length || ab.length === 0) return false;
  return crypto.timingSafeEqual(ab, bb);
  ```
  Add a unit test case: non-hex input of correct string length must return
  `false` and not throw.

### Bug 3 [HIGH]: T2 acceptance #2 is itself the anti-pattern T2 is fixing
- Flagged by: R5
- Verified: T2 description retires source-grep tests in
  `commit-extension.test.ts` (calling out M6); T2 acceptance criterion 2
  then directs the validator to "read `pi/lib/commit/token.ts`; assert
  `crypto.timingSafeEqual` is the comparison primitive". That is a source
  grep against the security fix.
- Specific fix to plan: replace T2 AC2 with a behavioural assertion --
  call `timingSafeTokenEqual` with (a) matching tokens, (b) mismatched
  same-length tokens, (c) different-length tokens, (d) `undefined`, (e)
  non-hex same-length string. Assert `true`/`false`/`false`/`false`/`false`
  respectively, and assert no throw on case (e). The implementation grep
  may stay as a secondary, advisory check.

### Bug 4 [HIGH]: T6 coverage globs are wrong relative to vitest `root`
- Flagged by: R5
- Verified: `pi/tests/vitest.config.ts` sets
  `root: agentDir` where `agentDir = path.resolve(__dirname, "..")` -- the
  `pi/` directory. Existing entries in `coverage.include` use paths like
  `"extensions/pwsh.ts"` and `"lib/model-routing.ts"` (no `pi/` prefix).
  T6 says to add `pi/lib/commit/**` and `pi/lib/observability.ts`; those
  globs will silently match nothing. T6 acceptance #2 verification command
  would then mark the task `Fail: add globs` -- which is not actionable
  guidance for the builder.
- Specific fix to plan: change T6 description and acceptance to use
  repo-relative-from-root paths: `lib/commit/**` and `lib/observability.ts`
  (note: `lib/observability.ts` is also currently absent from the include
  list, so it should be added regardless of M2).

### Bug 5 [HIGH]: `workflow-new-command.test.ts` is currently deleted
- Flagged by: R1
- Verified: `git status --short pi/tests/` shows
  `D pi/tests/workflow-new-command.test.ts`. T2 description says "model
  after `workflow-new-command.test.ts`" and T3 modifies it ("add
  regression test"). With the file staged for deletion, both tasks
  silently regress: T3 will recreate it (fine) but T2's "model after"
  reference dangles, and a builder reading the plan will not understand
  whether to restore the deleted contents, recreate from scratch, or
  ignore.
- Specific fix to plan: add a "Pre-Wave-1 Bookkeeping" note above Wave 1:
  "Restore `pi/tests/workflow-new-command.test.ts` from HEAD before T2/T3
  begin (`git checkout HEAD -- pi/tests/workflow-new-command.test.ts`).
  The deletion appears to be unintentional working-tree state captured at
  session start." Alternatively make this an explicit T0 step.

### Bug 6 [MEDIUM]: Success Criterion #5 references non-existent `await stagePaths(`
- Flagged by: R1
- Verified: `pi/lib/commit/stage.ts:9` and `pi/lib/commit/create.ts:19`
  are synchronous functions; `pi/extensions/commit.ts:63,75` calls them
  without `await`. Success Criterion #5 says "manual code grep --
  `try { ` wraps each `await stagePaths(` and `await createCommit(`".
  That grep will return zero matches even after T2 ships correctly.
- Specific fix to plan: drop the `await` from the grep pattern in Success
  Criterion #5: `try { ` wraps each `stagePaths(` and `createCommit(`
  call. (Or: convert the lib functions to async if there is a separate
  reason to do so -- not recommended for this plan's scope.)

### Bug 7 [MEDIUM]: T1 secret regex uses `\b` after a class that includes `_`
- Flagged by: R4
- Verified: `pi/extensions/workflow-commands.ts:57-58` has
  `\bPASSWORD\s*=\s*.+` and `\bTOKEN\s*=\s*.+`. The proposed replacement
  `(?:^|[^A-Za-z0-9])[A-Za-z_]*(PASSWORD|TOKEN|SECRET|API[_-]?KEY)\b`
  ends with `\b`, but `\b` is a transition between `\w` and `\W`. After
  `KEY` the next char is typically `=` (a `\W`), so `\b` fires -- OK. But
  the inner alternative `API[_-]?KEY` followed by `\b` breaks if the
  source text is `API_KEYS` (plural) or `API_KEY_ID` (suffix), masking
  real assignments. Also: the leading `[A-Z_]*` in the plan's regex
  should be `[A-Za-z_]*` if the intent is to match `db_password` as well
  as `DB_PASSWORD`.
- Specific fix to plan: amend T1 acceptance #3 fix line to:
  `(?:^|[^A-Za-z0-9])[A-Za-z_]*(?:PASSWORD|TOKEN|SECRET|API[_-]?KEY)[A-Za-z_]*\s*[:=]`.
  Add a test case for `db_password=foo` (lowercase) and `API_KEY_ID=xyz`
  (suffixed). The findings' fix-language used `\bPASSWORD\b` style; the
  plan should explicitly state that `\b` boundaries are not used in the
  final regex.

## Hardening Suggestions (optional improvements)

### H1 [MEDIUM]: T8 `mergeInProgress`/`rebaseInProgress` fixtures need a real branch
- Flagged by: R5
- `pi/tests/commit-planning.test.ts` would need a tmpdir setup that does
  `git init`, makes two divergent commits on two branches, and runs
  `git merge --no-commit --no-ff` to leave `MERGE_HEAD` present. Plan
  hand-waves "fixture setup using tmpdir + `git merge --no-commit`" --
  call out the two-branch precondition explicitly so the builder does not
  produce a test that runs `git merge` against an empty repo and fails
  silently with no merge state. Add to T8 acceptance #2 description.

### H2 [MEDIUM]: V1 cross-task check #6 ("T6 actually runs T1-T4 tests") is hard to verify mechanically
- Flagged by: R2
- Suggest replacing with: "run `make check` from a freshly-cloned
  worktree (or `git stash && make check && git stash pop`); confirm
  output contains `Running Pi Vitest suite` AND a test-count line whose
  total is at least N (where N is the count after Wave 1 completes)."

### H3 [LOW]: T9 archived-spec appendix may be ambiguous for the builder
- Flagged by: R1
- "Update the archived spec with a paragraph noting the commit-tool spans
  landed in this plan; do not un-archive" is fine, but does not say where
  in the archived plan to insert it (top? bottom? inside Status?). Add:
  "append a `## Post-Archive Addendum` heading at the end of the file
  with a single paragraph and a forward link to this plan."

### H4 [LOW]: T4 (M2 randomUUID swap) deserves a span-id length comment
- Flagged by: R4
- Current `randomId()` returns 16 hex chars; `crypto.randomUUID()`
  returns a 36-char UUID with dashes. Any consumer of `spanId` that
  assumes a fixed 16-char shape (search filters, log viewers) will
  silently break. Suggest: store `crypto.randomUUID().replace(/-/g,
  "").slice(0, 16)` to preserve the wire format, OR document the format
  change explicitly in M2 acceptance.

### H5 [LOW]: T5 R3 contract drift can be enforced with a tiny script
- Flagged by: R3
- Replace V1 manual cross-walk with a 10-line node script that imports
  the union types from `pi/lib/commit/types.ts` and greps the markdown
  table. Cheap and prevents future drift. Note as future work, not a
  blocker.

## Dismissed Findings

- **D1 [DISMISSED]**: R3 hypothesised that `bun vitest` might not reset
  `process.env.PI_METRICS_DIR` across tests. Verified: `mockReset: true`
  is set in `pi/tests/vitest.config.ts:78`, and existing
  `observability.test.ts` already uses an `afterEach` that restores env
  vars. Not an issue.
- **D2 [DISMISSED]**: R2 worried that T1 and T2 would conflict on
  `commit-mutation.test.ts`. Verified: T1 adds new `it()` cases, T2 adds
  a new `describe("commit token")` block. As long as both wrap their
  assertions in distinct `describe`/`it` blocks they will not collide.
  V1's stated cross-task check #6.a already covers this -- no plan
  change needed.
- **D3 [DISMISSED]**: R2 suggested the `/dev/null` fallback in B1's fix
  hint would not work on Windows. The B1 fix the plan adopts is "guard
  with `git rev-parse --verify HEAD` and skip the HEAD-relative diff" --
  no `/dev/null` is invoked in that fallback.
- **D4 [DISMISSED]**: R5 claimed `pi/lib/observability.ts` is missing
  from the existing coverage include list. True -- but T6 is already the
  task that adds it. Not a separate finding.
- **D5 [DISMISSED]**: R3 questioned whether `formatToolError` exists.
  Verified: `pi/lib/extension-utils.ts` exports it; used in 12 other
  extensions.

## Positive Notes

- The plan correctly partitions tasks by surface and avoids "two builders
  edit the same file" by keeping T1 and T2 on disjoint regions of
  `workflow-commands.ts` and `commit.ts`/`token.ts`.
- T2 explicitly retires the M6 source-grep anti-pattern at the same time
  as fixing B5, preventing the new tests from being toothless. (The
  remaining issue is that AC2 itself uses the anti-pattern -- see Bug 3.)
- T7 is admirably restrained -- a comment-only fix for fast-mode dead
  path with an explicit out-of-scope marker for wiring it in later.
- The Handoff Notes correctly call out the
  `bun install --frozen-lockfile` post-step after deleting the npm
  lockfile (T4 / F3).
- The dependency graph is shallow (Wave 1 -> V1 -> Wave 2 -> V2) and
  the "Tasks that change commit safety must ship with new tests in the
  same wave" constraint forces test-and-fix coupling, which is the right
  call for safety-critical surfaces.
