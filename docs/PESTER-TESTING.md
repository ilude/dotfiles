# PowerShell Testing with Pester

This document describes the Pester test setup for PowerShell code in this dotfiles repository.

## Running Tests

```powershell
# From the repo root
make test-powershell

# Or directly with Pester
Invoke-Pester test/*.tests.ps1 -Output Detailed

# Run specific test file
Invoke-Pester test/path-utils.tests.ps1 -Output Detailed

# Run with code coverage
Invoke-Pester test/*.tests.ps1 -CodeCoverage powershell/lib/*.ps1
```

## Current Test Coverage

### Pure Functions (Phase 1 - Implemented)

Located in `powershell/lib/path-utils.ps1`:

| Function | Tests | Description |
|----------|-------|-------------|
| `ConvertTo-GitBashPath` | 6 | Windows → Git Bash path conversion |
| `ConvertTo-WSLPath` | 5 | Windows → WSL path conversion |
| `Get-ContentLF` | 4 | File reading with LF normalization |
| `Get-GitBash` | 5 | Git Bash executable detection + WSL path filtering |

## Adding Tests for Standard Functions (Phase 2)

The following functions in `install.ps1` can be tested with mocking:

### Install-WingetPackage

Mock `winget` to test different exit codes:

```powershell
Describe "Install-WingetPackage" {
    BeforeAll {
        # Source the function (extract to lib first)
        . "$PSScriptRoot/../powershell/lib/package-utils.ps1"
    }

    It "returns true when package installs successfully" {
        Mock winget { return } -ParameterFilter { $args -contains "install" }
        Mock Write-Host {}

        $result = Install-WingetPackage -Id "Test.Package" -Name "Test"
        $result | Should -Be $true
    }

    It "returns false when package not found" {
        Mock winget { $global:LASTEXITCODE = 1; throw "No package found" }
        Mock Write-Host {}

        $result = Install-WingetPackage -Id "Nonexistent.Package" -Name "Test"
        $result | Should -Be $false
    }

    It "handles already installed packages" {
        Mock winget { Write-Output "No applicable update found" }
        Mock Write-Host {}

        $result = Install-WingetPackage -Id "Installed.Package" -Name "Test"
        $result | Should -Be $true
    }
}
```

### Get-WSLStatus

Mock `wsl.exe` output to test WSL detection:

```powershell
Describe "Get-WSLStatus" {
    It "detects WSL not installed" {
        Mock wsl { throw "not recognized" }

        $result = Get-WSLStatus
        $result.Installed | Should -Be $false
    }

    It "detects WSL with no distributions" {
        Mock wsl { return "Windows Subsystem for Linux has no installed distributions." }

        $result = Get-WSLStatus
        $result.Installed | Should -Be $true
        $result.Distributions | Should -BeNullOrEmpty
    }

    It "lists installed distributions" {
        Mock wsl {
            return @(
                "NAME            STATE           VERSION"
                "Ubuntu-24.04    Running         2"
                "Debian          Stopped         2"
            )
        }

        $result = Get-WSLStatus
        $result.Distributions | Should -Contain "Ubuntu-24.04"
    }
}
```

### Install-PSModule

Mock `Install-Module` and `Get-Module`:

```powershell
Describe "Install-PSModule" {
    It "skips already installed modules" {
        Mock Get-Module { return @{ Name = "TestModule" } } -ParameterFilter { $ListAvailable }
        Mock Install-Module {}
        Mock Write-Host {}

        Install-PSModule -Name "TestModule"

        Should -Invoke Install-Module -Times 0
    }

    It "installs missing modules" {
        Mock Get-Module { return $null } -ParameterFilter { $ListAvailable }
        Mock Install-Module {}
        Mock Write-Host {}

        Install-PSModule -Name "NewModule"

        Should -Invoke Install-Module -Times 1
    }
}
```

## Test Architecture

### Directory Structure

```
powershell/
├── profile.ps1          # PowerShell profile
└── lib/
    └── path-utils.ps1   # Extracted utility functions (testable)
test/
├── *.bats               # Bats shell tests
└── *.tests.ps1          # Pester PowerShell tests
docs/
└── PESTER-TESTING.md    # This file
```

### Extracting Functions for Testing

Functions in `install.ps1` run when the script is sourced (main execution starts at line 634+). To test them:

1. Extract the function to `powershell/lib/<name>.ps1`
2. Update `install.ps1` to source: `. "$PSScriptRoot/powershell/lib/<name>.ps1"`
3. Create tests in `test/<name>.tests.ps1`

Example extraction:
```powershell
# Before (in install.ps1)
function Install-WingetPackage { ... }

# After
# powershell/lib/package-utils.ps1
function Install-WingetPackage { ... }

# install.ps1
. "$PSScriptRoot/powershell/lib/package-utils.ps1"
```

## Pester Best Practices

### Use BeforeAll for Setup

```powershell
BeforeAll {
    . "$PSScriptRoot/../powershell/lib/path-utils.ps1"
}
```

### Use $TestDrive for File Tests

```powershell
Describe "File operations" {
    BeforeAll {
        $script:testFile = Join-Path $TestDrive "test.txt"
    }

    It "reads file correctly" {
        "content" | Set-Content $script:testFile
        Get-ContentLF $script:testFile | Should -Be "content"
    }
}
```

### Skip Tests Conditionally

```powershell
It "requires Git to be installed" -Skip:(-not (Test-Path "$env:ProgramFiles\Git")) {
    Get-GitBash | Should -Not -BeNullOrEmpty
}
```

### Mock External Commands

```powershell
Mock winget { return "mock output" }
Mock wsl { throw "not installed" }
```

## Pester Compatibility

Tests are written to be compatible with both Pester 3.x (Windows PowerShell 5.1) and Pester 5.x (PowerShell 7+).

**Key differences handled:**
- Use `Should Be` instead of `Should -Be` (works in both)
- Use `Should BeNullOrEmpty` instead of `Should -BeNullOrEmpty`
- Avoid `BeforeAll` block (source functions at top of file)
- Use `$env:TEMP` instead of `$TestDrive` for temporary files

Verify Pester version:
```powershell
Get-Module Pester -ListAvailable
```

To install/update Pester 5.x (optional):
```powershell
Install-Module Pester -Force -SkipPublisherCheck
```

## CI Integration

The Makefile includes a `test-powershell` target for running Pester tests. To add to CI:

```yaml
# .github/workflows/test.yml
- name: Run Pester tests
  if: runner.os == 'Windows'
  run: make test-powershell
```
