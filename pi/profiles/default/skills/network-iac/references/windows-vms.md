# Windows sandbox operations

## Locate the implementation and state

Known local checkout candidates are `C:/Projects/Work/Github/network-iac` and
`C:/Projects/Work/Github/network-iac-windows-sandbox`. Select the checkout that
actually contains `scripts/windows_sandbox.py`, the Windows runbook, and the
matching ignored `.data/windows-sandbox/` state. At skill creation the feature
lived in the second checkout and was not committed or merged. Do not assume it
is available in main, move it between checkouts, or publish it without authorization.

Read current repo instructions and the runbook rather than treating this reference
as live inventory. The documented boundary is r740pve, sandbox VM20500, stopped
template VM20501, 4 vCPU, 8 GiB RAM and 100 GiB OS disk on `primary`. The approved
static address is `10.0.43.58` on existing VLAN43. The CLI handles one sandbox,
not a general VM fleet. New hosts, slots or networks are separate scope choices.

Use Docker and Just from the selected repository root. On Windows these Bash
recipes require Git Bash, not a `bash.exe` resolving to WSL. If reusing the original
checkout's bootstrap file, set its path without copying its contents:

```bash
cd /c/Projects/Work/Github/network-iac-windows-sandbox
export SANDBOX_ENV_FILE=C:/Projects/Work/Github/network-iac/.env
just windows-sandbox list
just windows-sandbox --help
```

Follow the repo's operator setup and `just build` when its runner is not available.
Infisical supplies Proxmox credentials at runtime. `.data/windows-sandbox/` holds
private controller credentials and ownership/task receipts; keep it local and
ignored. Do not create a second controller identity to get past an occupied slot.

## Normal CLI workflow

1. Inspect `list` and the image's status. Reuse an appropriate existing instance.
2. If the approved slot is empty and the template is ready, create and save
   `result.instance_id`. Do not prepare another image just because the slot is empty.
3. Advance pending operations with `resume` and follow returned phases/task IDs.
   For genuine external waits, schedule follow-up checks instead of long shell sleeps.
4. Run test jobs, collect final results and download required evidence.
5. Reset/delete only when requested, preserving wanted results first.

```bash
just windows-sandbox image status
just windows-sandbox create
# Set ID to result.instance_id, not the Proxmox VMID.
just windows-sandbox status "$ID"
just windows-sandbox resume "$ID"
just windows-sandbox console "$ID"

just windows-sandbox upload "$ID" ./installer-source C:/Users/Sandbox/work/source
just windows-sandbox exec "$ID" --script scripts/windows-sandbox/smoke.ps1 --timeout 300
# Set JOB to result.job_id.
just windows-sandbox result "$ID" "$JOB"
just windows-sandbox download "$ID" C:/Users/Sandbox/work/results .data/windows-sandbox/results
just windows-sandbox cancel "$ID" "$JOB"

just windows-sandbox reset "$ID"
just windows-sandbox resume "$ID"
# Current reset eventually returns a new instance UUID. Follow that UUID.
# Delete is a separate alternative, not the next step after every test:
just windows-sandbox delete "$ID"
just windows-sandbox resume "$ID"
```

Successful stdout is `{"schema_version":1,"ok":true,"result":...}`; Docker progress
is stderr. Do not merge streams when parsing. A successful result query does not
mean the job succeeded: inspect `state`, `exit_code`, stdout and stderr. Queued,
running and cancellation-requested responses are not completion. Inspect an
interrupted or uncertain operation instead of replaying a write or installer.

The guest uses native Windows PowerShell 5.1, SSH/SFTP management and a logged-on
local `Sandbox` profile (`C:/Users/Sandbox`). Submitted scripts run through
Interactive Task Scheduler with a limited token and working directory
`C:/Users/Sandbox/work`. WinRM was not configured. The QEMU agent is image-management
support, not the user-test execution channel. UAC prompts require operator console
interaction; they are not automatically approved.

Directory transfers include ignored files. Stage only the payload; never upload
`.env`, the controller checkout, private SSH keys or controller state. Job evidence
remains at `C:/Users/Sandbox/.network-iac/jobs/<job UUID>/` until reset/delete.

## Fresh image preparation

Only use this for an approved missing/replacement baseline, not routine tests.
Run initial address preflight before the managed image uses its selected address:

```bash
just windows-sandbox preflight
just windows-sandbox image prepare
just windows-sandbox image status
just windows-sandbox image resume
# At installed, seal and resume to ready:
just windows-sandbox image seal
just windows-sandbox image resume
```

Read the runbook's phase details and current media provenance first. Use official
Microsoft evaluation media and its published checksum. Leave the template stopped
before a clone uses its address. The clean baseline excludes Git, Node, pnpm,
PowerShell 7, AI clients, employee credentials, AWS credentials and model settings;
Windows, drivers, management support and native Winget are expected. No model call
or AI-client installation is required to accept the VM platform. The first image
needed console locale choices and targeted repairs; the corrected unattended
source was not rebuilt end to end. Do not promise a fully verified unattended
factory build. Template expiry requires explicit image maintenance, never rearm.

For scoped linked-clone/snapshot API operations and measured performance limits,
read [VM spawning methods](spawning-methods.md).
