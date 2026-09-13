# Registration experiments, 2026-09-13

## Environment and scope

Windows, Node v25.9.0, installed Pi 0.85.1, Herdr client/server 0.9.0. Each run created a uniquely named Herdr server, temporary config/data directories, plugin registry, socket, and disposable panes. Only those owned servers were stopped. No production launcher, integration, plugin registration, or shared server was changed.

These are pre-implementation experiments, not validation of a finished production patch.

## 1. Wrapper parent spawning the real Pi CLI

Session: `reg-25984-1789326183950`.

A disposable copy of `scripts/pi-herdr-launch.mjs` replaced its final dynamic import with `spawn(process.execPath, [entry, ...args], { stdio: "inherit", shell: false })` and awaited child termination. Existing bootstrap reporting and launcher-owned exact-pane retirement were retained. The test used minimal temporary Pi profiles containing the real lifecycle extension and a small probe extension, plus `--approve --no-context-files --no-skills --no-prompt-templates`. No model calls or project tools ran in this experiment.

Observed for both test panes:

- `pane.process-info` showed distinct launcher and Pi PIDs, with the actual bundled Pi CLI as foreground process.
- `agent.list` included the exact pane with idle state and the Windows session path independently recorded by the probe's native `session_start` callback.
- A native `/probe-input` command arrived through Herdr and wrote a receipt from the Pi child.
- A native shutdown command ended the Pi child. Its PID no longer existed and launcher cleanup removed the exact pane.

This closes the earlier gap between direct-CLI success and the proposed wrapper-parent/spawned-child arrangement. Signal-driven shutdown, startup failure propagation, preflight repair mode, and resume/plan arguments still need the final implementation's focused regression checks. The minimal profile did not test every default extension.

## 2. Reload reason comparison

The same run used fresh panes and identical lifecycle code except for the existing `reload` to `startup` translation.

| Variant | Initial registration | Same-session reload | Session identity | Native input and exit |
| --- | --- | --- | --- | --- |
| Original `reload` | idle, listed | idle, listed | preserved | passed |
| Translated `startup` | idle, listed | idle, listed | preserved | passed |

Both were checked after the native reload callback and again after a further 1.5 seconds. The translation is unnecessary for this supported, already-registered same-session reload. It was not shown to be harmful. The earlier inference that lack of Pi session-replacement permission makes `startup` invalid for every reload was incorrect: replacing a different session and retaining an anchored session are different paths.

Remove the translation as an unnecessary deviation from upstream, not as a demonstrated root cause. Do not claim either result repairs a previously unrecognized wrapper process or the sequence-contaminated production pane.

## 3. Actual visible subagent and headless control

Sessions: `reg-2880-1789326264012`, then `reg-5236-1789326300227` with an added independent native-session-content assertion.

Used the actual `SubagentRuntime`, `VisibleChild`, repository `local.pi` bootstrap, authenticated subagent host, and default-profile child extension stack. An isolated shell pane supplied the parent layout context. The leaf had no tools, used `openai-codex/gpt-5.6-luna` at low effort, and received only `Reply only: registration probe complete`. The assignment was retained for inspection.

Observed:

- The visible child appeared in `agent.list` during startup, initially unknown while Pi initialized, then idle with session identity.
- During the actual model request it was listed as working.
- After completion it remained listed and idle while retained.
- The session path returned by Herdr contained the experiment's actual native user request and assistant response. The runtime snapshot did not expose a session file, so the second run checked the saved native records independently rather than silently skipping identity verification.
- Native child `/reload` produced the second readiness receipt and preserved the same Herdr session path and idle state.
- `finish()` removed the exact pane and its agent-list entry.
- The same assignment on the headless surface completed without adding or changing any agent-list entry throughout the sampled run.

The production visible-subagent host already spawns the real CLI and passed without changes. This does not reproduce a separate missing-subagent defect; do not redesign that path on suspicion alone.

## Activation and remaining limits

- No Herdr upgrade was needed for any passing experiment.
- A process launched through the old dynamic-import wrapper cannot acquire a different OS command line through Pi `/reload`. After the production fix, reopen those Pi sessions through the corrected launcher when work is settled.
- A full shared Herdr restart is not established as necessary. It is not authorized as an automatic cleanup or activation action.
- Production implementation must still run its focused checks and the isolated registration tests against the final code, including its chosen lifecycle variant and relevant default-profile behavior.
- Windows is tested. Unix process-group/signal behavior and attached-client visual rendering are not established by these experiments.
- Polling observed working and settled states for the real leaf; it does not prove every transient state or all possible scheduling interleavings. There is no evidence here requiring reconciliation timers or lifecycle ownership replacement.
