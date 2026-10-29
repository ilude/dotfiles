# Changelog

## 2026-10-29: Expose Codex weekly quota to agents

- Add the default profile's discoverable `codex_usage` tool for fresh weekly percentage used, reset Unix time, and fetch timestamp. Reuse `/usage` quota authentication without initiating login or changing native OpenAI model credentials. Missing weekly data remains unavailable rather than zero; request and authentication errors remain visible.
- Restart Pi or use `/reload` with no active or retained subagents to load the tool. Legacy is unchanged.

## 2026-10-28: Execute reviewed commit plans in code

- Make `/commit` and `/commit push` use the AI for staged review, whole-file grouping, subjects, and reasoned exclusions, then let runner code stage, validate, commit, verify, and publish. Normal review has no mutation shell or publication tool; `bash` is available only to resolve established publication conflicts.
- Require a complete structured plan before committing changed files. Return exact validation errors for an initial proposal and up to two corrections, then stop without executing an invalid plan. A missing plan with pending changes or unfinished eligible work cannot produce a success label or publish an unchanged HEAD. Clean repositories may finish as no-ops.
- Preserve ignore questions, working and index-only contents, normal hooks, deepest-first review, child-before-parent publication, pull-before-push integration, detached publication skipping, model selection, and response retries. Report actual commits, remaining changes, exclusions, retained index references, and publication outcomes, including partial results after failure. No new runtime validation gates or legacy changes. Run `/reload` in an existing Pi process to load the remedy.

## 2026-10-28: Initialize Bedrock footer from cross-sign-in personal AWS usage

- Reconcile month-to-date CloudWatch invocation costs for the same username across IAM users and named role sessions in the same account, regardless of machine. Match the complete username, exclude other users and service identities, and aggregate before the dashboard's top-user limit.
- Record personal scope in snapshot metadata and preserve existing ledgers. A newly initialized snapshot covers older local unpriced records through its cutoff; later local usage remains incremental. This is a logged-usage estimate, not an invoice or continuous synchronization of other machines.

## 2026-10-29: Refresh personal Bedrock billing automatically

- Run the narrow live personal CUR Lambda query in the background at default Pi session start, new/clear, resume, and about every 15 minutes. Share concurrent refreshes, cancel pending work and timers on shutdown, and keep model requests and UI startup independent of billing latency. `/bedrock reconcile` remains an optional immediate refresh.
- Show `bedrock: $amount` from the last successful current-month CUR total plus priced Pi/Claude local usage since local query-start capture, including usage recorded during the query. Persist that capture separately from AWS generation time. Failed refreshes keep the successful baseline and subsequent local accumulation; clear/new never resets the ledger. `/bedrock` and `/usage` use the same calculation.
- Keep historical CloudWatch and pre-port baseline files untouched but exclude them from the new Pi billing calculation. Preserve all-session shared-ledger accounting and accounting-only restricted children, with no new child network or timers. This is approximate personal tracking, not exact billing coverage or deduplication.
- Ignore the generated CUR cache and atomic-write leftovers. Invoke only the dedicated personal Lambda with the selected AWS profile, reject Lambda errors as well as CLI failures, and clean system-temporary response files. Restart Pi or use settled-only `/reload` with no active or retained subagents to load these changes.

## 2026-10-29: Prefer posted personal CUR total in the Bedrock footer

- Add a validated, profile-local payer CUR snapshot cache refreshed only by `/bedrock reconcile`. A current-month posted total takes precedence over CloudWatch and local Pi/Claude estimates in the footer; local accounting remains available separately and the existing CloudWatch baseline is not overwritten.
- Fetch the deployed `snapshots/mike.glenn/current.json` object from the personal billing bucket in `us-east-2` with the selected AWS CLI profile. Accept UTC timestamps serialized with either `Z` or `+00:00`, matching the deployed object.

## 2026-10-29: Surface native Herdr capabilities

- Distinguish same-client `herdr machine add` connections from `/connect`, which opens a separate client. Link upstream guidance for agent diagnostics, popups, direct attachment, multiple clients, and restart restoration, keeping optional history and experimental handoff unchanged.
- Include machine labels in custom Pi sidebar rows on both platforms. Reload Herdr configuration to apply; installed client/server support for documented features remains to be checked before use.

## 2026-10-29: Reconcile Bedrock costs for the named SSO identity

- Allow `/bedrock reconcile` to use the `AWSReservedSSO_ccb-bedrock-developer` caller and keep its baseline filtered to the complete assumed-role ARN, preserving session-level attribution and existing personal IAM-user behavior.
- Other assumed roles remain rejected. The AWS identity and deployed dashboard were inspected read-only; log query execution was denied for the configured IAM user.

## 2026-10-27: Complete parent gitlinks in the default Pi commit runner

- Move deepest-first repository sequencing into `/commit`'s runner instead of relying on one private model turn to coordinate every repository. If a parent's pin is omitted, stage the updated child gitlink and resume normal staged review/grouping and commit before continuing.
- Complete child publication before the parent pass, including child HEAD changes from pull/merge. Defer premature parent requests, refresh pins before and after parent integration, and finish requested publication after pin commits without duplicate pushes of an unchanged HEAD.
- Preserve explicit exclusions, staged submodule removals, index-only content, native hooks, detached local commits, clean outgoing children, and bare `/commit`'s local-only behavior. No unreviewed automatic commits, separate audit phase, or changes to legacy. Reload the default profile to activate.

## 2026-10-27: Close completed Pi subagents and reopen saved conversations for follow-up

- Ordinary subagents now close their processes and panes on completion instead of offering a `retain` launch choice. Their conversations and results remain saved; explicit `subagent_control message` follow-ups reopen the same session with its original role, permissions, and launch configuration, then close again when done. Reopening uses the current owning runtime, not a new cross-restart registry.
- Align root/coordinator tool descriptions, Team Lead and council prompts, child instructions, and lifecycle documentation around that contract. Remove speculative-retention encouragement and duplicated protocol guidance; stop instructing roles to use unavailable parent tools.
- Preserve running and waiting-parent children, explicit user intervention, and the separately authorized Integrator successor that survives the departing orchestrator. Existing sessions need a settled-only `/reload` with no open owned children, or a restart, to load the change.
- Passed 325 subagent/successor tests, default-profile typecheck, runtime smoke, and diff checks. Fourteen opt-in live tests were skipped; attached-client reopening remains unverified.

## 2026-10-27: Show running subagents in the Pi footer

- Show `agents: N running` on the second footer line after Onclave and before token stats. Count running children and descendants owned by the current session using existing lifecycle updates, with no polling. Hide the indicator when none are running; waiting and settled retained agents do not count.

## 2026-10-27: Separate spawned subagent tabs from personal work tabs

- Group overflow and dedicated Team Lead tabs in one lazily created Herdr workspace per orchestrator, labeled from its origin tab. Keep the orchestrator, ordinary inline subagents, and user-created work tabs in their existing workspace. Capacity, team grouping/migration rules, and execution behavior are unchanged; no Git worktree is created.
- Track Herdr's new pane IDs across workspace moves while retaining terminal/process identity, focus, and owned cleanup. Remove the initial shell and empty owned workspace, accept Herdr's automatic removal, and preserve tabs added by the operator.
- Passed 75 focused layout/model/cleanup tests, default-profile typecheck, and two isolated Herdr 0.9.5 tests for overflow placement and team migration/return. Attached-client presentation remains unverified. Activate with `/reload` only when no subagents are active or retained, or restart Pi.

## 2026-10-26: Integrate origin before default Pi commit publication

- `/commit push` now uses `publish_repository` as the sole pull owner for each captured own branch. Git fast-forwards when possible and merges divergence without rewriting history; established conflicts return recoverable evidence for clear resolution and retry, while other pull failures block dependent publication.
- Keep child repositories ahead of parents and refresh parent gitlinks to integrated child HEADs before parent publication. Bare `/commit` remains local-only.

## 2026-10-26: Add Windows remote Herdr connect command

- Add default-profile `/connect <ssh-alias>` to open a Windows Terminal tab running the local `herdr --remote` client. The alias is resolved by local SSH configuration, and inherited `HERDR*` context is cleared only in the child terminal to avoid nested-attachment rejection.
- The command does not install, restart, configure, or change the remote server. Other platforms report unsupported.

## 2026-10-26: Keep default Pi release cache machine-local

- Stop tracking the default profile's generated release-indicator cache to avoid timestamp churn and cross-machine merge conflicts. Each machine retains its local copy; Pi recreates missing caches and refreshes them through the existing release checks.

## 2026-10-26: Document remote workstation access discovery

- Point agents to homelab-infra's public-safe remote-access runbook for native Herdr SSH attachment, inherited Windows Terminal context, separate WinRM credentials, and network-access constraints. Keep live inventory and secrets under the module's existing BWS ownership rather than duplicating them in documentation or `values/`.
- Record the successful native Herdr connection separately from partial WinRM checks and unverified work, Tailscale, and public-network paths. This documentation does not change host configuration or managed firewall policy.

## 2026-10-26: Fix Windows Pi updates and retain failure context

- `/update` now uses the existing PowerShell Git Bash resolver for runtime dependency linking on Windows instead of bare `bash`, which can select WSL and fail to find Windows pnpm packages. Non-Windows behavior and cooperative restart eligibility are unchanged.
- Update installation/link and unexpected failures remain visible as notifications and are also persisted in model context, so a subsequent question can refer to the error without a screenshot. Recording the error does not start an automatic agent turn. Reload or restart Pi to load the extension changes.

## 2026-10-26: Disable default Pi inline image previews

- Disable the default profile's terminal image protocol to avoid the unsupported Kitty graphics path through Herdr into Windows Terminal while investigating visible encoded-image text. Image attachments and model image understanding remain enabled; Kitty keyboard support and Herdr configuration are unchanged.
- Run `/reload` in affected Pi sessions while settled with no active or retained subagents, or restart them, to load the setting. The suspected graphics corruption still needs confirmation through normal use with inline previews disabled.

## 2026-10-25: Allow slower commit publication and report uncertain pushes accurately

- Give `/commit push` publication 120 seconds instead of the 15-second local Git inspection limit. Local inspections keep their existing timeout.
- When a push is cancelled or times out, check whether the remote branch already points to the intended commit before reporting success. Unconfirmed publication is reported as an unknown outcome, not as no push performed; no automatic push retry is introduced, and dependent publication stops while the outcome is unknown.

## 2026-10-25: Keep visible subagent panes readable

- Replace the fixed two-row, five-column Herdr subagent grid with one row of at most two agents above a stable half-height orchestrator. Placement uses roughly 50 columns and 14 rows per pane, sending excess agents to named overflow tabs instead of repeatedly subdividing unreadable terminals. Tiny windows still permit unsplit singleton tabs.
- Preserve Team Lead grouping with dedicated team tabs, a bottom-half leader, and readable team overflow. Clean layouts reassess capacity at lifecycle boundaries without polling or recreating processes. Manual divider edits freeze the affected tab against further automatic splitting or migration; whole-window resize is no longer mistaken for a manual edit.
- Focus preservation, pane ownership, child lifetimes, cleanup, and manual tab names remain unchanged. Focused tests and isolated Herdr 0.9.5 inert-process acceptance cover geometry, migration, identity, and cleanup; attached-client presentation remains unverified. Load the change with a settled-only default-profile `/reload` or restart, not while subagents are active or retained.

## 2026-10-25: Standardize refreshable work-account AWS SSO setup

- Document named AWS CLI v2 SSO sessions as the supported work-account setup for the `bedrock` profile, preserving the existing account, role, and regions. Compatible clients can refresh short-lived credentials within the organization's sign-in session instead of relying on the older inline SSO configuration.
- Keep AWS configuration and token caches local, select the profile explicitly rather than changing the machine-wide default, and verify identity separately from model access. Organization session expiry and role permissions are unchanged.

## 2026-10-25: Resolve Git Bash for Windows Pi restarts

- `/pi --restart` now resolves Git Bash through the existing PowerShell `Get-GitBash` helper on Windows before refreshing runtime links. This avoids accidentally selecting WSL's `System32\\bash.exe`; non-Windows launch behavior is unchanged.

## 2026-10-25: Restart the current Pi session without updating

- `/pi --restart` refreshes the default profile's Pi runtime link, then requests a cooperative restart into a new Herdr tab using the version resolved from that link. It does not install packages. Outside Herdr, it reports that new-tab restart is unsupported and leaves the current process running. The command offers `--restart` in argument autocomplete; `/new-instance` behavior is unchanged.
- The replacement waits for bootstrap admission, then the original session exits through the existing cooperative safety checks. `/update` keeps its same-tab behavior. No live terminal restart was performed during implementation.

## 2026-10-25: Use merge-based Git pulls and explicit submodule updates

- Make merge-based pulls the shared default: fast-forward when possible and merge divergent history without rebasing existing commits. Stop automatically assigning rebase preferences to new tracking branches; explicit rebase commands remain available for unpublished work.
- Disable implicit submodule recursion so pulling the parent does not also update independent module checkouts. This avoids the recursive-rebase failure on committed submodule-pointer changes and preserves deliberate module branch selection.
- Remove existing branch-specific rebase overrides in the local dotfiles, homelab-infra, and Onclave checkouts so they inherit the shared policy. Other existing clones can retain local overrides and need separate review; this change does not pull, rewrite history, or publish commits.

## 2026-10-24: Delay co-op Zomboid utility shutoffs to 2–6 months

- Set water and electricity to their 2–6 month presets. Update the associated shutoff-day modifiers as well, since leaving the captured 14-day values would retain the earlier cutoff despite changing the presets.
- Select each utility's shutoff day separately within the installed game's 60–179 day range and retain those values across restarts. Timing follows the existing world's age; alarm decay, other gameplay settings, saves, and characters remain unchanged. No world reset is included.

## 2026-10-24: Allow co-op safehouses in non-residential buildings

- Enable `SafehouseAllowNonResidential` so players can claim eligible shops, warehouses, and other non-residential buildings. One owner can share a claim through the game's existing player invitations and member respawn controls; this does not automatically enroll every account.
- Preserve the existing safehouse access, fire, loot, and 144-hour inactivity rules, along with world and character progress. No mod or world reset is required.

## 2026-10-24: Announce co-op Zomboid player deaths

- Enable `AnnounceDeath` in the authoritative server configuration so player deaths produce a global chat message. Animal-death announcements remain disabled, and the existing world, characters, and other gameplay settings are preserved.

## 2026-10-24: Double co-op Zomboid book-reading speed again

- Reduce `MinutesPerPage` from 0.5 to 0.25 in the authoritative sandbox template, halving skill-book reading time again. XP multipliers, other gameplay settings, world saves, and characters remain unchanged.
- Apply through the existing targeted game deployment and normal save/stop/start lifecycle, without a world reset or game upgrade.

## 2026-10-23: Carry browser task context through follow-ups and honor timeout overrides

- Browser intent interpretation uses the active task and bounded recent conversation to distinguish continuation from a new, cancelled, or completed task. Reload acknowledgments and manual login-step completion can retain established scope without repeating the full request. Known private browser observations are excluded from interpretation context, and one-time approvals are not retained or renewed.
- Explicit browser `timeout_ms` values reach CDP operations as well as the overall call deadline, so a longer call can extend the normal 30-second command limit. Overrides remain per-call; request-policy, automated-review, and resource-check deadlines remain separate.
- Reload default Pi with no active or retained subagents, or restart it, to load these changes. No live browser interaction, login, commit, or publication is included.

## 2026-10-23: Avoid reviewing one approved browser navigation twice

- An explicit HTTP/HTTPS navigation previously received a policy decision, then its intercepted initial Document could require another review under the background 10-second deadline. The same approved navigation now carries a one-shot identity/target/frame/URL-bound dispatch lease, analogous to the existing file-navigation lease.
- Local request inspection, DNS classification, frame revalidation, native warning refusal, and the existing deadline remain in place. Changed projections or destinations, body-bearing requests, redirects, assets, and later documents do not inherit approval. There is no localhost-wide exception or reusable manual grant.
- New direct input still replaces independently interpreted browser task scope. A follow-up such as “done” does not authorize local assets; restating the active development task may still be needed for the full page flow. Reload default Pi with no active or retained subagents, or restart it, to load the repair. Focused synthetic checks and typecheck passed; no live browser or login was exercised for this change.

## 2026-10-23: Expose secret-safe browser request failure diagnostics

- Owned-browser interception previously swallowed all request-check exceptions into `BlockedByClient`, leaving startup and navigation cancellation without actionable evidence. Explicit navigation and intercepted failures now retain at most eight fixed-code diagnostics with the check stage and cancellation source, not URLs, query strings, bodies, credentials, or raw exception messages.
- Browser tool errors include recent diagnostics, and `browser_session` status exposes them in text and structured results even after tooling disconnects. Reload default Pi while no subagents are active or retained, then repeat the normal guarded operation and inspect status if failure happens asynchronously. Reload clears this in-memory history.
- Request policy still fails closed; deadlines, exact ownership checks, opaque/error-document refusal, TLS validation, and the explicit isolated-localhost exception are unchanged. Synthetic tests and typecheck passed; the live startup cause still needs the new diagnostics from the affected operation. No browser was restarted or navigated during this change.

## 2026-10-23: Normalize Windows browser process start-time identity

- Browser-session state serializes Windows process start times as JSON `/Date(milliseconds)/` values, while the live CIM adapter reports ISO timestamps with sub-millisecond precision. Exact string comparison falsely marked the same Brave process stale, disconnecting page operations despite matching PID, executable, profile, CDP port, and launch marker.
- Process identity now compares recognized date representations at millisecond precision, retaining the full tuple checks and rejecting unparseable mismatches. Reload or restart default Pi to activate the fix; no live browser operation was performed.

## 2026-10-23: Use native Herdr for same-server session communication

- Explicitly directed communication with independent sessions now uses native Herdr on the same connected server, including supported non-Pi CLI agents. Onclave remains the route for supported instances outside that server; owned delegation stays on `subagent` / `subagent_control`. Registration, service/vault tools, and terminal callbacks are unchanged.
- Herdr discovery distinguishes optional live names from agent types and exposes recognizable pane/tab/workspace context plus Pi session identity. Existing targeted actions resolve default Onclave IDs and unique short aliases to current local panes, without a registry or claiming registration. Ambiguous identities require disambiguation; missing local matches do not prove remote placement, and custom Onclave-ID overrides have no native mapping.
- Layout labels and lifecycle-result rendering now reflect native responses. Prompt submission and settled-state observation no longer claim a correlated answer or completed work. Guidance uses ordinary prompts, bounded waits, and terminal reads, preserving native busy/blocked/draft behavior rather than adding a messaging protocol.
- Reload default Pi with no active or retained subagents, or restart it, to activate wrapper and guidance changes. Offline checks do not establish real attached-client interaction. No publication or deployment is included.

## 2026-10-23: Make browser approvals and page interactions actionable

- Explicit browser approvals now separate human decision time from bounded automated checks. Allow once covers only the pending action, including cross-tool private exports; historical manual grants no longer authorize later actions. Fill retains post-secret validation without a second policy decision.
- Bounded snapshots expose uniquely targetable controls, visibility/disabled facts, separate text/control budgets, explicit truncation, and subtree focusing. Click/fill refuse ambiguous and disabled targets rather than silently choosing the first match. Bounded exact-frame scrolling reports actual movement and boundaries for a fresh snapshot.
- Attached Brave traffic remains normal, unintercepted page traffic. Pi-owned background-request prompts retain the 10-second deadline and can still expire closed. Neither mode is a network sandbox, and generated selectors can become stale after rerenders.
- Reload or restart Pi to load the tools. Synthetic checks do not establish live Office/SharePoint usability; no live browser run or publication is included.

## 2026-10-23: Preserve normal page traffic in operator-attached browsers

- Attached Brave sessions no longer intercept each page-generated network request. Office/SharePoint internal POSTs previously appeared as exports and produced repeated approval dialogs that expired while the operator was working.
- Explicit agent navigation, observations, clicks, fills, and credential resolution retain their policy checks, as do native browser warning checks. This deliberately removes network-stage transfer and redirect enforcement in attached browsers; it does not claim to distinguish harmless service requests from writes or disclosures. Pi-owned browsers retain request interception.
- The earlier end-of-run disconnect remains in place, but addressed only idle prompts, not the active-page problem. Reload existing Pi sessions to load the corrected behavior.

## 2026-10-23: Disconnect browser interception when a Pi run ends

- Default Pi now releases its CDP connection, request interception, and pending browser approvals when the agent run ends. SharePoint and Office background telemetry previously kept triggering short-lived damage-control dialogs in an otherwise idle session.
- Brave and its open tabs are preserved. The next browser operation reconnects through the existing policy checks; this does not grant background traffic policy approval or turn the tooling into a browser-wide network sandbox.

## 2026-10-23: Let quiet commits recover from read-only checks

- Default Pi's `/commit` mutation shell now treats a nonzero read-only Git check, such as `git diff --cached --quiet` finding differences, as a result returned to the reviewer instead of a terminal failure. The call ends at that point and the reviewer continues, matching the workflow's existing recovery rule. Previously such a check in a mutation chain aborted the whole run with no commits.
- The same shell refuses working-tree discards (`git restore` without `--staged`, `checkout`, `switch`, `clean`, and `reset --hard/--merge/--keep`) without running them, since the workflow never discards working contents. Actual staging, commit/hook, and publication failures remain terminal.
- Reload Pi while no subagents are active or retained to load the change.

## 2026-10-23: Preserve AWS credential-chain auth during default Pi compaction

- Default Pi's unified compaction now dispatches its summary through the model registry's request-time stream path. Bedrock Mantle routes using the AWS credential chain can therefore mint their normal request token even though registry authentication has no static API key. The selected model, provider, and AWS environment remain unchanged; no model fallback, fake key, or credential copying is introduced.
- Restart Pi or reload the default profile while settled to activate the extension change. Existing context is retained on a compaction failure; live AWS/Bedrock access and summary quality were not exercised.

## 2026-10-22: Make the co-op Zomboid configuration explicit

- The game deployment now owns complete server, sandbox, and spawn-region templates based on the existing world's configuration instead of patching selected fields into generated defaults. Credentials and private server identity remain in BWS; the old overlapping world-settings overrides are removed.
- The co-op settings show players on the map and allow player safehouse claims and safehouse respawning. Faster book reading remains enabled; XP, other gameplay choices, safehouse access rules, world saves, and character/account data are preserved. The trash-bin Delete All button stays disabled.
- Configuration changes use the existing targeted deployment and normal game save/stop/start lifecycle. This does not add world resets, game upgrades, router changes, or backup automation.

## 2026-10-22: Skip empty indexes without aborting quiet commits

- Default Pi's `/commit` now checks the target repository's staged index at execution time before a normal Git commit. An empty index is a successful skip, so an unnecessary clean-submodule commit attempt no longer blocks eligible parent changes.
- The guard preserves repository/global Git options, handles unborn repositories and compound shell calls, and leaves unstaged contents untouched. Nonempty commits still run normal hooks; actual staging, index, commit/hook, and publication failures remain terminal. No blanket exit-code suppression or extra staging is added.
- Real-Git regressions cover clean and unstaged-only submodules followed by parent commits, an unborn empty index followed by its first staged commit, and existing hook-failure behavior. Reload Pi while no subagents are active or retained to load the command-runner change. No operator commits or pushes were performed.

## 2026-10-22: Update Pi and restart eligible Herdr sessions

- Default Pi adds `/update`: install the latest stable Pi with pnpm, refresh its runtime links, then make one explicit pass across the connected Herdr server. Eligible sessions resume their exact saved conversations, cwd, and profile; peer results are reported before the invoking session restarts last. Supervised sessions retain their pane; existing sessions migrate to a replacement pane in the same tab. Outside Herdr, only that session is considered.
- Busy sessions, active prompts, queued messages, unsent editor text, active or retained subagents, unsaved sessions, and unsupported launchers are skipped. There is no background retry, Herdr update, or forced termination. Failed installation or link refresh prevents restarts.
- Default shell and ordinary Herdr launches now retain a small Node host around the real Pi process. Existing Herdr sessions can load compatibility support with `/reload`, without manually exiting or reopening a tab. Their replacement waits for the original process to exit before opening the conversation, then confirms its exact session and updated version. Sessions that have not loaded support remain skipped rather than receiving injected terminal commands. Pane/tab labels and naming ownership survive update restarts, while normal exits still retire plugin-owned panes. Legacy and explicit recovery mode are unchanged.
- Focused offline tests cover installation ordering, eligibility, connected-server scope, caller-last reporting, real fake-child replacement, compatibility admission and old-process exit ordering, same-tab migration, session/version confirmation, and shell argument forwarding. No live package update or operator-session restart was performed during implementation.

## 2026-10-20: Allow routine internal SSH host enrollment

- Inventory-managed hosts on the trusted LAN allow automatic enrollment and replacement of SSH host keys, limited to matching known-host entries. Host-key checking stays enabled; dedicated deployment-managed trust stores retain their own contracts.

## 2026-10-20: Show stable release lag in Pi's footer

- The default footer checks stable Pi and Herdr releases against the running Pi and connected Herdr server versions, using a four-hour active-profile cache. Current versions are grey; one stable release behind is muted yellow; further behind is muted red. Outdated labels link to the corresponding release notes.
- Herdr preview labels omit date/hash suffixes, for example `η v0.9.3-preview`; full versions remain available for release comparisons and links. Preview versions compare against subsequent stable releases. Checks run outside footer rendering and stop on session shutdown; nothing installs, restarts, or prompts automatically. Reload with no active or retained subagents, or restart Pi to load the change. Legacy remains unchanged.

## 2026-10-20: Sign in from Pi's missing-quota footer

- Default Pi's underlined `login needed` footer label starts Codex sign-in when clicked in fullscreen mode. `/usage login` provides the same action from the keyboard in either terminal mode; regular mode leaves mouse handling to the terminal.
- Sign-in skips the method menu using session-environment detection: browser login for local Windows/macOS and graphical Linux, device-code login for SSH/Mosh and headless Linux. Pi's native browser/device-code flow and active-profile credential storage are reused, then quota refreshes immediately. A configured, working default browser is not guaranteed by detection; the built-in `/login openai-codex` retains manual method selection. Cancellation closes the dialog, and duplicate clicks do not start competing logins. Native OpenAI authentication and selected model routing remain unchanged, so quota still requires the separate Codex grant. No Codex CLI or browser-cookie access is added; legacy remains untouched.
- Reload while idle with no active or retained subagents, or restart Pi, to load the change. Existing `/login openai-codex` followed by `/usage` remains available.

## 2026-10-20: Show the connected Herdr version in Pi's footer

- Default Pi now shows `η v<server-version>` before its existing `π` version when running inside Herdr. It reads the connected server, not the installed CLI, so older running servers remain distinguishable after an update.
- The bounded lookup runs once when the footer is installed, not during rendering. Outside Herdr or when status is unavailable, the segment is omitted. Reload while no subagents are active or retained, or restart Pi, to load it; legacy remains unchanged.

## 2026-10-18: Keep commit inspections from aborting the workflow

- Default Pi's `/commit` now separates ordinary read-only shell inspections from mutation calls instead of guessing from command text. Compound inspections and normal no-match results such as `git check-ignore` exit 1 return to the private agent for interpretation or correction rather than stopping the commit workflow.
- Failed staging, unstaging, ignore-file changes, commits/hooks, and publication still stop dependent work without undoing successful work. Failure diagnostics retain the full command instead of truncating the part most likely to explain the failure. Both shell tools retain the native executor and existing timeouts; the inspection tool is not a shell sandbox.
- Focused regressions cover compound inspection recovery through a real commit, complete failure commands, and existing mutation/hook failure handling. Reload while idle with no active or retained subagents, or restart Pi, to load the change. Legacy remains untouched.

## 2026-10-18: Keep empty vault lookups valid in Pi history

- Onclave's Pi adapter now serializes an unmatched YouTube video lookup as `null` instead of a text block with a missing value. The malformed block previously persisted in session history and caused subsequent OpenAI request preparation to fail, including after resuming the session.
- A regression test covers the empty lookup and its structured output contract. Restart Pi to load the adapter fix; existing affected history needs a separate targeted repair before resuming. Other lookup results and legacy configuration are unchanged.

## 2026-10-18: Refresh Webshare connections for transcript retries

- Onclave transcript fetching uses attempt-scoped Webshare proxy agents so rate-limit retries request a fresh connection instead of reusing a potentially rejected tunnel. Concurrent fetches do not share those agents; existing retry limits, backoff and request deadlines remain in place.
- Fresh connections allow the configured rotating proxy pool to select another exit IP, but do not guarantee a distinct IP or success when the pool is blocked. Credentials remain private and unchanged. The source change requires a published image and managed deployment before it affects the running service.

## 2026-10-18: Add an optional Playit game relay

- The game deployment can run the requested Playit agent as a persistent, digest-pinned container, with its key sourced privately from BWS. Host networking lets the agent forward configured tunnels to the existing game UDP ports without changing router rules or restarting the game.
- Playit tunnel allocation and local targets remain provider-side configuration; starting an authenticated agent alone does not establish a working player connection. Existing direct access, world settings and server credentials remain unchanged.

## 2026-10-17: Manage Zomboid sandbox and spawn choices

- The game deployment can enforce selected sandbox settings, built-in spawn towns and the PvP rule from BWS inventory. It patches only selected settings and restarts only the game when configuration differs, preserving other options and services.
- Normal redeployment never resets the world. An explicitly requested regeneration removes only the named multiplayer save, including characters and world progress, while retaining server configuration and account credentials. Starter kits affect new characters, including replacements after death.

## 2026-10-17: Separate portable repository IDs from native paths

- Default Pi now has shared repository-ID helpers alongside its platform-aware absolute-path comparison. IDs use forward-slash separators and `.` for the root; Windows tool inputs accept native separator spelling without changing POSIX literal backslashes, case, or path segments. Filesystem paths and shell-specific conversions remain separate.
- `/commit` uses that contract consistently for inventory, publication, ignore decisions, and result labels. This fixes Windows failures where `modules/onclave` did not match the native `modules\\onclave` inventory key. Captured branches, attached/detached eligibility, child-first publication, and stopping after an actual failed push are unchanged.
- Focused tests cover Windows/UNC and POSIX semantics on either host, plus multi-component child repository publication and ignore decisions with real temporary Git repositories. Reload while idle with no active or retained subagents, or restart Pi, to load the change. Legacy remains untouched.

## 2026-10-17: Enforce the managed Zomboid join password

- The homelab game deployment now loads the player join password from its own BWS runtime key, distinct from administrator, player-account and RCON credentials. Missing or empty join credentials stop deployment instead of removing the password.
- Ansible updates the password through Zomboid only when the persisted setting differs. The live change also saves the server configuration, without a restart or replacing other server options; password tasks and command responses are excluded from logs.

## 2026-10-17: Manage a Zomboid game stack on an existing Docker host

- Homelab infrastructure adds a targeted deployment for the Broccoli Project Zomboid server, authenticated Dozzle logs, and browser-based RCON administration on a separate existing Docker host. Deployment uses a dedicated Compose project and does not provision a VM or reuse the managed Apphost target.
- BWS owns host configuration and administration credentials. Game installation and world/configuration data persist separately; RCON stays inside the game network, while the two web interfaces use the host's existing Caddy HTTPS ingress. Only the game UDP ports are published directly. A player-facing hostname uses a public DNS-only A record and a managed LAN override, avoiding reliance on router NAT loopback; the public record must be updated if the WAN address changes.
- Existing services and deliberately stopped containers retain their lifecycle state. Caddy receives a bounded managed configuration block and graceful reload without replacing its single-file bind-mounted configuration. DNS certificate credentials are scoped to their respective sites, preserving the existing wildcard site's token rather than replacing it with a token for a different zone.

## 2026-10-17: Keep Codex quota authentication inside Pi

- Default Pi quota reporting now uses the active profile's existing `openai-codex` OAuth credential through Pi's authentication APIs. Pi handles storage and locked renewal across sessions; the reporter no longer depends on Codex CLI installation, its credential files, or an `app-server` subprocess. The prior CLI-only fix worked only on machines with that separate external sign-in.
- Machines without quota authorization use Pi's built-in `/login openai-codex` browser/device flow, then `/usage`. Existing Pi credentials need no new login. Native `openai` model authentication, selected models, quota caching, report contents, and legacy behavior are preserved; credentials are not copied between providers or machines.
- The footer now distinguishes missing login, renewal failure, rejected authorization, network/timeouts, and API failures, retaining explicitly stale quotas after failed refreshes. Reload while idle with no active or retained subagents, or restart Pi, to load the change.

## 2026-10-17: Prompt for SSH config reads

- Default Pi Damage Control now asks for approval to read `~/.ssh/config` instead of hard-blocking it. Writes, deletion, and reads of other SSH files remain blocked. Canonical target protections still apply to symlinks.
- Reload while idle with no active or retained subagents, or restart Pi, to load the change. Legacy behavior is unchanged.

## 2026-10-17: Install and update Herdr from the Bash installer

- `./install` now installs or updates Herdr on Linux, macOS, WSL, and Git Bash, matching `install.ps1`. It updates only when the installed version is older than the latest stable GitHub release (minimum 0.9.0 when GitHub is unreachable), using the official `herdr.dev` installers: `install.sh` on Unix (`~/.local/bin` unless `HERDR_INSTALL_DIR` is set) and `install.ps1` through PowerShell on Windows.
- Failure is soft: an existing Herdr keeps working and the step is reported as skipped. `install.ps1` behavior is unchanged.

## 2026-10-16: Add context-sensitive default Pi code review

- Added a `code-review` skill for reviews inside Pi with the selected model, including Codex subscription models, and assigned it to the existing independent reviewer role. Reviews investigate candidate defects, challenge their evidence, and distinguish confidence from practical importance and fix/defer/discuss recommendations.
- Priorities reflect the project's actual use, exposure, constraints, and accepted limitations. Confirmed minor issues can be deferred; relevant unconfirmed concerns can be discussed without becoming mandatory work. Generic best practices and hypothetical future scale do not create enterprise requirements for personal projects.
- Invoke `/skill:code-review` with the target and relevant context, or request an independent reviewer. Reload with no active or retained subagents, or restart Pi, to discover the skill and updated role. Existing model/effort defaults and repository-specific rules remain unchanged. No new command, Codex CLI integration, automatic fixes, mandatory check phase, or Claude/legacy changes.

## 2026-10-14: Report commit publication and Herdr status from actual results

- `/commit push` now publishes through a private Git tool and reports its actual command result instead of requiring an exact AI completion phrase. Existing child-first ordering, branch targets, failure handling, and push timeouts remain unchanged; no extra remote verification, approvals, or retries were added. The private task also identifies its local host and path conventions to avoid inventing WSL paths on Windows.
- Herdr lifecycle reporting now checks server response envelopes and exposes failed delivery through one non-blocking warning per session and a status that clears on recovery. The existing two attempts and quiet-subagent behavior remain unchanged. Preserve this local override when refreshing Herdr's generated integration.
- Reload while idle with no active or retained subagents, or restart Pi, to load these changes.

## 2026-10-14: Tolerate harmless Herdr naming response formatting

- Automatic tab naming now extracts title text alongside model reasoning, trims surrounding line breaks, and normalizes horizontal whitespace and case. Multiline explanations, unsupported content, punctuation, and oversized titles remain rejected.
- Naming instructions now state the same character and length limits as validation. Failed responses record bounded shape information, not conversation text or reasoning, to distinguish formatting failures.
- Pi model access, manual-title protection, timeouts, cooldown, and the failure cutoff are unchanged. Reload while idle with no active or retained subagents, or restart Pi, to load the change.

## 2026-10-14: Preserve commit outcomes for the next model turn

- `/commit`, F9, and F10 now persist final outcomes and full failure diagnostics in model context without triggering an automatic reply or recovery. The existing single displayed result and private runner remain unchanged.
- Corrects the prior completion change, which removed both redundant replies and next-turn visibility by using interface-only entries. Reload while idle or restart Pi to load the fix; previously displayed failures are not retroactively added to model context.

## 2026-10-13: Restore live Codex quotas without changing native model access

- Restored real subscription quota percentages to the default Pi footer and reset times, banked-reset counts and expirations, and credit balances to `/usage`. This replaces the local-cache-only workaround, which did not meet the request to restore subscription stats. Only reported quota windows are displayed; a missing five-hour window is no longer shown as an invented `0%`.
- Pi retains one native `openai` login and Sol 6.1 model access. Quotas use the operator-authorized existing, separate Codex CLI ChatGPT credential, not a shared OAuth grant or another Pi login. Native model authentication passed while the quota API rejected that credential; the Codex route could fetch quotas but rejected Sol 6.1. Codex owns renewal and persistence of its file-backed credential through its account API, without copying refresh tokens into Pi or changing the CLI's saved provider configuration.
- Restored shared five-minute quota caching and UI-only polling, with explicit stale/unavailable states on failure. Local cache history, Bedrock accounting, display-only report persistence, and legacy remain unchanged. Reports interrupted by immediate reload are discarded or completed once. Reload with no active or retained subagents, or restart Pi, to load the change.

## 2026-10-13: Complete default extension compatibility with Pi 1.2.0

- Herdr first-user tab naming now discriminates user and custom startup events before reading a prompt or consuming first-prompt state. Custom-triggered turns retain shared branch, delegation, and successor context. Updated event fixtures and added coverage for custom startup followed by a user prompt and branch context on custom runs.
- After the operator completed native OpenAI ChatGPT login, default startup was restored to `openai/gpt-6.1-sol` at low thinking. Pi 1.2.0 supports both native `openai` and the distinct legacy `openai-codex` route; the earlier temporary startup repair matched existing credentials, not a native-provider removal. Credentials were not copied or relabeled, and classifier routing, model-family behavior, safety policy, and legacy contents remain unchanged.
- Reload with no active or retained subagents, or restart Pi, to load the extension fix. Existing sessions retain their selected model until switched or restarted. Native/wrapped startup and a bounded native authenticated request were verified separately from offline event/model tests; interactive Herdr UX remains unverified and non-blocking.

## 2026-10-13: Restore Sol startup selection after Pi 1.2.0 upgrade

- Default startup and Sol 6.1's model-scope entry now use `openai-codex`, matching the installed Pi 1.2.0 runtime and the default profile's existing subscription login. The previous `openai` default could not match the authenticated model and new instances fell back to another provider. Model ID, low thinking default, other scope entries, credentials, and Anthropic billing warnings remain unchanged. This corrects startup selection only; existing sessions retain their selected model.

## 2026-10-13: Restore direct commit feedback and complete eligible groups

- `/commit` now reports results only through its session entry, without starting an extra main-agent turn. Private work uses Pi's standard animated loader above the editor with phase messages and cleanup on success, failure, or cancellation; ignore dialogs remain usable.
- Review guidance commits every eligible group, including tracked feedback records, and retains reasons for reviewer-selected exclusions. Ignore dialogs reject tracked modifications. Running time still depends on repository work and private model responses; the historical delay is not established by a successful UI correction.

## 2026-10-13: Focus tool-failure review history retrieval

- Tool-call analysis still reads all classification corrections, but searches and reads relevant prior incident reports instead of loading the entire analysis log before every review. Broader history is read when missing evidence could change the finding; durable records and explicitly requested exhaustive session reviews remain unchanged.

## 2026-10-13: Queue headless subagent follow-ups during busy turns

- Headless parent answers and waiting-state messages now explicitly queue as follow-ups when native Pi is still finishing its current turn. Registering a parent question no longer leads to an idle-only prompt rejection that fails the assignment.
- Idle follow-ups still start normally. Running-child steering, explicit redirects, question identity, and visible delivery remain unchanged. No new gate, retry loop, or timeout is added.

## 2026-10-13: Follow Pi upgrades in Herdr launches

- Herdr plugin setup now registers the stable default-profile dependency path instead of freezing a version-specific pnpm store entrypoint. New instances, branches, and hosted children resolve the linked package’s CLI on each launch. Refresh dependency links after a global Pi upgrade with `bash scripts/pi-deps-link-setup --profile default`, now recorded in root `AGENTS.md`; existing registrations need one setup refresh. Running sessions, explicit-entry registrations, preflight, and pane lifecycle remain unchanged.

## 2026-10-12: Discover system-wide Brave installs for Windows debugging shortcuts

- Windows Brave shortcut setup now finds per-user and system-wide installations, with `BRAVE_PATH` available as an override. The previous per-user-only default skipped this machine's Program Files installation.
- Desktop, Start Menu, and Quick Launch shortcuts, including True Launch Bar shortcuts stored in Quick Launch, retain their existing profile selections and unrelated arguments while adding explicit loopback CDP launch flags. Existing backup, idempotence, and browser-session ownership behavior is unchanged.

## 2026-10-11: Replace fragile test assertions with behavioral boundaries


[Showing lines 1-360 of 5191 (50.0KB limit). Use offset=361 to continue.]