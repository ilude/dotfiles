# No recording, elevation or real T3 thread is started by these tests.
# Run: pwsh -NoProfile -Command "Invoke-Pester test/capture-defender-spike.tests.ps1 -EnableExit"
$scriptPath = Join-Path $PSScriptRoot '../scripts/capture-defender-spike.ps1'
$tokens = $null
$parseErrors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile($scriptPath, [ref]$tokens, [ref]$parseErrors)
if ($parseErrors) { throw ($parseErrors | Out-String) }
$functionAst = $ast.Find({ param($node)
    $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Start-DefenderSpikeReview'
}, $false)
# Preserve the source path so the function resolves the real dotfiles project.
Set-Item Function:Start-DefenderSpikeReview -Value $functionAst.Body.GetScriptBlock()
function Invoke-CaptureT3Probe {}

Describe 'Defender capture T3 review' {
    BeforeEach {
        $script:calls = @()
        $script:captureDirectory = Join-Path $TestDrive "capture with spaces $([guid]::NewGuid().ToString('N'))"
        New-Item -ItemType Directory -Path $script:captureDirectory -Force | Out-Null
        Set-Content -LiteralPath (Join-Path $script:captureDirectory 'status.txt') -Value 'Failed'
        Mock Test-Path { $false } -ParameterFilter { $LiteralPath -like '*t3.cmd' }
        Mock Get-Command { [pscustomobject]@{ Source = 'Invoke-CaptureT3Probe' } } -ParameterFilter { $Name -eq 't3' }
        Mock Invoke-CaptureT3Probe {
            $script:calls += ,@($args)
            $global:LASTEXITCODE = 0
            if ($args[1] -eq 'start') {
                '{"threadId":"test-thread","projectId":"test-project","runId":"test-run"}'
            } else {
                '{"thread":{"link":"https://example.invalid/test-thread"}}'
            }
        }
    }

    It 'starts one asynchronous review and saves the server-returned link for a partial capture' {
        Start-DefenderSpikeReview -OutputDirectory $script:captureDirectory
        $script:calls.Count | Should Be 2
        $script:calls[0][0] | Should Be 'thread'
        $script:calls[0][1] | Should Be 'start'
        $script:calls[0][2] | Should Be (Split-Path (Split-Path $scriptPath -Parent) -Parent)
        ($script:calls[0] -contains '--wait') | Should Be $false
        $script:calls[1][2] | Should Be 'test-thread'
        $saved = Get-Content -LiteralPath (Join-Path $script:captureDirectory 't3-review.json') -Raw | ConvertFrom-Json
        $saved.threadId | Should Be 'test-thread'
        $saved.link | Should Be 'https://example.invalid/test-thread'
        Get-Content -LiteralPath (Join-Path $script:captureDirectory 'status.txt') | Should Be 'Failed'
    }

    It 'surfaces an unavailable T3 command without changing capture files' {
        Mock Get-Command { throw 'T3 unavailable' } -ParameterFilter { $Name -eq 't3' }
        { Start-DefenderSpikeReview -OutputDirectory $script:captureDirectory } | Should Throw 'T3 unavailable'
        Assert-MockCalled Invoke-CaptureT3Probe -Scope It -Times 0 -Exactly
        Get-Content -LiteralPath (Join-Path $script:captureDirectory 'status.txt') | Should Be 'Failed'
    }

    It 'does not treat a nonzero thread-launch exit as success' {
        Mock Invoke-CaptureT3Probe { $global:LASTEXITCODE = 7 }
        { Start-DefenderSpikeReview -OutputDirectory $script:captureDirectory } | Should Throw 'exit 7'
        Test-Path -LiteralPath (Join-Path $script:captureDirectory 't3-review.json') | Should Be $false
    }

    It 'waits for its recorder before starting the normal-user review' {
        Mock Start-Process {
            $script:launchArguments = $ArgumentList
            $script:captureChild = [pscustomobject]@{ Id = 12345; Waited = $false; Directory = $script:captureDirectory }
            $script:captureChild | Add-Member -MemberType ScriptMethod -Name WaitForExit -Value {
                $this.Waited = $true
                Set-Content -LiteralPath (Join-Path $this.Directory 'status.txt') -Value 'Complete'
            }
            $script:captureChild
        }
        & { . $scriptPath -OutputDirectory $script:captureDirectory -OpenResults -ReviewInT3 }
        $script:captureChild.Waited | Should Be $true
        ($script:launchArguments -contains '-NoExit') | Should Be $false
        $command = [Text.Encoding]::Unicode.GetString([Convert]::FromBase64String($script:launchArguments[-1]))
        $command | Should Match '-OpenResults'
        $command | Should Not Match '-ReviewInT3'
        Assert-MockCalled Start-Process -Scope It -Times 1 -Exactly -ParameterFilter { $Verb -eq 'RunAs' }
        $saved = Get-Content -LiteralPath (Join-Path $script:captureDirectory 't3-review.json') -Raw | ConvertFrom-Json
        $saved.link | Should Be 'https://example.invalid/test-thread'
    }

    It 'retains the started thread identity when link lookup fails rather than starting another thread' {
        Mock Invoke-CaptureT3Probe {
            $script:calls += ,@($args)
            if ($args[1] -eq 'start') {
                $global:LASTEXITCODE = 0
                '{"threadId":"test-thread"}'
            } else { $global:LASTEXITCODE = 8 }
        }
        { Start-DefenderSpikeReview -OutputDirectory $script:captureDirectory } | Should Throw 'started, but its link'
        $script:calls.Count | Should Be 2
        $saved = Get-Content -LiteralPath (Join-Path $script:captureDirectory 't3-review.json') -Raw | ConvertFrom-Json
        $saved.threadId | Should Be 'test-thread'
    }
}
