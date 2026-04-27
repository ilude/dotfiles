---
created: 2026-04-19
updated: 2026-04-27
status: draft
completed:
supersedes:
  - .specs/zellij-cockpit-v1-1-ux/plan.md
  - v1.1-amendment.md (same dir, removed)
---

# Plan: Zellij Windows Cockpit

## Context & Motivation

Turn the broader `zellij_micro_pi_windows_cockpit` concept into a shippable Windows-native terminal cockpit for this dotfiles repo. The original spec (`zellij_micro_pi_windows_cockpit.md` in this dir) mixed two scopes: a practical single-workspace cockpit that can ship now, and a future multi-agent orchestration system. The v1 plan trimmed to what is executable: one project/worktree, one Pi pane, repo-managed install/config, and helper commands that make the layout a daily driver.

A separate v1.1 plan was originally drafted to layer Warp-style UX on top after v1 shipped (discoverability, health checks, first-run guidance, easier session re-entry). On 2026-04-27 the two plans were merged because:

- Neither had shipped (both `status: draft`), so there was no migration cost.
- They touched the same files (`powershell/profile.ps1`, `config/zellij/layouts/dev.kdl`).
- v1 T4 (polish pane/help text) overlapped v1.1 T3 (`cockpit-help` text alignment) -- two passes over the same text.
- v1 shipped a basic `zproj`; v1.1 immediately rewrote it as attach-or-create -- wasted motion.

The phase boundaries below preserve the original gating intent: Phase 1 must reach V1 before Phase 2 begins, Phase 2 must reach V2 before Phase 3 begins. This is the same effect as keeping the plans separate, without the duplication.

V1 also adopted a simpler launch contract: keep Zellij config repo-managed, but do not require global Dotbot-linked Zellij config for first launch. `zproj` launches the repo-owned layout explicitly so the cockpit remains self-contained, lower-risk, and easier to validate from the existing install flow.

## Constraints

- Platform: feature target is **Windows PowerShell 7**. Repo runtime here is bash for execution; planning may occur from macOS/Linux but file-level checks are not equivalent to Windows runtime validation.
- Shell: PowerShell 7 (`pwsh`) is the primary UX surface.
- Repo install flow must remain centered on `install.ps1` + WinGet DSC YAML; no parallel installer path.
- Preserve the `id: <id>  # <Display Name>` comment format in WinGet DSC YAML so `install.ps1 -ListPackages` keeps working.
- Keep Pi as an npm-installed package after Node.js is present; do not model Pi as a WinGet package.
- Zellij config is repo-managed under the repo; v1 prefers an explicit launch path from `zproj` over a required global Zellij config link. Dotbot-linked global Zellij config is intentionally out of scope.
- Keep the stack modular: PowerShell = workflow glue, Zellij = layout/session manager, Micro = editor, Yazi = file manager, Pi = agent. Do not introduce a custom TUI app, command-block renderer, or multi-agent runtime.
- Excluded: multi-agent orchestration, dynamic roster UI, Pi session switching in a shared viewport, structured command blocks, persistent activity/event database.
- New commands must degrade clearly when dependencies like `fzf` or `pi` are missing.
- Help/check output must not promise deferred features like dynamic agent switching.
- PowerShell helper commands must handle Windows paths with spaces safely.
- Validation must distinguish file-presence checks from actual Windows runtime checks; a task is not complete if it only passes `rg` checks.
- Existing source material in `zellij_micro_pi_windows_cockpit.md` (research) and `extra-notes.md` (deferred material) stays intact; this plan is the executable subset.

## Alternatives Considered

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| Keep the original broad spec as the v1 execution plan | Preserves the full vision in one place | Mixes immediate implementation with unresolved architecture; high delivery risk | Rejected: too broad |
| Ship a trimmed cockpit-only v1 and preserve the rest as deferred notes | Fastest path to a usable daily-driver setup; clean scope boundary | Requires explicit deferral of attractive multi-agent features | **Selected** for foundation |
| Reframe v1 around multi-agent orchestration first | Aligns with the most novel part of the concept | Depends on unresolved Zellij/PTY/session limits | Rejected: wrong risk profile |
| Keep v1 and v1.1 as separate plans | Clear scope boundary per plan | Same files, same agents, same validators -- pure duplication | Rejected: merged 2026-04-27 |
| Add a thin PowerShell UX layer on top of v1 (`cockpit`, `cockpit-check`, `cockpit-help`, smarter `zproj`) | Improves discoverability and recovery while preserving modular architecture | Adds command-layer complexity to the profile | **Selected** as Phase 2 + Phase 3 |
| Replace the cockpit with a more integrated terminal product | Best out-of-the-box polish | Abandons repo-managed modularity and Pi-centered workflow | Rejected: wrong trade-off |

## Objective

Produce a repo-managed, Windows-native terminal cockpit that lets a user fuzzy-pick a project or worktree, launch a Zellij layout, browse with Yazi, edit with Micro, search with fzf/fd/rg/bat helpers, and run one interactive Pi session in a dedicated pane. Add a workflow layer that makes the cockpit discoverable, diagnosable, and easy to re-enter without memorizing helper names.

## Project Context

- **Language**: shell + PowerShell + Python-backed test/lint tooling (`pyproject.toml` present)
- **Test command**: `make test-quick`
- **Lint command**: `make lint`

## Task Breakdown

| # | Task | Files | Type | Model | Agent | Depends On |
|---|------|-------|------|-------|-------|------------|
| T1 | Add Windows cockpit packages to WinGet DSC config | 1 | mechanical | small | shell-config-specialist | -- |
| T2 | Add PowerShell cockpit helper functions, tool readiness checks, and explicit `zproj` launch contract | 1 | feature | medium | powershell-specialist | -- |
| T3 | Add repo-managed Zellij config and dev layout | 2 | feature | medium | terminal-workflow-builder | -- |
| V1 | Validate Phase 1 (foundation) | -- | validation | medium | validation-lead | T1, T2, T3 |
| T4 | Add `cockpit` action menu and shared dispatch helpers | 1 | feature | medium | powershell-specialist | V1 |
| T5 | Add `cockpit-check` health checks with actionable remediation output | 1 | feature | medium | powershell-specialist | V1 |
| T6 | Add `cockpit-help`, align pane/help text, and first-run guidance with actual cockpit behavior | 1-2 | feature | small | ux-researcher | V1 |
| V2 | Validate Phase 2 (UX layer) | -- | validation | medium | validation-lead | T4, T5, T6 |
| T7 | Upgrade `zproj` to deterministic attach-or-create session behavior | 1 | feature | medium | terminal-workflow-builder | V2 |
| V3 | Validate Phase 3 (session re-entry) | -- | validation | medium | validation-lead | T7 |

## Execution Phases

### Phase 1: Foundation -- Wave 1 (parallel)

**T1: Add Windows cockpit packages to WinGet DSC config** [small] -- shell-config-specialist
- Description: Update `winget/configuration/core.dsc.yaml` to include the cockpit tools that are not already present: Zellij, Micro, and Yazi. Preserve YAML/comment conventions used by `install.ps1 -ListPackages`.
- Files: `winget/configuration/core.dsc.yaml`
- Acceptance Criteria:
  1. [ ] The DSC YAML includes `Zellij.Zellij`, `zyedidia.micro`, and `sxyazi.yazi` entries with the repo's established comment format.
     - Verify: `rg -n "Zellij.Zellij|zyedidia.micro|sxyazi.yazi" winget/configuration/core.dsc.yaml`
     - Pass: all three package IDs appear exactly once in the expected section
     - Fail: any package is missing, duplicated, or lacks the `id: <id>  # <Display Name>` format

**T2: Add PowerShell cockpit helper functions, tool readiness checks, and explicit `zproj` launch contract** [medium] -- powershell-specialist
- Description: Extend `powershell/profile.ps1` (or a repo-owned sourced module if the profile already uses one) with the cockpit helpers: environment variables, Yazi cwd wrapper, fuzzy file/project helpers, and a `zproj` launcher that explicitly launches the repo-owned Zellij layout/config rather than depending on a pre-linked global Zellij config. Phase 1 `zproj` is a basic create-only launcher; Phase 3 (T7) upgrades it to attach-or-create. Include clear Pi/tool readiness behavior so the launch contract is self-contained.
- Files: `powershell/profile.ps1` (and only a sourced module if needed)
- Acceptance Criteria:
  1. [ ] The profile defines `y`, `yf`, `ff`, `cproj`, and `zproj` using PowerShell 7-compatible syntax.
     - Verify: `rg -n "function y\b|function yf\b|function ff\b|function cproj\b|function zproj\b" powershell/profile.ps1`
     - Pass: all five functions are present
     - Fail: any helper is missing or malformed
  2. [ ] The profile sets editor/fzf defaults and conditionally sets `YAZI_FILE_ONE` for Git for Windows `file.exe`.
     - Verify: `rg -n "EDITOR|FZF_DEFAULT_COMMAND|FZF_CTRL_T_COMMAND|FZF_ALT_C_COMMAND|YAZI_FILE_ONE" powershell/profile.ps1`
     - Pass: all required environment setup lines are present
     - Fail: missing environment setup or unguarded Windows-specific path logic
  3. [ ] `zproj` encodes the launch contract explicitly and does not rely on an ambient Zellij config link.
     - Verify: `rg -n "zellij .*layout|config/zellij|layouts/dev\.kdl|ZELLIJ" powershell/profile.ps1`
     - Pass: launcher clearly references the repo-owned layout/config path or an equivalent explicit launch mechanism
     - Fail: `zproj` still assumes a pre-linked global Zellij config without documenting or enforcing it
  4. [ ] The profile includes readiness/diagnostic behavior for external tools and Pi.
     - Verify: `rg -n "Get-Command .*zellij|Get-Command .*micro|Get-Command .*yazi|Get-Command .*pi|Pi not found|npm install -g @mariozechner/pi-coding-agent" powershell/profile.ps1`
     - Pass: profile or launcher explicitly checks or surfaces required tool availability, including Pi install guidance
     - Fail: launch path assumes tools exist without diagnostics
  5. [ ] The helper flow is robust to Windows paths with spaces.
     - Verify: `pwsh -NoProfile -Command "Set-StrictMode -Version Latest; . ./powershell/profile.ps1; 'loaded'"`
     - Pass: profile loads without syntax/runtime errors in PowerShell
     - Fail: profile load errors, quoting issues, or command-definition failures

**T3: Add repo-managed Zellij config and dev layout** [medium] -- terminal-workflow-builder
- Description: Add a minimal Zellij config tree under the repo with a Windows-friendly `config.kdl` and a `layouts/dev.kdl` file implementing the four-pane cockpit: Yazi, Micro, one Pi terminal, and a static help pane. The layout must match the explicit launch contract used by `zproj`. Initial pane text can be sparse; final wording is finalized in Phase 2 T6 alongside `cockpit-help`.
- Files: `config/zellij/config.kdl`, `config/zellij/layouts/dev.kdl`
- Acceptance Criteria:
  1. [ ] The config file sets only the minimal documented defaults needed for the cockpit.
     - Verify: `rg -n "default_shell|default_mode|pane_frames|simplified_ui" config/zellij/config.kdl`
     - Pass: the expected settings are present and there are no obviously speculative extras
     - Fail: required settings are missing or unnecessary unsupported keys are added
  2. [ ] The `dev.kdl` layout launches Yazi, Micro, Pi, and a static right-side pane using `pwsh.exe` commands.
     - Verify: `rg -n "Yazi|Micro|Pi|Agents|pwsh\.exe|focus=true" config/zellij/layouts/dev.kdl`
     - Pass: the layout contains all four panes, uses `pwsh.exe` commands/args, and clearly sets the intended initial focus behavior
     - Fail: pane layout is incomplete, commands are missing, or initial focus behavior is undefined
  3. [ ] The pane text is explicit that the cockpit has one active Pi pane and no dynamic agent switching.
     - Verify: `rg -n "static|single Pi|Ctrl\+g|not found|no dynamic" config/zellij/layouts/dev.kdl`
     - Pass: the right-side/help text accurately describes the scope and first-run behavior
     - Fail: pane text implies deferred multi-agent behavior is implemented

### Phase 1 -- Validation Gate

**V1: Validate Phase 1** [medium] -- validation-lead
- Blocked by: T1, T2, T3
- Checks:
  1. Run acceptance criteria for T1, T2, and T3
  2. `make test-quick` -- all targeted tests pass
  3. `make lint` -- no new warnings or lint failures
  4. `pwsh -NoProfile -Command "Set-StrictMode -Version Latest; . ./powershell/profile.ps1; Get-Command y,yf,ff,cproj,zproj | Select-Object Name"` -- helper functions load successfully
  5. Cross-task integration: confirm helper names, explicit launch mechanism, layout name (`dev`), and binary names (`zellij`, `micro`, `yazi`, `pi`) are consistent with each other and with the install assumptions
  6. Manual runtime note: if a Windows environment is available, perform one real launch from a fresh PowerShell 7 session and record whether `zproj` reaches the four-pane cockpit; if Windows runtime is not available, leave this as an explicit follow-up validation requirement rather than treating grep checks as equivalent
- On failure: create a fix task, re-validate after fix

### Phase 2: UX Layer -- Wave 2 (parallel)

**T4: Add `cockpit` action menu and shared dispatch helpers** [medium] -- powershell-specialist
- Blocked by: V1
- Description: Add a discoverable command menu, likely using `fzf`, that exposes the primary cockpit actions without requiring the user to memorize helper names. Suggested actions: open cockpit for project, reattach/open cockpit here, open Yazi here, open file in Micro, launch Pi here, show help, run health check, show recent projects.
- Files: `powershell/profile.ps1` or a sourced repo-owned PowerShell module
- Acceptance Criteria:
  1. [ ] `cockpit` is defined and launches a menu of at least 5 useful actions.
     - Verify: `pwsh -NoProfile -Command ". ./powershell/profile.ps1; Get-Command cockpit | Select-Object Name"`
     - Pass: `cockpit` is defined and callable
     - Fail: command missing or profile fails to load
  2. [ ] The menu includes direct access to `zproj`, `y`, `ff`, `cockpit-help`, and `cockpit-check`.
     - Verify: `rg -n "cockpit-help|cockpit-check|zproj|ff|\by\b" powershell/profile.ps1`
     - Pass: menu dispatch clearly includes the required actions
     - Fail: action menu is incomplete or references undefined commands
  3. [ ] The command degrades clearly when `fzf` is missing.
     - Verify: `pwsh -NoProfile -Command ". ./powershell/profile.ps1; if (Get-Command cockpit -ErrorAction SilentlyContinue) { 'ok' }"`
     - Pass: logic includes readable fallback guidance instead of silent failure
     - Fail: menu assumes `fzf` exists with no user guidance

**T5: Add `cockpit-check` health checks with actionable remediation output** [medium] -- powershell-specialist
- Blocked by: V1
- Description: Add a toolchain and environment health check for the cockpit with readable OK/missing output and concrete fix hints. Should validate at least: PowerShell 7 session, `zellij`, `micro`, `yazi`, `pi`, `fzf`, `fd`, `rg`, `bat`, and the expected repo-owned layout path.
- Files: `powershell/profile.ps1` or a sourced repo-owned PowerShell module
- Acceptance Criteria:
  1. [ ] `cockpit-check` exists and validates required binaries plus key environment assumptions.
     - Verify: `pwsh -NoProfile -Command ". ./powershell/profile.ps1; Get-Command cockpit-check | Select-Object Name"`
     - Pass: `cockpit-check` is available after loading the profile
     - Fail: command missing or profile fails to load
  2. [ ] Missing tools produce specific remediation steps.
     - Verify: `rg -n "npm install -g @mariozechner/pi-coding-agent|winget|missing|not found|PowerShell 7" powershell/profile.ps1`
     - Pass: output logic includes concrete fixes for at least Pi and missing core tools
     - Fail: health check reports missing state without remediation guidance
  3. [ ] The health check covers the repo-owned layout/config path expected by `zproj`.
     - Verify: `rg -n "config/zellij|layouts/dev\.kdl" powershell/profile.ps1`
     - Pass: expected repo launch assets are validated explicitly
     - Fail: health check ignores the layout/config assets required by the cockpit

**T6: Add `cockpit-help`, align pane/help text, and first-run guidance with actual cockpit behavior** [small] -- ux-researcher
- Blocked by: V1
- Description: Add a concise `cockpit-help` command and align the supporting pane text in `dev.kdl` so the cockpit accurately explains pane roles, `Ctrl+g` lock/unlock behavior, shell/session expectations, what to do when Pi is missing, and current cockpit limitations. This task absorbs the original v1 T4 (pane/help polish) and v1.1 T3 (cockpit-help) into a single source of truth so help command text and pane text cannot drift apart.
- Files: `powershell/profile.ps1`, `config/zellij/layouts/dev.kdl`
- Acceptance Criteria:
  1. [ ] `cockpit-help` explains pane roles, `Ctrl+g`, shell expectations, missing-Pi behavior, and current limitations.
     - Verify: `rg -n "Ctrl\+g|PowerShell 7|static|single Pi|Pi|Yazi|Micro|Zellij|cockpit|no dynamic" powershell/profile.ps1 config/zellij/layouts/dev.kdl`
     - Pass: help text covers first-run behavior and limits clearly across both files
     - Fail: key workflow behavior still depends on tribal knowledge
  2. [ ] Pane text in `dev.kdl` matches the help-command claims (no drift).
     - Verify: manual review of `dev.kdl` pane text against `cockpit-help` output
     - Pass: pane text and help-command text describe the same scope and limitations
     - Fail: pane text promises features `cockpit-help` does not explain, or vice versa
  3. [ ] First-run guidance makes shell/session expectations explicit.
     - Verify: `rg -n "new PowerShell|PowerShell 7|PATH|install Pi|npm install -g @mariozechner/pi-coding-agent" config/zellij/layouts/dev.kdl powershell/profile.ps1`
     - Pass: the user can infer the required shell and next steps when tools are missing or a new session is required
     - Fail: first-run expectations remain implicit
  4. [ ] Help text is consistent with actual cockpit implementation.
     - Verify: manual review against Phase 1 deliverables
     - Pass: help does not promise features the cockpit does not implement
     - Fail: help text drifts into deferred concepts like dynamic agent switching

### Phase 2 -- Validation Gate

**V2: Validate Phase 2** [medium] -- validation-lead
- Blocked by: T4, T5, T6
- Checks:
  1. Run acceptance criteria for T4, T5, and T6
  2. `make test-quick` -- all targeted tests pass
  3. `make lint` -- no new warnings or lint failures
  4. `pwsh -NoProfile -Command ". ./powershell/profile.ps1; Get-Command cockpit,cockpit-check,cockpit-help,zproj | Select-Object Name"` -- all workflow commands load successfully
  5. Cross-task integration: confirm `cockpit` only exposes commands that actually exist, `cockpit-help` matches Phase 1 implementation, and `cockpit-check` covers the same tool/layout contract used by `zproj`
  6. Manual runtime note: if Windows runtime is available, verify first-run usability from a fresh PowerShell 7 session, including tool discovery, `Ctrl+g` understanding, and the static nature of the right pane
- On failure: create a fix task, re-validate after fix

### Phase 3: Session Re-entry -- Wave 3

**T7: Upgrade `zproj` to deterministic attach-or-create session behavior** [medium] -- terminal-workflow-builder
- Blocked by: V2
- Description: Improve `zproj` so it attaches to an existing Zellij session for the selected project when present, otherwise creates a new one using the Phase 1 launch contract. Desired flow: pick project/worktree -> derive deterministic session name -> if session exists, attach -> else create session with `dev` layout.
- Files: `powershell/profile.ps1`
- Acceptance Criteria:
  1. [ ] `zproj` checks for an existing Zellij session before creating a new one.
     - Verify: `rg -n "attach|session|list-sessions|zellij" powershell/profile.ps1`
     - Pass: logic clearly distinguishes attach vs create
     - Fail: command always creates a new session or leaves session behavior ambiguous
  2. [ ] Session naming remains deterministic for the same project/worktree.
     - Verify: inspect naming logic in `zproj`
     - Pass: identical project selection resolves to the same normalized session name
     - Fail: session names drift across launches
  3. [ ] New sessions still use the repo-owned dev layout from Phase 1.
     - Verify: `rg -n "layouts/dev\.kdl|--layout dev|config/zellij" powershell/profile.ps1`
     - Pass: create flow preserves the original cockpit launch contract
     - Fail: session resume logic breaks the cockpit launch behavior

### Phase 3 -- Validation Gate

**V3: Validate Phase 3** [medium] -- validation-lead
- Blocked by: T7
- Checks:
  1. Run acceptance criteria for T7
  2. `make test-quick` -- all targeted tests pass
  3. `make lint` -- no new warnings or lint failures
  4. `pwsh -NoProfile -Command ". ./powershell/profile.ps1; Get-Command cockpit,cockpit-check,cockpit-help,zproj | Select-Object Name"` -- workflow commands still load after `zproj` changes
  5. Cross-task integration: verify attach-or-create behavior does not break the health-check/help assumptions or the original Phase 1 launch contract
  6. Manual runtime note: if a Windows environment is available, validate that re-running `zproj` for the same project reattaches cleanly and that missing-tool guidance remains understandable
- On failure: create a fix task, re-validate after fix

## Dependency Graph

```text
Phase 1: T1, T2, T3 (parallel) -> V1
Phase 2: T4, T5, T6 (parallel) -> V2
Phase 3: T7 -> V3
```

## Success Criteria

1. [ ] The repo contains a self-consistent Windows cockpit implementation path covering package install, profile helpers, explicit `zproj` launch behavior, and Zellij layout.
   - Verify: `rg -n "Zellij.Zellij|zyedidia.micro|sxyazi.yazi|function zproj|layouts/dev\.kdl|pwsh\.exe|npm install -g @mariozechner/pi-coding-agent" winget/configuration/core.dsc.yaml powershell/profile.ps1 config/zellij/config.kdl config/zellij/layouts/dev.kdl`
   - Pass: all key implementation points are present and consistent, including the explicit launch contract and Pi guidance
2. [ ] PowerShell profile changes are loadable and expose the expected helpers.
   - Verify: `pwsh -NoProfile -Command "Set-StrictMode -Version Latest; . ./powershell/profile.ps1; Get-Command y,yf,ff,cproj,zproj,cockpit,cockpit-check,cockpit-help | Select-Object Name"`
   - Pass: PowerShell loads the profile cleanly and reports all helper commands
3. [ ] A Windows user following the repo conventions can perform the documented flow: install packages, install Pi, open a new PowerShell 7 session, run `zproj`, and understand the four-pane cockpit on first launch.
   - Verify: manual runtime validation on Windows when available
   - Pass: cockpit launches, Micro focus/locking behavior is understandable, no missing config link or misleading pane assumption remains
4. [ ] Users can discover core cockpit actions without memorizing helper names.
   - Verify: `pwsh -NoProfile -Command ". ./powershell/profile.ps1; Get-Command cockpit,cockpit-help,cockpit-check | Select-Object Name"`
   - Pass: all discovery and support commands are available
5. [ ] Missing tools produce clear remediation steps instead of confusing failures.
   - Verify: manual review of `cockpit-check` output logic and fallback text in profile
   - Pass: at least Pi and missing core tools have concrete fixes
6. [ ] Re-entering an existing cockpit session is easier and deterministic.
   - Verify: inspect and, when Windows runtime is available, manually exercise the `zproj` attach-or-create flow
   - Pass: repeated selection of the same project resolves to consistent session behavior
7. [ ] The workflow layer improves usability without replacing the modular cockpit architecture.
   - Verify: manual review against Phase 1 deliverables and command implementations
   - Pass: Phase 2/3 commands wrap and explain the existing stack rather than introducing a new monolithic runtime

## Handoff Notes

- The feature target is Windows; validation in this session may occur from macOS/Linux. Use file-level verification and repo tests/lint as partial checks only, and keep at least one explicit Windows runtime validation step per phase.
- Phase 1 intentionally avoids Dotbot-linked global Zellij config; if a later revision needs that integration, it should be justified by real usage rather than assumed upfront.
- WSL mirroring is out of scope for this plan unless a concrete cross-platform need is established; do not add speculative WSL link plumbing.
- If profile changes break shell startup during implementation, revert the added cockpit block first before broader debugging.
- If command growth makes `powershell/profile.ps1` unwieldy, move the workflow layer into a sourced repo-owned PowerShell module rather than creating ad hoc external files.
- Preserve `zellij_micro_pi_windows_cockpit.md` (in this dir) as source research; this plan is the executable subset.
- Deferred material that should not leak back into implementation belongs in `extra-notes.md` (in this dir).
- The original `v1.1-amendment.md` (in this dir) and `.specs/zellij-cockpit-v1-1-ux/plan.md` were merged into this plan on 2026-04-27. Both are removed/archived; do not resurrect them.

## Notes on Effort vs Value

### Highest value, lowest risk
- `cockpit-check` (T5)
- `cockpit-help` + pane text alignment (T6)
- smarter `zproj` (T7)

### Highest UX improvement
- `cockpit` action menu (T4)

### Things to avoid
- Custom TUI app
- Persistent state store unless the simple workflow layer proves insufficient
- Help/dashboard text drifting into future multi-agent semantics
