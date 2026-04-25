---
date: 2026-04-25
status: synthesis-complete
---

# Plan Review Synthesis: Pi Extensions Standardization Phase 2

## Review Panel

| Reviewer | Role | Findings | Verified Issues |
|---|---|---|---|
| Completeness & Explicitness | Plan-as-only-input clarity | 5 | 3 |
| Adversarial / Red Team | Failure-mode hunt | 4 | 1 |
| Outside-the-Box / Simplicity | Approach proportionality | 3 | 1 (positive) |
| typescript-pro | TS/ESM/auto-discovery | 4 | 1 (after dismissing 1 false positive) |
| security-reviewer | Auth + transcript invariants | 3 | 2 |
| qa-engineer | Test rigor vs grep-equivalent | 4 | 3 |
| devops-pro | Windows/MSYS2 portability | 4 | 1 (after dismissing 2 verified-OK) |

Coordinator note: no general-purpose subagent dispatch tool was available in this
runtime, so the seven reviewer perspectives were applied in-context against the
plan with direct verification (Read/Grep/Bash) of every CRITICAL/HIGH claim before
inclusion. Findings that did not survive verification are listed under Dismissed.

## Outside-the-Box Assessment

The approach is sound and proportionate. Phase 1 did the architecturally hard
work (helper location, conventions doc, auto-discovery hazard documentation,
behavioral-test pattern); Phase 2 is mostly mechanical drift cleanup with two
genuinely risky surfaces (T4 provider/session and T5 transcript) correctly
isolated behind their own validation gates with parity tests. The three-wave
shape is cheap and catches regressions early â€” the alternative single-pass
refactor was rightly rejected by the alternatives table. The hash-based
auth-file invariant (Success Criterion #6) is exactly the right deterministic
guard for the highest-blast-radius change. Keep the plan; the bugs below are
fixable inline.

## Bugs (must fix before executing)

### B1. File count mismatch: text says "17 extensions", task table covers 22 [HIGH] [Completeness]

The "Phase 2 covers the remaining 17 extensions" claim in Context & Motivation
contradicts the actual task table in Files In Scope, which sums to 22 distinct
files (T1=3, T2=2, T3=4, T4=7, T5=4, T6=2 = 22). Verified against the on-disk
directory: `pi/extensions/` contains 25 top-level `.ts` files; minus the three
Phase 1 refactors (`agent-team.ts`, `ask-user.ts`, `damage-control.ts`) leaves
22 in scope. An operator following the "17" figure may stop refactoring 5 files
short of the Success Criterion #1 audit and only discover the gap when
`make check-pi-extensions` fails at V3.

**Fix**: Replace every "17" reference in Context & Motivation and Task Breakdown
preamble with "22" (or remove the count entirely; the table is authoritative).

### B2. Plan says "**add** workflow-commands.test.ts / context.test.ts / web-tools.test.ts / tool-search.test.ts" but three already exist [HIGH] [Completeness, qa-engineer, typescript-pro]

Verified on disk:

- `pi/tests/workflow-commands.test.ts` exists, 380 lines, 6 `it()` blocks, full
  command-flow integration coverage.
- `pi/tests/web-tools.test.ts` exists, 163 lines, broad coverage of `web_search`
  and `web_fetch` happy and error paths.
- `pi/tests/tool-search.test.ts` exists, 103 lines, registration / search /
  include_params / renderCall coverage.
- `pi/tests/context.test.ts` does NOT exist (this one is genuinely an add).

A builder agent literal-reading "add `workflow-commands.test.ts`" via the Files
list and AC verbs is at risk of overwriting working tests with a "new" file
that satisfies the AC ("at least one `it()` block") but loses the existing
coverage. This is the exact regression pattern the Phase 1 plan called out and
that grep-only ACs were tightened to prevent.

**Fix**: In T1, T3 change "**add**" to "**extend** (existing file)" for
`workflow-commands.test.ts`, `web-tools.test.ts`, `tool-search.test.ts`. Keep
"add" only for `context.test.ts`, `commit-guard.test.ts`, `quality-gates.test.ts`,
`session-hooks.test.ts`, `probe-thinking-level.test.ts`,
`test-orchestrator.test.ts`. Add an explicit AC: "If a test file at
`pi/tests/<extension>.test.ts` already exists, the refactor MUST preserve every
existing `it()` block; new tests are additive."

### B3. T1/T3/T6 "at least one `it()` block / behavioral path" AC is gameable [HIGH] [qa-engineer]

T1 AC#3, T3 AC#4, T4 AC#5, T6 AC#3 all use the bar "at least one behavioral
assertion" or "at least one `it()` block, all passing". A builder satisfying
this literally can write `it("compiles", () => expect(true).toBe(true))` and
pass the AC while leaving the refactored extension untested. This is the same
"grep-equivalent in disguise" risk Phase 1 review-1 flagged and that the Phase
1 plan resolved by making behavioral tests the binding criterion.

**Fix**: For each new test file, replace "at least one `it()` block" with a
specific assertion the author cannot game:

- `commit-guard.test.ts`: "asserts that a tool_call event with a forbidden
  pattern returns `{ block: true, reason: <non-empty string> }` AND that an
  allowed pattern returns `{ block: false }` or undefined."
- `quality-gates.test.ts`: "asserts that a forced lint failure produces a block
  decision with the failure detail in `reason`, AND that a clean lint result
  produces no block."
- `session-hooks.test.ts`: already has two specific assertions in T4 AC#4 -
  keep as-is.
- `probe-thinking-level.test.ts`: "asserts that a probe with a known thinking
  level returns the parsed level; asserts that a probe with no signal returns
  null/undefined (the documented no-signal sentinel)."
- `test-orchestrator.test.ts`: "asserts that the orchestrator's primary entry
  function (`runTests` or equivalent) is called with the expected args when
  triggered AND that it emits the correct progress event."
- `context.test.ts`: T3 AC#3 already specifies "per-component bucket shape" -
  good.

### B4. T4 "use uiNotify where it adds value" leaves 20+ provider.ts notify sites ambiguous [MEDIUM] [Completeness, security-reviewer]

`provider.ts` contains 20+ direct `ctx.ui.notify` call sites, all in
auth-credential-management flows (Saved API key, Removed credentials, Cancelled,
Unknown provider, etc.). The plan states uiNotify is "where it adds value, not
as a blanket rule" â€” this is the correct posture but T4 gives no decision rule
for the builder. Result: an opus-model builder may decide every site adds
value (touching every line, increasing diff blast radius) or no site adds
value (filing 20 Documented Exceptions) -- neither outcome matches the plan
intent.

**Fix**: Add to T4 description: "For `provider.ts`, the policy is: keep direct
`ctx.ui.notify(...)` calls in this file (auth flows are user-initiated and the
extension name `[provider]` prefix would be redundant in modal-style messages).
Add ONE Documented Exception block at the top of `provider.ts` covering all
notify sites; do not annotate each site individually."

### B5. Wave 2 "auth-file format unchanged" parity fixture is named but not committed [MEDIUM] [security-reviewer]

T4 AC#3 says "provider.test.ts must include or be extended to include a
fixture-based test that reads a sample auth file and asserts the parsed shape
unchanged from before refactor." This requires capturing the parsed shape
BEFORE the refactor begins. The plan does not specify when or how that
snapshot is captured. If the builder generates the fixture from the
post-refactor parser, the parity test is tautological.

**Fix**: Add a pre-refactor step to T4: "Before modifying `provider.ts`,
capture the current parsed shape for at least one representative auth.json
fixture (use a redacted version with placeholder tokens) and commit it as
`pi/tests/fixtures/auth-baseline.json` (raw input) plus
`pi/tests/fixtures/auth-baseline-parsed.json` (the parser's current output).
The new parity test must deep-equal against the committed
`auth-baseline-parsed.json` only."

## Hardening Suggestions (optional improvements)

### H1. Add a 5-minute manual smoke for V2 transcript trace continuity [MEDIUM] [security-reviewer, qa-engineer]

T4 ACs #4 and #6 cover unit-level assertions for `initializeTranscriptRuntime`
being called and `routing_decision` events being emitted, but a regression
where the transcript writer initializes BEFORE traceparent is parsed (or vice
versa) could pass unit tests yet break trace continuity in a real session.
Proportionality check: this is one extra command, deterministic, no new
infrastructure.

**Fix**: Add to V2 checks: "Run a 1-message Pi session with transcript enabled
(`PI_TRANSCRIPT_ENABLED=1 pi -p 'echo hi'` or equivalent) and confirm the
session produces a `session_start` event followed by a `routing_decision`
event in `~/.pi/transcripts/<session>.jsonl`, with both events sharing the
same `trace_id`."

### H2. V2 circular-import grep is too narrow [LOW] [typescript-pro]

V2 check 5 only greps for `from "./<provider|prompt-router|session-hooks>"`
patterns under `pi/extensions/*.ts`. It would not catch a regression where a
provider extension started importing from a transcript helper subdirectory or
where `pi/lib/transcript.ts` started importing from `pi/extensions/`. The V1
check 4 grep (`pi/lib/*.ts -> pi/extensions/`) is the correct shape and should
be repeated in V2 and V3.

**Fix**: In V2 and V3, add the same `pi/lib/*.ts` reverse-import check from V1
verbatim. Keep the existing V2 cross-extension grep as a supplement.

### H3. Document scaffold deletion if it exists pre-Phase-2 [LOW] [Completeness]

Phase 1 scope listed `template.extension.ts.example` (T7). If that file was
shipped, Phase 2 doesn't reference it. If it wasn't, the README that Phase 2
inherits references it but the file might not exist. Either is fine, but the
plan should note explicitly which assumption it makes.

**Fix**: Add to Handoff Notes: "Phase 1 shipped `template.extension.ts.example`
under `pi/extensions/`; Phase 2 does not modify it. If the scaffold drifts
during Phase 2 refactors (a new helper is referenced), update the scaffold in
the same task that introduced the new helper -- do not defer to Phase 3."

### H4. Make the Documented Exception location rule precise [LOW] [qa-engineer]

The Documented Exception block format is verbatim from Phase 1 README, which
says "top-of-file or call-site comment". For a file like provider.ts (single
file-level exception per B4) versus a file with one specific notify site that
needs an exception, "top-of-file" vs "call-site" placement is ambiguous when
both apply. Operator may put the block at the wrong scope and confuse later
reviewers.

**Fix**: Add to the Documented Exception reminder: "Place the block immediately
above the first non-conforming call site if exactly one site is exempted; place
it at the top of the file (after the file header comment) if multiple sites
share the same rationale. Each block applies until end-of-file or until
overridden by a more specific block."

### H5. T4 has the only opus-model task; if the opus tier is unavailable, plan stalls [LOW] [devops-pro]

T4 is marked `[opus]`. If the operator's environment doesn't expose opus (model
budget, outage, harness restriction), the plan has no fallback. Phase 1 model
tiers were all "small/medium" so this didn't apply.

**Fix**: Add to T4: "If opus is unavailable, fall back to sonnet with the
explicit constraint: 'Do not refactor more than one file from this group per
PR/commit; validate after each.' The wave gate compensates for the smaller
context window."

## Dismissed Findings

### D1. CRITICAL "canonicalize checks for space, not NUL byte" [DISMISSED, false positive]

A surface read of `pi/lib/extension-utils.ts:86` shows
`if (filePath.includes(" "))` which would imply a Phase 1 bug where the error
message says "NUL byte" but the check is for ASCII space. Verified by reading
the file as raw bytes: the literal between the quote marks is `\x00` (a NUL
byte), not a space. The Read tool renders NUL as a visible space, but the
Bash `grep` warned that the file matches as binary (single NUL byte present in
file). Helper is correct.

### D2. HIGH "shasum may not exist on this MSYS2" [DISMISSED, verified present]

V2 check 4 and Success Criterion #6 use `shasum -a 256`. Verified
`/usr/bin/core_perl/shasum` is present on the user's MSYS2 (version 6.04). No
fix needed.

### D3. HIGH "`pi --version` may not exist or may modify auth.json" [DISMISSED, verified safe]

V2 check 4 calls `pi --version` as a sanity check then `shasum -a 256`'s the
auth file. Two concerns:

1. Does `pi --version` exist? Verified: `pi --version` returns `0.70.2` on
   the user's machine via the npm-installed binary at
   `~/AppData/Roaming/npm/pi`.
2. Does `pi --version` modify `auth.json`? Verified by capturing SHA-256
   before, running `pi --version`, capturing SHA-256 after: hashes are
   identical. The check is safe.

### D4. MEDIUM "make check-pi-extensions does not run runtime smoke as Phase 1 README claims" [DISMISSED, semantic equivalence]

The README under "Validation" lists three steps including "Pi runtime smoke".
The Makefile target only runs `python pi/extensions/tsc-check.py` and
`bun vitest run`. However, `pi/tests/runtime-smoke.test.ts` is included by the
vitest glob (`tests/**/*.test.ts`), so the smoke runs as part of step 2. The
README is descriptively correct; no fix required.

### D5. LOW "Parallel waves T1/T2/T3 risk merge conflicts" [DISMISSED, accepted by plan]

The waves operate on disjoint file sets (verified: T1 = agent-chain,
workflow-commands, todo; T2 = commit-guard, quality-gates; T3 = context,
web-tools, tool-search, tool-reduction). No file is touched by more than one
wave-1 task. New test files in T2/T3 are also disjoint. The plan's stated
constraint that waves are cheap and catch regressions early already accepts
the parallelism cost.

## Positive Notes

- **Auto-discovery hazard explicitly preserved**. T5 keeps the no-op default
  export and 30-40 line comment block in `transcript-runtime.ts`, and the Hard
  Rule under Constraints forbids new helpers in `pi/extensions/`. This is the
  highest-blast-radius foot-gun in the codebase and the plan handles it
  precisely.
- **Hash-based auth invariant (SC #6)** is the correct deterministic check for
  the highest-risk surface. Verified the chosen tool (`shasum`) exists, the
  target file (`~/.pi/agent/auth.json`) exists, and the sanity command
  (`pi --version`) is read-only.
- **Wave gates with explicit "do NOT proceed to Wave 3 with auth or session
  regressions"** policy is exactly the right escape valve. Most plans omit
  this and hope the operator notices.
- **Out-of-scope items are explicit and traceable**: web-fetch vendored,
  subagent subdirectory, ESLint deferred to Phase 3, every-notify-replacement
  downgraded by Phase 1 review-1. No reviewer can drag scope sideways without
  the operator noticing.
- **Phase 1 review-1 lessons internalized**: behavioral tests as binding
  criterion, grep checks supplementary, three-line Documented Exception
  format, helpers-under-pi/lib invariant.
- **Vitest config invariants from Phase 1 are noted in Handoff Notes**
  (typebox alias, pi-ai/oauth alias, tool-reduction timeout) so Phase 2 cannot
  silently regress them.
