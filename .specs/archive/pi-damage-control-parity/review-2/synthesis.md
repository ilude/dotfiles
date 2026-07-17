---
date: 2026-05-14
status: synthesis-complete
---

# Plan Review Synthesis: Pi Damage-Control Claude Parity

## Review Panel

Note: this round was synthesized by the coordinator directly (the harness in this
session does not expose a parallel-agent dispatch tool). The six perspectives
listed below were applied in-context against the plan, with verification against
the actual repo for every CRITICAL/HIGH claim.

| Reviewer | Role | Findings | Verified Issues |
|---|---|---:|---:|
| Completeness & Explicitness | Mandatory | 4 | 3 |
| Adversarial / Red Team | Mandatory | 5 | 4 |
| Outside-the-Box / Simplicity | Mandatory | 2 | 2 |
| TypeScript adapter | Dynamic | 3 | 3 |
| Security (fail-open vs fail-closed) | Dynamic | 3 | 2 |
| QA / Parity Oracle | Dynamic | 3 | 3 |
| **Total (deduped)** |  | **12** | **9 bugs / 3 hardening** |

## Outside-the-Box Assessment

The staged Phase A/B/C approach is sound and proportional. The plan correctly
rejects "copy all 352 rules into Pi YAML" (drift) and "shell out to Python"
(latency, cross-platform fragility). However, the chosen approach -- a TS
adapter normalizing Claude `patterns.yaml` -- has a hidden tax: Pi's existing
`pi/lib/yaml-mini.ts` explicitly does NOT preserve scalar typing (comment lines
14-19: "non-string scalar typing (numbers, bools, dates remain strings)"). The
plan's own T2 failure criterion ("Boolean `ask` is treated as a string and
mapped incorrectly") is therefore the *default* outcome unless T2 either picks
a different loader or coerces `"true"`/`"false"` strings explicitly. Verdict:
approach is right, but T2 must commit to a loader strategy up front. Not
OVERKILL; the staging is correct.

## Bugs (must fix before executing)

### B1. CRITICAL -- yaml-mini cannot represent `ask: true` as a boolean

- Flagged by: TypeScript adapter, Completeness, QA
- Verification: confirmed. `pi/lib/yaml-mini.ts` lines 14-19 document that
  numbers/bools/dates remain strings. `patterns.yaml` uses `ask: true` (verified
  10+ occurrences). If T2 uses `parseYamlMini`, the `ask` field will arrive as
  the literal string `"true"`, and a naive `if (item.ask)` will be truthy for
  both `"true"` and `"false"` strings -- the exact failure the plan calls out.
- Fix: In T2, explicitly state the loader choice. Two viable options:
  (a) use `pi/lib/yaml-helpers.ts` `loadYamlViaPython` (already referenced from
  yaml-mini.ts header comment) so PyYAML does the typing, or
  (b) coerce in the normalizer: treat `ask` as truthy only when the value
  (after string-trim, case-fold) equals `"true"`, and reject any other scalar.
  Add a T2 unit test that asserts `ask: false` -> `block`, `ask: "false"`
  string -> `block` (not `ask`), and missing -> `block`.

### B2. CRITICAL -- T1 inventory script will fail: ambient `uv run python` has no PyYAML

- Flagged by: Adversarial, Completeness
- Verification: confirmed. To run the T1 snippet I had to invoke
  `uv run --with pyyaml python ...`. Plain `uv run python` outside an explicit
  project venv that declares pyyaml resolves to a Python interpreter without
  the `yaml` module on this repo. The constraint section even calls this out:
  "Use `uv run python` for Python helper scripts that import `yaml`; do not
  rely on ambient `python` having PyYAML" -- but the T1 command does exactly
  that.
- Fix: change every `uv run python - <<'PY'` block that imports `yaml` to
  `uv run --with pyyaml python - <<'PY'`. Applies to T1 inventory (lines ~150)
  and the secret-scan/manifest scripts that use no yaml (those are fine) --
  only the T1 inventory needs the change.

### B3. HIGH -- Python regex compiles in Node != Python regex matches the same in Node

- Flagged by: QA Parity Oracle, TypeScript adapter
- Verification: confirmed by inspection. T2 requires "every normalized regex
  must compile under Node ... Invalid/incompatible regexes must fail policy
  health closed." Compilation success is a necessary but not sufficient
  condition for semantic parity. Real divergences between Python `re` and
  ECMAScript regex include: `\b` Unicode-word-boundary semantics, named groups
  syntax (`(?P<x>...)` Python vs `(?<x>...)` JS), inline flags (`(?i)`, `(?s)`,
  `(?m)`), possessive quantifiers, `\A`/`\Z`/`\z` anchors. None of these will
  fail JS compilation; they'll just match different strings.
- Fix: in T2, add an additional check beyond compile-success -- syntax scan
  for Python-only features (`(?P<`, `(?P=`, `\A`, `\Z`, possessive `*+`/`?+`)
  and fail policy health closed if any pattern uses them. In T5, require the
  parity oracle to assert outcome equivalence on EVERY Claude pattern, not
  just selected families; an unmatched-by-Node pattern must appear as a
  coverage-debt entry.

### B4. HIGH -- Universal case-insensitive matching (T3) over-matches

- Flagged by: TypeScript adapter, Adversarial
- Verification: confirmed. `patterns.yaml` does not request case-insensitive
  globally. T3 specifies "Case-insensitive JS regex evaluation for normalized
  Claude Bash rules." Claude's Python engine uses pattern-level flags, not
  universal `re.IGNORECASE`. Forcing `i` on every rule will cause patterns
  like `\brm\b` to match `RM` and `Rm` in command text, which Claude's engine
  does NOT block. This will produce ask/block decisions where Claude allows --
  the wrong direction for parity.
- Fix: T3 must drop the universal-`i` requirement. Preserve Claude's matching
  semantics: case-sensitive by default; honor any `(?i)` inline flag inside
  each pattern. Add a parity fixture: `RM file` -> allow on both engines.

### B5. HIGH -- Unknown safety-affecting fields like `exfil` are not enumerated

- Flagged by: Security, Completeness, QA
- Verification: confirmed. `patterns.yaml` uses `exfil: true` on entries
  (visible at lines around the IMDS block). The plan only lists handling for
  `ask, pattern, reason, platforms, exclude_platforms`. `exfil` is mentioned
  only in Phase C ("allowed-host exfil bypass"). T2 says "Unsupported
  safety-affecting fields must be reported/fail closed rather than silently
  dropped" -- but does not specifically call out `exfil`, nor `tools`, nor
  the entries that have `block: true` semantics (current ask-false rules).
- Fix: T1 inventory must enumerate every distinct key seen across
  `bashToolPatterns[]` entries and list them in `policy-inventory.md` with
  "supported / deferred / unsupported-but-safe" classification. T2 must fail
  policy health closed if any rule carries a key not in the supported set.

### B6. HIGH -- Platform scoping not exercised on Windows

- Flagged by: Adversarial, QA
- Verification: confirmed. `patterns.yaml` uses `platforms: [linux]` on entries
  (verified at lines 683-708). Claude's Python engine evaluates
  `_pattern_applies_to_current_platform` against `sys.platform`. Pi runs on
  Node under Windows MSYS in this repo (verified by repo path constraints).
  The plan's normalization step (T2 line ~77) says to handle `platforms` /
  `exclude_platforms`, but the T3 test list does not include a Windows-vs-Linux
  parity case. A Linux-only rule firing on Windows Pi (or vice versa) is a
  silent parity break.
- Fix: add T3 fixtures asserting `platforms:[linux]`-tagged rules do not fire
  when Pi process platform is `win32`, and that `exclude_platforms:[win32]`
  rules are skipped under Pi/Windows. Mock `process.platform` in the test.

### B7. HIGH -- T5 oracle has no defined Python invocation contract

- Flagged by: QA Parity Oracle
- Verification: confirmed. `claude/hooks/damage-control/bash-tool-damage-control.py`
  is a stdin-JSON hook, not a library. T5 says "evaluates the same synthetic
  cases against Claude Python damage-control logic and Pi TypeScript logic" but
  does not say HOW the Python oracle is invoked: (a) import internals (likely
  unstable), (b) drive the hook over stdin with synthesized
  Bash-tool-call JSON (slow but stable), or (c) reuse Claude's existing pytest
  fixtures. Without picking one, the oracle is unspecified.
- Fix: pin the oracle invocation in T5 to option (b): drive the hook binary
  via subprocess with synthesized JSON matching its actual stdin schema, parse
  the JSON decision response, and normalize to `allow|ask|block`. Document
  the JSON schema in `parity-diff.md` header.

### B8. HIGH -- Silent fallback to Pi rules when Claude policy missing is the original bug

- Flagged by: Security, Adversarial
- Verification: confirmed. Plan says "If Claude policy is unavailable, load
  existing Pi `pi/damage-control-rules.yaml` fallback." But the immediate
  trigger for this whole plan is that Pi's smaller policy missed `rm -f`. If
  someone installs Pi without the dotfiles repo present, or runs Pi from a
  worktree without claude/, fallback will silently re-introduce the same gap
  the plan is supposed to fix.
- Fix: make fallback explicit and loud. Require a configured
  `dangerCtrl.claudePolicyPath` (env var or settings.json key) when Pi expects
  Claude parity. If unset, log a single startup warning ("Pi damage-control
  running in Pi-only mode; not at Claude parity") and emit a one-time UI
  notification. If set and the file is missing, fail policy health closed
  rather than silently fall through.

### B9. HIGH -- T0 diff capture misses staged changes

- Flagged by: Completeness, Adversarial
- Verification: confirmed via current git status. The plan runs
  `git diff -- pi/...` without `--cached`. If a user has staged the
  pre-existing `rm -f` patch, the captured `preexisting-diff.patch` will be
  empty and the staged edits look pristine. The plan's stated goal is to
  preserve those preexisting edits as evidence.
- Fix: replace with `git diff HEAD -- pi/damage-control-rules.yaml pi/tests/damage-control.test.ts > .specs/.../preexisting-diff.patch` and additionally archive `git status --short` (already captured) and `git diff --cached -- ...` to a separate `preflight-cached.patch` for completeness.

## Hardening Suggestions (optional improvements)

### H1. MEDIUM -- Pin the loader choice in T2 explicitly

- Flagged by: TypeScript adapter, Outside-the-Box
- Proportionality: not OVERKILL. T2 right now says "Use a real YAML parser or
  explicit typed normalization." Given the verified yaml-mini limitation, T2
  should commit: "Phase A loads `patterns.yaml` via `loadYamlViaPython` from
  `pi/lib/yaml-helpers.ts` (already in use for parser features yaml-mini does
  not support). Phase A does not extend yaml-mini." Reduces executor drift.

### H2. MEDIUM -- T6 documentation location

- Flagged by: Completeness
- Proportionality: minor. Plan says `pi/README.md` or `pi/docs/`. Pick one to
  avoid scope drift -- recommend `pi/README.md` under a "Damage Control" H2,
  since `pi/docs/` does not currently exist as a convention in this repo.

### H3. MEDIUM -- Add explicit success criterion: no real shell execution in test runs

- Flagged by: Adversarial
- Proportionality: not OVERKILL. The plan says "Tests must evaluate policy
  functions or mocked Pi tool-call handlers only" and T4 mentions a canary,
  but there is no Success-Criteria line that the executor must verify. Add a
  concrete G2/G3 grep assertion: `grep -L "child_process\|execSync\|spawn" pi/tests/damage-control.test.ts` returns the file (i.e., test file has NO real shell calls). Failing the gate if any test imports real exec primitives.

## Dismissed Findings

### D1. "Plan does not address pwsh parity at all"

- Reason for dismissal: plan EXPLICITLY scopes `bashToolPatterns` to Bash only
  (Constraints, T3 fail criterion "Bash-only rules over-apply to pwsh", and
  Success Criteria item 4). This is intentional non-parity for Phase A and is
  documented. Not a bug.

### D2. "Phase C deferral leaves taint/sequence detection unimplemented"

- Reason for dismissal: Phase C is explicitly ledger/deferred in the Objective
  section, and the unsupported-feature ledger (T6) is the documented
  mitigation. The plan's success criteria forbid claiming Phase C parity
  unless implemented. Working as designed.

### D3. "Plan should rewrite Claude policy schema for cross-runtime sharing"

- Reason for dismissal: explicitly considered as Alternative #4 and rejected
  with sound reasoning ("too large for this fix and risks changing Claude
  while fixing Pi. Defer until parity is measured.") Alternative listing is
  thorough.

### D4. "352 patterns will be slow to evaluate per tool call in Node"

- Reason for dismissal: unverified perf claim. Claude already evaluates the
  same 352 patterns per Bash call in Python. JS regex engines are typically
  faster, not slower. Downgraded to a non-issue; if it ever matters, add a
  short-circuit on first hard-block match (which Claude already does by
  rule-order precedence).

## Positive Notes

- Risk and manual-gate section is unusually clear and well-reasoned.
- Alternatives Considered is real and includes an opposite-pattern fit check.
- Wave structure with G1/G2/G3 gates and explicit pass/fail per task is
  high-quality and matches the project's `/do-it` invariant requirements.
- Evidence-manifest + secret-scan with captured exit codes is rigorous.
- T0 diff-preservation respects the "no destructive git" rule and the user's
  existing local edits.
- Bash-only scoping for `bashToolPatterns` is correctly explicit (B6 above is
  about platform-OS scoping, not tool scoping).
- T5 negative controls (allowed near-misses, zero-access exclusions) prevent
  the parity test from becoming a one-sided block-everything assertion.
- Validation Contract captures exit codes per command, which downstream F5
  can inspect deterministically. Strong.
