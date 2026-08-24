---
created: 2026-08-24
status: completed
completed: 2026-08-24
---

# Harden Recurrent Pi Tool Failures

## Objective

Eliminate the confirmed local tool-contract regressions found in Pi sessions from August 14-24, 2026, while preserving damage-control, governed workspace, instruction-discovery, cache-stability, and explicit-working-directory boundaries.

## Completion Evidence

- Evidence: Focused registered-tool and reload tests prove that Bash preserves submitted arguments, selected subagent skills are readable without widening repository authority, compatible subagent managers are reused while incompatible quiescent managers are replaced and reload fails explicitly rather than orphaning incompatible live state, oversized or omitted plan-review strategy telemetry is normalized before persistence, and unavailable agent selections fail before spawn against the effective catalog with a directly usable correction.
- Fails when: Bash drops `command` or `timeout`; a governed child cannot read an explicitly selected skill or can read unrelated global files; extension reload reuses an incompatible manager or silently abandons its live state; valid review telemetry is rejected before normalization; unavailable agents reach spawn or produce no effective-scope correction; or the implementation adds automatic command-directory redirection, broad global read access, unrestricted retries, legacy compatibility surfaces, or weaker safety enforcement.

## Boundaries

- In scope: `pi/extensions/bash-cwd.ts`, the subagent skill-authority and agent-catalog paths under `pi/extensions/subagent/`, the subagent run-manager reload boundary, `plan_progress` parameter normalization in `pi/extensions/workflow-commands.ts`, focused tests, and affected stable Pi tooling contracts.
- Out of scope: External web-search reliability, expected nonzero command/test results, Kubernetes timeouts, exact-match edit misses after source changes, automatic package-manager directory selection, automatic replay of instruction-deferred mutations, legacy subagent interfaces, and changes to other clients.
- Preserve: Exact governed filesystem boundaries, read-only versus modifying child authority, damage-control blocks, cache-friendly tool exposure, explicit repository `cwd`, current workflow lifecycle semantics, and unrelated repository or specification changes.
- Assumptions: The August 14-24 session analysis correctly isolates deterministic local defects from expected tool failures; implementation must verify each claimed mechanism through the registered tool or reload boundary rather than source inspection alone.

## Tasks

- [x] **T1: Repair Bash argument transport at the registered tool boundary**
  - Files: `pi/extensions/bash-cwd.ts`, `pi/tests/bash-cwd.test.ts`, and the Bash tooling contract only if its stable semantics change.
  - Change: Preserve the original Bash arguments when the upstream definition has no `prepareArguments`, apply an upstream preparer when present, and add `cwd` without dropping `command` or `timeout`. Keep execution in the explicitly selected directory and do not infer or redirect package commands.
  - Done when: Registered-tool tests prove argument preservation with and without `cwd`, exercise execution rather than rendering alone, and reproduce the August 23 missing-`command` regression before the fix.
  - Verify: From `pi/`, run `pnpm test bash-cwd.test.ts` and `pnpm run typecheck`; stop expansion if the upstream definition cannot be wrapped without changing its execution contract.

- [x] **T2: Compose selected skills, reload safety, and effective agent availability into subagent contracts**
  - Files: `pi/extensions/subagent/agents.ts`, `pi/extensions/subagent/index.ts`, `pi/extensions/subagent/workspace-policy.ts`, `pi/extensions/subagent/run-manager.ts`, focused subagent tests, and `pi/skills/pi-extension/references/contracts/subagents-and-tasks.md`.
  - Change: Add an immutable allowlist of exact canonical resolved selected-skill files to read-class native tool policy only; never admit their parent directories, shell access, or mutation. Use one explicit run-manager ABI marker as the compatibility discriminator, with only the shape check needed to read it safely: reuse compatible state, replace an incompatible quiescent manager, and fail reload explicitly when incompatible state still has observable live runs or completions. Keep the cache-stable callable agent enum if scope-discriminated schemas would churn the tool prefix, but validate against the effective user/project catalog before spawn and return the rejected selection, effective scope, and usable alternatives without legacy aliases.
  - Done when: A governed child can load one selected global skill but cannot read or traverse to a neighboring unselected file; repository read and write authority remain unchanged; reload tests prove compatible reuse, quiescent incompatible replacement, and explicit failure for incompatible live state; and unavailable-agent tests return usable alternatives under the active `agentScope` before spawn.
  - Verify: From `pi/`, run the narrow workspace-policy, subagent, and reload-focused test files, then `pnpm run typecheck`; reject any solution that grants all of `~/.pi`, copies authority between roots, or exposes prompts or skill content in telemetry.

- [x] **T3: Normalize plan-review telemetry before schema rejection and run the representative workflow checks**
  - Depends on: T1, T2
  - Files: `pi/extensions/workflow-commands.ts`, `pi/lib/workflow-commands/plan-lifecycle.ts` only if normalization ownership requires it, `pi/tests/plan-lifecycle.test.ts`, `pi/tests/workflow-dispatch.test.ts`, and the workflow lifecycle contract only if public semantics change.
  - Change: Align the callable `plan_progress` schema with its existing optional strategy semantics so omitted and oversized strategy text reaches deterministic trimming, defaulting, and bounded persistence. Add registered-tool coverage, then run one representative check for each repaired failure class without adding retries, duplicate telemetry, or a generic error-recovery framework.
  - Done when: Tests compile or validate arguments through the registered TypeBox schema before invoking execution, prove omitted and oversized `plan_progress review` strategy input is accepted, persist a nonempty value no longer than 120 characters, and retain all lifecycle gates; focused checks for T1-T3 pass together and the final diff contains no unrelated diagnostic framework or prompt-only substitute for a deterministic repair.
  - Verify: From `pi/`, run `pnpm test plan-lifecycle.test.ts workflow-dispatch.test.ts` plus the focused T1 and T2 tests, followed by `pnpm run typecheck` because shared TypeScript tool contracts change. The strategy regression test must exercise schema validation, not only call the mock tool definition's `execute` method.

## Validation

- [x] The Bash registered-tool regression test proves `command`, `timeout`, and optional `cwd` survive preparation and execute in the selected directory.
- [x] The governed-child test proves exact selected-skill readability and denial of an unselected neighboring global file without widening repository mutation authority.
- [x] The reload and catalog tests prove compatible manager reuse, quiescent incompatible replacement, explicit reload failure for incompatible live state, and pre-spawn agent availability diagnostics under the active scope.
- [x] The registered `plan_progress` tests validate through the callable TypeBox schema and prove omitted and oversized strategy normalization while preserving review ordering and readiness validation.
- [x] Focused tests and `pnpm run typecheck` pass, and inspection confirms no automatic cwd redirection, network retry system, legacy subagent compatibility path, broad global read permission, or weakened safety control.

## Retention

Keep incomplete work at `.specs/tool-failure-hardening/plan.md`. After completion, `/do-it` archives this directory to `.specs/archive/tool-failure-hardening/`.

## Execution Status

- State: Complete
- Blocker: None.
- Result: All 57 focused tests and `pnpm run typecheck` passed; the closed completion contract is satisfied.
- Resume: `/do-it .specs/tool-failure-hardening/plan.md`
