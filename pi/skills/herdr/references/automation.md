# Herdr automation contracts

Use a dedicated Herdr session for automation. Never target the default interactive socket.

## Pane moves

- `pane move` returns the move outcome under `result.move_result`.
- `result.move_result.changed` reports whether topology changed.
- `result.move_result.reason` may report `same_tab` or `zoomed_tab` when no move occurs.
- Moving a pane into an existing tab requires `--split`.
- Any pane move in a workspace cancels an active `agent wait` or `agent prompt --wait` in that workspace.

## Process environment

A Pi process launched through `pane run` inherits the caller's environment. Set `HERDR_PANE_ID` and `HERDR_TAB_ID` to the created pane and tab explicitly rather than relying on inherited values.

## Session isolation

Run automation with `herdr --session <name>` and pin `HERDR_SOCKET_PATH` to that session's socket. `--no-focus` prevents a focus change but does not isolate or protect the default interactive session.

## Installed API schema

Dump the installed CLI schema before relying on request or response shapes:

```bash
herdr api schema
```

Use the schema emitted by the installed Herdr version as the contract for automation code.
