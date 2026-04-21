---
created: 2026-04-19
status: draft
completed:
---

# Plan: Zellij Cockpit V1.1 UX Layer

## Context & Motivation

The v1 cockpit plan establishes a Windows-native terminal workspace built from PowerShell 7, Zellij, Micro, Yazi, fzf/fd/rg/bat, and one Pi pane. That achieves the architecture goal, but it still lacks several UX advantages associated with more productized terminals like Warp: discoverability, first-run guidance, health checks, and easier session re-entry.

Rather than replacing the modular stack, this v1.1 plan adds a thin workflow layer on top of it. The idea is to keep the repo-managed, composable architecture while improving daily-driver usability through PowerShell commands that make the cockpit easier to discover, diagnose, and resume.

This plan intentionally builds on `.specs/zellij-windows-cockpit-v1/plan.md` and assumes the v1 cockpit exists first.

## Constraints

- Platform: feature target is Windows PowerShell 7 behavior, even if planning/review occurs from macOS.
- Shell: PowerShell 7 (`pwsh`) is the primary UX surface for this layer.
- Must build on the existing v1 cockpit plan, not replace it.
- Keep the stack modular: PowerShell = workflow glue, Zellij = layout/session manager, Micro = editor, Yazi = file manager, Pi = agent.
- Do not introduce a custom TUI app, command-block renderer, or multi-agent runtime in v1.1.
- New commands must degrade clearly when dependencies like `fzf` or `pi` are missing.
- Help/check output must not promise deferred features like dynamic agent switching.
- Verification must include PowerShell loadability and command availability, not just source-text checks.

## Alternatives Considered

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| Keep only the v1 cockpit and rely on helper memorization | Lowest implementation effort | Poor discoverability, weaker first-run UX, more hidden assumptions | Rejected: usability gap remains too large |
| Add a thin PowerShell UX layer (`cockpit`, `cockpit-check`, `cockpit-help`, smarter `zproj`) | Improves discoverability and recovery while preserving modular architecture | Adds some command-layer complexity to the profile | **Selected** |
| Replace the cockpit with a more integrated terminal product | Best out-of-the-box polish | Abandons repo-managed modularity and Pi-centered workflow control | Rejected: wrong trade-off for this repo |

## Objective

Add a lightweight UX layer to the v1 cockpit so users can discover core actions without memorizing helper names, diagnose missing tools quickly, understand first-run behavior, and re-enter existing project sessions more easily.

## Project Context

- **Language**: shell + PowerShell + Python-backed test/lint tooling
- **Test command**: `make test-quick`
- **Lint command**: `make lint`

## Task Breakdown

| # | Task | Files | Type | Model | Agent | Depends On |
|---|------|-------|------|-------|-------|------------|
| T1 | Add `cockpit` action menu and shared dispatch helpers | 1 | feature | medium | powershell-specialist | — |
| T2 | Add `cockpit-check` health checks with actionable remediation output | 1 | feature | medium | powershell-specialist | — |
| T3 | Add `cockpit-help` and align first-run guidance with actual v1 behavior | 1-2 | feature | small | ux-researcher | — |
| V1 | Validate wave 1 | — | validation | medium | validation-lead | T1, T2, T3 |
| T4 | Upgrade `zproj` to deterministic attach-or-create session behavior | 1 | feature | medium | terminal-workflow-builder | V1 |
| V2 | Validate wave 2 | — | validation | medium | validation-lead | T4 |

## Execution Waves

### Wave 1 (parallel)

**T1: Add `cockpit` action menu and shared dispatch helpers** [medium] — powershell-specialist
- Description: Add a discoverable command menu, likely using `fzf`, that exposes the primary cockpit actions without requiring the user to memorize helper names.
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

**T2: Add `cockpit-check` health checks with actionable remediation output** [medium] — powershell-specialist
- Description: Add a toolchain and environment health check for the cockpit with readable OK/missing output and concrete fix hints.
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
     - Fail: health check ignores the layout/config assets required by v1

**T3: Add `cockpit-help` and align first-run guidance with actual v1 behavior** [small] — ux-researcher
- Description: Add a concise help command and any supporting text needed to explain pane roles, `Ctrl+g`, shell expectations, missing Pi behavior, and current v1 limitations.
- Files: `powershell/profile.ps1`, optionally `config/zellij/layouts/dev.kdl`
- Acceptance Criteria:
  1. [ ] `cockpit-help` explains pane roles, `Ctrl+g`, shell expectations, and current v1 limitations.
     - Verify: `rg -n "Ctrl\+g|PowerShell 7|v1|static|Pi|Yazi|Micro|Zellij" powershell/profile.ps1 config/zellij/layouts/dev.kdl`
     - Pass: help text covers first-run behavior and limits clearly
     - Fail: key workflow behavior still depends on tribal knowledge
  2. [ ] Help text is consistent with the actual v1 implementation.
     - Verify: manual review against `.specs/zellij-windows-cockpit-v1/plan.md`
     - Pass: help does not promise features the cockpit does not implement
     - Fail: help text drifts into deferred concepts like dynamic agent switching

### Wave 1 — Validation Gate

**V1: Validate wave 1** [medium] — validation-lead
- Blocked by: T1, T2, T3
- Checks:
  1. Run acceptance criteria for T1, T2, and T3
  2. `make test-quick` — all targeted tests pass
  3. `make lint` — no new warnings or lint failures introduced
  4. `pwsh -NoProfile -Command ". ./powershell/profile.ps1; Get-Command cockpit,cockpit-check,cockpit-help,zproj | Select-Object Name"` — all workflow commands load successfully
  5. Cross-task integration: confirm `cockpit` only exposes commands that actually exist, `cockpit-help` matches current v1 behavior, and `cockpit-check` covers the same tool/layout contract used by `zproj`
- On failure: create a fix task, re-validate after fix

### Wave 2

**T4: Upgrade `zproj` to deterministic attach-or-create session behavior** [medium] — terminal-workflow-builder
- Blocked by: V1
- Description: Improve `zproj` so it attaches to an existing Zellij session for the selected project when present, otherwise creates a new one using the existing v1 launch contract.
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
  3. [ ] New sessions still use the repo-owned v1 dev layout.
     - Verify: `rg -n "layouts/dev\.kdl|--layout dev|config/zellij" powershell/profile.ps1`
     - Pass: create flow preserves the original cockpit launch contract
     - Fail: session resume logic breaks the v1 cockpit launch behavior

### Wave 2 — Validation Gate

**V2: Validate wave 2** [medium] — validation-lead
- Blocked by: T4
- Checks:
  1. Run acceptance criteria for T4
  2. `make test-quick` — all targeted tests pass
  3. `make lint` — no new warnings or lint failures introduced
  4. `pwsh -NoProfile -Command ". ./powershell/profile.ps1; Get-Command cockpit,cockpit-check,cockpit-help,zproj | Select-Object Name"` — workflow commands still load after `zproj` changes
  5. Cross-task integration: verify attach-or-create behavior does not break the health-check/help assumptions or the original v1 launch contract
  6. Manual runtime note: if a Windows environment is available, validate that re-running `zproj` for the same project reattaches cleanly and that missing-tool guidance remains understandable
- On failure: create a fix task, re-validate after fix

## Dependency Graph

```text
Wave 1: T1, T2, T3 (parallel) → V1
Wave 2: T4 → V2
```

## Success Criteria

1. [ ] Users can discover core cockpit actions without memorizing helper names.
   - Verify: `pwsh -NoProfile -Command ". ./powershell/profile.ps1; Get-Command cockpit,cockpit-help,cockpit-check | Select-Object Name"`
   - Pass: all discovery and support commands are available
2. [ ] Missing tools produce clear remediation steps instead of confusing failures.
   - Verify: manual review of `cockpit-check` output logic and fallback text in profile
   - Pass: at least Pi and missing core tools have concrete fixes
3. [ ] Re-entering an existing cockpit session is easier and deterministic.
   - Verify: inspect and, when Windows runtime is available, manually exercise the `zproj` attach-or-create flow
   - Pass: repeated selection of the same project resolves to consistent session behavior
4. [ ] The workflow layer improves usability without replacing the modular cockpit architecture.
   - Verify: manual review against the v1 plan and command implementations
   - Pass: the new commands wrap and explain the existing stack rather than introducing a new monolithic runtime

## Handoff Notes

- Execute this plan only after the v1 cockpit plan is implemented enough to provide `zproj`, `y`, and `ff` as a base.
- Keep help/check/menu output tightly aligned with actual implemented behavior; this layer becomes misleading quickly if it gets ahead of the cockpit.
- If command growth makes `powershell/profile.ps1` unwieldy, move the workflow layer into a sourced repo-owned PowerShell module rather than creating ad hoc external files.
- Windows runtime validation remains important for session attach behavior and missing-tool UX; do not treat grep-only verification as equivalent.
