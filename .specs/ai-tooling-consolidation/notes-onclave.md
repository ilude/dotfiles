---
status: evidence-snapshot
captured: 2026-08-12
canonical: false
---

# Onclave Curated Markdown Research Note

## 1. System map

### Onclave

- Onclave is currently both a secure agent communication product and the incubator for a broader agentic software factory. The implemented communication layers are named `onclave-comms` for v1 and `onclave-pi` plus `onclave-core` for v2. Sources: `onclave/README.md`, `onclave/AGENTS.md`, `onclave/docs/PRDS/agentic-software-factory-PRD.md`, `onclave/docs/extensions/onclave-comms/v2-status.md`.
- V1 uses one in-process hub per machine, UDP LAN discovery, explicit `ssh-ed25519` trust, authenticated WSS, local and remote Pi agent routing, static peers, and metadata-only JSONL audit. It is documented as functionally complete, with 142 tests and successful acceptance on two physical LAN hosts. Sources: `onclave/docs/extensions/onclave-comms/status.md`, `onclave/docs/extensions/onclave-comms/manual-acceptance.md`, `onclave/docs/extensions/onclave-comms/decisions.md`.
- V2 replaces the machine-hub mesh with a central RabbitMQ broker and independent TypeScript core service. It adds durable per-agent queues, dead-lettering, performatives, inert `inform` delivery, strict correlation, conversation budgets, provenance framing, and scoped operator delegation. Sources: `onclave/README.md`, `onclave/docs/extensions/onclave-comms/v2-PRD.md`, `onclave/docs/extensions/onclave-comms/v2-status.md`.
- V2 phases 0 through 5 are documented as complete on `feature/v2-broker-core`. Automated acceptance passed 19 checks, and live same-host Pi sessions validated request/reply, inert informs, offline delivery, and broker reconnection. Cross-host confirmation, delegation execution, policy reload, TLS, and per-adapter broker users remain unverified or deferred. Source: `onclave/docs/extensions/onclave-comms/v2-status.md`.
- The reusable Onclave production boundary is a host-neutral Compose stack for RabbitMQ and `onclave-core`, using an immutable image reference and a `/health` contract that reports broker connectivity and declared topology. Consumers own DNS, TLS, host placement, and persistent volumes. Sources: `onclave/deploy/app/onclave/README.md`, `onclave/deploy/app/onclave/env-contract.md`.
- The tracked direct Ansible deployment path is explicitly temporary and has not performed the first production Onclave deployment. The intended owner is the consuming homelab app platform after its Phase A3 gate. Sources: `onclave/docs/deployment-contract-exception.md`, `onclave/infra/README.md`.

### Menos

- Menos is a self-hosted content vault and semantic-search service for YouTube transcripts, Markdown, text, and structured content. Its documented API includes RFC 9421 Ed25519 authentication, content ingestion, semantic and agentic search, tags, links, entities, graphs, pipeline jobs, and usage accounting. Sources: `onclave/services/menos/.claude/rules/architecture.md`, `onclave/services/menos/.claude/rules/api-reference.md`.
- Menos began as YouTube transcript tooling but is intended to become a centralized memory store and a telemetry, logging, and analytics sink for Pi and Claude sessions. The purpose is to support evidence-based evaluation of agent tooling rather than judgment by feel. Source: `onclave/docs/PRDS/2026-07-26-homelab-platform-architecture-PRD.md`.
- The current portable deployment contract uses a Menos API plus PostgreSQL, S3-compatible storage, Ollama, SearXNG, and Docling. Readiness covers PostgreSQL, object storage, and Ollama, while authenticated smoke coverage must test ingest, access, listing, and semantic search. Sources: `onclave/deploy/app/menos/README.md`, `onclave/deploy/app/menos/env-contract.md`.
- Menos production deployment is owned by a consuming platform rather than Onclave's direct Ansible harness. The old direct Menos playbook is reference material only. Source: `onclave/infra/README.md`.
- Menos implementation guidance still describes a Python 3.12+, FastAPI, SurrealDB, MinIO, and Ollama service with a job-first processing model and three-stage agentic search. This conflicts with the PostgreSQL deployment contract and is a major documentation drift area. Sources: `onclave/services/menos/.claude/rules/architecture.md`, `onclave/deploy/app/menos/env-contract.md`.

### Related platform responsibilities

- `.dotfiles` owns workstation and agent runtime configuration; `homelab-infra` owns Proxmox provisioning and infrastructure state; `onramp-vNext` is the destination service catalog and app deployment platform; Onclave incubates AI services and owns the agent message bus; legacy Onramp is a migration source; Joyride provides label-derived DNS. Source: `onclave/docs/PRDS/2026-07-26-homelab-platform-architecture-PRD.md`.
- Caddy is the target ingress layer, with generated route configuration so plan/apply can expose route changes before mutation. Joyride labels remain appropriate for DNS naming. Source: `onclave/docs/PRDS/2026-07-26-homelab-platform-architecture-PRD.md`.
- Bitwarden Secrets Manager is the current secret source. Services should declare required secret names without embedding provider details, while a provider abstraction is deferred until a second backend is actually needed. Sources: `onclave/docs/PRDS/2026-07-26-homelab-platform-architecture-PRD.md`, `onclave/deploy/app/onclave/env-contract.md`.
- Planned related services include observer subscriptions, Aperture and `ai-guard`, Pi-side tool authorization, a Proxmox workspace provisioner, OpenClaw and Hermes adapters, and a mobile operator gateway or app. Sources: `onclave/docs/PRDS/observer-subscriptions-PRD.md`, `onclave/docs/PRDS/tailscale-aperture-guardrails-PRD.md`, `onclave/docs/PRDS/openclaw-hermes-integration-PRD.md`, `onclave/docs/PRDS/mobile-agent-comms-app-PRD.md`.

## 2. PRD catalog

### `2026-07-26-homelab-platform-architecture-PRD.md`

- Vision: establish ownership boundaries across six repositories and turn independently evolved infrastructure into one coherent platform. Source: `onclave/docs/PRDS/2026-07-26-homelab-platform-architecture-PRD.md`.
- Scope: provisioning, catalogs, ingress, secrets, discovery, Menos, Hermes, cleanup, and explicit deferrals. Source: `onclave/docs/PRDS/2026-07-26-homelab-platform-architecture-PRD.md`.
- Apparent status: draft architecture decision record. It documents decisions and known debt but delegates implementation to child PRDs. Source: `onclave/docs/PRDS/2026-07-26-homelab-platform-architecture-PRD.md`.

### `2026-07-26-menos-service-discovery-PRD.md`

- Vision: make Menos reachable without a directly configured address. Source: `onclave/docs/PRDS/2026-07-26-menos-service-discovery-PRD.md`.
- Scope: derive `https://menos.<HOST_DOMAIN>/api/v1`, retain `MENOS_API_BASE` precedence, and fail explicitly if neither variable is available. No new DNS records or SRV support are included. Source: `onclave/docs/PRDS/2026-07-26-menos-service-discovery-PRD.md`.
- Apparent status: draft. The document identifies the `.dotfiles` change site and acceptance checks but does not claim implementation completion. Source: `onclave/docs/PRDS/2026-07-26-menos-service-discovery-PRD.md`.

### `agentic-software-factory-PRD.md`

- Vision: evolve Onclave into a secure software factory coordinating intake, planning, implementation, testing, review, documentation, release, workspaces, guardrails, runtime adapters, and operator clients. Source: `onclave/docs/PRDS/agentic-software-factory-PRD.md`.
- Scope: shared task and event identities, hub-mediated communication, observer subscriptions, isolated Proxmox/LXC workspaces, Aperture and tool authorization, mobile approvals, and redacted audit. Source: `onclave/docs/PRDS/agentic-software-factory-PRD.md`.
- Apparent status: draft and mostly aspirational. Its rename and monorepo consolidation phase is reflected in the repository, but the factory coordinator, provisioner, guardrails, mobile client, and broad workflow model are not documented as implemented. Sources: `onclave/docs/PRDS/agentic-software-factory-PRD.md`, `onclave/AGENTS.md`, `onclave/docs/extensions/onclave-comms/v2-status.md`.

### `mobile-agent-comms-app-PRD.md`

- Vision: replace Telegram, Discord, Slack, and similar bot channels with structured Android and iOS operator workflows. Source: `onclave/docs/PRDS/mobile-agent-comms-app-PRD.md`.
- Scope: hub and agent views, task timelines, approvals, workspaces, guardrail events, audit search, offline handling, and APNs/FCM pointer notifications whose full details are fetched over the tailnet. Source: `onclave/docs/PRDS/mobile-agent-comms-app-PRD.md`.
- Apparent status: draft with no documented mobile implementation. Flutter is preferred elsewhere, but native, React Native, and PWA choices remain open. Sources: `onclave/docs/PRDS/mobile-agent-comms-app-PRD.md`, `onclave/docs/PRDS/technology-stack-architecture-PRD.md`.

### `observer-subscriptions-PRD.md`

- Vision: replace polling with authenticated, hub-mediated event subscriptions. Source: `onclave/docs/PRDS/observer-subscriptions-PRD.md`.
- Scope: leases, filters, stable event IDs, ACKs, retries, replay cursors, bounded retention, authorization, and audit for local and trusted remote subscriptions. Source: `onclave/docs/PRDS/observer-subscriptions-PRD.md`.
- Apparent status: draft. V2 implements durable queues, inert informs, and presence topics, but the curated status documents do not claim the complete observer-subscription contract. Sources: `onclave/docs/PRDS/observer-subscriptions-PRD.md`, `onclave/docs/extensions/onclave-comms/v2-status.md`.

### `openclaw-hermes-integration-PRD.md`

- Vision: expose OpenClaw and Hermes agents through the same trusted agent fabric rather than separate HTTP calls or chat channels. Source: `onclave/docs/PRDS/openclaw-hermes-integration-PRD.md`.
- Scope: adapter registration, capabilities, task and response mapping, lifecycle events, Aperture routing, authorization, correlation, and audit. Source: `onclave/docs/PRDS/openclaw-hermes-integration-PRD.md`.
- Apparent status: draft and deferred. V2 explicitly leaves MCP and Hermes bridges to a follow-up plan. Sources: `onclave/docs/PRDS/openclaw-hermes-integration-PRD.md`, `onclave/docs/extensions/onclave-comms/v2-PRD.md`.

### `tailscale-aperture-guardrails-PRD.md`

- Vision: make Aperture the private LLM gateway and combine central request policy with local tool authorization. Source: `onclave/docs/PRDS/tailscale-aperture-guardrails-PRD.md`.
- Scope: credential injection, quotas, `ai-guard` hooks, secret and prompt-injection detection, deterministic tool authorization, approval gates, OWASP LLM risk mapping, and observer events. Source: `onclave/docs/PRDS/tailscale-aperture-guardrails-PRD.md`.
- Apparent status: draft. No curated status document reports implementation of Aperture hooks, `ai-guard`, or the Pi tool firewall. Source: `onclave/docs/PRDS/tailscale-aperture-guardrails-PRD.md`.

### `technology-stack-architecture-PRD.md`

- Vision: define subsystem boundaries across TypeScript, Go, mobile, transports, storage, and deployment. Source: `onclave/docs/PRDS/technology-stack-architecture-PRD.md`.
- Scope: TypeScript for Pi and adapters, Go for privileged `tsnet` and Proxmox services, SQLite and JSONL for local durability, HTTPS/WSS over Tailscale, and Flutter-preferred mobile. Source: `onclave/docs/PRDS/technology-stack-architecture-PRD.md`.
- Apparent status: draft and partly superseded. Its rejection of RabbitMQ for v1 conflicts with the accepted and implemented v2 broker architecture. Sources: `onclave/docs/PRDS/technology-stack-architecture-PRD.md`, `onclave/docs/extensions/onclave-comms/decisions.md`, `onclave/docs/extensions/onclave-comms/v2-status.md`.

### `onclave-comms-PRD.md`

- Vision: secure LAN discovery and communication between Pi sessions through one explicitly trusted machine hub per host. Source: `onclave/docs/extensions/onclave-comms/onclave-comms-PRD.md`.
- Scope: UDP discovery, Ed25519 authorization, WSS, local registration, prompt routing, project labels, and metadata-only audit. Source: `onclave/docs/extensions/onclave-comms/onclave-comms-PRD.md`.
- Apparent status: frontmatter says draft, but the implementation and manual acceptance documents say the complete v1 scope passed automated and physical two-host validation. Sources: `onclave/docs/extensions/onclave-comms/onclave-comms-PRD.md`, `onclave/docs/extensions/onclave-comms/status.md`.

### `v2-PRD.md`

- Vision: decouple communication from Pi sessions and provide durable, semantically constrained agent messaging through an independent core and RabbitMQ. Source: `onclave/docs/extensions/onclave-comms/v2-PRD.md`.
- Scope: durable queues, dead-lettering, performatives, inert informs, budgets, strict correlation, cross-host policy, adapter registration, and future MCP, Hermes, and telemetry support. Source: `onclave/docs/extensions/onclave-comms/v2-PRD.md`.
- Apparent status: frontmatter says draft, while phases 0 through 5 are documented as complete on the feature branch. Multi-host and hardening checks remain incomplete. Sources: `onclave/docs/extensions/onclave-comms/v2-PRD.md`, `onclave/docs/extensions/onclave-comms/v2-status.md`.

## 3. Menos specs and research

- Menos follows an archive-first principle: preserve expensive source data before downstream processing so it can be reprocessed as models and strategies change. Sources: `onclave/docs/menos/research/evermemos-inspiration.md`, `onclave/docs/menos/ingest-pipeline.md`.
- The documented unified pipeline uses a job-first authority model, resource-key deduplication, bounded concurrency, one LLM pass for tags, quality, summaries, topics, and entities, structured errors, optional signed callbacks, and tiered retention. Source: `onclave/docs/menos/specs/unified-pipeline.md`.
- Entity extraction is code-first and LLM-last. Regex, keyword matching, fuzzy matching, and external APIs should resolve deterministic entities before an LLM extracts topics or resolves ambiguity. Source: `onclave/docs/menos/specs/entity-extraction.md`.
- The knowledge graph model uses typed entities and typed content-to-entity edges for topics, repositories, papers, tools, and people, with normalization, aliases, confidence, hierarchy, and provenance. Sources: `onclave/docs/menos/specs/entity-extraction.md`, `onclave/docs/menos/schema.md`.
- The recommendation design uses both global document embeddings and local chunk embeddings. Search favors chunks, recommendations favor learned preferences, and application suggestions combine chunk relevance with global and preference signals. Source: `onclave/docs/menos/specs/recommendation-engine.md`.
- The planned agentic search architecture keeps large data outside model context. A coordinator owns all retrieval tools and delegates pure reasoning to tool-less sub-agents for analysis, recommendations, application matching, and synthesis. Sources: `onclave/docs/menos/specs/orchestrator.md`, `onclave/docs/menos/research/recursive-language-models.md`.
- A validated lesson warns that invoking an agent with tools from inside another agent's tool can deadlock. The prescribed boundary is coordinator-owned data access plus tool-less reasoners, or direct function calls for prototypes. Source: `onclave/docs/menos/lessons/nested-agent-deadlock.md`.
- The EverMemOS research recommends atomic insights, memory-type taxonomy, evolving preference vectors, selective multi-round recall, and hierarchical clustering, while rejecting a four-database enterprise stack for this personal system. Source: `onclave/docs/menos/research/evermemos-inspiration.md`.
- Prompt research favors actionable extraction over generic summaries and suggests verbalized sampling for diverse tags, interpretations, or application ideas. Source: `onclave/docs/menos/research/prompting-techniques.md`.
- Self-improvement research favors portable Markdown and Git, lifecycle-separated memory, state-delta awareness, two-stage recall and verification, human-reviewed learning, archival as deliberate forgetting, and measurable memory health. Source: `onclave/docs/menos/research/self-improving-systems.md`.
- The message-bus spec proposes Celery, RabbitMQ, Redis, and Flower for external workflow integrations such as N8N, but advises retaining direct API calls for simple synchronous work. Source: `onclave/docs/menos/specs/message-bus.md`.
- The UI roadmap is API-first and lower priority than agentic search. It progresses from conversation history and projects through canvas, styles, global memory, web search, sandboxed execution, and image generation. Source: `onclave/docs/menos/specs/ui-roadmap.md`.
- The backlog identifies preference learning, long-form chunking, application suggestion, dual-collection retrieval, project context, monitoring, pattern analysis, and feedback loops as research gaps. Source: `onclave/docs/menos/backlog/discussions-needed.md`.

## 4. Agent-communication vision

### What exists

- V1 exists as a complete secure LAN Pi extension with explicit public-key trust, discovery, WSS messaging, local and remote tools, static peers, audit, and physical two-host validation. Sources: `onclave/docs/extensions/onclave-comms/status.md`, `onclave/docs/extensions/onclave-comms/README.md`.
- V2 exists on a feature branch as a broker-backed core and Pi adapter with durable delivery, performatives, inert informs, strict correlation, budgets, policy reload, and signed scoped delegation. Sources: `onclave/docs/extensions/onclave-comms/v2-status.md`, `onclave/docs/extensions/onclave-comms/decisions.md`.
- Direct operator delegation is intentionally distinct from ordinary messaging. A valid grant binds target, project, conversation, exact body, actions, scope, and expiry, then allows unattended continuation without another Onclave confirmation or receiver allowlist. Sources: `onclave/README.md`, `onclave/docs/extensions/onclave-comms/decisions.md`.

### V2 direction

- V2 makes the always-on core the registry, policy, budget, delivery, and audit anchor, while adapters own session-specific delivery and reply capture. Source: `onclave/docs/extensions/onclave-comms/v2-PRD.md`.
- Future interop is intended to add a Streamable HTTP MCP face for Claude Code-like clients and a Hermes webhook bridge, with W3C trace context and per-conversation token accounting. Source: `onclave/docs/extensions/onclave-comms/v2-PRD.md`.
- V1 is to remain frozen until v2 reaches parity, after which v1 retires without wire compatibility. Sources: `onclave/README.md`, `onclave/docs/extensions/onclave-comms/v2-PRD.md`.

### Trust UX

- V1 trust remains secure but operator-heavy because it requires public-key exchange and session restart. Source: `onclave/docs/extensions/onclave-comms/trust-ux-future.md`.
- The preferred future flow is explicit trust request, review, approve or deny, durable `authorized_keys` update, and audit. Trust listing and removal should precede invites or optional TOFU. Source: `onclave/docs/extensions/onclave-comms/trust-ux-future.md`.
- This trust proposal is tied to the v1 key model and has not been reconciled with v2 broker credentials and delegation grants. Sources: `onclave/docs/extensions/onclave-comms/trust-ux-future.md`, `onclave/docs/extensions/onclave-comms/v2-PRD.md`.

### Mobile direction

- Mobile is envisioned as an operator client rather than an agent hub. It should provide structured tasks, approvals, workspaces, security events, subscriptions, and audit rather than a chat clone. Source: `onclave/docs/PRDS/mobile-agent-comms-app-PRD.md`.
- Mobile control must remain hub-mediated and tailnet-private. It must not directly access agents, Proxmox, provider keys, or privileged infrastructure APIs. Source: `onclave/docs/PRDS/mobile-agent-comms-app-PRD.md`.
- APNs and FCM payloads should contain only safe pointers and routing metadata. Full content must be fetched over the tailnet after the app opens. Source: `onclave/docs/PRDS/mobile-agent-comms-app-PRD.md`.

## 5. Recurring themes and design principles

- Local-first and tailnet-first operation is preferred over public control planes. Sources: `onclave/docs/PRDS/agentic-software-factory-PRD.md`, `onclave/docs/PRDS/mobile-agent-comms-app-PRD.md`, `onclave/docs/extensions/onclave-comms/v2-PRD.md`.
- Identity and transport trust do not make message content safe. Instruction-shaped content requires structural controls, performatives, provenance, budgets, approvals, and tool authorization. Sources: `onclave/docs/extensions/onclave-comms/decisions.md`, `onclave/docs/PRDS/tailscale-aperture-guardrails-PRD.md`.
- Deterministic mechanisms should precede model judgment: schemas, IDs, budgets, allowlists, filters, regex, normalization, policy rules, and explicit state machines are favored over free-text inference. Sources: `onclave/docs/PRDS/tailscale-aperture-guardrails-PRD.md`, `onclave/docs/menos/specs/entity-extraction.md`.
- Sensitive payloads should be minimized. Discovery, push notifications, audit logs, and deployment contracts carry metadata or pointers rather than prompts, private paths, keys, or secrets. Sources: `onclave/docs/extensions/onclave-comms/onclave-comms-PRD.md`, `onclave/docs/PRDS/mobile-agent-comms-app-PRD.md`, `onclave/deploy/app/onclave/env-contract.md`.
- Work must be bounded and recoverable through TTLs, queue caps, retries, deduplication, idempotency keys, budgets, retention policies, and explicit terminal states. Sources: `onclave/docs/extensions/onclave-comms/v2-PRD.md`, `onclave/docs/menos/specs/unified-pipeline.md`.
- Data access and reasoning should be separated. Coordinators and services fetch and persist data; smaller model calls perform focused reasoning without owning privileged tools. Sources: `onclave/docs/menos/specs/orchestrator.md`, `onclave/docs/menos/lessons/nested-agent-deadlock.md`.
- Human operators retain authority for privileged actions. Agents and Hermes may propose and explain, but deployments, workspace creation, high-risk tools, and policy exceptions require explicit gates unless narrowly delegated. Sources: `onclave/docs/PRDS/agentic-software-factory-PRD.md`, `onclave/docs/PRDS/2026-07-26-homelab-platform-architecture-PRD.md`.
- The architecture favors incubation before platformization. New AI services prove value in Onclave, then graduate into the official app catalog rather than starting as generalized platform features. Source: `onclave/docs/PRDS/2026-07-26-homelab-platform-architecture-PRD.md`.

## 6. Explicit future-direction statements with sources

- Onclave is intended to become an agentic software factory, with `onclave-comms` or its successor serving as the trusted communication fabric rather than the whole product. Source: `onclave/docs/PRDS/agentic-software-factory-PRD.md`.
- Incubating Onclave AI services should graduate into the `onramp-vNext` catalog after proving themselves. Source: `onclave/docs/PRDS/2026-07-26-homelab-platform-architecture-PRD.md`.
- Menos is intended to become a centralized memory, telemetry, logging, and analytics sink for Pi and Claude sessions. Source: `onclave/docs/PRDS/2026-07-26-homelab-platform-architecture-PRD.md`.
- Hermes is intended to become the operator cockpit for home infrastructure, consuming machine-readable evidence while preserving human approval for applies. Source: `onclave/docs/PRDS/2026-07-26-homelab-platform-architecture-PRD.md`.
- V2 is intended to add MCP and Hermes interop, tracing, and conversation-level cost accounting after the core broker milestone. Source: `onclave/docs/extensions/onclave-comms/v2-PRD.md`.
- Trust UX is intended to gain list, remove, request, approve, and deny workflows before optional pairing invites or TOFU. Source: `onclave/docs/extensions/onclave-comms/trust-ux-future.md`.
- Mobile is intended to become the structured, private operator surface for tasks, approvals, workspaces, guardrails, notifications, and audit. Source: `onclave/docs/PRDS/mobile-agent-comms-app-PRD.md`.
- Menos Phase 5 is intended to add coordinator-driven agentic search, recommendation learning, application suggestions, and eventually self-improving query patterns. Source: `onclave/docs/menos/specs/orchestrator.md`.
- Menos is intended to extract atomic insights and techniques, learn evolving preferences, and connect saved knowledge to active project needs. Sources: `onclave/docs/menos/research/evermemos-inspiration.md`, `onclave/docs/menos/backlog/discussions-needed.md`.
- Onclave and Menos deployment definitions are intended to remain provider-neutral contracts consumed by the broader homelab platform rather than embedding inventory, DNS, or secret-provider ownership. Sources: `onclave/deploy/app/onclave/README.md`, `onclave/deploy/app/menos/README.md`, `onclave/docs/deployment-contract-exception.md`.

## 7. Contradictions, stale docs, and drift

- The largest drift is Menos storage. Most Menos architecture, schema, migration, restore, scripts, and Claude rules describe SurrealDB, while the current portable app contract requires PostgreSQL. Sources: `onclave/docs/menos/schema.md`, `onclave/docs/menos/adr/001-database-migrations.md`, `onclave/docs/menos/specs/backup-strategy/restore-procedures.md`, `onclave/services/menos/.claude/rules/architecture.md`, `onclave/deploy/app/menos/env-contract.md`.
- Menos restore documentation targets SurrealDB, old Compose service names, and a fixed example host, while the portable app now supplies PostgreSQL backup and restore helpers and says host placement is consumer-owned. Sources: `onclave/docs/menos/specs/backup-strategy/restore-procedures.md`, `onclave/deploy/app/menos/README.md`.
- Menos chunking is inconsistent. The current ingest and schema documents describe 512-character chunks with 50-character overlap, while the recommendation specification calls for roughly 2,000 to 3,000 token transcript chunks and 1,000 to 2,000 token web chunks. Sources: `onclave/docs/menos/ingest-pipeline.md`, `onclave/docs/menos/schema.md`, `onclave/docs/menos/specs/recommendation-engine.md`.
- The technology-stack and factory PRDs reject RabbitMQ and external brokers for v1, but v2 accepts RabbitMQ as the central delivery substrate and documents it as implemented. This is an architectural generation change that older PRDs do not clearly mark as superseded. Sources: `onclave/docs/PRDS/technology-stack-architecture-PRD.md`, `onclave/docs/PRDS/agentic-software-factory-PRD.md`, `onclave/docs/extensions/onclave-comms/decisions.md`.
- The observer PRD assumes direct hub-to-hub WSS subscription routing, while v2 removes that mesh in favor of central RabbitMQ exchanges and queues. The intended observer API over the new substrate is unresolved. Sources: `onclave/docs/PRDS/observer-subscriptions-PRD.md`, `onclave/docs/extensions/onclave-comms/v2-PRD.md`.
- The mobile PRD describes a Pi hub network, but v2 uses a central broker and core. Mobile gateway placement and authorization need to be restated against v2. Sources: `onclave/docs/PRDS/mobile-agent-comms-app-PRD.md`, `onclave/docs/extensions/onclave-comms/v2-PRD.md`.
- V1 and v2 PRDs retain `draft` status even though their status documents claim completed implementation milestones. Sources: `onclave/docs/extensions/onclave-comms/onclave-comms-PRD.md`, `onclave/docs/extensions/onclave-comms/v2-PRD.md`, `onclave/docs/extensions/onclave-comms/status.md`, `onclave/docs/extensions/onclave-comms/v2-status.md`.
- Repository guidance presents `extensions/onclave-comms` as the current implemented subsystem, while the root README and v2 status describe additional active packages and services. Sources: `onclave/AGENTS.md`, `onclave/README.md`, `onclave/docs/extensions/onclave-comms/v2-status.md`.
- The v2 manual runbook describes deployment replacing a placeholder Onclave container, while the deployment exception says the first production deployment has not occurred. Sources: `onclave/docs/extensions/onclave-comms/v2-manual-acceptance.md`, `onclave/docs/deployment-contract-exception.md`.
- The v2 trust policy has changed internally. Cross-host requests require confirmation by default, but scoped operator delegation intentionally bypasses that additional confirmation. This is documented as a supersession rather than accidental inconsistency, but operator documentation must preserve the distinction between ordinary sends and authoritative delegation. Sources: `onclave/docs/extensions/onclave-comms/decisions.md`, `onclave/docs/extensions/onclave-comms/v2-manual-acceptance.md`.
- Several Menos documents retain old `knowledge/...` and `.specs/archive/...` paths, indicating relocation without complete link cleanup. Sources: `onclave/docs/menos/specs/orchestrator.md`, `onclave/docs/menos/backlog/discussions-needed.md`, `onclave/docs/PRDS/mobile-agent-comms-app-PRD.md`.
- The homelab architecture PRD explicitly records additional stale state: the Onclave service catalog still names SurrealDB for Menos, secret declarations disagree, and legacy app definitions remain tracked. Source: `onclave/docs/PRDS/2026-07-26-homelab-platform-architecture-PRD.md`.

## 8. Open questions

- Which Menos database and schema are authoritative now: the PostgreSQL deployment contract or the extensive SurrealDB implementation documentation? Sources: `onclave/deploy/app/menos/env-contract.md`, `onclave/services/menos/.claude/rules/architecture.md`.
- Has v2 been merged to the default branch, and has the immutable app definition ever been deployed to the production Docker host? Sources: `onclave/docs/extensions/onclave-comms/v2-status.md`, `onclave/docs/deployment-contract-exception.md`.
- How should the observer-subscription contract map onto RabbitMQ without exposing broker details directly to adapters or duplicating core policy? Sources: `onclave/docs/PRDS/observer-subscriptions-PRD.md`, `onclave/docs/extensions/onclave-comms/v2-PRD.md`.
- Should v1 trust request and revocation UX still be developed, or should equivalent operator workflows be redesigned for v2 broker credentials and signed delegation grants? Sources: `onclave/docs/extensions/onclave-comms/trust-ux-future.md`, `onclave/docs/extensions/onclave-comms/decisions.md`.
- What is the first narrow factory workflow: intake, implementation, and review, or the full plan, implement, test, review sequence? Source: `onclave/docs/PRDS/agentic-software-factory-PRD.md`.
- Does factory task state belong in `onclave-core` or in a separate coordinator registered through the communication fabric? Source: `onclave/docs/PRDS/agentic-software-factory-PRD.md`.
- What telemetry transport should Menos use, and should its placement change if it becomes a critical memory and analytics sink? Source: `onclave/docs/PRDS/2026-07-26-homelab-platform-architecture-PRD.md`.
- Should MCP-joined agents be locally scoped or globally addressable, and should the Hermes bridge run inside the core or as its own container? Source: `onclave/docs/extensions/onclave-comms/v2-PRD.md`.
- Should mobile connect to each core directly or through a dedicated gateway, which stack should implement it, and which actions require biometric confirmation? Source: `onclave/docs/PRDS/mobile-agent-comms-app-PRD.md`.
- Which guardrail components will be implemented first, and where is the authoritative boundary between Aperture request controls, Pi tool authorization, repository safety policy, and human approval? Source: `onclave/docs/PRDS/tailscale-aperture-guardrails-PRD.md`.
- Which Menos chunking model should win, and how will search quality be evaluated against actual content rather than mocked tests? Sources: `onclave/docs/menos/specs/recommendation-engine.md`, `onclave/services/menos/.claude/CLAUDE.md`.
- What is the migration sequence from temporary direct app deployment to `onramp-vNext`, and when can the duplicate legacy roles and compose definitions be deleted? Sources: `onclave/docs/PRDS/2026-07-26-homelab-platform-architecture-PRD.md`, `onclave/docs/deployment-contract-exception.md`.

## Evidence

- `onclave/README.md` - Current product overview and v1/v2 split.
- `onclave/docs/extensions/onclave-comms/status.md` - V1 implementation and acceptance state.
- `onclave/docs/extensions/onclave-comms/v2-status.md` - V2 implementation, verification, and remaining gaps.
- `onclave/docs/PRDS/2026-07-26-homelab-platform-architecture-PRD.md` - Cross-repository architecture and future direction.
- `onclave/deploy/app/menos/env-contract.md` - Current Menos PostgreSQL deployment contract.
- `onclave/services/menos/.claude/rules/architecture.md` - Menos implementation architecture still describing SurrealDB.

## Unknowns

- The requested file remains unsaved because no mutation tool is available.
- Git branch state, merge state, and live deployment state cannot be independently verified with the available read-only tools.

Smallest next action: save the `Onclave Curated Markdown Research Note` body verbatim to the desired research-note path.
