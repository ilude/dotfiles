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

- `herdr_layout`: list a bounded workspace pane overview, split beside the calling pane, or create a tab. Creation uses project cwd and no-focus.
- `herdr_pane`: read, submit a command, wait for output, rename, interrupt, or explicitly close a pane. Reads default to 80 lines; waits default to 30 seconds and cap at 120 seconds.
- `run` verifies an idle Bash or PowerShell process and its cwd, submits the actual command to existing Damage Control, then rechecks shell identity before sending it once. Unknown shells, missing cwd, unavailable safety gate, denials, or changed targets fail closed. This is not a claim that terminal state cannot race after the final check.
- Raw arbitrary keys/text and agent operations are intentionally absent. Do not bypass the tool's safety boundary with `bash("herdr pane run ...")`.
- Interrupt/close is limited to panes created by this Pi session; closing additionally requires `confirm: true`. Pi's own pane is protected. Session replacement or reload forgets ownership without closing services. Older panes can still be read; their cleanup requires explicit operator action rather than invented ownership.
- A successful mutation may have empty stdout. It means submission, not readiness or success of the submitted command. On timeout/transport ambiguity, inspect before retrying.
- Waits can match existing scrollback. Use fresh readiness markers or a health endpoint. Output is bounded; CLI output beyond the transport cap fails rather than being silently treated as complete.
- Foreground Compose, detached containers, and log viewers have different lifetimes. Interrupting or closing `logs -f` does not stop detached containers. Cleanup must target the intended Compose project, never a general prune.

## Direct Pi tabs

Inside Herdr, `/new-instance [title]` and `/branch [title]` open a focused plugin tab with the same profile/cwd. Branch launch passes the exact created session file. Launch failures retain that file and report a resume path; an ambiguous result never automatically submits another launch.

The default profile's `/plans` selector can launch the highlighted direct-child `.specs/<stub>/plan.md` through `/do-it` in a new focused Pi plugin tab. Pressing `d` shows Launching in the existing picker before starting process work. Herdr Pi-tab requests are asynchronous and bounded; the launcher explicitly focuses the exact returned tab instead of relying on creation defaults. Repeated input is ignored while the request is pending, and success dismisses the originating picker rather than reopening Details. Focus is not restored to the origin.

Safe prelaunch failures preserve the view and selection and allow retry. A timeout, uncertain response, or failure after tab creation warns that the launch may exist and blocks further `d`/`r` execution of that plan within the current picker, including after copy/open actions. Inspect the reported tab before retrying through a fresh `/plans` invocation. Tab creation/focus is not a readiness acknowledgment from Pi or proof that the model has begun executing the plan.

New-tab execution is unavailable outside Herdr and has no terminal fallback. The plugin bootstrap accepts only the constrained repository-relative plan path, validates it under the launch cwd, and constructs the `/do-it` message itself. It does not accept arbitrary initial prompts or argv.

The process chain is Herdr → Node running the repository bootstrap and Pi. No PowerShell/Bash/cmd wrapper is used. The bootstrap runs the existing default Damage Control syntax preflight; failure enters tools-disabled/extensions-disabled repair mode. Ordinary tabs accept only profile and optional session inputs, not arbitrary extension/tool flags or automatic recovery. Restricted subagents additionally supply a per-child authenticated endpoint; the bootstrap obtains the frozen assignment from its parent and constructs the restricted argv itself. A per-launch host owns the child process handle and terminal streams. A failed safety preflight rejects a restricted launch rather than entering an unrestricted or misleading repair conversation.

The installed preview can replace an exited focused terminal with a shell. The bootstrap explicitly retires its own `local.pi` pane at process exit to prevent this. It does not close other panes or stop services. `/new-terminal` still opens a shell, and non-Herdr Windows Terminal/Ghostty launch behavior is unchanged.

## Defined subagents

`subagent` uses native TUI children by default inside Herdr, with an explicit headless override. It verifies the configured `local.pi` bootstrap belongs to the active profile's repository and owns only returned pane IDs. Children occupy a row above the orchestrator, which remains at the bottom with approximately two-thirds of the height. Four children fit per tab, with child five starting an owned overflow tab. Herdr 0.9.0 only exposes downward plugin splits, so the first child is swapped above the caller. The swap temporarily focuses the caller; the adapter restores the previously viewed pane through the public exact-pane focus API unless it observes a subsequent user focus change. This is best-effort restoration, not atomic non-focusing placement. Later splits and overflow tabs use `--no-focus`. Children have no general Herdr control tools. Ordinary parent chat changes preserve separate subagent ownership, but explicit `/reload` is supported only when no active or idle retained child remains and replaces the executable runtime owner. Ordinary process-tool ownership still expires as documented above.

Assignment results travel through authenticated local messages, not terminal scraping or Herdr status. Finished panes close immediately after result capture and process settlement, even if that removes zoom elsewhere. Direct user help suspends parent steering and requires explicit handback. Parent exit stops ordinary children but preserves directly helped visible children as parent-unavailable. See [authority, controls, and validation](subagents.md).

## UI and attention

On initial interactive Pi startup inside Herdr, the default profile labels its inherited pane **Orchestrator** and its inherited tab with the working directory's basename, for example `.dotfiles`, without changing focus. Restricted subagents keep their human assignment labels and do not rename tabs; RPC/print helpers do not rename either surface. New, resumed, forked, and reloaded chats within the same process do not reset user-renamed panes or tabs. Label failures produce a warning without blocking startup. These labels do not change agent identity.

The existing footer, reload indicator, dialogs, and notices remain Pi-owned. The generated Herdr integration publishes TUI working/settled state. The repository bridge maps native prompt start/end to operator-waiting state, including the current Damage Control custom dialog. Headless helper sessions do not claim the parent's pane.

There is no additional bell or desktop-notification layer and no sound/desktop settings change. In the isolated live test, an unfocused actual approval dialog reported `blocked`; denial cleared it to background `done`. Headless API evidence does not prove audible or desktop delivery. Those require an attached client and operator observation under the user's Herdr settings.

## Validation

From `pi/profiles/default/`:

```sh
pnpm test herdr-tools.test.ts herdr-launch.test.ts session-launch.test.ts herdr-ui-prompt-state.test.ts tool-visibility.test.ts tool-search.test.ts
pnpm run typecheck
pnpm run check:runtime
```

The plan launch interaction has focused checks in `plans.test.ts` and `session-launch.test.ts`. Run `PI_PLANS_HERDR_LIVE=1 pnpm test plans-herdr-live.test.ts` from the default profile for an isolated real-Herdr check of the complete `/plans` launch path: pending feedback, repeated-key suppression, one created tab, focused destination, original-picker dismissal, and bootstrap delivery of the exact `/do-it` command. Its child entrypoint is inert: it records argv without loading Pi, calling a model, or executing a plan. It verifies server-side focus, not attached-client rendering or model startup readiness.

Live acceptance uses isolated named Herdr sessions, an isolated config/plugin registry, and uniquely named disposable Compose projects. Pin the test socket explicitly: merely overriding config paths while inheriting a production `HERDR_SOCKET_PATH` can route plugin operations to the wrong running server. Never stop a shared server. Tests distinguish CLI submission, actual readiness, and user-observed notifications.
