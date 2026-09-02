[CmdletBinding()]
param(
    [string]$EvidencePath,
    [switch]$LiveIsolated
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 3.0

function Assert-True {
    param(
        [bool]$Condition,
        [string]$Name
    )

    if (-not $Condition) {
        throw "Browser smoke invariant failed: $Name"
    }
    Write-Output "PASS: $Name"
}

function Invoke-Wrapper {
    param([string[]]$Arguments)

    $output = & python (Join-Path $PSScriptRoot 'agent-browser-brave') @Arguments 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "agent-browser-brave failed: $($output -join [Environment]::NewLine)"
    }
    return @($output)
}

function New-SyntheticEvidence {
    $common = [ordered]@{
        profileDirectoryLiveDisplayMatch = $true
        renderedAccountAliasMatch = $true
        targetCreatedStable = $true
        targetUrlMatch = $true
        query = 'synthetic-query'
        resultMode = 'all'
        personalizationIndicator = 'synthetic-stable'
        locale = 'en-US'
        region = 'US'
        comparisonGeneration = 4
        invalidationEvents = @()
    }
    return [pscustomobject]@{
        isolatedWithoutConfig = $true
        missingRealProfileGuidedSetup = $true
        first = [pscustomobject]($common + [ordered]@{
            extensionMode = 'enabled'
            commandLineExtensionMode = 'enabled'
            runtimeExtensionMode = 'enabled'
        })
        second = [pscustomobject]($common + [ordered]@{
            extensionMode = 'disabled'
            commandLineExtensionMode = 'disabled'
            runtimeExtensionMode = 'disabled'
        })
    }
}

function Read-Evidence {
    if (-not $EvidencePath) {
        Write-Information 'validating a synthetic, identity-free comparison transaction' -InformationAction Continue
        return New-SyntheticEvidence
    }
    $resolved = Resolve-Path -LiteralPath $EvidencePath
    return Get-Content -LiteralPath $resolved -Raw | ConvertFrom-Json
}

function Compare-Transaction {
    param($Evidence)

    Assert-True ([bool]$Evidence.isolatedWithoutConfig) 'isolated mode needs no local profile configuration'
    Assert-True ([bool]$Evidence.missingRealProfileGuidedSetup) 'missing real-profile configuration guides setup without guessing'

    foreach ($name in @('first', 'second')) {
        $leg = $Evidence.$name
        Assert-True ([bool]$leg.profileDirectoryLiveDisplayMatch) "$name profile directory matches live display metadata"
        Assert-True ([bool]$leg.renderedAccountAliasMatch) "$name rendered account alias matches at the redacted operator checkpoint"
        Assert-True ([bool]$leg.targetCreatedStable) "$name newly created raw target ID remains stable"
        Assert-True ([bool]$leg.targetUrlMatch) "$name target URL matches the requested sanitized URL"
        Assert-True ($leg.extensionMode -eq $leg.commandLineExtensionMode) "$name extension mode matches the surviving root command line"
        Assert-True ($leg.extensionMode -eq $leg.runtimeExtensionMode) "$name extension mode matches runtime extension targets"
        Assert-True (@($leg.invalidationEvents).Count -eq 0) "$name has no CAPTCHA, interstitial, or manual-continuation invalidation"
    }

    $stable = @(
        'profileDirectoryLiveDisplayMatch',
        'renderedAccountAliasMatch',
        'targetCreatedStable',
        'targetUrlMatch',
        'query',
        'resultMode',
        'personalizationIndicator',
        'locale',
        'region',
        'comparisonGeneration'
    )
    foreach ($field in $stable) {
        Assert-True ($Evidence.first.$field -eq $Evidence.second.$field) "comparison invariant unchanged: $field"
    }
    Assert-True ($Evidence.first.extensionMode -ne $Evidence.second.extensionMode) 'extension mode is the sole changed comparison invariant'
}

$ownedLiveSession = $false
try {
    if ($LiveIsolated) {
        $status = Invoke-Wrapper -Arguments @('--status')
        Assert-True (($status -join "`n") -match 'status: no owned session state') 'live smoke starts without an existing owned session'
        $opened = Invoke-Wrapper -Arguments @('--open', 'about:blank', '--extensions', 'disabled')
        $ownedLiveSession = $true
        $openedText = $opened -join "`n"
        Assert-True ($openedText -match '(?m)^sessionId:\s*[a-f0-9]+') 'live isolated session returns a generated session ID'
        Assert-True ($openedText -match '(?m)^targetId:\s*[A-Fa-f0-9-]+') 'live isolated open returns one raw CDP target ID'
        Assert-True ($openedText -match '(?m)^extensionMode:\s*disabled') 'live disabled mode is observable'
    }

    Compare-Transaction -Evidence (Read-Evidence)
    Write-Output 'PASS: sanitized browser comparison transaction accepted'
}
finally {
    if ($ownedLiveSession) {
        $closed = Invoke-Wrapper -Arguments @('--close-owned')
        Assert-True (($closed -join "`n") -match 'close-owned:\s*(stopped|already_absent)') 'live isolated session cleanup has a proven postcondition'
    }
}
