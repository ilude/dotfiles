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
portable preferences and Pi configuration, just like the other configuration
stages. No Dotbot link is created for T3's mutable settings or databases.

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
- Reads the five Bitwarden/Onclave variables listed below from Dolos-managed
  `private/secrets.env` into the local Pi provider, marking their values sensitive.
  Only the wiring is tracked in the public repository.
- Applies the tracked portable preferences described below, including the
  work-machine default model and thinking option for new threads. If the tracked
  snapshot has no default model, it preserves an existing selection or falls back
  to **Pi default** so Pi chooses from its own profile.
- Preserves provider definitions, permission choices, Pi launch arguments,
  unrelated environment entries, secret references, and untracked T3 settings.
  Invalid or conflicting local settings are reported without overwriting them.

Rerun the helper after moving the checkout or changing Pi's executable location.
Pi upgrades at the same package-manager shim path require no rewrite. For an
explicit installation:

```sh
node scripts/t3-code-setup.mjs --base-dir /path/to/t3-home --pi-binary /path/to/pi
```

`--base-dir` is the T3 home, not its `userdata` subdirectory. Point `--pi-binary`
at an executable T3 can spawn on that OS. `--secrets-file /path/to/local.env`
overrides the default private source when needed.

### Pi private environment through Dolos

The setup helper reads only these entries from this checkout's
`private/secrets.env`:

- `BITWARDEN_ACCESS_KEY`
- `BITWARDEN_API_SERVER`
- `BITWARDEN_IDENTITY_SERVER`
- `BITWARDEN_ORG_ID`
- `ONCLAVE_BWS_PROJECT_ID`

Dolos owns their encrypted transport in `.dolos/artifacts/private.tar.gz.age`;
`private/secrets.env` stays Git-ignored. Normal installation restores that private
configuration before T3 setup. For an existing checkout, use the existing Dolos
private restore workflow if needed, then rerun `node scripts/t3-code-setup.mjs`.
There is no separate T3 credential export or new encrypted archive.

Nonempty source values replace same-named local Pi environment entries and are
marked `sensitive: true`. The helper parses dotenv assignments without executing
shell code, does not import other private variables, and never logs their values.
If the file or individual values are missing, setup warns and preserves existing
entries instead of installing empty placeholders. Local T3 settings receive the
values; the installed T3 server moves inline sensitive values into its native
local secret storage when loading settings. Do not commit or copy that runtime
storage. Refresh/restart T3 when idle and use a new Pi runtime to load these
variables; existing Pi processes keep their inherited environment.

## Portable preferences

[`config/t3-code/`](../config/t3-code/) contains a selected snapshot from
`dev-wks-mglenn`, captured from T3 `0.1.8-nightly.20261108.4380`:

- `settings.json`: model favorites and hidden-model/order preferences, the explicit
  Pi model/thinking default, automatic-pull preference, idle compaction, project
  settings folding, thread-title instructions, agent-credit removal and PR merge
  method.
- `client-settings.json`: interface/chat/sidebar/diff presentation, fonts and
  sizes, notifications, confirmation behavior, composer/tool visibility, general
  browser preview/search/recording defaults, and speech/snapshot preferences.
- `keybindings.json`: the work machine's saved bindings, using T3's portable `mod`
  modifier rather than hardcoded OS-specific modifier keys.

Run the same helper from the repository root after pulling on another machine:

```sh
node scripts/t3-code-setup.mjs
```

Normal installation runs it too. Tracked top-level preference keys replace the
local values for those keys, including model favorites, hidden models and the
new-thread default. Other local keys remain unchanged. Keybindings merge by
`key` plus `when` context: tracked bindings replace matching slots; unrelated
local bindings survive. Repeated application does not rewrite unchanged files.
Existing threads and their running provider processes are not reconfigured.

The snapshot deliberately excludes credentials/tokens and secret references,
provider definitions/enabled states/launch configuration (including custom
`ccyl` binary paths), workspace/project overrides, environment identity and
linked-environment controls, browser profiles/connections and profile IDs,
onboarding state, microphone device IDs, window bounds, update/network settings,
and all databases, sessions, caches and account state. These remain local; the
helper still resolves the default Pi binary/profile on each target machine and
wires the selected Pi private variables from Dolos as described above.
The client file's obsolete model-preference migration fields are omitted; the
environment settings contain the active model preferences.

The work machine has no custom theme files. Theme selection is browser-local
storage, not one of these JSON settings, and is not captured or changed. General
appearance preferences such as contrast, fonts, opacity and animation are captured.
Do not copy Electron/browser storage or link the entire T3 userdata directory.

To change the shared baseline later, edit the selected files under
`config/t3-code/` and review their diff. Setup applies them in one direction; it
does not export live state or copy later local edits back into Git. Keep new
fields portable rather than copying a complete runtime settings file.

After applying, restart T3 when the app and its threads are idle to load desktop
client preferences. Refresh Pi in **Settings > Providers**, then start a new
thread for the configured launch/model defaults. Setup itself does not restart
T3 or Pi, reload a conversation, authenticate providers, or verify loaded UI
behavior. General browser preferences do not enable remote access.

## Local source checkout and build

[`modules/t3code`](../modules/t3code) is a Git submodule of
[`ilude/t3code`](https://github.com/ilude/t3code), forked from
[`pingdotgg/t3code`](https://github.com/pingdotgg/t3code), tracking the fork's
`main` branch. Upstream scheduled nightlies build the default branch (`main`),
not a separate nightly branch. The local checkout also has an `upstream` remote
for the original repository; that remote is local Git configuration, not part of
the submodule declaration.

Follow the module's `AGENTS.md` and
[development guide](../modules/t3code/docs/operations/development.md).
With Vite+ installed, the release workflow's JS bundle build is:

```sh
cd modules/t3code
vp install --frozen-lockfile --filter=t3... --filter=@t3tools/web... --filter=@t3tools/desktop... --filter=@t3tools/scripts...
vp run build:desktop:bundle
```

On 2026-11-07, commit `e455200077ce60806a01c8f28435b58860dcfc74` passed
all four bundle tasks in a local Linux x64 Docker container using
`node:26.12.1-bookworm`, Vite+ `1.4.0`, and the pinned pnpm `12.14.0`.
The build emitted large-chunk, optional `x11`, and CommonJS `import.meta`
warnings. This verifies the web, server, and Electron JavaScript bundles, not a
packaged installer, native desktop helpers, GUI startup, or the full test suite.
The bundle-only build retains development branding/versioning rather than
impersonating a published nightly.

The stopped build container is `t3code-main-build-20261107`; its `/workspace`
contains a source snapshot and installed dependencies, not a live bind mount.
Ignored local outputs are under `.tmp/t3code-build/artifacts/{server,desktop}`,
with the build log at `.tmp/t3code-build/build.log` and the build runner at
`.tmp/t3code-build/run-build.sh`. These are workstation-local artifacts, not
files delivered by cloning this repository.

The module and build do not replace the installed T3 app, change installer
channels, or access its live data. Use an isolated T3 home for any later runtime
checks, never the live `~/.t3/userdata` directory.

### Windows x64 installer from Linux Docker

[`scripts/t3-code-windows-build`](../scripts/t3-code-windows-build) follows
upstream's Linux cross-build path: Rust `1.99.1`, `cargo-xwin` `0.23.1`, and
Electron Builder produce an unsigned NSIS installer and standalone Windows CLI.
It also builds the matching Linux CLI archive bundled for WSL. No Windows
container, Wine, host Visual Studio changes, signing credentials, or live T3
configuration are needed. The image pins the Node/Vite+ versions above; update
those pins when building a source revision that requires different versions.

From the dotfiles root in PowerShell, use a fresh build container for each source
snapshot. The Git bundle includes committed `main` only, not working-tree edits
or ignored files. A shallow checkout also needs its shallow-boundary marker:

```powershell
$run = 't3code-windows-' + (Get-Date -Format 'yyyyMMdd-HHmmss')
$build = Join-Path $PWD ".tmp/t3code-windows-build/$run"
New-Item -ItemType Directory -Force "$build/input" | Out-Null
git -C modules/t3code bundle create "$build/input/source.bundle" main
$shallow = git -C modules/t3code rev-parse --git-path shallow
if (Test-Path $shallow) { Copy-Item $shallow "$build/input/shallow" }
docker build -t ilude/t3code-windows-builder:local scripts/t3-code-windows-build
docker create --name $run ilude/t3code-windows-builder:local
docker cp "$build/input" "${run}:/input"
docker start --attach $run
docker inspect $run --format '{{.State.ExitCode}}'
# After a successful build (exit code 0):
docker cp "${run}:/out" "$build/artifacts"
```

The default version is the source's server version plus
`-preview.<UTC date>.1`; pass an explicit preview version after the image name
in `docker create` to distinguish additional builds. The container retains its
source and dependencies for inspection. Outputs include `installer/`,
`cli-windows/`, `cli-linux/`, `win-unpacked/`, dependency-free `verify/` scripts,
`build.log`, `source-commit.txt`, and `version.txt`.

On 2026-11-07, source `e455200077ce60806a01c8f28435b58860dcfc74` built as
`0.1.7-preview.20261107.1` in `t3code-windows-build-20261107`. The installer is
`.tmp/t3code-windows-build/artifacts/installer/T3-Code-0.1.7-preview.20261107.1-x64.exe`
(322,999,322 bytes). Upstream's Linux CLI smoke check, Windows payload validation
(66 files, 24 sidecar natives), Windows desktop native-load/bundle checks, and
Windows CLI smoke check all passed. The CLI served HTTP successfully with
isolated temporary state. Windows check logs are beside `build.log` in that
artifacts directory. ShellCheck and shfmt pass for the build runner.

To repeat the Windows checks against exported artifacts (adjust `$artifacts`):

```powershell
$artifacts = (Resolve-Path '.tmp/t3code-windows-build/artifacts').Path
$env:T3CODE_HOME = Join-Path $artifacts 'verification-home'
$env:T3CODE_TELEMETRY_ENABLED = 'false'
node "$artifacts/verify/verify-windows-desktop-artifact.mjs" --app-dir "$artifacts/win-unpacked" --arch x64 --build-version 0.1.7-preview.20261107.1
node "$artifacts/verify/smoke-cli-archive.mjs" --archive "$artifacts/cli-windows/t3-0.1.7-preview.20261107.1-win32-x64.zip" --expect-version 0.1.7-preview.20261107.1
```

These checks do not install the app or prove GUI/provider operation or WSL guest
execution. The installer remains unsigned and uses the normal Beta app identity,
so installing it can replace the existing app; it is not a side-by-side install.
No installer was run, and no existing T3 process or live data was changed.

## First use

1. Open **T3 Code** on Windows/macOS, or run `t3` for the local web interface.
   `t3 serve` runs without opening a browser. The CLI normally lives in
   `~/.local/bin`; open a fresh shell if it is not found after installation.
2. In **Settings > Providers**, refresh Pi. If the app was already running,
   start a new thread after refresh so an existing Pi process is not reused.
3. Open the project directory and use the synced model default, **Pi default**,
   or a specific model discovered from Pi. Existing threads are not reset.
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
They cover portable preference application, local runtime settings preservation,
keybinding merge precedence, repeatable configuration, and refusal to replace
malformed settings, not interactive T3 operation or provider authentication.

On 2026-11-06, the Windows workstation's existing T3 Code 0.1.7 desktop server
loaded this configuration and completed a tool-free Pi request with the expected
`T3_PI_OK` reply, using its existing credentials. This verifies authenticated
Pi access through T3. Interactive approvals, custom subagent presentation,
remote access, and macOS/Linux installation were not live-tested.
