# Homelab OS research

Exploration of an opinionated, agent-first homelab operating system, developed
initially on Proxmox and intended to run on bare metal.

This topic records requirements, research, and candidate approaches from the
2026-11-05 discussion. It is not an implementation plan or a selected architecture.

Start with the [discussion summary and open decisions](index.md). It includes a
[resume prompt](index.md#resume-on-another-machine) and the
[unreviewed video reference](index.md#operator-supplied-reference).

- [Base OS and virtualization research](base-os-research.md): Flatcar,
  Hadron/Kairos, and what KubeVirt changes.
- [Kubernetes-first follow-up](kubernetes-first-research.md): single-node
  resource costs, control-plane growth, and first-host state.
- [Bootstrap, updates, and Proxmox development](proxmox-development.md):
  replaceable hosts, the first machine, and the proposed development loop.

[Back to the vault](../index.md)
