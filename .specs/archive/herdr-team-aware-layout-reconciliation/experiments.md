# Herdr movement experiment

Date: 2026-09-27

## Scope

The opt-in `subagent-ux-live.test.ts` fixture used a fresh isolated Herdr configuration, plugin registry, server, workspaces, tabs, and inert processes. It did not relink or stop the shared production server.

Installed client/server: `0.9.1-preview.2026-09-21-0ff0f27e2226`, protocol 22.

## Observations

- `pane move <pane> --new-tab --workspace <workspace> --no-focus` moved a live pane into a same-workspace dedicated tab.
- Sequential `pane move <pane> --tab <tab> --split ... --target-pane <pane> --no-focus` calls moved the remaining team panes into that tab and back into the origin tab.
- Every moved pane retained its exact `terminal_id`; returned pane IDs were consumed from `move_result.pane` rather than predicted.
- An unrelated focused pane remained focused through migration and return.
- The production `SubagentLayout` scenario independently grew a Team Lead group until it required a dedicated tab, verified the complete team's terminal identities, removed the expansion pane, and verified automatic return with the same terminal identities.
- Current preview builds can name a server created under a fully isolated configuration `default` even when the launch command includes a requested session selector. The fixture now discovers the one running session from that isolated configuration instead of waiting for the requested label. Isolation still comes from the unique config and AppData paths.

## Command and result

```text
PI_SUBAGENT_UX_LIVE=1 pnpm test subagent-ux-live.test.ts
Test Files  1 passed (1)
Tests       3 passed | 1 skipped (4)
Duration    58.57s
```

The skipped case is the separately gated real bundled-Pi/model scenario. The inert movement, production layout, and full geometry scenarios passed.

## Conclusion

Same-workspace live team migration and automatic return are supported for this Herdr version without process recreation. Production code may rely on the exact returned pane identity after verifying `terminal_id`; it must stop on an ambiguous or changed identity rather than retrying blindly.
