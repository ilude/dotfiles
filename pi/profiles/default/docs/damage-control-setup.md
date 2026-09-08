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

User-only rules require an `Allow once` / `Deny` operator choice. Selected operations instead receive contextual Luna review: plain Compose teardown; local-development Kubernetes/Helm operations; disposable local database resets; and targeted termination of task-owned development processes. Local cwd, host OS, loopback addresses, or names such as `dev` alone do not establish safety. Shared/production impact, meaningful data loss, unresolved targets, and review failure still require approval. Separate Compose volume/image-removal rules and all other remaining user/block rules retain their authority. Luna may also dismiss non-executing false-positive candidates. Parser uncertainty alone does not add a restriction. See the [behavior contract](damage-control-port.md) for the exact selected rules.

Known read-only `crontab -l` and `schtasks /query` forms pass directly. Their substitutions, redirections, and accompanying commands are still checked. Leading Kubernetes/Helm context and namespace options no longer hide the operation from rule matching.

Read-only searches use their explicit targets and do not pre-enumerate descendants. Filesystem exclusions, generated-file restrictions, scoped cleanup, and other Docker command rules follow legacy behavior. Deep interpreter parsing is reserved for concealed file/process mutations and loads its grammar on demand.

Luna receives bounded session-local context: up to 16 direct interactive/RPC inputs and eight successful covered tool observations, each collection limited to 16 KiB and 30 minutes. Observations retain the originating operation and cwd with the output; they remain untrusted, not authorization. Queued input is used only after delivery. Context is redacted before transmission and cleared on session changes, tree navigation, reload, shutdown, or cancellation. No history is imported after reload, so missing environment facts may require a prompt. There are no mandatory environment scans, resource ledgers, or reusable approvals.

Existing deterministic sensitive-read/upload sequence checks and repeated-call protection remain. The runtime does not expose status, statistics, labels, background shadow evaluation, or a persistent telemetry ledger.

## Approval prompts

The default TUI shows the reason, matched command, affected target, working directory, and whole-call approval scope instead of the full script. Duplicate reasons are combined without dropping distinct targets. Additional identified changes are summarized; unresolved effects are not described as safe.

- Amber highlights reasons and command flags; bold amber marks approval scope and additional consequences. Accent marks selection, not a recommendation that the action is safe. Labels work without color.
- `Allow once` is initially selected. Arrow keys select; Enter confirms. Escape denies from either view.
- `D` opens Details at the triggering source line. Details contains the full numbered operation, checks and rule IDs, targets, and analysis notes. Arrows, Page Up/Down, and Home/End navigate. `D` or Enter returns without approving or changing the selection.
- Compact views mark omitted content explicitly and retain the choices when the terminal is narrow. Details remains fully navigable.
- Review failures are labeled as review problems, not confirmed policy violations. Denials give the agent the reason and triggering action, with instructions not to repeat or disguise the declined operation.
- RPC uses plain choice dialogs and paged Details with a Back option. Noninteractive runs report `needs_approval`; cancellation and UI failures never approve. Approval remains tied to the unchanged pending call.

Contextual authority is limited to the selected review-tier rules. No approval reuse, new policy settings, or legacy-profile changes are introduced. Use `/reload` to activate changes in an existing default session.

## Checks

From `pi/profiles/default/`:

```sh
pnpm test tests/damage-control
pnpm run typecheck
pnpm run check:runtime
```

Opt-in live synthetic Luna checks use production rules and parser but never execute the submitted operations:

```sh
pnpm run eval:damage-control --environment
```

This makes provider calls using the configured Luna account. It checks sampled judgment, not a guarantee for every environment.
