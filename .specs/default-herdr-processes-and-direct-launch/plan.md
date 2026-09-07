---
created: 2026-09-07
status: draft
completed: null
---

# Default Pi: visible development processes and shell-free Herdr launches

## Goal and scope

User requirements:
- Use Herdr panes for long-running development servers, Docker/Compose setups, and visible log output.
- Keep the Herdr skill thin: dynamically read the installed `herdr --skill`, not a copied upstream command manual.
- Update `/new-instance` and `/branch` to launch interactive Pi directly in a Herdr tab without PowerShell or another command shell hosting Pi.
- Preserve existing custom UI and account for bells, completion notifications, and operator-prompt attention signals.

Authorization: planning and the follow-up bounded compatibility investigation requested by "do it". No production implementation, permanent package/plugin installation, Herdr upgrade, commit, or push is authorized. Disposable capability checks may inform the plan; do not turn them into production cutover.

Non-goals: governed subagents, agent delegation, task registries, restart supervision, a new background-process manager, automatic service teardown on Pi exit, rewriting the footer, or migrating legacy runtime state. Model/context pane metadata was discussed but not selected as a requirement; it is not a completion criterion.

The user's request and subsequent changes are authoritative. Proposed defaults below are not approved requirements.

## Context for a fresh session

All code paths are repository-root-relative to the dotfiles checkout. Read current `AGENTS.md` and `pi/profiles/default/AGENTS.md` before acting.

Ownership:
- Dotfiles owns this work in the default Pi profile and workstation Herdr plugin integration.
- Do not edit module repositories for this task.
- `.specs/archive/herdr-visible-subagents/plan.md` is the cancelled, archived older governed-subagent/background-manager plan. Ignore it as execution guidance. Its worktree and implementation are preserved; do not resume or import that work as part of this plan.

Required reading:
- `pi/README.md`
- `pi/profiles/default/extensions/session-launch.ts`
- `pi/profiles/default/lib/profile.ts`
- `pi/profiles/default/extensions/tool-search.ts`, `extensions/tool-visibility.ts`, and `lib/tool-activation.ts`
- `pi/profiles/default/lib/damage-control/prompt.ts` and current approval implementation
- `pi/profiles/default/extensions/operator-footer.ts`, `extensions/profile-reload.ts`, and `extensions/scheduler.ts`
- `scripts/pp`, `scripts/pp.ps1`, `scripts/pi-damage-control-preflight.mjs`
- Legacy reference only: `pi/profiles/legacy/extensions/herdr-agent-state.ts`, `herdr-ui-prompt-state.ts`, and `herdr-metadata.ts`
- Before coding, read the installed Pi docs/examples relevant to extensions, packages, skills, session lifecycle, and custom UI completely, following relevant cross-references. Use the installed package paths from the active harness, not guessed repository docs.
- Before authoring tests, read `pi/profiles/default/skills/testing/SKILL.md`.

Verified starting behavior and evidence limits:
- `/new-instance` and `/branch` currently create a focused Herdr shell tab and submit a `pp` command. `/branch` first creates a branched session. `/new-terminal` intentionally opens a shell. Non-Herdr paths use Windows Terminal or Ghostty.
- `pp` selects the profile and runs a default-profile Damage Control syntax preflight. A failed preflight starts tools-disabled, extensions-disabled repair mode; recovery is never automatic. POSIX `pp` also sets `TMPDIR=/tmp`.
- The current default Damage Control TUI uses `ctx.ui.custom`; RPC uses selections. This changed during discussion. Preserve the concurrent work and re-read it before wiring prompt events.
- Default footer/widgets/notifications use Pi's UI APIs, not a parent shell. No explicit terminal-bell calls were found in the default extension/lib search; legacy has explicit bell calls and Herdr suppression. Do not describe absent legacy behavior as already ported.
- Herdr installed during investigation: `0.8.2-preview.2026-08-31-b1ff4582e968`. CLI exposes plugin pane `split` and `tab` placement. `agent start` explicitly requires an existing interactive shell prompt.
- Current upstream stable docs describe shell-free plugin argv commands and list 0.9.0 as stable. Those docs are not proof that every behavior works on the installed preview. No upgrade is authorized or assumed.
- `herdr integration status` resolved Pi's target to the default profile and reported its generated state integration missing. Recheck before installing to avoid overwriting concurrent work.
- Existing deferred-tool visibility must be extended additively, preserving image/log tools and other concurrent additions.
- No direct-launch, bells, desktop-notification, or third-party package runtime tests have been performed for this plan.

Existing work to preserve: at plan creation, `CHANGELOG.md`, default `AGENTS.md`, Damage Control docs/source/tests and approval modules, agent-process feedback logs, and `.specs/onclave-default-profile-port/` were dirty or untracked. Recheck Git status at execution. Do not restore files, create a worktree, or commit unrelated changes to obtain a clean tree.

### Pi profiles

- Planning profile: default, verified `PI_CODING_AGENT_DIR=C:\Users\mglenn\.dotfiles\pi\profiles\default`.
- Intended implementation and validation profile: default (`pi/profiles/default/`).
- Legacy must remain unchanged. Preserve active-profile selection for commands; do not silently force another profile.

| Date | Actual profile/path | Work or check | Result |
| --- | --- | --- | --- |
| 2026-09-07 | default / `pi/profiles/default/` | Source, CLI-help, registry, and upstream documentation inspection; plan creation | No implementation, package installation, or live pane test |
| 2026-09-07 | default / `pi/profiles/default/` | Bellwether source/manifest review, local Node named-pipe fixture, installed Herdr plugin schema, notification-setting search | Bare pipe name failed with ENOENT; normalized named pipe connected. No Herdr pane created or production setting changed. |

## Decisions and contracts

| ID | Source/status | Choice or exact question |
| --- | --- | --- |
| D1 | User requirement | Visible process/log panes, dynamic upstream skill loading, shell-free `/branch` and `/new-instance`, UI/attention parity. |
| D2 | Investigated, user choice unresolved | Bellwether 1.2.0 is not a drop-in Windows/pane-only fit (findings below). Choose between a narrowly patched original 0.4.0 package, a Bellwether adaptation with broader maintenance, or CLI-first use through the dynamic skill. Proposed next choice: CLI-first for minimum scope, or the patched original if structured tools are required. No candidate is silently selected. |
| D3 | Unresolved user preference | Use Herdr only when explicitly requested, or automatically for requested long-running processes whenever Pi is inside Herdr? Proposed initial default: explicit opt-in, matching the original package policy. |
| D4 | Proposed workflow default | Development processes use a sibling pane, current project cwd, and no focus change. Explicit `/branch` and `/new-instance` preserve their existing focused new-tab behavior and titles. |
| D5 | Preservation contract | `/new-terminal` remains a shell; non-Herdr command launchers stay unchanged. No silent shell fallback for a requested direct Herdr Pi launch. |
| D6 | Proposed attention contract | Herdr is the single external attention owner for Pi working/settled/operator-waiting states. Keep routine Pi notices local. Verify current audible/visual behavior before adding any new bell or desktop-alert mechanism. Exact desired sound/desktop policy remains a user choice if existing settings do not determine it. |
| D7 | Scope boundary | Direct launch requires a small Herdr plugin, independently of the chosen Pi tool package. No subagent orchestration package is needed merely to launch Pi. |

Technical contracts to retain:
- A successful pane submission is not command readiness or process success. Never blindly resend after an ambiguous transport error.
- Readiness uses a bounded output wait or health endpoint. Existing scrollback matches alone cannot prove a restarted service is ready.
- Foreground `docker compose up`, detached `up -d` plus `logs -f`, and observing existing containers are different ownership modes. Stopping a log viewer does not stop containers. Destructive Compose cleanup is not implied by stopping a server.
- Pi exit/reload does not automatically stop development services. Inspection and explicit stop target returned, verified pane/resource identities, not guessed IDs or labels alone.
- Direct-launch argv resolves the real Node executable and Pi JS entrypoint, not `pi.cmd`, `pi.ps1`, or a shell `pp` wrapper. No versioned pnpm store path is checked into a portable manifest.
- Preserve profile, cwd, branch session, and default Damage Control preflight/repair semantics. Do not serialize the entire environment, credentials, or transcript into launch files. Child Herdr identity must refer to the newly created pane, not its parent.
- Pi remains TUI mode. State publication is gated to the correct Herdr TUI session; RPC/print helper processes must not claim the parent's pane.
- Publish settled/idle from `agent_settled`, not prematurely from `agent_end`. Operator prompts temporarily override working/idle state; cancellation/closure clears waiting state.
- A generated Herdr integration has one owner and stays unmodified. Repository-specific prompt bridging sits beside it only if the current generated integration still needs it. Do not load competing lifecycle reporters.
- Pi's footer, quota/TPS/context widgets, reload indicator, and notifications remain owned by existing default extensions. Third-party widgets must not replace them.

### Package research (2026-09-07)

- Original: `@ogulcancelik/pi-herdr` latest and repository version are 0.4.0; last package commit July 22. Open issues [22](https://github.com/ogulcancelik/pi-extensions/issues/22), [40](https://github.com/ogulcancelik/pi-extensions/issues/40), and [PR 27](https://github.com/ogulcancelik/pi-extensions/pull/27) report successful silent pane submissions misclassified as errors. Do not adopt unchanged without resolving that relevant contract.
- [Bellwether](https://github.com/joelhooks/pi-bellwether): September 6 release commit for 1.2.0; 70 stars/3 forks at inspection. Direct sockets, pane labels, bounded workspace overview, cancellable asynchronous output watches with agent/notify/silent delivery, explicit close confirmation. Effect/XState dependencies and optional intercom/commands/widgets require a narrow compatibility review. Reputation is not established by stars.
- [AndrewJacop/pi-herdr](https://github.com/AndrewJacop/pi-herdr): 0.4.0, August 30; 17 stars/1 fork. Broader layout/session/worktree controls and documented Windows compatibility work, but mainly agent orchestration.
- [modem-dev/pi-herdr-subagents](https://github.com/modem-dev/pi-herdr-subagents): September 1 activity, 11 stars/6 forks. Plugin-based argv pane launch and exit events are useful references; its Bash dispatcher is not our requested shell-free Pi launch.
- [Herdr documentation index](https://herdr.dev/llms.txt): use the installed version's schema/help as the executable contract. Load `herdr --skill` dynamically for actual use.

### Bounded compatibility findings (2026-09-07)

Reviewed Bellwether commit `a20699ef89006cba347e31cc5789d3dd27c3037e` (1.2.0), specifically `package.json`, `src/herdr-client.ts`, and the extension entrypoint. This is source review, not an installed-package/typecheck or live Herdr compatibility pass.

- Distribution: npm's `@joelhooks/pi-bellwether/latest` returned 404; the documented Git installation is the available path verified here. Pinning the repository commit would be necessary, not assuming an npm 1.2.0 install exists.
- Windows: `resolveHerdrSocketPath()` returns `HERDR_SOCKET_PATH` unchanged and passes it directly to `net.createConnection`. It has no `win32` normalization; fallback session paths assume `~/.config/herdr/...`. The local environment supplies a filesystem-style Herdr socket identifier, while the existing generated Windows integration prefixes `\\\\.\\pipe\\`. A disposable Node named-pipe fixture confirmed a bare identifier gives ENOENT and a correctly prefixed endpoint connects. The first fixture invocation had an escaped-path construction error; it was corrected before obtaining this evidence. No live Herdr connection was used for this check. This establishes missing handling, not a claim that all Bellwether transports were tested.
- Scope selection: one default factory unconditionally registers `herdr_layout`, `herdr_pane`, `herdr_agent`, `herdr_watch`, and `herdr_ping_wait`, plus five slash commands. There is no factory options/configuration switch for pane-only operation. Pi package filters can exclude its bundled skill, but cannot split tools/commands within this single extension entrypoint. Merely deactivating tools does not remove commands or hooks.
- UI/runtime: `session_start` installs a watch widget and timer in TUI mode, creates intercom coordination, and appends a capability entry. It does not replace the footer. The entrypoint is not gated to a complete Herdr environment. `session_shutdown` cancels watches and clears the widget/timer. These are additional runtime behaviors, not just deferred tool definitions.
- Dependencies: Effect `4.0.0-beta.99` and XState `5.32.5`. Peers are wildcard Pi packages. Uses current Pi extension APIs in source, but no Pi 0.85 runtime pass has been performed.
- Safety: default Damage Control's `adapt()` handles native tools only and reports Herdr tool names uncovered. A structured pane-command tool is therefore not automatically equivalent to protected native Bash execution. Any selected structured integration must account for actual target shell/cwd and raw terminal input; do not merely relabel a command as local Bash.
- Direct-launch schema: installed Herdr exposes `PluginManifestPane.command: string[]`, `plugin.pane.open` with `cwd`, `env`, `target_pane_id`, `workspace_id`, `focus`, and split/tab placement. Launch arguments are manifest-owned; `plugin.pane.open` has no arbitrary argv parameter. The proposed launcher must use a stable Node entrypoint and a small validated per-launch profile/session input, rather than assuming the open call accepts Pi arguments.
- Notification settings: targeted search of the current Herdr `config.toml` found no explicit bell/notification/sound/attention overrides. Effective defaults and desktop capability remain unverified; absence of overrides is not proof notifications are off or on.

Planning implication: do not install Bellwether unchanged or build a filtering/proxy framework to force a pane-only fit. Resolve D2 before finalizing T2. Direct Pi launch is independent and can proceed to its disposable capability check after that choice without using any agent-orchestration package. D3 and any desired new sound/desktop policy require user input; source inspection cannot decide preferences.

## Execution guidance

**Before expanding work:** Which existing requirement needs this addition, and what evidence justifies it? Do not turn optional improvements into tasks or completion criteria.

**At scope checkpoints:** Check whether work advances the agreed requirements or has drifted into repeated verification, speculative cases, or unnecessary complexity. Continue required work without starting another audit.

**Recovery when drift is found:** Stop the detour and remove unnecessary code, tests, and plan items introduced during this task without disturbing pre-existing/concurrent work. Resolve cleanup independently; note anything that cannot safely be removed. Restore agreed completion criteria and resume the next required step.

## Tasks

- [ ] **T1 — Resolve package/policy and prove the direct-launch boundary**
  - Depends on: implementation authorization; D2/D3 need resolution before dependent production changes.
  - Inputs: current sources listed above, pinned candidate package source/manifest, installed Herdr plugin schema/help and version.
  - Do: review Bellwether first for Windows named pipes, Pi 0.85 lifecycle compatibility, dependency footprint, selectable tools/commands, and nonblocking output-watch delivery. Record adopt/reject with concrete reasons; do not perform another broad package survey. Present the package choice and D3 to the user. Verify direct plugin argv launch using a disposable Node TUI/identity fixture, then Pi, without a shell ancestor between Herdr and Node. Resolve how a stable local plugin manifest obtains machine-local Node/Pi paths and selected profile/session safely. Confirm behavior on Pi exit.
  - Verify: use an isolated named Herdr session with its own pinned socket; exact owned resources only. Confirm process identity, real TUI attachment, cwd, profile, pane ID, split/tab support, and no shell wrapping. Keep production interactive focus/resources untouched. User-visible notification testing is reserved for T6.
  - Done when: chosen package/policy and launch contract are recorded, or a concrete incompatibility blocks the affected path. Do not silently upgrade Herdr or substitute a shell launch.
  - Evidence: Package review and installed schema inspection complete; see bounded compatibility findings. Bellwether unchanged rejected as a drop-in candidate. D2/D3 unresolved; direct Pi launch and exit behavior not yet live-tested. This task remains unchecked.

- [ ] **T2 — Add deferred development-process tools and dynamic skill**
  - Depends on: T1 package/policy outcome.
  - Existing files: default `package.json`, `pnpm-lock.yaml`, settings/loading surface as appropriate, `extensions/tool-visibility.ts`, `lib/tool-activation.ts`, tool-search/visibility tests.
  - Proposed new files: `pi/profiles/default/skills/herdr/SKILL.md`; a thin package loader only if needed for supported selection/integration.
  - Do: install a reviewed pinned package through repository pnpm conventions. Expose layout/pane capabilities and output watches if supplied by the chosen package; defer them through existing `tool_search`. Avoid enabling unrelated agent delegation/intercom/session-destruction surfaces. If supported configuration cannot provide that scope, resolve the tradeoff with the user rather than quietly forking the package or broadening authority.
  - Skill: check Herdr environment; run and read complete `herdr --skill` on first use, clarifying that our wrapper is not upstream documentation; use targeted CLI help for uncovered operations and refresh docs after a version change/mismatch. Add only local invocation, layout/focus, readiness, Docker ownership, and cleanup conventions. Do not paste upstream command tables.
  - Verify: focused visibility/loader tests show additive activation and no loss of existing tools. Review the chosen execution tools against current Damage Control routing; preserve safety controls rather than introducing an unexamined command-execution bypass. If adaptation is needed, limit it to these tool actions and their actual command payloads.
  - Done when: selected tools are discoverable/deferred, safe command routing is understood and supported, and the skill dynamically uses installed documentation.
  - Evidence: Not started.

- [ ] **T3 — Implement the shell-free local Herdr Pi launcher**
  - Depends on: T1 direct-launch result.
  - Proposed new paths: `pi/herdr/` for the repository-owned plugin source; `scripts/pi-herdr-launch.mjs` for minimal Node launch/preflight plumbing; a narrow setup helper only if required for machine-local manifest resolution. Final names depend on T1's verified plugin contract.
  - Existing inputs: `scripts/pp`, `scripts/pp.ps1`, `scripts/pi-damage-control-preflight.mjs`, default profile helpers. Change install/WSL mappings only if a new cross-platform link is required, and mirror relevant links.
  - Do: use actual Node and Pi entrypoint with argv, inherited terminal handles, selected profile/cwd, optional exact session path, and newly injected Herdr pane identity. Preserve normal default preflight and tools-disabled/extensions-disabled repair behavior. No automatic recovery, hidden shell, full environment dump, or dependency on shell startup files. Keep existing `pp` entrypoints working and avoid a general launcher rewrite.
  - Verify: proposed `pi/profiles/default/tests/herdr-launch.test.ts` covers argv/path handling, spaces, profile/session preservation, identity handling, and preflight failure. Use fixtures to prove no unsafe Pi launch on failed preflight; do not break the real bootstrap.
  - Done when: the local plugin can launch default Pi directly with required launcher semantics and no shell host.
  - Evidence: Not started.

- [ ] **T4 — Switch `/new-instance` and `/branch` to direct launch in Herdr**
  - Depends on: T3.
  - Files: `pi/profiles/default/extensions/session-launch.ts`; proposed `tests/session-launch.test.ts`.
  - Do: replace only the Herdr Pi-launch paths with the plugin launcher. Preserve title/focus/cwd/profile, fresh-session behavior for `/new-instance`, and branched-session creation/resume for `/branch`. Keep `/new-terminal` and non-Herdr paths unchanged. Use `HERDR_BIN_PATH` when available and bounded invocation failures. An ambiguous launch result must not automatically create another tab. Retain a created branch session on failure and report how to resume it.
  - Verify: focused tests for both commands, branch arguments, failed launches, and unchanged shell/non-Herdr behavior.
  - Done when: both commands launch through direct plugin argv, with preservation checks passing.
  - Evidence: Not started.

Scope checkpoint: confirm T2-T4 still implement visible services and direct operator-launched Pi sessions, not subagent supervision or a second process registry.

- [ ] **T5 — Preserve Pi UI and connect Herdr attention state**
  - Depends on: T1 contract review, T3; coordinate with current Damage Control changes.
  - Proposed files: generated default `extensions/herdr-agent-state.ts` via Herdr's installer and repository-owned `extensions/herdr-ui-prompt-state.ts` only if still needed; proposed `tests/herdr-ui-prompt-state.test.ts`.
  - Do: review the installer output/current contract before installation. Use one TUI lifecycle reporter and the native `ui_prompt_start`/`ui_prompt_end` bridge for actual operator waits, including the new Damage Control custom dialog. Avoid classifying progress-only custom UI as operator waiting if current callers demonstrate that case. Preserve existing footer/widgets/notices. Do not port legacy task/subagent dependencies or emit duplicate bells. Read current Herdr notification settings without dumping unrelated secrets; record D6's resulting behavior or ask about unresolved sound/desktop preferences.
  - Verify: focused event tests for active/idle/prompt start/end/cancel, coalesced nested prompts, reload/new-session teardown, and headless gating. Confirm settled state is not emitted between automatic retries/follow-ups. Keep ordinary metadata refreshes non-notifying.
  - Done when: current default UI remains intact and Herdr receives correctly attributed working/settled/waiting states without duplicate reporters.
  - Evidence: Not started.

- [ ] **T6 — Run bounded end-to-end checks and document behavior**
  - Depends on: T2, T4, T5.
  - Files: proposed default Herdr tests/smoke script, `pi/README.md`, proposed `pi/profiles/default/docs/herdr.md`, root `CHANGELOG.md`, this plan.
  - Do: run the finite checks below, fix relevant demonstrated failures only, and record actual versions/profile/results. Describe setup, package pin, dynamic skill loading, direct-launch exit behavior, Docker ownership, and attention behavior. Preserve unrelated documentation edits.
  - Done when: agreed checks pass, task-owned test resources are cleaned, unresolved platform limits are stated, and documentation matches shipped behavior.
  - Evidence: Not started.

## Agreed validation and finish

Proposed commands, finalized against files actually authored:
- From `pi/profiles/default/`: `pnpm test herdr-launch.test.ts session-launch.test.ts herdr-ui-prompt-state.test.ts tool-visibility.test.ts tool-search.test.ts`, plus the single new loader/adapter test filter if T2 needs one.
- From the same directory: `pnpm run typecheck` and `pnpm run check:runtime` for default loading and Damage Control preservation. Classify existing unrelated failures instead of repairing the repository wholesale.
- From repository root: `git diff --check` for touched files; preserve/report pre-existing failures separately.

Finite live checks, after implementation authorization:
1. In an isolated named Herdr session, launch a local fixture server in a visible pane, verify fresh readiness and bounded logs, then stop only that fixture. If asynchronous watches are selected, demonstrate one completion and one cancelled watch without duplicate/late delivery.
2. Validate one disposable Compose fixture, if Docker is available: distinguish detached container lifetime from its log-viewer process; clean only the fixture's uniquely named Compose project. Never use the user's live stack as a fixture. Missing Docker leaves this check explicitly blocked or requires user agreement to narrow runtime validation.
3. Use the direct launcher for `/new-instance` and `/branch`; confirm default profile, cwd, branch context, correct child Herdr identity, TUI rendering, and absence of a shell host. Check normal quit behavior and preservation of `/new-terminal`. No fleet/load benchmark.
4. With the operator's participation, observe completion and an actual approval dialog from an unfocused test tab, answer/cancel it, and confirm expected badge/bell/desktop behavior and clearing of waiting state. Check the existing footer and reload indicator in that same session. Do not automate focus changes in the production session without agreement. Record which signals were visually/audibly verified versus merely reported by API.

Use exact returned resource IDs and isolated sockets for automated tests. Stop on an unexpected target/focus change. Clean only created fixtures/resources; never stop a shared Herdr server or unrelated Docker containers. Rerun checks only for relevant implementation changes or stale evidence. No broad failure hunt, recurring monitoring, or scheduled continuation.

## Current handoff

- Status: draft. Writing the plan does not complete its implementation.
- Completed: planning/source and upstream research only; all implementation tasks remain unchecked.
- Next: resolve D2 using the completed Bellwether review: CLI-first dynamic skill, patched original structured tools, or explicitly requested Bellwether adaptation. Also ask D3 (explicit versus automatic use). Finalize T2 for the chosen path rather than keeping all alternatives as implementation requirements. The remaining disposable direct-launch check must prove the installed preview's runtime behavior; schema support is already verified.
- Open: package/CLI choice, invocation policy, actual direct-launch compatibility, and notification preferences not established by existing settings. Bellwether adaptation is not authorized merely by this investigation. No implicit Herdr upgrade.
- Limits: third-party features are documented claims; Windows direct launch, package behavior, safety routing, Compose, bells, and desktop notifications are untested.

## Completion and archive

When implementation and agreed checks are complete, set `status: completed` and `completed: YYYY-MM-DD`, record actual profile runs/results, and move this directory to `.specs/archive/default-herdr-processes-and-direct-launch/`. Verify the destination does not already exist and repair affected links. Leave blocked/incomplete work active. Archiving does not authorize commits, pushes, or unrelated cleanup.
