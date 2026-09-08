# Agent instruction feedback log

## AIF-019 - Reset stale subagent owners without manual ceremony

- **Reference:** Operator correction to the pre-upgrade runtime notice on 2026-09-08.
- **Feedback:** `/clear` or stopping and restarting Pi should handle stale process-global subagent owners; operators should not need to finish or cancel every child first.
- **Finding:** Pi exit already shut down ordinary owned children, but the notice incorrectly presented manual cleanup as required. `/clear` created and reloaded a session without replacing the process-global subagent runtime.
- **Decision:** Make `/clear` stop all owned children, replace the singleton runtime, then create the clean session. Keep `/reload` non-destructive. Clarify that restart already performs cleanup automatically.
- **Related:** AIF-004 (minimal ceremony), APR-008 (subagent UX).
- **Status:** Implemented. Targeted clear/subagent tests, default typecheck, and runtime smoke check pass.

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
- **Decision:** Operator requested a bounded review before implementation and an explicit high-level design requirement. Updated default `docs/damage-control-port.md` with the governing purpose, linked it from setup/runtime navigation, and recorded findings plus the requested preapproval design in `.specs/damage-control-risk-alignment-and-preapproval/damage-control-risk-review.md` (repository-root-relative; archived with its plan). Do not treat legacy parity or agent-authored tests as proof that restrictions are proportionate.
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
