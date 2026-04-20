---
created: 2026-04-19
status: draft
completed:
---

# Plan: Zellij Windows Cockpit V1

## Context & Motivation

The goal is to turn the broader `zellij_micro_pi_windows_cockpit` concept into a shippable first version for this dotfiles repo. The original spec had a strong overall vision — a Windows-native terminal cockpit built around PowerShell 7, Zellij, Micro, Yazi, fzf/fd/rg/bat, and Pi — but it mixed two very different scopes: a practical single-workspace cockpit that can ship now, and a future multi-agent orchestration system with role selection, persistent sessions, and shared agent state.

During review, the key decision was to trim v1 down to the part that is executable and useful immediately: one project/worktree, one Pi pane, repo-managed installation/configuration, and helper commands that make the layout a daily driver. The user also asked to preserve the remaining ideas from the original spec as reference material, rather than losing that research.

This plan therefore captures a cockpit-only v1 and intentionally defers the agent-manager architecture. It also adopts a simpler v1 launch contract after review: keep Zellij config repo-managed, but do not require global Dotbot-linked Zellij config for first launch. Instead, `zproj` should launch the repo-owned layout explicitly so v1 remains self-contained, lower-risk, and easier to validate from the existing install flow. That keeps the implementation aligned with the repo's current Windows install flow and avoids blocking on Zellij PTY/session-switching limitations.

## Constraints

- Platform: detected project host is macOS (`Darwin`), but the planned feature targets **Windows PowerShell 7** behavior and Windows install flow.
- Shell: repository runtime here is bash for execution; target shell for the feature is **PowerShell 7 (`pwsh`)**.
- Repo install flow must remain centered on `install.ps1` + WinGet DSC YAML; no parallel installer path.
- Preserve the `id: <id>  # <Display Name>` comment format in WinGet DSC YAML so `install.ps1 -ListPackages` keeps working.
- Keep Pi as an npm-installed package after Node.js is present; do not model Pi as a WinGet package.
- Zellij config should be repo-managed under the repo; v1 should prefer an explicit launch path from `zproj` over a required global Zellij config link.
- V1 must exclude multi-agent orchestration, dynamic roster UI, and Pi session switching in a shared viewport.
- Validation must distinguish file-presence checks from actual Windows runtime checks; a task is not complete if it only passes `rg` checks.
- PowerShell helper commands must handle Windows paths with spaces safely.
- Existing source material in `.specs/zellij_micro_pi_windows_cockpit.md` should remain intact; the new plan should be self-contained.

## Alternatives Considered

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| Keep the original broad spec as the v1 execution plan | Preserves the full vision in one place | Mixes immediate implementation work with unresolved architecture; increases delivery risk | Rejected: too broad for a first executable plan |
| Ship a trimmed cockpit-only v1 and preserve the rest as deferred notes | Fastest path to a usable daily-driver setup; clean scope boundary; keeps future ideas | Requires explicit deferral of attractive multi-agent features | **Selected** |
| Reframe v1 around multi-agent orchestration first | Aligns with the most novel part of the concept | Depends on unresolved Zellij/PTTY/session management and likely additional tooling | Rejected: wrong risk profile for first delivery |

## Objective

Produce a repo-managed, Windows-native terminal cockpit v1 that lets a user fuzzy-pick a project or worktree, launch a Zellij layout, browse with Yazi, edit with Micro, search with fzf/fd/rg/bat helpers, and run one interactive Pi session in a dedicated pane.

## Project Context

- **Language**: shell + PowerShell + Python-backed test/lint tooling (`pyproject.toml` present)
- **Test command**: `make test-quick`
- **Lint command**: `make lint`

## Task Breakdown

| # | Task | Files | Type | Model | Agent | Depends On |
|---|------|-------|------|-------|-------|------------|
| T1 | Add Windows cockpit packages to WinGet DSC config | 1 | mechanical | small | shell-config-specialist | — |
| T2 | Add PowerShell cockpit helper functions, tool readiness checks, and explicit `zproj` launch contract | 1 | feature | medium | powershell-specialist | — |
| T3 | Add repo-managed Zellij config and dev layout | 2 | feature | medium | terminal-workflow-builder | — |
| V1 | Validate wave 1 | — | validation | medium | validation-lead | T1, T2, T3 |
| T4 | Polish pane/help text and first-run guidance for cockpit-only v1 | 1 | feature | small | ux-researcher | V1 |
| V2 | Validate wave 2 | — | validation | medium | validation-lead | T4 |

## Execution Waves

### Wave 1 (parallel)

**T1: Add Windows cockpit packages to WinGet DSC config** [small] — shell-config-specialist
- Description: Update `winget/configuration/core.dsc.yaml` to include the cockpit tools that are not already present: Zellij, Micro, and Yazi. Preserve YAML/comment conventions used by `install.ps1 -ListPackages`.
- Files: `winget/configuration/core.dsc.yaml`
- Acceptance Criteria:
  1. [ ] The DSC YAML includes `Zellij.Zellij`, `zyedidia.micro`, and `sxyazi.yazi` entries with the repo's established comment format.
     - Verify: `rg -n "Zellij.Zellij|zyedidia.micro|sxyazi.yazi" winget/configuration/core.dsc.yaml`
     - Pass: all three package IDs appear exactly once in the expected section
     - Fail: any package is missing, duplicated, or lacks the `id: <id>  # <Display Name>` format; fix the YAML before continuing

**T2: Add PowerShell cockpit helper functions, tool readiness checks, and explicit `zproj` launch contract** [medium] — powershell-specialist
- Description: Extend `powershell/profile.ps1` (or a repo-owned sourced module if the profile already uses one) with the v1 cockpit helpers: environment variables, Yazi cwd wrapper, fuzzy file/project helpers, and a `zproj` launcher that explicitly launches the repo-owned Zellij layout/config rather than depending on a pre-linked global Zellij config. Include clear Pi/tool readiness behavior so the launch contract is self-contained.
- Files: `powershell/profile.ps1` (and only a sourced module if needed)
- Acceptance Criteria:
  1. [ ] The profile defines `y`, `yf`, `ff`, `cproj`, and `zproj` using PowerShell 7-compatible syntax.
     - Verify: `rg -n "function y\b|function yf\b|function ff\b|function cproj\b|function zproj\b" powershell/profile.ps1`
     - Pass: all five functions are present
     - Fail: any helper is missing or malformed; update the profile and re-check
  2. [ ] The profile sets editor/fzf defaults and conditionally sets `YAZI_FILE_ONE` for Git for Windows `file.exe`.
     - Verify: `rg -n "EDITOR|FZF_DEFAULT_COMMAND|FZF_CTRL_T_COMMAND|FZF_ALT_C_COMMAND|YAZI_FILE_ONE" powershell/profile.ps1`
     - Pass: all required environment setup lines are present
     - Fail: missing environment setup or unguarded Windows-specific path logic; correct the profile block
  3. [ ] `zproj` encodes the v1 launch contract explicitly and does not rely on an ambient Zellij config link.
     - Verify: `rg -n "zellij .*layout|config/zellij|layouts/dev\.kdl|ZELLIJ" powershell/profile.ps1`
     - Pass: the launcher clearly references the repo-owned layout/config path or an equivalent explicit launch mechanism
     - Fail: `zproj` still assumes a pre-linked global Zellij config without documenting or enforcing it; fix the launcher
  4. [ ] The profile includes readiness/diagnostic behavior for external tools and Pi.
     - Verify: `rg -n "Get-Command .*zellij|Get-Command .*micro|Get-Command .*yazi|Get-Command .*pi|Pi not found|npm install -g @mariozechner/pi-coding-agent" powershell/profile.ps1`
     - Pass: the profile or launcher explicitly checks or surfaces required tool availability, including Pi install guidance
     - Fail: the launch path assumes tools exist without diagnostics; add readiness checks
  5. [ ] The helper flow is robust to Windows paths with spaces.
     - Verify: `pwsh -NoProfile -Command "Set-StrictMode -Version Latest; . ./powershell/profile.ps1; 'loaded'"`
     - Pass: the profile loads without syntax/runtime errors in PowerShell
     - Fail: profile load errors, quoting issues, or command-definition failures; fix before continuing

**T3: Add repo-managed Zellij config and dev layout** [medium] — terminal-workflow-builder
- Description: Add a minimal Zellij config tree under the repo with a Windows-friendly `config.kdl` and a `layouts/dev.kdl` file implementing the v1 four-pane cockpit: Yazi, Micro, one Pi terminal, and a static help pane. The layout must match the explicit launch contract used by `zproj`.
- Files: `config/zellij/config.kdl`, `config/zellij/layouts/dev.kdl`
- Acceptance Criteria:
  1. [ ] The config file sets only the minimal documented defaults needed for the cockpit.
     - Verify: `rg -n "default_shell|default_mode|pane_frames|simplified_ui" config/zellij/config.kdl`
     - Pass: the expected settings are present and there are no obviously speculative extras
     - Fail: required settings are missing or unnecessary unsupported keys are added; simplify the file
  2. [ ] The `dev.kdl` layout launches Yazi, Micro, Pi, and a static right-side pane using `pwsh.exe` commands.
     - Verify: `rg -n "Yazi|Micro|Pi|Agents|pwsh\.exe|focus=true" config/zellij/layouts/dev.kdl`
     - Pass: the layout contains all four panes, uses `pwsh.exe` commands/args, and clearly sets the intended initial focus behavior
     - Fail: pane layout is incomplete, commands are missing, or initial focus behavior is undefined; revise the layout
  3. [ ] The pane text is explicit that v1 has one active Pi pane and no dynamic agent switching.
     - Verify: `rg -n "static|single Pi|v1|Ctrl\+g|not found|no dynamic" config/zellij/layouts/dev.kdl`
     - Pass: the right-side/help text accurately describes the v1 scope and first-run behavior
     - Fail: pane text implies deferred multi-agent behavior is implemented; rewrite the text

### Wave 1 — Validation Gate

**V1: Validate wave 1** [medium] — validation-lead
- Blocked by: T1, T2, T3
- Checks:
  1. Run acceptance criteria for T1, T2, and T3
  2. `make test-quick` — all targeted tests pass
  3. `make lint` — no new warnings or lint failures introduced
  4. `pwsh -NoProfile -Command "Set-StrictMode -Version Latest; . ./powershell/profile.ps1; Get-Command y,yf,ff,cproj,zproj | Select-Object Name"` — helper functions load successfully
  5. Cross-task integration: confirm helper names, explicit launch mechanism, layout name (`dev`), and binary names (`zellij`, `micro`, `yazi`, `pi`) are consistent with each other and with the install assumptions
  6. Manual runtime note: if a Windows environment is available, perform one real launch from a fresh PowerShell 7 session and record whether `zproj` reaches the four-pane cockpit; if Windows runtime is not available, leave this as an explicit follow-up validation requirement rather than treating grep checks as equivalent
- On failure: create a fix task, re-validate after fix

### Wave 2

**T4: Polish pane/help text and first-run guidance for cockpit-only v1** [small] — ux-researcher
- Blocked by: V1
- Description: Tighten the user-facing pane/help text and first-run guidance so the cockpit does not imply dynamic agent behavior, clearly explains `Ctrl+g`, and tells the user what to do when tools or Pi are missing. This task is intentionally limited to UX clarity and does not add Dotbot-linked global Zellij config in v1.
- Files: `config/zellij/layouts/dev.kdl` (and `powershell/profile.ps1` only if a short first-run guidance comment/help line is needed)
- Acceptance Criteria:
  1. [ ] The pane/help text reflects cockpit-only v1 scope and documents lock/unlock behavior.
     - Verify: `rg -n "Ctrl\+g|Pi not found|v1|static|single Pi|cockpit|no dynamic" config/zellij/layouts/dev.kdl`
     - Pass: the help text explains `Ctrl+g`, Pi installation fallback, and static roster limitations without implying dynamic agent management
     - Fail: text is misleading or still references deferred architecture as if implemented; revise the pane text
  2. [ ] First-run guidance makes the shell/session expectations explicit.
     - Verify: `rg -n "new PowerShell|PowerShell 7|PATH|install Pi|npm install -g @mariozechner/pi-coding-agent" config/zellij/layouts/dev.kdl powershell/profile.ps1`
     - Pass: the user can infer the required shell and next steps when tools are missing or a new session is required
     - Fail: first-run expectations remain implicit; add concise guidance

### Wave 2 — Validation Gate

**V2: Validate wave 2** [medium] — validation-lead
- Blocked by: T4
- Checks:
  1. Run acceptance criteria for T4
  2. `make test-quick` — all targeted tests pass
  3. `make lint` — no new warnings or lint failures introduced
  4. Cross-task integration: verify the install flow, profile helpers, and Zellij layout now form one coherent v1 story from package install to new PowerShell session to `zproj`
  5. Manual runtime note: if Windows runtime is available, verify first-run usability from a fresh PowerShell 7 session, including tool discovery, `Ctrl+g` understanding, and the static nature of the right pane
- On failure: create a fix task, re-validate after fix

## Dependency Graph

```text
Wave 1: T1, T2, T3 (parallel) → V1
Wave 2: T4 → V2
```

## Success Criteria

1. [ ] The repo contains a self-consistent Windows cockpit v1 implementation path covering package install, profile helpers, explicit `zproj` launch behavior, and Zellij layout.
   - Verify: `rg -n "Zellij.Zellij|zyedidia.micro|sxyazi.yazi|function zproj|layouts/dev\.kdl|pwsh\.exe|npm install -g @mariozechner/pi-coding-agent" winget/configuration/core.dsc.yaml powershell/profile.ps1 config/zellij/config.kdl config/zellij/layouts/dev.kdl`
   - Pass: all key implementation points are present and consistent, including the explicit launch contract and Pi guidance
2. [ ] PowerShell profile changes are loadable and expose the expected helpers.
   - Verify: `pwsh -NoProfile -Command "Set-StrictMode -Version Latest; . ./powershell/profile.ps1; Get-Command y,yf,ff,cproj,zproj | Select-Object Name"`
   - Pass: PowerShell loads the profile cleanly and reports all helper commands
3. [ ] A Windows user following the repo conventions can perform the documented flow: install packages, install Pi, open a new PowerShell 7 session, run `zproj`, and understand the four-pane cockpit on first launch.
   - Verify: manual runtime validation on Windows when available
   - Pass: the cockpit launches, Micro focus/locking behavior is understandable, and no missing config link or misleading pane assumption remains

## Handoff Notes

- The feature target is Windows, but validation in this session occurs from macOS; use file-level verification and repo tests/lint as partial checks only, and keep at least one explicit Windows runtime validation step in the plan.
- V1 intentionally avoids Dotbot-linked global Zellij config; if a later revision needs that integration, it should be justified by real usage rather than assumed upfront.
- WSL mirroring is out of scope for v1 unless a concrete cross-platform need is established; do not add speculative WSL link plumbing.
- If profile changes break shell startup during implementation, revert the added cockpit block first before broader debugging.
- Preserve `.specs/zellij_micro_pi_windows_cockpit.md` as source research; this plan is the executable subset.
- Deferred material that should not leak back into v1 implementation belongs in the companion `extra-notes.md` file for this slug.
