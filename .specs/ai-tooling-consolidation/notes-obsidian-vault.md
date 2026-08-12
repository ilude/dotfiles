# Future AI Development Tooling Vision

## 1. Inventory

Maturity reflects the note's substantive idea, not merely whether the Markdown file exists.

| Note | Topic | Maturity |
| --- | --- | --- |
| `AGENTS.md` | Vault purpose, organization, linking, and KISS guidance | implemented |
| `README.md` | Human entry point and topic map | implemented |
| `index.md` | Curated vault index | implemented |
| `agent-workflows/AGENTS.md` | Promotion filter, KISS rules, and Pi/menos direction | implemented |
| `agent-workflows/README.md` | Agent-workflow topic entry point | implemented |
| `agent-workflows/index.md` | Curated workflow research map and strongest signals | implemented |
| `agent-workflows/claude_prompts.md` | Claude Code prompt assembly and selection behavior | researched |
| `agent-workflows/_templates/research-note.md` | Standard research-note structure | implemented |
| `agent-workflows/patterns/agent-friendly-platforms.md` | Platform-specific rules, skills, examples, and validation | researched |
| `agent-workflows/patterns/agent-terminal-workspaces.md` | Status and attention management for parallel agents | researched |
| `agent-workflows/patterns/markdown-skills-memory.md` | Markdown as the reviewed interface for skills and memory | researched |
| `agent-workflows/patterns/pi-observability-timing.md` | Metadata-only Pi timing spans | implemented |
| `agent-workflows/patterns/sandboxed-agent-runtimes.md` | Selective isolation for risky or long-lived agent work | researched |
| `agent-workflows/patterns/self-healing-harnesses.md` | Agent-proposed helpers behind a protected core | researched |
| `agent-workflows/workflow-ideas/adaptive-plan-review-telemetry.md` | Telemetry for folding review into planning | implemented, with adaptive review still pending |
| `agent-workflows/workflow-ideas/backlog.md` | Candidate small implementation slices | raw idea |
| `agent-workflows/workflow-ideas/code-intelligence.md` | Provider-neutral semantic code intelligence | researched |
| `agent-workflows/workflow-ideas/duckdb-for-pi-usage-analytics.md` | Optional DuckDB-backed usage analytics | raw idea |
| `agent-workflows/workflow-ideas/durable-task-dependency-systems.md` | Durable task graphs, attempts, provenance, recovery, and freshness | researched, with foundational task/subagent separation implemented |
| `agent-workflows/workflow-ideas/goal-closeout-handoff.md` | Automatic closeout report when a goal completes | researched |
| `agent-workflows/workflow-ideas/kiss-pi-workflow-ideas.md` | Minimal Pi adaptations from agent-tool research | researched |
| `agent-workflows/workflow-ideas/menos-knowledge-compiler.md` | Persona-scoped session capture and knowledge compilation | promoted to spec |
| `agent-workflows/workflow-ideas/multipass-yolo-sandboxes.md` | Multipass and Infisical isolation for autonomous runs | promoted to spec |
| `agent-workflows/workflow-ideas/pipelines-and-policies.md` | Run ledgers, artifacts, resumability, recipes, and policy gates | researched |
| `agent-workflows/workflow-ideas/specs-derived-roadmap.md` | Candidate workflow slices synthesized from specs | researched |
| `agent-workflows/workflow-ideas/specs-workflow-trajectory.md` | Long-term product and workflow direction inferred from specs | researched |
| `agent-workflows/workflow-ideas/x-research-pipeline.md` | Read-only X research graph backed by menos | promoted to spec |
| `prompt-router/README.md` | Prompt-router research entry point | implemented |
| `prompt-router/index.md` | Prompt-router note map | implemented |
| `prompt-router/current-status.md` | Current sandbox candidate and deployment decision | implemented |
| `prompt-router/dataset-search-guide.md` | Dataset selection criteria and source decisions | researched |
| `prompt-router/experiment-log.md` | Completed curation, ablation, and sidecar experiments | implemented |
| `prompt-router/next-steps.md` | Recommended evaluation and promotion sequence | researched |
| `prompt-router/nvidia-complexity-scorer.md` | NVIDIA scorer evaluation and integration limits | researched |
| `prompt-router/route-balanced-subset-results.md` | Route-balance experiment results | implemented |
| `prompt-router/triage-sidecar-results.md` | NVIDIA, kNN, taxonomy, and reviewability results | implemented |
| `prompt-router/user-effort-override-policy.md` | User-selected effort precedence | promoted to spec |
| `prompt-router/workflow-data-collection.md` | Privacy-safe local routing outcome telemetry | researched |
| `prompt-router/archive-seeds/curation-pipeline-PRD.md` | Prompt-router curation requirements | promoted to spec |
| `prompt-router/archive-seeds/curation-pipeline-plan.md` | Implemented curation pipeline plan | implemented |
| `prompt-router/archive-seeds/retrain-gates-plan.md` | Implemented candidate review and retraining gates | implemented |

## 2. The idea catalog

### Research as an idea garden, not a roadmap

The vault preserves context and weak signals without treating every captured idea as a commitment. Promotion should happen only after repeated pain, a reversible thin slice, and a clear validation signal. [Sources: `AGENTS.md`; `agent-workflows/AGENTS.md`]

### Successful runs become Markdown skills

Repeated workflows should first be performed manually, then reduced to stable steps, verification criteria, failure recovery, and links to small scripts. Stable decisions and patterns should be retained instead of entire raw transcripts. [Sources: `agent-workflows/patterns/markdown-skills-memory.md`; `agent-workflows/workflow-ideas/kiss-pi-workflow-ideas.md`]

### Reviewed self-healing helper surfaces

Agents may propose narrowly scoped helpers or domain notes when a harness lacks a capability, but should not freely mutate the protected core. Helpers become default behavior only after human review and focused validation. [Sources: `agent-workflows/patterns/self-healing-harnesses.md`; `agent-workflows/workflow-ideas/specs-derived-roadmap.md`]

### Agent-friendly platform packs

Frequently used platforms should have small packages of rules, examples, skills, and validation guidance before receiving MCP or plugin automation. This replaces giant platform-expert prompts with auditable repo-native knowledge. [Sources: `agent-workflows/patterns/agent-friendly-platforms.md`; `agent-workflows/workflow-ideas/specs-derived-roadmap.md`]

### Status before orchestration

Parallel agent work first needs visible task state, blockers, changed files, validation results, and actionable notifications. A simple status command and durable status artifacts should precede a custom cockpit UI or more fan-out. [Sources: `agent-workflows/patterns/agent-terminal-workspaces.md`; `agent-workflows/workflow-ideas/backlog.md`; `agent-workflows/workflow-ideas/specs-derived-roadmap.md`]

### Metadata-only observability

Pi should record monotonic durations and allow-listed metadata while excluding prompts, outputs, file contents, secrets, and raw session identifiers. Generated metrics remain local runtime state and must not alter workflow behavior when persistence fails. [Source: `agent-workflows/patterns/pi-observability-timing.md`]

### Telemetry-gated adaptive plan review

The long-term plan is for `/plan-it` to select and run an appropriate review panel based on complexity, risk, and scale, reducing the need for a separate `/review-it`. The transition is gated on real reviewer-yield, false-positive, missed-issue, and execution-outcome data rather than intuition. [Source: `agent-workflows/workflow-ideas/adaptive-plan-review-telemetry.md`]

### Automatic goal closeout

Completing `/goal` should emit a compact report covering outcome, changed artifacts, validation, repository state, gaps, and the exact next action. Deterministic repository checks should supplement model-authored synthesis before the goal context disappears. [Source: `agent-workflows/workflow-ideas/goal-closeout-handoff.md`]

### Durable intent separated from execution

Durable tasks should own intent, lifecycle, scope, and dependencies, while subagents remain transient workers and the parent owns validation and terminal state transitions. This avoids rebuilding a scheduler inside the task tool and preserves a clear authority boundary. [Source: `agent-workflows/workflow-ideas/durable-task-dependency-systems.md`]

### Durable attempts and provenance

If failures justify it, task execution can gain ordered attempt records linking task, plan revision, subagent run, artifacts, validations, and acceptance decisions. The task record should remain a bounded projection rather than becoming a transcript or artifact store. [Source: `agent-workflows/workflow-ideas/durable-task-dependency-systems.md`]

### Recovery, freshness, and resource admission

Possible later layers include deterministic task rehydration, lifecycle correlation, stale-result detection, typed dependency outcomes, explicit resource keys, durable background claims, and versioned plan repair. Each layer is parked behind a concrete evidence gate, especially where leases, retries, or autonomous scheduling would create at-least-once mutation risk. [Source: `agent-workflows/workflow-ideas/durable-task-dependency-systems.md`]

### Run ledgers and first-class artifacts

Pipeline steps should leave machine-readable receipts and bounded handoff, validation, review, and final-report artifacts on disk. Resumption should use those artifacts and the plan ledger instead of reconstructing state from chat history. [Source: `agent-workflows/workflow-ideas/pipelines-and-policies.md`]

### Policy-as-code gates

Recurring architectural and safety rules can become deterministic evidence gathering, rules, gates, findings, and controlled waivers. The smallest first slice is a policy-check artifact attached to an existing workflow, not a broad governance platform. [Source: `agent-workflows/workflow-ideas/pipelines-and-policies.md`]

### Small workflow recipes

Repeated task shapes may become named recipes describing decomposition, expected artifacts, validation, and policy checks. Recipes should generate or suggest bounded work rather than become a competing scheduler. [Sources: `agent-workflows/workflow-ideas/pipelines-and-policies.md`; `agent-workflows/workflow-ideas/durable-task-dependency-systems.md`]

### Provider-neutral code intelligence

Pi could expose a common interface for symbols, definitions, references, diagnostics, callers, and architecture graphs while reporting backend freshness and confidence. Graphify is the preferred first architecture-orientation pilot for this mixed-content repository, while SCIP remains a possible later precise-symbol backend. [Source: `agent-workflows/workflow-ideas/code-intelligence.md`]

### Optional DuckDB analytics

JSONL should remain the append-only source of truth, with DuckDB used as a rebuildable analysis layer when queries outgrow fixed parsers. DuckDB should not become a hot-path dependency merely because it is already useful for workflow telemetry or prompt-routing experiments. [Sources: `agent-workflows/workflow-ideas/duckdb-for-pi-usage-analytics.md`; `agent-workflows/workflow-ideas/adaptive-plan-review-telemetry.md`]

### Persona-scoped knowledge compiler

Agent session summaries can be captured into menos, compiled into linked concepts, linted for quality, and surfaced through previews and digests. Work, workflow, hobby, and shared memory must be partitioned before compilation or retrieval, and live injection should follow a conservative capture and dry-run phase. [Source: `agent-workflows/workflow-ideas/menos-knowledge-compiler.md`]

### Selective YOLO sandboxing

High-risk autonomous runs should occur in disposable Multipass VMs with repositories cloned inside the VM and changes returned through git. Secrets should be narrow, short-lived Infisical injections, while host mounts and copied credential files remain forbidden by default. [Sources: `agent-workflows/patterns/sandboxed-agent-runtimes.md`; `agent-workflows/workflow-ideas/multipass-yolo-sandboxes.md`]

### Read-only X research graph

A FastAPI service can abstract X providers, persist users, tweets, and relationships into menos, and expose shared Pi and Claude clients. Account health, sticky proxy binding, idempotent storage, read-only behavior, and runtime secret injection are first-class operational requirements. [Source: `agent-workflows/workflow-ideas/x-research-pipeline.md`]

### Controlled prompt-router curation

External prompts should be normalized, attributed, weakly scored, and triaged into candidate, holdout, review, or reject partitions without touching production artifacts. Fixed gates and prompt-safe reports must exist before retraining or evaluation. [Sources: `prompt-router/archive-seeds/curation-pipeline-PRD.md`; `prompt-router/archive-seeds/curation-pipeline-plan.md`; `prompt-router/archive-seeds/retrain-gates-plan.md`]

### Reviewed and route-balanced router data

Bulk weak-label training is unsafe even when some aggregate metrics improve. Small reviewed, route-balanced subsets are more promising, but composition remains fragile and production promotion still requires a separate controlled step. [Sources: `prompt-router/experiment-log.md`; `prompt-router/route-balanced-subset-results.md`; `prompt-router/current-status.md`]

### Sidecars as triage, not truth

NVIDIA complexity, embedding kNN, and deterministic taxonomy can prioritize review or expose disagreements, but none should directly assign accepted routes. NVIDIA is too slow for runtime use on CPU, kNN agreement is weak, and taxonomy results remain source-confounded. [Sources: `prompt-router/nvidia-complexity-scorer.md`; `prompt-router/triage-sidecar-results.md`]

### User effort remains authoritative

An explicit user effort choice should override router reassignment unless a hard capability or safety cap applies. Recommended, selected, and applied routes should be recorded separately so disagreement can feed later adjudication without silently overriding user intent. [Source: `prompt-router/user-effort-override-policy.md`]

### Local workflow outcomes as router training evidence

Validation failures, repairs, follow-up corrections, and user overrides may be more useful than generic prompt volume because they directly measure whether a route was adequate in Pi's real workflows. Raw prompts should remain opt-in, while hashes and deterministic features can support privacy-safe collection. [Sources: `prompt-router/workflow-data-collection.md`; `prompt-router/dataset-search-guide.md`]

## 3. Recurring themes

- Durable files are preferred over conversational state: Markdown skills, plans, tasks, artifacts, ledgers, closeouts, and menos concepts all preserve state across context loss. [Sources: `agent-workflows/patterns/markdown-skills-memory.md`; `agent-workflows/workflow-ideas/pipelines-and-policies.md`; `agent-workflows/workflow-ideas/durable-task-dependency-systems.md`; `agent-workflows/workflow-ideas/goal-closeout-handoff.md`; `agent-workflows/workflow-ideas/menos-knowledge-compiler.md`]
- Telemetry should precede adaptation: embedded review, task-system expansion, pipeline complexity, and router promotion are all gated on observed outcomes. [Sources: `agent-workflows/workflow-ideas/adaptive-plan-review-telemetry.md`; `agent-workflows/workflow-ideas/durable-task-dependency-systems.md`; `agent-workflows/workflow-ideas/pipelines-and-policies.md`; `prompt-router/current-status.md`]
- KISS is an architectural gate: prefer one note, skill, script, wrapper, artifact format, or status command before adding databases, daemons, dashboards, schedulers, or broad orchestration. [Sources: `agent-workflows/AGENTS.md`; `agent-workflows/workflow-ideas/kiss-pi-workflow-ideas.md`; `agent-workflows/workflow-ideas/backlog.md`]
- Authority boundaries matter: the parent validates and completes tasks, users control effort, humans approve learned defaults, and external tools supply evidence rather than final decisions. [Sources: `agent-workflows/workflow-ideas/durable-task-dependency-systems.md`; `prompt-router/user-effort-override-policy.md`; `agent-workflows/patterns/self-healing-harnesses.md`; `prompt-router/triage-sidecar-results.md`]
- Curated knowledge is preferred to raw memory: raw sessions, external datasets, and transcripts are inputs that must be filtered, summarized, reviewed, or compiled before becoming durable guidance or training truth. [Sources: `agent-workflows/patterns/markdown-skills-memory.md`; `agent-workflows/workflow-ideas/menos-knowledge-compiler.md`; `prompt-router/archive-seeds/curation-pipeline-PRD.md`]
- Runtime state and tracked source are separate: logs, metrics, experiment outputs, raw prompts, and caches remain local or ignored, while schemas, scripts, policies, docs, and reviewed knowledge are tracked. [Sources: `agent-workflows/patterns/pi-observability-timing.md`; `prompt-router/archive-seeds/curation-pipeline-plan.md`; `prompt-router/archive-seeds/retrain-gates-plan.md`]
- Safety is explicit and layered: sandboxing, narrow secrets, exact mutation boundaries, deterministic validation, artifact scans, and controlled production promotion recur across workflow and router designs. [Sources: `agent-workflows/workflow-ideas/multipass-yolo-sandboxes.md`; `agent-workflows/workflow-ideas/specs-workflow-trajectory.md`; `prompt-router/archive-seeds/retrain-gates-plan.md`]
- Local-first does not mean single-system: Pi is the control plane, menos supplies durable content and memory, git moves reviewed changes, and optional external tools provide specialized execution or analysis. [Sources: `agent-workflows/AGENTS.md`; `agent-workflows/workflow-ideas/specs-workflow-trajectory.md`; `agent-workflows/workflow-ideas/menos-knowledge-compiler.md`; `agent-workflows/workflow-ideas/multipass-yolo-sandboxes.md`]

## 4. Dependencies and overlaps between ideas

| Idea | Dependency or overlap |
| --- | --- |
| Cockpit and task status | Depends on durable task/status projections and useful validation state; should precede more orchestration or a custom UI. [Sources: `agent-workflows/patterns/agent-terminal-workspaces.md`; `agent-workflows/workflow-ideas/specs-derived-roadmap.md`] |
| Adaptive plan review | Depends on workflow telemetry, reviewer-yield labels, and execution outcomes; DuckDB is an analysis aid rather than the event source. [Sources: `agent-workflows/workflow-ideas/adaptive-plan-review-telemetry.md`; `agent-workflows/workflow-ideas/duckdb-for-pi-usage-analytics.md`] |
| Goal closeout | Overlaps run-ledger final summaries, lifecycle correlation, and compaction handoffs, but is specifically tied to `/goal` termination. [Sources: `agent-workflows/workflow-ideas/goal-closeout-handoff.md`; `agent-workflows/workflow-ideas/pipelines-and-policies.md`; `agent-workflows/workflow-ideas/durable-task-dependency-systems.md`] |
| Durable attempts | Depends on the existing task/subagent authority boundary and enables later artifact provenance, crash recovery, freshness, and resource admission. [Source: `agent-workflows/workflow-ideas/durable-task-dependency-systems.md`] |
| Pipeline resumability | Depends on ledgers, artifacts, validation records, and safe treatment of previously completed destructive steps. [Source: `agent-workflows/workflow-ideas/pipelines-and-policies.md`] |
| Workflow recipes | Overlap policy gates and durable DAG recipes, but should remain declarative task shapes rather than own execution. [Sources: `agent-workflows/workflow-ideas/pipelines-and-policies.md`; `agent-workflows/workflow-ideas/durable-task-dependency-systems.md`] |
| Learned helpers | Depend on Markdown skill conventions, human review, and focused tests; accepted helpers can later become platform packs or workflow recipes. [Sources: `agent-workflows/patterns/self-healing-harnesses.md`; `agent-workflows/patterns/markdown-skills-memory.md`; `agent-workflows/patterns/agent-friendly-platforms.md`] |
| menos compiler | Depends on session capture, redaction, persona isolation, semantic storage, and retrieval evaluation; it overlaps the general memory-promotion lane. [Sources: `agent-workflows/workflow-ideas/menos-knowledge-compiler.md`; `agent-workflows/workflow-ideas/specs-derived-roadmap.md`] |
| X research | Depends on menos storage, a provider abstraction, account/proxy operations, shared authentication, and runtime secret delivery. [Source: `agent-workflows/workflow-ideas/x-research-pipeline.md`] |
| YOLO sandbox | Depends on Multipass provisioning, git handoff, narrow Infisical secrets, and an enforceable no-host-mount policy. [Source: `agent-workflows/workflow-ideas/multipass-yolo-sandboxes.md`] |
| Code intelligence | Can inform `/plan-it`, `/review-it`, and `/do-it`, but depends on freshness, privacy, and backend availability being visible to the agent. [Source: `agent-workflows/workflow-ideas/code-intelligence.md`] |
| Router retraining | Depends on curation, reviewed labels, fixed gates, route balance, provenance, and controlled production promotion. [Sources: `prompt-router/archive-seeds/curation-pipeline-PRD.md`; `prompt-router/archive-seeds/retrain-gates-plan.md`; `prompt-router/current-status.md`] |
| Router sidecars | Depend on candidate rows and are inputs to review prioritization, not replacements for adjudication. [Sources: `prompt-router/triage-sidecar-results.md`; `prompt-router/nvidia-complexity-scorer.md`] |
| Router local telemetry | Overlaps general workflow telemetry and can reuse privacy-safe event design, but targets cheapest acceptable routing rather than reviewer-panel quality. [Sources: `prompt-router/workflow-data-collection.md`; `agent-workflows/workflow-ideas/adaptive-plan-review-telemetry.md`] |

## 5. External systems

| System | How it is referenced |
| --- | --- |
| menos | Proposed durable backend for session memory, compiled concepts, research content, graph edges, and pipeline receipts. Pi and Claude should share backend contracts instead of creating separate memory stores. [Sources: `agent-workflows/AGENTS.md`; `agent-workflows/workflow-ideas/menos-knowledge-compiler.md`; `agent-workflows/workflow-ideas/x-research-pipeline.md`; `agent-workflows/workflow-ideas/specs-workflow-trajectory.md`] |
| onclave | No reference appears in the scoped vault notes. [Sources searched: `agent-workflows/patterns/`; `agent-workflows/workflow-ideas/`; `agent-workflows/_templates/`; `prompt-router/`] |
| homelab | No reference appears in the scoped vault notes. Infrastructure references instead identify the menos host, self-hosted services, and local automation. [Sources: `agent-workflows/workflow-ideas/menos-knowledge-compiler.md`; `agent-workflows/workflow-ideas/x-research-pipeline.md`] |
| Claude Code | Initial memory capture client, source of prompt-behavior research, optional X MCP client, and a secondary surface beside Pi rather than the canonical control plane. [Sources: `agent-workflows/claude_prompts.md`; `agent-workflows/workflow-ideas/menos-knowledge-compiler.md`; `agent-workflows/workflow-ideas/x-research-pipeline.md`; `agent-workflows/workflow-ideas/specs-workflow-trajectory.md`] |
| OpenCode and Copilot | Retained as useful client surfaces while canonical workflow behavior moves into Pi-native implementation and shared reviewed files. [Source: `agent-workflows/workflow-ideas/specs-workflow-trajectory.md`] |
| Multipass | Outer Ubuntu VM boundary for risky autonomous Windows runs. [Source: `agent-workflows/workflow-ideas/multipass-yolo-sandboxes.md`] |
| Infisical | Runtime delivery of narrow, short-lived secrets for sandbox and X research workflows. [Sources: `agent-workflows/workflow-ideas/multipass-yolo-sandboxes.md`; `agent-workflows/workflow-ideas/x-research-pipeline.md`] |
| Daytona | Example sandbox/runtime layer for isolated long-running agent work, but local trusted execution remains the default. [Sources: `agent-workflows/patterns/sandboxed-agent-runtimes.md`; `agent-workflows/workflow-ideas/specs-derived-roadmap.md`] |
| twscrape and Webshare | Selected X scraping backend and sticky residential proxy strategy for read-only graph research. [Source: `agent-workflows/workflow-ideas/x-research-pipeline.md`] |
| Graphify and SCIP | Candidate architecture-graph and symbol-index backends behind a generic code-intelligence interface. [Source: `agent-workflows/workflow-ideas/code-intelligence.md`] |
| Kuzu and DuckDB | Candidate embedded graph and analytical stores if file or JSON prototypes become insufficient. [Sources: `agent-workflows/workflow-ideas/code-intelligence.md`; `agent-workflows/workflow-ideas/duckdb-for-pi-usage-analytics.md`] |
| Temporal, Airflow, Prefect, GitHub Actions, Bazel, Ninja, and related workflow systems | Sources for attempts, provenance, caching, freshness, retries, and resource-admission concepts; the note explicitly rejects embedding one of these systems inside Pi. [Source: `agent-workflows/workflow-ideas/durable-task-dependency-systems.md`] |
| NVIDIA complexity classifier | Offline review-priority sidecar only; CPU smoke latency makes it unsuitable for runtime routing. [Sources: `prompt-router/nvidia-complexity-scorer.md`; `prompt-router/triage-sidecar-results.md`] |
| Hugging Face datasets and RouteLLM | External candidate sources for prompt-router curation, with routellm currently the strongest source and other datasets restricted or deferred. [Sources: `prompt-router/dataset-search-guide.md`; `prompt-router/experiment-log.md`; `prompt-router/archive-seeds/curation-pipeline-PRD.md`] |

## 6. Explicit statements about long-term direction

- The clearest owning statement is: Pi as the workflow and control plane, menos as durable memory and search, and small auditable skills and scripts as the execution layer. [Source: `agent-workflows/AGENTS.md`]
- The broader product thesis is a lightweight, local-first agent operating layer in which Pi coordinates coding, research, memory, tests, commits, and sandboxed execution through Markdown skills, explicit state-change gates, and terminal-friendly status. [Source: `agent-workflows/workflow-ideas/specs-workflow-trajectory.md`]
- Pi should borrow useful ergonomics from other clients without treating Claude compatibility as the canonical architecture. [Source: `agent-workflows/workflow-ideas/specs-workflow-trajectory.md`]
- `/plan-it` is intended eventually to absorb appropriately sized review and reduce the user-facing command count, while `/review-it` remains until telemetry establishes a safe policy. [Source: `agent-workflows/workflow-ideas/adaptive-plan-review-telemetry.md`]
- Durable work should evolve incrementally from task intent and transient execution toward attempts, provenance, and recovery only when post-reload evidence shows actual failures. [Source: `agent-workflows/workflow-ideas/durable-task-dependency-systems.md`]
- Research ingestion and compiled long-term knowledge should converge on menos rather than proliferating separate stores for each client or content source. [Sources: `agent-workflows/workflow-ideas/specs-derived-roadmap.md`; `agent-workflows/workflow-ideas/menos-knowledge-compiler.md`; `agent-workflows/workflow-ideas/x-research-pipeline.md`]
- Cockpit development should start with status and attention management, not a custom heavy UI. [Sources: `agent-workflows/workflow-ideas/specs-derived-roadmap.md`; `agent-workflows/patterns/agent-terminal-workspaces.md`]
- Prompt-router improvement should move from external weak labels toward reviewed subsets, local outcome telemetry, user override evidence, and controlled production promotion. [Sources: `prompt-router/experiment-log.md`; `prompt-router/workflow-data-collection.md`; `prompt-router/current-status.md`]

## 7. Contradictions or superseded thinking

| Earlier or competing view | Current resolution |
| --- | --- |
| A task tool could own DAG execution, fan-out, waiting, stopping, and artifacts. | That mixed runner was deliberately removed; tasks now own durable intent while the parent and subagent surfaces retain execution and acceptance authority. [Source: `agent-workflows/workflow-ideas/durable-task-dependency-systems.md`] |
| More orchestration could improve parallel work. | The dominant recommendation is status, artifacts, and attention management before more fan-out or UI complexity. [Sources: `agent-workflows/patterns/agent-terminal-workspaces.md`; `agent-workflows/workflow-ideas/kiss-pi-workflow-ideas.md`] |
| Bulk weak-label router data might scale the promising 250-row result. | The 1,000-row routellm experiment increased catastrophic under-routing and latency; reviewed route-balanced subsets replaced bulk weak-label training as the leading direction. [Source: `prompt-router/experiment-log.md`] |
| A mini-heavy route balance could reduce over-routing. | It improved some metrics but increased catastrophic under-routing, so confidence-conservative or reviewed subsets are preferred. [Source: `prompt-router/route-balanced-subset-results.md`] |
| NVIDIA complexity might participate directly in routing. | It is now explicitly limited to offline triage because it does not measure cheapest acceptable route and was too slow on CPU. [Sources: `prompt-router/nvidia-complexity-scorer.md`; `prompt-router/triage-sidecar-results.md`] |
| External datasets might provide ready-made training labels. | External data is now treated as discovery material requiring normalization, review, route balancing, provenance, and fixed gates. [Sources: `prompt-router/archive-seeds/curation-pipeline-PRD.md`; `prompt-router/dataset-search-guide.md`] |
| SCIP might become the core code-intelligence dependency. | The current recommendation is a provider abstraction, an opt-in Graphify pilot, and no core SCIP dependency yet. [Source: `agent-workflows/workflow-ideas/code-intelligence.md`] |
| Sandboxing could be the default for all agent work. | Trusted dotfiles work remains local; isolation is reserved for unknown, risky, long-running, or browser-driven work. [Sources: `agent-workflows/patterns/sandboxed-agent-runtimes.md`; `agent-workflows/workflow-ideas/specs-derived-roadmap.md`] |
| DuckDB could centralize all usage logs. | Fixed TypeScript parsing remains preferred for simple `/usage`; DuckDB is optional when richer analysis repeatedly justifies database overhead. [Source: `agent-workflows/workflow-ideas/duckdb-for-pi-usage-analytics.md`] |
| Memory machinery could ingest and inject immediately. | The knowledge compiler calls for silent capture, persona isolation, deterministic baselines, dry-run previews, and explicit live enablement before injection. [Source: `agent-workflows/workflow-ideas/menos-knowledge-compiler.md`] |
| menos outage handling has one universal policy. | Research ingestion favors explicit fallback and observable backfill, while session hooks are specified to fail fast without an unbounded queue. These apply to different workflows but need a documented shared service-availability policy. [Sources: `agent-workflows/workflow-ideas/specs-workflow-trajectory.md`; `agent-workflows/workflow-ideas/menos-knowledge-compiler.md`] |
| A passing sandbox router candidate could be deployed directly. | Production remains unchanged until a dedicated promotion path converts reviewed rows, regenerates canonical artifacts, and passes production validation. [Source: `prompt-router/current-status.md`] |

## 8. Open questions

- Which first small workflow slice has enough repeated pain to justify implementation: task status, reviewed helpers, memory promotion notes, sandbox checklist, adaptive review evaluation, or goal closeout? [Source: `agent-workflows/workflow-ideas/backlog.md`]
- How many workflow episodes are enough to learn a safe reviewer-count and persona policy, and how should false positives and process theater be weighted? [Source: `agent-workflows/workflow-ideas/adaptive-plan-review-telemetry.md`]
- Will current compaction and task linkage actually recover the correct frontier after reload, or is deterministic task rehydration needed? [Source: `agent-workflows/workflow-ideas/durable-task-dependency-systems.md`]
- What observed failure should trigger a durable attempt ledger, artifact manifests, resource claims, or parent-independent execution? [Source: `agent-workflows/workflow-ideas/durable-task-dependency-systems.md`]
- Should run ledgers be JSON, Markdown, or both, and should workers or the parent write handoff artifacts? [Source: `agent-workflows/workflow-ideas/pipelines-and-policies.md`]
- Should high-risk `/do-it` runs require a separate review while adaptive embedded review remains experimental? [Sources: `agent-workflows/workflow-ideas/pipelines-and-policies.md`; `agent-workflows/workflow-ideas/adaptive-plan-review-telemetry.md`]
- Which code-intelligence backend should be piloted first, how will freshness be invalidated, and how will generated indexes avoid leaking private code? [Source: `agent-workflows/workflow-ideas/code-intelligence.md`]
- How should the menos compiler measure retrieval improvement, surface hook failures, resolve contradictions, and prevent persona leakage before live injection? [Source: `agent-workflows/workflow-ideas/menos-knowledge-compiler.md`]
- What Windows virtualization prerequisites, egress controls, mount checks, and secret scopes are required before Multipass YOLO becomes operational? [Source: `agent-workflows/workflow-ideas/multipass-yolo-sandboxes.md`]
- How should X account health, provider breakage, proxy identity, legal risk, and graph schema evolution be operated over time? [Source: `agent-workflows/workflow-ideas/x-research-pipeline.md`]
- Where in Pi runtime is user-selected effort represented, and how should override precedence be tested across unsupported levels and hard caps? [Source: `prompt-router/user-effort-override-policy.md`]
- What privacy-safe telemetry schema and retention policy can support local router adjudication without turning raw prompts into implicit training data? [Source: `prompt-router/workflow-data-collection.md`]
- Does a full GPU NVIDIA batch improve review yield enough to justify integration, or does it merely reproduce prompt length and ConfGate skew? [Source: `prompt-router/nvidia-complexity-scorer.md`]
- Should the reviewed 60-row router subset enter a production-promotion dry run now, or wait for stronger sidecar and local-override evidence? [Source: `prompt-router/next-steps.md`]
- What exact process converts accepted experimental rows into canonical production corpus artifacts while preserving license, provenance, review notes, and reproducible validation? [Sources: `prompt-router/current-status.md`; `prompt-router/next-steps.md`]
