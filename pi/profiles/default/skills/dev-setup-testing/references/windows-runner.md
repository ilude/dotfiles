# Windows test runner practice

Read this for a concrete first-run setup, source staging or prerequisite failures.
Use network-iac's current runbook for VM operations and ownership checks.

## Prepare the baseline and payload

- Verify the current guest profile and command presence before installing anything.
  A clean start should not already have the clients or the prerequisites whose
  bootstrap the case is intended to test. Check credential presence as booleans,
  not by printing credentials or environment values.
- Save the pre-authentication, pre-install baseline before uploading payloads or
  submitting probe jobs. Even a smoke job leaves files/job records in the profile.
  Record the owned instance and snapshot name in local run evidence, not as a
  permanent skill default. Leave failed test state intact while inspecting it.
- When testing a clean committed checkout, `git archive --format=zip` gives a
  payload without `.git`, ignored dependency trees or local credentials. Record
  the commit and archive SHA256. An archive of HEAD does not include uncommitted
  edits; stage the actual selected files when those are the subject of the test.
- Controller paths in `windows-sandbox` CLI arguments are inside the Linux runner's
  `/workspace` mount. A host `C:/Users/.../Temp/...` file is not automatically
  available there. Either place the intended durable payload under an ignored
  run-evidence directory in the controller checkout, or explicitly mount a system
  temporary file read-only into the runner. Upload only that payload, not the
  controller directory. Verify the guest archive hash before expanding it.

## Installation without AWS

`-All -SkipBedrock` is a useful noninteractive installation case while the dedicated
SSO test identity is unavailable. It does not test authentication or model access.
`-SkipBedrock` skips Bedrock configuration, not necessarily installation of the AWS
CLI prerequisite. It is not evidence that the installer made no network requests.

Expand the staged source ZIP in `C:/Users/Sandbox/work` and invoke its local
`setup-ai-dev.ps1` through the limited-token job runner. For example, after source
extraction, a wrapper's core call is:

```powershell
& 'C:/Users/Sandbox/work/dev-setup-source/setup-ai-dev.ps1' -All -SkipBedrock
$code = $LASTEXITCODE
# Save the exit status and requested non-secret observations in work/results.
if ($null -eq $code) { throw 'Installer returned no exit code' }
exit $code
```

Start with native PowerShell 5.1 when exercising the fresh Windows entry point.
Let the installer bootstrap PowerShell 7. Confirm both the handoff and the eventual
installer result; successful installation of PowerShell is not successful client
onboarding. Interactive SSO, `Read-Host` and UAC cases still need the real console
or supported input rather than an unattended job with no stdin. Normal installer
consent is part of an already-authorized installation: inspect the expected
package/publisher and handle its native dialog through the console. Do not disable
UAC, elevate the whole test runner or substitute SYSTEM. A password or OTP only
the user can supply is a genuine input dependency.

A running `consent` process in the Sandbox desktop session can leave the taskbar
shield flashing while the terminal still covers the desktop. A screenshot without
a visible dialog does not establish that no prompt exists. Bring that observed
shield/dialog forward, inspect it, then handle the intended installer. In the
first patched trial this exposed the verified Amazon Web Services MSI consent.

After installation, a process may retain an older PATH. Use a fresh user shell or
the installer's normal PATH refresh, and distinguish an installed executable on
disk from command resolution in that shell. Do not invent successful installs
from a path guess or declare a missing package solely from stale PATH.

## Interpret failures without hiding them

Keep complete job outputs locally; show meaningful stage/error lines rather than
WinGet progress bars and spinner output. Save identity/profile/token, source hash,
job UUID and final exit code alongside the raw logs. A result-query `ok:true`
means retrieval succeeded, not that the installer passed.

The first clean trial of commit `41a19e5` on 2026-11-14 UTC demonstrated:

- The real limited Sandbox profile ran the wrapper under PowerShell 5.1; the
  installer installed PowerShell 7 and handed off, without a preinstalled runtime.
  The confirmed version was 7.7.0 through the user's WindowsApps `pwsh.exe` alias,
  not `Program Files/PowerShell/7`. Discover the actual command before probing its
  version; a missing hardcoded Program Files path did not mean bootstrap failed.
- Unscoped prerequisite WinGet searches hit an `msstore` certificate error
  `0x8a15005e`, blocking AWS CLI and Git although the output identified matching
  packages in the community `winget` source. The PowerShell bootstrap already
  used an explicit `--source winget` request and succeeded.
- `Get-PnpmVersion` invoked the absent `pnpm` command before its installation
  branch. Under the normal bootstrap's stop-on-error policy this terminated
  setup; the final job returned exit code 1. No client/protection success followed.

These are dated observations, not assumptions that future revisions still fail.
Check current code and reproduce only as needed. An explicit-source read-only
`winget show --id Amazon.AWSCLI --exact --source winget --accept-source-agreements`
query succeeded with exit 0 in the same limited user context, distinguishing the
source selection failure from package absence.
Do not disable TLS checks, remove Store sources, preinstall pnpm or modify the
clean baseline just to turn a fresh-onboarding failure into a pass. Report an
installer defect separately from harness failure or missing user interaction;
within an authorized sandbox development/test task, fix established installer
issues and retest from the clean baseline without a new approval for every fix.
Keep evidence before resetting so a retry does not hide the original failure.

The first run's raw evidence is local/ignored under
`.data/windows-sandbox/installer-tests/41a19e5/` in the controller checkout. Read
its run/baseline records for the actual UUIDs and snapshot. It did not test AWS
SSO, key creation, model discovery, model invocation or all-client host loading.
