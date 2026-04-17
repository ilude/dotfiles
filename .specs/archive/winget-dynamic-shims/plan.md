---
created: 2026-04-16
status: completed
completed: 2026-04-16
---

# Plan: WinGet Dynamic Shim Framework

## Context & Motivation

WinGet "portable" packages copy the actual binary into `%LOCALAPPDATA%\Microsoft\WinGet\Links\` as a shim. When a package is upgraded via `winget upgrade`, this shim copy is sometimes **not replaced** â€” the new binary lives in the versioned `Packages\` folder but the `Links\` shim stays at the old version. This was observed concretely with opencode: `opencode --version` reported 1.1.63 while the installed package was 1.4.3, and the only fix was a full `winget uninstall && winget install` cycle.

Auditing all 30 installed WinGet shims revealed 4 programs currently stale:

| Program | Shim version | Installed version |
|---------|-------------|-------------------|
| `uv`    | 0.11.2      | 0.11.7            |
| `bun`   | 1.3.9       | 1.3.12            |
| `biome` | 2.4.11      | 2.4.12            |
| `trivy` | 0.69.1      | 0.69.3            |

The solution is a **dynamic shim framework**: thin wrapper scripts that look up the real binary under `Packages\` at runtime, bypassing the stale `Links\` shim entirely.

## Constraints

- Platform: Windows 11, Git Bash + PowerShell
- Shell: Git Bash and PowerShell/CMD â€” shims must work in all three environments
- `~/.local/bin` is already first in bash `$PATH` via `.bashrc`; shell scripts placed there override WinGet/Links for Git Bash
- `~/.local/bin` (`C:\Users\mglenn\.local\bin`) must also be prepended to Windows `%PATH%` so PowerShell and CMD pick up shims before WinGet/Links
- Shims must pass all arguments and exit codes through transparently
- Hook on Windows: bare `python`, not `uv run` (avoid console flashing â€” see `claude/tracking/windows-console-flashing.md`)
- Initial target programs: `opencode`, `uv`, `uvx`, `uvw`, `bun`, `bunx`, `biome`, `trivy`
- Framework must be extensible â€” adding a new program should require only a registry entry
- Git Bash validation commands must be run from an already-open Git Bash session or via an explicit Git Bash executable, not bare `bash` from PowerShell

## Alternatives Considered

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| Dynamic runtime shims (this plan) | Works immediately, always uses latest installed; transparent to user | Small overhead per invocation (glob on launch); needs PATH re-ordering | **Selected** |
| Maintenance script (periodic rebuild) | No runtime overhead; one-shot fix | Still has a window of staleness; user must remember to run it | Rejected: reactive, not proactive |
| Option 2: Hook to detect staleness | Notifies on mismatch; minimal friction | Advisory only â€” user still has to act; doesn't fix the problem | Rejected: can complement but not replace |
| Option 4: Scoop instead of WinGet | Scoop shims are atomic symlinks, never stale | Duplicates package management; conflicts with existing winget DSC YAML | Rejected: too much churn |
| Fix `New-WinGetLink` stale detection | ~5 lines change to existing function; no new infrastructure | Requires `install.ps1` to rerun after every `winget upgrade` â€” does not satisfy Success Criterion 4 (runtime self-updating without reinstall) | Rejected: does not meet the zero-reinstall goal |

## Objective

A working shim framework checked into dotfiles that:
1. Provides runtime wrapper scripts for the 8 target commands in `~/.local/bin/`
2. Makes `~/.local/bin` early in the Windows `%PATH%` (not just bash PATH) via `install.ps1`
3. Has a registry file (`scripts/winget-shims/registry.yaml`) where adding one entry generates a new shim on next install
4. Survives future WinGet upgrades without rerunning the installer, because wrappers resolve the current package path at execution time

## Project Context

- **Language**: PowerShell, Bash, Python (hooks)
- **Test command**: `make test-powershell` (Pester) for PowerShell; `make test` for Python/general
- **Lint command**: `make lint` (shellcheck + ruff)

## Task Breakdown

| # | Task | Files | Type | Model | Agent | Depends On |
|---|------|-------|------|-------|-------|------------|
| T1 | Create core Find-WinGetBinary helpers | 2 | mechanical | haiku | builder-light | â€” |
| T2 | Create shim registry | 1 | mechanical | haiku | builder-light | â€” |
| T3 | Create shim installer script | 3 | feature | sonnet | builder | T1, T2 |
| T4 | Wire installer into install.ps1 | 1 | mechanical | haiku | builder-light | T3 |
| V1 | Validate wave 1 | â€” | validation | haiku | validator | T1, T2 |
| V2 | Validate wave 2 | â€” | validation | sonnet | validator-heavy | T3, T4 |

## Execution Waves

### Wave 1 (parallel)

**T1: Create core Find-WinGetBinary helpers** [haiku] â€” builder-light

- Description: Create the core lookup logic as two small utilities:
  1. `scripts/winget-shims/lib/Find-WinGetBinary.ps1` â€” PowerShell function that resolves `$env:LOCALAPPDATA\Microsoft\WinGet\Packages\<PackageId>*\` for a target executable, returns the path or `$null`.
  2. `scripts/winget-shims/lib/find-winget-binary.sh` â€” Bash function (to be sourced) that does the same using `$LOCALAPPDATA` converted to a Unix path via `cygpath -u`.
  Both must handle: package not found (return empty), multiple matching version dirs (pick the newest deterministic match using `Sort-Object LastWriteTime -Descending | Select-Object -First 1` in PowerShell and `ls -t | head -1` in bash â€” log a warning if multiple matches are found), explicit nested relative paths for packages like Bun, alias commands that resolve to a different target exe (for example `bunx -> bun.exe`), and a fallback recursive search when `relative_path` is omitted.
  The bash helper must guard the `cygpath` call: add `command -v cygpath &>/dev/null || return 0` before the cygpath invocation so the function returns empty gracefully in WSL or any environment without cygpath (no crash, no error).

- Files:
  - `scripts/winget-shims/lib/Find-WinGetBinary.ps1` (new)
  - `scripts/winget-shims/lib/find-winget-binary.sh` (new)

- Acceptance Criteria:
  1. [ ] PowerShell function returns the correct path for an installed package
     - Verify: `pwsh -Command ". scripts/winget-shims/lib/Find-WinGetBinary.ps1; Find-WinGetBinary 'SST.opencode' 'opencode.exe'"`
     - Pass: prints a path ending in `opencode.exe` that exists on disk
     - Fail: returns empty or throws â€” check that `$env:LOCALAPPDATA\Microsoft\WinGet\Packages\SST.opencode*` exists
  2. [ ] Bash function returns the correct path
     - Verify (from Git Bash): `. scripts/winget-shims/lib/find-winget-binary.sh; find_winget_binary SST.opencode opencode.exe`
     - Pass: prints a Unix-style path to `opencode.exe` that `test -f` confirms
     - Fail: empty output â€” check `cygpath -u "$LOCALAPPDATA"` works in the environment
  3. [ ] Both return empty/null for a package that is not installed (no crash)
     - Verify: run with package ID `Does.Not.Exist` and exe `nope.exe`
     - Pass: exits 0, output empty
     - Fail: non-zero exit or exception
  4. [ ] Both helpers can resolve Bun using registry-style metadata
     - Verify: resolve package ID `Oven-sh.Bun`, command name `bunx`, target exe `bun.exe`, relative path `bun-windows-x64`
     - Pass: returns the path to `bun.exe` under `bun-windows-x64`
     - Fail: empty output or a path to a nonexistent `bunx.exe`

---

**T2: Create shim registry** [haiku] â€” builder-light

- Description: Create `scripts/winget-shims/registry.yaml` listing every managed package. Schema per entry:
  ```yaml
  - package_id: SST.opencode
    commands:
      - command_name: opencode
        target_exe: opencode.exe
  - package_id: astral-sh.uv
    commands:
      - command_name: uv
        target_exe: uv.exe
      - command_name: uvx
        target_exe: uvx.exe
      - command_name: uvw
        target_exe: uvw.exe
  - package_id: Oven-sh.Bun
    commands:
      - command_name: bun
        target_exe: bun.exe
        relative_path: bun-windows-x64
      - command_name: bunx
        target_exe: bun.exe
        relative_path: bun-windows-x64
  - package_id: BiomeJS.Biome
    commands:
      - command_name: biome
        target_exe: biome.exe
  - package_id: AquaSecurity.Trivy
    commands:
      - command_name: trivy
        target_exe: trivy.exe
  ```
  Include all 8 target commands: `opencode`, `uv`/`uvx`/`uvw`, `bun`/`bunx`, `biome`, `trivy`.
  Package IDs must match exactly what WinGet uses (verify against `%LOCALAPPDATA%\Microsoft\WinGet\Packages\` folder names). Reuse the same package-discovery assumptions already present in `install.ps1` (`New-WinGetLink` and its `RelativePath` support) instead of inventing a second naming convention.
  **Note**: `BiomeJS.Biome` and `AquaSecurity.Trivy` are not present in any DSC YAML install profile â€” they are manually installed. The installer MUST warn-and-skip (not error) when either is absent.

- Files:
  - `scripts/winget-shims/registry.yaml` (new)

- Acceptance Criteria:
  1. [ ] Registry contains entries for all 8 commands across 5 packages
     - Verify: `python -c "import yaml; r=yaml.safe_load(open('scripts/winget-shims/registry.yaml')); print(sum(len(e['commands']) for e in r))"`
     - Pass: prints `8`
     - Fail: count mismatch â€” add missing entries
  2. [ ] All package IDs match actual installed folder prefixes
     - Verify (from Git Bash â€” `$LOCALAPPDATA` may be unset in a fresh session, so use cygpath explicitly):
       ```bash
       WINGET_PKGS=$(cygpath -u "$LOCALAPPDATA")/Microsoft/WinGet/Packages
       for id in $(python -c "import yaml; [print(e['package_id']) for e in yaml.safe_load(open('scripts/winget-shims/registry.yaml'))]"); do
           ls "${WINGET_PKGS}/${id}_"* &>/dev/null && echo "OK: $id" || echo "MISSING: $id"
       done
       ```
     - Pass: all lines say `OK:` (Biome and Trivy may say `MISSING:` if not manually installed â€” that is acceptable)
     - Fail: any unexpected `MISSING:` line â€” fix the package ID in registry
  3. [ ] Alias and nested-path metadata is explicit where needed
     - Verify: `python -c "import yaml; r=yaml.safe_load(open('scripts/winget-shims/registry.yaml')); bun=[e for e in r if e['package_id']=='Oven-sh.Bun'][0]['commands']; print([(c['command_name'], c['target_exe'], c.get('relative_path')) for c in bun])"`
     - Pass: includes `('bun', 'bun.exe', 'bun-windows-x64')` and `('bunx', 'bun.exe', 'bun-windows-x64')`
     - Fail: Bun metadata is incomplete or points to `bunx.exe`

### Wave 1 â€” Validation Gate

**V1: Validate wave 1** [haiku] â€” validator
- Blocked by: T1, T2
- Checks:
  1. Run all acceptance criteria for T1 and T2
  2. `make lint` â€” no shellcheck errors on `find-winget-binary.sh`
  3. YAML is valid: `python -c "import yaml; yaml.safe_load(open('scripts/winget-shims/registry.yaml'))"`
  4. Bash function file has `eol=lf` (check `.gitattributes` covers `*.sh`)
  5. Git Bash-specific checks are run from Git Bash, not WSL `bash`
- On failure: Create fix task, re-validate after fix

---

### Wave 2

**T3: Create shim installer script** [sonnet] â€” builder
- Blocked by: V1
- Description: Create `scripts/winget-shims/Install-WinGetShims.ps1`. This script:
  1. Reads `registry.yaml` (from script's own directory)
  2. Ensures `C:\Users\<username>\.local\bin` exists before writing shims
  3. For each registry command entry: generates two runtime-dynamic shim files in `~/.local/bin/`:
     - **Git Bash shim** (no extension): sources `find-winget-binary.sh` using a `$HOME`-relative path baked in at generation time (`source "$HOME/.dotfiles/scripts/winget-shims/lib/find-winget-binary.sh"`), resolves the target at runtime, guards against empty resolution, then `exec`s it with `"$@"`. Use `$HOME` rather than an absolute path from `$PSScriptRoot` so shims work regardless of username. Generated bash shim template:
       ```bash
       #!/usr/bin/env bash
       source "$HOME/.dotfiles/scripts/winget-shims/lib/find-winget-binary.sh"
       _bin=$(find_winget_binary "PACKAGE_ID" "TARGET_EXE" "RELATIVE_PATH")
       if [ -z "$_bin" ]; then
           echo "shim: could not resolve COMMAND_NAME â€” is PACKAGE_ID installed?" >&2
           exit 127
       fi
       exec "$_bin" "$@"
       ```
     - **CMD/PowerShell shim** (`.bat`): invokes the shared launcher `scripts/winget-shims/lib/Invoke-WinGetShim.ps1` with `-NoProfile -NonInteractive` to avoid profile load overhead. Generated `.bat` template:
       ```bat
       @setlocal disabledelayedexpansion
       @pwsh.exe -NoProfile -NonInteractive -File "%~dp0..\..\scripts\winget-shims\lib\Invoke-WinGetShim.ps1" -PackageId "PACKAGE_ID" -TargetExe "TARGET_EXE" %*
       @exit /b %errorlevel%
       ```
       The shared launcher `Invoke-WinGetShim.ps1` accepts `-PackageId <string>`, `-TargetExe <string>`, and optionally `-RelativePath <string>`. It dot-sources `Find-WinGetBinary.ps1`, resolves the binary path, and runs `& $binaryPath @args` forwarding exit code via `exit $LASTEXITCODE`.
  4. Makes bash shims executable (`chmod +x`)
  5. Ensures `C:\Users\<username>\.local\bin` is prepended to the Windows user-scope `PATH` environment variable (use `[Environment]::SetEnvironmentVariable`) so it takes precedence over WinGet/Links in PowerShell and CMD
  6. Updates the current PowerShell process `$env:PATH` as well so validation in the same session sees the new shim directory immediately
  7. Prints a summary: `[OK] opencode -> C:\...\opencode.exe` for each command that resolves, and `[SKIP] biome -> package not installed` for optional commands not present on the current machine
  8. Warns and skips commands whose package is not installed; it should exit non-zero only for malformed registry entries or shim-generation failures

  Note: wrappers stay dynamic at runtime. The installer generates wrapper files, but each invocation resolves the current package path when the command runs, so `winget upgrade` does not require a shim regeneration step.
  Note: prefer reusing the repo's existing Windows maintenance patterns where possible (`New-WinGetLink`, `Ensure-WinGetLinksInPath`, and current-process PATH updates) rather than introducing divergent PATH logic.

- Files:
  - `scripts/winget-shims/Install-WinGetShims.ps1` (new)
  - `scripts/winget-shims/lib/Invoke-WinGetShim.ps1` (new â€” shared launcher invoked by `.bat` shims)
  - `scripts/winget-shims/lib/Find-WinGetBinary.ps1` (import via dot-source)
  - `scripts/winget-shims/lib/find-winget-binary.sh` (referenced by generated bash shims)

- Acceptance Criteria:
  1. [ ] Running the installer creates runtime wrappers for all installed target commands and skips optional missing packages cleanly
     - Verify: `pwsh -File scripts/winget-shims/Install-WinGetShims.ps1 && ls ~/.local/bin/opencode ~/.local/bin/uv ~/.local/bin/uvx ~/.local/bin/uvw ~/.local/bin/bun ~/.local/bin/bunx ~/.local/bin/biome ~/.local/bin/trivy`
     - Pass: installed-package shims exist, optional missing packages are reported as `[SKIP]`, no unexpected errors
     - Fail: check that the registry YAML path is relative to `$PSScriptRoot`, not CWD
  2. [ ] Bash shims are executable and work
     - Verify (from Git Bash): `opencode --version`
     - Pass: prints the same version as the current `winget list` / package-directory target
     - Fail: permission denied â†’ check `chmod +x` step; wrong version â†’ check runtime lookup logic
  3. [ ] Batch shims are created
     - Verify: `ls ~/.local/bin/opencode.bat ~/.local/bin/uv.bat`
     - Pass: both files exist and call the shared runtime resolver with the correct command metadata
     - Fail: check `.bat` generation logic
  4. [ ] `~/.local/bin` is prepended to Windows user PATH
     - Verify: `pwsh -Command '[Environment]::GetEnvironmentVariable("PATH","User") -split ";" | Select-Object -First 3'`
     - Pass: first entry is `C:\Users\mglenn\.local\bin`
     - Fail: check `SetEnvironmentVariable` call; requires no elevation for User scope
   5. [ ] A fresh PowerShell session inherits the updated PATH and resolves the shim
     - Verify: run the installer, then open a NEW `pwsh` session and run `Get-Command opencode`
     - Pass: the resolved source is under `C:\Users\mglenn\.local\bin` (not WinGet/Links)
     - Note: running `Get-Command opencode` in the same session as the installer is insufficient â€” the calling session has not yet inherited the PATH change
     - Fail: check current-process PATH update and confirm User PATH was persisted via `SetEnvironmentVariable`
  6. [ ] Script is idempotent â€” running twice produces no errors and same result
     - Verify: run the installer twice back-to-back; second run exits 0
     - Pass: no errors on second run, shims unchanged
     - Fail: check for file-exists guards before write
  7. [ ] PowerShell/CMD command resolution behavior is documented and works as intended
     - Verify: confirm the plan states that an earlier-path `.bat` in `~/.local/bin` is expected to shadow a later WinGet `.exe`
     - Pass: the expectation is explicit in the plan and reflected in validation notes
     - Fail: add the note near PATH-handling and validation steps

---

**T4: Wire installer into install.ps1** [haiku] â€” builder-light
- Blocked by: V1
- Description: Add a call to `Install-WinGetShims.ps1` in `~/.dotfiles/install.ps1` so runtime wrappers are refreshed on every run. **Placement is critical**: place the call in the always-run maintenance section (after the `New-WinGetLink` maintenance loop, around line 1555) â€” NOT inside `Install-Packages`. The `Install-Packages` function is lock-gated and only runs on first install or when forced; placing the call there means it will never run when packages are already up-to-date, defeating the "registry edit + re-run" extensibility goal. Pattern to follow:
  ```powershell
  # Dynamic shim refresh (runs every install.ps1 invocation)
  $shimsScript = Join-Path $BASEDIR "scripts\winget-shims\Install-WinGetShims.ps1"
  if (Test-Path $shimsScript) {
      Write-Host "`nRefreshing WinGet dynamic shims..." -ForegroundColor Cyan
      & pwsh -NoProfile -File $shimsScript
  }
  ```
  Guard with `Test-Path` so it's a no-op if the shims script doesn't exist yet (graceful degradation). The installer must tolerate packages that are not part of the current install profile by warning and skipping them, so normal `install.ps1` runs do not fail.

- Files:
  - `install.ps1` (edit)

- Acceptance Criteria:
  1. [ ] `install.ps1` contains a call to the shims installer
     - Verify: `grep -n "Install-WinGetShims" install.ps1`
     - Pass: line found, shows correct relative path
     - Fail: add the call after the winget configure blocks
  2. [ ] Call is guarded with `Test-Path`
     - Verify: read the surrounding lines in `install.ps1`
     - Pass: wrapped in `if (Test-Path ...)` or equivalent
     - Fail: add the guard

### Wave 2 â€” Validation Gate

**V2: Validate wave 2** [sonnet] â€” validator-heavy
- Blocked by: T3, T4
- Checks:
  1. Run all acceptance criteria for T3 and T4
  2. End-to-end: after running installer, `opencode --version`, `uv --version`, `biome --version` (if installed) all return current installed versions (not stale WinGet/Links versions)
  3. `make lint` â€” no new shellcheck warnings on any generated or source bash files
  4. Installer is idempotent (run twice, second run clean)
  5. `install.ps1` diff: only the shim-installer call was added; no other changes
  6. Git Bash validation is executed from Git Bash, and PowerShell/CMD validation is executed from those shells explicitly
- On failure: Create fix task, re-validate after fix

## Dependency Graph

```
Wave 1: T1, T2 (parallel) â†’ V1
Wave 2: T3, T4 (parallel, both blocked by V1) â†’ V2
```

## Success Criteria

1. [ ] All 8 shims resolve to current installed versions, not WinGet/Links stale copies
   - Verify: run each command from the appropriate shell context and compare to the current package version reported by `winget list` or the resolved package target on disk
   - Pass: each installed command matches the current package version, including aliases such as `bunx -> bun.exe`
2. [ ] Shims work in Git Bash, PowerShell, and CMD
   - Verify: run `opencode --version` in Git Bash; run `opencode --version` in a new `pwsh` session; run `opencode --version` in `cmd.exe`
   - Pass: all three return the same current version
3. [ ] Adding a new package requires only a registry edit + re-run of installer
   - Verify (manual): add a fake entry to `registry.yaml`, confirm installer warns cleanly on missing package
   - Pass: clear warning naming the missing package, no crash
4. [ ] `winget upgrade` updates the shim to the new version without rerunning the installer
   - Verify: `winget upgrade SST.opencode` and then run `opencode --version` without rerunning the installer
   - Pass: version matches the newly installed version because the wrapper resolves the current package path at runtime

5. [ ] `~/.local/bin` precedes WinGet/Links in Git Bash `$PATH`
   - Verify (from Git Bash): `echo $PATH | tr ':' '\n' | grep -n 'local/bin\|WinGet'`
   - Pass: `.local/bin` line number is lower (earlier) than `WinGet` line number
   - Fail: check `.bashrc` PATH ordering; `~/.local/bin` must be prepended before WinGet/Links is added

## Handoff Notes

- If the dotfiles repo is moved or re-cloned to a different path, all bash shims will fail because they hardcode the library path at generation time. Rerun `Install-WinGetShims.ps1` to regenerate shims after any repo relocation. Using `$HOME/.dotfiles` as the reference path (see T3) makes this resilient to username changes but not to repo moves.
- The bash function in `find-winget-binary.sh` relies on `cygpath` which is available in Git Bash on Windows. If this ever runs in WSL, `$LOCALAPPDATA` won't be set â€” the function should return empty gracefully (no crash).
- Git Bash-specific commands in this plan are intended for an already-open Git Bash session. On this machine, bare `bash` from PowerShell resolves to WSL and must not be used for Git Bash validation.
- `$env:LOCALAPPDATA` in PowerShell resolves to `C:\Users\mglenn\AppData\Local` â€” this is where WinGet\Packages lives.
- The `.local/bin` directory (`/c/Users/mglenn/.local/bin` in Git Bash) should be created explicitly by the installer before writing shims.
- WinGet package folder name format: `<PackageId>_Microsoft.Winget.Source_8wekyb3d8bbwe` â€” glob by `<PackageId>_*` to be source-agnostic.
- For packages with multiple commands (uv: 3, bun: 2), each command gets its own shim pair. `command_name` may differ from `target_exe`.
- `Oven-sh.Bun` requires `relative_path: bun-windows-x64`, and `bunx` should resolve to `bun.exe`, not `bunx.exe`.
- `bun.exe.outdated` in WinGet/Links is a WinGet artifact, not a real program â€” do not shim it.
- PowerShell and CMD are expected to resolve an earlier-PATH `.bat` in `~/.local/bin` before a later WinGet `.exe`; keep that behavior explicit in validation notes.
