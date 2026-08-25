---
created: 2026-08-25
status: ready
---

# Make Pi extension command output consistent

## Objective

Give custom Pi extension commands a consistent, readable UI lifecycle that does not disturb the editor merely to show progress, preserve interactive UI where interaction requires it, remove the unused `/prd-it` extension command, and record the accepted rules in the Pi extension skill for future extensions.

## Completion Evidence

- Evidence: Applicable long-running extension commands append one compact TUI-only transcript acknowledgement before work begins, optional footer progress is cleared on success and failure, final results use a surface appropriate to their size and purpose, commands use editor-replacing custom UI only for genuine interaction, `/prd-it` is no longer registered, and the Pi extension skill explains and exemplifies the shared surface-selection rules. Focused tests cover the shared renderer/context boundary and one representative command lifecycle without adding per-command acknowledgement tests.
- Fails when: An ordinary non-interactive command still replaces or writes into the editor to communicate progress, acknowledgement is inconsistent or enters model context, transient status survives completion or failure, an interactive dashboard loses necessary navigation or cancellation, `/prd-it` remains invokable, or validation relies on a large command-by-command test expansion.

## Boundaries

- In scope: Custom command registration and UI output under `pi/extensions/`, the shared command acknowledgement mechanism under `pi/lib/`, focused tests under `pi/tests/`, `pi/skills/pi-extension/SKILL.md`, and the owning slash-command or UI contract only if its accepted operator-facing semantics would otherwise become inaccurate.
- Out of scope: Built-in Pi commands, custom tool-call rendering, footer redesign, theme changes, command performance, command result semantics, non-command extension UI, and adding replacement PRD functionality.
- Preserve: Existing command arguments and side effects; bounded errors and results; `/ps` and `/subagents` dashboard interaction; confirmations, selectors, and cancellation where user input or in-component cancellation is required; existing non-TUI results and errors; model-context boundaries; and unrelated primary-worktree changes.
- Assumptions: A compact durable transcript row is the default TUI acknowledgement for noticeable work; no equivalent transcript row is required in RPC, JSON, or print modes, where existing command results and errors remain unchanged; footer status is optional transient progress; notifications are terminal outcomes; and `ctx.ui.custom()` remains appropriate when the user must interact or cancel through that component.

## Tasks

- [ ] **T1: Establish and prove the shared command-output pattern**
  - Files: `pi/lib/slash-command-echo.ts`, `pi/extensions/00-echo-slash-commands.ts`, `pi/tests/slash-command-echo.test.ts`, one existing session-entry integration test file, and one representative existing long-running command test file selected from the audited commands
  - Change: Replace the context-bearing slash echo with one shared helper that uses `pi.appendEntry()` plus `pi.registerEntryRenderer()` to format the submitted command as a compact TUI transcript row without calling `sendMessage`, changing editor contents, or triggering a model turn. First prove through the actual session-entry path that the entry is visible after TUI restoration but absent from built model context; stop and revise the mechanism if Pi 0.84.2 cannot provide both properties. Apply the proven helper to one representative command, with optional footer progress cleared in `finally`, before broader migration. Keep RPC, JSON, and print behavior unchanged apart from the absence of the TUI-only row. Reuse Pi APIs and existing renderer components rather than adding a UI framework or new persistent state beyond the transcript entry itself.
  - Done when: The actual session-entry slice proves TUI visibility and model-context exclusion, and the representative command acknowledges before its slow boundary, leaves the editor unchanged, clears transient status after success and failure, and one representative non-TUI path retains its existing result or error.
  - Verify: `cd pi && pnpm test slash-command-echo.test.ts <session-entry-test-file>.test.ts <representative-test-file>.test.ts && pnpm run typecheck`

- [ ] **T2: Normalize audited commands, remove `/prd-it`, and preserve the rules**
  - Depends on: T1
  - Files: Only `pi/extensions/**/*.ts` command handlers that scoped inspection confirms violate the accepted pattern; their existing focused tests when behavior changes; `pi/extensions/workflow-commands.ts`; `pi/tests/workflow-dispatch.test.ts`; `pi/docs/workflow-eval-operations.md`; `pi/skills/prd/SKILL.md`; `pi/skills/pi-extension/SKILL.md`; and `pi/skills/pi-extension/references/contracts/slash-command-context.md` only if needed to keep the stable operator-facing contract accurate
  - Change: Classify every registered custom command as immediate report, background work, interactive UI, or control-plane/session action. Migrate only inconsistent handlers to the shared acknowledgement, transient footer, bounded result, or terminal notification pattern; remove editor-replacing loaders only when they provide neither required input nor in-component cancellation, while retaining dashboards, selectors, confirmations, and cancellable loaders that genuinely need `ctx.ui.custom()`. Clear transient status in `finally`. Remove the `/prd-it` registration, dispatch code, command-specific test, and inaccurate operator or skill claims that it remains available; keep the general PRD skill and historical/internal vocabulary that does not expose an invokable command. Update the Pi extension skill with a concise decision table, shared helper example, cleanup and non-TUI rules, and a checklist future extension commands must follow. Do not create command-by-command acknowledgement tests; update existing tests only for changed contracts and use scoped inspection for the complete inventory.
  - Done when: Every custom command has one evidence-backed surface classification, inconsistent commands follow the selected lifecycle, no non-interactive progress UI writes to or replaces the editor, interactive commands retain necessary behavior, `/prd-it` is absent from command registration, and the Pi extension skill is sufficient to guide future implementations without duplicating Pi documentation.
  - Verify: `cd pi && pnpm test slash-command-echo.test.ts workflow-dispatch.test.ts <only-other-changed-test-files> && pnpm run typecheck`, followed by `rg -n 'registerCommand\("prd-it"' pi/extensions` returning no matches and scoped inspection reconciling every `registerCommand()` occurrence to a classification

## Validation

- [ ] Shared acknowledgement check: an actual session-entry integration test proves the row survives TUI transcript restoration but is excluded from built model context; focused tests also prove it appears before representative slow work, does not call `sendMessage` or trigger a turn, does not mutate or replace the editor, and leaves one representative non-TUI result or error unchanged.
- [ ] UI lifecycle check: scoped inspection of every `registerCommand()` confirms that non-interactive work uses transcript acknowledgement plus optional cleared footer status, terminal notifications/results are bounded, and `ctx.ui.custom()` is retained only for genuine interaction or cancellation.
- [ ] Removal check: `rg -n 'registerCommand\("prd-it"' pi/extensions` returns no matches, workflow dispatch tests no longer expect the command, and current operator and PRD-skill wording no longer presents `/prd-it` as available; the general PRD skill remains available.
- [ ] Focused regression check: only tests for the shared mechanism, the representative lifecycle, `/prd-it` removal, and already-covered changed command behavior are added or updated; focused Vitest files and `pnpm run typecheck` pass.
- [ ] Diff hygiene: `git diff --check` reports no whitespace errors and scoped diff inspection finds no unrelated command behavior, tool rendering, footer redesign, or theme changes.

## Retention

Keep incomplete work at `.specs/pi-command-output-consistency/plan.md`. After completion, `/do-it` archives this directory to `.specs/archive/pi-command-output-consistency/`. `/do-it` must materialize this spec in its owned implementation worktree before editing, commit the workflow branch, merge it with `--no-ff` into the clean primary branch, verify merged HEAD, and then remove only its owned worktree and branch. If the spec is ignored, keep it untracked and return the completed archive to the primary local ignored archive after the merge without force-adding it. Preserve the worktree and recoverable plan on any dirty, unmerged, conflict, failed-merge, or cleanup failure.

## Execution Status

- State: Ready; implementation has not started.
- Blocker: None.
- Next: T1.
- Resume: `/do-it .specs/pi-command-output-consistency/plan.md`
