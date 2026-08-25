---
created: 2026-08-25
completed: 2026-08-25
status: complete
---

# Make Pi extension command output consistent

## Objective

Give custom Pi extension commands a consistent, readable UI lifecycle that does not disturb the editor merely to show progress, preserve interactive UI where interaction requires it, remove the unused `/prd-it` extension command, record the accepted rules in the Pi extension skill for future extensions, and make `/plan-it` end with a human-readable design assessment followed by a colored plain `/do-it` command copied to the computer clipboard.

## Completion Evidence

- Evidence: Applicable long-running extension commands append one compact TUI-only transcript acknowledgement before work begins, optional footer progress is cleared on success and failure, final results use a surface appropriate to their size and purpose, commands use editor-replacing custom UI only for genuine interaction, `/prd-it` is no longer registered, and the Pi extension skill explains and exemplifies the shared surface-selection rules. After a successful `/plan-it`, the assistant explains the plan in human terms and assesses coding standards, design patterns, overengineering, and churn risk; after that response settles, the extension copies the exact canonical `/do-it .specs/<slug>/plan.md` command to the computer clipboard and renders it once as the final colored plain-text output emitted by the `/plan-it` finalizer without Markdown fencing. Focused tests cover the shared renderer/context boundary, one representative command lifecycle, and this finalization sequence without adding per-command acknowledgement tests.
- Fails when: An ordinary non-interactive command still replaces or writes into the editor to communicate progress, acknowledgement is inconsistent or enters model context, transient status survives completion or failure, an interactive dashboard loses necessary navigation or cancellation, `/prd-it` remains invokable, the `/plan-it` assessment omits a requested dimension, the final command is missing, duplicated, Markdown-rendered, not copied, emitted before the assessment, or followed by another output from the `/plan-it` finalizer, or validation relies on a large command-by-command test expansion.

## Boundaries

- In scope: Custom command registration and UI output under `pi/extensions/`, the shared command acknowledgement mechanism under `pi/lib/`, focused tests under `pi/tests/`, `pi/skills/pi-extension/SKILL.md`, `pi/skills/workflow/plan-it.md`, clipboard delivery through Pi's existing helper, and the owning slash-command or UI contract only if its accepted operator-facing semantics would otherwise become inaccurate.
- Out of scope: Built-in Pi commands, custom tool-call rendering, footer redesign, theme changes, command performance, command result semantics outside presentation, clipboard history or fallback files, non-command extension UI, and adding replacement PRD functionality.
- Preserve: Existing command arguments and side effects; bounded errors and results; `/ps` and `/subagents` dashboard interaction; confirmations, selectors, and cancellation where user input or in-component cancellation is required; existing non-TUI results and errors; model-context boundaries; and unrelated primary-worktree changes.
- Assumptions: A compact durable transcript row is the default TUI acknowledgement for noticeable work; no equivalent transcript row is required in RPC, JSON, or print modes, where existing command results and errors remain unchanged; footer status is optional transient progress; notifications are terminal outcomes; `ctx.ui.custom()` remains appropriate when the user must interact or cancel through that component; and the final colored `/do-it` row and clipboard copy apply to successful interactive `/plan-it` runs only.

## Tasks

- [x] **T1: Establish and prove the shared command-output pattern**
  - Files: `pi/lib/slash-command-echo.ts`, `pi/extensions/00-echo-slash-commands.ts`, `pi/tests/slash-command-echo.test.ts`, one existing session-entry integration test file, and one representative existing long-running command test file selected from the audited commands
  - Change: Replace the context-bearing slash echo with one shared helper that uses `pi.appendEntry()` plus `pi.registerEntryRenderer()` and a typed entry kind to format either a submitted-command acknowledgement or a next-command action as a compact TUI transcript row without calling `sendMessage`, changing editor contents, or triggering a model turn. First prove through the actual session-entry path that each entry is visible after TUI restoration but absent from built model context; stop and revise the mechanism if Pi 0.84.2 cannot provide both properties. Apply the proven acknowledgement kind to one representative command, with optional footer progress cleared in `finally`, before broader migration. Keep RPC, JSON, and print behavior unchanged apart from the absence of TUI-only rows. Reuse Pi APIs and existing renderer components rather than adding a UI framework or new persistent state beyond each transcript entry.
  - Done when: The actual session-entry slice proves TUI visibility and model-context exclusion, and the representative command acknowledges before its slow boundary, leaves the editor unchanged, clears transient status after success and failure, and one representative non-TUI path retains its existing result or error.
  - Verify: `cd pi && pnpm test slash-command-echo.test.ts <session-entry-test-file>.test.ts <representative-test-file>.test.ts && pnpm run typecheck`

- [x] **T2: Normalize audited commands, remove `/prd-it`, and preserve the rules**
  - Depends on: T1
  - Files: Only `pi/extensions/**/*.ts` command handlers that scoped inspection confirms violate the accepted pattern; their existing focused tests when behavior changes; `pi/extensions/workflow-commands.ts`; `pi/tests/workflow-dispatch.test.ts`; `pi/docs/workflow-eval-operations.md`; `pi/skills/prd/SKILL.md`; `pi/skills/pi-extension/SKILL.md`; and `pi/skills/pi-extension/references/contracts/slash-command-context.md` only if needed to keep the stable operator-facing contract accurate
  - Change: Inspect every registered custom command and migrate only inconsistent handlers to the shared acknowledgement, transient footer, bounded result, or terminal notification pattern; remove editor-replacing loaders only when they provide neither required input nor in-component cancellation, while retaining dashboards, selectors, confirmations, and cancellable loaders that genuinely need `ctx.ui.custom()`. Clear transient status in `finally`. Remove the `/prd-it` registration, dispatch code, command-specific test, and inaccurate operator or skill claims that it remains available; keep the general PRD skill and historical/internal vocabulary that does not expose an invokable command. Update the Pi extension skill with a concise decision table, shared helper example, cleanup and non-TUI rules, and a checklist future extension commands must follow. Do not create a classification artifact or command-by-command acknowledgement tests; update existing tests only for changed contracts.
  - Done when: Scoped inspection finds no inconsistent command surface, no non-interactive progress UI writes to or replaces the editor, interactive commands retain necessary behavior, `/prd-it` is absent from command registration, and the Pi extension skill is sufficient to guide future implementations without duplicating Pi documentation.
  - Verify: `cd pi && pnpm test slash-command-echo.test.ts workflow-dispatch.test.ts <only-other-changed-test-files> && pnpm run typecheck`, followed by `rg -n 'registerCommand\("prd-it"' pi/extensions` returning no matches and scoped inspection reconciling every `registerCommand()` occurrence to a classification

- [x] **T3: Finalize `/plan-it` with assessment, clipboard delivery, and a final command row**
  - Depends on: T1
  - Files: `pi/extensions/workflow-commands.ts`, `pi/skills/workflow/plan-it.md`, `pi/tests/workflow-dispatch.test.ts`, and the shared entry renderer from T1
  - Change: Incorporate the operator's question - `what does this plan do in human terms, is it using good coding standards and design patterns, does it over engineer or have churn risk?` - into the `/plan-it` report instructions so the final assistant response answers all four dimensions while leaving command presentation to the extension. When `plan_progress ready` succeeds during an interactive `/plan-it` agent run, retain only the canonical command in bounded in-memory state, consume and clear it at the next `agent_end`, and then call `copyToClipboard()` before appending one themed `next-command` TUI-only entry. On clipboard failure, show one bounded warning without adding retries or a fallback file. Clear pending state when another `/plan-it` starts or the session shuts down. Do not use Markdown, code fences, `sendMessage`, editor mutation, persistent state, or scheduler state.
  - Done when: One interactive workflow smoke shows the four requested assessment dimensions in the final assistant response; the exact canonical command is copied once and displayed once through the colored `next-command` entry after that response; one representative stale or failed path does not emit it; and clipboard failure is reported without changing the plan result.
  - Verify: `cd pi && pnpm test workflow-dispatch.test.ts slash-command-echo.test.ts && pnpm run typecheck`

## Validation

- [x] Focused tests prove the shared TUI-only entries remain outside model context, one representative command acknowledges before slow work without editor mutation, and ready `/plan-it` finalization copies and appends the exact command once while one stale or failed path does not.
- [x] One interactive `/plan-it` smoke showed the human explanation plus coding standards, design patterns, overengineering, and churn-risk assessments, followed only by the colored plain `next: /do-it .specs/hello-galaxy-text/plan.md` row; `Get-Clipboard -Raw` returned the exact canonical command. Scoped command inspection retained required interaction and cancellation UI.
- [x] `rg -n 'registerCommand\("prd-it"' pi/extensions` returns no matches, current command-facing wording no longer presents `/prd-it` as available, focused Vitest files and `pnpm run typecheck` pass, and `git diff --check` reports no whitespace errors or unrelated changes.

## Retention

Keep incomplete work at `.specs/pi-command-output-consistency/plan.md`. After completion, `/do-it` archives this directory to `.specs/archive/pi-command-output-consistency/`. `/do-it` must materialize this spec in its owned implementation worktree before editing, commit the workflow branch, merge it with `--no-ff` into the clean primary branch, verify merged HEAD, and then remove only its owned worktree and branch. If the spec is ignored, keep it untracked and return the completed archive to the primary local ignored archive after the merge without force-adding it. Preserve the worktree and recoverable plan on any dirty, unmerged, conflict, failed-merge, or cleanup failure.

## Execution Status

- State: complete
- Blocker: None.
- Checks: `pnpm test workflow-dispatch.test.ts slash-command-echo.test.ts` (18 passed); `pnpm run typecheck`; `/prd-it` removal search; scoped command inventory; `git diff --check`; interactive `/plan-it` smoke with exact clipboard verification.
- Completion: T1, T2, T3, and all validation checks passed.
