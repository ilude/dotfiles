# Active Specs Research Note

## 1. Inventory

Seventeen active top-level spec directories were reviewed. Status is inferred from frontmatter, checkboxes, execution summaries, validation evidence, and completion markers.

| Spec directory | Topic | Apparent status |
| --- | --- | --- |
| `.specs/complexity-risk-gates/` | Cross-language complexity and coverage-risk gates for agent-driven development | Planned. PRD is marked `draft`; all 12 acceptance criteria are unchecked; implementation milestones remain future work. |
| `.specs/ffmpeg-yt-dlp-video-workflow/` | Bounded visual inspection of videos using yt-dlp, ffmpeg, frames, and transcripts | Planned. PRD is marked `draft-follow-up-discussion`; all acceptance criteria are unchecked; command ownership and frame budgets remain undecided. |
| `.specs/hermes-deploy/` | Repeatable, secured Hermes Agent deployment with gateways, webhooks, Kanban, and auxiliary model routing | Planned. PRD is marked `draft`; all seven acceptance criteria are unchecked; target host, providers, use case, and exposure model remain undecided. |
| `.specs/infisical-dns-certs/` | Joyride local DNS and Caddy plus Cloudflare DNS-01 certificates for Infisical | In-progress. Local implementation and static validation passed on 2026-05-03, but live DNS, Cloudflare, staging and production certificate, and HTTPS checks remain pending. |
| `.specs/infisical-secrets/` | Self-hosted Infisical, machine identities, backups, client helper, migration, and secret scanning | In-progress. V1 and Wave 2 implementation are reported complete, but the plan is classified `blocked-by-user-decision`; live deployment, root signup, restore drill, later waves, and V2-V4 remain pending. |
| `.specs/linux-arch-install/` | Arch Linux and Niri desktop setup, editors, workspaces, and keyboard training | Stale. No status or date markers exist, nearly every checklist item is unchecked, paths still reference `.specs/arch-install/`, and the installation advice appears to be an unexecuted early design. |
| `.specs/menos-infisical-runtime/` | Replace Menos repo-root `.env` deployment with Infisical-rendered runtime configuration | In-progress. T0-T6 and static checks are reported complete; T7 wrappers, live deploy, redeploy proof, evidence completion, and archive readiness remain pending. |
| `.specs/menos-knowledge-compiler/` | Persona-aware long-term memory built on Menos session capture, compilation, retrieval, injection, lint, and digest | In-progress. The plan is marked `reviewed`, two review rounds were incorporated, and a pre-capture baseline exists, but task checkboxes remain unchecked and the major capture, compile, injection, and scheduler waves have no completion markers. |
| `.specs/multipass-yolo-workflows/` | Multipass and Infisical design for isolated Pi and Claude bypass-permission workflows | Planned. The plan is marked `draft`; the review is complete and its major findings appear incorporated, but none of the proposed design artifacts exist and all task checkboxes remain unchecked. |
| `.specs/pi-durable-work-activation/` | Preserve durable task state through compaction and link running tasks to subagents | Complete. All tasks and validation checks are checked; status is `complete` with completion date 2026-08-12. |
| `.specs/pi-extension-refactors/` | Ongoing Pi extension cleanup and ownership consolidation backlog | Complete, with one deferred future candidate. All listed refactors and verified problems are marked completed; worker-to-worker messaging remains explicitly deferred. |
| `.specs/pi-herdr-full-integration/` | Opt-in Herdr control tools and privacy-safe Pi sidebar metadata | Complete. All three tasks are checked and implementation validation passed; a few live TUI checks remain explicitly unvalidated. |
| `.specs/pi-task-todo-boundary/` | Restrict Pi `task` to durable todo and dependency tracking, separate from execution and scheduling | Complete. All tasks are checked, schema reductions are measured, and the full Pi suite passed; only live `/reload` and `/context` inspection remained unavailable. |
| `.specs/pi-workflow-friction-review/` | Evidence-based background review of workflow churn and improvement opportunities | Complete as a thin slice and reference design. The design says the thin slice was implemented on 2026-07-10; broader automation remains intentionally out of scope. |
| `.specs/pi-workflow-refinement/` | Research on Pi lifecycle, prompting, orchestration, review policy, telemetry, and UX guidance | In-progress. Marked `Discussion and research in progress`; conclusions are provisional and candidate refinements are explicitly not approved implementation plans. |
| `.specs/rootless-podman-quadlet-hardening/` | Replace rootless podman-compose wrappers with Podman Quadlet supervision | Planned. All three rollout tasks are unchecked; implementation, canary recovery, service migrations, and live validation remain future work. |
| `.specs/writing-quality-skill-layering/` | Layer prose and requirements guidance into existing Pi skills and workflow prompts | In-progress. T1 and T2 are complete; T3, the live slash-command workflow, `/do-it` handoff check, and `make check` remain blocked on an interactive reloaded Pi session. |

## 2. Ideas and proposals

### Pi workflow control and durable execution

1. Treat `/goal` as a persistent objective envelope rather than a scheduler. `/plan-it` owns the executable plan and validation contract, `/review-it` owns adversarial readiness review, `/do-it` owns implementation and terminal outcome, and `goal_complete` closes the objective against evidence. Source: `.specs/pi-workflow-refinement/notes.md`.

2. Create a shared lifecycle identity spanning goal, plan, review, and execution, with explicit links to goal ID, plan path, review artifact, and execution episode. Propagate only intended lifecycle metadata across `/do-it`'s new-session boundary. Source: `.specs/pi-workflow-refinement/notes.md`.

3. Move predictable orchestration into deterministic TypeScript: parsing, IDs, dependency transitions, retry and timeout limits, artifact checks, validation outcomes, and terminal states. Reserve models for plan quality, synthesis, product judgment, risk judgment, and ambiguous language. Source: `.specs/pi-workflow-refinement/notes.md`.

4. Validate workflow success through required artifacts and settled runtime state, not merely model completion, subprocess exit zero, a clean working tree, or a plausible final answer. Source: `.specs/pi-workflow-refinement/notes.md`.

5. Evaluate complete trajectories, including command order, validation order, artifact writes, retry counts, model requests, nested worker budgets, and terminal state. Source: `.specs/pi-workflow-refinement/notes.md`.

6. Keep global prompts lean. State each instruction once, expose only relevant tools, and move task-specific context into generated stage contracts. Remove duplicated prompt groups one at a time and rerun representative evaluations. Source: `.specs/pi-workflow-refinement/notes.md`.

7. Generate bounded stage contracts for programmatic tool calling: eligible tools, inputs, outputs, evidence, stop condition, retry limit, safe parallelism, and structured failure. Keep judgment, approvals, and final validation as direct visible calls. Source: `.specs/pi-workflow-refinement/notes.md`.

8. Preserve direct work as the default. Use workers only for independent, bounded, specialized workstreams; avoid multi-agent execution for small tasks, serial reasoning, shared mutable state, and deterministic graphs. Source: `.specs/pi-workflow-refinement/notes.md`.

9. Do not reduce the current six-or-more `/review-it` panel until reviewer yield, duplicates, false positives, readiness changes, cost, duration, and execution failures are measured. Later, test adaptive reviewer composition against plan risk and complexity profiles. Source: `.specs/pi-workflow-refinement/notes.md`.

10. Add detailed workflow telemetry only after lifecycle transitions have deterministic owners. Correlate workflow episodes, phases, task events, validations, repairs, manual gates, archives, and terminal outcomes through explicit IDs rather than timestamps. Source: `.specs/pi-workflow-refinement/notes.md`.

11. Use typed semantic stages for narrow classification and judgment, including plan profiles, contract quality, finding normalization, evidence sufficiency, and friction classification. Do not let typed stages schedule workflows, mutate files, deploy, execute validation, or grant approval. Source: `.specs/pi-workflow-refinement/notes.md`.

12. Preserve durable work through compaction by requiring a structured handoff containing objective, constraints, decisions, changed files, validation results, blockers, task IDs and states, remaining frontier, and exact next action. Source: `.specs/pi-durable-work-activation/plan.md`.

13. After compaction, inspect durable tasks before resuming. If multi-step work remains but no usable task frontier exists, create the minimum remaining durable tasks before editing or delegating. Source: `.specs/pi-durable-work-activation/plan.md`.

14. Let direct, background, and parallel subagent calls optionally carry an existing running task ID, while keeping lifecycle authority with the parent. Reject missing, deleted, non-running, or foreign-workspace task IDs before worker launch. Source: `.specs/pi-durable-work-activation/plan.md`.

15. Keep unlinked one-off delegation transient. Record multi-step background or parallel work as durable tasks before delegation when recovery across compaction matters. Source: `.specs/pi-durable-work-activation/plan.md`.

16. Make `task` a durable todo and dependency DAG only. It stores state, scope, dependencies, and persistence but must not spawn agents, start processes, wait, capture output, stop work, or schedule execution. Source: `.specs/pi-task-todo-boundary/plan.md`.

17. Preserve the explicit parent-controlled sequence: task becomes ready, parent marks it running, parent invokes `subagent` or `bg_start`, parent validates, then parent writes the terminal task state. Source: `.specs/pi-task-todo-boundary/plan.md`.

18. Keep `schedule` independent and process-local. It determines when Pi receives a future prompt but does not import or mutate the task registry. Source: `.specs/pi-task-todo-boundary/plan.md`.

19. Reduce active tool schemas by advertising one canonical input vocabulary while retaining legacy aliases only as unadvertised compatibility inputs. Flatten edit schemas only when runtime checks preserve safety and mode-specific requirements. Source: `.specs/pi-task-todo-boundary/plan.md`.

20. Consider worker-to-worker messaging only after atomic task claims, dependency unblocking, completion notifications, and bounded artifact exchange exist. Messages should be small, structured, deduplicated, restart-safe, permission-neutral, and visible to the parent through metadata rather than copied transcripts. Source: `.specs/pi-extension-refactors/backlog.md`.

21. Require evidence of a recurring workflow where direct worker coordination improves correctness or reduces parent relay cost before adopting worker messaging. Source: `.specs/pi-extension-refactors/backlog.md`.

### Workflow observation and self-improvement

22. Build an auditable improvement loop: observe -> select -> review -> aggregate -> discuss -> approve -> change -> measure again. Background systems gather evidence; users authorize changes. Source: `.specs/pi-workflow-friction-review/design.md`.

23. Separate Explore mode from Engineer mode. Explore favors direct answers, diagnosis, spikes, and focused validation. Engineer mode uses explicit plans, reviews, acceptance contracts, durable evidence, and coordinated execution. Source: `.specs/pi-workflow-friction-review/design.md`.

24. Measure an interaction from user submission to `agent_settled`, including retries, compaction continuations, and queued follow-ups, rather than stopping at the first model-end event. Source: `.specs/pi-workflow-friction-review/design.md`.

25. Select background reviews deterministically: no automatic review under two minutes, trigger-based or 15 percent control sampling from two through ten minutes, and automatic review over ten minutes. Source: `.specs/pi-workflow-friction-review/design.md`.

26. Use narrow friction triggers such as repeated unchanged commands, repeated unchanged validations, repeated tool failures, failed subagent launches, and repeated helper-script attempts. Do not classify an ordinary first failure as churn. Source: `.specs/pi-workflow-friction-review/design.md`.

27. Provide `/capture [note]` as a manual selector for the latest completed interaction. It should enqueue the same background review without adding labels, categories, notifications, or a separate mutation path. Source: `.specs/pi-workflow-friction-review/design.md`.

28. Keep the background review queue persistent, silent, single-concurrency, bounded to one attempt, and separate from user task state. Failures are recorded but not automatically retried. Source: `.specs/pi-workflow-friction-review/design.md`.

29. Fix the initial reviewer model and effort so early observations are comparable and independent from prompt-router experiments. Source: `.specs/pi-workflow-friction-review/design.md`.

30. Store metadata for every interaction, but do not copy full prompts and responses into long-lived metadata or review records. Preserve source session IDs for later bounded inspection. Source: `.specs/pi-workflow-friction-review/design.md`.

31. Use `/workflow-review` to show at most three evidence-backed recurring findings from the prior 15 days, recommend one issue, present bounded options, and require agreement before editing instructions, prompts, skills, hooks, settings, routing, or code. Source: `.specs/pi-workflow-friction-review/design.md`.

32. Record experiment markers for approved workflow changes so later reviews can compare targeted friction before and after the intervention without automatic promotion or rollback. Source: `.specs/pi-workflow-friction-review/design.md`.

33. Keep deterministic selection, queue state, redaction, deduplication, and authorization in code. Let one typed semantic reviewer classify friction and propose one candidate, but never authorize mutation. Source: `.specs/pi-extension-refactors/backlog.md`.

### Pi integrations and operator UX

34. Install Herdr tools only inside a validated Herdr environment and only use them when the user explicitly asks about Herdr. Ordinary Pi delegation and background work must remain in Pi's existing orchestration plane. Source: `.specs/pi-herdr-full-integration/plan.md`.

35. Keep Herdr lifecycle authority in the official integration. Custom Pi metadata may report only model ID, context percentage, and aggregate running subagent and task counts. It must not report prompts, paths, repository names, task summaries, or transcripts. Source: `.specs/pi-herdr-full-integration/plan.md`.

36. Report Herdr metadata as sequenced, deduplicated patches, clear absent optional values, prevent stale asynchronous updates from overwriting newer state, and do nothing outside the validated Herdr environment. Source: `.specs/pi-herdr-full-integration/plan.md`.

37. Preserve Herdr as an opt-in control and visibility layer, not a replacement worktree manager, notification system, pane-backed subagent runtime, or visible background-process mode. Source: `.specs/pi-herdr-full-integration/plan.md`.

38. Retire unsupported legacy Pi surfaces rather than maintaining dead compatibility paths. Examples include agent-chain project recipes, conversation-file listeners without writers, the unused agent-team runtime, and duplicated semantic subprocess infrastructure. Source: `.specs/pi-extension-refactors/backlog.md`.

39. Extract extension modules only at proven ownership seams. File size alone is not a reason to split workflow controllers or damage-control evaluators. Source: `.specs/pi-extension-refactors/backlog.md`.

40. Keep quality-gate discovery, execution, exit interpretation, retry bounds, and final pass or fail decisions deterministic. Models may receive bounded diagnostics for remediation but should not replace validators. Source: `.specs/pi-extension-refactors/backlog.md`.

### Writing, requirements, design, and review quality

41. Layer writing guidance into existing `no-ai-slop`, `planning`, `prd`, and `docs` skills instead of adding a broad writing skill, command, linter, or always-loaded policy. Source: `.specs/writing-quality-skill-layering/plan.md`.

42. Give each writing rule one owner. General prose editing belongs to `no-ai-slop`; measurable normative requirements belong to `planning`; PRD artifact behavior belongs to `prd`; procedure structure belongs to `docs`. Source: `.specs/writing-quality-skill-layering/plan.md`.

43. Put detailed Orwell-informed technical prose and EARS/INCOSE-informed requirements guidance behind progressive-disclosure references rather than loading it globally. Source: `.specs/writing-quality-skill-layering/plan.md`.

44. Preserve normative actor, condition, observable outcome, bounds, exceptions, measure, and verification through `/prd-it`, `/plan-it`, `/review-it`, and `/do-it`. Stop instead of silently choosing between materially different interpretations. Source: `.specs/writing-quality-skill-layering/plan.md`.

45. Make `/review-it` repair must-fix defects in the supplied artifact by default while honoring explicit review-only requests and never editing implementation files during artifact review. Source: `.specs/writing-quality-skill-layering/plan.md`.

46. Retain plans after execution unless the user explicitly asks to archive them. Preserve checkbox and resume behavior. Source: `.specs/writing-quality-skill-layering/plan.md`.

47. Replace universal frontend aesthetics with contextual product validation. Inspect the existing design system, offer bounded alternatives only when direction is unresolved, use existing components and tokens, then verify rendered behavior, semantics, keyboard flow, states, and named viewports. Source: `.specs/pi-workflow-refinement/notes.md`.

48. Require browser evidence for user-facing UI changes, but add screenshot regression or Lighthouse tooling only when the repository already supports it or setup is explicitly in scope. Source: `.specs/pi-workflow-refinement/notes.md`.

### Complexity and validation automation

49. Build a local-first cross-language complexity framework for Go, Python, TypeScript, and JavaScript using native ecosystem tools rather than one custom parser. Source: `.specs/complexity-risk-gates/PRD.md`.

50. Normalize cyclomatic complexity, cognitive complexity, nesting, coverage, and CRAP-style risk findings into a stable shared JSON schema suitable for hooks, CI, and automated repair loops. Source: `.specs/complexity-risk-gates/PRD.md`.

51. Gate changed code or baseline deltas rather than blocking adoption on unrelated legacy complexity. Source: `.specs/complexity-risk-gates/PRD.md`.

52. Use fast changed-file checks at pre-commit, tests and coverage-backed risk at pre-push, and full analysis plus SARIF upload in CI. Source: `.specs/complexity-risk-gates/PRD.md`.

53. Pin or report analyzer versions, fail explicitly when required tools are missing, keep suppressions auditable, cap findings, and give concise file, line, function, metric, threshold, and repair guidance. Source: `.specs/complexity-risk-gates/PRD.md`.

54. Treat function-level coverage mapping as language-specific and potentially approximate. Keep classic CRAP separate from experimental cognitive-risk formulas. Source: `.specs/complexity-risk-gates/PRD.md`.

55. Optionally expose the same complexity check through one structured MCP tool with workspace validation and schema-validated output, while keeping MCP outside the required MVP path. Source: `.specs/complexity-risk-gates/PRD.md`.

### Menos memory and knowledge compilation

56. Keep Menos as the single durable memory backend. Claude Code is the first capture and injection client; Pi should become a follow-on client over the same APIs and compiled corpus rather than creating a second memory platform. Source: `.specs/menos-knowledge-compiler/plan.md`.

57. Capture redacted session summaries, git context, model and tool metrics, project tags, and client identity as `session_log` content. Preserve metrics that cannot be reconstructed later, such as exit state, rework signals, tool counts, transcript truncation, and duration. Source: `.specs/menos-knowledge-compiler/plan.md`.

58. Partition memory by persona: `work`, `workflow`, `hobby`, and a deliberately small `shared` scope. Compile persona-first and prevent hobby content from entering work or workflow retrieval by default. Source: `.specs/menos-knowledge-compiler/plan.md`.

59. Classify persona through strict precedence: explicit session selection, repo markers or defaults, manual tags, deterministic heuristics, then low-confidence model fallback. Never auto-promote ambiguous content to `shared`. Source: `.specs/menos-knowledge-compiler/plan.md`.

60. Keep legacy content with no persona excluded from persona-scoped retrieval, preview, injection, and compilation until an explicit migration or reclassification workflow runs. Source: `.specs/menos-knowledge-compiler/plan.md`.

61. Capture broadly but redact before storage. Scrub common token formats, credential-bearing connection URIs, private keys, high-entropy environment values, and home-directory paths. Skip entire sensitive repositories through ignore rules and sentinel files. Source: `.specs/menos-knowledge-compiler/plan.md`.

62. Treat captured transcripts and compiled concepts as untrusted input. Delimit summarizer input, escape delimiter injection, disable verbose SDK and HTTP logging, reserve compiled content types for internal callers, and sanitize retrieved concepts before reinjection. Source: `.specs/menos-knowledge-compiler/plan.md`.

63. Use a fail-fast circuit breaker for hook delivery. Separate connect, read, write, and pool timeouts; do not queue failed captures indefinitely or block session completion. Source: `.specs/menos-knowledge-compiler/plan.md`.

64. Persist first-capture and outage warnings to `~/.claude/memory-status.log`, then surface recent warnings at the next SessionStart because hook stderr is not reliably visible on Windows. Source: `.specs/menos-knowledge-compiler/plan.md`.

65. Make PreCompact write only a per-session `had_compaction` sentinel. Run the expensive summary and POST exactly once at Stop to avoid partial duplicate session logs. Source: `.specs/menos-knowledge-compiler/plan.md`.

66. Measure Stop-hook phase timings over at least 20 clean cold and warm samples, derive timeout as p99 times 1.5, and register the measured value rather than guessing a fixed timeout. Source: `.specs/menos-knowledge-compiler/plan.md`.

67. Use content-type-specific chunking. Session logs use 1800-character chunks with 180-character overlap to fit the embedding model; concepts and connections remain whole but are capped at 8000 characters. Source: `.specs/menos-knowledge-compiler/plan.md`.

68. Record embedding model and dimension on every chunk. Refuse startup when mixed embedding models are found and provide a resumable full re-embedding script as the recovery path. Source: `.specs/menos-knowledge-compiler/plan.md`.

69. Add optional time-decay ranking while preserving default search behavior. Source: `.specs/menos-knowledge-compiler/plan.md`.

70. Build two retrieval baselines: a pre-capture baseline protecting existing search and a post-capture baseline used to judge whether compiled concepts add value. Compare per-query result overlap, top-1 score drift, and ordering rather than relying on a single aggregate score. Source: `.specs/menos-knowledge-compiler/plan.md`.

71. Compile recent session logs nightly into project concepts and cross-project workflow concepts. Use server-side creation timestamps, explicit token budgets, provenance IDs, source backlinks, persona filtering, and compile-state hashes. Source: `.specs/menos-knowledge-compiler/plan.md`.

72. Extract the content-creation pipeline into one shared service used by both HTTP upload and the compiler, ensuring link extraction and the unified classification pipeline run for compiled concepts. Source: `.specs/menos-knowledge-compiler/plan.md`.

73. Prevent ordinary API clients from forging `concept`, `connection`, or `digest` content. Validate caller and content-type combinations in both the router and shared content service. Source: `.specs/menos-knowledge-compiler/plan.md`.

74. Deduplicate concepts before writing by comparing draft embeddings with existing concepts. Calibrate the initial cosine threshold from hand-labeled concept pairs rather than treating 0.92 as permanently canonical. Source: `.specs/menos-knowledge-compiler/plan.md`.

75. Run compile, lint, and digest scheduling inside Menos with APScheduler, explicit timezone configuration, lifecycle-managed shutdown, and a hard `WEB_CONCURRENCY=1` guard to prevent duplicate jobs. Source: `.specs/menos-knowledge-compiler/plan.md`.

76. Start memory injection in `off`, move to `preview` after enough captures, and enable `live` only after inspecting what would be injected for different repositories and personas. Source: `.specs/menos-knowledge-compiler/plan.md`.

77. Add vault maintenance: orphan, broken-link, stale, sparse, duplicate, and contradiction checks; represent findings as graph links. Generate persona-aware weekly digests and exclude digest content from default search. Source: `.specs/menos-knowledge-compiler/plan.md`.

78. Begin concept extraction with an LLM-only path for a small corpus, then optionally move to UMAP plus HDBSCAN clustering after approximately 200 session logs if evaluation shows lower duplication without retrieval regression. Source: `.specs/menos-knowledge-compiler/plan.md`.

### Video, media, and research workflows

79. Add a lightweight visual-inspection layer beside `/yt` and Menos rather than replacing transcript ingestion or durable knowledge storage. Source: `.specs/ffmpeg-yt-dlp-video-workflow/PRD.md`.

80. Use yt-dlp for public video and caption acquisition and ffmpeg or ffprobe for probing, clipping, audio extraction, and timestamped screenshots. Treat local recordings and bug reproductions as first-class inputs. Source: `.specs/ffmpeg-yt-dlp-video-workflow/PRD.md`.

81. Support targeted `--start` and `--end` segments, duration-aware frame spacing, hard frame caps, bounded resolution, and sparse-scan guidance for long videos. Source: `.specs/ffmpeg-yt-dlp-video-workflow/PRD.md`.

82. Prefer captions and existing transcripts before paid or Whisper-style transcription. Allow frames-only behavior when no transcript is available. Source: `.specs/ffmpeg-yt-dlp-video-workflow/PRD.md`.

83. Keep extracted frames ephemeral. If persistence is useful, save an explicit generated visual-summary Markdown artifact into Menos rather than raw frames by default. Source: `.specs/ffmpeg-yt-dlp-video-workflow/PRD.md`.

### Agent runtime deployment

84. Deploy Hermes as an agent runtime rather than only a chat CLI, with repeatable installation, provider routing, gateway health checks, authenticated inbound and outbound webhooks, and Kanban coordination. Source: `.specs/hermes-deploy/PRD.md`.

85. Run Hermes natively on Linux or macOS and inside WSL2 on Windows. Pin the tested release and record dependency and configuration choices. Source: `.specs/hermes-deploy/PRD.md`.

86. Keep Hermes configuration discoverable: behavior and routes in config, secrets in `.env`, stable memory in intended memory files, and generated sessions unmodified. Source: `.specs/hermes-deploy/PRD.md`.

87. Bind dashboards and Kanban to localhost by default. Require authentication, reverse proxy, firewall, and stable production URLs before remote exposure. Authenticate webhook routes with a shared secret or signature. Source: `.specs/hermes-deploy/PRD.md`.

88. Assign cheaper or specialized auxiliary models to compression, extraction, vision, memory flushing, skill matching, and risk classification rather than inheriting the expensive main model for every background task. Source: `.specs/hermes-deploy/PRD.md`.

89. Consider a future hybrid in which a broad messaging gateway handles channels and Hermes remains the execution backend, but only if channel needs exceed Hermes-native integrations. Source: `.specs/hermes-deploy/PRD.md`.

### Secrets and deployment infrastructure

90. Self-host Infisical with a dedicated PostgreSQL database, Caddy TLS termination, machine identities, short-lived one-hour tokens, least-privilege folder access, and Ansible-managed deployment. Source: `.specs/infisical-secrets/plan.md`.

91. Keep bootstrap encryption keys and root credentials in an external password manager and in the encrypted disaster-recovery bundle, not inside Infisical itself. Source: `.specs/infisical-secrets/plan.md`.

92. Surface one-time machine identity secrets only through an operator-selected tmpfs file, then copy them to the password manager and appropriate runtime secret, and shred the handoff. Source: `.specs/infisical-secrets/plan.md`.

93. Back up both the PostgreSQL dump and Infisical encryption environment in one encrypted bundle. Retain 14 days and prove restore by recovering a known encrypted secret into throwaway containers. Source: `.specs/infisical-secrets/plan.md`; `.specs/infisical-secrets/runbook-restore.md`.

94. Use a last-known-good local cache for brief Infisical outages, with mode `0600`, five-minute freshness, up to 24-hour bounded stale use, explicit `cache_stale` telemetry, and token refresh at 75 percent of TTL. Source: `.specs/infisical-secrets/plan.md`.

95. Scan full history once to classify findings, require current HEAD to remain clean, rotate active credentials, and avoid history rewrite unless an active exposure requires it. Source: `.specs/infisical-secrets/plan.md`; `.specs/infisical-secrets/gitleaks-baseline.md`.

96. Add a local gitleaks pre-commit hook and non-secret stub markers pointing operators to Infisical paths after local secret files are migrated. Source: `.specs/infisical-secrets/plan.md`.

97. Use Joyride only for local or split DNS. Use Cloudflare authoritative DNS for ACME TXT records and Caddy for certificate issuance and termination. Source: `.specs/infisical-dns-certs/plan.md`; `.specs/infisical-dns-certs/joyride-runbook.md`.

98. Make a static Joyride host entry for `infisical.ilude.com -> 192.168.16.241` the initial path. Treat Docker-label registration as optional until its host-IP behavior is proven. Source: `.specs/infisical-dns-certs/plan.md`.

99. Build a pinned Caddy binary with xcaddy and the Cloudflare DNS module. Validate module presence, use Let's Encrypt staging first, and make inbound port 80 optional because DNS-01 does not require it. Source: `.specs/infisical-dns-certs/plan.md`.

100. Scope the Cloudflare token to `ilude.com` with `Zone:Read` and `DNS:Edit`, place it in a Caddy-only `0600` environment file, and enforce `no_log: true` plus `diff: false` on every token-bearing Ansible task. Source: `.specs/infisical-dns-certs/plan.md`.

101. Replace Menos deployment's copy of `/project/.env` with an atomic deploy-time render from Infisical. Validate all required keys before any compose pull, build, or start action. Source: `.specs/menos-infisical-runtime/plan.md`.

102. Keep the first Menos migration narrow: render a `0600` `.env`, preserve current Compose semantics, use tmpfs on the controller, clean artifacts on success and failure, and restore the previous remote `.env` on failed rollout. Defer Docker secrets until the migration is stable. Source: `.specs/menos-infisical-runtime/plan.md`.

103. Provide deterministic one-command wrappers for Infisical preflight, deploy, verify, and redeploy proof, using the existing Ansible Compose service and a gitignored local vault-password file. Source: `.specs/menos-infisical-runtime/plan.md`.

104. Prove Menos is independent from the repo-root `.env` by redeploying through the same path without that source and verifying remote permissions, controller cleanup, and API health. Source: `.specs/menos-infisical-runtime/plan.md`.

105. Replace active rootless podman-compose systemd wrappers with one Podman Quadlet container unit per service, one network per role, and optional role targets for grouped operation. Do not add pods. Source: `.specs/rootless-podman-quadlet-hardening/plan.md`.

106. Give every migrated container bounded systemd restart behavior. Add health-triggered restart only where verified health commands already exist, and preserve health-gated dependencies with `Notify=healthy`. Source: `.specs/rootless-podman-quadlet-hardening/plan.md`.

107. Validate generated Quadlets in a staging directory before installation, then retire legacy wrappers and containers without deleting bind-mounted state. Source: `.specs/rootless-podman-quadlet-hardening/plan.md`.

108. Recover Menos first as a canary, then migrate SearXNG and Onclave one at a time. Stop the rollout at the first failed live mutation until the affected service is restored and its original endpoint and state checks pass. Source: `.specs/rootless-podman-quadlet-hardening/plan.md`.

### Isolated high-risk agent environments

109. Use Multipass as the default outer sandbox for bypass-permission or YOLO workflows on Windows. Clone repositories inside the VM instead of mounting the host workspace. Source: `.specs/multipass-yolo-workflows/plan.md`.

110. Optionally add Docker or a devcontainer inside Multipass when task risk justifies layered isolation. Keep a warm reusable VM as the daily baseline and a fresh VM per task as a higher-risk option. Source: `.specs/multipass-yolo-workflows/plan.md`.

111. Use Git as the primary handoff boundary back to the host. Forbid Windows host mounts during YOLO runs unless explicitly reviewed, and never mount host home, `.env`, SSH, cloud credential, or password-manager paths. Source: `.specs/multipass-yolo-workflows/plan.md`.

112. Inject narrowly scoped Infisical credentials at runtime. Define machine identity bootstrap, TTL, rotation, revocation, environment exposure, egress controls, and redaction of logs, receipts, and artifacts. Source: `.specs/multipass-yolo-workflows/plan.md`.

113. Add deterministic policy gates and run receipts for sandbox identity, host-mount absence, secret scope, network behavior, git handoff, redaction, and teardown. Source: `.specs/multipass-yolo-workflows/plan.md`.

114. Produce the sandbox as a design package before implementation: research brief, user stories, secret threat model, operations, policy gates, safety model, and implementation backlog. Source: `.specs/multipass-yolo-workflows/plan.md`.

### Desktop and operator workflow automation

115. Build a minimal Arch Linux desktop around Niri, WezTerm, Zsh, tmux, Waybar, Wofi, Yazi, and a nine-workspace project layout. Source: `.specs/linux-arch-install/checklist.md`.

116. Treat each Niri workspace as a self-contained git worktree project with terminal, file manager, editor, and browser context. Source: `.specs/linux-arch-install/checklist.md`; `.specs/linux-arch-install/keyboard-training.md`.

117. Prefer Zed as the lightweight VS Code-like editor, retain OpenCode for agent interaction, and trial LazyVim later for deeper keyboard-driven editing. Source: `.specs/linux-arch-install/editor-alternatives.md`; `.specs/linux-arch-install/neovim-setup.md`.

118. Explore a keyboard-training feedback loop using libinput event counts, Niri IPC, Waybar metrics, Mako coaching notifications, cheat-sheet overlays, mouse-free sessions, weekly reports, and streaks. Source: `.specs/linux-arch-install/keyboard-training.md`.

119. Automate per-workspace startup of project-scoped terminal, browser, and file-manager windows. Source: `.specs/linux-arch-install/keyboard-training.md`.

## 3. Recurring themes across specs

### Deterministic control around bounded model judgment

The strongest recurring theme is that routing, selection, lifecycle transitions, retries, timeouts, validation, deduplication, storage, and permissions should be deterministic. Models are used for synthesis, classification, review, and ambiguous judgment inside bounded schemas. This appears in workflow refinement, friction review, typed reviewer migration, task ownership, complexity gates, and the Menos compiler.

Sources: `.specs/pi-workflow-refinement/notes.md`; `.specs/pi-workflow-friction-review/design.md`; `.specs/pi-extension-refactors/backlog.md`; `.specs/pi-task-todo-boundary/plan.md`; `.specs/complexity-risk-gates/PRD.md`; `.specs/menos-knowledge-compiler/plan.md`.

### Direct work first, orchestration only when earned

Several specs reject automatic complexity. Direct parent work is the default; workers are for independent bounded work; worker messaging is deferred; Hermes integrations start with one runtime and one webhook; video inspection starts as a small side layer; Multipass begins with one canonical happy path; and workflow review starts as one thin pipeline.

Sources: `.specs/pi-workflow-refinement/notes.md`; `.specs/pi-extension-refactors/backlog.md`; `.specs/hermes-deploy/PRD.md`; `.specs/ffmpeg-yt-dlp-video-workflow/PRD.md`; `.specs/multipass-yolo-workflows/plan.md`; `.specs/pi-workflow-friction-review/design.md`.

### Durable artifacts and resumability

Plans, task records, compaction summaries, session IDs, lifecycle IDs, review artifacts, evidence files, migration reports, and runtime JSONL stores repeatedly serve as durable boundaries. Completion should be recoverable from explicit artifacts rather than conversational memory.

Sources: `.specs/pi-durable-work-activation/plan.md`; `.specs/pi-task-todo-boundary/plan.md`; `.specs/pi-workflow-refinement/notes.md`; `.specs/pi-workflow-friction-review/design.md`; `.specs/menos-infisical-runtime/plan.md`.

### Evidence before automation changes

The specs repeatedly demand measurement before optimizing reviewer count, prompts, timeouts, thresholds, clustering, model routing, direct worker messaging, or automated intervention. Representative evaluations and before-and-after evidence are preferred over intuition.

Sources: `.specs/pi-workflow-refinement/notes.md`; `.specs/pi-workflow-friction-review/design.md`; `.specs/menos-knowledge-compiler/plan.md`; `.specs/pi-extension-refactors/backlog.md`; `.specs/complexity-risk-gates/PRD.md`.

### One owner per capability

Task tracking is separated from execution and scheduling. Menos owns durable knowledge while clients own capture and injection. Joyride owns local DNS, Cloudflare owns authoritative DNS, and Caddy owns TLS. Herdr owns its lifecycle while Pi owns orchestration. Existing writing skills each receive narrow ownership.

Sources: `.specs/pi-task-todo-boundary/plan.md`; `.specs/menos-knowledge-compiler/plan.md`; `.specs/infisical-dns-certs/plan.md`; `.specs/pi-herdr-full-integration/plan.md`; `.specs/writing-quality-skill-layering/plan.md`.

### Progressive disclosure and lean active context

Global instructions should remain small. Detailed writing, requirements, workflow, and specialist guidance should load only when needed. Tool schemas and descriptions should expose only canonical inputs and relevant capabilities.

Sources: `.specs/pi-workflow-refinement/notes.md`; `.specs/writing-quality-skill-layering/plan.md`; `.specs/pi-task-todo-boundary/plan.md`.

### Privacy by partitioning, redaction, and metadata minimization

The specs favor least-privilege identities, redacted evidence, persona isolation, ephemeral secrets, bounded metadata, no transcript reporting to Herdr, and default exclusion of sensitive or hobby material.

Sources: `.specs/infisical-secrets/plan.md`; `.specs/infisical-dns-certs/plan.md`; `.specs/menos-infisical-runtime/plan.md`; `.specs/menos-knowledge-compiler/plan.md`; `.specs/pi-herdr-full-integration/plan.md`; `.specs/multipass-yolo-workflows/plan.md`.

### Explicit failure and rollback boundaries

Missing tools, invalid secrets, failed validation, unavailable dependencies, broken live mutations, and unsafe cross-persona promotion should fail explicitly. Infrastructure plans use canaries, one-service rollout, verified backups, and bounded rollback.

Sources: `.specs/complexity-risk-gates/PRD.md`; `.specs/infisical-secrets/plan.md`; `.specs/menos-infisical-runtime/plan.md`; `.specs/rootless-podman-quadlet-hardening/plan.md`.

### Local-first operation with CI or durable backend escalation

Complexity checks start in local hooks and escalate to CI. Agent memory capture runs locally but stores in Menos. Infisical and Menos are self-hosted. Multipass provides a local VM boundary. Herdr and Pi metadata remain local and privacy-bounded.

Sources: `.specs/complexity-risk-gates/PRD.md`; `.specs/menos-knowledge-compiler/plan.md`; `.specs/infisical-secrets/plan.md`; `.specs/multipass-yolo-workflows/plan.md`; `.specs/pi-herdr-full-integration/plan.md`.

### Cross-platform behavior is a first-class concern

Windows, WSL, Git Bash, Linux, macOS, hook interpreter ownership, media dependencies, VM drivers, and package-manager choices recur throughout the specs. Cross-platform assumptions are expected to be tested rather than documented vaguely.

Sources: `.specs/ffmpeg-yt-dlp-video-workflow/PRD.md`; `.specs/hermes-deploy/PRD.md`; `.specs/multipass-yolo-workflows/plan.md`; `.specs/menos-knowledge-compiler/plan.md`; `.specs/linux-arch-install/checklist.md`.

## 4. Contradictions or drift between specs

1. **The infrastructure source of truth appears to have moved.** The Infisical and Menos runtime specs target `menos/infra/ansible/`, while the newer Quadlet plan says `.repos/homelab-infra` owns deployment and `.repos/onclave` is read-only input. This makes the older implementation paths likely historical or transitional. Sources: `.specs/infisical-secrets/plan.md`; `.specs/infisical-dns-certs/plan.md`; `.specs/menos-infisical-runtime/plan.md`; `.specs/rootless-podman-quadlet-hardening/plan.md`.

2. **Infisical's deployment state conflicts across active specs.** The Infisical plans describe a partially implemented deployment awaiting live validation. The Menos runtime plan assumes `infisical.ilude.com` and its Caddy certificate path are already stable. The Quadlet plan says Infisical remains disabled and is not a rollout target. Sources: `.specs/infisical-secrets/plan.md`; `.specs/infisical-dns-certs/plan.md`; `.specs/menos-infisical-runtime/plan.md`; `.specs/rootless-podman-quadlet-hardening/plan.md`.

3. **The documented Menos database architecture has drifted.** The Infisical spec explicitly says Menos uses SurrealDB plus Garage and has no PostgreSQL. The newer Quadlet plan describes Menos PostgreSQL and API health-gated dependencies. This likely reflects a later Menos architecture, but the active older plans were not reconciled. Sources: `.specs/infisical-secrets/plan.md`; `.specs/rootless-podman-quadlet-hardening/plan.md`.

4. **The original Infisical Compose design is superseded by the DNS certificate plan.** `compose-design.md` uses stock `caddy:2.8-alpine` and binds both ports 80 and 443. The reviewed DNS plan requires a pinned custom xcaddy build with the Cloudflare module and makes port 80 optional. Sources: `.specs/infisical-secrets/compose-design.md`; `.specs/infisical-dns-certs/plan.md`.

5. **The Menos knowledge compiler has conflicting write-path wording.** T4.0 and T4.1 correctly require a direct shared service call, not self-HTTP and not direct storage. Later T4.1 prose and Handoff Notes still say concepts are "POSTed through the HTTP layer" or use the HTTP endpoint. Sources: `.specs/menos-knowledge-compiler/plan.md`, sections T4.0, T4.1, and Handoff Notes.

6. **The compiler evaluation contract contains residual ground-truth language.** T0.1 says no hand-labeled ground truth is used and relies on snapshots. Its duplicate file list still calls `eval-queries.yaml` a "query set + ground truth", V0 asks whether the ground-truth file is editable, and Handoff Notes say queries should be user-written. The intended contract seems to be user-authored queries without relevance labels. Source: `.specs/menos-knowledge-compiler/plan.md`.

7. **Byte-for-byte retrieval snapshot reproducibility is not credible as specified.** The snapshot includes live endpoint latency, while acceptance requires two captures to produce zero diff. Even with a frozen corpus and stable ordering, latency values will vary. Sources: `.specs/menos-knowledge-compiler/plan.md`; `.specs/menos-knowledge-compiler/eval-baseline-pre.md`.

8. **The compiler baseline exposes weak current retrieval but the plan treats it mainly as a regression baseline.** Many local architecture queries return unrelated video transcripts, agentic results often all score exactly `1.0`, and latencies are tens to hundreds of seconds. This may make overlap stability a measure of preserving poor results rather than improving answer relevance. Source: `.specs/menos-knowledge-compiler/eval-baseline-pre.md`.

9. **The compiler's status is ambiguous.** The pre-capture baseline artifact exists, suggesting T0.1 ran, but every plan checkbox remains unchecked and no execution status section records completed waves. Source: `.specs/menos-knowledge-compiler/plan.md`; `.specs/menos-knowledge-compiler/eval-baseline-pre.md`.

10. **The Menos runtime review artifacts lag the revised plan.** Review 2 reports T6 placement, raw `python`, `--diff`, and compose-config anchoring bugs. The current plan appears to have corrected these, but the synthesis still says "Fix bugs first." Source: `.specs/menos-infisical-runtime/review-2/synthesis.md`; `.specs/menos-infisical-runtime/plan.md`.

11. **The Menos runtime runbook does not yet reflect the proposed T7 wrapper interface.** The plan's intended operator path is four deterministic scripts, but the runbook still documents direct `ansible-playbook` and raw container validation commands. Sources: `.specs/menos-infisical-runtime/plan.md`; `.specs/menos-infisical-runtime/runbook.md`.

12. **The runtime evidence files are templates, not execution evidence.** `migration-report.md` marks every key pending, `validation-wave2.md` says live checks are pending, and `redaction-checklist.md` contains future instructions. The plan nevertheless labels most of T0-T6 complete. Sources: `.specs/menos-infisical-runtime/migration-report.md`; `.specs/menos-infisical-runtime/validation-wave2.md`; `.specs/menos-infisical-runtime/redaction-checklist.md`; `.specs/menos-infisical-runtime/plan.md`.

13. **The durable task boundary and deferred worker messaging depend on different future task models.** The completed task plan explicitly excludes claims, leases, automatic dispatch, and workflow scheduling. The worker-messaging candidate requires atomic task claims, automatic dependency unblocking, and completion notifications first. Adoption would therefore require a separately approved expansion of the task model. Sources: `.specs/pi-task-todo-boundary/plan.md`; `.specs/pi-extension-refactors/backlog.md`.

14. **Lifecycle identity is intentionally deferred in one spec but proposed in another.** Durable compaction explicitly excludes work IDs and a current-work registry, while workflow refinement lists lifecycle identity as the first candidate improvement. This is phased direction rather than an accidental conflict, but later work must preserve the completed minimal boundary unless new evidence justifies expansion. Sources: `.specs/pi-durable-work-activation/plan.md`; `.specs/pi-workflow-refinement/notes.md`.

15. **Several "complete" Pi specs retain unvalidated live UI behavior.** Herdr integration, task schema reduction, and writing-skill work all depend on live slash-command or rendered-TUI checks that the execution surface could not perform. Herdr and task specs still classify the implementation complete; writing correctly remains in progress. Sources: `.specs/pi-herdr-full-integration/plan.md`; `.specs/pi-task-todo-boundary/plan.md`; `.specs/writing-quality-skill-layering/plan.md`.

16. **The Multipass spec points to a missing or renamed research source.** It references `.specs/pipelines-n-policies/notes.md`, but that directory is not among the active top-level specs reviewed. Source: `.specs/multipass-yolo-workflows/plan.md`.

17. **The Linux desktop notes use a stale directory name.** Editor files refer to `.specs/arch-install/neovim-setup.md`, while the active directory is `.specs/linux-arch-install/`. Sources: `.specs/linux-arch-install/checklist.md`; `.specs/linux-arch-install/editor-alternatives.md`.

18. **The Linux desktop setup may predate current package ownership.** It proposes cloning and building Niri manually and contains generic device paths such as `/dev/sda`, but has no validation record or update date. It should not be treated as a current installation runbook without revalidation. Source: `.specs/linux-arch-install/checklist.md`.

19. **Hermes, Herdr, and Pi represent three different control-plane concepts without a settled relationship.** Herdr is explicitly a visibility and control layer that must not own Pi delegation. Hermes is proposed as an autonomous runtime with gateway, workers, and Kanban. The specs do not decide whether Hermes complements Pi, replaces selected external automation, or remains an isolated experiment. Sources: `.specs/pi-herdr-full-integration/plan.md`; `.specs/hermes-deploy/PRD.md`.

20. **The video workflow's client ownership remains unresolved despite repository direction favoring Pi-first runtime ownership.** The PRD asks whether it should be Pi-first, a standalone skill, or shared with Claude and OpenCode. Source: `.specs/ffmpeg-yt-dlp-video-workflow/PRD.md`.

## 5. Explicit future-direction statements

1. **Pi lifecycle shape:** Keep `/goal` as the durable objective wrapper, with `/plan-it`, `/review-it`, and `/do-it` retaining distinct planning, review, and execution ownership. Source: `.specs/pi-workflow-refinement/notes.md`.

2. **Workflow runtime direction:** Move repeated mechanical transitions, artifact checks, retry budgets, and terminal predicates from prompt state machines into deterministic TypeScript once stable enough. Source: `.specs/pi-workflow-refinement/notes.md`.

3. **Review direction:** Do not reduce `/review-it` before measuring reviewer yield and execution outcomes; adaptive review is a later experiment. Source: `.specs/pi-workflow-refinement/notes.md`.

4. **Prompt direction:** Keep global instructions lean and evaluate prompt deduplication incrementally against representative workflows. Source: `.specs/pi-workflow-refinement/notes.md`.

5. **Task direction:** Preserve `task` as durable todo and dependency state, with execution owned by `subagent`, background tools, and the parent. Source: `.specs/pi-task-todo-boundary/plan.md`.

6. **Compaction direction:** Use the existing compaction summary and task registry before inventing workflow instances, attempt stores, artifact stores, or new IDs. Source: `.specs/pi-durable-work-activation/plan.md`.

7. **Delegation direction:** Keep direct work as the default, bound worker contexts and depth, and delegate only independent or specialized work. Source: `.specs/pi-workflow-refinement/notes.md`.

8. **Worker collaboration direction:** Revisit worker-to-worker messaging only after durable task and artifact primitives exist and a recurring consumer proves its value. Source: `.specs/pi-extension-refactors/backlog.md`.

9. **Workflow learning direction:** Use a human-approved evidence loop rather than autonomous self-modification. Background review may recommend but may not edit or authorize. Source: `.specs/pi-workflow-friction-review/design.md`.

10. **Design direction:** Replace universal aesthetic prescriptions with project-context inspection and rendered validation. Source: `.specs/pi-workflow-refinement/notes.md`.

11. **Writing direction:** Improve prose and requirements by refining existing skill owners, not by adding another broad skill or policy layer. Source: `.specs/writing-quality-skill-layering/plan.md`.

12. **Memory direction:** "menos remains the single system of record" while Pi and Claude remain clients over the same backend. Source: `.specs/menos-knowledge-compiler/plan.md`.

13. **Pi memory direction:** Pi is an intended follow-on control-plane client for persona-aware Menos retrieval and injection; Pi-specific persona UX belongs in a separate spec. Source: `.specs/menos-knowledge-compiler/plan.md`.

14. **Memory rollout direction:** Capture silently first, inspect dry-run previews after 10 to 20 sessions, and enable live injection only after user review. Source: `.specs/menos-knowledge-compiler/plan.md`.

15. **Memory scaling direction:** Start with LLM-only compilation, then consider cluster-first extraction after the corpus reaches roughly 200 session logs and evaluation supports it. Source: `.specs/menos-knowledge-compiler/plan.md`.

16. **Memory curation direction:** Waves 6 and 7, lint, digest, and clustering, are optional if capture, compile, and preview already provide enough value. Source: `.specs/menos-knowledge-compiler/plan.md`.

17. **Video direction:** Add visual inspection as a small ephemeral layer beside `/yt` and Menos, not as a replacement knowledge system. Source: `.specs/ffmpeg-yt-dlp-video-workflow/PRD.md`.

18. **Hermes direction:** Begin agent-runtime-first with one deployment, one gateway, one webhook use case, one Kanban proof, and cost-aware auxiliary models. Consider a hybrid messaging gateway only if channel coverage becomes primary. Source: `.specs/hermes-deploy/PRD.md`.

19. **Secrets direction:** Use Infisical machine identities and short-lived tokens as the shared secret boundary; retain `pi/secrets/` as the implementation swap point if the backend changes later. Source: `.specs/infisical-secrets/plan.md`.

20. **Menos secret direction:** Stabilize deploy-time Infisical rendering first, then consider moving service configuration from `.env` files to Docker secrets. Source: `.specs/menos-infisical-runtime/plan.md`.

21. **Container direction:** Replace enabled rootless Compose wrappers with Quadlet supervision, starting with Menos as the canary and migrating one service at a time. Source: `.specs/rootless-podman-quadlet-hardening/plan.md`.

22. **High-risk execution direction:** Use a Multipass VM with no host mounts as the default boundary for YOLO work, with optional nested containers for higher-risk tasks. Source: `.specs/multipass-yolo-workflows/plan.md`.

23. **Complexity-gate direction:** Start with changed-code-only native linter adapters and fixtures, then add coverage joins, SARIF, MCP, and CI examples incrementally. Source: `.specs/complexity-risk-gates/PRD.md`.

24. **Desktop direction:** Move toward a keyboard-driven Niri workspace model where each workspace corresponds to one git worktree project. Source: `.specs/linux-arch-install/checklist.md`; `.specs/linux-arch-install/keyboard-training.md`.

## 6. Open questions

### Portfolio and status

1. Which active specs are genuinely current versus simply not archived, especially `linux-arch-install`, `menos-knowledge-compiler`, and the older Infisical plans?

2. Is `.repos/homelab-infra` now the authoritative deployment repository for Menos, Infisical, Onclave, and SearXNG? If so, should the active `menos/infra/ansible` specs be migrated, superseded, or archived?

3. Is Infisical currently deployed, disabled, or awaiting first deployment? The answer determines whether `menos-infisical-runtime` can proceed at all.

4. What is the current Menos database and container topology: SurrealDB plus Garage, PostgreSQL plus API, or a newer combination?

5. Should completion require live TUI or operator checks when an implementation plan explicitly names them, or can a spec remain complete with those checks recorded as unavailable?

### Pi lifecycle and orchestration

6. Which component should own a future lifecycle ID: `/goal`, the first workflow command, or a shared workflow service?

7. What exact objective and lifecycle metadata should cross `/do-it`'s new-session boundary?

8. How should abandoned, superseded, or concurrently active plans be represented without turning `/goal` into a scheduler?

9. What terminal evidence may `goal_complete` verify without duplicating `/do-it` or task lifecycle authority?

10. How many reviewed executions are needed before changing `/review-it` panel size or composition?

11. What counts as unique reviewer value: a unique finding, an applied finding, a readiness change, or a prevented execution failure?

12. Should lifecycle identity be attempted now that compaction and task linkage exist, or should missed durable activation first be measured through session logs as the completed plan recommends?

13. Would worker-to-worker messaging require expanding the completed task boundary with claims and notifications, or should it live in a separate execution registry?

14. Which provider paths actually support programmatic tool calling or hosted multi-agent execution, and would using them improve on Pi's local inspectable worker artifacts?

### Workflow evaluation and learning

15. Is the fixed Terra low-effort workflow reviewer still the desired comparison baseline?

16. Are the two-minute, ten-minute, and 15 percent sampling thresholds producing enough reviewed interactions without excessive cost?

17. How will reviewer false positives and user corrections be represented so background review quality itself can be measured?

18. Should the friction-review store remain indefinite, or does it need retention and deletion controls despite storing bounded metadata?

19. Which representative workflow cases should become the first durable evaluation suite before prompt or reviewer changes?

### Memory and knowledge

20. Is the Menos knowledge compiler still strategically desired, given the baseline's poor relevance and very high latency?

21. Should retrieval quality first be repaired before preserving it as a baseline and adding compiled concepts?

22. How should snapshot reproducibility handle variable latency fields? Should latency be excluded from byte-level diffs or compared separately?

23. Are user-authored queries sufficient, or is a small relevance-labeled evaluation set needed to distinguish stable bad results from actual quality?

24. What is the authoritative compiler write path wording: shared service call or HTTP endpoint? The implementation tasks say shared service; stale handoff text says HTTP.

25. What is the desired scheduler timezone, and should the default be machine configuration rather than a hardcoded `America/New_York`?

26. Should compiled concepts have a separate cryptographic identity, or is server-side caller and content-type enforcement sufficient?

27. What privacy review is required before default-allow session capture begins in work repositories?

28. How should Pi expose persona selection, preview, status, and memory diagnostics without creating a second memory system?

29. Should Wave 6 weekly digests remain intentional, or be deferred with lint and clustering until capture and compile demonstrate value?

30. What current embedding model and context limit should the chunking and drift contracts target?

### Secrets and infrastructure

31. What remains before the live Infisical deployment can be authorized: DNS record, Cloudflare token, Ansible vault values, host port availability, backup target, or operator time?

32. Should Caddy receive the Cloudflare token through an environment file, a Docker secret, or another mechanism that avoids `docker inspect` exposure?

33. Is `DNS_UNKNOWN_ACTION=drop` still the desired Joyride behavior after testing the real client resolver path?

34. Is port 80 needed at all for the Infisical deployment, and what exact LAN or VPN bind and firewall policy is intended?

35. Should the Menos runtime T7 wrappers be completed, or superseded by the newer homelab infrastructure entrypoints?

36. What is the current backup and restore command that must gate the Quadlet rollout?

37. Can `settings.local.json` be reconstructed from the named private sources without accidentally enabling or disabling services?

38. Does the Quadlet migration also need to migrate Infisical, or should Infisical remain disabled until the older live validation completes?

### Hermes, Herdr, and video tooling

39. What role should Hermes play relative to Pi: separate experiment, external event runtime, team automation backend, or future replacement for selected workflows?

40. Which Hermes target host, provider stack, first webhook, notification channel, dashboard exposure model, and auxiliary-model budget should be selected?

41. Should Hermes and Herdr integrate, or should Herdr remain exclusively a Pi terminal control layer?

42. Should video inspection be a Pi-first `/yt watch`, a separate `/watch` skill, or a shared script consumed by multiple clients?

43. What default frame budgets should apply to short clips, medium videos, and long videos?

44. Should visual summaries be uploadable to Menos, and if so, under what content type and persona scope?

45. What is the cross-platform installation policy for ffmpeg and yt-dlp on Windows, WSL, and Linux?

### Complexity, sandboxing, and desktop workflow

46. Which repository should host the first complexity-gate implementation?

47. Which analyzer versions and thresholds should be treated as blocking versus warning-only?

48. Should the complexity MVP include Fallow and MCP, or defer both until native adapters and JSON normalization are stable?

49. What suppression format should be permitted, and where should justification records live?

50. Does the Multipass design still have a valid source for the referenced pipeline and policy notes?

51. What Windows virtualization driver and nested-container path should the Multipass workflow standardize on?

52. How will network egress be restricted for YOLO processes that receive runtime secrets?

53. Which artifacts constitute a sufficient run receipt without capturing secret-bearing command lines or environment values?

54. Is the Arch and Niri desktop still an active target? If so, the installation instructions need current package, bootloader, device-name, compositor, and dotfile-path validation before execution.

55. Should keyboard coaching remain lightweight habit tracking, or is the proposed event-monitoring and notification system worth maintaining?

56. Is Zed still the preferred editor, and should the obsolete `.specs/arch-install/` references be corrected or the entire desktop spec replaced with a current plan?
