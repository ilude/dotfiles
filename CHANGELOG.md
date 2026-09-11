# Changelog

## 2026-09-10: Add post-finding Steward guidance

**Added:** Default Pi now offers a read-only Steward after review or validation findings arrive. Callers normally supply the request, agreed checks, findings, and proposed fixes before follow-up work, while handling obvious bounded corrections directly. Steward advises whether evidence supports a bounded fix, a user question, deferral, or closeout; it does not approve work, edit, dispatch, reopen review, or add acceptance criteria.

**Guidance:** Steward defaults to Luna high and permits Luna high or xhigh. Selecting Sol or Astra for this role requires a concrete justification and user approval, with no automatic larger-model retry. Findings, severity labels, security terminology, and hypothetical risks do not independently expand task scope. Strategist remains the separate pre-assignment advisor, `/do-it` is unchanged, and no runtime approval mechanism or new review phase was added.

## 2026-09-10: Remove subagent native-path confinement

**Changed:** Default-profile subagents no longer reject native file-tool paths outside their assigned working directory, including symlink targets. This removes a custom restriction that terminated ordinary read-only lookups such as `find`. The working directory remains execution context; role tool permissions, coordinator launch-directory rules, and Damage Control are unchanged. No replacement approval prompts or path allowlists were added.

## 2026-09-10: Allow explicit plan ownership replacement

**Fixed:** `/plans` now treats plan-run records as observable execution activity: Run here and Run in new tab remain available and explicitly replace stale or live ownership records with a new token. Delivered work releases its execution record when the agent loop settles idle, regardless of saved plan markdown status, so later unrelated turns cannot resurrect `running`. Queued undelivered work, prompt blocking/resume, ambiguous launch failures, and direct `/do-it` adoption protection are unchanged.

## 2026-09-10: Complete restricted child accounting and provenance

**Fixed:** Native `amazon-bedrock` children now load an accounting-only extension, while Mantle children retain their provider-plus-accounting extension. Every restricted child records its active profile in session metadata. Operator commands, footer UI, Onclave, and general Herdr controls remain excluded.

## 2026-09-10: Make default log analytics query-driven

**Added:** The deferred `log_analytics` tool now exposes validated `search`, exact bounded `follow_up`, and explicit large SQL operations alongside cheap catalog/session discovery and standard SELECT queries. Results render compact matches, continuation/completion state, exclusions, bounded context, and phase/resource costs; expansion does not refetch data.

**Documented:** The analytics skill, reference, and Pi README now provide targeted lookup, last-week recorded tool-error, complete three-month traversal, and large global-SQL recipes. They describe event-time coverage, process-local cursor lifetime and change boundaries, metadata-only cache contents, standard versus large cost/temporary-disk ownership, cleanup failures, and recovery actions. Existing read-only shell fallback guidance remains available when the tool cannot answer.

**Preserved:** Existing JSONL writers, default/legacy read scope, read-only SQL restrictions, standard 5-second/512 MiB/1 GB/two-thread contract, and legacy profile behavior remain unchanged. Large mode is explicit and does not silently retry or raise memory limits.

## 2026-09-10: Preserve the system prompt when image tools activate

**Changed:** Deferred image tools no longer add active-only discovery snippets to the system prompt. Their searchable descriptions, schemas, processing behavior, and safeguards are unchanged. This removes a prompt-prefix change that can undermine cache reuse even with native deferred tool loading; it does not guarantee cache hits or change fallback schema handling for other providers.

## 2026-09-10: Add focused Pi extension development guidance

**Added:** The `pi-extension` skill defines the active profile from Pi's running configuration and guides extension development and review using installed APIs and comparable active-profile features. It carries concrete lessons for render callbacks, command feedback, subprocesses, and session-owned resources, plus stable prompt/tool prefixes, replaceable task context, and evidence-based cache reporting. This adds guidance only, not runtime behavior, telemetry, or an exhaustive review requirement.

## 2026-09-10: Let default-profile reviewers inspect repository state

**Changed:** General reviewers now have guarded shell access for Git status, working-tree diffs, and relevant checks. They remain non-writing reviewers with explicit no-edit/no-autofix instructions; this is a policy boundary rather than an OS sandbox.

## 2026-09-10: Keep simple Pi work with the orchestrator

**Changed:** Default Pi now delegates only for bounded implementation, parallel investigation, specialist research, or requested independent review. Other work stays with the orchestrator. Strategist remains the normal consultation before justified delegation, defaults to Sol low, reserves Astra low for named complexity, and rejects Luna effort below high. Duplicate `/do-it` guidance was removed.

## 2026-09-10: Account Bedrock usage from restricted default-profile subagents

**Fixed:** The provider-only Bedrock extension now records and annotates finalized child responses in the shared ledger without exposing operator commands or status UI. The parent refreshes its Bedrock footer when the turn settles, after child and tool activity, so cross-process writes are visible.

## 2026-09-10: Ground Pi engineering choices in comparable repository features

**Changed:** Default Pi's global guidance uses repository features with comparable purposes and operating environments as the baseline for patterns and safeguards. Generic best practices alone do not justify importing unrelated controls; departures need the request or concrete code/environment evidence. Choices affecting behavior, scope, safeguards, or workflow that remain unresolved by the request and repository evidence prompt a user question with a recommendation, while equivalent implementation details remain agent-owned.

**Clarified:** Consolidated investigation and verification guidance names evidence and stopping conditions: passing checks does not dismiss known task-related defects, and code evidence can establish a defect without reproducing a failure. The `agent-process` skill now favors direct, observable wording and consolidation over repeated rules, retaining implementation judgment without scores, reports, or approval gates. Scope and preservation boundaries remain unchanged.

## 2026-09-10: Allow read-only shell fallbacks for Pi history analysis

**Changed:** The default `pi-log-analytics` skill still prefers `log_analytics`, but explicitly permits `find`, `rg`, `jq`, `awk`, and `sort` when the tool cannot retrieve the requested evidence. Guidance preserves the requested scope, JSON field semantics, source coordinates and honest coverage reporting without adding another approval gate or a duplicate skill. Runtime analytics and legacy instructions are unchanged.

## 2026-09-10: Restore Bedrock providers in default-profile subagents

**Fixed:** Default-profile children using `bedrock-mantle` now load the provider registration without loading operator Bedrock accounting commands. Visible child startup failures preserve terminal input/output, report bounded non-secret diagnostics and exit status to the parent, and retain a generic fallback when no diagnostic is available.

**Preserved:** Legacy profile behavior, child isolation, and the previously committed provider payload fix remain unchanged. Reload or restart Pi before testing an already-running orchestrator; existing live children retain their loaded extensions.

## 2026-09-10: Keep Mantle Anthropic requests compatible after cross-provider history

**Fixed:** Mantle Claude routes now disable the inherited Anthropic mid-conversation effort capability, preventing unsupported `messages[].output_config` system entries and thinking-binding beta controls. Request-level `output_config.effort` remains intact, including low reasoning; native Anthropic and Bedrock Runtime routes are unchanged. Real-adapter serialization tests cover Codex history and the latest Haiku, Sonnet, Opus, and Fable routes. Capped live checks returned HTTP 200 for Haiku 4.5 (off), Sonnet 5 (low), Opus 5 (low), and Fable 5.1 (low, Bedrock Runtime).

## 2026-09-10: Add evidence-based Strategist delegation guidance

**Changed:** Default Pi now normally consults a read-only Strategist before subagent assignments and exposes a generated catalog of resolved role names, descriptions, and model/effort defaults. Orchestrators see all resolved roles; coordinators and nested Strategists see only the caller's frozen permitted subset. Catalog visibility does not grant dispatch authority.

**Guidance:** Assignments are split by responsibility, normally one plan task section per implementation worker, with prerequisite results incorporated before dependent launches. Model and effort recommendations cite observable inputs, interfaces, unresolved decisions, or actual failure cases. One stronger-family retry is allowed only after an attempted but unsolved assignment with required inputs and working tools. This addresses AIF-027 and APR-020 without treating the prior worker process exit as evidence of model weakness.

**Preserved:** Strategist advice is recommendation-only, councils remain explicit-user-request only, existing role defaults and frozen child authority are unchanged, and `/do-it` continues executing settled intent rather than reopening planning or acceptance.

## 2026-09-10: Fix autocomplete submission for all argument commands

**Fixed:** Default Pi now limits argument suggestions to partial input for every slash command with autocomplete. `/luna`, `/astra`, `/sol`, `/fable`, `/effort`, `/context`, and profile commands such as `/commit` submit immediately when their argument is empty or already complete, while partial arguments still autocomplete.

## 2026-09-10: Allow directly requested commit tooling

**Changed:** Default Pi now permits `commit_run` when the operator requests a commit by name or intent, without requiring a synthetic `/commit` invocation first. Direct calls are commit-only. Explicit `/commit push` remains the sole way to grant that invocation push authority.

**Reviewed:** The other default-profile slash commands do not expose command-owned tools behind comparable invocation gates. They are direct UI/runtime handlers, prompt templates, or the tool-free `/bro` prompt.

## 2026-09-10: Simplify and block flagged web-tool results

**Changed:** Default Pi web fetches now display `webfetch: <url>` followed directly by bounded parsed content, and searches display `websearch: <query>` followed by results. Gateway and recovery metadata stay out of the model-visible page. Successful Luna screening is silent. If Luna flags possible prompt injection, the tool fails before returning web content or suspicious excerpts to the conversation.

## 2026-09-09: Reduce subagent tool-output clutter

**Changed:** Default Pi's subagent rows remove repeated identity, role, and generic working labels while retaining the actual prompt preview, selected model/effort, readable local start time, and elapsed or completed duration. Native expansion reveals the full prompt and execution details. Routine attachment bookkeeping no longer competes with live activity, questions, errors, or results.

**Preserved:** Model-facing payloads, subagent lifecycle, and the legacy profile are unchanged. Use `/reload` after subagents settle to load the renderer changes.

## 2026-09-09: Register new Herdr Pi tabs immediately

**Fixed:** Herdr `/new-instance` and `/branch` plugin tabs now register their pane with the Agents view during bootstrap, before a fresh Pi session necessarily has a persisted session reference. The generated Herdr integration still attaches session identity and owns subsequent working, blocked, and idle lifecycle updates.

## 2026-09-09: Bind command authority to delivered invocations

**Fixed:** Default Pi's prompt-backed commands now prepare tool schemas before native steering while binding execution authority to the locally-created invocation delivered by Pi. `/commit` push permission is immutable per slash invocation, so overlapping bare and `push` submissions cannot change one another; retries, compaction, ordinary steering, and unrelated active tools remain supported.

**Preserved:** Schema availability is not authorization, restored transcript details cannot recreate authority, and command tools are cleaned up only at settlement or session shutdown. No busy-command gate, finish-first queue, follow-up delivery substitute, Git workflow change, or legacy-profile change was added.

## 2026-09-09: Honor Damage Control TUI approvals

**Fixed:** Damage Control now preserves the TUI approval component's string result instead of converting it to a boolean, so selecting `Allow once` or future-review approval can authorize the pending call. Denial and cancellation remain fail-closed. Use `/reload` to load the fix.

## 2026-09-09: Make bare Pi use the default profile

**Changed:** Interactive zsh and PowerShell now route bare `pi` invocations through the existing `pp` launcher, so the repository-owned default profile and Damage Control startup preflight no longer depend on remembering a separate command. Arguments continue to pass through unchanged, while `pp -p legacy` and other explicit profile selection remain available.

**Safety:** PowerShell resolves the external Pi executable before launching it, preventing the new shell function from recursively invoking itself. Herdr plugin launches retain their separate profile-aware bootstrap.

## 2026-09-09: Avoid accidental commit push completion

**Fixed:** Default Pi's `/commit` argument completion no longer suggests `push` for an empty argument or an already-complete `push`. Enter submits `/commit ` without adding push, and `/commit push` without an extra completion-selection step. Partial arguments such as `/commit p` still offer `push`.

**Preserved:** Luna's private commit workflow and explicit push authorization are unchanged. Use `/reload` to load the fix.
## 2026-09-09: Deliver subagent messages and failures during work

**Changed:** Default-profile subagent messages now use native queued steering by default, with explicit immediate redirection and question-answer request correlation. Parent questions yield cleanly into a visible waiting state without a polling tool, and retained status is no longer required for an active child to receive a message. Automatic outcomes reach busy parent/coordinator conversations during work and are acknowledged once without replay or receipt chatter.

**Fixed:** Permission-dialog input no longer implicitly takes over a visible child. Native terminating tool failures preserve the tool name and bounded reason on headless and visible surfaces, while recoverable tool failures clear when a valid final reply follows. Control rejections now use native tool errors; successful inspection still returns failed assignments as data. Call rows own identity, assignment, and configuration, while result rows own activity, outcomes, errors, and timing.

**Preserved:** Workspace and selected-skill read boundaries, explicit intervention handback, origin scoping, cleanup ownership, retained conversations, and the settled-only reload boundary. No durable message store, retry/reminder loop, approval layer, or live provider acceptance was added.

## 2026-09-09: Make log analytics tool output readable

**Changed:** Default Pi's `log_analytics` now renders operation and search scope, readable source/session summaries, and query results as compact tables or labeled records rather than dumping arguments and a single JSON string. Collapsed results preview three rows; expansion shows all returned values, full SQL and parameters, session references, and scan diagnostics. Query truncation, session pagination, excluded-file warnings, empty results, and failures remain explicit. Long preview values are marked with an ellipsis, and terminal control sequences in stored history are removed from display.

**Preserved:** Model-facing JSON, query behavior, resource limits, deferred activation, and the legacy profile are unchanged. Expanding a result does not fetch another page or recover rows omitted by backend limits. Use `/reload` to load the new renderer.

## 2026-09-09: Make plan execution outcomes explicit

**Changed:** `/do-it` and generated plans now lead their final response with a colored symbol and explicit outcome: completed, merge blocked, user input required, merge intentionally skipped, or cleanup pending. Blocked results put the reason and required next action before implementation successes, including who must act and where work is retained. Passing tests and archival alone do not imply completed integration; unfinished integration/cleanup checkboxes remain unchecked.

**Preserved:** Routine problems remain agent-owned, `--no-merge` is intentional rather than an error, and manual testing remains non-blocking. Symbols supplement text rather than replace it; appearance depends on the terminal. This changes instructions only, not runtime tracking, rendering, or Git authority.

## 2026-09-09: Preserve Onclave deliveries across handling failures

**Fixed:** The shared Onclave Pi adapter now checkpoints bounded per-delivery effects instead of treating receipt as completion. Transient failures remain available for lease-expiry redelivery, completed injections are not replayed after audit or acknowledgement failures, concurrent duplicates are not acknowledged prematurely, and retained task identity is reused during retries.

**Validation:** HTTP and AMQP task-status handling now share one normalized parser that rejects malformed protocol fields before correlation or UI delivery. Focused adapter, envelope, and core tests passed without a live broker, credentials, model calls, or deployment.

## 2026-09-09: Prevent duplicate plan execution across Pi tabs

**Changed:** `/plans` now overlays live execution status and the owning tab/process on the saved plan metadata. Both run shortcuts are disabled for owned plans in Browse and Details, including after reopening the picker. Atomic profile-local reservations also close the race between two already-open pickers; tab creation and current-instance queueing reserve before submitting work.

**Lifecycle:** New tabs adopt a token-bound reservation. Actual prompt delivery marks work running, rather than assuming a created tab or a prequeue input event means execution started. Waiting and blocked work remain protected. Settled completion/archival, session replacement/exit, and confirmed dead owners release ownership; reload preserves it. Uncertain launches and unreadable state fail closed. Plan frontmatter, copy/open actions, and existing archive eligibility remain unchanged.

**Scope and checks:** Tracking requires the updated extension before launch and covers `/plans` plus observed explicit direct-child `/do-it` paths. Older untracked runs, implicit selectors, other profiles, and separate worktree copies are not inferred or globally locked. Tests cover filesystem claims, lifecycle and queue semantics, and UI guards. Isolated native Pi/Herdr acceptance uses a deterministic loopback model response to verify real startup, running/waiting status, duplicate suppression, and process-death cleanup without executing a real plan.

## 2026-09-09: Preserve the first Bedrock accounting baseline

**Fixed:** Bedrock reconciliation now enforces create-once semantics at final filesystem publication, not only during the command's early check. Concurrent sessions cannot replace the first complete personal CloudWatch snapshot or move its accounting cutoff.

**Failure handling:** Existing valid, malformed, or empty destinations remain untouched. Rejected contenders report that a baseline already exists, and failed creation removes task-owned temporary files without leaving an empty baseline that blocks a later capture. AWS queries remain outside the lock.

## 2026-09-09: Preserve subagent ownership through cleanup failures

**Fixed:** Default subagent assignment outcomes are now recorded separately from process and visible-pane cleanup. Failed termination or pane closure remains observable with bounded cleanup errors and can be retried without losing the owned child.

**Lifecycle:** Cleanup attempts all applicable children, keeps authenticated controls available for unresolved resources, and does not replace the runtime during `/clear` until cleanup succeeds. Successful cleanup is idempotent and does not duplicate outcomes. Parent shutdown still makes a bounded attempt and reports failures; acknowledged user-owned visible children remain excluded by the existing quit contract.

**Scope:** The operator's settled-only `/reload` assumption and active-child reload behavior are unchanged. Validation uses inert fixtures and injected cleanup failures, not production Herdr operations or live orphan recovery.

## 2026-09-09: Make plan-tab launch an acknowledged, single action

**Fixed:** `/plans` now shows Launching immediately in the originating view and ignores repeated input until the launch settles. Herdr Pi-tab requests no longer block the UI thread. Successful creation explicitly focuses the returned tab and dismisses the picker rather than reopening Details with another active launch action. Copy/open actions and failures also preserve the originating Browse or Details view.

**Failure handling:** Clearly prelaunch failures allow retry; uncertain requests and failures after tab creation warn that a launch may already exist and block further execution of that plan within the current picker. There is no automatic relaunch or focus restoration. Existing clipboard behavior, current-instance execution, archive checks/confirmation, and Herdr-only new-tab support remain unchanged. The shared fresh-instance and branch launch callers now await the same asynchronous tab handoff.

**Validation boundary:** Delayed-launch tests cover immediate feedback, duplicate suppression, dismissal, preserved view/selection, and failure handling. Isolated real-Herdr acceptance verifies one focused destination tab and the exact bootstrap `/do-it` command with an inert child. It does not execute a plan or establish attached-client rendering or model readiness.

## 2026-09-09: Bound Damage Control bypass to parsed local effects

**Fixed:** Default-profile `/dc off` now bypasses only valid contextual asks whose complete parsed invocation is an eligible local rm, Git, Docker, or contained environment-file operation. Dynamic or out-of-repository targets, mixed remote effects, Git remote operations or endpoint overrides, Docker volumes, confirmed policy boundaries, and review failures retain approval or blocking behavior. `/dc on`, ordinary recoverable work, and legacy behavior are unchanged.

## 2026-09-09: Make plan action shortcuts work from either view

**Fixed:** `/plans` no longer silently ignores action keys in Browse. `o` Open in VS Code, `c` Copy command, `r` Run here, `d` Run in new tab, and `a` Archive operate on the selected plan directly from either Browse or Details. Enter remains optional inspection. The browse legend now says Actions rather than In details. Herdr launch requirements, current-instance routing, and archive checks and confirmation remain unchanged.

## 2026-09-09: Separate plan browsing from plan actions

**Changed:** Default Pi's `/plans` now uses a framed, padded overlay with full-row selection highlighting, aligned status and task columns, and height-bounded scrolling. List entries are labeled and sorted by `.specs/` directory stub rather than prose title; the selected preview shows the human-readable title, directory path, and summary to make the mapping explicit. Enter opens a separate details screen with Open in VS Code, Copy command, Run here, Run in new tab, and Archive actions. `c` copies `/do-it .specs/<stub>/plan.md` without executing it; `r` closes the picker and submits that command in the current instance with native template expansion, queuing behind any active work; `d` retains the focused Herdr new-tab launch. Both views clearly distinguish the two execution destinations. The high-contrast browse legend advertises these details-only shortcuts alongside navigation; cramped layouts reduce preview text and metadata before clipping controls. Esc returns to the selected list row; `q` closes either view. The temporary picker does not become transcript content, and action errors or archive cancellation return to the same plan's details.

**Preserved:** Exact plan selectors, archive eligibility checks and confirmation, and legacy behavior remain unchanged. New-tab execution remains Herdr-only with no terminal fallback; copying and running here do not require Herdr. Terminals too small for the controls show a closable resize notice. Non-terminal modes reject the picker instead of attempting unsupported custom UI.

## 2026-09-09: Separate plan authoring from execution

**Changed:** The default planning skill now only creates, reviews, and explicitly revises standalone implementation plans. Plans preserve user intent for fresh-context Sol execution at low reasoning while leaving routine technical mechanisms flexible and keeping consequential decisions in planning.

**Execution and closeout:** `/do-it` now executes the selected plan directly without loading the planning skill or reopening settled decisions. Existing selector and `--no-merge` behavior, dedicated worktrees, local commits, recorded merge targets, unrelated-change preservation, and separate push/deployment authority remain unchanged. Completion follows archive and task-branch commit, successful merge, then final completion metadata. Operator manual testing is a non-blocking verification limit after agent-owned checks, not a closeout gate.

## 2026-09-09: Add an interactive implementation-plan browser

**Added:** The default Pi profile now provides `/plans` to browse direct-child `.specs/*/plan.md` files, inspect concise details, open a selected plan in VS Code, launch its `/do-it` workflow in a new focused Herdr Pi tab, or archive an already-completed plan after strict eligibility checks and confirmation.

**Safety and compatibility:** Herdr plan launch accepts only a validated repository-relative plan selector and constructs the initial `/do-it` message in the setup-owned bootstrap. It does not expose arbitrary argv or prompt forwarding and has no non-Herdr terminal fallback. Archival requires completed status, a completion date, no unchecked tasks, and a free destination. Legacy and `/review-it` remain unchanged.

## 2026-09-09: Label the startup Herdr pane as Orchestrator

**Changed:** Initial interactive default-profile Pi startup in Herdr labels its own inherited pane `Orchestrator` and its tab with the working directory's basename, such as `.dotfiles`, without changing focus. Subagent labels and later user renames are preserved; chat replacement and reload do not reset either label. A bounded labeling failure warns without preventing startup. Non-Herdr and noninteractive helpers remain unchanged.

## 2026-09-09: Specify Luna's commit tool and command workflow

**Changed:** The default commit reviewer now uses supplied initial status and the existing Git-review tool for status refreshes and diffs, instead of improvising shell status options. Its ordered instructions include concrete tool examples, per-repository command templates, quoting, staged/unstaged review, pagination, submodule ordering, and explicit push handling. Runtime input supplies exact root and whitespace-utility paths; utility arguments no longer suggest an unsupported `--` separator.

**Preserved:** Automatic grouping, ignore-file questions, quiet results, normal hooks, three transient provider retries, and stopping on actual Git/tool failures. This addresses the invalid `git status --submodules=short` failure without adding a generic executor or promising failure-free model behavior.

## 2026-09-09: Keep the Herdr orchestrator below subagents

**Changed:** Default-profile subagent panes now form a row above the orchestrator, leaving it at the bottom with approximately two-thirds of the height. Four-per-tab placement, overflow tabs, pane/process identities, and owned cleanup remain unchanged. An empty primary child row can be recreated while overflow children remain.

**Compatibility:** Herdr 0.9.0 supports only downward plugin splits and focuses the source of a pane swap. Initial placement swaps the first child above the caller and restores the previously viewed pane through the public focus API when no later focus change is observed. This restoration is best effort, not atomic. Isolated inert-pane geometry/focus acceptance passed; attached-client confirmation is still needed. Reload Pi with subagents settled to activate the source change.

## 2026-09-09: Avoid noisy reload indicators

**Changed:** Default Pi's reload monitor compares resource contents instead of file timestamps and size. Metadata-only touches and settings formatting or key-order changes no longer request reload. Immediate default model, provider, thinking-level selections and the last-seen changelog version are ignored; resource configuration and enabled-model scope remain watched. Additions, deletions, monitoring errors, two-second polling, and existing lifecycle/event-bus ownership are preserved.

## 2026-09-09: Keep existing conversations quiet on startup

**Changed:** Default Pi no longer appends the automatic Codex/cache/Bedrock usage report when `/branch` opens copied history or startup resumes an existing conversation. Footer refreshes and explicit `/usage` remain available; fresh-session startup, `/new`, and `/clear` retain their reports. Existing transcript entries are preserved.

## 2026-09-09: Retry transient commit transport failures

**Changed:** Default-profile `/commit` now gives transient provider and transport failures up to three retries before returning a hard failure. Deterministic Git, hook, cancellation, and timeout failures still stop immediately, and final reporting continues to inspect actual repository state.

## 2026-09-09: Add effort options to model shortcuts

**Changed:** Default-profile `/astra`, `/fable`, `/luna`, and `/sol` now accept an optional `low`, `medium`, `high`, or `xhigh` effort argument with autocomplete. Invocations without an effort preserve the existing model-switch behavior.

## 2026-09-09: Remove persistent subagent status output

**Changed:** Default-profile subagents no longer render an always-visible status widget or repeat settled result previews above the editor. Active tool rows, transcript outcomes, and explicit `/subagents inspect` retain progress, results, errors, and controls without persistent duplicated output.

## 2026-09-09: Install stable Herdr on Windows

**Changed:** The Windows installer now installs the official stable Herdr release when Herdr is missing or older than 0.9.0. It uses Herdr's official PowerShell installer, verifies the resulting binary and version, and reports failures through the existing package-install failure summary. Existing 0.9.0-or-newer installations are preserved.

## 2026-09-08: Reconcile subagent UX acceptance status

**Corrected:** Earlier subagent layout/transcript checks were server-side and opt-in historical evidence, not proof of attached-client acceptance. The subsequent operator acceptance failed on reload activation and reported focus/layout defects; the bounded follow-up remains incomplete.

**Lifecycle boundary:** Explicit `/reload` must end every subagent runtime, conversation, and process, including idle retained children, before loading replacement code. No unsupported-active migration or special cleanup path is required. Source edits do not upgrade an already-running operator session, and the first transition from the earlier lifecycle was not live-tested.

**Validation boundary:** The final sanitized task-profile suite passed 118 tests with 6 skips and no failures; runtime checks passed 335 rules and 8 schemas. Typecheck retains the baseline commit-whitespace TS7016 error. No model-backed or attached-client acceptance run occurred because the initial swap focus theft and 5+ child second-row geometry blocker remain unresolved. Archive, commit, merge, push, and deployment remain separately unauthorized.
## 2026-09-08: Preserve settled implementation-plan decisions

**Changed:** The default planning skill now distinguishes questions about a plan from authorization to rewrite it. Execution updates progress and evidence; changing scope, acceptance criteria, or settled operator decisions requires explicit approval. This corrects a Damage Control handoff that reopened an already-decided watchdog reset policy and mistook isolated worktree code for a requirement to establish a separate login. Existing authentication is reused for worktree validation without copying credentials.

## 2026-09-08: Align Damage Control with consequence-based risk and script reuse

**Changed:** Default Damage Control now allows established recoverable maintenance without treating flags, encoding, persistence vocabulary, or ordinary generated names as danger by themselves. Contextual Luna judgment covers mixed-risk deletion, Git, container, infrastructure, publication, scheduling, database, and process operations while root/home destruction, meaningful unique work, recovery loss, sensitive disclosure, and independent push/deployment authority remain protected.

**Policy repair:** Active rule identities now describe operations rather than migration order, including path-protection evidence. Generic recursive/forced cleanup reaches the existing Luna reviewer with the complete temporary-resource lifecycle; no new temp-path parser or diagnostic judge is added. The evaluator now follows full production analysis and reports routing separately from live judgment, including explicit unverified outcomes when its task profile lacks Luna authentication.

**Added:** `/dc scan` uses bounded read-only subagents to review project-owned scripts without executing them. Git-common-directory YAML records bind approval to source hashes and optional exact argv/helper hashes; matching invocations skip only body analysis. Eligible prompts can allow the current call and commission future review asynchronously.

**Control:** The watchdog permits twelve adjacent failures of an exact tool/input/cwd call and blocks attempt thirteen. Unrelated calls and success reset the streak, and repeated successes are unrestricted. Legacy is unchanged; this adds no mandatory scan, environment inventory, sandbox, dependency resolver, or telemetry service.

## 2026-09-08: Add human-readable subagents and stable visible layout

**Changed:** Default-profile subagents receive stable session-scoped human names while retaining UUID transport identities. Launch, progress, control, question, and outcome rows now show bounded readable assignment, resolved model/effort, surface, timing, activity, result, and error details instead of generic labels and raw JSON. Exact case-insensitive names work anywhere the caller already has UUID-based authority.

**Layout:** Visible descendants share an origin-owned layout above the unchanged orchestrator, filling two rows of four before using non-focused overflow tabs in groups of eight. Placement and cleanup use exact returned IDs, serialize mutations, preserve unrelated focus and panes, and keep existing process-settlement, retention, intervention, and no-headless-fallback behavior. Isolated Herdr geometry and one bundled-Pi launch/follow-up/completion run passed; physical attached-client keyboard behavior remains outside automated acceptance.

## 2026-09-08: Compact default Pi Bedrock usage output

**Changed:** Default Pi's `/usage` and `/bedrock` reports now use the legacy profile's compact Bedrock presentation: short model totals, compact token counts, two-decimal costs, a concise CloudWatch baseline, and a simple total. Accounting cutoffs and unpriced-request warnings are unchanged.

## 2026-09-08: Recover Bedrock month-to-date cost baselines

**Added:** Default Pi's `/bedrock reconcile` now captures a one-time, IAM-user-scoped Amazon Bedrock usage estimate from the user-scoped CloudWatch Bedrock invocation logs when the local ledger has no AWS baseline. The footer, `/bedrock`, and `/usage` report that snapshot separately and add only local request estimates recorded after its capture time. Existing baselines are not silently replaced because Cost Explorer delay makes moving the accounting cutoff unsafe.

## 2026-09-08: Reset upgraded subagents through `/clear`

**Changed:** Default Pi's `/clear` now stops owned subagents and replaces the process-global subagent runtime before opening the clean chat. A stale pre-upgrade owner can therefore be cleared without manually finishing or cancelling each child. Restarting Pi remains sufficient because normal shutdown already cleans up owned children; `/reload` alone continues to preserve live owners.

## 2026-09-08: Observable subagent work and reliable outcome delivery

**Changed:** Default Pi shows origin-scoped, coalesced subagent progress in a widget without triggering model turns or flooding the transcript. It distinguishes meaningful activity from transport contact, keeps cleanup errors visible, and provides same-child wait reattachment plus explicit detach/cancel feedback. Completions, failures and factual questions return automatically to the parent agent; busy/inactive chats retain acknowledged outcomes. Coordinator leaves also return outcomes automatically, while user-only approvals still go to the originating user. No scheduler, inactivity cancellation, or automatic retry was added.

**Fixed:** Native RPC aggregate events could exceed the old 1 MiB frame limit after a child had already produced its final answer. A synthetic native `agent_end` reproduces this mechanism; incident journal timing and sizes support it, although the original wire frame was not retained. RPC now uses a bounded growing buffer with a separate 16 MiB frame allowance, concrete non-payload diagnostics, observed prompt rejection, and owned process-tree cleanup. Application-channel and final-result limits are unchanged.

**Focus constraint:** Background Herdr launches must preserve the user's currently focused pane, tab and workspace, not restore the caller. Isolated regression checks cover preflight, plugin creation and cleanup across tabs/workspaces. The reported attached-client focus jump remains unreproduced; these checks do not establish that it is fixed. Production Herdr wiring was not changed. `/reload` preserves an already-running pre-change owner instead of replacing live children and reports this boundary explicitly; `/clear` or a Pi restart now performs the required cleanup without manual per-child steps.

## 2026-09-08: Simplify schedule tool output

**Changed:** Default Pi schedule confirmations, lists, and cancellations show local dates and times with timezone labels, short cancellation IDs, and separate prompt previews with explicit truncation. Confirmations replace the lifecycle paragraph with a brief reminder to keep Pi open. Scheduling and follow-up delivery behavior are unchanged.

## 2026-09-08: Clarify subagent visibility selection

**Changed:** Default root and coordinator delegation tools instruct models to omit surface for normal delegation and select headless inside Herdr only on user request, not for parallel, unattended, or worktree tasks. Coordinator children continue to inherit their parent's surface. Runtime selection and authority are unchanged; this instruction correction does not resolve the separately reported headless progress and transport failures.

## 2026-09-08: Add default-profile subagent delegation

**Added:** Markdown-defined default roles, direct and coordinator delegation, retained conversations, bounded origin-scoped results, explicit control commands, Team Lead guidance, and councils only when requested. Native Herdr children preserve focus; RPC is the default outside Herdr and an explicit override inside it. The existing shell-free bootstrap gains a per-launch process owner and authenticated parent communication, not a permanent worker service.

**Lifecycle:** Parent reload/chat changes preserve children and deliver results once to the originating journal. Factual questions and user-only prompts have distinct paths. Direct user help suspends parent steering until handback; parent exit stops ordinary children but preserves directly helped visible children as parent-unavailable. Result capture, process exit, and pane cleanup remain separate; finished panes close immediately without zoom restoration.

**Safety:** Definitions freeze tool and delegation authority per child. Trusted project overrides fail closed, empty tool lists remain empty, selected child resources retain Damage Control, and children do not load Onclave or general Herdr authority. Tool ceilings are not represented as OS sandboxes.

**Preserved:** Counts and council structure remain instructions rather than quotas or workflow gates. Legacy and Onclave module code are unchanged.

## 2026-09-08: Add bounded plan execution through /do-it

**Added:** Default Pi's native `/do-it [--no-merge] [plan-path]` prompt template completes the current or specified plan using the existing planning skill and task worktree. Scope and agreed checks stay fixed; the whole completed spec directory, including reviews, is archived and committed before local integration into the recorded parent checkout's branch.

**Control:** `--no-merge` is accepted before or after the plan selector and retains the committed task worktree without merging. Missing or ambiguous plans and consequential blockers are surfaced rather than guessed away. This is an instruction workflow, not a new execution engine; push and deployment remain separately authorized. Legacy is unchanged.

## 2026-09-08: Clarify Damage Control's purpose and review inherited restrictions

**Design:** Default Damage Control's governing requirement is prevention of meaningful unrecoverable harm, not blanket intervention on suspicious-looking or unfamiliar actions. Routine recoverable work should remain quiet; uncertainty matters when it changes the risk of consequential loss or disclosure. Legacy parity is compatibility history, not the design objective.

**Reviewed:** A bounded policy/decision-path review separates inherited and explicitly preserved rules from port implementation choices. Offline parser/engine probes confirm unnecessary restrictions on recoverable cleanup and encoding, inconsistent path/sequence handling, and an overly broad cwd-based deletion exemption. Recorded `/dc scan`, shared-worktree preapproval storage, and the single-script review choice as future design context without adding a dependency framework or approval ceremony.

**Unchanged:** Runtime code, policy YAML, judge authority/prompts, legacy, and ongoing subagent implementation. No reviewed commands executed, no live model calls, and no enforcement relaxation. The findings guide subsequent scoped implementation rather than authorize a general rewrite.

## 2026-09-08: Complete and reconcile web-fetch gateway acceptance

**Completed:** Reconciled the stale paused gateway plan against implemented deployment and BWS credential delivery. Current checks passed for ordinary default Pi direct/link-following and browser retrieval with Luna without gateway overrides, HTTPS authentication and anonymous rejection, and all 15 observed SQLite route rows surviving a gateway-only restart with WAL enabled. The browser container was unchanged; no redeployment or new acquisition machinery was needed.

**Corrected:** Infrastructure documentation now reflects the implemented digest-specific age exception and lazy BWS discovery. Existing validation exposed standard-address scanner annotations, stale service-catalog test expectations, and gateway-role lint issues; these were corrected without changing application behavior or widening global validation exemptions. The single final `just validate` invocation initially failed; its constituent checks were completed through affected retries and unfinished stages, not another full validation loop.

**Integrated:** Infrastructure changes were merged and published before the dotfiles gitlink and dated plan archive. Task worktrees isolate the work. Legacy, SearXNG, Onclave, image pins, and credentials are preserved; no dotfiles push. Results are dated acceptance evidence, not ongoing-health or injection-resistance guarantees.

## 2026-09-08: Add default Herdr process tools and direct Pi tabs

**Added:** Repository-owned, deferred Herdr layout/pane tools call the installed CLI with concise schemas and bounded output. A thin skill dynamically loads installed documentation and uses visible panes automatically for requested long-running processes. Command submission verifies an idle Bash/PowerShell shell and cwd, uses existing Damage Control, and rechecks identity. Silent-success mutations are not misclassified or retried.

**Changed:** Herdr `/new-instance` and `/branch` use a local argv plugin and Node bootstrap instead of a shell-hosted `pp`. The bootstrap preserves default preflight/repair behavior and explicitly retires its plugin pane on exit because the installed preview can otherwise replace focused exited terminals with shells. Setup generates machine-local executable paths and must be rerun after moving/updating the runtime.

**Preserved:** Plain `/new-terminal`, non-Herdr launchers, default UI, and sound/desktop settings. Herdr's generated lifecycle integration plus a native prompt bridge reports operator waits without a second notification layer. Services are not stopped on Pi exit; log-viewer closure does not imply container teardown. No third-party Pi extension, delegation, supervisor, or process registry.

## 2026-09-08: Bound planning uncertainty and integrate work through task worktrees

**Changed:** Default Pi planning pairs consequential uncertainty with focused questions and recommendations, distinguishes required outcomes from proposed mechanisms, and bounds assumption checks to useful decisions. Simplification must preserve required functions, and handoffs must replace stale status with current evidence.

**Workflow:** Authorized plan execution uses dedicated task worktrees and branches. Local task commits and merge are included unless explicitly restricted; completed implementation and its dated archived plan integrate together. Cross-repository work retains module-first ordering and repository branch/publication rules. Blocked integration is reported separately, unrelated changes are preserved, and task worktrees are removed only after clean integration. Planning alone does not authorize execution; deployment and push remain separately authorized.

**Scope:** Skill, template, and documentation only. No new runtime, mandatory investigation phase, reviewer loop, or changes to legacy or existing plans. Prose consistency and Git integration are checked; reduced future supervision is not yet verified.

## 2026-09-07: Isolate invalid session headers in default log analytics

**Fixed:** A historical telemetry backfill under legacy sessions no longer prevents discovery or queries of valid sessions. Non-session, empty, malformed, and oversized headers are skipped with explicit exclusion counts and bounded file diagnostics in listing and session-query coverage. Explicit unresolved references, access errors, path escapes, cancellation, and query resource limits still fail. Historical data and the legacy runtime are unchanged.

## 2026-09-07: Port Onclave orchestrator communication to default Pi

**Added:** Default Pi loads the existing Onclave adapter through a thin module-owned integration, exposing instance discovery, ask/request/inform messaging, automatic connection/reconnect, and `/onclave` status. Orchestrator-only communication rules live in tool guidance; subagents remain excluded.

**Changed:** Trusted VLAN/tailnet requests no longer require host confirmation or allowlist setup. Incoming work uses native Pi follow-ups while busy. Replies wait for settled runs and distinguish completion, provider failure, and cancellation. Ask waits ignore intermediate status, exchanges remain correlated within a conversation, unmatched statuses stay inert, and shutdown settles local waits. The shared adapter now requires Pi 0.85.x; these adapter changes also apply through the legacy loader.

**Preserved:** Existing signed transport, endpoint lookup, two-tool schema, profile-local audit, and separate YouTube workflows. No restart recovery, infrastructure/deployment changes, or live-service acceptance gate. Validation is offline; the operator performs live checks after implementation.

## 2026-09-07: Repair default Pi reload state across extension loaders

**Fixed:** The footer and `/clear` now obtain reload state from the monitoring extension through Pi's shared event bus. Separate extension loaders previously created separate imported singletons, leaving consumers permanently unaware of changed source. Polling and subscriptions have explicit session owners; cached-factory session replacements retain the baseline until source is reevaluated. `/clear` warns if monitoring is unavailable rather than silently treating it as clean.

**Verified:** Production bundled-loader regressions cover both initialization orders, library edits, narrow footer rendering, cached session replacements, source reevaluation, errors and cleanup. Existing Damage Control and Codex behavior is preserved; no provider calls, policy changes, legacy changes or operator-session reload are introduced.

## 2026-09-07: Review selected Damage Control actions in their environment

**Changed:** Default Damage Control gives Luna contextual authority over 34 selected Compose teardown, Kubernetes/Helm, database reset/delete/restore, and targeted process-termination rules. Intended work on established local development, disposable-data, or task-owned process targets can proceed without an operator prompt. Shared/production impact, meaningful data loss, unresolved scope, or review failure still requires approval. Known read-only scheduler queries pass directly; Kubernetes/Helm leading environment flags no longer hide their operation from rule matching.

**Supporting fix:** The context collector was a no-op, so merely changing Compose's rule could not supply earlier environment facts. Review now receives bounded session-local direct inputs and successful covered tool observations, with provenance, outbound redaction, expiry, and reset boundaries. Tool output is evidence, never operator authorization. No mandatory environment scans, daemon inspection, resource ledgers, approval cache, or persistent telemetry were added. Reload does not reconstruct old context.

**Preserved:** Separate Compose volume/image-removal approval, broad cluster deletion, secret protections, unrelated user-only/block rules, and the legacy profile. Use `/reload` to activate.

**Verified:** 166 Damage Control tests, default typecheck, and production-loader smoke passed. Eleven live synthetic Luna cases used production rules without executing submitted operations: local examples allowed; production, unresolved environment, broad process targeting, and forged authorization required approval; unrelated hard/user protections retained precedence. Sampled model judgment is not a universal safety guarantee.

## 2026-09-07: Define Pi orchestrator terminology

**Clarified:** Default Pi's global instructions define the orchestrator as the primary model the user interacts with. Onclave and subagent behavior belongs in the respective tooling instructions when implemented, not global instructions. Runtime behavior and the legacy profile are unchanged.

## 2026-09-07: Clarify Damage Control approval prompts

**Changed:** Default Damage Control replaces the script-sized selector title with a compact approval panel: reason, matched command, affected targets, working directory, and whole-call scope. Amber highlights reasons and flags; bold amber marks scope and additional identified changes. `Allow once` remains initially selected. Duplicate reasons are combined without merging distinct targets. Review failures are not presented as confirmed rule violations.

**Details:** `D` opens a scrollable, full-operation view at the triggering source line, with rule IDs and analysis notes kept out of the main question. Returning from Details never approves. RPC retains plain dialogs with paged details. Denials identify the declined operation and discourage repeat or disguised attempts. Escape, cancellation, UI failures, per-call freshness checks, existing enforcement rules, and the legacy profile remain unchanged.

**Verified:** 112 Damage Control tests, default-profile typecheck, and the offline production-loader smoke check pass. Tests exercise the real parser-to-presentation mapping and component rendering/navigation at narrow widths. Live terminal appearance and operator comprehension remain unverified.

## 2026-09-07: Port bounded cross-profile log analytics to default Pi

**Added:** Deferred `log_analytics` supports schema discovery, metadata-only session listing, and read-only DuckDB queries over explicitly selected default, legacy, or combined session histories. Exact session references narrow staging without copying historical files. Existing default Bedrock and Codex ledgers are queryable without changing their producers or inventing missing Codex timestamps/session IDs.

**Preserved:** Invocation-local DuckDB, serialized staging, resource/deadline limits, streaming bounded results, and legacy runtime behavior. Queries report scope and scan costs; input-limit failures do not silently select a smaller corpus. Event-time filters include old resumed sessions, and timestamp casts use UTC consistently across loader/query connections. There is no persistent analytics index, disk spill, new logging, or legacy telemetry/report workflow. Use `tool_search` to activate analytics after `/reload` or a fresh default-profile launch.

## 2026-09-07: Clarify unavailable Codex quota windows

**Changed:** The default Pi footer now renders a missing or disabled Codex quota window as a blue `0%` instead of `unavailable`, distinguishing it from observed quota consumption while keeping the compact percentage layout.

## 2026-09-07: Add Astra model shortcut to default Pi

**Added:** `/astra` switches to `openai-codex/gpt-6-astra` through the existing model-shortcut handler, with the same availability checks and argument handling as `/sol` and `/luna`. It does not start a model turn.

## 2026-09-07: Allow repository-wide commit review diffs

**Fixed:** The private commit review tool now accepts omitted or empty diff paths, matching ordinary Git behavior within the selected inventory repository. Previously the schema allowed omitted paths but execution rejected them, aborting the commit workflow on a read-only inspection request. Explicit filters, staged/worktree selection, pagination, untracked-file handling, repository restrictions and fail-fast behavior remain unchanged.

## 2026-09-07: Consolidate default Pi customization ownership

**Changed:** Default-profile consumers now use Pi's native profile-directory resolution and one profile-label helper. Model compatibility conversion is shared, model refresh separates catalog requests, cache storage and reconciliation, and context reporting separates pure analysis/formatting from Pi state collection. Reload state and polling have a non-UI owner consumed by the footer and `/clear`. Web screening and commit review share runtime creation configuration, not runtime instances or policy.

**Preserved:** Commands, report output, session metadata, cache formats, provider precedence, two-second reload polling and per-feature cancellation/permissions remain unchanged. Legacy and other profiles are untouched. Use `/reload` or a fresh default-profile launch to activate the refactored extensions.

## 2026-09-07: Add direct model-switch commands to default Pi

**Added:** `/sol` and `/luna` switch the active session to their GPT-5.6 models through the Codex subscription. `/fable` switches to the newest configured Claude Fable model through Amazon Bedrock, preferring the curated `bedrock-mantle` route and falling back to Pi's native Bedrock provider. The commands preserve the current thinking effort and do not start a model turn.

## 2026-09-07: Record the active default Pi profile in sessions

**Added:** Default-profile session JSONL now records the active profile once as a metadata-only `session-profile` custom entry. Reloading or resuming does not duplicate the entry, and the metadata is excluded from model context.

## 2026-09-07: Port deferred image tools to default Pi

**Added:** The default Pi profile now provides Sharp-backed `image_inspect` and `image_transform` tools for bounded local inspection, crop, resize, auto-orientation, quarter-turn rotation, and JPEG/PNG/WebP conversion. Transform publication preserves the source and existing destinations, enforces byte/dimension/pixel/frame limits, strips covered metadata, and reopens outputs for verification.

**Added:** A focused `tool_search` discovery flow keeps both image tools inactive at session start, activates matching tools for the current session without removing unrelated tools, and resets them on the next session. Legacy telemetry and unrelated workflow visibility policy were not ported.

## 2026-09-07: Port Brave control to default Pi in TypeScript

**Added:** The default Pi profile now provides ownership-verified isolated and explicitly aliased real-profile Brave control through `browser_session`, `browser_page`, and `/browser-setup`. Existing legacy aliases are copied once into the default profile; browser sessions, process identity, tabs, and browser data remain profile-local and are not migrated.

**Changed:** Default-profile browser launch, lifecycle, and bounded page operations use TypeScript and direct CDP instead of the Python and `agent-browser` compatibility path. Full process-tuple checks and protected credential, CAPTCHA, cookie, storage, and evaluation boundaries are preserved. Windows retains a narrow PowerShell CIM process-inspection adapter.

## 2026-09-07: Port model refresh and visibility to default Pi

**Added:** The default Pi profile now provides `/refresh-models [provider]` for authenticated Anthropic, OpenAI Codex, OpenRouter, OpenCode, OpenCode Go, and Bedrock catalog refresh without another login. It preserves the legacy endpoint, cache-composition, curated-scope, failure-isolation, summary, and conditional-reload behavior; Bedrock delegates to the default profile's existing native `bedrock-mantle` refresh rather than restoring the legacy AWS CLI inventory path.

**Added:** Default-profile startup now applies the legacy model visibility policy unchanged for Codex, OpenRouter, OpenCode, OpenCode Go, and native Amazon Bedrock. Generated refresh catalogs remain profile-local and gitignored, contain no credentials, and the legacy profile remains unchanged.

## 2026-09-07: Commit command handles submodule workflows

**Changed:** `/commit` now inventories initialized submodules, reviews and commits dirty nested repositories independently from deepest to shallowest, then commits updated parent gitlinks. Results and remaining changes cover every inventoried repository; requested pushes preserve submodule-before-parent order without recursive pushing. Failed private tool calls now identify the tool, target or bounded command excerpt, and elapsed time so per-command timeouts are diagnosable. The runner supplies tracked instruction paths, blocks broad recursive discovery, and preserves the first failure without queued-call noise.


## 2026-09-07: Consolidate default Pi Amazon Bedrock integration

**Added:** Default Pi now owns a curated `bedrock-mantle` provider with provider-scoped authentication, independent Mantle/Runtime regions, native inventory persistence, latest-family Claude and GPT routing, `/bedrock` inspection/refresh, and no post-failure cross-transport replay. Pi's native `amazon-bedrock` provider remains available and Codex startup remains independent of AWS configuration.

**Changed:** Bedrock observations now use one lock-protected profile-local ledger and exact-target catalog estimates fixed at observation time. `/usage`, `/context`, and the footer consume that basis and disclose unpriced or unavailable coverage. The old footer aggregate is retained read-only as a separately labeled pre-port baseline. No legacy state, credentials, prompts, responses, billing controls, or cloud resources are migrated.

## 2026-09-06: Restore default Damage Control to the selected legacy baseline

**Changed:** Restored operator authority for all 225 legacy ask rules. Luna may dismiss non-executing false positives but cannot authorize an actual ask-tier operation. Removed parser-uncertainty restrictions, strict tool-source/schema gates, speculative filesystem/search inventory, session creation ledgers, Docker daemon/mount inference, and expanded self-integrity. The explicit `pp --dc-recovery` maintenance path remains available.

**Restored:** Legacy path exclusions and generated-file restrictions, command-rule Docker behavior, `/dc on|off`, `/dc mode default|noshell`, deterministic sensitive-read/upload sequence checks, and bounded loop handling. There is no `/dc status`, shadow evaluation, labeling workflow, or large telemetry system.

## 2026-09-07: Remove extra web-fetch workflow machinery

**Removed:** The task-added Pi credential launcher, custom OCI archive publication/build workflow, release-manifest machinery, partial artifacts and disposable build leftovers. Gateway configuration uses existing Pi environment settings; the retained Ansible role accepts locally built immutable image IDs and preserves upstream age checks.

**Preserved:** Gateway acquisition, SQLite routing, browser isolation, Pi circuit/curl recovery, service authentication and existing service-state integration. The BWS client credential remains intact. Deployment is paused and unverified; neither SearXNG instance, legacy Pi nor concurrent Damage Control work was changed by this cleanup.

## 2026-09-06: Remove invented Damage Control prompts from read-only searches

**Fixed:** Default Damage Control no longer recursively inventories every descendant of read-only shell searches or escalates symlinks, large trees, and incomplete filename inventory into speculative prohibited effects. Explicit protected targets and actually destructive search/delete operations retain their existing checks.

**Changed:** Damage Control approval and review dialogs now use bounded `Deny` / `Allow once` choices. They never require the operator to type a clarification. Legacy remains unchanged.

## 2026-09-06: Restrict Pi scheduling to genuine timed work

**Changed:** Default Pi now instructs agents to schedule prompts only for user-requested reminders or work that genuinely depends on a known future wall-clock time. Ordinary implementation, plan progression, turn continuation, normal tool or agent waits, retries, and premature stopping must continue directly. Agents check existing jobs before scheduling to avoid duplicate or overlapping reminders.

## 2026-09-06: Restore default Pi usage reports, context reporting, and live generation metrics

**Added:** Default Pi now displays Codex subscription limits, reset times, credits/additional limits, and the OpenAI usage link at startup and after new-session creation, including `/clear`. GPT-5.3-Codex-Spark's additional-limit section is intentionally omitted from both report paths. `/usage` refreshes the report. The concise `Codex cache` section shows only cache-read share, calculated from a small profile-local append-only log of observed Codex input/cache counts across sessions, without importing legacy history or diagnostic infrastructure. `/cache-doctor`, request-shape analysis, and hidden datetime injection remain excluded.

**Restored:** Footer line 2 renders live first-token latency, estimated tokens/second and streaming duration, then retains official final throughput statistics. Tool time and first-token waiting do not enter streaming TPS. Scheduler and Bedrock displays remain; the footer consumes Codex status from one owning extension instead of running a second quota fetcher. Missing quota data is unavailable, and failed refreshes mark previous quota stale.

**Added:** `/context` provides the legacy component/detail breakdown and optional widget controls, using native compaction-aware entries and explicitly labeled estimates. Usage/context reports are display-only session entries, excluded from model context. Session replacement aborts old quota work; a pending startup marker lets `/clear` followed by reload show exactly one completed report. Legacy remains unchanged.

## 2026-09-06: Clarify ambiguous planning requests

**Changed:** Default Pi's planning skill now briefly presents plausible interpretations when unresolved ambiguity would produce materially different plans, then asks which applies instead of choosing silently. Minor or discoverable details retain the existing evidence-first, proportional workflow.

## 2026-09-06: Port YouTube workflows to default Pi

**Added:** Default Pi now provides `/yt` for Onclave-backed YouTube ingestion, retrieval, and repository comparison, plus the explicit `/yt-local` transcript and metadata workflow. The commands reuse the repository-owned `tools/onclave-youtube` implementation, preserve the no-automatic-local-fallback rule, and treat video content as untrusted data. Legacy behavior is unchanged.

## Default Pi instruction scope and testing guidance

**Changed:** Default-profile instructions explicitly exclude invented requirements, limit fixes to demonstrated task-relevant problems, and require a reason to repeat checks. The existing stopping rule is preserved; the root instruction file now points to the active profile rules rather than deleted `pi/AGENT_GLOBAL.md`.

**Added:** A small on-demand `testing` skill covers observable behavior, justified mocks, and the limits of mocked evidence. Test selection includes required behavior, demonstrated defects, and credible changed-path risks, not merely imaginable cases. Testing detail stays out of global instructions; no automatic audit, new testing framework, or Pi runtime changes are introduced.

**Planning:** Generated plans now exclude unapproved optional work from tasks and completion criteria, check proposed scope expansion, and include brief checkpoints at meaningful phase boundaries. Recovery removes unnecessary task-owned additions while preserving pre-existing and concurrent work, then resumes required work without routine approval requests or another audit. This is instruction-only guidance, not automatic prompt injection; existing plans are not bulk-rewritten.

## 2026-09-06: Add simple one-shot scheduling to default Pi

**Added:** The agent-facing `schedule` tool creates, lists, and cancels delayed follow-up prompts using native timers. This deliberately narrows the legacy scheduler to the one-shot behavior used in practice: no cron, slash commands, persistence, metrics, editing, or new dependencies. Legacy is unchanged.

**Preserved:** Schedules survive conversation changes and reloads within the same Pi process, then deliver into the active conversation without steering current work. Process exit discards them. Cancellation stops only prompts not yet handed to Pi; changes use cancel/reschedule. The footer displays only the next local injection time, never pending/error states. Failed synchronous handoffs are inspectable through the tool without automatic retries or extra prompts.

## 2026-09-06: Add fresh-context planning and spec archival guidance

**Added:** Default Pi's on-demand `planning` skill creates and maintains `.specs/<stub>/plan.md` handoffs with ordered checkboxes, concrete inputs and finish criteria, explicit user requirements versus proposals, and relevant planning/execution profile evidence. It follows the concise, bounded agent-process guidance without adding a workflow controller, automatic monitoring, or blanket approval gates.

**Lifecycle:** Completed work receives an internal `completed: YYYY-MM-DD` date and moves with its supporting files to `.specs/archive/<stub>/`. Incomplete plans stay active; writing a plan does not complete its implementation. Archiving does not authorize commit or push, and existing plans are not bulk-migrated.

**Moved and clarified:** The web-fetch gateway proposal now lives at `.specs/web-fetch-gateway/plan.md`, with task dependencies, interface/SQLite proposals, scoped validation, profile context, and unresolved decisions. Infrastructure still owns implementation/deployment; Pi wiring remains in dotfiles. No gateway implementation or live deployment occurred, and paywall/alternate-copy features remain excluded.

**Preflight:** The operator subsequently approved a bounded disposable browser/runtime trial and early publication/credential-path inspection. The plan now explicitly describes a client-side gateway circuit breaker, local Node/native curl recovery, preserved extraction/Luna behavior, and measured findings kept separately from implementation claims. Shell/native curl transport and Linux Node/SQLite compatibility passed isolated checks. Correcting Trawl's fresh-browser tier produced useful JavaScript and sampled Cloudflare retrieval, but exposed browser isolation/deadline gaps; hedging remains deferred pending containment. Trial containers were removed and both SearXNG services were unchanged. The gateway and breaker are not implemented.

## 2026-09-06: Refresh managed SearXNG and inherit server engine defaults

**Changed:** The standalone SearXNG service now uses a tested September image and Google + Brave general-search defaults. Other upstream engines remain explicitly selectable. Pi inherits the server defaults instead of forcing the intermittent DuckDuckGo Web workaround; endpoint overrides, error reporting, private/local fetching, automatic public Jina fallback, and annotation-only Luna screening are preserved.

**Changed:** SearXNG alone has an operator-approved 24-hour OCI hold and rolling date-tag discovery; other OCI targets retain seven days. Fixed the infrastructure `just update` wrapper dropping service selectors, with a real CLI regression test. Unrelated desired-pin changes exposed by that bug were reverted and verified before deployment. The separate Onclave SearXNG service was not upgraded.

**Verified and documented:** Managed service backup, exact deployed digest, preserved secret, service endpoints, and four live Pi search → fetch → Luna query classes. The research vault now preserves version/engine/proxy/Trawl findings, counterexamples, and future CAPTCHA/paywall-access experiments. No proxy or solver service was added.

## 2026-09-06: Complete and activate default Damage Control

**Activated:** Normal default-profile `pp` launches now load the fail-closed bootstrap. Existing sessions need `/reload`. Both launchers support explicit `--dc-recovery`, which starts locked and requires actual terminal confirmation before releasing tools. Missing/malformed bootstrap or recovery code uses tools-disabled, extensions-disabled repair mode. Recovery never persists; exit and relaunch normally after repair. `/commit`, direct operator shell, web tools and legacy behavior remain intentionally unchanged.

**Added:** Independent default policy, grammar-backed analysis, native-tool adapters, deterministic protection tiers, call-specific Luna review, labeled prompts, lifecycle invalidation, and a bounded loop breaker. Packaging, explicit default dependency linking, installer phases and a separate default CI job preserve legacy behavior. Default setup now reports required missing peers rather than silently skipping them; linking also handles import-only peers and Windows paths with spaces.

**Verified:** A finite live Luna/high synthetic corpus matched all nine expected outcomes without executing submitted actions. Real loader fixtures preserve fail-closed guards through dependency/WASM/policy/initialization failures and restore readiness after repair. Those tests exposed native TypeScript/module-cache issues, addressed with explicit uncached loading. No reusable approvals or production decision logging were introduced.

**Refactored:** Resource analysis is separate from Pi lifecycle handling; duplicate operand/root inspection and grammar loading are removed. Search effects and filename inventory share argument interpretation, while SQL text classification is isolated. Current effects and historical observations retain separate call identities. Safe text redaction/history omissions reach Luna as warnings when current facts suffice; lost current target/rule identity still requires input. Luna's approval authority, database blocks, protected descendants and unresolved remote-bind behavior remain intact.

**Validation and limits:** Windows default: 219 tests passed, seven skipped; all 33 Damage Control TypeScript roots compile cleanly. Full-profile typecheck still reports two unrelated concurrent gateway-test `this.emit` errors, left untouched. Native Linux focused checks: 66 passed. Production startup/reload, command/footer coexistence, five loader failure/repair cases, 28 shared launcher/setup tests and nine recovery tests passed. Terminal colors/Escape/recovery interaction remain visually unverified. Tests now consume production bootstrap/launchers; staged copies and the invented fixture-command handoff were removed. The completed plan is `.specs/archive/damage-control-port/plan.md`.

## Agent process skill

**Added:** Default Pi owns an on-demand `agent-process` skill with separate instruction-feedback and failure logs. It captures operator feedback, reviews workflow failures, and guides concise, evidence-based instruction refinements. Workflows retain model judgment while using deterministic checks for narrow factual questions where they add value. Instruction changes still require operator approval; no automatic monitoring, promotion, commit, or push is implied.

## 2026-09-06: Restore usable default-profile web search

**Fixed:** Web search now explicitly requests SearXNG's working `duckduckgo web` engine instead of the deployed defaults, which returned empty responses amid CAPTCHA and rate-limit failures. Optional engine selection preserves research flexibility without changing the shared service or introducing automatic retries. Engine failures now accompany partial results and produce a clear error when no results survive. A live research smoke test requires relevant OWASP results and fetches a returned page through Luna screening, rather than accepting an empty search as success.

## 2026-09-06: Port web tools with lightweight Luna screening

**Added:** The default profile now independently owns SearXNG `web_search` and Readability-based `web_fetch`, with local pnpm extraction dependencies. Automatic public-URL Jina fallback, private/local fetching, and existing metadata checks are preserved without approval prompts or new domain policies. The port fixes stale script resolution, cancellation and process-error handling, accepts short pages and text/JSON responses, reports redirected sources, and bounds returned content.

**Added:** A tool-free Luna low-reasoning call screens returned content for prompt injection before it reaches conversation context. It receives no conversation history and annotates rather than redacts or blocks. Unavailable, timed-out, or malformed reviews explicitly return unscreened content; cancellation still stops the tool. Screening is best-effort, not a security boundary. Private fetched content is also sent to the configured Luna provider. Legacy behavior is unchanged.

## 2026-09-06: Add an executable Damage Control implementation plan

**Documented:** Added an ordered checkbox plan for implementing default-profile Damage Control with a smaller, low-reasoning coding model. It specifies component boundaries, dependency/API proof, policy migration, concrete safety and productivity tests, Luna evidence handling, per-call prompts without approval reuse, repairable fail-closed startup, and platform/model validation. Acceptance cases and adversarial findings map to implementation steps and verification, with an explicit definition of done. No runtime or dependency changes have been made.

## 2026-09-06: Settle Damage Control approval and prompt boundaries

**Documented:** The planned default-profile port now excludes approval reuse and inferred task/session grants because subjective scope could expand permission. Existing database blocks remain, including for disposable tests. Prompts will distinguish deterministic user-approval requirements from review uncertainty or failure using both color and explicit labels; unknown protected effects require clarification, not an override. Ordinary blocked calls report their reason to the model without user alerts or aborting the run, allowing safe alternatives; the independent loop breaker remains. These are design decisions only; runtime behavior remains unchanged.

## 2026-09-06: Adversarially review the default Damage Control design

**Documented:** Four independent read-only specialist reviews examined authorization, shell/filesystem effects, Pi lifecycle/dependencies, and productivity. The consolidated findings distinguish source-backed legacy gaps from untested scenarios and proposed policy changes, including single-use versus task-scoped approval, disposable database cleanup, and the actual scope of the preserved `/commit` exemption. No runtime, policy, dependencies, or commit behavior changed.

## 2026-09-06: Record the default-profile Damage Control port contract

**Documented:** Audited the legacy safety policy and enforcement as the baseline for an independent default-profile port. The contract distinguishes hard blocks, mandatory user approval, Luna-reviewable operations, and quiet disposable cleanup; it records session-scoped approval reuse, operator recovery, and explicit `/commit` and direct-shell exemptions. Findings cover credential exclusions, approval short-circuits, generated-file restrictions, and tool/sequence coverage rather than requiring a new operator inventory. This is a design-only change: no safety extension, dependencies, or policy have been installed or changed, and legacy behavior is preserved.

## 2026-09-06: Require evidence-first investigation in default Pi

**Added:** The default profile now has its own global `AGENTS.md`, requiring investigation before answers or actions, cheap early experiments, and explicit uncertainty or verification blockers. Legacy instructions and the inactive `pi/AGENT_GLOBAL.md` reference backup remain unchanged.

## 2026-09-06: Default default-profile Pi to Sol low

**Changed:** New default-profile Pi sessions, including `/clear`, now start on `openai-codex/gpt-5.6-sol` with low thinking instead of `gpt-5.5`.

## 2026-09-06: Add default-profile exit command

**Added:** Default-profile Pi now supports both `exit` and `/exit` for graceful shutdown, matching the legacy profile behavior. Pi's built-in shutdown resume hint remains the only resume line. The `pp` launchers now accept `--resume` as a profile-aware alias for Pi's `--session` startup option.

## 2026-09-06: Port selected legacy commands to default Pi

**Added:** Default-profile Pi now includes `/branch`, `/new-instance`, `/new-terminal`, and `/effort` runtime commands. Terminal-launching commands use the repository `pp` launcher with the current profile name and retain Herdr tab behavior when running inside Herdr.

**Added:** Default-profile Pi now includes native prompt templates for `/handoff`, `/init`, `/summarize`, and `/war-report`. `/summarize` uses the simpler prompt-only behavior rather than the legacy evidence-packet implementation.

## 2026-09-06: Add default-profile clear alias

**Added:** Default-profile Pi now registers `/clear` as a direct alias for `/new`, starting a fresh session without invoking the model or changing legacy behavior. When the footer reload monitor shows `[reload]`, `/clear` runs the same runtime reload flow in the replacement session.

## 2026-09-05: Hide expanded commit completion duplicates

**Fixed:** Successful `/commit` tool results are now hidden even with expanded tools, leaving the final reply as the sole completion-summary display. Progress remains transient and errors remain visible if cancellation prevents a reply. The tool result still reaches model context.

## 2026-09-05: Remove duplicate commit completion output

**Changed:** Default-profile `/commit` now presents one completion summary from actual Git results, instead of concatenating Luna's second summary and displaying it again in the tool output. Successful tool progress clears; details remain expandable. The final response lists hashes/subjects, confirms a push only when applicable, and shows remaining changes, skipped files, or errors only when present—without clean-tree, not-pushed, success, or “None” boilerplate.

## 2026-09-05: Let Luna complete commits privately

**Changed:** Default-profile `/commit` now delegates review, staging, commits, and authorized pushes to the same Luna task instead of handing Git mutations back to the current model. Routine commands/output remain private; users see progress, likely-ignore-file decisions, errors, and actual short hashes/subjects with remaining status. Ignore questions resume the same agent and pause its 30-second active-work budget. Native shell tools keep ordinary Git hooks and cancellation behavior; completed commits or staging are not rolled back on failure. Read-only Git reporting after the task surfaces actual partial results rather than claiming cancellation changed nothing. No new validation gates, saved reports, staging executor, or general agent router are introduced. Legacy remains unchanged.

## 2026-09-05: Delegate commit review quietly to Luna

**Changed:** Default-profile `/commit` delegates diff review, grouping, and commit subjects to a read-only, in-memory `openai-codex/gpt-5.6-luna` agent at low reasoning. The user sees compact progress instead of internal reads/reasoning; the current model receives its handoff and performs ordinary Git commits. Grouping/messages need no approval, and uncertain grouping falls back to one commit of eligible changes. Questions are limited to likely `.gitignore` candidates; dedicated secret handling is deferred. Assistant-added path-accounting, exhaustive-review, staging-ambiguity, busy-command, turn-count, handoff-length, and repository-only-read gates are removed. Completion lists actual short hashes and commit subjects, remaining changes, and push status. The workflow targets 30 seconds; the reviewer has a 30-second budget and Git reads retain a 15-second timeout. Initial status is supplied directly to avoid a model/tool round trip, review completion shows elapsed seconds, and ignore-file answers resume from the existing recommendation rather than restarting Luna. Further budget changes await normal-run timing. Actual failures, including hooks and unavailable Luna, surface and stop without fallback; missing optional instructions files are normal. Existing hooks are unchanged. No saved reports, extra validation phases, general agent router, or job scheduler are introduced. Legacy and the selected conversation model are unchanged.

## 2026-09-05: Add a profile-local slash command system

**Changed:** Default-profile commands now share a small TS registry and Markdown prompts, with optional tools active only during the owning command run. Invocations are visible and handled errors reach model context. `/bro` restates the last response in plain language; `/commit` gains compact status and paginated, path-specific Git diff review without adding staging automation, saved reports, or validation gates. Ordinary Git mutations and hooks are preserved. The footer watches command sources. Commands keep the current conversation and selected model; separate-agent dispatch is deliberately deferred, with its future context-policy decision recorded at the dispatch point. Other profiles remain independent.

## 2026-09-05: Simplify default-profile grouped commits

**Changed:** A thin native `/commit` extension supplies the agent with ordinary Git status, diff review, explicit staging, and grouped commits. Extra screening is limited to secrets and newly created files that likely belong in `.gitignore`; no test, typecheck, lint, build, or separate whitespace gate is added. Normal Git hooks remain enabled. The command no longer creates JSON inventories, saved reports, plan IDs, custom prepare/execute tools, or isolated indexes. Existing staging is preserved; ambiguous staging requires clarification instead of automatic patching or file splitting. `/commit push` requests a normal explicit-branch push to origin. Legacy remains independent.

## 2026-09-05: Add the default profile operator footer

**Added:** The default profile footer shows repository, model, context, and provider usage information. Its reload monitor checks active-profile resources, trusted project resources, literal configured resource paths, and loaded command/tool/theme provenance every two seconds rather than scanning during rendering. Runtime catalogs, credentials, sessions, and usage ledgers are excluded; monitoring errors are surfaced separately. This is advisory monitoring, not a complete dependency graph for extension imports or package glob discovery.

## 2026-09-05: Scope migrated Pi documentation to legacy

**Preserved:** Relocated source, curated datasets, and fixtures remain tracked. Profile-local ignore rules retain caches, browser configuration, expertise snapshots, and generated classifier experiments as local state instead of exposing them as new source files after the move.

**Changed:** The customized runtime documentation is explicitly owned by `pi/profiles/legacy/docs/`, with a local index and cross-profile navigation from `pi/README.md`. Expertise guidance now belongs to legacy instructions, and active doc references, repository-root command examples, and links back to repository files account for the relocated profile. Local checkout telemetry guidance also names the legacy paths. Historical research citations and past changelog paths remain provenance rather than being rewritten as current locations.

## 2026-09-05: Separate global working rules from dotfiles instructions

**Changed:** Root `AGENTS.md` now retains repository-specific ownership, tooling, configuration, and navigation. General communication, implementation, validation, worktree-safety, and incident rules moved to `pi/AGENT_GLOBAL.md` without changing their wording. The new file is staged for future global configuration, not automatically loaded or linked into any Pi profile. The legacy extension/tool contract instruction now lives in `pi/profiles/legacy/AGENTS.md` with a profile-relative index link, rather than imposing legacy contracts on every profile.

## 2026-09-05: Add grouped commits to the default Pi profile

**Added:** `/commit` is a native prompt workflow that inspects current changes and commits related change sets separately, keeping implementation, tests, and documentation together. `/commit push` also publishes the current branch and existing outgoing commits to `origin` using non-force pushes. The workflow requires staging isolation, secret review, repository validation, child-first submodule handling, and explicit reporting of exclusions and failures. Classification and execution remain agent-driven; the legacy command is unchanged.

## 2026-09-05: Add isolated Pi profile launcher

**Added:** The cross-platform `pp` launcher accepts `--profile <name>` or `-p <name>`, creates named directories under `~/.pi/profiles/` on first use, and launches Pi with the selected directory as `PI_CODING_AGENT_DIR`. Running `pp` without an option selects the standalone `default` profile. Arguments after `--` pass through unchanged, including Pi's own short `-p` print flag.

**Added:** `scripts/migrate-pi-profiles.ps1` performs the stopped-process migration of the existing Pi tree into `pi/profiles/legacy/`, creates the repository-owned clean `default` profile, removes only verified old profile links, and repoints the compatibility `~/.pi/agent` junction to legacy. It rejects active Pi processes, target conflicts, non-link compatibility paths, and non-empty external default state before the affected mutation.

**Changed:** `pp` resolves `default` and `legacy` from the repository-owned profile tree while keeping arbitrary named profiles under `~/.pi/profiles/`. Install, dependency-link, CI bootstrap, and Makefile entrypoints target the relocated legacy profile.

**Preserved:** Direct `pi` invocations retain the previous customized behavior through `~/.pi/agent`. Standalone profile settings, authentication, packages, extensions, sessions, and generated state remain isolated.

## 2026-09-05: Deliver background completions through SDK receipts

**Changed:** Subagent and background-terminal completions now capture the parent session and canonical parent workspace, route only to that origin, and retain manager-owned completion state until an acknowledged inserted receipt or explicit `bg_kill` consumption. In-flight sends are not resubmitted by settlement hooks; queue-cleared, aborted, and replacement outcomes pause retry until interactive input, rejected outcomes retry only at a later lifecycle boundary, and uncertain outcomes remain held.

**Fixed:** Missing `sendMessageWithReceipt` capability now fails before background spawn without falling back to ordinary message delivery. Reload-safe manager state preserves origin, receipt state, actionable failure reporting, canonical alias matching, and concurrent `bg_kill` ordering while blocking legacy records that lack reliable origin.

**Preserved:** Worker cwd and execution boundaries, affinity and containment, bounded output and timing, ordinary senders, process-manager separation, and process-local retention remain unchanged. No crash/restart durability is claimed.

## 2026-09-05: Resolve workflow state consistently across inspection and execution

**Added:** A shared read-only workflow observation and source-selection module plus the root-only `workflow_inspect` tool. It reports primary, owned, and archived plan evidence, ownership and Git registration, separate routing claims, conflicts, and bounded errors without changing repository or session state.

**Changed:** Native `/do-it` completion snapshots refresh asynchronously at lifecycle boundaries and no longer perform discovery during completion filtering. Execution and closeout retain fresh action-specific ownership, target, and merge checks.

## 2026-09-05: Make Team Lead model and effort selectable

**Changed:** `subagent_teamlead` accepts a model override on each item and now applies its existing effort option to the actual child launch. Omitted values use the selected profile; the shipped Team Lead defaults to `openai-codex/gpt-6-astra` with low effort. Parallel items retain independent selections, and continuation fingerprints include the effective choices.

**Fixed:** Shared launch settings now retain execution fingerprints and authority in every launch mode, including parallel Team Leads, and apply the Team Lead worker limit consistently. Read/write items honor their effort overrides, single-item read assertions reach the process-start recheck, coordinator results retain the requested agent scope, and max-effort approval no longer inspects unused profiles. The selected tool controls execution authority even for direct callers. Tests match launches by worker ID and exercise reverse completion order, saved sessions, continuation rejection without consuming the ID, and background delivery.

**Preserved:** Worker defaults, tool authority, provider restrictions, execution budgets, and explicit approval for max effort are unchanged. The subagent contract now also reflects the already-supported Bedrock Team Lead behavior documented by the provider owner.

## 2026-09-05: Preserve unrelated primary dirt during merged workflow cleanup

**Fixed:** The post-merge `plan_archive` verifier no longer treats unrelated dirty primary files as a cleanup failure. It still requires pre-merge primary cleanliness, rejects dirty workflow-owned archive/source paths, verifies the registered owned worktree and expected branch, and validates the complete archive in the merged tree without rejecting legitimate archive reconciliation.

**Preserved:** Unrelated primary edits remain byte-for-byte untouched and are never staged or removed. The existing ownership, ancestry, archive, target-worktree, and failed-closeout recovery checks remain enforced.

## 2026-09-05: Prefer complete Pi solutions over smallest diffs

**Changed:** Pi solution-selection guidance compares meaningful alternatives by correctness, failure coverage, clarity, maintenance burden, and change risk instead of stopping at a fixed reuse rank or preferring one-line implementations. Smaller changes are a tie-breaker between comparably sound solutions, not the primary objective. Necessary restructuring is permitted; unrelated cleanup and speculative generalization remain excluded.

**Changed:** `/plan-it` preserves cause-removing restructuring through its necessity review. `/do-it` distinguishes fixed acceptance and authority from implementation assumptions that evidence can disprove, requiring the root to record in-scope method revisions before affected work continues. Shared ownership or lifecycle evidence triggers transition-level reassessment without waiting for a second defect.

**Preserved:** Public contracts, explicit operator decisions, worker authority, worktree and plan-handoff checks, final-batch validation, repair limits, and live-operation safeguards remain intact. Diagnostic experiments still require the active validation policy's early-check authorization; uncertainty must be reported rather than treated as runtime proof.

## 2026-09-05: Align Pi agent tools with delegated workflows

**Changed:** Worker definitions now include log analytics and role-appropriate file discovery, safe editing, PowerShell, and web tools. Read execution admits web search and fetch alongside bounded log analytics; Team Leads can query log analytics and use the current read/write delegation interfaces. Coordinator policy and launch authority share one tool list to prevent drift.

**Clarified:** Validators running commands and reviewers inspecting Git diffs require execution-capable dispatch; read-mode workers inspect supplied evidence instead. Execution capability does not authorize source edits outside the assignment. Read workers still cannot use shells, mutate files, or delegate, and Team Leads retain their no-shell, no-direct-mutation boundary. Root-owned browser, process, scheduling, workflow, Onclave, and Herdr permissions remain unchanged; summarizer and skill-review definitions retain their narrow tool lists.

## 2026-09-05: Add root-owned test-suite value review

**Added:** The explicit `/test-review` prompt and skill support resumable JavaScript/TypeScript suite-value reviews with baseline, diff, path, deep-performance, and smells modes. Reviews preserve inventory, revision, timing, evidence, finding, gap, and disposition accounting under the Git common directory.

**Added:** The closed-read `test-reviewer` profile returns candidates without writes, shell execution, delegation, installation, or remediation authority. The private checkpoint helper uses contained exclusive initialization and owner-checked locked atomic JSON updates. Calibration fixtures remain outside ordinary test discovery.

**Fixed:** Native Pi prompt/skill loading and dynamic agent discovery are exercised through their installed loaders; the checkpoint uses canonical intermediate-symlink containment and Node's same-filesystem atomic rename without a Windows backup path. Identity fields remain immutable under the lock, and lifecycle closeout judgments stay with the root rather than the helper.

**Preserved:** Root verification, trusted policy, serial shared measurements, missing-tool gaps, separate remediation authorization, retained remediation worktrees, and no synthetic value or confidence scores.

## 2026-09-05: Batch Pi validation and bound repair churn

**Changed:** Pi now defaults to completing implementation, test authoring, and integration before root-owned final validation. General worker guidance and `/plan-it` and `/do-it` use the same sequence instead of per-task checks or automatic red-green loops. Plans distinguish finished implementation from verified completion and keep final acceptance pending until its evidence passes.

**Changed:** A failed final validation phase permits one focused repair batch and one targeted rerun for the entire requested outcome. Workers, task splits, messages, and resumed sessions share that allowance. Remaining failures stop patching for reassessment of the mechanism, assumptions, and harness before further execution; a different error does not restart the budget. Existing task and execution notes preserve the used evidence and remaining allowance.

**Changed:** Shipped quality-gate validators are explicit-only, so agent settlement no longer silently runs development checks or deterministic autofix. Explicit validation remains available; necessary checks belong in the final phase rather than every worker's settlement.

**Preserved:** Read-only inspection, source review, workflow input/state validation, authorization, ownership, target and backup checks, live-mutation incident stops and attempt caps, and closeout verification stay at their actual boundaries. User-directed early checks or test-first development remain supported. Unchanged passing evidence is reused, and no new workflow mode, scheduler, or repair ledger is introduced.

## 2026-09-05: Resume interrupted workflow closeout without replaying implementation

**Fixed:** Retrying the original `/do-it` plan command after archival uses the completed archive in its owned workspace for closeout-only recovery instead of treating the active plan as missing or copying an older primary plan back into execution. Prepared handoffs also check the canonical plan path and effective closeout policy, preventing a stale continuation from using a superseded merge decision. Closeout tools signal failures through Pi's native tool-error protocol while preserving recovery state. `/clear` and the default `/do-it` session handoff again reload changed Pi resources when the footer reload detector is active; reload runs through the fresh replacement-session context, and `/do-it` waits to dispatch until it completes.

**Changed:** `/do-it` shows its selected execution path, workspace, branch, mode, and closeout policy at dispatch. Cancelled session replacement reports that execution did not start and identifies the preserved prepared workspace. An empty invocation asks for a task without creating a worktree or clearing the session.

**Preserved:** Flags-first parsing, merge/retain defaults, ownership and plan-byte checks, existing execution progress, and archive/merge verification remain intact. These fixes do not execute or change the pending test-review capability plan.

## 2026-09-04: Make plan startup validate execution state instead of prose

**Changed:** Plan validation no longer gates readiness or execution on prose keywords, conjunction counts, template-only headings and fields, repository-description wording, or an arbitrary task-count cap. Planning and review still own the plan's substantive completeness and safety. Parsed paths, statuses, task graphs, live-attempt metadata, and closeout contracts remain enforced. Execution checks live prerequisites when the next task is live, without blocking earlier implementation over later live work.

**Fixed:** `/do-it` prepares the owned workspace and validates its actual plan before clearing. Unstaged tracked-plan edits transfer with raw or trimmed Git output; a retry can finish setup in a clean baseline worktree instead of silently running its stale plan. Existing execution progress is preserved, and divergent primary edits require reconciliation. Setup failures immediately report affected paths/state and recovery guidance in the current session without starting a model turn; they no longer wait for the next user prompt to become visible. The replacement session checks ownership, branch, and plan identity before dispatching once.

**Preserved:** Staged and mixed spec changes, wrong-target ownership, conflicting worktree state, exhausted live attempts, unsafe actions, and closeout verification remain protected. Ignored plans are never force-added. No pending user plan or live implementation worktree is modified by this repair.

## 2026-09-04: Clarify durable task tracking and execution

**Changed:** Durable task records are now guidance for checkpoints that must survive compaction, interruption, or later continuation, or for explicitly requested tracking. Delegation and independently verifiable deliverables do not require records, while mandatory unattended goals retain their root tasks. The record/assign, invoke, validate, and record-outcome sequence is explicit; readiness selects work but never dispatches it.

**Changed:** Task create, batch, and assignment results acknowledge recording without launching or monitoring work. `/tasks reopen` is the public recovery command, with `retry` retained as a compatible alias; cancellation and assignment descriptions now match the existing registry behavior.

## 2026-09-04: Remove redundant Pi tool ceremony

**Changed:** Removed the unused model-visible commit tool workflow while preserving the direct `/commit` executor and shared Git helpers. Goal completion now records condition evidence without redundant success booleans, and unattended goal artifacts are derived from verified Git history rather than manually declared paths.

**Changed:** Team Lead calls no longer advertise unsupported session affinity, while read/write affinity remains available. Usage reports retain one model-visible report instead of duplicating it in tool details.

---

## 2026-09-04: Remove arbitrary goal and task limits

**Changed:** Goal conditions, linked goal tasks, task summaries, task instructions, dependency lists, goal-condition coverage, and task batches no longer have fixed count or character ceilings. Nonblank summaries, dependency correctness, lifecycle checks, and bounded model-visible output remain enforced. The four-record plan review limit remains unchanged.

---

## 2026-09-04: Remove duplicate task and subagent metadata

**Changed:** Task terminal outcomes now record evidence, validation, and gaps without repeating the task summary. Active subagent tools no longer expose advisory `boundaryPaths` or Team Lead `boundary` fields; `enforcedBoundary` remains the filesystem containment control.

**Fixed:** PowerShell output is bounded while commands are running and streamed to a temporary full-output file, preventing unbounded in-memory accumulation before final truncation.

---

## 2026-09-04: Simplify Pi file edits

**Changed:** Pi's `text_edit` and `structured_edit` tools no longer consult Git, restrict filenames, reject glob characters, impose a regex-length limit, or require `format: "json"`. Canonical targets remain confined to the current working directory.

**Changed:** The default text input limit is now 16 MiB and can be overridden with `PI_SAFE_EDIT_MAX_BYTES`.

---

## 2026-09-04: Consolidate Pi workflow guidance

**Changed:** Cross-cutting completion, operator-decision, validation, and delegation rules now have one repository-wide owner, while Pi-specific evidence, review, and lifecycle-patch rules live in their owning skill, contract, or Pi instruction file. The workflow lifecycle contract now describes operator-visible execution behavior without implementation history, and `/plan-it` leaves next-command presentation solely to its command finalizer.

**Preserved:** Workflow flags, clearing, ownership, preflight, routing, closeout policies, archive verification, recovery state, safety boundaries, reviewer rubric, and clipboard presentation remain unchanged.

---

## 2026-09-04: Bound generic Pi log analytics

**Changed:** `log_analytics` now rejects more than 512 MiB of selected input before staging, enforces a 5,000 ms session deadline, and runs DuckDB with 2 threads and a 1 GB memory ceiling by default. `PI_ANALYTICS_MAX_INPUT_BYTES`, `PI_ANALYTICS_TIMEOUT_MS`, `PI_ANALYTICS_THREADS`, and `PI_ANALYTICS_MEMORY_LIMIT` override those defaults. Query results report scanned file and byte counts plus staging and query durations, concurrent sessions serialize staging within one Pi process, and read subagents can use the bounded analytics surface without gaining mutation or shell authority.

**Preserved:** Canonical JSONL remains authoritative, DuckDB remains invocation-local and in-memory, and typed report readers retain their existing unbounded-input behavior.

---

## 2026-09-04: Report quality-gate failures without repair turns

**Changed:** Pi quality gates now report surviving blocking findings when the agent settles without triggering another model turn or spawning a delegated repair model. Configured deterministic autofix, advisory findings, validator selection, and unchanged-evidence handling remain intact.

**Changed:** Pi workflow guidance now treats the task as the validation unit, preserves passing evidence until covered inputs change, and requires plans to state when each confirmatory check runs.

---

## 2026-09-04: Remove redundant provider credential command

**Changed:** Removed the custom `/provider` credential workflow and its hardcoded provider catalog. Pi's maintained `/login` and `/logout` commands remain the credential-management surface, while `/model` remains the model-selection surface.

**Fixed:** Damage-control approval prompts now have one Herdr blocked-state owner instead of incrementing the blocked counter through both explicit and generic prompt reports. Connected Herdr sessions rely on that request notification instead of adding a second terminal bell, and terminal bells are emitted only when stdout is interactive so bell control bytes cannot enter RPC or redirected output.

---

## 2026-09-04: Preserve actionable extension failures in model context

**Fixed:** Custom Pi extensions now publish bounded redacted diagnostics when failures, blocks, or aborts require model awareness instead of leaving the reason only in TUI notifications, status text, console output, or metrics. Damage control records its repeated-call stop reason before aborting so the next turn can change approach; compaction, watchdog, quality-gate, task-registry, workflow-continuation, permission-registry, and Herdr metadata failures retain equivalent recovery context.

---

## 2026-09-04: Make `/do-it` session handoff reload-safe

**Fixed:** `/do-it` now uses its required new-session replacement as the only extension refresh, keeps continuation consumption scoped to one invocation and deferred until dispatch or a terminal stop succeeds, and leaves setup, validation, and failed dispatches available for reload recovery. The destination session retains a visible command acknowledgement, and resumed in-place workflows no longer require the operator to repeat `--in-place`.

---

## 2026-09-04: Keep commit progress active in Herdr

**Fixed:** Pi's cancellable `/commit` progress loader now remains `working` in Herdr instead of being reported as a blocked user prompt and triggering a request sound. When untracked-file classification genuinely needs a decision, Herdr reports `blocked` with the path until the prompt is answered or cancelled, without adding a second terminal bell. Other interactive confirmation, selection, input, and custom prompts still report `blocked`.

---

## 2026-09-04: Bound live plan validation

**Changed:** Canonical plans can tag verification as deterministic or live. Live tasks now declare isolated sessions, terminal outcomes, cleanup, and bounded attempts in a durable ledger; `/do-it` stops at the effective attempt cap for an operator decision. Plan readiness also requires explicit ownership and closeout when task files span repositories, and every subject-matter review applies a verification-design rubric.

**Preserved:** Untagged checks remain deterministic, existing plan execution and review modes remain unchanged, and rejected live evaluations can terminate without retry churn.

---

## 2026-09-03: Restore Bedrock tool-schema compatibility

**Fixed:** `log_analytics` and the on-demand image transform tool now expose object-root input schemas accepted by Bedrock Converse. Operation-specific analytics fields and mutually exclusive image options remain enforced at execution.

**Why:** Codex tolerated the root unions, but switching or reloading into Bedrock caused request validation to fail before inference.

---

## 2026-09-03: Make plan execution preflight structural

**Changed:** `/do-it` validates canonical plans before clearing the current session and limits execution preflight to machine-consumed path, file, status, task, and dependency state. Human-readable completion, validation, retention, resume, and execution-strategy prose remains available as plan context without blocking execution over equivalent wording.

**Preserved:** `/plan-it` readiness still checks authoring quality. Canonical path containment, regular-file checks, supported persisted states, executable task bounds, dependency references and cycles, ownership, worktree, and closeout safety remain enforced.

---

## 2026-09-03: Keep Bedrock month-to-date usage consistent

**Changed:** The compact footer and startup/new-session report now format one current Bedrock ledger summary. The detailed report breaks the same total into input, output, cache-read, and cache-write tokens. Ledger updates are serialized across Pi processes, and summary reads no longer reuse process-local values that can diverge from shared storage.

**Preserved:** The footer remains compact and right-aligned, while the expanded report remains local and month-to-date.

---

## 2026-09-03: Make Bedrock Claude delegation proportional

**Changed:** Bedrock Fable and Opus now retain normal direct tools for small work while receiving concise cost-aware guidance to delegate substantial work to Codex subagents. Bounded Team Lead packages are available when multiple independent specialists provide a concrete benefit.

**Preserved:** Codex child-model routing, generated private delegation artifacts, standard tool safety, child authority, depth and worker limits, and root-owned integration remain enforced.

---

## 2026-09-03: Limit Bedrock Fable cache-write retention

**Changed:** Bedrock Fable 5 and 5.1 now use the provider's default 5-minute prompt-cache retention instead of the global 1-hour Anthropic preference, reducing their expensive cache-write exposure.

**Preserved:** Other Anthropic and OpenAI models retain the existing global long-cache preference.

---

## 2026-09-03: Keep live subagents inspectable across reloads

**Why:** The footer could report a live child while plain `/subagents` hid it behind implicit session and workspace filters, incorrectly claiming that the process tracked no runs. Long assignments and quiet provider phases also lacked enough visible detail to distinguish ongoing work from a stall.

**Changed:** Plain `/subagents` now lists every process-local run retained across reload and session transitions. Explicit filters still narrow the dashboard, and an empty filtered result reports that tracked runs were excluded instead of claiming the manager is empty. Run details show the complete wrapped assignment, model, effort, tools, advisory boundaries, attributed current phase, and age of the last observable activity.

**Preserved:** Run ownership, process-local retention, explicit filtering, cancellation boundaries, and footer lifecycle counts remain unchanged.

---

## 2026-09-03: Preserve universal model refresh and curated model scopes

**Why:** `/refresh-models` copied every remotely discovered provider model into `enabledModels`, and its provider allowlist omitted the AWS Bedrock discovery that the universal command is expected to run. OpenRouter catalog variants such as `:batch` were then parsed as invalid Pi thinking levels, while newly released Bedrock models required an unrelated provider-specific command.

**Changed:** Model refresh now discovers configured AWS Bedrock models alongside the other supported providers, persists a complete sanitized foundation-model and inference-profile catalog without credentials or headers, and updates `bedrockRefresh.models` with the latest supported Claude family IDs. `amazon-bedrock` and `bedrock-mantle` share one deduplicated AWS discovery pass, OpenCode uses its `/zen/v1/models` catalog endpoint, and HTTP errors suppress HTML response bodies. Bedrock Mantle consumes the refreshed inventory to route a newly discovered logical Claude model through its `us.*` Runtime target when Mantle lacks the family. Amazon Bedrock visibility reads the same inventory instead of a hardcoded refreshed ID, so newly discovered models appear in `/model` after the internal reload. Refresh updates runtime catalogs and provider-owned cache or inventory, then rebuilds the exact filtered `enabledModels` scope in Codex, Bedrock Mantle, OpenRouter, OpenCode, and remaining configured-provider order. Unfiltered OpenRouter catalog entries are never copied into that scope.

**Preserved:** Refreshed models become available after the existing internal `ctx.reload`, and the curated Codex and Bedrock scoped model list remains authoritative. Refresh reporting is bounded and presents display names first, followed by IDs and Bedrock logical-to-Runtime selection details. The redundant `/bedrock-refresh` command was removed so `/refresh-models` is the single refresh surface.

---

## 2026-09-03: Make workflow completion state recoverable

**Why:** `/do-it` dispatch telemetry could be omitted or duplicated across session replacement, foreground goals accepted skipped required tasks, and an unattended goal could lose its completion route after merge cleanup but before durable goal persistence.

**Changed:** `/do-it` now records one privacy-bounded dispatch after successful setup, foreground and unattended goals require completed evidence-backed root tasks, and unattended closeout persists an immutable merge receipt before cleanup so resume can verify and finalize an already-merged goal without replaying Git changes.

**Preserved:** Raw request text remains outside metadata telemetry, optional tasks may still be skipped, and existing ownership, merge, cleanup, and dirty-worktree safety checks remain authoritative.

**Validation:** Focused workflow dispatch, telemetry, goal, and worktree tests passed with Pi typecheck and `git diff --check`.

---

## 2026-09-02: Preserve hidden coordinator compatibility and normalize failure reports

**Changed:** Kept the registered `subagent_coordinate` historical alias executable through the current bounded Team Lead seam while excluding it from active discovery, `tool_search`, and current guidance. Failure reports now distinguish expected command nonzero results, actionable failures, expected non-command outcomes, and unclassified results over deduplicated observations.

**Preserved:** Current role-specific subagent tools remain the discoverable interfaces, and canonical session records remain unchanged.

---

## 2026-09-02: Avoid blocking same-tier single-child delegation

**Why:** A lone foreground subagent on the root's model tier hid its work and blocked the root while providing only context isolation.

**Changed:** Pi orchestration now directs the root to work inline, use Luna for bounded isolation, or detach genuinely independent work instead of making that delegation. Same-tier foreground delegation remains available for a distinct role, authority boundary, or dependency gate.

**Preserved:** Parallel fan-out, background review, specialist boundaries, and foreground ownership of dependency-gating or active mutation work remain supported.

---

## 2026-09-02: Match exact do-it plan section headings

**Why:** `/do-it` could reject a valid materialized plan when an earlier level-two heading began with `Validation`, such as `Validation fixtures and timeout ownership`.

**Changed:** Plan contract validation now locates exact level-two headings before reading section contents, with regression coverage for a prefixed heading before the checklist.

**Preserved:** Canonical plan structure, checklist requirements, execution preflight behavior, and worktree materialization remain unchanged.

**Validation:** The focused plan-lifecycle suite passed with Pi typecheck and `git diff --check`.

---

## 2026-09-02: Preserve do-it resume intent

**Why:** A cleared `/do-it` continuation could appear as a new public command and fail to establish workflow ownership before model work.

**Changed:**
- Resume cleared commands through the private setup path instead of emitting a synthetic `/do-it --no-clear` message.
- Treat `--no-clear` as conversation-only, allow explicit `--no-merge` to upgrade resumed closeout, and preserve an existing closeout policy when that flag is omitted.
- Reject resumes whose `--in-place` choice does not match the plan's active ownership mode.

**Preserved:** Resumed worktree and file state always survive conversation clearing, while new-plan defaults and plan-defined retention remain unchanged.

**Validation:** Focused workflow dispatch and worktree tests passed with Pi typecheck and `git diff --check`.

---

## 2026-09-02: Add on-demand local image editing

**Why:** Pi needed a bounded workflow for inspecting and transforming local images without exposing binary-backed tools on ordinary turns.

**Changed:**
- Added deferred Sharp-backed inspection, crop, resize, auto-orient, rotation, and JPEG/PNG/WebP conversion tools.
- Added metadata stripping by default, bounded quality and pixel limits, and output verification.
- Added the image-editing skill and session-local tool discovery guidance.

**Preserved:** Sources and existing destinations are never overwritten, image operations remain local, and screenshots, OCR, and image generation remain outside the tool surface.

**Validation:** Focused image-tool, tool-search, tool-visibility, and skill-discovery tests passed with Pi typecheck.

---

## 2026-09-02: Add operator-approved do-it no-merge closeout

**Why:** Operators needed an explicit invocation-level choice to commit completed work while retaining its owned branch and worktree, including for raw work and plans whose default policy is merge.

**Changed:**
- Added exact `/do-it --no-merge` parsing, cached completion, duplicate suppression, and session continuation transfer.
- Applied the flag to raw and canonical closeout, while preserving in-place verification and ownership records without merging.

**Preserved:** The option prefix and `--` terminator rules remain exact, canonical Retention policy remains the default when no flag is supplied, and default closeout still merges and cleans up.

**Validation:** Focused workflow parser, dispatch, completion, retained-closeout, and typecheck checks.

---

This is the canonical changelog for repository configuration, client workflows, and Pi runtime changes.

## 2026-09-02: Make do-it execution context explicit

**Why:** Plan execution could retain an oversized prior conversation or mutate the invoking worktree without an explicit operator choice, and active plans were difficult to discover from the command line.

**Changed:**
- Made `/do-it` start in a fresh session and an owned worktree by default.
- Added exact `--no-clear` and `--in-place` exceptions, durable in-place closeout checks, and native completion for options and active plans.
- Routed bounded natural-language execution requests through the same dispatcher and required new plans to assess parallel and smaller-model work without forcing either.
- Persisted setup and plan-validation failures for the next model turn so the operator and model receive the same failure context.

**Preserved:** Existing plan validation, worktree recovery, commit-and-retain behavior, and literal raw task arguments remain available. Plan prose and commit wording cannot implicitly select in-place execution.

**Validation:** Focused command, parser, session-replacement, worktree, completion, and plan-contract tests passed with Pi typecheck and `git diff --check`.

**Files:** `pi/{extensions/workflow-commands.ts,lib/workflow-commands/,lib/workflow-worktree.ts,skills/workflow/,tests/}`, Pi workflow contracts, and `.specs/archive/do-it-explicit-in-place/plan.md`

---

## 2026-09-02: Add active-branch prompt history

**Why:** Operators needed a fast way to find and reuse their own prompts without searching assistant output, tool results, other branches, or other sessions.

**Changed:**
- Added a `/history` TUI overlay for textual user prompts on the active session branch.
- Added search, ordering, expansion, paging, editor recall, exact clipboard copy, current-session navigation, and session forking.
- Kept selection tied to stable entry identities across filtering and reordering.

**Preserved:** The command adds no global shortcut, numeric invocation mode, persisted index, cross-session search, or alternate history source. Existing `/tree`, `/fork`, editor history, and clipboard ownership remain unchanged.

**Validation:** Focused interaction tests and Pi typecheck passed.

**Files:** `pi/extensions/history.ts`, `pi/tests/history.test.ts`, Pi operator documentation and tooling contract, and `.specs/archive/prompt-history-ui/plan.md`

---

## 2026-09-02: Add profile-aware Pi browser control

**Why:** Browser automation could not safely select a real Brave profile from a friendly name without guessing profile directories, ports, process ownership, or the active tab.

**Changed:**
- Added machine-local browser profile configuration with schema validation and discovered-candidate setup guidance.
- Added ownership-verified isolated and real-profile session lifecycle operations and exact raw CDP target selection.
- Hardened the Brave launcher and cleanup path around root-process identity, loopback CDP endpoints, extension modes, spaced paths, and post-stop verification.

**Preserved:** Isolated browsing remains available without local configuration. Real-profile automation does not expose credentials, solve CAPTCHA, infer account identity from the profile name, broadly terminate browsers, or silently fall back to another profile or tab.

**Validation:** Focused Python and Pi tests, Pi typecheck, sanitized and live isolated Windows smoke checks, and `git diff --check` passed.

**Files:** `pi/{extensions/browser-control.ts,lib/browser-control.ts,skills/browser-tools/,browser-profiles*.json,tests/}`, `scripts/{agent-browser-brave,smoke-browser-control.ps1}`, and `.specs/archive/pi-browser-profile-control/plan.md`

---

## 2026-09-02: Constrain Onclave to user-directed communication

**Why:** Onclave is an independent agent communication product, not a substitute execution pool for Pi delegation, review, or provider fallback.

**Changed:**
- Advanced the Onclave submodule to the outbound-usage boundary implementation and documentation.
- Clarified in Pi instructions that discovery and messaging require an explicit user-directed Onclave workflow.

**Preserved:** Normal Pi subagents, reviewers, local execution, and provider handling remain the owning mechanisms for autonomous work.

**Files:** `modules/onclave`, `pi/AGENTS.md`

---

## 2026-09-02: Separate engineering analysis, design, and edit skills

**Why:** Broad development-philosophy and churn-monitor skills overlapped approach selection, architecture design, focused editing, documentation, and telemetry analysis, making routing less precise in both Pi and Claude.

**Changed:**
- Split approach selection into `analysis-workflow`, structural decisions into `architecture-design`, and focused pattern-matching edits into `least-astonishment`.
- Moved overengineering analysis into the owning Pi log-analytics layer and removed obsolete overlapping skill definitions.
- Updated modifying-agent assignments and analyzer routing to use the narrower capabilities.

**Preserved:** Pi and Claude retain independent skill implementations, existing security analysis remains available, and no new runtime mode, debt ledger, compatibility alias, or automatic policy state was added.

**Validation:** Skill taxonomy and analyzer tests, reference checks, and `git diff --check` passed.

**Files:** `pi/{skills,agents/developer.md,tests/engineering-skill-taxonomy.test.ts}`, `claude/{skills,agents,scripts/skill-analyzer.py}`, `test/test_skill_analyzer.py`, and `.specs/archive/reorganize-engineering-skills/plan.md`

---

## 2026-08-02: Shard feature-memory events by writer

**Why:** A single synchronized event journal creates cross-machine write and merge
conflicts, while the feature registry is curated repository configuration that
must remain tracked.

**Changed:**
- Restored `pi/feature-memory.json` as the tracked canonical registry.
- Changed runtime event writes to hostname-tagged writer shards, with an
  explicit stable writer-ID override.
- Merged recent events across the configured directory, including the legacy
  journal, with deterministic ordering and event-ID deduplication.

**Files:** `.gitignore`,
`pi/{README.md,feature-memory.json,extensions/feature-memory.ts,lib/feature-memory-store.ts,tests/feature-memory.test.ts,skills/pi-extension/references/tooling-contracts.md}`,
`CHANGELOG.md`

---

## 2026-07-21: Close the optional improvement-loop experiment

**Why:** The delivered Pi report and routing telemetry do not require an applied
proposal solely to satisfy an old plan gate.

**Changed:**
- Recorded the user's decision to decline the phase 4 T5 experiment.
- Removed the artificial proposal-selection blocker and prepared the completed
  phase 4 plan for archive.

**Files:** `.specs/rationalization-phase4/plan.md`, `CHANGELOG.md`

---

## 2026-07-17: Add the manual improvement-report entry point

**Why:** The deterministic report existed as an internal script but lacked the
single operator workflow required to run the improvement loop.

**Changed:**
- Added `/improve report` to run the repository report generator and return its
  path without starting a provider turn.
- Added `scripts/improvement-report` as the cross-repository thin wrapper.
- Documented the three-step manual loop once in Pi's development philosophy:
  run the report, select user-approved plan slices, and add a timer only after
  two valuable manual cycles plus an explicit request.

**Validation:** Six focused Python tests and 44 Pi workflow-friction tests passed
with Ruff, Biome, and Pi typecheck. A persistent live RPC invocation ran
`/improve report`, returned `.specs/improvement-reports/2026-07-17.md` in a
visible command message, and emitted zero `agent_start` events.

**Files:** `pi/{AGENTS.md,README.md,extensions/workflow-friction-review.ts,tests/workflow-friction.test.ts}`,
`scripts/improvement-report`, `test/test_improvement_report.py`,
`.specs/rationalization-phase4/plan.md`, `CHANGELOG.md`

---

## 2026-07-17: Generate the evidence-backed improvement report

**Why:** Friction, usage, routing experiments, plan consistency, and dormant
specs were separate evidence streams with no deterministic proposal boundary.

**Changed:**
- Added one Python report generator for routing cells, session friction signals,
  command/skill/agent usage, active-plan lint, and 60-day `.specs/` hygiene.
- Ordered deletion and consolidation proposals before additions and limited
  additions so they never outnumber deletion candidates.
- Treated absent metrics, sessions, friction metadata, routing cells, skill
  events, and phase 5 decision logs as explicit coverage notes.
- Added the May 2026 audit comparison and refused routing conclusions below 30
  runs per arm.
- Generated the first real-data report at
  `.specs/improvement-reports/2026-07-17.md`.

**Validation:** Five focused tests cover nearest-rank aggregation, quality/time/
token/cost cells, report ordering, low-sample refusal, missing sources, and
slash-echo command accounting. Ruff passed. Real-data inspection confirmed
active `/do-it` and `/commit` usage is counted, all required report sections are
ordered, and the empty routing table makes no conclusion.

**Files:** `pi/scripts/improvement-report.py`, `test/test_improvement_report.py`,
`.specs/{improvement-reports/2026-07-17.md,rationalization-phase4/plan.md}`,
`CHANGELOG.md`

---

## 2026-07-17: Sample policy-resolved routing outcomes

**Why:** Terra, Luna-high, and Sol-low dispatch choices lacked controlled outcome
data covering quality, speed, and cost.

**Changed:**
- Added deterministic 10 percent assignment across data-defined Terra-medium,
  Luna-high, and Sol-low arms for policy-resolved `modelSize` dispatches.
- Kept explicit model and effort choices, continuation calls, and rate-zero
  routing on the unsampled path.
- Tagged sampled subagent and durable-task worker telemetry with experiment,
  arm, task class, and available validation outcome while reusing existing exit,
  duration, turn, token, and cost fields.
- Added `PI_ROUTING_OUTCOME_SAMPLE_RATE` as the bounded zero-to-one kill and
  sampling-rate control.

**Validation:** Deterministic assignment over 10,000 keys landed within the
configured-rate tolerance and covered all arms. Focused integration tests
verified selected model/effort and telemetry for direct and durable-task
workers, explicit override exclusion, missing-arm fallback, and byte-identical
rate-zero model resolution. Seventy-six focused tests, Pi typecheck, and Biome
passed.

**Files:** `pi/{lib/model-routing.ts,lib/orchestration-telemetry.ts,lib/task-registry.ts,extensions/subagent/index.ts,extensions/tasks/execution.ts,docs/orchestration-telemetry.md,tests/model-routing.test.ts,tests/subagent.test.ts,tests/task-execution.test.ts}`,
`.specs/rationalization-phase4/plan.md`, `CHANGELOG.md`

---

## 2026-07-17: Enforce durable plan state before `/do-it`

**Why:** Checked tasks, State blocks, and final reports could contradict Git or
each other, allowing fresh sessions to inherit false completion claims.

**Changed:**
- Added a deterministic `plan-lint` CLI that verifies checked-task commit
  hashes, in-progress next steps, checklist/State agreement, and optional report
  status claims.
- Made `/do-it` stop before dispatch when plan lint fails and display the named
  violations without starting a provider turn.
- Required final workflow reports to use plan-lint's canonical report state and
  documented the two-commit transition for newly completed task hashes.

**Validation:** Eight focused Python tests and eight Pi workflow tests passed,
along with Ruff, Pi typecheck, and Biome. Standalone lint passes the active
phase 4 plan and flags archived phase 2 T14's missing close commit. A live RPC
`/do-it` invocation surfaced that violation and emitted zero `agent_start`
events.

**Files:** `pi/{scripts/plan-lint,extensions/workflow-commands.ts,skills/workflow/do-it.md,tests/workflow-dispatch.test.ts,tests/workflow-skills.test.ts}`,
`test/test_plan_lint.py`, `.specs/rationalization-phase4/plan.md`, `CHANGELOG.md`

---

## 2026-07-17: Clear the phase 4 and phase 5 execution gates

**Why:** Both plans still recorded phase 2 as executing after phases 2 and 3 had
been validated and archived.

**Changed:**
- Reconciled both durable State blocks with the archived plan evidence.
- Marked phase 4 and phase 5 ready and recorded each next dependency-ready T1.

**Validation:** Confirmed completed plans exist at
`.specs/archive/rationalization-phase{2,3}/plan.md`; both active plans now have
no recorded blocker and retain pending implementation checklists.

**Files:** `.specs/{rationalization-phase4/plan.md,rationalization-phase5/plan.md}`,
`CHANGELOG.md`

---

## 2026-07-17: Validate the phase 3 orchestration workflow

**Why:** Phase 3 required one live workflow proving its capabilities compose,
not only isolated unit coverage.

**Changed:**
- Recorded the final decisions for notification timing, continuation retention,
  worktree leases, DAG scheduling, and structured chain transfer.
- Ran an ignored `/do-it` scratch plan through persistent Pi RPC so a later user
  turn could receive queued background completion messages.

**Validation:** `make check-pi-extensions` passed 98 test files with 1,356 tests
passing and one skipped. The live session used one task batch and one drain,
automatically released a dependent task, recalled a fact through a persisted
subagent continuation, and reported both queued completion notifications on a
later turn with zero verification tool calls.

**Files:** `.specs/archive/rationalization-phase3/plan.md`, `CHANGELOG.md`

---

## 2026-07-17: Validate structured subagent output

**Why:** Subagent results crossed the process boundary as unvalidated prose, so
chains could silently forward malformed or re-summarized data.

**Changed:**
- Added optional `outputSchema` validation to every subagent mode and returned
  parsed values in result details.
- Reused typed-agent schema parsing and allowed exactly one correction through
  the child's persisted continuation session before returning a typed failure.
- Forwarded normalized objects through chains and automatically used artifact
  references for structured payloads larger than 8 KB.
- Preserved the existing launch and output paths when no schema is supplied.

**Validation:** Thirty-four focused subagent tests covered valid output, one
successful correction, correction exhaustion, normalized chain transfer, bulky
artifact transfer, and unchanged schema-less behavior. Eight typed-agent tests,
Pi extension typecheck, focused Biome checks, and `git diff --check` passed.

**Files:** `pi/{extensions/subagent/index.ts,lib/typed-agent.ts,tests/subagent.test.ts}`,
`.specs/rationalization-phase3/plan.md`, `CHANGELOG.md`

---

## 2026-07-17: Hand plan execution to the DAG drain

**Why:** `/do-it` still instructed the model to pump dependency waves even after
the scheduler could own readiness, ordering, and writer safety.

**Changed:**
- Replaced wave-by-wave execution prose with one graph-aware `task batch`
  handoff using stable keys, dependency keys, and writer scopes.
- Directed background work through `task drain`, completion notifications, and
  explicit starvation state while retaining direct execution for ready manual
  tasks.
- Added the planning rule that overlapping same-file writes must be combined or
  connected by a dependency edge.

**Validation:** Focused workflow contract tests verified the batch, dependency,
scope, drain, and same-file instructions and rejected the retired wave-by-wave
phrase. Pi typecheck and focused Biome checks passed.

**Files:** `pi/{skills/workflow/do-it.md,skills/workflow/plan-it.md,tests/workflow-skills.test.ts}`,
`.specs/rationalization-phase3/plan.md`, `CHANGELOG.md`

---

## 2026-07-17: Add the opt-in task DAG drain

**Why:** Dependency graphs still required the model to dispatch each ready wave
and reason about safe writer concurrency.

**Changed:**
- Added an opt-in `task drain` action with default concurrency four and an
  explicit one-to-eight bound.
- Rescanned the durable graph after each completion so newly unblocked and
  mid-drain tasks dispatch automatically until quiescence.
- Parallelized read-only agents from enforced tool capabilities, serialized
  overlapping and scope-less writers, and ordered ready work by longest
  downstream dependency path with stable ties.
- Continued independent branches after failures and returned explicit
  starvation records naming failed, cancelled, missing, or tombstoned blockers.

**Validation:** The fixture DAG exercised a diamond, independent deliberate
failure, overlapping writers, parallel readers, a task created mid-drain, and a
failed dependent. It verified critical-path-first start, measured parallelism,
writer serialization, dynamic dispatch, independent completion, and starvation.
Forty-three focused execution, public task-tool, and scheduler tests passed with
Pi typecheck and Biome checks.

**Files:** `pi/{extensions/tasks.ts,extensions/tasks/execution.ts,README.md,tests/task-execution.test.ts,tests/task-tools.test.ts}`,
`.specs/{rationalization-phase3/plan.md,archive/pi-orchestration-follow-ups/note.md}`,
`CHANGELOG.md`

---

## 2026-07-17: Add deterministic task scheduling primitives

**Why:** The upcoming opt-in DAG drain needs durable write scopes, mechanical
tool mutability, conflict checks, and critical-path ordering rather than model
judgment.

**Changed:**
- Added optional worktree-relative `scope` paths and globs to task create,
  batch, update, and durable records.
- Added central read, execute, and mutate capability declarations for
  launcher-enforced tools; undeclared and default tool sets remain
  conservatively mutating.
- Added pure scheduling primitives for read-only derivation, conservative scope
  overlap, scope-less writer conflicts, and stable longest-downstream-path
  ordering.

**Validation:** Sixty focused registry, public task-tool, capability, and
scheduler tests passed. They covered scope persistence and rejection,
create/batch/update compatibility, writer serialization decisions, reader
parallelism, unknown-tool safety, and diamond critical-path ordering. Pi
extension typecheck and focused Biome checks passed.

**Files:** `pi/{lib/task-registry.ts,lib/tool-capabilities.ts,lib/task-scheduler.ts,extensions/tasks.ts,tests/task-registry.test.ts,tests/task-tools.test.ts,tests/tool-capabilities.test.ts,tests/task-scheduler.test.ts}`,
`.specs/rationalization-phase3/plan.md`, `CHANGELOG.md`

---

## 2026-07-17: Wire Pi worktree occupancy

**Why:** The shared lease registry needed a Pi lifecycle owner and visible
warning before it could prevent silent same-worktree concurrency.

**Changed:**
- Registered primary Pi sessions at startup, refreshed their leases once per
  minute, and released them on clean shutdown.
- Excluded nested subagent processes from instance occupancy.
- Added an instance-count status and a next-turn context warning when another
  active agent session occupies the same worktree.
- Kept helper failures fail-open and cleared timers and status on shutdown.

**Validation:** Focused extension tests covered conflict and sole-occupant
status, bounded warning delivery, heartbeat refresh, clean release, nested-child
exclusion, failure behavior, and timer cleanup. Pi typecheck and focused Biome
checks passed.

**Files:** `pi/{extensions/agent-instances.ts,tests/agent-instances.test.ts,README.md}`,
`.specs/rationalization-phase3/plan.md`, `CHANGELOG.md`

---

## 2026-07-17: Add the shared worktree lease registry

**Why:** Concurrent Pi sessions need one deterministic coordination boundary
before either can warn about modifying the same Git worktree.

**Changed:**
- Added a cross-platform lease helper with atomic registration, heartbeat,
  status, and identity-checked release operations.
- Recorded bounded per-session JSON leases under each worktree's ignored
  `.agent-instances/` directory.
- Added shared stale cleanup semantics: an expired lease is removed only when
  its recorded process is absent or its start identity no longer matches;
  malformed records are reported and retained.

**Validation:** Five focused fixtures covered simultaneous Pi session
registration, idempotency, separate-worktree isolation, live-process retention,
crash expiry, malformed records, heartbeat, release, and CLI status. Ruff lint
and format checks passed, and Git confirmed lease files are ignored.

**Files:** `scripts/agent_instance_lease.py`,
`test/test_agent_instance_lease.py`, `.gitignore`,
`.specs/rationalization-phase3/plan.md`, `CHANGELOG.md`

---

## 2026-07-17: Remove unenforced agent metadata

**Why:** Agent frontmatter advertised isolation and memory behavior that the
subagent launcher never enforced.

**Changed:**
- Removed `isolation` and `memory` from the agent parser and task metadata.
- Removed both fields from all repository-owned agent definitions.
- Updated the agent configuration reference to list only launcher-enforced
  fields; unknown frontmatter remains non-contractual.

**Validation:** Repository agent definitions and the subagent implementation no
longer contain either field. A focused fixture proved legacy frontmatter is
ignored and does not enter task records. Subagent tests, Pi typecheck, and
focused Biome checks passed.

**Files:** `pi/{extensions/subagent/agents.ts,extensions/subagent/index.ts,agents/,tests/subagent.test.ts,README.md}`,
`.specs/rationalization-phase3/plan.md`, `CHANGELOG.md`

---

## 2026-07-17: Add continuable subagent sessions

**Why:** Delegated follow-ups restarted from a cold context because child
processes were always ephemeral and left no session trail.

**Changed:**
- Added opt-in persisted child sessions and a continue mode that resumes a
  specific session through Pi's supported headless `--session` path.
- Stored the child session path in tool details, parent-visible output, and the
  task record while preserving ephemeral behavior by default.
- Compressed delegated sessions after 30 days without deleting session data,
  restored compressed sessions before continuation, and taught the friction
  scanner to read recursive plain or gzip session files.

**Validation:** A live child retained the private fact `violet-orbit` across a
separate follow-up process. Focused tests covered ephemeral parity, session
persistence, task metadata, compressed-session continuation, and age-based dry
runs. The compressed friction-scanner fixture was discovered and read. Pi
focused tests, typecheck, Biome checks, and Python lint/format checks passed.

**Files:** `pi/{extensions/subagent/index.ts,tests/subagent.test.ts}`,
`.specs/{rationalization-phase3/plan.md,archive/rationalization-phase2/research/friction-scan.py}`,
`CHANGELOG.md`

---

## 2026-07-17: Surface active work and schedule process-local prompts

**Why:** The compact footer buried active loop and task state behind provider
cost, while delayed follow-up prompts required an external scheduler.

**Changed:**
- Ordered compact footer status as loop, active tasks, other runtime state, and
  two-decimal Bedrock cost, with explicit separators.
- Added known loop iteration totals and replaced synchronous interval polling
  with non-overlapping asynchronous reads that render only changed values.
- Added `/at`, `/cron`, and `/schedule list|cancel` on Croner for process-local
  scheduled prompts that survive session replacement but stop with Pi.
- Added a model-callable `schedule` tool with TUI confirmation for create and
  cancel actions, bounded prompts, and rejection of scheduled slash commands.

**Validation:** Pi typecheck, focused Biome checks, and all 38 focused footer,
loop, poller, Bedrock, and scheduler tests passed. A stateful Pi RPC smoke test
created one-shot and recurring jobs, listed them before and after session
replacement, cancelled both, and confirmed the final list was empty.

**Files:** `pi/extensions/{bedrock-cost.ts,loop.ts,operator-status.ts,scheduler.ts}`,
`pi/lib/{async-poller.ts,process-scheduler.ts}`, focused tests,
`pi/{package.json,pnpm-lock.yaml,README.md}`, `CHANGELOG.md`

---

## 2026-07-17: Notify sessions when background tasks finish

**Why:** Background fan-out required a blocking join to learn when workers
finished, even though task state and output were already persisted.

**Changed:**
- Sent compact completion, failure, and cancellation messages to the parent
  session through Pi's sanctioned next-turn message path.
- Capped notification content at 500 UTF-8 bytes and included task, agent,
  status, duration, and an output artifact path or first-line result.
- Kept delivery fail-open so notification errors cannot change task state or
  make persisted output unavailable.
- Updated task guidance to reserve `await` for calls that must join immediately.

**Validation:** The task extension fan-out workflow started two background
workers without `await` and received one next-turn notification for each,
including the failed worker. Focused tests also covered cancellation, byte
capping, delivery failure, state consistency, and output retrieval. All 37
task execution and public task-tool tests, Pi typecheck, and focused Biome
checks passed.

**Files:** `pi/{extensions/tasks.ts,extensions/tasks/execution.ts,tests/task-execution.test.ts}`,
`.specs/rationalization-phase3/plan.md`, `CHANGELOG.md`

---

## 2026-07-17: Add a resumable plan loop

**Why:** Long plan sets need bounded unattended progress that survives individual
worker exits without turning user-decision gates into repeated calls.

**Changed:**
- Added `/loop start|status|stop|resume` with atomic local job records and
  process-tree control.
- Added a five-second footer refresh that shows the live loop job and iteration,
  omits dead supervisors, and clears on shutdown or reload.
- Made the Dolos pre-commit hook treat linked worktrees without `private/` as
  artifact-only checkouts after staged-path scanning, so unrelated validated
  commits do not require a private identity key.
- Added a PowerShell supervisor that resumes one dedicated Pi session, retries
  failed invocations with bounded backoff, and stops after repeated no-progress
  iterations.
- Set the default loop budget to 100 iterations while retaining earlier stops
  for completion, user gates, repeated no-progress, and invocation failures.
- Added schema-versioned loop lifecycle records with supervisor and child Pi
  PIDs, correlation fields, durations, exit codes, output/session sizes, retry
  scheduling, and terminal stop reasons.
- Limited each iteration to one validated slice and one exact-path conventional
  commit, with no pushes or broad staging.
- Added a reusable prompt that routes around independent gated work and reports
  progress, quiescence, or blockage through a bounded status marker.

**Validation:** Eight focused command and runtime-logging tests, typecheck,
PowerShell parsing, and the no-provider dry run passed. The dry run resolved the
workspace, runtime state, plan files, worktree extension paths, and Pi command
without creating a session. An isolated one-iteration supervisor run emitted
the expected start, invocation, iteration, and quiescent-stop records with
populated timing, exit, and size fields.

**Files:** `pi/extensions/{loop.ts,loop/runtime-logging.ts}`,
`pi/scripts/{run-loop.ps1,loop-prompt.md}`, `pi/tests/loop.test.ts`,
`pi/README.md`, `scripts/git-hooks/pre-commit-dolos`,
`test/test_private_archive.py`, `CHANGELOG.md`

---

## 2026-07-17: Reduce old tool results in context batches

**Why:** Reducing routine tool output as it arrived removed evidence while it was
most useful and rewrote the provider payload more often than necessary.

**Changed:**
- Kept routine tool results whole until Pi reports at least 50% context usage,
  while retaining ingestion-time reduction for outputs at or above 64 KiB.
- Reduced only results older than the five-result recency window, in batches
  reclaiming approximately 5,000 tokens, with another batch gated on 5,000
  additional Pi-accounted context tokens.
- Applied the same deterministic reducer to Bash and custom tool results, kept
  transient worker failures retryable, and preserved the five newest results
  across session-tree changes.
- Added markers naming the readable session file and tool-call locator; the
  outgoing payload changes without mutating the full session transcript.

**Validation:** Seventeen focused extension tests passed, including threshold,
recency, batch stability, transient recovery, and transcript recovery cases.
Pi typecheck passed. Thirty-one reducer guard, reduction, and shell
classification tests passed; the combined reducer/dispatch run passed 21 tests.

**Files:** `pi/{extensions/tool-reduction.ts,tests/tool-reduction.test.ts}`,
`.specs/rationalization-phase2/{plan,ledger}.md`, `CHANGELOG.md`

---

## 2026-07-17: Keep the reducer worker alive

**Why:** Even after lazy rule loading, starting Python for every reduced Bash
result cost hundreds of milliseconds per call.

**Changed:**
- Added a serialized persistent `reduce.py --worker` NDJSON mode with rules
  loaded once.
- Reused one worker per extension instance, restarted after crashes, failed open
  for the current request, and cleaned the process tree on session shutdown.
- Preserved byte-identical one-shot CLI output and all marker/recovery behavior.

**Validation:** Python worker parity tests passed 8 tests; Pi reducer behavior
passed 13 tests and typecheck passed. Measured p50 improved from 329.9 ms
one-shot to 9.7 ms persistent, a 97.1% reduction. Ruff and
`git diff --check` passed.

**Files:** `pi/{extensions/tool-reduction.ts,tests/tool-reduction.test.ts,tool-reduction/}`,
`.specs/rationalization-phase2/{plan,ledger}.md`, `CHANGELOG.md`

---

## 2026-07-17: Enable the generic reducer fallback

**Why:** The generic fallback rule existed but was unreachable through the lazy
argv index, so large unknown output passed through unchanged.

**Changed:**
- Lazy-loaded the generic fallback as the last rule after all command-specific
  rules.
- Preserved shell normalization before fallback selection and kept tiny output
  raw through the existing guard.
- Extended replay and focused tests for unknown large and tiny output.

**Validation:** Thirty focused reducer/evaluator tests passed. Replay over
32,097 records reached 99.94% matching with 20 empty-argv records unmatched and
zero failure-survival failures. Unknown-command p50 was 335.3 ms, below the
recorded 524 ms baseline. Ruff and `git diff --check` passed.

**Files:** `pi/tool-reduction/{rules.py,reduce.py,evaluate.py,tests/}`,
`.specs/rationalization-phase2/{plan,ledger}.md`, `CHANGELOG.md`

---

## 2026-07-17: Align reducer schema and retention

**Why:** The reducer request claimed separate stderr and real exit-code data the
Pi hook cannot provide, while daily corpus files grew without a cap.

**Changed:**
- Removed the dead stderr request field and documented `exit_code` as Pi's
  boolean error flag encoded as 0 or 1.
- Stopped writing stderr samples in new corpus records while retaining legacy
  corpus readability.
- Added seven-day and 64 MiB corpus retention on the first daily write, with a
  non-mutating dry-run mode.

**Validation:** All 153 tool-reduction Python tests passed; the Pi reducer suite
passed 10 tests and typecheck passed. A real cache dry run selected 67 expired
files while leaving all 73 files unchanged. Ruff and `git diff --check` passed.

**Files:** `pi/{extensions/tool-reduction.ts,tests/tool-reduction.test.ts,tool-reduction/}`,
`.specs/rationalization-phase2/{plan,ledger}.md`, `CHANGELOG.md`

---

## 2026-07-17: Add shell-aware reducer fallback

**Why:** Environment assignments, shell preambles, directory leaders, chained
segments, and pipelines hid commands from reducer rules.

**Changed:**
- Added bounded shell-shape normalization only after the original argv fails to
  match, preserving all currently matched commands.
- Added verbatim failure-line survival and nonzero-exit fall-through guards.
- Added corpus replay metrics and the project Python floor.

**Validation:** Focused reducer/evaluator suites passed 39 tests. Corpus replay
processed 32,081 records, increased match rate from 52.12% to 59.48%, newly
matched 2,367 entries, and reported zero failure-survival failures. The plan's
65% gate remains unmet; the residual top ten is recorded in the phase ledger.

**Files:** `pi/tool-reduction/`,
`.specs/rationalization-phase2/{plan,ledger}.md`, `CHANGELOG.md`

---

## 2026-07-17: Make tool reductions recoverable

**Why:** Reduced Bash output did not identify the reducer or provide a path back
to the full raw result.

**Changed:**
- Appended bytes, rule ID, and raw-output recovery path to every applied
  reduction.
- Reused Pi's full-output path for truncated results and saved reducer-only raw
  output under the local tool-reduction cache.
- Added a seven-day and 64 MiB raw-output cap plus `PI_TOOL_REDUCTION=off`.

**Validation:** The real reducer fixture and mocked Pi-truncated/reducer-only
paths passed; cited files contained the full raw output. Toggle, age retention,
size cap, failure fall-through, and process cleanup coverage passed in the
10-test reducer suite; Pi typecheck and `git diff --check` passed.

**Files:** `pi/extensions/tool-reduction.ts`,
`pi/tests/tool-reduction.test.ts`,
`.specs/rationalization-phase2/{plan,ledger}.md`, `CHANGELOG.md`

---

## 2026-07-17: Protect immutable artifacts from hygiene checks

**Why:** Generic formatting validation previously changed an applied migration
checksum and broke deployment.

**Changed:**
- Added declared immutable-path patterns for migrations and Flyway artifacts.
- Made the explicit-file quality CLI report matching paths and skip validators
  without modifying the file.
- Added the immutable-artifact rule to `/commit`.

**Validation:** The quality-validation suite passed 52 tests. The exact
`scripts/quality-check` workflow reported an intentionally malformed migration,
left its SHA-256 unchanged, and validated a non-exempt Python file normally.
Ruff and `git diff --check` passed.

**Files:** `claude/hooks/quality-validation/`, `pi/skills/workflow/commit.md`,
`.specs/rationalization-phase2/{plan,ledger}.md`, `CHANGELOG.md`

---

## 2026-07-17: Persist visible command output

**Why:** Three `/improve` branches rendered help or state only through UI
notifications, leaving the model unable to observe what the user saw.

**Changed:**
- Added the model-visible output rule to the Pi command-authoring skill.
- Routed `/improve help`, unsupported input, and empty-candidate results through
  the command's visible transcript message path.
- Audited all 21 command-owning extensions; no other violation remained.

**Validation:** Slash-command echo and workflow-friction suites passed 45 tests;
Pi typecheck and `git diff --check` passed.

**Files:** `pi/skills/pi-command/SKILL.md`,
`pi/extensions/workflow-friction-review.ts`,
`pi/tests/workflow-friction.test.ts`,
`.specs/rationalization-phase2/{plan,ledger}.md`, `CHANGELOG.md`

---

## 2026-07-17: Merge skill-review agent variants

**Why:** Three agent definitions differed only by model and thinking effort.

**Changed:**
- Added optional per-launch `effort` overrides for single, parallel, and chain
  subagents, with explicit values taking precedence over frontmatter.
- Merged three skill-review variants into one `skill-review` agent while
  preserving exact model and effort dispatch records.
- Recorded 30-day usage decisions for all 52 skills, 36 extension commands,
  and 18 audited agents.

**Validation:** Focused subagent and skill-review suites passed 38 tests; Pi
typecheck and the full skill-review smoke/validate/runner sequence passed.

**Files:** `pi/{agents,extensions,lib,scripts,tests,README.md}`,
`.specs/rationalization-phase2/{plan,ledger}.md`, `CHANGELOG.md`

---

## 2026-07-17: Centralize Pi development philosophy

**Why:** General implementation and delegation policy was repeated across
always-loaded instructions and activation-triggered skills.

**Changed:**
- Made `pi/AGENTS.md` the always-loaded owner for flexible workflows,
  deterministic mechanics, code-focused tests, linter ownership, root-cause
  work, minimal instructions, and delegation boundaries.
- Replaced delegation policy in `pi/PI-INSTRUCTIONS.md` with a pointer.
- Reduced five overlapping skills to their distinct activation boundary and a
  pointer to the owner; removed fixed-count brainstorming ceremony.

**Validation:** Repository searches found one full philosophy and delegation
policy owner. Touched instruction/skill bytes decreased from 25,141 to 19,198;
`git diff --check` passed.

**Files:** `pi/{AGENTS.md,PI-INSTRUCTIONS.md,skills/}`,
`.specs/rationalization-phase2/{plan,ledger}.md`, `CHANGELOG.md`

---

## 2026-07-17: Consolidate Pi execution meta-rules

**Why:** Overlapping ask, authorization, confidence, and response-format rules
encouraged ceremony and repeated scope gates.

**Changed:**
- Replaced four ask/execute rules with one execution rule covering ambiguity,
  access, scope, denials, safety gating, and accepted risk.
- Reduced confidence calibration and unresolved-choice handling to their
  underlying values.
- Removed hedge-word, fixed-option, question-format, and issue-counter rituals.

**Validation:** `pi/AGENTS.md` decreased from 10,909 to 8,627 bytes; searches
found none of the retired rule names or presentation tokens, and
`git diff --check` passed.

**Files:** `pi/AGENTS.md`, `.specs/rationalization-phase2/{plan,ledger}.md`,
`CHANGELOG.md`

---

## 2026-07-17: Make workflow telemetry runtime-owned

**Why:** Workflow prompts prescribed detailed telemetry that runtime code never
emitted, so plans accumulated schema-shaped prose with no reliable consumer.

**Changed:**
- Limited workflow telemetry to mechanically written command-dispatch episodes
  and events.
- Removed model-authored telemetry and post-run evaluation requirements from
  `/plan-it`, `/do-it`, and the plan template.
- Narrowed telemetry types, tests, and documentation to the records the runtime
  actually writes and the query helper reads.

**Validation:** Focused workflow telemetry and dispatch tests passed 6 tests;
Pi typecheck, Ruff, Python format, prompt-contract scans, the query helper, and
`git diff --check` passed.

**Files:** `pi/{lib,tests,docs,skills}/`,
`.specs/rationalization-phase2/{plan,ledger}.md`, `CHANGELOG.md`

---

## 2026-07-17: Make workflow checkpoints honest

**Why:** The `/do-it` report contract forced interrupted work into a failure
classification even when the plan recorded no blocker.

**Changed:**
- Replaced the four-way completion enum with observable complete, checkpoint,
  and blocked states.
- Reduced interrupted-run handling to one checkpoint rule and required blocker
  claims to match current plan state.
- Made stale blocker and review evidence subject to current-state verification.

**Validation:** A live `/do-it .tmp/rationalization-phase2/t1/plan.md` run
reported a checkpoint on both boundary lines, named the next task, and claimed
no blocker. Contract scans found no old enum labels or non-ASCII content.

**Files:** `pi/skills/workflow/do-it.md`,
`pi/skills/workflow/templates/do-it-report-template.md`,
`.specs/rationalization-phase2/{plan,ledger}.md`, `CHANGELOG.md`

---

## 2026-07-16: Close test rationalization ledger

**Why:** Final reconciliation needed current collection arithmetic, a fresh
static-content sweep, exact workflow dispatch coverage, and aggregate validation.

**Changed:**
- Classified and removed the one legacy-token grep missed by the original
  ledger inventory; all 109 decision rows are now executed.
- Added `/review-it` dispatch and mutation-boundary coverage alongside the
  existing `/plan-it` and `/do-it` workflow fixtures.
- Synchronized task-await fixtures before releasing worker promises to remove
  load-dependent ownership assertions.
- Recorded before/after instruction bytes, test collections, and
  `make test-quick` timing in the ledger.

**Validation:** `make check-pi-extensions` passed 1,313 tests with one skip;
`make check` passed after focused repair of the task-await test race.

**Files:** `.specs/rationalization/ledger.md`,
`test/test_private_archive.py`, `pi/tests/{workflow-dispatch,task-tools}.test.ts`,
`CHANGELOG.md`

---

## 2026-07-16: Split quality Make targets

**Why:** Routine changed-file and static checks needed separate entrypoints from
the full repository aggregate.

**Changed:**
- Added `make check-changed FILES='...'`, which invokes the explicit-file
  quality runner once.
- Added `make check-fast` for preflight and shell static checks.
- Kept focused test entrypoints and the independent full `make check` graph;
  the graph contract verifies each full-stage command appears once.
- Made Pi dependency linking resolve from the checked-out repository so fresh
  worktrees exercise the intended package graph.
- Updated stale task-model and secret-review test fixtures exposed by the full
  aggregate.
- Kept Biome and shfmt nonblocking because their documented baseline debt
  remains unresolved.

**Three-run timing, Windows Git Bash (milliseconds):**

| Entry point | Runs | Median | Result and scope |
| --- | --- | --- | --- |
| `make check-changed FILES='scripts/quality-check'` | 1935, 1834, 1723 | 1834 | Passed; one explicit shell file through the configured runner. |
| `make check-fast` | 2619, 2601, 2875 | 2619 | Passed; preflight, Ruff, and ShellCheck. |
| `make check` | 209932, 152150, 167466 | 167466 | Passed; lint, Pytest suites, Pi typecheck, and full Vitest suite. |

The changed-file route was 785 ms faster at the median than the successful
fast static route and validates a narrower, explicit scope. The full route
passed at a distinct integration scope.

**Files:** `Makefile`, `test/test_ci_contract.py`,
`scripts/pi-deps-link-setup`, `pi/tests/{task-execution,workflow-commands}.test.ts`,
`CHANGELOG.md`

---

## 2026-07-16: Add explicit-file quality validation

**Why:** Changed-file validation required repeated one-off validator commands and
could silently skip missing tools.

**Changed:**
- Added `scripts/quality-check FILE...`, which routes explicit Python, shell,
  and Pi TypeScript files through the shared validator configuration.
- Reused the configured validator runner with four-worker bounded parallelism
  and deterministic diagnostic ordering.
- Made the CLI report unsupported files as clean, validator failures as exit 1,
  input or configuration errors as exit 2, and required missing tools as exit
  3 without installing anything.

**Files:** `scripts/quality-check`,
`claude/hooks/quality-validation/{quality_validation_hook.py,validators.yaml,tests/test_quality_validation.py}`,
`CHANGELOG.md`

---

## 2026-07-16: Establish quality-tool ownership baselines

**Why:** Pi formatting and complexity checks depended on workstation tools, while
shell formatting had no non-mutating check.

**Changed:**
- Pinned Biome 2.5.3 in the Pi pnpm workspace with a minimal formatting-only
  configuration and a `pnpm run biome:check` command.
- Added `make lint-shell-format`, which runs `shfmt -d` without writing files.
- Made the existing installer the authoritative Lizard owner because the
  shared hook runs bare commands in Windows/WSL; it now installs Lizard 1.21.3
  exactly and the validator setup guidance matches.
- Kept the new Biome and shfmt checks out of existing blocking targets until
  their historical debt is addressed.

**Baseline (nonblocking):** Biome reports 87 formatting diagnostics across
225 Pi TypeScript files. `shfmt -d` reports 12 files in the existing shell
check scope. Lizard reports 239 warnings across 438 tracked supported source
files (233 CCN, 13 parameter-count, and 6 function-length violations; classes
overlap).

**Files:** `pi/{package.json,pnpm-lock.yaml,biome.json}`, `Makefile`,
`{install,install.ps1}`, `claude/hooks/quality-validation/validators.yaml`,
`CHANGELOG.md`

---

## 2026-07-16: Align Pi tests with runtime behavior

**Why:** Pi tests still froze prompt wording, file placement, and implementation
spelling that no runtime parser consumed.

**Changed:**
- Removed prompt, source-shape, and classifier-wording assertions without an
  executable contract.
- Replaced reducer source greps with mocked process invocation and timeout-tree
  cleanup behavior.
- Kept the memory promotion scanner's sandboxed output behavior while removing
  redundant source inspection.
- Recorded accepted loss for extension-loader layout checks because no cheap
  repository-owned runtime seam exists.

**Files:** `pi/tests/`, `.specs/rationalization/ledger.md`, `CHANGELOG.md`

---

## 2026-07-16: Replace browser and CI source assertions

**Why:** Browser safety and workflow deployment checks relied on prose and
source spelling instead of observable process behavior and parsed workflow
meaning.

**Changed:**
- Replaced Brave wrapper greps with fake-process tests for loopback launch,
  owned profiles, warnings, identity refusal, and recorded-PID termination.
- Removed skill, prompt, and README wording assertions with no runtime consumer.
- Derived CI paths and direct script invocations from parsed workflow steps and
  shell tokens instead of duplicated path tuples and regular expressions.
- Removed the obsolete Claude/Pi instruction symlink test after its recorded
  user gate confirmed the files now have independent ownership.

**Files:** `test/test_agent_browser_brave.py`,
`test/test_brave_tab_capture.py`, `test/test_ci_contract.py`,
`test/test_pi_agent_metadata.py`, `.specs/rationalization/`, `CHANGELOG.md`

---

## 2026-07-16: Replace configuration source greps

**Why:** The fast configuration suite asserted shell source spelling instead of
runtime behavior or parsed configuration meaning.

**Changed:**
- Replaced 198 source-pattern cases with grouped zsh runtime, Git parser,
  Git ignore, and normalized Dotbot parity contracts.
- Reused existing prompt behavior suites instead of duplicating prompt checks.
- Recorded explicit accepted loss where a deterministic cross-platform fixture
  would cost more than the source check protected.
- Reduced the exact `make test-quick` entrypoint to four passing contracts.

**Files:** `test/test_config_patterns.py`,
`.specs/rationalization/ledger.md`, `CHANGELOG.md`

---

## 2026-07-16: Centralize Pi model routing policy

**Why:** Subagent sizing, explicit workflow choices, and premium-provider
preferences were duplicated across extensions and drifted independently.

**Changed:**
- Made `pi/lib/model-routing.ts` the owner of named preferences, explicit
  workflow choices, metadata-aware scoring, and premium-provider membership.
- Routed `/fable`, `/foreman`, and subagent size requests through the shared
  resolver while preserving explicit user overrides.
- Removed the duplicate Fable ladder and pinned-model regular expression.
- Added deterministic zero, one, and many-model coverage plus clear missing
  capability diagnostics.

**Files:** `pi/lib/model-routing.ts`, `pi/extensions/fable.ts`,
`pi/extensions/prompt-router.ts`, `pi/tests/{model-routing,fable}.test.ts`,
`CHANGELOG.md`

---

## 2026-07-16: Consolidate the Pi worker roster

**Why:** Model-bound variants and an unenforced organization chart duplicated
roles without adding distinct permissions, tools, or task boundaries.

**Changed:**
- Consolidated 33 worker definitions into 18 approved, distinct roles and
  recorded the complete old-to-new mapping in the rationalization roster.
- Removed 15 model/taxonomy duplicates while preserving the three exact
  deterministic skill-review dispatch targets.
- Removed unconsumed `roleType`, `reportsTo`, `leads`, and `routingUse`
  metadata plus parser support for `roleType`.
- Replaced hierarchy and source-shape tests with consumed frontmatter-to-child
  launch coverage for tools, runtime hint, effort, and skills.
- Updated active task, routing, documentation, and test references to surviving
  worker names.

**Files:** `pi/agents/`, `pi/extensions/subagent/agents.ts`, `pi/tests/`,
`test/test_pi_agent_metadata.py`, `pi/README.md`,
`.specs/rationalization/{plan,ledger,roster}.md`, `CHANGELOG.md`

---

## 2026-07-16: Consolidate Pi instruction ownership

**Why:** Runtime discovery mechanics, repository package policy, and delegation
rules were repeated across loaded instruction and reference layers.

**Changed:**
- Replaced named delegation gates with capability-based judgment and explicit
  override precedence.
- Reduced the always-appended Pi policy to Pi-specific ownership, safety,
  delegation evidence, and approval boundaries.
- Removed duplicate package-policy prose from the root client instructions and
  duplicate repository rules from shared global instructions.
- Replaced runtime discovery recipes in the Pi README with source-owner or
  upstream-documentation pointers.
- Reduced measured instruction/reference content from 73,445 to 68,559 bytes.

**Files:** Pi README, Pi runtime/global instructions, Pi instruction extension,
root client instructions, `CHANGELOG.md`

---

## 2026-07-16: Simplify Pi planning and execution contracts

**Why:** File-count routing, fixed worker assignments, named evaluation panels,
and duplicated step recipes made workflow prompts brittle and repeated policy
owned by runtime discovery and repository instructions.

**Changed:**
- Reframed `/plan-it` and `/do-it` around objectives, hard boundaries,
  repository evidence, validation, durable state, and definitions of done.
- Removed file-count complexity ladders, required runtime assignment columns,
  fixed specialist routing, named hidden panels, and duplicated delegation
  recipes.
- Reworked the plan template around deliverables, dependencies, required
  capabilities, mutation boundaries, exact workflow checks, and durable
  evidence.
- Kept `/prd-it` unchanged because it already delegates to its canonical skill
  without duplicating the retired prescriptions.

**Files:** `pi/skills/workflow/plan-it.md`,
`pi/skills/workflow/do-it.md`,
`pi/skills/workflow/templates/plan-template.md`, `CHANGELOG.md`

---

## 2026-07-16: Inventory static-content test contracts

**Why:** The rationalization plan requires every source-, prompt-, prose-, and
configuration-shape test to have an explicit decision before test cleanup.

**Changed:**
- Added `.specs/rationalization/ledger.md` with 108 unique decision rows tied
  to execution tasks T4, T6, T7, and T8.
- Corrected the prior audit from 89 strict / 106 broad declarations to 90
  strict / 107 broad declarations after finding one omitted source assertion.
- Recorded full Pytest and Vitest collection counts, test entrypoints, runtime
  consumers, replacement boundaries, and pending execution ownership.

**Files:** `.specs/rationalization/ledger.md`,
`.specs/rationalization/plan.md`, `CHANGELOG.md`

---

## 2026-07-16: Consolidate rationalization into one phased plan

**Why:** The interim three-plan split kept concerns independent but the user
prefers one complete walkthrough. Consolidation keeps the lean
goals/boundaries/evidence style, real dependencies only, and phase
independence so a stalled task never blocks unrelated work.

**Changed:**
- Merged the Pi harness rework, repository-wide test rationalization, and
  quality tooling plans into `.specs/rationalization/plan.md` (phases 0-4).
- Kept the repo-wide test decision ledger: every static-content test gets an
  explicit keep, replace, delete, or accepted-loss row before cleanup
  executes, closed by a final reconciliation gate.
- Authorized per-slice commits during execution and subagent parallelism for
  independent tasks.
- Marked the original plan superseded; deferred friction instruction-context
  capture to a future plan.
- Recorded user decisions: Claude client commands stay separate from Pi;
  org-chart agent taxonomy is deleted; agent roster consolidates aggressively.

**Files:** `.specs/rationalization/plan.md`,
`.specs/workflow-test-rationalization/plan.md`, `CHANGELOG.md`

---

## 2026-07-16: Generalize `/review-it` orchestration

**Why:** Fixed reviewer names, model tiers, panel sizes, and automatic follow-up
panels made plan review fragile and caused unnecessary review churn.

**Changed:**
- Replaced the fixed state machine with a runtime-adaptive review, apply, and
  validation flow.
- Made reviewer and routing selection depend on capabilities discovered at run
  time instead of predefined agents or models.
- Kept automatic application of verified artifact fixes while removing the
  alternate ask mode and automatic post-change panels.
- Simplified reviewer and synthesis templates, documentation, and contract tests.

**Files:** `pi/skills/workflow/review-it.md`,
`pi/skills/workflow/templates/review-it-reviewer-prompts.md`,
`pi/skills/workflow/templates/review-synthesis-template.md`,
`pi/tests/workflow-prompts.test.ts`, `pi/README.md`, `CHANGELOG.md`

---

## 2026-07-16: Persist extension slash command invocations

**Why:** Pi gives each extension a separate API, so the slash echo renderer could
not wrap command registrations owned by other extensions.

**Changed:**
- Added a shared local registration wrapper that persists one visible invocation
  without triggering a provider turn.
- Wired every command-owning extension through the wrapper, with explicit
  exclusions for workflows that already persist their invocation.
- Corrected startup coverage and added focused separate-API and echo tests.

**Files:** `pi/lib/slash-command-echo.ts`, `pi/extensions/`, `pi/tests/`,
`pi/README.md`, `CHANGELOG.md`

---

## 2026-07-16: Preserve Pi model metadata across catalog refreshes

**Why:** The Codex model cache stored complete provider definitions and replayed
those stale definitions over Pi 0.80.7 built-ins at startup, hiding newer
thinking levels and other model metadata.

**Changed:**
- Replaced complete cached model definitions with schema-versioned provider
  catalog facts.
- Composed cached Codex discoveries over current Pi built-ins, preserving Pi's
  metadata for known models while retaining models not yet shipped by Pi.
- Migrated legacy cache records in memory and added regression coverage for
  stale thinking-level metadata and the new cache schema.

**Files:** `pi/extensions/refresh-models.ts`,
`pi/tests/refresh-models.test.ts`, `pi/README.md`, `CHANGELOG.md`

---

## 2026-07-16: Add bounded feature memory

**Why:** Feature discussions and validated follow-up evidence were difficult to recover in fresh sessions without copying transcripts or making local observations authoritative tracked state.

**Changed:**
- Added a tracked schema-versioned feature registry and curated `/improve` dossier.
- Added deterministic trigger matching, repository containment checks, and once-per-session hidden context injection.
- Added bounded append-only local decision, evidence, open-question, and supersession events with serialized writes.
- Added a narrow matched-feature recording tool that never edits tracked dossiers.
- Documented privacy, staleness, curation, and rollback boundaries and added focused regression coverage.

**Files:** `pi/feature-memory.json`, `pi/lib/feature-memory-store.ts`,
`pi/extensions/feature-memory.ts`, `pi/tests/feature-memory.test.ts`,
`.specs/features/pi-improve/context.md`, `pi/README.md`, `CHANGELOG.md`

---

## 2026-07-15: Make improvement selection match its displayed list

**Why:** `/improve list` displayed numbered candidates but `/improve select`
accepted only ID prefixes. List and selection results were transient
notifications, so they were absent from the transcript and later model context.

**Changed:**
- Accepted displayed candidate ordinals as well as unique ID prefixes.
- Wrote list and selection output as visible session messages without starting an
  extra provider turn.
- Added regression coverage for selecting candidate 4 and retaining command
  output in the transcript.

**Files:** `pi/extensions/workflow-friction-review.ts`,
`pi/tests/workflow-friction.test.ts`, `pi/README.md`, `CHANGELOG.md`

---

## 2026-07-15: Fully hide target-context deferrals

**Why:** The target-context guard removed the blocked result text but retained its
error state and the detailed block reason, so Pi could still surface the expected
internal retry as a visible failure.

**Changed:**
- Made expected target-context deferrals reasonless.
- Finalized deferred tool calls as empty non-error results.
- Added regression coverage for the complete blocked-result transformation.
- Updated the extension type-check wrapper to resolve the current package from
  project-local, pnpm, npm, Pi-bin, and Bun locations and use the pinned local
  TypeScript compiler.
- Split the test suites and named their lifecycle callbacks so complexity
  validation recognizes bounded functions.
- Preserved the task batch validator's mutable return contract with a copy of
  readonly input values, and split workspace resolution, batch dependency
  validation, transitions, and task listing into bounded helpers.
- Updated the damage-control audit fixture to use the supported Claude policy
  shape while retaining Bash, file-tool, and PowerShell hard-block coverage.

**Files:** `pi/extensions/agents-context.ts`, `pi/extensions/tsc-check.py`,
`pi/lib/task-registry.ts`, `pi/tests/agents-context.test.ts`,
`pi/tests/damage-control.test.ts`, `CHANGELOG.md`

---

## 2026-07-15: Add explicit improvement candidate selection

**Why:** `/improve` hid all but the top-ranked candidate and treated every follow-up message as a potential decision, making candidate choice opaque and discussion state too permissive.

**Changed:**
- Added `/improve list`, `/improve select <id>`, and `/improve help`.
- Removed free-form manual capture arguments from the public command.
- Kept questions in a discussion state until an explicit Apply, Edit, Skip, or numbered selection.
- Added command selection and decision-state regression coverage.

**Files:** `pi/extensions/workflow-friction-review.ts`,
`pi/tests/workflow-friction.test.ts`, `pi/README.md`, `CHANGELOG.md`

---

## 2026-07-15: Unify Bedrock provider and refresh targeting

**Why:** `/bedrock-refresh` manufactured a default profile and ignored
provider-scoped AWS configuration, allowing model inventory to come from a
different profile or region than runtime requests.

**Changed:**
- Added one pure resolver for explicit, provider-scoped, process, config, and
  inferred AWS profile and region inputs.
- Reused the resolver for environment setup and refresh command construction.
- Omitted `--profile` for non-profile AWS credential sources.
- Corrected the Pi 0.80.7 profile-auth compatibility key and documented its
  required empty value.
- Added precedence and exact AWS argument regression coverage.

**Files:** `pi/lib/bedrock-auth.ts`, `pi/extensions/aws-bedrock-env.ts`,
`pi/extensions/bedrock-refresh.ts`, `pi/tests/bedrock-refresh.test.ts`,
`pi/README.md`, `.specs/pi-extension-refactors/backlog.md`, `CHANGELOG.md`

---

## 2026-07-15: Resolve quality-gate project placeholders

**Why:** Pi's batched quality gate passed `{project_root}` literally to validators,
so C# formatting failed before inspecting the edited file.

**Changed:**
- Detected validator project roots from configured literal and glob markers.
- Expanded `{file}` and `{project_root}` across complete validator commands.
- Honored validator detection files before selecting fallback validators.
- Ran validators from the detected root and honored configured timeouts.
- Added focused command-resolution and project-root regression coverage.

**Files:** `pi/extensions/quality-gates.ts`,
`pi/tests/quality-gates.test.ts`, `CHANGELOG.md`

---

## 2026-07-15: Hide target-context deferral messages

**Why:** Loading nested AGENTS instructions before a mutating tool retry is an
expected internal workflow and did not need a user-visible error message.

**Changed:**
- Kept deterministic target-path discovery at tool-call time.
- Suppressed the expected blocked tool result from the transcript.
- Added a hidden instruction that tells the model to retry after applying the
  newly loaded target context.

**Files:** `pi/extensions/agents-context.ts`,
`pi/tests/agents-context.test.ts`, `CHANGELOG.md`

---

## 2026-07-15: Scope the root changelog to dotfiles changes

**Why:** The global instruction could be read as requiring entries for workflow
configuration changed in unrelated repositories.

**Changed:**
- Limited root changelog entries to instructions, skills, commands, and runtime
  workflows changed within the dotfiles repository.
- Explicitly excluded changes made in other repositories.

**Files:** `pi/AGENTS.md`, `CHANGELOG.md`

---

## 2026-07-15: Make plan review converge in one invocation

**Why:** `/review-it` intentionally blocked after applying material findings from
its post-change panel, forcing repeated review invocations even when all defects
were locally repairable. `/plan-it` also checked contract presence without
checking task dependency order or command failure paths.

**Changed:**
- Made `/plan-it` validate dependency ordering, command truth tables, cleanup,
  host/container boundaries, and safe read-only probes before writing a plan.
- Prevented plan-specific telemetry script requirements when existing workflow
  artifacts can carry the evidence.
- Made `/review-it` continue from one post-change panel through deterministic
  audit and standalone readiness instead of blocking solely for material fixes.
- Limited auto-apply to must-fix/readiness changes and safety-critical hardening;
  nonblocking hardening remains backlog.
- Added an explicit review-blocked status for genuine external input or exhausted
  repair budgets and regression checks for convergence behavior.

**Files:** `pi/skills/workflow/plan-it.md`,
`pi/skills/workflow/review-it.md`, `pi/tests/workflow-prompts.test.ts`,
`CHANGELOG.md`

---

## 2026-07-15: Migrate workflow reviews to a typed agent

**Why:** The background reviewer duplicated model resolution, subprocess,
timeout, JSON parsing, and cleanup behavior already owned by the typed-agent
runtime.

**Changed:**
- Added bounded TypeBox contracts for sanitized interaction packets and reviews.
- Resolved Terra through the active model registry and reused typed-agent
  correction, cancellation, timeout, isolation, and disposal behavior.
- Removed temporary prompt files, subprocess invocation, and legacy review
  parsing while preserving queue and decision policy.
- Added focused model-selection and correction coverage.

**Files:** `pi/extensions/workflow-friction-review.ts`,
`pi/lib/workflow-friction.ts`, `pi/tests/workflow-friction.test.ts`,
`pi/tests/typed-agent.test.ts`, `.specs/pi-extension-refactors/backlog.md`,
`CHANGELOG.md`

---

## 2026-07-15: Deduplicate claimed workflow reviews

**Why:** An enqueue/claim race could recreate a pending review after the worker
claimed the original, causing the same interaction to run and persist twice.
Interrupted processing could also append a failed duplicate after completion.

**Changed:**
- Rechecked completed reviews after claiming a pending job and before execution.
- Rechecked interrupted processing jobs before recording recovery failures.
- Added deterministic contention and interrupted-recovery coverage, including
  annotation preservation.

**Files:** `pi/extensions/workflow-friction-review.ts`,
`pi/tests/workflow-friction.test.ts`,
`.specs/pi-extension-refactors/backlog.md`, `CHANGELOG.md`

---

## 2026-07-15: Complete damage-control audit recording

**Why:** Approved high-risk actions and rule-load denials could bypass security
provenance, while registered handlers assumed an interactive UI.

**Changed:**
- Centralized correlated, redacted recording for approved asks.
- Audited denied asks, hard blocks, and rule-load failures across registered
  Bash, PowerShell, read, write, and edit handlers.
- Used runtime UI capability so no-UI asks fail closed without prompting.
- Added registered-handler audit matrices and focused evaluator coverage.

**Files:** `pi/extensions/damage-control-engine.ts`,
`pi/extensions/damage-control.ts`, `pi/tests/damage-control.test.ts`,
`pi/tests/damage-control-ast.test.ts`,
`pi/tests/damage-control-parity-gaps.test.ts`,
`.specs/pi-extension-refactors/backlog.md`, `CHANGELOG.md`

---

## 2026-07-15: Bound Pi task tool context output

**Why:** Durable task operations repeated complete records and worker output in
model-visible tool results, consuming parent context during normal lifecycle and
readiness workflows.

**Changed:**
- Reduced mutation results to outcome, task ID, state, and actionable errors
  while retaining complete records in renderer details.
- Made `list` and `ready` return bounded compact summaries by default and kept
  `get` as the explicit complete-record path.
- Returned concise artifact references for large worker output while preserving
  bounded output details for expanded TUI rendering.
- Clarified that lightweight plans do not need durable task records and
  discouraged polling and redundant lifecycle calls.
- Added behavioral coverage for compact results, bounded collections, complete
  record retrieval, and file-only large output.

**Files:** `pi/extensions/tasks.ts`, `pi/tests/task-tools.test.ts`,
`pi/AGENTS.md`, `pi/PI-INSTRUCTIONS.md`, `pi/README.md`, `CHANGELOG.md`

---

## 2026-07-15: Unify task lifecycle policy

**Why:** The task tool, `/tasks`, and background coordinator enforced different
start and cancellation behavior, allowing blocked direct work to start and
active background work to outlive command cancellation.

**Changed:**
- Added one lifecycle service for command and tool transitions, skip reasons,
  retries, and cancellation.
- Reused registry readiness checks for direct and background starts.
- Routed active command cancellation through the execution coordinator and
  preserved truthful failed-to-stop state.
- Added parity and active-cancellation regression coverage.

**Files:** `pi/extensions/tasks.ts`, `pi/extensions/tasks/execution.ts`,
`pi/lib/task-registry.ts`, `pi/tests/tasks.test.ts`,
`pi/tests/task-tools.test.ts`, `pi/tests/task-execution.test.ts`,
`.specs/pi-extension-refactors/backlog.md`, `CHANGELOG.md`

---

## 2026-07-15: Make commit fallback exhaustive

**Why:** A valid formatting commit subject was rejected by a mismatched type
policy, then the fallback refused a mixed-surface selection instead of
committing every selected file.

**Changed:**
- Unified conventional commit types across the planner prompt, Pi validators,
  compatibility instructions, and deterministic helper.
- Changed planner failure fallback to one commit containing every selected
  path, regardless of ownership surface.
- Added regression coverage for formatting subjects and mixed Pi, Python, Go,
  and root-file selections.

**Files:** `pi/extensions/workflow-commands.ts`,
`pi/lib/commit/message.ts`, `pi/lib/workflow-commands/prompts.ts`,
`pi/tests/commit-message.test.ts`, `pi/tests/workflow-commands-pure.test.ts`,
`pi/tests/workflow-commands.test.ts`, `pi/tests/workflow-prompts.test.ts`,
`claude/shared/commit-instructions.md`, `scripts/commit-helper`,
`test/test_commit_helper.py`, `CHANGELOG.md`

---

## 2026-07-15: Normalize Pi runtime icon spacing

**Why:** Leading icons in Pi tool labels and notifications used inconsistent
visual gaps before their text.

**Changed:**
- Standardized active Pi runtime labels on two display spaces after leading
  icons.
- Kept spacing as presentation-only behavior without exact-whitespace tests.

**Files:** `pi/extensions/structured-edit.ts`, `pi/extensions/text-edit.ts`,
`pi/extensions/tool-search.ts`, `pi/extensions/subagent/index.ts`,
`pi/extensions/tps-tracker.ts`, `CHANGELOG.md`

---

## 2026-07-15: Improve session warning icon spacing

**Why:** The branch-behind notification rendered the warning icon too close to
its message text in the terminal.

**Changed:**
- Added a second display space between the warning icon and `Branch`.
- Preserved singular and plural branch-behind wording.

**Files:** `pi/extensions/session-hooks.ts`, `CHANGELOG.md`

---

## 2026-07-15: Remove duplicate YouTube skill source

**Why:** The explicitly configured YouTube skill collided with the community
skill already discovered under Pi's user skill directory.

**Changed:** Removed the redundant skill path from Pi settings so native
discovery loads only the community `youtube-transcript` skill.

**Files:** `pi/settings.json`, `CHANGELOG.md`

---

## 2026-07-15: Preserve max thinking during model refresh

**Why:** Provider catalogs now expose native `max` thinking for additional models,
but the local refresh allowlist stopped at `xhigh`.

**Changed:**
- Added `max` to refreshed model thinking maps.
- Strengthened the regression to assert the complete map, including unsupported
  levels represented by `null`.

**Files:** `pi/extensions/refresh-models.ts`,
`pi/tests/refresh-models.test.ts`, `.specs/pi-extension-refactors/backlog.md`,
`CHANGELOG.md`

---

## 2026-07-15: Retire the unused Pi agent-team runtime

**Why:** The no-op extension, native team dispatch, configuration files, and
launch recipes were unused and duplicated direct subagent orchestration.

**Changed:**
- Removed the agent-team extension, team configuration files, dispatch mode,
  task origin, telemetry mode, and dedicated tests.
- Removed the `just team` recipe and stopped generated projects from loading the
  retired extension.
- Retained single, parallel, and chain subagent execution and standalone agent
  personas.

**Files:** `pi/extensions/agent-team.ts`, `pi/extensions/subagent/index.ts`,
`pi/extensions/fable.ts`, `pi/extensions/tasks.ts`,
`pi/lib/task-registry.ts`, `pi/lib/orchestration-telemetry.ts`,
`pi/agents/teams.yaml`, `pi/agents/ml-team-config.yaml`, `pi/justfile`,
`pi/scripts/pi-new`, `pi/README.md`, tests,
`.specs/pi-extension-refactors/backlog.md`, `CHANGELOG.md`

---

## 2026-07-15: Unpin the startup command list

**Why:** The complete command inventory occupied persistent editor space and
included prompt and skill commands that were not useful in the startup list.

**Changed:**
- Replaced the persistent startup widget with a one-time startup status line.
- Limited the startup list to extension commands.
- Cleared the old widget during reload so existing sessions lose it immediately.

**Files:** `pi/extensions/01-startup-commands.ts`,
`pi/tests/startup-commands.test.ts`, `CHANGELOG.md`

---

## 2026-07-15: Move prompt-only Pi commands to native templates

**Why:** `/summarize` and `/gitlab-ticket` only expanded prompts, so extension
registrations duplicated Pi's native prompt-template command surface.

**Changed:**
- Moved `/summarize` and `/gitlab-ticket` to `pi/prompts/` with frontmatter,
  argument hints, and `$ARGUMENTS` expansion.
- Removed their extension registrations and obsolete prompt-building helper.
- Updated command documentation and prompt-placement regressions.

**Files:** `pi/prompts/summarize.md`, `pi/prompts/gitlab-ticket.md`,
`pi/skills/workflow/gitlab-ticket.md`, `pi/extensions/workflow-commands.ts`,
`pi/lib/workflow-commands/prompts.ts`, `pi/tests/workflow-commands.test.ts`,
`pi/tests/workflow-prompts.test.ts`, `pi/README.md`, `CHANGELOG.md`

---

## 2026-07-15: Retire the unused Pi agent chain

**Why:** `/chain` was a legacy user macro around sequential subagent calls, and
its `log_exchange` tool had no recorded calls or conversation logs. Native
subagent chain mode now owns model-driven sequencing.

**Changed:**
- Removed the `/chain` command, `log_exchange` tool, and obsolete extension.
- Removed the dedicated launch recipe, integration test, coverage entry, and
  command documentation.
- Retained the independently used memory retrieval and promotion libraries.

**Files:** `pi/extensions/agent-chain.ts`, `pi/tests/agent-chain.test.ts`,
`pi/tests/vitest.config.ts`, `pi/justfile`, `pi/README.md`,
`pi/docs/expertise-layering.md`, `pi/extensions/README.md`,
`.specs/pi-extension-refactors/backlog.md`, `CHANGELOG.md`

---

## 2026-07-15: Use Pi's command inventory for the startup widget

**Why:** The startup widget replaced `pi.registerCommand`, duplicated Pi's
command registry, and omitted native prompt and skill commands.

**Changed:**
- Replaced registration interception with the documented `pi.getCommands()` API.
- Included extension commands, duplicate suffixes, prompt templates, and skills.
- Preserved reload refreshes and exactly one slash echo per extension command.

**Files:** `pi/extensions/01-startup-commands.ts`,
`pi/tests/startup-commands.test.ts`,
`.specs/pi-extension-refactors/backlog.md`, `CHANGELOG.md`

---

## 2026-07-15: Keep Pi session summaries grounded in session context

**Why:** `/summarize` could over-weight recent Git history and omit earlier work
represented by a compaction summary.

**Changed:**
- Made available session context authoritative for summary scope.
- Restricted Git status and history to corroborating implementation and current state.
- Required limited-coverage disclosure when compaction leaves insufficient detail.
- Added a command-level regression for the summary evidence rules.

**Files:** `pi/extensions/workflow-commands.ts`,
`pi/tests/workflow-commands.test.ts`, `CHANGELOG.md`

---

## 2026-07-15: Retire the unused Pi research command

**Why:** `/research` was an unused public command with a dedicated workflow that
duplicated on-demand research available through normal orchestration.

**Changed:**
- Removed the `/research` registration and its orphaned workflow template.
- Removed `/research` from the Pi command documentation.
- Added a regression that keeps the retired command out of the runtime registry.

**Files:** `pi/extensions/workflow-commands.ts`,
`pi/skills/workflow/research.md`, `pi/tests/workflow-commands.test.ts`,
`pi/README.md`, `CHANGELOG.md`

---

## 2026-07-15: Consolidate repository changelogs

**Why:** Separate client and Pi changelogs duplicated entries and made update instructions depend on the edited surface.

**Changed:**
- Merged the tracked client and Pi histories into this root changelog.
- Redirected changelog instructions to `~/.dotfiles/CHANGELOG.md`.
- Removed the superseded `claude/CHANGELOG.md` and `pi/CHANGELOG.md` files.

**Files:** `CHANGELOG.md`, `claude/CLAUDE.md`, `pi/AGENTS.md`

---

## Repository and client history

### 2026-07-15: Ground Pi typed workflows in end-to-end design

**Why:** The typed-agent skill described stage boundaries but did not explicitly
require walking an unfamiliar workflow end to end before automation or keeping
validator execution and pass/fail routing outside semantic stages.

**Fix:** Added workflow-design checks for identifying deterministic inputs,
semantic judgments, validation signals, approval boundaries, bounded diagnostic
handoffs, and code-owned retry decisions. Linked the source video and timestamps.

**Files:** ~/.dotfiles/pi/skills/typed-agent-workflows/SKILL.md

---

### 2026-07-15: Surface Pi commit planner fallback reasons

**Why:** `/commit` discarded planner exceptions and labeled every fallback as
planner unavailability, leaving the actual failure unrecoverable.

**Fix:** Added bounded credential-redacted failure reporting before the
existing deterministic ownership fallback, with helper and command-level
regressions.

**Files:** ~/.dotfiles/pi/extensions/workflow-commands.ts,
~/.dotfiles/pi/tests/workflow-commands-pure.test.ts,
~/.dotfiles/pi/tests/workflow-commands.test.ts,
~/.dotfiles/pi/CHANGELOG.md

---

### 2026-07-14: Rank Pi improvements by verified usage impact

**Why:** `/improve` selected the oldest supported candidate without considering
how often the affected surface was used, while local stats had attribution and
scope defects that prevented reliable prioritization.

**Fix:** Corrected the stats pipelines, added structured improvement targets,
and ranked safety and correctness first followed by verified 30-day usage,
confidence, age, and interaction ID. Unknown telemetry remains distinct from
verified zero usage.

**Files:** ~/.dotfiles/pi/extensions/extension-stats.ts,
~/.dotfiles/pi/extensions/orchestration-stats.ts,
~/.dotfiles/pi/extensions/router-stats.ts,
~/.dotfiles/pi/extensions/skill-stats.ts,
~/.dotfiles/pi/extensions/usage.ts,
~/.dotfiles/pi/extensions/workflow-friction-review.ts,
~/.dotfiles/pi/lib/workflow-friction.ts, ~/.dotfiles/pi/tests,
~/.dotfiles/pi/README.md, ~/.dotfiles/pi/CHANGELOG.md

---

### 2026-07-14: Remove test-only Pi router paths

**Why:** Legacy hysteresis, policy, status-label, and transcript-emission helpers
were no longer called by the provider routing path. Tests that invoked those
helpers directly gave them the appearance of runtime coverage.

**Fix:** Removed the test-only helpers and their direct tests, then retired the
production-visible policy parsing, legacy state, status fields, and docs that
had no effect on authoritative provider routing. Retained same-turn telemetry
and live routing coverage.

**Files:** ~/.dotfiles/pi/extensions/prompt-router.ts,
~/.dotfiles/pi/lib/prompt-router/config.ts,
~/.dotfiles/pi/tests/prompt-router.test.ts,
~/.dotfiles/pi/tests/transcript-integration.test.ts,
~/.dotfiles/pi/prompt-routing/docs/settings-doc.md,
~/.dotfiles/pi/prompt-routing/docs/classifier-training.md,
~/.dotfiles/pi/README.md,
~/.dotfiles/.specs/pi-extension-refactors/backlog.md

---

### 2026-07-14: Retire duplicate Pi skill commands

**Why:** Pi's custom skill loader duplicated native skill discovery, exposed
reference documents as slash commands, and made `/skills` and `/yt-local`
operator commands even though neither should be public.

**Fix:** Retired the custom skill-command loader and `/skills`, migrated `/yt`
to a native Pi prompt template, kept the local YouTube fetcher as an internal
fallback, loaded the YouTube transcript guidance through native skill settings,
and updated `/skill-stats` for current nested session records.

**Files:** ~/.dotfiles/pi/extensions/skill-loader.ts,
~/.dotfiles/pi/extensions/skill-stats.ts, ~/.dotfiles/pi/prompts/yt.md,
~/.dotfiles/pi/skills/workflow/yt.md,
~/.dotfiles/pi/skills/workflow/yt-local.md, ~/.dotfiles/pi/settings.json,
~/.dotfiles/pi/tests/skill-loader.test.ts,
~/.dotfiles/pi/tests/skill-stats.test.ts

---

### 2026-07-14: Stabilize Pi secret-review coverage

**Why:** `/commit` required the secret reviewer to reproduce path, label, line, and
match text verbatim. Harmless output normalization could therefore fail exact
candidate coverage before commit planning.

**Fix:** Assigned stable numeric IDs to deterministic scanner candidates, made
the reviewer return only each ID and its decision, retried one incomplete
coverage response with an explicit correction, and joined validated decisions
back to the original candidate metadata in code.

**Files:** ~/.dotfiles/pi/extensions/workflow-commands.ts,
~/.dotfiles/pi/lib/workflow-commands/prompts.ts,
~/.dotfiles/pi/tests/workflow-commands-pure.test.ts,
~/.dotfiles/pi/tests/workflow-prompts.test.ts

---

### 2026-07-14: Surface Pi commit planner warnings

**Why:** `/commit` accepted validated planner warnings but discarded them before
creating commits, leaving useful uncertainty invisible to the operator.

**Fix:** Normalized non-empty planner warnings and emitted them through the
existing `/commit` activity stream before staging each planned group.

**Files:** ~/.dotfiles/pi/extensions/workflow-commands.ts,
~/.dotfiles/pi/tests/workflow-commands-pure.test.ts

---

### 2026-07-14: Consolidate Pi self-improvement commands

**Why:** Pi exposed interaction capture, aggregate review, candidate approval,
and skill linting as overlapping self-improvement workflows.

**Fix:** Added `/improve` as the single public self-improvement command, folded
recent interaction context, prior experiments, and target-skill usage into one
Apply/Edit/Skip discussion, and retired `/capture`, `/learning-review`,
`/workflow-review`, and `/skill-review` registrations.

**Files:** ~/.dotfiles/pi/extensions/workflow-friction-review.ts,
~/.dotfiles/pi/extensions/skill-review-command.ts,
~/.dotfiles/pi/lib/workflow-friction.ts,
~/.dotfiles/pi/tests/workflow-friction.test.ts,
~/.dotfiles/pi/tests/skill-review.test.ts, ~/.dotfiles/pi/README.md

---

### 2026-07-14: Strengthen Pi review readiness checks

**Why:** Material plan repairs and incremental readiness findings could bypass
renewed adversarial coverage or exhaust the fixed repair budget one blocker at a
time.

**Fix:** Added material-change panel routing, a bounded pre-readiness contract
audit, and consolidated standalone-readiness checks to the Pi review workflow.

**Files:** ~/.dotfiles/pi/skills/workflow/review-it.md,
~/.dotfiles/pi/tests/workflow-prompts.test.ts

---

### 2026-07-14: Add Pi typed-agent workflows

**Why:** Pi commands needed a small reusable boundary between deterministic
workflow code and focused semantic decisions without introducing a second
language or a general workflow framework.

**Fix:** Added a Pi SDK-backed typed-agent API, migrated `/commit` semantic
stages to isolated typed agents with schema validation and one correction
retry, and added a skill with evidence-triggered capability specifications.

**Files:** ~/.dotfiles/pi/lib/typed-agent.ts,
~/.dotfiles/pi/extensions/workflow-commands.ts,
~/.dotfiles/pi/tests/typed-agent.test.ts,
~/.dotfiles/pi/tests/workflow-commands.test.ts,
~/.dotfiles/pi/tests/workflow-commands-pure.test.ts,
~/.dotfiles/pi/skills/typed-agent-workflows/SKILL.md,
~/.dotfiles/pi/skills/typed-agent-workflows/roadmap.md

---

### 2026-07-14: Add Pi cross-session learning review

**Why:** Pi needed to turn explicit corrections into quarantined, reviewable
lessons instead of changing durable instructions automatically.

**Fix:** Added immediate correction review, a conversational `/learning-review`
1-3-1 flow, and append-only applied/skipped decisions with validation and
rollback evidence.

**Files:** ~/.dotfiles/pi/extensions/workflow-friction-review.ts,
~/.dotfiles/pi/lib/workflow-friction.ts,
~/.dotfiles/pi/tests/workflow-friction.test.ts, ~/.dotfiles/pi/README.md

---

### 2026-07-14: Reduce workflow-friction instruction conflicts

**Why:** Session review found that broad warning repair and over-scope guidance
could conflict with exact-workflow validation and bounded execution.

**Fix:** Limited repair to the requested workflow or changed boundary, made
informational requests read-only unless mutation is explicit, required work to
be bounded before mutation, aligned delegation with the conditional Pi policy,
and prohibited behavior-changing bypasses of supported repository entrypoints.

**Files:** ~/.dotfiles/pi/AGENTS.md, ~/.dotfiles/AGENTS.md

---

### 2026-07-14: Make Pi instructions canonical

**Why:** Pi is the primary coding interface, while Claude Code should continue receiving the same shared global instructions.

**Fix:** Reversed the instruction symlink so `pi/AGENTS.md` owns the content and `claude/CLAUDE.md` links to it. Updated live documentation and added a topology regression test.

**Files:** ~/.dotfiles/pi/AGENTS.md, ~/.dotfiles/claude/CLAUDE.md, ~/.dotfiles/AGENTS.md, ~/.dotfiles/pi/README.md, ~/.dotfiles/claude/README.md, ~/.dotfiles/test/test_pi_agent_metadata.py

---

### 2026-07-10: Treat explicit requests as authorization

**Why:** Agents could ask for conversational confirmation after the user had already specified or selected an action, then trigger a second runtime safety confirmation for the same operation.

**Fix:** Clarified that explicit requests authorize exact in-scope execution, runtime safety confirmation is the sole approval gate for the same tool call, plans are not approval gates, 1-3-1 applies only to unresolved choices, and broad audits do not pause for repeated confirmation within the agreed scope.

**Files:** ~/.dotfiles/claude/CLAUDE.md

---

### 2026-07-09: Restore private-store contract wording

**Why:** CI contract tests require the private-store skill to preserve the Obsidian vault wording used by browser tab capture and handoff guidance.

**Fix:** Restored the explicit local plaintext Obsidian-compatible vault phrasing and one-H1 title requirement in the private-store skill.

**Files:** ~/.dotfiles/pi/skills/private-store/SKILL.md

---

### 2026-06-28: Encode recurring workflow preferences

**Why:** Past-session review found repeated workflow expectations around exact-path validation, durable handoff, scratch output handling, worktree state, deployment checks, private values, and domain-specific triage loops.

**Fix:** Updated shared instruction guidance and Pi skills to capture those preferences, including overwrite-not-delete scratch handling, parallel discovery with one-topic-at-a-time execution, migration parity, worktree live-state checks, WIP save-point commits, hot-path extension caching, GitOps validation, Playwright triage, and tenant automation rules.

**Files:** ~/.dotfiles/pi/AGENTS.md, ~/.dotfiles/pi/skills/workflow-design/SKILL.md, ~/.dotfiles/pi/skills/least-astonishment/SKILL.md, ~/.dotfiles/pi/skills/planning/SKILL.md, ~/.dotfiles/pi/skills/prd/SKILL.md, ~/.dotfiles/pi/skills/workflow/plan-it.md, ~/.dotfiles/pi/skills/git-workflow/SKILL.md, ~/.dotfiles/pi/skills/git-workflow/worktrees.md, ~/.dotfiles/pi/skills/git-workflow/gitlab.md, ~/.dotfiles/pi/skills/workflow/commit.md, ~/.dotfiles/pi/skills/pi-extension/SKILL.md, ~/.dotfiles/pi/skills/tui-ux/SKILL.md, ~/.dotfiles/pi/skills/logging-observability/SKILL.md, ~/.dotfiles/pi/skills/terraform/SKILL.md, ~/.dotfiles/pi/skills/private-store/SKILL.md, ~/.dotfiles/pi/skills/ansible/SKILL.md, ~/.dotfiles/pi/skills/shell/SKILL.md, ~/.dotfiles/pi/skills/docker/SKILL.md, ~/.dotfiles/pi/skills/kubernetes-helm/SKILL.md, ~/.dotfiles/pi/skills/playwright-e2e/SKILL.md, ~/.dotfiles/pi/skills/m365-tenant-automation/SKILL.md

---

### 2026-06-24: Expand Pi extension authoring footguns

**Why:** Public Pi skill and extension repositories surfaced additional recurring authoring mistakes beyond shell-out performance, especially around registration-time actions, reload-safe state, command-only context methods, and custom tool contracts.

**Fix:** Updated the Pi extension skill with concise rules for factory registration boundaries, RPC/TUI mode guards, tool error signaling, StringEnum parameters, path normalization, extension-relative file resolution, state reconstruction, command-only methods, and model switch checks.

**Files:** ~/.pi/agent/skills/pi-extension/SKILL.md

---

### 2026-06-24: Add Pi extension runtime guidance

**Why:** Pi extension work needed a dedicated checklist for hot-path subprocess risks, runtime cleanup, bounded output, and Pi-native extension patterns.

**Fix:** Updated the Pi extension skill to prefer Pi docs and examples, document render/status/tool-result shell-out risks, require caching/gating/timeouts, and capture cleanup, cancellation, mutation queue, and truncation guidance.

**Files:** ~/.pi/agent/skills/pi-extension/SKILL.md

---

### 2026-06-08: Compact large domain skills

**Why:** Several broad domain skills had grown into tutorial-heavy files, which made routine activation expensive and blurred when to load optional details.

**Fix:** Reworked the TypeScript, Python, shell, Docker, git workflow, logging-observability, Ansible, Terraform, and llms.txt main skill files as compact indexes with triggers, must/must-not rules, validation commands, anti-patterns, and links to detailed reference files.

**Files:** ~/.dotfiles/pi/skills/typescript/SKILL.md, ~/.dotfiles/pi/skills/typescript/reference.md, ~/.dotfiles/pi/skills/python/SKILL.md, ~/.dotfiles/pi/skills/python/reference.md, ~/.dotfiles/pi/skills/shell/SKILL.md, ~/.dotfiles/pi/skills/shell/reference.md, ~/.dotfiles/pi/skills/docker/SKILL.md, ~/.dotfiles/pi/skills/docker/reference.md, ~/.dotfiles/pi/skills/git-workflow/SKILL.md, ~/.dotfiles/pi/skills/git-workflow/reference.md, ~/.dotfiles/pi/skills/logging-observability/SKILL.md, ~/.dotfiles/pi/skills/logging-observability/reference.md, ~/.dotfiles/pi/skills/ansible/SKILL.md, ~/.dotfiles/pi/skills/ansible/reference.md, ~/.dotfiles/pi/skills/terraform/SKILL.md, ~/.dotfiles/pi/skills/terraform/reference.md, ~/.dotfiles/pi/skills/llmstxt/SKILL.md, ~/.dotfiles/pi/skills/llmstxt/reference.md

---

### 2026-06-06: Make private datastore Obsidian-compatible

**Why:** Private datastore writers needed one vault structure so browser captures, handoffs, X data, attachments, and indexes are browsable in Obsidian instead of mixing notes and raw artifacts in timestamp folders.

**Fix:** Updated the private-store and browser-tab-capture skills, handoff prompt, X guidance, and Brave tab capture script to use domain notes, `_attachments/`, `_indexes/`, YAML frontmatter, and a legacy browser-capture migration mode.

**Files:** ~/.dotfiles/pi/skills/private-store/SKILL.md, ~/.dotfiles/pi/skills/browser-tab-capture/SKILL.md, ~/.dotfiles/pi/prompts/handoff.md, ~/.dotfiles/pi/skills/x-twitter/SKILL.md, ~/.dotfiles/scripts/brave-tab-capture, ~/.dotfiles/scripts/private-vault-audit, ~/.dotfiles/scripts/private-vault-normalize, ~/.dotfiles/test/test_brave_tab_capture.py

---

### 2026-06-06: Align private archive commit behavior

**Why:** Private datastore writes were expected to be encrypted into the commit artifact during normal commits, but the Dolos hook only scanned staged paths and left packing as a manual step.

**Fix:** Updated the Dolos pre-commit hook to pack diverged `private/` content into `.dolos/artifacts/private.tar.gz.age`, stage the encrypted artifact, and re-scan before commit. Added a private-store skill to define scoped writes under `private/`.

**Files:** ~/.dotfiles/scripts/git-hooks/pre-commit-dolos, ~/.dotfiles/scripts/install-dolos-hook, ~/.dotfiles/pi/skills/private-store/SKILL.md, ~/.dotfiles/pi/skills/x-twitter/SKILL.md, ~/.dotfiles/test/test_private_archive.py

---

### 2026-06-06: Add Brave tab capture workflow

**Why:** Open Brave tab capture needed a repeatable workflow that keeps sensitive URLs in the ignored private store and reports whether results came from live CDP or session-file parsing.

**Fix:** Added a focused Pi browser-tab-capture skill plus `scripts/brave-tab-capture`, with tests covering session-file parsing and private-store output guidance.

**Files:** ~/.dotfiles/pi/skills/browser-tab-capture/SKILL.md, ~/.dotfiles/scripts/brave-tab-capture, ~/.dotfiles/test/test_brave_tab_capture.py

---

### 2026-06-04: Document verifiable shell temp cleanup patterns

**Why:** Damage-control can now prove several canonical temporary-file cleanup patterns, and shell guidance needed to steer future scripts toward those easy-to-verify forms.

**Fix:** Updated the Pi shell skill temporary-file section to prefer direct `mktemp` assignments, exact quoted cleanup targets with `--`, EXIT trap cleanup, temp-directory child paths, and conservative examples that should continue to require review.

**Files:** ~/.dotfiles/pi/skills/shell/SKILL.md

---

### 2026-06-03: Require inline goal prompts to start with /goal

**Why:** Inline Pi goal prompt requests were still allowed to include a short lead-in, so some responses did not begin with the copyable `/goal` command.

**Fix:** Updated the Pi goal prompt skill to require the assistant response itself to start with `/goal ` and removed the short lead-in allowance.

**Files:** ~/.dotfiles/pi/skills/pi-goal/SKILL.md

---

### 2026-06-03: Clean up Pi skill client references

**Why:** A few Pi skills still had Claude-specific references or vague "best practices" wording that could confuse cross-client use.

**Fix:** Updated Pi API, TypeScript, and debugging skills to reference active repo/client instruction files, project conventions, and concrete validation instead of Claude-only files or vague quality language.

**Files:** ~/.dotfiles/pi/skills/api-design/SKILL.md, ~/.dotfiles/pi/skills/typescript/SKILL.md, ~/.dotfiles/pi/skills/analysis-workflow/debugging.md

---

### 2026-06-03: Tighten coding-quality and cross-client instruction guidance

**Why:** Goal prompts and shared instruction files needed a concrete coding-quality bar without vague "best practices" wording, and several shared surfaces carried Claude-specific tool/path names while also being loaded by Pi.

**Fix:** Updated the Pi goal skill to require the smallest maintainable coding change, project patterns, explicit validation, and no placeholder/speculative implementations. Reworded shared instruction and development-philosophy guidance to use active harness/client terms and replaced per-tool-call planning with outcome-first next-step guidance.

**Files:** ~/.dotfiles/pi/skills/pi-goal/SKILL.md, ~/.dotfiles/claude/CLAUDE.md, ~/.dotfiles/pi/skills/development-philosophy/SKILL.md, ~/.dotfiles/claude/skills/development-philosophy/SKILL.md

---

### 2026-06-01: Default Pi goal prompt skill to inline output

**Why:** Requests to create a `/goal` prompt should usually return a copyable command on screen, not create a markdown file unless the user asks for one or the prompt is too large for inline use.

**Fix:** Updated the Pi goal prompt skill to make inline `/goal ...` output the default for most tasks, allow file-backed prompts for large or complex goals, and ask before creating a file when only recommending a file-backed prompt.

**Files:** ~/.dotfiles/pi/skills/pi-goal/SKILL.md

---

### 2026-05-23: Tune Pi commit secret scanning

**Why:** The Pi `/commit` workflow's documented `detect-secrets-hook` command used the default Yelp detect-secrets ruleset, so `KeywordDetector` blocked harmless test fixtures containing words like `secret` or `key`.

**Fix:** Updated the Pi commit workflow instructions to pass `--disable-plugin KeywordDetector`, including the `.secrets.baseline` variant, so staged scans focus on secret-shaped values while retaining the other detect-secrets detectors.

**Files:** ~/.dotfiles/pi/skills/workflow/commit.md

---

### 2026-05-02: yt-local scripts use PEP 723 inline metadata

**Why:** `uv run <abs-path>/fetch_transcript.py` from any cwd other than `claude/commands/yt-local` failed with `No module named 'youtube_transcript_api'` because uv resolves deps from cwd, not script location.

**Fix:** Added `# /// script` inline metadata blocks to both scripts so uv resolves deps per-script regardless of cwd. Project `pyproject.toml` retained for the test entry points.

**Files:** ~/.dotfiles/claude/commands/yt-local/fetch_transcript.py, ~/.dotfiles/claude/commands/yt-local/fetch_metadata.py

---

### 2026-04-29: Vendor three skills from mattpocock/skills

**Added:**
- `claude/skills/grill-me/` -- aggressive plan interrogation skill; one question at a time, model provides recommended answer with each, prefers exploring the codebase over asking
- `claude/skills/zoom-out/` -- "map modules + callers at a higher abstraction" one-shot
- `claude/skills/caveman/` -- toggleable ultra-terse reply mode (~75% token cut), persists until "stop caveman"
- `claude/skills/UPSTREAM.md` -- provenance manifest pinning upstream repo + commit SHA + import date so we can diff against future upstream changes

Upstream: https://github.com/mattpocock/skills @ `f71bb975bfae2dc0d31c529c7dd4a8479ecc3748` (2026-04-29). All three SKILL.md files copied verbatim.

**Files:** ~/.dotfiles/claude/skills/grill-me/SKILL.md, ~/.dotfiles/claude/skills/zoom-out/SKILL.md, ~/.dotfiles/claude/skills/caveman/SKILL.md, ~/.dotfiles/claude/skills/UPSTREAM.md

---

### 2026-04-29: Adopt personal-preferences ruleset (over-scope guard, command discipline, package-manager policy)

**Added:**
- Critical rule "Stop when over-scoped": if a request bundles too much work, STOP and propose a sequenced 1-3-1 breakdown rather than silently attempting the whole thing.
- TypeScript skill section "Command Discipline": do not start dev servers or run builds during edit/verify work; default to typecheck/lint/test for verification.
- TypeScript skill section "Package Manager: pnpm or bun, never npm/yarn": pick from lockfile, do not silently migrate, flag when CI pins differently.

**Files:** ~/.dotfiles/claude/CLAUDE.md, ~/.dotfiles/claude/skills/typescript/SKILL.md

---

### 2026-04-16: Ban em-dashes / en-dashes in file content

**Added:**
- Critical rule: never write em-dash or en-dash characters into code, comments, docs, or commit messages. Use ASCII `--` or `-` instead. Triggered by a session where an Edit-then-Read round-trip on a Windows host turned in-file em-dashes into mojibake, which then broke subsequent Edit string-matching and forced a full Write rewrite of the file. Chat replies to the user are unaffected.

**Files:** ~/.dotfiles/claude/CLAUDE.md

---

### 2026-04-16: Add validate-before-committing rule

**Added:**
- Critical rule: NEVER commit unverified fixes. Must run the code path and confirm broken->working before git commit. Added to CLAUDE.md after a session where multiple cert/infra fixes were committed before being validated end-to-end, causing wasted cycles.

**Files:** ~/.claude/CLAUDE.md

### Personal ruleset changelog

This file tracks changes to the personal Claude Code ruleset (`~/.claude/CLAUDE.md`) and associated skills/commands.

---

### 2026-04-15: Add no-magic-values guidance to all language skills

**Added:**
- "No Magic Values" section to 7 language skills (TypeScript, Python, C#, Go, Rust, Ruby, Shell) with idiomatic patterns per language and consistent "When Literals Are Fine" exceptions

**Files:** claude/skills/typescript/SKILL.md, claude/skills/python/SKILL.md, claude/skills/csharp/core.md, claude/skills/go/core.md, claude/skills/rust/core.md, claude/skills/ruby/core.md, claude/skills/shell/SKILL.md

---

### 2026-04-08: plan-it and review-it emit next-step commands

**Changed:**
- `/plan-it` now outputs both `/review-it` and `/do-it` commands with the concrete `.specs/{slug}/plan.md` path so the user can copy either
- `/review-it` now outputs a `/do-it <plan-path>` command after the review summary

**Files:** claude/shared/plan-it-instructions.md, claude/shared/review-it-instructions.md

### 2026-03-18: Improve war-report specificity and formatting

**Changed:**
- Added explicit rule requiring specific entries (name the feature/component/system) -- generic statements like "fixed a bug" are never acceptable
- Added bad example section showing what NOT to write
- Enforced active voice and no trailing periods on entries
- Updated good examples to match new formatting rules

**Files:** claude/skills/war-report/SKILL.md

### 2026-02-26: Fix Windows console window flashing caused by uv in hooks

**Fixed:**
- Replaced `uv run` with bare `python` in all hook commands in `settings.json` -- `uv.exe` spawns visible `conhost.exe` windows on the hook execution path in Claude Code v2.1.45+
- Removed redundant `bash -c` wrapper from all Python hook commands (was spawning an unnecessary extra bash layer)
- Normalized outlier hook patterns: PermissionRequest no longer uses `-l` (login shell) or bare `python` without `uv`; statusLine uses `$HOME` instead of `~`
- Added `pip install pyyaml tree-sitter tree-sitter-bash` to both `install` and `install.ps1` for hook dependencies
- Updated tracking doc with diagnostic findings and posted follow-up comments to #28138 and #14828
- Cleaned up duplicate uv binaries (orphaned pip installs shadowing WinGet version)

**Root cause:** Claude Code v2.1.45+ lost `windowsHide: true` on the hook spawn path. Any hook command that launches a Windows console-subsystem binary (like `uv.exe`) allocates a visible `conhost.exe`. Bare `python` runs inside the existing bash process so no new console is allocated.

**Files:** `claude/settings.json`, `claude/tracking/windows-console-flashing.md`, `install`, `install.ps1`

---

### 2026-02-26: /review-plan file persistence -- findings survive context compaction

**Changed:**
- All reviewer agents now write findings to files at `.specs/{plan-name}/review-{N}/{reviewer-slug}.md`
- Rebuttal agents read peer findings from files and write rebuttals to `rebuttal-{slug}.md`
- Synthesis step reads from files (canonical source) rather than conversation context
- Final synthesis written to `review-{N}/synthesis.md` for permanent record
- New "Review Output Directory" section documents the file structure, naming conventions, and derivation rules
- Step 1 now includes creating the output directory (`mkdir -p`)
- Step 3 explicitly instructs main agent to re-read findings from files before rebuttal round
- Step 4 explicitly instructs main agent to re-read from files before synthesis
- Rebuttal prompt templates updated to use Read tool for file-based input

**Why:** During a real review, context compaction between Step 2 (5 reviewer agents) and Step 3 (rebuttal round) caused all verbatim reviewer findings to be lost. The synthesis had to reconstruct from a compaction summary, skipping the formal rebuttal round entirely. File persistence eliminates this failure mode.

**Files:** `~/.dotfiles/claude/shared/review-plan-instructions.md`

---

### 2026-02-25: Major /review-plan redesign -- dynamic panels, outside-the-box expert, rebuttal round

**Changed:**
- Dynamic expert panel -- main agent analyzes plan content and composes the reviewer panel (4-8 experts) instead of hardcoded 4
- 3 mandatory reviewers (Completeness, Adversarial, Outside-the-Box) + dynamic selection from suggested pool
- New "Outside-the-Box / Simplicity" mandatory reviewer -- questions the approach itself, checks industry best practices via web search, evaluates proportionality of complexity to goal (`max_turns: 8`)
- Suggested expert pool with 6 archetypes (Ops/SRE, Security, Database, Networking, Cost, Compliance) as starting points; pool is a reference, not a constraint -- custom reviewers encouraged
- Rebuttal round (Step 3) -- after all reviewers complete, domain experts respond to OtB findings with AGREE/PARTIAL/DISAGREE. Uses haiku, `max_turns: 1` for speed. Consensus determines whether complexity is justified or the plan should simplify.
- Enforce parallel launch -- all Task calls must be in a single message (mandatory)
- `max_turns: 5` for standard reviewers, `max_turns: 8` for Outside-the-Box
- Cap findings at 8 per reviewer
- Outside-the-Box assessment + rebuttal summary gets its own prominent section in output
- Remove redundant "Suggested Plan Edits" section -- findings already contain suggestions
- Panel is presented to user before launch (but launched immediately, no approval wait)

**Files:** `~/.dotfiles/claude/shared/review-plan-instructions.md`

---

### 2026-02-25: Create /review-plan command

**Added:**
- `/review-plan` command -- launches 4 parallel expert reviewers (Ops/SRE, Security, Completeness, Adversarial/Red Team) against a plan file
- Thin command file at `~/.dotfiles/claude/commands/review-plan.md`
- Full instructions at `~/.dotfiles/claude/shared/review-plan-instructions.md`

**Files:** `~/.dotfiles/claude/commands/review-plan.md`, `~/.dotfiles/claude/shared/review-plan-instructions.md`

---

### 2026-02-21: Add workflow orchestration rules

**Added:**
- "Plan mode default" critical rule -- enter plan mode for non-trivial tasks, re-plan on failure
- "Workflow Orchestration" section with task tracking (`tasks/todo.md`, `tasks/lessons.md`), demand elegance, autonomous bug fixing, and verification-before-done
- Self-improvement loop: update `tasks/lessons.md` after any user correction

**Changed:**
- KISS principle -- added "every change should touch minimal code"
- Subagent guidance -- expanded to "use liberally, one focused task per subagent, throw more compute at complex problems"

**Files:** `claude/CLAUDE.md`

---

### 2026-02-17: Eliminate provenance-based work avoidance

**Added:**
- New critical rule: "Never use provenance to avoid requested work" -- blocks using "pre-existing", "not my changes", etc. as reasons to skip user-requested work

**Changed:**
- "Fix ALL errors and warnings" -- removed escape hatch language ("prove it's pre-existing"), replaced with "fix them all regardless of who introduced them"
- "Never revert user changes" -> renamed to "No unsolicited destructive git actions" -- narrowed scope to destructive actions only, no longer implies skipping requested work on files you didn't author
- `/commit` instructions now explicitly state to commit ALL uncommitted files matching auto-stage rules, regardless of who made the changes

**Files:** `claude/CLAUDE.md`, `claude/shared/commit-instructions.md`

---

### 2026-02-16: Add root cause analysis rules and common pitfalls

**Added:**
- Technology capabilities verification rule (search docs before claiming limitations)
- Root Cause Analysis section (investigate before fixing, never mask symptoms)
- Common pitfalls: removing functionality as fix, multiple deploy cycles, silent query failures

**Files:** ~/.claude/CLAUDE.md

---

### 2026-02-15: CLAUDE.md Cleanup & Skill Trigger Expansion

**Removed:**
- Session History Capture section (never produced meaningful entries, only "session_end" stubs)
- Auto-Activating Skills cheat sheet (redundant with skill frontmatter descriptions)
- Research archive reference line (already covered in research-archive skill)

**Changed:**
- Broadened activation triggers in 11 SKILL.md files: docs, llmstxt, code-review, docker, database, csharp, terraform, ansible, go, ruby, rust
- Added missing file patterns, CLI commands, and language concepts to each skill's description
- Added changelog maintenance instruction to CLAUDE.md (replacing passive reference)

**Impact:**
- ~42 lines of redundant instructions removed from CLAUDE.md
- Skills now auto-activate on broader set of relevant keywords and file patterns

**Files:**
- `~/.claude/CLAUDE.md`
- `~/.claude/skills/{docs,llmstxt,code-review,docker,database,csharp,terraform,ansible,go,ruby,rust}/SKILL.md`

---

### 2025-11-10: Ruleset Optimization (History Analysis)

**First `/optimize-ruleset personal` run:**
- Analyzed all 242 history entries (Nov 7-10, 2025)
- Created CHECKPOINT file for incremental future runs
- Identified 7 patterns from actual usage

**HIGH priority additions** (based on 3+ occurrences):
- **KISS principle** added to Critical Rules: "Default to SIMPLEST solution. No features 'just in case'. MVP first."
- **Absolute paths** added to Communication: "Always provide absolute paths in responses (not relative)"
- **Real-time checklist tracking** enhanced in TodoWrite: "mark [x] IMMEDIATELY after each completion"
- **Idempotent scripts** added to Common Pitfalls: "ALL setup/install scripts MUST be safely re-runnable"

**MEDIUM priority additions** (2 occurrences):
- **Complete tasks** added to Tool Preferences: "Complete ALL steps of clear-scope tasks without asking between steps"
- **Detect state directly** added to Common Pitfalls: "Detect state from system directly" (avoid tracking files)
- **Fail-fast** already covered in development-philosophy skill (no change needed)

**Results:**
- Before: 82 lines, 410 words (~533 tokens)
- After: 87 lines, 468 words (~608 tokens)
- Added: +75 tokens (14% increase)
- Addresses: 9 checklist reminders, 3 KISS violations, 3 idempotency issues, 32 path clarifications per session

**Token efficiency maintained:**
- Personal ruleset stays minimal (87 lines, under 100-line target)
- 10 skills (13,616 tokens) load only when relevant
- Progressive disclosure architecture preserved

---

### 2025-11-10: Skills Consolidation from GitHub Copilot Analysis

**Analyzed 7 GitHub Copilot projects** and consolidated best practices into Claude Code skills:
- agent-spike, mentat-cli, joyride-python, ContextMenuEditor, onboard, attempt-one, onramp
- 18 .specstory chat histories analyzed
- ~6,000 lines of Copilot instructions reviewed

**Created GitHub Copilot template repository:**
- Location: `/c/Projects/copilot-instructions-template/`
- 9 consolidated instruction files (python, dockerfile, devcontainer, testing, makefile, ignore-files, self-explanatory-code, copilot_customization, mcp_services)
- 4 prompt files (commit, check, test, lint)
- Ready for reuse across projects

**Enhanced python-workflow skill:**
- Merged patterns from copilot-python-workflow
- Added UV-exclusive commands table (OK: correct vs BAD: incorrect)
- Added CRITICAL section for zero warnings tolerance
- Added CQRS/IoC architecture patterns
- Enhanced testing workflow (targeted during dev, full before commit)
- Self-explanatory code philosophy
- Optimized for Haiku 4.5 (directive language, tables, examples preserved)

**Enhanced container-projects skill:**
- Merged patterns from copilot-container-workflow
- Added CRITICAL section for Docker Compose V2 (no `version:`, use `docker compose`)
- Added 12-factor app compliance table
- Added security-first practices (non-root users, Alpine images)
- Multi-stage build examples
- Health check patterns
- DevContainer configuration
- DNS configuration (.internal vs .local)
- Optimized for Haiku 4.5 (doubled practical examples, 3 tables for scanning)

**Created testing-workflow skill:**
- New standalone skill for testing patterns
- CRITICAL: Zero warnings tolerance with status table
- Targeted testing during development
- Full suite before commits
- >80% coverage on critical paths
- AAA pattern, fixtures, mocking, parametrization
- Pre-commit requirements checklist
- Optimized for Haiku 4.5

**Enhanced development-philosophy skill:**
- Merged copilot-communication-style and copilot-autonomous-execution patterns
- Added BE BRIEF communication (action over commentary, one sentence max)
- Added autonomous execution workflow (7 steps)
- Self-recovery from errors
- Complete tasks fully before returning
- Execute immediately, don't ask permission
- Optimized for Haiku 4.5

**Updated CLAUDE.md:**
- Updated skill descriptions to reflect enhanced capabilities
- Added testing-workflow to core workflows
- Consolidated "Copilot-Derived Patterns" into core workflows
- Updated Python skill: uv-exclusive, zero warnings, CQRS
- Updated Containers skill: Compose V2, 12-factor, multi-stage
- Updated Development Philosophy: BE BRIEF, autonomous execution
- Maintained under 100 lines (85 lines)

**All Copilot references removed:**
- Skills rewritten as native Claude Code guidance
- Adapted applyTo frontmatter -> activation triggers
- Adapted .github/ directory -> .claude/ directory
- Adapted copilot-instructions.md -> CLAUDE.md references
- No "Copilot" branding in any skill

**Token efficiency:**
- Skills auto-activate based on project signals
- Examples preserved for pattern recognition
- Directive language for Haiku 4.5
- Tables and lists for scanability

---

### 2025-11-08: Git Workflow & Commit Command Optimization

**Optimized commit.md for Haiku 4.5:** (38% reduction)
- Before: 114 lines, 478 words, ~621 tokens
- After: 87 lines, 297 words, ~386 tokens
- Removed philosophical framing and skill references
- Inlined critical security patterns and commit types
- Pure procedural checklist format
- HEREDOC template provided inline

**Optimized git-workflow/SKILL.md:** (36% reduction)
- Before: 139 lines, 761 words, ~989 tokens
- After: 97 lines, 485 words, ~631 tokens
- Removed duplicate push behavior section
- Reduced examples from 6 to 2
- Converted commit types to table format
- Consolidated security warnings
- Removed meta-commentary

**Architecture Benefits:**
- Total system: 1,610 -> 1,017 tokens (37% reduction)
- Command is purely procedural with inline data
- Skill contains philosophy and rationale
- No help separation needed (simpler workflow than prompt engineering)
- Follows "Commands execute, skills educate" principle

**Haiku 4.5 Improvements:**
- Direct checklist format in command
- No "consult skill" indirection
- Critical data (patterns, types) inline for execution
- Removed verbose headers and examples

---

### 2025-11-08: Prompt Engineering Optimization & Help Separation

**Created `/prompt-help` command for documentation:**
- New dedicated help command (106 lines, ~260 tokens)
- Routes help requests to skill for documentation
- Handles "all techniques" or specific technique queries
- Clean separation: execution vs documentation

**Optimized prompt-engineering skill:** (56% reduction)
- Before: 499 lines, ~4,209 tokens
- After: 328 lines, ~1,872 tokens
- Consolidated 3 quick references into 1 decision tree
- Converted selection guide to compact decision tree format
- Compressed anti-patterns to table format
- Streamlined effectiveness indicators
- Kept all 7 technique templates intact (essential functionality)

**Updated optimize-prompt.md:**
- Now 106 lines, ~411 tokens (previously had help content removed)
- Help mode redirects to `/prompt-help` command
- Pure execution logic, no documentation overhead

**Architecture Benefits:**
- Normal optimization: Loads 2,283 tokens (optimize + skill)
- Help request: Loads 2,132 tokens (prompt-help + skill)
- ~40% token savings vs combined approach
- Clean command separation: optimize, help, skill

---

### 2025-11-08: Major Command & Skill Optimization for Haiku 4.5

**Optimized for Haiku 4.5 Compatibility:**

**Changed:**
- **ruleset-optimization skill**: Removed procedural overlap, kept philosophy only (36% reduction)
  - Before: 262 lines, ~1,414 tokens
  - After: 161 lines, ~900 tokens
  - Removed numbered workflow steps, kept principles and guidelines

- **optimize-ruleset.md command**: Massive streamlining (81% reduction!)
  - Before: 1,792 lines, ~9,673 tokens
  - After: 356 lines, ~1,821 tokens
  - Removed philosophical explanations (now references skill)
  - Simplified to direct procedural steps
  - Kept all critical bash commands and logic

- **analyze-permissions.md command**: Enhanced with clear phases (+124% for clarity)
  - Before: 91 lines, ~580 tokens
  - After: 299 lines, ~1,300 tokens
  - Added 6-phase structure for better Haiku execution
  - Added explicit error handling and edge cases

- **optimize-prompt.md command**: Integrated help functionality
  - Added frontmatter with argument-hints for all 7 techniques + help
  - Merged prompt-help.md content into main command
  - Deleted redundant prompt-help.md file

**Key Principle Applied:**
- **"Commands execute, skills educate"** - Clear separation of concerns
- Commands: Direct procedural steps (WHAT and HOW)
- Skills: Philosophy and principles (WHY and WHEN)

**Total Impact:**
- System-wide token reduction: **66%** (11,667 -> 4,021 tokens)
- optimize-ruleset alone: **7,852 tokens saved per invocation**
- Better Haiku 4.5 compatibility through:
  - Direct imperatives ("Run X" not "Consider running X")
  - Numbered lists instead of nested explanations
  - No meta-commentary or educational asides
  - Clear phase structure throughout

**Files Modified:**
- `~/.claude/skills/ruleset-optimization/SKILL.md`
- `~/.claude/commands/optimize-ruleset.md`
- `~/.claude/commands/analyze-permissions.md`
- `~/.claude/commands/optimize-prompt.md` (enhanced)
- `~/.claude/commands/prompt-help.md` (deleted - merged into optimize-prompt)

**Backups Created:**
- `.backup` files preserved for all modified files

---

### 2025-11-05: Prompt Engineering Skill and Commands

**Added:**
- Created `prompt-engineering` skill with 7 advanced techniques
- Created `/optimize-prompt` command for transforming prompts
- Created `/prompt-help` command for documentation

**Details:**
- Based on "The Mental Models of Master Prompters" YouTube video
- Techniques include: meta-prompting, recursive-review, deep-analyze, multi-perspective, deliberate-detail, reasoning-scaffold, temperature-simulation
- Manual invoke only (not auto-activate) to control token usage
- Intelligent technique selection when user doesn't specify techniques
- Composable: Can combine multiple techniques (e.g., `deep-analyze,multi-perspective`)

**Files:**
- `~/.claude/skills/prompt-engineering/SKILL.md`
- `~/.claude/commands/optimize-prompt.md`
- `~/.claude/commands/prompt-help.md`

**Impact:**
- Enables transformation of basic prompts into high-quality structured prompts
- Provides systematic approaches for verification, multi-perspective analysis, and detailed reasoning
- Token-aware (1.5-4x cost depending on techniques used)

---

### 2025-11-04: Ruleset Optimization via /optimize-ruleset

**Changed:**
- Added Context Efficiency Philosophy as PRIMARY principle
- Enhanced terminology section with explicit "local vs project" distinction
- Updated skill references with CRITICAL rules (uv run, never push, STATUS.md first)
- Emphasized security-first git workflow

**Impact:**
- Total optimization: ~28% context reduction achieved in agent-spike project
- Skills now include history-learned rules to prevent future errors
- Clearer distinction between personal and project rulesets

---

### 2025-11-04: Moved Context-Specific Sections to Skills

**Created Skills:**
- `python-workflow` skill (~18 lines saved in non-Python projects)
- `multi-agent-ai-projects` skill (~7 lines saved)
- `web-projects` skill (~6 lines saved)
- `container-projects` skill (~6 lines saved)

**Impact:**
- Total potential savings: ~37 lines when working in non-matching projects
- Skills auto-activate based on project context (files, configs, patterns)
- Improved token efficiency through progressive disclosure

**Files:**
- `~/.claude/skills/python-workflow/SKILL.md`
- `~/.claude/skills/multi-agent-ai-projects/SKILL.md`
- `~/.claude/skills/web-projects/SKILL.md`
- `~/.claude/skills/container-projects/SKILL.md`

---

### 2025-11-04: Git Workflow Moved to Skill

**Created:**
- `git-workflow` skill in `~/.claude/skills/git-workflow/`

**Changes:**
- Moved all git workflow guidelines from CLAUDE.md to skill
- Skill auto-activates when git operations detected
- Saves ~70 lines of context in non-git sessions

**Impact:**
- Progressive disclosure improves token efficiency
- Git guidelines available when needed, not baseline overhead

**File:**
- `~/.claude/skills/git-workflow/SKILL.md`

---

### 2025-11-04: Enhanced Git Workflow Section

**Added:**
- Extracted core principles from `/commit` command
- Security-first approach (scan before committing)
- Documented logical commit grouping (docs, test, feat, fix, etc.)
- Specified commit message format with HEREDOC
- Added verification and push behavior rules

**Impact:**
- Ensures consistent git workflow regardless of how commits are requested
- Security scanning always runs first
- Standardized commit message format across all commits

---

### 2025-11-04: Initial Personal Ruleset Creation

**Created:**
- `~/.claude/CLAUDE.md` (personal ruleset applying to all projects)

**Included:**
- Terminology clarification (local vs personal ruleset)
- Documented uv best practices for Python projects
- Added todo list management guidelines
- Included multi-agent project patterns
- Context efficiency philosophy
- Security & privacy guidelines
- Session management patterns

**Context:**
- Created during multi-agent learning project
- Established foundation for skills-based architecture
- Emphasized progressive disclosure and token efficiency

**Impact:**
- Centralized personal preferences across all projects
- Foundation for context-efficient ruleset architecture
- Clear separation between personal and project-specific rules

---

### Changelog Conventions

**Entry Format:**
```markdown
### YYYY-MM-DD: Brief Description

**Added/Changed/Removed/Fixed:**
- Bullet points describing changes

**Details:**
- Additional context if needed

**Files:**
- List of files created/modified

**Impact:**
- What changed for the user
- Performance/efficiency gains
- Behavioral changes
```

**Categories:**
- **Added**: New features, skills, commands
- **Changed**: Modifications to existing functionality
- **Removed**: Deprecated or deleted features
- **Fixed**: Bug fixes or corrections

## Pi runtime history


### 2026-07-15: Ground typed workflows in end-to-end design

**Why:** The typed-agent skill described stage boundaries but did not explicitly
require walking an unfamiliar workflow end to end before automation or keeping
validator execution and pass/fail routing outside semantic stages.

**Changed:**
- Added a pre-automation walkthrough that identifies deterministic inputs,
  semantic judgments, validation signals, and operator approval boundaries.
- Kept linters, tests, pass/fail decisions, and retry limits in deterministic
  code while allowing bounded diagnostics to return to a remediation stage.
- Linked the source video and relevant timestamps.

**Files:** `pi/skills/typed-agent-workflows/SKILL.md`, `pi/CHANGELOG.md`

---

### 2026-07-15: Surface commit planner fallback reasons

**Why:** `/commit` discarded commit-planner exceptions and reported every
failure as planner unavailability, preventing diagnosis after fallback.

**Changed:**
- Logged a bounded, single-line, credential-redacted planner failure reason
  before deterministic ownership fallback.
- Kept the fallback warning separate from the underlying cause.
- Added helper and registered-command regressions.

**Files:** `pi/extensions/workflow-commands.ts`,
`pi/tests/workflow-commands-pure.test.ts`,
`pi/tests/workflow-commands.test.ts`, `pi/CHANGELOG.md`

---

### 2026-07-14: Rank improvements by verified usage impact

**Why:** `/improve` selected the oldest pending candidate even when another
supported issue affected a much more frequently used surface. Several stats
commands also had attribution, scope, and window defects that made their counts
unsafe for prioritization.

**Changed:**
- Ranked safety and correctness candidates first, then normal candidates by
  verified 30-day usage, confidence, age, and interaction ID.
- Added structured skill, command, extension, and tool targets to review
  records while preserving legacy `targetSkill` records.
- Distinguished observed, verified-zero, and unknown usage in improvement
  discussions.
- Corrected repeated router hash attribution, trace/session double counting,
  current `/usage` ownership, orchestration review windows, skill roots and
  unused windows, and configured usage-session roots.
- Made `/usage-stats` render deterministically without starting a provider
  turn and removed unused extension-stats TUI code.

**Files:** `pi/extensions/extension-stats.ts`,
`pi/extensions/orchestration-stats.ts`, `pi/extensions/router-stats.ts`,
`pi/extensions/skill-stats.ts`, `pi/extensions/usage.ts`,
`pi/extensions/workflow-friction-review.ts`, `pi/lib/workflow-friction.ts`,
`pi/tests/orchestration-stats.test.ts`, `pi/tests/session-jsonl-stats.test.ts`,
`pi/tests/skill-stats.test.ts`, `pi/tests/usage.test.ts`,
`pi/tests/workflow-friction.test.ts`, `pi/README.md`, `pi/CHANGELOG.md`

---

### 2026-07-14: Stabilize secret-review coverage

**Why:** `/commit` required the secret reviewer to reproduce path, label, line,
and match text verbatim. Harmless output normalization could therefore fail
exact candidate coverage before commit planning.

**Changed:**
- Assigned stable numeric IDs to deterministic scanner candidates.
- Reduced reviewer output to each candidate ID, classification, and reason.
- Retried one incomplete response with an explicit exact-coverage correction.
- Validated exact ID coverage and joined decisions back to original candidate
  metadata in deterministic code.
- Added focused prompt, coverage, and retry regressions.

**Files:** `pi/extensions/workflow-commands.ts`,
`pi/lib/workflow-commands/prompts.ts`,
`pi/tests/workflow-commands-pure.test.ts`,
`pi/tests/workflow-prompts.test.ts`, `pi/CHANGELOG.md`

---

### 2026-07-14: Surface commit planner warnings

**Why:** `/commit` accepted validated planner warnings but discarded them before
creating commits, leaving useful uncertainty invisible to the operator.

**Changed:**
- Normalized non-empty planner warnings.
- Emitted warnings through the existing commit activity stream before staging
  planned commit groups.
- Added focused coverage for trimming, empty warnings, and display formatting.

**Files:** `pi/extensions/workflow-commands.ts`,
`pi/tests/workflow-commands-pure.test.ts`, `pi/CHANGELOG.md`

---

### 2026-07-14: Consolidate self-improvement into /improve

**Why:** Interaction capture, trend review, candidate approval, and skill review
were exposed as overlapping workflows with inconsistent evidence and outcomes.

**Changed:**
- Added `/improve` as the only public self-improvement command.
- Combined one supported candidate with recent interaction metadata, prior
  experiments, and target-skill usage before the Apply/Edit/Skip decision.
- Retired `/capture`, `/learning-review`, `/workflow-review`, and
  `/skill-review` while preserving automatic background review and existing
  decision records.
- Kept `/review-it` for plan and PRD review and stats commands as read-only
  diagnostics.

**Files:** `pi/extensions/workflow-friction-review.ts`,
`pi/extensions/skill-review-command.ts`, `pi/lib/workflow-friction.ts`,
`pi/tests/workflow-friction.test.ts`, `pi/tests/skill-review.test.ts`,
`pi/README.md`, `pi/CHANGELOG.md`

---

### 2026-07-14: Prevent incremental standalone-review blockers

**Why:** A material auto-applied plan rewrite bypassed renewed panel coverage, and
standalone blockers were discovered one repair pass at a time until the fixed
repair budget was exhausted.

**Changed:**
- Added a mandatory post-change adversarial panel when review fixes materially
  change a plan's objective, architecture, runtime boundary, task structure, or
  archive mechanism.
- Added a pre-readiness contract audit for repository prerequisites, command
  truth tables, exact workflow boundaries, mutations, rollback, archive
  postconditions, and checklist integrity.
- Moved standalone readiness to a large reviewer that must inspect every audit
  domain and consolidate all blockers before repair passes begin.

**Files:** `pi/skills/workflow/review-it.md`,
`pi/tests/workflow-prompts.test.ts`, `pi/CHANGELOG.md`

---

### 2026-07-14: Add typed-agent workflows

**Why:** Pi commands needed a reusable boundary between deterministic workflow
code and focused semantic decisions without a second language or general
workflow framework.

**Changed:**
- Added a Pi SDK-backed `defineAgent` API with typed input/output contracts,
  isolated sessions, one correction retry, cancellation, and disposal.
- Migrated `/commit` untracked classification, secret review, and commit planning
  while keeping Git and policy mutations deterministic.
- Added a focused skill and evidence-triggered specifications for deferred
  capabilities.

**Files:** `pi/lib/typed-agent.ts`, `pi/extensions/workflow-commands.ts`,
`pi/tests/typed-agent.test.ts`, `pi/tests/workflow-commands.test.ts`,
`pi/tests/workflow-commands-pure.test.ts`,
`pi/skills/typed-agent-workflows/SKILL.md`,
`pi/skills/typed-agent-workflows/roadmap.md`, `pi/CHANGELOG.md`

---

### 2026-07-14: Add reviewed cross-session learning

**Why:** Durable corrections should carry across sessions without allowing a
background review to rewrite instructions automatically.

**Changed:**
- Detect explicit remember requests and corrections after an existing turn and
  queue them for the bounded workflow review.
- Added `/learning-review` to discuss one supported lesson at a time using the
  full 1-3-1 format.
- Added append-only Apply/Edit/Skip decisions. Applied lessons require target
  paths, validation evidence, and rollback instructions and create an experiment
  marker for later comparison.

**Files:** `pi/extensions/workflow-friction-review.ts`,
`pi/lib/workflow-friction.ts`, `pi/tests/workflow-friction.test.ts`,
`pi/README.md`, `pi/CHANGELOG.md`

---

### 2026-07-14: Tighten workflow boundaries and record session closure

**Why:** Recent session review found scope expansion, informational requests
causing mutation, supported entrypoints being bypassed, and active sessions
being mistaken for completed work.

**Changed:**
- Narrowed global workflow guidance to in-scope failures, read-only
  informational requests, bounded execution, and conditional delegation.
- Added durable `workflow.sessionClose` evidence for logical shutdowns while
  keeping close state distinct from work completion.
- Documented the lifecycle marker and its provisional-state semantics.

**Files:** `pi/AGENTS.md`, `AGENTS.md`, `pi/extensions/session-hooks.ts`,
`pi/tests/session-hooks.test.ts`, `pi/docs/workflow-eval-telemetry.md`,
`pi/CHANGELOG.md`

---

### 2026-05-26: Document workflow eval telemetry operations

**Why:** Pi workflow telemetry now records dispatch events and defines lifecycle
data for future adaptive review sizing. Pi workflow maintainers need clear
rules for what runtime telemetry not to commit and which docs/tests to update
when the contract changes.

**Added:**
- Workflow eval telemetry guidance: runtime JSONL stays local by default,
  DuckDB files are rebuildable caches, and workflow telemetry contract changes
  must update the Pi telemetry docs and prompt-contract tests.
- Operations documentation and a local telemetry query helper.

**Files:** `pi/docs/workflow-eval-telemetry.md`,
`pi/docs/workflow-eval-operations.md`, `pi/scripts/workflow-eval-query.py`,
`pi/CHANGELOG.md`

---

### 2026-07-15: Preserve service-managed storage ownership during apply

**Why:** Storage preparation reset an existing Forgejo dataset to the initial
mapped-root owner before service orchestration, leaving the database unavailable
when a later play failed before Forgejo configuration ran.

**Changed:**
- Limited initial ZFS dataset ownership assignment to newly created datasets.
- Added regression coverage and documented ownership handoff to the service role.

**Files:** `infra/ansible/tasks/zfs-dataset.yml`,
`tests/test_ansible_safety.py`, `docs/forgejo-bind-mount.md`

---

### 2026-07-15: Finish agent-chain retirement and isolate YouTube environments

**Why:** Generated Pi projects still loaded the deleted agent-chain extension,
multi-team guidance required a conversation log with no writer, and `/yt`
commands selected ignored virtual environments tied to a removed Python install.

**Changed:**
- Removed retired agent-chain recipes from `pi-new` and added a generated-project
  regression.
- Retired the active-listener skill and its unsupported conversation-file
  contract while preserving native Pi session and subagent context.
- Made menos `/yt` commands use the locked project in an isolated uv environment
  and local fallback scripts use their PEP 723 metadata.
- Verified the prompt migration repeatedly in parallel and serial test modes; no
  persistent ordering defect was reproduced.

**Files:** `pi/scripts/pi-new`, `test/test_pi_new.py`,
`pi/multi-team/agents/`, `pi/multi-team/skills/`, `pi/prompts/yt.md`,
`pi/tests/workflow-prompts.test.ts`, `.specs/pi-extension-refactors/backlog.md`

---

## 2026-07-15: Document and verify mixed task DAG execution

**Why:** A mixed graph needs one public workflow that keeps manual work
main-thread-owned while concurrently executing and joining ready subagent work.

**Changed:**
- Added end-to-end coverage for graph batch aliases, manual transitions,
  concurrent `execute_many`, one-shot `await`, artifacts, and downstream
  readiness without public-action polling.
- Documented optional durable main-thread lists, mixed graphs, bounded fan-out,
  one-shot waits, and explicit `write_failed` recovery.

**Files:** `pi/tests/task-tools.test.ts`, `pi/README.md`, `CHANGELOG.md`

---
