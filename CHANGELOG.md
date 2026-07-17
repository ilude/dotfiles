# Changelog

This is the canonical changelog for repository configuration, client workflows, and Pi runtime changes.

## 2026-07-17: Account for every damage-control policy row

**Why:** The final uncovered Bash rows required valid domain commands or an
explicit explanation of why the actual hook can never reach that YAML branch.

**Changed:**
- Added 29 explicit positive commands for complex one-liners, xargs/parallel,
  cloud, Helm, tfvars, GitLab, SQL, and environment-file patterns.
- Added exact-ID waivers for semantic-Git precedence, Claude's read-only find
  bypass, node-wrapper unwrapping, and Linux-only rules on the Windows oracle.
- Waiver validation now supports exact ID selectors and rejects overlapping
  claims across waiver entries.

**Baseline:** All 592 rows are accounted for: 434 covered, 158 explicitly
waived, zero uncovered, 35 divergences, zero stale controls, and
`coverage_debt_count = 35`. No enforcement outcome changed.

**Validation:** Both focused Vitest cases, Ruff, Pi typecheck, Biome, and JSON
parsing passed.

**Files:** `pi/scripts/damage-control-claude-oracle.py`,
`pi/lib/damage-control-coverage.ts`, `shared/damage-control/coverage-waivers.json`,
`.specs/rationalization-phase5/plan.md`, `CHANGELOG.md`

---

## 2026-07-17: Refine generated policy witnesses

**Why:** Minimal regex witnesses could be syntactically incomplete and full
policy ordering shadowed three no-delete rows.

**Changed:**
- Witness selection now prefers a benign trailing argument before accepting a
  minimal regex match.
- Every no-delete fixture isolates its target path in both engines while still
  using the actual Claude no-delete stage and Pi matcher.
- Stable target IDs are retained when generic no-delete stages report a match.

**Baseline:** All 30 no-delete rows are covered; TMPDIR and kubectl probes now
agree. Totals are 406 covered, 140 waived, 46 uncovered, 34 divergences, zero
stale controls, and `coverage_debt_count = 80`.

**Validation:** Both focused Vitest cases, Ruff, Pi typecheck, and Biome passed.

**Files:** `pi/scripts/damage-control-claude-oracle.py`,
`pi/lib/damage-control-coverage.ts`, `.specs/rationalization-phase5/plan.md`,
`CHANGELOG.md`

---

## 2026-07-17: Generate isolated Bash-policy witnesses

**Why:** The tracked fixture corpus reached only a small fraction of 329
non-exfil Bash rules and full-policy ordering can hide later patterns.

**Changed:**
- Added a deterministic regex witness generator covering literals, classes,
  categories, repeats, branches, subpatterns, boundaries, and assertions.
- Each generated command is verified against its original Python regex, then
  evaluated with the corresponding rule isolated in Claude and Pi.
- Generated probes discover outcomes; only tracked manual fixtures act as
  expected-outcome negative controls.

**Baseline:** 465 fixtures now cover 401 rows; 140 rows are waived, 51 remain
uncovered, 36 diverge, no manual negative control is stale, and
`coverage_debt_count = 87`. Four newly exposed Bash divergences involve TMPDIR
cleanup, kubectl delete, and terraform state rm/mv; no outcome changed.

**Validation:** Both focused Vitest cases, Ruff, Pi typecheck, and Biome passed.

**Files:** `pi/scripts/damage-control-claude-oracle.py`,
`pi/lib/damage-control-coverage.ts`,
`pi/tests/damage-control-coverage.test.ts`,
`.specs/rationalization-phase5/plan.md`, `CHANGELOG.md`

---

## 2026-07-17: Cover all configured AST command rows

**Why:** AST safe/dangerous command lists are semantic policy inputs and need
engine-level evidence rather than loader-only credit.

**Changed:**
- Generated direct analyzer fixtures for all 14 configured safe commands and
  all 10 dangerous commands.
- Dangerous-command fixtures use unsafe variable arguments so the configured
  AST veto path is exercised; safe commands exercise the exact safe-list path.
- Claude's actual AST analyzer and Pi's analyzer now run side by side in the
  coverage report.

**Baseline:** All 24 AST rows are covered with no new divergence. Totals are
133 covered, 140 waived, 319 uncovered, 32 divergences, zero stale controls,
and `coverage_debt_count = 351`.

**Validation:** Both focused Vitest cases, Ruff, Pi typecheck, and Biome passed.

**Files:** `pi/scripts/damage-control-claude-oracle.py`,
`pi/lib/damage-control-coverage.ts`, `.specs/rationalization-phase5/plan.md`,
`CHANGELOG.md`

---

## 2026-07-17: Add generated path-policy oracle fixtures

**Why:** Aggregate path counts did not prove that each Claude path rule reaches
the equivalent Pi decision boundary.

**Changed:**
- The oracle now materializes a deterministic synthetic path for every
  zero-access, read-only, write-confirm, and no-delete policy row.
- Generated Edit and Bash vectors run through Claude's actual hook functions
  and Pi's ordered path/command checks with stable matched-rule IDs.
- The runner reports path divergences without changing enforcement outcomes.

**Baseline:** 141 fixtures now cover 109 rows; 140 rows remain explicitly
waived, 343 are uncovered, 32 diverge, no negative control is stale, and
`coverage_debt_count = 375`. The new divergences comprise three zero-access,
20 read-only, four write-confirm, and three no-delete vectors.

**Validation:** Both focused Vitest cases, Ruff, Pi typecheck, and Biome passed.

**Files:** `pi/scripts/damage-control-claude-oracle.py`,
`pi/lib/damage-control-coverage.ts`, `.specs/rationalization-phase5/plan.md`,
`CHANGELOG.md`

---

## 2026-07-17: Add explicit damage-control coverage waivers

**Why:** One-sided and unsupported policy families must be named and expanded
to stable IDs instead of remaining indistinguishable from missing fixtures.

**Changed:**
- Added seven reasoned waiver selectors for deferred exfiltration, injection,
  secret, context, read-confirmation, content-scan, and path-exclusion surfaces.
- The oracle runner now expands selectors to policy IDs, rejects empty,
  duplicate, unmatched, or covered waivers, and excludes only validated IDs
  from uncovered debt.
- Coverage output is concise by default; full row details are opt-in through
  `PI_DAMAGE_CONTROL_COVERAGE_DETAILS=1`.

**Baseline:** 13 covered rows, 140 explicitly waived rows, 439 uncovered rows,
two divergences, zero stale controls, and `coverage_debt_count = 441`.

**Validation:** Both focused Vitest cases passed; Pi typecheck, Biome, JSON
parsing, and plan lint passed.

**Files:** `shared/damage-control/coverage-waivers.json`,
`pi/lib/damage-control-coverage.ts`,
`pi/tests/damage-control-coverage.test.ts`,
`.specs/rationalization-phase5/plan.md`, `CHANGELOG.md`

---

## 2026-07-17: Add the damage-control oracle coverage runner

**Why:** Policy-source convergence needs a mechanical debt count showing which
Claude rules have proven Pi outcomes, rather than aggregate loader counts.

**Changed:**
- Added a Python subprocess adapter around Claude's actual Bash hook and tracked
  fixture/policy files.
- Added a TypeScript runner that inventories every policy row, evaluates the
  same fixtures through Claude and Pi, records stable covered IDs, and reports
  divergences, stale controls, uncovered rows, and total coverage debt.
- Added `pnpm run damage-control-coverage` and an opt-in zero-debt gate via
  `PI_DAMAGE_CONTROL_COVERAGE_GATE=1`.

**Baseline:** 592 inventory rows, 42 fixtures, 13 covered rows, 579 uncovered
rows, two wrapped root-delete divergences, zero stale controls, and
`coverage_debt_count = 581`.

**Validation:** The focused Vitest runner passed, Ruff passed for the oracle,
and Pi typecheck plus Biome passed.

**Files:** `pi/scripts/damage-control-claude-oracle.py`,
`pi/lib/damage-control-coverage.ts`,
`pi/tests/damage-control-coverage.test.ts`, `pi/package.json`,
`.specs/rationalization-phase5/plan.md`, `CHANGELOG.md`

---

## 2026-07-17: Record the damage-control loader boundary

**Why:** Canonical-policy cutover needs a measured inventory of what Pi already
loads, not an assumption that pointing at Claude's YAML provides parity.

**Recorded:**
- Pi's override, tracked-Claude, and legacy-source precedence, including the
  project-local precedence that only Claude currently applies.
- Exact loaded counts for command and path sections.
- The 24 exfiltration command entries, 19 mapping-shaped injection patterns,
  17 secret patterns, and two contexts that Pi currently skips or ignores.
- The rule that built-in protections count as coverage only after the oracle
  runner proves an equivalent outcome or records a waiver.

**Validation:** Parsed the tracked YAML for section shapes and counts, traced
`loadRules()` and `normalizeClaudePolicy()`, and confirmed the tracked-policy
loader test exercises the default source.

**Files:** `.specs/rationalization-phase5/plan.md`, `CHANGELOG.md`

---

## 2026-07-17: Validate shared decision logging end to end

**Why:** Unit coverage does not prove that confirmation responses, hard blocks,
and fail-open behavior survive each client's real process boundary.

**Validated:**
- Pi persistent RPC recorded allow, approved ask, denied ask, and hard block
  outcomes from four model-requested tools, with the synthetic token scrubbed.
- Pi still completed a safe Bash tool when its decision-log destination was a
  regular file.
- Bare-Python Claude hook invocations recorded all four knowable outcomes and
  left no pending asks.
- Claude preserved allow, ask, and block exit/output behavior when its log
  destination was a regular file.

**Files:** `.specs/rationalization-phase5/plan.md`, `CHANGELOG.md`

---

## 2026-07-17: Correlate Claude decisions in the shared audit log

**Why:** Claude PreToolUse knows the enforcement action but does not receive a
manual confirmation result, so asks need conservative cross-hook correlation.

**Changed:**
- Claude Bash, Edit, and Write PreToolUse hooks now record final allows and hard
  blocks or stage secret-scrubbed asks by session and tool-use ID.
- PostToolUse and PostToolUseFailure settle staged asks as approved; SessionEnd
  records unmatched asks as `denied_or_abandoned` rather than inferring denial.
- Added exact or estimated latency labels, fail-open pending storage, and hook
  registration for all correlation events.

**Validation:** All 763 Claude damage-control tests passed with one skipped;
Ruff passed. Direct bare-`python` hook invocations produced all four knowable
Claude outcomes in one shared monthly log, scrubbed a synthetic token, and left
no pending rows.

**Files:** `claude/hooks/damage-control/{decision_audit.py,bash-tool-damage-control.py,edit-tool-damage-control.py,write-tool-damage-control.py}`,
`claude/hooks/damage-control/tests/{conftest.py,test_decision_audit.py}`,
`claude/settings.json`, `.specs/rationalization-phase5/plan.md`, `CHANGELOG.md`

---

## 2026-07-17: Feed Pi decisions into the shared audit log

**Why:** The shared schema only becomes operational when enforcement handlers
record the final outcome they directly observe.

**Changed:**
- Pi now records unmatched allows, approved and denied confirmation requests,
  and hard blocks with session/tool-call correlation and exact handler latency.
- All Bash, PowerShell, and file-tool enforcement branches use the shared
  fail-open writer without replacing the existing permission and eval streams.
- Damage-control session start compresses aged monthly logs.

**Validation:** The 87-test Pi damage-control suite passed, including one
handler-level exercise that produced and secret-checked all four shared outcomes
(`allow/not_applicable`, `ask/approved`, `ask/denied`, and
`block/not_present`). Pi typecheck and Biome passed.

**Files:** `pi/extensions/damage-control.ts`,
`pi/tests/damage-control.test.ts`, `.specs/rationalization-phase5/plan.md`,
`CHANGELOG.md`

---

## 2026-07-17: Add the shared damage-control decision schema

**Why:** Pi and Claude need one bounded, secret-scrubbed audit row before their
different enforcement runtimes can feed the same tuning loop.

**Changed:**
- Added the canonical JSON schema for client, correlation, rule, action,
  user-decision, and latency fields.
- Added fail-open TypeScript and Python writers targeting
  `~/.local/share/damage-control/decisions-YYYY-MM.jsonl` with a test override.
- Added matching secret scrubbing, field bounds, monthly files, and 30-day gzip
  compression without loss of the compressed decision data.

**Validation:** Three Python and four Pi tests verified required schema fields,
monthly paths, redaction and bounds, invalid/unwritable fail-open behavior, and
gzip content preservation. Ruff, Pi typecheck, and Biome passed.

**Files:** `shared/damage-control/{decision.schema.json,decision_log.py}`,
`pi/{lib/damage-control-decision-log.ts,tests/damage-control-decision-log.test.ts}`,
`test/test_damage_control_decision_log.py`,
`.specs/rationalization-phase5/plan.md`, `CHANGELOG.md`

---

## 2026-07-17: Record damage-control decision knowability

**Why:** A shared decision schema cannot truthfully label user outcomes until
both clients' hook and confirmation boundaries are verified.

**Changed:**
- Recorded which allow, ask, and block outcomes Pi knows directly from its
  `tool_call` handler and confirmation result.
- Recorded Claude's PreToolUse-to-PostToolUse correlation boundary: execution
  proves approval, while a manually denied or abandoned ask remains
  indistinguishable without a matching post event.
- Defined conservative labels for not-applicable, not-present, approved,
  denied, and denied-or-abandoned outcomes before implementation.

**Validation:** Verified Pi's existing permission/eval writers and direct
`ctx.ui.confirm()` branches, inspected all three Claude damage-control
PreToolUse scripts and current hook registration, and checked Anthropic's hook
reference for common IDs plus PostToolUse/PostToolUseFailure correlation.

**Files:** `.specs/rationalization-phase5/plan.md`, `CHANGELOG.md`

---

## 2026-07-17: Add the manual improvement-report entry point

**Why:** The deterministic report existed as an internal script but lacked the
single operator workflow required to run the improvement loop.

**Changed:**
- Added `/improve report` to run the repository report generator and return its
  path without starting a provider turn.
- Added `scripts/improvement-report` as the cross-repository thin wrapper.
- Documented the three-step manual loop once in Pi's development philosophy:
  run the report, select user-approved plan slices, and add a timer only after
  two valuable manual cycles plus an explicit request.

**Validation:** Six focused Python tests and 44 Pi workflow-friction tests passed
with Ruff, Biome, and Pi typecheck. A persistent live RPC invocation ran
`/improve report`, returned `.specs/improvement-reports/2026-07-17.md` in a
visible command message, and emitted zero `agent_start` events.

**Files:** `pi/{AGENTS.md,README.md,extensions/workflow-friction-review.ts,tests/workflow-friction.test.ts}`,
`scripts/improvement-report`, `test/test_improvement_report.py`,
`.specs/rationalization-phase4/plan.md`, `CHANGELOG.md`

---

## 2026-07-17: Generate the evidence-backed improvement report

**Why:** Friction, usage, routing experiments, plan consistency, and dormant
specs were separate evidence streams with no deterministic proposal boundary.

**Changed:**
- Added one Python report generator for routing cells, session friction signals,
  command/skill/agent usage, active-plan lint, and 60-day `.specs/` hygiene.
- Ordered deletion and consolidation proposals before additions and limited
  additions so they never outnumber deletion candidates.
- Treated absent metrics, sessions, friction metadata, routing cells, skill
  events, and phase 5 decision logs as explicit coverage notes.
- Added the May 2026 audit comparison and refused routing conclusions below 30
  runs per arm.
- Generated the first real-data report at
  `.specs/improvement-reports/2026-07-17.md`.

**Validation:** Five focused tests cover nearest-rank aggregation, quality/time/
token/cost cells, report ordering, low-sample refusal, missing sources, and
slash-echo command accounting. Ruff passed. Real-data inspection confirmed
active `/do-it` and `/commit` usage is counted, all required report sections are
ordered, and the empty routing table makes no conclusion.

**Files:** `pi/scripts/improvement-report.py`, `test/test_improvement_report.py`,
`.specs/{improvement-reports/2026-07-17.md,rationalization-phase4/plan.md}`,
`CHANGELOG.md`

---

## 2026-07-17: Sample policy-resolved routing outcomes

**Why:** Terra, Luna-high, and Sol-low dispatch choices lacked controlled outcome
data covering quality, speed, and cost.

**Changed:**
- Added deterministic 10 percent assignment across data-defined Terra-medium,
  Luna-high, and Sol-low arms for policy-resolved `modelSize` dispatches.
- Kept explicit model and effort choices, continuation calls, and rate-zero
  routing on the unsampled path.
- Tagged sampled subagent and durable-task worker telemetry with experiment,
  arm, task class, and available validation outcome while reusing existing exit,
  duration, turn, token, and cost fields.
- Added `PI_ROUTING_OUTCOME_SAMPLE_RATE` as the bounded zero-to-one kill and
  sampling-rate control.

**Validation:** Deterministic assignment over 10,000 keys landed within the
configured-rate tolerance and covered all arms. Focused integration tests
verified selected model/effort and telemetry for direct and durable-task
workers, explicit override exclusion, missing-arm fallback, and byte-identical
rate-zero model resolution. Seventy-six focused tests, Pi typecheck, and Biome
passed.

**Files:** `pi/{lib/model-routing.ts,lib/orchestration-telemetry.ts,lib/task-registry.ts,extensions/subagent/index.ts,extensions/tasks/execution.ts,docs/orchestration-telemetry.md,tests/model-routing.test.ts,tests/subagent.test.ts,tests/task-execution.test.ts}`,
`.specs/rationalization-phase4/plan.md`, `CHANGELOG.md`

---

## 2026-07-17: Enforce durable plan state before `/do-it`

**Why:** Checked tasks, State blocks, and final reports could contradict Git or
each other, allowing fresh sessions to inherit false completion claims.

**Changed:**
- Added a deterministic `plan-lint` CLI that verifies checked-task commit
  hashes, in-progress next steps, checklist/State agreement, and optional report
  status claims.
- Made `/do-it` stop before dispatch when plan lint fails and display the named
  violations without starting a provider turn.
- Required final workflow reports to use plan-lint's canonical report state and
  documented the two-commit transition for newly completed task hashes.

**Validation:** Eight focused Python tests and eight Pi workflow tests passed,
along with Ruff, Pi typecheck, and Biome. Standalone lint passes the active
phase 4 plan and flags archived phase 2 T14's missing close commit. A live RPC
`/do-it` invocation surfaced that violation and emitted zero `agent_start`
events.

**Files:** `pi/{scripts/plan-lint,extensions/workflow-commands.ts,skills/workflow/do-it.md,tests/workflow-dispatch.test.ts,tests/workflow-skills.test.ts}`,
`test/test_plan_lint.py`, `.specs/rationalization-phase4/plan.md`, `CHANGELOG.md`

---

## 2026-07-17: Clear the phase 4 and phase 5 execution gates

**Why:** Both plans still recorded phase 2 as executing after phases 2 and 3 had
been validated and archived.

**Changed:**
- Reconciled both durable State blocks with the archived plan evidence.
- Marked phase 4 and phase 5 ready and recorded each next dependency-ready T1.

**Validation:** Confirmed completed plans exist at
`.specs/archive/rationalization-phase{2,3}/plan.md`; both active plans now have
no recorded blocker and retain pending implementation checklists.

**Files:** `.specs/{rationalization-phase4/plan.md,rationalization-phase5/plan.md}`,
`CHANGELOG.md`

---

## 2026-07-17: Validate the phase 3 orchestration workflow

**Why:** Phase 3 required one live workflow proving its capabilities compose,
not only isolated unit coverage.

**Changed:**
- Recorded the final decisions for notification timing, continuation retention,
  worktree leases, DAG scheduling, and structured chain transfer.
- Ran an ignored `/do-it` scratch plan through persistent Pi RPC so a later user
  turn could receive queued background completion messages.

**Validation:** `make check-pi-extensions` passed 98 test files with 1,356 tests
passing and one skipped. The live session used one task batch and one drain,
automatically released a dependent task, recalled a fact through a persisted
subagent continuation, and reported both queued completion notifications on a
later turn with zero verification tool calls.

**Files:** `.specs/archive/rationalization-phase3/plan.md`, `CHANGELOG.md`

---

## 2026-07-17: Validate structured subagent output

**Why:** Subagent results crossed the process boundary as unvalidated prose, so
chains could silently forward malformed or re-summarized data.

**Changed:**
- Added optional `outputSchema` validation to every subagent mode and returned
  parsed values in result details.
- Reused typed-agent schema parsing and allowed exactly one correction through
  the child's persisted continuation session before returning a typed failure.
- Forwarded normalized objects through chains and automatically used artifact
  references for structured payloads larger than 8 KB.
- Preserved the existing launch and output paths when no schema is supplied.

**Validation:** Thirty-four focused subagent tests covered valid output, one
successful correction, correction exhaustion, normalized chain transfer, bulky
artifact transfer, and unchanged schema-less behavior. Eight typed-agent tests,
Pi extension typecheck, focused Biome checks, and `git diff --check` passed.

**Files:** `pi/{extensions/subagent/index.ts,lib/typed-agent.ts,tests/subagent.test.ts}`,
`.specs/rationalization-phase3/plan.md`, `CHANGELOG.md`

---

## 2026-07-17: Hand plan execution to the DAG drain

**Why:** `/do-it` still instructed the model to pump dependency waves even after
the scheduler could own readiness, ordering, and writer safety.

**Changed:**
- Replaced wave-by-wave execution prose with one graph-aware `task batch`
  handoff using stable keys, dependency keys, and writer scopes.
- Directed background work through `task drain`, completion notifications, and
  explicit starvation state while retaining direct execution for ready manual
  tasks.
- Added the planning rule that overlapping same-file writes must be combined or
  connected by a dependency edge.

**Validation:** Focused workflow contract tests verified the batch, dependency,
scope, drain, and same-file instructions and rejected the retired wave-by-wave
phrase. Pi typecheck and focused Biome checks passed.

**Files:** `pi/{skills/workflow/do-it.md,skills/workflow/plan-it.md,tests/workflow-skills.test.ts}`,
`.specs/rationalization-phase3/plan.md`, `CHANGELOG.md`

---

## 2026-07-17: Add the opt-in task DAG drain

**Why:** Dependency graphs still required the model to dispatch each ready wave
and reason about safe writer concurrency.

**Changed:**
- Added an opt-in `task drain` action with default concurrency four and an
  explicit one-to-eight bound.
- Rescanned the durable graph after each completion so newly unblocked and
  mid-drain tasks dispatch automatically until quiescence.
- Parallelized read-only agents from enforced tool capabilities, serialized
  overlapping and scope-less writers, and ordered ready work by longest
  downstream dependency path with stable ties.
- Continued independent branches after failures and returned explicit
  starvation records naming failed, cancelled, missing, or tombstoned blockers.

**Validation:** The fixture DAG exercised a diamond, independent deliberate
failure, overlapping writers, parallel readers, a task created mid-drain, and a
failed dependent. It verified critical-path-first start, measured parallelism,
writer serialization, dynamic dispatch, independent completion, and starvation.
Forty-three focused execution, public task-tool, and scheduler tests passed with
Pi typecheck and Biome checks.

**Files:** `pi/{extensions/tasks.ts,extensions/tasks/execution.ts,README.md,tests/task-execution.test.ts,tests/task-tools.test.ts}`,
`.specs/{rationalization-phase3/plan.md,archive/pi-orchestration-follow-ups/note.md}`,
`CHANGELOG.md`

---

## 2026-07-17: Add deterministic task scheduling primitives

**Why:** The upcoming opt-in DAG drain needs durable write scopes, mechanical
tool mutability, conflict checks, and critical-path ordering rather than model
judgment.

**Changed:**
- Added optional worktree-relative `scope` paths and globs to task create,
  batch, update, and durable records.
- Added central read, execute, and mutate capability declarations for
  launcher-enforced tools; undeclared and default tool sets remain
  conservatively mutating.
- Added pure scheduling primitives for read-only derivation, conservative scope
  overlap, scope-less writer conflicts, and stable longest-downstream-path
  ordering.

**Validation:** Sixty focused registry, public task-tool, capability, and
scheduler tests passed. They covered scope persistence and rejection,
create/batch/update compatibility, writer serialization decisions, reader
parallelism, unknown-tool safety, and diamond critical-path ordering. Pi
extension typecheck and focused Biome checks passed.

**Files:** `pi/{lib/task-registry.ts,lib/tool-capabilities.ts,lib/task-scheduler.ts,extensions/tasks.ts,tests/task-registry.test.ts,tests/task-tools.test.ts,tests/tool-capabilities.test.ts,tests/task-scheduler.test.ts}`,
`.specs/rationalization-phase3/plan.md`, `CHANGELOG.md`

---

## 2026-07-17: Validate cross-client worktree occupancy

**Why:** Live Pi/Claude validation exposed a Windows stale-process edge case and
was required to prove warnings and cleanup across the actual client entrypoints.

**Changed:**
- Treated Windows `os.kill(pid, 0)` invalid-parameter results as an absent
  process identity during stale lease recovery.
- Added a regression fixture for invalid process identifiers.

**Validation:** A live Claude hook and Pi RPC session in one scratch worktree
both reported `instances 2 !` and received the separate-worktree warning on the
next model turn. Equivalent sessions in separate worktrees remained at
`instances 1` without warnings. Clean shutdown removed both leases, simulated
crash expiry removed the dead lease, and real lease activity left Git status
unchanged. Ten focused helper and cross-client tests passed with Ruff checks.

**Files:** `scripts/agent_instance_lease.py`,
`test/test_agent_instance_lease.py`,
`.specs/rationalization-phase3/plan.md`, `CHANGELOG.md`

---

## 2026-07-17: Wire Claude worktree occupancy

**Why:** Cross-client concurrency remained silent until Claude Code joined the
same worktree lease registry and exposed occupancy in its context and status
line.

**Changed:**
- Registered and refreshed Claude leases through `SessionStart` and
  `UserPromptSubmit`, with identity-checked release through `SessionEnd`.
- Added same-worktree context warnings and instance counts to both Python and
  compiled-binary status-line paths.
- Reused the shared helper for atomic registration, stale recovery, and
  separate-worktree boundaries; hook and status failures remain fail-open.

**Validation:** Focused fixtures covered Pi/Claude same-worktree detection,
separate-worktree non-warning, context injection, prompt refresh, status display,
clean release, and settings lifecycle wiring. Eight shared-helper and Claude
fixtures passed with Ruff lint and format checks; settings JSON parsed cleanly.

**Files:** `claude/{hooks/agent_instances.py,claude-status,settings.json}`,
`test/test_claude_agent_instances.py`, `CLAUDE.md`,
`.specs/rationalization-phase3/plan.md`, `CHANGELOG.md`

---

## 2026-07-17: Wire Pi worktree occupancy

**Why:** The shared lease registry needed a Pi lifecycle owner and visible
warning before it could prevent silent same-worktree concurrency.

**Changed:**
- Registered primary Pi sessions at startup, refreshed their leases once per
  minute, and released them on clean shutdown.
- Excluded nested subagent processes from instance occupancy.
- Added an instance-count status and a next-turn context warning when another
  active agent session occupies the same worktree.
- Kept helper failures fail-open and cleared timers and status on shutdown.

**Validation:** Focused extension tests covered conflict and sole-occupant
status, bounded warning delivery, heartbeat refresh, clean release, nested-child
exclusion, failure behavior, and timer cleanup. Pi typecheck and focused Biome
checks passed.

**Files:** `pi/{extensions/agent-instances.ts,tests/agent-instances.test.ts,README.md}`,
`.specs/rationalization-phase3/plan.md`, `CHANGELOG.md`

---

## 2026-07-17: Add the shared worktree lease registry

**Why:** Pi and Claude need one deterministic coordination boundary before
either client can warn about concurrent modifying sessions in the same Git
worktree.

**Changed:**
- Added a cross-platform lease helper with atomic registration, heartbeat,
  status, and identity-checked release operations.
- Recorded bounded per-session JSON leases under each worktree's ignored
  `.agent-instances/` directory.
- Added shared stale cleanup semantics: an expired lease is removed only when
  its recorded process is absent or its start identity no longer matches;
  malformed records are reported and retained.

**Validation:** Five focused fixtures covered simultaneous Pi/Claude
registration, idempotency, separate-worktree isolation, live-process retention,
crash expiry, malformed records, heartbeat, release, and CLI status. Ruff lint
and format checks passed, and Git confirmed lease files are ignored.

**Files:** `scripts/agent_instance_lease.py`,
`test/test_agent_instance_lease.py`, `.gitignore`,
`.specs/rationalization-phase3/plan.md`, `CHANGELOG.md`

---

## 2026-07-17: Remove unenforced agent metadata

**Why:** Agent frontmatter advertised isolation and memory behavior that the
subagent launcher never enforced.

**Changed:**
- Removed `isolation` and `memory` from the agent parser and task metadata.
- Removed both fields from all repository-owned agent definitions.
- Updated the agent configuration reference to list only launcher-enforced
  fields; unknown frontmatter remains non-contractual.

**Validation:** Repository agent definitions and the subagent implementation no
longer contain either field. A focused fixture proved legacy frontmatter is
ignored and does not enter task records. Subagent tests, Pi typecheck, and
focused Biome checks passed.

**Files:** `pi/{extensions/subagent/agents.ts,extensions/subagent/index.ts,agents/,tests/subagent.test.ts,README.md}`,
`.specs/rationalization-phase3/plan.md`, `CHANGELOG.md`

---

## 2026-07-17: Add continuable subagent sessions

**Why:** Delegated follow-ups restarted from a cold context because child
processes were always ephemeral and left no session trail.

**Changed:**
- Added opt-in persisted child sessions and a continue mode that resumes a
  specific session through Pi's supported headless `--session` path.
- Stored the child session path in tool details, parent-visible output, and the
  task record while preserving ephemeral behavior by default.
- Compressed delegated sessions after 30 days without deleting session data,
  restored compressed sessions before continuation, and taught the friction
  scanner to read recursive plain or gzip session files.

**Validation:** A live child retained the private fact `violet-orbit` across a
separate follow-up process. Focused tests covered ephemeral parity, session
persistence, task metadata, compressed-session continuation, and age-based dry
runs. The compressed friction-scanner fixture was discovered and read. Pi
focused tests, typecheck, Biome checks, and Python lint/format checks passed.

**Files:** `pi/{extensions/subagent/index.ts,tests/subagent.test.ts}`,
`.specs/{rationalization-phase3/plan.md,archive/rationalization-phase2/research/friction-scan.py}`,
`CHANGELOG.md`

---

## 2026-07-17: Surface active work and schedule process-local prompts

**Why:** The compact footer buried active loop and task state behind provider
cost, while delayed follow-up prompts required an external scheduler.

**Changed:**
- Ordered compact footer status as loop, active tasks, other runtime state, and
  two-decimal Bedrock cost, with explicit separators.
- Added known loop iteration totals and replaced synchronous interval polling
  with non-overlapping asynchronous reads that render only changed values.
- Added `/at`, `/cron`, and `/schedule list|cancel` on Croner for process-local
  scheduled prompts that survive session replacement but stop with Pi.
- Added a model-callable `schedule` tool with TUI confirmation for create and
  cancel actions, bounded prompts, and rejection of scheduled slash commands.

**Validation:** Pi typecheck, focused Biome checks, and all 38 focused footer,
loop, poller, Bedrock, and scheduler tests passed. A stateful Pi RPC smoke test
created one-shot and recurring jobs, listed them before and after session
replacement, cancelled both, and confirmed the final list was empty.

**Files:** `pi/extensions/{bedrock-cost.ts,loop.ts,operator-status.ts,scheduler.ts}`,
`pi/lib/{async-poller.ts,process-scheduler.ts}`, focused tests,
`pi/{package.json,pnpm-lock.yaml,README.md}`, `CHANGELOG.md`

---

## 2026-07-17: Notify sessions when background tasks finish

**Why:** Background fan-out required a blocking join to learn when workers
finished, even though task state and output were already persisted.

**Changed:**
- Sent compact completion, failure, and cancellation messages to the parent
  session through Pi's sanctioned next-turn message path.
- Capped notification content at 500 UTF-8 bytes and included task, agent,
  status, duration, and an output artifact path or first-line result.
- Kept delivery fail-open so notification errors cannot change task state or
  make persisted output unavailable.
- Updated task guidance to reserve `await` for calls that must join immediately.

**Validation:** The task extension fan-out workflow started two background
workers without `await` and received one next-turn notification for each,
including the failed worker. Focused tests also covered cancellation, byte
capping, delivery failure, state consistency, and output retrieval. All 37
task execution and public task-tool tests, Pi typecheck, and focused Biome
checks passed.

**Files:** `pi/{extensions/tasks.ts,extensions/tasks/execution.ts,tests/task-execution.test.ts}`,
`.specs/rationalization-phase3/plan.md`, `CHANGELOG.md`

---

## 2026-07-17: Add a resumable plan loop

**Why:** Long plan sets need bounded unattended progress that survives individual
worker exits without turning user-decision gates into repeated calls.

**Changed:**
- Added `/loop start|status|stop|resume` with atomic local job records and
  process-tree control.
- Added a five-second footer refresh that shows the live loop job and iteration,
  omits dead supervisors, and clears on shutdown or reload.
- Made the Dolos pre-commit hook treat linked worktrees without `private/` as
  artifact-only checkouts after staged-path scanning, so unrelated validated
  commits do not require a private identity key.
- Added a PowerShell supervisor that resumes one dedicated Pi session, retries
  failed invocations with bounded backoff, and stops after repeated no-progress
  iterations.
- Set the default loop budget to 100 iterations while retaining earlier stops
  for completion, user gates, repeated no-progress, and invocation failures.
- Added schema-versioned loop lifecycle records with supervisor and child Pi
  PIDs, correlation fields, durations, exit codes, output/session sizes, retry
  scheduling, and terminal stop reasons.
- Limited each iteration to one validated slice and one exact-path conventional
  commit, with no pushes or broad staging.
- Added a reusable prompt that routes around independent gated work and reports
  progress, quiescence, or blockage through a bounded status marker.

**Validation:** Eight focused command and runtime-logging tests, typecheck,
PowerShell parsing, and the no-provider dry run passed. The dry run resolved the
workspace, runtime state, plan files, worktree extension paths, and Pi command
without creating a session. An isolated one-iteration supervisor run emitted
the expected start, invocation, iteration, and quiescent-stop records with
populated timing, exit, and size fields.

**Files:** `pi/extensions/{loop.ts,loop/runtime-logging.ts}`,
`pi/scripts/{run-loop.ps1,loop-prompt.md}`, `pi/tests/loop.test.ts`,
`pi/README.md`, `scripts/git-hooks/pre-commit-dolos`,
`test/test_private_archive.py`, `CHANGELOG.md`

---

## 2026-07-17: Reduce old tool results in context batches

**Why:** Reducing routine tool output as it arrived removed evidence while it was
most useful and rewrote the provider payload more often than necessary.

**Changed:**
- Kept routine tool results whole until Pi reports at least 50% context usage,
  while retaining ingestion-time reduction for outputs at or above 64 KiB.
- Reduced only results older than the five-result recency window, in batches
  reclaiming approximately 5,000 tokens, with another batch gated on 5,000
  additional Pi-accounted context tokens.
- Applied the same deterministic reducer to Bash and custom tool results, kept
  transient worker failures retryable, and preserved the five newest results
  across session-tree changes.
- Added markers naming the readable session file and tool-call locator; the
  outgoing payload changes without mutating the full session transcript.

**Validation:** Seventeen focused extension tests passed, including threshold,
recency, batch stability, transient recovery, and transcript recovery cases.
Pi typecheck passed. Thirty-one reducer guard, reduction, and shell
classification tests passed; the combined reducer/dispatch run passed 21 tests.

**Files:** `pi/{extensions/tool-reduction.ts,tests/tool-reduction.test.ts}`,
`.specs/rationalization-phase2/{plan,ledger}.md`, `CHANGELOG.md`

---

## 2026-07-17: Keep the reducer worker alive

**Why:** Even after lazy rule loading, starting Python for every reduced Bash
result cost hundreds of milliseconds per call.

**Changed:**
- Added a serialized persistent `reduce.py --worker` NDJSON mode with rules
  loaded once.
- Reused one worker per extension instance, restarted after crashes, failed open
  for the current request, and cleaned the process tree on session shutdown.
- Preserved byte-identical one-shot CLI output and all marker/recovery behavior.

**Validation:** Python worker parity tests passed 8 tests; Pi reducer behavior
passed 13 tests and typecheck passed. Measured p50 improved from 329.9 ms
one-shot to 9.7 ms persistent, a 97.1% reduction. Ruff and
`git diff --check` passed.

**Files:** `pi/{extensions/tool-reduction.ts,tests/tool-reduction.test.ts,tool-reduction/}`,
`.specs/rationalization-phase2/{plan,ledger}.md`, `CHANGELOG.md`

---

## 2026-07-17: Enable the generic reducer fallback

**Why:** The generic fallback rule existed but was unreachable through the lazy
argv index, so large unknown output passed through unchanged.

**Changed:**
- Lazy-loaded the generic fallback as the last rule after all command-specific
  rules.
- Preserved shell normalization before fallback selection and kept tiny output
  raw through the existing guard.
- Extended replay and focused tests for unknown large and tiny output.

**Validation:** Thirty focused reducer/evaluator tests passed. Replay over
32,097 records reached 99.94% matching with 20 empty-argv records unmatched and
zero failure-survival failures. Unknown-command p50 was 335.3 ms, below the
recorded 524 ms baseline. Ruff and `git diff --check` passed.

**Files:** `pi/tool-reduction/{rules.py,reduce.py,evaluate.py,tests/}`,
`.specs/rationalization-phase2/{plan,ledger}.md`, `CHANGELOG.md`

---

## 2026-07-17: Align reducer schema and retention

**Why:** The reducer request claimed separate stderr and real exit-code data the
Pi hook cannot provide, while daily corpus files grew without a cap.

**Changed:**
- Removed the dead stderr request field and documented `exit_code` as Pi's
  boolean error flag encoded as 0 or 1.
- Stopped writing stderr samples in new corpus records while retaining legacy
  corpus readability.
- Added seven-day and 64 MiB corpus retention on the first daily write, with a
  non-mutating dry-run mode.

**Validation:** All 153 tool-reduction Python tests passed; the Pi reducer suite
passed 10 tests and typecheck passed. A real cache dry run selected 67 expired
files while leaving all 73 files unchanged. Ruff and `git diff --check` passed.

**Files:** `pi/{extensions/tool-reduction.ts,tests/tool-reduction.test.ts,tool-reduction/}`,
`.specs/rationalization-phase2/{plan,ledger}.md`, `CHANGELOG.md`

---

## 2026-07-17: Add shell-aware reducer fallback

**Why:** Environment assignments, shell preambles, directory leaders, chained
segments, and pipelines hid commands from reducer rules.

**Changed:**
- Added bounded shell-shape normalization only after the original argv fails to
  match, preserving all currently matched commands.
- Added verbatim failure-line survival and nonzero-exit fall-through guards.
- Added corpus replay metrics and the project Python floor.

**Validation:** Focused reducer/evaluator suites passed 39 tests. Corpus replay
processed 32,081 records, increased match rate from 52.12% to 59.48%, newly
matched 2,367 entries, and reported zero failure-survival failures. The plan's
65% gate remains unmet; the residual top ten is recorded in the phase ledger.

**Files:** `pi/tool-reduction/`,
`.specs/rationalization-phase2/{plan,ledger}.md`, `CHANGELOG.md`

---

## 2026-07-17: Make tool reductions recoverable

**Why:** Reduced Bash output did not identify the reducer or provide a path back
to the full raw result.

**Changed:**
- Appended bytes, rule ID, and raw-output recovery path to every applied
  reduction.
- Reused Pi's full-output path for truncated results and saved reducer-only raw
  output under the local tool-reduction cache.
- Added a seven-day and 64 MiB raw-output cap plus `PI_TOOL_REDUCTION=off`.

**Validation:** The real reducer fixture and mocked Pi-truncated/reducer-only
paths passed; cited files contained the full raw output. Toggle, age retention,
size cap, failure fall-through, and process cleanup coverage passed in the
10-test reducer suite; Pi typecheck and `git diff --check` passed.

**Files:** `pi/extensions/tool-reduction.ts`,
`pi/tests/tool-reduction.test.ts`,
`.specs/rationalization-phase2/{plan,ledger}.md`, `CHANGELOG.md`

---

## 2026-07-17: Protect immutable artifacts from hygiene checks

**Why:** Generic formatting validation previously changed an applied migration
checksum and broke deployment.

**Changed:**
- Added declared immutable-path patterns for migrations and Flyway artifacts.
- Made the explicit-file quality CLI report matching paths and skip validators
  without modifying the file.
- Added the immutable-artifact rule to `/commit`.

**Validation:** The quality-validation suite passed 52 tests. The exact
`scripts/quality-check` workflow reported an intentionally malformed migration,
left its SHA-256 unchanged, and validated a non-exempt Python file normally.
Ruff and `git diff --check` passed.

**Files:** `claude/hooks/quality-validation/`, `pi/skills/workflow/commit.md`,
`.specs/rationalization-phase2/{plan,ledger}.md`, `CHANGELOG.md`

---

## 2026-07-17: Persist visible command output

**Why:** Three `/improve` branches rendered help or state only through UI
notifications, leaving the model unable to observe what the user saw.

**Changed:**
- Added the model-visible output rule to the Pi command-authoring skill.
- Routed `/improve help`, unsupported input, and empty-candidate results through
  the command's visible transcript message path.
- Audited all 21 command-owning extensions; no other violation remained.

**Validation:** Slash-command echo and workflow-friction suites passed 45 tests;
Pi typecheck and `git diff --check` passed.

**Files:** `pi/skills/pi-command/SKILL.md`,
`pi/extensions/workflow-friction-review.ts`,
`pi/tests/workflow-friction.test.ts`,
`.specs/rationalization-phase2/{plan,ledger}.md`, `CHANGELOG.md`

---

## 2026-07-17: Merge skill-review agent variants

**Why:** Three agent definitions differed only by model and thinking effort.

**Changed:**
- Added optional per-launch `effort` overrides for single, parallel, and chain
  subagents, with explicit values taking precedence over frontmatter.
- Merged three skill-review variants into one `skill-review` agent while
  preserving exact model and effort dispatch records.
- Recorded 30-day usage decisions for all 52 skills, 36 extension commands,
  and 18 audited agents.

**Validation:** Focused subagent and skill-review suites passed 38 tests; Pi
typecheck and the full skill-review smoke/validate/runner sequence passed.

**Files:** `pi/{agents,extensions,lib,scripts,tests,README.md}`,
`.specs/rationalization-phase2/{plan,ledger}.md`, `CHANGELOG.md`

---

## 2026-07-17: Centralize Pi development philosophy

**Why:** General implementation and delegation policy was repeated across
always-loaded instructions and activation-triggered skills.

**Changed:**
- Made `pi/AGENTS.md` the always-loaded owner for flexible workflows,
  deterministic mechanics, code-focused tests, linter ownership, root-cause
  work, minimal instructions, and delegation boundaries.
- Replaced delegation policy in `pi/PI-INSTRUCTIONS.md` with a pointer.
- Reduced five overlapping skills to their distinct activation boundary and a
  pointer to the owner; removed fixed-count brainstorming ceremony.

**Validation:** Repository searches found one full philosophy and delegation
policy owner. Touched instruction/skill bytes decreased from 25,141 to 19,198;
`git diff --check` passed.

**Files:** `pi/{AGENTS.md,PI-INSTRUCTIONS.md,skills/}`,
`.specs/rationalization-phase2/{plan,ledger}.md`, `CHANGELOG.md`

---

## 2026-07-17: Consolidate Pi execution meta-rules

**Why:** Overlapping ask, authorization, confidence, and response-format rules
encouraged ceremony and repeated scope gates.

**Changed:**
- Replaced four ask/execute rules with one execution rule covering ambiguity,
  access, scope, denials, safety gating, and accepted risk.
- Reduced confidence calibration and unresolved-choice handling to their
  underlying values.
- Removed hedge-word, fixed-option, question-format, and issue-counter rituals.

**Validation:** `pi/AGENTS.md` decreased from 10,909 to 8,627 bytes; searches
found none of the retired rule names or presentation tokens, and
`git diff --check` passed.

**Files:** `pi/AGENTS.md`, `.specs/rationalization-phase2/{plan,ledger}.md`,
`CHANGELOG.md`

---

## 2026-07-17: Make workflow telemetry runtime-owned

**Why:** Workflow prompts prescribed detailed telemetry that runtime code never
emitted, so plans accumulated schema-shaped prose with no reliable consumer.

**Changed:**
- Limited workflow telemetry to mechanically written command-dispatch episodes
  and events.
- Removed model-authored telemetry and post-run evaluation requirements from
  `/plan-it`, `/do-it`, and the plan template.
- Narrowed telemetry types, tests, and documentation to the records the runtime
  actually writes and the query helper reads.

**Validation:** Focused workflow telemetry and dispatch tests passed 6 tests;
Pi typecheck, Ruff, Python format, prompt-contract scans, the query helper, and
`git diff --check` passed.

**Files:** `pi/{lib,tests,docs,skills}/`,
`.specs/rationalization-phase2/{plan,ledger}.md`, `CHANGELOG.md`

---

## 2026-07-17: Make workflow checkpoints honest

**Why:** The `/do-it` report contract forced interrupted work into a failure
classification even when the plan recorded no blocker.

**Changed:**
- Replaced the four-way completion enum with observable complete, checkpoint,
  and blocked states.
- Reduced interrupted-run handling to one checkpoint rule and required blocker
  claims to match current plan state.
- Made stale blocker and review evidence subject to current-state verification.

**Validation:** A live `/do-it .tmp/rationalization-phase2/t1/plan.md` run
reported a checkpoint on both boundary lines, named the next task, and claimed
no blocker. Contract scans found no old enum labels or non-ASCII content.

**Files:** `pi/skills/workflow/do-it.md`,
`pi/skills/workflow/templates/do-it-report-template.md`,
`.specs/rationalization-phase2/{plan,ledger}.md`, `CHANGELOG.md`

---

## 2026-07-16: Close test rationalization ledger

**Why:** Final reconciliation needed current collection arithmetic, a fresh
static-content sweep, exact workflow dispatch coverage, and aggregate validation.

**Changed:**
- Classified and removed the one legacy-token grep missed by the original
  ledger inventory; all 109 decision rows are now executed.
- Added `/review-it` dispatch and mutation-boundary coverage alongside the
  existing `/plan-it` and `/do-it` workflow fixtures.
- Synchronized task-await fixtures before releasing worker promises to remove
  load-dependent ownership assertions.
- Recorded before/after instruction bytes, test collections, and
  `make test-quick` timing in the ledger.

**Validation:** `make check-pi-extensions` passed 1,313 tests with one skip;
`make check` passed after focused repair of the task-await test race.

**Files:** `.specs/rationalization/ledger.md`,
`test/test_private_archive.py`, `pi/tests/{workflow-dispatch,task-tools}.test.ts`,
`CHANGELOG.md`

---

## 2026-07-16: Split quality Make targets

**Why:** Routine changed-file and static checks needed separate entrypoints from
the full repository aggregate.

**Changed:**
- Added `make check-changed FILES='...'`, which invokes the explicit-file
  quality runner once.
- Added `make check-fast` for preflight and shell static checks.
- Kept focused test entrypoints and the independent full `make check` graph;
  the graph contract verifies each full-stage command appears once.
- Made Pi dependency linking resolve from the checked-out repository so fresh
  worktrees exercise the intended package graph.
- Updated stale task-model and secret-review test fixtures exposed by the full
  aggregate.
- Kept Biome and shfmt nonblocking because their documented baseline debt
  remains unresolved.

**Three-run timing, Windows Git Bash (milliseconds):**

| Entry point | Runs | Median | Result and scope |
| --- | --- | --- | --- |
| `make check-changed FILES='scripts/quality-check'` | 1935, 1834, 1723 | 1834 | Passed; one explicit shell file through the configured runner. |
| `make check-fast` | 2619, 2601, 2875 | 2619 | Passed; preflight, Ruff, and ShellCheck. |
| `make check` | 209932, 152150, 167466 | 167466 | Passed; lint, Pytest suites, Pi typecheck, and full Vitest suite. |

The changed-file route was 785 ms faster at the median than the successful
fast static route and validates a narrower, explicit scope. The full route
passed at a distinct integration scope.

**Files:** `Makefile`, `test/test_ci_contract.py`,
`scripts/pi-deps-link-setup`, `pi/tests/{task-execution,workflow-commands}.test.ts`,
`CHANGELOG.md`

---

## 2026-07-16: Add explicit-file quality validation

**Why:** Changed-file validation required repeated one-off validator commands and
could silently skip missing tools.

**Changed:**
- Added `scripts/quality-check FILE...`, which routes explicit Python, shell,
  and Pi TypeScript files through the shared validator configuration.
- Reused the configured validator runner with four-worker bounded parallelism
  and deterministic diagnostic ordering.
- Made the CLI report unsupported files as clean, validator failures as exit 1,
  input or configuration errors as exit 2, and required missing tools as exit
  3 without installing anything.

**Files:** `scripts/quality-check`,
`claude/hooks/quality-validation/{quality_validation_hook.py,validators.yaml,tests/test_quality_validation.py}`,
`CHANGELOG.md`

---

## 2026-07-16: Establish quality-tool ownership baselines

**Why:** Pi formatting and complexity checks depended on workstation tools, while
shell formatting had no non-mutating check.

**Changed:**
- Pinned Biome 2.5.3 in the Pi pnpm workspace with a minimal formatting-only
  configuration and a `pnpm run biome:check` command.
- Added `make lint-shell-format`, which runs `shfmt -d` without writing files.
- Made the existing installer the authoritative Lizard owner because the
  shared hook runs bare commands in Windows/WSL; it now installs Lizard 1.21.3
  exactly and the validator setup guidance matches.
- Kept the new Biome and shfmt checks out of existing blocking targets until
  their historical debt is addressed.

**Baseline (nonblocking):** Biome reports 87 formatting diagnostics across
225 Pi TypeScript files. `shfmt -d` reports 12 files in the existing shell
check scope. Lizard reports 239 warnings across 438 tracked supported source
files (233 CCN, 13 parameter-count, and 6 function-length violations; classes
overlap).

**Files:** `pi/{package.json,pnpm-lock.yaml,biome.json}`, `Makefile`,
`{install,install.ps1}`, `claude/hooks/quality-validation/validators.yaml`,
`CHANGELOG.md`

---

## 2026-07-16: Align Pi tests with runtime behavior

**Why:** Pi tests still froze prompt wording, file placement, and implementation
spelling that no runtime parser consumed.

**Changed:**
- Removed prompt, source-shape, and classifier-wording assertions without an
  executable contract.
- Replaced reducer source greps with mocked process invocation and timeout-tree
  cleanup behavior.
- Kept the memory promotion scanner's sandboxed output behavior while removing
  redundant source inspection.
- Recorded accepted loss for extension-loader layout checks because no cheap
  repository-owned runtime seam exists.

**Files:** `pi/tests/`, `.specs/rationalization/ledger.md`, `CHANGELOG.md`

---

## 2026-07-16: Replace browser and CI source assertions

**Why:** Browser safety and workflow deployment checks relied on prose and
source spelling instead of observable process behavior and parsed workflow
meaning.

**Changed:**
- Replaced Brave wrapper greps with fake-process tests for loopback launch,
  owned profiles, warnings, identity refusal, and recorded-PID termination.
- Removed skill, prompt, and README wording assertions with no runtime consumer.
- Derived CI paths and direct script invocations from parsed workflow steps and
  shell tokens instead of duplicated path tuples and regular expressions.
- Removed the obsolete Claude/Pi instruction symlink test after its recorded
  user gate confirmed the files now have independent ownership.

**Files:** `test/test_agent_browser_brave.py`,
`test/test_brave_tab_capture.py`, `test/test_ci_contract.py`,
`test/test_pi_agent_metadata.py`, `.specs/rationalization/`, `CHANGELOG.md`

---

## 2026-07-16: Replace configuration source greps

**Why:** The fast configuration suite asserted shell source spelling instead of
runtime behavior or parsed configuration meaning.

**Changed:**
- Replaced 198 source-pattern cases with grouped zsh runtime, Git parser,
  Git ignore, and normalized Dotbot parity contracts.
- Reused existing prompt behavior suites instead of duplicating prompt checks.
- Recorded explicit accepted loss where a deterministic cross-platform fixture
  would cost more than the source check protected.
- Reduced the exact `make test-quick` entrypoint to four passing contracts.

**Files:** `test/test_config_patterns.py`,
`.specs/rationalization/ledger.md`, `CHANGELOG.md`

---

## 2026-07-16: Centralize Pi model routing policy

**Why:** Subagent sizing, explicit workflow choices, and premium-provider
preferences were duplicated across extensions and drifted independently.

**Changed:**
- Made `pi/lib/model-routing.ts` the owner of named preferences, explicit
  workflow choices, metadata-aware scoring, and premium-provider membership.
- Routed `/fable`, `/foreman`, and subagent size requests through the shared
  resolver while preserving explicit user overrides.
- Removed the duplicate Fable ladder and pinned-model regular expression.
- Added deterministic zero, one, and many-model coverage plus clear missing
  capability diagnostics.

**Files:** `pi/lib/model-routing.ts`, `pi/extensions/fable.ts`,
`pi/extensions/prompt-router.ts`, `pi/tests/{model-routing,fable}.test.ts`,
`CHANGELOG.md`

---

## 2026-07-16: Consolidate the Pi worker roster

**Why:** Model-bound variants and an unenforced organization chart duplicated
roles without adding distinct permissions, tools, or task boundaries.

**Changed:**
- Consolidated 33 worker definitions into 18 approved, distinct roles and
  recorded the complete old-to-new mapping in the rationalization roster.
- Removed 15 model/taxonomy duplicates while preserving the three exact
  deterministic skill-review dispatch targets.
- Removed unconsumed `roleType`, `reportsTo`, `leads`, and `routingUse`
  metadata plus parser support for `roleType`.
- Replaced hierarchy and source-shape tests with consumed frontmatter-to-child
  launch coverage for tools, runtime hint, effort, and skills.
- Updated active task, routing, documentation, and test references to surviving
  worker names.

**Files:** `pi/agents/`, `pi/extensions/subagent/agents.ts`, `pi/tests/`,
`test/test_pi_agent_metadata.py`, `pi/README.md`,
`.specs/rationalization/{plan,ledger,roster}.md`, `CHANGELOG.md`

---

## 2026-07-16: Consolidate Pi instruction ownership

**Why:** Runtime discovery mechanics, repository package policy, and delegation
rules were repeated across loaded instruction and reference layers.

**Changed:**
- Replaced named delegation gates with capability-based judgment and explicit
  override precedence.
- Reduced the always-appended Pi policy to Pi-specific ownership, safety,
  delegation evidence, and approval boundaries.
- Removed duplicate package-policy prose from the root client instructions and
  duplicate repository rules from shared global instructions.
- Replaced runtime discovery recipes in the Pi README with source-owner or
  upstream-documentation pointers.
- Reduced measured instruction/reference content from 73,445 to 68,559 bytes.

**Files:** Pi README, Pi runtime/global instructions, Pi instruction extension,
root client instructions, `CHANGELOG.md`

---

## 2026-07-16: Simplify Pi planning and execution contracts

**Why:** File-count routing, fixed worker assignments, named evaluation panels,
and duplicated step recipes made workflow prompts brittle and repeated policy
owned by runtime discovery and repository instructions.

**Changed:**
- Reframed `/plan-it` and `/do-it` around objectives, hard boundaries,
  repository evidence, validation, durable state, and definitions of done.
- Removed file-count complexity ladders, required runtime assignment columns,
  fixed specialist routing, named hidden panels, and duplicated delegation
  recipes.
- Reworked the plan template around deliverables, dependencies, required
  capabilities, mutation boundaries, exact workflow checks, and durable
  evidence.
- Kept `/prd-it` unchanged because it already delegates to its canonical skill
  without duplicating the retired prescriptions.

**Files:** `pi/skills/workflow/plan-it.md`,
`pi/skills/workflow/do-it.md`,
`pi/skills/workflow/templates/plan-template.md`, `CHANGELOG.md`

---

## 2026-07-16: Inventory static-content test contracts

**Why:** The rationalization plan requires every source-, prompt-, prose-, and
configuration-shape test to have an explicit decision before test cleanup.

**Changed:**
- Added `.specs/rationalization/ledger.md` with 108 unique decision rows tied
  to execution tasks T4, T6, T7, and T8.
- Corrected the prior audit from 89 strict / 106 broad declarations to 90
  strict / 107 broad declarations after finding one omitted source assertion.
- Recorded full Pytest and Vitest collection counts, test entrypoints, runtime
  consumers, replacement boundaries, and pending execution ownership.

**Files:** `.specs/rationalization/ledger.md`,
`.specs/rationalization/plan.md`, `CHANGELOG.md`

---

## 2026-07-16: Consolidate rationalization into one phased plan

**Why:** The interim three-plan split kept concerns independent but the user
prefers one complete walkthrough. Consolidation keeps the lean
goals/boundaries/evidence style, real dependencies only, and phase
independence so a stalled task never blocks unrelated work.

**Changed:**
- Merged the Pi harness rework, repository-wide test rationalization, and
  quality tooling plans into `.specs/rationalization/plan.md` (phases 0-4).
- Kept the repo-wide test decision ledger: every static-content test gets an
  explicit keep, replace, delete, or accepted-loss row before cleanup
  executes, closed by a final reconciliation gate.
- Authorized per-slice commits during execution and subagent parallelism for
  independent tasks.
- Marked the original plan superseded; deferred friction instruction-context
  capture to a future plan.
- Recorded user decisions: Claude client commands stay separate from Pi;
  org-chart agent taxonomy is deleted; agent roster consolidates aggressively.

**Files:** `.specs/rationalization/plan.md`,
`.specs/workflow-test-rationalization/plan.md`, `CHANGELOG.md`

---

## 2026-07-16: Generalize `/review-it` orchestration

**Why:** Fixed reviewer names, model tiers, panel sizes, and automatic follow-up
panels made plan review fragile and caused unnecessary review churn.

**Changed:**
- Replaced the fixed state machine with a runtime-adaptive review, apply, and
  validation flow.
- Made reviewer and routing selection depend on capabilities discovered at run
  time instead of predefined agents or models.
- Kept automatic application of verified artifact fixes while removing the
  alternate ask mode and automatic post-change panels.
- Simplified reviewer and synthesis templates, documentation, and contract tests.

**Files:** `pi/skills/workflow/review-it.md`,
`pi/skills/workflow/templates/review-it-reviewer-prompts.md`,
`pi/skills/workflow/templates/review-synthesis-template.md`,
`pi/tests/workflow-prompts.test.ts`, `pi/README.md`, `CHANGELOG.md`

---

## 2026-07-16: Persist extension slash command invocations

**Why:** Pi gives each extension a separate API, so the slash echo renderer could
not wrap command registrations owned by other extensions.

**Changed:**
- Added a shared local registration wrapper that persists one visible invocation
  without triggering a provider turn.
- Wired every command-owning extension through the wrapper, with explicit
  exclusions for workflows that already persist their invocation.
- Corrected startup coverage and added focused separate-API and echo tests.

**Files:** `pi/lib/slash-command-echo.ts`, `pi/extensions/`, `pi/tests/`,
`pi/README.md`, `CHANGELOG.md`

---

## 2026-07-16: Preserve Pi model metadata across catalog refreshes

**Why:** The Codex model cache stored complete provider definitions and replayed
those stale definitions over Pi 0.80.7 built-ins at startup, hiding newer
thinking levels and other model metadata.

**Changed:**
- Replaced complete cached model definitions with schema-versioned provider
  catalog facts.
- Composed cached Codex discoveries over current Pi built-ins, preserving Pi's
  metadata for known models while retaining models not yet shipped by Pi.
- Migrated legacy cache records in memory and added regression coverage for
  stale thinking-level metadata and the new cache schema.

**Files:** `pi/extensions/refresh-models.ts`,
`pi/tests/refresh-models.test.ts`, `pi/README.md`, `CHANGELOG.md`

---

## 2026-07-16: Add bounded feature memory

**Why:** Feature discussions and validated follow-up evidence were difficult to recover in fresh sessions without copying transcripts or making local observations authoritative tracked state.

**Changed:**
- Added a tracked schema-versioned feature registry and curated `/improve` dossier.
- Added deterministic trigger matching, repository containment checks, and once-per-session hidden context injection.
- Added bounded append-only local decision, evidence, open-question, and supersession events with serialized writes.
- Added a narrow matched-feature recording tool that never edits tracked dossiers.
- Documented privacy, staleness, curation, and rollback boundaries and added focused regression coverage.

**Files:** `pi/feature-memory.json`, `pi/lib/feature-memory-store.ts`,
`pi/extensions/feature-memory.ts`, `pi/tests/feature-memory.test.ts`,
`.specs/features/pi-improve/context.md`, `pi/README.md`, `CHANGELOG.md`

---

## 2026-07-15: Make improvement selection match its displayed list

**Why:** `/improve list` displayed numbered candidates but `/improve select`
accepted only ID prefixes. List and selection results were transient
notifications, so they were absent from the transcript and later model context.

**Changed:**
- Accepted displayed candidate ordinals as well as unique ID prefixes.
- Wrote list and selection output as visible session messages without starting an
  extra provider turn.
- Added regression coverage for selecting candidate 4 and retaining command
  output in the transcript.

**Files:** `pi/extensions/workflow-friction-review.ts`,
`pi/tests/workflow-friction.test.ts`, `pi/README.md`, `CHANGELOG.md`

---

## 2026-07-15: Fully hide target-context deferrals

**Why:** The target-context guard removed the blocked result text but retained its
error state and the detailed block reason, so Pi could still surface the expected
internal retry as a visible failure.

**Changed:**
- Made expected target-context deferrals reasonless.
- Finalized deferred tool calls as empty non-error results.
- Added regression coverage for the complete blocked-result transformation.
- Updated the extension type-check wrapper to resolve the current package from
  project-local, pnpm, npm, Pi-bin, and Bun locations and use the pinned local
  TypeScript compiler.
- Split the test suites and named their lifecycle callbacks so complexity
  validation recognizes bounded functions.
- Preserved the task batch validator's mutable return contract with a copy of
  readonly input values, and split workspace resolution, batch dependency
  validation, transitions, and task listing into bounded helpers.
- Updated the damage-control audit fixture to use the supported Claude policy
  shape while retaining Bash, file-tool, and PowerShell hard-block coverage.

**Files:** `pi/extensions/agents-context.ts`, `pi/extensions/tsc-check.py`,
`pi/lib/task-registry.ts`, `pi/tests/agents-context.test.ts`,
`pi/tests/damage-control.test.ts`, `CHANGELOG.md`

---

## 2026-07-15: Add explicit improvement candidate selection

**Why:** `/improve` hid all but the top-ranked candidate and treated every follow-up message as a potential decision, making candidate choice opaque and discussion state too permissive.

**Changed:**
- Added `/improve list`, `/improve select <id>`, and `/improve help`.
- Removed free-form manual capture arguments from the public command.
- Kept questions in a discussion state until an explicit Apply, Edit, Skip, or numbered selection.
- Added command selection and decision-state regression coverage.

**Files:** `pi/extensions/workflow-friction-review.ts`,
`pi/tests/workflow-friction.test.ts`, `pi/README.md`, `CHANGELOG.md`

---

## 2026-07-15: Unify Bedrock provider and refresh targeting

**Why:** `/bedrock-refresh` manufactured a default profile and ignored
provider-scoped AWS configuration, allowing model inventory to come from a
different profile or region than runtime requests.

**Changed:**
- Added one pure resolver for explicit, provider-scoped, process, config, and
  inferred AWS profile and region inputs.
- Reused the resolver for environment setup and refresh command construction.
- Omitted `--profile` for non-profile AWS credential sources.
- Corrected the Pi 0.80.7 profile-auth compatibility key and documented its
  required empty value.
- Added precedence and exact AWS argument regression coverage.

**Files:** `pi/lib/bedrock-auth.ts`, `pi/extensions/aws-bedrock-env.ts`,
`pi/extensions/bedrock-refresh.ts`, `pi/tests/bedrock-refresh.test.ts`,
`pi/README.md`, `.specs/pi-extension-refactors/backlog.md`, `CHANGELOG.md`

---

## 2026-07-15: Resolve quality-gate project placeholders

**Why:** Pi's batched quality gate passed `{project_root}` literally to validators,
so C# formatting failed before inspecting the edited file.

**Changed:**
- Detected validator project roots from configured literal and glob markers.
- Expanded `{file}` and `{project_root}` across complete validator commands.
- Honored validator detection files before selecting fallback validators.
- Ran validators from the detected root and honored configured timeouts.
- Added focused command-resolution and project-root regression coverage.

**Files:** `pi/extensions/quality-gates.ts`,
`pi/tests/quality-gates.test.ts`, `CHANGELOG.md`

---

## 2026-07-15: Hide target-context deferral messages

**Why:** Loading nested AGENTS instructions before a mutating tool retry is an
expected internal workflow and did not need a user-visible error message.

**Changed:**
- Kept deterministic target-path discovery at tool-call time.
- Suppressed the expected blocked tool result from the transcript.
- Added a hidden instruction that tells the model to retry after applying the
  newly loaded target context.

**Files:** `pi/extensions/agents-context.ts`,
`pi/tests/agents-context.test.ts`, `CHANGELOG.md`

---

## 2026-07-15: Scope the root changelog to dotfiles changes

**Why:** The global instruction could be read as requiring entries for workflow
configuration changed in unrelated repositories.

**Changed:**
- Limited root changelog entries to instructions, skills, commands, and runtime
  workflows changed within the dotfiles repository.
- Explicitly excluded changes made in other repositories.

**Files:** `pi/AGENTS.md`, `CHANGELOG.md`

---

## 2026-07-15: Make plan review converge in one invocation

**Why:** `/review-it` intentionally blocked after applying material findings from
its post-change panel, forcing repeated review invocations even when all defects
were locally repairable. `/plan-it` also checked contract presence without
checking task dependency order or command failure paths.

**Changed:**
- Made `/plan-it` validate dependency ordering, command truth tables, cleanup,
  host/container boundaries, and safe read-only probes before writing a plan.
- Prevented plan-specific telemetry script requirements when existing workflow
  artifacts can carry the evidence.
- Made `/review-it` continue from one post-change panel through deterministic
  audit and standalone readiness instead of blocking solely for material fixes.
- Limited auto-apply to must-fix/readiness changes and safety-critical hardening;
  nonblocking hardening remains backlog.
- Added an explicit review-blocked status for genuine external input or exhausted
  repair budgets and regression checks for convergence behavior.

**Files:** `pi/skills/workflow/plan-it.md`,
`pi/skills/workflow/review-it.md`, `pi/tests/workflow-prompts.test.ts`,
`CHANGELOG.md`

---

## 2026-07-15: Migrate workflow reviews to a typed agent

**Why:** The background reviewer duplicated model resolution, subprocess,
timeout, JSON parsing, and cleanup behavior already owned by the typed-agent
runtime.

**Changed:**
- Added bounded TypeBox contracts for sanitized interaction packets and reviews.
- Resolved Terra through the active model registry and reused typed-agent
  correction, cancellation, timeout, isolation, and disposal behavior.
- Removed temporary prompt files, subprocess invocation, and legacy review
  parsing while preserving queue and decision policy.
- Added focused model-selection and correction coverage.

**Files:** `pi/extensions/workflow-friction-review.ts`,
`pi/lib/workflow-friction.ts`, `pi/tests/workflow-friction.test.ts`,
`pi/tests/typed-agent.test.ts`, `.specs/pi-extension-refactors/backlog.md`,
`CHANGELOG.md`

---

## 2026-07-15: Deduplicate claimed workflow reviews

**Why:** An enqueue/claim race could recreate a pending review after the worker
claimed the original, causing the same interaction to run and persist twice.
Interrupted processing could also append a failed duplicate after completion.

**Changed:**
- Rechecked completed reviews after claiming a pending job and before execution.
- Rechecked interrupted processing jobs before recording recovery failures.
- Added deterministic contention and interrupted-recovery coverage, including
  annotation preservation.

**Files:** `pi/extensions/workflow-friction-review.ts`,
`pi/tests/workflow-friction.test.ts`,
`.specs/pi-extension-refactors/backlog.md`, `CHANGELOG.md`

---

## 2026-07-15: Complete damage-control audit recording

**Why:** Approved high-risk actions and rule-load denials could bypass security
provenance, while registered handlers assumed an interactive UI.

**Changed:**
- Centralized correlated, redacted recording for approved asks.
- Audited denied asks, hard blocks, and rule-load failures across registered
  Bash, PowerShell, read, write, and edit handlers.
- Used runtime UI capability so no-UI asks fail closed without prompting.
- Added registered-handler audit matrices and focused evaluator coverage.

**Files:** `pi/extensions/damage-control-engine.ts`,
`pi/extensions/damage-control.ts`, `pi/tests/damage-control.test.ts`,
`pi/tests/damage-control-ast.test.ts`,
`pi/tests/damage-control-parity-gaps.test.ts`,
`.specs/pi-extension-refactors/backlog.md`, `CHANGELOG.md`

---

## 2026-07-15: Bound Pi task tool context output

**Why:** Durable task operations repeated complete records and worker output in
model-visible tool results, consuming parent context during normal lifecycle and
readiness workflows.

**Changed:**
- Reduced mutation results to outcome, task ID, state, and actionable errors
  while retaining complete records in renderer details.
- Made `list` and `ready` return bounded compact summaries by default and kept
  `get` as the explicit complete-record path.
- Returned concise artifact references for large worker output while preserving
  bounded output details for expanded TUI rendering.
- Clarified that lightweight plans do not need durable task records and
  discouraged polling and redundant lifecycle calls.
- Added behavioral coverage for compact results, bounded collections, complete
  record retrieval, and file-only large output.

**Files:** `pi/extensions/tasks.ts`, `pi/tests/task-tools.test.ts`,
`pi/AGENTS.md`, `pi/PI-INSTRUCTIONS.md`, `pi/README.md`, `CHANGELOG.md`

---

## 2026-07-15: Unify task lifecycle policy

**Why:** The task tool, `/tasks`, and background coordinator enforced different
start and cancellation behavior, allowing blocked direct work to start and
active background work to outlive command cancellation.

**Changed:**
- Added one lifecycle service for command and tool transitions, skip reasons,
  retries, and cancellation.
- Reused registry readiness checks for direct and background starts.
- Routed active command cancellation through the execution coordinator and
  preserved truthful failed-to-stop state.
- Added parity and active-cancellation regression coverage.

**Files:** `pi/extensions/tasks.ts`, `pi/extensions/tasks/execution.ts`,
`pi/lib/task-registry.ts`, `pi/tests/tasks.test.ts`,
`pi/tests/task-tools.test.ts`, `pi/tests/task-execution.test.ts`,
`.specs/pi-extension-refactors/backlog.md`, `CHANGELOG.md`

---

## 2026-07-15: Make commit fallback exhaustive

**Why:** A valid formatting commit subject was rejected by a mismatched type
policy, then the fallback refused a mixed-surface selection instead of
committing every selected file.

**Changed:**
- Unified conventional commit types across the planner prompt, Pi validators,
  compatibility instructions, and deterministic helper.
- Changed planner failure fallback to one commit containing every selected
  path, regardless of ownership surface.
- Added regression coverage for formatting subjects and mixed Pi, Python, Go,
  and root-file selections.

**Files:** `pi/extensions/workflow-commands.ts`,
`pi/lib/commit/message.ts`, `pi/lib/workflow-commands/prompts.ts`,
`pi/tests/commit-message.test.ts`, `pi/tests/workflow-commands-pure.test.ts`,
`pi/tests/workflow-commands.test.ts`, `pi/tests/workflow-prompts.test.ts`,
`claude/shared/commit-instructions.md`, `scripts/commit-helper`,
`test/test_commit_helper.py`, `CHANGELOG.md`

---

## 2026-07-15: Normalize Pi runtime icon spacing

**Why:** Leading icons in Pi tool labels and notifications used inconsistent
visual gaps before their text.

**Changed:**
- Standardized active Pi runtime labels on two display spaces after leading
  icons.
- Kept spacing as presentation-only behavior without exact-whitespace tests.

**Files:** `pi/extensions/structured-edit.ts`, `pi/extensions/text-edit.ts`,
`pi/extensions/tool-search.ts`, `pi/extensions/subagent/index.ts`,
`pi/extensions/tps-tracker.ts`, `CHANGELOG.md`

---

## 2026-07-15: Improve session warning icon spacing

**Why:** The branch-behind notification rendered the warning icon too close to
its message text in the terminal.

**Changed:**
- Added a second display space between the warning icon and `Branch`.
- Preserved singular and plural branch-behind wording.

**Files:** `pi/extensions/session-hooks.ts`, `CHANGELOG.md`

---

## 2026-07-15: Remove duplicate YouTube skill source

**Why:** The explicitly configured YouTube skill collided with the community
skill already discovered under Pi's user skill directory.

**Changed:** Removed the redundant skill path from Pi settings so native
discovery loads only the community `youtube-transcript` skill.

**Files:** `pi/settings.json`, `CHANGELOG.md`

---

## 2026-07-15: Preserve max thinking during model refresh

**Why:** Provider catalogs now expose native `max` thinking for additional models,
but the local refresh allowlist stopped at `xhigh`.

**Changed:**
- Added `max` to refreshed model thinking maps.
- Strengthened the regression to assert the complete map, including unsupported
  levels represented by `null`.

**Files:** `pi/extensions/refresh-models.ts`,
`pi/tests/refresh-models.test.ts`, `.specs/pi-extension-refactors/backlog.md`,
`CHANGELOG.md`

---

## 2026-07-15: Retire the unused Pi agent-team runtime

**Why:** The no-op extension, native team dispatch, configuration files, and
launch recipes were unused and duplicated direct subagent orchestration.

**Changed:**
- Removed the agent-team extension, team configuration files, dispatch mode,
  task origin, telemetry mode, and dedicated tests.
- Removed the `just team` recipe and stopped generated projects from loading the
  retired extension.
- Retained single, parallel, and chain subagent execution and standalone agent
  personas.

**Files:** `pi/extensions/agent-team.ts`, `pi/extensions/subagent/index.ts`,
`pi/extensions/fable.ts`, `pi/extensions/tasks.ts`,
`pi/lib/task-registry.ts`, `pi/lib/orchestration-telemetry.ts`,
`pi/agents/teams.yaml`, `pi/agents/ml-team-config.yaml`, `pi/justfile`,
`pi/scripts/pi-new`, `pi/README.md`, tests,
`.specs/pi-extension-refactors/backlog.md`, `CHANGELOG.md`

---

## 2026-07-15: Unpin the startup command list

**Why:** The complete command inventory occupied persistent editor space and
included prompt and skill commands that were not useful in the startup list.

**Changed:**
- Replaced the persistent startup widget with a one-time startup status line.
- Limited the startup list to extension commands.
- Cleared the old widget during reload so existing sessions lose it immediately.

**Files:** `pi/extensions/01-startup-commands.ts`,
`pi/tests/startup-commands.test.ts`, `CHANGELOG.md`

---

## 2026-07-15: Move prompt-only Pi commands to native templates

**Why:** `/summarize` and `/gitlab-ticket` only expanded prompts, so extension
registrations duplicated Pi's native prompt-template command surface.

**Changed:**
- Moved `/summarize` and `/gitlab-ticket` to `pi/prompts/` with frontmatter,
  argument hints, and `$ARGUMENTS` expansion.
- Removed their extension registrations and obsolete prompt-building helper.
- Updated command documentation and prompt-placement regressions.

**Files:** `pi/prompts/summarize.md`, `pi/prompts/gitlab-ticket.md`,
`pi/skills/workflow/gitlab-ticket.md`, `pi/extensions/workflow-commands.ts`,
`pi/lib/workflow-commands/prompts.ts`, `pi/tests/workflow-commands.test.ts`,
`pi/tests/workflow-prompts.test.ts`, `pi/README.md`, `CHANGELOG.md`

---

## 2026-07-15: Retire the unused Pi agent chain

**Why:** `/chain` was a legacy user macro around sequential subagent calls, and
its `log_exchange` tool had no recorded calls or conversation logs. Native
subagent chain mode now owns model-driven sequencing.

**Changed:**
- Removed the `/chain` command, `log_exchange` tool, and obsolete extension.
- Removed the dedicated launch recipe, integration test, coverage entry, and
  command documentation.
- Retained the independently used memory retrieval and promotion libraries.

**Files:** `pi/extensions/agent-chain.ts`, `pi/tests/agent-chain.test.ts`,
`pi/tests/vitest.config.ts`, `pi/justfile`, `pi/README.md`,
`pi/docs/expertise-layering.md`, `pi/extensions/README.md`,
`.specs/pi-extension-refactors/backlog.md`, `CHANGELOG.md`

---

## 2026-07-15: Use Pi's command inventory for the startup widget

**Why:** The startup widget replaced `pi.registerCommand`, duplicated Pi's
command registry, and omitted native prompt and skill commands.

**Changed:**
- Replaced registration interception with the documented `pi.getCommands()` API.
- Included extension commands, duplicate suffixes, prompt templates, and skills.
- Preserved reload refreshes and exactly one slash echo per extension command.

**Files:** `pi/extensions/01-startup-commands.ts`,
`pi/tests/startup-commands.test.ts`,
`.specs/pi-extension-refactors/backlog.md`, `CHANGELOG.md`

---

## 2026-07-15: Keep Pi session summaries grounded in session context

**Why:** `/summarize` could over-weight recent Git history and omit earlier work
represented by a compaction summary.

**Changed:**
- Made available session context authoritative for summary scope.
- Restricted Git status and history to corroborating implementation and current state.
- Required limited-coverage disclosure when compaction leaves insufficient detail.
- Added a command-level regression for the summary evidence rules.

**Files:** `pi/extensions/workflow-commands.ts`,
`pi/tests/workflow-commands.test.ts`, `CHANGELOG.md`

---

## 2026-07-15: Retire the unused Pi research command

**Why:** `/research` was an unused public command with a dedicated workflow that
duplicated on-demand research available through normal orchestration.

**Changed:**
- Removed the `/research` registration and its orphaned workflow template.
- Removed `/research` from the Pi command documentation.
- Added a regression that keeps the retired command out of the runtime registry.

**Files:** `pi/extensions/workflow-commands.ts`,
`pi/skills/workflow/research.md`, `pi/tests/workflow-commands.test.ts`,
`pi/README.md`, `CHANGELOG.md`

---

## 2026-07-15: Consolidate repository changelogs

**Why:** Separate client and Pi changelogs duplicated entries and made update instructions depend on the edited surface.

**Changed:**
- Merged the tracked client and Pi histories into this root changelog.
- Redirected changelog instructions to `~/.dotfiles/CHANGELOG.md`.
- Removed the superseded `claude/CHANGELOG.md` and `pi/CHANGELOG.md` files.

**Files:** `CHANGELOG.md`, `claude/CLAUDE.md`, `pi/AGENTS.md`

---

## Repository and client history

### 2026-07-15: Ground Pi typed workflows in end-to-end design

**Why:** The typed-agent skill described stage boundaries but did not explicitly
require walking an unfamiliar workflow end to end before automation or keeping
validator execution and pass/fail routing outside semantic stages.

**Fix:** Added workflow-design checks for identifying deterministic inputs,
semantic judgments, validation signals, approval boundaries, bounded diagnostic
handoffs, and code-owned retry decisions. Linked the source video and timestamps.

**Files:** ~/.dotfiles/pi/skills/typed-agent-workflows/SKILL.md

---

### 2026-07-15: Surface Pi commit planner fallback reasons

**Why:** `/commit` discarded planner exceptions and labeled every fallback as
planner unavailability, leaving the actual failure unrecoverable.

**Fix:** Added bounded credential-redacted failure reporting before the
existing deterministic ownership fallback, with helper and command-level
regressions.

**Files:** ~/.dotfiles/pi/extensions/workflow-commands.ts,
~/.dotfiles/pi/tests/workflow-commands-pure.test.ts,
~/.dotfiles/pi/tests/workflow-commands.test.ts,
~/.dotfiles/pi/CHANGELOG.md

---

### 2026-07-14: Rank Pi improvements by verified usage impact

**Why:** `/improve` selected the oldest supported candidate without considering
how often the affected surface was used, while local stats had attribution and
scope defects that prevented reliable prioritization.

**Fix:** Corrected the stats pipelines, added structured improvement targets,
and ranked safety and correctness first followed by verified 30-day usage,
confidence, age, and interaction ID. Unknown telemetry remains distinct from
verified zero usage.

**Files:** ~/.dotfiles/pi/extensions/extension-stats.ts,
~/.dotfiles/pi/extensions/orchestration-stats.ts,
~/.dotfiles/pi/extensions/router-stats.ts,
~/.dotfiles/pi/extensions/skill-stats.ts,
~/.dotfiles/pi/extensions/usage.ts,
~/.dotfiles/pi/extensions/workflow-friction-review.ts,
~/.dotfiles/pi/lib/workflow-friction.ts, ~/.dotfiles/pi/tests,
~/.dotfiles/pi/README.md, ~/.dotfiles/pi/CHANGELOG.md

---

### 2026-07-14: Remove test-only Pi router paths

**Why:** Legacy hysteresis, policy, status-label, and transcript-emission helpers
were no longer called by the provider routing path. Tests that invoked those
helpers directly gave them the appearance of runtime coverage.

**Fix:** Removed the test-only helpers and their direct tests, then retired the
production-visible policy parsing, legacy state, status fields, and docs that
had no effect on authoritative provider routing. Retained same-turn telemetry
and live routing coverage.

**Files:** ~/.dotfiles/pi/extensions/prompt-router.ts,
~/.dotfiles/pi/lib/prompt-router/config.ts,
~/.dotfiles/pi/tests/prompt-router.test.ts,
~/.dotfiles/pi/tests/transcript-integration.test.ts,
~/.dotfiles/pi/prompt-routing/docs/settings-doc.md,
~/.dotfiles/pi/prompt-routing/docs/classifier-training.md,
~/.dotfiles/pi/README.md,
~/.dotfiles/.specs/pi-extension-refactors/backlog.md

---

### 2026-07-14: Retire duplicate Pi skill commands

**Why:** Pi's custom skill loader duplicated native skill discovery, exposed
reference documents as slash commands, and made `/skills` and `/yt-local`
operator commands even though neither should be public.

**Fix:** Retired the custom skill-command loader and `/skills`, migrated `/yt`
to a native Pi prompt template, kept the local YouTube fetcher as an internal
fallback, loaded the YouTube transcript guidance through native skill settings,
and updated `/skill-stats` for current nested session records.

**Files:** ~/.dotfiles/pi/extensions/skill-loader.ts,
~/.dotfiles/pi/extensions/skill-stats.ts, ~/.dotfiles/pi/prompts/yt.md,
~/.dotfiles/pi/skills/workflow/yt.md,
~/.dotfiles/pi/skills/workflow/yt-local.md, ~/.dotfiles/pi/settings.json,
~/.dotfiles/pi/tests/skill-loader.test.ts,
~/.dotfiles/pi/tests/skill-stats.test.ts

---

### 2026-07-14: Stabilize Pi secret-review coverage

**Why:** `/commit` required the secret reviewer to reproduce path, label, line, and
match text verbatim. Harmless output normalization could therefore fail exact
candidate coverage before commit planning.

**Fix:** Assigned stable numeric IDs to deterministic scanner candidates, made
the reviewer return only each ID and its decision, retried one incomplete
coverage response with an explicit correction, and joined validated decisions
back to the original candidate metadata in code.

**Files:** ~/.dotfiles/pi/extensions/workflow-commands.ts,
~/.dotfiles/pi/lib/workflow-commands/prompts.ts,
~/.dotfiles/pi/tests/workflow-commands-pure.test.ts,
~/.dotfiles/pi/tests/workflow-prompts.test.ts

---

### 2026-07-14: Surface Pi commit planner warnings

**Why:** `/commit` accepted validated planner warnings but discarded them before
creating commits, leaving useful uncertainty invisible to the operator.

**Fix:** Normalized non-empty planner warnings and emitted them through the
existing `/commit` activity stream before staging each planned group.

**Files:** ~/.dotfiles/pi/extensions/workflow-commands.ts,
~/.dotfiles/pi/tests/workflow-commands-pure.test.ts

---

### 2026-07-14: Consolidate Pi self-improvement commands

**Why:** Pi exposed interaction capture, aggregate review, candidate approval,
and skill linting as overlapping self-improvement workflows.

**Fix:** Added `/improve` as the single public self-improvement command, folded
recent interaction context, prior experiments, and target-skill usage into one
Apply/Edit/Skip discussion, and retired `/capture`, `/learning-review`,
`/workflow-review`, and `/skill-review` registrations.

**Files:** ~/.dotfiles/pi/extensions/workflow-friction-review.ts,
~/.dotfiles/pi/extensions/skill-review-command.ts,
~/.dotfiles/pi/lib/workflow-friction.ts,
~/.dotfiles/pi/tests/workflow-friction.test.ts,
~/.dotfiles/pi/tests/skill-review.test.ts, ~/.dotfiles/pi/README.md

---

### 2026-07-14: Strengthen Pi review readiness checks

**Why:** Material plan repairs and incremental readiness findings could bypass
renewed adversarial coverage or exhaust the fixed repair budget one blocker at a
time.

**Fix:** Added material-change panel routing, a bounded pre-readiness contract
audit, and consolidated standalone-readiness checks to the Pi review workflow.

**Files:** ~/.dotfiles/pi/skills/workflow/review-it.md,
~/.dotfiles/pi/tests/workflow-prompts.test.ts

---

### 2026-07-14: Add Pi typed-agent workflows

**Why:** Pi commands needed a small reusable boundary between deterministic
workflow code and focused semantic decisions without introducing a second
language or a general workflow framework.

**Fix:** Added a Pi SDK-backed typed-agent API, migrated `/commit` semantic
stages to isolated typed agents with schema validation and one correction
retry, and added a skill with evidence-triggered capability specifications.

**Files:** ~/.dotfiles/pi/lib/typed-agent.ts,
~/.dotfiles/pi/extensions/workflow-commands.ts,
~/.dotfiles/pi/tests/typed-agent.test.ts,
~/.dotfiles/pi/tests/workflow-commands.test.ts,
~/.dotfiles/pi/tests/workflow-commands-pure.test.ts,
~/.dotfiles/pi/skills/typed-agent-workflows/SKILL.md,
~/.dotfiles/pi/skills/typed-agent-workflows/roadmap.md

---

### 2026-07-14: Add Pi cross-session learning review

**Why:** Pi needed to turn explicit corrections into quarantined, reviewable
lessons instead of changing durable instructions automatically.

**Fix:** Added immediate correction review, a conversational `/learning-review`
1-3-1 flow, and append-only applied/skipped decisions with validation and
rollback evidence.

**Files:** ~/.dotfiles/pi/extensions/workflow-friction-review.ts,
~/.dotfiles/pi/lib/workflow-friction.ts,
~/.dotfiles/pi/tests/workflow-friction.test.ts, ~/.dotfiles/pi/README.md

---

### 2026-07-14: Reduce workflow-friction instruction conflicts

**Why:** Session review found that broad warning repair and over-scope guidance
could conflict with exact-workflow validation and bounded execution.

**Fix:** Limited repair to the requested workflow or changed boundary, made
informational requests read-only unless mutation is explicit, required work to
be bounded before mutation, aligned delegation with the conditional Pi policy,
and prohibited behavior-changing bypasses of supported repository entrypoints.

**Files:** ~/.dotfiles/pi/AGENTS.md, ~/.dotfiles/AGENTS.md

---

### 2026-07-14: Make Pi instructions canonical

**Why:** Pi is the primary coding interface, while Claude Code should continue receiving the same shared global instructions.

**Fix:** Reversed the instruction symlink so `pi/AGENTS.md` owns the content and `claude/CLAUDE.md` links to it. Updated live documentation and added a topology regression test.

**Files:** ~/.dotfiles/pi/AGENTS.md, ~/.dotfiles/claude/CLAUDE.md, ~/.dotfiles/AGENTS.md, ~/.dotfiles/pi/README.md, ~/.dotfiles/claude/README.md, ~/.dotfiles/test/test_pi_agent_metadata.py

---

### 2026-07-10: Treat explicit requests as authorization

**Why:** Agents could ask for conversational confirmation after the user had already specified or selected an action, then trigger a second runtime safety confirmation for the same operation.

**Fix:** Clarified that explicit requests authorize exact in-scope execution, runtime safety confirmation is the sole approval gate for the same tool call, plans are not approval gates, 1-3-1 applies only to unresolved choices, and broad audits do not pause for repeated confirmation within the agreed scope.

**Files:** ~/.dotfiles/claude/CLAUDE.md

---

### 2026-07-09: Restore private-store contract wording

**Why:** CI contract tests require the private-store skill to preserve the Obsidian vault wording used by browser tab capture and handoff guidance.

**Fix:** Restored the explicit local plaintext Obsidian-compatible vault phrasing and one-H1 title requirement in the private-store skill.

**Files:** ~/.dotfiles/pi/skills/private-store/SKILL.md

---

### 2026-06-28: Encode recurring workflow preferences

**Why:** Past-session review found repeated workflow expectations around exact-path validation, durable handoff, scratch output handling, worktree state, deployment checks, private values, and domain-specific triage loops.

**Fix:** Updated shared instruction guidance and Pi skills to capture those preferences, including overwrite-not-delete scratch handling, parallel discovery with one-topic-at-a-time execution, migration parity, worktree live-state checks, WIP save-point commits, hot-path extension caching, GitOps validation, Playwright triage, and tenant automation rules.

**Files:** ~/.dotfiles/pi/AGENTS.md, ~/.dotfiles/pi/skills/workflow-design/SKILL.md, ~/.dotfiles/pi/skills/least-astonishment/SKILL.md, ~/.dotfiles/pi/skills/planning/SKILL.md, ~/.dotfiles/pi/skills/prd/SKILL.md, ~/.dotfiles/pi/skills/workflow/plan-it.md, ~/.dotfiles/pi/skills/git-workflow/SKILL.md, ~/.dotfiles/pi/skills/git-workflow/worktrees.md, ~/.dotfiles/pi/skills/git-workflow/gitlab.md, ~/.dotfiles/pi/skills/workflow/commit.md, ~/.dotfiles/pi/skills/pi-extension/SKILL.md, ~/.dotfiles/pi/skills/tui-ux/SKILL.md, ~/.dotfiles/pi/skills/logging-observability/SKILL.md, ~/.dotfiles/pi/skills/terraform/SKILL.md, ~/.dotfiles/pi/skills/private-store/SKILL.md, ~/.dotfiles/pi/skills/ansible/SKILL.md, ~/.dotfiles/pi/skills/shell/SKILL.md, ~/.dotfiles/pi/skills/docker/SKILL.md, ~/.dotfiles/pi/skills/kubernetes-helm/SKILL.md, ~/.dotfiles/pi/skills/playwright-e2e/SKILL.md, ~/.dotfiles/pi/skills/m365-tenant-automation/SKILL.md

---

### 2026-06-24: Expand Pi extension authoring footguns

**Why:** Public Pi skill and extension repositories surfaced additional recurring authoring mistakes beyond shell-out performance, especially around registration-time actions, reload-safe state, command-only context methods, and custom tool contracts.

**Fix:** Updated the Pi extension skill with concise rules for factory registration boundaries, RPC/TUI mode guards, tool error signaling, StringEnum parameters, path normalization, extension-relative file resolution, state reconstruction, command-only methods, and model switch checks.

**Files:** ~/.pi/agent/skills/pi-extension/SKILL.md

---

### 2026-06-24: Add Pi extension runtime guidance

**Why:** Pi extension work needed a dedicated checklist for hot-path subprocess risks, runtime cleanup, bounded output, and Pi-native extension patterns.

**Fix:** Updated the Pi extension skill to prefer Pi docs and examples, document render/status/tool-result shell-out risks, require caching/gating/timeouts, and capture cleanup, cancellation, mutation queue, and truncation guidance.

**Files:** ~/.pi/agent/skills/pi-extension/SKILL.md

---

### 2026-06-08: Compact large domain skills

**Why:** Several broad domain skills had grown into tutorial-heavy files, which made routine activation expensive and blurred when to load optional details.

**Fix:** Reworked the TypeScript, Python, shell, Docker, git workflow, logging-observability, Ansible, Terraform, and llms.txt main skill files as compact indexes with triggers, must/must-not rules, validation commands, anti-patterns, and links to detailed reference files.

**Files:** ~/.dotfiles/pi/skills/typescript/SKILL.md, ~/.dotfiles/pi/skills/typescript/reference.md, ~/.dotfiles/pi/skills/python/SKILL.md, ~/.dotfiles/pi/skills/python/reference.md, ~/.dotfiles/pi/skills/shell/SKILL.md, ~/.dotfiles/pi/skills/shell/reference.md, ~/.dotfiles/pi/skills/docker/SKILL.md, ~/.dotfiles/pi/skills/docker/reference.md, ~/.dotfiles/pi/skills/git-workflow/SKILL.md, ~/.dotfiles/pi/skills/git-workflow/reference.md, ~/.dotfiles/pi/skills/logging-observability/SKILL.md, ~/.dotfiles/pi/skills/logging-observability/reference.md, ~/.dotfiles/pi/skills/ansible/SKILL.md, ~/.dotfiles/pi/skills/ansible/reference.md, ~/.dotfiles/pi/skills/terraform/SKILL.md, ~/.dotfiles/pi/skills/terraform/reference.md, ~/.dotfiles/pi/skills/llmstxt/SKILL.md, ~/.dotfiles/pi/skills/llmstxt/reference.md

---

### 2026-06-06: Make private datastore Obsidian-compatible

**Why:** Private datastore writers needed one vault structure so browser captures, handoffs, X data, attachments, and indexes are browsable in Obsidian instead of mixing notes and raw artifacts in timestamp folders.

**Fix:** Updated the private-store and browser-tab-capture skills, handoff prompt, X guidance, and Brave tab capture script to use domain notes, `_attachments/`, `_indexes/`, YAML frontmatter, and a legacy browser-capture migration mode.

**Files:** ~/.dotfiles/pi/skills/private-store/SKILL.md, ~/.dotfiles/pi/skills/browser-tab-capture/SKILL.md, ~/.dotfiles/pi/prompts/handoff.md, ~/.dotfiles/pi/skills/x-twitter/SKILL.md, ~/.dotfiles/scripts/brave-tab-capture, ~/.dotfiles/scripts/private-vault-audit, ~/.dotfiles/scripts/private-vault-normalize, ~/.dotfiles/test/test_brave_tab_capture.py

---

### 2026-06-06: Align private archive commit behavior

**Why:** Private datastore writes were expected to be encrypted into the commit artifact during normal commits, but the Dolos hook only scanned staged paths and left packing as a manual step.

**Fix:** Updated the Dolos pre-commit hook to pack diverged `private/` content into `.dolos/artifacts/private.tar.gz.age`, stage the encrypted artifact, and re-scan before commit. Added a private-store skill to define scoped writes under `private/`.

**Files:** ~/.dotfiles/scripts/git-hooks/pre-commit-dolos, ~/.dotfiles/scripts/install-dolos-hook, ~/.dotfiles/pi/skills/private-store/SKILL.md, ~/.dotfiles/pi/skills/x-twitter/SKILL.md, ~/.dotfiles/test/test_private_archive.py

---

### 2026-06-06: Add Brave tab capture workflow

**Why:** Open Brave tab capture needed a repeatable workflow that keeps sensitive URLs in the ignored private store and reports whether results came from live CDP or session-file parsing.

**Fix:** Added a focused Pi browser-tab-capture skill plus `scripts/brave-tab-capture`, with tests covering session-file parsing and private-store output guidance.

**Files:** ~/.dotfiles/pi/skills/browser-tab-capture/SKILL.md, ~/.dotfiles/scripts/brave-tab-capture, ~/.dotfiles/test/test_brave_tab_capture.py

---

### 2026-06-04: Document verifiable shell temp cleanup patterns

**Why:** Damage-control can now prove several canonical temporary-file cleanup patterns, and shell guidance needed to steer future scripts toward those easy-to-verify forms.

**Fix:** Updated the Pi shell skill temporary-file section to prefer direct `mktemp` assignments, exact quoted cleanup targets with `--`, EXIT trap cleanup, temp-directory child paths, and conservative examples that should continue to require review.

**Files:** ~/.dotfiles/pi/skills/shell/SKILL.md

---

### 2026-06-03: Require inline goal prompts to start with /goal

**Why:** Inline Pi goal prompt requests were still allowed to include a short lead-in, so some responses did not begin with the copyable `/goal` command.

**Fix:** Updated the Pi goal prompt skill to require the assistant response itself to start with `/goal ` and removed the short lead-in allowance.

**Files:** ~/.dotfiles/pi/skills/pi-goal/SKILL.md

---

### 2026-06-03: Clean up Pi skill client references

**Why:** A few Pi skills still had Claude-specific references or vague "best practices" wording that could confuse cross-client use.

**Fix:** Updated Pi API, TypeScript, and debugging skills to reference active repo/client instruction files, project conventions, and concrete validation instead of Claude-only files or vague quality language.

**Files:** ~/.dotfiles/pi/skills/api-design/SKILL.md, ~/.dotfiles/pi/skills/typescript/SKILL.md, ~/.dotfiles/pi/skills/analysis-workflow/debugging.md

---

### 2026-06-03: Tighten coding-quality and cross-client instruction guidance

**Why:** Goal prompts and shared instruction files needed a concrete coding-quality bar without vague "best practices" wording, and several shared surfaces carried Claude-specific tool/path names while also being loaded by Pi.

**Fix:** Updated the Pi goal skill to require the smallest maintainable coding change, project patterns, explicit validation, and no placeholder/speculative implementations. Reworded shared instruction and development-philosophy guidance to use active harness/client terms and replaced per-tool-call planning with outcome-first next-step guidance.

**Files:** ~/.dotfiles/pi/skills/pi-goal/SKILL.md, ~/.dotfiles/claude/CLAUDE.md, ~/.dotfiles/pi/skills/development-philosophy/SKILL.md, ~/.dotfiles/claude/skills/development-philosophy/SKILL.md

---

### 2026-06-01: Default Pi goal prompt skill to inline output

**Why:** Requests to create a `/goal` prompt should usually return a copyable command on screen, not create a markdown file unless the user asks for one or the prompt is too large for inline use.

**Fix:** Updated the Pi goal prompt skill to make inline `/goal ...` output the default for most tasks, allow file-backed prompts for large or complex goals, and ask before creating a file when only recommending a file-backed prompt.

**Files:** ~/.dotfiles/pi/skills/pi-goal/SKILL.md

---

### 2026-05-23: Tune Pi commit secret scanning

**Why:** The Pi `/commit` workflow's documented `detect-secrets-hook` command used the default Yelp detect-secrets ruleset, so `KeywordDetector` blocked harmless test fixtures containing words like `secret` or `key`.

**Fix:** Updated the Pi commit workflow instructions to pass `--disable-plugin KeywordDetector`, including the `.secrets.baseline` variant, so staged scans focus on secret-shaped values while retaining the other detect-secrets detectors.

**Files:** ~/.dotfiles/pi/skills/workflow/commit.md

---

### 2026-05-02: yt-local scripts use PEP 723 inline metadata

**Why:** `uv run <abs-path>/fetch_transcript.py` from any cwd other than `claude/commands/yt-local` failed with `No module named 'youtube_transcript_api'` because uv resolves deps from cwd, not script location.

**Fix:** Added `# /// script` inline metadata blocks to both scripts so uv resolves deps per-script regardless of cwd. Project `pyproject.toml` retained for the test entry points.

**Files:** ~/.dotfiles/claude/commands/yt-local/fetch_transcript.py, ~/.dotfiles/claude/commands/yt-local/fetch_metadata.py

---

### 2026-04-29: Vendor three skills from mattpocock/skills

**Added:**
- `claude/skills/grill-me/` -- aggressive plan interrogation skill; one question at a time, model provides recommended answer with each, prefers exploring the codebase over asking
- `claude/skills/zoom-out/` -- "map modules + callers at a higher abstraction" one-shot
- `claude/skills/caveman/` -- toggleable ultra-terse reply mode (~75% token cut), persists until "stop caveman"
- `claude/skills/UPSTREAM.md` -- provenance manifest pinning upstream repo + commit SHA + import date so we can diff against future upstream changes

Upstream: https://github.com/mattpocock/skills @ `f71bb975bfae2dc0d31c529c7dd4a8479ecc3748` (2026-04-29). All three SKILL.md files copied verbatim.

**Files:** ~/.dotfiles/claude/skills/grill-me/SKILL.md, ~/.dotfiles/claude/skills/zoom-out/SKILL.md, ~/.dotfiles/claude/skills/caveman/SKILL.md, ~/.dotfiles/claude/skills/UPSTREAM.md

---

### 2026-04-29: Adopt personal-preferences ruleset (over-scope guard, command discipline, package-manager policy)

**Added:**
- Critical rule "Stop when over-scoped": if a request bundles too much work, STOP and propose a sequenced 1-3-1 breakdown rather than silently attempting the whole thing.
- TypeScript skill section "Command Discipline": do not start dev servers or run builds during edit/verify work; default to typecheck/lint/test for verification.
- TypeScript skill section "Package Manager: pnpm or bun, never npm/yarn": pick from lockfile, do not silently migrate, flag when CI pins differently.

**Files:** ~/.dotfiles/claude/CLAUDE.md, ~/.dotfiles/claude/skills/typescript/SKILL.md

---

### 2026-04-16: Ban em-dashes / en-dashes in file content

**Added:**
- Critical rule: never write em-dash or en-dash characters into code, comments, docs, or commit messages. Use ASCII `--` or `-` instead. Triggered by a session where an Edit-then-Read round-trip on a Windows host turned in-file em-dashes into mojibake, which then broke subsequent Edit string-matching and forced a full Write rewrite of the file. Chat replies to the user are unaffected.

**Files:** ~/.dotfiles/claude/CLAUDE.md

---

### 2026-04-16: Add validate-before-committing rule

**Added:**
- Critical rule: NEVER commit unverified fixes. Must run the code path and confirm broken->working before git commit. Added to CLAUDE.md after a session where multiple cert/infra fixes were committed before being validated end-to-end, causing wasted cycles.

**Files:** ~/.claude/CLAUDE.md

### Personal ruleset changelog

This file tracks changes to the personal Claude Code ruleset (`~/.claude/CLAUDE.md`) and associated skills/commands.

---

### 2026-04-15: Add no-magic-values guidance to all language skills

**Added:**
- "No Magic Values" section to 7 language skills (TypeScript, Python, C#, Go, Rust, Ruby, Shell) with idiomatic patterns per language and consistent "When Literals Are Fine" exceptions

**Files:** claude/skills/typescript/SKILL.md, claude/skills/python/SKILL.md, claude/skills/csharp/core.md, claude/skills/go/core.md, claude/skills/rust/core.md, claude/skills/ruby/core.md, claude/skills/shell/SKILL.md

---

### 2026-04-08: plan-it and review-it emit next-step commands

**Changed:**
- `/plan-it` now outputs both `/review-it` and `/do-it` commands with the concrete `.specs/{slug}/plan.md` path so the user can copy either
- `/review-it` now outputs a `/do-it <plan-path>` command after the review summary

**Files:** claude/shared/plan-it-instructions.md, claude/shared/review-it-instructions.md

### 2026-03-18: Improve war-report specificity and formatting

**Changed:**
- Added explicit rule requiring specific entries (name the feature/component/system) -- generic statements like "fixed a bug" are never acceptable
- Added bad example section showing what NOT to write
- Enforced active voice and no trailing periods on entries
- Updated good examples to match new formatting rules

**Files:** claude/skills/war-report/SKILL.md

### 2026-02-26: Fix Windows console window flashing caused by uv in hooks

**Fixed:**
- Replaced `uv run` with bare `python` in all hook commands in `settings.json` -- `uv.exe` spawns visible `conhost.exe` windows on the hook execution path in Claude Code v2.1.45+
- Removed redundant `bash -c` wrapper from all Python hook commands (was spawning an unnecessary extra bash layer)
- Normalized outlier hook patterns: PermissionRequest no longer uses `-l` (login shell) or bare `python` without `uv`; statusLine uses `$HOME` instead of `~`
- Added `pip install pyyaml tree-sitter tree-sitter-bash` to both `install` and `install.ps1` for hook dependencies
- Updated tracking doc with diagnostic findings and posted follow-up comments to #28138 and #14828
- Cleaned up duplicate uv binaries (orphaned pip installs shadowing WinGet version)

**Root cause:** Claude Code v2.1.45+ lost `windowsHide: true` on the hook spawn path. Any hook command that launches a Windows console-subsystem binary (like `uv.exe`) allocates a visible `conhost.exe`. Bare `python` runs inside the existing bash process so no new console is allocated.

**Files:** `claude/settings.json`, `claude/tracking/windows-console-flashing.md`, `install`, `install.ps1`

---

### 2026-02-26: /review-plan file persistence -- findings survive context compaction

**Changed:**
- All reviewer agents now write findings to files at `.specs/{plan-name}/review-{N}/{reviewer-slug}.md`
- Rebuttal agents read peer findings from files and write rebuttals to `rebuttal-{slug}.md`
- Synthesis step reads from files (canonical source) rather than conversation context
- Final synthesis written to `review-{N}/synthesis.md` for permanent record
- New "Review Output Directory" section documents the file structure, naming conventions, and derivation rules
- Step 1 now includes creating the output directory (`mkdir -p`)
- Step 3 explicitly instructs main agent to re-read findings from files before rebuttal round
- Step 4 explicitly instructs main agent to re-read from files before synthesis
- Rebuttal prompt templates updated to use Read tool for file-based input

**Why:** During a real review, context compaction between Step 2 (5 reviewer agents) and Step 3 (rebuttal round) caused all verbatim reviewer findings to be lost. The synthesis had to reconstruct from a compaction summary, skipping the formal rebuttal round entirely. File persistence eliminates this failure mode.

**Files:** `~/.dotfiles/claude/shared/review-plan-instructions.md`

---

### 2026-02-25: Major /review-plan redesign -- dynamic panels, outside-the-box expert, rebuttal round

**Changed:**
- Dynamic expert panel -- main agent analyzes plan content and composes the reviewer panel (4-8 experts) instead of hardcoded 4
- 3 mandatory reviewers (Completeness, Adversarial, Outside-the-Box) + dynamic selection from suggested pool
- New "Outside-the-Box / Simplicity" mandatory reviewer -- questions the approach itself, checks industry best practices via web search, evaluates proportionality of complexity to goal (`max_turns: 8`)
- Suggested expert pool with 6 archetypes (Ops/SRE, Security, Database, Networking, Cost, Compliance) as starting points; pool is a reference, not a constraint -- custom reviewers encouraged
- Rebuttal round (Step 3) -- after all reviewers complete, domain experts respond to OtB findings with AGREE/PARTIAL/DISAGREE. Uses haiku, `max_turns: 1` for speed. Consensus determines whether complexity is justified or the plan should simplify.
- Enforce parallel launch -- all Task calls must be in a single message (mandatory)
- `max_turns: 5` for standard reviewers, `max_turns: 8` for Outside-the-Box
- Cap findings at 8 per reviewer
- Outside-the-Box assessment + rebuttal summary gets its own prominent section in output
- Remove redundant "Suggested Plan Edits" section -- findings already contain suggestions
- Panel is presented to user before launch (but launched immediately, no approval wait)

**Files:** `~/.dotfiles/claude/shared/review-plan-instructions.md`

---

### 2026-02-25: Create /review-plan command

**Added:**
- `/review-plan` command -- launches 4 parallel expert reviewers (Ops/SRE, Security, Completeness, Adversarial/Red Team) against a plan file
- Thin command file at `~/.dotfiles/claude/commands/review-plan.md`
- Full instructions at `~/.dotfiles/claude/shared/review-plan-instructions.md`

**Files:** `~/.dotfiles/claude/commands/review-plan.md`, `~/.dotfiles/claude/shared/review-plan-instructions.md`

---

### 2026-02-21: Add workflow orchestration rules

**Added:**
- "Plan mode default" critical rule -- enter plan mode for non-trivial tasks, re-plan on failure
- "Workflow Orchestration" section with task tracking (`tasks/todo.md`, `tasks/lessons.md`), demand elegance, autonomous bug fixing, and verification-before-done
- Self-improvement loop: update `tasks/lessons.md` after any user correction

**Changed:**
- KISS principle -- added "every change should touch minimal code"
- Subagent guidance -- expanded to "use liberally, one focused task per subagent, throw more compute at complex problems"

**Files:** `claude/CLAUDE.md`

---

### 2026-02-17: Eliminate provenance-based work avoidance

**Added:**
- New critical rule: "Never use provenance to avoid requested work" -- blocks using "pre-existing", "not my changes", etc. as reasons to skip user-requested work

**Changed:**
- "Fix ALL errors and warnings" -- removed escape hatch language ("prove it's pre-existing"), replaced with "fix them all regardless of who introduced them"
- "Never revert user changes" -> renamed to "No unsolicited destructive git actions" -- narrowed scope to destructive actions only, no longer implies skipping requested work on files you didn't author
- `/commit` instructions now explicitly state to commit ALL uncommitted files matching auto-stage rules, regardless of who made the changes

**Files:** `claude/CLAUDE.md`, `claude/shared/commit-instructions.md`

---

### 2026-02-16: Add root cause analysis rules and common pitfalls

**Added:**
- Technology capabilities verification rule (search docs before claiming limitations)
- Root Cause Analysis section (investigate before fixing, never mask symptoms)
- Common pitfalls: removing functionality as fix, multiple deploy cycles, silent query failures

**Files:** ~/.claude/CLAUDE.md

---

### 2026-02-15: CLAUDE.md Cleanup & Skill Trigger Expansion

**Removed:**
- Session History Capture section (never produced meaningful entries, only "session_end" stubs)
- Auto-Activating Skills cheat sheet (redundant with skill frontmatter descriptions)
- Research archive reference line (already covered in research-archive skill)

**Changed:**
- Broadened activation triggers in 11 SKILL.md files: docs, llmstxt, code-review, docker, database, csharp, terraform, ansible, go, ruby, rust
- Added missing file patterns, CLI commands, and language concepts to each skill's description
- Added changelog maintenance instruction to CLAUDE.md (replacing passive reference)

**Impact:**
- ~42 lines of redundant instructions removed from CLAUDE.md
- Skills now auto-activate on broader set of relevant keywords and file patterns

**Files:**
- `~/.claude/CLAUDE.md`
- `~/.claude/skills/{docs,llmstxt,code-review,docker,database,csharp,terraform,ansible,go,ruby,rust}/SKILL.md`

---

### 2025-11-10: Ruleset Optimization (History Analysis)

**First `/optimize-ruleset personal` run:**
- Analyzed all 242 history entries (Nov 7-10, 2025)
- Created CHECKPOINT file for incremental future runs
- Identified 7 patterns from actual usage

**HIGH priority additions** (based on 3+ occurrences):
- **KISS principle** added to Critical Rules: "Default to SIMPLEST solution. No features 'just in case'. MVP first."
- **Absolute paths** added to Communication: "Always provide absolute paths in responses (not relative)"
- **Real-time checklist tracking** enhanced in TodoWrite: "mark [x] IMMEDIATELY after each completion"
- **Idempotent scripts** added to Common Pitfalls: "ALL setup/install scripts MUST be safely re-runnable"

**MEDIUM priority additions** (2 occurrences):
- **Complete tasks** added to Tool Preferences: "Complete ALL steps of clear-scope tasks without asking between steps"
- **Detect state directly** added to Common Pitfalls: "Detect state from system directly" (avoid tracking files)
- **Fail-fast** already covered in development-philosophy skill (no change needed)

**Results:**
- Before: 82 lines, 410 words (~533 tokens)
- After: 87 lines, 468 words (~608 tokens)
- Added: +75 tokens (14% increase)
- Addresses: 9 checklist reminders, 3 KISS violations, 3 idempotency issues, 32 path clarifications per session

**Token efficiency maintained:**
- Personal ruleset stays minimal (87 lines, under 100-line target)
- 10 skills (13,616 tokens) load only when relevant
- Progressive disclosure architecture preserved

---

### 2025-11-10: Skills Consolidation from GitHub Copilot Analysis

**Analyzed 7 GitHub Copilot projects** and consolidated best practices into Claude Code skills:
- agent-spike, mentat-cli, joyride-python, ContextMenuEditor, onboard, attempt-one, onramp
- 18 .specstory chat histories analyzed
- ~6,000 lines of Copilot instructions reviewed

**Created GitHub Copilot template repository:**
- Location: `/c/Projects/copilot-instructions-template/`
- 9 consolidated instruction files (python, dockerfile, devcontainer, testing, makefile, ignore-files, self-explanatory-code, copilot_customization, mcp_services)
- 4 prompt files (commit, check, test, lint)
- Ready for reuse across projects

**Enhanced python-workflow skill:**
- Merged patterns from copilot-python-workflow
- Added UV-exclusive commands table (OK: correct vs BAD: incorrect)
- Added CRITICAL section for zero warnings tolerance
- Added CQRS/IoC architecture patterns
- Enhanced testing workflow (targeted during dev, full before commit)
- Self-explanatory code philosophy
- Optimized for Haiku 4.5 (directive language, tables, examples preserved)

**Enhanced container-projects skill:**
- Merged patterns from copilot-container-workflow
- Added CRITICAL section for Docker Compose V2 (no `version:`, use `docker compose`)
- Added 12-factor app compliance table
- Added security-first practices (non-root users, Alpine images)
- Multi-stage build examples
- Health check patterns
- DevContainer configuration
- DNS configuration (.internal vs .local)
- Optimized for Haiku 4.5 (doubled practical examples, 3 tables for scanning)

**Created testing-workflow skill:**
- New standalone skill for testing patterns
- CRITICAL: Zero warnings tolerance with status table
- Targeted testing during development
- Full suite before commits
- >80% coverage on critical paths
- AAA pattern, fixtures, mocking, parametrization
- Pre-commit requirements checklist
- Optimized for Haiku 4.5

**Enhanced development-philosophy skill:**
- Merged copilot-communication-style and copilot-autonomous-execution patterns
- Added BE BRIEF communication (action over commentary, one sentence max)
- Added autonomous execution workflow (7 steps)
- Self-recovery from errors
- Complete tasks fully before returning
- Execute immediately, don't ask permission
- Optimized for Haiku 4.5

**Updated CLAUDE.md:**
- Updated skill descriptions to reflect enhanced capabilities
- Added testing-workflow to core workflows
- Consolidated "Copilot-Derived Patterns" into core workflows
- Updated Python skill: uv-exclusive, zero warnings, CQRS
- Updated Containers skill: Compose V2, 12-factor, multi-stage
- Updated Development Philosophy: BE BRIEF, autonomous execution
- Maintained under 100 lines (85 lines)

**All Copilot references removed:**
- Skills rewritten as native Claude Code guidance
- Adapted applyTo frontmatter -> activation triggers
- Adapted .github/ directory -> .claude/ directory
- Adapted copilot-instructions.md -> CLAUDE.md references
- No "Copilot" branding in any skill

**Token efficiency:**
- Skills auto-activate based on project signals
- Examples preserved for pattern recognition
- Directive language for Haiku 4.5
- Tables and lists for scanability

---

### 2025-11-08: Git Workflow & Commit Command Optimization

**Optimized commit.md for Haiku 4.5:** (38% reduction)
- Before: 114 lines, 478 words, ~621 tokens
- After: 87 lines, 297 words, ~386 tokens
- Removed philosophical framing and skill references
- Inlined critical security patterns and commit types
- Pure procedural checklist format
- HEREDOC template provided inline

**Optimized git-workflow/SKILL.md:** (36% reduction)
- Before: 139 lines, 761 words, ~989 tokens
- After: 97 lines, 485 words, ~631 tokens
- Removed duplicate push behavior section
- Reduced examples from 6 to 2
- Converted commit types to table format
- Consolidated security warnings
- Removed meta-commentary

**Architecture Benefits:**
- Total system: 1,610 -> 1,017 tokens (37% reduction)
- Command is purely procedural with inline data
- Skill contains philosophy and rationale
- No help separation needed (simpler workflow than prompt engineering)
- Follows "Commands execute, skills educate" principle

**Haiku 4.5 Improvements:**
- Direct checklist format in command
- No "consult skill" indirection
- Critical data (patterns, types) inline for execution
- Removed verbose headers and examples

---

### 2025-11-08: Prompt Engineering Optimization & Help Separation

**Created `/prompt-help` command for documentation:**
- New dedicated help command (106 lines, ~260 tokens)
- Routes help requests to skill for documentation
- Handles "all techniques" or specific technique queries
- Clean separation: execution vs documentation

**Optimized prompt-engineering skill:** (56% reduction)
- Before: 499 lines, ~4,209 tokens
- After: 328 lines, ~1,872 tokens
- Consolidated 3 quick references into 1 decision tree
- Converted selection guide to compact decision tree format
- Compressed anti-patterns to table format
- Streamlined effectiveness indicators
- Kept all 7 technique templates intact (essential functionality)

**Updated optimize-prompt.md:**
- Now 106 lines, ~411 tokens (previously had help content removed)
- Help mode redirects to `/prompt-help` command
- Pure execution logic, no documentation overhead

**Architecture Benefits:**
- Normal optimization: Loads 2,283 tokens (optimize + skill)
- Help request: Loads 2,132 tokens (prompt-help + skill)
- ~40% token savings vs combined approach
- Clean command separation: optimize, help, skill

---

### 2025-11-08: Major Command & Skill Optimization for Haiku 4.5

**Optimized for Haiku 4.5 Compatibility:**

**Changed:**
- **ruleset-optimization skill**: Removed procedural overlap, kept philosophy only (36% reduction)
  - Before: 262 lines, ~1,414 tokens
  - After: 161 lines, ~900 tokens
  - Removed numbered workflow steps, kept principles and guidelines

- **optimize-ruleset.md command**: Massive streamlining (81% reduction!)
  - Before: 1,792 lines, ~9,673 tokens
  - After: 356 lines, ~1,821 tokens
  - Removed philosophical explanations (now references skill)
  - Simplified to direct procedural steps
  - Kept all critical bash commands and logic

- **analyze-permissions.md command**: Enhanced with clear phases (+124% for clarity)
  - Before: 91 lines, ~580 tokens
  - After: 299 lines, ~1,300 tokens
  - Added 6-phase structure for better Haiku execution
  - Added explicit error handling and edge cases

- **optimize-prompt.md command**: Integrated help functionality
  - Added frontmatter with argument-hints for all 7 techniques + help
  - Merged prompt-help.md content into main command
  - Deleted redundant prompt-help.md file

**Key Principle Applied:**
- **"Commands execute, skills educate"** - Clear separation of concerns
- Commands: Direct procedural steps (WHAT and HOW)
- Skills: Philosophy and principles (WHY and WHEN)

**Total Impact:**
- System-wide token reduction: **66%** (11,667 -> 4,021 tokens)
- optimize-ruleset alone: **7,852 tokens saved per invocation**
- Better Haiku 4.5 compatibility through:
  - Direct imperatives ("Run X" not "Consider running X")
  - Numbered lists instead of nested explanations
  - No meta-commentary or educational asides
  - Clear phase structure throughout

**Files Modified:**
- `~/.claude/skills/ruleset-optimization/SKILL.md`
- `~/.claude/commands/optimize-ruleset.md`
- `~/.claude/commands/analyze-permissions.md`
- `~/.claude/commands/optimize-prompt.md` (enhanced)
- `~/.claude/commands/prompt-help.md` (deleted - merged into optimize-prompt)

**Backups Created:**
- `.backup` files preserved for all modified files

---

### 2025-11-05: Prompt Engineering Skill and Commands

**Added:**
- Created `prompt-engineering` skill with 7 advanced techniques
- Created `/optimize-prompt` command for transforming prompts
- Created `/prompt-help` command for documentation

**Details:**
- Based on "The Mental Models of Master Prompters" YouTube video
- Techniques include: meta-prompting, recursive-review, deep-analyze, multi-perspective, deliberate-detail, reasoning-scaffold, temperature-simulation
- Manual invoke only (not auto-activate) to control token usage
- Intelligent technique selection when user doesn't specify techniques
- Composable: Can combine multiple techniques (e.g., `deep-analyze,multi-perspective`)

**Files:**
- `~/.claude/skills/prompt-engineering/SKILL.md`
- `~/.claude/commands/optimize-prompt.md`
- `~/.claude/commands/prompt-help.md`

**Impact:**
- Enables transformation of basic prompts into high-quality structured prompts
- Provides systematic approaches for verification, multi-perspective analysis, and detailed reasoning
- Token-aware (1.5-4x cost depending on techniques used)

---

### 2025-11-04: Ruleset Optimization via /optimize-ruleset

**Changed:**
- Added Context Efficiency Philosophy as PRIMARY principle
- Enhanced terminology section with explicit "local vs project" distinction
- Updated skill references with CRITICAL rules (uv run, never push, STATUS.md first)
- Emphasized security-first git workflow

**Impact:**
- Total optimization: ~28% context reduction achieved in agent-spike project
- Skills now include history-learned rules to prevent future errors
- Clearer distinction between personal and project rulesets

---

### 2025-11-04: Moved Context-Specific Sections to Skills

**Created Skills:**
- `python-workflow` skill (~18 lines saved in non-Python projects)
- `multi-agent-ai-projects` skill (~7 lines saved)
- `web-projects` skill (~6 lines saved)
- `container-projects` skill (~6 lines saved)

**Impact:**
- Total potential savings: ~37 lines when working in non-matching projects
- Skills auto-activate based on project context (files, configs, patterns)
- Improved token efficiency through progressive disclosure

**Files:**
- `~/.claude/skills/python-workflow/SKILL.md`
- `~/.claude/skills/multi-agent-ai-projects/SKILL.md`
- `~/.claude/skills/web-projects/SKILL.md`
- `~/.claude/skills/container-projects/SKILL.md`

---

### 2025-11-04: Git Workflow Moved to Skill

**Created:**
- `git-workflow` skill in `~/.claude/skills/git-workflow/`

**Changes:**
- Moved all git workflow guidelines from CLAUDE.md to skill
- Skill auto-activates when git operations detected
- Saves ~70 lines of context in non-git sessions

**Impact:**
- Progressive disclosure improves token efficiency
- Git guidelines available when needed, not baseline overhead

**File:**
- `~/.claude/skills/git-workflow/SKILL.md`

---

### 2025-11-04: Enhanced Git Workflow Section

**Added:**
- Extracted core principles from `/commit` command
- Security-first approach (scan before committing)
- Documented logical commit grouping (docs, test, feat, fix, etc.)
- Specified commit message format with HEREDOC
- Added verification and push behavior rules

**Impact:**
- Ensures consistent git workflow regardless of how commits are requested
- Security scanning always runs first
- Standardized commit message format across all commits

---

### 2025-11-04: Initial Personal Ruleset Creation

**Created:**
- `~/.claude/CLAUDE.md` (personal ruleset applying to all projects)

**Included:**
- Terminology clarification (local vs personal ruleset)
- Documented uv best practices for Python projects
- Added todo list management guidelines
- Included multi-agent project patterns
- Context efficiency philosophy
- Security & privacy guidelines
- Session management patterns

**Context:**
- Created during multi-agent learning project
- Established foundation for skills-based architecture
- Emphasized progressive disclosure and token efficiency

**Impact:**
- Centralized personal preferences across all projects
- Foundation for context-efficient ruleset architecture
- Clear separation between personal and project-specific rules

---

### Changelog Conventions

**Entry Format:**
```markdown
### YYYY-MM-DD: Brief Description

**Added/Changed/Removed/Fixed:**
- Bullet points describing changes

**Details:**
- Additional context if needed

**Files:**
- List of files created/modified

**Impact:**
- What changed for the user
- Performance/efficiency gains
- Behavioral changes
```

**Categories:**
- **Added**: New features, skills, commands
- **Changed**: Modifications to existing functionality
- **Removed**: Deprecated or deleted features
- **Fixed**: Bug fixes or corrections

## Pi runtime history


### 2026-07-15: Ground typed workflows in end-to-end design

**Why:** The typed-agent skill described stage boundaries but did not explicitly
require walking an unfamiliar workflow end to end before automation or keeping
validator execution and pass/fail routing outside semantic stages.

**Changed:**
- Added a pre-automation walkthrough that identifies deterministic inputs,
  semantic judgments, validation signals, and operator approval boundaries.
- Kept linters, tests, pass/fail decisions, and retry limits in deterministic
  code while allowing bounded diagnostics to return to a remediation stage.
- Linked the source video and relevant timestamps.

**Files:** `pi/skills/typed-agent-workflows/SKILL.md`, `pi/CHANGELOG.md`

---

### 2026-07-15: Surface commit planner fallback reasons

**Why:** `/commit` discarded commit-planner exceptions and reported every
failure as planner unavailability, preventing diagnosis after fallback.

**Changed:**
- Logged a bounded, single-line, credential-redacted planner failure reason
  before deterministic ownership fallback.
- Kept the fallback warning separate from the underlying cause.
- Added helper and registered-command regressions.

**Files:** `pi/extensions/workflow-commands.ts`,
`pi/tests/workflow-commands-pure.test.ts`,
`pi/tests/workflow-commands.test.ts`, `pi/CHANGELOG.md`

---

### 2026-07-14: Rank improvements by verified usage impact

**Why:** `/improve` selected the oldest pending candidate even when another
supported issue affected a much more frequently used surface. Several stats
commands also had attribution, scope, and window defects that made their counts
unsafe for prioritization.

**Changed:**
- Ranked safety and correctness candidates first, then normal candidates by
  verified 30-day usage, confidence, age, and interaction ID.
- Added structured skill, command, extension, and tool targets to review
  records while preserving legacy `targetSkill` records.
- Distinguished observed, verified-zero, and unknown usage in improvement
  discussions.
- Corrected repeated router hash attribution, trace/session double counting,
  current `/usage` ownership, orchestration review windows, skill roots and
  unused windows, and configured usage-session roots.
- Made `/usage-stats` render deterministically without starting a provider
  turn and removed unused extension-stats TUI code.

**Files:** `pi/extensions/extension-stats.ts`,
`pi/extensions/orchestration-stats.ts`, `pi/extensions/router-stats.ts`,
`pi/extensions/skill-stats.ts`, `pi/extensions/usage.ts`,
`pi/extensions/workflow-friction-review.ts`, `pi/lib/workflow-friction.ts`,
`pi/tests/orchestration-stats.test.ts`, `pi/tests/session-jsonl-stats.test.ts`,
`pi/tests/skill-stats.test.ts`, `pi/tests/usage.test.ts`,
`pi/tests/workflow-friction.test.ts`, `pi/README.md`, `pi/CHANGELOG.md`

---

### 2026-07-14: Stabilize secret-review coverage

**Why:** `/commit` required the secret reviewer to reproduce path, label, line,
and match text verbatim. Harmless output normalization could therefore fail
exact candidate coverage before commit planning.

**Changed:**
- Assigned stable numeric IDs to deterministic scanner candidates.
- Reduced reviewer output to each candidate ID, classification, and reason.
- Retried one incomplete response with an explicit exact-coverage correction.
- Validated exact ID coverage and joined decisions back to original candidate
  metadata in deterministic code.
- Added focused prompt, coverage, and retry regressions.

**Files:** `pi/extensions/workflow-commands.ts`,
`pi/lib/workflow-commands/prompts.ts`,
`pi/tests/workflow-commands-pure.test.ts`,
`pi/tests/workflow-prompts.test.ts`, `pi/CHANGELOG.md`

---

### 2026-07-14: Surface commit planner warnings

**Why:** `/commit` accepted validated planner warnings but discarded them before
creating commits, leaving useful uncertainty invisible to the operator.

**Changed:**
- Normalized non-empty planner warnings.
- Emitted warnings through the existing commit activity stream before staging
  planned commit groups.
- Added focused coverage for trimming, empty warnings, and display formatting.

**Files:** `pi/extensions/workflow-commands.ts`,
`pi/tests/workflow-commands-pure.test.ts`, `pi/CHANGELOG.md`

---

### 2026-07-14: Consolidate self-improvement into /improve

**Why:** Interaction capture, trend review, candidate approval, and skill review
were exposed as overlapping workflows with inconsistent evidence and outcomes.

**Changed:**
- Added `/improve` as the only public self-improvement command.
- Combined one supported candidate with recent interaction metadata, prior
  experiments, and target-skill usage before the Apply/Edit/Skip decision.
- Retired `/capture`, `/learning-review`, `/workflow-review`, and
  `/skill-review` while preserving automatic background review and existing
  decision records.
- Kept `/review-it` for plan and PRD review and stats commands as read-only
  diagnostics.

**Files:** `pi/extensions/workflow-friction-review.ts`,
`pi/extensions/skill-review-command.ts`, `pi/lib/workflow-friction.ts`,
`pi/tests/workflow-friction.test.ts`, `pi/tests/skill-review.test.ts`,
`pi/README.md`, `pi/CHANGELOG.md`

---

### 2026-07-14: Prevent incremental standalone-review blockers

**Why:** A material auto-applied plan rewrite bypassed renewed panel coverage, and
standalone blockers were discovered one repair pass at a time until the fixed
repair budget was exhausted.

**Changed:**
- Added a mandatory post-change adversarial panel when review fixes materially
  change a plan's objective, architecture, runtime boundary, task structure, or
  archive mechanism.
- Added a pre-readiness contract audit for repository prerequisites, command
  truth tables, exact workflow boundaries, mutations, rollback, archive
  postconditions, and checklist integrity.
- Moved standalone readiness to a large reviewer that must inspect every audit
  domain and consolidate all blockers before repair passes begin.

**Files:** `pi/skills/workflow/review-it.md`,
`pi/tests/workflow-prompts.test.ts`, `pi/CHANGELOG.md`

---

### 2026-07-14: Add typed-agent workflows

**Why:** Pi commands needed a reusable boundary between deterministic workflow
code and focused semantic decisions without a second language or general
workflow framework.

**Changed:**
- Added a Pi SDK-backed `defineAgent` API with typed input/output contracts,
  isolated sessions, one correction retry, cancellation, and disposal.
- Migrated `/commit` untracked classification, secret review, and commit planning
  while keeping Git and policy mutations deterministic.
- Added a focused skill and evidence-triggered specifications for deferred
  capabilities.

**Files:** `pi/lib/typed-agent.ts`, `pi/extensions/workflow-commands.ts`,
`pi/tests/typed-agent.test.ts`, `pi/tests/workflow-commands.test.ts`,
`pi/tests/workflow-commands-pure.test.ts`,
`pi/skills/typed-agent-workflows/SKILL.md`,
`pi/skills/typed-agent-workflows/roadmap.md`, `pi/CHANGELOG.md`

---

### 2026-07-14: Add reviewed cross-session learning

**Why:** Durable corrections should carry across sessions without allowing a
background review to rewrite instructions automatically.

**Changed:**
- Detect explicit remember requests and corrections after an existing turn and
  queue them for the bounded workflow review.
- Added `/learning-review` to discuss one supported lesson at a time using the
  full 1-3-1 format.
- Added append-only Apply/Edit/Skip decisions. Applied lessons require target
  paths, validation evidence, and rollback instructions and create an experiment
  marker for later comparison.

**Files:** `pi/extensions/workflow-friction-review.ts`,
`pi/lib/workflow-friction.ts`, `pi/tests/workflow-friction.test.ts`,
`pi/README.md`, `pi/CHANGELOG.md`

---

### 2026-07-14: Tighten workflow boundaries and record session closure

**Why:** Recent session review found scope expansion, informational requests
causing mutation, supported entrypoints being bypassed, and active sessions
being mistaken for completed work.

**Changed:**
- Narrowed global workflow guidance to in-scope failures, read-only
  informational requests, bounded execution, and conditional delegation.
- Added durable `workflow.sessionClose` evidence for logical shutdowns while
  keeping close state distinct from work completion.
- Documented the lifecycle marker and its provisional-state semantics.

**Files:** `pi/AGENTS.md`, `AGENTS.md`, `pi/extensions/session-hooks.ts`,
`pi/tests/session-hooks.test.ts`, `pi/docs/workflow-eval-telemetry.md`,
`pi/CHANGELOG.md`

---

### 2026-05-26: Document workflow eval telemetry operations

**Why:** Pi workflow telemetry now records dispatch events and defines lifecycle
data for future adaptive review sizing. Pi workflow maintainers need clear
rules for what runtime telemetry not to commit and which docs/tests to update
when the contract changes.

**Added:**
- Workflow eval telemetry guidance: runtime JSONL stays local by default,
  DuckDB files are rebuildable caches, and workflow telemetry contract changes
  must update the Pi telemetry docs and prompt-contract tests.
- Operations documentation and a local telemetry query helper.

**Files:** `pi/docs/workflow-eval-telemetry.md`,
`pi/docs/workflow-eval-operations.md`, `pi/scripts/workflow-eval-query.py`,
`pi/CHANGELOG.md`

---

### 2026-07-15: Preserve service-managed storage ownership during apply

**Why:** Storage preparation reset an existing Forgejo dataset to the initial
mapped-root owner before service orchestration, leaving the database unavailable
when a later play failed before Forgejo configuration ran.

**Changed:**
- Limited initial ZFS dataset ownership assignment to newly created datasets.
- Added regression coverage and documented ownership handoff to the service role.

**Files:** `infra/ansible/tasks/zfs-dataset.yml`,
`tests/test_ansible_safety.py`, `docs/forgejo-bind-mount.md`

---

### 2026-07-15: Finish agent-chain retirement and isolate YouTube environments

**Why:** Generated Pi projects still loaded the deleted agent-chain extension,
multi-team guidance required a conversation log with no writer, and `/yt`
commands selected ignored virtual environments tied to a removed Python install.

**Changed:**
- Removed retired agent-chain recipes from `pi-new` and added a generated-project
  regression.
- Retired the active-listener skill and its unsupported conversation-file
  contract while preserving native Pi session and subagent context.
- Made menos `/yt` commands use the locked project in an isolated uv environment
  and local fallback scripts use their PEP 723 metadata.
- Verified the prompt migration repeatedly in parallel and serial test modes; no
  persistent ordering defect was reproduced.

**Files:** `pi/scripts/pi-new`, `test/test_pi_new.py`,
`pi/multi-team/agents/`, `pi/multi-team/skills/`, `pi/prompts/yt.md`,
`pi/tests/workflow-prompts.test.ts`, `.specs/pi-extension-refactors/backlog.md`

---

## 2026-07-15: Document and verify mixed task DAG execution

**Why:** A mixed graph needs one public workflow that keeps manual work
main-thread-owned while concurrently executing and joining ready subagent work.

**Changed:**
- Added end-to-end coverage for graph batch aliases, manual transitions,
  concurrent `execute_many`, one-shot `await`, artifacts, and downstream
  readiness without public-action polling.
- Documented optional durable main-thread lists, mixed graphs, bounded fan-out,
  one-shot waits, and explicit `write_failed` recovery.

**Files:** `pi/tests/task-tools.test.ts`, `pi/README.md`, `CHANGELOG.md`

---
