function Write-Usage {
  Write-Error 'usage: pp [-p|--profile <name>] [--dc-recovery] [--resume|--session <path-or-id>] [--] [pi arguments...]'
  exit 2
}

# Resolve the external command before profile functions can redirect bare pi
# back through this launcher.
$piExecutable = Get-Command pi -CommandType Application, ExternalScript -ErrorAction SilentlyContinue |
  Select-Object -First 1
if (-not $piExecutable) {
  Write-Error 'pp: pi executable is unavailable'
  exit 1
}
$piExecutablePath = $piExecutable.Source

function Remove-UnsafeArguments {
  param(
    [string[]] $Arguments,
    [bool] $RemoveToolSelection
  )

  $result = [System.Collections.Generic.List[string]]::new()
  for ($index = 0; $index -lt $Arguments.Count; $index++) {
    $argument = $Arguments[$index]
    if ($argument -eq '--') {
      for (; $index -lt $Arguments.Count; $index++) {
        $result.Add($Arguments[$index])
      }
      break
    }
    if (($argument -in '-e', '--extension') -or ($RemoveToolSelection -and ($argument -in '-t', '--tools'))) {
      if ($index + 1 -ge $Arguments.Count) {
        Write-Usage
      }
      $index++
      continue
    }
    if ($argument -like '--extension=*' -or ($RemoveToolSelection -and $argument -like '--tools=*')) {
      continue
    }
    $result.Add($argument)
  }
  return $result.ToArray()
}

function Test-DamageControlJavaScript {
  param([string] $Preflight, [string] $Target)

  $nodeCommand = Get-Command node -ErrorAction SilentlyContinue
  if (-not $nodeCommand) {
    Write-Error 'pp: damage-control preflight failed: node is unavailable'
    return $false
  }
  & $nodeCommand.Source $Preflight $Target
  return $LASTEXITCODE -eq 0
}

$profileName = 'default'
$resumeSession = $null
$dcRecovery = $false
$piArguments = [System.Collections.Generic.List[string]]::new()

for ($index = 0; $index -lt $args.Count; $index++) {
  $argument = $args[$index]

  if ($argument -eq '-p' -or $argument -eq '--profile') {
    if ($index + 1 -ge $args.Count) {
      Write-Usage
    }
    $index++
    $profileName = $args[$index]
    continue
  }
  if ($argument -like '--profile=*') {
    $profileName = $argument.Substring('--profile='.Length)
    continue
  }
  if ($argument -eq '--dc-recovery') {
    $dcRecovery = $true
    continue
  }
  if ($argument -eq '--resume' -or $argument -eq '--session') {
    if ($index + 1 -ge $args.Count) {
      Write-Usage
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
if ($dcRecovery -and $profileName -ne 'default') {
  Write-Error 'pp: --dc-recovery is available only for the default profile'
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

if ($profileName -eq 'default') {
  $preflight = Join-Path $PSScriptRoot 'pi-damage-control-preflight.mjs'
  $bootstrap = Join-Path $profileDirectory 'extensions\damage-control\index.js'
  $recoveryHelper = Join-Path $PSScriptRoot 'pi-damage-control-recovery.js'

  if ($dcRecovery) {
    if (Test-DamageControlJavaScript $preflight $recoveryHelper) {
      [string[]] $recoveryArguments = @(Remove-UnsafeArguments $piArguments.ToArray() $false)
      & $piExecutablePath --no-extensions --extension $recoveryHelper @recoveryArguments
      exit $LASTEXITCODE
    }
    Write-Error 'pp: recovery helper is unavailable; starting tools-disabled, extensions-disabled repair mode'
  } elseif (Test-DamageControlJavaScript $preflight $bootstrap) {
    & $piExecutablePath @piArguments
    exit $LASTEXITCODE
  } else {
    Write-Error 'pp: default damage-control bootstrap is unavailable; starting tools-disabled, extensions-disabled repair mode'
    Write-Error 'pp: repair the default profile, exit Pi, then relaunch pp normally; recovery is never selected automatically'
  }

  [string[]] $repairArguments = @(Remove-UnsafeArguments $piArguments.ToArray() $true)
  & $piExecutablePath --no-tools --no-extensions @repairArguments
  exit $LASTEXITCODE
}

& $piExecutablePath @piArguments
exit $LASTEXITCODE
