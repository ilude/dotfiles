---
date: 2026-04-16
status: synthesis-complete
---

# Plan Review Synthesis: WinGet Dynamic Shim Framework

## Review Panel

| Reviewer | Role | Findings | Verified Issues |
|----------|------|----------|-----------------|
| R1 | Completeness & Explicitness | 8 | 4 confirmed HIGH |
| R2 | Adversarial / Red Team | 8 | 3 confirmed HIGH/MEDIUM |
| R3 | Outside-the-Box / Simplicity | 5 | 1 HIGH (alternative noted) |
| R4 | Windows & Cross-Shell Specialist | 8 | 3 confirmed MEDIUM |
| R5 | Security & Access Control | 8 | 0 HIGH (all LOW, within existing threat model) |

---

## Outside-the-Box Assessment

The approach is technically sound and the selected design will work. The primary proportionality question raised by R3: the existing `New-WinGetLink` function in `install.ps1` already creates symlinks to versioned binaries. Fixing its stale-link detection (check if existing link target still exists; if not, recreate) would address the immediate staleness problem with ~5 lines of code change.

**Verdict: approach is justified, but the tradeoff should be documented.** The dynamic shim framework satisfies Success Criterion 4 ("winget upgrade updates the shim without rerunning the installer") which a symlink-refresh approach does not â€” `New-WinGetLink` would still require `install.ps1` to rerun after each upgrade. The runtime glob overhead (one filesystem scan per command invocation) is the main cost. The framework is proportional to the stated goal.

Actionable: add "Fix New-WinGetLink stale detection" to Alternatives Considered with an explicit explanation of why it was rejected â€” this closes the question for future readers and builders.

---

## Bugs (must fix before executing)

### BUG-1 â€” Missing Biome and Trivy package IDs in T2 registry [HIGH]
**Flagged by**: R1 (Finding 1)
**Verified**: CONFIRMED. Filesystem at `$LOCALAPPDATA\Microsoft\WinGet\Packages\` contains `BiomeJS.Biome_Microsoft.Winget.Source_8wekyb3d8bbwe` and `AquaSecurity.Trivy_Microsoft.Winget.Source_8wekyb3d8bbwe`. The plan's T2 YAML snippet shows only 3 packages (opencode, uv, bun) and says "include all 8 commands" without specifying Biome or Trivy package IDs anywhere in the plan. Neither package appears in any DSC YAML in the repo â€” they are manually installed, so the installer must treat them as optional/skip-if-missing.

**Fix**: Add to the T2 registry YAML snippet:
```yaml
- package_id: BiomeJS.Biome
  commands:
    - command_name: biome
      target_exe: biome.exe
- package_id: AquaSecurity.Trivy
  commands:
    - command_name: trivy
      target_exe: trivy.exe
```
Also add to T3 and T4: these packages are not in any install profile DSC YAML, so the installer MUST warn-and-skip (not error) when they are absent.

---

### BUG-2 â€” T4 installer call is lock-gated and won't run on subsequent invocations [HIGH]
**Flagged by**: R1 (Finding 8) and R2 (Finding 3) â€” independently confirmed
**Verified**: CONFIRMED. `install.ps1` lines 1488â€“1537: `Install-Packages` is only called when `$shouldInstallPackages` is true (first run, `-ForcePackages`, or script updated since last run). The always-run maintenance section at lines 1543â€“1555 calls `Ensure-WinGetLinksInPath` and `New-WinGetLink` unconditionally on every `install.ps1` invocation regardless of the lock file. If `Install-WinGetShims.ps1` is called inside `Install-Packages`, it will never run when packages are already up-to-date â€” defeating the "registry edit + re-run" extensibility goal.

**Fix**: Place the `Install-WinGetShims.ps1` call in the always-run maintenance section (after the `New-WinGetLink` maintenance loop, around line 1555), not inside `Install-Packages`. Pattern to follow:
```powershell
# Dynamic shim refresh (runs every install.ps1 invocation)
$shimsScript = Join-Path $BASEDIR "scripts\winget-shims\Install-WinGetShims.ps1"
if (Test-Path $shimsScript) {
    Write-Host "`nRefreshing WinGet dynamic shims..." -ForegroundColor Cyan
    & pwsh -NoProfile -File $shimsScript
}
```

---

### BUG-3 â€” Bash shim library path resolution mechanism is unspecified [HIGH]
**Flagged by**: R1 (Finding 6) and R2 (Finding 5) â€” independently confirmed
**Verified**: CONFIRMED as a plan gap. T3 says generated bash shims "sources `find-winget-binary.sh`" but never specifies how the generated shim locates the library file at runtime. Without this, the builder must guess â€” and if they use an absolute user path (e.g., `C:\Users\mglenn\...`), the shim breaks for any other user.

**Fix**: Add to T3 description: "Generated bash shims hardcode the path to `find-winget-binary.sh` using a HOME-relative reference computed at generation time: `source \"\$HOME/.dotfiles/scripts/winget-shims/lib/find-winget-binary.sh\"`. Use `$HOME` rather than an absolute path derived from `$PSScriptRoot` so the shim works regardless of username. Add a guard: if the library file is missing, print an error to stderr and exit 1."

---

### BUG-4 â€” "Shared PowerShell launcher" is referenced but never defined [HIGH]
**Flagged by**: R1 (Finding 2)
**Verified**: CONFIRMED. T3 says `.bat` shims "invoke a shared PowerShell launcher that resolves the current target at runtime" but no file name, location, argument interface, or invocation pattern is specified anywhere in the plan. The builder must invent this contract from scratch.

**Fix**: Add to T3 description: "The shared launcher is `scripts/winget-shims/lib/Invoke-WinGetShim.ps1`. It accepts parameters `-PackageId <string>`, `-TargetExe <string>`, and optionally `-RelativePath <string>`. It dot-sources `Find-WinGetBinary.ps1`, resolves the binary path, and invokes it with `& $binaryPath @args`, forwarding the exit code via `exit $LASTEXITCODE`. Generated `.bat` shims call it as: `pwsh.exe -NoProfile -NonInteractive -File \"%~dp0..\scripts\winget-shims\lib\Invoke-WinGetShim.ps1\" -PackageId \"...\" -TargetExe \"...\" %*`"

---

### BUG-5 â€” Bash shim has no guard against empty binary resolution [HIGH]
**Flagged by**: R2 (Finding 1)
**Verified**: CONFIRMED as a real failure mode. If `find_winget_binary` returns empty (package not installed, cygpath unavailable, etc.), an unguarded shim produces either a confusing "command not found" for the first argument, or silently re-executes `"$@"` as a command. Neither gives the user a useful diagnostic.

**Fix**: Add to T3 bash shim template and T1 acceptance criteria. The generated bash shim body must be:
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

---

### BUG-6 â€” .bat shim invokes pwsh without -NoProfile, causing 500msâ€“1s startup overhead per invocation [MEDIUM]
**Flagged by**: R4 (Finding 4)
**Verified**: CONFIRMED as a real usability bug. The PowerShell profile at `powershell/profile.ps1` loads fzf, zoxide, posh-git, Oh My Posh, and a completion cache. Every CMD or batch invocation of a shimmed command (e.g., `biome check .` from a Makefile) pays full profile load time. At 500ms+ this makes shimmed tools unusable in build pipelines invoked from CMD.

**Fix**: All `pwsh.exe` invocations in generated `.bat` files must include `-NoProfile -NonInteractive`. This is already the pattern used in this repo's other PowerShell invocations from batch/scripts.

---

### BUG-7 â€” T2.2 verification command uses $LOCALAPPDATA which is unset in a fresh Git Bash session [MEDIUM]
**Flagged by**: R2 (Finding 6)
**Verified**: CONFIRMED as a documentation/verification bug. The T2.2 acceptance criterion runs a bash loop referencing `$LOCALAPPDATA`, but that variable is only available in Git Bash when inherited from a parent PowerShell/CMD process. In a fresh Git Bash session launched from the Start Menu, it is typically unset, causing the loop to silently produce no `MISSING:` lines and appear to pass.

**Fix**: Change T2.2 verification to use cygpath explicitly:
```bash
WINGET_PKGS=$(cygpath -u "$LOCALAPPDATA")/Microsoft/WinGet/Packages
for id in $(python -c "import yaml; [print(e['package_id']) for e in yaml.safe_load(open('scripts/winget-shims/registry.yaml'))]"); do
    ls "${WINGET_PKGS}/${id}_"* &>/dev/null && echo "OK: $id" || echo "MISSING: $id"
done
```
Or move this check entirely to PowerShell where `$env:LOCALAPPDATA` is always available.

---

## Hardening Suggestions (optional improvements)

### H1 â€” Document symlink-refresh alternative in Alternatives Considered [LOW]
`New-WinGetLink` already creates symlinks to versioned binaries. Adding 5 lines of stale-link detection would fix the immediate staleness problem. The plan should document why this was rejected (it requires `install.ps1` to rerun after each `winget upgrade`, which the dynamic shim approach avoids). This closes the question for future readers.

### H2 â€” Add `setlocal disabledelayedexpansion` to generated .bat files [LOW]
Arguments containing `!` characters fail in batch with delayed expansion enabled. Adding `@setlocal disabledelayedexpansion` as the second line of every generated `.bat` shim prevents this edge case for tools like biome that may receive paths with `!` in directory names.

### H3 â€” Guard cygpath call in find-winget-binary.sh for WSL environments [LOW]
The Handoff Notes mention WSL graceful return, but the code should implement it explicitly. Add `command -v cygpath &>/dev/null || return 0` before the cygpath invocation so the function returns empty (not an error) when run in WSL.

### H4 â€” AC5 must specify a fresh pwsh session [MEDIUM]
T3 AC5 as written (`pwsh -File ...; Get-Command opencode`) is ambiguous â€” `Get-Command` would run in the calling session which hasn't yet inherited the PATH change written by the installer. Clarify: run installer, then open a NEW `pwsh` session to verify `Get-Command opencode` resolves under `~\.local\bin`.

### H5 â€” Clarify "newest deterministic match" for multiple package dirs [LOW]
WinGet installs one version at a time, so multiple matching dirs are rare. Document that `Sort-Object LastWriteTime -Descending | Select-Object -First 1` is the implementation, and add a warning log if multiple matches are found so the operator knows the sort was needed.

### H6 â€” Warn if dotfiles repo path changes after shim generation [LOW]
Bash shims hardcode the library path at generation time. If `~/.dotfiles` is moved or re-cloned to a different path, all bash shims break silently. Document: "If the dotfiles repo is moved, rerun `Install-WinGetShims.ps1` to regenerate shims." Using `$HOME/.dotfiles` as the reference (BUG-3 fix) mitigates this for the common case.

### H7 â€” Verify `~/.local/bin` PATH position in .bashrc [MEDIUM]
The plan states `~/.local/bin` is "already first in bash $PATH via .bashrc" but doesn't verify this against the actual source order. If `.path-windows-local` (which includes WinGet/Links) is sourced before `~/.local/bin` is prepended, bash shims won't shadow stale links. Suggested verification step: `echo $PATH | tr ':' '\n' | grep -n 'local/bin\|WinGet'` from Git Bash, confirming `.local/bin` appears first.

---

## Dismissed Findings

### DISMISSED-1 â€” .bat vs .exe PATH resolution in PowerShell/CMD [R4.F1]
**Claim**: Ambiguity about whether `.bat` in an earlier PATH dir shadows `.exe` in a later one.
**Reason**: R4 confirmed (and prior synthesis confirmed via live test) that PATH order takes precedence over PATHEXT extension order when files are in different directories. An earlier-path `.bat` wins. The plan's assumption is valid.

### DISMISSED-2 â€” Supply chain / WinGet package integrity [R5.F7]
**Claim**: Shims execute WinGet-installed binaries without integrity checks.
**Reason**: Identical threat model to the existing WinGet `Links/` shims. No new attack surface introduced by this plan.

### DISMISSED-3 â€” TOCTOU race in glob-then-execute [R5.F5]
**Claim**: Race between glob resolution and binary execution.
**Reason**: Requires local attacker with LOCALAPPDATA write access â€” already a full user-level compromise. Not a new risk introduced by this plan.

### DISMISSED-4 â€” `opencode` and `opencode.bat` naming conflict [R4.F8]
**Claim**: Extensionless bash shim and `.bat` shim in same directory might conflict.
**Reason**: R4 confirmed this is correct and expected behavior. Git Bash resolves the extensionless script; CMD/PowerShell resolves `.bat`. No conflict.

### DISMISSED-5 â€” User PATH as privilege escalation vector [R5.F2]
**Claim**: Prepending `~/.local/bin` to User PATH enables privilege escalation.
**Reason**: Elevated processes on Windows use Machine PATH, not User PATH. No new risk vs. existing `~/.local/bin` usage.

### DISMISSED-6 â€” Corrupted motivation table [R1.F5]
**Claim**: The bun stale-version table row has placeholder text "1.1.63 wait that's opencode."
**Reason**: Documentation artifact in Context section only; does not affect plan execution or generated code. Low priority cleanup.

### DISMISSED-7 â€” `.bat` wrappers cannot override WinGet `.exe` in PowerShell/CMD [prior synthesis]
**Reason**: False positive. Verified: earlier-PATH `.bat` wins over later-PATH `.exe` in both PowerShell and CMD. Plan assumption is correct.

### DISMISSED-8 â€” Shell line endings not enforced for `*.sh` [prior synthesis]
**Reason**: False positive. `.gitattributes` already enforces `*.sh text eol=lf` globally.

---

## Positive Notes

- **Registry-driven extensibility** is the right abstraction. Adding a new shim requires only a YAML entry and installer rerun.
- **Wave structure** (T1/T2 â†’ V1 â†’ T3/T4 â†’ V2) correctly validates library functions before the installer depends on them.
- **Bun/bunx metadata** (`relative_path: bun-windows-x64`, `bunx -> bun.exe`) is correctly specified and verified against the actual on-disk package layout.
- **Idempotency requirement** for T3.6 is explicitly included and testable.
- **WSL graceful degradation** in Handoff Notes is a thoughtful inclusion that anticipates a real edge case.
- **`bun.exe.outdated` exclusion** note shows awareness of WinGet artifacts in `Links/`.
- **`cygpath`-based path conversion** for Git Bash is the correct approach on this platform.
- **`$env:LOCALAPPDATA` documentation** in Handoff Notes is accurate and matches the filesystem.
- The existing `New-WinGetLink` function's `RelativePath` parameter is the correct foundation â€” T3 correctly reuses this pattern rather than inventing a second naming convention.
