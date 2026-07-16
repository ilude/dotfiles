---
created: 2026-07-16
status: draft
completed:
---

# Plan: Harness, test, and tooling rationalization

One walkthrough covering the Pi harness rework, repository-wide test
rationalization, and quality tooling ownership. Phases are ordered for a
single pass; Phase 2 and Phase 3 do not depend on Phase 1 internals, so a
stalled task never blocks unrelated work.

## Goal

1. Pi workflow skills, agent definitions, routing, and instructions state
   goals, boundaries, and required capabilities instead of runtime snapshots.
2. Every test in the repository either protects executable behavior, a parsed
   schema, or a normalized config meaning â€” or is deleted with a recorded
   decision. One ledger reconciles the whole cleanup.
3. Code quality is guarded by pinned, repository-owned tools with a fast
   changed-file path; full suites run only at integration gates.

## Why

Most of the current prescription â€” fixed model ladders, named agents, panel
sizes, file-count routing, step recipes, prompt-wording tests â€” was written to
compensate for older models that could not be trusted to judge. Modern models
follow instructions literally, so contradictions and over-specification now
cost reasoning tokens and cause workflow churn instead of preventing it. The
wording tests lock the stale prescriptions in place, and quality tooling is
partly workstation-incidental rather than repository-owned.

## Evidence base

Read before executing. All file:line claims below come from these reports:

- `.specs/workflow-test-rationalization/research/repo-state.md` â€” hardcoded
  inventories, duplicated rules, prose/wording tests, compensation-vs-durable
  classification.
- `.specs/workflow-test-rationalization/research/pi-capabilities.md` â€” what
  upstream Pi provides (model registry metadata, discovery, context loading,
  extension hooks) vs. what is repository-owned (agents, subagents, routing).
- `.specs/workflow-test-rationalization/research/prompting-guidance.md` â€”
  primary-source prompting principles; its anti-patterns checklist is the
  audit criteria for every rewritten prompt.

## Boundaries

- **Client scope:** Pi surfaces only. Do not modify `claude/shared/`,
  `claude/commands/`, `opencode/`, or `copilot/` â€” the Claude client keeps its
  own separate command system by explicit user decision.
- Preserve public command names and argument shapes (`/plan-it`, `/do-it`,
  `/review-it`, `/prd-it`, `/improve`, subagent tool schema). Explicit user
  model/agent overrides remain authoritative.
- Every test deletion resolves to a row in `.specs/rationalization/ledger.md`.
  Behavior replacement precedes deletion of real protection: the replacement
  must fail against an intentional regression before the old check goes.
  Prose-only wording tests need no replacement â€” classify and delete.
- Text inspection in a test is legitimate only when runtime code parses that
  text or the token is an external protocol.
- A static grep test is nearly free; a spawned-shell test is not. Do not
  replace a cheap grep with a slow or flaky execution test â€” prefer explicit
  accepted loss when a behavior test is not cheap and deterministic.
- Keep semantic checks that parse structured config and compare meaning:
  WSL / main Dotbot link parity (`test_config_patterns.py:841-868`), CI
  executable modes and referenced paths, root package-lock guard.
- Preserve WSL / Git Bash / MSYS2 semantics; platform-specific behavior runs
  on its supported platform or a deterministic fixture, never inferred from
  regex presence.
- Do not build new frameworks. Use `ctx.modelRegistry`, existing discovery,
  and `pi/lib/model-routing.ts`. One owned policy point per decision.
- A quality tool becomes blocking only after fresh documented setup provides
  it and baseline debt is known; each tool guards its own defect class, never
  prose. No silent validator skips, no auto-install.
- Do not change security or permission semantics (damage-control, permissions,
  hooks).
- Pi is pnpm-only; Python tooling is uv-based. LF endings, ASCII punctuation.
- Commit each completed, validated slice with a conventional message and a
  `CHANGELOG.md` entry, so any task rolls back path-scoped. Do not push.

Workers and models are resolved at execution time from what is available; no
task prescribes one. Tasks marked parallel in the dependency graph may be
dispatched to subagents when that genuinely saves wall time; work directly
when coordination overhead would exceed the gain.

## Phase 0 â€” Inventory

### T1: Build the test decision ledger

Collect the full test inventory: `uv run pytest --collect-only -q` for Python
(all rootdir suites, including hook tests), Vitest listing under `pi/`, plus
any other test entrypoints found in `Makefile`/CI. Identify every test that
reads tracked prose, prompts, templates, configuration, or source and asserts
literal content, presence, or shape without executing behavior. Record each in
`.specs/rationalization/ledger.md` with: test ID, file, what it nominally
protects, runtime consumer (verified in code, not assumed), decision (keep /
replace-with-behavior / delete / accepted-loss), one-line rationale, and the
task that executes it. Reconcile against the prior audit's 89 strict / 106
broad counts â€” explain any delta rather than forcing the numbers.

Done when: every static-content candidate has exactly one ledger row and
decision, and no decision claims an unverified runtime consumer.

## Phase 1 â€” Pi harness rework

### T2: Rewrite workflow skills and templates

Rewrite `pi/skills/workflow/plan-it.md`, `do-it.md`, `prd-it.md` (if it shares
the same disease), and `templates/plan-template.md` to the standard already
set by the new `review-it.md`: objective, hard boundaries, evidence and
validation requirements, definition of done. Apply the anti-patterns checklist
as audit criteria. Remove: file-count complexity ladders, mandatory
Model/Agent plan columns (replace with an optional required-capability field),
phantom reviewer personas (`do-it.md:125` names three agents that do not
exist), reviewer counts, and duplicated delegation recipes.

Done when: no workflow skill or template names a model, model tier, agent
(except as a runtime-resolved example), panel size, or file-count threshold;
every checklist anti-pattern is absent or justified in the diff notes.

### T3: Trim Pi instruction files to judgment, safety, and facts

Apply the pi-capabilities report's "prose that duplicates runtime capability"
table: stop restating skill/extension/context discovery mechanics in
`pi/README.md`, `pi/PI-INSTRUCTIONS.md`, `pi/AGENTS.md`, and
`pi/extensions/pi-instructions.ts`. Replace named-model delegation gates
(`pi/PI-INSTRUCTIONS.md:9`, `pi/README.md:622-624`) with capability terms.
Remove rules from `CLAUDE.md` that `AGENTS.md` already owns (pnpm policy
restatement); keep pointers, not paraphrases. Root `AGENTS.md` remains the
owner of repository invariants.

Done when: each retained rule has one owning file; no Pi instruction restates
what Pi discovers or enforces at runtime; byte counts before/after recorded as
a context-load proxy.

### T4: Consolidate the agent roster and delete the org-chart taxonomy

Delete `roleType`, `reportsTo`, `leads`, and `routingUse` from all
`pi/agents/*.md` frontmatter and from the parser
(`pi/extensions/subagent/agents.ts`). Merge agents that differ only by model
binding (`coding-light/medium/heavy`, `validator/validator-heavy`,
lead/orchestrator variants, `skill-review-*` if the deterministic review
protocol allows). An agent file survives only if its role, tools, or
boundaries genuinely differ from every other agent. Keep model frontmatter
only as a default hint; routing (T5) owns selection. Update
`pi/lib/skill-review.ts:602,628-641` for whatever roster survives.

Done when: every remaining agent has a distinct role/tool/boundary rationale;
the parser accepts only fields the launcher consumes;
`agent-role-semantics.test.ts` is replaced by a behavior test of
parse-to-launch (frontmatter in, spawn flags out) with no org-chart
assertions.

### T5: One owned routing policy

Consolidate model selection into `pi/lib/model-routing.ts` as the single
policy point, resolving against `ctx.modelRegistry.getAvailable()` metadata
(context window, reasoning/thinking levels, cost). Remove the duplicate
hardcoded ladder in `pi/extensions/fable.ts:13-18` and its pinned-ID regexp;
`/fable` and `/foreman` keep their explicit user-facing model choices but
express them through the resolver. Named-model preferences that remain (e.g.
the Codex premium set in `prompt-router.ts`) live in one clearly-marked policy
table in the resolver module, not scattered across extensions.

Done when: exactly one module maps capability needs to model selection; zero,
one, and many available-model fixtures resolve deterministically; missing
capability fails with a clear diagnostic; explicit override wins; existing
subagent/routing tests pass against the consolidated path.

### T6: Align Pi tests with behavior

Execute the ledger decisions for Pi tests: delete remaining prompt/wording
assertions (`workflow-prompts.test.ts` literals beyond dispatch behavior,
`runtime-smoke.test.ts` source-shape checks â€” replace with a fixture-driven
extension-load test if cheap, else accepted loss, `tool-reduction.test.ts`
source greps â€” extend the existing process-behavior tests to cover Windows
invocation options via mocked spawn, and the prompt-wording case in
`workflow-commands-pure.test.ts:310-318`). Keep tests that exercise runtime
output (`pi-instructions`, `skill-prompt`, `review-artifact`, dispatch,
subagent). Mark each ledger row executed.

Done when: no Pi test passes or fails on unparsed prose; focused suites and
typecheck pass; the Pi section of the ledger is fully executed.

## Phase 2 â€” Python test cleanup

### T7: Split test_config_patterns.py

Execute the ledger decisions for `test/test_config_patterns.py` (65 functions,
~150 parametrized cases). Keep parsed-config semantic checks. Where
startup/env/path/plugin behavior is genuinely load-bearing and cheaply
testable (deterministic fixture, sub-second), replace with execution tests
grouped by behavior. Delete cosmetic source greps outright.

Done when: no retained case exists solely to match source text; the focused
suite runs faster than baseline; ledger rows for this file are executed.

### T8: Behavior-test the browser wrapper and narrow the CI contract

`test_agent_browser_brave.py`: exercise wrapper argument construction and
shutdown against a fake process; drop README-mention assertions.
`test_ci_contract.py`: keep the deployment contracts but stop regex-parsing
shell out of workflow YAML where a structured check is available. Execute any
remaining Python/hook ledger rows identified in T1.

Done when: wrapper safety is proven by behavior, not string absence; CI
contract checks parse structure, not prose; no Python-side ledger row remains
unexecuted.

## Phase 3 â€” Quality tooling

### T9: Pin and configure tools

Add Biome as a pinned Pi devDependency with config, only after verifying it
works under pnpm with the current TypeScript. Add a non-mutating shfmt check.
Decide Lizard ownership: pin via uv tooling or document the installer as
authoritative. Establish baseline-debt counts before anything new blocks.

Done when: an isolated fresh setup provides every blocking tool; each tool
fails an intentional bad fixture of its defect class with an actionable
diagnostic.

### T10: One changed-file validation entrypoint

Expose one repository CLI (reusing the quality-validation config/runner in
`claude/hooks/quality-validation/` where practical) that runs the applicable
pinned validators for an explicit file list, with deterministic routing,
bounded parallelism, and stable exit codes.

Done when: fixtures for Python, shell, Pi TypeScript, unsupported files,
missing tool, paths with spaces, and multiple failures all behave as
documented.

### T11: Split Make targets

`make check-changed` (changed-file quality), `make check-fast` (fast static
quality), existing focused test entrypoints, `make check` (full). Update help
text; no duplicated work within one invocation.

Done when: command graph and a three-run median timing comparison show
distinct scopes and at least one faster routine path.

## Phase 4 â€” Reconciliation and final validation

### T12: Close the ledger and validate the whole

Verify every ledger row is executed or explicitly deferred with rationale;
recollected test counts match the ledger arithmetic; a fresh sweep finds no
remaining static-content test lacking a decision. Exercise the real
entrypoints (`/plan-it`, `/do-it`, `/review-it` against a scratch plan
fixture) confirming dispatch, routing, and mutation boundaries. Run
`make check-pi-extensions`, then `make check` once. Record before/after
instruction byte counts, test counts, and `make test-quick` wall time at the
bottom of the ledger.

Done when: ledger closed, both aggregates pass, and measurements are recorded
with any slowdown tied to a named distinct protection.

## Dependency graph

```text
T1 (ledger) ----------------------------.
Phase 1: T2, T3 (parallel) ; T4 -> T5 ; |--> T6 (needs T1-T5)
Phase 2: T7, T8 (parallel, need T1 only)|
Phase 3: T9 -> T10 -> T11 (independent) |
Phase 4: T12 (needs all)
```

Phases 1-3 can interleave; only T6 and T12 have cross-phase dependencies.

## Out of scope

- Claude/OpenCode/Copilot command bodies (kept separate by user decision;
  known leftovers: fixed-panel prose in `claude/shared/review-it-instructions.md`,
  validation-policy conflict with root `AGENTS.md`, hardcoded models in
  `opencode/agents/*.md`).
- Workflow-friction instruction-context capture (deferred follow-up).
- Hook and directory-local instruction prose outside Pi.
- Making Lizard/Biome block historical files before baseline debt is measured.

## Execution status

- **Classification:** planned, not started
- **Next:** T1; then T2/T3/T7/T8/T9 as capacity allows
- **Resume:** `/do-it .specs/rationalization/plan.md`
