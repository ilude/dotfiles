# Research Obsidian Vault

Obsidian vault for research notes that may span multiple topics.

This directory is the vault boundary. Top-level folders are topic areas; each topic
can keep its own `README.md`, `index.md`, templates, and local `AGENTS.md` when
it needs more specific guidance.

## Start here

- [index](index.md) — vault map and topic list
- [AGENTS](AGENTS.md) — vault-wide guidance for agents
- [agent-workflows/index](agent-workflows/index.md) — agent workflow research and Pi/dotfiles ideas
- [Onclave deployment ownership](agent-workflows/projects/onclave-deployment-ownership.md) - implemented repository boundaries, private images, and daily Podman updates
- [prompt-router/index](prompt-router/index.md) — prompt-router curation, experiments, datasets, and routing policy research
- [osint/index](osint/index.md) - OSINT directories, agent integrations, reading, and collection-accountability research
- [homelab-os/index](homelab-os/index.md) - opinionated, agent-first Linux appliance, base OS research, and Proxmox development

## Current topics

- `agent-workflows/` — agent tooling, workflow patterns, videos, projects, and
  small Pi/dotfiles adaptation ideas.
- [Ubuntu 24.04 kernel 6.8.0-100 incident](ubuntu-kernel-6.8.0-100-incident.md) - historical networking incident.
- `prompt-router/` — prompt-router curation, experiments, datasets, deployment
  candidates, and user-effort override policy.
- `osint/` - OSINT resource directories, agent-assisted investigation sources,
  and provenance-preserving collection guidance.
- `homelab-os/` - immutable Linux appliance exploration, provisioning and updates,
  and Kubernetes/KubeVirt candidates.

## Adding a topic

Create a new top-level folder when notes no longer fit an existing topic. Keep the
first slice small:

```text
new-topic/
  README.md
  index.md
```

Add topic-specific `AGENTS.md` and templates only when they clarify how to work in
that topic.
