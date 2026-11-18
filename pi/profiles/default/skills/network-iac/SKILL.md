---
name: network-iac
description: Create and operate Windows test VMs through network-iac. Use to choose VM reuse, snapshot reset, linked or full clones, fresh Windows image preparation, and user-profile installer testing.
---

# network-iac Windows VMs

Read [Windows operations](references/windows-vms.md) for CLI setup, image preparation
and script testing. Read [spawning methods](references/spawning-methods.md) when
using linked clones, restoring snapshots or evaluating startup speed. Locate the
working network-iac checkout and read its `AGENTS.md` and
`docs/runbooks/windows-agent-sandbox.md`. The repository owns
inventory, credentials integration, CLI behavior and live-operation policy; this
skill is an operating guide, not another infrastructure controller.

For dev-setup onboarding and AWS-backed installer test/reset cycles, read
[dev-setup-testing](../dev-setup-testing/SKILL.md). It owns the test scenarios and
cloud-key cleanup; this skill owns the VM operations.

## Choose the method

- **Reuse the running VM** when a clean start is not required. Inspect it first;
  another create is not needed just to upload and execute a script.
- **Disk-snapshot rollback** for repeated clean tests on the same VM. Capture a
  known-clean baseline before tests; restore only when reset is requested. This
  avoids VM replacement but still requires Windows startup. Collect wanted
  results before discarding test state.
- **Linked clone of the sealed template** for a new disposable instance when its
  base can remain available. This avoids a full disk copy; keep the template and
  its backing storage intact while dependent clones exist.
- **Full clone** when the instance needs storage independence from the base, or
  when using the existing full-clone-only CLI. It consumes more copy work and
  storage but does not require reinstalling Windows.
- **Fresh ISO installation** when there is no suitable valid template or the
  operator requests a new baseline. Prepare and seal once, then clone it for
  tests. Do not reinstall Windows for every clean test.

These are method recommendations, not claims about implemented switches. At
skill creation, `create` full-clones and `reset` deletes/recreates a full clone.
Linked creation and disk rollback were tested through scoped Proxmox operations,
not added as CLI flags. Recheck current source/help before choosing an execution
path. Do not invent `--linked` or snapshot subcommands, silently change defaults,
or substitute broad Terraform apply. The spawning reference contains tested API paths.

## Operate and test

- Live API, SSH and secret access remain in the primary session under the repo's
  approval policy. Skill discovery does not authorize infrastructure changes.
  Reuse the operator's existing authorization; do not add bookkeeping approvals.
- Preserve the selected checkout's controller state and ownership receipts. Use
  returned instance/job UUIDs, not VMID alone. Unknown occupants are not disposable.
- Keep the documented one-active-sandbox, host, size and network scope. The stopped
  template and clone share an address; leave the template stopped. Catalog records
  document allocation, not DHCP/IPAM enforcement or a separate deployment gate.
- Transfer only intended payloads. Use the CLI's limited-token interactive Sandbox
  jobs for test scripts, never QEMU-agent/SYSTEM or an elevated SSH test process.
  Read final job state, exit code and both output streams before reporting success.
- Retain failures for inspection until explicit reset/delete. Cancellation stops
  the command tree, not completed installations or external installer services.
- Preserve the original evaluation deadline across clones and snapshots. Use normal
  UTC and activation; no rearm, time rollback or implicit fresh evaluation period.

## Performance judgment

Separate storage-operation time from Windows/user readiness. Linked clones and
snapshot rollback both avoid a full disk copy; Windows boot can dominate either.
A disk-only snapshot is not a RAM checkpoint. The reference retains the measured
single-trial scope and limits; do not present those timings as a startup guarantee.
