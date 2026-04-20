---
created: 2026-04-19
status: draft
completed:
---

# Plan: Zellij Windows Cockpit V1

## Context & Motivation

The goal is to turn the broader `zellij_micro_pi_windows_cockpit` concept into a shippable first version for this dotfiles repo. The original spec had a strong overall vision — a Windows-native terminal cockpit built around PowerShell 7, Zellij, Micro, Yazi, fzf/fd/rg/bat, and Pi — but it mixed two very different scopes: a practical single-workspace cockpit that can ship now, and a future multi-agent orchestration system with role selection, persistent sessions, and shared agent state.

During review, the key decision was to trim v1 down to the part that is executable and useful immediately: one project/worktree, one Pi pane, repo-managed installation/configuration, and helper commands that make the layout a daily driver. The user also asked to preserve the remaining ideas from the original spec as reference material, rather than losing that research.

This plan therefore captures a cockpit-only v1 and intentionally defers the agent-manager architecture. That keeps the implementation aligned with the repo's current Windows install flow and avoids blocking on Zellij PTY/session-switching limitations.

## Constraints

- Platform: detected project host is macOS (`Darwin`), but the planned feature targets **Windows PowerShell 7** behavior and Windows install flow.
- Shell: repository runtime here is bash for execution; target shell for the feature is **PowerShell 7 (`pwsh`)**.
- Repo install flow must remain centered on `install.ps1` + WinGet DSC YAML; no parallel installer path.
- Preserve the `id: <id>  # <Display Name>` comment format in WinGet DSC YAML so `install.ps1 -ListPackages` keeps working.
- Keep Pi as an npm-installed package after Node.js is present; do not model Pi as a WinGet package.
- Zellij config should be repo-managed and linked through existing dotfiles mechanisms, not written ad hoc at runtime.
- V1 must exclude multi-agent orchestration, dynamic roster UI, and Pi session switching in a shared viewport.
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
| T2 | Add PowerShell cockpit helper functions and environment setup | 1 | feature | medium | powershell-specialist | — |
| T3 | Add repo-managed Zellij config and dev layout | 2 | feature | medium | terminal-workflow-builder | — |
| V1 | Validate wave 1 | — | validation | medium | validation-lead | T1, T2, T3 |
| T4 | Link Zellij config into dotfiles install flow and document v1 boundaries in pane text | 1-2 | feature | medium | dotbot-config-specialist | V1 |
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

**T2: Add PowerShell cockpit helper functions and environment setup** [medium] — powershell-specialist
- Description: Extend `powershell/profile.ps1` (or a repo-owned sourced module if the profile already uses one) with the v1 cockpit helpers: environment variables, Yazi cwd wrapper, fuzzy file/project helpers, and `zproj` launcher.
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

**T3: Add repo-managed Zellij config and dev layout** [medium] — terminal-workflow-builder
- Description: Add a minimal Zellij config tree under the repo with a Windows-friendly `config.kdl` and a `layouts/dev.kdl` file implementing the v1 four-pane cockpit: Yazi, Micro, one Pi terminal, and a static help pane.
- Files: `config/zellij/config.kdl`, `config/zellij/layouts/dev.kdl`
- Acceptance Criteria:
  1. [ ] The config file sets only the minimal documented defaults needed for the cockpit.
     - Verify: `rg -n "default_shell|default_mode|pane_frames|simplified_ui" config/zellij/config.kdl`
     - Pass: the expected settings are present and there are no obviously speculative extras
     - Fail: required settings are missing or unnecessary unsupported keys are added; simplify the file
  2. [ ] The `dev.kdl` layout launches Yazi, Micro, Pi, and a static right-side pane using `pwsh.exe` commands.
     - Verify: `rg -n "Yazi|Micro|Pi|Agents|pwsh\.exe" config/zellij/layouts/dev.kdl`
     - Pass: the layout contains all four panes and uses `pwsh.exe` commands/args
     - Fail: pane layout is incomplete, commands are missing, or it still encodes deferred multi-agent behavior; revise the layout

### Wave 1 — Validation Gate

**V1: Validate wave 1** [medium] — validation-lead
- Blocked by: T1, T2, T3
- Checks:
  1. Run acceptance criteria for T1, T2, and T3
  2. `make test-quick` — all targeted tests pass
  3. `make lint` — no new warnings or lint failures introduced
  4. Cross-task integration: confirm helper names, layout commands, and install package names are consistent with each other (`zproj` launches layout `dev`; layout expects `pwsh.exe`, `micro`, `yazi`, and `pi` naming used by install/profile assumptions)
- On failure: create a fix task, re-validate after fix

### Wave 2

**T4: Link Zellij config into dotfiles install flow and document v1 boundaries in pane text** [medium] — dotbot-config-specialist
- Blocked by: V1
- Description: Update the relevant Dotbot config so the repo-managed Zellij config is linked into the expected Windows location, and ensure the static right pane text/documentation reflects the trimmed v1 scope rather than promising dynamic agent switching.
- Files: `install.conf.yaml` (and `wsl/install.conf.yaml` only if a mirrored cross-platform link is actually required by repo rules), plus any small pane-text adjustment in `config/zellij/layouts/dev.kdl` if needed
- Acceptance Criteria:
  1. [ ] Dotbot links the repo-managed Zellij config into the Windows config path using existing repo conventions.
     - Verify: `rg -n "Zellij|zellij|config/zellij" install.conf.yaml wsl/install.conf.yaml`
     - Pass: the install config clearly links the Zellij config in the appropriate place, with WSL mirrored only if applicable
     - Fail: no link exists, the target path is inconsistent with the plan, or WSL mirroring rules are violated; fix the install config
  2. [ ] The pane/help text reflects cockpit-only v1 scope and documents lock/unlock behavior.
     - Verify: `rg -n "Ctrl\+g|Pi not found|v1|placeholder|single Pi|cockpit" config/zellij/layouts/dev.kdl`
     - Pass: the help text explains `Ctrl+g`, Pi installation fallback, and static roster limitations without implying dynamic agent management
     - Fail: text is misleading or still references deferred architecture as if implemented; revise the pane text

### Wave 2 — Validation Gate

**V2: Validate wave 2** [medium] — validation-lead
- Blocked by: T4
- Checks:
  1. Run acceptance criteria for T4
  2. `make test-quick` — all targeted tests pass
  3. `make lint` — no new warnings or lint failures introduced
  4. Cross-task integration: verify the install flow, profile helpers, and Zellij layout now form one coherent v1 story from install to `zproj`
- On failure: create a fix task, re-validate after fix

## Dependency Graph

```text
Wave 1: T1, T2, T3 (parallel) → V1
Wave 2: T4 → V2
```

## Success Criteria

1. [ ] The repo contains a self-consistent Windows cockpit v1 implementation path covering install, profile helpers, and Zellij layout.
   - Verify: `rg -n "Zellij.Zellij|zyedidia.micro|sxyazi.yazi|function zproj|layout|pwsh\.exe" winget/configuration/core.dsc.yaml powershell/profile.ps1 config/zellij/config.kdl config/zellij/layouts/dev.kdl install.conf.yaml`
   - Pass: all key implementation points are present and consistent
2. [ ] A Windows user following the repo conventions can perform the documented flow: install packages, install Pi, open a new PowerShell session, run `zproj`, and land in the four-pane cockpit.
   - Verify: manual review against the final file set and pane text
   - Pass: no missing config link, missing helper, or misleading layout assumption remains

## Handoff Notes

- The feature target is Windows, but validation in this session occurs from macOS; prefer file-level verification and repo tests/lint unless a Windows runtime is explicitly available.
- Preserve `.specs/zellij_micro_pi_windows_cockpit.md` as source research; this plan is the executable subset.
- Deferred material that should not leak back into v1 implementation belongs in the companion `extra-notes.md` file for this slug.
