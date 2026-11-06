---
status: exploratory
captured: 2026-11-05
source_session: 01a1ac73-995d-7744-bf9a-a41b5b344072
---

# Bootstrap, updates, and Proxmox development

[Requirements and open decisions](index.md) |
[Base OS research](base-os-research.md)

## Lifecycle model

The operator does not need ongoing NixOS-like host configuration management for
most of this system. The intended model is:

- A versioned, replaceable OS image.
- Declarative installation/boot input for identity, networking, roles, and storage
  attachment.
- Clearly separated persistent configuration, credentials, workload state, and
  data.

Changes to the host OS can be delivered as new images. Kubernetes, if used, may
still reconcile its workload resources. These are different responsibilities.

"Cattle" does not mean wiping persistent disks during every OS update.

## The first machine

The first server needs to install without depending on services it is about to
host, such as Forgejo, a container registry, or its own PXE server.

A proposed approach is install media plus an init file or an independently
reachable repository. That is enough to establish the first host and start its
bootstrap services. Subsequent machines can then use those services.

Keep the first host on the same OS image as other nodes where practical. A
bootstrap role does not require a permanently different distro. Its long-term
cluster role and whether bootstrap services later move remain open.

If Kubernetes and KubeVirt are chosen, start the initial Kubernetes control plane
directly on the host. Do not make it depend on a VM controlled by that same
KubeVirt installation.

## Updating the first machine

The candidate lifecycle is to stage a complete update while services are still
running, reboot into the replacement OS, and restart against retained
configuration and persistent data.

- A single-node installation has an interruption. Seamless HA is not implied.
- The host update must not require a service that has already been stopped in
  order to complete the update.
- A/B OS switching does not reverse database or other persistent-data migrations.
- Keeping host-image updates separate from application updates where practical
  could reduce that coupling. This is a proposal, not an implemented policy.

Both candidate OS families already provide image-update mechanisms. The work
would be integrating those mechanisms with the homelab's service and data layout,
not inventing a new updater by default.

## Git, data, and reconstruction

Forgejo is the proposed home for configuration, with copies to GitHub, GitLab,
or another offsite Git remote.

The installation must be reconstructible without first recovering the Forgejo
instance hosted inside the failed installation. Keep the necessary configuration
and protected recovery inputs independently accessible.

Git can hold desired configuration and workload definitions. VM disks, database
contents, and other application data need actual data backups. Credentials need
protected handling rather than an assumption that a public or ordinary Git mirror
is sufficient.

Backup products, secret storage, backup destinations, and exact restoration
procedures have not been selected.

## PXE and enrollment

The first server should provide PXE provisioning so additional machines can join
without manual OS installation.

Unresolved behavior includes:

- Dedicated provisioning NIC/VLAN versus an existing network.
- Approval versus explicit unattended enrollment.
- Which disks installation may erase and how that permission is expressed.
- Node identity, cluster membership, and role assignment.

Discovery, enrollment, and disk erasure are separate decisions. No automatic
destructive-installation policy was approved.

## Proposed development infrastructure

Proxmox is the initial hardware laboratory, not a runtime dependency of the
finished OS.

The discussed loop is:

1. Build and publish a versioned OS image.
2. Create a disposable Proxmox VM with provisioning input.
3. Boot the first host and later provision additional VMs over an isolated
   virtual network.
4. Exercise the relevant workload and image-update behavior.
5. Use bare-metal machines later to establish actual hardware behavior.

No builder, CI service, registry, Proxmox API client, or repository layout has
been selected. Nested KVM support on the actual Proxmox hosts has not been checked.

The latest suggested experiment, conditional on a Kubernetes base, is one
candidate host running k3s and KubeVirt, a real VM workload, a small persistent
storage pool, and a host-image update. Firecracker remains a separate capability
to establish. This is a research experiment, not agreed release acceptance.

Virtual testing can establish much of the software lifecycle. It cannot establish
physical-disk behavior, broad hardware compatibility, or real network performance.

## Cluster sizes

One node should be a supported installation. Two nodes should be useful without
pretending to provide the same quorum or storage guarantees as a larger cluster.

Additional nodes can add capacity without automatically enabling distributed
storage or HA. Removing a node requires enough remaining capacity and a plan for
its workloads and data. Exact control-plane placement, scheduling, storage
replication, and node-removal behavior remain undecided.
