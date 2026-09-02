---
created: 2026-09-02
status: complete
completed: 2026-09-02
---

# Add a user-prompt history interface

## Objective

Provide a `/history` TUI overlay that lists only textual user-role message entries from the current active session branch and lets the operator search, inspect, reorder, recall into the current editor, copy-and-close, navigate the current session to the selected prompt, or fork a new session from it using documented keyboard controls.

## Completion Evidence

- Evidence: Focused tests supply an active branch containing mixed entry types and demonstrate that `/history` reads no alternate source, includes only textual user-role message entries from that branch, starts with the newest entry selected, and supports Up/Down and item-based Page Up/Page Down navigation, `/` search, `v`/Space expansion, `r` ordering, `e` editor replacement, `c`/`y` exact `copyToClipboard(selectedText)` invocation followed by closure, Enter/`b` current-session navigation, `f` session forking, and Escape cancellation; Pi TypeScript typecheck passes for production extension code; operator documentation matches the tested interface.
- Fails when: Any supplied tool call, tool result, assistant message, summary, compaction, extension entry, or non-textual/empty user entry appears; the implementation reads the complete tree, another branch, another session, or a persisted history index; copy leaves the overlay open or passes changed text to the clipboard helper; an action targets an entry other than the selected prompt; `/history` gains a global shortcut or numeric invocation; the focused tests or production typecheck fail; or documentation differs from executable behavior.

## Boundaries

- In scope: A Pi-owned `/history` extension, its focused tests, and the operator-facing Pi documentation and tooling contract for this command.
- Out of scope: Changes to Pi's built-in `/tree` or `/fork`; global shortcuts for opening `/history`; numeric `/history <number>` actions; all-branches, cross-session, or persisted history indexes; tool/assistant entry display; telemetry; and unrelated session behavior.
- Preserve: Existing `/tree`, `/fork`, `/clone`, editor history, session replacement lifecycle, clipboard helper behavior, keybinding configuration, unrelated extensions, and unrelated working-tree changes.
- Assumptions: `ctx.sessionManager.getBranch()` remains the authoritative active-branch entry sequence; `ctx.navigateTree(selectedEntryId, { summarize: false })` navigates within the current session; `ctx.fork(selectedEntryId)` creates and switches to the forked session; `copyToClipboard()` remains the sole cross-platform clipboard boundary with no fallback file; `e` replaces rather than appends to current editor contents.

## Tasks

- [x] **T1: Implement and verify the prompt-history overlay**
  - Files: `pi/extensions/history.ts`, `pi/tests/history.test.ts`
  - Change: Use the repository's `registerSlashCommand()` convention to register a `/history` command that acknowledges and waits for idle, rejects non-TUI modes without calling `ctx.ui.custom()`, derives items exclusively from `ctx.sessionManager.getBranch()` entries whose type is `message`, role is `user`, and content yields non-empty text, and renders a bounded full-screen overlay patterned after existing Pi dashboards. Preserve string content exactly; for content arrays join text blocks in source order with newlines and ignore image/non-text blocks, skipping entries with no resulting text. Keep chronological list order initially while selecting the newest entry; implement stable entry-ID selection across `r` order reversal and search changes, configured selector Up/Down and cancellation, item-based Page Up/Page Down with the selected item visible, and width-safe one-line previews. `/` enters search mode; printable input updates the visible query, Backspace edits it, no matches render explicitly, Enter accepts the current filtered selection, and Escape first clears/exits search before a later Escape closes; modal action keys do not fire while search input is active. `v`/Space toggles a wrapped, height-clipped full-prompt detail region without displacing the selected list item, `e` returns an editor-recall action, `c`/`y` returns an exact-copy action, Enter/`b` returns a current-session navigation action, and `f` returns a fork action. The component must return the selected action, entry ID, and text before the command handler performs clipboard or session operations, which guarantees copy-and-close behavior and closes the UI before session mutation. After closure, replace editor contents for recall; call `copyToClipboard(text)` with visible failure reporting; call `ctx.navigateTree(entryId, { summarize: false })`; or call `ctx.fork(entryId)` and return immediately after successful session replacement. Handle cancelled or failed API operations without claiming success. Add no global shortcut, numeric argument mode, persistence, telemetry, fallback clipboard file, or alternate history source.
  - Done when: The command and component expose every agreed action, select and target only textual user-role entries supplied by the active branch, close before asynchronous action dispatch, pass exact selected IDs/text to their owning APIs, replace editor text for recall, and handle non-TUI, empty, cancellation, and failure states without changing excluded surfaces.
  - Verify: `cd pi && pnpm test history.test.ts`

- [x] **T2: Document the stable operator contract**
  - Files: `pi/README.md`, `pi/skills/pi-extension/references/tooling-contracts.md`
  - Depends on: T1
  - Change: Add concise operator documentation for `/history`, its active-branch user-only scope, initial selection and display behavior, keyboard actions, copy-and-close semantics, editor replacement semantics, and explicit lack of a global shortcut or numeric mode. Add only the contract index/section needed to preserve these accepted operator-facing semantics.
  - Done when: Both documentation surfaces describe the implemented command consistently without duplicating implementation details or changing unrelated Pi guidance.
  - Verify: Manually compare the documented scope, key map, close behavior, and exclusions with the passing interaction tests and implementation.

## Validation

- [x] The T1 focused test command passes with a captured component factory, a minimal fake TUI/keybinding manager, mixed active-branch fixtures, and behavioral assertions for search/no-match/edit/cancel behavior, ordering and entry-ID preservation, expansion, item paging, copy-and-close and pre-mutation closure, exact selected IDs/text, `{ summarize: false }` only for current-session navigation, immediate return after successful fork, one representative action failure, editor replacement, non-TUI rejection, and empty history.
- [x] `cd pi && pnpm run typecheck` passes for the production extension code.
- [x] Inspect the final diff and confirm changes are limited to the four planned files plus the archived plan, and that no shortcut registration, numeric invocation, alternate branch/session scan, persistence, telemetry, or built-in Pi modification was introduced.

## Retention

Keep incomplete work at `.specs/prompt-history-ui/plan.md`. After completion, `/do-it` archives this directory to `.specs/archive/prompt-history-ui/`.

## Execution Status

- State: Complete; focused tests and production typecheck pass.
- Blocker: None.
- Next: Archive and close out the owned workflow.
- Resume: `/do-it .specs/prompt-history-ui/plan.md`
