# Agent process failure log

## APR-081 - Helper push mode was mistaken for the operator's authorization boundary

- **Reference:** gcc_automation commit-and-push closeout, 2026-09-30; AIF-100.
- **Observed:** Despite an explicit request to commit and push, the orchestrator called commit_run directly, received a commit-only result, then told the operator a slash command was required rather than completing the authorized push using ordinary Git.
- **Finding:** The helper's tool description says only `/commit push` grants push permission and prohibits subsequent Git work. Its documentation distinguishes this invocation-bound option from normal shell permissions. The assistant applied the tool-specific mode as a global authorization rule.
- **Remediation:** Rechecked source instructions and actual outgoing state, then completed a normal non-force push of the single requested commit. Proposed a narrow tool-description/documentation correction instead of adding a global rule or changing helper runtime authority.
- **Follow-up:** Operator rejected automatic routing of ordinary commit requests through the helper and approved removing the main-agent tool. `/commit` will call the private runner directly, while ordinary Git requests remain ordinary Bash work.
- **Status:** Resolved in default-profile source: private runner is called directly by `/commit` and existing shortcuts, with no main-agent commit tool. Busy shortcuts wait instead of refusing; Escape/shutdown cancellation and listener cleanup are covered. 47 focused offline tests, typecheck, and diff check passed. Reload/live UI validation remains outstanding; no live Git mutation smoke was run.

## APR-080 - Transient GitLab API files were written into the worktree root

- **Reference:** EISA all-pipeline Podman pipeline monitoring, 2026-09-29; AIF-098.
- **Observed:** Repeated status checks used `glab api ... > jobs<id>.json`, parsed the file, and removed it. A command interruption or parse failure could leave the untracked response in the worktree root and activate unrelated-work preservation or damage-control handling.
- **Finding:** This followed an unsuccessful attempt to use `/tmp`, where Bash and Windows Python resolved the path differently. The recovery chose a repository-root temporary file rather than direct streaming or the repository's ignored `.tmp/` directory.
- **Remediation:** Stop creating `jobs*.json` in the worktree root. Pipe API JSON directly to Python, or use a verified ignored/system temporary path with reliable cleanup.
- **Recurrence:** Pipeline #8678 monitoring later on 2026-09-29 repeated the same pattern with `.tmp-pipeline-8678.json`, `.tmp-job-114778.json`, and `.tmp-job-114778.log` in the repository root despite the existing ignored `.tmp/` directory.
- **Status:** Recurrence recorded and root artifacts removed. The operator approved a profile-wide `AGENTS.md` instruction requiring direct streaming or verified ignored/system temporary locations and prohibiting transient artifacts in the worktree root.

## APR-079 - Brave attach support did not make ordinary Windows launch surfaces CDP-capable

- **Reference:** Operator report after recurring `Brave CDP endpoint did not become available`, 2026-09-29.
- **Observed:** The prior browser work added Pi-owned launch and explicit attach support, but did not configure all Windows Brave launch surfaces. Live inspection found the Start Menu shortcut with no arguments, several True Launch Bar profile shortcuts carrying only `--profile-directory`, and only one separate Quick Launch `EagleTG.lnk` carrying the required loopback CDP, user-data-root, and profile arguments. The running Brave root also lacked those arguments.
- **Finding:** The claimed or understood outcome, that Brave would always start with CDP flags from desktop, Start Menu, or True Launch Bar, was not implemented. Once an unflagged Brave root owns the normal user-data directory, a later flagged launch is handed off to that existing process and cannot enable CDP, producing the timeout.
- **Remediation:** Updated all eight discovered per-user Brave shortcuts across Desktop, Start Menu, and True Launch Bar/Quick Launch with the explicit profile, loopback address, port 9222, and normal user-data-root flags. Updated the active Brave HTTP/HTTPS ProgID command so a cold launch from an external link uses the same default-profile flags. Machine-local backups were retained under `%LOCALAPPDATA%\dotfiles\brave-launch-backups\20260929-103730`.
- **Status:** Resolved locally. A cold launch through the Start Menu produced a verified attachable endpoint, and `browser_page list` succeeded. Shortcut and protocol-handler inspection found no missing required flags among the configured launch surfaces.

## APR-078 - Corrected Claude launch test was acknowledged but not executed

- **Reference:** Herdr-to-Claude `ccyl` feasibility test, 2026-09-29.
- **Observed:** The orchestrator bypassed `ccyl`, tested direct Claude startup under inherited Bedrock routing, and then ended after acknowledging the mistake instead of immediately running the corrected subscription-path test. The operator later reported hours without useful progress.
- **Finding:** The requested launcher was not inspected before testing, and the correction was prose-only despite the corrected test being immediately available.
- **Remediation:** Inspect and invoke the exact requested launcher in launcher-specific tests. After discovering test-invalidating setup, rerun the corrected test in the same turn when possible rather than ending with an acknowledgment.
- **Status:** Corrected test completed: exact `ccyl --model claude-opus-5-5` launched Claude Pro with Opus 5.5 and bypass permissions, accepted a Herdr prompt, returned the expected response, and was cleaned up. The shorthand `--model opus` remains unsuitable because the global Claude setting maps it to a Bedrock model ID.

## APR-077 - Partial subagent notification was misreported as active work

- **Reference:** ICP dev pipeline monitoring, 2026-09-28.
- **Observed:** A validator delivered a partial notification saying it would inspect GitLab access, but its recorded assignment had already settled. The orchestrator repeatedly told the operator the investigation was still running and described future integration activity as though agents were actively progressing.
- **Impact:** Monitoring appeared active when no subagent work was occurring, obscuring the actual stopped pipeline state.
- **Finding:** The orchestrator inferred liveness from narrative text instead of checking the subagent's status fields. The notification explicitly reported `partial` and later inspection showed `status: settled` and `processState: exited`.
- **Remediation:** Treat partial notifications as delivered results, not proof of continued execution. Before claiming a subagent is running, inspect current status; if settled, either issue a concrete follow-up or report that work stopped. Do not describe queued future steps as current activity.
- **Status:** Recorded after operator correction; remaining validator was confirmed settled.

## APR-076 - Product choices offered before verifying available behavior

- **Reference:** Dashboard-restoration planning discussion, 2026-09-26.
- **Observed:** The orchestrator repeatedly qualified authentication and permission options with "if supported" and moved discoverable product facts into a future feasibility task. The operator could not make an informed choice from the offered alternatives.
- **Related:** AIF-092 and APR-072 (investigate before presenting decisions), APR-073 (perform available investigation).
- **Finding:** Tagged login, user-store, authorization code, and versioned configuration documentation were available without deploying anything. Conflicting research summaries were not a reason to hand factual uncertainty to the operator.
- **Remediation:** Inspected those sources directly. Separate verified product mechanisms from the remaining account-sharing and privilege tradeoffs; keep runtime validation distinct from establishing what the code implements.
- **Status:** Evidence obtained; no instruction changes proposed.

## APR-075 - Pi shortcut recommendation ignored the outer terminal keymap

- **Reference:** Pi-native `/new-instance` shortcut, 2026-09-25.
- **Observed:** The orchestrator recommended and implemented `Ctrl+Shift+N` because Pi listed it as unassigned, but Windows Terminal intercepted that chord and opened a plain terminal in the home directory. Pi never received the shortcut.
- **Finding:** Checking only Pi's keymap was insufficient in the active Herdr/Windows Terminal stack. Shortcut selection must account for bindings owned by outer terminal layers before claiming an in-app chord is available.
- **Remediation:** Replaced the binding with `Ctrl+Alt+N`, updated its focused test, and reran 22 tests plus typecheck successfully. Runtime behavior still requires operator verification after `/reload`.
- **Status:** Corrected in source; awaiting live verification.

## APR-074 - Server config reload was mistaken for attached-client keymap reload

- **Reference:** Herdr `prefix+n` custom Pi-tab binding, 2026-09-25.
- **Observed:** After editing Herdr keybindings, the orchestrator ran `herdr server reload-config` and claimed the new client shortcut was active. The operator's lowercase `prefix+n` still used the old client keymap, while uppercase `prefix+shift+n` invoked the built-in new-workspace action and did not start Pi.
- **Finding:** The CLI command reloads server-owned custom commands but does not refresh an already attached client's local keymap. Herdr's in-app Reload config action reloads both. The implementation had not been exercised through an attached client before the activation claim.
- **Remediation:** Use the in-app Reload config action (`prefix+shift+r` under the old keymap) after local binding changes, or restart the client. Distinguish server command availability from attached-client keymap activation.
- **Follow-up:** After the client reload, lowercase `prefix+n` still did nothing because the Windows detached command was not a reliable `cmd.exe` invocation. Replaced the inline command with a PowerShell helper, validated its syntax, and invoked it through the same Herdr environment contract; Herdr returned a focused Pi plugin tab in the current workspace.
- **Status:** Corrected and live-tested; the attached client still needs its local keymap reloaded once after the original binding addition.

## APR-073 - Asked permission to investigate an investigation request

- **Reference:** Cross-provider Pi context investigation, 2026-09-25.
- **Observed:** After the operator reported that Bedrock did not appear to receive prior session context, the orchestrator described possible causes and offered to inspect the session "if you want" instead of performing the implied read-only investigation.
- **Impact:** The operator had to restate that the question was a request to investigate.
- **Finding:** Existing investigation and intent guidance already required inspecting available evidence. This was an adherence failure, not a missing authorization rule.
- **Status:** Recorded; investigation resumed directly.

## APR-072 - Documentation-review findings were presented without investigation or usable detail

- **Reference:** MPS Markdown-review discussion, 2026-09-24; related AIF-092.
- **Observed:** The orchestrator converted raw council uncertainties into serial operator questions, revisited an explicitly skipped item, treated a current failing test first as documentation trivia and then as proof that reconstructed production-derived UserSearch source should change, and described six proposed fixes without initially naming their code, data, or validation surfaces. Operator corrections supplied the missing provenance and forced the fixture/configuration distinction.
- **Impact:** The operator had to recover context the review should have established, prevent an unsafe compatibility change, and repeatedly request concrete explanations. The discussion created churn instead of reducing the decision set.
- **Remediation:** Validate each remaining candidate before presenting it. For the active UserSearch finding, preserve the production-compatible implementation while tracing actual EISA creation, legacy `uid` persistence, current IS 7.2 mappings, and synthetic fixture fidelity. Record durable project evidence at the existing EISA/MPS investigation owner and process feedback in AIF-092.
- **Status:** Evidence recorded; remaining review candidates still require evidence-first triage.

## APR-070 - Quiet commit attempted to stage an ignored archive path

- **Reference:** Operator correction during CAC setup workflow, 2026-09-24.
- **Observed:** `commit_run` explicitly staged an ignored `.specs` archive path and Git rejected it. The orchestrator repeatedly inferred its source without evidence. The private agent transcript was not retained, so the path-selection cause remains unresolved.
- **Related:** AIF-009 (repository inventory and commit ordering).
- **Remediation:** With operator approval, replaced staging guidance in the commit-only prompt: use current status candidates, not file references; refresh before subsequent groups; require explicit authorization to force-add ignored files. No general agent rule or runtime gate added.
- **Status:** Prompt revised; effectiveness against a live recurrence is unverified.

## APR-069 - Retained completed subagents and delayed recovery after partial result

- **Reference:** Default session `01a0d212-1862-72be-825b-4865b83bbd33`, 2026-09-24; validator child session `99e5a8d3-4e52-4508-b3a8-d55ae1f3a8c2`.
- **Observed:** The coordinator explicitly retained developers for speculative future work. After correction, it finished idle Clara and Iris. Later, validator emitted a partial at 15:05:51Z saying recovery checks were being run, but had actually settled. The coordinator reported checks still running and did not resume until the operator asked “so what is going on here?” around 15:18. Inspection confirmed the work was settled; an explicit follow-up completed checks, final validation completed, and the worker closed promptly.
- **Finding:** Caller-side retention and outcome handling were at fault. The record does not establish a backend defect.
- **Related:** AIF-067 (foreground Strategist outcome handling); APR-017 (integrating delivered outcomes rather than duplicating or overlooking them); AIF-087 (distinguishing runtime ownership and pane state).
- **Remediation:** Retain a child only for a concrete expected follow-up, not speculative later work. Treat a delivered partial as settled unless current status proves it is still active; continue with an explicit concrete follow-up when needed.
- **Status:** Recovery completed. Log-only feedback; no instruction or runtime change authorized.

## APR-068 - Requested cache default left pending reconfirmation

- **Reference:** Default-profile Mantle accounting discussion, 2026-09-24, session `01a0d39b-3fb2-73a0-825d-761f5467d6d4`.
- **Observed:** The operator specified five-minute cache writes while approving the accounting fix. The orchestrator fixed accounting but asked for confirmation of the default and then reported it as pending. The operator had to repeat the requested default.
- **Finding:** The orchestrator treated the requested behavior as an unresolved proposal. Existing scope and intent guidance applied; no additional approval rule was needed.
- **Related:** APR-064 (corrections did not carry through to the next action); APR-066 (confusing requested work with proposals).
- **Remediation:** Changed both PowerShell and zsh defaults to `short`, preserving explicit overrides. Syntax and default/override checks passed. Existing Pi processes must be relaunched with the updated environment. No instruction changes.

## APR-071 - Durable-job assignment exceeded one independently provable responsibility

- **Reference:** Default Iris session `01a0d4ec-c9be-723e-96b7-d30060f9c741`, coordinator lineage rooted at `01a0d4e4-c99a-7500-aada-813b6db55846`, fixed interval `[2026-09-24T19:32:40Z,2026-09-24T20:49:16Z)`; AIF-091 and TCA-012.
- **Observed:** Strategist and coordinator treated “B” as one named task even though it joined database migration and transaction design, recovery/CAS state machines, pipeline fencing, delivery semantics, configuration, observability contracts, lifecycle integration, and all focused tests. Coordinator sent five additional messages during Iris's first 7 minutes 23 seconds, including shared-worktree ownership traffic unrelated to B's disjoint paths and contract details that were not frozen before launch. Iris then had to design, implement, integrate, and repeatedly validate the whole dependency chain in one session.
- **Impact:** The worker made continuous progress and recovered every observed local issue, so the long model phase is not inactivity or a failed handoff. The broad critical path nevertheless concentrated 93,914 recorded output tokens, 111 tool calls, six intermediate typecheck/test failure outcomes, and four caller tool-use mistakes in one child. By the cutoff the contract and implementation were substantially complete; the final post-edit validation landed just after it.
- **Finding:** This is a coordinator/Strategist subagent-use failure in task sizing. A smaller-model mismatch remains a hypothesis, not a proved cause, because no controlled stronger-model comparison exists. The successful post-cutoff checks also rule out describing the child as simply incapable or failed.
- **Remediation:** For comparable work, freeze interfaces first and sequence separate persistence/migration/atomicity, pipeline fencing/events, job recovery/CAS, and delivery/lifecycle assignments. Keep the terminal-plus-outbox transaction with the persistence writer; transfer shared-file ownership explicitly between sequential assignments. Route coupled transaction/state-machine work to Sol high and use Luna only for bounded leaves after dependencies are fixed, pending comparative evidence.
- **Post-cutoff outcome:** At 20:49:47Z typecheck, 56 focused tests, and diff checks passed. At 20:50Z the parent froze the candidate contract and requested final evidence/ownership release with no new implementation scope.
- **Status:** Log-only process record. Active B was not cancelled, reassigned, or modified by this review.
