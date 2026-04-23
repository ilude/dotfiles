---
date: 2026-04-22
status: synthesis-complete
---

# Plan Review Synthesis: Pi Router Effort Routing

Synthesis note: the Task/Agent subagent-dispatch tool was unavailable in this
environment, so the six reviewer personas were executed as a single coordinated
pass by the coordinator agent against the actual codebase rather than spawned
as parallel subagents. Every CRITICAL/HIGH finding below was verified directly
against files under `pi/` using Read/Grep/Bash. Dismissed findings are called
out separately.

## Review Panel

| Reviewer | Role | Findings | Verified Issues |
|---|---|---|---|
| R1 | Completeness & Explicitness | 6 | 3 |
| R2 | Adversarial / Red Team | 5 | 3 |
| R3 | Outside-the-Box / Simplicity | 4 | 2 |
| R4 | ML Classifier Design | 6 | 3 |
| R5 | Runtime Integration | 7 | 5 |
| R6 | Cost & Efficiency | 5 | 3 |

## Outside-the-Box Assessment

The plan is correctly scoped as a "design for the upgrade path, don't ship it
yet" artifact and correctly defers to a prerequisite data plan. However, for a
single-user dotfiles tool whose stated goal is *subscription rate-limit
preservation*, the selected approach (full v3 corpus + retrained classifier +
new joint policy + new docs + new metrics) is heavy. The rejected "Option 3
bridge" (keep the legacy `low/mid/high` classifier, layer a confidence-aware
cost-first policy + static tier->effort mapping + downgrade hysteresis on top
in TypeScript) would deliver ~80% of the cost/rate-limit benefit in a fraction
of the work and could be shipped in days. The plan dismisses it as "only a
bridge solution," but a bridge that reduces rate-limit pressure *today* is
strictly better than a perfect redesign that depends on an unfinished data
plan. Recommendation: explicitly plan a Phase 0 quick-win (static mapping +
downgrade-friendly hysteresis + remove `applyNeverDowngrade`) that ships
independent of the v3 corpus, and treat the v3 classifier as Phase 1. This is
not a bug in the plan as written but a strong architectural steer.

## Bugs (must fix before executing)

### B1 [HIGH] Plan assumes `pi.setThinkingLevel()` exists on `ExtensionAPI` but never verifies it
- Flagger: R5 (Runtime Integration), echoed by R1 (Completeness)
- Verification: Grepped the repo for `setThinkingLevel` â€” it appears only in
  this plan's docs and in `pi/README.md`/`pi/settings.json` as a *settings*
  key (`defaultThinkingLevel`), never as an `ExtensionAPI` method call. The
  `@mariozechner/pi-coding-agent` package is not vendored into this repo
  (no `node_modules/@mariozechner` under `pi/` or `pi/tests/`), so the
  method's existence cannot be confirmed locally. T4 AC #1 literally greps
  for `setThinkingLevel\(` as its pass criterion â€” if the method does not
  exist on `ExtensionAPI`, T4 is a dead end.
- Confirmed present: `await pi.setModel(model)` at
  `pi/extensions/prompt-router.ts:117` (works today).
- Confirmed absent: any repo-local evidence that `pi.setThinkingLevel(...)`
  is callable from an extension. The Context section asserts "Pi already
  supports `setThinkingLevel()` plus CLI/settings thinking controls" â€” this
  is an unverified claim.
- Fix: Add an explicit Wave 0 probe task (or fold into T0) that loads a
  minimal extension in a dev Pi and calls `pi.setThinkingLevel?.("minimal")`,
  capturing the concrete `ExtensionAPI` type. If the method does not exist,
  the plan must either (a) wait for upstream Pi to add it, or (b) fall back
  to `defaultThinkingLevel` in `settings.json` written at session start, or
  (c) file an upstream issue. Do not proceed to T2/T4 until this is pinned.

### B2 [HIGH] IPC contract between Python classifier and TS router is unspecified
- Flagger: R5 (Runtime Integration), R4 (ML Classifier Design)
- Verification: `pi/extensions/prompt-router.ts:98-101` currently reads
  `result.stdout.trim()` and expects a single literal token
  (`low|mid|high`). The plan asks the classifier to return "structured
  route-level recommendations" with `confidence`, `candidate`, `route`,
  `effort`, `model_tier`, but never specifies the wire format. T2 AC #2's
  verify regex (`json|confidence|candidate|route|effort|model_tier`) is so
  permissive that any string containing the word "route" passes. T4 never
  defines how TS parses the new output, nor what it does on malformed
  output.
- Fix: T1 must produce a frozen JSON schema (not just prose) for the
  classifier stdout â€” e.g. a single-line JSON object
  `{"primary":{"model":"small","effort":"minimal"},"candidates":[...],"confidence":0.73,"schema_version":"v3"}`.
  T2 must assert schema conformance with a JSON Schema or Pydantic check,
  not a regex. T4 must handle parse failure by falling back to the current
  model/effort (not erroring out).

### B3 [HIGH] `<1ms inference budget` is carried forward from legacy but is implausible for the new surface
- Flagger: R4 (ML Classifier Design), R6 (Cost & Efficiency)
- Verification: `pi/prompt-routing/router.py:51-104` achieves sub-ms by
  importing once at module import time and reusing `_model`. But the TS
  extension shells out via `pi.exec("python", [CLASSIFY_SCRIPT, text], ...)`
  at `pi/extensions/prompt-router.ts:98` â€” a *cold Python interpreter
  startup* per prompt. On Windows that is ~150-300 ms, not <1 ms. The
  existing `<1ms inference` metric measures the classifier alone and has
  never reflected end-to-end latency. Carrying the same constraint forward
  for a richer output surface is either already violated or requires a
  persistent Python server (not planned).
- Fix: Either (a) demote the `<1ms` constraint in Constraints to
  "classifier-internal inference time" and add a separate "end-to-end
  classification overhead < 300ms (async, non-blocking)" metric, or (b)
  add a task to replace `pi.exec` with a long-lived Python subprocess
  over stdio/named-pipe. Option (a) matches the "fire-and-forget" comment
  at `prompt-router.ts:151-152`.

### B4 [HIGH] T0 `rg` pattern `^READY|^NOT READY|READY|NOT READY` matches itself and also matches "NOT READY"
- Flagger: R1 (Completeness), R2 (Adversarial)
- Verification: Plan line 123 literally specifies
  `rg -n "^READY|^NOT READY|READY|NOT READY" pi/prompt-routing/docs/corpus-readiness-report.md`.
  Because `READY` is a substring of `NOT READY`, a readiness report that
  says `NOT READY` satisfies this grep and passes T0. The prose pass
  criterion says "report clearly states `READY`" but the verify command
  does not enforce that.
- Fix: Replace with a stricter check, e.g.
  `python -c "import sys,re; t=open('pi/prompt-routing/docs/corpus-readiness-report.md').read(); sys.exit(0 if re.search(r'^\s*Status:\s*READY\b', t, re.M) and 'NOT READY' not in t else 1)"`
  or require a YAML frontmatter `status: ready` field and check it with a
  Python parser.

### B5 [HIGH] Removing `applyNeverDowngrade` without replacement risks thrash on ambiguous classifier output
- Flagger: R2 (Adversarial), R6 (Cost)
- Verification: `pi/extensions/prompt-router.ts:78-83` is the current
  safety floor; it guarantees monotonic per-session escalation. T3/T4
  replace it with "downgrade-friendly hysteresis" but neither task
  specifies the hysteresis rule. With a probabilistic classifier whose
  confidence hovers near a threshold, a user alternating "fix this typo"
  / "now harden it against concurrent access" / "small refactor" can
  cause the router to flip small/large/small on every turn, which is
  *worse* for cost than sticky escalation because each model switch
  also invalidates KV caches on the Pi side.
- Fix: T3 must specify the hysteresis rule concretely, e.g. "after an
  upgrade, stay at that tier for at least N turns unless the classifier
  confidence for a lower tier > 0.85 for two consecutive turns." Add a
  vitest case for the thrash scenario.

### B6 [MEDIUM] V1's "TS-consumability" check has no executable form
- Flagger: R1 (Completeness), R5 (Runtime Integration)
- Verification: Plan line 168 says V1 check #3 is "confirm the route-level
  classifier contract is consumable by the TypeScript router without
  re-deriving the core decision logic." There is no command. A human
  reviewer can sign off arbitrarily. Given B2, this is where the schema
  gap becomes permanent.
- Fix: Add a concrete check: `bun run --cwd pi/tests ts-node scripts/check-classifier-contract.ts`
  that shells out to `classify.py` with three canned prompts and
  validates the JSON against the schema from B2's fix.

### B7 [MEDIUM] T5 AC #3 validates JSON syntax but not the existence of the new router settings keys
- Flagger: R1 (Completeness)
- Verification: `python -m json.tool pi/settings.json > /dev/null` only
  validates JSON syntax. `pi/settings.json` is already valid JSON today
  (verified by reading it). If the T5 author forgets to add the new
  `router.effort.*` keys entirely, T5 still passes.
- Fix: Add a second check that greps for the new settings keys
  (`rg -n 'router|thinking|effort|hysteresis|caps' pi/settings.json`)
  or loads the JSON and asserts specific keys exist.

### B8 [MEDIUM] No offline / shadow-eval gate before swapping the live router
- Flagger: R6 (Cost & Efficiency)
- Verification: The plan goes straight from `V2` (integration tests
  pass) to `T5` (docs + regression tests) to done. No step runs the new
  router in shadow against the existing `logs/routing_log.jsonl` traffic
  to confirm that projected cost actually drops vs the legacy router.
  The plan's primary claim is "reduced subscription/rate-limit
  pressure" â€” that claim is never measured.
- Fix: Add a task between V2 and T5: "Replay the last N days of
  `routing_log.jsonl` through both the legacy and v3 routers, produce
  `docs/cost-shadow-eval.md` showing projected per-turn cost delta and
  catastrophic-under-routing delta. Gate on non-regression."

## Hardening Suggestions (optional improvements)

### H1 Consider shipping a Phase 0 quick-win independent of the v3 corpus
Replace `applyNeverDowngrade` with downgrade-friendly hysteresis and add a
static tier->effort mapping today. Proportional to the stated cost-first
goal; does not block on the data plan; recoverable if the data plan slips.

### H2 Pin the `HIGH_FLOOR_THRESHOLD` behavior in the migration plan
`pi/prompt-routing/router.py:61` documents `HIGH_FLOOR_THRESHOLD = 0.20`
with empirical calibration notes. The v3 plan never mentions what
happens to this floor in the new schema. Either carry it forward
explicitly or document why it is subsumed.

### H3 Specify the escalation-cooldown explicitly
R6 flagged escalation-thrash risk. After a "temporary escalation" due
to a failed tool call, the plan should specify the cooldown window
(turns or seconds) and whether a user-visible notification fires.

### H4 Add a hard cap on `xhigh` usage rather than relying on the classifier
The Handoff Notes say "Avoid forcing `xhigh` by default." Make it
enforceable: a setting `router.effort.maxLevel: "high"` that caps the
applied effort regardless of classifier output. Defensive against
corpus drift.

### H5 Version the classifier output contract
Embed `schema_version` in the classifier JSON and have the TS router
log+fallback on mismatch. Prevents silent breakage when the classifier
is upgraded without redeploying the extension.

### H6 Add a `/router-explain` command
Given the policy grows (confidence, caps, hysteresis, cooldown), a
one-shot "why did you pick this for the last turn?" command reduces
debugging cost when rate limits still hit.

### H7 Normalize terminology now in the plan itself
The plan uses "catastrophic under-routing", "HIGH->LOW inversion",
"legacy proxy", and "cheapest acceptable route" interchangeably across
sections. A glossary in the Constraints section would prevent rubric
drift across T1/T2/T5 docs.

## Dismissed Findings

- **"Missing error handling for classify.py timeout"** â€” Dismissed. Current
  code at `prompt-router.ts:153-157` already catches errors from
  `classifyAndRoute` and surfaces them via `ui.setStatus("router", "router: err")`.
  The plan preserves that surface (T3 AC #2 greps for `router-status`).
- **"SHA256 verification adds startup overhead"** â€” Dismissed. At
  `router.py:71-88` the hash is verified *once* at module import, not per
  call. Irrelevant to the <1ms steady-state budget.
- **"Plan does not specify how `labeled_history.csv` is purged"** â€” Out of
  scope. This plan depends on the training-data plan's output; corpus
  hygiene belongs there.
- **"Windows console flashing on per-prompt `pi.exec`"** â€” Dismissed as a
  plan-level concern. Pre-existing issue tracked in `CLAUDE.md` under
  "Known Issues" and has documented mitigations.
- **"Tests don't cover `/router-off` + classification race"** â€” Edge case
  requiring three simultaneous conditions (user disables mid-flight,
  fire-and-forget classify returns, subsequent turn). Below severity bar.

## Positive Notes

- The hard-prerequisite model (T0 blocks the rest on concrete artifacts
  from the upstream data plan) is cleanly specified and avoids the common
  anti-pattern of "start implementation while waiting for data."
- The plan correctly identifies that `applyNeverDowngrade` is the wrong
  default for a cost-first router. That framing (reversing the session-wide
  floor) is the most load-bearing insight in the document.
- The "Cold-Start Execution Notes" with an explicit file list and the
  execution rule for `Verify:` commands (post-task not precondition) is
  unusually good and prevents the common "acceptance check blocks the
  task that would make it pass" trap.
- Constraints already accept bounded scope (no external gateway, no
  online retraining platform). That rules out a large class of
  scope-creep suggestions a priori.
- Preserving the `/router-status`, `/router-reset`, `/router-off`,
  `/router-on` UX contract (T3 AC #2) keeps the user-facing surface
  stable across a large refactor.
