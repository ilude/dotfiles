---
status: evidence-snapshot
captured: 2026-08-12
canonical: false
---

# AI Dev Tooling Ecosystem Survey

## Scope and method

Survey target: `C:/projects/Personal`

Repository status and activity signals were derived from `.git/config`, `.git/HEAD`, refs, and reflogs because Git commands were unavailable. Dates are the latest local commit or checkout signals visible in those files, not guaranteed upstream commit dates. File modification times were not available through the read-only tools.

No direct target checkout was represented by a `.git` worktree pointer. Repositories with readable `.git/` directories appear to be ordinary standalone checkouts. The dotfiles copy of Onclave is a separate Git submodule working tree.

## 1. Repo survey table

| Name | Purpose | Relevance class | Activity signal | Doc quality |
| --- | --- | --- | --- | --- |
| agent-spike | Early AI content-ingestion, multi-agent, observability, and experimentation platform | supporting | Git repo; latest local activity 2026-02-10 | Medium. Thin README, substantial but partly stale docs |
| chudnovsky | Local-first Go terminal coding assistant with provider, tool, hook, storage, and TUI experiments | core | Git repo; latest local activity 2026-06-07 | Excellent. Current README, detailed PRD, AGENTS, and research |
| claude-src | Unversioned source snapshot of Claude Code, including remote control, skills, tools, and UI internals | core | No `.git`; date unknown | Poor as a standalone project. No README or instructions found |
| codemash-talk-data | Conference dataset and extraction research | unrelated | Git repo; initial activity 2026-01-16 | High for its data-analysis scope |
| ContextMenuEditor | Windows registry context-menu manager | unrelated | Git repo; clone signal 2025-11-14 | High for end users |
| deltos-editor | Pure-Go Windows text editor using Fyne | supporting | Git repo; latest local activity 2026-02-19 | High. CLAUDE and archived design plans |
| deltos-electron-spike | Electron, CodeMirror, xterm, split-terminal editor experiment | abandoned spike | Git repo; latest local activity 2026-03-02 | Low. No README; package and task artifact only |
| deltos-rust | Iced/Rust port of Deltos Editor with parity tracking | abandoned spike | Git repo; latest local activity 2026-02-20 | Medium. Strong parity manifest, no README |
| eye-tracking-project | Webcam eye-tracking experiment | unrelated | Git repo; initial activity 2025-11-22 | Minimal |
| games/dorf-fail | Empty directory | unrelated | No Git repo | None |
| games/drift | 4X simulation with deterministic autonomous systems | unrelated | Git repo; latest local activity 2026-04-01 | Excellent for the game |
| games/socom | Fictional military training game prototype | unrelated | Git repo; initial activity 2026-05-24 | Basic |
| homelab-infra | OpenTofu and Ansible substrate for Proxmox, Hermes, Onramp host, secrets, DNS, and managed services | infrastructure | Git repo; latest local activity 2026-08-11 | Excellent and current |
| ilude.github.com | Personal website | unrelated | Git repo; latest visible activity 2025-10-31 | Low for tooling analysis |
| joyride | CoreDNS Docker discovery, DNS, and cluster plugin used by OnRamp | infrastructure | Git repo; latest local activity 2026-07-26 | Excellent operator documentation |
| menos | Standalone self-hosted content vault with ingestion, embeddings, semantic search, and PKM features | supporting | Git repo; latest local activity 2026-07-19 | High, but some docs describe superseded SurrealDB architecture |
| mentat-cli | Python CLI agent and TOML tool orchestrator | abandoned spike | Git repo; latest local activity 2025-10-24 | High README, but old and partly aspirational |
| mentat-spike | Go/Gio visual manager for parallel coding agents and worktree review | abandoned spike | Git repo; latest local activity 2026-02-12 | Excellent design research; almost no implementation |
| msys2-runtime-fix | MSYS2 runtime and package forks for Windows shell fixes | infrastructure | Parent is not a repo; three nested Git repos | Low at parent level |
| onboard | Flask dashboard, feed reader, bookmarks, click tracking, and personalization candidate | supporting | Git repo; commit date unavailable; personalization branches exist | Poor README, substantial archived specs |
| onclave | Pi extension and broker-backed secure cross-machine multi-agent fabric; also incubates Menos | core | Git repo; current branch `feature/v2-broker-core`; latest activity 2026-08-12 | Excellent, though older PRDs conflict with current implementation |
| OnPrem | Planned Radicle federation with GitHub and Codeberg mirrors | infrastructure | No Git repo; planning-only directory | High PRD and plan, no implementation |
| onramp | Large Compose service catalog with Traefik and legacy Makefile workflows | infrastructure | Git repo; latest local activity 2026-07-26 | High but very broad |
| onramp-vNext | Agent-first Go CLI for plan/apply management of app services on an existing Debian host | infrastructure | Git repo; latest local activity 2026-07-27 | Excellent PRD set and current snapshot |
| opencode | Fork of the OpenCode coding-agent monorepo with PowerShell experiments | core | Git repo; current branch `feat/pwsh-tool-pr`; latest local activity 2026-02-15 | High upstream documentation and AGENTS |
| pi-mono | Fork of the Pi agent harness, provider library, agent runtime, TUI, and web UI | core | Git repo; latest local activity 2026-05-25 | Excellent upstream documentation |
| prosorini-artifact-proxy | Prototype unified package-registry proxy and cache | infrastructure | Local Git repo with two visible commits; latest 2026-05-25 | Poor. No README or Markdown docs |
| pst-merge-dedupe | Docker/Mono PST indexing, deduplication, and merge proof of concept | unrelated | No Git repo | High for its bounded data-recovery task |
| pvcs | Empty directory | unrelated | No Git repo | None |
| tacobot | YouTube RSS and price-tracking Discord bot | unrelated | Git repo; latest local activity 2026-04-02 | Good end-user README |
| TeamsOneClickSwitcher | Windows Teams account-switching tray utility | unrelated | Git repo; latest local activity 2026-07-24 | High |
| the-tacos-egg | Retro terminal adventure game | unrelated | Git repo; latest local activity 2026-04-04 | High |
| train-ops | Empty directory | unrelated | No Git repo | None |
| zeroone-site | ZeroOne Hosting website | unrelated | Git repo; latest local activity 2026-04-30 | Minimal |

Primary survey sources:

- `C:/projects/Personal/*/.git/config`
- `C:/projects/Personal/*/.git/HEAD`
- `C:/projects/Personal/*/.git/logs/HEAD`
- `C:/projects/Personal/*/README.md`
- `C:/projects/Personal/*/AGENTS.md`
- `C:/projects/Personal/*/CLAUDE.md`

## 2. Per-repo detail for core and supporting repos

### agent-spike

Purpose:

An early full-stack AI/content platform combining ingestion, storage, agent experiments, streaming progress, and LGTM observability.

Key documented ideas:

- Server-Sent Events for ingestion and future agent activity streams.
- Correlation IDs and OpenTelemetry across frontend, API, and services.
- Programmatic Loki and Prometheus queries intended for agent outcome analysis and calibration.
- Content ingestion and reprocessing patterns later carried into Menos.

Relationships:

- It is a direct conceptual predecessor to Menos.
- Onclave's Menos documentation explicitly preserves "agent-spike patterns."
- Its direct infrastructure deployment assumptions have been superseded by `homelab-infra` and the Onramp host ownership model.

Sources:

- `C:/projects/Personal/agent-spike/README.md`
- `C:/projects/Personal/agent-spike/docs/STREAMING-ARCHITECTURE.md`
- `C:/projects/Personal/agent-spike/docs/OBSERVABILITY.md`
- `C:/projects/Personal/agent-spike/docs/SURREALDB-BACKUP.md`

### chudnovsky

Purpose:

A local-first terminal coding assistant written in Go. It is the clearest independent attempt to build a personal Pi-like assistant rather than only configure or extend an upstream harness.

Key documented ideas:

- Controlled normal-screen terminal UI instead of an alternate-screen framework.
- Sticky turn context, persistent multiline composer, terminal scrollback preservation, and responsive asynchronous provider/tool activity.
- Layered prompt customization by base, provider, model family, and model.
- OpenAI-compatible, Ollama/OpenWebUI, OpenRouter, and experimental Codex subscription providers.
- JSONL session persistence and local tool gateway.
- Future graph models for execution, context retrieval, conflict detection, replay, and audit.
- Hooks as the future damage-control and authorization layer.

Relationships:

- Pi is the UX and behavior reference.
- Chud appears to be an independent UX and architecture laboratory rather than a Pi extension.
- It overlaps heavily with Pi and OpenCode at the coding-agent layer, but focuses on user-owned terminal behavior and a compact Go implementation.

Sources:

- `C:/projects/Personal/chudnovsky/README.md`
- `C:/projects/Personal/chudnovsky/AGENTS.md`
- `C:/projects/Personal/chudnovsky/PRD.md`

### claude-src

Purpose:

A source snapshot of Claude Code rather than a normal project checkout.

Key documented ideas visible in source:

- Remote Control can launch and drive sessions from web or mobile clients.
- Auto-mode includes a model classifier for deciding tool behavior.
- The source includes coordinator, task, tool, skills, plugin, voice, history, and cost-tracking systems.
- System prompts and product behavior are inspectable.

Relationships:

- Useful as comparative implementation evidence for Pi, Chud, Onclave mobile control, and agent routing.
- It has no visible Git provenance, README, version marker, or update process, so it should not be treated as authoritative current Claude Code source without verification.

Sources:

- `C:/projects/Personal/claude-src/constants/system.ts`
- `C:/projects/Personal/claude-src/constants/prompts.ts`
- `C:/projects/Personal/claude-src/bridge/bridgeMain.ts`
- `C:/projects/Personal/claude-src/cli/handlers/autoMode.ts`

### deltos-editor

Purpose:

A lightweight native Windows editor built in Go and Fyne.

Key documented ideas:

- Pure-Go implementation with Docker used for CGo-dependent Windows builds.
- Buffer, file operations, custom editor widget, Vim logic, settings, and native frameless-window handling.
- Separates editor font sizing from UI chrome.
- Represents the traditional editor side of the user's broader agent-workspace experiments.

Relationships:

- The Go editor became the source for the Deltos Rust parity port.
- It overlaps with Mentat's editor component but lacks Mentat's agent-first work queue.
- Its native editor experiments help frame the later Electron and Rust tradeoffs.

Sources:

- `C:/projects/Personal/deltos-editor/CLAUDE.md`
- `C:/projects/Personal/deltos-editor/.specs/`

### homelab-infra

Purpose:

The durable infrastructure substrate for the AI tooling ecosystem.

Key documented ideas:

- Explicit ownership split:
  - `homelab-infra` owns Proxmox guests and durable infrastructure.
  - `onramp-vNext` owns app workloads and the service catalog.
  - Hermes is an operator cockpit across approved repository-native workflows.
- Bitwarden Secrets Manager is authoritative for site configuration and application secrets.
- SeaweedFS S3 stores encrypted OpenTofu state.
- Hermes is a managed first-class service with persistent memory/state and strong safety boundaries.
- The Onramp host is a Debian VM and app substrate.
- Onclave and Menos are incubated app workloads scheduled for eventual handoff to OnRamp.
- A broad design handoff describes personal and work Hermes realms, Pi workers, sandbox brokers, development-service brokers, structured memory classes, and personalized content ingestion.

Relationships:

- It is the infrastructure source of truth beneath Onclave, Menos, OnRamp, Hermes, and future Pi workers.
- It explicitly prevents Hermes or Onclave from becoming alternate infrastructure control planes.
- It currently contains temporary deployment exceptions that should migrate to OnRamp.

Sources:

- `C:/projects/Personal/homelab-infra/README.md`
- `C:/projects/Personal/homelab-infra/AGENTS.md`
- `C:/projects/Personal/homelab-infra/docs/onramp-app-platform-contract.md`
- `C:/projects/Personal/homelab-infra/docs/hermes-operator-pilot-prd.md`
- `C:/projects/Personal/homelab-infra/docs/agent-platform-design-handoff.md`

### menos

Purpose:

A self-hosted content vault for transcripts, Markdown, semantic search, enrichment, and personalized knowledge workflows.

Key documented ideas:

- RFC 9421 HTTP signatures using existing Ed25519 SSH keys.
- YouTube transcript and metadata ingestion.
- General content upload with frontmatter and link extraction.
- Chunking, local Ollama embeddings, vector search, and LLM processing.
- Tags, summaries, quality tiers, entities, backlinks, annotations, and graph views.
- Unified asynchronous pipeline with durable job state and idempotency keys.

Relationships:

- Descends from agent-spike.
- Supplies the knowledge and content-memory layer for Hermes and Pi workflows.
- The standalone README describes the old SurrealDB and MinIO implementation.
- The active Onclave branch is porting Menos into `services/menos` and the Onclave core using PostgreSQL and S3-compatible storage.

Sources:

- `C:/projects/Personal/menos/README.md`
- `C:/projects/Personal/menos/docs/ingest-pipeline.md`
- `C:/projects/Personal/menos/docs/schema.md`
- `C:/projects/Personal/onclave/docs/menos/parity-contract.md`
- `C:/projects/Personal/onclave/services/menos/`

### onboard

Purpose:

A candidate user-facing product for content discovery, bookmarks, feeds, and personalization.

Key documented ideas:

- RSS/Atom ingestion and feed caching.
- Bookmark and click tracking.
- Personalization specifications and instruction-metrics experiments.
- The homelab platform handoff proposes retaining Onboard as the presentation and feedback surface while extracting durable ingestion, normalization, enrichment, and ranking services.

Relationships:

- Menos is the likely content storage and enrichment backend.
- Hermes can convert discovered content into tasks, research, or memory candidates.
- OnRamp is the likely deployment owner.
- Current README quality is too weak to establish a clear canonical product direction.

Sources:

- `C:/projects/Personal/onboard/README.md`
- `C:/projects/Personal/onboard/.spec/features/personalization/PRD.md`
- `C:/projects/Personal/onboard/.spec/features/instruction-metrics/PLAN.md`
- `C:/projects/Personal/homelab-infra/docs/agent-platform-design-handoff.md`

### onclave

Purpose:

The secure communication and coordination fabric around Pi and other agent runtimes.

Key documented ideas:

- V1 provides LAN discovery, local machine hubs, Ed25519 trust exchange, authenticated WSS routing, static peers, and Pi status tools.
- V2 replaces the in-session hub with a containerized core and RabbitMQ.
- Shared envelopes include performatives, budgets, provenance, strict correlation, and signed operator-delegation grants.
- Per-agent durable queues, dead-lettering, presence, conversation budgets, and JSONL audit.
- The broader product vision includes a software factory, observer subscriptions, mobile approvals, workspace provisioning, guardrails, and Hermes/OpenClaw adapters.
- Menos is being folded into the core service on the active branch.

Relationships:

- Pi is the primary adapter and user interaction runtime.
- Hermes is intended to join through a runtime adapter rather than bypass Onclave.
- `homelab-infra` provisions the host and temporary deployment.
- `onramp-vNext` is the future catalog and app-lifecycle owner.
- Menos becomes a knowledge-vault capability behind the same core-service boundary.

Sources:

- `C:/projects/Personal/onclave/README.md`
- `C:/projects/Personal/onclave/AGENTS.md`
- `C:/projects/Personal/onclave/docs/PRDS/agentic-software-factory-PRD.md`
- `C:/projects/Personal/onclave/docs/PRDS/observer-subscriptions-PRD.md`
- `C:/projects/Personal/onclave/docs/PRDS/mobile-agent-comms-app-PRD.md`
- `C:/projects/Personal/onclave/docs/PRDS/openclaw-hermes-integration-PRD.md`
- `C:/projects/Personal/onclave/docs/menos/parity-contract.md`

### onramp-vNext

Purpose:

An agent-friendly, plan/apply service manager for an existing Debian app host.

Key documented ideas:

- Go single binary with typed operations and machine-readable JSON.
- Agentless SSH operation.
- Plan-first, idempotent service deployment.
- Catalog distribution through CI-built JSON artifacts behind a store interface.
- Secret-safe rendering and generated service secrets.
- Read-only `list` and `doctor` operations as first-class agent surfaces.
- Ollama stack combining Ollama, Open WebUI, Docling, SearXNG, and Pipelines.
- Lakebed research describes agent-native TypeScript capsules where code declares infrastructure and runtime capabilities.

Relationships:

- `homelab-infra` owns the guest; OnRamp owns applications on it.
- Onclave and Menos should move from temporary homelab Ansible roles into the OnRamp catalog.
- The original OnRamp repository remains a large source catalog and operational reference.
- Hermes should call OnRamp's approved operations rather than maintaining deployment state.

Sources:

- `C:/projects/Personal/onramp-vNext/README.md`
- `C:/projects/Personal/onramp-vNext/AGENTS.md`
- `C:/projects/Personal/onramp-vNext/docs/prd/onramp-personal-paas-redesign-prd.md`
- `C:/projects/Personal/onramp-vNext/docs/prd/onramp-vnext-current-snapshot.md`
- `C:/projects/Personal/onramp-vNext/docs/prd/onramp-ollama-ai-stack-prd.md`
- `C:/projects/Personal/onramp-vNext/docs/prd/lakebed-backend-architecture-prd.md`

### opencode

Purpose:

A local fork of the provider-neutral OpenCode coding agent.

Key documented ideas:

- Built-in build and read-only plan agents.
- General subagent.
- Client/server architecture and multiple frontends.
- LSP-oriented TUI.
- Local fork work focused on adding a hardened PowerShell Core tool for Windows.

Relationships:

- Comparative coding-agent implementation beside Pi and Chud.
- The PowerShell experiment is especially relevant to the user's Windows-heavy workflow.
- No direct architectural integration with Onclave or Menos was documented.

Sources:

- `C:/projects/Personal/opencode/README.md`
- `C:/projects/Personal/opencode/AGENTS.md`
- `C:/projects/Personal/opencode/.git/HEAD`
- `C:/projects/Personal/opencode/.git/logs/HEAD`

### pi-mono

Purpose:

The primary upstream-derived agent harness and coding-agent implementation.

Key documented ideas:

- Multi-provider AI library.
- Agent runtime with tool calling and state management.
- Extensible coding-agent CLI.
- TUI, web UI, SDK, extension, skill, and package systems.
- Local fork history includes EditorConfig and TUI-latency work.

Relationships:

- Pi is the current extension host for Onclave.
- Onclave tools and delegation are designed around Pi sessions.
- Chud, OpenCode, Mentat, and Claude source act as comparisons or experiments around the same user workflow.
- The dotfiles repository owns curated Pi runtime features and configuration rather than this fork.

Sources:

- `C:/projects/Personal/pi-mono/README.md`
- `C:/projects/Personal/pi-mono/AGENTS.md`
- `C:/projects/Personal/pi-mono/packages/coding-agent/README.md`
- `C:/projects/Personal/pi-mono/packages/agent/docs/agent-harness.md`

## 3. Cross-repo relationships and duplication

### Onclave checkout versus dotfiles submodule

Both point to `git@github.com:traefikturkey/onclave.git` and track `feature/v2-broker-core`.

The standalone checkout is at commit:

```text
ed083beae81c6b5438e6677164a917bd34f52390
```

The dotfiles submodule is at:

```text
e0658fd3f0473ae4efafcb974b9dcde9007b9aaf
```

Therefore the two working copies are not synchronized. The standalone checkout contains later Menos core-port work not pinned by dotfiles.

Sources:

- `C:/projects/Personal/onclave/.git/config`
- `C:/projects/Personal/onclave/.git/refs/heads/feature/v2-broker-core`
- `C:/Users/mglenn/.dotfiles/.gitmodules`
- `C:/Users/mglenn/.dotfiles/.git/modules/onclave/config`
- `C:/Users/mglenn/.dotfiles/.git/modules/onclave/refs/heads/feature/v2-broker-core`

### OnRamp versus OnRamp vNext

`onramp` is the mature, broad Compose catalog with 287-plus services, Traefik, Makefile workflows, enabled-service symlinks, and overrides.

`onramp-vNext` is a smaller Go control plane with typed plan/apply operations, SSH host profiles, explicit state inspection, a new catalog artifact model, Caddy/Joyride integration, and machine-readable output.

The likely division is:

- Old OnRamp remains a service-definition and operational-pattern source.
- vNext is the intended future command and lifecycle surface.
- Service definitions still need deliberate migration rather than maintaining two independent catalogs indefinitely.

Sources:

- `C:/projects/Personal/onramp/README.md`
- `C:/projects/Personal/onramp-vNext/README.md`
- `C:/projects/Personal/onramp-vNext/docs/prd/onramp-vnext-current-snapshot.md`
- `C:/projects/Personal/onramp-vNext/docs/prd/onramp-vnext-historical-spikes.md`

### Mentat CLI versus Mentat spike

These are different product directions sharing a name.

- `mentat-cli` is a Python terminal agent with CQRS, TOML tools, provider adapters, approvals, and an MTSP protocol roadmap.
- `mentat-spike` is a native Go/Gio desktop workflow manager centered on isolated worktrees, parallel agents, visual review, and editor/terminal context.

The desktop spike is newer conceptually, but remains a Phase 0 design repository. Neither appears to be the current coding-agent center after Pi, Onclave, and Chud became active.

Sources:

- `C:/projects/Personal/mentat-cli/README.md`
- `C:/projects/Personal/mentat-spike/.claude/CLAUDE.md`
- `C:/projects/Personal/mentat-spike/docs/agentic-workflow-vision.md`

### Menos standalone versus Onclave Menos

The standalone Menos repository documents the complete FastAPI and SurrealDB implementation.

The active Onclave branch:

- Freezes the externally consumed Menos API contract.
- Drops unconsumed graph and agentic-search endpoints.
- Ports storage and pipeline behavior into Onclave core.
- Uses PostgreSQL and S3-compatible storage rather than preserving SurrealDB as the long-term boundary.

The standalone repo is therefore best treated as source and history until the port reaches validated parity.

Sources:

- `C:/projects/Personal/menos/README.md`
- `C:/projects/Personal/menos/docs/schema.md`
- `C:/projects/Personal/onclave/docs/menos/parity-contract.md`
- `C:/projects/Personal/onclave/services/menos/`

### Deltos and Mentat editor experiments

There are four overlapping native or desktop editor directions:

- Go/Fyne Deltos editor.
- Rust/Iced Deltos port.
- Electron/CodeMirror/xterm Deltos spike.
- Go/Gio Mentat agent-first desktop manager.

The experiments answer different questions, but no canonical desktop agent workspace is declared. The Electron spike reached the most practical terminal and CodeMirror integration; Mentat has the strongest agent workflow concept; Deltos Go has the most structured native editor implementation.

Sources:

- `C:/projects/Personal/deltos-editor/CLAUDE.md`
- `C:/projects/Personal/deltos-rust/parity-manifest.md`
- `C:/projects/Personal/deltos-electron-spike/package.json`
- `C:/projects/Personal/mentat-spike/docs/agentic-workflow-vision.md`

### Pi, OpenCode, Chud, and Claude Code

These represent four coding-agent strategies:

- Pi: extensible primary harness and current Onclave host.
- OpenCode: provider-neutral client/server comparison with Windows PowerShell work.
- Chud: compact user-owned Go terminal assistant and UX laboratory.
- Claude source: proprietary-product implementation reference and remote-control evidence.

The major duplication is provider configuration, tool execution, TUI behavior, sessions, task handling, and remote control. A future vision should explicitly decide which projects are production surfaces and which are research references.

## 4. Ideas found only here and nowhere else

"Only here" means not found in the other surveyed README, AGENTS, CLAUDE, and selected docs, not a claim about all external software.

1. Chud's controlled normal-screen UI with sticky latest-turn context while preserving ordinary terminal scrollback and text selection.
   - `C:/projects/Personal/chudnovsky/PRD.md`

2. Mentat's tab-as-workspace identity combining one agent task, Git worktree, file explorer, editor, terminal, status, review, and approval flow.
   - `C:/projects/Personal/mentat-spike/docs/agentic-workflow-vision.md`

3. Mentat's focus-follows-mouse interaction as a deliberate answer to multi-agent context-switching friction.
   - `C:/projects/Personal/mentat-spike/docs/focus-follows-mouse-design.md`

4. Onclave v2's signed operator-delegation grant binding exact target, project, conversation, request body, actions, scope, and expiry.
   - `C:/projects/Personal/onclave/README.md`

5. Onclave's proposed mobile approval surface for task, tool, guardrail, and Proxmox workspace actions, with push messages limited to safe pointers.
   - `C:/projects/Personal/onclave/docs/PRDS/mobile-agent-comms-app-PRD.md`

6. The homelab handoff's explicit memory taxonomy separating confirmed profile facts, preferences, procedures, episodes, documents, behavioral events, inferences, constraints, and temporary context.
   - `C:/projects/Personal/homelab-infra/docs/agent-platform-design-handoff.md`

7. OnRamp vNext's Lakebed reconstruction: code-level capsule primitives infer infrastructure, with a pluggable runtime executor spanning Node workers, gVisor, Firecracker, LXC, and remote runners.
   - `C:/projects/Personal/onramp-vNext/docs/prd/lakebed-backend-architecture-prd.md`

8. Agent-spike's plan for agents to query LGTM telemetry directly for outcome tracking, performance calibration, and issue detection.
   - `C:/projects/Personal/agent-spike/docs/OBSERVABILITY.md`

9. Menos authentication using RFC 9421 signatures generated from the operator's existing Ed25519 SSH key rather than a separate bearer-token workflow.
   - `C:/projects/Personal/menos/README.md`

10. A unified package registry proxy, Prosorini, as local dependency infrastructure. The idea is distinct but too undocumented to evaluate.
    - `C:/projects/Personal/prosorini-artifact-proxy/.git/logs/HEAD`
    - `C:/projects/Personal/prosorini-artifact-proxy/docker-compose.yml`

## 5. Signs of abandoned directions

- Mentat CLI has no visible activity after 2025-10-24 and its role overlaps current Pi and Chud work.
- Mentat spike explicitly says only a Gio hello-world POC exists, with Wails discarded.
- Deltos Rust is an incomplete parity port with only early waves visible.
- Deltos Electron is named and structured as a spike, has no README, and stops after editor/terminal integration work.
- Agent-spike contains old live infrastructure details, old storage architecture, and patterns now documented under Menos.
- Standalone Menos still presents SurrealDB as canonical while active Onclave work has moved toward PostgreSQL and a unified core.
- Onclave draft factory PRDs reject RabbitMQ for v1, while the current v2 README implements RabbitMQ. Those PRDs are stale unless intentionally retained as rejected history.
- OnPrem is a complete planning package without a Git repository or implementation files.
- Prosorini has only an initial implementation and layout refactor, no remote, and no documentation.
- `pvcs`, `train-ops`, and `games/dorf-fail` are empty.
- `claude-src` has no repository metadata or version documentation and looks like an extracted reference snapshot.
- Onboard has substantial archived planning but an extremely thin current README, making current ownership and status unclear.

## 6. Open questions

1. Is Pi the long-term primary coding-agent runtime, with Chud and OpenCode retained only as research references?
2. Is Chud intended to become a production personal assistant, a terminal UX laboratory for Pi, or an independent fallback?
3. Should the standalone Onclave checkout or the dotfiles submodule pin be treated as canonical during active development?
4. Has Onclave formally selected RabbitMQ v2 over the older direct-hub and SQLite observer architecture?
5. When does the Menos standalone repository become archival, and what parity gate must pass first?
6. Which Menos capabilities intentionally disappear in the Onclave port, especially graph browsing and agentic search?
7. Will old OnRamp continue to own catalog definitions, or will all definitions migrate to a separate catalog consumed by vNext?
8. Which desktop workflow concept, if any, survives: Deltos Go, Deltos Electron, Deltos Rust, or Mentat?
9. Is Onboard still the intended content-discovery UI, and is Menos its canonical backend?
10. Does Prosorini solve a current package availability, integrity, or caching problem in the AI platform, or was it only an isolated experiment?
11. What version and provenance does `claude-src` represent, and how is it refreshed?
12. Should OnPrem source-sovereignty work integrate with Forgejo and the existing homelab model, or is Radicle federation a separate abandoned direction?
13. Which ideas from the broad homelab agent-platform handoff are accepted architecture versus exploratory hypotheses?
14. What is the desired boundary between Hermes as operator cockpit and Onclave as deterministic task and communication fabric?

## Evidence

- `C:/projects/Personal/onclave/README.md` - Current broker-backed Onclave architecture.
- `C:/projects/Personal/homelab-infra/docs/onramp-app-platform-contract.md` - Repository ownership boundaries.
- `C:/projects/Personal/onclave/docs/menos/parity-contract.md` - Standalone Menos to Onclave port contract.
- `C:/projects/Personal/mentat-spike/docs/agentic-workflow-vision.md` - Desktop multi-agent workspace concept.
- `C:/projects/Personal/chudnovsky/PRD.md` - Independent Go coding-assistant direction.
- `C:/projects/Personal/onramp-vNext/docs/prd/onramp-vnext-current-snapshot.md` - Current vNext state and scope.
- `C:/Users/mglenn/.dotfiles/.git/modules/onclave/refs/heads/feature/v2-broker-core` and `C:/projects/Personal/onclave/.git/refs/heads/feature/v2-broker-core` - The two Onclave checkouts are at different commits.

## Unknowns

- Exact file modification dates where no readable Git reflog was available.
- Upstream activity after the local checkout signals.
- Whether several planning-only or spike repositories were intentionally retired.
- The requested file remains unsaved because this session is read-only.
