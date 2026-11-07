# T3 Code capability observations

Checked 2026-11-07 on Windows with T3 Code `0.1.8-nightly.20261106.4262` and Pi `1.5.0`. These are dated observations, not guarantees for other versions, operating systems, or connected environments.

## Established local integration

- The installed `app.asar` package names `https://t3.codes` as its homepage. That site identifies `pingdotgg/t3code` as the official source. Public main and the installed Nightly need not have identical providers or commands.
- T3 explicitly injects `T3_PI_MCP_EXTENSION_PATH` and `T3_PI_RUNTIME_MODE` when launching Pi's RPC integration. Endpoint/bearer variables are also present; do not print or persist their values. Inherited markers do not establish UI ownership.
- T3 discovers models using Pi RPC `get_available_models` and reads active state with `get_state`. Its synthetic `default` entry has the literal label **Pi default**. Discovered identities are `provider/id` with Pi's display name.
- The saved local default was JSON-verified as `instanceId: "pi"`, `model: "openai-codex/gpt-6.1-sol"`, `options: [{ id: "thinking", value: "high" }]`. A stored default does not prove the selection of an existing runtime.
- Installed CSS caps comfortable chat at `46rem`, wide at `72rem`, and full at `100%`, with a centered `width: 100%` content lane capped by that maximum.
- `extensions/tps-tracker.ts` colors its completion notification with terminal escape sequences. T3 forwards Pi notifications into system notices, and captures still showed the garbled timing notice. The validation helpers and reload bridge do not fix or suppress it.

## Thread control

T3 `delegate_task` successfully launched app-owned Pi children. A control worker identified its own T3 target, confirmed `relationshipToParent: "subagent"` using `t3_thread_read`, and sent a unique probe to itself with `t3_thread_send({ threadId, mode: "steer", message })`. Both the user input and actual assistant acknowledgment persisted; the orchestrator independently verified them.

Keep task IDs, child-thread IDs, and native Pi session UUIDs distinct. Follow completion notifications instead of polling running delegates. Do not use top-level thread creation as a substitute for delegation.

The installed desktop-owned CLI subsequently completed both an idle reload-command turn and a post-reload model turn in the same delegated thread:

```powershell
# From the dotfiles root; $threadId must be the exact authorized T3 test-thread ID.
$t3 = Join-Path $HOME '.t3/bin/t3.cmd'
& $t3 thread send $threadId '/reload-runtime' --wait --json
& $t3 thread send $threadId 'A bounded post-reload probe' --wait --json
```

The first returned `status: "completed"`, `reply: null`, `error: null`: no model reply is expected for a handled command. The second returned the actual model reply. Inspect the intended CLI's help and version first: bare `t3 --version` reported `0.1.7`, while the desktop-owned shim reported `0.1.8-nightly.20261106.4262`.

The official [outside-agent documentation](https://github.com/pingdotgg/t3code/blob/main/docs/user/outside-agents.md) also describes `t3 thread start . "task"`, `show`, and `list`. New standalone CLI `start` and queued delivery to a busy thread were not live-tested here. CLI `send` is documented to queue rather than interrupt a busy target.

## Exact-thread navigation and capture

Use the bundled helpers from the dotfiles root:

```powershell
$helpers = './pi/profiles/default/skills/t3code/scripts'
# $link must be an exact <t3-thread://v2/environment/thread> tool-returned link.
& "$helpers/open-thread.ps1" -Link $link
$shot = & "$helpers/capture-window.ps1"
$shot | ConvertTo-Json -Depth 4
# Pass $shot.Path to the read tool and inspect the actual image.

# Select a previously verified window explicitly when necessary:
& "$helpers/capture-window.ps1" -ProcessId $shot.ProcessId -WindowHandle $shot.WindowHandle
```

`open-thread.ps1` maps the tool link to the installed desktop route `t3code://threads/<environment>/<escaped-thread-id>`. It invokes the registered Windows protocol handler and requires one already-running matching T3 desktop main process. It supplies no prompt query parameters and never types into the composer. Pi inherited `ELECTRON_RUN_AS_NODE=1`, which initially prevented dispatch; the helper removes that variable only from its spawned handler's environment. The original desktop PID, handle and start time remained unchanged.

Dispatch is not proof of navigation. A worker's capture visibly showed its exact delegated thread title and subagent breadcrumb; the orchestrator independently inspected the image. Later captures showed the exact reload test thread, baseline marker, changed completion notice and post-reload reply. No manual coordinate clicking was needed. Navigation can activate T3 normally; there is no supported prior-route query or automatic restoration in these helpers.

`capture-window.ps1` identifies the actual T3 main window by process executable/title and native handle, scopes DPI awareness to physical pixels, obtains `GetWindowRect`, then uses `Graphics.CopyFromScreen` for only that rectangle. It writes a unique PNG under system temp by default and returns path, timestamp, window/process identity and bounds. It rejects ambiguous targets, minimized windows and unusable/off-desktop bounds, without moving or resizing anything. Both helper scripts passed PowerShell parsing and actual operation checks.

The observed main window was PID `63476`, handle `0x5615A4`, bounds `(1273,24)-(3847,1413)`, producing `2574×1389` PNGs. These are historical observations, not reusable constants. This is a visible-screen capture, not an occlusion-independent window buffer: overlapping windows can appear. Browser-preview tools and device screenshots are not evidence of Electron-shell access. Cross-platform capture was not validated.

## Genuine reload and the end-to-end test

The installed T3/Pi versions have no built-in `/reload` route in RPC. T3 forwards ordinary text through `prompt`; Pi dispatches registered extension commands but has no standalone RPC `reload` operation. The default profile now supplies `extensions/runtime-reload.ts`, based on installed Pi's `examples/extensions/reload-runtime.ts` command-context API.

`/reload-runtime` validates its empty argument list, waits for idle, and calls `await ctx.reload(); return;`. Like native `/reload`, use it only after active/retained native Pi children have settled; it does not migrate children, restart the app, replace the conversation, or schedule more agent work. No new model-callable reload tool was added. New Pi runtimes discover the extension normally. An existing runtime that has not loaded it cannot bootstrap the command by receiving its name as text; start a fresh Pi runtime once first.

Each extension factory owns a random generation ID. Metadata-only `runtime-reload` custom entries record session starts and reload shutdowns with event/reason, generation, PID and native session UUID. They are not model messages. A reload start also sends the plain notice **Pi resources reloaded in place.** Do not rely on a fixed marker count: startup/session replacement can emit repeated starts for the same generation.

The live test sequence was:

1. Launch an isolated default-profile T3 delegate and establish its baseline generation, native session and PID. Navigate to that exact thread and inspect a baseline screenshot.
2. Edit the extension's completion notice after the baseline runtime had loaded it.
3. Send `/reload-runtime` using the desktop-owned CLI. The handled-command turn completed with no model reply.
4. Inspect the exact native session's metadata: old-generation `shutdown(reason: "reload")`, then new-generation `start(reason: "reload")`, with unchanged PID `63468` and native session `01a1b6cd-66c8-7481-91fb-ef0edad4260f`. The OS process start time was also unchanged immediately after reload.
5. Capture and inspect the T3 window. It showed the edited notice **Pi resources reloaded in place.**, proving the new source had loaded rather than merely appending an acknowledgment.
6. Send a bounded model probe. It returned **T3-RELOAD-AFTER | PASS**, reporting the new generation in the same PID/session. Navigate/capture again and read the image to confirm the response was visible.

The working orchestrator, desktop app, unrelated threads, and user drafts were not restarted or rewritten. This establishes execution of edit → reload → model probe → exact-thread capture/inspection, not every other host's behavior.

### Unresolved installed-runtime caveat

The final capture also exposed a red **provider event stream closed unexpectedly** banner. T3's persisted provider-session projection changed to `error` at `2026-11-07T16:23:02.562Z`, after the reload command completed at `16:20:57.817Z` and the post-reload probe completed at `16:22:15.223Z`. The Pi PID was no longer present on subsequent inspection, while the desktop PID remained unchanged. T3 still records all three test runs as completed.

This is not a clean long-lived-session pass. The cause was not established by the bounded trace/activity investigation, and neither causation by reload nor harmless idle cleanup should be inferred. The native same-process reload and subsequent model response are proven; continuing provider-session stability remains unresolved. No installed T3 bundle, module source, live database, or process-recovery mechanism was patched to hide the warning. Further diagnosis needs the provider termination cause and, if it is T3-side, a separately validated owning-repository fix rather than a Pi-notification workaround.

## Sources and checks

Official `t3.codes`, the linked GitHub repository, root `AGENTS.md`, `README.md`, and user docs for outside agents and appearance were retrieved with native fetch after native search was rate-limited. No official portable T3 operating skill was established by that bounded lookup. These references do not replace the installed command help or local live evidence.

Focused checks passed: `pnpm test runtime-reload.test.ts` (2 tests) and `pnpm run typecheck` from `pi/profiles/default/`. Unit coverage checks command dispatch, idle ordering, metadata generations, plain completion notice, invalid arguments and propagated reload errors; the actual T3 run above is the separate integration evidence.
