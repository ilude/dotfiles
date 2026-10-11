# Safe Windows installer tests. No package manager or UAC operation is executed.
# Run: pwsh -NoProfile -Command "Invoke-Pester test/install-maintenance.tests.ps1 -EnableExit"
. "$PSScriptRoot/../powershell/lib/install-maintenance.ps1"
$updatePathImplementation = (Get-Command Update-InstallPath).ScriptBlock

$installerPath = Join-Path $PSScriptRoot '..\install.ps1'
$parseErrors = $null
$tokens = $null
$installerAst = [System.Management.Automation.Language.Parser]::ParseFile($installerPath, [ref]$tokens, [ref]$parseErrors)
if ($parseErrors) { throw ($parseErrors | Out-String) }
# Load only function declarations, never the installer entrypoint.
$installerAst.FindAll({ param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] }, $false) |
    ForEach-Object { . ([scriptblock]::Create($_.Extent.Text)) }

Describe 'Native installer results' {
    BeforeEach { Initialize-InstallResults }

    It 'returns only a boolean and retains a real nonzero native exit' {
        $result = @(Invoke-InstallCommand -Name probe -FilePath (Join-Path $PSHOME 'pwsh.exe') -ArgumentList @(
            '-NoProfile', '-Command', 'Write-Output diagnostic; exit 7'
        ))
        $result.Count | Should Be 1
        $result[0] | Should Be $false
        $script:installResults[0].Status | Should Be Failed
        $script:installResults[0].Detail | Should Match 'exit 7'
        Get-InstallExitCode | Should Be 1
    }

    It 'does not treat successful stderr output as a failed install' {
        $result = Invoke-InstallCommand -Name probe -FilePath (Join-Path $PSHOME 'pwsh.exe') -ArgumentList @(
            '-NoProfile', '-Command', '[Console]::Error.WriteLine("diagnostic"); exit 0'
        )
        $result | Should Be $true
        Get-InstallExitCode | Should Be 0
    }

    It 'records a missing executable as failure rather than success' {
        Invoke-InstallCommand -Name missing -FilePath 'dotfiles-nonexistent-command' | Should Be $false
        Get-InstallExitCode | Should Be 1
    }

    It 'accepts the documented no-upgrades exit without hiding other failures' {
        function NoUpdates { Set-Variable LASTEXITCODE -Value -1978335189 -Scope 1 }
        Invoke-InstallCommand -Name upgrades -FilePath NoUpdates -CurrentExitCodes @(-1978335189) | Should Be $true
        $script:installResults[0].Status | Should Be Current
        Get-InstallExitCode | Should Be 0
        Add-InstallResult another Failed 'failure'
        Get-InstallExitCode | Should Be 1
    }

    It 'reports reboot requirements and lets failure take precedence' {
        function Reboot { Set-Variable LASTEXITCODE -Value 3010 -Scope 1 }
        Invoke-InstallCommand -Name upgrades -FilePath Reboot -RebootExitCodes @(3010) | Should Be $true
        Get-InstallExitCode | Should Be 3010
        Add-InstallResult another Failed 'failure'
        Get-InstallExitCode | Should Be 1
    }
}

Describe 'WinGet and MSYS2 maintenance' {
    BeforeEach {
        Initialize-InstallResults
        $script:calls = @()
        Mock Invoke-InstallCommand {
            $script:calls += [pscustomobject]@{ Name = $Name; File = $FilePath; Arguments = $ArgumentList }
            return $true
        }
        Mock Update-InstallPath {}
    }

    It 'upgrades all including unknown versions without overriding pins' {
        Update-InstallWingetPackages
        $script:calls.Count | Should Be 1
        $args = $script:calls[0].Arguments
        ($args -contains '--all') | Should Be $true
        ($args -contains '--include-unknown') | Should Be $true
        ($args -contains '--include-pinned') | Should Be $false
        ($args -contains '--force') | Should Be $false
        Assert-MockCalled Update-InstallPath -Scope It -Times 1 -Exactly
    }

    It 'excludes the MSYS2 bootstrap before global upgrades without replacing existing pins' {
        Update-InstallWingetPackages -Msys2Root 'C:\msys64'
        $script:calls.Count | Should Be 2
        ($script:calls[0].Arguments -join ' ') | Should Match 'pin add.*MSYS2.MSYS2.*--blocking'
        ($script:calls[0].Arguments -contains '--force') | Should Be $false
        $script:calls[1].Name | Should Be 'WinGet upgrades'
    }

    It 'does not risk a bootstrap reinstall when pinning fails' {
        Mock Invoke-InstallCommand { return $false }
        Update-InstallWingetPackages -Msys2Root 'C:\msys64'
        Assert-MockCalled Invoke-InstallCommand -Scope It -Times 1 -Exactly
        $script:installResults[-1].Status | Should Be Skipped
    }

    It 'removes only the existing MSYS2 bootstrap resource from the actual core YAML' {
        $yaml = Get-Content (Join-Path $PSScriptRoot '..\winget\configuration\core.dsc.yaml') -Raw
        $filtered = Remove-Msys2BootstrapResource $yaml
        $filtered | Should Not Match 'id: MSYS2.MSYS2'
        $filtered | Should Match 'id: Git.Git'
        $filtered | Should Match 'id: Rclone.Rclone'
        $filtered | Should Match 'configurationVersion: 0.2.0'
        (([regex]::Matches($yaml, '    - resource:')).Count - ([regex]::Matches($filtered, '    - resource:')).Count) | Should Be 1
    }

    It 'uses a temporary filtered configuration and removes it after apply' {
        Mock Get-InstallMsys2Root { 'C:\msys64' }
        $script:appliedPath = $null
        $script:appliedYaml = $null
        Mock Invoke-InstallCommand {
            $script:appliedPath = $ArgumentList[-1]
            $script:appliedYaml = Get-Content -LiteralPath $script:appliedPath -Raw
            return $true
        }
        Invoke-WingetConfigure -GroupName Core -ConfigFile (Join-Path $PSScriptRoot '..\winget\configuration\core.dsc.yaml')
        $script:appliedYaml | Should Not Match 'id: MSYS2.MSYS2'
        Test-Path $script:appliedPath | Should Be $false
    }

    It 'updates MSYS2 in separate shells with absolute pacman paths and restores its environment' {
        $originalSystem = $env:MSYSTEM
        $originalHome = $env:HOME
        Update-InstallMsys2Packages -Root 'C:\msys64'
        $script:calls.Count | Should Be 2
        $script:calls[0].Arguments[-1] | Should Be '/usr/bin/pacman -Syu --noconfirm'
        $script:calls[1].Arguments[-1] | Should Match '^/usr/bin/pacman -Syu.*&& /usr/bin/pacman -S --needed --noconfirm zsh$'
        $env:MSYSTEM | Should Be $originalSystem
        $env:HOME | Should Be $originalHome
    }

    It 'stops dependent MSYS2 steps after a failed core update' {
        Mock Invoke-InstallCommand { return $false }
        Update-InstallMsys2Packages -Root 'C:\msys64'
        Assert-MockCalled Invoke-InstallCommand -Scope It -Times 1 -Exactly
        $script:installResults[-1].Status | Should Be Skipped
    }

    It 'ensures all selected groups before upgrades and pacman maintenance' {
        $script:order = @()
        $wingetConfigDir = Join-Path $PSScriptRoot '..\winget\configuration'
        function winget { 'v1.6.0' }
        Mock Initialize-BunGlobalConfig {}
        Mock Install-PackageTooling { $script:order += 'tooling'; return $true }
        Mock Invoke-WingetConfigure { $script:order += $GroupName }
        Mock Get-InstallMsys2Root { 'C:\msys64' }
        Mock Update-InstallWingetPackages { $script:order += 'upgrades' }
        Mock Update-InstallMsys2Packages { $script:order += 'pacman' }
        Install-Packages -Work -Dev | Should Be $true
        ($script:order -join ',') | Should Be 'Core,Work,Developer,upgrades,pacman,tooling'
        Assert-MockCalled Initialize-BunGlobalConfig -Scope It -Times 1 -Exactly
        Assert-MockCalled Invoke-InstallCommand -Scope It -Times 1 -Exactly -ParameterFilter {
            $Name -eq 'WinGet sources'
        }
    }
}

Describe 'Managed tooling and entrypoint controls' {
    BeforeEach { Initialize-InstallResults }

    It 'updates uv managed tools while retaining the exact lizard pin and existing security options' {
        $script:uvCalls = @()
        Mock Invoke-InstallCommand { $script:uvCalls += ,$ArgumentList; return $true }
        Mock Update-InstallPath {}
        Update-InstallUvTools
        $script:uvCalls.Count | Should Be 3
        $script:uvCalls[1][-1] | Should Be 'lizard==1.21.3'
        foreach ($args in $script:uvCalls) {
            ($args -contains '--upgrade') | Should Be $true
            ($args -contains '--no-build') | Should Be $true
            ($args -contains '--no-sources') | Should Be $true
            ($args -contains '--exclude-newer') | Should Be $true
        }
    }

    It 'resolves current PowerShell module versions even when already installed' {
        Mock Install-Module {}
        Install-PSModule -Name PSFzf | Should Be $true
        Assert-MockCalled Install-Module -Scope It -Times 1 -Exactly -ParameterFilter {
            $Name -eq 'PSFzf' -and $Scope -eq 'CurrentUser' -and $Force
        }
    }

    It 'records PowerShell module failures' {
        Mock Install-Module { throw 'module download failed' }
        Install-PSModule -Name PSFzf | Should Be $false
        Get-InstallExitCode | Should Be 1
    }

    It 'skips package maintenance and Pi global updates when requested' {
        Mock Install-Packages { throw 'must not maintain packages' }
        Mock Configure-Rclone { throw 'must not configure package secrets' }
        Mock Update-InstallPath { throw 'must not refresh package PATH' }
        Mock Get-Command { throw 'must not resolve package commands' }
        Invoke-InstallerPackageUpdates -SkipPackages
        Invoke-InstallerPiUpdate -SkipPackages
        Assert-MockCalled Install-Packages -Scope It -Times 0 -Exactly
        $script:installResults.Count | Should Be 2
        $script:installResults[1].Status | Should Be Skipped
    }

    It 'always performs package maintenance on a normal run rather than consulting a lock timestamp' {
        Mock Install-Packages { return $false }
        Mock Update-InstallPath {}
        Mock Configure-Rclone {}
        Invoke-InstallerPackageUpdates -Work
        Assert-MockCalled Install-Packages -Scope It -Times 1 -Exactly -ParameterFilter { $Work -and -not $Dev }
        Assert-MockCalled Update-InstallPath -Scope It -Times 1 -Exactly
        Assert-MockCalled Configure-Rclone -Scope It -Times 1 -Exactly
    }

    It 'records a missing pnpm as a failed Pi update' {
        Mock Get-Command { $null }
        Invoke-InstallerPiUpdate
        $script:installResults.Count | Should Be 1
        $script:installResults[0].Status | Should Be Failed
        $script:installResults[0].Detail | Should Be 'pnpm not found'
    }

    It 'updates Pi and removes only exact obsolete direct dependency names' {
        $BASEDIR = Join-Path $PSScriptRoot '..'
        function pnpm {
            if ($args -contains 'add') {
                Set-Variable LASTEXITCODE -Value 0 -Scope 1
            } elseif ($args -contains '--json') {
                '[{"dependencies":{"@sinclair/typebox":{},"typebox":{},"@earendil-works/pi-ai":{}}}]'
            }
        }
        Mock Get-Command { [pscustomobject]@{ Name = 'pnpm' } } -ParameterFilter { $Name -eq 'pnpm' }
        Mock Get-Command { $null } -ParameterFilter { $Name -ne 'pnpm' }
        Mock Get-LatestAgentVersion { '1.2.3' }
        Mock Test-Path { $false }
        Mock Update-InstallPath {}
        Mock Invoke-InstallCommand { return $true }
        $previousCi = $env:CI
        $previousBuilds = $env:PNPM_CONFIG_DANGEROUSLY_ALLOW_ALL_BUILDS
        Invoke-InstallerPiUpdate
        $env:CI | Should Be $previousCi
        $env:PNPM_CONFIG_DANGEROUSLY_ALLOW_ALL_BUILDS | Should Be $previousBuilds
        $script:installResults[-1].Status | Should Be UpdatedOrCurrent
        Assert-MockCalled Invoke-InstallCommand -Scope It -Times 1 -Exactly -ParameterFilter {
            $Name -eq 'Remove obsolete Pi direct dependencies' -and
            ($ArgumentList -join ',') -eq 'remove,-g,@earendil-works/pi-ai,typebox'
        }
        Assert-MockCalled Update-InstallPath -Scope It -Times 1 -Exactly
    }

    It 'records Pi install failures without removing runtime dependencies' {
        function pnpm {
            if ($args -contains 'add') { Set-Variable LASTEXITCODE -Value 9 -Scope 1 }
            if ($args -contains '--json') { throw 'must not inspect cleanup after failure' }
        }
        Mock Get-Command { [pscustomobject]@{ Name = 'pnpm' } } -ParameterFilter { $Name -eq 'pnpm' }
        Mock Get-Command { $null } -ParameterFilter { $Name -ne 'pnpm' }
        Mock Get-LatestAgentVersion { '1.2.3' }
        Mock Invoke-InstallCommand { throw 'must not remove dependencies' }
        Mock Update-InstallPath { throw 'must not refresh failed install PATH' }
        Invoke-InstallerPiUpdate
        $script:installResults[-1].Status | Should Be Failed
        $script:installResults[-1].Detail | Should Be 'pnpm exited 9'
        Get-InstallExitCode | Should Be 1
    }

    It 'refreshes PATH with persistent additions while keeping process-only entries' {
        $oldPath = $env:PATH
        try {
            $env:PATH = 'C:\dotfiles-test-process-only;C:\dotfiles-test-process-only'
            & $updatePathImplementation
            $entries = $env:PATH -split ';'
            @($entries | Where-Object { $_ -eq 'C:\dotfiles-test-process-only' }).Count | Should Be 1
            foreach ($path in ([Environment]::GetEnvironmentVariable('PATH', 'User') -split ';' | Where-Object { $_ })) {
                ($entries -contains [Environment]::ExpandEnvironmentVariables($path)) | Should Be $true
            }
        } finally { $env:PATH = $oldPath }
    }

    It 'propagates the elevated child exit code without requesting actual elevation' {
        $node = $installerAst.Find({ param($n)
            $n -is [System.Management.Automation.Language.IfStatementAst] -and
            $n.Extent.Text -match '^if \(-not \$isAdmin -and -not \$NoElevate\)'
        }, $false)
        $fake = @'
function Start-Process {
    param($FilePath, $ArgumentList, $Verb, [switch]$Wait, [switch]$PassThru)
    if (-not $Wait -or -not $PassThru -or $Verb -ne 'RunAs') { throw 'bad elevation parameters' }
    [pscustomobject]@{ ExitCode = 17 }
}
$isAdmin = $false
$NoElevate = $false
'@
        $path = Join-Path $TestDrive 'elevation.ps1'
        [IO.File]::WriteAllText($path, $fake + "`n" + $node.Extent.Text)
        & (Join-Path $PSHOME 'pwsh.exe') -NoProfile -File $path | Out-Host
        $LASTEXITCODE | Should Be 17
    }
}
