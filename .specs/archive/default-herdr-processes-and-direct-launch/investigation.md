# Planning investigation: 2026-09-07

This is capability evidence, not production implementation or an acceptance pass for code that does not exist yet.

## Environment and isolation

- Windows, Node 25.9.0, Pi 0.85.0, Herdr 0.8.2-preview.2026-08-31-b1ff4582e968.
- Actual Pi profile: repository `pi/profiles/default/`, explicitly supplied through `PI_CODING_AGENT_DIR`.
- Disposable Herdr sessions: `pi-plan-probe-20260907` and `pi-plan-probe-20260907-logs`.
- Test-only `APPDATA`, `LOCALAPPDATA`, and `HERDR_CONFIG_PATH` under `C:/Users/mglenn/AppData/Local/Temp/herdr-plan-probe-20260907/` isolated the socket, registry, plugin state, logs, and configuration from the production Herdr session. Test sound/toast delivery was disabled. No client was attached.
- Plugin `local.pi-plan-probe-20260907` had argv-only pane entrypoints, no startup/build/event hooks. Its config directory was verified inside the temporary tree.
- Default Pi resources loaded without editing the profile. A second launch added a freshly generated integration and a temporary probe extension by explicit `--extension` paths. `--no-session --no-tools` were used; no repository implementation was installed.

## Results

| Check | Observed result | Meaning / limit |
| --- | --- | --- |
| Direct Node pane | Node parent PID was the isolated Herdr server PID; both stdin and stdout were TTYs | No shell host. Windows OpenConsole helpers still exist as terminal infrastructure, not command shells. |
| Profile/cwd/identity | Fixture received requested cwd/profile and newly allocated pane/tab/workspace IDs plus isolated socket | Basic environment/identity contract works. Production launcher still needs deliberate environment selection and validation. |
| Tab placement | Opened an unfocused plugin tab using workspace ID | Tab opens reject `target_pane_id` and direction. Use workspace only, then returned IDs. |
| Split placement | Opened an unfocused right split using exact source pane ID | Split placement works on installed preview. |
| Foreground server | Node fixture listened on loopback on an ephemeral port; bounded wait found fresh readiness; HTTP returned 200 and expected body | Pane creation alone is not readiness. No fixed port or external listener needed. |
| Native pane commands | `pane run` submitted an echo once, exited 0 with empty stdout; pane read showed its output | Confirms silent-success behavior underlying the original package's JSON parsing defect. Do not require JSON for mutations. |
| Direct Pi | Process inspection showed `Herdr -> node.exe <Pi dist/bundle/cli.js>` | Neither `pp`, PowerShell, cmd, nor Bash hosted this Pi process. |
| Default UI | Startup listed default extensions/skills; operator footer, quota/TPS/context information and notices rendered in pane output | Default resources load without a shell. Rendering was inspected through terminal text, not an attached visual client. |
| Reload | `/reload` reported successful reload and retained footer | Shell-free operation does not prevent Pi reload. |
| Exit | `/exit` removed each test Pi pane; no shell remained | Service fixture panes stayed alive until separately stopped. |
| Generated integration | Installer targeting a temporary profile emitted version 8; loaded by explicit extension path | Uses Windows pipe prefix, TUI gate, `agent_start`, `agent_settled`, and `herdr:blocked`. Does not itself bridge native prompt events. |
| Actual approval presentation | Temporary command invoked repository `promptDecision()` with an inert request; native event log recorded `ui_prompt_start(kind=custom)` | Uses the real current Damage Control presentation path without executing any command or requiring a model decision. |
| Attention state | Unfocused test Pi pane became `blocked`; Escape produced denial, `ui_prompt_end(kind=custom)`, then Herdr `done` | A small native-event bridge is sufficient for this path. No default approval-view modification required. |
| Working/completion reporting | Synthetic reports on a separate owned fixture pane produced `working`, then background `done` from idle | Validates Herdr state contract, not an actual model retry/follow-up lifecycle. |
| Compose logs | Docker 29.7.2 / Compose 5.3.1 ran a disposable Alpine 3.22 service; pane showed its readiness log | Used an existing image, pull disabled, no mounts/network/ports, 32 MiB memory and 0.1 CPU limit. |
| Compose ownership | Closing the exact log-viewer pane left its detached container `running`; explicit project-scoped `down` then removed it | Stopping observation does not imply stopping the service. |

## Findings that change implementation details

1. **Use a generated machine-local manifest.** The pane command is a fixed argv array. Resolve actual Node and Pi package `bin.pi` during setup/launch instead of checking a versioned pnpm-store path into the repository. The profile's linked package successfully supplied `dist/bundle/cli.js`. CommonJS `require.resolve(package)` failed because this package exports its main entry for imports only; do not use that failed resolution strategy.
2. **Keep a stable Node bootstrap.** Pass a small validated profile/session selection through dedicated launch environment variables; `plugin.pane.open` does not accept arbitrary Pi argv. Reuse the existing JS preflight, preserve repair-mode argument sanitization, and load Pi in the same Node process or explicitly forward terminal handles and exit behavior if a child is needed. No shell is necessary. This bootstrap is still to be implemented and tested, not proven by the bare-Pi probe.
3. **Tab targeting differs from split targeting.** `/branch` and `/new-instance` should use `--placement tab --workspace <caller-workspace>` without `--target-pane`. Parse `result.plugin_pane.pane`, then rename the returned tab with supported `tab rename`; do not rebuild the manifest to change a tab title. Preserve existing focused-launch behavior. Background development panes use no-focus.
4. **Branch sessions need an exact launch input.** Existing code creates a branch file then extracts its UUID. The new launch path should pass that exact file path to Pi. No production `/branch` or `/new-instance` handler was changed or invoked in this experiment. Persisted branch restoration belongs in the implementation acceptance check.
5. **Use the generated state integration plus a separate native prompt bridge.** The generated version 8 report queue coalesces state and has no shutdown drain. It recognizes absolute session file paths only when they begin with `/`, falling back to session ID for Windows paths. Preserve generated ownership; do not copy the customized legacy file. Do not claim automatic Herdr session restoration parity from these probes.
6. **No new bell layer is justified yet.** Built-in config documents toast delivery choices `off`, `herdr`, `terminal`, `system`, and sound options. The production file has no explicit matching overrides. A headless isolated server cannot prove a user heard a sound or received a desktop alert. Keep sound/desktop settings unchanged unless the user chooses otherwise, and validate delivery with an attached client during acceptance.
7. **Execution safety needs explicit integration work.** Default Damage Control's adapter handles native tools; enforcement returns without analysis for uncovered tool names. Structured Herdr tools therefore need deliberate command handling. CLI-first use also does not automatically analyze the command embedded in `herdr pane run`, or establish the target's actual shell/cwd. Preserve the agreed safety boundary for command submission regardless of D2. Do not present a thin skill or wrapping in native Bash as equivalent protection.
8. **Verify interruption, do not infer it from exit 0.** `send-keys ctrl+c` returned success but did not establish log-viewer termination before container shutdown. A later owned-pane-close experiment conclusively verified viewer/container separation. Implement graceful interruption followed by bounded reinspection; use explicit owned-pane closure when appropriate, not repeated blind Ctrl+C submissions.

## Experiment corrections and limits

- First tab request wrongly included a source pane. Herdr rejected it without creating a pane; corrected workspace-only request succeeded.
- Git Bash/MSYS converted a literal `/reload` argument to a filesystem path. That produced one harmless model reply in the test Pi instead of running reload. Corrected subsequent slash-command probes with `MSYS_NO_PATHCONV=1`. Production Node `spawn(..., {shell:false})` does not need to route through Git Bash. No fixture command was executed by that reply.
- The first Compose fixture expired after its finite 300-second lifetime before the follow-up inspection, so that attempt could not prove interruption semantics. A tightly bounded repeat proved container survival after exact viewer-pane closure. The separate Ctrl+C result remains limited as stated above.
- No third-party package was installed. Bellwether source review remains evidence against unchanged adoption, not a package runtime pass.
- No visual/audible/desktop delivery check, preflight-repair launch test, or persisted branch restore was performed. Those are bounded acceptance checks for their eventual implementation, not reasons for another broad investigation.

## Cleanup

- Both Pi processes exited normally; both Node server fixtures exited on their fixture quit key.
- Temporary plugin was unlinked from the isolated registry.
- Both named Herdr servers were stopped through their explicit isolated session routing; session list confirmed stopped.
- Project `pi-herdr-plan-probe-20260907` was removed with its own Compose file/project name; final project-label container query returned no containers. No images, user stacks, or unrelated resources were removed.
- Temporary probe sources/logs remain under the named Temp directory as evidence only. The repository change from this investigation is planning documentation. Other agents made concurrent repository commits; their work was not reverted or amended.

## Planning conclusion

Update 2026-09-08: the user selected repository-owned structured tools backed by the installed CLI, plus the thin dynamic skill. No third-party Pi extensions or package adaptations. Historical package-choice discussion above is not an open implementation decision; use `plan.md` as the current authority.

The installed Herdr supports the core requested design. No Herdr upgrade, shell-host workaround, service supervisor, or agent-orchestration layer is required. Further broad investigation is not needed. Finalize the execution-surface choice and invocation policy, then implement the bounded launcher, prompt bridge, skill/tool integration, and acceptance checks in `plan.md`.
