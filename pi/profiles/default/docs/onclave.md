# Onclave in default Pi

Onclave connects orchestrators: the primary models users interact with in
independent Pi instances. Subagents must not use Onclave to communicate with
subagents or other instances. These rules travel with the tools, not global
`AGENTS.md`.

## Loading and connection

Bare `pp` loads `extensions/onclave-pi.ts`, a thin loader for
`modules/onclave/extensions/onclave-pi/src/onclave-pi.ts` in the owning dotfiles
checkout. Initialize that module and install its pnpm workspace dependencies.
The adapter requires Pi 0.85.x, including `agent_settled` lifecycle support.

Registration starts automatically after session startup. Transient transport
failures reconnect automatically. `/onclave` shows connection state, instance
ID, registration, and live peer count. The existing footer displays the
`onclave-v2` status slot. Setup errors are reported without preventing ordinary
Pi use; after correcting configuration, use `/reload` or start a fresh session.

Endpoint precedence remains:

1. `--onclave-url`
2. `ONCLAVE_API_BASE`
3. Existing BWS bootstrap using `BITWARDEN_ACCESS_KEY`,
   `BITWARDEN_API_SERVER`, and `ONCLAVE_BWS_PROJECT_ID`

The BWS executable is `~/.local/bin/bws` (`bws.exe` on Windows). The service
endpoint uses HTTPS. Requests retain the existing signing contract with the
local unencrypted OpenSSH Ed25519 key at `~/.ssh/id_ed25519`. The port does not
change service authentication or configure credentials. `--onclave-id` overrides
the otherwise session-derived instance identity.

Tools are enabled after registration. If `tool_search` exposes them while
disconnected, execution still reports that Onclave is unavailable.

## Communication

- `onclave_instances`: discover other live Pi orchestrators for user-directed
  Onclave communication.
- `onclave_message`: send `ask`, `request`, or `inform`.
  - `ask` addresses one instance and waits once for a direct reply or correlated
    input-required/terminal outcome. Default timeout is 30 seconds, maximum
    five minutes. Intermediate status does not end the wait. Timeout does not
    cancel remote work or imply failed delivery.
  - `request` addresses one instance and returns publication identifiers.
    Publication is not receiver acceptance or completion. Correlated outcomes
    arrive as follow-up messages.
  - `inform` is point-to-point or broadcast when `to` is omitted. It creates no
    task, expects no reply, and never initiates a turn.

On the protected VLAN/tailnet, incoming requests require no routine host
confirmation or allowlist setup. They start a turn when idle and enter Pi's
native follow-up queue while busy, without steering current work. Peer content
retains its source framing.

The adapter replies after Pi settles, including automatic retries. Successful
responses complete tracked tasks, provider errors fail them, and aborts cancel
them. It does not infer `input-required` from prose. Unmatched status events
remain inert. Session shutdown stops receiving and settles local waits as
`session_closed`; pending conversations/correlation are not restored across
restart, reload, or session replacement.

Audit events stay in the active profile's `onclave/v2-audit.jsonl`. Old
`onclave/v2-policy.json` files are no longer read. No legacy metrics, transcript,
Herdr, or session-hook systems are required. The legacy loader uses this same
adapter, so acceptance simplification and reply fixes also apply there.

## Offline implementation checks

From `modules/onclave/`: `pnpm run check`.

From `pi/profiles/default/`:

```sh
pnpm run typecheck
pnpm test onclave-pi.test.ts
node scripts/onclave-smoke.mjs
```

The smoke test uses the actual installed Pi loader with an isolated temporary
profile and no session/network calls. Offline checks do not prove live service
compatibility. Live verification is operator-owned after implementation, not
an implementation completion gate. `/yt` and `/yt-local` remain separate,
unchanged vault workflows.
