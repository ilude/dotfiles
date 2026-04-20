# install.d/

Drop-in hook scripts executed near the end of every `install` (bash) and
`install.ps1` (PowerShell) run. Use this for self-heal steps, orphan cleanups,
one-off migrations -- anything that needs to run on every machine once the
main install flow is in place.

## Conventions

- **Naming:** `NN-description.sh` for bash, `NN-description.ps1` for PowerShell.
- **Order:** numeric prefix (`00`, `10`, `20`, ...) controls run order via
  lexical sort. Keep numbers spaced so new steps can slot in.
- **Matching pairs:** if a step needs to run on both Linux/MSYS2 and Windows
  native, ship both `.sh` and `.ps1` versions with the same `NN-description`
  stem. The installers each only source their native extension.
- **Idempotence (required):** every script must detect prior state and no-op
  when already applied. These scripts run on every install; non-idempotent
  steps will corrupt state.
- **Exit code:** return 0 on success. Nonzero is treated as a soft failure --
  the installer prints a warning and continues with the next script.
- **Inputs:** scripts receive the dotfiles root via `$DOTFILES_ROOT` (bash)
  or the `-DotfilesRoot` parameter (PowerShell). Do not hardcode paths.
- **No prompts:** scripts run unattended. If user input is needed, surface
  a warning and let the user run a follow-up command manually.
