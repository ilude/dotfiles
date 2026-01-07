---
name: winget-workflow
description: Windows package management with winget and install.ps1. Covers adding packages, WinGet Links for packages that don't auto-create command aliases, and testing. Activate when working with install.ps1, winget packages, or Windows CLI tool installation.
---

# WinGet Workflow

Guidelines for managing Windows packages via winget and the dotfiles `install.ps1` script.

## Package Installation in install.ps1

### Package Arrays

Packages are defined as arrays of hashtables in `~/.dotfiles/install.ps1`:

```powershell
# Core packages (always installed)
$corePackages = @(
    @{ Id = 'Git.Git'; Name = 'Git' },
    @{ Id = 'dandavison.delta'; Name = 'git-delta (diff pager)' }
)

# Work packages (installed with -Work flag)
$workPackages = @(
    @{ Id = 'Amazon.AWSCLI'; Name = 'AWS CLI v2' }
)
```

### Finding Package IDs

```bash
# Search for package
winget search <name>

# Get exact package ID
winget search --id <partial-id>
```

---

## WinGet Links

Some packages install to deep paths without creating command aliases. The `$wingetLinks` array creates symlinks in the WinGet Links directory.

### When to Add a WinGet Link

After installing a package, check if it's accessible:

```bash
# Check if command is available
which <command>

# If not found, find where it installed
find /c/Users/$USER/AppData/Local/Microsoft/WinGet/Packages -name "<command>.exe" 2>/dev/null

# Or in PowerShell
Get-ChildItem -Path "$env:LOCALAPPDATA\Microsoft\WinGet\Packages" -Recurse -Filter "<command>.exe"
```

**Add to `$wingetLinks` if:**
- Package installs but command not in PATH
- Executable is buried in versioned subdirectory
- winget didn't create a command alias automatically

### WinGet Links Format

```powershell
$wingetLinks = @(
    @{ PackageId = 'Oven-sh.Bun'; ExeName = 'bun.exe'; RelativePath = 'bun-windows-x64' },
    @{ PackageId = 'cURL.cURL'; ExeName = 'curl.exe'; RelativePath = '' },  # Uses recursive search
    @{ PackageId = 'dandavison.delta'; ExeName = 'delta.exe'; RelativePath = '' }
)
```

| Field | Description |
|-------|-------------|
| `PackageId` | Exact winget package ID (matches `$corePackages` entry) |
| `ExeName` | Executable filename with `.exe` extension |
| `RelativePath` | Subdirectory within package folder, or `''` for recursive search |

### RelativePath Guidelines

- **Known fixed path**: Use exact subdirectory (e.g., `'bun-windows-x64'`)
- **Version in path**: Use `''` - the `New-WinGetLink` function searches recursively
- **Root of package**: Use `''`

---

## Adding a New Package

### Checklist

1. **Find package ID**: `winget search <name>`
2. **Add to appropriate array** in install.ps1:
   - `$corePackages` - Essential tools
   - `$workPackages` - Work-specific (-Work flag)
3. **Install and test**: `winget install <id>`
4. **Check if command works**: `which <command>` or `<command> --version`
5. **If not in PATH**: Add entry to `$wingetLinks`
6. **Create link manually** for current session (optional)

### Example: Adding a Package

```powershell
# 1. Add to $corePackages
@{ Id = 'sharkdp.bat'; Name = 'bat (cat replacement)' },

# 2. If command not available after install, add to $wingetLinks
@{ PackageId = 'sharkdp.bat'; ExeName = 'bat.exe'; RelativePath = '' }
```

---

## Manual Link Creation

Create a link immediately without running full install.ps1:

```bash
# Find the executable
exe_path=$(find /c/Users/$USER/AppData/Local/Microsoft/WinGet/Packages -name "delta.exe" 2>/dev/null | head -1)

# Create symlink in WinGet Links
mkdir -p /c/Users/$USER/AppData/Local/Microsoft/WinGet/Links
ln -sf "$exe_path" /c/Users/$USER/AppData/Local/Microsoft/WinGet/Links/delta.exe
```

Or in PowerShell:

```powershell
$exe = Get-ChildItem -Path "$env:LOCALAPPDATA\Microsoft\WinGet\Packages" -Recurse -Filter "delta.exe" | Select-Object -First 1
$linksDir = "$env:LOCALAPPDATA\Microsoft\WinGet\Links"
New-Item -ItemType Directory -Path $linksDir -Force | Out-Null
Copy-Item $exe.FullName "$linksDir\delta.exe" -Force
```

---

## Verifying WinGet Links Directory

The WinGet Links directory should be in User PATH:

```powershell
# Check if in PATH
[Environment]::GetEnvironmentVariable('PATH', 'User') -split ';' | Where-Object { $_ -like '*WinGet*Links*' }

# Add if missing (done by Ensure-WinGetLinksInPath in install.ps1)
$linksDir = "$env:LOCALAPPDATA\Microsoft\WinGet\Links"
$userPath = [Environment]::GetEnvironmentVariable('PATH', 'User')
if ($userPath -notlike "*$linksDir*") {
    [Environment]::SetEnvironmentVariable('PATH', "$linksDir;$userPath", 'User')
}
```

---

## Common Packages Needing Links

These packages typically need manual links:

| Package | Reason |
|---------|--------|
| `Oven-sh.Bun` | Installs to subdirectory |
| `cURL.cURL` | Version number in path |
| `dandavison.delta` | Version number in path |

Packages that auto-create aliases (no link needed):
- `Git.Git`
- `Microsoft.PowerShell`
- `junegunn.fzf`
- `BurntSushi.ripgrep.MSVC`
- `GitHub.cli`

---

## Testing After Changes

```bash
# Restart shell to pick up PATH changes
exec zsh -l

# Verify command works
<command> --version

# Or test in new PowerShell window
pwsh -c "<command> --version"
```
