---
created: 2026-08-27
status: completed
completed: 2026-08-27
---

# Add session-local damage-control bypass

## Objective

Provide `/dc off` and `/dc on` controls that bypass ordinary ask-tier damage-control prompts only for the current Pi instance session while preserving confirmed hard protections and resetting to normal enforcement on `/clear` or process exit.

## Completion Evidence

- Evidence: Focused damage-control and operator-footer tests show `/dc off` allows ordinary local `rm`, Docker, Git, and canonically contained repository-local `.env` operations without prompting; `/dc on` restores prompts; a `session_start` caused by `/clear` restores normal enforcement; every confirmed hard protection remains enforced; and the footer is absent when on but shows only red `damage-control: bypassed` when off.
- Fails when: Bypass persists after `/clear`, any confirmed hard protection becomes bypassable, an ordinary covered local operation still prompts while off, an external/traversing/symlink-escaped `.env` path is allowed, normal mode renders a damage-control footer label, or bypassed mode renders different text or a non-red presentation.

## Boundaries

- In scope: Pi-owned damage-control runtime state, `/damage-control` and `/dc` command handling, explicit bypass eligibility at the minimum existing approval seams, canonically contained repository-local `.env` access, `/clear` reset behavior, footer status rendering, tests, and the owning damage-control contract.
- Out of scope: Other clients, persisted settings, additional bypass modes or classes, changes to hard-block rules, and unrelated status/footer behavior.
- Preserve: Existing `default` and `noshell` behavior except for the new explicit on/off control; catastrophic deletion, protected paths, credentials outside the repository, secret exfiltration, remote/cloud and live infrastructure mutation, force push and remote Git deletion, Docker volume deletion, ambiguous targets, policy-load failure, circuit breakers, and unmanaged background-process protections must still ask or block as currently appropriate.
- Assumptions: `/clear` calls `ctx.newSession()` and emits `session_start` with a clear/new-session reason while retaining the extension closure; implementation must reset bypass in that lifecycle handler. Process exit discards the non-persisted state.

## Tasks

- [x] **T1: Implement the bounded bypass state and enforcement seam**
  - Files: `pi/extensions/damage-control.ts`, `pi/extensions/damage-control-engine.ts`, `pi/extensions/operator-status.ts`, `pi/skills/pi-extension/references/contracts/damage-control.md`
  - Change: Add non-persisted bypass state controlled by `/dc off` and `/dc on`, reset it in the existing `session_start` lifecycle path for `/clear`, and classify eligibility at the minimum centralized confirmation seams, adding special handling only for ask paths that do not reach them; do not treat all ask-tier decisions or presentation categories as safe. Allow `.env` file access only after canonical containment proves the target remains inside `ctx.cwd`; reject containment failures, symlink escape, ambiguous shell targets, and exfiltration combinations. Keep every confirmed hard protection outside the bypass path. Clear the damage-control status key when on; when off, expose exactly `damage-control: bypassed` and have the existing operator footer render that status in the error color.
  - Done when: Command transitions, eligible local-operation bypass, hard-protection exclusions, contained `.env` handling, `/clear` reset, and footer behavior match the objective and the owning contract documents the accepted operator-facing behavior without persistence or a new policy subsystem.
  - Verify: `cd pi && pnpm run typecheck`

- [x] **T2: Prove bypass, reset, footer, and retained protections**
  - Files: `pi/tests/damage-control.test.ts`, `pi/tests/operator-status.test.ts`
  - Change: Add focused behavioral coverage for `/dc off`, `/dc on`, `session_start` with the `/clear` reason, ordinary local deletion/Docker/Git bypass, and contained repository-local `.env` access versus a table of canonical-containment failures, symlink escape, and exfiltration. Add bypass-enabled checks at each distinct eligibility/enforcement seam, with representative cases for the confirmed hard-protection groups; rely on existing baseline tests instead of duplicating every rule test. Exercise the operator footer renderer to prove normal mode is absent and bypass mode emits exactly red `damage-control: bypassed`.
  - Done when: Tests directly demonstrate every completion-evidence and preserved-safety clause without asserting policy prose or unrelated implementation layout.
  - Verify: `cd pi && pnpm test damage-control.test.ts operator-status.test.ts`
  - Depends on: T1

## Validation

- [x] `cd pi && pnpm test damage-control.test.ts operator-status.test.ts` passes with direct coverage of bypass eligibility, contained `.env` access, retained hard protections, command transitions, `/clear` reset, and footer presentation.
- [x] `cd pi && pnpm run typecheck` passes after the final implementation.

## Retention

Keep incomplete work at `.specs/damage-control-bypass/plan.md`. After completion, `/do-it` archives this directory to `.specs/archive/damage-control-bypass/`.

## Execution Status

- State: Complete; implementation and validation passed on 2026-08-27.
- Blocker: None.
- Next: Archive, commit, merge, and verify closeout.
- Resume: `/do-it .specs/damage-control-bypass/plan.md`
