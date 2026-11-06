# T3 Code alongside Herdr

T3 Code is an additional desktop/web interface for the existing default Pi
profile. It does not replace Herdr, modify its configuration, move running
sessions, or configure the historical legacy Pi profile.

## Installation and configuration

Normal installation adds:

- **Windows:** the `T3Tools.T3Code` desktop package through the core WinGet
  configuration, plus the official T3 CLI installer.
- **macOS:** the `t3-code` Homebrew cask, plus the official T3 CLI installer.
- **Linux:** the official T3 CLI installer, providing the local web interface.
  Desktop Linux packages remain an upstream/manual choice.

The upstream CLI installers use stable releases by default and honor their
`T3CODE_VERSION`, `T3CODE_CHANNEL`, `T3CODE_HOME`, and install-directory overrides.
The standalone CLI has no Intel Mac binary in the researched release. Use the
upstream desktop app on Intel Macs instead.

After default Pi setup, both repository installers run:

```sh
node scripts/t3-code-setup.mjs
```

PowerShell `-SkipPackages` skips T3 downloads and updates but still applies its
Pi configuration, just like the other configuration stages. No Dotbot link is
created for T3's mutable settings or databases.

The helper merges `~/.t3/userdata/settings.json` (or the home selected by
`T3CODE_HOME`). It:

- Enables the standard `pi` provider instance and resolves its native executable
  from the installation shell's PATH. On Windows, it uses `.exe` or `.cmd`, not
  the shell's `pi` function or a PowerShell `.ps1` shim.
- Sets that instance's `PI_CODING_AGENT_DIR` to this checkout's
  `pi/profiles/default`, sharing its existing authentication, settings, models,
  extensions, skills, tools, and native session storage. It copies no credentials.
- Sets `HERDR_ENV=0` only in the T3 Pi instance, so a T3 process launched from a
  Herdr shell does not manage the originating shell's panes.
- Selects **Pi default** for new threads only when no T3 default model selection
  has been stored. Pi then selects the model and thinking level from its own
  profile rather than a second hardcoded model configuration.
- Preserves other providers, existing model/permission choices, Pi launch
  arguments, unrelated environment entries, secret references, and other T3
  settings. Invalid or conflicting settings are reported without overwriting them.

Rerun the helper after moving the checkout or changing Pi's executable location.
Pi upgrades at the same package-manager shim path require no rewrite. For an
explicit installation:

```sh
node scripts/t3-code-setup.mjs --base-dir /path/to/t3-home --pi-binary /path/to/pi
```

`--base-dir` is the T3 home, not its `userdata` subdirectory. Point `--pi-binary`
at an executable T3 can spawn on that OS.

## First use

1. Open **T3 Code** on Windows/macOS, or run `t3` for the local web interface.
   `t3 serve` runs without opening a browser. The CLI normally lives in
   `~/.local/bin`; open a fresh shell if it is not found after installation.
2. In **Settings > Providers**, refresh Pi. If the app was already running,
   start a new thread after refresh so an existing Pi process is not reused.
3. Open the project directory and choose **Pi default**, or a specific model
   discovered from Pi. Existing threads and explicit T3 defaults are not reset.
4. If authentication is needed, run normal `pi` in that project and use `/login`.
   If project resources are untrusted, use Pi's `/trust` interactively for that
   directory or parent, then start a new T3 thread. Setup does not grant trust.

T3's permission mode is separate from Pi Damage Control. **Full access** removes
T3's additional per-tool approvals, not Pi's extension-level checks. Supervised
and auto-accept-edits add T3 approvals. Setup does not change the permission mode.
Installation and model discovery alone do not prove authenticated model access.

## What matches, and what does not

| Existing behavior | T3 behavior |
| --- | --- |
| Default Pi profile, model catalog, login and tools | Same native profile, launched through Pi RPC |
| Skills and extension commands | Discoverable through T3's command/skill menus; command behavior still depends on RPC compatibility |
| Damage Control | The normal profile extension loads; its select/confirm/input dialogs have RPC equivalents |
| Custom Pi subagent runtime | Uses its existing non-Herdr headless path; no Herdr panes are opened |
| Native session history | Kept by Pi; T3 manages its own threads and resume/fork lifecycle |
| Herdr visible subagent layout, pane/service control and independent-session messaging | Not ported or redirected to T3 |
| Herdr new-instance, prepared-plan launch and same-tab closeout successor | Remain Herdr-specific; use T3's own thread/worktree interface for T3 work |
| Pi terminal footer, widgets and custom TUI pickers | No equivalent rendering in RPC; TUI-only commands may be unavailable |
| Shell launcher preflight and cooperative `/update` host | Not used: T3 invokes native Pi and owns its process lifecycle |

T3's own `delegate_task` tool creates native child threads. That is separate from
this repository's custom `subagent` runtime; setup does not replace its roles,
authority, result delivery, or ownership with T3 delegation. No claim is made that
custom child progress appears in T3's shared subagent UI.

## Remote use

Setup does not enable network listening, pairing, T3 Connect, a background service,
or firewall rules. Configure remote access deliberately in T3 when needed.

Upstream offers T3 Connect and direct LAN/private-network pairing. Its desktop
managed-SSH environment launcher currently supports Linux and Apple Silicon Mac
hosts, not Windows hosts. On Windows, keep the desktop app/local environment
running, or run a CLI server; the upstream background service is not available
there. Closing the desktop app's last window stops its local server.

This is not a migration of Herdr's saved machines. Existing remote workstation
policy remains in the [remote access runbook](../modules/homelab-infra/docs/remote-workstation-access.md).

## Sources and verification

Configuration keys and behavior were checked against T3 Code **v0.1.7**, including
`packages/contracts/src/providerInstance.ts`,
`packages/provider-pi/src/settings.ts`, and the Pi RPC launcher implementation.

- [Installation](https://github.com/pingdotgg/t3code/blob/v0.1.7/docs/user/install.md)
- [Pi provider](https://github.com/pingdotgg/t3code/blob/v0.1.7/docs/user/providers-pi.md)
- [Remote access](https://github.com/pingdotgg/t3code/blob/v0.1.7/docs/user/remote-access.md)

Focused setup tests run with `uv run pytest test/test_t3_code_setup.py`.
They cover settings preservation, repeatable configuration, and refusal to replace
malformed settings, not interactive T3 operation or provider authentication.

On 2026-11-06, the Windows workstation's existing T3 Code 0.1.7 desktop server
loaded this configuration and completed a tool-free Pi request with the expected
`T3_PI_OK` reply, using its existing credentials. This verifies authenticated
Pi access through T3. Interactive approvals, custom subagent presentation,
remote access, and macOS/Linux installation were not live-tested.
