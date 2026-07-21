---
created: 2026-07-21
status: draft
completed:
---

# Plan: Port rationalization/phase3-5 back to main

The `rationalization/phase3-5` branch (44 commits, built 2026-07-17 by the
overnight /loop run) was never merged. Main has since moved through the
anti-over-engineering campaign (2026-07-18 to 2026-07-21): simplified
guidance (`b1445489`, `4a6e3357`, `eafed4a4`, `e6cd7f35`), practical Biome
policy (`17146c28`), quality gates, and the damage-control pivot to
Pi-native rules (`76b42a48`, `bd26351e`, `6ffdaf2f`) with Pi's own eval
telemetry and shadow judge. This plan ports the branch's capabilities onto
main without regressing any of that.

## Decisions (user, 2026-07-21 - do not relitigate)

- Drop the phase 5 parity apparatus entirely. Pi-native damage control on
  main stands ("pi's rules are the definitive ones"). The 65-divergence
  decision is moot.
- Decision logging: port the Claude side only. Pi keeps main's eval
  telemetry (`pi/lib/damage-control-eval.ts`). Two schemas coexist.
- Port phase 4 routing outcome sampling, rebased onto main's current
  `pi/lib/model-routing.ts`.
- Port shape: merge into an integration branch and fix, not cherry-pick.
- Phase 5 T3 closes as tool-delivered. The applied-proposal measurement
  waits for about two weeks of real Claude decision rows after landing,
  then a `/dc-audit` run and a user-selected proposal. No fixture
  application.
- Phase 5 T4 is declined for now, superseded by main's shadow judge.
  Revisit only if decision-log data shows plan-run asks still dominate.

## Decision protocol

Stop and ask the user before:

- changing any allow/ask/block outcome or any Pi damage-control file
  beyond taking main's side in the merge;
- adding guidance prose beyond the exact re-add text quoted in this plan;
- adding any limit, cap, or termination condition not present on main or
  the branch;
- resolving a conflict in a way not covered by the policy table below.

Do not relitigate the four decisions above. Do not run repeated broad
review passes; validate with the specific checks named per task.

## Port inventory

Port (branch capability code, with tests):

- Phase 3, all of it: background completion notifications
  (`pi/extensions/tasks/execution.ts`), continuable subagents
  (`pi/extensions/subagent/index.ts`), cross-client worktree occupancy
  leases (`pi/extensions/agent-instances.ts`,
  `scripts/agent_instance_lease.py`, `claude/hooks/agent_instances.py`,
  `claude/claude-status`, `claude/settings.json` hook wiring),
  `isolation`/`memory` metadata removal (parser in
  `pi/extensions/subagent/agents.ts` plus 16 agent files - still present
  on main, still unenforced), opt-in DAG drain (`pi/lib/task-scheduler.ts`,
  `task-registry.ts` additions, `tool-capabilities.ts`, `tasks.ts`,
  `execution.ts`), schema-validated subagent output (`subagent/index.ts`,
  `typed-agent.ts` validation helpers).
- Phase 4: `pi/scripts/plan-lint`, routing sampling additions to
  `model-routing.ts`, `pi/scripts/improvement-report.py` plus
  `scripts/improvement-report` wrapper, `/improve` entry in
  `workflow-commands.ts`, `.specs/improvement-reports/2026-07-17.md`.
- Phase 5, Claude side only: `shared/damage-control/decision.schema.json`,
  `shared/damage-control/decision_log.py`, `shared/damage-control/audit.py`,
  `claude/hooks/damage-control/decision_audit.py`, the branch's logging
  hunks in `bash-tool-damage-control.py`, `edit-tool-damage-control.py`,
  `write-tool-damage-control.py`, `tests/conftest.py`,
  `tests/test_decision_audit.py`, and `claude/commands/dc-audit.md`.
  Python tests: `test/test_damage_control_decision_log.py`,
  `test/test_damage_control_audit.py`, `test/test_agent_instance_lease.py`,
  `test/test_claude_agent_instances.py`, `test/test_plan_lint.py`,
  `test/test_improvement_report.py`.
- `pi/extensions/workflow-friction-review.ts` branch changes (compressed
  child-session support from phase 3 T2). Keep them only where they do not
  reverse main's `0f315d91` (tracking requires explicit intent).
- `.specs` bookkeeping from the branch: `rationalization-phase3` moved to
  archive, phase 4/5 plan-state updates,
  `.specs/rationalization-phase5/reports/2026-07-17.md`, friction-scan
  script changes.

Drop (superseded by main) - exact paths:

- `pi/lib/damage-control-coverage.ts`
- `pi/tests/damage-control-coverage.test.ts`
- `pi/scripts/damage-control-claude-oracle.py`
- `shared/damage-control/coverage-waivers.json`
- `pi/lib/damage-control-decision-log.ts`
- `pi/tests/damage-control-decision-log.test.ts`
- All branch-side changes to `pi/extensions/damage-control.ts` and
  `pi/tests/damage-control.test.ts` (take main's versions byte-for-byte)

CHANGELOG rule: keep branch entries that describe ported work, placed in
date order beneath main's newer entries; delete branch entries that
describe dropped work (coverage runner, Pi decision log, canonical policy
source). No entry may describe code that is not on the integration branch
after T1.

## Conflict resolution policy

Six files hard-conflict (verified via `git merge-tree` 2026-07-21). Main's
fixes that must survive the combines, by commit: `8fa5c7e8` (agent
cancellation and JSON extraction), `1a89a73b` (child launch error
reporting), `bbae0eac` (workspace-scoped task listings), `066cd9ac`
(explorer agent), `0f315d91` (explicit tracking intent).

| File | Resolution |
|------|-----------|
| `pi/extensions/damage-control.ts` | Main wins byte-for-byte |
| `pi/extensions/subagent/agents.ts` | Main's content + branch's isolation/memory parser removal |
| `pi/extensions/subagent/index.ts` | Main's cancellation/error fixes + branch's continuation, notification, and outputSchema code |
| `pi/extensions/tasks.ts` | Main's workspace scoping + branch's drain action |
| `pi/skills/workflow/do-it.md` | Main's 53-line version as base; append only the re-add text below |
| `pi/skills/workflow/plan-it.md` | Main's version as base; insert only the re-add text below |

Re-add text - exact, no additions or expansions. Main's do-it.md bans
wave narratives; the branch's four dense paragraphs are NOT re-applied.
Only these sentences are added:

do-it.md, in the section covering plan reading/validation:

> Run `python ~/.dotfiles/pi/scripts/plan-lint <plan-path>` before
> dispatch and again before the final report; a nonzero result means fix
> the named plan-state violations before proceeding.

do-it.md, in the section covering execution:

> Materialize the unchecked breakdown as one graph-aware `task batch`
> call and start `task drain`; react to completion notifications instead
> of polling. Copy a starvation result into plan state with the named
> failed dependencies.

plan-it.md, appended to the "smallest executable task breakdown"
sentence:

> Never assign overlapping same-file write scopes to parallel tasks;
> combine them or add a dependency edge.

Auto-merged files are not trusted blind. Audit list for T2:
`pi/AGENTS.md`, `pi/README.md`, `CLAUDE.md`, `CHANGELOG.md`,
`workflow-commands.ts`, `workflow-friction-review.ts`,
`claude/settings.json`, `claude/claude-status`, `claude/commands/dc-audit.md`,
`.gitignore`, the 16 agent files, and the three Claude damage-control
hook files.

## Boundaries

- No regression of main's anti-over-engineering changes: no reintroduced
  mandates, turn limits, or verification ceremony. When branch prose and
  main prose disagree, main wins.
- Damage-control semantics on main are untouched except the Claude-side
  logging additions, which are fail-open and change no allow/ask/block
  outcome.
- Pi tests run under pnpm (`make check-pi-extensions`); Claude hook and
  repo Python tests run under bare `python -m pytest`.
- Commit per validated slice; merge to main and push only when the user
  says so.

## Tasks

### T1: Integration branch and merge

Create `port/rationalization-345` from main, merge
`rationalization/phase3-5`, resolve the six conflicts per the policy
table, delete the seven dropped paths, and apply the CHANGELOG rule, all
within the merge resolution so one coherent merge commit lands.

Done when: merge commit exists; `git show` confirms the dropped paths are
absent; the six conflict files match the policy table.

### T2: Audit auto-merges

Diff every file in the audit list against `main` (`git diff main -- <file>`
on the integration branch). For each retained branch-side hunk, record a
one-line justification in the T2 commit message; revert any hunk that
reintroduces prescription main removed or reverses a commit named in the
policy section. This is one pass; do not re-review files already
justified.

Done when: every audit-list file has its hunks justified in the commit
message or reverted.

### T3: Rebase-sensitive code checks

The branch code was written against 07-17 interfaces. Three named seams,
one specific check each:

1. Routing sampling on main's provider-auth-updated `model-routing.ts`:
   `pi/tests/model-routing.test.ts` passes and a rate-0 configuration
   resolves identically to main (existing branch test covers this; run it).
2. Drain and notifications with main's workspace-scoped listing:
   `pi/tests/task-scheduler.test.ts` and `pi/tests/task-execution.test.ts`
   pass unmodified.
3. Continuation with main's cancellation fixes:
   `pi/tests/subagent.test.ts` passes unmodified.

Then the full suite: `make check-pi-extensions` and
`python -m pytest test/ claude/hooks/damage-control/tests/`.

Done when: all named suites pass; any test that had to be modified is
listed with the interface change that forced it.

### T4: Claude-side decision logging validation (requires the user)

The ask-approved and ask-denied rows require a human answering real
permission prompts. Do not simulate them. Prepare the fixture commands,
then ask the user to run one Claude session producing: an allow, an
ask-approved, an ask-denied, and a block. Separately verifiable without
the user: unwritable log directory does not block the tool call
(fail-open), the secret-scrub fixture passes, and `/dc-audit` reads the
log and renders its report.

Done when: all four row types exist in the decision log from a real
session and the three non-interactive checks pass.

### T5: Live capability smoke

On the integration branch, one Pi run exercising: a fan-out with two
background tasks whose completion notifications arrive without await, one
subagent continued with a follow-up that recalls first-run context, one
DAG drain over a small fixture graph (use the phase 3 T4 fixture shape:
diamond, independent branch, overlapping-scope writers), and a lease
warning from two instances in one worktree plus no warning from separate
worktrees.

Done when: each observed in a real session, not just unit tests.

### T6: .specs bookkeeping

Update the phase 4/5 plans to record the 2026-07-21 decisions verbatim
from this plan's Decisions section: phase 5 T2 dropped as superseded by
Pi-native damage control; T1 narrowed to Claude-side; T3 closed as
tool-delivered with the applied-proposal measurement deferred to a
real-data `/dc-audit` run about two weeks after landing; T4 declined for
now as superseded by the shadow judge, with the recorded revisit
condition. With no open gates, archive `.specs/rationalization-phase5/`.
Phase 4 T5 still awaits an improvement-report selection, noting the
07-17 report predates the port and a fresh `/improve` run is the natural
next step; leave phase 4 active with updated state. Run
`pi/scripts/plan-lint` against every touched plan.

Done when: plan states match repository reality and plan-lint passes on
each.

### T7: Land

Merge the integration branch to main. Push only on user instruction.

Done when: main contains the port and T3's suites were re-run green on
main after the merge.

## Dependency graph

```text
T1 -> T2 -> T3 -> {T4, T5} -> T6 -> T7
```

## Out of scope

- Any change to Pi damage-control rules or semantics.
- Reviving the shared canonical policy direction.
- Phase 5 T4 plan-scoped authorization (design remains recorded and
  undecided).
- New guidance prose beyond the quoted re-add text.
- Regenerating the improvement report (candidate first `/improve` run
  after landing, on user request).

## Execution status

Statuses: `pending` | `in-progress: <next step>` | `blocked: <reason>` |
`done: <commit>`.

### Task checklist

- [x] T1: integration branch and merge - done: dfe8291
- [x] T2: audit auto-merges - done: b7c863c
- [x] T3: rebase-sensitive code checks - done: 7482eb3 (subagent and workflow tests updated for removed metadata and exact conflict-policy prose)
- [ ] T4: Claude-side decision logging validation - blocked: non-interactive checks passed in the 874-test Python suite; waiting for one real Claude session with allow, ask-approved, ask-denied-or-abandoned, and block rows
- [x] T5: live capability smoke - done: 9fb1119 (two no-await notifications, continuation recall, DAG drain, and same-worktree-only lease warning observed)
- [ ] T6: .specs bookkeeping - pending
- [ ] T7: land - pending

### State

- **Classification:** blocked
- **Current blocker:** user-run Claude permission fixture for T4
- **Next:** verify the four Claude decision rows
- **Resume:** `/do-it .specs/rationalization-port/plan.md`
