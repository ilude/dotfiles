# AI Dev Tooling Future View

This is the durable future reference for the personal AI development tooling ecosystem.
Date basis: 2026-08-12, the latest activity signal recorded in the corpus.
It synthesizes the six consolidation notes, their cited repository evidence, and the consolidation README.
Sources use these abbreviations: Active, Archive, Vault, Onclave, Pi, and Repos.
Source: [README, `.specs/ai-tooling-consolidation/README.md`; Repos, `C:/projects/Personal/*/.git/logs/HEAD`]

## 1. Current state map

| Layer | Real today | Documented-only, incomplete, or drifted | Source |
| --- | --- | --- | --- |
| Pi runtime | Pi 0.84.1 is the primary customized coding-agent runtime, with repository-owned extensions, skills, settings, and linked runtime packages. | None implied by the runtime inventory itself. | [Pi, `pi/README.md:21`] |
| Pi workflow | `/goal`, `/plan-it`, `/prd-it`, `/review-it`, `/do-it`, `/commit`, `/summarize`, `/loop`, `/improve`, task inspection, routing controls, and operator diagnostics exist. | Lifecycle correlation across goal, plan, review, and execution remains a future candidate. | [Pi, `pi/README.md`; Active, `.specs/pi-workflow-refinement/notes.md`] |
| Durable work | `task` stores durable tasks, dependencies, scope, and lifecycle state; `subagent` owns transient execution; the parent owns validation and terminal state. | Attempts, artifact provenance, freshness checks, claims, and parent-independent execution are parked. | [Pi, `pi/README.md:579-594`; Vault, `agent-workflows/workflow-ideas/durable-task-dependency-systems.md`] |
| Compaction | Active-turn compaction and structured durable handoff exist; completed durable-work activation requires task inspection after compaction. | A shared lifecycle ID and a current-work registry are not implemented. | [Pi, `pi/README.md:339-342`; Active, `.specs/pi-durable-work-activation/plan.md`] |
| Workflow skills | Skills are a broad active layer covering planning, review, languages, infrastructure, safety, observability, and Pi internals. | Writing-quality layering is partly implemented but awaits live interactive workflow verification. | [Pi, `pi/skills/`; Active, `.specs/writing-quality-skill-layering/plan.md`] |
| Safety | Damage control, safe edits, bounded commit tools, session-budget guards, quality gates, secret scanning, and redacted traces are active. | Shadow judging is disabled and non-authoritative pending evidence. | [Pi, `pi/README.md:296-317`; Pi, `pi/README.md:920-934`] |
| Telemetry | JSONL metrics, workflow dispatch, friction review, routing, orchestration, session-budget, usage, traces, and damage-control telemetry exist. | Workflow telemetry does not establish full completion semantics; metrics lack built-in retention. | [Pi, `pi/README.md:457-489`; Pi, `pi/docs/workflow-eval-telemetry.md`] |
| Local memory | Pi has feature-memory and local expertise retrieval infrastructure. | Expertise retrieval is not exposed as an agent tool; legacy expertise snapshots are retired. | [Pi, `pi/docs/expertise-layering.md:23-45`] |
| Menos | Menos is the intended shared durable memory and content backend for Pi and Claude, with content ingestion, semantic search, tags, links, entities, graphs, jobs, and usage accounting documented. | The knowledge compiler is reviewed but not completed; current storage architecture documentation conflicts. | [Onclave, `onclave/services/menos/.claude/rules/api-reference.md`; Active, `.specs/menos-knowledge-compiler/plan.md`] |
| Onclave V1 | Secure LAN Pi communication V1 is functionally complete, with explicit Ed25519 trust, authenticated WSS, metadata-only audit, and two-host acceptance evidence. | V1 is frozen pending V2 parity and eventual retirement. | [Onclave, `onclave/docs/extensions/onclave-comms/status.md`; Onclave, `onclave/README.md`] |
| Onclave V2 | Broker-backed V2 core and Pi adapter have completed documented phases 0-5 on `feature/v2-broker-core`, with durable queues, dead letters, performatives, strict correlation, budgets, and same-host validation. | Cross-host validation, TLS, policy reload verification, delegation execution, and per-adapter broker users remain incomplete or deferred. | [Onclave, `onclave/docs/extensions/onclave-comms/v2-status.md`] |
| Herdr | Herdr is enabled as an opt-in Pi terminal control and metadata layer. | It is not an orchestration replacement, notification system, worktree manager, or background-process runtime. | [Pi, `pi/settings.json:19-20`; Active, `.specs/archive/pi-herdr-full-integration/plan.md`] |
| Hermes | Hermes is a proposed agent-runtime and homelab operator direction. | No selected target host, provider stack, webhook, exposure model, or live proof is established. | [Active, `.specs/hermes-deploy/PRD.md`] |
| Homelab ownership | `homelab-infra` owns durable infrastructure and Proxmox; `onramp-vNext` is the intended app catalog and lifecycle surface; Onclave incubates AI services. | Temporary direct deployment paths have not completed their handoff to the consuming platform. | [Repos, `C:/projects/Personal/homelab-infra/README.md`; Onclave, `onclave/docs/deployment-contract-exception.md`] |
| Secrets | Bitwarden Secrets Manager is the current platform secret source in the newer platform direction. | Older active specs target Infisical and conflict with the newer platform contract. | [Onclave, `onclave/docs/PRDS/2026-07-26-homelab-platform-architecture-PRD.md`; Active, `.specs/archive/infisical-secrets/plan.md`] |
| Infra rollout | Rootless Podman Quadlet migration is planned, with Menos as the intended canary. | No service migration or live validation is complete. | [Active, `.specs/rootless-podman-quadlet-hardening/plan.md`] |
| High-risk execution | Multipass no-host-mount YOLO isolation has a reviewed design. | It remains planned and has no implementation artifacts. | [Active, `.specs/multipass-yolo-workflows/plan.md`] |
| Research vault | The Obsidian vault is an implemented idea garden and curated research index. | Its proposals are not commitments unless promoted through evidence and a bounded slice. | [Vault, `AGENTS.md`; Vault, `agent-workflows/AGENTS.md`] |
| Experiments | Chud, OpenCode, Pi Mono, Claude source, Deltos variants, Mentat, Onboard, and related repos provide comparison or research surfaces. | No canonical desktop agent workspace or alternate primary coding-agent runtime is selected. | [Repos, `C:/projects/Personal/chudnovsky/PRD.md`; Repos, `C:/projects/Personal/mentat-spike/docs/agentic-workflow-vision.md`] |

## 2. Settled design principles

### Parent-owned durable task lifecycle

The parent starts ready work, marks it running, dispatches workers, validates output, and writes the terminal task state.
This is settled because mixing task storage with execution and scheduling produced a larger, less clear control plane.
Strongest source: [Pi, `pi/README.md:630-637`; Active, `.specs/archive/pi-task-todo-boundary/plan.md`]

### Durable task state is not a scheduler

`task` owns durable todo and dependency state only; `schedule` remains process-local prompt timing and workers remain transient execution.
This is settled because separate task, todo, team, and execution systems created drift.
Strongest source: [Active, `.specs/archive/pi-task-todo-boundary/plan.md`; Archive, `.specs/archive/pi-task-dag-runner/plan.md`]

### Direct work is the default

Use workers only for independent, bounded, specialized, or context-isolated work.
This is settled because fan-out for serial reasoning, small work, or shared mutable state adds coordination cost without improving correctness.
Strongest source: [Active, `.specs/pi-workflow-refinement/notes.md`; Pi, `pi/README.md:796`]

### Deterministic mechanisms own repeatable control

Parsing, identity, lifecycle transitions, retries, timeouts, selection, validation, deduplication, permissions, and storage boundaries belong in maintained deterministic code.
Models retain synthesis, review, classification, interpretation, and ambiguous language judgment.
Strongest source: [Active, `.specs/pi-workflow-refinement/notes.md`; Onclave, `onclave/docs/menos/specs/entity-extraction.md`]

### Determinism must earn its complexity

A deterministic program is not automatically better; promotion requires measured time, context, error, or consistency benefits.
This is settled because overbuilt workflow automation can turn simple judgment into brittle machinery.
Strongest source: [Archive, `.specs/archive/workflow-test-rationalization/summary.md`]

### Evidence gates precede adaptation

Do not change reviewer composition, prompts, routing, timeouts, thresholds, clustering, worker communication, or safety authority based only on intuition.
This is settled because telemetry without outcome evidence cannot establish causal improvement.
Strongest source: [Active, `.specs/pi-workflow-refinement/notes.md`; Pi, `pi/docs/orchestration-telemetry.md:264-268`]

### Automation stops at the proposal boundary

Background systems may observe, classify, recommend, and measure, but users approve policy, prompt, skill, routing, and workflow mutations.
This is settled because self-modifying workflow policy obscures authority and causality.
Strongest source: [Archive, `.specs/archive/rationalization-phase4/plan.md`; Active, `.specs/archive/pi-workflow-friction-review/design.md`]

### One capability has one owner

Pi owns runtime behavior; Menos owns durable knowledge; Onclave owns trusted inter-agent delivery; infrastructure repositories own infrastructure; skills own scoped guidance.
This is settled because duplicate authorities create inconsistent state and stale contracts.
Strongest source: [Pi, `pi/AGENTS.md:36-40`; Active, `.specs/archive/pi-task-todo-boundary/plan.md`; Onclave, `onclave/docs/PRDS/2026-07-26-homelab-platform-architecture-PRD.md`]

### Durable artifacts outrank chat reconstruction

Plans, task state, review artifacts, handoffs, run receipts, validation records, and explicit terminal states must survive compaction and session loss.
This is settled because conversational state is not a reliable recovery mechanism.
Strongest source: [Active, `.specs/pi-durable-work-activation/plan.md`; Vault, `agent-workflows/workflow-ideas/pipelines-and-policies.md`]

### Lean context and progressive disclosure

Keep global instructions small, load skills and detailed references only when relevant, and advertise canonical tool inputs rather than compatibility clutter.
This is settled because duplicated global guidance consumes context and causes contradictions.
Strongest source: [Active, `.specs/pi-workflow-refinement/notes.md`; Archive, `.specs/archive/rationalization-phase2/ledger.md`]

### Skills are reviewed operational knowledge

Repeat a workflow manually, reduce it to stable steps, verification, recovery, and small scripts, then promote it into a skill only when the pattern is stable.
This is settled because raw transcripts and generic policy layers do not provide dependable operational guidance.
Strongest source: [Vault, `agent-workflows/patterns/markdown-skills-memory.md`; Active, `.specs/writing-quality-skill-layering/plan.md`]

### Tests prove executable contracts, not prose

Tests should cover behavior, schemas, normalized configuration, protocols, state transitions, and safety boundaries, not wording, headings, comments, or file layout.
This is settled after prose tests created noise without proving safety.
Strongest source: [Archive, `.specs/archive/rationalization/ledger.md`; Archive, `.specs/archive/workflow-test-rationalization/summary.md`]

### Safety fails closed on uncertainty

Ambiguous parsing, unsupported syntax, unproven provenance, missing policy, invalid secrets, or unsafe cross-persona promotion must stop or ask rather than silently proceed.
This is settled because raw strings and model guesses cannot establish safe authority.
Strongest source: [Pi, `pi/README.md:296-317`; Archive, `.specs/research/damage-control-gap-analysis.md`]

### Privacy is structural

Use redaction, persona partitions, least privilege, ephemeral secrets, bounded metadata, and pointer-based notifications instead of recording prompts, paths, secrets, or transcripts unnecessarily.
This is settled because agent telemetry and memory are sensitive by default.
Strongest source: [Active, `.specs/menos-knowledge-compiler/plan.md`; Onclave, `onclave/docs/PRDS/mobile-agent-comms-app-PRD.md`]

### Local-first does not mean one monolith

Pi is the coding workflow control plane, Menos is durable knowledge, Onclave is trusted communication, Git is the handoff boundary, and homelab services are specialized backends.
This is settled because specialization with explicit contracts is preferred over reimplementing every capability inside Pi.
Strongest source: [Vault, `agent-workflows/AGENTS.md`; Onclave, `onclave/docs/PRDS/2026-07-26-homelab-platform-architecture-PRD.md`]

### Incubate before platformizing

New AI services prove value in Onclave or a bounded local slice before graduating into the broader app catalog.
This is settled because broad platform abstractions before use create duplicate control planes and operational debt.
Strongest source: [Onclave, `onclave/docs/PRDS/2026-07-26-homelab-platform-architecture-PRD.md`]

## 3. Consolidated future view

### Agent orchestration and durable work

**Current state:** Pi has durable tasks, dependency tracking, compaction handoff, parent-controlled worker correlation, and bounded subagent modes.
Source: [Pi, `pi/README.md:579-594`; Active, `.specs/pi-durable-work-activation/plan.md`]

**Agreed direction:** Keep one optional durable task graph and evolve from intent toward lifecycle correlation, attempts, artifacts, recovery, and freshness only when actual recovery failures justify each addition.
Source: [Vault, `agent-workflows/workflow-ideas/durable-task-dependency-systems.md`; Active, `.specs/pi-workflow-refinement/notes.md`]

**Evidence gates:** Measure missed durable activation after compaction before adding lifecycle IDs; measure repeated parent relay cost before worker messaging; measure recovery failures before claims, leases, retries, or durable attempts.
Source: [Active, `.specs/pi-durable-work-activation/plan.md`; Active, `.specs/archive/pi-extension-refactors/backlog.md`; Vault, `agent-workflows/workflow-ideas/durable-task-dependency-systems.md`]

### Knowledge and memory through Menos

**Current state:** Menos is the intended single durable memory backend, while Pi local expertise remains a non-agent-facing local retrieval layer.
Source: [Active, `.specs/menos-knowledge-compiler/plan.md`; Pi, `pi/docs/expertise-layering.md:23-45`]

**Agreed direction:** Capture redacted session summaries into Menos, partition by work, workflow, hobby, and shared personas, compile concepts conservatively, inspect previews, and enable live injection only after review.
Source: [Active, `.specs/menos-knowledge-compiler/plan.md`; Vault, `agent-workflows/workflow-ideas/menos-knowledge-compiler.md`]

**Evidence gates:** Repair or explicitly accept current retrieval quality before using it as a preservation baseline; collect 10-20 sessions before preview; collect roughly 200 logs before considering clustering; require persona-leakage, relevance, latency, and injection-preview evidence before live use.
Source: [Active, `.specs/menos-knowledge-compiler/eval-baseline-pre.md`; Active, `.specs/menos-knowledge-compiler/plan.md`]

### Agent-to-agent communication through Onclave

**Current state:** V1 secure LAN messaging is complete; V2 broker-backed messaging is implemented on a feature branch with same-host acceptance but incomplete cross-host and hardening evidence.
Source: [Onclave, `onclave/docs/extensions/onclave-comms/status.md`; Onclave, `onclave/docs/extensions/onclave-comms/v2-status.md`]

**Agreed direction:** Onclave becomes the trusted communication fabric, not Pi's local task scheduler; adapters deliver session-specific work while the core owns durable messaging, policy, budgets, correlation, and audit.
Source: [Onclave, `onclave/docs/extensions/onclave-comms/v2-PRD.md`; Onclave, `onclave/README.md`]

**Evidence gates:** Complete cross-host verification, TLS, policy reload, delegation execution, and per-adapter credentials before declaring V2 production-ready; retain V1 until V2 parity is proven.
Source: [Onclave, `onclave/docs/extensions/onclave-comms/v2-status.md`; Onclave, `onclave/README.md`]

### Workflow commands and skills

**Current state:** Pi command ownership is established: prompt-only behavior belongs in prompt templates, reusable guidance in skills, and stateful or lifecycle behavior in TypeScript extensions.
Source: [Pi, `pi/extensions/README.md:68-83`; Pi, `pi/skills/workflow/plan-it.md`]

**Agreed direction:** Retain `/goal`, `/plan-it`, `/review-it`, and `/do-it` as distinct lifecycle owners until evidence supports reducing user-facing steps; use existing skill owners rather than creating generic skill or policy layers.
Source: [Active, `.specs/pi-workflow-refinement/notes.md`; Active, `.specs/writing-quality-skill-layering/plan.md`]

**Evidence gates:** Measure review yield, duplicates, false positives, readiness changes, cost, duration, and execution failures before adaptive review or command consolidation; complete live interactive checks before closing writing-skill layering.
Source: [Active, `.specs/pi-workflow-refinement/notes.md`; Active, `.specs/writing-quality-skill-layering/plan.md`]

### Safety and trust

**Current state:** Pi damage control and safe-edit boundaries are active; Onclave supports explicit trust, bounded metadata, and signed scoped delegation design; sandboxing remains a planned high-risk path.
Source: [Pi, `pi/README.md:296-317`; Onclave, `onclave/docs/extensions/onclave-comms/decisions.md`; Active, `.specs/multipass-yolo-workflows/plan.md`]

**Agreed direction:** Preserve client-owned Pi safety, use Onclave for transport and delegation trust, keep human approval for privileged actions, and isolate bypass-permission work in a no-host-mount VM.
Source: [Archive, `.specs/archive/rationalization-phase5/plan.md`; Onclave, `onclave/docs/PRDS/agentic-software-factory-PRD.md`; Active, `.specs/multipass-yolo-workflows/plan.md`]

**Evidence gates:** Shadow judging requires at least 100 events, 95 percent agreement, and zero dangerous judge-allows before authority changes; Multipass requires enforceable mount, secret, network, receipt, and teardown policy gates before use.
Source: [Pi, `pi/README.md:312-317`; Active, `.specs/multipass-yolo-workflows/plan.md`]

### Observability and improvement

**Current state:** Pi emits local, bounded, mostly metadata-only telemetry for workflow, routing, orchestration, safety, quality gates, cost, and friction review.
Source: [Pi, `pi/lib/metrics.ts:1-25`; Pi, `pi/README.md:457-489`]

**Agreed direction:** Use an auditable loop of observe, select, review, aggregate, discuss, approve, change, and remeasure; keep raw prompts and full responses outside long-lived default telemetry.
Source: [Active, `.specs/archive/pi-workflow-friction-review/design.md`; Vault, `agent-workflows/patterns/pi-observability-timing.md`]

**Evidence gates:** Do not claim savings without matched cohorts; do not treat structural experiment validation as quality proof; add retention only when a concrete retention policy and operational owner are chosen.
Source: [Pi, `pi/docs/orchestration-telemetry.md:156-172`; Pi, `pi/docs/orchestration-telemetry.md:264-268`; Pi, `pi/README.md:485`]

### Infrastructure and homelab

**Current state:** Homelab infrastructure, Onramp application lifecycle, Joyride DNS, Caddy ingress direction, BWS secrets, and Onclave incubation have defined intended ownership boundaries.
Source: [Repos, `C:/projects/Personal/homelab-infra/README.md`; Onclave, `onclave/docs/PRDS/2026-07-26-homelab-platform-architecture-PRD.md`]

**Agreed direction:** Keep deployment contracts host-neutral, use plan-first app operations, graduate proven services into the app platform, and migrate container supervision through one-service canaries with explicit backup and rollback boundaries.
Source: [Onclave, `onclave/deploy/app/onclave/README.md`; Repos, `C:/projects/Personal/onramp-vNext/README.md`; Active, `.specs/rootless-podman-quadlet-hardening/plan.md`]

**Evidence gates:** Reconcile secret-provider and Menos storage ownership before further deployment work; prove backup and restore before live state changes; validate the canary endpoint and state before moving the next service.
Source: [Onclave, `onclave/docs/PRDS/2026-07-26-homelab-platform-architecture-PRD.md`; Active, `.specs/rootless-podman-quadlet-hardening/plan.md`]

### Multi-client story

**Current state:** Pi is the primary customized runtime; Claude Code is the first Menos capture client; OpenCode, Chud, Pi Mono, and Claude source are comparison, fork, or research surfaces.
Source: [Pi, `pi/README.md`; Active, `.specs/menos-knowledge-compiler/plan.md`; Repos, `C:/projects/Personal/chudnovsky/README.md`]

**Agreed direction:** Share durable backend contracts and reviewed knowledge where useful, but do not force feature parity or a shared damage-control policy across clients; Pi remains the canonical workflow implementation surface.
Source: [Archive, `.specs/archive/pi-platform-alignment/plan.md`; Archive, `.specs/archive/rationalization-phase5/plan.md`; Vault, `agent-workflows/workflow-ideas/specs-workflow-trajectory.md`]

**Evidence gates:** Promote an alternate runtime only after it demonstrates a distinct sustained benefit; add cross-client bridges only after communication, authorization, privacy, and operator ownership are explicit.
Source: [Repos, `C:/projects/Personal/chudnovsky/PRD.md`; Onclave, `onclave/docs/PRDS/openclaw-hermes-integration-PRD.md`]

## 4. Idea ledger

| Idea | Description | Status | Locations | Gate |
| --- | --- | --- | --- | --- |
| Shared lifecycle identity | Correlate goal, plan, review, execution, artifacts, and terminal outcome. | evidence-gated | Active: `.specs/pi-workflow-refinement/notes.md`; Vault: `durable-task-dependency-systems.md` | Measure compaction and recovery misses first. |
| Goal closeout report | Produce outcome, artifacts, validation, gaps, and exact next action when a goal ends. | parked | Vault: `goal-closeout-handoff.md` | Avoid duplicating `/do-it` and task authority. |
| Durable attempt ledger | Record bounded task attempts, artifacts, validations, and acceptance decisions. | evidence-gated | Vault: `durable-task-dependency-systems.md` | Repeated recovery or provenance failures. |
| Artifact manifests | Make handoff, validation, review, and final artifacts first-class and resumable. | parked | Vault: `pipelines-and-policies.md` | Demonstrate that existing plan and task state is insufficient. |
| Task rehydration | Deterministically reconstruct remaining work after reload or compaction. | evidence-gated | Vault: `durable-task-dependency-systems.md` | Show current handoff and task inspection fail. |
| Stale-result detection | Reject worker results produced against obsolete task or plan state. | parked | Vault: `durable-task-dependency-systems.md` | Evidence of stale concurrent results. |
| Typed dependency outcomes | Add richer dependency result semantics beyond terminal state. | parked | Vault: `durable-task-dependency-systems.md` | Evidence that current dependencies block correct recovery. |
| Resource keys and admission | Serialize overlapping writers through explicit resource ownership. | parked | Vault: `durable-task-dependency-systems.md` | Repeated writer contention beyond occupancy warnings. |
| Durable claims and leases | Add restart-safe task claims for concurrent agents. | evidence-gated | Vault: `durable-task-dependency-systems.md`; Archive: `pi-task-dag-runner/plan.md` | Measured need outweighs at-least-once mutation risk. |
| Parent-independent execution | Let a durable system resume selected work without a live parent. | parked | Vault: `durable-task-dependency-systems.md` | Explicit authorization and recovery model. |
| Worker-to-worker messages | Exchange small structured worker messages through durable task primitives. | evidence-gated | Active: `.specs/archive/pi-extension-refactors/backlog.md` | Claims, dependency unblocking, notifications, artifacts, and recurring value. |
| Typed stage contracts | Generate bounded tool, evidence, retry, and stop-condition contracts. | parked | Active: `.specs/pi-workflow-refinement/notes.md` | Stable repeated stage shape. |
| Hosted tool-calling orchestration | Evaluate provider-hosted orchestration against local Pi artifacts. | parked | Active: `.specs/pi-workflow-refinement/notes.md` | Show improvement over local inspectable execution. |
| Adaptive review composition | Select reviewers from measured risk and complexity rather than fixed panels. | evidence-gated | Active: `.specs/pi-workflow-refinement/notes.md`; Vault: `adaptive-plan-review-telemetry.md` | Yield, duplicate, false-positive, cost, and failure evidence. |
| Embedded plan review | Fold suitable review into `/plan-it` and reduce command count. | evidence-gated | Vault: `adaptive-plan-review-telemetry.md` | Safe reviewer policy established from telemetry. |
| Reviewer-quality evaluation | Measure reviewer value, corrections, and false positives. | in-progress | Active: `.specs/archive/pi-workflow-friction-review/design.md` | Sufficient reviewed interactions and user corrections. |
| Friction review retention | Define deletion and retention for persistent friction metadata. | parked | Active: `.specs/archive/pi-workflow-friction-review/design.md` | Choose privacy policy and owner. |
| Manual interaction capture | Select a completed interaction for the background review queue. | superseded | Active: `.specs/archive/pi-workflow-friction-review/design.md`; Pi: `pi/README.md` | Replaced by `/improve`. |
| Workflow evaluation suite | Create representative durable cases for prompt and reviewer changes. | parked | Active: `.specs/pi-workflow-refinement/notes.md` | Select cases and measurable outcomes. |
| Prompt deduplication evaluation | Remove duplicated prompt groups incrementally. | evidence-gated | Active: `.specs/pi-workflow-refinement/notes.md` | Representative evaluations after each removal. |
| Contextual UI validation | Replace generic visual prescriptions with project-context and browser evidence. | settled direction | Active: `.specs/pi-workflow-refinement/notes.md` | UI changes require rendered evidence. |
| Visual regression tooling | Add screenshots or Lighthouse only where supported or explicitly scoped. | parked | Active: `.specs/pi-workflow-refinement/notes.md` | Existing repository support or explicit scope. |
| Writing-skill completion | Finish live verification for layered prose and requirements guidance. | in-progress | Active: `.specs/writing-quality-skill-layering/plan.md` | Reloaded interactive Pi session. |
| Broad writing skill | Add a universal writing command, linter, or always-loaded policy. | abandoned | Active: `.specs/writing-quality-skill-layering/plan.md` | Replaced by existing skill owners. |
| Platform packs | Package platform rules, examples, skills, and validation before MCP automation. | parked | Vault: `agent-friendly-platforms.md` | Repeated platform pain and stable guidance. |
| Reviewed helper proposals | Allow proposed narrow helpers behind review and focused validation. | parked | Vault: `self-healing-harnesses.md` | Human review and focused contract check. |
| Workflow recipes | Define reusable bounded task decomposition, artifacts, and validation recipes. | parked | Vault: `pipelines-and-policies.md` | Must not become a competing scheduler. |
| Policy-check artifacts | Attach deterministic policy evidence and waivers to existing workflows. | parked | Vault: `pipelines-and-policies.md` | Start with one small attached artifact. |
| Provider-neutral code intelligence | Expose definitions, references, callers, diagnostics, and architecture data behind a common interface. | parked | Vault: `code-intelligence.md` | Freshness, privacy, and backend availability contract. |
| Graphify pilot | Use Graphify for first architecture orientation in mixed-content repositories. | evidence-gated | Vault: `code-intelligence.md` | Prove orientation value before core dependency. |
| SCIP backend | Add a precise symbol backend after provider abstraction exists. | parked | Vault: `code-intelligence.md` | Need for precision beyond pilot. |
| DuckDB analytics | Use DuckDB as a rebuildable analysis layer over JSONL. | evidence-gated | Vault: `duckdb-for-pi-usage-analytics.md` | Fixed parsers repeatedly insufficient. |
| Router local outcomes | Collect privacy-safe validation, repair, correction, and override outcomes. | parked | Vault: `workflow-data-collection.md` | Retention and schema decision. |
| Router corpus promotion | Promote reviewed route-balanced data through a controlled production path. | evidence-gated | Vault: `prompt-router/current-status.md`; `next-steps.md` | Provenance, balance, reproducible validation, production gate. |
| Router sidecar triage | Use NVIDIA, kNN, or taxonomy only to prioritize review. | parked | Vault: `triage-sidecar-results.md` | Never direct route assignment. |
| Router GPU batch | Test whether full GPU classifier batches improve review yield. | parked | Vault: `nvidia-complexity-scorer.md` | Demonstrate value beyond skew and latency. |
| Semantic local embedder | Replace placeholder expertise embedding only if quality demands it. | evidence-gated | Archive: `pi-memory-retrieval/embedder.md`; `pi-memory-followups/backend-decision.md` | Retrieval threshold justifies cost. |
| Expertise migration | Complete deferred migration after dynamic instruction loading. | parked | Archive: `agents-context-loading/phase-2-expertise-migration.md` | Reassess against Menos direction. |
| Menos session capture | Capture redacted session summaries, context, metrics, tags, and client identity. | in-progress | Active: `.specs/menos-knowledge-compiler/plan.md` | Privacy review and capture implementation. |
| Persona partitioning | Separate work, workflow, hobby, and limited shared memory. | in-progress | Active: `.specs/menos-knowledge-compiler/plan.md` | Verify no cross-persona leakage. |
| Menos preview injection | Preview retrieved concepts before live prompt injection. | evidence-gated | Active: `.specs/menos-knowledge-compiler/plan.md`; Vault: `menos-knowledge-compiler.md` | 10-20 captured sessions and review. |
| Live Menos injection | Inject selected compiled memory into client sessions. | evidence-gated | Active: `.specs/menos-knowledge-compiler/plan.md` | Preview quality, persona isolation, relevance, and consent. |
| Nightly concept compiler | Compile recent session logs into project and workflow concepts. | in-progress | Active: `.specs/menos-knowledge-compiler/plan.md` | Shared write path and retrieval baseline. |
| Concept deduplication calibration | Calibrate embedding similarity thresholds from labeled concept pairs. | evidence-gated | Active: `.specs/menos-knowledge-compiler/plan.md` | Hand-labeled calibration set. |
| Compiler clustering | Move from LLM-only extraction to UMAP plus HDBSCAN if useful. | evidence-gated | Active: `.specs/menos-knowledge-compiler/plan.md` | About 200 logs and lower duplication without regression. |
| Time-decay ranking | Add optional recency weighting without changing default search. | parked | Active: `.specs/menos-knowledge-compiler/plan.md` | Retrieval evaluation. |
| Memory lint and digests | Detect vault quality issues and create persona-aware weekly digests. | parked | Active: `.specs/menos-knowledge-compiler/plan.md` | Capture, compile, and preview prove sufficient value. |
| Research ingestion into Menos | Store research outputs with versioning, embeddings, sources, and links. | parked | Archive: `.specs/research/menos-research-integration-plan.md` | Reconcile with compiler and content contracts. |
| Visual media inspection | Add bounded yt-dlp and ffmpeg inspection beside `/yt` and Menos. | planned | Active: `.specs/ffmpeg-yt-dlp-video-workflow/PRD.md` | Select Pi or shared ownership and frame budgets. |
| Persisted visual summaries | Store explicit visual-summary Markdown rather than frames. | parked | Active: `.specs/ffmpeg-yt-dlp-video-workflow/PRD.md` | Choose content type and persona policy. |
| Hermes deployment | Deploy one secure Hermes runtime, gateway, webhook, and Kanban proof. | planned | Active: `.specs/hermes-deploy/PRD.md` | Select host, providers, use case, and exposure model. |
| Hermes hybrid gateway | Combine broad messaging gateway with Hermes execution if needed. | evidence-gated | Active: `.specs/hermes-deploy/PRD.md` | Channel requirements exceed Hermes-native integrations. |
| Hermes-Onclave bridge | Register Hermes through the trusted Onclave fabric. | planned | Onclave: `openclaw-hermes-integration-PRD.md` | Complete reviewed adapter and authorization contract. |
| Onclave V2 production hardening | Finish cross-host, TLS, policy, delegation, and adapter-user validation. | in-progress | Onclave: `v2-status.md` | Complete listed verification gaps. |
| Onclave V1 retirement | Retire frozen V1 once V2 parity is proven. | evidence-gated | Onclave: `onclave/README.md`; `v2-PRD.md` | V2 parity. |
| Onclave trust UX | Add list, remove, request, approve, and deny workflows. | parked | Onclave: `trust-ux-future.md` | Reconcile with V2 credentials and grants. |
| Observer subscriptions | Add authenticated event subscriptions with cursors, leases, replay, and audit. | planned | Onclave: `observer-subscriptions-PRD.md` | Map API onto RabbitMQ without leaking broker details. |
| Mobile operator client | Build a tailnet-private structured approvals and audit client. | planned | Onclave: `mobile-agent-comms-app-PRD.md` | Choose gateway, stack, and biometric policy. |
| Aperture and ai-guard | Add private LLM gateway policy and local tool authorization. | planned | Onclave: `tailscale-aperture-guardrails-PRD.md` | Define authority boundary with Pi safety and approval. |
| Factory coordinator | Build Onclave software-factory intake, planning, implementation, testing, and review coordination. | planned | Onclave: `agentic-software-factory-PRD.md` | Select first narrow factory workflow and state owner. |
| Menos agentic search | Add coordinator-owned retrieval and tool-less reasoning workers. | parked | Onclave: `docs/menos/specs/orchestrator.md` | Resolve current Menos storage and deployment architecture. |
| Menos preference learning | Learn recommendations and application suggestions from durable signals. | parked | Onclave: `docs/menos/backlog/discussions-needed.md` | Establish quality and feedback evaluation. |
| Menos UI roadmap | Add history, projects, canvas, styles, global memory, web search, sandboxing, and images. | parked | Onclave: `docs/menos/specs/ui-roadmap.md` | Agentic search remains higher priority. |
| Infisical deployment | Deploy self-hosted Infisical with machine identities, backups, and restore proof. | in-progress | Active: `.specs/archive/infisical-secrets/plan.md` | Live deployment and restore drill. |
| Infisical DNS and certificates | Configure Joyride, Cloudflare DNS-01, and Caddy TLS for Infisical. | in-progress | Active: `.specs/archive/infisical-dns-certs/plan.md` | DNS, token, staging, production certificate, HTTPS proof. |
| Menos Infisical runtime | Render Menos `.env` atomically at deploy time from Infisical. | in-progress | Active: `.specs/archive/menos-infisical-runtime/plan.md` | T7 wrappers, live deploy, redeploy proof. |
| Docker secrets migration | Replace rendered `.env` only after runtime rendering stabilizes. | parked | Active: `.specs/archive/menos-infisical-runtime/plan.md` | Stable initial migration. |
| Quadlet migration | Replace rootless podman-compose wrappers with role-based Quadlets. | planned | Active: `.specs/rootless-podman-quadlet-hardening/plan.md` | Backup, restore path, staging validation, Menos canary. |
| Multipass YOLO workflow | Run high-risk autonomous work inside cloned-repository VMs with no host mounts. | planned | Active: `.specs/multipass-yolo-workflows/plan.md`; Vault: `multipass-yolo-sandboxes.md` | Windows driver, egress, secret, receipt, teardown policy. |
| Nested sandbox containers | Add Docker or devcontainers inside Multipass for higher-risk work. | parked | Active: `.specs/multipass-yolo-workflows/plan.md` | Task risk justifies added layer. |
| Complexity risk framework | Normalize native Go, Python, TypeScript, and JavaScript complexity and risk tools. | planned | Active: `.specs/complexity-risk-gates/PRD.md` | Pick host repo, analyzers, thresholds, fixtures. |
| Complexity MCP surface | Expose complexity through structured MCP after core local checks. | parked | Active: `.specs/complexity-risk-gates/PRD.md` | Native adapters and JSON schema stable. |
| Coverage-risk joins | Add language-specific coverage and CRAP-style risk after basic checks. | parked | Active: `.specs/complexity-risk-gates/PRD.md` | Native complexity MVP stable. |
| Arch Niri desktop | Build keyboard-driven Niri workspaces around independent git worktree projects. | parked | Active: `.specs/archive/linux-arch-install/checklist.md` | Revalidate stale packages, device names, paths, and target. |
| Keyboard coaching | Instrument keyboard habits with event metrics, reports, and prompts. | parked | Active: `.specs/archive/linux-arch-install/keyboard-training.md` | Confirm desktop initiative remains active. |
| Zed and LazyVim trial | Prefer Zed initially and evaluate LazyVim later. | parked | Active: `.specs/archive/linux-arch-install/editor-alternatives.md` | Confirm desktop direction. |
| Low-VRAM local LLM runtime | Run local models under constrained VRAM. | abandoned | Archive: `.specs/archive/low-vram-local-llm-runtime/PRD.md` | No successor plan. |
| Zellij cockpit | Build a Windows Pi cockpit before advanced agent management. | abandoned | Archive: `.specs/archive/zellij-windows-cockpit-v1/plan.md` | Dormant with no successor. |
| Zellij agent manager | Add persistent sessions, roster, and workspace coordination. | superseded | Archive: `.specs/archive/zellij-windows-cockpit-v1/extra-notes.md` | Requires simple cockpit first, which is dormant. |
| Session-budget expansion | Add time, tool-count, and other watchdog sensors. | abandoned | Archive: `.specs/archive/pi-session-budget/plan.md`; Pi: `pi/docs/session-budget.md` | Existing rejected sensors need new evidence. |
| Broad Pi setup refactor | Broadly split and reorganize Pi setup. | superseded | Archive: `.specs/archive/pi-setup-refactor/plan.md` | Narrower consistency and rationalization work replaced it. |
| Broad Pi-Claude parity | Pursue undifferentiated feature parity. | abandoned | Archive: `.specs/archive/pi-claude-parity/plan.md`; `pi-platform-alignment/plan.md` | Native targeted capability alignment is preferred. |
| Pi prompt cleanup | Broadly clean prompt content. | superseded | Archive: `.specs/archive/pi-prompt-cleanup/plan.md` | Rationalization and current workflow contracts supersede it. |
| Lizard repository refactor | Reduce complexity repo-wide through Lizard. | superseded | Archive: `.specs/archive/lizard-refactor/plan.md`; Active: `.specs/complexity-risk-gates/PRD.md` | Changed-code native adapters replace broad legacy cleanup. |
| Model-assisted expertise similarity | Add model tie-breaking for expertise retrieval. | superseded | Archive: `.specs/archive/pi-expertise-similarity/plan.md` | Menos and JSONL retrieval direction changed the path. |
| Expertise snapshotting | Create deterministic expertise snapshots. | superseded | Archive: `.specs/archive/pi-expertise-snapshotting/plan.md` | Later JSONL retrieval and Menos direction. |
| Router training corpus | Complete a route-level training corpus. | parked | Archive: `.specs/archive/pi-router-training-data/plan.md` | Reviewed data and production promotion gates. |
| Model-generated tool reduction | Generate reducer rules, novelty detection, and classifier routing. | evidence-gated | Archive: `.specs/archive/pi-tool-reduction/plan.md` | Diverse corpus proves value; hot path stays deterministic. |
| Dolos commit auto-pack | Couple private archive packing to `/commit`. | parked | Archive: `.specs/archive/dolos-private-archive/plan.md` | Dogfood standalone archive operations first. |
| Birdclaw integration | Import and export X research through Birdclaw. | parked | Archive: `.specs/archive/x-research-pipeline/reuse-decision.md` | Stabilize X pipeline first. |
| X research graph | Operate provider-neutral, read-only X ingestion backed by Menos. | in-progress | Vault: `x-research-pipeline.md`; Archive: `.specs/archive/x-research-pipeline/plan.md` | Provider, proxy, account-health, legal, and secret operations. |
| Provenance temp cleanup | Automatically downgrade safe temporary cleanup based on proof. | evidence-gated | Archive: `.specs/research/damage-control-temp-cleanup-prior-art.md` | Structured provenance and telemetry. |
| Serapis env vault | Build a zero-knowledge self-hosted `.env` vault. | abandoned | Archive: `.specs/archive/serapis-env-vault/PRD.md` | Superseded in practice by current secret directions. |
| Secure LAN mobile follow-on | Extend LAN messaging with mobile clients. | superseded | Archive: `.specs/archive/secure-lan-pi-coms/mobile-agent-comms-app-PRD.md`; Onclave: `mobile-agent-comms-app-PRD.md` | Onclave V2 mobile design is current successor. |
| Secure LAN observers | Add observer subscriptions to LAN messaging. | superseded | Archive: `.specs/archive/secure-lan-pi-coms/observer-subscriptions-PRD.md`; Onclave: `observer-subscriptions-PRD.md` | Onclave V2 substrate decision. |
| Secure LAN Hermes bridge | Bridge OpenClaw and Hermes into secure messaging. | superseded | Archive: `.specs/archive/secure-lan-pi-coms/openclaw-hermes-integration-PRD.md`; Onclave: `openclaw-hermes-integration-PRD.md` | Onclave V2 adapter contract. |
| MSYS2 remediation follow-ons | Upstream patch, enforce Git pin, unify Git, and verify post-upgrade DLL. | parked | Archive: `.specs/features/msys2-bash-crash/context.md` | Recurrent crash evidence or managed remediation decision. |
| Conservative `/init` | Generate concise evidence-derived `AGENTS.md` updates without replacement. | parked | Archive: `.specs/research/agents-md-init-command.md` | Preserve user content and inferable policy. |
| Chud terminal assistant | Develop a compact Go coding assistant and terminal UX laboratory. | in-progress | Repos: `C:/projects/Personal/chudnovsky/PRD.md` | Decide production role versus research role. |
| Chud graph execution model | Add execution graphs, context retrieval, conflicts, replay, and audit. | parked | Repos: `C:/projects/Personal/chudnovsky/PRD.md` | Establish distinct value beyond Pi. |
| Mentat workspace manager | Build agent-worktree-editor-terminal review workspaces. | abandoned | Repos: `C:/projects/Personal/mentat-spike/docs/agentic-workflow-vision.md` | Only early proof exists; no canonical desktop direction. |
| Deltos desktop variants | Continue Go, Rust, Electron, or agent-first desktop editor experiments. | abandoned | Repos: `deltos-editor`, `deltos-rust`, `deltos-electron-spike` | Select one canonical user problem first. |
| Onboard presentation surface | Retain Onboard as content discovery and feedback UI over extracted services. | parked | Repos: `C:/projects/Personal/onboard/.spec/features/personalization/PRD.md` | Clarify current product ownership and Menos backend contract. |
| Lakebed capsules | Infer infrastructure and runtime capabilities from agent-native code capsules. | parked | Repos: `C:/projects/Personal/onramp-vNext/docs/prd/lakebed-backend-architecture-prd.md` | Prove Onramp vNext core operations first. |
| Prosorini artifact proxy | Operate a unified package registry proxy and cache. | parked | Repos: `C:/projects/Personal/prosorini-artifact-proxy/docker-compose.yml` | Establish concrete availability, integrity, or cache need. |
| OnPrem federation | Build Radicle federation and mirror infrastructure. | parked | Repos: `C:/projects/Personal/OnPrem/` | Decide relation to Forgejo and homelab. |
| Claude source refresh | Establish provenance and refresh process for Claude source snapshots. | parked | Repos: `C:/projects/Personal/claude-src/` | Identify version and legitimate refresh boundary. |

## 5. Retired directions

### Mixed task DAG runner

The mixed task runner combined durable task state with execution, waiting, output, and scheduling behavior.
It was replaced by a durable task boundary where the parent and worker surfaces retain execution authority.
Lesson: task persistence and process orchestration must not share ambiguous lifecycle ownership.
Source: [Vault, `agent-workflows/workflow-ideas/durable-task-dependency-systems.md`; Active, `.specs/archive/pi-task-todo-boundary/plan.md`]

### Fixed multi-reviewer panels

Fixed reviewer fan-out and automatic re-review created duplicate findings and self-sustaining review churn.
The replacement is one proportional pass, evidence verification, supported repair once, and another review only when explicitly requested.
Lesson: reviewer count is an experiment variable, not a permanent workflow ritual.
Source: [Archive, `.specs/archive/workflow-test-rationalization/summary.md`]

### Agent organization charts and model-tier agents

Role hierarchies, reporting lines, and model-size-specific agent files were removed because launcher behavior did not enforce them.
Capability boundaries survive; model and effort are runtime dispatch settings.
Lesson: advisory metadata that looks authoritative is worse than no metadata.
Source: [Archive, `.specs/archive/rationalization/roster.md`; `.specs/archive/rationalization-phase3/plan.md`]

### The separate `/team` command

A standalone team command was removed after team dispatch semantics moved into `subagent`.
Lesson: do not preserve aliases for a retired control plane merely to maintain conceptual compatibility.
Source: [Archive, `.specs/archive/pi-control-plane-consolidation/plan.md`]

### Separate todo and task tool families

Separate todo and model-facing task tools were consolidated into one task model and operator UI.
Lesson: one canonical durable state model is preferable to parallel representations.
Source: [Archive, `.specs/archive/pi-orchestration-follow-ups/note.md`]

### TypeScript `/handoff`

A Markdown-only handoff command moved from TypeScript into a native prompt template.
Lesson: static prompt behavior belongs in prompt templates; TypeScript is for stateful or logic-heavy behavior.
Source: [Archive, `.specs/archive/pi-command-workflow/plan.md`; Pi, `pi/extensions/README.md:68-83`]

### Model-narrated telemetry

Schema-shaped prose was retired because it was not mechanically emitted or consumed runtime telemetry.
Lesson: telemetry must be written by the system that observes the event.
Source: [Archive, `.specs/archive/rationalization-phase2/ledger.md`]

### Prose and source-text tests

Tests for prompt wording, headings, comments, source spelling, and layout were removed.
Lesson: verify executable contracts and use durable documentation for policy intent.
Source: [Archive, `.specs/archive/rationalization/ledger.md`]

### Ingestion-time tool-result reduction

Reducing fresh tool output before its first model-visible turn destroyed evidence.
The replacement preserves recent output until actual context pressure requires reduction.
Lesson: compaction must not erase evidence before reasoning can use it.
Source: [Archive, `.specs/archive/rationalization-phase2/ledger.md`]

### Per-call reducer startup

One-shot reducer startup was replaced with a persistent worker after measured latency showed a major advantage.
Lesson: performance-sensitive repeat work should use measured lifecycle design.
Source: [Archive, `.specs/archive/rationalization-phase2/ledger.md`]

### Automatic subagent worktrees

Automatic per-subagent worktrees were rejected because of merge ceremony, setup drift, submodules, and unsafe symlink behavior.
Lesson: use explicit worktrees for genuinely independent work, plus occupancy warnings for shared workspaces.
Source: [Archive, `.specs/research/claude-code-worktree.md`; `.specs/archive/rationalization-phase3/plan.md`]

### Shared Pi and Claude damage-control policy

A cross-client policy port was closed without implementation.
Lesson: client-native safety telemetry and evaluation are preferable to forced policy-source unification.
Source: [Archive, `.specs/archive/rationalization-phase5/plan.md`]

### Broad parity as a product goal

Undifferentiated Pi and Claude parity gave way to targeted capability alignment and native architecture.
Lesson: borrow proven ergonomics without importing another product's control plane.
Source: [Archive, `.specs/archive/pi-platform-alignment/plan.md`; `.specs/archive/pi-claude-parity/plan.md`]

### Per-file private encryption

Per-file encryption was replaced by whole-archive encryption and then by Dolos.
Lesson: explicit archive transactions beat sprawling path-mapping rules.
Source: [Archive, `.specs/archive/private-encrypted-workflow/plan.md`; `.specs/archive/dolos-private-archive/plan.md`]

### Low-VRAM local-model runtime

The constrained local-model runtime was archived as a dormant idea with no successor plan.
Lesson: do not maintain a deployment direction without an active operational need.
Source: [Archive, `.specs/archive/low-vram-local-llm-runtime/PRD.md`]

### Broad desktop cockpit directions

The Windows Zellij cockpit, advanced agent manager, and several desktop editor experiments remain dormant or abandoned.
Lesson: terminal status and durable artifacts are the preferred first answer to coordination friction.
Source: [Archive, `.specs/archive/zellij-windows-cockpit-v1/plan.md`; Vault, `agent-workflows/patterns/agent-terminal-workspaces.md`]

## 6. Contradictions and drift needing a decision

### Decision: Which repository owns app deployment now?

Choose whether `homelab-infra` and `onramp-vNext` are authoritative for Menos, Onclave, Infisical, and SearXNG deployment, then archive or migrate older direct Ansible plans.
Older active specs target Menos infrastructure paths, while newer platform documentation assigns application ownership elsewhere.
Source: [Active, `.specs/archive/menos-infisical-runtime/plan.md`; Active, `.specs/rootless-podman-quadlet-hardening/plan.md`; Onclave, `onclave/docs/PRDS/2026-07-26-homelab-platform-architecture-PRD.md`]

### Decision: What is the authoritative secret system?

DECIDED 2026-08-12: Bitwarden Secrets Manager wins as of now. Infisical specs (`.specs/archive/infisical-secrets/`, `.specs/archive/menos-infisical-runtime/`) should be treated as superseded for platform authority until explicitly revived.
Choose Bitwarden Secrets Manager as the current platform authority or explicitly retain Infisical as an active competing secret platform.
The newer homelab architecture names BWS, while active specs still plan Infisical deployment and Menos runtime rendering through it.
Source: [Onclave, `onclave/docs/PRDS/2026-07-26-homelab-platform-architecture-PRD.md`; Active, `.specs/archive/infisical-secrets/plan.md`; `.specs/archive/menos-infisical-runtime/plan.md`]

### Decision: Is Infisical deployed, disabled, or awaiting first deployment?

Record one current state before more Infisical or Menos runtime work proceeds.
The active plans describe pending live validation, the Menos runtime assumes a stable endpoint, and Quadlet planning excludes disabled Infisical.
Source: [Active, `.specs/archive/infisical-secrets/plan.md`; `.specs/archive/menos-infisical-runtime/plan.md`; `.specs/rootless-podman-quadlet-hardening/plan.md`]

### Decision: Which Menos database and deployment contract is authoritative?

DECIDED 2026-08-12: PostgreSQL plus S3-compatible storage wins as of now. SurrealDB guidance in menos implementation docs is historical and should be reconciled when touched.
Choose PostgreSQL plus S3-compatible storage or SurrealDB plus older object-storage assumptions, then reconcile architecture, backup, schema, and restore documentation.
Current portable deployment contracts specify PostgreSQL, while much Menos implementation guidance still specifies SurrealDB.
Source: [Onclave, `onclave/deploy/app/menos/env-contract.md`; Onclave, `onclave/services/menos/.claude/rules/architecture.md`; Repos, `C:/projects/Personal/menos/README.md`]

### Decision: What is the authoritative Menos compiler write path?

Choose direct shared-service invocation or an HTTP endpoint for compiler writes, then remove contradictory plan wording.
The same compiler plan specifies both approaches in different sections.
Source: [Active, `.specs/menos-knowledge-compiler/plan.md`, T4.0, T4.1, and Handoff Notes]

### Decision: How should retrieval snapshots handle latency?

Exclude live latency from byte-for-byte snapshots or compare it separately from result ordering and scores.
The plan asks for zero-diff snapshots while capturing variable endpoint latency.
Source: [Active, `.specs/menos-knowledge-compiler/plan.md`; `.specs/menos-knowledge-compiler/eval-baseline-pre.md`]

### Decision: Should retrieval quality be repaired before compiler work?

DECIDED 2026-08-12: Fix retrieval first, then reorder the compiler plan so retrieval repair (relevance, score calibration, latency, missing titles/metadata) is the first milestone. Compiler snapshot evals against the current saturated baseline are not acceptance evidence until retrieval discriminates.
Decide whether poor relevance, saturated scores, and high latency are blockers for compiler investment or accepted baseline conditions.
Preserving weak retrieval could make regression stability look like success.
Source: [Active, `.specs/menos-knowledge-compiler/eval-baseline-pre.md`; `.specs/menos-knowledge-compiler/plan.md`]

### Decision: Which Onclave checkout is canonical?

DECIDED 2026-08-12: The standalone checkout at `C:/projects/Personal/onclave` on `feature/v2-broker-core` is canonical. Plan: push its work, bring the `~/.dotfiles/onclave` submodule pin up to date, then remove the standalone copy so one checkout remains going forward. Until removal completes, treat the submodule as a consumer pin, not a development surface.
Choose the standalone Onclave checkout or the dotfiles submodule pin as the active source during V2 work, then synchronize deliberately.
Both track the same branch but point to different commits.
Source: [Repos, `C:/projects/Personal/onclave/.git/refs/heads/feature/v2-broker-core`; Repos, `C:/Users/mglenn/.dotfiles/.git/modules/onclave/refs/heads/feature/v2-broker-core`]

### Decision: Is RabbitMQ V2 the accepted Onclave substrate?

DECIDED 2026-08-12: RabbitMQ broker-backed V2 wins as of now. Older direct-hub and anti-broker PRDs are historical.
Mark older direct-hub and anti-broker PRDs as historical or rewrite them against the broker core.
V2 documentation describes RabbitMQ as implemented while older architecture documents reject it.
Source: [Onclave, `onclave/docs/extensions/onclave-comms/v2-status.md`; Onclave, `onclave/docs/PRDS/technology-stack-architecture-PRD.md`]

### Decision: How do observer subscriptions and mobile map to V2?

Redesign the observer and mobile contracts against V2 core and broker ownership instead of retaining V1 hub-mesh assumptions.
Both PRDs currently describe older topology.
Source: [Onclave, `onclave/docs/PRDS/observer-subscriptions-PRD.md`; `onclave/docs/PRDS/mobile-agent-comms-app-PRD.md`; `onclave/docs/extensions/onclave-comms/v2-PRD.md`]

### Decision: Is V1 trust UX still worth building?

Either implement trust-request UX for V1 or redesign equivalent workflows for V2 credentials and signed grants.
The existing proposal is tied to V1 keys and has not been reconciled with V2.
Source: [Onclave, `onclave/docs/extensions/onclave-comms/trust-ux-future.md`; `onclave/docs/extensions/onclave-comms/decisions.md`]

### Decision: What is Hermes relative to Pi and Herdr?

DECIDED 2026-08-12: Hermes is the homelab front door. Hermes owns inbound webhooks, external triggers, and always-on automation; Pi remains the interactive dev agent; onclave-comms carries agent-to-agent messages; Herdr stays a Pi terminal layer. Hermes' Kanban/task board must be reconciled with the Pi task registry before Hermes-driven work touches Pi-managed tasks.
Choose Hermes as a separate experimental runtime, homelab operator backend, selected-workflow backend, or future replacement for narrow workflows.
Herdr is explicitly a Pi terminal layer, while Hermes and Onclave describe broader automation roles without a settled boundary.
Source: [Active, `.specs/hermes-deploy/PRD.md`; Active, `.specs/archive/pi-herdr-full-integration/plan.md`; Onclave, `onclave/docs/PRDS/openclaw-hermes-integration-PRD.md`]

### Decision: Should Pi lifecycle identity be implemented now?

Choose whether current compaction and task linkage are sufficient or whether measured recovery failures justify shared lifecycle identity.
Completed durable-work scope explicitly deferred IDs, while workflow refinement proposes them next.
Source: [Active, `.specs/pi-durable-work-activation/plan.md`; `.specs/pi-workflow-refinement/notes.md`]

### Decision: What should count as completion for live Pi UI checks?

Decide whether plans may be complete with explicitly unavailable `/reload`, `/context`, or TUI checks, or whether those checks must be run before closure.
Several Pi plans differ in their treatment of unavailable live validation.
Source: [Active, `.specs/archive/pi-herdr-full-integration/plan.md`; `.specs/archive/pi-task-todo-boundary/plan.md`; `.specs/writing-quality-skill-layering/plan.md`]

### Decision: Which client owns video inspection?

Choose Pi-first `/yt` behavior, a shared script, or a cross-client skill before implementing visual inspection.
The active PRD leaves ownership open despite Pi-first runtime policy.
Source: [Active, `.specs/ffmpeg-yt-dlp-video-workflow/PRD.md`; Pi, `pi/AGENTS.md:36-40`]

### Decision: Is Arch Niri still active?

Either replace the stale desktop plan with a current validated target or archive it.
The plan has stale path references, generic device assumptions, and no execution evidence.
Source: [Active, `.specs/archive/linux-arch-install/checklist.md`; `.specs/archive/linux-arch-install/editor-alternatives.md`]

### Decision: Which alternate coding-agent projects remain active?

Classify Chud, OpenCode fork work, Mentat, Deltos variants, and Claude source as production candidates, research references, or retired experiments.
Current evidence establishes overlap but not portfolio roles.
Source: [Repos, `C:/projects/Personal/chudnovsky/PRD.md`; `C:/projects/Personal/mentat-spike/docs/agentic-workflow-vision.md`; `C:/projects/Personal/claude-src/`]

## 7. Open questions

1. What observed recovery failure would justify lifecycle IDs, attempt records, artifact manifests, claims, or parent-independent execution?
Source: [Vault, `agent-workflows/workflow-ideas/durable-task-dependency-systems.md`]

2. How many reviewed executions are enough to change `/review-it` composition or safely embed review within `/plan-it`?
Source: [Active, `.specs/pi-workflow-refinement/notes.md`; Vault, `adaptive-plan-review-telemetry.md`]

3. What counts as unique reviewer value: a unique finding, an applied fix, a readiness change, or a prevented execution failure?
Source: [Active, `.specs/pi-workflow-refinement/notes.md`]

4. Which representative workflows should become the durable evaluation suite for prompt, review, and orchestration changes?
Source: [Active, `.specs/pi-workflow-refinement/notes.md`]

5. How should friction-review retention, deletion, and operator access be governed while preserving useful longitudinal evidence?
Source: [Active, `.specs/archive/pi-workflow-friction-review/design.md`]

6. Which retrieval quality measure can distinguish stable poor Menos results from meaningful improvement after compilation?
Source: [Active, `.specs/menos-knowledge-compiler/eval-baseline-pre.md`; `.specs/menos-knowledge-compiler/plan.md`]

7. What privacy review and explicit consent model are required before default-allow session capture in work repositories?
Source: [Active, `.specs/menos-knowledge-compiler/plan.md`]

8. How should Pi expose persona selection, preview, status, and memory diagnostics without creating a second memory system?
Source: [Active, `.specs/menos-knowledge-compiler/plan.md`; Pi, `pi/docs/expertise-layering.md`]

9. What scheduler timezone and measured timeout contract should the Menos compiler use?
Source: [Active, `.specs/menos-knowledge-compiler/plan.md`]

10. What first narrow Onclave factory workflow should prove the broader software-factory concept?
Source: [Onclave, `onclave/docs/PRDS/agentic-software-factory-PRD.md`]

11. Does factory task state belong in `onclave-core` or in a separately registered coordinator?
Source: [Onclave, `onclave/docs/PRDS/agentic-software-factory-PRD.md`]

12. Should MCP-joined agents be local-only or globally addressable, and should a Hermes bridge run inside or beside the core?
Source: [Onclave, `onclave/docs/extensions/onclave-comms/v2-PRD.md`]

13. Which guardrail layer owns each decision among Aperture request controls, Pi tool authorization, repository policy, Onclave delegation, and human approval?
Source: [Onclave, `onclave/docs/PRDS/tailscale-aperture-guardrails-PRD.md`; Pi, `pi/README.md:296-317`]

14. What exact live backup and restore command must gate Quadlet migration?
Source: [Active, `.specs/rootless-podman-quadlet-hardening/plan.md`]

15. What Windows virtualization driver, egress restriction, and receipt format make Multipass YOLO operationally safe?
Source: [Active, `.specs/multipass-yolo-workflows/plan.md`]

16. Which repository should host the first complexity-gate implementation, and which thresholds are blocking rather than advisory?
Source: [Active, `.specs/complexity-risk-gates/PRD.md`]

17. Should the current reviewed router subset enter production-promotion dry run or wait for local outcome and override evidence?
Source: [Vault, `prompt-router/current-status.md`; `prompt-router/next-steps.md`]

18. Is Chud a production candidate, a Pi UX laboratory, or an independent fallback?
Source: [Repos, `C:/projects/Personal/chudnovsky/PRD.md`]

19. Is Onboard still the intended content-discovery UI, and is Menos its canonical backend?
Source: [Repos, `C:/projects/Personal/onboard/README.md`; `C:/projects/Personal/homelab-infra/docs/agent-platform-design-handoff.md`]

20. What exact provenance and refresh process should govern the `claude-src` reference snapshot?
Source: [Repos, `C:/projects/Personal/claude-src/`]

## 8. How to use this document

Start future ecosystem discussions here, then open the cited corpus note and underlying path for implementation detail.
Source: [README, `.specs/ai-tooling-consolidation/README.md`]

Treat Sections 1 and 2 as current working constraints unless newer direct runtime or status evidence supersedes them.
Source: [Pi, `pi/README.md`; Onclave, `onclave/docs/extensions/onclave-comms/v2-status.md`]

Treat Section 3 as agreed direction, not implementation authorization.
Source: [Vault, `agent-workflows/AGENTS.md`; Active, `.specs/pi-workflow-refinement/notes.md`]

Treat Section 4 as the canonical parking lot: do not reopen an item without naming its listed evidence gate or an explicit decision to change direction.
Source: [Vault, `agent-workflows/AGENTS.md`; Archive, `.specs/archive/rationalization-phase4/plan.md`]

Treat Section 5 as historical guardrails: do not reintroduce a retired pattern without direct evidence that its original failure mode no longer applies.
Source: [Archive, `.specs/archive/workflow-test-rationalization/summary.md`; `.specs/archive/rationalization/ledger.md`]

Treat Section 6 as a decision queue, not a request for automatic reconciliation.
Source: [Active, `.specs/ai-tooling-consolidation/notes-specs-active.md`; Onclave, `onclave/docs/PRDS/2026-07-26-homelab-platform-architecture-PRD.md`]

Update this document when a listed evidence gate is met, a parked idea is promoted or abandoned, a contradiction receives an explicit decision, or a real runtime capability materially changes.
Source: [README, `.specs/ai-tooling-consolidation/README.md`; Active, `.specs/archive/pi-workflow-friction-review/design.md`]

Update the relevant source note first when detailed inventory or evidence changes, then update this synthesis to preserve its role as a concise durable reference.
Source: [README, `.specs/ai-tooling-consolidation/README.md`]

For active plans and near-term infrastructure, consult `notes-specs-active.md`.
Source: [README, `.specs/ai-tooling-consolidation/README.md`]

For historical lessons, abandoned work, and supersessions, consult `notes-specs-archive.md`.
Source: [README, `.specs/ai-tooling-consolidation/README.md`]

For research proposals and promotion criteria, consult `notes-obsidian-vault.md`.
Source: [README, `.specs/ai-tooling-consolidation/README.md`]

For Onclave, Menos, communication, and platform architecture, consult `notes-onclave.md`.
Source: [README, `.specs/ai-tooling-consolidation/README.md`]

For the actual Pi runtime, extensions, commands, safety, and telemetry currently available, consult `notes-pi-runtime.md`.
Source: [README, `.specs/ai-tooling-consolidation/README.md`]

For personal repository roles, experiments, and duplicate checkout context, consult `notes-personal-repos.md`.
Source: [README, `.specs/ai-tooling-consolidation/README.md`]