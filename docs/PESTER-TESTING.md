# PowerShell testing with Pester

The repository has two active Pester test files. They are local Windows checks, not CI checks.

## Test files and coverage

`test/path-utils.tests.ps1` contains 24 tests:

| Function | Tests |
| --- | ---: |
| `ConvertTo-GitBashPath` | 6 |
| `ConvertTo-WSLPath` | 5 |
| `Get-ContentLF` | 4 |
| `Get-PathWithEntryBefore` | 3 |
| `Get-GitBash` | 6 |

`test/completion-cache.tests.ps1` contains 3 tests:

| Function | Tests |
| --- | ---: |
| `Get-CompletionCacheDirectory` | 1 |
| `Update-CompletionCache` | 1 |
| dot-sourcing behavior | 1 |

The repository does not promise compatibility with a particular Pester major-version range; use the Pester version available in the PowerShell environment.

## Running the tests

From the repository root on Windows:

```powershell
make test-powershell
```

The Make target runs:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -Command "Invoke-Pester test/*.tests.ps1"
```

To run a file directly:

```powershell
Invoke-Pester test/path-utils.tests.ps1
Invoke-Pester test/completion-cache.tests.ps1
```

The tests dot-source the focused helpers in `powershell/lib/`. They do not source `install.ps1`, and the current test setup does not extract functions from that installer.

## CI boundary

Pester is not installed or run by the GitHub Actions workflow. CI runs Python and shell checks, zsh runtime contracts, and a separate Pi Vitest job. `make test-powershell` remains an explicit local Windows target.

## Future work

Adding tests for installer functions or extracting more helpers is not implemented. Treat those as proposals only; do not assume a corresponding test or source boundary exists.
