---
status: exploratory
created: 2026-11-05
updated: 2026-11-05
source_session: 01a1ac73-995d-7744-bf9a-a41b5b344072
---

# Opinionated, agent-first homelab OS

## Status and provenance

Captured from an exploratory Pi discussion and associated public documentation
and source research on 2026-11-05. No implementation, base OS selection, or
Proxmox runtime validation has taken place.

The operator's requirements below are distinct from the candidate approaches.
This is an idea garden, not a roadmap or authorization to implement.

## Operator direction

### Product and operating model

- Build an easy-to-manage Linux base for a homelab appliance.
- Aim for Proxmox-like virtualization and some OpenStack-like capabilities
  without their operational complexity.
- Be opinionated. Make common jobs simple rather than exposing every possible
  infrastructure combination.
- Apply the Pareto principle: cover ordinary homelab needs well, with room for
  more advanced use without a maintenance nightmare.
- Prioritize household reliability and a high "wife approval factor." Simple
  backups and understandable downtime can be preferable to elaborate HA.
- Support one, two, or roughly twenty nodes with a consistent operating model.
  Explain capacity, quorum, storage, and availability tradeoffs rather than
  claiming equivalent failure tolerance at every size.
- Avoid routine root logins for administration. Some host operations still need
  privileged components; eliminating all privilege was not the requirement.

### Interaction priority

1. Agentic first.
2. CLI second.
3. Web interface last.

Do not reinterpret this as a dashboard with a chatbot. The exact agent framework,
whether the agent is built in or external, and the model/inference arrangement
remain undecided.

### Host and workload capabilities

- Native container support.
- Firecracker microVM support.
- Full VMs, initially discussed in terms of libvirt.
- Kubernetes, possibly k3s, is a candidate foundation, not a settled decision.
- If Kubernetes is the foundation, KubeVirt is a serious full-VM candidate.
  It supplies QEMU/libvirt userspace inside containers and changes the host
  packaging requirements.
- KubeVirt's QEMU-based VMs do not satisfy the separate Firecracker requirement.

### Storage and recovery

- Evaluate ZFS or Btrfs for local storage and Ceph for distributed storage.
- Include NFS, Samba, and S3 capabilities where appropriate.
- Use the right storage mechanism for the job while keeping the normal
  experience understandable.
- Accommodate modest homelab machines and enterprise hardware when available.
- Neither the local filesystem default nor the distributed-storage policy has
  been selected. ZFS received the most research in this discussion.
- Keep replication and backups conceptually separate.

### Provisioning and development

- Build and test on a Proxmox backend first, then move to bare metal.
- The first installation creates a useful homelab server and a PXE service.
- Additional machines boot from that service and join the installation.
- A dedicated NIC or provisioning VLAN is a possibility, not a decided network
  requirement.
- Automatic enrollment is desired. Approval policy and permission to erase
  disks remain unresolved; automatic discovery must not be assumed to authorize
  destructive installation.

### Cattle, not pets

- Reconstruct hosts from an init file or repository rather than hand-maintaining
  individual installations.
- Use self-hosted Forgejo for configuration, with straightforward offsite Git
  copies through GitLab, GitHub, or another remote.
- Keep reconstructible configuration separate from credentials, operational
  state, and application data. Git is not a backup format for VM disks or
  databases.
- The operator explicitly does not require ongoing NixOS-like host configuration
  management for most of the system.
- First-machine bootstrap and updating that machine are the important lifecycle
  complications. This does not rule out Kubernetes reconciling workloads.

## Base OS preferences

The desired combination is:

- Immutable/image-based operation.
- systemd as init.
- A small, lightweight base in the spirit of Alpine.
- Declarative inputs without requiring Nix's functional language or unfamiliar
  programming concepts for ordinary administration.

NixOS's immutable/reproducible ideas were attractive, but NixOS was not accepted
as the base. Hadron plus Kairos and Flatcar emerged as candidates.

## Working candidates, not decisions

| Question | Current position |
| --- | --- |
| Base OS | Hadron + Kairos and Flatcar merit evaluation; neither selected |
| Kubernetes | Possible foundation; k3s is a candidate |
| Full VMs if Kubernetes is used | Evaluate KubeVirt before assuming host-installed libvirt |
| Firecracker | Separate integration still required |
| Host configuration | Image plus provisioning input may be sufficient |
| Agent interface | Primary operating surface; implementation undecided |
| Local/distributed storage | Requirements captured, defaults not selected |

Hadron/Kairos + k3s + KubeVirt is a concrete prototype candidate, not an approved
stack. Its small footprint and compatibility have not been measured.

## Discussion handoff

The technical discussion paused after the operator identified KubeVirt as an
option if Kubernetes is the base. This corrected the earlier assumption that
host-installed QEMU/libvirt packaging had to be the deciding base-OS constraint.
KubeVirt supplies that userspace; host kernel, device access, storage, and runtime
compatibility still need evaluation. Firecracker remains separate.

The operator pushed back on repeated abstract product framing and hand-waving.
The useful discussion is concrete technical choices, evidence, and maintenance
tradeoffs, not another restatement of the vision. Opinionated does not mean that
assistant recommendations have been accepted as decisions.

A fresh discussion can resume from these notes without the original chat for the
material requirements and research findings. Exact wording and the full sequence
of deliberation are not archived here; the source session ID is a reference, not
an embedded transcript. The current architecture remains exploratory.

## Notes

- [Base OS and virtualization research](base-os-research.md)
- [Bootstrap, updates, and Proxmox development](proxmox-development.md)
- [Topic entry point](README.md)
- [Vault index](../index.md)
