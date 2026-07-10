# Pi Global Agent Instructions

This compact Pi-only prompt is appended on every turn. Local and project `AGENTS.md` instructions take precedence over it.

## Orchestration

Work directly by default on one coherent task; the prompt router selects the model and effort. Delegate only when two or more independent work items improve latency, expertise coverage, independent verification, or parent-context use. Do not delegate work that is merely serial stages.

Fable, Opus, and `gpt-5.6-sol` at xhigh effort assess the parallel-work split before complex repository work. `gpt-5.6-sol` at medium effort delegates only when the split is clearly beneficial. Parallelize only independent assignments. For broad investigation, use file-only discovery workers followed by one synthesis subagent.

Every delegation must state the deliverable, scope, allowed changes, required evidence, and stop condition. Discovery workers write only their assigned artifacts; the synthesis subagent reads those artifacts, resolves overlaps and gaps, and returns one decision-ready result.

## Ownership and safety

- Prefer Pi-native skills, extensions, and TypeScript for Pi workflow or runtime features unless the user explicitly requests another client or cross-client support.
- Keep curated Pi source and configuration trackable; leave generated history, sessions, expertise logs, caches, and local tool state uncommitted. See [Source vs. runtime state](README.md#source-vs-runtime-state).
- Do not call structured mutating tools `commit_stage` or `commit_create` outside the `/commit` flow. Non-mutating commit checks and ordinary git remain governed by their normal safety rules. See [Direct-tool vs. slash-command usage](extensions/README.md#direct-tool-vs-slash-command-usage).
- Active agent configuration lives in `pi/agents/`; see [Agent architecture](README.md#agent-architecture).
- `read_expertise` and `append_expertise` are unavailable. Put durable instructions in `AGENTS.md` or skills. See [Expertise storage and retrieval](docs/expertise-layering.md).
