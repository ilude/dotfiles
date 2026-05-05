# Workflow trajectory from `.specs/`

This note synthesizes active and archived `.specs/` files into a coherent picture of where the workflow has been heading.

## High-level direction

The specs show a consistent push toward a **local-first, Pi-centered, safety-gated agent cockpit**:

- Pi becomes the primary workflow runtime, not a Claude compatibility afterthought.
- Claude/OpenCode/Copilot remain useful surfaces, but durable behavior moves into shared Markdown, Pi skills/extensions, tests, and repo policy.
- Workflows should be automated only after the source-of-truth, safety boundaries, and validation loops are clear.
- Windows remains a first-class environment, but shell/process fragility must be reduced by preferring native PowerShell where appropriate and avoiding excessive MSYS2 hook spawning.

## Recurring themes

### 1. Pi-first workflow layer

Related specs:

- `.specs/archive/pi-agent-setup/plan.md`
- `.specs/archive/pi-claude-parity/plan.md`
- `.specs/archive/pi-platform-alignment/plan.md`
- `.specs/archive/pi-workflow-borrowed-features/`
- `.specs/archive/pi-operator-layer-mvp/plan.md`
- `.specs/pi-workflow-hardening/plan.md`
- `.specs/pi-setup-refactor/plan.md`

The direction is not “copy Claude Code.” It is: borrow proven ergonomics, then implement them in Pi-native ways.

Core ideas:

- Structured workflow commands.
- Explicit operator layer.
- Source-of-truth boundaries.
- Verification loops.
- Lightweight status/observability.
- Provider/model-aware routing when delegation is needed.

### 2. Deterministic commit and guarded mutation

Related specs:

- `.specs/archive/deterministic-commit-helper/plan.md`
- `.specs/archive/pi-commit-extension/plan.md`
- `.specs/archive/pi-commit-llm-workflow/plan.md`
- `.specs/archive/commit-error-handling/plan.md`
- `.specs/pi-review-2026-05-03/plan.md`

The commit workflow has been driven toward:

- non-mutating planning first;
- exact staged path sets;
- confirmation tokens;
- conventional commit validation;
- robust handling of ignored files, partial staging, fresh repos, and token comparison errors.

This aligns with the broader pattern: agents can propose, but state changes need explicit, inspectable boundaries.

### 3. Memory and expertise as curated retrieval, not raw logs

Related specs:

- `.specs/archive/pi-expertise-project-scope/plan.md`
- `.specs/archive/pi-expertise-snapshotting/plan.md`
- `.specs/archive/pi-memory-retrieval/plan.md`
- `.specs/archive/read-expertise-vector/plan.md`
- `.specs/pi-memory-followups/plan.md`
- `.specs/menos-knowledge-compiler/plan.md`

The trajectory is toward layered memory:

- project-scoped expertise;
- focused retrieval;
- bounded snapshots;
- promotion candidates reviewed by humans;
- persona/context boundaries;
- menos as shared long-term memory for content and compiled knowledge.

Important constraint: procedural memory should not auto-promote. Stable policy belongs in reviewed files.

### 4. Safety, secrets, and sandboxing

Related specs:

- `.specs/archive/dc-hardening/plan.md`
- `.specs/archive/treesitter-ast-dmg-ctrl/plan.md`
- `.specs/archive/ssh-pem-use-inspect-split/pi-parity-gap.md`
- `.specs/infisical-secrets/plan.md`
- `.specs/serapis-env-vault/`
- `.specs/multipass-yolo-workflows/plan.md`

The direction is defense in depth:

- protect `.env`, SSH keys, cloud credentials, and password-manager exports;
- distinguish safe inspection from dangerous use;
- use AST-aware damage-control rather than brittle string matching where justified;
- run YOLO/risky workflows in Multipass or other sandboxes;
- inject secrets narrowly at runtime rather than copying host secret files.

### 5. Test orchestration and observability

Related specs:

- `.specs/archive/pi-test-orchestrator/plan.md`
- `.specs/archive/pi-observability-timing/plan.md`
- `.specs/archive/pi-tool-reduction/plan.md`
- `.specs/archive/test-modernization/plan.md`
- `.specs/pi-review-2026-05-03/findings.md`

The workflow is moving toward:

- single active test-run locks;
- project adapters;
- canaries and recovery actions;
- timing instrumentation;
- reduced tool-output verbosity;
- validation that proves behavior, not grep-only checks.

### 6. Windows cockpit / keyboard-first environment

Related specs:

- `.specs/zellij-windows-cockpit-v1/`
- `.specs/archive/zellij-cockpit-v1-1-ux/plan.md`
- `.specs/linux-arch-install/keyboard-training.md`
- `.specs/linux-arch-install/editor-alternatives.md`
- `.specs/bash-crash-investigation.md`
- `.specs/bash-crash-remediation-plan.md`

The cockpit vision predates the cmux research and points in the same direction:

- terminal workspace manager;
- project/worktree boundaries;
- editor + file manager + fuzzy tools;
- Pi as agent runtime;
- visible agent roster/status;
- keyboard-driven navigation;
- avoid custom heavy TUI in early versions.

This maps directly to [agent-terminal-workspaces](../patterns/agent-terminal-workspaces.md).

### 7. Research pipelines and content vault

Related specs:

- `.specs/x-research-pipeline/plan.md`
- `.specs/pipelines-n-policies/notes.md`
- `.specs/menos-circuit-breaker/plan.md`
- `.specs/menos-knowledge-compiler/plan.md`

The direction is to make menos the durable backend for research/content while Pi and Claude share access patterns rather than forking state.

Key ideas:

- ingest first into menos;
- local fallback only when the service is unavailable;
- background backfill when service recovers;
- shared REST/backend seams for Pi and Claude;
- compile raw content into useful long-term knowledge.

## Coherent product thesis

The specs collectively point to this product thesis:

> Build a lightweight, local-first agent operating layer where Pi coordinates coding, research, memory, tests, commits, and sandboxed execution through small auditable Markdown skills, explicit state-change gates, and terminal-friendly status surfaces.

## Tension to manage

- Ambition vs KISS: many specs are broad; implementation should choose tiny slices.
- Automation vs safety: agents should do more, but mutation/secrets/commits need hard boundaries.
- Cross-client parity vs Pi-first: shared docs are useful, but canonical implementation should be Pi-native.
- Rich memory vs privacy: curate/promote knowledge rather than indexing everything by default.
- Windows support vs shell complexity: avoid process storms and ambiguous bash/WSL/Git Bash behavior.

## Links

- [kiss-pi-workflow-ideas](kiss-pi-workflow-ideas.md)
- [specs-derived-roadmap](specs-derived-roadmap.md)
- [agent-terminal-workspaces](../patterns/agent-terminal-workspaces.md)
- [markdown-skills-memory](../patterns/markdown-skills-memory.md)
- [sandboxed-agent-runtimes](../patterns/sandboxed-agent-runtimes.md)
