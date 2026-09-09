# T1/T3 layout evidence

Date: 2026-09-08
Profile: `C:/Users/mglenn/.dotfiles/.worktrees/subagent-reload-and-live-ux/pi/profiles/default`
Fixture: `tests/subagent-ux-live.test.ts`, named Herdr sessions generated as `subagent-ux-${process.pid}-${Date.now()}` with scratch `APPDATA`, `LOCALAPPDATA`, and `HERDR_CONFIG_PATH`. After creating the caller and unrelated workspaces, the fixture sets `HERDR_ENV=1`, `HERDR_SOCKET_PATH=<named-session socket>`, and the caller's `HERDR_PANE_ID`, `HERDR_TAB_ID`, and `HERDR_WORKSPACE_ID` for all layout mutations. Its `pane current` observer explicitly removes the inherited pane/tab/workspace IDs, matching `herdr-background-focus.test.ts`, so focus is read from the focused server records. The fixture linked only its inert plugin and bundled launcher into the isolated session.

## Reload boundary

Installed Pi extension lifecycle documentation states that reload emits `session_shutdown`, reloads and rebinds extensions, then emits `session_start` with `reason: "reload"`. This task did not add a process-preserving reload mechanism. Per the parent clarification, reload is only exercised with no active or idle retained child process, so T1's lifecycle conclusion is that fresh extension evaluation is sufficient for this boundary; T2 owns any implementation of reload teardown behavior.

## Commands and cleanup

Scoped live command:

```text
cd pi/profiles/default && PI_SUBAGENT_UX_LIVE=1 pnpm test subagent-ux-live.test.ts -t 'production layout' --reporter verbose
```

The fixture used these exact Herdr operation forms through the production adapter:

```text
herdr --session <named> plugin pane open --plugin layout.inert --entrypoint pi --placement split --direction down --target-pane <caller> --cwd <scratch> --no-focus
herdr --session <named> pane swap --source-pane <created-pane> --target-pane <caller>
herdr --session <named> plugin pane open --plugin layout.inert --entrypoint pi --placement split --direction right --target-pane <owned-pane> --cwd <scratch> --no-focus
herdr --session <named> plugin pane open --plugin layout.inert --entrypoint pi --placement tab --workspace <workspace> --cwd <scratch> --no-focus
herdr --session <named> pane layout --pane <owned-pane>
herdr --session <named> plugin pane close <owned-pane>
herdr --session <named> tab close <owned-tab>
herdr --session <named> server stop
```

`--help` responses relevant to the blocker were:

```text
herdr plugin pane open: --placement overlay|split|tab|zoomed; --direction right|down; --focus|--no-focus
herdr pane swap: --direction left|right|up|down; --pane|--current|--source-pane; --target-pane
```

There is no `pane swap --no-focus`. A direct tested attempt to repair the second row was:

```text
herdr --session <named> pane move w1:p6 --tab w1:t1 --split down --target-pane w1:p5 --no-focus
```

The captured response began:

```json
{"id":"cli:pane:move","result":{"move_result":{"changed":false,"focused_pane_id":"w1:p2","previous_pane_id":"w1:p6","previous_tab_id":"w1:t1","previous_workspace_id":"w1","reason":"same_tab"}}}
```

Moving the pane to a temporary tab and back returned `changed: true`, but inserted it below only the selected leaf, not across the row. The fixture finally closed owned panes in reverse order, unlinked `layout.inert` and `local.pi`, stopped the named server, waited for its exit, and removed the scratch directory. No shared server, production plugin link, or operator pane was used.

## Focus results

The isolated direct probe started with `w2:p1` focused while the caller was `w1:p1`:

```text
before pane current: w2:p1
plugin pane open ... --no-focus: pane current remained w2:p1
pane swap --source-pane w1:p2 --target-pane w1:p1: pane current became w1:p2
plugin pane open ... --no-focus: pane current remained w1:p2
plugin pane close w1:p3: pane current remained w1:p2
```

The unit fixture models the same returned focus after swap and asserts that layout emits no `workspace focus`, `tab focus`, or `pane focus` restoration commands. In the live test, a simulated user switch to the unrelated workspace was injected after a later pane-open response and after a pane-close response while the production caller context remained set. Both switches remained on the unrelated pane through layout polish and settlement cleanup. The expected first caller-to-upper swap theft is diagnostic evidence only, not an acceptance result, and remains an upstream focus blocker.

## Returned rectangles

The passing isolated inert run printed these `pane layout` results. `w1:p1` is the unchanged caller. Width and height are terminal cells.

```json
{
  "1": [
    ["w1:p2", {"x":26,"y":1,"width":94,"height":13}],
    ["w1:p1", {"x":26,"y":14,"width":94,"height":26}]
  ],
  "3": [
    ["w1:p2", {"x":26,"y":1,"width":31,"height":13}],
    ["w1:p3", {"x":57,"y":1,"width":31,"height":13}],
    ["w1:p4", {"x":88,"y":1,"width":32,"height":13}],
    ["w1:p1", {"x":26,"y":14,"width":94,"height":26}]
  ],
  "4": [
    ["w1:p2", {"x":26,"y":1,"width":23,"height":13}],
    ["w1:p3", {"x":49,"y":1,"width":24,"height":13}],
    ["w1:p4", {"x":73,"y":1,"width":23,"height":13}],
    ["w1:p5", {"x":96,"y":1,"width":24,"height":13}],
    ["w1:p1", {"x":26,"y":14,"width":94,"height":26}]
  ],
  "5": [
    ["w1:p2", {"x":26,"y":1,"width":23,"height":2}],
    ["w1:p6", {"x":26,"y":3,"width":23,"height":2}],
    ["w1:p3", {"x":49,"y":1,"width":24,"height":4}],
    ["w1:p4", {"x":73,"y":1,"width":23,"height":4}],
    ["w1:p5", {"x":96,"y":1,"width":24,"height":4}],
    ["w1:p1", {"x":26,"y":5,"width":94,"height":35}]
  ],
  "8": [
    ["w1:p2", {"x":26,"y":1,"width":27,"height":2}],
    ["w1:p6", {"x":26,"y":3,"width":6,"height":2}],
    ["w1:p7", {"x":32,"y":3,"width":6,"height":2}],
    ["w1:p8", {"x":38,"y":3,"width":7,"height":2}],
    ["w1:p9", {"x":45,"y":3,"width":8,"height":2}],
    ["w1:p3", {"x":53,"y":1,"width":22,"height":4}],
    ["w1:p4", {"x":75,"y":1,"width":22,"height":4}],
    ["w1:p5", {"x":97,"y":1,"width":23,"height":4}],
    ["w1:p1", {"x":26,"y":5,"width":94,"height":35}]
  ]
}
```

At 1, 3, and 4, the test explicitly checks aligned row tops, equal columns within one cell, full caller-region width, and the caller's bottom position. At 5 and 8, the test explicitly labels and reproduces blocked geometry: the second row is physically nested below only the first column. Those 5/8 results are not an acceptance claim. This is not a logical-slot failure: Herdr's tree has no supported operation to split the existing full-width upper row, and `pane move` returns `changed=false` for an in-tab reparent. Creating the second row before the right splits leaves an extra visible pane for counts 1-4. Moving surviving children through a temporary tab would violate stable tab membership. This is the exact upstream geometry blocker; no Herdr product change was made.

Overflow topology passed in the same run: children 1-8 retained `tabIndex: 0`, children 9-16 used owned overflow tab index 1, and child 17 used owned overflow tab index 2. Exact pane, tab, workspace, caller, and unrelated-pane identities were retained. The isolated run passed and cleaned all owned resources.

## Final scoped check results

```text
cd pi/profiles/default && pnpm test subagent-layout.test.ts
# 1 file passed, 15 tests passed

cd pi/profiles/default && PI_SUBAGENT_UX_LIVE=1 pnpm test subagent-ux-live.test.ts -t 'production layout' --reporter verbose
# 1 test passed, 1 model-backed test skipped; named isolated fixture cleanup completed
```

`PI_SUBAGENT_UX_LIVE_REAL` was not set. No model-backed launch was run. The first-swap focus theft and the 5/8 geometry reproduction remain diagnostics/blockers, not acceptance claims.


## Operator-approved layout revision, 2026-09-09

The operator accepted children below the unchanged orchestrator, four per tab, with child five starting an owned overflow tab. This supersedes the earlier upper two-row blocker. The updated isolated production-adapter test passed with 1/3/4 children aligned below the caller, equal columns within one cell, full caller width, unrelated focus preserved, and overflow at children 5/9/17. The model-backed case connected its visible child but timed out after 100 seconds in `phase: starting` before a first turn; cleanup completed. Attached-client acceptance has not run.


## Herdr 0.9.0 verification, 2026-09-09

The installed binary was verified as `herdr 0.9.0`. The revised isolated production-layout acceptance passed again: the caller remained unchanged above one full-width child region; 1/3/4 child columns were equal; child five used an owned overflow tab; and unrelated focus remained unchanged. The model-backed visible-child check was repeated because the external runtime changed, but again timed out after 100 seconds with transport connected, `readyCount: 1`, `phase: starting`, and zero turns. Herdr 0.9.0 therefore validates the layout workaround but does not resolve the separate child-startup blocker. Cleanup completed.


## Startup and cleanup investigation, 2026-09-09

Pane capture established that the apparent startup hang was not a Herdr failure: the isolated task profile contained an ignored empty `auth.json`, so Pi reported `No API key found for openai-codex` after accepting the queued assignment. With the existing default-profile authentication made temporarily available for this bounded test (restored immediately afterward and not committed), the initial model turn and retained follow-up both completed in about 10 seconds.

That run exposed a second issue hidden by the earlier diagnostic fixture: finishing the retained child moved focus from the unrelated workspace to the caller. The inert fixture had switched focus back *after* pane close, masking ordinary cleanup focus theft. The actual child process settled first, then the launcher PTY exited before its pane was closed; Herdr focused the plugin workspace on PTY exit. The host now reports actual child settlement but keeps its wrapper PTY alive briefly while the parent closes the still-live non-focused pane, then verifies wrapper exit. The corrected model-backed launch/follow-up/finish test passed and retained unrelated focus. The inert fixture now tests ordinary close without restoring focus after the close response.

Focused lifecycle/layout checks passed 21 tests with 2 opt-in skips; `check:runtime` passed 335 rules and eight schemas; `git diff --check` passed. The current operator Herdr server still reports protocol 21 to the 0.9.0 client (protocol 22), so it must be restarted before this running client can exercise the new runtime.


## Final attached-client acceptance, 2026-09-09

After provisional merge `a04620e`, the operator restarted the Herdr 0.9.0 server and invoked `/reload`. Two groups of three model-backed visible explorers launched through the registered runtime with human names (Clara/Maya/Nora and Iris/Elena/June), readable assignments and outcomes, and no headless fallback. Server inspection while the first group was live showed the unchanged orchestrator `w10:p1` above panes `w10:p2`–`w10:p4`, aligned left-to-right across the full 129-cell width at 42/43/44 cells. All six children completed one turn, reported results, settled their processes, and closed their exact panes; final layout contained only `w10:p1`. The operator reported that everything appeared to work as expected. This satisfies the bounded attached-client acceptance under the revised layout contract.
