# Agent instruction feedback log

## README run-history correction (2026-09-23)

- **Feedback:** Keep routine run results and change history out of READMEs.
- **Observed:** A prototype README accumulated pod/revision details, test outcomes, debugging history, and retries.
- **Remediation:** Removed that section and agent-specific wording; added concise project guidance routing history to changelogs and run results to reports/artifacts. Related AIF-039 addresses useful changelog content; AIF-084 concerns architectural knowledge, not routine run history.

## AIF-084 - Preserve architectural understanding rather than operational skill boilerplate

- **Reference:** Operator corrections during service-skill creation and subsequent knowledge-maintenance discussion.
- **Feedback:** Service skills should preserve responsibilities, adaptations, decision reasons, existing mechanisms, and dependencies so later changes fit established architecture. Command targets and generic product descriptions do not fulfill that purpose. New architectural discoveries and consequential development context also need the appropriate durable home, not just chat or local research artifacts.
- **Finding:** Existing project write-back guidance already requires durable evidence, but the initial skills emphasized operational navigation and omitted a concrete map of newly understood native configuration files. Related APR-064 concerns the evidence quality behind those discoveries, not their documentation placement.
- **Remediation:** Service skills were revised to architectural context and the affected service gained an existing-file responsibility map. Operator is considering a knowledge-maintenance skill covering both discovery-time capture and subsequent skill maintenance, with placement guidance for AGENTS.md, skills, and docs.
- **Portability clarification:** Operator requires standalone skills that do not depend on global instructions. Essential evidence, preservation, and placement guidance must remain in the skill even where it overlaps global policy.
- **Status:** Implemented with operator approval as the tracked-project `.pi/skills/project-knowledge/SKILL.md`, with routing in the existing AGENTS.md write-back section and skill catalog. Static checks passed; no global skill dependencies or machine-specific paths. Model activation/adherence has not been measured.

## AIF-083 - Carry environment decisions into validation scope and task sizing

- **Reference:** Planning `01a0b598-8155-700a-9da8-10cae221bf5b` and execution `01a0b6d3-a81b-7507-8a4d-01e67f21a751`, reviewed 2026-09-19; APR-063/TCA-009.
- **Feedback:** Before execution, the operator clarified that the environments were development targets not yet live for this use case. During execution, the operator questioned the oversized assignment, asked what the repeated disposable Kubernetes test was proving, and directed deployment/troubleshooting in the target environment instead of more local-cluster simulation.
- **Operator clarification:** The undisclosed decision to set up kind and make local-cluster testing a prerequisite for deployment substantially increased complexity. This approach was neither discussed nor surfaced in the plan handoff, so the operator did not know it was included. Task sizing remains a separate contributing issue, not an alternative explanation: assigning the combined kind setup and lifecycle testing to Luna high compounded the burden. The operator sees this chain as central to the failure. History establishes the expanded scope and broad assignment, but does not isolate model capability as a cause. Smaller assignments alone would not justify the undisclosed workflow; a stronger model alone would not make it proportionate.
- **Finding:** The planner acknowledged the environment clarification without carrying it into the artifact. The full future lifecycle remained blocking acceptance for preparation-only deployment. Existing planning and delegation guidance already required proportional checks and splitting oversized tasks; satisfying one named task per worker did not satisfy those requirements.
- **Recommendation:** Improve the existing planning acceptance review and Strategist sizing decision, rather than append another generic small-task rule. Distinguish current deployment evidence from later operational proof, preserve consequential environment decisions in the canonical handoff, and split assignments by independently verifiable results. A concrete mismatch during execution warrants a recommendation and user decision, not silent acceptance changes or a mandatory replanning phase.
- **Discussion failure:** The orchestrator repeatedly qualified the operator's practical capability assessment with lack of universal benchmark proof, despite lacking evidence for the original dispatch. This obstructed addressing the actual routing failure. For this workflow, the operator's stated working model is Luna high as roughly Sonnet-class, not Opus-class; use that as the routing premise rather than repeatedly reopening a universal ranking debate. Planning introduced an undisclosed, unproven kind prerequisite; Strategist then treated the combined environment, test-validity, and lifecycle work as one implementation assignment suitable for Luna high. The approved sizing edit alone does not address those upstream and routing failures. No additional instruction change is authorized by this feedback.
- **Validation-method concern:** The operator also challenges treating kind as an established test method without evidence that it works locally or faithfully exercises the required CA behavior. Environment feasibility, test representativeness, and product correctness are separate uncertainties; bundling their resolution into one Luna-high assignment compounds scope and sizing problems. This is not authorization to build a kind feasibility project or a blanket requirement for another validation stage.
- **Grounding gap:** The operator further identifies that CA infrastructure was already built and running; the requested lifecycle change did not itself establish a need for a separate local Kubernetes environment. Merely requiring disclosure of kind misses the earlier decision to introduce it. The current skill has general investigation/proposal rules, but its uncertainty-triggered discussion rule does not explicitly expose confidently added validation scope. Proposed correction should connect planned work and checks to the requested change and evidenced gaps in the existing system before considering additional infrastructure. Existing deployment evidence does not prove all new lifecycle behavior, but lack of that proof alone does not justify a new testing environment.
- **Priority clarification:** The operator considers the planning communication failure more important than Strategist sizing or routing. Explaining the proposed kind use and what the planner actually intended to build and test before putting it in the plan would have allowed the operator to reject that approach and avoid the downstream problem. Prioritize making consequential planner-added approaches explicit for discussion, not optimizing execution of an undisclosed approach.
- **Decision:** Operator approved only the Strategist task-sizing correction. Planning-skill changes remain discussion-only; no `/do-it` or test-worker policy change was authorized.
- **Implementation:** Replaced Strategist's generic split instruction with named-task-as-upper-boundary guidance and smaller independently provable outcomes with specific finishes, preserving task requirements. Other audiences remain byte-identical. Bundled Strategist composition grows from 3,372 to 3,494 bytes; native base/context, authority wrapper, and assignment remain dynamic. Catalog and caller prefixes are unchanged; the changed Strategist text invalidates its own cached suffix. Live provider caching and model adherence were not measured.
- **Validation/status:** All 36 focused guidance/definition tests and default-profile typecheck pass. Default docs and root changelog updated. Activate through a fresh session or settled-only `/reload` before launching new children. No runtime gate, model-default change, new review stage, or planning-skill edit.

## AIF-082 - Recorded reasons show routine dependency waits still self-block orchestration

- **Reference:** Complete default-profile blocking-decision search for 2026-09-18 after `blockingReason` introduction.
- **Finding:** One plan-execution session contained six explicit `subagent_control wait` calls and one foreground Validator launch. The waits lasted approximately 18 seconds, 11 minutes, 11 minutes, 16 minutes, 4 minutes, and an unresolved final span. Their reasons described genuine task dependencies, but generally explained why later integration depended on the result rather than why the orchestrator itself could not return control or perform independent work. Two consecutive waits targeted the same P1 worker around a parent-question recovery. The foreground Validator launch similarly justified prerequisite validation but not foreground blocking. Three Strategist launches were role-contract blocking. One Explorer foreground launch was an intentional analytics probe. One older Explorer launch lacked a reason and was duplicated into five forked/session files; it predates enforcement.
- **Recommendation:** Refine the tool-owned requirement so a reason must identify why no useful parent work remains and why returning control is inappropriate, not merely name a downstream dependency. Prefer background launch plus automatic outcome delivery. Keep explicit wait reserved for reattaching an interrupted foreground join and Strategists unchanged.
- **Related:** AIF-075, AIF-081; APR-051, APR-060.
- **Decision:** Clarify that background completion triggers another orchestrator turn and resumes the workflow without polling. A dependency alone does not justify blocking; reserve `wait` for reattaching an interrupted foreground join needed now. Track the effective boundary with one subagent extension version rather than a separate policy version.
- **Status:** Implemented locally as subagent extension `1.0.0`. Session start and reload record the active version; blocking analytics returns and filters by that version. Activation requires `/reload` or a new session.

## AIF-081 - Explain every intentional orchestrator block in the tool card

- **Reference:** Operator screenshot of a foreground Explorer launch, 2026-09-18.
- **Feedback:** Whenever the orchestrator intentionally blocks on a subagent operation, the visible tool output should explain why blocking was chosen instead of background execution, returning control, or continuing other work. This applies to synchronous launches and explicit `subagent_control wait` calls.
- **Requested presentation:** Put the explanation directly below the tool card's first line so the reason remains associated with the blocking action rather than relying on a separate assistant intent update.
- **Related:** AIF-075, APR-051, APR-060. Foreground Strategists remain an intentional role contract, while ordinary background completion should not use `wait`.
- **Decision:** Require a model-supplied `blockingReason` for non-Strategist foreground launches and explicit root `subagent_control wait` calls. Strategists are exempt because foreground execution is enforced by role contract; their cards show a runtime-owned explanation. Render the explanation directly below the card header and leave background launches and nonblocking controls unchanged.
- **Analytics follow-up:** The operator requested fast retrieval of these decisions without broad raw-JSON SQL. Native `log_analytics search` now accepts `filters.subagentBlocking` and returns structured decisions with model, role-contract, missing, or nonblocking provenance directly from existing session records. This path does not add telemetry or SQL projection columns.
- **Status:** Blocking presentation was implemented and committed as `50a53b60`. The analytics follow-up is implemented locally; all 49 log-analytics tests, default-profile typecheck, offline real-loader smoke, and `git diff --check` pass. Activation requires a fresh session or settled-only `/reload`; live attached-client presentation and analytics remain unverified.

## AIF-080 - Repair context-transfer gaps rather than add global prohibitions

- **Reference:** Operator review of recurring feedback patterns, 2026-09-17.
- **Feedback:** Reevaluate subagents' `--no-context-files` before compensating with assignment guidance; remove unused `/handoff`; clarify deferred scope and the explicit single-agent delegation exception; check behavior-changing restrictions during the existing planning review. Compaction needs a concrete implementation proposal before approval.
- **Decision:** Remove the default handoff prompt and command references. Amend the planning skill and template so explicitly deferred work does not block independent approved scope, preserve the caller's explicit single-agent handoff exception and Team Lead's own consultation, and question unsupported restrictions within the existing authoring review.
- **Evidence:** Ordinary children disable native context-file discovery; Team Leads already enable it. An offline probe of installed Pi 0.85.1 confirms split-turn summary requests omit prior summary/custom focus from the turn-prefix call; with no complete-history messages, the split path substitutes `No prior history.` even when a previous summary exists. Stubbed responses establish request construction, not live model behavior.
- **Related:** AIF-021, AIF-052, AIF-054, AIF-059B, AIF-071; APR-050.
- **Follow-up:** Operator approved native context-file discovery for all subagent roles. Removed `--no-context-files` from ordinary launches; retained explicit skill selection, extension isolation, and tool/delegation restrictions. Team Lead discovery is unchanged. A native compaction fix means changing the Pi package itself; the supported local customization route is the `session_before_compact` extension hook, not a separate configuration system.
- **Compaction decision:** After comparison with legacy, the operator approved a summary-generation-only default extension. It combines prepared history and turn prefix with prior summary/custom focus through the native public compactor, preserves retention coordinates and cumulative file metadata, and leaves triggers and continuation with Pi. Native hook errors fall through, so generation failures explicitly report and cancel rather than silently using split summaries. No legacy soft threshold, task registry, abort/resume machinery, or failure circuit is ported.
- **Status:** Approved prompt/skill, subagent context-loading, and compaction changes implemented locally. Compaction tests exercise installed native generation with stubbed responses; live-model summary quality remains unverified.

## AIF-079 - Steward judges reviewer and validator follow-up scope

- **Reference:** Operator correction during repository review fixes, 2026-09-17.
- **Feedback:** Steward assesses reviewer and validator agent output to judge whether addressing their findings would send the work off track. It is not a general pre-fix review stage.
- **Observed:** The orchestrator sent its own additional code-review findings to Steward after the user authorized fixes, then defended this as required after any review findings.
- **Related:** AIF-077 distinguishes Steward from initial investigation; AIF-057 concerns finding-triggered follow-up cycles, not blanket approval of requested implementation.
- **Recurrence:** Later on 2026-09-17, the orchestrator again sent its own user-approved fixes to Steward for a bounded implementation assessment despite receiving the revised exclusion in active context. The operator clarified that Steward is not a pre-implementation role at all. Review of AIF-029B confirms the intended role is judging whether reviewer/validator findings warrant additional work after implementation. Current wording omits that phase from the positive trigger and qualifies the exclusion with “routine”; the role also requests smallest-fix recommendations. These are possible reinforcing cues, not an excuse for ignoring the existing exclusion. The operator subsequently approved the replacement: explicit post-implementation finding triage, no requested-work preflight, and a brief out-of-role response from Steward. Applied to shared caller/Team Lead guidance, catalog, role body, documentation, and tests; generic tools unchanged. All 35 focused tests and profile typecheck pass. Composed bytes: caller 3,591 to 3,670; Team Lead 3,187 to 3,244; Strategist 3,359 to 3,372 (catalog only); Steward 1,448 to 1,867. Deterministic composition tests pass. Changed standing guidance/catalog bytes invalidate their cached prompt suffix; live cache use and model adherence were not measured.
- **Decision:** With operator approval, replace the broad trigger in caller and Team Lead guidance with one shared reviewer/validator-agent finding trigger, explicitly excluding orchestrator investigation and routine requested implementation. Align the catalog, role body, and documentation; retain direct evidence-proved corrections and advisory authority.
- **Validation:** All 34 focused guidance/definition tests and default-profile typecheck pass. Bundled composition sizes changed: caller 3,238 to 3,591 bytes; Team Lead 2,794 to 3,187; Strategist 3,281 to 3,359 (catalog only); Steward 1,363 to 1,448. Output remains deterministic. Changed guidance/catalog text invalidates the corresponding cached prompt suffix; actual cache usage and future adherence were not measured.
- **Status:** Implemented locally. Activation requires a fresh session or settled-only `/reload`.

## AIF-078 - Reuse transient retry instead of changing models

- **Reference:** Operator correction after reporting intermittent `Unable to verify Daybreak Blue access`, 2026-09-17.
- **Feedback:** The desired behavior is the same bounded retry and recovery already used for transient WebSocket errors, not switching the default model or changing Sol-based roles.
- **Finding:** Pi's retry classifier recognizes WebSocket and explicit retry wording, but the Daybreak response says `Please try again`, which is not one of its retry patterns. The assistant initially treated the error as persistent account access loss without establishing that premise.
- **Correction:** Rewrite only the exact OpenAI Codex `gpt-5.6-sol` verification error at `message_end` to equivalent explicit retry wording before Pi performs native retry classification. Preserve the existing retry budget, backoff, UI, cancellation, and all other error classifications.
- **Status:** Implemented locally; six focused tests, default-profile typecheck, and runtime smoke pass. Existing sessions require `/reload`.

## AIF-077 - Steward is not a general debugging role

- **Reference:** Operator screenshot of a reported game-behavior defect, 2026-09-17.
- **Feedback:** The orchestrator launched Steward to diagnose an issue directly. Steward is intended to assess reviewer or validator findings, not perform initial debugging.
- **Finding:** The active caller guidance requires a review finding or an unexpected agreed check or deployment outcome before a follow-up fix or another MR, build, or deploy cycle. The orchestrator instead paraphrased this as any "unexpected result" and treated a user-reported runtime symptom as qualifying. No agreed check or deployment produced the report, no reviewer or validator finding existed, and no follow-up cycle had begun. The launch was an adherence failure, not an ambiguous trigger or missing role boundary.
- **Decision:** With operator approval, replace the always-visible Steward catalog description with a role contrast at the selection point: assess reviewer or validator findings before follow-up corrections; do not use Steward for initial investigation or debugging. Leave the detailed caller trigger and runtime authority unchanged.
- **Validation:** All 33 focused guidance and definition tests pass, as does default-profile typecheck.
- **Status:** Implemented locally; active Pi sessions require reload before receiving the revised catalog.

## AIF-076 - Give the orchestrator two-thirds height until a fifth visible subagent

- **Reference:** Operator screenshot of one visible subagent above the orchestrator, 2026-09-17.
- **Feedback:** One visible subagent occupied the upper two-thirds while the orchestrator received the lower third. The orchestrator should retain the lower two-thirds for one through four visible subagents. At five through eight subagents, the second child row may borrow the middle third, leaving the orchestrator the lower third.
- **Finding:** `SubagentLayout.balanceHeight()` targeted the caller at one third for every nonempty main-tab layout. This directly produced the reported geometry and conflicted with the requested count-dependent split.
- **Correction:** Target the caller at two thirds while the main tab has at most four children and one third once it has more than four. Preserve the existing two rows of four and child-nine overflow behavior.
- **Related:** AIF-070.
- **Status:** Implemented with operator approval. Focused layout tests, default-profile typecheck, and runtime smoke pass; attached-client acceptance remains unverified.

## AIF-075 - Do not block on routine background subagents

- **Reference:** Execution of `subagent-nonblocking-messaging`, 2026-09-17.
- **Feedback:** The operator directed the orchestrator to stop using `subagent_control wait` to block on subagents.
- **Observed:** The orchestrator used `wait` for ordinary background task completion despite existing guidance that reserves it for reattaching to a deliberately interrupted foreground join whose result is immediately required.
- **Correction:** Continue independent parent-owned work and rely on automatic background outcomes. Use `wait` only for its documented reattachment case.
- **Related:** APR-060, APR-057.
- **Status:** Corrected during the same execution; existing instruction is already explicit.

## AIF-074 - Discuss findings and remedies before implementing reported UX problems

- **Reference:** Default-profile session `01a0b08d-ae05-7257-b011-770908cd36ef`, 2026-09-17.
- **Feedback:** The operator reported that three tool calls had poor user-facing output and expected to discuss the findings and how to address them before any fixes began.
- **Observed:** The assistant investigated the three surfaces, then dispatched two developers to implement renderers without presenting the findings or asking whether to proceed. Its Strategist had explicitly said implementation should begin only if authorized and identified a consequential choice between TUI-only rendering and changing model-visible output. The assistant selected TUI-only rendering itself, implemented changes in dotfiles and the Onclave module, ran checks, edited the changelog and feedback log, and only then summarized the findings.
- **Correction:** Treat a problem report or request to assess output as authorization to investigate, not automatically to edit. Present the established causes, relevant options, and recommendation, then obtain approval before implementation when the operator has not asked to fix or implement.
- **Related:** AIF-072 (explain findings and tradeoffs before narrowing scope), AIF-021 (preserve decision authority), APR-059.
- **Resolution (2026-09-17):** Caller guidance now explicitly preserves scope and approval boundaries: a problem report or discussion does not automatically authorize implementation.
- **Status:** Resolved in the locally integrated default-profile guidance. Prompt composition checks do not prove model adherence.

## AIF-073 - Keep routine tool transcript output compact

- **Reference:** Operator screenshot of a completed vault ingest workflow, 2026-09-17.
- **Feedback:** The inbound Onclave terminal notification, `tool_search`, and `onclave_vault_content` blocks all had poor user-facing output.
- **Observed:** Generic renderers exposed protocol framing, raw terminal JSON, full discovery descriptions, and a complete vault record in the transcript.
- **Correction:** Add TUI-only compact renderers at the owning tools and adapter. Preserve exact model-visible content and provide complete output through expanded views.
- **Implementation:** `tool_search` now shows counts, activation state, and bounded names. Onclave terminal notifications show sender and a bounded job summary; vault content shows title, type, and ID. Unknown inbound bodies remain visible rather than being silently discarded.
- **Status:** Implemented locally with focused tests and typechecks passing. Onclave adapter and parent changes remain uncommitted and require normal reload/update boundaries.

## AIF-072 - Explain the full proposal before recommending a narrower implementation

- **Reference:** Subagent messaging planning discussion, 2026-09-17; related AIF-069 and APR-057.
- **Feedback:** After the assistant proposed a "first scope," the operator asked what that meant and why the whole story was not being explained.
- **Observed:** The assistant drafted tasks for the verified implicit-wait defect, relegated other coordination proposals to exclusions, and asked for approval without explaining the full set of concerns and tradeoffs in chat. Its clarification named broader topics but still did not explain them.
- **Correction:** Present verified defects, existing mechanisms, unresolved proposals, and implemented changes distinctly before recommending a boundary. A recommendation to stage work is not an agreed reduction of the requested planning scope.
- **Status:** Feedback recorded. No additional policy or plan edits authorized by these questions.

## AIF-071 - Explicit Team Lead handoff should not duplicate Strategist consultation

- **Reference:** Operator correction after requesting a Team Lead for pane layout and tab naming, 2026-09-17.
- **Feedback:** When the user explicitly selects a Team Lead, the orchestrator should dispatch that lead directly; the lead owns its own Strategist consultation and worker decomposition.
- **Observed:** The orchestrator invoked Strategist first under the blanket caller instruction to consult before delegation. The call was interrupted, and subsequent inspection showed no owned children. No Team Lead had yet been dispatched.
- **Finding:** Caller guidance has no exception for an explicit user-selected Team Lead, while the Team Lead workflow independently requires Strategist consultation. This creates duplicate staffing advice rather than resolving an open role-selection decision.
- **Requested direction:** Exempt explicit user-directed Team Lead handoffs from the orchestrator's pre-dispatch consultation. Preserve the Team Lead's Strategist-first decomposition and ordinary caller consultation when delegation structure remains undecided.
- **Related:** AIF-063, AIF-064, AIF-069.
- **Resolution (2026-09-17):** Caller guidance now skips orchestrator consultation for explicit single-agent handoffs, including plan work, while preserving the Team Lead's own Strategist-first workflow and plan-specific consultation when delegation remains undecided.
- **Status:** Resolved in the locally integrated default-profile guidance. Static prompt checks do not establish model adherence.

## AIF-070 - Restore eight-child upper grid and name overflow tabs

- **Reference:** Operator correction during AIF-069 investigation, 2026-09-17.
- **Feedback:** New subagent tabs need names. The expected layout is up to eight subagents in the top two-thirds, with the orchestrator in the bottom third.
- **History:** `.specs/archive/subagent-transcript-and-pane-ux/plan.md` recorded two rows of four and overflow at child nine; its proposed sizing gave two rows the upper two-thirds. The later `.specs/archive/subagent-reload-and-live-ux/plan.md` records a revision to four children below the orchestrator after physical second-row/focus problems. Current docs/code move that one row above but retain four-per-tab overflow and a two-thirds-height orchestrator. The earlier feedback entry AIF-020 still records eight, so historical documentation is inconsistent. The assistant's previous answer explained current overflow without reconciling it with the earlier requested grid.
- **Current requested behavior:** Two rows of four above the unchanged orchestrator, children using the upper two-thirds and orchestrator the bottom third; overflow begins at child nine, and new owned tabs receive descriptive names. Keep background creation non-focusing and preserve unrelated/user-named tabs.
- **Naming recommendation:** Derive overflow names from the originating task/tab title with a readable agents/group suffix rather than a generic unnamed tab. Exact wording is an implementation detail, not an additional model-generated naming subsystem.
- **Implementation follow-up:** User dispatched Team Lead Clara (`df88e2a4-363b-4589-afb0-a584ecc6f520`). Naming-only source/docs/tests are implemented locally; 21 focused tests, typecheck, runtime smoke, and the isolated inert naming/layout case passed. Geometry remains four per tab. Validator proved main-tab second-row construction at five children using the caller as an anchor. Overflow construction after four full-width-row occupants still nests the fifth pane beneath one column; current Herdr 0.9.0 same-tab move returned `changed:false, reason:same_tab`. An eight-pane overflow grid was reported feasible when its second row is established at child two, which changes the requested progressive fill order and requires an operator decision before adoption. Full 1/4/5/8/9 geometry acceptance is not complete.
- **Handoff failure:** Clara exited with an earlier partial report saying checks were still running, although validator session `01a0b028-c11d-709b-8e43-4162447abff0` record `9fe8f347` had reported validation complete. Parent recovered results through child inspection and exact-session analytics; a follow-up control message was correctly rejected because the non-retained lead had exited. No claim about the cause of stale final-result selection is established.
- **Status at naming-only handoff:** Naming changes validated but uncommitted and not reloaded. Requested geometry remained unresolved pending a fill-order/API-scope decision; no Herdr product changes or live operator-pane tests performed.
- **Layout completion:** Operator approved natural incremental splits without placeholders. Replacement lead `41b88211-8e7e-46f5-8e17-0854f93a28b6` completed layout and full-column vacancy correction. Independent validator `56ef0ba0-98cb-4bdf-88fe-d9bd56c402a1` reported 26 unit tests, isolated live geometry at 1/4/5/8/9 plus vacancy reuse, typecheck, runtime 321 rules/8 schemas, and diff checks passing. Lead transcript `01a0b051-20c1-7681-a1e7-cc553ccfadf9`, record `b238075b` at 17:50:54.978Z, explicitly reports completion and all workers closed. Changes remain uncommitted and not reloaded; attached-client acceptance remains unverified.
- **Repeated stale handoff:** Parent received and repeated a partial result claiming work remained active. When the operator asked why nothing was happening, inspection showed lead/developer/validator settled and exited; lead's stored result still contained the earlier partial text despite the final transcript above. Parent recovered completion evidence and corrected its status. This corroborates the earlier handoff mismatch, not its underlying runtime cause. No messaging/runtime or instruction changes made in this recovery.

## AIF-069 - Team coordination still requires operator intervention

- **Reference:** Operator screenshot `pi-clipboard-0bf5a34d-b344-40b8-a601-7b1fc00bec00.png`, 2026-09-17.
- **Feedback:** The operator identified subagent and Team Lead behavior as an improvement area.
- **Observed:** A developer reports completion and passing checks, then receives a direct question asking whether it notified its parent and ended. The orchestrator reads pane output and asks the Team Lead to collect the result and close the worker. Another developer displays a completion summary while the orchestrator describes it as still working. Visible coordination describes Steward advice as permission for a formatting rerun.
- **Investigation:** Exact default-profile root `01a0ad5f-c353-7153-a106-a6d55654b821`, Team Lead `01a0afcc-d9b2-7162-a92f-845f14c4fb61`, and three developer transcripts establish that Nora's full final reached Clara at 14:44:13Z. Clara then answered Iris at 14:44:18Z; the coordinator control tool waited until Iris finished at 14:54:53Z. The root's 14:47:36Z cleanup steering entered Clara's transcript at 14:54:58Z; Nora closed at 14:55:05Z. All three developers were explicitly launched retained.
- **Cause:** `extensions/subagent-child.ts` implicitly calls `waitForChild` after message/answer unless that individual control call sets `background:true`; root control has no corresponding implicit wait. Visible prompt dispatch itself only enqueues. The launch's background flag does not prevent this later coordinator wait. This is a tool-contract inconsistency, not demonstrated lost result delivery or a worker refusing to end.
- **Corrections:** The root's statement that Maya was working preceded Maya's final by 28 seconds, so this does not establish stale status. The screenshot's phrase about propagating bodies refers to game orbital bodies, not message bodies. Nora's latest retained result became her answer to direct operator input, but Clara already held the substantive result.
- **Steward finding:** The check reported only formatting, already corrected. Clara required consultation before further checks; Steward responded with an allowance and Clara relayed permission. Caller guidance allows evidence-proved direct corrections, while generated Team Lead guidance omits that exception. This is both instruction asymmetry and approval-style assignment framing, not merely a word-choice issue.
- **Recommendation:** Align coordinator message/answer behavior with asynchronous root controls, leaving intentional waits explicit. Then clarify useful retention and completed-but-retained presentation without blanket retention bans or automatic closure of useful conversations. Review complete Steward/Team Lead prompt composition before changing instructions.
- **Related:** AIF-064, AIF-020, AIF-033, APR-016, APR-017, APR-051, APR-052; exact evidence and limits in APR-057 and TCA-007.
- **Operator follow-up:** The operator also noticed a Team Lead child opening in a tab and wants more asynchronous communication so agents can coordinate while the user asks for status or supplies direction. Exact follow-up records show another implicit wait: a routine reviewer notification at 14:56:01.188Z returned at 14:58:33.518Z. The requested direction is responsiveness, not simply faster completion.
- **Layout finding:** Clara did not request tab placement. Layout is origin-owned, counts the Team Lead plus its descendants, and opens an overflow tab at child five. At reviewer launch (14:55:24Z), Clara, Maya, Iris, and the new validator Nora still occupied four slots; Maya/Iris cleanup followed afterward. The earlier Steward launch likewise occurred with four occupied slots. These launches explain automatic overflow without an agent choosing a new tab. Exact historical tab IDs were not retained in the selected records. Existing overflow panes are not moved back when main-tab slots free up.
- **Status:** Investigation complete through the follow-up reviewer wait. No runtime or executable instruction changes, live-team controls, or regression tests performed. Recommendations require approval.

## AIF-068 - Strategist foreground mode also means non-retained

- **Reference:** Operator correction during review of default session `01a0acad-f5d2-738a-942f-f5858de7a2c4`, 2026-09-17.
- **Feedback:** Strategists are supposed to run in the foreground, block the parent until their consultation returns, and then exit. They are not retained conversations.
- **Finding:** AIF-067 and the implementation enforced only `background:false`. The public schemas still accept `retain:true` for Strategists, and a Team Lead used it for Maya. This left a completed Strategist alive and allowed direct pane input to create an unintended second turn. The earlier review incorrectly described that retention as expected.
- **Decision:** Treat Strategist non-retention as part of the role contract and enforce it in both root and coordinator launch paths rather than relying only on prompt adherence.
- **Related:** AIF-067, APR-054, APR-056, TCA-005.
- **Status:** Implemented in both root and coordinator launch paths. Fourteen focused tests, default typecheck, and runtime smoke passed; live model acceptance remains unverified.

## AIF-067 - Enforce foreground Strategist launches without delegation gates

- **Reference:** Review of default session `01a0acad-f5d2-738a-942f-f5858de7a2c4`, 2026-09-17.
- **Feedback:** The operator approved only foreground enforcement for Strategist and deferred broader launch restrictions until further issues establish a need. Concurrent Team Leads must remain unaffected.
- **Decision:** Root and coordinator subagent tools override Strategist's background request and use their existing foreground wait/progress paths. Preserve ordinary interruption, other roles' background launches, and advice reuse. Add no consultation receipts, launch rejection, or same-batch sequencing gate.
- **Related:** AIF-061, AIF-066, APR-046, APR-054.
- **Status:** Implemented locally. All 31 focused launch, child-outcome, and runtime tests, default typecheck, and runtime smoke passed. Root tests use the real runtime with an inert child process; coordinator tests exercise the tool's wait path with mocked transport. Live model adherence remains unverified; reload only after active children settle.

## AIF-066 - Carry Strategist-first delegation into executable plans

- **Reference:** Two attempted executions of the subagent-parent-question-mailbox plan, 2026-09-17.
- **Observed:** Separate orchestrators skipped the required Strategist consultation. One also guessed nonexistent `implementer` and `coder` roles and attempted to assign four named plan tasks to one worker.
- **Finding:** No Strategist requirement was removed from planning history. Recent planning guidance added that Strategist owns staffing, but the plan template did not carry the actionable Strategist-first step and relied on separately injected caller guidance. The generated plan was therefore not self-contained about delegation workflow.
- **Decision:** With operator approval, require executable plans to instruct the orchestrator to consult Strategist before delegation, assign at most one named plan task per subagent, split larger tasks further, and use only active-catalog roles. Add the instruction to the planning skill, template, and affected active plan without changing task intent.
- **Related:** AIF-061, AIF-062, AIF-063, APR-046.
- **Status:** Implemented locally; future adherence remains unverified.

## AIF-065 - Add a whole-prompt review procedure with cache-effectiveness analysis

- **Reference:** Operator follow-up after the Team Lead prompt consolidation, 2026-09-16.
- **Feedback:** The prompting skill needs an explicit procedure that prevents incremental fragment editing, traces why existing text was added, unifies instruction ownership and terminology, reviews the complete composed prompt, and includes cache-effectiveness review for prompt changes.
- **Finding:** The current prompting skill names these principles but presents them as independent bullets. During AIF-064 they did not reliably produce an ordered whole-prompt review: proposals were patched sentence by sentence, provenance was investigated late, fragments were presented as complete, and negative alternatives were introduced. The Pi extension skill separately covers byte stability and provider usage, but general prompt work has no explicit cache-review stage or claim boundary.
- **Recommendation:** Replace the loose checklist with a concise ordered procedure: assemble the full audience-visible prompt, trace provenance and required behaviors, assign each behavior to one owning layer, rewrite the composition, render and inspect the complete result, review stable-prefix and measured cache effects, then validate behavior and report evidence limits. Require actual provider usage before claiming improved caching; static size and deterministic composition establish only cacheability conditions.
- **Related:** AIF-035, AIF-045, AIF-058, AIF-063, AIF-064.
- **Decision:** Operator approved applying the proposed procedure to the prompting-skill change itself. The revised skill now orders assembly, provenance recovery, ownership, rewriting, complete-composition inspection, cache review, validation, and reporting while preserving the original selection and progressive-disclosure principles.
- **Cache review:** The discovery description is byte-identical, so the always-visible skill catalog is unchanged. `SKILL.md` grows from 2,040 bytes/263 whitespace-delimited words to 3,311/414, but that body is conditional: Pi loads it through progressive disclosure or expands it through an explicit skill command. Static inspection therefore establishes no new always-visible prefix change and no actual provider cache effect. No representative provider requests were run, so cache effectiveness remains unmeasured.
- **Validation:** All 21 focused prompting-skill, Team Lead composition, and launch tests pass; default-profile typecheck and `git diff --check` pass. These checks establish discovery, composition, and required wording, not future model adherence or provider cache effectiveness.
- **Status:** Implemented locally; future adherence and cache effectiveness remain unverified.

## AIF-064 - Require Team Leads to lead through delegated workers

- **Reference:** Operator correction about Team Lead delegation semantics, 2026-09-16.
- **Feedback:** A Team Lead exists to lead a team. It should not merely be permitted to delegate or coordinate conditionally; it must delegate substantive work to child agents.
- **Finding:** The role prompt says to coordinate leaf assignments and forbids direct edits, but neither it nor Team Lead guidance explicitly requires launching leaves. Team Leads also do not inherit caller guidance requiring Strategist consultation before delegation, so the assembled Team Lead prompt does not require the Strategist step either. The current wording therefore leaves a path to direct non-editing work without forming a team.
- **Recommendation:** Make Team Lead delegation mandatory: consult Strategist, form bounded leaf assignments, delegate substantive investigation and implementation, and integrate results. Reserve direct work for coordination and integration. Keep ordinary orchestrator delegation optional so simple tasks still remain direct.
- **Related:** AIF-033, AIF-061, AIF-062, APR-020, APR-046.
- **Context follow-up:** The assembled Team Lead child previously launched with both `--no-context-files` and `--no-skills`, so it received neither applicable global/repository `AGENTS.md` instructions nor the discoverable skill catalog. The operator approved enabling both for Team Leads while retaining frozen tools and delegate authority; other roles remain isolated.
- **Prompt-review failure:** Subsequent proposals were edited incrementally instead of re-evaluating the complete composed prompt. They repeated the role identity, retained Strategist-owned decomposition guidance in the Team Lead prompt, mixed leaf/worker/subagent terminology, showed fragments while claiming to discuss the whole prompt, and added vague discretion such as “adapt” without a concrete decision condition. The assistant kept offering bite-sized wording patches when the operator expected a wholesale solution across prompt assembly, role ownership, terminology, context, tools, and tests. These issues should have been resolved through one complete composition review before presenting another draft.
- **Decision:** With operator approval, rebuild the Team Lead composition around one Strategist-first workflow, mandatory substantive delegation to additional subagents, evidence-triggered Strategist reconsultation, concise Steward and retry sections, consistent model-facing “subagent” terminology, and normal context/skill discovery. Preserve the historical purposes of the eight-active-subagent bound, Steward churn checkpoint, and evidence-based retry boundary without retaining duplicated wording or advertising prohibited model choices.
- **Validation:** The assembled bundled Team Lead prompt is 2,778 bytes and 371 whitespace-delimited words, down from the previously recorded 2,836/385 while adding the mandatory team workflow. Thirty focused prompt, launch, and runtime tests plus default-profile typecheck pass. The first focused run exposed generic coordinators still sharing Team Lead guidance; separating those audience branches restored their decomposition guidance without changing the Team Lead contract.
- **Status:** Implemented locally; future model adherence remains unverified.

## AIF-063 - Consolidate the full Strategist prompt before adding role-selection advice

- **Reference:** Operator question about prompt growth after the proposed single-worker versus Team Lead guidance, 2026-09-16.
- **Feedback:** Evaluate token efficiency across Strategist's full composed instructions, not just each proposed paragraph.
- **Finding:** Before consolidation, profile-only composition was 3,887 characters and 511 whitespace-delimited words, including the role catalog, excluding Pi's base system prompt, authority wrapper, project instructions, and assignment. The role body and generated guidance repeat direct-execution advice, evidence-based selection, clarification, and proposal boundaries. The generated catalog already supplies role defaults, while selection guidance also repeats Strategist's own default and effort restrictions.
- **Recommendation:** Consolidate overlapping role and generated guidance before incorporating the proposed single-worker/direct-parallel/Team Lead distinction. Preserve explicit task sizing, active parallel decomposition, dependency outputs, adaptable recommendation structure, and applicable model-selection constraints. Do not add a paragraph or a runtime gate merely to cover the new distinction.
- **Related:** AIF-058, AIF-061, AIF-062.
- **Trigger follow-up:** The operator questioned whether the prompt-optimization skill was being triggered. This session loaded `agent-process`, `skill-creation`, and `pi-extension` before implementation. Their existing guidance already requires consolidation and comparison with active instructions. The implementation measured generated guidance by audience but retained overlap with the role body; the subsequent Team Lead proposal suggested another paragraph. This is incomplete application of loaded guidance, not a demonstrated discovery failure. `skill-creation` has a narrower discovery description than general prompt editing, but broadening it alone would not explain or fix this occurrence.
- **Decision:** Operator approved consolidating Strategist and extracting a shared `prompting` skill. The role now covers output/authority once; generated guidance covers decomposition and worker selection without repeating the role's explanations or the catalog's defaults. It distinguishes a bounded worker, direct parallel workers, and a Team Lead with a named coordination/integration responsibility. The task ceiling applies to leaf workers, not their coordinator. The new generally discoverable skill owns whole-prompt composition, selective instruction writing, and context placement; `skill-creation`, `agent-process`, and `pi-extension` load it for that work and retain only their specialized responsibilities.
- **Measurements:** With bundled catalogs, Strategist decreased from 3,887 bytes/511 words to 3,273/418; Team Lead from 3,072/414 to 2,836/385. Caller changed from 2,374/294 to 2,379/295 to clarify leaf ownership; Council and developer were unchanged. Word counts are whitespace-delimited, not token measurements. Across the three existing skill files, text decreased from 9,476 to 7,784 bytes; the shared skill adds 2,040 bytes, so the combined source grows by 348 bytes while removing duplication and adding general discovery and whole-composition guidance. Skill bodies remain on demand, not always injected.
- **Validation:** All 39 focused prompt/definition/skill tests and default-profile typecheck pass. The initial native-discovery test exposed a missing loader re-export in the existing Vitest facade; adding that actual Pi export fixed the test without runtime changes. Tests exercise native discovery, shared references, composed output, defaults, exclusions, size, and deterministic ordering, not model adherence.
- **Status:** Implemented locally with operator approval. No new schema, runtime gate, automatic dispatcher, or existing-plan rewrite. Reload after active children settle; future behavior remains unverified.

## AIF-062 - Make Strategist actively expose parallel execution waves

- **Reference:** Operator follow-up to AIF-061, 2026-09-16.
- **Feedback:** Delegation advice is not putting enough effort into finding work that can run in parallel. Avoid treating a plan's listed order as an implicit serial dependency chain.
- **Finding:** Active guidance merely permits independent work to run in parallel. It does not require Strategist to inspect explicit dependencies, identify all currently ready tasks, detect unnecessarily coupled task boundaries, or present execution waves. In the asynchronous-channel plan, T1-T4 are explicitly serial, so execution guidance alone cannot make those four implementation tasks parallel without revising the plan boundaries or dependencies.
- **Decision:** With operator approval, replace passive parallelism guidance with active decomposition in Strategist/coordinator context and the planning skill/template. Separate shared prerequisites from independent implementation; identify useful concurrent assignments, write ownership, and exact prerequisite results. Recommend corrections to unnecessary plan dependencies without silently changing settled intent. Do not manufacture assignments merely to increase concurrency.
- **Output clarification:** Strategist advice uses Start now, Start after prerequisites, and Parent-owned actions, omitting empty sections. Each assignment identifies its outcome, role/model/effort, ownership, and completion evidence. This is adaptable prose, not a parsed schema, runtime gate, approval step, or mandatory ceremony. The parent owns dispatch and integration.
- **Related:** AIF-061, AIF-027, APR-046.
- **Status:** Approved guidance implemented locally. Existing plans and running workers remain unchanged; behavioral effectiveness remains unverified.

## AIF-061 - Assign one plan task per implementation subagent

- **Reference:** Operator correction after the asynchronous-channel-messaging plan launch, 2026-09-16.
- **Feedback:** When a plan has tasks T1 through T4, each task should be assigned to its own subagent. One developer receiving “Implement T1-T4” is not sufficiently decomposed.
- **Finding:** The active injected guidance says only “Use small assignments” and “split by responsibility.” The screenshot establishes the orchestrator's combined assignment, not Strategist's actual recommendation. AIF-027 had already recommended one task section per worker, and subagent documentation mentions it, but the inspected caller/coordinator prompts do not carry that explicit boundary.
- **Decision:** With operator approval, replace the ambiguous wording in caller, Strategist, and coordinator guidance with at most one named plan task per worker, allowing large tasks to be split further. Integrate prerequisite results before dependent work and run ready independent assignments concurrently with disjoint write ownership. Preserve direct execution for work that does not benefit from delegation.
- **Related:** AIF-027, AIF-062, APR-020, APR-046.
- **Status:** Approved guidance implemented locally. New child prompts and refreshed caller context carry the rule; future adherence remains unverified.

## AIF-060 - Keep interface-command acknowledgments out of model context

- **Reference:** Operator correction after `/new-instance` interrupted plan execution, 2026-09-15.
- **Feedback:** `/new-instance` must never cause the current orchestrator to stop; it is an interface command that opens another instance, not an instruction to abandon current execution.
- **Finding:** The profile's shared acknowledgment wrapper inserted command text with `pi.sendMessage()`, whose custom messages participate in model context. Pi extension commands already bypass the agent when invoked; the wrapper unintentionally reintroduced the command afterward as model-visible context.
- **Decision:** Preserve visible command history as TUI-only custom entries via `pi.appendEntry()`. Do not add a model instruction explaining `/new-instance`; remove the runtime source of ambiguity instead.
- **Related:** APR-045, AIF-029A.
- **Status:** Runtime and regression test corrected locally. With operator approval, the `pi-extension` skill now carries the command presentation versus model-input rule for future extension work. Future attached-client behavior requires reload.

## AIF-059A - Make Onclave outbound and automatic-reply behavior explicit

- **Reference:** Operator review after an instance manually replied to an inbound Onclave ask with an invalid `inform` plus `task_id`, 2026-09-15.
- **Feedback:** The interface is confusing because one flat `onclave_message` schema combines three outbound modes while inbound asks and requests are answered automatically from the normal assistant final response. Inbound framing prominently exposes task metadata without saying not to echo it, and field applicability is enforced only after an invalid call.
- **Finding:** The failed instance did not merely choose an invalid field combination; it used the outbound tool for a response the adapter already publishes automatically after the turn settles. Current tool guidance covers authority but not this lifecycle. Documentation defines the behavior, but that text is not present at the model decision point. Validation also accepts `timeout_ms` for asynchronous `request` even though execution ignores it and documentation defines timeout as ask-only.
- **Recommendation:** Preserve automatic replies. Add concise inbound framing that says to answer normally and not call `onclave_message`; add a message-type/field table to tool-owned guidance and conditional field descriptions; reject request timeouts consistently. Keep runtime validation. Consider separate outbound tools only if clearer guidance remains insufficient, since a larger tool surface is not yet justified.
- **Related:** TCA-004, AIF-032, AIF-035.
- **Status:** Implemented in the owning Onclave adapter. Inbound framing explains response behavior, active-request correlation is inferred, unsupported task/context/timeout fields are rejected, and focused communication tests cover the contract.

## AIF-059B - Keep investigation purpose intact across long plans

- **Reference:** Operator plan walkthrough request, 2026-09-15.
- **Feedback:** Large plans invite unsupported assumptions and context-compaction drift that lose the original objective. Explain what each step proves and how before proceeding.
- **Finding:** The current plan already requires a canonical handoff, evidence and temporary-state tracking. Those records help only if kept current and consulted after resumption; a checkbox does not prove acceptance. Its test-contract task defines future checks rather than implementing them, which needs explicit explanation.
- **Decision:** Explain the bounded sequence, evidence limits and authorization boundaries without changing the plan or adding global instructions. Keep the current question, proven result, unresolved hypothesis and next action recoverable from the existing handoff.
- **Related:** AIF-055, AIF-057; APR-029 (unrequested execution machinery).
- **Status:** Feedback recorded. No new workflow machinery or instruction change; future adherence unverified.

## AIF-058 - Reduce always-injected caller delegation guidance

- **Reference:** Steward-trigger discussion after APR-040, 2026-09-14.
- **Feedback:** The caller guidance appears to pass too many tokens on every orchestrator run. A more precise Steward trigger should not add to that standing cost.
- **Finding:** `CALLER_GUIDANCE` is about 3,425 characters and 491 whitespace-delimited words before the additional Team Lead/count paragraph and agent catalog appended by `extensions/subagents.ts`. It is stable and may benefit from provider prompt caching, but it still occupies context and is supplied to every primary agent run. It repeats detailed model routing, retry, assignment-sizing, and consultation behavior that can partly live in Strategist/Team Lead prompts or code-enforced defaults.
- **Recommendation:** Replace rather than append. Keep only direct-execution versus delegation, Strategist and Steward triggers, advice-not-approval, and small dependency-aware assignments in caller context. Move detailed role/model/effort selection into Strategist context; keep enforceable effort constraints in runtime code; retain retry details only where the actor performing retries needs them. Review the separately appended Team Lead/count paragraph at the same time. Preserve the agent catalog as concise progressive-disclosure metadata.
- **Related:** AIF-057, AIF-049, AIF-032, AIF-027.
- **Status:** Implemented with operator approval in `lib/subagents/guidance.ts`, `extensions/subagents.ts`, and the Steward catalog description. Caller guidance decreased from 491 to 117 words. The on-demand `agent-process` and `pi-extension` skills now require comparison with active instructions and ordinary model knowledge, latest-useful-stage placement, and audience-specific size/stability checks for always-visible text. Focused subagent and skill tests and typecheck passed.

## AIF-057 - Make Steward triggers finding-based and directly invokable

- **Reference:** Follow-up to APR-040 during database lifecycle execution, 2026-09-14.
- **Feedback:** “Relevant task” is too ambiguous to trigger reliable Steward use in a long-running plan. The trigger should be based on an observable validation finding and proposed follow-up action. The operator clarified that no user is monitoring an unattended plan run, so a manual `/steward` command does not solve the failure.
- **Finding:** Pi skills and this profile's agent catalog both expose descriptions to the orchestrator for model-selected use. Skill loading does not itself launch a subagent; this profile launches roles through the `subagent` tool. The Steward description currently says only “review-driven follow-up,” which does not directly name an unexpected deployment or failed plan check. Automatic classification of arbitrary nonzero tool results would confuse expected command outcomes with validation findings.
- **Recommendation:** Put the autonomous trigger in the always-injected Steward catalog description and subagent guidance: when an agreed check or deployment behaves unexpectedly and the proposed response requires tracked source/deployment changes, another MR/image/deploy cycle, or a changed workflow, invoke Steward before implementing. Always retrigger after a prior fix for the same criterion is falsified. Do not depend on user action, make Steward an approval authority, or add a generic shell-error gate. A plan-local reminder may reinforce a specific phase but is not the primary trigger.
- **Related:** APR-040, AIF-029B, AIF-032, AIF-043.
- **Status:** Implemented with operator approval in the always-injected caller and Team Lead guidance plus `agents/steward.md`. The trigger is model-selected, requires no active user, and adds no command-failure gate.

## AIF-056 - Require explicit direction for published-history rewrites

- **Reference:** Operator correction after the unauthorized force-push attempt recorded in APR-036, 2026-09-14.
- **Feedback:** Avoid unnecessary Git operations that lead to force-pushing or other published-history rewrites. If a rewrite is genuinely needed, the operator must clearly direct the specific rewrite.
- **Decision:** Add one profile-wide Preservation rule: “Never rewrite published Git history unless the user explicitly directs the specific rewrite.” This covers force-pushing and amending or rebasing published commits without duplicating repository-specific absolute prohibitions.
- **Related:** APR-036, AIF-042, AIF-032.
- **Status:** Instruction updated; future adherence remains unverified.

## AIF-055 - Evolve instructions with selective evidence and preserved task context

- **Reference:** Operator discussion and authorized investigation on 2026-09-13, following AIF-054.
- **Feedback:** Seek small, high-impact instructions without filling context with either wordy rules or indiscriminate research. Use flexible prompt-based improvement rather than a deterministic state machine. Deletion, consolidation, and relocation are valid remedies. Offer, rather than automatically perform, separation of process discussion from task work; retain discoverable fork/new-instance options for later evolution through use.
- **Finding:** `skill-creation` already covers concise selection and consolidation. `agent-process` is the existing improvement entry point, but its complete-history reading requirement conflicts with selective context use. Native Pi fork behavior passed disposable storage/RPC experiments; repository `/branch` mutates the parent session manager before launching the child, so it is not currently a reliable independent-copy option.
- **Decision:** Evolve the existing `agent-process` skill rather than add a new process. Replace mandatory full-log reads with relevant retrieval, recognize contextual frustration signals, permit a concise record-only outcome, and offer context separation only when process discussion may displace task work. Instruction changes still require operator approval; no automation, threshold, monitoring, or mandatory experiment is added.
- **Related:** AIF-003, AIF-004, AIF-013, AIF-031, AIF-054; vault notes `instruction-evolution-and-reasoning-budgets.md` and `pi-context-separation-options.md` under `agent-workflows/patterns/`; on-demand skill reference `context-separation.md`.
- **Follow-up:** Operator separately approved fixing `/branch` to keep parent and child in independent files, with reciprocal visible persisted IDs/paths/roles and branch-point entry/timestamp excluded from model context. Repair, real-manager tests, focused checks, and installed-loader review completed; no live two-tab exercise. The first skill draft now documents the repaired command with that live-verification limit and distinguishes it from native fork, clone, tree, and saved-session resume.
- **Expectation:** Selective evidence should reduce context displacement without weakening decision-relevant checks. Later comparable reviews should consider recurrence, operator correction burden, unintended work, and task completion; one outcome does not prove causality.
- **Instruction-growth clarification:** Operator approved explaining the cost directly in step 4: more instructions consume task context and can introduce conflicts or obscure important guidance. Prefer replacement or consolidation when it preserves behavior. This makes the rationale explicit without duplicating it in global instructions; effectiveness remains unverified.
- **Status:** Approved first draft implemented. Loading and consistency checks establish installation, not behavioral effectiveness.

## AIF-054 - Stop prompting safety-gate invention

- **Reference:** Operator correction after the Onclave vault notification and transcript-download implementation, 2026-09-13.
- **Feedback:** Existing agents show a recurring tendency to invent operational safety gates and resource ceilings. Review the active orchestrator and role prompts for wording that primes generic safety recommendations, especially reviewer instructions, rather than adding another prohibition without identifying the source.
- **Finding:** The reviewer role says to prioritize “correctness, safety, and requirement defects,” while the global default instructions already say generic best practices do not justify controls and unresolved safeguard choices require an operator question. In this task, the orchestrator also explicitly prompted workers to add byte limits, fail closed without a notification identity, and extend a timeout. The assignments establish orchestrator noncompliance with proportionality instructions; reviewer safety priming remains a possible influence, not a demonstrated cause.
- **Decision:** Reviewers may propose safety controls and must present findings as proposals for parent assessment against user intent. The orchestrator must discuss suggestions outside that intent with the user before assigning or implementing them.
- **Related:** AIF-041, AIF-031, AIF-032, AIF-024, APR-035.
- **Follow-up evidence:** Session `01a09b46-74f9-70bb-989d-7bed421a1784`, records 278–299, shows repeated confident justification after correction: the orchestrator retained a supposedly necessary context-output limit until the operator pointed out that file download returns only metadata. The issue is not just proposal approval: claimed necessity must be checked against the actual data path, and a challenged premise must be reassessed rather than replaced with another unsupported justification. The operator subsequently approved concise replacements in global Investigation and Proportionality requiring evidence for factual claims, rechecking challenged claims, and workflow-specific justification for safeguards. The reviewer must explain the harm path and include an explicit proposal/user-discussion warning in each security or safety-gate finding.
- **Status:** Default-profile reviewer and orchestrator instructions updated; future adherence remains unverified.

## AIF-053 - Keep shell syntax consistent

- **Reference:** Operator report of recurring literal `NUL` files and a Damage Control cleanup prompt, 2026-09-12.
- **Feedback:** Use concise separate rules without ending punctuation: “Use syntax matching the intended shell tool” and “Never use CMD syntax”. Retain the direct `NUL` prohibition.
- **Finding:** A reviewer passed `2>NUL || exit /b 0` to Bash in a Windows worktree. Bash created a literal root-level `NUL` file because both constructs were generated for the wrong shell.
- **Decision:** Add the shell-consistency and CMD prohibitions to the default profile so they apply across project repositories.
- **Related:** AIF-001, AIF-004.
- **Status:** Instructions updated; future adherence remains unverified.

## AIF-052 - Preserve plan-recorded push and deployment authorization

- **Reference:** Operator correction after `/do-it` stopped the database lifecycle plan before its authorized push and dev deployment, 2026-09-12.
- **Feedback:** When the user explicitly authorizes push or deployment as part of a plan, invoking plan execution should carry that authorization forward. Generic command wording must not silently revoke it.
- **Finding:** The selected plan recorded task-related push, deployment, monitoring, and one dev reset authorization. `/do-it` nevertheless said its invocation did not authorize push or deployment, and the assistant treated that as a newer revocation.
- **Decision:** Make `/do-it` inherit explicit push/deployment authority recorded in the selected plan while neither adding authority absent from the plan nor overriding a later user revocation. Align the plan template with the same rule.
- **Related:** AIF-016, AIF-021, AIF-023, APR-033.
- **Status:** Prompt and template updated; future adherence remains unverified.

## AIF-051 - Diagnose generated behavior before refining a build prompt

- **Reference:** Operator correction after the Damage Control prompt hill-climb, 2026-09-12.
- **Feedback:** Rephrasing an outcome already stated in the prompt is not a justified refinement. A prompt iteration needs evidence about why the generated implementation failed and a concrete reason the proposed change addresses that cause.
- **Finding:** Iteration 1 blocked a routine redirected project write despite the prompt already allowing recoverable project edits. The assistant added another example and restated the same outcome without inspecting the generated analyzer or policy. Iteration 2 retained the failure and added generated-check, capability, and structural regressions.
- **Recommendation:** After hidden grading, inspect the generated implementation outside the builder. Distinguish prompt omission or ambiguity from builder noncompliance and run variance. Edit only for a diagnosed prompt-level cause, state the predicted behavioral change, use a contrasting positive/negative case, and reject candidates that do not match the prediction or regress safety. Do not spend another iteration paraphrasing an existing requirement.
- **Related:** APR-032, AIF-032, APR-002.
- **Status:** Feedback recorded; a new experiment requires separate execution authority.

## AIF-050 - Do not let `/clear` cleanup failures veto session clearing

- **Reference:** Operator correction after `/clear` refused to start a new session following two failed visible-subagent launches, 2026-09-12.
- **Feedback:** The operator did not request a safety gate that makes successful subagent cleanup a prerequisite for `/clear`. Best-effort cleanup must not silently become authority to veto the requested session transition.
- **Finding:** Commit `c25864f1` added the only custom blocking branch in `extensions/clear.ts`. Its archived plan called the behavior a proposed mechanism but did not identify operator authority for that `/clear` policy. The implementation, regression test, documentation, and changelog then treated it as required.
- **Recommendation:** Remove the cleanup-failure veto from `/clear`. Keep cleanup reporting and any exact-resource handling separate from whether the new session opens. Review the desired disposition of unresolved runtime ownership before implementation rather than replacing the gate with another unapproved policy.
- **Related:** AIF-019, AIF-041, APR-031.
- **Status:** Implemented. `/clear` reports unresolved cleanup but still starts the new session; it suppresses reload when reset did not complete. Focused validation is recorded in the implementing runtime history.

## AIF-049 - Keep skill creation Pareto-focused

- **Reference:** Operator review of the skill-creation research synthesis, 2026-09-11.
- **Feedback:** Once the operator has decided to create a skill, the meta skill should not reopen that decision or impose an evaluation framework. Overly specific instructions consume context and can reduce model performance. The phrase “Pareto principle (80/20)” supplies general selection knowledge when paired with a concise definition of value.
- **Decision:** Add a concise `skill-creation` skill that selects the smallest instruction set preventing consequential or recurring errors, relies on existing model judgment, uses precise discovery metadata and progressive disclosure, calibrates control to fragility, and keeps examples positive-only.
- **Related:** AIF-048, AIF-035, APR-030.
- **Status:** Implemented locally; runtime discovery requires reload.

## AIF-048 - Make TypeScript runtime boundaries explicit

- **Reference:** Visible-subagent bootstrap failure investigation, 2026-09-11.
- **Feedback:** A broad internal launch object was spread and asserted as a narrower `LaunchSpec`; adding `modelRegistry` later silently placed it in the serialized bootstrap and exceeded the transport limit. The legacy TypeScript skill covered package, module, runtime-validation, cleanup, and testing concerns but did not name this object-assertion boundary trap.
- **Decision:** Add a concise default TypeScript skill based on the Google TypeScript Style Guide's typed-object guidance and the observed failure. At RPC, serialization, persistence, subprocess, and public API boundaries, explicitly construct the boundary type rather than spreading and asserting a broader object. Retain the legacy skill's high-value package ownership, module-resolution, static-versus-runtime, resource-cleanup, and focused-check guidance.
- **Operator correction:** Keep executable skill examples positive-only. Copyable prohibited syntax can prime the model to reproduce it despite a bad label; retain incident specifics in the historical failure log instead.
- **Related:** APR-030, AIF-035, AIF-032.
- **Status:** Skill created; discovery and future adherence remain unverified.

## AIF-047 - Do not add plan execution reservations

- **Reference:** Operator correction after `/plans` created a child that reported `Reservation is missing or already adopted`, 2026-09-11.
- **Feedback:** The cross-process reservation and live ownership system was not requested and obstructed normal plan launch.
- **Evidence:** The original archived `/plans` plan explicitly listed plan execution tracking as a non-goal. Later changes added token handoff, profile-local run files, lifecycle tracking, polling, and startup refusal.
- **Decision:** Remove that system rather than repair its race. Retain only picker-local pending-input suppression plus the originally requested constrained Herdr launch, path validation, archive checks, and non-automatic retry after ambiguous launch responses.
- **Related:** AIF-041, AIF-031, APR-029.
- **Status:** Implemented. Focused plan/session/launcher tests, typecheck, runtime smoke, and diff checks pass. Active sessions require reload; attached-client behavior remains unverified.

## AIF-046 - Resume a Herdr Pi session in one focused tool action

- **Reference:** Operator correction after reopening a stalled dotfiles session, 2026-09-11.
- **Feedback:** Avoid separate discovery, tab creation, shell submission and repeated readiness calls. Reuse the existing tool and Pi launcher. `{"action":"resume","session":"<UUID>"}` should focus the new tab by default, without a required focus argument.
- **Decision:** Add resume to `herdr_layout`, resolving the saved cwd/session and returning startup state and tab/pane IDs. Use structured tool schemas directly; reserve upstream CLI-document discovery for raw CLI use.
- **Related:** AIF-004, AIF-033, AIF-045.
- **Status:** Implemented; 21 focused resume, Herdr tool and session-launch tests plus typecheck passed. New action requires reload; attached-client use remains unverified.

## AIF-045 - Give the Damage Control judge conversation context, not tool-history dumps

- **Reference:** Operator correction and implementation approval in default session `01a09221-27b5-7739-bbb8-dff21f3ff2a9`, 2026-09-11.
- **Feedback:** The shadow judge should receive session user text, visible assistant response text, the pending tool call, applicable rules, and a short harm-focused contract. Exclude prior tool calls/results, serialized edits, hash manifests, and exhaustive parser inventories. Routine cleanup should not require universal proof of disposability.
- **Evidence:** The reported temporary evaluation-directory cleanup received `ask` after an approximately 24 KB prompt containing reports, hashes, edits, and incidental parser uncertainties. The recorded call took 11.3 seconds, not a timeout; contribution to other timeout incidents is unverified. The orchestrator repeatedly substituted summaries and file paths for the requested exact prompt, then incorrectly attributed the issue to one sentence.
- **Decision:** Replace the outbound evidence dump with native-branch conversation text and the pending call. Keep deterministic rules and approval boundaries unchanged. Document context omissions rather than silently substituting machine-generated history.
- **Correction:** The first implementation imposed an unrequested 16-message/16 KiB slice. The operator rejected it and approved full user/assistant session text, trimmed only when the judge's actual context window requires it. Removed both conversation caps and the separate 64 KiB outbound gate; trimming occurs only after provider-reported context overflow and discloses the omitted count.
- **Related:** AIF-015B (meaningful harm), AIF-032 (concise instructions), AIF-041 (context-size protections), APR-007, APR-010.
- **Status:** Implemented with focused tests, typecheck and runtime smoke passing. The reported cleanup passed a non-executing native-context Luna replay after contract refinement; meaningful unique-work and hard-block contrasts retained intervention. See APR-028 for measurements and limits. Active sessions require reload; no global instruction change.

## AIF-044 - Keep Pi repository settings out of project repositories

- **Reference:** Operator correction after the dev-setup changelog workflow commit, 2026-09-11.
- **Feedback:** `.pi/settings.json` must never be committed outside `~/.dotfiles`. Project repositories should ignore that file specifically, not all of `.pi/`; repository-local skill setup must not add an exception for Pi settings. Newly created files with `.local` in the filename require an ignore decision during `/commit` rather than silent inclusion.
- **Finding:** The changelog setup copied the `gcc_automation` import pattern into `dev-setup`, changed `.gitignore` to track `.pi/settings.json`, and committed it. Existing local Claude settings and planning artifacts were also tracked despite repository ignore intent.
- **Decision:** Add a fixed rule to the default commit workflow that excludes and specifically ignores `.pi/settings.json` outside the dotfiles repository without asking the operator to resolve this settled policy. Require `ask_ignore` for newly created `.local` filenames. Amend the affected project commit to remove Pi settings, local Claude settings, and planning artifacts and correct its documentation.
- **Related:** AIF-031, AIF-039.
- **Status:** Instruction and affected project correction implemented; future adherence remains unverified.

## AIF-043 - Distinguish tool failures from faithfully reported failure outcomes

- **Reference:** Operator correction during follow-up to the weekly Pi session review, 2026-09-11.
- **Feedback:** A Bash call that faithfully returns a program's nonzero exit code is not a failure of the Bash tool. HTTP 500 can mean the HTTP tool succeeded while the target service failed. Incorrect flags, syntax, paths, or tool selection are caller tool-use failures and must be distinguished from tool implementation defects. Isolated incidents are not recurring issues.
- **Decision:** Add an on-demand `tool-call-analysis` skill covering tool mechanism failures, tool-use failures, command/application outcomes, interpretation failures, equivalent subagent categories, cross-session recurrence, and evidence-based counting. The skill owns durable analysis and classification-feedback logs so review coverage and operator corrections survive later sessions. Do not infer systemic remediation from raw error flags or one-off events.
- **Related:** APR-027, AIF-032, AIF-041.
- **Status:** Skill and persistent logs implemented; future adherence remains unverified.

## AIF-042 - Override inherited submodule push recursion in coordinated commits

- **Reference:** Operator request to fix bounded `/commit` publication ordering, 2026-09-11.
- **Feedback:** The existing child-first review and push instructions did not explicitly disable inherited `push.recurseSubmodules=on-demand`, and the workflow omitted clean initialized submodules with outgoing referenced commits.
- **Decision:** Keep the existing `origin` destination and push permission model. Review every initialized repository, commit dirty children deepest-first, refresh parent status before staging gitlinks, and publish eligible repositories with `--recurse-submodules=no origin HEAD:refs/heads/<own-branch>` in child-before-parent order. Do not add remote policy or safety gates.
- **Related:** AIF-009 (submodule commit workflow), AIF-010 (failure diagnostics).
- **Status:** Implemented; focused reviewer tests, default-profile typecheck, and diff check pass. Runtime effectiveness remains unverified.

## AIF-041 - Do not impose unrequested safety gates or resource ceilings

- **Reference:** Operator correction after the weekly session-failure review, 2026-09-11.
- **Feedback:** The operator did not request the custom `log_analytics` query deadlines, selected-input bound, DuckDB memory ceiling, or many other safety gates added to the default profile. These controls obstruct requested work and shift operational policy away from the operator without agreement.
- **Finding:** The review hit the tool's configured 120-second large-query deadline and 1 GB DuckDB ceiling while performing the requested exhaustive analysis. A direct JSONL fallback completed the affected review. Existing AIF-015B, AIF-024, AIF-029B, AIF-031, and APR-024 already reject generic, unrequested gates and ceremony; this is another concrete occurrence involving resource limits rather than authorization prompts.
- **Operator clarification:** Limits that protect model context size are acceptable. The objection concerns unrequested operational gates and resource ceilings that obstruct work, not bounded tool-result rendering or pagination needed to keep results usable in context.
- **Recommendation:** Inventory custom default-profile gates and limits, identify their provenance and concrete purpose, and present removal or simplification recommendations for operator decision. Preserve context-size protections. Do not silently raise, retain, or replace operational gates with new gates. This feedback does not itself authorize runtime changes.
- **Related:** AIF-015B, AIF-024, AIF-029B, AIF-031, APR-024, APR-026.
- **Status:** Operator approved remediation. Removed internal analytics deadlines, the standard selected-input ceiling, search byte/record/deadline page gates, and cursor expiry; raised default DuckDB memory to 2 GB and large temporary disk to 8 GiB; retained two threads, serialized staging, caller cancellation, context-output bounds, bounded cursor state, bounded physical-record/header reads, and the read-only registered-source boundary. Focused analytics tests and TypeScript validation pass.

## AIF-040 - Preserve approved development fixture policy across sessions

- **Reference:** Operator correction during MPS EKS dev seed-data review, 2026-09-10.
- **Feedback:** Exact development identities, claims, password hashes, and salts are intentional test fixtures when target-gated to MPS dev/staging. Do not repeatedly apply production data-minimization guidance after this policy is settled.
- **Finding:** The active global comparable-environment rule already rejects importing controls from unrelated environments, and the current task context explicitly identified the data as dev/test. The assistant nevertheless raised a generic repository-access concern without evidence that it violated an applicable project policy. This is an adherence failure. Session clearing also makes a project decision unreliable when it remains only in chat context.
- **Recommendation:** Record the approved fixture policy at monorepo scope: exact dev/staging test identities and authentication material may be retained when required for functional parity and constrained by existing target gates; assess them for deterministic behavior and target isolation, not production data-minimization. This instruction change requires operator approval.
- **Related:** AIF-031, AIF-037, APR-025.
- **Status:** Feedback recorded; repository instruction change awaiting operator approval.

## AIF-039 - Preserve operator intent in changelogs and commit messages

- **Reference:** Operator request to align gcc_automation changelog guidance with other local systems, 2026-09-10.
- **Evidence:** Dotfiles `AGENTS.md` requires material changelog entries to explain what changed, why, constraints, and preserved behavior. GitLab Helm guidance also requires date, author, and relevant paths/systems. Dotfiles commit guidance requires human-style natural grammar and logical atomic grouping. The literal `C:\work` path does not exist; comparable repositories under `C:\Projects` were reviewed instead.
- **Decision:** Align repository `AGENTS.md` and the changelog skill around operator intent, outcome, reason, constraints, preserved behavior, relevant scope, and validation. Require commit subjects/bodies to express the same intent and outcome rather than merely naming edited files.
- **Related:** AIF-038 (approval records), AIF-032 (observable concise instructions).
- **Status:** Approved for implementation; future adherence remains unverified.

## AIF-038 - Record sensitive-artifact tracking approvals in the changelog

- **Reference:** Operator requirement during the M365 recovery-state audit, 2026-09-10.
- **Feedback:** Any approval to track normally prohibited tenant exports or sensitive artifacts must be appended to repository `CHANGELOG.md` with who approved, what was approved, where it may be tracked, and when approval was given. The repository should define AGENTS/Claude guidance and a reusable changelog-maintenance skill.
- **Decision:** Create `CHANGELOG.md`, add repository instructions and `.claude/commands/changelog.md`, and make the required Claude files trackable. Approval records must identify exact artifacts and must not contain the sensitive payload itself.
- **Related:** AIF-037 (local processing versus tracking), AIF-036 (recovery intent).
- **Status:** Approved for implementation; future adherence remains unverified.

## AIF-037 - Separate local sensitive-data processing from repository tracking

- **Reference:** Operator clarification during the M365 recovery-state audit, 2026-09-10.
- **Feedback:** Email exports, Teams messages, SharePoint files, eDiscovery content, and audit/sign-in logs may be downloaded and processed locally. They must remain ignored and must not be committed unless the operator explicitly approves and instructs tracking the specific material. CUI, sensitive evidence, credentials, and unrelated PII remain prohibited from normal tracked configuration; user and group identity data needed to configure M365 is allowed.
- **Decision:** Add the explicit local-processing-versus-tracking boundary to repository `AGENTS.md` and `.claude/CLAUDE.md` at operator request.
- **Related:** AIF-032 (observable triggers), AIF-036 (complete recovery intent).
- **Status:** Approved for implementation; future adherence remains unverified.

## AIF-036 - Keep Teams recovery intent synchronized after live changes

- **Reference:** Operator correction after an approved live Team membership removal was not reflected in tracked recovery configuration, 2026-09-10.
- **Observed:** The tenant change succeeded, but `TeamsGroups.json` covered only one Team per tenant. General live-wins and rebuild guidance did not explicitly require exporting all Teams and refreshing tracked owners/members after live changes. The Teams runbook allowed untracked live members to remain indefinitely and described the earlier tracked-only export workflow.
- **Decision:** At repository scope, require a full Teams export after live Team, owner, or member changes; reconcile `Config/Tenants/<tenant>/Teams/TeamsGroups.json` to reviewed live state; and verify `-Plan` reports no changes. Update the Teams runbook to distinguish additive enforcement from complete recovery capture. Claude continues to inherit `AGENTS.md` through `.claude/CLAUDE.md`.
- **Related:** AIF-031 (comparable repository baseline), AIF-032 (observable triggers and stopping conditions).
- **Status:** Approved for implementation and repository commit/push; effectiveness in future work remains unverified.

## AIF-035 - Carry forward concrete extension lessons for the active profile

- **Reference:** Operator approval to add the Pi extension skill, review prompt caching, and commit task-owned changes, 2026-09-10.
- **Feedback:** Define the active profile from the running Pi configuration, not cwd. Name the callbacks, resources, and events a runtime rule applies to instead of using ambiguous shorthand. Start with clearly applicable lessons; consult historical material when a concrete issue supplies context, rather than making other profiles part of the new skill's standing instructions.
- **Related:** AIF-031's comparable-feature baseline and AIF-032's concise, observable instructions.
- **Decision:** Added `pi-extension/SKILL.md` with active-profile ownership, installed API sources, four concrete runtime lessons, and prompt-caching guidance. No historical contract tree, runtime machinery, or telemetry was imported. Caching review reports findings separately without authorizing fixes.
- **Status:** Native skill discovery and a synthetic prompt/deferred-tool check passed. Code inspection and the synthetic check establish an image-tool prompt-prefix change. Existing Codex observations show cache reuse but cannot attribute misses to that change. No live provider comparison or model-adherence test.

## AIF-034 - Let reviewers inspect Git state and run checks

- **Reference:** Operator agreement after a reviewer could not inspect an uncommitted Bedrock fix, 2026-09-10.
- **Feedback:** Reviewing source files without Git status, working-tree diffs, or checks is too restrictive for ordinary repository review.
- **Decision:** Add guarded `bash` to the general reviewer role, matching the validator's shell access while retaining explicit no-edit/no-autofix instructions. Document that this is a policy boundary, not an OS sandbox.
- **Related:** APR-023, APR-020, AIF-027.
- **Status:** Implemented with a bundled-role definition assertion; future adherence remains unverified.

## AIF-033 - Work directly unless delegation has a named purpose

- **Reference:** Operator correction after Strategist was used for a simple repository lookup, 2026-09-10.
- **Feedback:** Subagents and Strategist should support larger work that clearly benefits from delegation, not routine requests. Keep the threshold concise and objective, and avoid duplicating executable guidance across prompts.
- **Decision:** Limit delegation to bounded implementation, parallel investigation, specialist research, or requested independent review; otherwise work directly. Keep the executable rule in shared subagent guidance, summarize it in documentation, and remove the duplicate from `/do-it`. Default Strategist to Sol low, reserve Astra low for named complexity, and reject Luna effort below high for that role.
- **Related:** AIF-004, AIF-027, APR-020, APR-022.
- **Status:** Implemented with focused tests; future adherence remains unverified.

## AIF-032 - Consolidate instructions around observable decisions and stopping conditions

- **Reference:** Operator approval to consolidate global guidance and capture instruction-writing preferences in `agent-process`, 2026-09-10.
- **Feedback:** Prefer direct, objective, token-efficient instructions over abstract labels and repeated formulations. Use workflow, not the narrower operator workflow. Ask about unresolved choices affecting behavior, scope, safeguards, or workflow, not equivalent implementation details or settled decisions. Simplicity and flexibility must not remove necessary work or verification.
- **Comparison:** Builds on AIF-031's comparable-feature baseline, AIF-001's plain language, AIF-004's narrow changes, and AIF-003/APR-002's bounded verification. Objective evidence should guide judgment, not create deterministic routing, evidence paperwork, or approval ceremony. Source evidence can establish a defect without a reproduced failure; passing checks does not erase known task-related defects.
- **Decision:** Consolidated investigation and verification bullets in `pi/profiles/default/AGENTS.md`, retained uncertainty disclosure, scope, and preservation rules, and limited clarification to choices unresolved by the request and repository evidence. Refined `agent-process/SKILL.md` to consolidate overlaps, name actions/triggers/evidence/stopping conditions, and preserve scope and clarification boundaries when shortening wording. Planning skill and agent plans remain unchanged.
- **Status:** Instruction edits implemented. Scoped wording/diff review and `git diff --check` passed; no runtime changes or model-adherence test. Effectiveness remains unverified.

## AIF-031 - Use comparable repository features as the engineering baseline

- **Reference:** Operator approval after independent Fable and Opus wording consultations, 2026-09-10.
- **Feedback:** Existing features demonstrate the expected solutions and safeguard level, not just reusable code. Compare purpose and operating environment: deployed authentication controls do not automatically belong in local developer tooling. Generic best practices or hypothetical concerns alone do not justify new gates. Ask with a recommendation when the applicable pattern is unclear or alternatives differ in behavior, scope, safeguards, or operator workflow; choose equivalent implementation details directly.
- **Comparison:** Refines AIF-004's flexible, narrow workflows and AIF-029B (direct evidence and recommended consultation), with the overbuilding examples in APR-002/APR-007. Repository patterns are a baseline, not infallible: the request or concrete code/environment evidence may establish a need to depart.
- **Decision:** Added the approved paragraph under Proportionality in `pi/profiles/default/AGENTS.md`. Preserved existing scope, verification, and preservation rules. Planning-skill and agent-plan changes remain outside this approval; no runtime gates or required reports were added.
- **Status:** Implemented as instruction text. Scoped diff review and `git diff --check` passed; future model adherence remains unverified.

## AIF-030 - Match analytics work to the question and teach complete traversal

- **Reference:** Default-profile analytics planning discussion, 2026-09-10.
- **Feedback:** Expensive analysis is acceptable for big questions, but small questions should answer quickly without parsing everything. Poor tool usage also points to inadequate tool instructions, not just model error.
- **Decisions:** Plan default-only changes with both-profile reading; permit a small on-demand metadata cache if measurements justify it and temporary disk use for large SQL. No background indexing or persistent message copies. The added representative question is finding tool-call failures from the last week.
- **Related:** AIF-013, AIF-004, APR-021. Current pagination and message-role fields already exist; resumable record scanning and cheap search execution are the missing capabilities.
- **Fallback clarification:** Operator explicitly permits existing `find`, `rg`, `jq`, `awk`, and `sort` for read-only history investigation when analytics cannot retrieve what is needed. Prefer the tool without making it exclusive; preserve scope, source coordinates, parsed field semantics and honest coverage.
- **Status:** Runtime changes and validation are recorded in repository-root-relative `.specs/archive/query-driven-log-analytics/plan.md`. The approved fallback guidance remains in the existing default `pi-log-analytics` skill/reference rather than a duplicate skill.

## AIF-029A - Tools are not slash-command-only by default

- **Reference:** Operator correction after an explicitly requested commit was rejected because `commit_run` lacked a delivered `/commit` invocation, 2026-09-10.
- **Feedback:** Tools are shared operator/model capabilities. Naming or describing an action should be sufficient for the model to use its tool; slash commands must not add ceremony by acting as mandatory capability gates unless the operator has discussed and approved a concrete reason.
- **Decision:** Permit direct `commit_run` calls with commit-only defaults. Retain invocation binding only for the distinct `/commit push` authority. Audit the remaining default-profile slash commands for comparable tool gates and document this design rule for future prompt-backed commands.
- **Audit:** `/bro` has no tool. Other profile slash commands are direct runtime/UI handlers or native prompt templates and contain no equivalent delivered-invocation tool gate. `commit_run` was the only affected tool.
- **Related:** AIF-004, AIF-024, AIF-028, APR-007.
- **Status:** Implemented. All 50 focused offline command/web-tool tests and the default-profile typecheck pass; direct runtime use requires reload and remains unverified.

## AIF-029B - Use direct evidence and recommended consultation without approval gates

- **Reference:** Operator clarification during Strategist and Steward planning, 2026-09-10.
- **Feedback:** Strategist advises before subagent assignments; a separate Steward checks whether reviewer/validator findings warrant more work after implementation. Both are the recommended path when applicable, not exceptional optional tools or mandatory approvals. Keep them simple, flexible, and low ceremony. Prefer direct tool/result triggers and observable facts over abstract benefits or subjective labels; the operator reports that ambiguity lets agents expand scope.
- **Comparison:** AIF-004 already preserves judgment and narrow instruction changes; AIF-003/APR-002 record verification expansion; AIF-023 separates settled execution from planning; AIF-027/APR-020 concern assignment size. This feedback sharpens those boundaries rather than authorizing scoring, deterministic routing, or another review gate. Ambiguity as a general cause remains a hypothesis, not a measured result.
- **Decision:** Authorized plan changes only: revise `.specs/strategist-delegation-guidance/plan.md` for normal pre-`subagent` consultation with advice reuse and evidence-based selection/retry wording; create `.specs/steward-review-guidance/plan.md` for post-finding advice before follow-up fixes. Steward compares the request/corrections and agreed checks with findings and proposed fixes, without adding requirements, audits, or required report formats.
- **Instruction follow-up:** Discuss encoding direct, observable triggers and evidence-versus-judgment wording in the planning skill and possibly default-profile global `AGENTS.md`. Those instruction changes were not authorized at this planning stage. AIF-031 records the later approved global comparable-feature rule; planning-skill changes remain proposals. Objective evidence does not mean eliminating implementation judgment or asking the operator about every technical choice.
- **Status:** Plan revision and new plan written at this stage; implementation and live effectiveness were unverified. This entry did not change an active role, skill policy, or global instruction.

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
- **Status:** Superseded by the implemented AIF-061 and AIF-062 assignment-sizing and dependency guidance.

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
- **Related:** AIF-004, AIF-015B (risk proportionality), APR-007, APR-016.
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
- **Status:** Superseded in part by AIF-070, which records corrected focus handling and validated 1/4/5/8/9 geometry. Attached-client acceptance remains unverified.

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

## AIF-015A — Do not substitute promises for authorized execution

- **Reference:** Operator feedback after the default-subagents plan was twice followed by a response promising continuation while no further implementation was performed.
- **Feedback:** Use the concise principle “show, don't tell.” Brief explanations of the next action and its reason are useful for monitoring; the problem is ending the turn after promising actionable work instead of doing it.
- **Finding:** Existing planning and proportionality guidance already says to continue actionable authorized work, but APR-006 recurred immediately after correction. The failure mode is specifically substituting future-tense intent for available tool actions, not giving progress context.
- **Recommendation:** Add one short rule to the default profile's global `AGENTS.md`: “Show, don't tell: brief intent updates are fine, but do not end a turn by promising actionable work. Do it or state the concrete blocker.”
- **Related:** APR-001 and APR-006 (premature handoffs), AIF-003 (bounded completion), AIF-014 (authorized plan execution).
- **Status:** Implemented in `pi/profiles/default/AGENTS.md`; future adherence remains unverified.

## AIF-015B - Damage Control prevents unrecoverable harm, not suspicious-looking activity

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
- **Follow-up (2026-09-16, session 01a0ab78-882f-75e0-86b8-c2795f778c5f):** Operator could not follow a deployment proposal expressed as abstract ownership categories. Explain the actual files, a duplicated setting, what currently happens, and the proposed before/after before asking for agreement. Apply existing plain-language guidance; no new instruction proposed. Further feedback in the same session rejected cascading subquestions during investigation scoping: determine repository-answerable facts directly and consolidate genuinely unresolved decisions instead of asking the operator to supply the investigation's intermediate results.
- **Follow-up (2026-09-18):** When the operator supplies exact concise policy wording, use it without expanding the same rule into redundant prohibitions. Apply existing plain-language guidance; no new instruction proposed.
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
