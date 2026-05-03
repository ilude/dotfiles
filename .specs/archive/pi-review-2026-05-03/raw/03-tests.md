# Test Review: pi/tests/ -- 2026-05-03

**Files reviewed:** 7 new test files, 4 modified test files, source cross-reference
**Scope:** feat(pi): add commit helper and observability timing (bbeaa3b)

---

## Summary

The new commit and observability tests are structurally sound: mutation tests use real
tmpdir git repos, the observability suite injects a fake clock correctly, and token
enforcement tests cover the primary happy path and representative error cases. Four
material issues were found: one production-code bug (non-timing-safe comparison
mislabelled as timing-safe) that the tests do not catch, the entire new suite absent
from CI and coverage config, shallow `validateCommitMessage` coverage with no boundary
cases, and only one of six preflight blocking conditions tested.

---

## Findings

### BLOCKER

#### 1. New test suite is not executed by CI or pre-commit

**File:** `.github/workflows/test.yml`, `pi/tests/vitest.config.ts` (coverage section)
**Confidence:** 100%

The CI workflow runs `make check` (Linux/macOS) and `uv run pytest` (Windows). Neither
path invokes `bun vitest run` inside `pi/tests/`. The tests are runnable manually but
are never run on push or PR.

Additionally, the `coverage.include` array in `vitest.config.ts` names specific
extensions and lib files, but `extensions/commit.ts`, `lib/commit/plan.ts`,
`lib/commit/stage.ts`, `lib/commit/message.ts`, `lib/commit/token.ts`,
`lib/commit/create.ts`, and `lib/observability.ts` are absent. Coverage reports will
never account for the new code even if a coverage step is added later.

Suggested fix: Add a CI step (or a `make` target) that runs `bun vitest run` from
`pi/tests/`. Add the new commit and observability source files to `coverage.include`.

---

#### 2. `timingSafeTokenEqual` uses `===` -- not timing-safe; tests do not catch this

**File:** `pi/lib/commit/token.ts:14-16`, exercised via `commit-mutation.test.ts`
**Confidence:** 95%

```typescript
export function timingSafeTokenEqual(a: string | undefined, b: string): boolean {
    return typeof a === "string" && a.length === b.length && a === b;
}
```

The `===` operator on strings in V8 short-circuits on the first differing byte. The
function name claims a security property ("timing-safe") that the implementation does
not provide. The confirmation token is the sole gate preventing unauthorized git
mutations from a tool call; a timing oracle enables token forgery under realistic
conditions (local high-frequency tool invocations).

The mutation tests verify that a wrong token throws, but they test functional
correctness, not the timing property, so the mislabelled guarantee is invisible.

Suggested fix: Replace the comparison with:

```typescript
import { timingSafeEqual } from "node:crypto";

export function timingSafeTokenEqual(a: string | undefined, b: string): boolean {
    if (typeof a !== "string" || a.length !== b.length) return false;
    const aBuf = Buffer.from(a, "hex");
    const bBuf = Buffer.from(b, "hex");
    return aBuf.length === bBuf.length && timingSafeEqual(aBuf, bBuf);
}
```

---

### FOLLOW-UP

#### 3. `commit-message.test.ts` has only two cases for a six-constraint regex

**File:** `pi/tests/commit-message.test.ts`
**Confidence:** 90%

`validateCommitMessage` enforces: known type, optional non-empty scope, description
starting with `[a-z0-9]`, description max 72 chars total, non-empty subject. None of
the following boundary conditions are tested:

- empty scope `fix(): description` (regex `[^)]+` rejects this; a typo could
  accidentally relax the regex without test failure)
- uppercase description start `feat: Add thing` (currently rejected; easy to regress)
- subject exceeding 72 chars
- empty string input (distinct from a subject that fails the regex)
- multi-line message where subject is valid (should pass)

Suggested fix: Add a table-driven `it.each` covering these five cases.

---

#### 4. Only one of six `preflightGitState` blocking conditions is tested

**File:** `pi/tests/commit-planning.test.ts`
**Confidence:** 88%

`preflightGitState` blocks on: detachedHead, mergeInProgress, rebaseInProgress,
cherryPickInProgress, bisectInProgress, hasUnmergedPaths. Only `detachedHead` is
covered. The untested conditions are the states where an automated commit tool is most
dangerous if it misfires.

`mergeInProgress` is reproducible in a tmpdir repo: create two branches with
conflicting content, run `git merge <branch>` which fails and leaves `MERGE_HEAD`.
`rebaseInProgress` follows the same pattern with `git rebase`. The infrastructure
(tmpdir repo setup, `spawnSync` helpers) is already present in `commit-planning.test.ts`.

Suggested fix: Add tests for at least `mergeInProgress` and `hasUnmergedPaths`.

---

#### 5. `commit-extension.test.ts` tests source-text strings, not tool registration

**File:** `pi/tests/commit-extension.test.ts`
**Confidence:** 85%

The test reads source files as strings and checks for `'name: "commit_plan"'` etc. This
confirms the strings exist in the file but does not verify the tools are actually
registered at runtime. If `registerCommitTools` were renamed or wrapped in a dead-code
branch, the test would still pass.

The pattern used in `workflow-new-command.test.ts` (instantiate `createMockPi()`, call
the extension default export, assert `pi._getTool("commit_plan")` is defined) would
provide real behavioral coverage.

Suggested fix: Add a test calling the default export with a mock pi and asserting all
four tool names appear in `pi._tools`.

---

#### 6. `observability.test.ts` has no integration smoke-test for the production call sites

**File:** `pi/tests/observability.test.ts`
**Confidence:** 80%

The observability unit tests are correct and well-structured. They do not verify that
the `withTimingSpan` calls in `workflow-commands.ts` (`/review-it`, `/do-it`) actually
fire at runtime. A refactor removing those wrappers would not be caught.

Suggested fix: Add one integration test that registers `workflow-commands` on a mock
pi, invokes the `review-it` command handler with a mock ctx, and asserts
`readRecentEvents()` contains a `timing_span` event with `name: "slash.review-it"`.
The necessary mock infrastructure already exists in `mock-pi.ts`.

---

### QUESTIONS

#### 7. `pi/tests/fixtures/commit/` contains only a README -- intentional?

**File:** `pi/tests/fixtures/commit/README.md`

The mutation tests use dynamically-created tmpdir repos and do not consume static
fixtures. The README documents future expectations for `commit_push` but no fixture
files exist. This is likely intentional; documenting it here so the decision is
explicit for `commit_push` work.

---

## Verified Safe

- `commit-mutation.test.ts`: real tmpdir git repos; `afterEach` cleanup with
  `rmSync` is correct; no shared state between tests; staged-set drift and ignored-file
  guard cover the most dangerous mutation paths.
- `observability.test.ts`: fake clock injection is deterministic; env var isolation
  with `beforeEach`/`afterEach` and `invalidateSettingsCache()` prevents cross-test
  pollution; no filesystem order or unseeded randomness dependence.
- `workflow-new-command.test.ts`: `vi.mock` hoisting is correct; no timer or network
  dependence; `ctx.newSession` mock correctly isolates the test from real session
  state.
- `commit-planning.test.ts`: `afterEach` cleanup is correct; tests are independent.
- Fixture quality for mutation tests is adequate: `.gitignore` behavior, staged
  deletions, and staged-set drift are all realistic regression targets.
