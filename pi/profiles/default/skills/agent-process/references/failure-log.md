# Agent process failure log

## APR-retained-pane-closeout - Finished delegates left visible panes open

- **Reference:** Operator correction during server configuration discussion, 2026-10-22; related AIF-089.
- **Observed:** Retained developers supported follow-up work, but the orchestrator did not call `finish` after consuming their final results. An exited developer also retained its visible pane.
- **Correction:** Called `finish` for all four delegates owned by this conversation. Each cleanup result confirmed its pane and launcher closed.
- **Status:** Cleaned up. Recurrence of the lifecycle problem already recorded in AIF-089; no instruction changes made.

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
- **Review:** Four adversarial reviews and Steward triage retained the bounded architecture/component evidence, identified inherited receipt eligibility and mixed-tool-batch release continuation as further source-established defects, and confirmed the production closeout facade/lifecycle acceptance gap. A speculative older-coordinate compatibility choice was withdrawn rather than added to scope.
- **Status:** The operator authorized completing the bounded correction on 2026-10-01. Corrected bootstrap/admission, exact-session release cancellation and ordinary-discovery activation guard are implemented. Final affected unit selection passes 72 tests, native launch one, all four real-Pi production closeout scenarios have passing evidence, and typecheck/runtime/whitespace checks pass. The combined closeout run stalled once during blocker integration; unchanged isolated blocker rerun passed, without a timeout widening or production workaround. Corrective task commit `4f4386a7` is delivered to `main`; completion metadata `8d47aba9` and exact correction-worktree cleanup are independently verified. The parent completed final accounting and this log reconciliation. Original functional completion remains withdrawn; historical Git delivery/component results and current faithful acceptance are separately recorded. The vanished operator pane's missing-command cause and attached-client/external reasoning remain unverified. No replacement production task was launched or user's worktree removed.

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
