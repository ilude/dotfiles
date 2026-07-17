---
created: 2026-07-16
status: in-progress
completed:
---

# Plan: Harness rationalization phase 2 - contracts, meta-rules, and surface area

Continues `.specs/rationalization/` (phase 1) after it archives. Phase 1
rationalized tests, runtime snapshots, and quality tooling. Phase 2 applies the
same discipline to the remaining prescription: the /do-it report and telemetry
contract, the reactive meta-rules in `pi/AGENTS.md`, the scattered philosophy
prose, the skill/extension surface area, and the measured effectiveness gaps
in the tool-reduction pipeline.

## Do not start

Do not begin any task until phase 1 is archived at
`.specs/archive/rationalization*/` (or the user explicitly overrides). Phase 1
T12 certifies the current workflow entrypoints; this plan changes them.

## Goal

1. /do-it reports state facts a reader can verify, never a classification the
   evidence does not support; an honest mid-plan checkpoint is a legal outcome.
2. Telemetry is either recorded mechanically by code or does not exist.
3. `pi/AGENTS.md` states values, safety, and environment facts; procedural
   rituals (hedge-word detection, 1-3-1 template, answer-format counters,
   overlapping ask/execute rules) are consolidated or deleted.
4. The dev philosophy has exactly one owning file; every other skill or
   instruction references it instead of restating it.
5. Skills and extension commands that nothing used in the measurement window
   are retired or merged, with a recorded decision per item.
6. Tool-reduction compacts the roughly half of bash output that currently
   escapes it, tells the model when it acted, and stops paying interpreter
   startup on every call.

## Why

Two failures on 2026-07-16 were caused by the contracts themselves, not by
model weakness:

- /do-it fabricated a `blocked-by-failure` classification because the report
  template offers no honest interrupted state, and the required telemetry
  block in the plan file recorded the contradiction without anything
  detecting it (plan said `Current blocker: none`).
- /review-it churned repeat subagent panels and grew an unrequested ask mode;
  the meta-rules in `pi/AGENTS.md` (four overlapping ask/execute rules, 1-3-1,
  certainty calibration) reward exactly that gate-keeping behavior.

Operating principles, per the user (recorded in
`.specs/workflow-test-rationalization/summary.md`): less instructions is
always preferred; tests are for code, not policy; linters own slop; recurring
mechanical operations become programs, not model narration.

## Evidence base

- `.specs/workflow-test-rationalization/summary.md` - user principles and the
  churn incident record.
- `.specs/archive/rationalization*/ledger.md` (after phase 1 archives) -
  decision format and byte-count baselines.
- Pi session transcripts of 2026-07-16 under
  `~/.pi/agent/sessions/--C--Users-mglenn-.dotfiles--/` - the fabricated
  blocker (session 019f6c3b) and the review-it churn (session 019f6bb0).
- `research/friction-*.md` - per-incident friction history extracted from the
  33 highest-signal Pi sessions across all projects (2026-05-05 to
  2026-07-15), with verbatim quotes and category tags;
  `research/friction-scan.py` is the deterministic scanner that found them
  (140 of 779 sessions had signals). Key aggregate finding: May friction is
  dominated by capability failures (fabrication, retry loops), June-July by
  process failures (ceremony, gold-plating, premature stopping) - the harness
  is now the main friction source.
- Tool-reduction corpus (`~/.cache/pi/tool-reduction/corpus-*.jsonl`),
  measured 2026-07-16 over 72 days / 31,815 bash results: 43% total bytes
  saved (139.5MB -> 79.7MB), but only 52% of commands classify to a rule.
  Top unmatched argv[0]: cd (2,719), python (2,181), git (1,651), set (991),
  for (658), env-var prefixes (478) - shell syntax defeating the naive
  whitespace `splitArgv`, not missing rules. `generic/fallback.json` exists
  but is unreachable: the lazy argv0 index never loads it, so unmatched
  output passes through untouched.
- `pi/tool-reduction/docs/baseline-latency.md` - p50 524ms per reducer call
  on Windows (post lazy-index; Defender dominates), roughly 440 calls/day.
- Pi package types (`dist/core/extensions/types.d.ts`): Bash `tool_result`
  details carry only `{truncation?, fullOutputPath?}` - no exit code and no
  separate stderr are available to the hook, and `fullOutputPath` already
  points at the full untruncated output on disk. `ContextEvent` can modify
  the outgoing message array before each LLM call (T13's hook).
- `research/context-reduction-research.md` - external survey (Anthropic
  context editing, observation masking, TACO, VISTA) plus local feasibility
  verification; grounds T13 and the Phase D invariants.

## Boundaries

- Pi surfaces only. Do not modify `claude/shared/`, `claude/commands/`,
  `opencode/`, or `copilot/`.
- Preserve public command names and argument shapes.
- Do not change security or permission semantics (damage-control, permissions,
  hooks). Damage-control and pinned linters are the guardrails that stay.
- Every deleted rule, skill, or command gets one ledger row in
  `.specs/rationalization-phase2/ledger.md`: item, what it nominally
  prevented, originating incident (cite `research/friction-*.md` or session
  evidence, else `unknown`), recurrence since the rule was introduced,
  decision, rationale.
- A rule survives only if it names a real failure class - documented in the
  friction history or recent sessions - that values plus linters plus
  damage-control do not already cover. Non-recurrence of a documented
  incident after a rule's introduction is evidence the rule works; it is
  never by itself grounds for deletion. Known earned rules: scratch-file
  handling (monorepo 2026-05-28), Pi-ownership (dotfiles 2026-06-07),
  incident mode (homelab 2026-07-09).
- Do not add new rules, schemas, evaluators, or frameworks to fix ceremony;
  the fix for over-specification is deletion or consolidation, never a
  compensating layer.
- ASCII punctuation in file content everywhere, including the report
  template's current emoji/em-dash violations.
- Commit each completed, validated slice with a conventional message and a
  `CHANGELOG.md` entry. Do not push.

Workers and models resolve at execution time from what is available; no task
prescribes one.

## Decision protocol

Already decided - do not relitigate:

- Phase 1 completes first; this plan does not touch phase 1 task files.
- Telemetry narrated by the model is removed from /do-it regardless of the
  T2 ownership outcome; the only open question is whether code records it.
- The values block at the top of `pi/AGENTS.md` (AI mentions, ASCII, security,
  KISS, POLA, sycophancy, root-cause) survives as-is.
- Claude/OpenCode/Copilot command systems stay separate from Pi.
- Agent definitions that differ only by model size or thinking effort merge
  into one file (user decision 2026-07-16). The subagent launcher already
  accepts exact `model` overrides (precedence over frontmatter),
  `modelSize`/`modelPolicy`, and enforced `effort` per launch - verified in
  `pi/extensions/subagent/index.ts:1103-1149` and `agents.ts:13-37`. This
  includes collapsing the `skill-review-*` trio into one agent, with
  `pi/lib/skill-review.ts` passing model and effort explicitly at dispatch
  instead of naming three files. These merges need no further approval gate;
  frontmatter model/effort remains only a default hint.

Stop and ask the user before: deleting any user-facing command or skill the
audit shows nonzero usage for, deleting any distinct-role agent definition
(the roster was user-approved in phase 1; model/effort variant merges are
pre-approved above and exempt), changing a public command shape, or acting
where repository state contradicts this plan.

Session continuity: same protocol as phase 1 - work in checklist order,
update Execution status and commit after each slice, resume from recorded
state, never re-do a `[x]` task.

## Phase A - /do-it contract

### T1: Rewrite the report contract

Rewrite `pi/skills/workflow/templates/do-it-report-template.md` and the
Report/Workflow Evaluation sections of `pi/skills/workflow/do-it.md`:

- Drop the four-way classification enum. The report states: what changed,
  what was validated (commands and observed results), what remains, next
  action. First and last line still state plainly whether the work is
  complete, checkpointed, or blocked.
- Add the honest interrupted state: a checkpoint (Execution status updated,
  plan committed) is a legal, non-failure outcome. Context pressure means
  checkpoint and continue or checkpoint and report - never a fabricated
  blocker, and never the concept of an "execution window".
- One consistency rule: a report may not claim a blocker the plan's
  Execution status does not record.
- Artifact freshness: a recorded blocker or review artifact is honored only
  after re-verification against current state; a repaired, approved plan
  supersedes a stale review artifact (incidents: network-iac 2026-05-06
  stale soa-mysql gate; dotfiles 2026-07-15 stale review blocker). If the
  phase 1 review-it rework already enforces this, record that finding and
  do not duplicate it.
- Remove the incomplete-report protocol's procedural weight so stopping is
  no longer the best-documented path; continuing to the next ready task is
  the default.
- Fix the template's non-ASCII content.

Done when: the template contains no classification enum, no emoji, no
em-dashes; do-it.md states the checkpoint rule in one short paragraph; a
scratch-plan /do-it run produces a report consistent with the plan file.

### T2: Telemetry ownership

Decide and execute one of:

1. A code consumer exists or is trivially completed (workflow-friction
   extension records episode facts mechanically from observable data -
   commands, exit codes, timestamps, commits); the model never narrates it.
2. No code consumer: delete the telemetry requirement from `do-it.md` and
   `pi/docs/workflow-eval-telemetry.md`, and note the deletion in the ledger.

Done when: no workflow skill instructs the model to emit schema-shaped prose;
whatever telemetry remains is written by code and readable by code.

## Phase B - instruction rationalization

### T3: Consolidate pi/AGENTS.md meta-rules

Apply the survival test from Boundaries to the middle of `pi/AGENTS.md`:

- Collapse the ask/execute cluster (explicit-requests-are-authorization,
  ask-only-when-needed, follow-explicit-requests, bound-work-before-mutation)
  into one paragraph: execute what was asked; ask only when intent, target,
  or scope is materially ambiguous or the action exceeds the request; after
  denial, replan.
- Reduce user-certainty calibration to its value: do not inherit the user's
  confidence; state why you are sure when you are.
- Reduce 1-3-1 to its value: when a real unresolved choice exists, recommend
  one option with brief trade-offs; a selection is authorization.
- Delete presentation rituals ([N/total] counter, template formats) unless
  the ledger records a recent failure they prevented.
- Fold two documented failure classes into the consolidated text as one-line
  values, not new rule blocks: safety guidance gates execution, never
  implementation (gcc 2026-06-25 "should be not to skip building"); a
  user-accepted documented risk is settled - do not re-litigate it
  (network-iac 2026-05-12 Terraform state custody).
- Record before/after byte counts.

Done when: each surviving rule has a named failure class; no two rules govern
the same behavior; byte count recorded.

### T4: One philosophy file

Create or designate a single philosophy owner that is verifiably in Pi's
always-loaded instruction path - verify load behavior, do not assume: a
skill is activation-triggered, so choosing
`pi/skills/development-philosophy/SKILL.md` requires proving it loads every
session; a `pi/AGENTS.md` section is always loaded by construction. The
owner holds: flexible workflows, deterministic programs for
repeated operations, tests for code not policy, linters own slop, less
instructions always preferred, root-cause first, and the delegation
decision (research/context-reduction-research.md items 6-7): work directly
by default - delegation costs roughly 15x tokens and loses shared context;
delegate when the work splits into genuinely independent parallel streams,
when its output volume dwarfs the facts the main thread needs (the subagent
is a context firewall that returns conclusions, not transcripts), or when
independent verification matters; never split interdependent work; parallel
reads, single-threaded writes. This paragraph becomes the single owner of
delegation policy - the restatements in `pi/PI-INSTRUCTIONS.md` and
`pi/AGENTS.md` reduce to pointers. Convert restatements in
`least-astonishment`, `no-ai-slop`, `zoom-out`, `workflow-design`,
`brainstorming`, and any instruction file into one-line pointers or delete
them where the pointer adds nothing.

Done when: one file owns the philosophy; a repo-wide search finds no second
full restatement; each touched skill either points to it or was retired via
the T5 audit.

## Phase C - surface area

### T5: Usage-driven skill, command, and agent audit

First verify the /improve usage data source (the measurement that found
zero 30-day usage for `analysis-workflow`): identify where it lives, what it
actually covers (skills? commands? both?), and its window. Where a category
has no usage data, derive counts from the session archive with a
deterministic scan instead - do not invent a measurement or guess. Then
produce usage counts for all skills in `pi/skills/` and all extension slash
commands. For agents, count
actual launches per agent name from the session archive
(`~/.pi/agent/sessions/`) over the available window with a deterministic
scan (`research/friction-scan.py` shows the pattern) - the phase 1 roster
(`.specs/archive/rationalization*/roster.md`, 18 agents) was consolidated on
role distinctness, not on observed demand, so launch data is the missing
evidence. For each zero- or near-zero-usage item: retire, merge, or keep
with a recorded reason (a rarely used but load-bearing safety skill is a
valid keep). Independently of usage, execute the pre-approved variant
merges from the decision protocol: collapse the `skill-review-*` trio into
one `skill-review` agent and rewire `pi/lib/skill-review.ts` to dispatch
model and effort explicitly; merge any other definitions that differ only
by model or effort. Execute the retirements. Nonzero-usage deletions and
deletion of any distinct-role agent still require the stop-and-ask gate;
the variant merges do not.

Done when: every skill, command, and agent has a ledger row with usage count
and decision; retired items are removed along with their activation prose
and name references; /improve consumes the same data source on demand rather
than ad hoc.

### T6: Extension output-visibility rule

Add one design rule to the `pi-command` skill: a command whose output the
user can see must persist that output (or a faithful summary) into model
context; UI-only rendering is a defect. Audit the 21 command-owning
extensions against it; fix violations found (the /improve list/select
mismatch is the known case - verify it is already fixed and covered).

Done when: the rule is one short paragraph; no audited command renders
user-visible state the model cannot read back.

### T7: Hygiene gates never mutate immutable artifacts

Generic hygiene validation (whitespace, formatting) must not rewrite
checksum-sensitive or immutable artifacts (incident: monorepo 2026-05-27,
`git diff --check` cleanup changed an applied Flyway migration's checksum and
broke deployment, then the workflow defended the gate instead of fixing the
conflict). Add path-exemption support to the phase 1 changed-file validation
CLI configuration and one line to the `/commit` workflow skill: formatting
fixes never touch migration files or other declared-immutable paths; a
hygiene finding on an immutable path is reported, not auto-fixed.

Done when: an exempted fixture path passes through the CLI unmodified with
the finding reported; a non-exempt fixture still gets normal treatment; the
/commit skill states the rule in one line.

## Phase D - tool-reduction effectiveness

The goal metric for this phase is information-preserving context reduction,
not bytes: a reduction that drops failure-relevant content is worse than no
reduction. Two invariants govern every task here:

1. Failure-relevant lines (errors, warnings, nonzero-exit evidence) survive
   every reduction - verbatim or as counted facts the rule explicitly
   produces.
2. Every reduction is recoverable: the model can always get back to the raw
   output without rerunning the command.

Ordering within this phase: T10 (marker and recovery path) lands first -
coverage must not expand before the escape hatch exists. Then T8 and T9
expand coverage, measured by corpus replay. T11 is decision-gated on what
latency remains; T12 is independent hygiene. Do not modify
`pi/tests/tool-reduction.test.ts` before the phase 1 T6 slice is committed -
that file is in T6's worktree scope.

### T8: Shell-aware command classification

Replace the naive whitespace `splitArgv` classification input in
`pi/extensions/tool-reduction.ts` (or pre-parse in `reduce.py` - pick one
owner) with a light shell-aware pass: strip leading env-var assignments and
`set -e...;` preambles, drop `cd X &&` / `cd X;` leaders, classify the last
`&&` segment or the final pipeline stage. No full shell parser; a tokenizer
plus these documented shapes covers the measured miss profile.

A newly matched command applies a rule written for a different command
shape, so match rate alone cannot gate this task. Enforce phase invariant 1
mechanically: extend `guards.py` (or the replay harness) so any raw line
matching failure patterns must appear in the compact output or in the rule's
counted facts; a reduction that fails the check falls back to raw or to the
generic fallback.

Done when: replaying the existing corpus through `evaluate.py` shows the
named shapes (env-var prefixes, `set` preambles, `cd` leaders, `&&`
segments, pipeline stages) classifying correctly and the overall rule-match
rate at or above 65% (baseline 52%; the named shapes alone account for
enough of the miss profile to reach this - if replay lands short, record
the residual top-10 unmatched shapes and stop rather than adding parser
complexity); no regression on currently-matched fixtures; the failure-line
survival check passes over all newly matched replay entries; both results
recorded in the ledger with before/after numbers.

### T9: Make the generic fallback reachable

`rules/builtin/generic/fallback.json` (head 8 / tail 8, preserve-on-failure)
is never loaded because the lazy argv0 index does not map it. Load it as the
last-resort rule whenever no indexed rule matches, preserving the lazy-load
Defender win for the indexed path.

The fallback clamps unknown output shapes, so it depends on T10: it must not
be enabled before every clamped result carries the marker and a recovery
path, and its error/warning counters satisfy phase invariant 1.

Done when: corpus replay shows previously-unmatched large outputs now clamp
through the fallback with markers and surviving failure lines; a giant
unmatched fixture reduces; tiny output still passes raw; latency stays
within the recorded baseline.

### T10: Self-describing, recoverable reductions

Append one marker line to every reduced result: bytes before/after, rule id,
and the raw-output recovery path. Cite `details.fullOutputPath` when Pi
provides it; when Pi did not truncate (so no file exists) and the reduction
dropped content, the reducer writes the raw output to
`~/.cache/pi/tool-reduction/raw/` (sibling of the corpus, covered by the
same T12 retention) and names that path in the marker instead. The model always has a
Read target; rerunning the command is never the recovery path. Honor a
`PI_TOOL_REDUCTION=off` env toggle for a session-level bypass.

Done when: a live reduced bash result shows the marker; the cited path
contains the full raw output in both the Pi-truncated and reducer-only
cases; the scratch location is size-capped and cleaned with the corpus
retention policy (T12); the toggle verifiably bypasses reduction.

### T11: Persistent reducer worker (decision-gated)

After T8-T10, re-measure per-call latency with `bench_reduce.py`. If the
per-call cost still matters (interpreter startup plus Defender scans,
baseline p50 524ms), convert `reduce.py` invocation to a persistent worker
speaking NDJSON over stdio: rules loaded once, crash restarts, identical
fail-open behavior. If the remaining cost is negligible, record the
measurement and skip - do not build it for its own sake. A TypeScript
in-process port is explicitly out of scope until a worker has been measured
insufficient.

Done when: either the worker shows a measured p50 improvement with all
failure modes still falling open to raw output, or a ledger row records the
measurement that made it unnecessary.

### T12: Reducer schema and corpus hygiene

Delete the dead `stderr` request field (the hook can never populate it) and
document `exit_code` as the isError flag it actually carries. Add a corpus
retention cap (age- or size-based) so `~/.cache/pi/tool-reduction/` stops
growing unbounded.

Done when: schema matches what the hook can send; reducer tests pass; old
corpus files age out in a dry-run test.

### T13: Retroactive context reduction (threshold-triggered)

Research finding (see `research/context-reduction-research.md`): the
validated industry pattern keeps tool results at full fidelity while fresh
and reduces them retroactively once old - Anthropic measured +29% task
performance and 84% fewer tokens with threshold-triggered clearing, and
recent-observation masking is known to hurt solve rates. Pi's `ContextEvent`
("fired before each LLM call, can modify messages") supports this, and the
session file retains full results on disk, making payload-side reduction
non-destructive by construction.

Add a retroactive pass in the tool-reduction extension: when context
crosses a threshold, replace tool results older than a keep-last-K window
in the outgoing payload with their deterministic compact form (same rules
as T8/T9) or a placeholder plus facts. Parameters are named constants in
one place with these defaults (tune only with measurement): context signal
reuses Pi's own accounting - the same signal that drives its
threshold-triggered compaction - never a homegrown token estimator;
trigger at roughly 50% of the model's context window (well before Pi's
compaction fires); keep-last-K = 5 tool results; minimum reclaim per pass
approximately 5,000 tokens (Anthropic's cache-economics guidance, research
item 1) - skip the pass entirely when less would be reclaimed. This pass covers all tool
results, not only bash: subagent and task results are the strongest
candidates (read once at synthesis, rarely referenced again) and reduce to
their status line plus artifact/session reference; results with a saved
artifact or child session are already recoverable by construction. Clear in
batches with a minimum reclaim amount - never a per-turn sliding window - to
protect provider prefix caching. Ingestion-time reduction then applies only to extreme
outputs (fallback clamp scale); routine output enters context whole and is
reduced when old.

Done when: a long scratch session shows full-fidelity recent results, batch
reduction of old results at the threshold, no reduction churn on
back-to-back turns (cache protection), and phase invariants 1 and 2 hold for
the retroactive path (raw remains in the session file).

## Phase E - close

### T14: Ledger close and validation

Verify every ledger row executed or explicitly deferred; run
`make check-pi-extensions` and the phase 1 changed-file validation CLI
(phase 1's T10) over touched files; exercise /do-it against a scratch plan
fixture confirming the new report contract end to end; record before/after
instruction byte counts next to phase 1's baselines.

Measure Phase D in its goal currency, not bytes alone: from corpus data,
record per-session tool-result bytes entering context before/after; if Pi
session files expose compaction events, record compaction frequency
before/after over a comparable window. Bytes saved is the proxy; slower
context growth is the goal.

Done when: ledger closed, aggregates pass, measurements recorded including
the Phase D context-growth numbers.

## Dependency graph

```text
T1 -> T2 (contract before telemetry ownership)
T3, T4 parallel (instruction files)   } -> T14
T5 -> T6 (audit informs which commands remain)
T7 independent (needs the phase 1 T10 CLI)
T10 -> T8 -> T9 -> T11 ; T12 independent (tool-reduction)
T8 -> T13 (retroactive layer reuses the rule engine)
Phases A, B, C, D are independent of each other.
```

## Out of scope

- Claude/OpenCode/Copilot surfaces.
- New telemetry schemas, evaluators, or enforcement frameworks.
- Model-routing changes (phase 1 T5 owns routing).
- The generic per-feature running-memory system (separate decision; the
  existing `.specs/<stub>/notes.md` pattern continues meanwhile).
- Per-project architecture invariants for other repositories (gcc_automation
  desired-state-only mutation, homelab-infra rollout/backup discipline,
  monorepo RDS-per-namespace). Those belong in each repo's own AGENTS.md,
  done in sessions on those repos; `research/friction-*.md` has the incident
  references to justify each one.
- Real bash exit codes and separate stderr in the reducer request: the Pi
  `tool_result` event does not expose them (verified against
  `dist/core/extensions/types.d.ts`); exposing them is an upstream Pi
  feature request, not repository work.
- Visible-skip fix for the tool-reduction e2e test (silent pass when python
  is unavailable): owned by the in-flight phase 1 T6 slice, not this plan.

## Execution status

Same maintenance rules as phase 1: statuses are `pending` |
`in-progress: <next step>` | `blocked: <reason>` | `done: <commit>`; update
and commit this file after every slice; resume from here, never re-derive.

### Task checklist

- [x] T1: /do-it report contract rewrite - done: validated slice commit pending
- [x] T2: telemetry ownership decision - done: validated slice commit pending
- [x] T3: pi/AGENTS.md meta-rule consolidation - done: validated slice commit pending
- [x] T4: one philosophy file - done: validated slice commit pending
- [x] T5: usage-driven skill/command/agent audit - done: validated slice commit pending
  - [x] usage data source verified; gaps covered by session-archive scan
  - [x] usage counts and ledger rows for every skill/command/agent
  - [x] pre-approved variant merges executed (skill-review trio collapsed)
  - [x] gated deletions: no distinct-role or nonzero-usage deletion selected
  - [x] retirements executed with reference cleanup
- [ ] T6: extension output-visibility rule - pending
- [ ] T7: hygiene-gate immutable-artifact exemptions - pending
- [ ] T8: shell-aware reducer classification - pending
- [ ] T9: reachable generic fallback - pending
- [ ] T10: self-describing reductions - pending
- [ ] T11: persistent reducer worker (decision-gated) - pending
- [ ] T12: reducer schema and corpus hygiene - pending
- [ ] T13: retroactive context reduction - pending
- [ ] T14: ledger close and validation - pending
  - [ ] every ledger row executed or explicitly deferred
  - [ ] `make check-pi-extensions` and changed-file CLI passed
  - [ ] scratch-plan /do-it exercised (new report contract end to end)
  - [ ] byte counts and Phase D context-growth numbers recorded

### State

- **State:** in progress
- **Current blocker:** none
- **Last completed gate:** T5 usage-driven surface audit and variant merge
- **Next:** T6 extension output-visibility audit
- **Completed work:** T1-T4 are committed. T5 recorded 30-day decisions for 52
  skills, 36 commands, and 18 audited agents; the user selected optional
  per-launch effort; the three approved skill-review variants now share one
  agent with explicit model and effort dispatch.
- **Commands/results:** focused subagent and skill-review suites passed 38 tests;
  Pi typecheck passed; skill-review smoke, pre/post validation, dry-run, and
  runner sequence passed with exact model/effort records; `git diff --check`
  passed.
- **Remaining checks:** commit T5, then T6-T14, final validation, and archive.
- **Exact user action:** none
- **Resume:** `/do-it .specs/rationalization-phase2/plan.md`
