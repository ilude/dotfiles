# Historical and Meta Specs Research Note

## 1. Inventory

Inventory units are top-level historical initiatives plus standalone research, report, and feature dossiers. Review artifacts and evidence files are included in their parent initiative rather than listed separately.

### Archived initiatives

| Item | Topic | Outcome and evidence |
| --- | --- | --- |
| `agent-browser-pi-tooling` | Safe Brave wrapper and Pi browser guidance | Shipped. Execution status says `complete-ready-to-archive`, with focused tests, browser smoke tests, and `make check` passing. Source: `.specs/archive/agent-browser-pi-tooling/plan.md`. |
| `agents-context-loading` | Dynamic project instruction loading and expertise migration | Shipped for context loading. The plan is `completed`; the Phase 2 expertise migration was explicitly planned but not executed. Source: `.specs/archive/agents-context-loading/plan.md`. |
| `bias-resistance` | Confidence calibration and resistance to user framing bias | Shipped, although frontmatter remained `draft`. The plan has `completed: 2026-04-30` and specifies one commit covering six files. Source: `.specs/archive/bias-resistance/plan.md`. |
| `commit-error-handling` | Ignored paths and partial-staging failure behavior | Shipped. Plan status is `completed`. Source: `.specs/archive/commit-error-handling/plan.md`. |
| `commit-llm-untracked` | LLM classification of untracked files inside `/commit` | Shipped. Plan status is `completed` and all task and final-gate checkboxes are checked. Source: `.specs/archive/commit-llm-untracked/plan.md`. |
| `damage-control-modes` | Default, whitelist, and no-shell safety modes | Shipped. Plan status is `completed`; implementation and validation gates are checked. Source: `.specs/archive/damage-control-modes/plan.md`. |
| `dc-hardening` | AST timeout, persistence rules, config sentinels, and content checks | Shipped. Plan status is `completed`. Source: `.specs/archive/dc-hardening/plan.md`. |
| `defender-tuning-ai-cli` | Windows Defender tuning for high-process AI CLI work | Abandoned as an implementation plan after external resolution. The archive note says the issue was resolved per user decision. Source: `.specs/archive/defender-tuning-ai-cli/plan.md`. |
| `deterministic-commit-helper` | Deterministic commit planning and validation | Shipped. Plan status is `completed`; V1 deliberately excluded commit and push execution. Source: `.specs/archive/deterministic-commit-helper/plan.md`. |
| `dolos-private-archive` | Standalone Go private archive system | Shipped. Plan status is `completed`; standalone pack, unpack, status, scan, migration, and validation tasks are checked. `/commit` auto-pack was deferred. Source: `.specs/archive/dolos-private-archive/plan.md`. |
| `extensions-consistency` | Pi extension conventions, Phase 1 | Shipped. Plan status is `completed`; broad standardization was intentionally split into later phases. Source: `.specs/archive/extensions-consistency/plan.md`. |
| `extensions-consistency-phase2` | Broader Pi extension consistency | Shipped. Plan status is `completed`. Source: `.specs/archive/extensions-consistency-phase2/plan.md`. |
| `fix-skill-quality` | Skill descriptions, skeletons, and token reduction | Unknown. The plan has unchecked criteria and no completion metadata. Source: `.specs/archive/fix-skill-quality/plan.md`. |
| `lizard-refactor` | Repository-wide complexity reduction | Unknown, likely not executed as written. Status remains `draft`, completion is blank, and the plan still contains unchecked work. Source: `.specs/archive/lizard-refactor/plan.md`. |
| `low-vram-local-llm-runtime` | Local model runtime for constrained VRAM | Abandoned. Archive note calls it a dormant idea PRD with no successor plan. Source: `.specs/archive/low-vram-local-llm-runtime/PRD.md`. |
| `menos-circuit-breaker` | Local fallback and later backfill when menos is unavailable | Shipped. Plan status is `completed`. Source: `.specs/archive/menos-circuit-breaker/plan.md`. |
| `menos-data-fixes` | RecordID bug, deduplication, and data cleanup | Shipped. Plan records `completed: 2026-02-15`. Source: `.specs/archive/menos-data-fixes/plan.md`. |
| `menos-discovery` | Hostname-based menos discovery and cleanup | Shipped. Plan status is `completed`. Source: `.specs/archive/menos-discovery/plan.md`. |
| `menos-test-gaps` | Menos endpoint, metadata, migration, and search tests | Shipped. Plan records `completed: 2026-02-15`. Source: `.specs/archive/menos-test-gaps/plan.md`. |
| `minio-to-garage` | Menos object-storage migration | Shipped. Plan records `completed: 2026-02-20`. Source: `.specs/archive/minio-to-garage/plan.md`. |
| `pi-agent-setup` | Early broad Pi install, agent, workflow, and safety setup | Unknown. Status remains `draft` with no completion date; later initiatives implemented or replaced many components. Source: `.specs/archive/pi-agent-setup/plan.md`. |
| `pi-agent-team-cleanup` | Remove stale team hierarchy and simplify subagents | Superseded by the consolidated Pi control-plane plan. Source: `.specs/archive/pi-agent-team-cleanup/PRD.md`; `.specs/archive/pi-control-plane-consolidation/plan.md`. |
| `pi-anti-overengineering-cleanup` | Remove scope-expansion instructions | Shipped. Plan status is `complete`. Source: `.specs/archive/pi-anti-overengineering-cleanup/plan.md`. |
| `pi-branch-tab` | Terminal-aware `/branch` command | Superseded by consolidated control-plane cleanup after partial implementation. Source: `.specs/archive/pi-branch-tab/plan.md`; `.specs/archive/pi-control-plane-consolidation/plan.md`. |
| `pi-claude-parity` | Broad Pi and Claude feature parity | Unknown. Status remains `draft`; later plans chose targeted capability alignment instead of undifferentiated parity. Source: `.specs/archive/pi-claude-parity/plan.md`; `.specs/archive/pi-platform-alignment/plan.md`. |
| `pi-command-workflow` | Correct ownership of prompt-only and logic-heavy commands | Shipped. `/handoff` moved from TypeScript to a native prompt template and every gate is checked. Source: `.specs/archive/pi-command-workflow/plan.md`. |
| `pi-commit-extension` | Token-guarded Pi commit tools | Shipped. Plan status is `completed`; a later review confirmed its archive was genuine. Source: `.specs/archive/pi-commit-extension/plan.md`; `.specs/archive/pi-review-2026-05-03/findings.md`. |
| `pi-commit-llm-workflow` | Hybrid LLM commit grouping and deterministic execution | Unknown. Status remains `draft`; later commit plans shipped narrower pieces. Source: `.specs/archive/pi-commit-llm-workflow/plan.md`. |
| `pi-control-plane-consolidation` | Consolidate `/branch`, teams, agents, and task control | Shipped. Plan status is `completed` and evidence covers T1 through T14 plus final validation. Source: `.specs/archive/pi-control-plane-consolidation/plan.md`. |
| `pi-damage-control-parity` | Pi and Claude damage-control parity | Superseded. Most waves completed, but blocked T5 moved to rationalization Phase 5. Source: `.specs/archive/pi-damage-control-parity/plan.md`. |
| `pi-damage-control-refactor` | Damage-control parser and architecture refactor | Shipped. Plan status is `completed`. Source: `.specs/archive/pi-damage-control-refactor/plan.md`. |
| `pi-damage-control-triage` | Scoped delete handling and shadow judge | Shipped. Plan states `complete and archived`. Source: `.specs/archive/pi-damage-control-triage/plan.md`. |
| `pi-damage-control-v2` | Pi damage-control integration and parity matrix | Shipped. Plan status is `completed`. Source: `.specs/archive/pi-damage-control-v2/plan.md`. |
| `pi-dc-runtime-guard` | Reliable runtime interception and registration | Shipped. Plan status is `completed`. Source: `.specs/archive/pi-dc-runtime-guard/plan.md`. |
| `pi-expertise-project-scope` | Project-scoped expertise layers | Shipped. Plan status is `completed`. Source: `.specs/archive/pi-expertise-project-scope/plan.md`. |
| `pi-expertise-similarity` | Optional model-assisted expertise tie-breaking | Unknown, with no execution evidence. Status remains `draft`; it was a deferred follow-on to deterministic snapshotting. Source: `.specs/archive/pi-expertise-similarity/plan.md`. |
| `pi-expertise-snapshotting` | Deterministic expertise snapshots | Unknown, with no execution evidence. Status remains `draft`; later memory retrieval chose a different JSONL retrieval path. Source: `.specs/archive/pi-expertise-snapshotting/plan.md`; `.specs/archive/pi-memory-retrieval/plan.md`. |
| `pi-full-interaction-trace` | Correlated Pi transcript, tool, and routing events | Shipped. Plan status is `completed`. Source: `.specs/archive/pi-full-interaction-trace/plan.md`. |
| `pi-gpt-direct-personality` | Direct prompting profile for OpenAI GPT models | Shipped. Plan status is `completed`. Source: `.specs/archive/pi-gpt-direct-personality/plan.md`. |
| `pi-instruction-control-plane` | Repair instruction ownership and layering | Superseded by rationalization phases and the Claude/Pi global split. Source: `.specs/archive/pi-instruction-control-plane/plan.md`. |
| `pi-memory-followups` | Promotion, snapshot retirement, and backend decision | Shipped. Plan status is `completed`; the backend decision retained in-memory storage. Source: `.specs/archive/pi-memory-followups/plan.md`; `.specs/archive/pi-memory-followups/backend-decision.md`. |
| `pi-memory-retrieval` | Retrieval over expertise JSONL | Shipped with a limitation. Plan status is `completed`, but the embedder document says the real semantic-model acceptance criterion was intentionally unmet. Source: `.specs/archive/pi-memory-retrieval/plan.md`; `.specs/archive/pi-memory-retrieval/embedder.md`. |
| `pi-observability-timing` | Workflow and subagent timing spans | Shipped incompletely. Plan says `completed`, but the later Pi review found T5/T6 only partially wired. Source: `.specs/archive/pi-observability-timing/plan.md`; `.specs/archive/pi-review-2026-05-03/findings.md`. |
| `pi-operator-layer-mvp` | Status, doctor, tasks, and permissions operator layer | Shipped. Plan status is `completed` and became the canonical owner of operator registries. Source: `.specs/archive/pi-operator-layer-mvp/plan.md`; `.specs/archive/pi-platform-alignment/plan.md`. |
| `pi-orchestration-follow-ups` | Launcher truthfulness, tool consolidation, telemetry, and context | Superseded after completion of its substantive items; the remaining capability metadata item moved to rationalization Phase 3. Source: `.specs/archive/pi-orchestration-follow-ups/note.md`. |
| `pi-orchestration-telemetry` | Parent and worker orchestration metrics | Shipped. Plan status is `completed`; the follow-up note records event and stats command delivery. Source: `.specs/archive/pi-orchestration-telemetry/plan.md`; `.specs/archive/pi-orchestration-follow-ups/note.md`. |
| `pi-platform-alignment` | Structural alignment with useful Claude patterns | Shipped. Plan status is `completed`. Source: `.specs/archive/pi-platform-alignment/plan.md`. |
| `pi-prd-workflow` | Native PRD workflow | Shipped. Plan status is `completed`. Source: `.specs/archive/pi-prd-workflow/plan.md`. |
| `pi-prompt-cleanup` | Remove wrong-audience, duplicate, and stale Pi prompt content | Unknown. The plan has no completion status or execution ledger. Source: `.specs/archive/pi-prompt-cleanup/plan.md`. |
| `pi-reload-status` | Visible reload state | Shipped. Plan status is `completed`. Source: `.specs/archive/pi-reload-status/plan.md`. |
| `pi-review-2026-05-03` | Correct findings from a broad Pi review | Shipped. Plan status is `completed`. Source: `.specs/archive/pi-review-2026-05-03/plan.md`. |
| `pi-router-effort-routing` | Cost-first model and effort routing | Shipped. Plan status is `complete`. Source: `.specs/archive/pi-router-effort-routing/plan.md`. |
| `pi-router-training-data` | Route-level corpus for cheapest-acceptable routing | Unknown and apparently incomplete. Status remains `draft`; survey artifacts exist, but the full corpus and gates were deferred to later tasks. Source: `.specs/archive/pi-router-training-data/plan.md`; `.specs/archive/pi-router-training-data/dataset-survey/web-findings.md`. |
| `pi-session-budget` | Epoch watchdog for tool-call, retry, and review drift | Unknown, with no execution status. It is a detailed proposal but has no completion metadata. Source: `.specs/archive/pi-session-budget/plan.md`. |
| `pi-setup-refactor` | Split large extensions and separate source from runtime state | Unknown. Status remains `draft`; later consistency and rationalization work addressed portions through smaller plans. Source: `.specs/archive/pi-setup-refactor/plan.md`. |
| `pi-subagent-routing-policy` | Central command-aware and subagent-aware routing policy | Unknown as implementation. Design artifacts were produced, but the plan remains `draft` and describes rollout rather than completed code. Source: `.specs/archive/pi-subagent-routing-policy/plan.md`; `.specs/archive/pi-subagent-routing-policy/current-state.md`. |
| `pi-task-dag-runner` | Mixed manual and executable durable DAG | Shipped. Plan status is `complete`. Source: `.specs/archive/pi-task-dag-runner/plan.md`. |
| `pi-task-ready-deps` | Ready/waiting dependency UX and start enforcement | Shipped. Plan status is `completed`; every execution and final gate is checked. Source: `.specs/archive/pi-task-ready-deps/plan.md`. |
| `pi-tasks-control-plane` | Native task registry, tools, dependencies, and persistence | Superseded before execution by the consolidated control-plane plan. Source: `.specs/archive/pi-tasks-control-plane/PRD.md`; `.specs/archive/pi-tasks-control-plane/plan.md`. |
| `pi-test-orchestrator` | Durable Playwright test orchestration | Shipped as an MVP, not complete as a general framework. Status is `mvp-implemented`; broader adapters and SDK decisions remain open. Source: `.specs/archive/pi-test-orchestrator/plan.md`. |
| `pi-tool-reduction` | Deterministic tool-output compaction | Shipped for Phase 1. Status is `phase-1-complete`; LLM rule generation and classifier routing were explicitly deferred. Source: `.specs/archive/pi-tool-reduction/plan.md`. |
| `pi-workflow-audit` | Scientific audit of plan, review, and execution workflows | Shipped as an audit. Archive note says it was implemented and later used as the rationalization baseline. Source: `.specs/archive/pi-workflow-audit/plan.md`; `.specs/archive/pi-workflow-audit/report.md`. |
| `pi-workflow-borrowed-features` | Borrow operator ideas from community extensions | Superseded by `pi-operator-layer-mvp`, which describes itself as the execution wrapper around these artifacts. Source: `.specs/archive/pi-workflow-borrowed-features/mvp-spec.md`; `.specs/archive/pi-operator-layer-mvp/plan.md`. |
| `pi-workflow-hardening` | Early workflow hardening draft | Unknown. Status remains `draft`; the dated successor plan shipped the focused contract work. Source: `.specs/archive/pi-workflow-hardening/plan.md`; `.specs/archive/pi-workflow-hardening-2026-05-26/plan.md`. |
| `pi-workflow-hardening-2026-05-26` | Plan, review, and execution prompt contracts | Shipped. Plan status is `completed`, with all gates checked. Source: `.specs/archive/pi-workflow-hardening-2026-05-26/plan.md`. |
| `private-archive-encryption` | Whole-archive age encryption | Superseded after shipping. It implemented the selected archive approach, then Dolos migrated the old private archive scripts and workflow. Source: `.specs/archive/private-archive-encryption/plan.md`; `.specs/archive/dolos-private-archive/plan.md`. |
| `private-encrypted-workflow` | Per-file private age encryption | Superseded by the later whole-archive decision. Source: `.specs/archive/private-encrypted-workflow/plan.md`; `.specs/archive/private-archive-encryption/plan.md`. |
| `prompt-router-control-plane` | Provider seam and context-aware router control plane | Superseded by V2 after its provider-seam implementation landed. Source: `.specs/archive/prompt-router-control-plane/plan.md`. |
| `prompt-router-control-plane-v2` | Awaited provider seam and full router controls | Shipped. Plan status is `completed`. Source: `.specs/archive/prompt-router-control-plane-v2/plan.md`. |
| `prompt-router-curation-pipeline` | Deterministic corpus curation pipeline | Shipped. Plan status is `completed`. Source: `.specs/archive/prompt-router-curation-pipeline/plan.md`. |
| `prompt-router-retrain-gates` | Candidate review and retraining gates | Shipped. Plan status is `completed`. Source: `.specs/archive/prompt-router-retrain-gates/plan.md`. |
| `prompt-router-v1` | Initial context-aware prompt router | Shipped. Plan status is `completed`. Source: `.specs/archive/prompt-router-v1/plan.md`. |
| `rationalization` | Remove fixed prescriptions, prose tests, and incidental tooling | Shipped. Plan status is `completed`; its ledger closes 109 of 109 decisions. Source: `.specs/archive/rationalization/plan.md`; `.specs/archive/rationalization/ledger.md`. |
| `rationalization-phase2` | Consolidate contracts, rules, roster, and reducer behavior | Shipped. Plan status is `completed`; the decision ledger records executed outcomes and measured improvements. Source: `.specs/archive/rationalization-phase2/plan.md`; `.specs/archive/rationalization-phase2/ledger.md`. |
| `rationalization-phase3` | Notifications, continuation, leases, and mechanical dispatch | Shipped. Plan status is `completed`. Source: `.specs/archive/rationalization-phase3/plan.md`. |
| `rationalization-phase4` | Deterministic measurement and human-gated improvement loop | Shipped with one declined experiment. Plan status is `completed`; T5 was explicitly declined before closure. Source: `.specs/archive/rationalization-phase4/plan.md`. |
| `rationalization-phase5` | Shared Pi and Claude damage-control policy and logging | Abandoned. The plan says it was closed without port by user decision; Pi-native telemetry and shadow judging remain definitive. Source: `.specs/archive/rationalization-phase5/plan.md`. |
| `rationalization-port` | Port selected rationalization work back to main | Shipped. Plan status is `completed`. Source: `.specs/archive/rationalization-port/plan.md`. |
| `read-expertise-vector` | Focused retrieval for expertise | Shipped. Plan status is `completed`. Source: `.specs/archive/read-expertise-vector/plan.md`. |
| `review-command` | OpenCode `/review` command | Shipped despite stale `in-progress` frontmatter. The body explicitly says `COMPLETED` and names the created command. Source: `.specs/archive/review-command/plan.md`. |
| `ruleset-audit` | Historical friction, rules, commands, agents, and skills audit | Shipped as an audit; implementation of every recommendation is not established. The recommendation document reports six source audits and 40 sessions analyzed. Source: `.specs/archive/ruleset-audit/recommendations.md`. |
| `safe-edit-tools` | Structured and guarded edit tools | Shipped. Execution log records implementation, focused tests, `make check`, and archive preflight passing. Source: `.specs/archive/safe-edit-tools/execution-log.md`. |
| `secure-lan-pi-coms` | Trusted LAN Pi discovery and messaging | Shipped for the base MVP. Plan status is `completed`; additional mobile, observer, platform, and guardrail PRDs remain draft. Source: `.specs/archive/secure-lan-pi-coms/plan.md`; `.specs/archive/secure-lan-pi-coms/mobile-agent-comms-app-PRD.md`. |
| `serapis-env-vault` | Zero-knowledge self-hosted `.env` vault | Unknown, with no implementation evidence in the reviewed specs. The PRD and security review remain design documents with unchecked implementation controls. Source: `.specs/archive/serapis-env-vault/PRD.md`; `.specs/archive/serapis-env-vault/SECURITY_REVIEW.md`. |
| `skill-review-system` | Deterministic multi-model skill review | Shipped. Plan status is `completed`. Source: `.specs/archive/skill-review-system/plan.md`. |
| `skill-stats-logging` | Skill load telemetry and `/skill-stats` | Shipped. Plan status is `completed`. Source: `.specs/archive/skill-stats-logging/plan.md`. |
| `skills-planning-consolidation` | Merge skill and planning commands into canonical owners | Shipped. Plan records `completed: 2026-02-15`. Source: `.specs/archive/skills-planning-consolidation/plan.md`. |
| `ssh-pem-use-inspect-split` | Distinguish SSH key use from metadata inspection | Shipped for the applicable boundaries. The note says the metadata-tool case is closed and SSH use in Pi bash is not applicable. Source: `.specs/archive/ssh-pem-use-inspect-split/pi-parity-gap.md`. |
| `subscription-sdk-wiring` | Claude, Codex, and Copilot subscription providers for Onyx | Shipped according to `completed: 2026-02-17`. Source: `.specs/archive/subscription-sdk-wiring/plan.md`. |
| `test-modernization` | Replace Bats tests with fast Pytest behavior tests | Shipped. Plan records `completed: 2026-02-19`. Source: `.specs/archive/test-modernization/plan.md`. |
| `test-tag-exclude` | Remove YouTube router and hide test-tagged content by default | Shipped. Plan records `completed: 2026-02-15`. Source: `.specs/archive/test-tag-exclude/plan.md`. |
| `treesitter-ast-dmg-ctrl` | Tree-sitter veto pass for shell safety | Shipped. Plan records `completed: 2026-02-25`. Source: `.specs/archive/treesitter-ast-dmg-ctrl/plan.md`. |
| `vdi-notes` | Remote development and VDI options | Abandoned as an active initiative; retained as dormant reference notes. Source: `.specs/archive/vdi-notes/notes.md`. |
| `winget-dsc-migration` | Move Windows packages to WinGet Configuration | Shipped. Plan status is `completed`. Source: `.specs/archive/winget-dsc-migration/plan.md`. |
| `winget-dynamic-shims` | Dynamic WinGet executable shim framework | Shipped. Plan status is `completed`. Source: `.specs/archive/winget-dynamic-shims/plan.md`. |
| `workflow-test-rationalization` | Research on workflow, tests, and instruction bloat | Superseded after seeding rationalization Phases 1 and 2. Source: `.specs/archive/workflow-test-rationalization/summary.md`. |
| `x-research-pipeline` | Local X research capture and SQLite pipeline | Shipped. Plan status is `completed`; Birdclaw reuse remained out of scope. Source: `.specs/archive/x-research-pipeline/plan.md`; `.specs/archive/x-research-pipeline/reuse-decision.md`. |
| `zellij-cockpit-v1-1-ux` | Discoverability and health UX for the Zellij cockpit | Unknown, likely never executed. Status remains `draft` and it depends on an unshipped V1. Source: `.specs/archive/zellij-cockpit-v1-1-ux/plan.md`. |
| `zellij-windows-cockpit-v1` | Windows Zellij, Micro, Yazi, and Pi cockpit | Abandoned. Archive note calls it dormant with no successor plan. Source: `.specs/archive/zellij-windows-cockpit-v1/plan.md`. |

### Research, report, and feature dossiers

| Item | Topic | Outcome and evidence |
| --- | --- | --- |
| `research/AI-RULES-SKILLS-REPOS-RESOURCES.md` | Deterministic guardrails and instruction design | Shipped as research supporting an added deterministic-by-default rule. Source: `.specs/research/AI-RULES-SKILLS-REPOS-RESOURCES.md`. |
| `research/agents-md-init-command.md` | Conservative `/init` generation of `AGENTS.md` | Shipped as research; no implementation is established. Source: `.specs/research/agents-md-init-command.md`. |
| `research/claude-code-worktree.md` | Worktree behavior and risk | Shipped as research; it recommends avoiding automatic worktrees for dotfiles and infrastructure repositories. Source: `.specs/research/claude-code-worktree.md`. |
| `research/code-review-notes.md` | False-positive-resistant code review | Shipped as research; implementation status is unknown. Source: `.specs/research/code-review-notes.md`. |
| `research/damage-control-gap-analysis.md` | Prompt-injection and cross-action safety gaps | Shipped as research and later informed hardening plans. Source: `.specs/research/damage-control-gap-analysis.md`; `.specs/archive/dc-hardening/plan.md`. |
| `research/damage-control-temp-cleanup-prior-art.md` | Provenance-based safe temp cleanup | Shipped as research; implementation is not established. Source: `.specs/research/damage-control-temp-cleanup-prior-art.md`. |
| `research/menos-research-integration-plan.md` | Store research output in menos | Unknown and apparently unexecuted. It remains a proposal with open questions. Source: `.specs/research/menos-research-integration-plan.md`. |
| `research/openai-compatible-chat-providers.md` | OpenAI, OpenRouter, and Ollama compatibility | Shipped as implementation research. Source: `.specs/research/openai-compatible-chat-providers.md`. |
| `research/skills-agent-ecosystem.md` | Skills standards, marketplaces, and meta-skills | Shipped as research used to design the skills-engineer surface. Source: `.specs/research/skills-agent-ecosystem.md`. |
| `improvement-reports/2026-07-17.md` | Harness usage, friction, and cleanup proposals | Shipped as a report. Its proposals explicitly require a separate approved slice and are not implementation evidence. Source: `.specs/improvement-reports/2026-07-17.md`. |
| `features/msys2-bash-crash/context.md` | MSYS2 mount-table race and patched runtime | Shipped remediation with drift. The patched DLL was installed and stress-tested, but several mitigations later drifted and follow-ups remain open. Source: `.specs/features/msys2-bash-crash/context.md`. |
| `features/pi-improve/context.md` | Explicit, transcript-visible improvement decisions | Shipped. The dossier records current behavior, accepted decisions, rejected alternatives, tests, and open questions. Source: `.specs/features/pi-improve/context.md`. |

## 2. Ideas that were tried and retired

- Fixed review panels and automatic re-review were retired after a six-reviewer run became self-sustaining churn. The stated replacement is one proportional pass, evidence verification, one application of necessary edits, and no automatic follow-up panel. Quote: "stop after one coherent pass unless the user explicitly requests more review." Source: `.specs/archive/workflow-test-rationalization/summary.md`.

- Tests that freeze prompt wording, headings, comments, source spelling, or file layout were broadly retired. Quote: "Tests protect code, not policy prose." The final ledger records 109 decisions executed and zero pending rows. Source: `.specs/archive/workflow-test-rationalization/summary.md`; `.specs/archive/rationalization/ledger.md`.

- The agent organization chart was tried through fields such as `roleType`, `reportsTo`, `leads`, and `routingUse`, then deleted because it was not launch-enforced. The surviving roster is based on distinct tool or skill boundaries, not model size or reporting hierarchy. Quote: "Organization-chart metadata and model-size variants do not justify separate files." Source: `.specs/archive/rationalization/roster.md`.

- Dedicated model-size agents such as `coding-light`, `coding-medium`, `coding-heavy`, `validator-heavy`, and `utility-mini` were merged into capability roles. The recurring lesson was that runtime model selection is a dispatch parameter, not role identity. Source: `.specs/archive/rationalization/roster.md`; `.specs/archive/rationalization-phase3/plan.md`.

- The separate `/team` command was removed after explicit team and lead semantics moved into `subagent`. The control-plane plan required `/team` to disappear as an active workflow rather than remain as an alias. Source: `.specs/archive/pi-control-plane-consolidation/plan.md`.

- Separate `todo` and model-facing `task_*` tools were retired in favor of one `task` tool and `/tasks` operator UI. Quote: "The unified `task` tool now owns planning, dependencies, lifecycle updates, background execution, cancellation, and bounded output." Source: `.specs/archive/pi-orchestration-follow-ups/note.md`.

- Prompt-only `/handoff` was first implemented as TypeScript, then moved to a native prompt template because the TypeScript extension was "the wrong abstraction for a markdown-only workflow." Logic-heavy commands remained TypeScript-owned. Source: `.specs/archive/pi-command-workflow/plan.md`.

- Model-narrated workflow telemetry was retired because schema-shaped prose was not telemetry and the runtime never emitted the claimed events. Quote: "The only consumer reads mechanically written dispatch JSONL; schema-shaped plan prose was not machine telemetry." Source: `.specs/archive/rationalization-phase2/ledger.md`.

- The fixed 1-3-1 response template, issue counters, hedge-word rituals, and question-tool format preference were removed or consolidated because they preserved presentation rituals rather than failure prevention. Source: `.specs/archive/rationalization-phase2/ledger.md`.

- Ingestion-time reduction of routine tool results was replaced after it was found to destroy fresh evidence before its first model-visible turn. The replacement keeps recent results whole until context pressure justifies threshold-based reduction. Source: `.specs/archive/rationalization-phase2/ledger.md`.

- Per-call reducer startup was replaced with a persistent worker after measurement showed approximately 329.9 ms one-shot p50 versus 9.7 ms persistent p50. Source: `.specs/archive/rationalization-phase2/ledger.md`.

- Automatic per-subagent worktrees were rejected after research and implementation experience showed merge ceremony, setup drift, submodule issues, and unsafe symlink behavior in dotfiles. The chosen direction is explicit worktrees for independent instances plus shared occupancy warnings, not automatic intra-instance isolation. Source: `.specs/research/claude-code-worktree.md`; `.specs/archive/rationalization-phase3/plan.md`.

- A shared Pi and Claude damage-control policy was attempted as rationalization Phase 5 and then closed without port. The retained direction is Pi-native evaluation telemetry and shadow judging, not a forced cross-client policy source. Source: `.specs/archive/rationalization-phase5/plan.md`.

- Per-file private encryption was replaced by whole-archive encryption, which was then migrated to Dolos. The design direction moved from many path-mapping rules toward one explicit archive transaction and later a standalone purpose-built tool. Source: `.specs/archive/private-encrypted-workflow/plan.md`; `.specs/archive/private-archive-encryption/plan.md`; `.specs/archive/dolos-private-archive/plan.md`.

- Broad "parity" as a goal was gradually retired in favor of targeted capability gaps and native architecture. Later plans explicitly say not to pursue blind upstream parity or wholesale copying. Source: `.specs/archive/pi-tasks-control-plane/PRD.md`; `.specs/archive/pi-platform-alignment/plan.md`.

## 3. Ideas proposed but never executed

The following have explicit non-execution evidence or no completion evidence in their own specs:

- Full expertise migration after dynamic context loading. The plan states that Phase 2 was planned but not executed. Source: `.specs/archive/agents-context-loading/plan.md`; `.specs/archive/agents-context-loading/phase-2-expertise-migration.md`.

- Low-VRAM local LLM runtime. It was archived as a dormant idea with no successor plan. Source: `.specs/archive/low-vram-local-llm-runtime/PRD.md`.

- Windows Zellij cockpit V1 and its V1.1 UX layer. V1 was archived as dormant; V1.1 remained draft and depended on V1. Source: `.specs/archive/zellij-windows-cockpit-v1/plan.md`; `.specs/archive/zellij-cockpit-v1-1-ux/plan.md`.

- Multi-agent Zellij Agent Manager, persistent agent sessions, dynamic roster, and workspace coordination. These were explicitly deferred from the cockpit MVP. Source: `.specs/archive/zellij-windows-cockpit-v1/extra-notes.md`.

- Session budget watchdog with epoch-level tool, retry, and repeated-review sensors. The plan is detailed but has no completion metadata. Source: `.specs/archive/pi-session-budget/plan.md`.

- Repository-wide lizard complexity refactor. Status remains `draft` with no completion date. Source: `.specs/archive/lizard-refactor/plan.md`.

- Broad Pi setup refactor and broad Pi/Claude parity plans. Both remain drafts with no completion dates; later work used narrower initiatives instead. Source: `.specs/archive/pi-setup-refactor/plan.md`; `.specs/archive/pi-claude-parity/plan.md`.

- Model-assisted expertise similarity and deterministic expertise snapshotting. Both remain draft, and the shipped memory system took a different JSONL retrieval path. Source: `.specs/archive/pi-expertise-similarity/plan.md`; `.specs/archive/pi-expertise-snapshotting/plan.md`; `.specs/archive/pi-memory-retrieval/plan.md`.

- Route-level training corpus completion. Dataset surveys exist, but the plan remains draft and its full corpus validation depended on later tasks. Source: `.specs/archive/pi-router-training-data/plan.md`.

- LLM-generated tool-reduction rules, novelty detection, classifier routing, and background updater. Phase 1 shipped, but Phase 2 was explicitly deferred until corpus diversity justified it. Source: `.specs/archive/pi-tool-reduction/plan.md`.

- Dolos `/commit` auto-pack and remote freshness integration. The standalone MVP intentionally deferred these until dogfooding proved the archive operations. Source: `.specs/archive/dolos-private-archive/plan.md`.

- Birdclaw import/export for X research. It was left outside the MVP pending stabilization. Source: `.specs/archive/x-research-pipeline/reuse-decision.md`.

- Research ingestion into menos. The proposal describes API and skill changes but remains an open integration plan. Source: `.specs/research/menos-research-integration-plan.md`.

- Provenance-based automatic downgrade for safe `mktemp` cleanup. The research defines a candidate implementation and open questions, but no reviewed spec establishes that it shipped. Source: `.specs/research/damage-control-temp-cleanup-prior-art.md`.

- Serapis zero-knowledge `.env` vault. The PRD and security review remain design artifacts with open and unchecked controls. Source: `.specs/archive/serapis-env-vault/PRD.md`; `.specs/archive/serapis-env-vault/SECURITY_REVIEW.md`.

- Secure LAN follow-ons: mobile app, observer subscriptions, OpenClaw/Hermes integration, full platform architecture, and Tailscale Aperture guardrails all remain draft PRDs. Source: `.specs/archive/secure-lan-pi-coms/mobile-agent-comms-app-PRD.md`; `.specs/archive/secure-lan-pi-coms/observer-subscriptions-PRD.md`; `.specs/archive/secure-lan-pi-coms/openclaw-hermes-integration-PRD.md`; `.specs/archive/secure-lan-pi-coms/technology-stack-architecture-PRD.md`; `.specs/archive/secure-lan-pi-coms/tailscale-aperture-guardrails-PRD.md`.

- The 2026-07-17 improvement report's command retirements and dormant-spec cleanup. The report says proposals require a separate approved slice, and later rationalization evidence warns that zero telemetry is not proof of no value. Source: `.specs/improvement-reports/2026-07-17.md`; `.specs/archive/rationalization-phase2/ledger.md`.

- MSYS2 upstream PR, issue comments, Visual Studio Git unification, enforced Git version pin, and post-upgrade DLL verification. These are explicitly listed as never completed. Source: `.specs/features/msys2-bash-crash/context.md`.

## 4. Recurring lessons and design principles

### Agent workflows and review

- Flexible judgment belongs in the model; repeated objective mechanics belong in maintained code. Quote: "A deterministic program is not automatically better." Promotion is justified by measured time, context, error, or consistency benefits, not merely because something can be coded. Source: `.specs/archive/workflow-test-rationalization/summary.md`.

- Review should be proportional to risk and change size. Fixed fan-out creates review theater, duplicated findings, and self-generated churn. Source: `.specs/archive/workflow-test-rationalization/summary.md`; `.specs/archive/pi-workflow-audit/report.md`.

- Findings require direct evidence, a demonstrated impact, a required fix, and duplicate/noise classification. Source: `.specs/archive/pi-workflow-audit/report.md`.

- Code review must establish the merge base, inspect only newly introduced changes, trace callers, and verify claimed standards against repository evidence. Source: `.specs/research/code-review-notes.md`.

- Fresh-context review is useful, but more reviewers are not automatically better. Hybrid deterministic context selection and post-generation validation are more reliable than unconstrained agent autonomy. Quote: "Agent autonomy without structure doesn't scale." Source: `.specs/research/code-review-notes.md`.

- Automation should apply supported artifact fixes once, then validate the result directly rather than triggering another complete panel. Source: `.specs/archive/workflow-test-rationalization/summary.md`.

### Task systems and orchestration

- There should be one canonical durable task graph, not separate planning, todo, team, and execution systems. Quote: "The target is one optional durable work graph, not separate planning and orchestration systems." Source: `.specs/archive/pi-task-dag-runner/plan.md`.

- Durable tasks are optional. Ordinary short work can remain prose; persistence is justified by dependencies, resumability, background work, or explicit tracking needs. Source: `.specs/archive/pi-task-dag-runner/plan.md`.

- Lifecycle mutations need one service and one state machine. Competing command, tool, and coordinator transition rules create drift. Source: `.specs/archive/pi-task-dag-runner/plan.md`.

- Forward dependency edges are authoritative; partial persistence must be explicit and recoverable rather than disguised as atomic success. Source: `.specs/archive/pi-task-dag-runner/plan.md`.

- Polling is a design smell when event-driven completion and one-shot joins are available. Later work added background notifications and mechanical dispatch to stop the model narrating scheduler loops. Source: `.specs/archive/pi-task-dag-runner/plan.md`; `.specs/archive/rationalization-phase3/plan.md`.

- Agent metadata must be launcher-enforced or removed. Advisory fields that look like security, isolation, memory, or hierarchy contracts are worse than absent fields. Source: `.specs/archive/pi-orchestration-follow-ups/note.md`; `.specs/archive/rationalization-phase3/plan.md`.

- Model and effort selection are dispatch policy, not durable agent identity. Source: `.specs/archive/rationalization/roster.md`; `.specs/archive/rationalization-phase3/plan.md`.

- Parallel reads are useful; overlapping or scope-less writers need serialization or explicit worktree separation. Source: `.specs/archive/pi-orchestration-follow-ups/note.md`; `.specs/archive/rationalization-phase3/plan.md`.

### Instructions, skills, and context

- Less instruction is preferred when rules duplicate, contradict, or restate enforceable mechanics. Quote: "Less instruction is preferred." Source: `.specs/archive/workflow-test-rationalization/summary.md`.

- Runtime discovery should replace fixed model names, agent names, panel sizes, team hierarchies, and file-count routing. Quote: "Runtime discovery over fixed inventories." Source: `.specs/archive/workflow-test-rationalization/summary.md`.

- One policy owner should exist for each durable decision. Skills and local files should point to that owner rather than restate it. Source: `.specs/archive/rationalization-phase2/ledger.md`.

- Progressive disclosure is the preferred skill architecture: small trigger metadata always visible, focused instructions on activation, and supporting resources loaded only when required. Source: `.specs/research/skills-agent-ecosystem.md`.

- Generated instruction files should be conservative, concise, evidence-derived, and in-place updates rather than wholesale replacements. Source: `.specs/research/agents-md-init-command.md`.

### Determinism, testing, and evidence

- Tests should protect executable behavior, parsed schemas, normalized configuration meaning, external protocols, state transitions, and safety boundaries. Source: `.specs/archive/workflow-test-rationalization/summary.md`; `.specs/archive/rationalization/ledger.md`.

- Source-text tests do not prove runtime safety. Examples include broad process-kill greps, prose headings, extension file placement, and prompt wording. Source: `.specs/archive/rationalization/ledger.md`.

- Accepted loss is preferable to a slow, flaky, or misleading behavior test when no cheap deterministic fixture exists. Quote: "Accepted loss beats a slow or flaky behavior test." Source: `.specs/archive/rationalization/plan.md`.

- Structured evidence should outrank model narrative. Plan state, commit hashes, task completion, routing outcomes, and validation commands should be mechanically checkable. Quote: "Only code survives fresh sessions." Source: `.specs/archive/rationalization-phase4/plan.md`.

- Improvement automation should collect and propose, not mutate policy. Quote: "Automation ends at the proposal boundary." Source: `.specs/archive/rationalization-phase4/plan.md`; `.specs/features/pi-improve/context.md`.

- Missing telemetry is an unknown, not evidence of non-use. Source: `.specs/improvement-reports/2026-07-17.md`.

### Safety and infrastructure

- Safety decisions should consume structured facts and provenance, not raw strings or model guesses. Source: `.specs/research/damage-control-temp-cleanup-prior-art.md`.

- Ambiguous parsing, timeouts, unsupported syntax, or unproven cleanup provenance should fail closed to `ask`, not silently allow. Source: `.specs/research/damage-control-gap-analysis.md`; `.specs/research/damage-control-temp-cleanup-prior-art.md`.

- Tool-call safety alone is insufficient for agent systems. Persistent config writes, memory poisoning, hidden Unicode, URL exfiltration, and cross-action chains require content and session-level controls. Source: `.specs/research/damage-control-gap-analysis.md`.

- Infrastructure plans repeatedly prefer small, independently testable foundations over broad first releases: native task MVP before execution orchestration, standalone Dolos before `/commit` coupling, direct LAN hubs before gossip, and deterministic reducer rules before model-generated rules. Source: `.specs/archive/pi-tasks-control-plane/PRD.md`; `.specs/archive/dolos-private-archive/plan.md`; `.specs/archive/secure-lan-pi-coms/plan.md`; `.specs/archive/pi-tool-reduction/plan.md`.

- Live or durable state needs explicit backups, atomic promotion, rollback boundaries, and failure evidence. This recurs in Garage migration, private archives, Dolos, task persistence, and MSYS2 remediation. Source: `.specs/archive/minio-to-garage/plan.md`; `.specs/archive/private-archive-encryption/plan.md`; `.specs/archive/dolos-private-archive/plan.md`; `.specs/archive/pi-task-dag-runner/plan.md`; `.specs/features/msys2-bash-crash/context.md`.

- Process churn can be a systems problem, not a command-level bug. The MSYS2 incident tied rapid subprocess creation, mixed runtime versions, domain lookup latency, and security scanning to a shared-memory race. Source: `.specs/features/msys2-bash-crash/context.md`.

## 5. Evolution arcs

### Task and DAG systems

1. `pi-workflow-borrowed-features` proposed status, tasks, and permissions as a thin operator layer. Source: `.specs/archive/pi-workflow-borrowed-features/mvp-spec.md`.
2. `pi-operator-layer-mvp` turned those artifacts into canonical task and permission registries plus operator commands. Source: `.specs/archive/pi-operator-layer-mvp/plan.md`.
3. `pi-tasks-control-plane` proposed a native registry, lifecycle, dependency, persistence, redaction, and tool MVP while explicitly deferring execution orchestration. Source: `.specs/archive/pi-tasks-control-plane/PRD.md`.
4. `pi-control-plane-consolidation` absorbed that plan with branch and team cleanup, avoiding parallel control planes. Source: `.specs/archive/pi-control-plane-consolidation/plan.md`.
5. `pi-task-ready-deps` added visible ready/waiting semantics and start enforcement without becoming a workflow engine. Source: `.specs/archive/pi-task-ready-deps/plan.md`.
6. `pi-orchestration-follow-ups` unified todo and task tools into one model-facing `task` tool. Source: `.specs/archive/pi-orchestration-follow-ups/note.md`.
7. `pi-task-dag-runner` added same-batch graph construction, bounded fan-out, and event-driven await for mixed manual and executable work. Source: `.specs/archive/pi-task-dag-runner/plan.md`.
8. `rationalization-phase3` added completion notifications, continuation, leases, and mechanical ready-task dispatch so the model no longer pumps waves manually. Source: `.specs/archive/rationalization-phase3/plan.md`.

Direction: from fragmented operator state to one optional durable DAG, then from model-narrated scheduling to launcher-enforced orchestration.

### Workflow commands

1. Early Pi setup plans encoded broad TypeScript command suites, file-count routing, fixed agents, and team workflows. Source: `.specs/archive/pi-agent-setup/plan.md`.
2. `pi-command-workflow` established a split: prompt-only commands use native markdown templates; stateful or logic-heavy commands use TypeScript. Source: `.specs/archive/pi-command-workflow/plan.md`.
3. `/prd-it`, `/plan-it`, `/review-it`, and `/do-it` accumulated explicit checklists, evidence, manual gates, and archive rules. Source: `.specs/archive/pi-prd-workflow/plan.md`; `.specs/archive/pi-workflow-hardening-2026-05-26/plan.md`.
4. The workflow audit found handoff ambiguity, weak measurable criteria, and review-noise risk. Source: `.specs/archive/pi-workflow-audit/report.md`.
5. Rationalization then removed fixed panels, fixed model inventories, prose telemetry, and wording tests, compressing workflows into state-machine prompts with one output contract each. Source: `.specs/archive/workflow-test-rationalization/summary.md`; `.specs/archive/pi-orchestration-follow-ups/note.md`; `.specs/archive/rationalization/plan.md`.
6. Phase 4 moved workflow truth from prose into `plan-lint`, telemetry, and human-reviewed improvement reports. Source: `.specs/archive/rationalization-phase4/plan.md`.

Direction: from prescriptive prompts and hardcoded orchestration to small command contracts backed by deterministic state and measurement.

### Agents and orchestration

1. Early designs used `/team`, lead/worker hierarchies, fixed model tiers, and agent frontmatter for domain and isolation concepts. Source: `.specs/archive/pi-agent-setup/plan.md`; `.specs/archive/pi-agent-team-cleanup/PRD.md`.
2. Consolidated control-plane work made `pi/agents/` canonical and moved team dispatch into `subagent`, removing `/team`. Source: `.specs/archive/pi-control-plane-consolidation/plan.md`.
3. Follow-up work made tools, skills, model, and effort launcher-consumed while removing unenforced metadata. Source: `.specs/archive/pi-orchestration-follow-ups/note.md`.
4. Rationalization collapsed model-size roles and deleted organization-chart fields. Source: `.specs/archive/rationalization/roster.md`.
5. Phase 3 added continuation, notification, cross-client occupancy leases, and structured outputs without adding a workflow DSL. Source: `.specs/archive/rationalization-phase3/plan.md`.

Direction: agent files became capability packages, while orchestration moved into explicit launcher and task-system mechanics.

### Damage control

1. Tree-sitter added a veto-only AST pass over regex safety checks. Source: `.specs/archive/treesitter-ast-dmg-ctrl/plan.md`.
2. Gap research identified config poisoning, timeout fail-open behavior, hidden Unicode, URL exfiltration, and multi-step chains. Source: `.specs/research/damage-control-gap-analysis.md`.
3. `dc-hardening`, Pi V2, refactor, and runtime guard plans improved rules, registration, and execution reliability. Source: `.specs/archive/dc-hardening/plan.md`; `.specs/archive/pi-damage-control-v2/plan.md`; `.specs/archive/pi-damage-control-refactor/plan.md`; `.specs/archive/pi-dc-runtime-guard/plan.md`.
4. Parity work cataloged differences but stalled on a complete oracle. Source: `.specs/archive/pi-damage-control-parity/plan.md`.
5. Rationalization Phase 5 proposed shared Pi/Claude policy and logs, then was explicitly closed without port. Pi-native evaluation telemetry and shadow judgment became the final direction. Source: `.specs/archive/rationalization-phase5/plan.md`; `.specs/archive/pi-damage-control-triage/plan.md`.

Direction: from regex parity toward client-owned enforcement, structured evaluation, and evidence-driven tuning.

### Memory and expertise

1. Project-scoped expertise shipped, followed by draft snapshot and model-similarity designs. Source: `.specs/archive/pi-expertise-project-scope/plan.md`; `.specs/archive/pi-expertise-snapshotting/plan.md`; `.specs/archive/pi-expertise-similarity/plan.md`.
2. Memory retrieval instead shipped as JSONL retrieval with a safe placeholder embedder. Source: `.specs/archive/pi-memory-retrieval/plan.md`; `.specs/archive/pi-memory-retrieval/embedder.md`.
3. Follow-up measurement retained the in-memory backend because active data and latency were far below migration thresholds. Source: `.specs/archive/pi-memory-followups/backend-decision.md`.
4. Dynamic AGENTS context loading reduced always-loaded expertise and deferred subjective migration. Source: `.specs/archive/agents-context-loading/plan.md`.
5. Rationalization further reduced persistent prompt context and moved scoped instructions to non-persistent injection. Source: `.specs/archive/pi-orchestration-follow-ups/note.md`.

Direction: from precomputed global expertise toward small, scoped, on-demand retrieval and instruction loading.

### Prompt routing

1. `prompt-router-v1` established classification and routing. Source: `.specs/archive/prompt-router-v1/plan.md`.
2. Control-plane work added provider seams, status, explainability, privacy boundaries, and rollback. Source: `.specs/archive/prompt-router-control-plane/plan.md`; `.specs/archive/prompt-router-control-plane-v2/plan.md`.
3. Curation and retrain-gate plans added deterministic data contracts and candidate review. Source: `.specs/archive/prompt-router-curation-pipeline/plan.md`; `.specs/archive/prompt-router-retrain-gates/plan.md`.
4. Effort routing changed the objective from complexity tiers to the cheapest acceptable model and effort. Source: `.specs/archive/pi-router-effort-routing/plan.md`.
5. Rationalization centralized policy and Phase 4 added outcome sampling across quality, speed, and cost. Source: `.specs/archive/rationalization/plan.md`; `.specs/archive/rationalization-phase4/plan.md`.

Direction: from static model ladders to measurable cheapest-acceptable routing with explicit overrides.

## 6. Explicit future-direction statements

- Build a conservative Pi `/init` that derives concise `AGENTS.md` guidance from repository evidence, preserves user content, and asks only when policy cannot be inferred. Source: `.specs/research/agents-md-init-command.md`.

- Keep improvement collection automatic but policy application human-gated. Reports should propose deletions at least as often as additions. Source: `.specs/archive/rationalization-phase4/plan.md`; `.specs/features/pi-improve/context.md`.

- Continue moving objective workflow mechanics into programs while leaving prioritization, interpretation, and ambiguous language to model judgment. Source: `.specs/archive/workflow-test-rationalization/summary.md`.

- Preserve one durable mixed task DAG and add scheduler capabilities only when measured need justifies leases, claims, messaging, or richer recovery. Source: `.specs/archive/pi-task-dag-runner/plan.md`.

- Keep typed-agent workflows DSL-free until evidence justifies primitives such as `parallel()` or `pipeline()`. Source: `.specs/archive/rationalization-phase3/plan.md`.

- Use explicit worktrees for independent instances when needed, but do not automatically create worktrees for subagents. Source: `.specs/archive/rationalization-phase3/plan.md`; `.specs/research/claude-code-worktree.md`.

- Replace raw-command safety heuristics with bounded structured facts and provenance proofs where possible, beginning with temporary-file cleanup. Source: `.specs/research/damage-control-temp-cleanup-prior-art.md`.

- Retain the option of a real semantic embedder only when retrieval quality requires it; do not migrate storage merely because a larger architecture is available. Source: `.specs/archive/pi-memory-retrieval/embedder.md`; `.specs/archive/pi-memory-followups/backend-decision.md`.

- Evaluate model-generated reduction rules only after enough diverse corpus data exists, while keeping the hot path deterministic. Source: `.specs/archive/pi-tool-reduction/plan.md`.

- Extend the secure LAN MVP through observer subscriptions, mobile access, OpenClaw/Hermes integration, platform architecture, and tailnet guardrails only as separate reviewed stages. Source: `.specs/archive/secure-lan-pi-coms/observer-subscriptions-PRD.md`; `.specs/archive/secure-lan-pi-coms/mobile-agent-comms-app-PRD.md`; `.specs/archive/secure-lan-pi-coms/openclaw-hermes-integration-PRD.md`.

- If the Zellij cockpit idea returns, ship the simple single-Pi cockpit before any Agent Manager, persistent roster, or dynamic session-switching system. Source: `.specs/archive/zellij-windows-cockpit-v1/extra-notes.md`.

- If MSYS2 crashes recur, first verify the patched DLL and enforce the Git version pin through managed configuration rather than relying on a one-off manual pin. Source: `.specs/features/msys2-bash-crash/context.md`.

- Curate runtime evidence into tracked feature dossiers only through explicit review; runtime events must not rewrite tracked decisions automatically. Source: `.specs/features/pi-improve/context.md`.

## 7. Open questions

- Which draft initiatives were partially implemented outside their stale plans? Several files combine `draft` or `in-progress` status with completion dates or later replacement work. The specs alone cannot resolve all discrepancies. Sources: `.specs/archive/bias-resistance/plan.md`; `.specs/archive/review-command/plan.md`; `.specs/archive/pi-agent-setup/plan.md`.

- Was the incomplete Pi observability wiring later repaired? The plan says completed, while the later review says timing summary and some spans were not connected. Sources: `.specs/archive/pi-observability-timing/plan.md`; `.specs/archive/pi-review-2026-05-03/findings.md`.

- Should the placeholder memory embedder ever become semantic, and what retrieval-quality threshold would justify the added model and deployment cost? Sources: `.specs/archive/pi-memory-retrieval/embedder.md`; `.specs/archive/pi-memory-followups/backend-decision.md`.

- Should safe temporary-file cleanup become full `allow` or remain a low-risk annotated `ask` until real telemetry proves it safe? Source: `.specs/research/damage-control-temp-cleanup-prior-art.md`.

- Which cross-action safety controls should be implemented next: config sentinel, write-content scanning, hidden Unicode, URL exfiltration, or session correlation? Source: `.specs/research/damage-control-gap-analysis.md`.

- Should task scheduling gain leases, claims, automatic retries, worker messaging, or transaction journals, and what measured friction would justify each? Source: `.specs/archive/pi-task-dag-runner/plan.md`.

- Should `/improve` snapshots survive session resume, and must decisions always target the currently discussed candidate? Source: `.specs/features/pi-improve/context.md`.

- Should missing skill invocation telemetry be fixed before any skill consolidation decision? The improvement report explicitly treats current zero counts as unknown. Source: `.specs/improvement-reports/2026-07-17.md`.

- Will the secure LAN follow-on PRDs remain separate products, or converge into one tailnet agent platform? Source: `.specs/archive/secure-lan-pi-coms/technology-stack-architecture-PRD.md`.

- Should research outputs move into menos, and if so, how should versioning, embeddings, source metadata, and YouTube cross-links work? Source: `.specs/research/menos-research-integration-plan.md`.

- Did the patched MSYS2 DLL survive the Git upgrade, and should the fix be upstreamed rather than maintained as a local binary patch? Source: `.specs/features/msys2-bash-crash/context.md`.

- Which archived drafts should be explicitly marked abandoned or superseded rather than left `draft` or statusless? The largest ambiguous cases are `pi-agent-setup`, `pi-claude-parity`, `pi-setup-refactor`, `pi-prompt-cleanup`, `pi-session-budget`, and `pi-subagent-routing-policy`. Sources: their respective plans under `.specs/archive/`.
