$ErrorActionPreference = 'Stop'
$log = Join-Path $env:TEMP 'herdr-new-instance.log'

try {
    "$(Get-Date -Format o) invoked workspace=$env:HERDR_ACTIVE_WORKSPACE_ID pane=$env:HERDR_ACTIVE_PANE_ID cwd=$env:HERDR_ACTIVE_PANE_CWD" | Set-Content -LiteralPath $log

    foreach ($name in 'HERDR_BIN_PATH', 'HERDR_ACTIVE_WORKSPACE_ID', 'HERDR_ACTIVE_PANE_CWD') {
        if (-not [Environment]::GetEnvironmentVariable($name)) {
            throw "$name is required"
        }
    }

    $raw = & $env:HERDR_BIN_PATH plugin pane open `
        --plugin local.pi `
        --entrypoint pi `
        --placement tab `
        --workspace $env:HERDR_ACTIVE_WORKSPACE_ID `
        --cwd $env:HERDR_ACTIVE_PANE_CWD `
        --env "PI_HERDR_PROFILE_DIR=$env:USERPROFILE/.dotfiles/pi/profiles/default" `
        --no-focus 2>&1 | Out-String

    "$(Get-Date -Format o) plugin pane open returned" | Add-Content -LiteralPath $log
    $raw | Add-Content -LiteralPath $log
    if ($LASTEXITCODE -ne 0) {
        throw "Herdr exited $LASTEXITCODE"
    }

    $response = $raw | ConvertFrom-Json
    $tabId = $response.result.plugin_pane.pane.tab_id
    if (-not $tabId) {
        throw 'Herdr did not return the new tab ID'
    }

    & $env:HERDR_BIN_PATH tab focus $tabId 2>&1 | Add-Content -LiteralPath $log
    "$(Get-Date -Format o) tab focus returned" | Add-Content -LiteralPath $log
    if ($LASTEXITCODE -ne 0) {
        throw "Herdr tab focus exited $LASTEXITCODE"
    }
} catch {
    $_ | Out-String | Add-Content -LiteralPath $log
    exit 1
}
