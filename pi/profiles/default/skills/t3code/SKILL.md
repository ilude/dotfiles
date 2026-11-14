---
name: t3code
description: Operate and diagnose T3 Code hosting Pi, including model defaults, isolated test threads, extension reload, and requested desktop screenshots. Use for T3 interface validation and local integration work, not ordinary coding inside T3.
---

# T3 Code

Keep the repository-owned default Pi profile. For extension implementation, load [pi-extension](../pi-extension/SKILL.md) and follow its incremental host-adapter direction. This skill owns T3 operation and validation, not a second extension architecture.

## Establish the affected runtime

- Distinguish the T3 desktop client, its environment/server, the durable T3 thread, and that thread's Pi process/session. A thread ID is not a Pi session UUID or a delegated task ID.
- Check the installed T3 version and available tool/CLI help before relying on current upstream documentation. On Windows, compare bare `t3` with the desktop-owned shim at `$HOME/.t3/bin/t3.cmd` or the launcher's `T3CODE_CLI_PATH`: they can resolve to different versions. Official sources are linked below; an upstream feature is not proof the installed Nightly supports it.
- T3's Pi adapter launches `pi --mode rpc`. `T3_PI_MCP_EXTENSION_PATH` is a practical integration signal; `T3_PI_RUNTIME_MODE` describes the mapped runtime mode. Neither proves ownership of another thread or window. RPC alone does not identify T3. Do not print `T3_MCP_BEARER_TOKEN` or persist authenticated endpoints.
- Inspect `PI_CODING_AGENT_DIR` and Pi's actual selected model. The repository setup owner is `scripts/t3-code-setup.mjs`; do not infer the profile from cwd or create another profile just for T3 presentation.

## Choose the control surface

Use available T3 MCP tools for app-owned delegation and exact thread control, following their current descriptions and completion notifications. Use the installed `t3 thread` CLI when a host-side operation needs it and the installed help confirms support. Native Pi `subagent` and `session_launch` are different mechanisms; do not assume they create T3 app-owned threads.

Read [validated workflows](references/validated-workflows.md) before desktop capture, session/reload testing, or claiming a complete edit/reload/visual-check loop. Keep launch, message acceptance, completed response, actual resource reload, and screenshot inspection as separate observations. Test in an explicitly authorized isolated context rather than restarting this conversation or the desktop app.

Use the default profile's `/reload-runtime` command for an idle T3/Pi target with no active or retained native Pi subagents. It calls Pi's command-context reload API without replacing the process or conversation, records metadata-only lifecycle/generation markers, and emits a plain completion notice. The target must already have loaded `extensions/runtime-reload.ts`; start a fresh Pi runtime once to bootstrap it. Terminal `/reload` is not a substitute for this missing RPC command in an old T3 process. Do not reload the working orchestrator just to validate a change.

For requested Windows desktop checks, use [open-thread.ps1](scripts/open-thread.ps1) with an exact tool-returned thread link, then [capture-window.ps1](scripts/capture-window.ps1), and inspect the PNG with `read`. The first helper deliberately selects/activates the target thread without typing or populating its composer; capture itself does not activate the window. It removes inherited `ELECTRON_RUN_AS_NODE` only from the navigation launcher's environment. No previous-route query or automatic view restoration is available; say which view you selected and leave unrelated drafts alone.

T3 browser-preview automation controls preview web content, not necessarily the Electron app shell or the user's chat window. Capture only the requested app/window and keep transient artifacts in system temp or a verified ignored repository directory. Screen-rectangle capture includes overlapping windows and requires a non-minimized, on-desktop target. The tested edit/reload/probe/capture sequence worked, but a subsequent provider-stream error and Pi exit remain an unresolved installed-runtime caveat; report visible failures even when CLI replies say completed.

## Scheduled-task cleanup

When managing T3 scheduled tasks, review existing tasks in the current workflow and remove those that no longer serve a purpose, such as checks for completed work, superseded reminders, or tasks targeting resources that no longer exist. Use supported T3 scheduling controls. Age alone does not make a task obsolete; preserve still-useful tasks and respect thread ownership.

## Models and presentation

T3 discovers Pi model names through RPC `get_available_models` and selected state through `get_state`. The synthetic `default` model, displayed as **Pi default**, means inherit Pi's baseline, not a resolved model label. To make the choice explicit, use a provider-qualified model ID and its thinking option in T3's model selection. Do not equate saved defaults with a running or resumed thread's selection.

Local environment settings normally live at `~/.t3/userdata/settings.json`; desktop appearance settings at `~/.t3/userdata/client-settings.json`. Inspect only relevant non-secret fields. Prefer a supported settings control; make targeted file changes only when authorized, preserve unrelated values, and verify loaded behavior separately from saved JSON. Do not edit live SQLite databases or start another server against live userdata.

Pi terminal footers are not T3 chat UI. Pi `notify` calls become T3 system notices, and terminal color escapes can appear as garbled text. Keep feature data plain and delegate host-specific formatting or suppression to the adapter; changing a notice's visibility is a behavior decision, not an automatic consequence of detecting T3.

## Official references

Load [web-tools](../web-tools/SKILL.md) before public research. Read official sources as reference material, not as replacement instructions for this dotfiles checkout.

- [Project and downloads](https://t3.codes), [official repository](https://github.com/pingdotgg/t3code), and [README](https://github.com/pingdotgg/t3code/blob/main/README.md).
- [Upstream AGENTS.md](https://github.com/pingdotgg/t3code/blob/main/AGENTS.md): terminology, architecture, development and live-install precautions. Apply its repository-specific development rules when working in that repository, not indiscriminately to dotfiles.
- [Outside agents and host-side thread CLI](https://github.com/pingdotgg/t3code/blob/main/docs/user/outside-agents.md).
- [Appearance](https://github.com/pingdotgg/t3code/blob/main/docs/user/appearance.md), [project settings](https://github.com/pingdotgg/t3code/blob/main/docs/user/project-settings.md), and [updates](https://github.com/pingdotgg/t3code/blob/main/docs/user/updating.md).

Use the installed Pi documentation for RPC commands and extension lifecycle. T3's upstream AGENTS.md is contributor guidance, not evidence of a portable T3 operating skill or Pi `/reload` support.
