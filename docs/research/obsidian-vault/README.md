# Research Obsidian Vault

Obsidian vault for research notes that may span multiple topics.

This directory is the vault boundary. Top-level folders are topic areas; each topic
can keep its own `README.md`, `index.md`, templates, and local `AGENTS.md` when
it needs more specific guidance.

## Start here

- [index](index.md) — vault map and topic list
- [AGENTS](AGENTS.md) — vault-wide guidance for agents
- [agent-workflows/index](agent-workflows/index.md) — agent workflow research and Pi/dotfiles ideas
- [prompt-router/index](prompt-router/index.md) — prompt-router curation, experiments, datasets, and routing policy research

## Current topics

- `agent-workflows/` — agent tooling, workflow patterns, videos, projects, and
  small Pi/dotfiles adaptation ideas.
- `prompt-router/` — prompt-router curation, experiments, datasets, deployment
  candidates, and user-effort override policy.

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
