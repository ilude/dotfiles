# Bitwarden credential setup

Resolve the dotfiles checkout from this skill's location, not the task's working directory: the checkout is five parents above the `browserbase` directory. The authoritative locator is `modules/homelab-infra/settings.local.json`; its `bws` object contains `project_id` and `api_server`. These identify Bitwarden, not Browserbase. Follow the module's instructions before changing its configuration. Do not create a second locator or secret store in the Pi profile.

Use an existing provider environment key first. Otherwise retrieve exactly one nonempty record using the controller bootstrap credential `BITWARDEN_ACCESS_KEY`, capture BWS JSON internally, check exit codes, and restore prior BWS environment values. Scope the provider key to the operation and restore its prior environment value afterward. Firecrawl's bundled helper implements this lifecycle internally with `FIRECRAWL_API_KEY`; the Browserbase recipe below uses `BROWSERBASE_API_KEY`. Do not print secrets or persist them in files or shell configuration.

PowerShell example, with `$dotfiles` set to the resolved checkout path. Execute the desired `browse` commands in this same shell invocation, since later tool calls need not retain environment changes:

```powershell
$ErrorActionPreference = 'Stop'
$priorKey = $env:BROWSERBASE_API_KEY
try {
    if (-not $env:BROWSERBASE_API_KEY) {
        $locator = (Get-Content -Raw (Join-Path $dotfiles 'modules/homelab-infra/settings.local.json') | ConvertFrom-Json).bws
        if (-not $env:BITWARDEN_ACCESS_KEY) { throw 'Controller BITWARDEN_ACCESS_KEY is unavailable' }
        $priorToken = $env:BWS_ACCESS_TOKEN
        $priorServer = $env:BWS_SERVER_URL
        try {
            $env:BWS_ACCESS_TOKEN = $env:BITWARDEN_ACCESS_KEY
            $env:BWS_SERVER_URL = $locator.api_server -replace '/api/?$', ''
            $raw = bws secret list $locator.project_id --output json 2>$null
            if ($LASTEXITCODE -ne 0) { throw 'Bitwarden lookup failed' }
            $records = @(($raw | ConvertFrom-Json) | Where-Object key -eq 'BROWSERBASE_API_KEY')
            if ($records.Count -ne 1 -or -not $records[0].value) { throw 'Expected one nonempty BROWSERBASE_API_KEY record' }
            $env:BROWSERBASE_API_KEY = $records[0].value
        } finally {
            $env:BWS_ACCESS_TOKEN = $priorToken
            $env:BWS_SERVER_URL = $priorServer
            $raw = $null
            $records = $null
        }
    }
    browse cloud projects list
    if ($LASTEXITCODE -ne 0) { throw 'Browserbase access check failed' }
    # Run the task's browse commands here, checking their exit codes.
} finally {
    $env:BROWSERBASE_API_KEY = $priorKey
}
```

For Bash/Linux, use the same lifecycle with captured `bws` output and a JSON parser inside a subshell so environment changes do not survive the operation. Never echo records or interpolate a key into command text. If the locator, CLI, or bootstrap credential is missing, report the specific missing prerequisite without asking the user to paste tokens into chat.
