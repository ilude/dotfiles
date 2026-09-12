# Herdr in the default profile

The default profile owns two deferred tools, `herdr_layout` and `herdr_pane`, backed by the installed Herdr CLI. No third-party Pi extension is installed. The `herdr` skill dynamically reads `herdr --skill` and adds local workflow conventions rather than copying its manual.

When Pi is inside Herdr, use it automatically for requested long-running development servers and visible logs. New process panes preserve focus. `tool_search` discovers and activates the tools; session replacement hides them again. Descriptions remain short and results are bounded. These process tools provide no background supervisor, service registry, asynchronous watch daemon, or agent delegation. Defined agent work uses the separate [subagent runtime](subagents.md).

## Setup

Install the default profile dependencies and links as described in `pi/README.md`. From the checkout you intend to keep using:

```sh
node scripts/pi-herdr-setup.mjs
```

Setup generates the gitignored default `.herdr-plugin/herdr-plugin.toml` and links `local.pi`. It resolves the actual Node executable and installed Pi `bin.pi`, so rerun setup after moving the checkout or updating Node/Pi. The manifest contains local executable paths, not credentials. Linking registers an executable plugin for the current Herdr user; do not link a disposable worktree into your production session.

Herdr's generated `extensions/herdr-agent-state.ts` is checked in unmodified. To refresh it with an installed Herdr update, run `herdr integration install pi` with `PI_CODING_AGENT_DIR` explicitly pointing to default, inspect its diff, and avoid overwriting concurrent changes. The repository prompt bridge is separate and must not be copied into generated code. Windows installation now ensures the official stable Herdr 0.9.0 or newer. The layout remains compatible with 0.8.x APIs; upgrading a client does not update an already-running server until that session is restarted.

Reload Pi after source changes. An already-running Pi does not acquire the launcher's process-exit hook until started through the plugin.

## Tools and process ownership

- `herdr_layout`: list a bounded workspace pane overview, split beside the calling pane, create a shell tab, or resume a Pi session. Split/tab use project cwd and no-focus. `{"action":"resume","session":"<UUID>"}` resolves the active profile's saved session, opens it in a new focused Pi plugin tab using its saved cwd, and checks the exact resumed session identity. No shell submission or extra focus argument is needed.
- `herdr_pane`: read, submit a command, wait for output, rename, interrupt, or explicitly close a pane. Reads default to 80 lines; waits default to 30 seconds and cap at 120 seconds.
- `run` verifies an idle Bash or PowerShell process and its cwd, submits the actual command to existing Damage Control, then rechecks shell identity before sending it once. Unknown shells, missing cwd, unavailable safety gate, denials, or changed targets fail closed. This is not a claim that terminal state cannot race after the final check.
- Raw arbitrary keys/text and agent operations are intentionally absent. Do not bypass the tool's safety boundary with `bash("herdr pane run ...")`.
- Interrupt/close is limited to panes created by this Pi session; closing additionally requires `confirm: true`. Pi's own pane is protected. Session replacement or reload forgets ownership without closing services. Older panes can still be read; their cleanup requires explicit operator action rather than invented ownership.
- A successful mutation may have empty stdout. It means submission, not readiness or success of the submitted command. On timeout/transport ambiguity, inspect before retrying.
- Waits can match existing scrollback. Use fresh readiness markers or a health endpoint. Output is bounded; CLI output beyond the transport cap fails rather than being silently treated as complete.
- Foreground Compose, detached containers, and log viewers have different lifetimes. Interrupting or closing `logs -f` does not stop detached containers. Cleanup must target the intended Compose project, never a general prune.

## Direct Pi tabs

Inside Herdr, `/new-instance [title]` and `/branch [title]` open a focused plugin tab with the same profile/cwd. The `herdr_layout` resume action reuses this launcher. UUID lookup examines filenames and the selected native header, not every transcript. Its single tool result contains session, tab/pane IDs, cwd, focus and readiness. Startup checking waits up to 30 seconds for Herdr to report the exact Pi session in an idle, done, working or blocked state. A blocked state means Pi started but needs user input; no input is submitted automatically. Cancellation or unconfirmed startup returns the created tab's IDs and `ready:false`, not a second launch. This resumes an independent interactive session, not a delegated subagent. The plugin bootstrap makes a bounded, best-effort registration of the new pane with Herdr's agent list and waits for an acknowledged matching response before starting Pi. Registration failure does not prevent Pi startup. The generated lifecycle extension subsequently attaches Pi's session identity and live state. Branch launch passes the exact created session file. Launch failures retain that file and report a resume path; an ambiguous result never automatically submits another launch.

The default profile's `/plans` selector can launch the highlighted direct-child `.specs/<stub>/plan.md` through `/do-it` in a new focused Pi plugin tab. Pressing `d` shows Launching in the existing picker before starting process work. Herdr Pi-tab requests are asynchronous and bounded; the launcher explicitly focuses the exact returned tab instead of relying on creation defaults. Repeated input is ignored while the request is pending, and success dismisses the originating picker rather than reopening Details. Focus is not restored to the origin.

Safe prelaunch failures preserve the view and selection and allow retry. A timeout, uncertain response, or failure after tab creation warns that the launch may exist and is not retried automatically. Tab creation/focus alone is not a readiness acknowledgment from Pi or proof that the model has begun executing the plan.

New-tab execution is unavailable outside Herdr and has no terminal fallback. The plugin bootstrap accepts only the constrained repository-relative plan path, validates it under the launch cwd, and constructs the `/do-it` message itself. It does not accept arbitrary initial prompts or argv. `/plans` action requests and outcomes are appended as native custom session entries and rendered as compact transcript rows; they are excluded from model context. The launcher names a plan child with the selected stub; child startup renames only its pane and deliberately does not issue a second tab rename that could overwrite a manual rename. Run here renames only the inherited `HERDR_TAB_ID` and still submits execution if naming fails. Native Pi persistence applies: a fresh picker-only session may not reach disk before an assistant message, so analytics cannot recover an unsaved session.

The process chain is Herdr → Node running the repository bootstrap and Pi. No PowerShell/Bash/cmd wrapper is used. The bootstrap runs the existing default Damage Control syntax preflight; failure enters tools-disabled/extensions-disabled repair mode. Ordinary tabs accept only profile and optional session inputs, not arbitrary extension/tool flags or automatic recovery. Restricted subagents additionally supply a per-child authenticated endpoint; the bootstrap obtains the frozen assignment from its parent and constructs the restricted argv itself. A per-launch host owns the child process handle and terminal streams. A failed safety preflight rejects a restricted launch rather than entering an unrestricted or misleading repair conversation.

The installed preview can replace an exited focused terminal with a shell. The bootstrap explicitly retires its own `local.pi` pane at process exit to prevent this. It does not close other panes or stop services. `/new-terminal` still opens a shell, and non-Herdr Windows Terminal/Ghostty launch behavior is unchanged.

## Defined subagents

`subagent` uses native TUI children by default inside Herdr, with an explicit headless override. It verifies the configured `local.pi` bootstrap belongs to the active profile's repository and owns only returned pane IDs. Children occupy a row above the orchestrator, which remains at the bottom with approximately two-thirds of the height. Four children fit per tab, with child five starting an owned overflow tab. Herdr 0.9.0 only exposes downward plugin splits, so the first child is swapped above the caller. The swap temporarily focuses the caller; the adapter restores the previously viewed pane through the public exact-pane focus API unless it observes a subsequent user focus change. This is best-effort restoration, not atomic non-focusing placement. Later splits and overflow tabs use `--no-focus`. Children have no general Herdr control tools. Ordinary parent chat changes preserve separate subagent ownership, but explicit `/reload` is supported only when no active or idle retained child remains and replaces the executable runtime owner. Ordinary process-tool ownership still expires as documented above.

Assignment results travel through authenticated local messages, not terminal scraping or Herdr status. Finished panes close immediately after result capture and process settlement, even if that removes zoom elsewhere. Direct user help suspends parent steering and requires explicit handback. Parent exit stops ordinary children but preserves directly helped visible children as parent-unavailable. See [authority, controls, and validation](subagents.md).

## Automatic session tab naming

The default-profile Herdr orchestrator may quietly name its tab from the current conversation. Naming is limited to the first delivered user prompt and later settled turns, with at most one attempt per 60 seconds measured from the previous attempt's start. A restored session (including a resumed child) gets one asynchronous attempt from its restored ordinary user/assistant text; it does not wait for another prompt and does not delay readiness. Requests are tool-free `openai-codex/gpt-5.6-luna` completions at low reasoning with provider retries disabled. Only bounded recent visible user text and ordinary assistant prose are supplied; thinking, tools/results, instructions, logs, summaries, and unrelated sessions are excluded.

Generated titles are normalized to lowercase and must be one to five plain words. An empty model response, or a valid response equal to the current title, is an intentional no-op. The model does not provide a deterministic fallback, placeholder, alternate model, or deferred retry. Explicit titles from `/plans`, `/branch [title]`, and `/new-instance [title]`, plus an observed manual Herdr rename, are preserved literally and suspend automatic naming until `/clear` or `/new`. The cwd basename is used as the initial/default title, and `/clear` and `/new` cancel stale work, restore that basename, clear manual protection, reset the cooldown and failure breaker, and start a fresh naming owner. `/reload` preserves ownership, cooldown, and breaker state.

Model, Herdr, validation, and timeout failures are counted silently. Three consecutive automatic-attempt failures open a breaker; there is no timed recovery or half-open probe. Lifecycle cancellation and ownership changes are not failures, while a title change detected before or after the model call pauses naming rather than overwriting it. Foreground chat, resume receipts, focus, and readiness do not wait for naming. Diagnostics are best-effort structured JSONL at `$PI_CODING_AGENT_DIR/runtime/herdr-tab-naming.jsonl` (the active profile's `getAgentDir()` runtime path), retained to at most 64 KiB and 128 complete lines. Response/error evidence is bounded and redacted; credentials, environment contents, raw tool history, and transcript entries are not logged. Routine successes and failures are silent; only an unexpected internal extension fault may produce one warning.

Live verification is non-blocking: focused tests use mocked model and Herdr boundaries and do not establish live Luna title quality, production renames, or attached-client rendering/notifications. A live operator check may be performed after loading the feature but is not required for completion.

## UI and attention

On initial interactive Pi startup inside Herdr, the default profile labels its inherited pane **Orchestrator** and its inherited tab with the working directory's basename, for example `.dotfiles`, without changing focus. Explicit plan children are identified by `PI_HERDR_TAB_LABEL`; startup keeps their pane label but skips the tab rename because the launcher already named the tab and a late rename could overwrite a manual rename. Restricted subagents keep their human assignment labels and do not rename tabs; RPC/print helpers do not rename either surface. New, resumed, forked, and reloaded chats within the same process do not reset user-renamed panes or tabs. Label failures are silent and do not block startup. These labels do not change agent identity.

Herdr owns sidebar symbols and colors. In Herdr 0.9, working is yellow, blocked is red, idle is green, and an unfocused completed idle transition may appear as client-relative teal done until that client views it. The default profile reports lifecycle state rather than trying to choose those visual states.

The existing footer, reload indicator, dialogs, and notices remain Pi-owned. Automatic naming adds no footer badge, transcript row, notification, bell, or model-context state. The generated Herdr integration publishes TUI working/settled state. The repository bridge maps native prompt start/end to operator-waiting state, including the current Damage Control custom dialog. Headless helper sessions do not claim the parent's pane.

There is no additional bell or desktop-notification layer and no sound/desktop settings change. In the isolated live test, an unfocused actual approval dialog reported `blocked`; denial cleared it to background `done`. Headless API evidence does not prove audible or desktop delivery. Those require an attached client and operator observation under the user's Herdr settings.

## Validation

From `pi/profiles/default/`:

```sh
pnpm test herdr-tools.test.ts herdr-resume.test.ts herdr-launch.test.ts session-launch.test.ts herdr-ui-prompt-state.test.ts tool-visibility.test.ts tool-search.test.ts
pnpm run typecheck
pnpm run check:runtime
```

Plan checks live in `plans.test.ts`, `session-launch.test.ts`, and `herdr-launch.test.ts`. Run `PI_PLANS_HERDR_LIVE=1 pnpm test plans-herdr-live.test.ts` from the default profile for a real launch in an isolated Herdr session. It verifies immediate feedback, one focused tab, original-picker dismissal, and exact `/do-it` delivery without executing a real plan. Attached-client rendering and real-provider behavior remain separate validation limits.

Live acceptance uses isolated named Herdr sessions, an isolated config/plugin registry, and uniquely named disposable Compose projects. Pin the test socket explicitly: merely overriding config paths while inheriting a production `HERDR_SOCKET_PATH` can route plugin operations to the wrong running server. Never stop a shared server. Tests distinguish CLI submission, actual readiness, and user-observed notifications.

Persisted plan history uses the existing `session_entries` view. Outcome counts:

```sql
WITH plan_events AS (
  SELECT json_extract_string(record, '$.data.action') AS plan_action,
         json_extract_string(record, '$.data.outcome') AS plan_outcome
  FROM session_entries
  WHERE entry_type = 'custom'
    AND json_extract_string(record, '$.customType') = 'plan-action-event'
    AND json_extract_string(record, '$.data.phase') = 'outcome'
)
SELECT plan_action, plan_outcome, count(*) AS records
FROM plan_events
GROUP BY plan_action, plan_outcome
ORDER BY plan_action, plan_outcome;
```

A chronological invocation trace is bounded to one session reference selected through `sessions` discovery:

```sql
SELECT _timestamp,
       json_extract_string(record, '$.data.invocationId') AS invocation_id,
       json_extract_string(record, '$.data.action') AS action_name,
       json_extract_string(record, '$.data.phase') AS phase,
       json_extract_string(record, '$.data.outcome') AS outcome_name,
       json_extract_string(record, '$.data.plan.stub') AS stub
FROM session_entries
WHERE entry_type = 'custom'
  AND json_extract_string(record, '$.customType') = 'plan-action-event'
ORDER BY _timestamp
LIMIT 200;
```

These queries cover persisted native entries only. A picker-only session that Pi never saved has no analytics record.
