---
created: 2026-07-16
status: draft
completed:
---

# Plan: Measurement and improvement loop - phase 4

Phases 1-2 removed prescription; phase 3 adds orchestration capability.
Phase 4 closes the loop that today runs on frustration: deterministic
programs gather evidence (plan-state consistency, routing outcomes, friction
signals, usage data), one report proposes improvements, and the user decides.
Automation ends at the proposal boundary - nothing in this plan applies a
change to instructions, rules, or routing by itself.

## Do not start

Do not begin until phase 2 (`.specs/rationalization-phase2/`) is archived.
Default sequencing is after phase 3 as well (single-writer discipline over
`pi/`); T1 and T3 touch no phase 3 surface and may start earlier if the
user says so.

## Goal

1. A plan's recorded state cannot silently drift from reality: done means a
   commit hash that exists; reports may not claim what the plan does not
   record. Enforced by code, not prose.
2. The Terra vs Luna-high vs Sol-low question is answered by accumulated
   outcome data - quality, speed, and cost together - not community claims.
3. One recurring report proposes harness improvements from real data, with
   deletions proposed at least as often as additions.
4. The loop runs on a cadence the user controls; every applied change is a
   user-approved plan slice.

## Why

- 2026-07-16: phase 2 execution marked eleven tasks done with "validated
  slice commit pending" - prose rules said done requires a commit hash; a
  fresh session drifted anyway. Only code survives fresh sessions.
- The routing ladder (phase 1 T5 consolidated it) encodes the community
  belief that Luna-high and Sol-low beat Terra on cost/speed at comparable
  quality (user's request, session 019f6878). No outcome data validates it.
  Orchestration telemetry already records durationMs, normalized usage,
  turns, and exit codes per worker run - the data exists, unaggregated.
- Today's improvement cycle was manual: user frustration -> transcript
  archaeology -> plans. The pieces (friction-scan, usage data, telemetry,
  decision log once phase 5 T1 lands) exist; nothing
  composes them into a reviewable proposal.
- User decisions 2026-07-16: automatic collection and proposal generation,
  human-gated application; session/telemetry data is never deleted
  (compress on age); speed and cost are first-class outcome dimensions.

## Evidence base

- `.specs/rationalization-phase2/research/friction-*.md` and
  `friction-scan.py` - the friction detector this plan schedules.
- `.specs/rationalization-phase2/research/context-reduction-research.md` -
  externally validated patterns already encoded in phases 2-3.
- `pi/lib/orchestration-telemetry.ts`, `pi/lib/metrics.js` consumers, and
  the run events emitted by `pi/extensions/subagent/index.ts` and
  `pi/extensions/tasks/execution.ts` - the routing-outcome data source.
- `pi/lib/model-routing.ts` - the single routing policy point (phase 1 T5).
- `.specs/rationalization-phase5/plan.md` T1 - the decision log that
  becomes a report source when it lands.
- `.specs/pi-workflow-friction-review/design.md` - the reference design
  behind the friction extension this plan's report consumes.
- `.specs/archive/pi-workflow-audit/report.md` - the 2026-05-26 scientific audit
  of /plan-it, /review-it, and /do-it across projects: the longitudinal
  baseline. T3's friction section compares current findings against it,
  labeling each May finding persisted, resolved (cite the fix), or
  transformed - the only way to know whether the rationalization wave
  actually reduced friction rather than relocated it.

## Boundaries

- The report tool and lint are programs with pinned behavior and tests for
  their parsing and math; they never mutate instructions, rules, routing
  tables, or plans.
- Routing sampling never overrides an explicit user or frontmatter model
  choice - it applies only where the routing policy itself resolved the
  model (modelSize/modelPolicy paths). Explicit override always wins.
- Sampling changes which model serves a run and nothing else; a sampled
  run's failure is handled exactly like any failure.
- Reports, telemetry, and experiment data are never deleted; compress on
  age.
- No dashboards, services, or learned components - flat files in, markdown
  report out.
- ASCII punctuation; commit each validated slice with a CHANGELOG entry; do
  not push.

## Decision protocol

Already decided - do not relitigate:

- Automation ends at the proposal boundary (user decision 2026-07-16).
- Deletions are proposed at least as often as additions; the report leads
  with them.
- Speed (wall time) and cost (tokens, turns) are scored alongside quality
  in every routing comparison; a quality tie goes to faster-and-cheaper.
- Cadence starts manual; a timer is added only after the manual loop has
  produced value at least twice.

Stop and ask before: raising the sampling rate above 10%, letting any
report consumer apply a change without a user-approved slice, or drawing a
routing conclusion from a cell with fewer than 30 runs.

Session continuity: same protocol as phases 1-3.

## Tasks

### T1: plan-lint

A small deterministic program (candidate: `pi/scripts/plan-lint`, invoked
standalone and by /do-it before any report or done-marking) that parses a
plan file's Execution status and enforces:

- a `[x]` item carries `done: <commit>` and the hash exists in `git log`;
- an in-progress item carries a next-step note;
- the State block agrees with the checklist (no `Current blocker: none`
  alongside a blocked classification, no completed claim with unchecked
  required items);
- a /do-it report may not claim completion, blockage, or archive state the
  plan file does not record.

Exit nonzero with a named violation list; /do-it treats a lint failure as
"fix the plan state first, then report". First run it against
`.specs/rationalization-phase2/plan.md`, which should flag the known
"commit pending" rows as the acceptance fixture.

Done when: the lint catches all four violation classes on fixtures, passes
on a clean plan, is wired into /do-it's report path, and flags the phase 2
rows (or confirms they were fixed).

### T2: Routing outcome sampling

In `pi/lib/model-routing.ts`, a sampling layer active only on
policy-resolved dispatches: at a configured rate (default 10%, one named
constant) resolve to a designated alternate model/effort arm instead of the
policy choice, and tag the run's telemetry with experiment id and arm. Arms
are configured as data (initial set per the user's day-one question: Terra
baseline vs Luna-high vs Sol-low). Every sampled run records: task class
(subagent modelSize request or workflow origin), arm, exit code, validation
outcome where present, durationMs, turns, normalized tokens.

Done when: sampled runs appear in telemetry with correct tags at roughly
the configured rate; explicit model overrides are demonstrably never
sampled; a killed sampling flag (rate 0) restores byte-identical routing.

### T3: improvement-report

One program that reads whatever sources exist and degrades gracefully when
one is absent: friction-scan output over new sessions since the last
report, skill/command/agent usage counts, routing experiment cells (T2),
plan-lint results across active plans, and the phase 5 damage-control decision log
when available. Output: one markdown report at
`.specs/improvement-reports/<date>.md` with sections in this order:
proposed deletions/consolidations, routing table (per cell: n, success
rate, p50/p90 duration, tokens - no conclusion below n=30), friction
patterns with session citations, noise/signal candidates, a `.specs/`
hygiene section (non-archived directories with no file activity in 60+
days, listed with last-touch dates as archive/revive candidates - list
only, never auto-archive), and data-coverage notes (what sources were
missing). Each proposal cites its evidence path.

Done when: a report generates from current real data with at least the
friction, usage, and lint sections populated; missing sources appear as
coverage notes, not errors; the program has tests for its aggregation math.

### T4: Cadence and entry point

Manual first: a `/improve report` entry point (thin wrapper on both the Pi
side and a repo script) that runs T3 and prints the report path. Document
the loop in the philosophy file's improvement section in three lines: run
the report, pick items, each becomes a plan slice. Add a timer (cron or
scheduled task) only after the manual loop has been run at least twice and
the user asks for it - record that condition in the plan.

Done when: `/improve report` produces the report end to end; the loop
description exists in exactly one place; no timer exists unless the
recorded condition was met.

### T5: Close

Run the loop once for real: generate the report, have the user pick at
least one item, execute it as a slice, and record the cycle time. A
natural first candidate is the report's `.specs/` hygiene section: the
known dormant tail (2026-03-27 loose bash-crash/msys2 files, dormant May
drafts) archived in one user-approved sweep; the absorbed-elsewhere plans
were already archived 2026-07-17. Record
baseline routing-cell counts and the date the n=30 threshold is projected
to be reached at current traffic.

Done when: one full cycle (report -> user selection -> applied slice) is
recorded in the plan with its evidence.

## Dependency graph

```text
T1 independent (may start as soon as phase 2 archives)
T2 -> T3 (report consumes experiment cells)
T3 -> T4 -> T5
T1 -> T3 (report includes lint results)
```

## Out of scope

- Applying any proposed change (each is its own user-approved slice).
- Learned routing, RL, or any adaptive policy - the sampling is a fixed
  A/B, the analysis is arithmetic.
- Damage-control decision logging itself (owned by
  `.specs/rationalization-phase5/` T1; T3 merely reads its output).
- Dashboards or web UI.
- OpenCode/Copilot surfaces (deprecated tooling).

## Execution status

Statuses: `pending` | `in-progress: <next step>` | `blocked: <reason>` |
`done: <commit>`. Update and commit this file after every slice; resume
from here.

### Task checklist

- [x] T1: plan-lint - done: `54989a8`
  - [x] four violation classes caught on fixtures; clean plan passes
  - [x] wired into /do-it report path
  - [x] phase 2 "commit pending" rows flagged or confirmed fixed
- [x] T2: routing outcome sampling - done: `c94879b`
  - [x] sampling layer with named-constant rate; arms as data
  - [x] explicit overrides never sampled (proven)
  - [x] telemetry tags verified at configured rate; rate 0 byte-identical
- [ ] T3: improvement-report - in-progress: implementation validated; record commit
  - [x] all present sources aggregated; absent sources as coverage notes
  - [x] deletions-first report generated from real data
  - [x] aggregation math tested
- [ ] T4: cadence and entry point - pending
  - [ ] /improve report end to end
  - [ ] loop documented once, in the philosophy file
  - [ ] timer condition recorded (not built)
- [ ] T5: close - pending
  - [ ] one full cycle recorded with evidence
  - [ ] routing baseline and n=30 projection recorded

### State

- **Classification:** in progress; T1-T2 complete; T3 implementation validated
- **Current blocker:** none
- **Next:** record T3's implementation commit, then add the T4 manual report
  entry point and cadence guidance
- **Resume:** `/do-it .specs/rationalization-phase4/plan.md`
