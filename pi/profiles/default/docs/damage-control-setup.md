# Default Damage Control

Damage Control loads with the default profile. Legacy ask/block authority and path behavior are the baseline.

## Operator controls

- `/dc off` enables the session-local legacy bypass for eligible local ask-tier rm, Git, Docker, and contained environment-file operations.
- `/dc on` restores normal prompts.
- `/dc mode noshell` blocks shell tools while leaving file tools available.
- `/dc mode default` restores shell handling.
- New sessions clear bypass state.
- There is no `/dc status` command.
- `pp --dc-recovery` remains available as an explicit maintenance path.

Confirmed blocks, remote/cloud/live operations, Docker volumes, exfiltration, dynamic targets, and protected paths are not bypassed.

## Behavior

Legacy ask rules require an `Allow once` / `Deny` operator choice. Luna may dismiss a non-executing false-positive candidate but cannot authorize an actual ask-tier operation. Parser uncertainty alone does not add a restriction.

Read-only searches use their explicit targets and do not pre-enumerate descendants. Filesystem exclusions, generated-file restrictions, scoped cleanup, and Docker command rules follow legacy behavior. Deep interpreter parsing is reserved for concealed file/process mutations and loads its grammar on demand.

Damage Control keeps bounded in-memory operational evidence for deterministic sensitive-read/upload sequence checks and repeated-call protection. It does not expose status, statistics, labels, shadow evaluation, or a persistent telemetry ledger.

## Approval prompts

The default TUI shows the reason, matched command, affected target, working directory, and whole-call approval scope instead of the full script. Duplicate reasons are combined without dropping distinct targets. Additional identified changes are summarized; unresolved effects are not described as safe.

- Amber highlights reasons and command flags; bold amber marks approval scope and additional consequences. Accent marks selection, not a recommendation that the action is safe. Labels work without color.
- `Allow once` is initially selected. Arrow keys select; Enter confirms. Escape denies from either view.
- `D` opens Details at the triggering source line. Details contains the full numbered operation, checks and rule IDs, targets, and analysis notes. Arrows, Page Up/Down, and Home/End navigate. `D` or Enter returns without approving or changing the selection.
- Compact views mark omitted content explicitly and retain the choices when the terminal is narrow. Details remains fully navigable.
- Review failures are labeled as review problems, not confirmed policy violations. Denials give the agent the reason and triggering action, with instructions not to repeat or disguise the declined operation.
- RPC uses plain choice dialogs and paged Details with a Back option. Noninteractive runs report `needs_approval`; cancellation and UI failures never approve. Approval remains tied to the unchanged pending call.

No new permissions, approval reuse, policy settings, or legacy-profile changes are introduced. Use `/reload` to activate changes in an existing default session.

## Checks

From `pi/profiles/default/`:

```sh
pnpm test tests/damage-control
pnpm run typecheck
```
