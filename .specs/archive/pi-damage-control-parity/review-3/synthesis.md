---
date: 2026-05-14
status: synthesis-complete
---

## Review Panel

| reviewer | base agent | assigned expert persona | why selected | key area reviewed | adversarial angle |
|---|---|---|---|---|---|
| reviewer | reviewer | Completeness & explicitness reviewer | Mandatory standard reviewer | configuration, scope, acceptance criteria | assume `/do-it` cannot infer invented config contracts |
| security-reviewer | security-reviewer | Red-team safety reviewer | Mandatory standard reviewer | underblocking, fail-closed behavior, dangerous test safety | assume unsupported Claude fields or helper subprocesses create silent unsafe allows |
| product-manager | product-manager | Simplicity/scope reviewer | Mandatory standard reviewer | staged delivery and operational simplicity | assume overloaded scope delays the original rm regression fix |
| pi-docs-consistency-reviewer | utility-mini | Pi documentation consistency reviewer | User explicitly requested review against Pi docs | Pi README/extensions docs, settings/source-runtime conventions | assume plan invents config names/workflows not documented by Pi |
| typescript-runtime-reviewer | typescript-pro | Pi TypeScript extension/runtime reviewer | Plan changes TS loader/engine/handlers | YAML helper, settings API, regex runtime, Phase B types | assume plan asks for APIs or paths current TS code cannot support |
| qa-parity-reviewer | qa-engineer | Safety policy parity validation reviewer | Plan depends on parity oracle and evidence gates | fixtures, oracle canaries, no-spawn gates, manifest coverage | assume tests can pass while parity remains unproven |

## Standard Reviewer Findings

- Completeness reviewer found the configuration contract ambiguous and Phase B scope contradictory.
- Security reviewer found unsupported Claude `exfil` field semantics, unhealthy-policy behavior, helper subprocess safety, and Phase B underblocking risks insufficiently specified.
- Product manager found the MVP overloaded and warned that explicit-only policy path configuration may reduce default safety in this dotfiles repo.

## Additional Expert Findings

- Pi docs reviewer checked `pi/README.md`, `pi/extensions/README.md`, Pi settings conventions, and source-vs-runtime policy. It found the plan invented `dangerCtrl.claudePolicyPath`, contradicted documented `yaml-mini` damage-control loading without documenting an exception, missed auto-discovery helper placement constraints, and did not guard generated Pi runtime paths.
- TypeScript reviewer confirmed `loadYamlViaPython` currently shells to ambient `python`/`python3` and returns `undefined`; `settings-loader` does not expand dotted keys; current regex evaluation is case-insensitive/skip-on-invalid.
- QA reviewer found Phase A coverage debt could hide non-parity and that oracle/no-spawn gates needed stronger canaries and broader file scanning.

## Suggested Additional Reviewers

- `utility-mini` as Pi documentation consistency reviewer: selected specifically to satisfy the user request to check the plan against Pi documentation files.
- `typescript-pro` as Pi TypeScript extension/runtime reviewer: selected because the plan changes `pi/extensions` and `pi/lib` behavior.
- `qa-engineer` as safety policy parity validation reviewer: selected because `/do-it` success depends on automated evidence and safe no-execution tests.

## Bugs (must fix before execution)

All must-fix bugs were applied to `.specs/pi-damage-control-parity/plan.md`:

1. Replaced invented `dangerCtrl.claudePolicyPath` contract with documented in-repo discovery plus concrete optional `PI_DAMAGE_CONTROL_CLAUDE_POLICY_PATH`; settings object support must use `loadCascadedSettings().merged` and be documented if implemented.
2. Made Phase B explicitly required for the named path/write sections, not conditional.
3. Required `exfil` semantics to be implemented or excluded from Phase A claims; silent dropping is a failure.
4. Required improving/wrapping `loadYamlViaPython` or using an in-process YAML dependency, with docs for the full-YAML exception.
5. Expanded no-spawn gates to all changed Pi damage-control/parity/oracle test/helper files, with only a dedicated Claude oracle wrapper allowlisted.
6. Required `coverage_debt_count=0` for claimed Phase A parity and added manifest fields for covered/total/excluded counts.
7. Added Pi docs/source-vs-runtime constraints: helper placement outside top-level auto-discovered `pi/extensions/*.ts`, docs updates to `pi/README.md` and `pi/extensions/README.md`, and archive guards for generated Pi runtime paths.

## Hardening

Applied hardening updates:

- Added rollback active-session reload/smoke-check guidance.
- Added explicit docs update requirements for settings/parser behavior.
- Added archive/evidence guard against `pi/history/`, `pi/sessions/`, `pi/multi-team/sessions/`, logs/caches, expertise logs, and `node_modules/`.

## Simpler Alternatives / Scope Reductions

The plan now defaults to in-repo Claude policy discovery in this dotfiles repo instead of requiring user configuration. This keeps parity active by default while retaining an override for tests/nonstandard layouts.

## Automation Readiness

Ready after auto-apply. The updated plan has exact commands, risk/manual-gate decision, evidence/archive gates, documented Pi config/doc expectations, and a consistent checklist. No manual gate is needed. Final standalone-readiness reviewer reported `finding_count: 0` in `.specs/pi-damage-control-parity/review-3/standalone-readiness.md`.

## Contested or Dismissed Findings

- Product-manager suggestion to defer Phase B was not applied because the active plan states Phase B is required. Instead, Phase B was made explicit and testable.
- Evidence manifest rigor was retained because this is a safety-policy migration and prior reviews already hardened archive criteria.

## Verification Notes

- `pi/README.md` documents damage-control currently loads from `pi/damage-control-rules.yaml` through `yaml-mini`; plan now requires doc updates for the exception.
- `pi/extensions/README.md` documents top-level `pi/extensions/*.ts` auto-discovery and helper placement; plan now forbids new helper modules as top-level extensions.
- `pi/lib/yaml-helpers.ts` uses ambient `python`/`python3` and returns `undefined`; plan now requires improving/wrapping this or choosing an in-process YAML dependency.
- `pi/lib/settings-loader.ts` says dotted paths are not expanded; plan now forbids dotted `getSetting("dangerCtrl.claudePolicyPath")`.
- Section integrity check passed: required headings occur once and no checklist items were marked complete.

## Timing Notes

| Step | Duration | Notes |
|------|----------|-------|
| Initial review panel | unknown | 6/6 reviewers succeeded; per-reviewer timing unavailable |
| Recovery calls | not run | all artifacts existed and were usable |
| Verification | unknown | read/grep used on Pi docs, yaml helper, settings loader, damage-control engine |
| Synthesis | unknown | `.specs/pi-damage-control-parity/review-3/synthesis.md` |
| Auto-apply | unknown | plan updated; applied fixes logged in `applied-fixes.md` |
| Standalone readiness | unknown | final finding_count 0 |

## Overall Verdict

**Ready to execute**
