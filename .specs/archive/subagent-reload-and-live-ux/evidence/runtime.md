# Runtime lifecycle evidence

Date: 2026-09-08
Worktree: `fix/subagent-reload-and-live-ux` at `C:/Users/mglenn/.dotfiles/.worktrees/subagent-reload-and-live-ux`
Profile: `pi/profiles/default`. Earlier commands below inherited the lasting-checkout profile and removed `PI_SUBAGENT_AUTHORITY`. The repaired lifecycle test was run with `PI_CODING_AGENT_DIR` explicitly set to the absolute task-worktree profile; its actual bundled Pi subprocess removes all inherited `PI_SUBAGENT_*` and `HERDR_*` variables before setting only its fake-child executable/argv and task profile.

## Lifecycle facts

- Parent verified the installed Pi lifecycle ordering: `ctx.reload()` emits `session_shutdown` with `reason: "reload"`, reevaluates resources, then emits `session_start` with `reason: "reload"` and `resources_discover(reason: "reload")`. `session_shutdown` errors must not be treated as a reload veto.
- Supported reload precondition is explicit: no running or waiting child, no retained idle child conversation, no live child process, and no open owned pane. `SubagentRuntime.hasActiveResources()` checks status, `retained`, process state, and pane state. Reload does not migrate or specially clean unsupported active-child cases; `retireForReload()` rejects them.
- The old executable owner is no longer stored on `globalThis`. Each evaluated runtime module owns a module-local `SubagentRuntime`. A source reload therefore constructs a fresh class instance rather than reusing the old `Symbol.for(...)` runtime object.
- The only cross-evaluation state is plain data under `Symbol.for("dotfiles.pi.default.subagents.state.v2")`: allocated-name reservations and undelivered outcome records. Processes, transports, timers, listeners, layouts, contexts, and child objects are not carried over. Acknowledged outcomes are removed before retirement and are not replayed.
- `/clear` reaches the owning subagents extension through the event bus (`default:subagents:reset`), because Pi extensions are separately loaded. It resets the current owner and preserves normal session-switch ownership/delivery behavior. The obsolete `typeof runtime.wait` compatibility heuristic and pre-upgrade `/clear` path were removed.

## Commands and results

- `bash scripts/pi-deps-link-setup --profile default`: passed; linked installed Pi 0.85.1 dependencies into the worktree profile.
- `cd pi/profiles/default && env -u PI_SUBAGENT_AUTHORITY pnpm test subagent-runtime.test.ts`: passed, 9 tests.
  - Includes inert fake-RPC settlement evidence: a settled child had `status: "settled"` and `processState: "exited"`; retirement produced a new `ownerId`, retained the undelivered failed outcome as inert data, and the next allocation did not reuse the prior human name.
- `cd pi/profiles/default && env -u PI_SUBAGENT_AUTHORITY pnpm test subagent-status.test.ts subagent-runtime.test.ts`: passed, 14 tests.
  - Covers module-local reset, absence of the obsolete pre-upgrade notice, UI-only progress, origin-scoped delivery, and normal session switching.
- `cd pi/profiles/default && env -u PI_SUBAGENT_AUTHORITY pnpm test subagent-session-lifecycle.test.ts`: passed, 1 test.
  - Historical pass only, superseded by the repair below. That fixture imported the runtime in a separately loaded extension, observing an unbound owner rather than the production extension's owner. Its journal no-replay assertion was missing, so it did not establish the required lifecycle contract.
- `cd pi/profiles/default && env -u PI_SUBAGENT_AUTHORITY pnpm test profile-reload-integration.test.ts`: passed, 5 tests.
  - Existing loader integration verified cached factories retain pending reload state across `new`/`resume`/`fork` and clear the baseline after source reevaluation. Clear behavior passed in both extension orders.
- Combined focused run: `env -u PI_SUBAGENT_AUTHORITY pnpm test subagent-runtime.test.ts subagent-status.test.ts subagent-session-lifecycle.test.ts profile-reload-integration.test.ts`: passed, 4 files, 20 tests.
- Earlier `cd pi/profiles/default && pnpm run typecheck`: reported `lib/subagents/layout.ts` with `Type "left" is not assignable to type "SplitDirection"` and a missing `.mjs` declaration in `tests/commit-whitespace.test.ts`. The layout diagnostic was concurrent task-owned work, not unrelated or pre-existing. The commit-whitespace diagnostic is outside this bounded lifecycle-test repair. No diagnostics in that run referenced the runtime, clear, subagents extension, or lifecycle test; this is historical evidence, not a new typecheck pass.
- `cd pi/profiles/default && env -u PI_SUBAGENT_AUTHORITY pnpm run check:runtime`: passed (Pi 0.85.0 loader/bootstrap/policy/grammar/schema smoke, no model call).
- `git diff --check`: passed.

## Repaired actual-owner acceptance

- Changed only `pi/profiles/default/tests/subagent-session-lifecycle.test.ts` and this evidence in the bounded repair.
- A single scratch wrapper imports the production subagents factory and runtime in the same loader graph, invokes the factory through a proxy capturing its actual registered tools, and is the only extension passed to the bundled native Pi CLI RPC parent. No production testing API or separate harness was added.
- Calls execute through the captured production `subagent` and `subagent_control` definitions. An inert local provider seeds the real journal; the existing fake RPC subprocess supplies bounded child work. Network access is disabled in the parent; no model or Herdr calls are used.
- The test launches an active background child, changes to a new chat, resumes the origin while the child is still active, and verifies the same owner throughout. It switches away again, releases the child, observes `settled`/`exited`, and verifies no outcome reaches the other chat. On resume it requires exactly one actual `custom_message` journal outcome and the matching native `message_end` acknowledgement.
- It changes a marker in the scratch wrapper source, invokes exactly one registered command using `ctx.reload()`, and verifies source reevaluation and a new owner. The captured old registered launch tool rejects as disposed. The replacement registered tool completes another child with a different human name. The acknowledged delivery remains exactly once in the journal with no duplicate acknowledgement.
- Repair debugging caught an unpersisted origin journal and an incorrect assumption that custom entries have ordinary `message` shape. The fixture now seeds a native turn before switching and asserts the actual `custom_message` schema; neither assertion was removed.
- `cd pi/profiles/default && PI_CODING_AGENT_DIR="$(pwd -W)" pnpm test subagent-session-lifecycle.test.ts`: passed, 1 test, 3.44 seconds test time. The explicit path resolved to `C:/Users/mglenn/.dotfiles/.worktrees/subagent-reload-and-live-ux/pi/profiles/default` (native Windows separators in the subprocess). Cleanup completed through the registered fixture command, then the exact parent process and scratch directory were removed.

## In-flight settlement guard repair

The integrated run exposed two early-observation races. `RpcChild.fail()` sets terminal status before asynchronous process cleanup and `done()` enqueue the final outcome. An error widget and even process exit alone are therefore insufficient retirement/delivery evidence.

- `lib/subagents/runtime.ts`: `hasActiveResources()` now requires `phase: "settled"` as well as terminal status/process exit. Cleanup remains active under the existing supported reload precondition; no migration or broader lifecycle change was introduced.
- `tests/subagent-runtime.test.ts`: the reload test explicitly selects the existing fake RPC executable, waits for authoritative phase/status/process settlement, and observes that exited-but-cleaning remains active. It preserves the failed-outcome carry assertion and explicitly verifies replacement-owner delivery and acknowledgement without replay. No cancellation is used to race the original failure cleanup.
- `tests/subagent-status.test.ts`: waits for the failed child's settled phase/process before switching back and asserting final delivery. Existing UI-only progress and origin-routing assertions remain intact; no arbitrary sleeps were added.
- Ran only the affected runtime/status tests plus the repaired actual-loader lifecycle test, with all inherited `PI_SUBAGENT_*` and `HERDR_*` variables removed and the absolute task profile explicitly selected:

```sh
for key in ${!PI_SUBAGENT_@} ${!HERDR_@}; do unset "$key"; done
cd pi/profiles/default
PI_CODING_AGENT_DIR="$(pwd -W)" pnpm test subagent-runtime.test.ts subagent-status.test.ts subagent-session-lifecycle.test.ts
```

Result: **3 files passed, 15 tests passed**, 14.82 seconds wall duration. No typecheck or unrelated TS7016 edits were made. Integrated-suite rerun remains with the parent/validator.

No Herdr server, production plugin link, live pane, or attached client was mutated. Physical focus/layout acceptance remains covered by the separately owned live-layout work and was not claimed by this runtime evidence.
