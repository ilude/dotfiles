---
date: 2026-05-11
status: synthesis-complete
---

# Review Synthesis

## Review Panel

| reviewer | base agent | assigned expert persona | why selected | key area reviewed | adversarial angle |
|---|---|---|---|---|---|
| reviewer | reviewer | Completeness and explicitness reviewer | Mandatory standard reviewer | Assumptions, gaps, testability, /do-it readiness | Assume a fresh agent will get stuck on missing contracts |
| security-reviewer | security-reviewer | Red-team/security reviewer | Mandatory standard reviewer | PII, secrets, browser session safety, rollback | Assume hooks are bypassed and page content/session data is hostile |
| product-manager | product-manager | Simplicity and scope reviewer | Mandatory standard reviewer | MVP scope, over-engineering, immediate user value | Assume the plan is solving future architecture before the current follow-check need |
| python-pro | python-pro | Python packaging, CLI, and async provider contract reviewer | Plan creates Python package, async protocol, pydantic models, SQLite repo, CLI | Packaging, imports, dependencies, entrypoints, Windows CLI | Assume import paths and CLI entrypoints fail in clean uv sessions |
| data-engineer | data-engineer | SQLite schema, idempotency, and graph-data integrity reviewer | Plan defines local graph tables and sync events | Primary keys, snapshot completeness, event semantics, migrations | Assume partial pages create false unfollows and duplicate graph rows |
| qa-engineer | qa-engineer | Automation-readiness and validation-gate reviewer | /do-it needs commands, evidence, and durable gates | Acceptance commands, mock/live split, evidence artifacts, checklist | Assume no credentials and no prior conversation context |
| devops-pro | devops-pro | Local secrets, git hooks, age encryption, cross-shell operations reviewer | Plan relies on private dirs, age, hooks, Windows/Git Bash/PowerShell | Hook install, recipients, ignored/tracked paths, shell contracts | Assume hooks are not installed and Windows shims fail |

## Standard Reviewer Findings

- Completeness reviewer found two HIGH readiness gaps: the PII hook has no executable interface, and the browser-agent backend has no concrete integration surface or fixture boundary.
- Security reviewer found HIGH issues in relying on .gitignore/hooks without a deterministic scanner and in using an authenticated browser session without a read-only safety contract.
- Product manager found HIGH scope risk: the MVP expands beyond the immediate follow-list/candidate-check workflow before proving value.

## Additional Expert Findings

- Python reviewer found HIGH packaging/entrypoint/dependency gaps: `pi/x_research` import assumptions, missing console script, and missing dependencies/test tooling.
- Data reviewer found HIGH graph integrity gaps: incomplete pagination can falsely emit unfollow events, and `follow_edges` lacks stated primary key/constraints.
- QA reviewer found HIGH automation gaps: hook verification and live credential/session validation are not executable in a fresh checkout.
- DevOps reviewer found HIGH git/age gaps: hook installation is unspecified, age recipient bootstrapping is absent, and staged plaintext scanning is incomplete.

## Suggested Additional Reviewers

- `python-pro` as Python packaging/CLI reviewer: relevant because the plan creates Python package code and CLI commands; focused on importability, dependencies, async typing, and Windows execution.
- `data-engineer` as SQLite graph integrity reviewer: relevant because the plan stores follow snapshots and edges; focused on keys, migrations, pagination, and false state transitions.
- `qa-engineer` as automation-readiness reviewer: relevant because the plan is intended for `/do-it`; focused on commands, evidence artifacts, live-vs-mock split, and checklist completeness.
- `devops-pro` as local privacy/age/git-hooks reviewer: relevant because the plan depends on gitignored plaintext and encrypted snapshots; focused on hook install, recipient management, and cross-shell execution.

## Bugs (must fix before execution)

1. **No `## Execution Checklist`, `## Validation Contract`, or `## Execution Status` exists.** Evidence: `grep -n '^## ' .specs/x-research-pipeline/plan.md` shows no required durable resume ledger sections. Required fix: add these sections with one unchecked item per executable task/gate and explicit offline/live validation rules.
2. **MVP scope is too broad for the immediate follow-list use case.** Evidence: Objective and T1-T8 include tweets, search, home timeline, two providers, events, encryption tooling, and seed workflow before a minimal following check is proven. Required fix: make Phase 0/1 explicitly follow-list-first, and defer tweets/search/home timeline/browser backend unless needed for validation.
3. **Python packaging and CLI invocation are underspecified.** Evidence: plan uses `pi/x_research` and `uv run x-research` without package config, `[project.scripts]`, dependency declarations, or clean-environment verification. Required fix: define an installable package model, dependencies, console entrypoint, and clean `uv sync`/CLI smoke commands.
4. **Graph integrity rules are insufficient.** Evidence: schema omits primary keys/constraints and pagination completeness rules; events may be emitted from partial snapshots. Required fix: specify constraints, cursor/page semantics, complete-snapshot gating for ended events, migrations, and tests.
5. **PII/age/git-hook controls are not automation-ready.** Evidence: hook interface/install, staged scanner, age recipients, forced-add handling, and encryption round-trip are not fully defined. Required fix: define scanner/hook contracts, install path, .gitignore allowlist, recipient source, and round-trip/forced-add tests.
6. **Browser-agent safety and live-test prerequisites are ambiguous.** Evidence: browser backend says use existing patterns but has no no-click/no-write allowlist, fixture format, or skip behavior when authenticated state is absent. Required fix: define browser read-only contract, mocked parser boundary, optional live smoke preconditions, and `SKIPPED` evidence behavior.

## Hardening

- Add raw payload minimization: store allowlisted normalized fields by default; gate full raw payload capture behind an explicit flag.
- Add credential/config redaction and permission checks for `private/x/config.local.json`; never serialize API keys into DB, logs, errors, or encrypted exports unless explicitly requested.
- Add rollback/runbook coverage: atomic writes, cleanup-on-failure, no-overwrite defaults, restore validation, key rotation, and PII removal guidance.
- Add provider contract examples for twitterapi.io: config schema, endpoint mapping, representative fixture payloads, pagination fields, rate-limit headers, and typed errors.
- Add evidence artifact paths under `.specs/x-research-pipeline/evidence/` for test transcripts, ruff output, staging scans, encryption round-trip, and live-smoke or skip reports.

## Simpler Alternatives / Scope Reductions

- Start with a minimal following-list workflow: sync/import authenticated user's following list, check candidate handles, and optionally encrypt/export results.
- Defer formal multi-provider abstraction until a second real provider is implemented. Keep a thin boundary around twitterapi.io first.
- Defer tweets, search, home timeline, followers, event history, and browser backend unless they are necessary for the follow-check loop.
- Consider replacing event-sourced follow history with a current-following table for MVP; add snapshots/events only if churn history is explicitly needed.

## Automation Readiness

Current plan is not `/do-it` ready. It lacks required durable checklist/status sections, exact hook/scanner commands, package/dependency setup, live credential skip rules, age recipient setup, and evidence artifact requirements. Auto-apply should add a Validation Contract, Execution Checklist, Execution Status, concrete package/CLI contracts, PII guardrail details, and mock/live evidence rules.

## Contested or Dismissed Findings

- Product manager recommended deferring age hooks entirely. Dismissed in part: because the plan explicitly stores PII locally and wants encrypted repo snapshots, basic guardrails should remain. Scope is reduced to a scanner/hook/evidence contract, not a large privacy subsystem.
- Product manager recommended deferring browser backend. Accepted partially: browser-agent should be downgraded to a bounded parser/live-smoke adapter after the follow-list path works, not a core bulk backend.
- No targeted rebuttal was run; findings converged and fixes are compatible.

## Verification Notes

- Missing required sections verified with `grep -n '^## ' .specs/x-research-pipeline/plan.md`; no `Validation Contract`, `Execution Checklist`, or `Execution Status` heading exists.
- Scope breadth verified by reading Objective, Task Breakdown, and Execution Waves: tasks include provider models, SQLite, age tooling, twitterapi.io, browser-agent, sync/query CLI, and seed workflow.
- PII hook ambiguity verified in T3 acceptance criteria: hook smoke test is prose-only and no hook interface/install command is named.
- Browser ambiguity verified in T5: it references existing browser-tools/agent-browser patterns without an API or fixture contract.

## Timing Notes

| Step | Duration | Notes |
|------|----------|-------|
| Initial review panel | unknown | 7/7 subagents succeeded; per-reviewer timing unavailable |
| Recovery calls | run for reviewer only | standard reviewer lacked write tool; retry returned findings and coordinator wrote artifact with constrained writer |
| Verification | unknown | used `grep`/artifact reads to verify high-severity plan claims |
| Synthesis | unknown | artifact path: `.specs/x-research-pipeline/review-1/synthesis.md` |

## Overall Verdict

**Fix bugs first**
