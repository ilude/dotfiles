# Agent process failure log

## APR-git-ignore-approval - Ignored planning artifact reached an MR

- **Reference:** EISA release-publishing MR discussion, 2026-10-30; AIF-git-ignore-approval, AIF-044 and APR-088.
- **Observed:** Squashing local dev changes into a new MR included an already tracked archived plan under `.specs/`, despite that directory matching `.git/info/exclude`. Exclusions do not remove indexed files. The initial tracking mechanism was not established; this does not prove `/commit` force-added it.
- **Finding:** `/commit` uses normal `git add -A` and restricts routine model mutation, but its reviewer lacked an explicit rule forbidding ignore overrides without specific approval. Planning/archival instructions calling for a commit must not be interpreted as an ignore exception.
- **Correction:** At the user's request, added the no-bypass approval rule to default-profile preservation guidance and the independently loaded commit prompt. Staged additions require `check-ignore --no-index`; matching new candidates use the existing informed ignore decision or stay excluded. No new runtime gate or automatic untracking.
- **Status:** Instruction changes are local and not committed/pushed. Existing EISA MR history is unchanged pending separate approval; future model adherence is not established.

## APR-mr-description-task-log - Review summaries accumulated investigation history

- **Reference:** Operator correction after merge-request description updates, 2026-10-29.
- **Observed:** Repeated updates appended debugging history, superseded failures, test implementation details, and long lists of unchanged behavior. A new bullet was inserted before the existing introduction without restructuring the description. Live readback confirmed the clutter after the operator challenged whether the text was needed.
- **Finding:** The descriptions were maintained as task logs rather than written for reviewers. Existing concise-communication and documentation-placement guidance already covers the distinction; another instruction paraphrase is not the remedy.
- **Correction:** Rewrote both affected descriptions around actual changes, one necessary configuration action, current validation, and the issue link. Removed investigation narratives and unchanged-scope boilerplate.
- **Status:** Live descriptions updated and read back. No code or instruction-policy changes.

## APR-ccyl-herdr-handoff - Claude review startup and answer recovery friction

- **Reference:** Default sessions `01a18563-1cec-7622-afea-ff7d200ef5b5` (workflow discussion), `01a184f6-9f94-72cf-971f-532853874904` (records 155–183), and `01a17d70-fc1d-71de-a68f-7b83a6bdb034` (records 3132–3148), reviewed 2026-10-29 at operator request.
- **Observed:** One Opus/high review completed, but the operator reported a Herdr failure and requested recovery; Pi recovered the answer from the exact Claude project transcript. Another launch waited for an Opus output match before discovering a workspace-trust dialog, then asked the operator rather than answering it. The earlier local launch also displayed a non-blocking missing Herdr startup hook pointing at another Windows account.
- **Finding:** Existing Herdr guidance already covers exact pane targeting, ccyl routing, fresh reads, ambiguous submission, and asking before answering blocked dialogs. Missing convenience guidance concerns carrying task context to an independent Claude session and recovering an already-completed answer from its native transcript. Repeated launcher/help inspection suggests a compact ordered recipe could reduce discovery overhead; no claim that wording caused the Herdr failure is established. Shared Claude settings contain duplicate account-specific SessionStart hook paths, a configuration defect rather than a prompting defect.
- **Proposal:** Consolidate the ccyl procedure in the existing Herdr skill, include explicit model/effort and a self-contained assignment example, inspect startup dialogs before output waits, and document exact-session transcript recovery. Keep trust decisions explicit unless the operator approves a different policy. Related AIF-086 rejects an unnecessary messaging bridge and extra gates.
- **Status:** Operator approved implementation. Consolidated the existing Herdr skill's ccyl sequence, model/effort example, self-contained assignment, startup-dialog handling, and exact-session transcript recovery; linked it from the local Herdr docs. Replaced duplicate account-specific Claude SessionStart entries with one quoted `$HOME`-relative command, preserving matcher and timeout. Fresh local ccyl/Opus-high startup through Herdr logged the actual hook command exiting with status 0, displayed no hook warning, and answered the verification prompt. Workspace-trust behavior and generated hook script are unchanged; other machines were not tested. Default-profile keyword discovery completed, followed by targeted context review of these sessions; not an exhaustive semantic review of all history or legacy. Future instruction effectiveness remains unverified.

## APR-commit-unfinished-success - Uncommitted files accompanied a successful publication label

- **Reference:** Operator's `/commit push` output and explicit correction in this session, 2026-10-28; related APR-commit-parent-gitlink and APR-commit-empty-index.
- **Observed:** The command reported no new commits, listed staged changes, and ended with `Pushed`. Local and remote HEAD matched the old commit; the requested file changes remained uncommitted. The private model's exact stopping reason is not established.
- **Cause:** Runtime completion enforcement covered omitted child gitlinks, but not ordinary files. Publication could push the unchanged HEAD while pending eligible changes remained, and a successful Git push alone selected the success label. Existing reviewer instructions already require committing every eligible group, so another instruction reminder is not the remedy.
- **Correction:** Replace model-owned Git execution with a structured whole-file plan. The AI reviews, groups files, writes subjects, and names exclusions; code stages, validates full path coverage, executes commits, verifies HEAD and committed paths, and publishes only after successful completion. Return exact validation errors for the initial proposal and two corrections, then stop without committing an invalid plan. Missing submission with changes fails; a clean no-op is allowed. Normal review has no mutation shell or publication tool; mutation `bash` is available only for established publication conflicts. Reject unfinished eligible work before publication and during result collection; exclusions must remain unstaged. Preserve actual earlier commits and push outcomes, working contents, retained index-only contents, and existing model selection and response retries.
- **Status:** The plan module passed 33 focused unit/real-Git tests covering validation, exclusions, grouping, unborn repositories, gitlinks, hook failure, and hook-generated unfinished work. Default-profile typecheck passed after the runner rewire. The final agreed runs passed 75 plan/retry/reviewer tests and 43 staging tests (118 total), including the index-only gitlink preservation regression; final typecheck passed. Live Luna planning and attached UI behavior remain unverified. Existing Pi processes need `/reload` to load the remedy. This addresses the evidenced failure path, not a guarantee against every possible future failure.

## APR-herdr-plan-false-authorization-blocker - Unfinished technical planning presented as missing permission

- **Reference:** Default session `01a184c9-b4ff-7507-af87-7d792d69fca5`, operator correction after sidebar-plan creation; related APR-investigation-reconfirmation and APR-alert-plan-explanation.
- **Observed:** After being directed to plan the required layout change, the assistant repeatedly requested authorization to include the necessary Herdr changes and described that permission as the reason the plan was not ready. Its explanation did not plainly identify the unfinished technical design.
- **Finding:** Planning may specify necessary cross-repository changes without authorizing immediate execution. Running the selected plan authorizes its specified implementation under the normal execution contract. The actual unfinished work was specifying the Herdr workspace-parent interface, owning source/build route, and bounded producer tasks; this was agent-owned planning, not an established missing operator decision.
- **Correction:** Retract the redundant scope-approval demand. Distinguish unfinished technical planning from an external blocker, and do not imply that running the plan requires another implementation approval. Retain only genuinely separate publication/deployment boundaries.
- **Status:** Revised the plan to ready after tracing the existing `workspace report-metadata` API through nonexpiring tokens into client snapshots. That existing transport removes the need for a new parent API or server protocol; concrete tasks now extend the native Herdr client hierarchy/rendering and publish Pi's parent metadata. Removed false scope-approval blockers and preserved the no-agent-worktree requirement. No implementation, build, commit, publication, or instruction-policy change performed.

## APR-subagent-partial-mistaken-for-running - Settled partial outcomes read as live progress

- **Reference:** Default session `01a184c9-b4ff-7507-af87-7d792d69fca5`, operator correction during layout research; related APR-speculative-retention-recurrence.
- **Observed:** Three research/investigation children returned partial outcomes saying work was underway. The orchestrator treated these terminal results as live progress and repeatedly said research was still running. Later inspection showed all three settled, with exited processes and closed panes. Reopened follow-ups returned actual findings.
- **Evidence:** `lib/subagents/rpc.ts` settles a partial report at turn completion and performs ordinary cleanup. `lib/subagents/status.ts` renders the terminal outcome as `partial`, but the ordinary outcome notification does not explicitly state settled/exited or that continuation requires a follow-up. The inspect records exposed the correct lifecycle state; no stale runtime running state was established.
- **Proposed correction:** Make terminal partial/blocked outcome notifications explicit about assignment settlement and observed resource state, distinguish them from nonterminal progress and parent questions, and make the need for explicit follow-up clear when applicable. Do not infer liveness from result prose or add polling/automatic retries as a workaround.
- **Status:** Incident recorded and bounded code path inspected. Runtime/prompt changes remain proposals for the ongoing subagent improvement discussion; no fix, commit, or publication performed.

## APR-pi-restart-shell-boundary - Restart checks missed the actual Windows subprocess

- **Reference:** Operator-reported `/pi --restart` failure after published commit `3afb2bf2`, 2026-10-25; related APR-commit-windows-publication-label and APR-pi-upgrade-herdr-registration.
- **Observed:** The runtime-link refresh passed a native Windows script path to bare `bash`. The operator received a missing-file error with backslashes stripped. The orchestrator then tried a separator-only edit before establishing the receiving shell.
- **Evidence:** An exact Node `spawnSync` probe resolves bare `bash` to the Windows WSL launcher and reports Linux with a `/mnt/c/...` cwd. Forward-slash `C:/...` also fails. Earlier checks established script execution from a different shell, not this call. The existing shared path contract in `lib/path-identity.ts` covers repository IDs and comparison, not shell translation.
- **Correction:** Operator authorized code and process fixes. Added path-consumer and exact-subprocess guidance to the extension skill rather than treating repository-ID normalization as WSL conversion. Code repair is assigned separately using existing repository launch mechanisms.
- **Status:** Extension now resolves Git Bash through the existing PowerShell `Get-GitBash` helper. The exact Node-to-PowerShell-to-Git-Bash refresh succeeded on this Windows machine; seven focused tests, typecheck, and diff whitespace checks passed. The extension skill names the resolver explicitly. Live session replacement remains untested; instruction adherence in future work is not established. No commit or push performed.

## APR-pi-upgrade-herdr-registration - Upgrade checks missed a pinned Herdr launcher

- **Reference:** Default session `01a14aab-abfd-7796-a3fb-5bbc2133be1d`, operator correction, 2026-10-25; related APR-089 and APR-083.
- **Observed:** Global Pi was upgraded from 1.3.0 to 1.4.0 and passed default setup and an authenticated native request. The operator then reported existing tabs on older versions and new Herdr `/pi` launches still starting 1.1.0. Older running processes were expected; the fresh-launch mismatch was not.
- **Evidence:** Live process argv and the registered `local.pi` manifest pointed directly to the 1.1.0 pnpm-store entrypoint. The current setup script already supports a stable profile dependency path, but that one-time registration migration had not been applied. Native launch checks did not establish the Herdr launch path.
- **Correction/status:** Reran the canonical Herdr setup, verified the live registration follows the default runtime link and resolves 1.4.0, and completed an authenticated request from the affected workspace using that registered entrypoint without a profile override. Existing tabs were not restarted or interrupted; a fresh attached-client launch remains operator verification. Existing launch-diagnosis instructions cover this failure; no instruction changes.

## APR-azrebalance-durability - Closed out a manual exception as the implementation

- **Reference:** Default session `01a16541-5bc4-7600-8926-cf5d646491a9`, 2026-10-23; AIF-azrebalance-durability.
- **Observed:** Assistant suspended the intended AWS process and documented it, but left it outside automated setup. It called the narrow operation done, then needed several operator corrections to explain the rebuild limitation. Its acknowledgment loop did not present a concrete durable completion path.
- **Evidence:** Existing GitLab deployment routes apply the EKS layer in both scoped and full workflows. Neither reapplies the setting. The independent runner ASG expresses its own setting directly in Terraform, unlike the EKS-managed hosting ASG.
- **Correction:** Explain that deployment integration is missing, propose using the existing deployment paths without another service, and distinguish source implementation from an already-applied live setting. Do not infer additional workflow authority solely from frustration.
- **Status:** After explicit operator approval, completed the existing-deployment integration rather than leaving a manual caveat. One helper runs after the EKS apply in both named deployment routes and is usable alone. Seven focused tests plus shell syntax/lint passed; the real helper succeeded at16:13Z without capacity/instance changes. No broad apply or rollout was needed.

## APR-alert-plan-explanation - Findings substituted for a plan walkthrough

- **Reference:** Default session `01a16541-5bc4-7600-8926-cf5d646491a9`, 2026-10-23; AIF-alert-plan-explanation.
- **Observed:** Assistant presented extensive causal findings and a draft link, then asked for one operational choice without plainly explaining the whole proposed implementation. Its next response summarized findings again, prompting another operator correction.
- **Correction:** Give a direct change-by-change walkthrough, distinguish recommendations from settled changes, describe practical outcomes/tradeoffs, and keep separate cutover work outside incidental alert deployment.
- **Status:** Recorded; no policy edits or implementation performed.

## APR-investigation-reconfirmation - Proposed the requested diagnosis instead of doing it

- **Reference:** Default session `01a16541-5bc4-7600-8926-cf5d646491a9`, 2026-10-23; related AIF-investigation-reconfirmation and AIF-103.
- **Observed:** After the operator directed investigation of underlying service behavior, the assistant ended with another recommendation to investigate, adding correction burden without a concrete blocker.
- **Correction:** Resumed bounded read-only diagnosis and the subsequently requested parallel investigations. No runtime or instruction changes.
- **Status:** Recorded; task continues. Further implementation and deployment are not inferred from investigative authority.

## APR-speculative-retention-recurrence - Speculative follow-ups leave the interface cluttered

- **Reference:** Operator feedback in the current dotfiles conversation; related APR-069 and APR-retained-pane-closeout.
- **Observed:** Operator reports completed subagents are still kept open because the orchestrator may want to talk to them again, leaving the interface cluttered. Current incident calls have not been inspected.
- **Evidence:** Earlier incidents established speculative retention and missed `finish` calls. The subsequent prompt audit found active encouragement: Team Lead says to retain when interaction is useful, and council role plus generated guidance both prescribe retained contexts. Root/coordinator schemas expose `retain`; messages to closed children fail rather than reopen them. This is not merely failure to follow cleanup advice.
- **Operator direction:** Separate saved conversation context from process/pane lifetime, with follow-up reopening instead of speculative durable agents. Evaluate system guidance, role prompts, and tool descriptions together for consistency and concision.
- **Proposal:** Close ordinary completed delegates automatically and support managed follow-up reopening with original authority. Remove the ordinary retention choice and its prompt encouragement together; consolidate lifecycle guidance across caller/coordinator tools, wrappers, results, and documentation. Preserve the separately authorized Integrator successor handoff rather than treating it as ordinary idle retention.
- **Status:** Operator-approved lifecycle and guidance changes implemented. Ordinary completion closes resources; managed messages reopen the same saved session under frozen authority within the owning runtime. Fixed review findings for reopened-name reservation and unavailable parent-tool assignment text. All 325 subagent/successor tests passed, with 14 opt-in live tests skipped; typecheck, runtime smoke, and diff checks passed. All four delegates used for this work were verified settled with closed panes/launchers. Load via settled-only reload or restart; attached-client reopening remains unverified. Dynamic assignments, arbitrary project overrides, provider wire payloads, and unrelated Pi prompt surfaces were not exhaustively audited.

## APR-retained-pane-closeout - Finished delegates left visible panes open

- **Reference:** Operator correction during server configuration discussion, 2026-10-22; related AIF-089.
- **Observed:** Retained developers supported follow-up work, but the orchestrator did not call `finish` after consuming their final results. An exited developer also retained its visible pane.
- **Correction:** Called `finish` for all four delegates owned by this conversation. Each cleanup result confirmed its pane and launcher closed.
- **Status:** Cleaned up. Recurrence of the lifecycle problem already recorded in AIF-089; no instruction changes made.

## APR-commit-parent-gitlink - Child commit published without its parent pin

- **Reference:** Operator's `/commit push` result after subagent lifecycle implementation; related AIF-009 and AIF-042.
- **Observed:** The command created homelab-infra commit `be54e69` and dotfiles commit `898a1ff1`, reported `Pushed`, and left ` M modules/homelab-infra`. Inspection confirmed the child was clean at `be54e693`, while dotfiles HEAD and index still pinned `42cdf65e`.
- **Finding:** Child repository processing occurred, but the required parent gitlink update was omitted. Existing reviewer/task prompts already require child-first work and refreshed parent gitlinks. The runner's final collection reports remaining status but does not complete omitted pin work. The private invocation's tool sequence is not persisted, so whether staging occurred too early or the pin was excluded is unknown.
- **Proposal:** Make the existing child-to-parent gitlink refresh/staging step reliable at the runtime boundary rather than append another prompt reminder. Preserve model-owned staged review/grouping and child-before-parent publication.
- **Status:** Operator subsequently authorized implementation. The runner now owns scoped deepest-first passes, stages omitted parent pins, resumes model-owned staged review/commit, and completes requested parent publication only after child integration and pin work. It preserves exclusions and distinct staged gitlink content. Real-Git regression cases cover local/published omissions, nested propagation, a child pull/merge changing HEAD, and preservation of a different staged pointer. All 70 focused commit tests passed; default-profile typecheck and diff checks passed. Live model judgment was not exercised; no live repository commit or push performed.

## APR-commit-empty-index - Clean submodule commit aborted eligible parent work

- **Reference:** `/commit` operator failure, 2026-10-22; related APR-commit-compound-inspection.
- **Observed:** The private model attempted a commit in a clean initialized submodule. Git returned exit 1 for nothing to commit, and the mutation runner stopped before committing pending parent changes. The existing prompt already said to skip empty indexes.
- **Correction:** Added an execution-time staged-index check in the private mutation shell's Git function. Empty commits become successful skips; actual Git/index/hook errors retain terminal behavior. The check uses shell-parsed arguments rather than parsing command strings or matching failure prose.
- **Status:** Regression coverage added for clean/unstaged-only children, continued parent commits, and unborn repositories. Existing staged and working contents preserved; no operator commit or push performed.

## APR-update-existing-sessions - Future-only support missed the requested migration

- **Reference:** `/update` implementation, operator correction, 2026-10-22.
- **Observed:** The operator requested updating existing Pi sessions across Herdr. The first implementation supported only newly supervised launches and required manual migration, prioritizing exact-pane retention over the requested existing-session workflow.
- **Correction:** Added a reloadable cooperative compatibility endpoint and same-tab replacement handoff. The replacement waits for original process exit before opening its saved conversation. Existing eligibility checks and caller-last ordering remain.
- **Status:** Compatibility implementation added with focused offline coverage. Existing sessions must load the extension with `/reload`; live operator-session migration remains untested. No new global instruction needed.

## APR-internal-ssh-trust - Transport-specific trust constraint became a workstation blocker

- **Reference:** Remote Herdr readiness investigation, operator correction, 2026-10-20.
- **Observed:** The assistant generalized a managed transport's host-key handoff constraint to workstation SSH enrollment, then described routine LAN enrollment as requiring a policy exception.
- **Correction:** Operator approved concise automatic enrollment/replacement for inventory-managed LAN hosts, preserving dedicated deployment trust contracts. Scoped the transport wording accordingly.
- **Status:** Policy corrected; remote readiness investigation resumed.

## APR-footer-login-hint - Clickable status gained unrequested command text

- **Reference:** Default-profile footer sign-in change, operator correction, 2026-10-20.
- **Observed:** The operator requested a clickable `login needed` label. The implementation also displayed `(/usage login)` in the footer; the operator rejected that addition.
- **Correction:** Remove the displayed hint while retaining the clickable label and keyboard command. Availability of a fallback does not require displaying it persistently. Existing scope and proportionality instructions apply; no new instruction proposed.
- **Status:** Footer text and focused assertions corrected; running Pi needs a reload or restart.

## APR-commit-compound-inspection - Read-only shell failure stopped quiet commits

- **Reference:** Default session `01a15446-5770-7481-945d-31db7ca67acb`, 2026-10-18; related APR-commit-windows-publication-label and APR-096.
- **Observed:** `/commit` stopped with exit 1 after compound read-only Git commands. Its command description cut off the tail. The exact final command was not retained; `git check-ignore` was a hypothesis, not an established cause. The assistant initially restated the visible failure instead of investigating.
- **Evidence:** The runner classified every command containing `&&` as terminal, including inspections. A normal `git check-ignore` no-match returns 1 and reproduces the failure path without any mutation failure.
- **Correction:** Replaced shell-text classification with separate native-shell inspection and mutation tools. Failed `inspect` calls return to the private agent; failed `bash` calls stop queued work. The model selects the tool; the runner does not identify mutations from command text. Full command diagnostics are retained. No new global instructions or telemetry.
- **Status:** All 50 focused commit tests and default-profile typecheck passed, including real-Git compound no-match recovery through a commit and existing hook/mutation stops. Requires idle reload or restart; live model tool selection remains unverified. Existing operator edits preserved; no production commit or push.

## APR-repeated-discovery-question - Asked for an already recorded product decision

- **Reference:** Default session `01a151e3-e1b2-70a2-a1eb-fac4dca5d06d`; prior operator answer in `01a1509e-6bbd-75ec-aea9-a4230afcf5e7`.
- **Observed:** Asked the initial-audience question without checking prior discovery. The operator had already answered it; the handoff still listed it as open.
- **Correction:** Retrieved the original answer through repository-scoped history search and resumed from established decisions. No instruction change.
- **Status:** Corrected in conversation. The stale handoff remains unchanged pending documentation scope.

## APR-bundle-reduction-gate - Smaller output became an unnecessary completion blocker

- **Reference:** Default session `01a13bcb-e5f7-73a0-b69f-c1054db8165c`; related AIF-bundle-reduction-gate, AIF-103 and AIF-102-local.
- **Observed:** After successful code checks and browser validation, the assistant requested another acceptance decision solely because output shrank beyond a symmetric size threshold. The operator rejected the agent-created gate.
- **Finding:** No increased payload, added chunk or functional defect justified stopping over the reduction. Citing ticket wording did not reconcile the limit with operator intent.
- **Correction:** Removed the pending size approval from the local report and retained the actual bundle measurements. No code padding, repeated checks, new policy or broader authorization inferred.
- **Status:** Corrected. Existing stopping and proportionality instructions were sufficient; no instruction edit or promised monitoring.

## APR-commit-windows-publication-label - Publication lookup rejected slash-separated child paths

- **Reference:** Operator-reported `/commit push` failure, 2026-10-17; related APR-094 and APR-096.
- **Observed:** Local child/parent commits completed, then `publish_repository` rejected `modules/onclave` with no matching attached inventory target. No pushes ran.
- **Evidence:** `commands/commit/reviewer.ts` keys publication targets with native `path.relative`, which produces `modules\\onclave` on Windows, but looks up the model-supplied label verbatim. A read-only replay on this host reproduced the failed lookup for `modules/onclave` and successful lookup for the native separator spelling. Onclave is currently attached to its required branch. Existing publication tests use the single-component path `child`, which cannot expose separator mismatch. The private publication tool was added in `e3cf265f`.
- **Correction:** The operator authorized a shared path contract rather than another isolated separator patch. Added repository-ID creation and boundary normalization alongside absolute-path identity helpers; `/commit` uses them for inventory, publication, ignore decisions, and result labels while preserving native filesystem paths. The ignore lookup had the same defect and is fixed. Reviewed comparable script-trust, scoped-instruction, and plan snapshot lookups; those already use consistent representations and were left unchanged. No broad path rewrite or new prompt rule was added.
- **Status:** All 57 focused path/commit tests and full default-profile typecheck passed. Helper cases exercise Windows, UNC, and POSIX semantics on either host; existing real-Git tests now use a multi-component child path and cover both Windows separator spellings, ignore decisions, and child-first publication. Reload while idle or restart is required. No production commit/push or module edits were performed. Earlier invalid model-generated Git inspections remain separate from this lookup defect.

## APR-096 - Quiet commit results were removed from next-turn model context

- **Reference:** Operator screenshot and correction, 2026-10-14; APR-094, AIF-107.
- **Observed:** A displayed `/commit push` failure was unavailable to the main model on the next user turn. The model asked the operator to provide diagnostics already visible in the interface.
- **Finding:** The earlier redundant-turn fix used only `appendEntry`, which excludes data from model context. Its lifecycle test required no message dispatch, conflating no automatic response with no next-turn visibility.
- **Correction:** Preserve the existing UI entry and send the full final outcome as a hidden custom message with `triggerTurn: false`. Success and failure tests assert content and non-triggering delivery.
- **Status:** All 12 command lifecycle tests and default typecheck pass. Running Pi requires idle reload or restart; old interface-only results are not retroactively projected. Screenshot's separate invalid WSL shell path remains outside this visibility correction. No commit or push.

## APR-095 - Codex quota diagnosis stopped before comparing credential routes

- **Reference:** Default session `01a13634-00ce-75ec-8c38-bc37e2b460d8`, operator correction, 2026-10-13.
- **Observed:** Suggested repeating native OpenAI login after a quota 401 without checking token validity or the already configured Codex credential. Then treated token audience as an established cause without a working comparison. The operator reported having logged in that morning and feeling given the runaround.
- **Evidence:** Side-by-side requests to the same quota endpoint returned 401 `rejected_by_access_enforcement` with unexpired native OpenAI credentials and 200 with the default profile's existing OpenAI Codex credentials. Both tokens had the same API audience, so audience alone did not establish the cause. The resolver prioritizes the rejected native credential.
- **Correction:** Retracted the expired-token remedy and audience-only explanation. Established the credential-selection defect through live comparison; another native login is not the demonstrated remedy.
- **Related:** APR-090, APR-086, APR-093. Existing investigation guidance covers this failure; no instruction change needed.
- **Follow-up:** The operator repeatedly requested actual subscription stats after removal of quota reporting and substitution of cache-read values. Local-report and RPC checks established only the downgrade, not the requested repair. Existing Codex CLI credentials subsequently returned live quota and reset-credit data; the Codex model route rejected Sol 6.1. The operator authorized using that separate existing CLI credential for stats while keeping native model authentication. No new Pi login or copied refresh token was needed.
- **2026-10-13 result:** Restored real quota footer values and full `/usage` reporting, including reset times, banked-reset expirations, credits, local cache history, and Bedrock accounting. Codex owns renewal of its existing file-backed credential. Missing windows are omitted rather than invented as zero usage. All 21 focused tests, usage typecheck, and real-loader smoke pass. Live Pi 1.2.0 RPC through native agent-directory resolution verified weekly quota, banked resets, credits, matching quota status, and exclusion from model context; an authenticated native Sol 6.1 request also completed. The existing attached process still requires settled-only reload or restart; attached TUI rendering is not established by RPC. Legacy remains untouched. No commit or push.

- **2026-10-17 recurrence:** After another unavailable footer, suggested restoring/installing Codex CLI before checking current Pi credentials. The operator required a cross-machine Pi-owned solution. The CLI and its credential file were absent, but live requests returned 401 for native `openai` and 200 for the active profile's existing `openai-codex` OAuth credential. The prior CLI-only repair had unnecessarily excluded a working Pi credential.
- **Current correction:** Removed CLI credential reading and subprocess renewal. Usage now resolves quota auth through Pi's model registry, reusing its built-in `/login openai-codex` browser/device flow and locked refresh/persistence. Native model login and selection are unchanged. Missing login, renewal, rejection, network, timeout, and API failures are distinguished. All 27 focused tests, full typecheck, and installed-loader smoke passed; the new reader returned real weekly quota in the active profile without a CLI or new login. Other operating systems and attached TUI rendering were not live-tested. Settled-only reload or restart is still required; no new instructions, commit, or push.

## APR-094 - Quiet commits triggered extra turns and left feedback unexplained

- **Reference:** Default session `01a135a4-1364-751e-838f-9a5ab68530bf`, 2026-10-13; AIF-107, AIF-100.
- **Observed:** `/commit` triggered redundant main-agent replies, showed only footer/notification progress during private work, and left a tracked feedback change without an exclusion reason. The first extra turn took about 6s while the next command was waiting for idle. The exclusion motive and remaining historical latency are unknown because the private trace was not retained.
- **Correction:** Removed commit-result model dispatch, used Pi's standard loader with phase messages and cleanup, clarified all-group/feedback eligibility, preserved exclusion reasons, and constrained ignore questions to staged new files. Existing feedback edits and Git work were preserved; no new telemetry, timeout change, commit, or push.
- **Status:** 60 focused tests pass. Four pre-existing typecheck compatibility errors remain outside this change. Reload and live UI acceptance are outstanding; see AIF-107 for the bounded timing evidence.

## APR-093 - Setup detours continued without reconciling an independently working publisher

- **Reference:** Default session `01a11d2b-e005-7757-9e1c-98fdbe0eb0b3`, operator correction, 2026-10-09.
- **Observed:** The operator reported that a colleague had apparently completed the notification setup while the orchestrator pursued authentication, profile configuration, and repeated setup-status checks. Earlier local Boolean-parameter and insufficient-diagnostic errors also caused extra authentication attempts. The orchestrator had not checked current GitHub publishing state before opening another setup sign-in.
- **Evidence:** Subsequent read-only GitHub checks found an active main-push notification workflow with a successful run at 20:33 UTC, before the orchestrator launched its owner-login helper at 21:13 UTC. The workflow references a webhook secret, not Microsoft token/Graph authentication. Channel metadata includes a later user-attributed message but does not alone establish neutral-bot delivery or correlate it to the CI run.
- **Correction:** Abandoned the duplicate setup attempt, confirmed its helper was no longer running and no timers remained, preserved the existing publisher, and corrected local setup status without creating a flow or post. Report only verified portions rather than turning incomplete evidence into a claim that the entire setup is finished or broken.
- **Related:** APR-090-local, APR-091, APR-092, AIF-095, AIF-105.
- **Status:** Failure recorded. No new policy proposed; no live changes, commits, or pushes.

## APR-092 - Optional browser automation was presented as a webhook prerequisite

- **Reference:** Default session `01a11d2b-e005-7757-9e1c-98fdbe0eb0b3`, operator correction, 2026-10-09.
- **Observed:** After agreement on a webhook experiment, the orchestrator discovered a target-tenant Brave profile without a configured alias and asked the operator to run browser setup as the next required step. The operator asked what Brave had to do with the integration.
- **Finding:** The runtime is an unattended HTTPS callback into a tenant workflow. Brave is only one optional tool for interacting with the setup UI, not a delivery dependency. Denial of the tested app-only Flow APIs does not establish that a particular browser or profile setup is required.
- **Correction:** Withdraw the browser-specific prerequisite. Identify the actual one-time workflow-authoring access need separately from CI delivery, and do not turn local tooling configuration into the requested architecture.
- **Related:** APR-090-local, APR-091, AIF-095.
- **Follow-up (2026-10-09):** The operator explicitly approved API/CLI-first new setup work in the active repository, with Brave/browser-driven setup only as a last-resort fallback. Added the repository rule rather than changing global browser tooling or skills; see AIF-105.
- **Status:** Repository instruction change approved and recorded. No browser alias, live flow, message, or permission was changed.

## APR-091 - Management inspection became a personal-sign-in dependency for webhook delivery

- **Reference:** Default session `01a11d2b-e005-7757-9e1c-98fdbe0eb0b3`, operator correction, 2026-10-09.
- **Observed:** After app-only management discovery returned Forbidden, the orchestrator repeatedly launched delegated account authentication to inspect an existing notification flow and presented the operator's account selection as the next required step. The requested delivery pattern was an unattended webhook caller, not personal delegated publication.
- **Evidence:** Rechecked reference implementation: caller retrieves the callback URL from its secret store and sends JSON with Content-Type only. It does not acquire or send a Microsoft user token. Documentation separately identifies flow co-owners and a Teams connection managed outside caller infrastructure. The flow's current visible sender and private-channel compatibility have not been established.
- **Correction:** Separate optional management inspection/authentication from runtime notification delivery. Preserve the intended CI-to-secret-webhook-to-flow path; do not make repeated personal sign-in the deliverable or infer the flow's posting identity from its caller or ownership. Propose target-flow setup/test for approval without substituting personal CI credentials.
- **Related:** APR-090-local, AIF-095.
- **Status:** No sign-in retry jobs remain. No live flow changes, posts, permission grants, or executable policy edits.

## APR-090-local - Browser inspection preceded checking an available management API

- **Reference:** Default session `01a11d2b-e005-7757-9e1c-98fdbe0eb0b3`, operator correction, 2026-10-09.
- **Observed:** To inspect an existing Power Automate flow, the orchestrator took over browser access from a restricted Team Lead and attempted portal sign-in without first checking API tooling or authorization. Login did not reach the flow. The operator asked why the API was not used.
- **Evidence:** Power Platform administration and maker PowerShell modules were already installed. Subsequent read-only API checks with existing app credentials authenticated successfully but returned HTTP 403 Forbidden for GCC admin-environment discovery in both relevant tenants. This establishes lack of authorization for those requests, not absence of management APIs or proof that delegated co-owner access would fail.
- **Correction:** Prefer supported API/cmdlet discovery first and report the actual authorization result. Delegated co-owner API access remains a candidate for scoped inspection; do not grant tenant-wide management-app access merely to inspect one flow without approval.
- **Status:** Read-only API blocker established. No flow changes, posts, permission grants, or executable instruction edits.

## APR-089-local - Cleanup advice conflated resetting sessions with retiring tabs/worktrees

- **Reference:** Operator correction during session consolidation, 2026-10-09.
- **Observed:** The assistant repeatedly recommended closing tabs and preserving/removing a completed task worktree. The operator clarified that two tabs used the primary main checkout and asked whether `/clear` was safe there.
- **Finding:** The advice answered a broader cleanup operation instead of distinguishing the requested conversation reset from tab closure and worktree deletion. Repository cleanliness and completed-work interviews supported reusing the primary-checkout tabs.
- **Remediation:** Verify the actual `/clear` command and give a direct answer scoped to those two tabs; leave the separate task-worktree tab untouched. No additional cleanup gate or policy needed.
- **Related:** AIF-104, AIF-050, AIF-087.
- **Status:** Clarification provided; no reset, tab closure or worktree mutation performed.

## APR-088-local - Reconfirmed supporting deployment work after outcome approval

- **Reference:** Default session `01a117b3-e184-7405-bb73-af2d7198883d`, operator correction, 2026-10-07.
- **Observed:** Repeatedly asked for revised supporting infrastructure-plan approval during an authorized development fix, including an SSM document/association update after the operator approved the specific correction it delivered.
- **Finding:** The orchestrator preserved plan review but failed to carry the operator's outcome authorization through necessary delivery steps. The operator clarified that continuation was authorized unless the work materially departed from the goal.
- **Remediation:** Applied the already reviewed SSM-only plan, verified the clean follow-up plan and successful host update, and continued image delivery. Retain scope boundaries without recurring generic approval prompts.
- **Related:** AIF-103, AIF-102-local, APR-068.
- **Status:** Recorded; task resumed. No instruction edits, database reset, or expanded production scope.

## APR-090 - Stopped Onclave diagnosis at a transport symptom

- **Reference:** Default-profile session `01a12424-11fb-74e0-9505-d51dfec4c7e8`, 2026-10-11.
- **Observed:** Reported failed hostname resolution and listed the next diagnostic checks instead of performing them. The operator requested continuation while read-only checks remained available.
- **Finding:** Direct resolver comparisons showed that the internal DNS server resolves the service, while the gateway selected by Tailscale split DNS times out. HTTPS probes using the resolved address with normal certificate validation returned healthy and ready responses. A Git push did not repair this live DNS route.
- **Related:** APR-086 concerns stopping an investigation while discoverable evidence remained available. Existing investigation guidance already required these checks; no new instruction was needed.
- **Correction/status:** Completed resolver and service-reachability checks. Recommended correcting the split-DNS route; live DNS changes remain subject to operator authorization. No DNS or service configuration was changed.

## APR-089 - Validated a wrapper instead of the operator's native launch

- **Reference:** Operator correction, 2026-10-11, after Codex subscription setup was reported complete.
- **Observed:** Fresh wrapper launches worked, but the operator's running process had no profile override. Native Pi still followed the legacy agent-directory link. Successful installation and wrapper tests were reported as operator-facing completion without checking that actual process.
- **Related:** APR-083's substituted live launch missed native runtime behavior; AIF-101 requires preserving historical legacy files.
- **Correction:** Retargeted the native alias to default without modifying legacy, corrected installation/migration targets and native profile identity, and verified an unwrapped authenticated request in the operator's workspace. The old running process must restart to replace its cached configuration.
- **Status:** Runtime correction implemented; focused tests passed. The operator subsequently authorized durable local guidance (AIF-102), now recorded in root `AGENTS.md`. Operator confirmation of subscription access and future adherence remain unverified.

## APR-088 - Commit exclusion used removal instead of restoring the index

- **Reference:** Default session `01a12424-11fb-74e0-9505-d51dfec4c7e8`, 2026-10-10; operator-provided `/commit push` failure and subsequent recovery.
- **Observed:** After staging, the private commit agent tried `git rm --cached` to exclude a new root-level gitlink. Git rejected the operation because the staged entry differed from both HEAD and the working representation. No commits were created. The orchestrator used `git restore --staged` to preserve the checkout and completed the requested commits and push.
- **Finding:** Commit guidance already gives `restore --staged` for repositories with HEAD, but frames it as a regrouping example rather than explicitly covering individual exclusions. The ignore-choice runtime separately uses `rm --cached` unconditionally and has the same failure mode. The root checkout points to the existing module's Git directory and is not a declared additional submodule.
- **Related:** APR-081 concerns completing authorized publication after helper limitations; no matching prior unstaging incident was found in the feedback/failure logs.
- **Proposal:** Clarify HEAD-aware exclusion in the owning commit prompt, use the same behavior in the ignore-choice runtime, test gitlink and changed-index exclusions with real Git, and consider ignoring the duplicate root checkout while retaining the declared module path.
- **Status:** Incident recorded. Recovery was committed and pushed. Preventive prompt/runtime/ignore changes are proposals only, not implemented or approved.

## APR-087 - Optimized a static test gate before justifying its retention

- **Reference:** Default session `01a0fd31-02fa-77c7-ae11-7e836c2f64a8`, operator correction during test cleanup.
- **Observed:** Proposed replacing source-text checks with parsed configuration assertions and described them as meaningful protection. On challenge, explained that the checks would compare declared settings with expected constants, not verify product startup or authentication. The operator identified the weak safety-gate rationale.
- **Finding:** Demonstrating what a check could reject did not establish that preserving the gate was worthwhile. Existing proportionality guidance already requires workflow-specific evidence rather than generic safeguards. This was adherence failure, not missing policy.
- **Correction:** Withdrew the replacement proposal. Assess removal on its merits and state the loss of static expectations plainly; do not claim executable behavior tests cover the configuration selection they do not exercise.
- **Related:** AIF-095, AIF-041, AIF-031.
- **Status:** Feedback recorded. No replacement tests, runtime changes, or instruction changes implemented; test-suite removal remains an operator decision.

## APR-086 - Stopped a requested investigation at an unverified limitation

- **Reference:** Operator correction, 2026-10-05, during a tenant meeting migration investigation.
- **Observed:** Asked the operator for discoverable information before inspecting existing setup, then reported an unverified feature combination as a stopping point while read-only investigation remained available. The operator had to request continuation.
- **Finding:** Existing investigation and autonomous read-only discovery instructions already covered the next actions. This was an adherence failure, not a missing rule.
- **Correction:** Inspected the actual meeting association, live group membership and calendar settings, and documented group-calendar editing behavior. Distinguished the viable client workflow from public API limitations.
- **Related:** APR-073, APR-072, AIF-092.
- **Status:** Investigation resumed. No instruction changes or tenant mutations authorized by this record.

## APR-085 - Live inspection assignments exceeded Explorer's tool authority

- **Reference:** Operator-provided delegation excerpt, discussed 2026-10-05. Historical sessions were not independently inspected.
- **Observed:** Two Explorer assignments needed live CLI investigation but Explorer had no shell. The parent cancelled and reassigned them to Developer, adding an initial tool-access check. No live findings were established in the excerpt.
- **Verified:** Default `agents/explorer.md` omits shell tools. Developer has shell plus edit/write tools, so a read-only assignment does not enforce shell mutation restrictions. Child launch already loads Damage Control on both surfaces.
- **Related:** AIF-090, role authority versus requested outcomes. Existing normal Damage Control protects meaningful unrecoverable harm, not all mutation.
- **Decision:** Operator agreed to best-effort Explorer shell inspection through a distinct Damage Control policy: direct recognition of common observations, inspection-specific judgment for unfamiliar commands/scripts, block unresolved calls, and no agent-controlled bypass. Normal script preapprovals cannot grant inspection permission.
- **Status:** Planning only. `.specs/explorer-inspection-mode/plan.md` records the approved behavior and implementation work. Runtime changes, tests, commits, and publication are not performed or authorized by this record.

## APR-084 - Prepared closeout recovered but returned stale cleanup state and contradictory plan progress

- **Reference:** Default orchestrator `01a10244-393e-70fb-a73d-b88eeb6f36e6` and Integrator successor `01a10270-4f7e-75aa-b307-3cc4fdd53b98`, reviewed 2026-10-03; TCA-015.
- **Observed:** The task was committed, integrated, and cleaned up locally. After Git's Windows long-path removal error, the handoff returned `worktree: registered` (record `acd6df92`) although subsequent registration inspection showed it absent. The Integrator removed the exact remnant and received COMPLETED (`5fe73e32`). Cleanup already models deregistered remnants and can remove them on retry; its removal-error catch returns before refreshing registration.
- **Execution:** Initial task-state probes actually queried the target checkout. A later explicit task-directory probe after deregistration discovered the enclosing repository, printing its ignored inventory and target HEAD. Full changelog dumps and repeated state probes added noise. These are caller execution errors, not reasons to add a new inspection framework.
- **Delegation:** The parent framed a combined T1/T2 worker before consulting Strategist (`ab0d457b`), which recommended that combination as a proposed task-boundary adjustment (`495ad320`). Parent dispatched both named tasks plus T3 checks (`a8b72b89`) despite the existing one-task ceiling and without a stated context-conservation exception. The worker succeeded; elapsed time alone does not prove excessive sizing or model mismatch. Related AIF-061/AIF-099 cover task boundaries; AIF-033 covers direct work.
- **Archive:** Frontmatter is completed, but T3 remains unchecked and present-tense progress says integration/cleanup are pending. The helper updates frontmatter and integration evidence, not task/progress prose.
- **Proposals:** Refresh state after failed removal and reuse existing contained-remnant cleanup; reuse existing inspection for compact preflight; expose already-observed release/retirement facts in successor results; reconcile final archive progress. Additive changelog merge/resume guidance already exists and worked. Discuss delegation adherence separately rather than adding generic sizing rules or runtime gates.
- **Status:** Review only. No executable instructions, runtime, plan, Git history, or live processes changed. These logs record evidence, not approval to implement.


## APR-083 - Repeated environment sourcing instead of existing GitLab CLI authentication

- **Reference:** Operator correction during EISA deployment monitoring, 2026-10-02.
- **Observed:** Repeated pipeline checks sourced the platform environment file to obtain an API token. Damage Control denied the latest entire call at `source .env`; nothing in that call executed. The operator reported repeated approval prompts.
- **Finding:** The orchestrator did not check the existing authenticated `glab` path before choosing broad shell environment loading for status-only requests. Installed `glab api` successfully returned the pipeline status without environment-file access or printing credentials.
- **Correction:** Use existing CLI authentication and stream filtered API responses for further GitLab monitoring. Do not retry the denied environment-sourcing operation or bypass its guard.
- **Related:** APR-080 / AIF-098 cover direct streaming of transient GitLab responses, not this credential-loading choice.
- **Status:** Native authenticated status check succeeded; pipeline remains running. No guard, credential store, or instruction changes made.

## APR-082 - Plan-launch completion exceeded the runtime evidence

- **Reference:** Herdr worktree handoff execution and operator launch of `usage-ranked-command-autocomplete`, 2026-09-30.
- **Observed:** After the orchestrator reported completion, the operator reported a new Pi session in another workspace without the selected `/do-it` command and doubted worktree creation. The orchestrator initially asked the operator to identify the launch instead of tracing its own native events.
- **Evidence:** The source session records the selected plan and target pane at 23:16 UTC. Git and the raw preparation record confirm the task worktree was created. The recorded pane/workspace is now absent, and no saved task-cwd session was found; these facts do not establish why the operator saw no command.
- **Confirmed defect:** The bootstrap validated then deleted `PI_HERDR_PLAN_RUN` before spawning Pi, preventing its session-scoped preparation hook from receiving the target/worktree coordinates. A subprocess regression reproduced the lost receipt while preserving the `/do-it` argv. The earlier live launch test replaced `/do-it` with an extension command, bypassing native template expansion, authentication and prepared runtime context.
- **Correction:** Preserve the admitted receipt for the selected Pi process while clearing inherited receipts on ordinary launches. Replace the test-only command with the repository's real `/do-it` template, production preparation hook and a deterministic provider that forbids network and performs no plan work. Trace existing events before requesting operator reconstruction.
- **Related:** APR-074 and APR-075 distinguish source/isolated checks from actual launch behavior; APR-073 covers available investigation.

[Showing lines 1-310 of 433 (50.0KB limit). Use offset=311 to continue.]