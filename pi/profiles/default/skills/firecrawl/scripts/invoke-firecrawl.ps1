[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [ValidatePattern('^/[a-zA-Z0-9/_-]+$')]
    [string]$ApiPath,
    [ValidateSet('GET', 'POST', 'DELETE')]
    [string]$Method = 'POST',
    [string]$Body = '{}'
)

$ErrorActionPreference = 'Stop'
$key = $env:FIRECRAWL_API_KEY
if (-not $key) {
    $root = (Get-Item $PSScriptRoot).Parent.Parent.Parent.Parent.Parent.Parent.FullName
    $locatorPath = Join-Path $root 'modules/homelab-infra/settings.local.json'
    $locator = (Get-Content -Raw $locatorPath | ConvertFrom-Json).bws
    if (-not $env:BITWARDEN_ACCESS_KEY) { throw 'Controller BITWARDEN_ACCESS_KEY is unavailable' }
    $priorToken = $env:BWS_ACCESS_TOKEN
    $priorServer = $env:BWS_SERVER_URL
    try {
        $env:BWS_ACCESS_TOKEN = $env:BITWARDEN_ACCESS_KEY
        $env:BWS_SERVER_URL = $locator.api_server -replace '/api/?$', ''
        $raw = bws secret list $locator.project_id --output json 2>$null
        if ($LASTEXITCODE -ne 0) { throw 'Bitwarden lookup failed' }
        $records = @(($raw | ConvertFrom-Json) | Where-Object key -eq 'FIRECRAWL_API_KEY')
        if ($records.Count -ne 1 -or -not $records[0].value) { throw 'Expected one nonempty FIRECRAWL_API_KEY record' }
        $key = $records[0].value
    } finally {
        $env:BWS_ACCESS_TOKEN = $priorToken
        $env:BWS_SERVER_URL = $priorServer
        $raw = $null
        $records = $null
    }
}
try {
    $request = @{
        Uri = "https://api.firecrawl.dev/v2$ApiPath"
        Method = $Method
        Headers = @{ Authorization = "Bearer $key" }
        TimeoutSec = 120
    }
    if ($Method -eq 'POST') {
        $null = $Body | ConvertFrom-Json
        $request.ContentType = 'application/json'
        $request.Body = $Body
    }
    Invoke-RestMethod @request | ConvertTo-Json -Depth 100
} finally {
    $key = $null
    $request = $null
}
