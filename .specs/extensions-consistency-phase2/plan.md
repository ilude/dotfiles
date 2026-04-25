---
created: 2026-04-25
status: draft
revision: 2
revision_reason: Incorporated review-1 findings -- corrected file count (17 -> 22), distinguished extend vs add for existing test files, replaced gameable "at least one it() block" ACs with specific assertions, pinned provider.ts notify policy and added pre-refactor auth fixture capture, added trace-continuity smoke and pi/lib reverse-import checks to V2/V3, clarified Documented Exception placement rule, added opus-unavailable fallback for T4.
completed:
---

# Plan: Standardize Pi Extensions (Phase 2)

## Context & Motivation

Phase 1 (archived at `.specs/archive/extensions-consistency/plan.md`) shipped the
shared helper layer, conventions doc, scaffold, and the safety repair to
`damage-control.ts`. It deliberately stopped after three representative
refactors (`damage-control.ts`, `agent-team.ts`, `ask-user.ts`) so the
conventions could shake out before scaling.

Phase 2 covers the remaining 22 extensions called out in the Phase 1 handoff
notes (T1=3 + T2=2 + T3=4 + T4=7 + T5=4 + T6=2). The work is mostly mechanical: replace ad-hoc tool error shapes with
`formatToolError`, replace direct `ctx.ui.notify` calls with `uiNotify` where
it adds value, route path canonicalization through the shared helper, and add
behavioral tests for any file that currently lacks them.

What makes Phase 2 non-trivial:

- **provider/session/model extensions** touch authentication, model
  availability, and session lifecycle. A regression here can lock the user
  out of providers or break the recently-shipped transcript feature. These
  files get a separate higher-scrutiny wave with explicit parity tests.
- **transcript-* extensions** were shipped just hours ago in the same
  session that produced this plan. Refactoring them now requires parity
  tests against the existing transcript fixtures so the audit trace shape
  stays exact.
- The Phase 1 review-1 panel explicitly downgraded "every direct
  `ctx.ui.notify` must be replaced." Helper usage is "where it adds value,
  not as a blanket rule." Each file may keep direct calls with a Documented
  Exception block per the format defined in `pi/extensions/README.md`.

## Constraints

- Platform: Windows/MSYS2 (`MINGW64_NT-10.0-26200`); PowerShell available.
- Shell: `/usr/bin/bash`. Forward-slash paths in docs and commands.
- Repository markers: `pyproject.toml`, `Makefile`, `.gitattributes`,
  `pi/extensions/tsconfig.json`, `pi/tests/vitest.config.ts`.
- Hard rule: NO new helpers may be added to `pi/extensions/` top-level. All
  shared helpers live under `pi/lib/` (auto-discovery hazard, see
  `pi/extensions/transcript-runtime.ts:30-40` and `pi/extensions/README.md`).
- Reuse `pi/lib/extension-utils.ts`, `pi/lib/yaml-mini.ts`,
  `pi/lib/yaml-helpers.ts`. No new dependencies.
- Do not weaken any safety control or change a tool result shape that the
  LLM consumer depends on. Behavioral parity is the binding criterion.
- Direct `ctx.ui.notify` and ad-hoc result shapes are acceptable when the
  file includes a Documented Exception comment in the verbatim format
  documented in `pi/extensions/README.md`.
- Do not modify secrets, credentials, `*.env`, SSH keys, or destructive git
  state.
- All encountered errors/warnings in touched validation paths must be fixed
  at the root, not suppressed.

## Alternatives Considered

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| Three-wave refactor with risk-graded grouping (this plan) | Lowest-risk groups parallelize; provider/session and transcript get their own gates with parity tests | More waves than a flat refactor | **Selected**: matches Phase 1's lesson that wave gates are cheap and catch regressions early |
| Single mechanical refactor pass across all 22 files | Minimal coordination | Mixes auth/session changes with cosmetic notify swaps; one regression sinks the whole pass; reviewer-1 explicitly flagged this combination | Rejected: review-1 evidence still applies |
| Split per-file (one task per extension) | Maximum granularity | 22 tasks + 22 validation gates is overhead without proportional benefit; most files share the same change shape | Rejected: too granular |
| Defer transcript files to Phase 3 | Avoids risking the freshly-shipped transcript feature | Leaves convention drift in the most recent code; still need to refactor eventually | Rejected: Wave 3 with parity tests is sufficient guard |
| Add ESLint/Biome rule to enforce conventions | Mechanical drift prevention | Phase 1 explicitly downgraded this until conventions stabilize across the full extension set; better suited to a Phase 3 once Phase 2 lands | Rejected: still premature |

## Objective

Every top-level extension file in `pi/extensions/` either uses the shared
helpers from `pi/lib/extension-utils.ts` (and `pi/lib/yaml-mini.ts` /
`pi/lib/yaml-helpers.ts` where applicable) or contains a Documented
Exception comment. `make check-pi-extensions` exits 0 with the full Vitest
suite passing, including parity tests added in this phase.

## Project Context

- **Language**: TypeScript under `pi/extensions/` and `pi/lib/`; Vitest under
  `pi/tests/`.
- **Test command**: `cd pi/tests && bun vitest run` (Vitest), `make test` for
  full repo, `make test-quick` for fast.
- **TS validation**: `python pi/extensions/tsc-check.py` or
  `make check-pi-extensions` (the latter also runs Vitest).
- **Lint command**: `make lint` (ruff + shellcheck only -- does NOT cover
  TypeScript).

## Files In Scope

Phase 2 touches these 22 files (verbatim from Phase 1 handoff notes):

| Group | Files | Existing Tests | Phase 2 Test Action |
|---|---|---|---|
| Agent / workflow | `agent-chain.ts`, `workflow-commands.ts`, `todo.ts` | agent-chain.test.ts, todo.test.ts, todo-pure.test.ts, workflow-commands.test.ts (380 lines, 6 it blocks) | **extend** all four (preserve existing assertions) |
| Safety / quality | `commit-guard.ts`, `quality-gates.ts` | none | **add** commit-guard.test.ts, quality-gates.test.ts |
| User-facing tools | `context.ts`, `web-tools.ts`, `tool-search.ts`, `tool-reduction.ts` | tool-reduction.test.ts, web-tools.test.ts (163 lines), tool-search.test.ts (103 lines) | **extend** tool-reduction / web-tools / tool-search; **add** context.test.ts |
| Provider / model / session | `model-visibility.ts`, `copilot-headers.ts`, `provider.ts`, `prompt-router.ts`, `refresh-models.ts`, `session-hooks.ts`, `probe-thinking-level.ts` | model-visibility.test.ts, copilot-headers.test.ts, provider.test.ts, prompt-router.test.ts, refresh-models.test.ts | **extend** the five existing files; **add** session-hooks.test.ts, probe-thinking-level.test.ts |
| Transcript / pwsh / test | `test-orchestrator.ts`, `pwsh.ts`, `transcript-provider.ts`, `transcript-purge.ts`, `transcript-runtime.ts`, `transcript-tools.ts` | pwsh.test.ts, pwsh-pure.test.ts, transcript-correlation.test.ts, transcript-fixtures.test.ts, transcript-integration.test.ts, transcript-log.test.ts | **extend** all six existing files; **add** test-orchestrator.test.ts |

**Hard rule on existing test files**: If a test file at `pi/tests/<extension>.test.ts` already exists when Phase 2 begins, the refactor MUST preserve every existing `it()` block. New assertions are additive. A builder that overwrites an existing test file fails the wave validation.

Out of scope:
- `pi/extensions/web-fetch/` (vendored, excluded by tsconfig).
- `pi/extensions/subagent/` (subdirectory, not auto-discovered top-level).
- `pi/lib/*` (already standardized in Phase 1).
- Adding ESLint/Biome rules (deferred to Phase 3).
- Replacing every `ctx.ui.notify` call (downgraded by review-1).

## Definition: "Documented Exception" (reminder)

When a file keeps a direct API call (e.g. `ctx.ui.notify`, an ad-hoc result
shape, or a bespoke parser) instead of the shared helper, the file MUST
contain a comment of the form:

```
// Convention exception: <one-line rationale>.
// Risk: <what breaks if this drifts>.
// Why shared helper is inappropriate: <reason>.
```

A bare TODO or a comment without all three lines is NOT a documented
exception and fails the AC. (Same rule as Phase 1.)

**Placement rule (Phase 2 refinement)**: Place the block immediately
above the first non-conforming call site if exactly one site in the file
is exempted. Place it at the top of the file (after the file header
comment) if multiple sites share the same rationale. Each block applies
until end-of-file or until overridden by a more specific block above a
later call site. Reviewers should reject blocks placed at ambiguous
scopes (e.g. mid-function above a single line when the same rationale
covers the whole file).

## Task Breakdown

| # | Task | Files | Type | Model | Agent | Depends On |
|---|------|-------|------|-------|-------|------------|
| T1 | Refactor agent/workflow group | 3 | feature | sonnet | builder | -- |
| T2 | Refactor safety/quality group + add tests | 2 + 2 tests | feature | sonnet | builder | -- |
| T3 | Refactor user-facing tools group + add tests | 4 + 3 tests | feature | sonnet | builder | -- |
| V1 | Validate wave 1 | -- | validation | sonnet | validator-heavy | T1, T2, T3 |
| T4 | Refactor provider/model/session group + add tests | 7 + 2 tests | architecture | opus | builder-heavy | V1 |
| V2 | Validate wave 2 | -- | validation | sonnet | validator-heavy | T4 |
| T5 | Refactor transcript group | 4 | feature | sonnet | builder | V2 |
| T6 | Refactor pwsh + test-orchestrator + add tests | 2 + 1 test | feature | sonnet | builder | V2 |
| V3 | Validate wave 3 | -- | validation | sonnet | validator-heavy | T5, T6 |

## Execution Waves

### Wave 1 (parallel)

**T1: Refactor agent/workflow group** [sonnet] -- builder

- Description: Apply the Phase 1 conventions to `agent-chain.ts`,
  `workflow-commands.ts`, and `todo.ts`. Replace ad-hoc tool error shapes
  with `formatToolError` (especially in `todo.ts` where I counted ~10 sites
  during Phase 1 review). Replace path canonicalization with the shared
  helper where applicable. Use `uiNotify` for notifications where it adds
  value; use Documented Exception comments otherwise. Do NOT change agent
  routing, expertise read/write semantics, or todo state-machine behavior.
- Files: `pi/extensions/agent-chain.ts`,
  `pi/extensions/workflow-commands.ts`, `pi/extensions/todo.ts`. Tests
  extended (NOT replaced): `pi/tests/agent-chain.test.ts`,
  `pi/tests/todo.test.ts`, `pi/tests/todo-pure.test.ts`,
  `pi/tests/workflow-commands.test.ts`.
- Acceptance Criteria:
  1. [ ] Each file imports from `../lib/extension-utils.js` OR contains a
         Documented Exception block.
     - Verify: `grep -E "from \"\\.\\./lib/extension-utils|Convention exception:" pi/extensions/agent-chain.ts pi/extensions/workflow-commands.ts pi/extensions/todo.ts`
     - Pass: every file matches one of the two patterns.
     - Fail: refactor or add the three-line exception block.
  2. [ ] Existing agent-chain.test.ts, todo*.test.ts, and
         workflow-commands.test.ts still pass with EVERY existing `it()`
         block intact (parity). New assertions may be added but no existing
         block may be deleted, skipped, or weakened.
     - Verify: `cd pi/tests && bun vitest run agent-chain.test.ts todo.test.ts todo-pure.test.ts workflow-commands.test.ts && git diff --stat HEAD~1 -- pi/tests/agent-chain.test.ts pi/tests/todo.test.ts pi/tests/todo-pure.test.ts pi/tests/workflow-commands.test.ts | grep -E "^.+\| +[0-9]+ \+" | head`
     - Pass: all tests pass; the diff stat shows pure additions (no
             deletions) on the four test files.
     - Fail: investigate the regression at the call site, not by relaxing
             the assertion.
  3. [ ] All `todo.ts` error returns use `formatToolError` OR have a
         Documented Exception.
     - Verify (behavioral): force a known error path in `todo.test.ts` and
       assert `result.isError === true` AND
       `result.content[0].type === "text"`.
     - Pass: forced-error tests pass.

**T2: Refactor safety/quality group + add behavioral tests** [sonnet] -- builder

- Description: Apply conventions to `commit-guard.ts` and
  `quality-gates.ts`. Add minimal behavioral tests since neither has one
  today. Like `damage-control.ts` in Phase 1, these intercept tool events,
  so the parity question is "does the block decision shape stay
  unchanged?"
- Files: `pi/extensions/commit-guard.ts`, `pi/extensions/quality-gates.ts`,
  new `pi/tests/commit-guard.test.ts`, new `pi/tests/quality-gates.test.ts`.
- Acceptance Criteria:
  1. [ ] Each file imports from `../lib/extension-utils.js` OR has a
         Documented Exception.
     - Verify: `grep -E "from \"\\.\\./lib/extension-utils|Convention exception:" pi/extensions/commit-guard.ts pi/extensions/quality-gates.ts`
     - Pass: each file matches.
  2. [ ] `commit-guard.test.ts` asserts BOTH directions of the block
         decision: a tool_call event with a forbidden commit-message
         pattern returns `{ block: true, reason: <non-empty string> }` AND
         an allowed pattern returns `{ block: false }` or `undefined`.
     - Verify: `cd pi/tests && bun vitest run commit-guard.test.ts`
     - Pass: both assertions present and passing.
     - Fail: a single-direction test is gameable; require positive AND
             negative cases.
  3. [ ] `quality-gates.test.ts` asserts BOTH a forced lint/test failure
         producing a block decision with the failure detail in `reason`,
         AND a clean run producing no block.
     - Verify: `cd pi/tests && bun vitest run quality-gates.test.ts`
     - Pass: both assertions present and passing.

**T3: Refactor user-facing tools group + add tests** [sonnet] -- builder

- Description: Apply conventions to `context.ts`, `web-tools.ts`,
  `tool-search.ts`, `tool-reduction.ts`. The Phase 1 plan flagged these as
  candidates for `formatToolError` and `uiNotify`. Add behavioral tests
  for the three that currently lack them. Do NOT change the report content
  shape that `context.ts` emits as a transcript message (the existing
  filtering logic depends on `CONTEXT_REPORT_MESSAGE_TYPE`).
- Files: `pi/extensions/context.ts`, `pi/extensions/web-tools.ts`,
  `pi/extensions/tool-search.ts`, `pi/extensions/tool-reduction.ts`.
  Tests: **add** `pi/tests/context.test.ts`. **Extend (do not replace)**
  `pi/tests/tool-reduction.test.ts`, `pi/tests/web-tools.test.ts` (163
  lines, broad coverage), `pi/tests/tool-search.test.ts` (103 lines).
- Acceptance Criteria:
  1. [ ] Each file imports from `../lib/extension-utils.js` OR has a
         Documented Exception.
     - Verify: `grep -E "from \"\\.\\./lib/extension-utils|Convention exception:" pi/extensions/context.ts pi/extensions/web-tools.ts pi/extensions/tool-search.ts pi/extensions/tool-reduction.ts`
  2. [ ] Existing `tool-reduction.test.ts`, `web-tools.test.ts`, and
         `tool-search.test.ts` still pass with EVERY existing `it()` block
         intact (parity). Pure-additive policy applies.
     - Verify: `cd pi/tests && bun vitest run tool-reduction.test.ts web-tools.test.ts tool-search.test.ts && git diff HEAD~1 -- pi/tests/tool-reduction.test.ts pi/tests/web-tools.test.ts pi/tests/tool-search.test.ts | grep -E "^-" | grep -vE "^---" | head`
     - Pass: tests pass; no `^-` lines (additions only).
  3. [ ] New `context.test.ts` asserts the per-component bucket shape: an
         estimate run produces an array where each element has a `label`
         (string), `tokens` (number), and `details` (string) field.
     - Verify: `cd pi/tests && bun vitest run context.test.ts`
     - Pass: assertion checks all three fields per bucket, not just array
             length.
  4. [ ] `context.ts` emits the same transcript message type
         (`CONTEXT_REPORT_MESSAGE_TYPE`) so its self-filtering logic stays
         intact.
     - Verify: `grep -n "CONTEXT_REPORT_MESSAGE_TYPE" pi/extensions/context.ts`
     - Pass: the constant is still defined and used.

### Wave 1 -- Validation Gate

**V1: Validate wave 1** [sonnet] -- validator-heavy

- Blocked by: T1, T2, T3.
- Checks:
  1. Run AC verifications for T1, T2, T3.
  2. `make check-pi-extensions` -- TS type-check + Vitest suite passes.
  3. `make test-quick` -- repo-level quick checks pass.
  4. Cross-task integration: refactored extensions must NOT introduce
     circular imports between `pi/lib/` and `pi/extensions/` (helper imports
     extensions = error).
     - Verify: `grep -E "from \"\\.\\./extensions/" pi/lib/*.ts`
     - Pass: no matches (no helper imports an extension).
- On failure: create a fix task, re-validate after fix.

### Wave 2

**T4: Refactor provider/model/session group + add tests** [opus] -- builder-heavy

- Blocked by: V1.
- Description: Apply conventions to the 7 provider/session files. This is
  the highest-risk task in Phase 2 because it touches authentication
  (`provider.ts`), model availability (`model-visibility.ts`,
  `refresh-models.ts`), classifier-driven routing (`prompt-router.ts`),
  Copilot OAuth header injection (`copilot-headers.ts`), thinking-level
  probing (`probe-thinking-level.ts`), and session lifecycle including
  transcript init (`session-hooks.ts`). The Phase 1 review-1 explicitly
  flagged this combination as needing extra operational validation.
  - Behavioral parity is the binding criterion. Use existing tests where
    they exist (model-visibility, copilot-headers, provider, prompt-router,
    refresh-models). Pure-additive policy applies: every existing `it()`
    block must be preserved.
  - Add new behavioral tests for `session-hooks.ts` and
    `probe-thinking-level.ts`.
  - **Pre-refactor fixture capture**: BEFORE modifying `provider.ts`,
    capture the current parsed shape for at least one representative
    `~/.pi/agent/auth.json` fixture. Use a redacted version with
    placeholder tokens. Commit `pi/tests/fixtures/auth-baseline.json` (raw
    input) AND `pi/tests/fixtures/auth-baseline-parsed.json` (the parser's
    current output, captured by running the existing parser against the
    baseline fixture). The new parity test in T4 AC#3 must deep-equal
    against the committed `auth-baseline-parsed.json` only -- generating
    the expected from the post-refactor parser is tautological and FAILS
    the AC.
  - **provider.ts notify policy**: Keep direct `ctx.ui.notify(...)` calls
    in this file. Auth flows are user-initiated and the `[provider]`
    prefix would be redundant in modal-style messages. Add ONE
    Documented Exception block at the top of `provider.ts` covering all
    notify sites; do NOT annotate each site individually.
  - Do NOT change: provider auth file format, transcript writer init order
    in `session_start`, classifier output shape, model selection rules.
  - Do NOT replace `pi.sendUserMessage` or other API entry points.
  - **Opus-unavailable fallback**: If opus is unavailable in the
    operator's environment (model budget, outage, harness restriction),
    fall back to sonnet with the explicit constraint: "Refactor at most
    one file from this group per commit; run `make check-pi-extensions`
    after each." The wave gate compensates for the smaller per-pass
    context window.
- Files: `pi/extensions/model-visibility.ts`,
  `pi/extensions/copilot-headers.ts`, `pi/extensions/provider.ts`,
  `pi/extensions/prompt-router.ts`, `pi/extensions/refresh-models.ts`,
  `pi/extensions/session-hooks.ts`,
  `pi/extensions/probe-thinking-level.ts`. New tests:
  `pi/tests/session-hooks.test.ts`,
  `pi/tests/probe-thinking-level.test.ts`.
- Acceptance Criteria:
  1. [ ] Every file in this group imports from `../lib/extension-utils.js`
         OR has a Documented Exception.
     - Verify: `for f in pi/extensions/model-visibility.ts pi/extensions/copilot-headers.ts pi/extensions/provider.ts pi/extensions/prompt-router.ts pi/extensions/refresh-models.ts pi/extensions/session-hooks.ts pi/extensions/probe-thinking-level.ts; do grep -lE "from \"\\.\\./lib/extension-utils|Convention exception:" "$f" || echo "MISSING: $f"; done`
     - Pass: no MISSING lines printed.
  2. [ ] All existing tests for this group still pass without
         modification (parity).
     - Verify: `cd pi/tests && bun vitest run model-visibility.test.ts copilot-headers.test.ts provider.test.ts prompt-router.test.ts refresh-models.test.ts`
     - Pass: all tests pass.
  3. [ ] `provider.ts` retains its existing auth-file read/write paths.
     - Verify (behavioral): `provider.test.ts` is extended to include a
       fixture-based test that reads
       `pi/tests/fixtures/auth-baseline.json` and deep-equals the parsed
       shape against the committed
       `pi/tests/fixtures/auth-baseline-parsed.json` (captured BEFORE the
       refactor began, per the pre-refactor fixture capture step in the
       Description above).
     - Pass: parity test passes against the pre-captured fixture.
     - Fail: if the expected JSON is generated by the refactored parser,
             the test is tautological and the AC is failed regardless of
             the test result.
  4. [ ] `session-hooks.test.ts` covers transcript writer initialization
         and session_shutdown emit (these were just shipped; a regression
         here breaks the audit trace).
     - Verify: `cd pi/tests && bun vitest run session-hooks.test.ts`
     - Pass: at least two assertions -- one that
             `initializeTranscriptRuntime` is called when transcript
             settings are enabled, and one that `session_shutdown` emits a
             trace event.
  5. [ ] `probe-thinking-level.test.ts` asserts BOTH a probe with a
         known thinking-level signal returning the parsed level (e.g.
         `"high"`, `"medium"`, `"low"`, or whatever the documented set is)
         AND a probe with no signal returning the documented null/undefined
         no-signal sentinel.
     - Verify: `cd pi/tests && bun vitest run probe-thinking-level.test.ts`
     - Pass: both directions covered and passing.
  6. [ ] `prompt-router.ts` continues to emit `routing_decision` events
         in the transcript runtime (parity with the recently-shipped
         feature).
     - Verify: `cd pi/tests && bun vitest run prompt-router.test.ts`
     - Pass: existing tests pass; if any test references the trace emit
             path, it still passes.

### Wave 2 -- Validation Gate

**V2: Validate wave 2** [sonnet] -- validator-heavy

- Blocked by: T4.
- Checks:
  1. Run AC verifications for T4.
  2. `make check-pi-extensions` -- full TS type-check + Vitest suite passes.
  3. `make test` -- full repo tests pass.
  4. Operational sanity: launch Pi briefly with the standard extension set
     and confirm provider auth file is readable end-to-end.
     - Verify: `pi --version` (sanity) and confirm `~/.pi/agent/auth.json`
       is unchanged (`shasum -a 256 ~/.pi/agent/auth.json` before and after
       wave 2 produces the same hash).
     - Pass: hash is unchanged AND `pi --version` exits 0.
  5. Transcript trace continuity: a 1-message Pi session with transcript
     enabled produces both a `session_start` and a `routing_decision`
     event sharing the same `trace_id`. This catches regressions where
     transcript writer init runs before traceparent is parsed (or vice
     versa) -- a class of bug unit tests will not see.
     - Verify: enable transcript via `~/.pi/agent/settings.json`
       (`{"transcript":{"enabled":true,"path":"~/.pi/agent/traces"}}`),
       then run `pi -p 'echo hi'` (or equivalent 1-message non-interactive
       invocation), then inspect the latest
       `~/.pi/agent/traces/<session>.jsonl`.
     - Pass: at least one `event_type=session_start` line and at least one
       `event_type=routing_decision` line exist, and they share the same
       `trace_id` field.
     - Fail: missing events or mismatched `trace_id` indicates a
       sequencing regression in `session-hooks.ts` -- fix before V3.
  6. No circular imports introduced between groups.
     - Verify: `grep -E "from \"\\./(provider|prompt-router|session-hooks)\"" pi/extensions/*.ts | head`
     - Pass: only legitimate cross-extension imports (e.g. transcript-provider
             importing transcript-runtime) appear.
  7. Helper-to-extension reverse-import invariant (same shape as V1
     check 4): no file under `pi/lib/` imports from `pi/extensions/`.
     - Verify: `grep -E "from \"\\.\\./extensions/" pi/lib/*.ts`
     - Pass: no matches.
     - Fail: a helper importing an extension is a layering violation;
             revert the offending import.
- On failure: create a fix task, re-validate after fix. Do NOT proceed to
  Wave 3 with auth or session regressions.

### Wave 3 (parallel)

**T5: Refactor transcript group** [sonnet] -- builder

- Blocked by: V2.
- Description: Apply conventions to `transcript-provider.ts`,
  `transcript-purge.ts`, `transcript-runtime.ts`, `transcript-tools.ts`.
  These were shipped just hours before this plan was written; parity
  against the existing transcript fixtures is the binding criterion.
  Preserve the no-op default-export pattern in `transcript-runtime.ts`
  (its 30-40 line comment block documents why; do NOT remove it).
- Files: `pi/extensions/transcript-provider.ts`,
  `pi/extensions/transcript-purge.ts`,
  `pi/extensions/transcript-runtime.ts`,
  `pi/extensions/transcript-tools.ts`.
- Acceptance Criteria:
  1. [ ] Each file imports from `../lib/extension-utils.js` OR has a
         Documented Exception.
     - Verify: `grep -E "from \"\\.\\./lib/extension-utils|Convention exception:" pi/extensions/transcript-*.ts`
  2. [ ] All four existing transcript test files still pass (parity
         against fresh fixtures).
     - Verify: `cd pi/tests && bun vitest run transcript-correlation.test.ts transcript-fixtures.test.ts transcript-integration.test.ts transcript-log.test.ts`
     - Pass: all tests pass.
  3. [ ] `transcript-runtime.ts` keeps its no-op default export and the
         block comment explaining why.
     - Verify: `grep -E "auto-discovered by Pi" pi/extensions/transcript-runtime.ts`
     - Pass: the comment is still present.

**T6: Refactor pwsh + test-orchestrator + add test** [sonnet] -- builder

- Blocked by: V2.
- Description: Apply conventions to `pwsh.ts` (which has solid existing
  test coverage so parity is easy) and `test-orchestrator.ts` (no tests
  today; add minimum coverage).
- Files: `pi/extensions/pwsh.ts`, `pi/extensions/test-orchestrator.ts`,
  new `pi/tests/test-orchestrator.test.ts`.
- Acceptance Criteria:
  1. [ ] Each file imports from `../lib/extension-utils.js` OR has a
         Documented Exception.
     - Verify: `grep -E "from \"\\.\\./lib/extension-utils|Convention exception:" pi/extensions/pwsh.ts pi/extensions/test-orchestrator.ts`
  2. [ ] Existing pwsh tests still pass (parity).
     - Verify: `cd pi/tests && bun vitest run pwsh.test.ts pwsh-pure.test.ts`
     - Pass: all tests pass.
  3. [ ] New `test-orchestrator.test.ts` asserts that the orchestrator's
         primary entry function is invoked with the expected args when
         triggered AND that it emits the documented progress event shape
         (whatever the orchestrator's existing event signature is --
         confirm by reading `test-orchestrator.ts` first).
     - Verify: `cd pi/tests && bun vitest run test-orchestrator.test.ts`
     - Pass: both the invocation assertion and the progress-event
             assertion present and passing.

### Wave 3 -- Validation Gate

**V3: Validate wave 3** [sonnet] -- validator-heavy

- Blocked by: T5, T6.
- Checks:
  1. Run AC verifications for T5 and T6.
  2. `make check-pi-extensions` -- full TS type-check + Vitest suite passes.
  3. `make test` -- full repo tests pass.
  4. `make lint` -- no new lint warnings.
  5. End-to-end audit: every top-level `pi/extensions/*.ts` either imports
     from `pi/lib/extension-utils.js` OR contains a Documented Exception
     block. No file is uncovered.
     - Verify: `for f in pi/extensions/*.ts; do grep -lE "from \"\\.\\./lib/extension-utils|Convention exception:" "$f" >/dev/null || echo "UNCOVERED: $f"; done`
     - Pass: no UNCOVERED lines printed.
  6. Helper module placement invariant still holds (Phase 1 runtime smoke).
     - Verify: `cd pi/tests && bun vitest run runtime-smoke.test.ts`
     - Pass: 6 tests pass.
  7. Helper-to-extension reverse-import invariant (final audit).
     - Verify: `grep -E "from \"\\.\\./extensions/" pi/lib/*.ts`
     - Pass: no matches.
     - Fail: a helper importing an extension is a layering violation;
             revert the offending import before declaring V3 complete.
- On failure: create a fix task, re-validate after fix.

## Dependency Graph

```
Wave 1: T1, T2, T3 (parallel) -> V1
Wave 2: T4 (blocked by V1) -> V2
Wave 3: T5, T6 (parallel, blocked by V2) -> V3
```

## Success Criteria

1. [ ] Every top-level `pi/extensions/*.ts` either imports the shared
       helper or has a Documented Exception block.
   - Verify: see V3 check #5.
   - Pass: no UNCOVERED files.
2. [ ] Full Vitest suite passes including all parity tests added in
       Phase 2.
   - Verify: `cd pi/tests && bun vitest run`
   - Pass: 0 failures, all tests counted.
3. [ ] `make check-pi-extensions` exits 0.
   - Verify: `make check-pi-extensions`
   - Pass: exit 0; output shows tsc-check, vitest, and runtime smoke
           passing.
4. [ ] `make test && make lint` exit 0 with no new warnings.
   - Verify: `make test && make lint`
   - Pass: both exit 0.
5. [ ] Helper module placement invariant unchanged: no `pi/lib/*.ts` file
       has a sibling copy at the top level of `pi/extensions/`.
   - Verify: `cd pi/tests && bun vitest run runtime-smoke.test.ts`
   - Pass: 6 tests pass.
6. [ ] `~/.pi/agent/auth.json` SHA-256 unchanged across the entire phase
       (no inadvertent provider-auth migration).
   - Verify: capture `shasum -a 256 ~/.pi/agent/auth.json` before T4 and
     after V3; the two hashes must match.
   - Pass: hashes equal.

## Handoff Notes

- Phase 1 archived plan lives at
  `.specs/archive/extensions-consistency/plan.md`. Read it for the helper
  module shape, conventions doc, and the precise definition of "Documented
  Exception."
- Phase 1 shipped `pi/extensions/template.extension.ts.example` (the
  canonical scaffold). Phase 2 does NOT modify it. If the scaffold needs
  to drift during Phase 2 -- e.g. a new helper is referenced by every
  refactored extension -- update the scaffold in the same task that
  introduced the new helper. Do not defer to Phase 3.
- Phase 1 fixed two pre-existing test infrastructure issues during
  execution (vitest config alias for `@sinclair/typebox` -> `typebox`,
  `pi-ai/oauth` subpath alias, tool-reduction 10s -> 30s timeout). Phase 2
  inherits the fixed config; do not regress these.
- `pi/extensions/web-fetch/` is vendored and excluded by tsconfig. Do not
  touch.
- `pi/extensions/subagent/` is a subdirectory and not auto-discovered top
  level; out of scope.
- The recently-shipped transcript feature is sensitive. Wave 3 specifically
  preserves the no-op default-export pattern in `transcript-runtime.ts`
  and the existing fixture-based test parity; do not optimize either away.
- Use `/dev/null` in bash redirects on Windows/MSYS2; keep paths with
  forward slashes in docs.
- Provider auth: T4's provider.ts refactor MUST NOT migrate the auth file
  format. The Success Criteria #6 hash check exists to catch silent
  migrations.
- If review-it surfaces a finding that overlaps with an explicit
  out-of-scope item, document it in this plan as a known limitation rather
  than expanding scope. Phase 3 (lint rules, broader convention
  enforcement) is the right venue for items that fall outside Phase 2.
