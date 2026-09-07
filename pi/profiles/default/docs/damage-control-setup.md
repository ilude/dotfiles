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

Legacy ask rules require a `Deny` / `Allow once` operator choice. Luna may dismiss a non-executing false-positive candidate but cannot authorize an actual ask-tier operation. Parser uncertainty alone does not add a restriction.

Read-only searches use their explicit targets and do not pre-enumerate descendants. Filesystem exclusions, generated-file restrictions, scoped cleanup, and Docker command rules follow legacy behavior. Deep interpreter parsing is reserved for concealed file/process mutations and loads its grammar on demand.

Damage Control keeps bounded in-memory operational evidence for deterministic sensitive-read/upload sequence checks and repeated-call protection. It does not expose status, statistics, labels, shadow evaluation, or a persistent telemetry ledger.

## Checks

From `pi/profiles/default/`:

```sh
pnpm test tests/damage-control
pnpm run typecheck
```
