---
created: 2026-07-16
status: draft
completed:
---

# Plan: Damage-control alignment - phase 5 (shared policy, decision logging, tuning loop)

Pi and Claude each run a serious command-safety system that has already
diverged: Pi's engine (`pi/extensions/damage-control*.ts`, ~3,200 lines,
`pi/damage-control-rules.yaml`) is documented as a port of the Claude hooks'
intent, and `.specs/pi-damage-control-v2/claude-parity-matrix.md` already
records a "future shared policy schema" follow-up. The Claude side
(`claude/hooks/damage-control/`) owns four policy files (`patterns.yaml`,
`allowed-hosts.yaml`, `sequence-patterns.yaml`, `taint-config.yaml`) plus
AST analysis and taint tracking. This plan executes that follow-up and adds
what neither side has: structured decision logging and a data-driven tuning
loop that captures truly dangerous commands while retiring the noise that
dominates today's approval prompts.

## Do not start

Do not begin until phase 2 (`.specs/rationalization-phase2/`) is archived,
to keep single-writer discipline over `pi/`. Numbered phase 5 but
independent of phases 3-4: it may run before or after them at the user's
choice, and starting T1 (decision logging) earlier increases the data
coverage of phase 4's improvement report.

## Goal

1. One structured decision log both clients write: every allow/ask/block
   event with rule identity, command context, and (where knowable) the
   user's decision.
2. One canonical policy source both engines consume, with semantic parity
   proven by shared behavior vectors, not by prose comparison.
3. A deterministic audit tool that separates signal (denials, real danger)
   from noise (rules approved ~100% of the time with no incident) and
   proposes rule changes for user review. The tool never edits rules.
4. Approval prompts trend toward signal: the documented friction class
   ("why do you keep asking permission for work already authorized",
   homelab 2026-07-09) shrinks measurably.

## Why

- Approval fatigue is a documented friction class in
  `.specs/rationalization-phase2/research/friction-*.md`, and phases 1-3
  all explicitly preserve permission semantics - so nobody owns fixing it.
- Two rule sources are already diverging (Pi yaml vs the four Claude
  yamls); every future rule fix lands twice or drifts.
- Pi's only logging today is a debug log
  (`pi/extensions/damage-control-debug.ts`); Claude has `log_rotate.py` but
  no decision-schema log. Without decision data, tuning is guesswork - the
  same gap the tool-reduction corpus solved for reduction rules.
- The user's direction (2026-07-16): capture truly dangerous commands while
  cutting what has been mostly noise, with a shared understanding between
  clients and a consolidated reviewable log.

## Evidence base

- `pi/extensions/damage-control-engine.ts`, `-rules.ts`, `-state.ts`,
  `-debug.ts`; `pi/damage-control-rules.yaml`.
- `claude/hooks/damage-control/` - patterns, allowed-hosts,
  sequence-patterns, taint-config, ast_analyzer, tests, cookbook.
- `.specs/archive/pi-damage-control-v2/claude-parity-matrix.md` - recorded
  parity limits and the shared-schema follow-up this plan executes.
- `.specs/archive/pi-damage-control-parity/` - the prior parity plan
  (stalled 2026-05-29, archived 2026-07-17 as superseded by this plan)
  with its policy inventory, AST parity matrix, parity diff, unsupported
  features inventory, and review rounds. Its completed waves
  T0-T4 are this plan's foundation; its blocked T5 is this plan's T2.
- `.specs/rationalization-phase2/research/friction-*.md` - approval-fatigue
  incidents.

## Boundaries

- Never weaken or bypass a hard-block class without explicit user approval;
  a unification diff that changes any allow/ask/block outcome is a semantic
  change and stops for review with the affected vectors listed.
- Rule changes reach the rule files only through the T3 loop with explicit
  user approval - the audit tool proposes, the user decides, a human-
  approved slice applies.
- Logging is fail-open: a logging failure never blocks or delays a tool
  call. Decision logs are never deleted - compress on age (user decision
  2026-07-16, session-data principle); readers handle compressed files.
- No new frameworks: the shared policy source is files both engines load,
  not a policy service. Keep each client's enforcement runtime (TS engine,
  Python hooks) - only the policy data and log schema unify.
- Migration is parity-first: both engines pass the shared vectors against
  the canonical source before any client cuts over; old files remain until
  cutover is validated.
- ASCII punctuation; LF endings; Pi is pnpm-only, hooks are uv/bare-python
  per the console-flashing workaround.
- Commit each validated slice with a conventional message and CHANGELOG
  entry. Do not push.

## Decision protocol

Already decided - do not relitigate:

- Session/telemetry data is never deleted; compress on age.
- Both clients keep their own enforcement runtimes; unification is at the
  policy-data and log-schema level only.
- The audit tool is a proposer, never an applier.

Stop and ask before: any change that alters an allow/ask/block outcome for
an existing vector, enabling plan-scoped authorization (T4 presents a
design first), or cutting a client over to the canonical source.

Session continuity: same protocol as the rationalization plans - checklist
order, update Execution status and commit after each slice, resume from
recorded state.

## Tasks

### T1: Structured decision logging in both clients

First verify what each side can actually know: Pi's engine sees its own
confirmation outcomes; Claude's PreToolUse hook emits ask/block but may not
learn the user's decision directly - check whether the hook events expose
it, and if not, infer outcome by correlating an ask with the subsequent
PostToolUse execution (executed = approved; no execution = denied or
abandoned, logged as such). Record what is knowable per client in the plan
before implementing.

Then: one JSONL decision schema, one shared location
(`~/.local/share/damage-control/decisions-YYYY-MM.jsonl`), both clients
append: timestamp, client, session id, tool, rule id (or `none`), matched
pattern, command/file summary (secret-scrubbed, bounded), engine action
(allow/ask/block), user decision where knowable, and latency. Compress-on-
age, never delete.

Done when: a live Pi session and a live Claude session each produce
correct decision rows for an allow, an ask-approved, an ask-denied, and a
block; a logging failure (unwritable directory) demonstrably does not
block the tool call; secret-scrub verified on a fixture containing a
credential.

### T2: Canonical policy source, oracle runner, and coverage debt zero

This task completes the blocked remainder of
`.specs/archive/pi-damage-control-parity/` rather than inventing a
parallel mechanism. That plan's waves T0-T4 landed (policy inventory, a Claude
`bashToolPatterns` adapter with typed normalization in
`pi/extensions/damage-control-rules.ts`, engine parity for command/path
outcomes, tool-call integration with ask/block/no-exec guarantees); it
stalled at its T5: Claude-vs-Pi parity fixtures, a per-pattern coverage
runner with the Claude hook as a subprocess oracle, and negative
controls - its `evidence/parity-diff.md` records `coverage_debt_count`
never established as 0.

First verify what `damage-control-rules.ts` already loads - the adapter
may already consume Claude's `patterns.yaml`, which changes this plan's
"two diverging sources" premise into "one adapter plus per-client
extras". Then:

1. Build the per-pattern coverage runner: for every pattern in the policy
   inventory, execute Claude's actual Python hook as the oracle and Pi's
   engine side by side; every divergence is fixed or recorded in the
   unsupported-features inventory. `coverage_debt_count = 0`
   (every pattern covered or explicitly waived) is the gate.
2. Create the canonical policy source (candidate:
   `shared/damage-control/policy/*.yaml`) carrying what both engines
   need, with per-client extension files for one-sided capabilities. Both
   engines pass the coverage runner against it with zero unapproved
   outcome changes; intentional changes split out for user approval.
3. The prior plan is already archived with a supersession header
   (2026-07-17); when coverage debt reaches zero, update that header to
   completed-by-successor and reuse its evidence (`policy-inventory.md`,
   `ast-parity-matrix.md`, `parity-diff.md`, `unsupported-features.md`)
   rather than regenerating.

Done when: the coverage runner reports `coverage_debt_count = 0`; both
engines load the canonical source and pass the runner in `make check`
scope; cutover recorded; the stalled parity plan archived as
completed-by-successor.

### T3: Noise/signal audit tool

A deterministic program (not a skill) that reads the T1 decision log and
produces a report: per-rule fire count, approval rate, denial evidence,
time-to-approve; proposals ranked by prompt-fatigue impact -
narrow/allowlist candidates (high fire rate, ~100% approval, no denial in
window), strengthen/add candidates (denials, dangerous commands that hit
no rule), retire candidates (never fired). Report written to
`.specs/rationalization-phase5/reports/<date>.md`. Thin `/dc-audit`-style
entry points on both clients invoke the same program. The tool proposes;
applying any proposal is a separate user-approved slice.

Done when: the tool runs against at least two weeks of real decision data
(or a synthetic fixture if run earlier) and produces a report with the
three proposal classes; a proposal applied via user approval demonstrably
reduces prompts for that rule without changing any block-class outcome.

### T4: Plan-scoped authorization (design-gated, Pi only)

Present a design before any implementation (stop-and-ask): an approved
/do-it plan pre-authorizes the command classes its tasks require, scoped
to that run - subsequent matching asks within the run auto-approve with a
decision-log row marking the plan as authorizer; hard blocks are never
bypassed; anything outside the plan's declared scope still asks. The
design must state scope derivation, expiry, and how the decision log
records it. Implement only the approved design.

Done when: either the approved design passes a live run (fewer asks, zero
bypassed blocks, authorizer recorded per row) or the user declines and the
decision is recorded.

### T5: Close

Parity vectors green on both engines from the canonical source; decision
logs flowing from both clients; one audit report generated from real data;
friction measurement recorded (asks per session before/after, from the
decision log itself).

Done when: the closeout records the before/after ask-rate numbers and the
required validation results.

## Dependency graph

```text
T1 -> T3 (audit needs decision data)
T2 independent of T1 ; T2 -> T5
T4 after T1 (logs the authorizer) ; design gate before build
All -> T5
```

## Out of scope

- Changing what is considered dangerous (that is T3's user-gated loop
  output, applied in separate slices - not this plan's authorship).
- OpenCode/Copilot surfaces (deprecated tooling).
- A policy service, daemon, or cross-client IPC.
- Hermes integration (future; the log schema should simply not preclude a
  third client writing it).

## Execution status

Statuses: `pending` | `in-progress: <next step>` | `blocked: <reason>` |
`done: <commit>`. Update and commit this file after every slice; resume
from here.

### Task checklist

- [ ] T1: structured decision logging - pending
  - [ ] per-client decision knowability verified and recorded
  - [ ] schema and shared location implemented in both clients
  - [ ] live four-outcome validation on both clients
  - [ ] fail-open and secret-scrub proven
- [ ] T2: canonical source, oracle runner, coverage debt zero - pending
  - [ ] verified what damage-control-rules.ts already loads
  - [ ] per-pattern coverage runner built (Claude hook as oracle)
  - [ ] coverage_debt_count = 0 (covered or explicitly waived)
  - [ ] canonical source created; both engines pass the runner
  - [ ] cutover recorded; archived parity plan's header updated to
        completed-by-successor
- [ ] T3: noise/signal audit tool - pending
  - [ ] report with three proposal classes from real or fixture data
  - [ ] one approved proposal applied and measured
- [ ] T4: plan-scoped authorization - pending
  - [ ] design presented; user decision received (gate - never inferred)
  - [ ] approved design implemented and validated (or decline recorded)
- [ ] T5: close - pending
  - [ ] vectors green, logs flowing, report generated
  - [ ] before/after ask-rate recorded

### State

- **Classification:** ready; phase 2 is archived
- **Current blocker:** none
- **Next:** T1, verify per-client decision knowability before implementing the
  shared structured decision log (independent of phase 4)
- **Resume:** `/do-it .specs/rationalization-phase5/plan.md`
