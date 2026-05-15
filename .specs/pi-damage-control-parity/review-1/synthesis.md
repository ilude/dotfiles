---
date: 2026-05-14
status: synthesis-complete
---

## Review Panel

| reviewer | base agent | assigned expert persona | why selected | key area reviewed | adversarial angle |
|---|---|---|---|---|---|
| reviewer | reviewer | Completeness & explicitness reviewer | Mandatory standard reviewer | assumptions, acceptance criteria, `/do-it` readiness | assume hidden context and vague scope will break execution |
| security-reviewer | security-reviewer | Adversarial/red-team reviewer | Mandatory standard reviewer | safety-system failure modes, secret/evidence risk | assume false parity claims create unsafe underblocking |
| product-manager | product-manager | Simplicity/scope reviewer | Mandatory standard reviewer | smaller staged alternatives, over-engineering | assume broad parity scope delays the reported rm regression fix |
| typescript-policy-adapter-reviewer | typescript-pro | TypeScript policy adapter/runtime integration reviewer | Plan changes Pi TS loader, engine, handlers | YAML parsing, regex compatibility, path normalization, tool scoping | assume Python-to-TypeScript behavior mismatches silently change outcomes |
| qa-parity-reviewer | qa-engineer | Safety policy parity and regression test reviewer | Plan success depends on automated parity evidence | oracle design, positive/negative fixtures, no execution | assume representative tests give false confidence |
| devops-automation-reviewer | devops-pro | Automation, CI, and rollout reviewer | Plan relies on pnpm/uv/Make evidence and local reload notes | reproducibility, logs, archive, install assumptions | assume fresh `/do-it` session lacks hidden state |

## Standard Reviewer Findings

- Completeness reviewer found two must-fix gaps: parity scope was too vague, and canonical source/override precedence was undefined.
- Security reviewer found the plan could overclaim parity while deferring AST/semantic/sequence/post-tool safety mechanisms, and could silently drop unsupported Claude fields.
- Product manager argued for staging the work so immediate Bash command parity is delivered before broader path/advanced parity.

## Additional Expert Findings

- TypeScript reviewer found risks in YAML parsing, Python-vs-JS regex compatibility, Windows/MSYS path normalization, tool scoping, and rule ordering.
- QA reviewer found the expected oracle and fixture coverage underspecified; Pi-only tests could encode the new implementation rather than Claude behavior.
- DevOps reviewer found validation/evidence commands were not consistently log-producing and `make check-pi-ci` was insufficient without extension typecheck.

## Suggested Additional Reviewers

Selected domain reviewers:

- `typescript-pro` as TypeScript policy adapter/runtime integration reviewer: relevant because this plan changes Pi TypeScript extension code and must handle YAML, regex, and runtime event semantics.
- `qa-engineer` as safety policy parity/regression reviewer: relevant because success depends on proving ask/block parity without executing dangerous commands.
- `devops-pro` as automation/CI/rollout reviewer: relevant because `/do-it` must run reproducible validation and archive evidence across Windows Git Bash, pnpm, uv, and Make.

## Bugs (must fix before execution)

All must-fix bugs were applied to `.specs/pi-damage-control-parity/plan.md` in auto-apply mode:

1. Ambiguous parity boundary and misleading full-parity language: fixed by adding Phase A/B/C scope and final-claim limits.
2. Undefined canonical source/merge semantics: fixed by requiring Claude `bashToolPatterns` canonical for Phase A, Pi fallback only, no merge/overlay.
3. Underspecified test oracle: fixed by requiring a Claude-vs-Pi parity runner and `parity-diff.md`.
4. YAML/regex compatibility risks: fixed by requiring typed normalization, boolean coercion tests, and Node compile-all fail-closed behavior.
5. Path/tool scoping divergence: fixed by requiring Bash-only normalized Claude rules and Windows/MSYS path tests.
6. Vague evidence automation: fixed by adding named logs, captured exit-code files, evidence manifest, fixture/mismatch counts, and stale-evidence criteria.
7. `make check-pi-ci` insufficiency: fixed by requiring `make check-pi-extensions` or explicit typecheck + tests.

## Hardening

Applied hardening updates:

1. Evidence secret-scan command and F5 pass/fail criteria.
2. Fake-executor/no-spawn assertions for handler tests.
3. Negative-control fixture requirements.
4. Rollout-note artifact for Pi restart/reload behavior.
5. Concrete unsupported-feature ledger for Phase C mechanisms.

## Simpler Alternatives / Scope Reductions

The reviewed plan now uses staged scope:

- Phase A: Claude `bashToolPatterns` Bash-command parity.
- Phase B: Claude path/write policy sections for supported Pi tool surfaces.
- Phase C: advanced semantic/AST/sequence/post-tool mechanisms as implemented or explicitly deferred.

This keeps the user’s parity goal while preventing misleading “full parity” claims before advanced mechanisms exist.

## Automation Readiness

Ready after auto-apply. The updated plan has exact commands/wrappers, risk/manual-gate decision, evidence artifacts, archive gates, and a consistent `## Execution Checklist`. No manual gate is warranted because execution is local, reversible, non-destructive, and validated with mocked/synthetic tests. Standalone-readiness initially found F5 blockers; two repair passes added exact exit-code capture, subshell-safe commands, a concrete evidence secret scan, manifest fields, and fail criteria. Final standalone-readiness artifact reports `finding_count: 0`.

## Contested or Dismissed Findings

- “Fix only `rm -f` first” was not accepted as final scope because the user explicitly asked for Claude/Pi policy/functionality alignment. It was converted into staged Phase A parity.
- “Full all-352 positive fixtures as a hard prerequisite” was softened to a parity oracle plus curated fixtures and coverage-debt artifact, because every regex may not yet have a maintained synthetic positive command. Unreviewed coverage debt must still be explicit.

## Verification Notes

- `Makefile` confirms `check-pi-ci` runs Vitest but not extension typecheck; `check-pi-extensions` includes both.
- `pi/lib/yaml-mini.ts` documents that booleans remain strings, confirming `ask: true` normalization risk.
- `claude/hooks/damage-control/patterns.yaml` states `bashToolPatterns` are matched against Bash tool commands only, confirming pwsh over-application risk.
- `pi/extensions/damage-control-rules.ts` currently validates only Pi schema, confirming direct Claude schema loading needs an adapter.
- Section integrity check after plan edits found each required heading exactly once.
- Final standalone-readiness check: `.specs/pi-damage-control-parity/review-1/standalone-readiness-3.md`, `finding_count: 0`.

## Timing Notes

| Step | Duration | Notes |
|------|----------|-------|
| Initial review panel | unknown | 6/6 reviewers succeeded; per-reviewer timing unavailable |
| Recovery calls | not run | all artifacts existed and were usable |
| Verification | unknown | read/grep used on Makefile, yaml-mini, Pi damage-control loader, Claude patterns |
| Synthesis | unknown | `.specs/pi-damage-control-parity/review-1/synthesis.md` |
| Auto-apply | unknown | plan updated; applied fixes logged in `applied-fixes.md` |
| Standalone readiness | unknown | two repair passes; final finding_count 0 |

## Overall Verdict

**Ready to execute**
