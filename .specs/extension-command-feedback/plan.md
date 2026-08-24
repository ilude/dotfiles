---
created: 2026-08-24
status: ready
completed:
---

# Plan: Immediate Extension Command Feedback

## Objective

Ensure Pi extension commands provide immediate visible acknowledgement before potentially noticeable work, using command-appropriate feedback rather than adding indiscriminate chat noise.

## Completion Evidence

- Evidence: Every runtime command name registered under `pi/extensions/` is classified, every command that can perform noticeable repository, Git, filesystem, subprocess, network, model, session-settling, report, or synchronous blocking work emits one mode-appropriate visible acknowledgement before that work begins, and focused tests prove ordering, output count, lifecycle neutrality, and cleanup for each changed feedback mechanism.
- Fails when: A registered command or alias is omitted, an audited command can still appear inert before noticeable work, feedback cannot render before synchronous blocking work, an immediate dashboard/dialog/loader command receives redundant feedback, command-owned transient UI survives success, error, or cancellation, or command output and lifecycle behavior changes beyond the intended acknowledgement.

## Boundaries

- In scope: Pi extension command handlers under `pi/extensions/`, focused command tests under `pi/tests/`, `.specs/extension-command-feedback/command-audit.md`, and implementation clarification to the existing immediate-feedback rule in `pi/skills/pi-extension/SKILL.md` only if audit evidence requires it.
- Out of scope: Built-in Pi commands, custom tools, shortcuts, broad command performance optimization, unrelated UI redesign, and the already-delivered `/plan-it` review/Git-independence lifecycle changes.
- Preserve: Existing arguments, terminal results, dialogs, dashboards, model/session lifecycle, errors, cancellation semantics, supported TUI/RPC/JSON/print behavior, and unrelated repository changes.
- Assumptions: Immediate acknowledgement may be a slash echo, status, loader, notification, or dialog. A command is already compliant when it opens meaningful UI and returns control so that UI can render before potentially blocking work. Commit `5c7fc649` already contains the durable `pi-extension` instruction; `/do-it` starts from that committed baseline.

## Tasks

- [ ] **T1: Audit and classify extension command feedback**
  - Files: `pi/extensions/**/*.ts`; existing command-registration test helpers or a throwaway inventory script; `.specs/extension-command-feedback/command-audit.md`
  - Change: Capture the runtime command names produced by every registration site, including loop registrations and aliases, and reconcile that deterministic inventory against `command-audit.md`. For each command name, record registration site/shared handler, argument branches that materially differ, first potentially slow or blocking operation, existing intermediate and terminal output, and classification. Record the chosen single pre-work acknowledgement and expected behavior only in modes that command supports. Treat invoked helpers as part of the path; UI setup counts only when control can return for rendering before blocking work.
  - Done when: Every runtime extension command name and materially different branch has one reproducible evidence-backed classification, and the mutation list contains only commands that can otherwise appear inert.
  - Verify: Generate and save the deterministic runtime-name inventory during the audit, reconcile it once against `command-audit.md`, and use source `rg` only as a secondary call-site check. Do not add a permanent test that parses policy prose.

- [ ] **T2: Implement and verify immediate feedback**
  - Depends on: T1
  - Files: Only the `pi/extensions/**/*.ts` handlers classified as needing change; their focused `pi/tests/**/*.test.ts` files; shared slash-echo code if reuse requires it; `pi/skills/pi-extension/SKILL.md` only if the implemented contract needs clarification
  - Change: Emit exactly one command-appropriate acknowledgement before the first potentially slow operation. Prefer asynchronous work; when unavoidable synchronous blocking work follows, yield after scheduling feedback so the applicable frontend can emit or render it first. Chat-dispatch workflows must reuse the display-only slash-echo type without triggering an additional model turn. Other handlers use command-owned status keys, loaders, notifications, or dialogs guarded for their supported mode. Only handlers using disposable or shared transient UI require `try/finally`; they restore prior shared status or dispose command-owned UI on success, error, and cancellation without emitting false success or generic cancellation errors.
  - Done when: Every T1 command marked for change acknowledges through exactly one channel before work, applicable frontends can observe that acknowledgement while work remains pending, disposable feedback is cleaned up on every exit path, slash echo remains display-only and lifecycle-neutral, and commands already compliant remain unchanged.
  - Verify: Add ordering and exact-count tests for each changed mechanism, cancellation/cleanup tests for each disposable mechanism, and the smallest available frontend/protocol integration slice that observes acknowledgement while work is pending; run each changed command family's focused Vitest file, `cd pi && pnpm run typecheck`, and `git diff --check`.

## Validation

- [ ] Runtime inventory reconciliation.
  - Expected: Every registered command name and alias appears exactly once in `command-audit.md`; dynamic registrations and materially different argument paths are represented.
- [ ] Ordering and frontend/protocol observation for each distinct changed feedback mechanism.
  - Expected: One representative integration slice observes acknowledgement while asynchronous work remains pending or before synchronous blocking work begins; focused unit tests cover command-specific mode guards; slash echo is display-only and triggers no model turn.
- [ ] Cleanup and preservation checks.
  - Expected: Success, one representative error path, and cancellation clean up only disposable command-owned transient UI, preserve prior/shared status and existing terminal output, and emit no duplicate acknowledgement or false completion.
- [ ] Focused Pi tests and typecheck.
  - Expected: Changed command tests and representative integration slices pass, and `pnpm run typecheck` exits successfully.
- [ ] Diff hygiene: `git diff --check`.
  - Expected: No whitespace errors; unrelated primary changes remain intact.

## Retention

Keep incomplete work at `.specs/extension-command-feedback/plan.md`. `/do-it` must materialize this spec in its owned implementation worktree, archive the completed directory to `.specs/archive/extension-command-feedback/`, commit the workflow branch, merge it with `--no-ff` into the primary branch, verify merged HEAD, then remove only the owned worktree and branch. If this spec is ignored, keep it untracked and return the completed archive to the primary local ignored archive after a successful merge; never force-add it. Preserve the implementation worktree and recoverable plan on any dirty, unmerged, conflict, failed-merge, or cleanup failure.

## Execution Status

- State: planned, not started
- Blocker: none
- Next: T1
- Resume: `/do-it .specs/extension-command-feedback/plan.md`
