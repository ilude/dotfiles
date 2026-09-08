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
