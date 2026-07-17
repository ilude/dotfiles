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
   schema, or a normalized config meaning - or is deleted with a recorded
   decision. One ledger reconciles the whole cleanup.
3. Code quality is guarded by pinned, repository-owned tools with a fast
   changed-file path; full suites run only at integration gates.

## Why

Most of the current prescription - fixed model ladders, named agents, panel
sizes, file-count routing, step recipes, prompt-wording tests - was written to
compensate for older models that could not be trusted to judge. Modern models
follow instructions literally, so contradictions and over-specification now
cost reasoning tokens and cause workflow churn instead of preventing it. The
wording tests lock the stale prescriptions in place, and quality tooling is
partly workstation-incidental rather than repository-owned.

## Evidence base

Read before executing. All file:line claims below come from these reports:

- `.specs/workflow-test-rationalization/research/repo-state.md` - hardcoded
  inventories, duplicated rules, prose/wording tests, compensation-vs-durable
  classification.
- `.specs/workflow-test-rationalization/research/pi-capabilities.md` - what
  upstream Pi provides (model registry metadata, discovery, context loading,
  extension hooks) vs. what is repository-owned (agents, subagents, routing).
- `.specs/workflow-test-rationalization/research/prompting-guidance.md` -
  primary-source prompting principles; its anti-patterns checklist is the
  audit criteria for every rewritten prompt.

## Boundaries

- **Client scope:** Pi surfaces only. Do not modify `claude/shared/`,
  `claude/commands/`, `opencode/`, or `copilot/` - the Claude client keeps its
  own separate command system by explicit user decision.
- Preserve public command names and argument shapes (`/plan-it`, `/do-it`,
  `/review-it`, `/prd-it`, `/improve`, subagent tool schema). Explicit user
  model/agent overrides remain authoritative.
- Every test deletion resolves to a row in `.specs/rationalization/ledger.md`.
  Behavior replacement precedes deletion of real protection: the replacement
  must fail against an intentional regression before the old check goes.
  Prose-only wording tests need no replacement - classify and delete.
- Text inspection in a test is legitimate only when runtime code parses that
  text or the token is an external protocol.
- A static grep test is nearly free; a spawned-shell test is not. Do not
  replace a cheap grep with a slow or flaky execution test - prefer explicit
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

## Decision protocol

Already decided - do not relitigate or ask again:

- Claude/OpenCode/Copilot command systems stay separate from Pi.
- The org-chart taxonomy (`roleType`, `reportsTo`, `leads`, `routingUse`) is
  deleted, not enforced.
- The agent roster consolidates aggressively (subject to the T4 approval gate).
- Friction instruction-context capture is deferred; do not build it here.
- Accepted loss beats a slow or flaky behavior test.

Open judgment calls (test classifications, fixture design, which prose line
survives a trim, tool configuration details): decide, then record the decision
and one-line rationale in the ledger or the slice's CHANGELOG entry. Do not
silently skip a task element because it was ambiguous - record what was
ambiguous and what you chose.

Stop and ask the user before: changing any public command name or argument
shape, deleting a user-facing feature (including the deterministic skill-review
protocol), acting where the worktree or code contradicts this plan's claims, or
executing the T4 roster deletion without the approval gate below.

Gate mechanics: when a stop-and-ask condition is hit, write the question or
proposal to a file under `.specs/rationalization/` (the T4 gate uses
`roster.md`), set the blocker in Execution status, and ask the user directly.
Approval is the user's explicit reply or their edit of the proposal file; a
gate answered in a previous session counts if the proposal file is unchanged.
Never proceed past a gate on inferred or assumed consent.

Session continuity: work in ledger/checklist order, and after each completed
slice update the Execution status checklist and commit before starting the
next task. On starting or resuming a session, read Execution status and the
ledger first and continue from the recorded state - do not re-derive progress
from the worktree or re-do completed tasks.

## Phase 0 - Inventory

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
broad counts - explain any delta rather than forcing the numbers.

Done when: every static-content candidate has exactly one ledger row and
decision, and no decision claims an unverified runtime consumer.

## Phase 1 - Pi harness rework

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
`pi/lib/skill-review.ts:602,628-641` for whatever roster survives; if merging
the `skill-review-*` trio would break its deterministic dispatch, keep the
trio and note why rather than deleting the protocol.

**Approval gate:** before deleting any agent file, write the proposed roster
to `.specs/rationalization/roster.md` - surviving agents with their
role/tool/boundary rationale, plus an old-name to new-name mapping - and get
explicit user approval. After approval, update every reference to old names
(skills, docs, `skill-review.ts`, tests) in the same slice.

Done when: roster approved; every remaining agent has a distinct
role/tool/boundary rationale;
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

Do not invent a new capability taxonomy. The existing request vocabulary -
subagent `modelSize` (`small`/`medium`/`large`) and the router's
`nano`/`mini`/`core`/`large`/`max` mapping - is a durable runtime interface
(repo-state report, "Hardcoded runtime inventories"); keep it as the request
schema and change only how it resolves to concrete models.

Done when: exactly one module maps capability needs to model selection; zero,
one, and many available-model fixtures resolve deterministically; missing
capability fails with a clear diagnostic; explicit override wins; existing
subagent/routing tests pass against the consolidated path.

### T6: Align Pi tests with behavior

Execute the ledger decisions for Pi tests: delete remaining prompt/wording
assertions (`workflow-prompts.test.ts` literals beyond dispatch behavior,
`runtime-smoke.test.ts` source-shape checks - replace with a fixture-driven
extension-load test if cheap, else accepted loss, `tool-reduction.test.ts`
source greps - extend the existing process-behavior tests to cover Windows
invocation options via mocked spawn, and the prompt-wording case in
`workflow-commands-pure.test.ts:310-318`). Keep tests that exercise runtime
output (`pi-instructions`, `skill-prompt`, `review-artifact`, dispatch,
subagent). Mark each ledger row executed.

Done when: no Pi test passes or fails on unparsed prose; focused suites and
typecheck pass; the Pi section of the ledger is fully executed.

## Phase 2 - Python test cleanup

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

## Phase 3 - Quality tooling

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

## Phase 4 - Reconciliation and final validation

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

This section is the executor's working state and the single resume point.
Rules for maintaining it:

1. **Starting a task:** set its status to `in-progress` with a one-line note
   naming the next concrete step. Update the note whenever the next step
   changes, so an interrupted session resumes mid-task, not just mid-plan.
2. **Finishing a task:** mark `[x]` only after its done-when is verified;
   replace the note with the commit hash and any recorded decisions.
3. **Blocked:** set `blocked: <reason>` and mirror it under **Current
   blocker**.
4. **Ending any session** (or before context compaction): confirm every
   in-progress note reflects reality, then commit this plan file even if the
   task is unfinished - the note is the checkpoint.
5. **Resuming:** read this section and the ledger first; trust recorded state
   over re-derivation. Never re-do a `[x]` task.

Status values: `pending` | `in-progress: <next step>` | `blocked: <reason>` |
`done: <commit>`.

### Task checklist

- [x] T1: test decision ledger - done: 95efc55
- [x] T2: workflow skills and templates - done: 772d4c0
- [x] T3: Pi instruction trim - done: 1e57024
- [x] T4: agent roster consolidation - done: 04c84c7
  - [x] roster.md proposal written
  - [x] user approval received (gate - never inferred)
  - [x] deletions and old-name reference updates executed
- [x] T5: routing policy consolidation - done: 48eb3c5
- [x] T6: Pi test alignment - done: dea299b
- [x] T7: test_config_patterns split - done: 085b069
- [x] T8: browser wrapper and CI contract - done: 8a0ab09
- [x] T9: pin quality tools - done: 21e12e1, 07a2fad
- [x] T10: changed-file validation entrypoint - done: 7344bd2, 887d54d
- [x] T11: Make target split - done: 475807f
- [x] T12: ledger close and final validation - done: 5b50b30, d417fd5
  - [x] ledger closed: every row executed or explicitly deferred
  - [x] entrypoint fixtures exercised (/plan-it, /do-it, /review-it)
  - [x] `make check-pi-extensions` passed
  - [x] `make check` passed
  - [x] before/after measurements recorded in ledger

### State

- **Classification:** implementation and validation complete; archive preflight passed
- **Current blocker:** none
- **Last completed wave/gate:** T12 final repository aggregate and evidence audit
- **Next:** move this plan and owned siblings to `.specs/archive/rationalization/`
- **Completed work:** T1-T12 complete; 109/109 ledger rows executed; workflow fixtures use actual skill files and scratch plans; final aggregates pass
- **Commands/results:** final `make check-pi-extensions` passed 1,313 tests with one skip; repaired final `make check` passed; independent static sweep found no uncovered candidates; archive path is collision-free
- **Remaining checks:** archive move and archived-state commit only
- **Worktree note:** untracked `.specs/rationalization-phase2/` and `.specs/rationalization-phase3/` are excluded from this plan and archive; one import-only Ruff repair was applied to the phase2 research script so the exact aggregate could run
- **Exact user action:** none
- **Resume:** not applicable after the archive move

### Current execution telemetry

- **Episode:** schema version 1; episode ID `2026-07-16T20-47-09Z-do-it-rationalization`; command `do-it`; artifact `.specs/rationalization/plan.md`; repository root `C:/Users/mglenn/.dotfiles`; started `2026-07-16T20:47:09Z`; completed `2026-07-16T20:54:36Z`; status `not_complete`; classification `blocked-by-failure`; archive status `active`; redaction status `no_sensitive_output`.
- **T7 phase:** phase ID `T7`; type `implementation`; started `2026-07-16T20:47:09Z`; completed `2026-07-16T20:54:36Z`; status `passed`; evidence commit `085b069` and `.specs/rationalization/ledger.md`.
- **T7 command events:** baseline `uv run pytest test/test_config_patterns.py -q` exited 0; focused replacement exited 0; intentional-regression fixture exited 1 as expected; `make test-quick` exited 0; Ruff checks and `git diff --check` exited 0.
- **Manual gate decision:** not required; risk low; blast radius personal-repo; rollback easy; local reversible test-only change covered by automated behavior and intentional-regression evidence.
- **Archive:** not attempted because required checklist items T6 and T8-T12 remain pending.
- **Post-run eval:** checklist and evidence agree; T7 passed; no manual or deployment gate remains from this slice; friction tag `session-capacity`; missing evidence is limited to unexecuted T6 and T9-T12; improvement candidate is to keep future slices bounded to one validated commit; confidence high from direct command and commit evidence.
- **T8 phase:** phase ID `T8`; type `implementation`; status `passed`; evidence commit `8a0ab09`, `.specs/rationalization/t8-instruction-linkage.md`, and the T8 ledger rows.
- **T8 command events:** focused browser/capture suite exited 0 with 5 tests; `make test-ci-contract` exited 0 with 8 tests; intentional-regression fixture exited 1 with the expected two failures; Ruff, formatting, and `git diff --check` exited 0.
- **T8 manual gate:** required because current repository ownership contradicted the stale symlink contract; risk low; blast radius personal-repo; rollback easy; user selected deletion of the stale test; gate passed.
- **T6 phase:** phase ID `T6`; type `implementation`; started `2026-07-16T23:10:53Z`; completed `2026-07-16T23:13:49Z`; status `passed`; evidence commit `dea299b` and the T6 ledger rows.
- **T6 command events:** focused Pi suite exited 0 with 54 tests; `pnpm run typecheck` exited 0; intentional `windowsHide: false` regressions exited 1 with the expected two failures; restored reducer suite exited 0 with 6 tests; `git diff --check` exited 0.
- **T6 manual gate:** not required; risk low; blast radius personal-repo; rollback easy; local reversible test-only changes covered by runtime behavior and intentional-regression evidence.
- **T6 archive:** not attempted because required checklist items T9-T12 remain pending.
- **T6 post-run eval:** checklist and evidence agree; no manual or deployment gate remains; friction tag `none`; missing evidence is limited to unexecuted T9-T12; no improvement candidate; confidence high from focused runtime checks, regression proof, typecheck, and commit evidence.
- **Current episode:** schema version 1; episode ID `2026-07-16T23-10-53Z-do-it-rationalization`; command `do-it`; artifact `.specs/rationalization/plan.md`; repository root `C:/Users/mglenn/.dotfiles`; started `2026-07-16T23:10:53Z`; completed `2026-07-16T23:31:01Z`; status `not_complete`; classification `blocked-by-failure`; archive status `active`; redaction status `no_sensitive_output`.
- **T9 phase:** phase ID `T9`; type `implementation`; depends on none; started `2026-07-16T23:15:00Z`; completed `2026-07-16T23:31:01Z`; status `failed`; evidence commit `21e12e1`, `CHANGELOG.md`, and independent validator audit.
- **T9 command events:** `cd pi && pnpm install --frozen-lockfile && pnpm exec biome --version && pnpm run typecheck` exited 0; quality-hook focused suite exited 0 with 46 tests; installer syntax and PowerShell parse exited 0; scratch Biome, shfmt, and Lizard bad fixtures each exited 1 as expected; independent evidence audit recorded the unresolved ownership gaps.
- **T9 manual gate:** not required; risk low; blast radius personal-repo; rollback easy; local reversible tooling changes have no deployment or shared-user impact.
- **Current archive:** not attempted because T9-T12 and final gates remain incomplete.
- **Current post-run eval:** classification `blocked-by-failure`; checklist correctly leaves T9-T12 open; archive status `active`; friction tags `fresh-install-ownership` and `evidence-durability`; missing evidence is a repository-owned shfmt source, pinned Biome resolution in the shared validator, and durable bad-fixture coverage; improvement candidate is to make T10's runner the single repository-owned tool resolver; independent audit confidence high from direct file and git evidence.
- **T9 repair phase:** phase ID `T9-repair`; type `implementation`; depends on `T9`; status `passed`; evidence commit `07a2fad` and quality-hook semantic config test.
- **T9 repair command events:** focused quality-hook suite exited 0 with 47 tests; pinned Biome 2.5.3 and Pi typecheck exited 0; `git diff --check` exited 0. The earlier bad-fixture command recorded Biome, shfmt, and Lizard exit 1 as expected.
- **T9 decision:** shfmt remains nonblocking while 12-file baseline debt exists; tracked Windows and WSL setup provision it, so exact fresh-install pinning applies only before it becomes blocking. Biome resolves through `pnpm --dir {project_root} exec biome`; Lizard is exact-pinned by the tracked installers.
- **T9 gate:** passed; no manual or deployment gate required; risk low; blast radius personal-repo; rollback easy.
- **T10 phase:** phase ID `T10`; type `implementation`; depends on `T9`; status `passed`; evidence commits `7344bd2` and `887d54d` plus focused CLI tests.
- **T10 command events:** exact `scripts/quality-check` invocation exited 0 for Python, shell, and Pi TypeScript inputs; no-argument usage exited 2; focused quality-hook suite exited 0 with 51 tests; Ruff, format check, shell syntax, executable-mode check, and `git diff --check` exited 0.
- **T10 manual gate:** not required; risk low; blast radius personal-repo; rollback easy; local deterministic CLI only.
- **T11 phase:** phase ID `T11`; type `implementation`; depends on `T10`; status `passed`; evidence commit `475807f`, Make dry-run graph test, and `.tmp/rationalization/t11/` timing logs.
- **T11 command events:** `make check-changed` exited 0; `make check-fast` exited 0; focused CI-contract suite exited 0 with 9 tests; focused Pi repair suites exited 0 with 28 tests; three successful `make check` runs exited 0 with median 167466 ms; `git diff --check` exited 0.
- **T11 repair evidence:** Pi dependency linking now resolves from the checked-out repository; stale task model and secret-review fixtures were aligned with T5 behavior; a full-suite concurrency failure in task ownership passed immediately in isolation and the next aggregate run, so no implementation change was made for that nondeterministic test.
- **T11 manual gate:** not required; risk low; blast radius personal-repo; rollback easy; local command and test changes only.
- **T12 phase:** phase ID `T12`; type `validation`; depends on `T1`-`T11`; started `2026-07-17T00:30:00Z`; completed `2026-07-17T01:15:37Z`; status `passed`; evidence commits `5b50b30` and `d417fd5`, `.specs/rationalization/ledger.md`, and `.tmp/rationalization/t12/` logs.
- **T12 command events:** Pytest collection exited 0 with 1,025 tests; Vitest collection recorded 1,314 tests including one skip; workflow dispatch fixture exited 0 with 4 tests; private archive behavior suite exited 0 with 4 tests; final `make check-pi-extensions` exited 0 with 1,313 passed and one skipped; initial final `make check` exited 2 on a load-dependent task-await fixture; focused task suite exited 0 with 26 tests after synchronization repair; repaired final `make check` exited 0.
- **T12 evidence decisions:** 109 ledger rows are executed; instruction bytes decreased 73,445 to 68,559; Pytest decreased 1,222 to 1,025; Vitest decreased 1,334 to 1,314; `make test-quick` decreased 15,152 ms to 1,782 ms.
- **T12 manual gate:** not required; risk low; blast radius personal-repo; rollback easy; automated fixture and aggregate evidence covers local reversible changes.
- **T12 independent eval:** initial final audit found stale checklist state and a mocked-fixture gap; checklist state is now reconciled and workflow tests read actual skill files against scratch plan paths. The runnable-test arithmetic is net -19 plus one fewer skipped test, matching net -20. Final static sweep found no uncovered candidate. Friction tags are `state-drift`, `repair-loop`, `nondeterministic-test`, and `evidence-gap-resolved`; no factual completion inconsistency remains; confidence high.
- **Archive preflight:** passed; `.specs/archive/rationalization/` does not exist, all owned siblings are present, required gates pass, and untracked phase2/phase3 artifacts are outside the move.
