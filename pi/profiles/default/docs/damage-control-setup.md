# Default Damage Control

Damage Control loads with the default profile. Its [design purpose](damage-control-port.md#design-purpose) is to prevent meaningful unrecoverable harm while leaving routine recoverable work quiet. Policy now uses deterministic allowances for established routine cases and contextual Luna review where recoverability or consequences need judgment. The [risk review](../../../../.specs/damage-control-risk-alignment-and-preapproval/damage-control-risk-review.md) records the reasons for the alignment.

## Operator controls

- `/dc off` enables the session-local legacy bypass for eligible local ask-tier rm, Git, Docker, and contained environment-file operations.
- `/dc on` restores normal prompts.
- `/dc mode noshell` blocks shell tools while leaving file tools available.
- `/dc mode default` restores shell handling.
- New sessions clear bypass state.
- `/dc scan` reviews current project-owned scripts without executing them and reuses unchanged completed results.
- There is no `/dc status` command.
- `pp --dc-recovery` remains available as an explicit maintenance path.

Confirmed blocks, remote/cloud/live operations, Docker volumes, exfiltration, dynamic targets, and protected paths are not bypassed.

## Behavior

Consequential user-only rules require an `Allow once` / `Deny` operator choice. An identifiable local script also offers `Allow once and review for future use`; the pending call proceeds immediately while a read-only child reviews that exact source and invocation. Contextual Luna review covers mixed-risk deletion, Git, containers, infrastructure, publication, scheduling, database, and process operations. Shared/production impact, meaningful data loss, unresolved consequential targets, and review failure still require approval. Luna may dismiss non-executing false positives, but parser uncertainty alone does not add a restriction.

Known read-only `crontab -l` and `schtasks /query` forms pass directly. Their substitutions, redirections, and accompanying commands are still checked. Leading Kubernetes/Helm context and namespace options no longer hide the operation from rule matching.

Read-only searches use their explicit targets and do not pre-enumerate descendants. Ordinary lockfiles, generated artifacts, public certificates, rebuildable caches, and empty-directory removal are not protected merely by name or syntax. Root/home destruction, meaningful unique work, recovery loss, sensitive disclosure, and consequential remote mutations retain intervention. Deep interpreter parsing is reserved for supported nested scripts and concealed effects.

Luna receives bounded session-local context: up to 16 direct interactive/RPC inputs and eight successful covered tool observations, each collection limited to 16 KiB and 30 minutes. Observations retain the originating operation and cwd with the output; they remain untrusted, not authorization. Queued input is used only after delivery. Context is redacted before transmission and cleared on session changes, tree navigation, reload, shutdown, or cancellation. No history is imported after reload, so missing environment facts may require a prompt. There are no mandatory environment scans or resource ledgers.

Approved script records live in the repository common Git directory at `pi/damage-control-trust.yaml`, shared by its worktrees. Outside Git they live only at `<cwd>/.pi/damage-control-trust.yaml`. Records bind repository-relative source, SHA-256 bytes, review result, and optional exact argv/helper hashes. Matching approval skips that script body's parsing and model review; surrounding operations remain checked. Missing, changed, unreadable, or malformed records fall back to normal runtime analysis.

Sensitive-read/upload correlation is review evidence unless the submitted source itself establishes disclosure. The failed-call watchdog allows twelve adjacent failures of an exact tool/input/cwd call and stops attempt thirteen. Any unrelated call, success, or direct operator resumption resets the streak; repeated successes are unrestricted.

## Approval prompts

The default TUI shows the reason, matched command, affected target, working directory, and whole-call approval scope instead of the full script. Duplicate reasons are combined without dropping distinct targets. Additional identified changes are summarized; unresolved effects are not described as safe.

- Amber highlights reasons and command flags; bold amber marks approval scope and additional consequences. Accent marks selection, not a recommendation that the action is safe. Labels work without color.
- `Allow once` is initially selected. Eligible local scripts also show `Allow once and review for future use`. Arrow keys select; Enter confirms. Escape denies from either view.
- `D` opens Details at the triggering source line. Details contains the full numbered operation, checks and rule IDs, targets, and analysis notes. Arrows, Page Up/Down, and Home/End navigate. `D` or Enter returns without approving or changing the selection.
- Compact views mark omitted content explicitly and retain the choices when the terminal is narrow. Details remains fully navigable.
- Review failures are labeled as review problems, not confirmed policy violations. Denials give the agent the reason and triggering action, with instructions not to repeat or disguise the declined operation.
- RPC uses plain choice dialogs and paged Details with a Back option. Noninteractive runs report `needs_approval`; cancellation and UI failures never approve. Approval remains tied to the unchanged pending call.

Approval reuse is source-hash and invocation bound; it is not a general permission cache. Legacy-profile behavior is unchanged. Use `/reload` to activate changes in an existing default session.

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
