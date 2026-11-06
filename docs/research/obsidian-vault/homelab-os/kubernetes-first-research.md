---
status: docs-and-source-research
researched: 2026-11-05
source_session: 01a1ac73-995d-7744-bf9a-a41b5b344072
---

# Kubernetes-first: single-node operation and host requirements

[Discussion context](index.md) |
[Base OS comparison](base-os-research.md)

## Scope and evidence

Follow-up research on whether k3s plus KubeVirt is a useful foundation for a small
homelab installation. This is documentation research, not a measured deployment.
No Kubernetes base, datastore, hardware minimum, or release combination has been
selected.

## Single-node topology is a normal starting point

K3s supports a single server that also runs workloads. KubeVirt's
[Minikube quickstart](https://kubevirt.io/quickstart_minikube/) includes a
single-node setup; multiple physical machines are not intrinsically required to
run a VM through KubeVirt.

This establishes the topology as plausible, not that Hadron/Kairos plus a
particular k3s/KubeVirt combination has been validated.

## Resource cost

The published [K3s requirements](https://docs.k3s.io/installation/requirements)
list 2 CPU cores and 2 GB RAM for a server, and 1 core and 512 MB for an agent.
These are K3s requirements, not a minimum for the complete appliance.

K3s publishes [resource profiling](https://docs.k3s.io/reference/resource-profiling)
with single-server control-plane/datastore figures around 1.6 GB under its
documented test conditions. Those measurements use K3s v1.26.5, so they should not
be treated as measurements of a current release or of KubeVirt. The profiling
also does not establish the total memory cost of this proposed appliance.

The budget would include the host, k3s, KubeVirt infrastructure components,
storage services, guest RAM, and per-VM overhead. No defensible aggregate idle
footprint or minimum hardware recommendation has been established.

[KubeVirt's resource documentation](https://kubevirt.io/user-guide/compute/resources_requests_and_limits/)
distinguishes guest memory from calculated launcher/virtualization overhead.
A documented default overhead term is not a complete measured per-VM cost.

It also documents a default `cpuAllocationRatio` of 10, giving a scheduler CPU
request of 0.1 CPU per vCPU, with no default CPU limit. For example, four vCPUs
normally produce a 0.4-CPU request, not four dedicated physical cores. This is a
scheduling request, not measured consumption or a performance guarantee.
Appliance capacity reporting and any CPU-allocation policy need to account for
that distinction; no alternative policy was selected.

## One, two, and more nodes

[Embedded-etcd HA documentation](https://docs.k3s.io/datastore/ha-embedded)
describes three or more server nodes for a highly available embedded-etcd control
plane. Every workload node need not be a control-plane server.

A candidate topology, not an approved policy:

| Physical hosts | Possible arrangement | Important consequence |
| --- | --- | --- |
| One | One server that also runs workloads | No host-level availability |
| Two | One server plus one worker | More capacity, no redundant control plane |
| Three or more | Three servers plus additional workers as appropriate | Control-plane HA becomes possible; workload/storage HA is separate |

A two-member etcd group is not a solution to surviving either member's loss,
because a majority still requires both members.

K3s defaults to SQLite for a single-server installation and documents conversion
to embedded etcd by restarting with `--cluster-init`. Starting the first server
with embedded etcd is another candidate that avoids a later datastore conversion.
The discussion has not chosen between these approaches, and neither guarantees
automatic or interruption-free cluster growth or shrinkage.

## Host requirements remain real

The [KubeVirt installation requirements](https://kubevirt.io/user-guide/cluster_admin/installation/)
include containerd support, privileged node components, and usable KVM, vhost,
and TUN devices. These align with k3s as a candidate but do not certify a
particular combination.

KubeVirt supplies QEMU/libvirt userspace in containers. Its
[upstream kernel/userspace analysis](https://kubevirt.io/2026/understanding-kubevirt-host-kernel-userspace-dependencies.html)
describes actual live-migration regressions involving host-kernel features and
changes to the bundled QEMU. Thus host kernel, k3s/Kubernetes, KubeVirt, and
storage integration need to be evaluated together. This is not a finding that
Hadron or Flatcar cannot work.

Nested KVM remains necessary for representative Proxmox-based testing.
Software emulation can demonstrate API behavior, but cannot establish the
intended hardware-accelerated operation or performance.

## First-host persistence

[K3s backup/restore documentation](https://docs.k3s.io/datastore/backup-restore)
requires both the datastore and the server token at
`/var/lib/rancher/k3s/server/token`. The token protects confidential datastore
contents; a database snapshot without the matching token is insufficient for
the documented restoration procedure.

The host-image update therefore needs to retain the k3s state and token.
Reconstructing the cluster entirely from Git is a different procedure from
restoring its datastore, and neither restores guest disks or application data
by itself.

## Research outcome

Single-node k3s plus KubeVirt is a credible prototype direction. Small image size
alone does not establish a lightweight complete appliance.

The remaining decisive evidence is an actual candidate installation's resource
cost, hardware-accelerated VM behavior, persistent storage, and host-update
behavior. This research did not authorize or perform that prototype.
