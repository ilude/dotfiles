# Agent instruction feedback log

## AIF-028 - Keep web-fetch results content-first and block flagged pages

- **Reference:** Operator screenshot and correction of default `web_fetch` output, 2026-09-10.
- **Feedback:** Collapsed results should show `webfetch: <url>` and bounded parsed content, using native expansion for more. Routine requested-URL, clean-screening, untrusted-content, backend, and receipt boilerplate should not precede every page. If Luna detects prompt injection, fail before returning any fetched source or suspicious excerpt to the conversation context.
- **Decision:** Make clean screening silent, block suspicious verdicts with a generic error, and keep acquisition metadata in structured details rather than model-visible content. Preserve explicit not-screened reporting when review is unavailable or invalid; Luna detection remains fallible.
- **Related:** AIF-001, AIF-004, AIF-010.
- **Status:** Implemented. All 34 focused offline web-tool tests and the web-tools TypeScript check pass; live operator rendering after reload remains unverified.

## AIF-027 - Delegate smaller sequential units with proportional models

- **Reference:** Operator review of the Herdr integration audit, 2026-09-09.
- **Feedback:** Broad audits and plan execution should usually be split into small bounded assignments rather than giving one strong subagent several extension areas or multiple `T?` plan sections. For plans, assign at most one task section to a worker, integrate its result, then commission the next section. Prefer Luna medium, escalating only when task evidence justifies a stronger model or higher effort.
- **Finding:** The Herdr audit was assigned to one reviewer spanning registration, lifecycle, labels, focus, cleanup, and session identity, with an explicit high-effort override. The reviewer role already defaults to Sol low; no observed complexity justified Sol high. Current root guidance bounds specialist work and agent counts but does not guide assignment granularity, sequential plan-task delegation, or model escalation.
- **Recommendation:** Add a short delegation rule at the default-profile scope: split work by independently reviewable seam or one plan task, normally commission the next task after integrating the prior result, and use the least capable configured role/model that can reliably do the work. Preserve judgment for tightly coupled changes and cheap orchestrator-owned checks rather than requiring one agent per file.
- **Escalation follow-up:** The operator favors bounded automatic retry with a stronger model to keep execution moving. A retry should preserve the same assignment and evidence, occur only after a settled capability-like failure rather than a missing prerequisite, permission, tool, or user decision, and remain capped so it cannot become an escalation loop. Exact ladder and retry count remain design choices until approved.
- **Related:** AIF-004, AIF-017, APR-006, APR-020.
- **Status:** Feedback recorded. Instruction change requires operator approval.

## AIF-026 - Remove subagent display duplication without hiding supervision context

- **Reference:** Operator screenshot and UX correction, 2026-09-09.
- **Feedback:** Repeated role, identity, working state, and ordinary attachment bookkeeping clutter tool output. The actual prompt, selected model/effort, and start time remain important for supervising work and returning to completed assignments.
- **Decision:** Keep compact model/effort, readable local start time and elapsed duration, and a prompt preview with native expansion for the full text. Remove repeated identity/status and hide routine transport/surface details from the collapsed view. Preserve meaningful questions, errors, results, and live last-activity information.
- **Related:** AIF-020, APR-008, APR-011. This refines the earlier request for richer presentation rather than reversing its visibility goal.
- **Status:** Implemented in the default presentation renderer. Focused tests (19), typecheck, and whitespace checks passed. No global instruction or lifecycle changes; the updated attached-client display still needs operator use after settled-only reload.

## AIF-025 - Treat CI/CD and deployment monitoring as scheduler work

- **Reference:** Operator correction during monorepo GitLab pipeline and EKS deployment monitoring, 2026-09-09.
- **Feedback:** Waiting for GitLab or GitHub pipelines and deployment rollouts is exactly the kind of external wall-clock wait the scheduling tool should handle. The prior distinction between external waits and ordinary continuation was too easy to misread as excluding CI/CD when completion time was unknown.
- **Decision:** Scheduler guidance now names GitLab/GitHub pipelines, deployment rollouts, and cloud operations as intended uses. It permits scheduling the next reasonable check without knowing the exact completion time, excludes only work that can continue immediately, and explicitly rejects delegating an external wait to subagents.
- **Related:** AIF-018, APR-003, APR-009, APR-018.
- **Status:** Approved and implemented in the default scheduler extension. Effectiveness remains unverified.

## AIF-024 - Keep subagent messaging simple and low ceremony

- **Reference:** Operator discussion of parent-question hangs, actor-style messaging, and possible SQLite storage, 2026-09-09.
- **Feedback:** KISS and low ceremony are explicit priorities. Do not surround ordinary subagent messaging with excessive safety gates, approvals, or operator bookkeeping.
- **Direction:** Prefer a small message/reply lifecycle with runtime-managed correlation and clear waiting states. Do not add completion gates, repeated reminders, or speculative recovery machinery as requirements. Basic routing/state correctness is distinct from new authorization ceremony. SQLite and restart recovery were discussed, not selected for implementation.
- **Related:** AIF-004, AIF-015 (risk proportionality), APR-007, APR-016.
- **Status:** Design constraint recorded. No implementation, global instruction change, or new storage/recovery requirement authorized by this entry.

## AIF-023 - Separate intent refinement from plan execution

- **Reference:** Operator discussion of the default planning skill and `/do-it` opening.
- **Feedback:** The user supplies intent and consequential judgment; the agent supplies technical reasoning and implementation. Planning should refine and capture intent in a standalone, bounded plan that Sol at low reasoning can execute without guessing desired outcomes. Keep routine implementation choices flexible and ceremony low.
- **Requested direction:** Do not load the planning skill during execution, including as a lifecycle fallback. `/do-it` authorizes completion of the selected plan and its authorized closeout. Resolve routine problems within scope; seek user input only for issues the agent cannot resolve within that authority, continuing independent work first. Progress updates must not redefine requirements or reopen settled decisions.
- **Closeout clarification:** Operator approved updating the plan, not executing it: after implementation and agent-owned checks, archive and commit on the task branch, merge into `main`, then declare completion. Archival or a task-branch commit alone must not produce a completed-plan claim. Preserve explicit `--no-merge` behavior and report omitted integration honestly.
- **Manual-testing clarification:** Operator explicitly requested that generated plans never block completion or authorized closeout on remaining manual acceptance. The operator will test through normal use after completion and address issues found then. The implementation plan now requires this boundary in the skill, template, and `/do-it`, preserving agent-owned checks and truthful, non-blocking verification limits. AIF-011 previously recorded post-implementation operator testing for Onclave; this clarification applies to generated plans generally. No live instruction changes yet.
- **Finding:** The skill currently advertises resume and closeout, and `/do-it` explicitly loads it. The template already contains execution and closeout guidance. This mixes authoring and execution instructions; its causal contribution to churn is not established.
- **Related:** AIF-002 (fresh-context handoffs), AIF-004 (low ceremony), AIF-016 (original skill reuse), AIF-021 (plan authority), APR-002/APR-005 (scope churn), APR-006 (premature stopping).
- **Implementation:** The planning skill is now authoring-only, its flexible template carries the full standalone execution/closeout contract, and `/do-it` executes without loading planning guidance. Documentation records archive/commit, merge, then completion metadata, while manual testing remains a non-blocking evidence limit. Command argument forms, worktree preservation, local integration authority, and separate push/deployment authority remain intact.
- **Checks:** Scoped prose review, argument-path tracing, reference search, `git diff --check`, and task-owned diff inspection passed on 2026-09-09 in the default profile. These checks establish instruction consistency, not future model adherence or Sol-low effectiveness.
- **Status:** Implemented and locally integrated with the archived plan on 2026-09-09. No runtime or live model trial was required.

## AIF-022 - Preserve settled reload assumptions and interactive steering

- **Reference:** Operator correction during extension-refactor planning, 2026-09-09.
- **Decision:** The operator will not invoke `/reload` while subagents are active. Active-child reload teardown, migration, and recovery are outside these plans; do not reopen that decision. The earlier APR-011 already records this operating assumption.
- **Command behavior:** Preserve active interaction and steering while the orchestrator works. Do not impose waiting until the current command finishes. Correct invocation-specific authority without turning command delivery into a finish-first queue.
- **Scope:** Four focused plans only: Damage Control bypass, command ownership, ordinary subagent cleanup, and legacy web-fetch correctness. Onclave, Bedrock, and stateless deduplication remain separate. Failed termination during ordinary cleanup remains distinct from unsupported active-child reload.
- **Related:** APR-011, APR-014, AIF-019, AIF-021.
- **Status:** Operator decisions recorded for planning. No implementation or global instruction changes.

## AIF-021 - Preserve plan authority during discussion and execution

- **Reference:** Operator correction after Damage Control execution reopened a settled watchdog decision and treated worktree-local credentials as a new setup prerequisite.
- **Finding:** The assistant rewrote an existing plan after a question about what a plan would look like, then treated that draft as authority over recorded operator decisions. Existing guidance already prohibited invented requirements; the failure was applying it at the discussion-to-execution boundary.
- **Decision:** Operator approved one planning-skill rule: questions do not authorize rewriting existing plans; execution may update progress/evidence, but scope, acceptance criteria and settled decisions require explicit approval to change. Reconcile stale drafts against recorded decisions.
- **Task correction:** Restore the recorded adjacent-failures-only watchdog decision, remove the separate-login requirement, preserve valid code, and complete the original authorized scope and checks using existing authentication.
- **Related:** AIF-014, AIF-016, APR-001, APR-007. Repository-root-relative task: `.specs/archive/damage-control-risk-alignment-and-preapproval/plan.md`.
- **Status:** Approved rule added to the planning skill. Task correction resumed; this does not establish future adherence or task completion.

## AIF-020 - Restore useful subagent tool-call presentation

- **Reference:** Operator review of the information presented in the transcript when default-profile subagent tools start and complete, on 2026-09-08.
- **Feedback:** Review the user-facing subagent tool-call presentation against legacy. This does not concern the `/subagents` command or its inspector.
- **Finding:** Legacy defines dedicated `renderCall` and `renderResult` functions. A call shows the agent, assignment, scope, model/effort when known, background state, and start timing. A completed result shows success/failure, agent/source, execution label, elapsed timing, bounded output, errors, usage, model, duration, and activity; expanded mode separates task and full output. The default `subagent` and `subagent_control` tools define neither renderer, so Pi falls back to generic tool presentation. The earlier review incorrectly treated the passive status widget and `/subagents inspect` as the requested surface.
- **Recommendation:** Add narrow renderers to the default subagent tools, adapted to their simpler records. The start view should show agent, assignment, model/effort, surface/background state, and timing. The result view should show outcome, duration, bounded result/error, and relevant execution metadata, with expanded detail where useful. Do not redesign the command inspector or passive widget as part of this correction.
- **Related:** APR-008 (opaque progress), AIF-017 (visibility), AIF-010 (diagnostic clarity).
- **Confirmed UX decisions:** Use pregenerated human names consistently in transcript rows, pane titles, and controls; retain UUIDs internally. Put child panes above the unchanged bottom orchestrator, fill left to right, four children per row and two rows; more than eight children moves to a new tab. This supersedes the archived fifth-child tab threshold, not authorization for silent headless overflow.
- **Existing lifecycle decision (corrected during planning):** The newer completed `.specs/archive/default-subagents-and-council/plan.md` explicitly supersedes the cancelled Herdr plan: capture results, settle owned processes, then close finished panes immediately, including failed work, without zoom-deferred cleanup. Preserve retained conversations and direct intervention under current lifecycle rules. The assistant first cited the older archive and incorrectly recorded its failed-pane/zoom policy as reaffirmed; the operator had not requested that change. The owning `docs/subagents.md` now records the correct source and preserved behavior.
- **Review failure:** The assistant asked the operator to decide pane closure again without consulting the archived plan. The answer was recorded; the failure was retrieval, not missing operator direction. Consult this reference when implementing and document the resulting behavior in the owning default runtime documentation, rather than relying only on an archive or feedback log.
- **Status:** Historical implementation and final scoped 17-test rerun are recorded, but operator acceptance remains blocked. No model-backed or attached-client run occurred; the initial swap focus theft and 5+ child geometry blocker prevent claiming complete UX.

## AIF-019 - Reset stale subagent owners without manual ceremony

- **Reference:** Operator correction to the pre-upgrade runtime notice on 2026-09-08.
- **Feedback:** `/clear` or stopping and restarting Pi should handle stale process-global subagent owners; operators should not need to finish or cancel every child first.
- **Finding:** Pi exit already shut down ordinary owned children, but the notice incorrectly presented manual cleanup as required. `/clear` created and reloaded a session without replacing the process-global subagent runtime.
- **Decision:** Make `/clear` stop all owned children, replace the singleton runtime, then create the clean session. Keep `/reload` non-destructive. Clarify that restart already performs cleanup automatically.
- **Related:** AIF-004 (minimal ceremony), APR-008 (subagent UX).
- **Status:** Historical `/clear` implementation and repaired actual-owner loader/ACK/source-reload checks passed. The active follow-up supersedes the old reload-preserves-owner behavior: explicit `/reload` now has a parent-resolved lifecycle boundary requiring no active subagent runtime, conversation, or process, including idle retained children. Source edits do not upgrade an already-running session; the first transition from the earlier lifecycle was not live-tested. Attached-client effectiveness remains unverified.

## AIF-018 - Use scheduling instead of long shell sleeps

- **Reference:** Operator correction during GitLab deployment monitoring on 2026-09-08.
- **Feedback:** A Bash or PowerShell sleep longer than 10–15 seconds is an anti-pattern when waiting for a real external event or performing user-requested monitoring; use the scheduling tool instead.
- **Finding:** The scheduler guidance distinguished genuine external waits from ordinary continuation, but did not state that long blocking shell sleeps are the wrong waiting mechanism. The agent attempted `sleep 120` while monitoring a pipeline after the operator had already requested scheduled monitoring.
- **Decision:** Add one tool-owned guideline: for genuine external waits or user-requested monitoring, use `schedule` instead of Bash or PowerShell sleeps longer than 15 seconds. Keep waits of 15 seconds or less available for cheap immediate checks. This does not permit scheduling ordinary implementation continuation.
- **Related:** APR-009 (long blocking pipeline wait), APR-003 (scheduler used for ordinary continuation), AIF-011 (tool-owned instructions).
- **Status:** Approved and implemented in the default scheduler extension; effectiveness remains unverified.

## AIF-017 - Preserve default subagent visibility

- **Reference:** Operator investigation of headless development workers on 2026-09-08 and approval to address tool instructions before discussing headless UX changes.
- **Finding:** Recorded launch arguments explicitly selected headless; tool descriptions stated defaults but did not explain when to override them. No user request for headless development workers was found. Wording as the cause of model selection remains unproven.
- **Decision:** Root and coordinator tool descriptions now say to omit surface for normal delegation and select headless inside Herdr only on user request, not because work is parallel, unattended, or in a worktree. Coordinator omission inherits its existing parent surface. Keep guidance at the owning tools, not global AGENTS.md.
- **Related:** AIF-004 (narrow changes), AIF-011 (tool-owned instructions), APR-008 (invisible delegation and opaque progress).
- **Status:** Approved instruction/documentation change only. Runtime enforcement and headless UX are unchanged; model adherence remains unverified.

## AIF-016 - Execute the selected plan through /do-it

- **Reference:** Operator requested and approved `/do-it`, with common forms `/do-it --no-merge` and `/do-it --no-merge <plan-path>`.
- **Decision:** Add a default native prompt template that reuses planning guidance, completes only the selected scope in its task worktree, and archives the whole spec directory with local task commits. Merge into the recorded parent checkout by default; accept `--no-merge` in either position and retain the committed worktree. Push and deployment remain separate. No extension or new execution system.
- **Related:** AIF-014 (worktree integration), AIF-005 (archival), AIF-003/APR-002 (bounded scope and checks), APR-006 (premature handoff).
- **Status:** Template and documentation added. Loader/argument-expansion verification is recorded in the implementation handoff; end-to-end agent adherence remains unverified.

## AIF-015 — Do not substitute promises for authorized execution

- **Reference:** Operator feedback after the default-subagents plan was twice followed by a response promising continuation while no further implementation was performed.
- **Feedback:** Use the concise principle “show, don't tell.” Brief explanations of the next action and its reason are useful for monitoring; the problem is ending the turn after promising actionable work instead of doing it.
- **Finding:** Existing planning and proportionality guidance already says to continue actionable authorized work, but APR-006 recurred immediately after correction. The failure mode is specifically substituting future-tense intent for available tool actions, not giving progress context.
- **Recommendation:** Add one short rule to the default profile's global `AGENTS.md`: “Show, don't tell: brief intent updates are fine, but do not end a turn by promising actionable work. Do it or state the concrete blocker.”
- **Related:** APR-001 and APR-006 (premature handoffs), AIF-003 (bounded completion), AIF-014 (authorized plan execution).
- **Status:** Proposed. Instruction change requires operator approval.

## AIF-015 - Damage Control prevents unrecoverable harm, not suspicious-looking activity

- **Reference:** Operator discussion of dependency-link setup approval, `/dc scan`, contextual variable handling, and helper dependency tracking on 2026-09-08.
- **Feedback:** Damage Control should stop meaningful unrecoverable damage, not act as a general security guard. Routine recoverable work should pass; unfamiliar syntax, variables, helpers, and generic flags are not independent reasons for approval or new machinery. Avoid approval ceremony and speculative dependency frameworks.
- **Decision:** Operator requested a bounded review before implementation and an explicit high-level design requirement. Updated default `docs/damage-control-port.md` with the governing purpose, linked it from setup/runtime navigation, and recorded findings plus the requested preapproval design in `.specs/archive/damage-control-risk-alignment-and-preapproval/damage-control-risk-review.md` (repository-root-relative; archived with its plan). Do not treat legacy parity or agent-authored tests as proof that restrictions are proportionate.
- **Follow-up decisions:** Operator chose broad alignment of all identified policy families, with no inherited restriction exempt from consequence-based review merely because of its history. Preserve an unattended failed-call watchdog, not limits on successful repetition. The operator reports a June 2026 repeated-failure loop consuming roughly half a weekly Codex allowance; this review did not independently verify that incident. Proposed tolerance is around 12 consecutive failures of the same exact command/tool call. Settle reset/interleaving and halt semantics before planning; no fuzzy loop detector or productivity controller is implied. Resolve breadth concerns before writing the implementation plan.
- **Related:** AIF-012 (environment-aware risk), AIF-004 (narrow changes), AIF-003/APR-002 (bounded review), APR-007 (overbuilt preapproval proposal).
- **Status:** Review and design-context update complete. Synthetic parser/engine probes exercised current policy without executing submitted commands or calling models. Runtime rules, judge prompt/authority, legacy, and subagent implementation remain unchanged. `/dc scan` and persistent preapproval are not implemented.

## AIF-014 — Pair planning uncertainty with questions and recommendations

- **Reference:** Operator follow-up to the successful-plan versus gateway comparison.
- **Feedback:** Ask questions and provide recommendations when uncertainty is found while planning.
- **Recommendation:** Investigate readily discoverable facts first. For uncertainty that could materially change the plan, explain the unresolved choice and consequences, recommend an approach with reasons, and ask a focused question. Keep routine implementation details within agent judgment; do not silently turn recommendations into requirements.
- **Related:** AIF-007 (materially different interpretations), AIF-002 (requirements versus proposals), AIF-013/APR-005 (gateway comparison).
- **Decision:** Operator approved narrow edits to `planning/SKILL.md` and its template: pair consequential uncertainty with questions and recommendations, bound factual investigations, preserve required functions during simplification, and reconcile stale handoffs. No mandatory uncertainty phase or registry.
- **Execution addition:** Operator requested dedicated task worktrees, local commits and merge back to recorded targets, with plan archival included in that integration. Execution authorization includes those local Git actions unless restricted; planning alone does not. Deployment/push stay separately authorized. Preserve unrelated work, module-first ordering and repository branch/publication rules; retain blocked worktrees and report pending integration.
- **Status:** Implemented in default planning guidance and documentation. Prose consistency and local integration are checked at closeout; effectiveness in subsequent tasks remains unverified. No global, legacy, runtime, or existing-plan changes.

## AIF-013 — Distinguish recent successful plans from the gateway exception

- **Reference:** Operator assessment while discussing the historical workflow-ceremony investigation.
- **Feedback:** Most plans run last night and today appeared to work as expected. The outstanding web-fetch-gateway plan was an exception that entered a churn loop.
- **Initial evidence:** The gateway plan records a pause after scope churn and removal of an extra launcher and bespoke archive-publication workflow. Subsequent transcript review established that this plan snapshot is stale: later execution reports deployment and contains live-test and SQLite state evidence. Do not infer current service status or deployment absence from that plan. AIF-008 separately records invented rollback work.
- **Decision:** Treat this as a specific failure to investigate against successful recent work, not evidence that the current planning workflow generally needs replacement. Historical legacy-workflow findings do not establish a present default-profile failure rate or the cause of this incident.
- **Related:** AIF-008 (gateway scope expansion), AIF-004 (narrow changes), APR-002 (earlier verification churn).
- **Comparison:** At the operator's request, screened 20 recent default-profile sessions and examined eight more closely, including successful Bedrock, model-catalog, browser/image, analytics, Onclave, and loader-repair work versus gateway and original Damage Control churn. Successes included test failures and repeated checks, so neither errors nor repetition alone explained failure. Stronger hypotheses are a stable finish line, known implementation boundaries, and treating limitations as bounded findings rather than new subsystems. Gateway combined live deployment dependencies with launcher/publication expansion, cleanup that temporarily removed credential integration, and stale handoff state. See APR-005.
- **Limits:** Sampled histories, not a complete census or controlled model comparison. Legacy discovery failed on a malformed backfill header; default queries were narrowed after DuckDB memory-limit failures. No resource limits were raised. Some successes are implementation/offline acceptance, not verified live-service success.
- **Status:** Comparison recorded. No instruction, runtime, or gateway-plan changes; no deployment resumption authorized.

## AIF-012 — Assess command risk in its environment

- **Reference:** Operator feedback on the `docker compose down` approval reason.
- **Feedback:** Routine local Docker teardown should not be treated as inherently dangerous. Risk depends on the target environment and effects, not just the command name.
- **Finding:** Default Damage Control rule `legacy-141` requests approval for plain `docker compose down` without an environment condition. Separate rules cover volume and image removal.
- **Decision:** Operator approved the change. `legacy-141` now uses existing contextual Luna review, allowing established intended local development teardown without a prompt. Shared/production disruption, material container-local data loss, unresolved environment, and review failure still require approval. Separate volume/image user rules remain. No daemon inspection or resource ledger was added.
- **Related findings:** Legacy's six Compose/down rules had Linux-only scope, lost in the default migration. Other inherited context-blind candidates include Kubernetes/Helm operations, database resets, forced process termination, and scheduler query matches. The earlier parity audit did not establish that inherited policy was proportionate. The operator subsequently approved extending contextual review to selected Kubernetes/Helm, database, and process rules, plus direct allowance for known read-only scheduler queries.
- **Related:** AIF-004 (narrow, judgment-based changes).
- **Follow-up:** Investigation found the context collector was a no-op, so the first Compose change could not supply prior environment facts. Added bounded session-local direct inputs and successful tool observations, keeping output untrusted and applying outbound redaction. No scans, persistent history, resource ledgers, or approval cache. Corrected leading Kubernetes/Helm context-option matching so selected operations reach review.
- **Status:** Implemented in default only. All 166 Damage Control tests, default typecheck, and loader smoke pass. Eleven live synthetic Luna cases passed with no submitted operations executed; this verifies sampled judgment, not every environment. Operator requested a commit of this work.

## AIF-011 — Define orchestrator and Onclave ownership

- **Reference:** Operator clarification before planning the default-profile Onclave port.
- **Feedback:** The orchestrator is the primary model the user interacts with in a Pi instance. Onclave connects orchestrators across independent Pi instances, not subagents.
- **Decision:** Record only the orchestrator definition in default Pi's global `AGENTS.md`. Following operator correction, removed the Onclave and subagent rules from that file; those belong in their respective tooling instructions when implemented. The orchestrator-only Onclave communication boundary remains an implementation requirement. This change does not implement the port or runtime enforcement.
- **Planning decisions:** Trusted incoming requests may start a turn when idle and queue when busy; informs remain non-turn-triggering. Restart recovery is not required for the initial port. The operator will perform live two-instance validation after implementation, outside the plan. Prefer minimal ceremony for the protected VLAN/tailnet environment rather than automatically preserving legacy gates.
- **Related:** AIF-004 (narrow instruction changes), AIF-002 (requirements versus proposals).
- **Status:** Instruction updated; runtime enforcement remains future work.

## AIF-010 — Identify the timed-out commit operation

- **Reference:** Operator follow-up after the submodule-aware `/commit` failed with only “Command timed out after 15 seconds.”
- **Feedback:** Commit failures must provide enough diagnostics to identify which timeout tripped.
- **Finding:** Successful tool details were intentionally private, but failure handling retained only the generic tool result and omitted tool name, target, command and elapsed time.
- **Decision:** Keep successful activity private; on failure report the tool plus repository/path or a 300-character shell-command excerpt and measured elapsed time. After the diagnostic exposed an unnecessary parent-directory `find`, the runner was further bounded to a supplied tracked-instruction inventory, broad recursive discovery was blocked, and first-failure reporting was preserved without queued-call noise.
- **Related:** AIF-009 (submodule commit workflow).
- **Status:** Implementation updated; behavioral effectiveness remains unverified.

## AIF-009 — Complete submodule commits before parent gitlinks

- **Reference:** Operator follow-up after `/commit` committed the dotfiles parent but left `modules/homelab-infra` dirty.
- **Feedback:** The commit command should handle submodule commit workflows directly and easily.
- **Finding:** The reviewer was told only to keep submodules separate. It received parent status and reported only parent HEAD movement, so the instruction did not make independent submodule review, deepest-first commit order, parent gitlink staging, or multi-repository results explicit.
- **Decision:** Inventory initialized submodules at workflow start, allow repository-scoped diff review, require independent deepest-first submodule commits before parent gitlinks, and report commits/remaining changes per repository. Push remains explicit and orders submodules before parents without recursive push.
- **Related:** AIF-004 (narrow workflow changes), repository submodule boundaries.
- **Status:** Implementation updated; behavioral effectiveness remains unverified.

## AIF-008 — Do not invent rollback work

- **Reference:** Operator correction during web-fetch gateway plan execution.
- **Feedback:** Plans must not include rollback steps unless the user requests them.
- **Finding:** The agent added rollback-path verification to the gateway plan and later treated it as required completion work without an operator request.
- **Decision:** Added a direct boundary to the planning skill and template, and removed rollback verification from the active gateway plan. Drift-recovery guidance is unchanged because it governs agent scope control, not product rollback.
- **Related:** AIF-002 (requirements versus proposals), AIF-003/APR-002 (bounded completion).
- **Status:** Instruction updated; behavioral effectiveness remains unverified.

Factual history for refining agent instructions. This log is not executable policy; active rules belong in the owning `AGENTS.md` or skill. Record concise operator feedback and the resulting decision without storing raw session transcripts or private task content.

## AIF-007 — Present materially different planning interpretations

- **Reference:** Operator review after comparing an AI coding-guidelines video with the default Pi profile.
- **Feedback:** The planning skill should present plausible interpretations when ambiguity could produce materially different plans instead of silently selecting one.
- **Decision:** Added one conditional sentence to the existing requirement and decision-boundary step. Discoverable facts and minor ambiguity still use repository evidence and model judgment; no mandatory format, fixed number of alternatives, or global clarification rule was added.
- **Related:** AIF-002 (requirements versus proposals), AIF-004 (narrow and flexible workflow changes).
- **Status:** Instruction updated; behavioral effectiveness remains unverified.

## AIF-006 — Keep scope rules global and testing detail in a skill

- **Reference:** Operator approval following the default-profile instruction-stack review.
- **Feedback:** Mock guidance belongs in a testing skill, not global AGENTS.md. Approved the other narrow scope and verification changes and correction of the stale global-instruction reference.
- **Decision:** Default AGENTS.md now excludes invented requirements, limits fixes to demonstrated task-relevant problems, and bounds repeated checks. Added on-demand `testing` for mock boundaries and observable behavior; corrected the root reference. Pi's built-in prompt, existing tests, and runtime remain unchanged.
- **Follow-up:** Operator approved test selection for required behavior, demonstrated defects, and credible risks in the changed path, without imagined-case expansion. Updated `testing` accordingly. Operator subsequently approved optional-work boundaries, scope-change questions, sparse phase checkpoints, and bounded cleanup/recovery in the planning skill and generated plans. Implemented in the skill and template; recovery removes agent-introduced extras without disturbing pre-existing or concurrent work and reports unsafe-to-remove leftovers at final handoff rather than routinely interrupting the user. Existing plans, global rules, and runtime were not changed in this follow-up.
- **Related:** AIF-003/APR-002 (testing churn), AIF-004 (narrow instruction changes), AIF-002 (requirements versus proposals).
- **Status:** Instructions updated; behavioral effectiveness remains unverified.

## AIF-001 — Prefer concise, plain language

- **Reference:** Operator feedback during default-profile instruction refinement.
- **Feedback:** Avoid professor-like, overly formal, or needlessly sophisticated language. Complexity should serve understanding, not demonstrate expertise.
- **Decision:** Added a communication-style rule to `pi/profiles/default/AGENTS.md`. The operator later approved extending it to chat and files: no em dashes, filler, theatrical framing, repeated apologies, or sycophancy; no flattery or agreement without evidence. Technical terminology remains appropriate when needed for precision.
- **Scope:** Default Pi profile.
- **Related incidents:** None recorded.
- **Status:** Active; effectiveness has not yet been reviewed.

## AIF-004 — Keep workflows flexible and instruction changes narrow

- **Reference:** Operator feedback during default-profile agent-process refinement.
- **Feedback:** Instructions should solve the observed problem with minimal wording, ceremony, ambiguity, and scope expansion. Workflows should retain model judgment unless a narrow factual question is straightforward enough that deterministic code provides greater value.
- **Example:** Git can deterministically list changed paths, but deciding which new files belong in a commit requires judgment.
- **Decision:** Added this principle to the `agent-process` skill for future instruction and workflow refinements. It was not promoted to the global `AGENTS.md`.
- **Scope:** Default Pi agent-process reviews.
- **Related entries:** AIF-001.
- **Status:** Active; effectiveness has not yet been reviewed.

## AIF-002 — Make implementation handoffs explicit and distinguish proposed choices

- **Reference:** Operator review of an infrastructure implementation proposal.
- **Feedback:** Asked whether the plan had Markdown checkboxes and clear steps that a smaller model could follow from fresh context without filling gaps with poor choices or invented requirements.
- **Finding:** The inspected proposal had numbered phases but no task checkboxes. It left contracts and implementation choices incomplete and included assistant-proposed defaults that were not operator-supplied requirements.
- **Decision:** Describe the document as an architecture proposal, not an execution-ready handoff. A task-local revision should separate requirements, proposals, and unresolved decisions; specify inputs, outputs, dependencies, checks, and evidence for each step. No global instruction change is needed for this review.
- **Scope:** Implementation-plan handoff quality; not authorization to implement or deploy.
- **Related entries:** AIF-001 (plain language); APR-001 (continuation and completion evidence, a different observed failure). These entries do not establish recurrence of this planning gap.
- **Status:** Operator authorized the task-local conversion and reusable planning skill in AIF-005. The plan now has checkbox tasks and explicit proposal/decision boundaries; fresh-context execution quality remains unverified.

## AIF-003 — Stop expanding verification

- **Reference:** Damage Control implementation follow-up about testing churn.
- **Feedback:** Prevent open-ended edge-case hunting; use plain language.
- **Decision:** Operator approved adding: “Test what the task needs. Fix problems you find, but don’t keep hunting for more. Stop when the agreed checks pass.” It was added under Proportionality in the active default profile's `AGENTS.md`. Operator also approved a bounded remaining-work list in the implementation plan.
- **Scope:** Default profile instructions; Damage Control plan execution. No additional global rules proposed.
- **Related:** AIF-001 (plain language), AIF-002 (clear finish criteria), APR-002 (observed churn).
- **Status:** Rule and plan changes recorded; future adherence remains unverified.

## AIF-005 — Keep profile-aware plans in specs and archive completed work

- **Reference:** Operator follow-up to the fresh-context plan review.
- **Feedback:** Move the plan to `.specs/<stub>/plan.md`; capture concise planning guidance in a new profile skill using agent-process context. Completed plans must carry an internal completion date and move to `.specs/archive/`. Record relevant execution Pi profiles.
- **Decision:** Added default-profile `planning` with a small template, ordered task/evidence guidance, requirement/proposal separation, profile provenance, and model-directed completion/archive instructions. Moved and rewrote the requested plan only; no automatic archiver, global AGENTS change, or bulk migration of old plans.
- **Scope:** Plan authoring, maintenance, resumption, and closeout. Not authorization to implement the planned system, deploy, commit, or push.
- **Related entries:** AIF-002 (handoff gaps), AIF-001/AIF-004 (concise and flexible instructions), AIF-003/APR-002 (bounded verification), APR-001 (continuation).
- **Status:** Installed Pi loader discovered the default planning skill without related diagnostics; local links, ten ordered unchecked plan tasks, and removal of the old plan copy were checked. Smaller-model execution and real completed-plan archival remain unverified.
