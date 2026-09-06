$profileName = 'default'
$resumeSession = $null
$piArguments = [System.Collections.Generic.List[string]]::new()

for ($index = 0; $index -lt $args.Count; $index++) {
  $argument = $args[$index]

  if ($argument -eq '-p' -or $argument -eq '--profile') {
    if ($index + 1 -ge $args.Count) {
      Write-Error 'usage: pp [-p|--profile <name>] [--] [pi arguments...]'
      exit 2
    }

    $index++
    $profileName = $args[$index]
    continue
  }

  if ($argument -like '--profile=*') {
    $profileName = $argument.Substring('--profile='.Length)
    continue
  }

  if ($argument -eq '--resume' -or $argument -eq '--session') {
    if ($index + 1 -ge $args.Count) {
      Write-Error 'usage: pp [-p|--profile <name>] [--resume|--session <path-or-id>] [--] [pi arguments...]'
      exit 2
    }

    $index++
    $resumeSession = $args[$index]
    continue
  }

  if ($argument -like '--resume=*') {
    $resumeSession = $argument.Substring('--resume='.Length)
    continue
  }

  if ($argument -like '--session=*') {
    $resumeSession = $argument.Substring('--session='.Length)
    continue
  }

  if ($argument -eq '--') {
    for ($index++; $index -lt $args.Count; $index++) {
      $piArguments.Add($args[$index])
    }
    break
  }

  $piArguments.Add($argument)
}

if ($profileName -notmatch '^[A-Za-z0-9][A-Za-z0-9._-]*$' -or $profileName -in '.', '..') {
  Write-Error "pp: invalid profile name: $profileName"
  exit 2
}

if ($profileName -in 'default', 'legacy') {
  $profileDirectory = Join-Path $PSScriptRoot "..\pi\profiles\$profileName"
  if (-not (Test-Path -LiteralPath $profileDirectory -PathType Container)) {
    Write-Error "pp: repository profile is not initialized: $profileName. Run scripts/migrate-pi-profiles.ps1 after closing Pi."
    exit 1
  }
} else {
  $profileDirectory = Join-Path $env:USERPROFILE ".pi\profiles\$profileName"
  New-Item -ItemType Directory -Path $profileDirectory -Force | Out-Null
}
$env:PI_CODING_AGENT_DIR = (Resolve-Path $profileDirectory).Path

if ($resumeSession) {
  $piArguments.Insert(0, $resumeSession)
  $piArguments.Insert(0, '--session')
}

& pi @piArguments
exit $LASTEXITCODE
