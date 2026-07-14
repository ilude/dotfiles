# Pi Changelog

## 2026-07-14: Prevent incremental standalone-review blockers

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

## 2026-07-14: Add typed-agent workflows

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

## 2026-07-14: Add reviewed cross-session learning

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

## 2026-07-14: Tighten workflow boundaries and record session closure

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

## 2026-05-26: Document workflow eval telemetry operations

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
