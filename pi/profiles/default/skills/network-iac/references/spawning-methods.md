# VM spawning methods

Use this reference for linked creation, snapshot reset or performance decisions.
Read [Windows operations](windows-vms.md) for checkout, state and runner setup.

## Linked creation when the CLI still only full-clones

Use this path only for an authorized linked-clone operation in the approved slot;
it is not permission to modify CLI defaults. Run in the existing `iac-runner` and
reuse `scripts/windows_sandbox.py` rather than constructing another credential,
trust or ownership system.

- Follow `Sandbox.create`'s existing checks: empty slot, owned stopped template,
  unexpired original evaluation deadline and admitted address. Use the existing
  local lifecycle lock. An IP catalog entry is not an additional approval gate.
- Allocate a fresh UUID. Use the existing managed description/schema, deadline and
  `win-sandbox-<first 8 UUID characters>` name. Persist `clone-requested` before the
  write, then the returned task and `cloning` phase through `Sandbox.checkpoint`.
- The tested request is `POST /nodes/{node}/qemu/{template}/clone`, with `newid`,
  `name`, `description`, `target` and `full: 0`. Omit the full-clone `storage`
  override; a linked clone keeps its base storage. Confirm current storage/template
  support with `GET .../qemu/{template}/feature?feature=clone`.
- Continue with the existing `resume` path for resources, startup and authenticated
  guest-agent discovery of the SSH host key. Keep normal host-key pinning and
  matching controller receipts. Do not mistake successful disk creation for a
  usable Windows user session.
- Keep the base template available. Clone deletion is not permission to delete its
  parent or shared storage. Do not automatically fall back to another clone mode
  after an uncertain write.

## Snapshot reset when no snapshot command exists

A snapshot resets the same VM; it does not create another independent instance.
Use a known-clean baseline captured before installer tests. The historical timing
snapshot was temporary and was removed with its VM; its name is not a usable
baseline for future resets.

- Validate the current owned VM and inspect existing snapshots and baseline
  provenance. Confirm `GET .../qemu/{vmid}/feature?feature=snapshot`; all relevant
  disks, EFI and TPM state must be supported. Reuse the controller lifecycle lock.
- The tested baseline was created with Windows gracefully shut down:
  `POST .../qemu/{vmid}/snapshot` with `snapname`, `description` and `vmstate: 0`.
  Wait for the returned task to finish successfully. This is disk-only, not RAM.
- For an explicitly requested reset, collect wanted outputs, stop the owned VM,
  then `POST .../qemu/{vmid}/snapshot/{snapname}/rollback` with `start: 0`.
  Wait for completion, verify restored ownership/configuration, start the VM and
  restore consistent controller phase/task/SSH-identity records. Snapshot rollback
  can restore VM configuration as well as disks; do not bypass identity checks.
- Keep the selected workflow's instance identity consistent. Do not claim a new
  instance UUID merely because a snapshot was restored, or reuse old job results
  whose files were discarded. Re-establish readiness in the real user profile.
- Memory-inclusive snapshots were not benchmarked. They may avoid cold boot but
  restore running session/process state; do not treat them as equivalent to the
  tested clean disk-only baseline. Preserve real UTC and the original expiry.

## Timing evidence and interpretation

A single paired r740pve trial on 2026-11-14 UTC measured a disk-only rollback at
33.5 seconds to usable Windows, versus 40.6 seconds for a linked clone from an
empty slot, or 43.7 seconds including deletion of the old VM. Storage work alone
was 0.74 seconds for rollback and 1.93 seconds for cloning. Both started with the
old VM already stopped; shutdown was excluded. Readiness meant authenticated SSH,
a logged-on Sandbox desktop, Winget availability and active evaluation, not a new
limited-token job timing. Windows startup dominates; one pair does not establish
repeatable boot-latency differences. Full clones and RAM snapshots were not timed
in this comparison.

Use this as method-selection context, not a performance guarantee. The source
measurement is local/ignored at
`.data/windows-sandbox/benchmarks/snapshot-vs-linked.json`; consult current live
status for the active UUID and current repository source for implemented defaults.
