---
created: 2026-09-07
updated: 2026-09-08
status: draft
completed: null
---

# Default Pi: Herdr process tools and shell-free launches

## Goal and authorization

Build a repository-owned Herdr integration for the default Pi profile:
- Structured tools for visible development servers, Docker/Compose processes, pane layout, and bounded log inspection.
- A thin skill that dynamically reads the installed `herdr --skill` rather than copying its command manual.
- Shell-free Herdr Pi launches for `/new-instance` and `/branch`.
- Preservation of existing Pi UI, launcher safety, and working/completion/operator-waiting signals.
- Concise, token-efficient tool descriptions, schemas, injected instructions, and results.

**Selected architecture:** repository-owned Pi tool extension → installed Herdr CLI. No third-party Pi extensions, package forks, or Bellwether installation. Borrow design ideas only. Herdr's own generated Pi lifecycle integration is separate from the tool extension.

Authorization covers planning and the completed disposable investigation. Production implementation, permanent installation, upgrades, commits, and pushes are not yet authorized.

Non-goals: subagents or delegation, a process/service registry, restart supervision, automatic service teardown on Pi exit, a new footer, legacy-profile migration, or model/task metadata publishing. The archived `.specs/archive/herdr-visible-subagents/plan.md` is not execution guidance; do not resume it or import its work.

## Context and evidence

All code paths below are repository-root-relative unless explicitly stated. This dotfiles repository owns the work. No module changes are required.

Read before implementation:
- Root `AGENTS.md`, `pi/profiles/default/AGENTS.md`, and `pi/README.md`.
- `pi/profiles/default/extensions/session-launch.ts` and `lib/profile.ts`.
- Default `extensions/tool-search.ts`, `extensions/tool-visibility.ts`, and `lib/tool-activation.ts`.
- Default Damage Control `lib/damage-control/{adapters,enforcement,prompt,approval,approval-view}.ts` and relevant analysis code/tests.
- Default `extensions/operator-footer.ts`, `extensions/profile-reload.ts`, and `extensions/scheduler.ts`.
- `scripts/pp`, `scripts/pp.ps1`, and `scripts/pi-damage-control-preflight.mjs`.
- Installed Pi docs/examples relevant to extensions, skills, session lifecycle, and custom UI, following relevant cross-references. Read the testing skill before authoring tests.
- [investigation.md](investigation.md), which records the live evidence, corrections, and cleanup. Its historical package alternatives are superseded by this plan's selected repository-owned architecture.

Preserve concurrent work. Damage Control source/tests and other repository changes were active during planning, and other agents made commits during investigation. Inspect current Git status before implementation; do not reset files, amend others' commits, or create a worktree merely to obtain a clean tree.

### Pi profiles and actual checks

- Planning profile: default, `PI_CODING_AGENT_DIR=C:\Users\mglenn\.dotfiles\pi\profiles\default`, reverified 2026-09-08.
- Intended implementation/test profile: default (`pi/profiles/default/`). Legacy remains unchanged.
- Installed during investigation: Pi 0.85.0, Node 25.9.0, Herdr 0.8.2-preview.2026-08-31-b1ff4582e968 on Windows.

| Date | Actual profile/surface | Result |
| --- | --- | --- |
| 2026-09-07 | Default profile, source/CLI/schema review | Established current launch, tool visibility, preflight, and prompt contracts. Third-party package review is closed. |
| 2026-09-07 | Default Pi in isolated Herdr; second launch added explicit temporary state/prompt probe extensions | Direct Node/Pi ancestry, TUI, profile/cwd/child identity, footer, reload, exit, and actual approval blocked/denied/done verified. |
| 2026-09-07 | Isolated Node and Compose fixtures controlled from default orchestrator | Tab/split launch, HTTP readiness, command submission, bounded logs, and container survival after log-pane closure verified. |
| 2026-09-08 | Default profile, planning only | Consolidated user-selected repository-owned tools and prompt-efficiency requirements. No production implementation. |

Test servers were stopped, the temporary plugin unlinked, and disposable containers removed. No production Herdr pane was controlled. Sound/desktop delivery was not tested because no client was attached. Production bootstrap/preflight and persisted branch restoration remain implementation acceptance checks, not reasons for another capability survey.

## Decisions

| ID | Status | Decision |
| --- | --- | --- |
| D1 | User selected | Own CLI-backed structured tools plus the dynamic skill. No third-party Pi extension installation or adaptation. |
| D2 | User selected | Deferred discovery through `tool_search`; concise descriptions and schema guidance, no duplicated manuals, bounded results. |
| D3 | Unresolved preference | Should a request such as “start the dev server” automatically use Herdr when inside it, or only when the user explicitly requests Herdr? Recommendation: automatic for requested long-running processes, preserving focus. This recommendation is not yet approved. |
| D4 | Proposed workflow default | Development processes use a sibling pane in the project cwd without moving focus. Explicit `/new-instance` and `/branch` preserve their existing focused new-tab behavior and titles. |
| D5 | Preservation | `/new-terminal` remains a shell. Non-Herdr Windows Terminal/Ghostty behavior stays unchanged. No silent shell fallback for a failed direct Pi launch. |
| D6 | Preservation/proposed integration | Keep Pi UI and current sound/desktop settings. Use Herdr's generated lifecycle publisher plus our native prompt bridge, without adding a competing bell/notification layer. Operator observation verifies actual delivery during acceptance. |

## Architecture and contracts

### Repository-owned tools and dynamic skill

Proposed files under `pi/profiles/default/`:
- `extensions/herdr-tools.ts`: tool registration and Pi lifecycle integration for those tools.
- `lib/herdr-cli.ts`: bounded argv invocation, response normalization, cancellation, and concise error handling.
- `skills/herdr/SKILL.md`: dynamic upstream documentation loading and local workflow conventions.

Keep the initial tool surface limited to inspecting/creating layout, identifying/renaming panes, submitting ordinary commands, bounded output reads/waits, graceful interruption, and explicit pane closure. Do not expose agent delegation or a general pass-through for every Herdr API. Exact tool grouping is an implementation choice, not a requirement to copy another extension's schemas. Asynchronous watch machinery is not required for the initial surface.

- Use `HERDR_BIN_PATH` when available, otherwise the installed CLI. Invoke argv without a shell around the CLI itself. Do not implement another Windows named-pipe transport.
- Check the Herdr environment and use explicit caller/returned IDs, never UI focus or guessed IDs as authority.
- Parse JSON for queries/creation; accept exit 0 with empty stdout for mutations. The live probe confirmed `pane run` succeeds silently. Do not resend after an ambiguous transport result.
- A successful submission is not process readiness. Use finite waits and fresh output or health evidence; pre-existing scrollback can match immediately.
- Verify target identity and actual shell/cwd before command submission. Default Damage Control skips uncovered tool names, so new tools need deliberate coverage. Wrapping an embedded command inside a native Bash call does not automatically analyze that command.
- Unknown execution context or unanalysable terminal input must not silently receive a “protected” classification. Keep changes focused on the new submission surface and existing safety policy.
- Foreground Compose, detached containers, and log viewers have different lifetimes. Closing a log pane does not imply stopping containers. No automatic teardown on Pi exit.
- Graceful interruption requires bounded reinspection. A successful `send-keys` reply proves submission only. Explicitly close only a verified task-owned pane when appropriate; never close Pi's own pane or unrelated panes.

Prompt efficiency:
- Defer the tools using existing activation infrastructure, preserving other tools.
- Use short capability descriptions and action-specific schema guidance. Avoid duplicated prose across tools.
- Do not preload manuals, examples, full skill text, or repeated safety instructions through system-prompt hooks.
- Return concise IDs/status and bounded requested output. Avoid full snapshots and duplicate raw JSON by default.
- The skill loads complete `herdr --skill` on first use, explaining that our wrapper is not the upstream documentation. Refresh after a version change/mismatch; use targeted help for uncovered syntax. Do not reload identical documentation on every operation.
- Review actual activated schemas/results once for unnecessary duplication. No separate token benchmark infrastructure.

### Shell-free Pi launch

Proposed files:
- `pi/herdr/`: repository plugin source/template.
- `scripts/pi-herdr-setup.mjs`: generate/link a machine-local manifest.
- `scripts/pi-herdr-launch.mjs`: stable Node bootstrap with profile/session selection and preflight.

Herdr plugin pane commands are argv arrays. The open operation accepts cwd/env but not arbitrary Pi argv. Generate a local manifest using real Node and the installed linked Pi package's `bin.pi`; do not commit versioned pnpm-store paths. CommonJS `require.resolve()` on Pi's import-only main export failed in investigation and must not be the resolution strategy.

- Pass narrowly validated profile/session inputs through dedicated launch environment variables, not an environment dump or transcript file.
- Preserve current profile, project cwd, exact branch session file, and newly injected child Herdr identity.
- Reuse the existing JS Damage Control preflight. Preserve tools-disabled/extensions-disabled repair semantics and argument sanitization; never select recovery automatically.
- Enter Pi without a shell. Prefer same-process loading with correctly constructed `process.argv`; test the bootstrap itself. Bare-Pi capability evidence does not prove preflight preservation.
- Open a tab with caller workspace only. The installed Herdr rejects source-pane/direction arguments for tab placement. Parse `result.plugin_pane.pane`, then use the returned tab ID for `tab rename` and preserve focused-launch behavior.
- `/branch` keeps creating a branched session and passes its exact file path. If launch fails, retain the branch file and report how to resume it. Do not launch another tab merely because the response was ambiguous.
- Normal Pi exit leaves no shell. Other development panes remain alive.

### Lifecycle, prompts, and existing UI

Install Herdr's generated `extensions/herdr-agent-state.ts` in default after inspecting the current target/output. Do not copy the customized legacy file or hand-edit generated code. Add repository-owned `extensions/herdr-ui-prompt-state.ts` beside it.

The installed generated version 8 handles TUI state, `agent_start`, `agent_settled`, and `herdr:blocked`, but does not bridge native prompt events. A temporary bridge from `ui_prompt_start`/`ui_prompt_end` to `herdr:blocked` worked with the actual default Damage Control `ctx.ui.custom` dialog. No approval-view modification was needed.

- TUI only; headless helpers must not claim a parent's pane.
- Publish settled state from `agent_settled`, not `agent_end` between retries/follow-ups.
- Clear waiting state on prompt completion/cancellation and preserve Pi's coalesced prompt spans.
- Preserve footer, quota/TPS/context widgets, reload indicator, dialogs, and local notices.
- Do not add legacy task dependencies, duplicate lifecycle publishers, or routine metadata notifications.
- Keep sound/desktop settings unchanged. State API evidence is not proof of audible/desktop delivery.

## Execution guidance

**Before expanding work:** identify the existing requirement and evidence that justify the addition. Do not turn optional improvements into requirements.

**At scope checkpoints:** stop repeated investigation or drift into service supervision, delegation, or new infrastructure. Continue the agreed implementation.

**Recovery:** remove unnecessary work introduced by this task without disturbing concurrent changes. Record anything that cannot safely be removed, restore the agreed completion criteria, and resume the next required step.

## Tasks

- [x] **T1a — Establish capability boundaries**
  - Inputs: current source, installed schema/help, isolated live probes.
  - Result: requested core design works on installed Herdr; no upgrade or third-party extension required.
  - Evidence: [investigation.md](investigation.md). Do not repeat unchanged capability probes.

- [ ] **T1b — Record invocation policy**
  - Input: user choice D3, not further technical investigation.
  - Change: record explicit versus automatic use and reflect it in the skill.
  - Done when: the remaining preference is stated. Independent launcher work does not depend on this choice.

- [ ] **T2 — Implement concise deferred tools and dynamic skill**
  - Depends on: implementation authorization; T1b for skill invocation wording.
  - Files: proposed tool/CLI/skill files above, default `extensions/tool-visibility.ts`, `lib/tool-activation.ts`, relevant Damage Control adapters/analysis, and `tests/herdr-tools.test.ts` plus existing visibility/search tests.
  - Change: implement only the bounded operations and prompt-efficiency/safety contracts above. No third-party package installation.
  - Verify: creation/query JSON, silent mutation success, no blind retries, cancellation/timeouts, bounded results, exact targeting, command safety, own-pane closure refusal, and additive deferred activation. Review injected schemas for duplicated documentation.
  - Done when: tools are concise, discoverable, correctly bounded and safety-covered; the skill dynamically uses installed docs without copying them.

- [ ] **T3 — Implement local plugin setup and safe Node bootstrap**
  - Depends on: implementation authorization and completed T1a. Independent of T1b.
  - Files: proposed plugin/setup/bootstrap files above; `scripts/pi-damage-control-preflight.mjs` and existing launcher behavior as inputs; proposed default `tests/herdr-launch.test.ts`.
  - Change: resolve local executable paths, validate launch inputs, preserve preflight/repair behavior, and run Pi without a shell. Keep existing `pp` working. Mirror install/WSL links only if adding a cross-platform link is necessary.
  - Verify: paths with spaces, profile/cwd/session propagation, child identity, and failed-preflight repair mode using fixtures, not a broken production bootstrap.
  - Done when: the actual bootstrap launches default Pi directly and preserves launcher safety semantics.

- [ ] **T4 — Switch the two Herdr Pi-launch commands**
  - Depends on: T3.
  - Files: `pi/profiles/default/extensions/session-launch.ts`; proposed default `tests/session-launch.test.ts`.
  - Change: use plugin tabs for `/new-instance` and `/branch`, preserving titles/focus/cwd/profile and branch restoration. Leave `/new-terminal` and non-Herdr paths unchanged.
  - Verify: both command paths, exact branch file input, failed/ambiguous launch handling, and preserved shell/non-Herdr behavior.
  - Done when: both commands use the safe direct launcher and failure handling retains recoverable branch state.

Scope checkpoint: T2-T4 must remain process tools and operator-launched Pi sessions, not a process registry or delegation system.

- [ ] **T5 — Integrate lifecycle and prompt attention without UI changes**
  - Depends on: implementation authorization and T1a; coordinate with current Damage Control code. Use T3 for final direct-launch verification.
  - Files: generated default `extensions/herdr-agent-state.ts`, new `extensions/herdr-ui-prompt-state.ts`, and `tests/herdr-ui-prompt-state.test.ts`.
  - Change: install one generated reporter and the native prompt bridge. Preserve generated ownership and existing UI/settings.
  - Verify: prompt start/end/denial/cancellation, coalesced prompts, session/reload teardown, correct TUI gating, and settled-state semantics. No duplicate reporter or bell path.
  - Done when: Herdr receives correctly attributed state and operator waits without altering default UI.

- [ ] **T6 — Validate the implementation and document usage**
  - Depends on: T2, T4, T5.
  - Files: relevant default tests, `pi/README.md`, proposed `pi/profiles/default/docs/herdr.md`, root `CHANGELOG.md`, this plan.
  - Change: document setup, deferred tools, dynamic skill, safety boundaries, direct-launch exit behavior, Docker ownership, and attention behavior. Preserve unrelated documentation edits.
  - Verify: the finite checks below; fix relevant demonstrated failures only.
  - Done when: agreed checks pass, task resources are cleaned, limits are recorded, and documentation matches behavior.

## Validation and finish

Implementation checks from `pi/profiles/default/`, finalized against files actually authored:
- `pnpm test herdr-tools.test.ts herdr-launch.test.ts session-launch.test.ts herdr-ui-prompt-state.test.ts tool-visibility.test.ts tool-search.test.ts`, plus relevant touched Damage Control test filters.
- `pnpm run typecheck` and `pnpm run check:runtime`.
- From repository root, `git diff --check` for touched files. Separate pre-existing failures rather than repairing unrelated work.

Finite live acceptance checks:
1. Through the new tools, launch one disposable visible server, verify fresh readiness/health and bounded logs, then stop only that fixture. This tests the implemented tools, not another bare-CLI capability survey.
2. Through the new surface, inspect a disposable Compose log pane and verify viewer/container lifetime separation; clean only the uniquely named fixture project. No live user stack as a fixture.
3. Exercise implemented `/new-instance` and `/branch`: correct profile/cwd/branch context, child identity, TUI, no shell host, normal quit, and unchanged `/new-terminal`. No fleet/load benchmark.
4. With operator participation and an attached client, observe completion and an actual approval wait in an unfocused test tab, deny/cancel it, and check clearing plus expected badge/sound/desktop behavior under existing settings. Check footer/reload in the same run. Distinguish API reports from visually/audibly verified signals.

Use isolated named sessions, pinned sockets and returned resource IDs. Reinspect before destructive actions. Never stop a shared Herdr server, close an unrelated pane, or tear down a user's container stack. Rerun only checks affected by relevant changes or stale evidence. Do not schedule continuation or add recurring monitoring.

## Handoff and archive

- Status: updated draft. User-selected architecture and implementation tasks are written; only D3's invocation preference remains open.
- Investigation is complete. No further third-party package selection or broad research is needed.
- Production implementation is not authorized by this planning request and has not been performed.
- Generated-code limitations and unverified delivery behavior are recorded in investigation.md; do not claim automatic session-restoration or desktop-alert parity from headless probes.

When implementation and agreed checks finish, set `status: completed` and `completed: YYYY-MM-DD`, record actual profile/results, and move this directory to `.specs/archive/default-herdr-processes-and-direct-launch/`. Verify the destination does not exist and repair affected links. Leave blocked/incomplete work active. Archival does not authorize commits, pushes, or unrelated cleanup.
