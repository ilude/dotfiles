---
name: windows-performance
description: Investigate Windows resource spikes, Defender scanning, process churn and abandoned AI-tool subprocesses. Use for live captures, duplicate or suspended-process review, authorized cleanup and incident comparisons.
---

# Windows performance

This skill owns Windows resource-spike investigation: capture, process-churn
and abandoned-process diagnosis, authorized cleanup and incident-history lookup.
Other repository guidance should link here rather than maintain a parallel
procedure. Use it on demand,
not as continuous monitoring. Explain plainly which program was busy, what it
was doing, what is proven and what remains unknown.

## Capture while the spike is happening

The repository-owned script is
[capture-defender-spike.ps1](../../../../../scripts/capture-defender-spike.ps1).
Resolve that link from this skill directory, not from the affected repository.
Run it with the PowerShell tool using its absolute path:

```powershell
pwsh -NoProfile -File <dotfiles>/scripts/capture-defender-spike.ps1
```

The user approves UAC and reproduces the spike for about 60 seconds. A
non-elevated invocation launches its own elevated window and returns the PID and
results path; an already elevated invocation records directly.

- `-DurationSeconds 30` selects a shorter capture, rounded up to a five-second
  sample interval. Defaults are a unique `%TEMP%\defender-spike-*` folder;
  `-OutputDirectory <empty-folder>` chooses another location without overwriting
  an earlier capture.
- `-OpenResults` opens the results folder when finished. The local **Capture
  Defender Spike** desktop shortcut uses this option and points at this checkout.
  It is not automatically installed or guaranteed on every workstation; recreate
  it if the checkout moves.

A launch message/PID is not a completed capture. Preserve the printed results
path and use `status.txt` to distinguish Recording, Analyzing, Complete or Failed.
Elevation can still be awaiting the user's approval when a shell call times out;
check for the pending launch before starting another. Follow the normal
scheduling rules for recording/analysis waits rather than sleeping or polling.

The script uses the Windows Defender profile through Windows Performance
Recorder and `Get-MpPerformanceReport`, stopping only its own named recording.
Do not change Defender exclusions/protection, stop unrelated processes, or add
automatic monitoring as an incidental diagnostic step.

## Read the evidence

Start with `report.txt`, then inspect only the data needed for the question:

- `process-samples.csv` and `system-samples.csv`: when CPU rose, which PIDs were
  busy, process read/write I/O and free memory. Process CPU is already normalized
  across logical processors. I/O is not exclusively physical disk activity.
- `processes.json`: initial executable paths and parent PIDs. Match creation
  times before treating a historical/reused parent PID as an ownership chain.
- `defender-report.json` and `defender.etl`: scan-triggering processes and files.
  Scan durations are elapsed time, not CPU shares; overlapping/waiting scans and
  warmed caches limit before/after comparisons. CPU activity alone does not
  establish which files were scanned.
- `capture.log`, `counter-errors.txt` and `error.txt`, when present: missing or
  invalid samples and recording failures. Process churn can invalidate individual
  counters without invalidating the entire recording. A missing PID/sample is
  not proof of inactivity. Short-lived processes can escape the snapshots.

`MsMpEng` is Defender Antivirus. `MsSense` is a separate endpoint sensor: the
CPU samples include it, but the antivirus trace does not explain all its work.
Follow the hot process into its actual workload/repository before proposing a
fix. Keep confirmed causes separate from plausible explanations and preserve
concurrent work.

## Diagnose process churn

When agent work coincides with high LSM, CryptSvc, Git LFS, MSYS-helper or
console-host CPU, run
[diagnose-windows-process-churn.ps1](../../../../../scripts/diagnose-windows-process-churn.ps1)
with `pwsh -File` using its resolved absolute path before guessing. It samples
service/process activity, handles, helper processes and recent system events.

Correlate System log `Tcpip` event ID `4227` with recent subprocess-heavy work.
Prefer addressing evidenced process churn through caching, timeouts and cleanup
of owned child processes over repeated retries. If the diagnostic stalls or is
partial, report that limitation rather than treating missing results as healthy.
This is a separate diagnostic, not an established explanation for every Defender
spike.

## Review duplicate and abandoned processes

When investigating process buildup or suspected AI-tool leftovers, review all
repeated executable names, including Node, shells and console hosts, not just
Git or BWS. Multiple instances, low CPU or a missing parent alone do not prove
abandonment. Browser/Electron workers, agents, services and detached applications
can legitimately outlive launchers.

- Use `Get-CimInstance Win32_Process` and `Get-Process` to correlate PID, creation
  time, executable/script, session, parent chain, descendants, thread states and
  resource use. Check service ownership or network activity when needed to
  resolve an uncertain case. Validate creation times against PID reuse.
- Distinguish exited processes retained by handles from live suspended orphans
  and idle workers. A single suspended thread, zero recorded CPU, an exited
  parent and no active dependents together suggest an abandoned launch; do not
  infer the responsible launcher or Defender involvement from that pattern alone.
  Missing paths or access-denied data are investigation limits, not proof.
- Preserve useful evidence before cleanup, especially launch timing and any
  surviving owner chain. Keep command lines and credentials out of shared notes.
- Within authorized cleanup, terminate confirmed abandoned processes by exact
  identity after rechecking creation time, state and dependencies. Never kill by
  executable name or resume stale commands. Preserve active owners and uncertain
  cases, and report what remains unresolved.
- Verify the identified processes actually disappeared and whether their console
  hosts exited with them. New same-name processes from live owners are not failed
  cleanup. Report failed termination rather than claiming success.

## Find and prevent recurring leftovers

On later comparable incidents, retrieve earlier findings and compare launch
paths, tool/runtime versions, creation times and timeout, cancellation or shutdown
behavior. Correlate available agent/tool logs and process-creation evidence; use
a bounded reproduction when needed, rather than installing continuous monitoring.
AI-tool activity near a creation time is a lead, not established causality.

Follow confirmed failures into the owning launcher or subprocess implementation.
Within the authorized code scope, fix evidenced suspended-start, cancellation,
timeout or child-cleanup defects and exercise the affected launch and exit path.
Check whether new abandoned children remain; removing old ones alone does not
validate prevention. Discuss changes outside that scope or changes to workflow
with the user. Carry unresolved hypotheses forward in the incident record and
revise them as evidence improves, rather than repeating cleanup as the remedy.

## Track incidents for later comparisons

After a substantive spike or process-buildup investigation, use
`onclave_improvement` to search `note` records for **Windows CPU spike** or
**Windows process buildup**, plus relevant machine, process or workload terms.
Retrieve matching records before comparing episodes or updating one. Do not
delay capturing a transient spike to search history first.

The initial **Windows CPU spike: 2026-11-13, dev-wks-mglenn** incident is record
`85009ffdf50e88c4205d866b1811f993772b7b95d7119eb71c07790a8ee924f8`.
Retrieve its current version for the original recordings, findings, fixes,
other-repository proposals and validation gaps. Keep that changing history in
the record rather than copying it into this skill or the research vault.

Create one concise `note` per distinct incident, or revision-safely update its
existing record as findings develop. Include:

- A **Windows CPU spike** or **Windows process buildup** heading, date/time with
  time zone, machine and workload.
- Capture folder and relevant source/record references. `%TEMP%` artifacts can be
  cleaned up, so summarize the useful evidence rather than relying on paths alone.
- Observed hot processes and files, confirmed cause versus hypotheses, and any
  partial-data, cache or attribution limits.
- Cleanup counts and process identities, known owner/launcher evidence, preserved
  uncertain cases, and recurrence or reproduction evidence when applicable.
- Changes actually made, separately from proposals, and the validation performed.
  Separate successful cleanup from a verified prevention fix; keep
  blocked/cancelled checks and unresolved issues explicit.
- Related incident IDs when useful; do not call an issue recurring based only on
  repeated samples from one episode.

Keep raw traces, full command lines, credentials and private file contents local;
store only the sanitized incident summary centrally. Follow
[centralized storage](../agent-process/SKILL.md#centralized-storage) for discovery,
revision-safe updates and unavailable-service handling. If saving fails, report
that the note was not saved; do not create a second local incident database or
Git-tracked history. This skill does not install telemetry or change retention.

## Deferred continuous monitoring

If needed later, consider lightweight rolling CPU/I/O history for `MsMpEng` and
`MsSense` to establish when spikes occur between captures. That history would
not identify scanned files; protected-process CPU requires performance counters
rather than ordinary process CPU queries.

Do not run detailed recordings continuously. Automatic capture after sustained
high CPU remains a separate future choice, with administrator access and storage
behavior to decide before implementation.
