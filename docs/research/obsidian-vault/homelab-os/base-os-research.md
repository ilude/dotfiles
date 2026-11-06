---
status: docs-and-source-research
researched: 2026-11-05
source_session: 01a1ac73-995d-7744-bf9a-a41b5b344072
---

# Base OS and virtualization research

[Discussion context and requirements](index.md)

## Evidence limits

This note summarizes public documentation and source inspection, not running
systems. No images were built, no candidates were booted on Proxmox, and no
footprint, performance, update, or storage behavior was measured.

Links to development branches are mutable. A source-level capability is not proof
that a particular released image supplies or reliably operates it. "No integration
found" means absent from the materials checked, not impossible or unsupported
everywhere.

## Hadron Linux plus Kairos

### Division of responsibilities

[Hadron](https://hadron-linux.io/) is a minimal, from-scratch base using musl,
systemd, and Linux kernels. It does not ship a package manager by default.

[Kairos](https://kairos.io/docs/architecture/immutable/) adds immutable image
lifecycle, installation, A/B updates, and persistent-data handling.
[Configuration](https://kairos.io/docs/architecture/cloud-init/) is
cloud-init-style YAML applied at system stages.

The [Hadron repository](https://github.com/kairos-io/hadron) documents building a
core Kairos image without Kubernetes. Kubernetes is not forced by choosing this
base.

The combination closely matches the requested small/systemd/image-based
direction, but "Alpine-sized" has not been established by measurement.

### Extension and packaging model

The upstream [hadron-layers repository](https://github.com/kairos-io/hadron-layers)
builds software with the Hadron toolchain and publishes runtime OCI layers.
Consumer images can copy these into their filesystem during a container-image
build. The project also documents system-extension artifacts.

The inspected catalog contains Git, GPG, fwupd, DRBD, ZFS, and Tailscale. It does
not list a QEMU/libvirt host stack or Firecracker. That is a bounded catalog
observation, not proof that no other integration exists.

### ZFS

The upstream layer includes OpenZFS kernel modules and userspace tools, so this
would not start as a from-scratch port.

Important constraints documented in the
[layer README](https://github.com/kairos-io/hadron-layers#kernel-module-layers)
and [build recipe](https://github.com/kairos-io/hadron-layers/blob/main/zfs/Dockerfile):

- The module is tied to the kernel of the toolchain used to build it.
- The consumer host must run the matching kernel.
- The system-extension form merges the layer's `/usr`, not its `/etc/zfs`;
  configuration such as ZED's zedlets needs separate handling.
- The documented build smoke checks examine module metadata, binaries, and
  dry-run loading. They do not establish successful pool import or persistence
  through a booted host upgrade.

The inspected x86 kernel configurations enable KVM:
[default](https://github.com/kairos-io/hadron/blob/main/files/kernel/default.config)
and [cloud](https://github.com/kairos-io/hadron/blob/main/files/kernel/cloud.config).
That does not by itself validate nested virtualization or any particular VMM.

### Updates

Kairos documents upgrading custom OS images from OCI registries, local saved
container-image archives, extracted root filesystems, or filesystem-image files.
The ordinary flow stages an image and reboots into it.

- [Manual upgrades](https://kairos.io/docs/upgrade/manual/)
- [Lifecycle quickstart](https://kairos.io/quickstart/lifecycle-management/)

This is relevant to updating the first host without depending on Kubernetes to
perform the host OS upgrade. It is not evidence that a particular homelab service
or storage layout has been validated.

## Flatcar Container Linux

[Flatcar](https://www.flatcar.org/docs/latest/) is a minimal, immutable,
container-oriented, systemd-based OS with read-only system images and A/B updates.

### Provisioning

[Butane](https://www.flatcar.org/docs/latest/fb-provision/butane/) converts
human-authored YAML into Ignition JSON.
[Ignition](https://www.flatcar.org/docs/latest/fb-provision/ignition/) normally
runs once, at first boot.

This is compatible with the operator's cattle-style provisioning goal. It should
not be treated as a deficiency merely because it is not an ongoing NixOS-like
host configuration manager.

### Extensions and ZFS

The [system-extension documentation](https://www.flatcar.org/docs/latest/sys-ext/)
distinguishes release-provided extensions from community bakery extensions.
The official set includes ZFS and Incus.

Flatcar's [ZFS documentation](https://www.flatcar.org/docs/latest/os-config/storage/zfs/)
explicitly calls support experimental. It warns that an out-of-tree ZFS/kernel
incompatibility can cause a release to omit the extension, preventing ZFS users
from updating until a compatible release follows. Official availability must not
be presented as an unconditional storage/update guarantee.

[Incus integration](https://www.flatcar.org/docs/latest/orchestrate/containers/incus/)
includes automated preseed examples and a ZFS configuration. This is an adjacent
option, not approval to replace libvirt or KubeVirt with Incus.

The inspected [community bakery](https://github.com/flatcar/sysext-bakery) includes
Cloud Hypervisor and Kata Containers recipes, but no dedicated QEMU/libvirt or
Firecracker recipe was found. Those alternatives are not equivalent to the
requested backends.

### Updates and customization

Flatcar's
[update/reboot documentation](https://www.flatcar.org/docs/latest/setup/releases/update-strategies/)
describes staging updates to the inactive partition and switching on reboot.
Its documented default is automatic reboot with a five-minute delay; reboot
policy is configurable.

[Image customization](https://www.flatcar.org/docs/latest/fb-provision/customize-image/customize-the-image/)
normally leaves the signed, updated OS filesystem intact and supplies
configuration or additional software through the supported writable areas and
extensions. A disposable test VM must not become a cloned installation carrying
its initialized identity and SSH keys.

The [libvirt deployment guide](https://www.flatcar.org/docs/latest/deploy/virt-options/libvirt/)
describes Flatcar as a guest under an existing libvirt setup. It is not evidence
that Flatcar ships a host libvirt service.

## What KubeVirt changes

This was an important correction to the initial comparison: if Kubernetes is the
foundation, host-installed QEMU/libvirt is not a prerequisite.

KubeVirt runs each VM in a `virt-launcher` pod containing QEMU and libvirt.
Their container image supplies its own userspace; a musl-based host does not
therefore require musl builds of the whole virtualization stack.

- [Host/kernel/userspace explanation](https://kubevirt.io/2026/understanding-kubevirt-host-kernel-userspace-dependencies.html)
- [Architecture](https://kubevirt.io/user-guide/architecture/architecture/)
- [Installation requirements](https://kubevirt.io/user-guide/cluster_admin/installation/)

A possible split is:

| Host OS | Kubernetes layer |
| --- | --- |
| Kernel, drivers, KVM, systemd | KubeVirt controllers and VM resources |
| Networking prerequisites and required storage components | QEMU/libvirt userspace in VM pods |
| k3s and its container runtime, if selected | Workload deployment and storage integration |

Remaining host concerns include access to `/dev/kvm`, `/dev/vhost-net`, and
`/dev/net/tun`, privileged node components, and security-policy integration.

KubeVirt's documentation specifically warns about mismatches between its bundled
Enterprise Linux userspace and substantially different host kernels, particularly
for live migration. Containerized userspace removes much of the host packaging
problem, not the kernel compatibility problem.

VM disks can use Kubernetes persistent volumes; this still requires a chosen
storage provisioner and does not establish a ZFS or Ceph design.
[Disk and volume documentation](https://kubevirt.io/user-guide/storage/disks_and_volumes/)

KubeVirt is QEMU-based and does not fulfill the separate Firecracker requirement.

## Firecracker

[Upstream setup](https://github.com/firecracker-microvm/firecracker/blob/main/docs/getting-started.md)
requires Linux/KVM, suitable device access, and guest kernel/rootfs artifacts.
It documents the jailer as the intended production execution model.

Its [kernel policy](https://github.com/firecracker-microvm/firecracker/blob/main/docs/kernel-policy.md)
identifies validated host and guest kernel families. The Hadron development
branch inspected used a newer kernel outside the listed validated host families.
That is not proof of incompatibility, nor a statement about every Hadron release;
it means KVM availability alone is insufficient evidence of a validated stack.

No ready-made host integration was established for either candidate in this
research pass.

## Current conclusion

Hadron/Kairos + k3s + KubeVirt is worth evaluating if Kubernetes is chosen.
Flatcar remains a comparison candidate, with an explicit ZFS/update caveat.

Neither is selected. KubeVirt prevents absence of a host libvirt package from
being used as a premature rejection criterion.

The [Kubernetes-first follow-up](kubernetes-first-research.md) covers documented
resource baselines, single-node operation, datastore growth, and first-host
state. Aggregate runtime overhead is still unmeasured.

Ceph, Btrfs, Samba, NFS, S3, PXE enrollment, and the agent implementation have not
received equivalent compatibility research.
