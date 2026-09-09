---
created: 2026-07-19
status: completed
completed: 2026-09-09
---

# Add a Herdr-first interactive `/plans` command

## Goal and scope

- User requirements:
  - Add `/plans` to the repository-owned default Pi profile.
  - Discover open plans at `<repository-root>/.specs/<stub>/plan.md`, excluding `.specs/archive/`.
  - Present a concise interactive list with a brief description and arrow-key highlighting.
  - Support only these list controls: `↑`/`↓` to move, `Enter` for details, `o` to open the plan in VS Code, `d` to start `/do-it <plan-path>` in a new focused Herdr Pi tab, `a` to archive an eligible completed plan, and `Esc`/`q` to close.
  - Focus launch integration on Herdr. Do not add Windows Terminal, Ghostty, WezTerm, tmux, or another terminal fallback for the `d` action.
  - Do not add `/review-it` integration. That command is absent from the default profile and deprecated in legacy.
- Non-goals:
  - No background-tab hotkey, manual refresh hotkey, review command, generic process-pane launch, plan editor, automatic stale-plan cleanup, plan execution tracking, or legacy-profile compatibility.
  - Do not redesign `/do-it`, the planning skill, Herdr process tools, or the existing `/new-instance`, `/branch`, and `/new-terminal` user contracts.
  - Do not archive unfinished, blocked, abandoned, or merely stale plans.
- Authorization: planning only. Implementation, local commits, and merge require a later `/do-it` invocation. Push and deployment are not authorized.

The user's request and subsequent changes are authoritative. Keep unapproved optional work outside the task checklist and completion criteria.

## Context for a fresh session

All code paths below are relative to the dotfiles repository root. Read current applicable `AGENTS.md` files before acting.

- Owning repository: this dotfiles repository. The default profile owns the command and Herdr integration.
- Execution worktree: `C:/Users/mglenn/.dotfiles/.worktrees/default-plans-command` on `feature/default-plans-command`.
- Recorded integration target: originating checkout `C:/Users/mglenn/.dotfiles`, branch `main` at execution start.
- Required reading:
  - `pi/profiles/default/skills/planning/SKILL.md`
  - installed Pi `docs/extensions.md`, `docs/tui.md`, and `docs/keybindings.md`
  - `pi/profiles/default/extensions/session-launch.ts`
  - `scripts/pi-herdr-launch.mjs`
  - `pi/profiles/default/tests/session-launch.test.ts`
  - `pi/profiles/default/docs/{commands,herdr}.md`
  - `pi/README.md`
- Verified starting behavior:
  - `session-launch.ts` opens focused `local.pi` plugin tabs through Herdr and currently passes only profile and optional session-file inputs to the bootstrap.
  - `scripts/pi-herdr-launch.mjs` deliberately rejects arbitrary per-launch argv/environment serialization and constructs Pi argv itself after Damage Control preflight.
  - Pi accepts positional initial messages in interactive mode, so a constrained bootstrap-produced `/do-it ...` message can start execution without terminal keystroke injection.
  - `/do-it` is a native prompt template at `pi/profiles/default/prompts/do-it.md`.
  - Current plan files follow frontmatter plus a first H1, `## Goal and scope`, task checkboxes, and `## Current handoff`, but parsing must degrade visibly when optional fields are malformed or absent.
- Existing work to preserve: the originating checkout currently has unrelated untracked plans under `.specs/`. Do not edit, move, stage, or delete them. Recheck status at execution start.

### Pi profiles

- Planning profile: `default`, verified from `PI_CODING_AGENT_DIR=C:\Users\mglenn\.dotfiles\pi\profiles\default`.
- Intended implementation/validation profile: default profile in the task worktree.
- Other affected profiles: legacy must remain unchanged.

| Date | Actual profile/path | Work or check | Result / relevant model settings |
| --- | --- | --- | --- |
| 2026-07-19 | default / `pi/profiles/default` | Planning and source inspection | No implementation or runtime verification |
| 2026-09-09 | default / task worktree `pi/profiles/default` | Focused tests, typecheck, runtime smoke, full `make check-pi-default` | 69 test files passed, 5 skipped; 518 tests passed, 13 skipped |

## Decisions and contracts

| Decision | Source/status | Choice | Affected tasks |
| --- | --- | --- | --- |
| D1 | user requirement | `/plans` is an interactive default-profile command with exactly the agreed controls. | T1-T5 |
| D2 | user requirement | `d` is Herdr-only and opens a new focused `local.pi` plugin tab in the selected repository cwd. No terminal fallback is added. | T3 |
| D3 | user clarification | No `/review-it` behavior or legacy-profile integration. | T1-T5 |
| D4 | agreed safety constraint | Manual archive is available only for plans already marked completed, with a completion date, no unchecked task boxes, an absent archive destination, and explicit confirmation. | T4 |
| D5 | verified architectural constraint | Extend the setup-owned Herdr bootstrap with a narrow validated plan-launch input rather than accepting arbitrary argv, shell commands, or terminal text injection. | T3 |

### Discovery and summary contract

- Treat `ctx.cwd` as the selected repository root for this command. Read only direct child candidates matching `.specs/*/plan.md`; exclude `.specs/archive/**` and deeper unrelated Markdown files.
- Sort deterministically by plan title or stub; choose and document one stable default during implementation.
- Derive:
  - identity from the directory stub and repository-relative `plan.md` path;
  - title from the first H1, falling back to the stub;
  - status and completion date from simple top-of-file YAML frontmatter;
  - brief description from the first useful plain-text content under `## Goal and scope`, falling back to a clear unavailable marker;
  - progress from Markdown task checkboxes;
  - details from the same parsed record, including the first unchecked task and current-handoff summary when available.
- A malformed optional field does not hide the plan or crash the selector. Display a bounded warning on that record. A missing/unreadable plan discovered during the command reports a bounded error and leaves other valid plans usable.
- Empty state is explicit and closable.

### Interaction contract

- `↑`/`↓` changes the highlighted plan and requests a render.
- `Enter` toggles or opens a bounded details view for the highlighted record without changing the plan.
- `o`, `d`, and `a` act on the highlighted plan only.
- `Esc` and `q` close. No `D`, `r`, or `v` bindings exist.
- Every rendered line obeys the TUI width. Use injected theme and key handling APIs, with deterministic behavior testable independently from a live terminal.

### Action contracts

- Open: invoke VS Code without a shell, using the absolute selected `plan.md` path and repository cwd. Surface launch failure in Pi. This action does not modify the plan.
- Do-it:
  - Require `HERDR_ENV=1` and the existing Herdr workspace context. Outside Herdr, report that plan execution from `/plans` requires a Herdr-managed Pi session and do not fall back.
  - Launch through `local.pi` in a new focused plugin tab, preserving current default-profile and Damage Control preflight behavior.
  - Pass a constrained plan selector to `scripts/pi-herdr-launch.mjs`. The bootstrap must resolve and validate that it identifies an existing direct-child `.specs/<stub>/plan.md` under the plugin cwd, then construct the initial message `/do-it .specs/<stub>/plan.md` itself. Do not expose arbitrary initial prompt or argv forwarding.
  - Use a bounded title derived from the plan stub. Treat an ambiguous plugin response as potentially launched and do not retry automatically.
- Archive:
  - Re-read the selected file immediately before mutation.
  - Require `status: completed`, a valid non-null completion date, and zero unchecked Markdown task boxes.
  - Resolve source and destination under the repository root, reject symlink/path escapes, and refuse an existing `.specs/archive/<stub>` destination.
  - Show an explicit source/destination confirmation. On approval, move the whole spec directory once without overwriting. On cancellation or failed precondition, make no change.
  - Refresh the in-memory list after a successful move. This recovery action does not create a commit or claim implementation/integration completion.

## Execution guidance

**Worktree isolation:** At execution start, create a dedicated worktree and task branch, record its path/branch/merge target here, and carry this plan into it without removing the originating untracked copy. Work and validate there. Preserve all unrelated plans and checkout changes.

**When an assumption fails:** Reassess the mechanism against the contracts above. Use a simpler in-scope approach; ask before broadening launch authority, terminal support, or archive semantics.

**Before expanding work:** Identify the existing requirement requiring the addition. Do not add status filters, search, copying, editor-prefill, active-run detection, mouse interaction, or extra hotkeys.

**Scope checkpoint:** After parser/UI work and again after Herdr launch work, confirm that the command still has only the agreed actions and that no generic launcher or legacy workflow has entered scope.

## Tasks

- [x] **T1 — Implement bounded plan discovery and parsing**
  - Depends on: none.
  - Inputs/files: existing planning template and representative active/archived plans; proposed `pi/profiles/default/lib/plans.ts` or a comparably focused module; proposed parser fixtures/tests.
  - Do: implement repository-root-local discovery, archive exclusion, metadata/summary/progress extraction, deterministic ordering, warnings, and empty/error results according to the discovery contract. Avoid a new dependency unless existing `yaml` is demonstrably needed and bounded.
  - Verify: focused Vitest coverage for valid, partially complete, malformed, missing-field, unreadable/raced, empty, archive-excluded, and path-boundary cases.
  - Done when: callers receive stable typed records for every eligible direct-child plan and malformed optional metadata cannot suppress unrelated plans.
  - Evidence: Implemented `lib/plans.ts`; focused and full Vitest suites pass under the default task profile.

- [x] **T2 — Add the interactive `/plans` selector and agreed controls**
  - Depends on: T1.
  - Inputs/files: proposed `pi/profiles/default/extensions/plans.ts` and focused tests; Pi TUI APIs documented in installed `docs/tui.md`.
  - Do: register `/plans`, render the compact list and bounded details view, route only `↑`/`↓`, `Enter`, `o`, `d`, `a`, `Esc`, and `q`, enforce line width, and keep action execution outside render logic. Provide a useful no-plan state.
  - Verify: unit tests drive raw key input and assert selection bounds, details, exact action dispatch, close behavior, absent rejected hotkeys (`D`, `r`, `v`), width truncation, and empty state.
  - Done when: the selector is keyboard-usable and its testable interaction surface exactly matches the agreed contract.
  - Evidence: Implemented `extensions/plans.ts`; key dispatch, empty state, details, and width tests pass.

- [x] **T3 — Add constrained Herdr `/do-it` tab launch**
  - Depends on: T1, T2.
  - Inputs/files: `pi/profiles/default/extensions/session-launch.ts`, `scripts/pi-herdr-launch.mjs`, `pi/profiles/default/tests/{session-launch,herdr-launch}.test.ts`, and proposed shared launch helper changes.
  - Do: reuse/refactor the existing focused `local.pi` tab launch path so `/plans` can supply only a validated plan selector. Extend the bootstrap to validate that selector under the launch cwd and append the bootstrap-generated `/do-it <relative-path>` initial message to Pi argv. Preserve session-launch behavior, preflight repair mode, exact returned-tab rename, and no-retry handling. Outside Herdr, fail with the specified message and no fallback.
  - Verify: tests cover exact plugin env/arguments, spaces and platform path forms, direct-child/path-escape rejection, missing plan rejection, generated Pi initial message, preflight failure behavior, absent shell/pane-run injection, no retry after ambiguous launch, and unchanged `/new-instance` and `/branch` behavior.
  - Done when: `d` launches one focused default-profile Herdr Pi tab whose initial input invokes the selected `/do-it`, without adding arbitrary prompt/argv authority.
  - Evidence: Added constrained `PI_HERDR_PLAN_PATH` bootstrap handling and shared focused plugin-tab launch; session/bootstrap tests pass.

- [x] **T4 — Implement VS Code open and guarded archive actions**
  - Depends on: T1, T2.
  - Inputs/files: selector extension/action helpers and focused tests.
  - Do: launch `code -g <absolute-plan-path>` without a shell and implement immediate re-read, eligibility checks, confirmation, path containment, collision refusal, whole-directory move, and post-success list update for archive.
  - Verify: tests cover quoted/space-containing paths, editor failure, archive cancellation, every failed eligibility predicate, symlink/path escape, destination collision, successful whole-directory move, and list removal after success. Use temporary directories and never touch real active plans.
  - Done when: `o` reliably delegates to VS Code and `a` cannot move an ineligible or unconfirmed plan or overwrite an archive.
  - Evidence: Added VS Code and guarded archive actions with temporary-directory tests for cancellation, eligibility, whole-directory moves, and path escape.

- [x] **T5 — Document, integrate, and validate the command**
  - Depends on: T1-T4.
  - Inputs/files: `pi/profiles/default/docs/{commands,herdr}.md`, `pi/README.md`, root `CHANGELOG.md`, tests and runtime loader.
  - Do: document `/plans`, its exact hotkeys, Herdr-only execution behavior, archive guard, and lack of terminal/legacy review fallback. Add the material workflow change to `CHANGELOG.md`. Update existing tests whose stale assumptions are exposed, but do not broaden unrelated refactors.
  - Verify from `pi/profiles/default/`: run focused plan/session/Herdr tests, `pnpm run typecheck`, `pnpm run check:runtime`, then `make check-pi-default` from the repository root. Perform one bounded attached Herdr acceptance after `/reload`: open `/plans`, navigate/details, open a disposable fixture in VS Code, launch a disposable fixture plan into one focused Herdr tab and confirm its initial `/do-it` dispatch, and exercise archive cancellation plus successful archive only in a temporary Git fixture. Do not execute or archive an unrelated real plan.
  - Done when: automated checks pass, attached Herdr behavior matches the exact interaction contract, docs/changelog are current, and default-profile changes are integrated without touching legacy.
  - Evidence: Docs and changelog updated. `make check-pi-default` passes (69 files passed, 5 skipped; 518 tests passed, 13 skipped), including typecheck and runtime smoke. On 2026-09-09 the operator explicitly directed archive, commit, merge, and completion without making attached-client interaction a remaining completion gate.

## Agreed validation and finish

Required checks are the task-specific tests above, default-profile typecheck/runtime check, `make check-pi-default`, and one bounded attached Herdr acceptance. Fix demonstrated task-relevant failures and rerun affected checks; do not add a broader terminal matrix or legacy-profile suite. Live acceptance must use disposable fixture plans and must distinguish plugin submission from observed initial `/do-it` processing.

## Current handoff

- Status: completed.
- Completed work: T1-T5 implementation, docs/changelog, focused tests, typecheck, runtime smoke, and the full default-profile check.
- Next: archive, commit, and merge into the recorded `main` target.
- Blockers/open decisions: none.
- Verification limits: physical attached-client interaction was not observed; the operator explicitly directed completion after the automated default-profile checks passed.

## Completion and archive

When all tasks and agreed checks finish, set `status: completed` and `completed: YYYY-MM-DD`, record actual profile/check evidence, and move this whole directory to `.specs/archive/default-plans-command/` in the task worktree. Commit the implementation and archived plan together, merge into the recorded originating checkout branch unless execution was invoked with `--no-merge`, verify the target, and remove only the clean task worktree after successful integration. Never overwrite an existing archive destination or disturb unrelated active plans.
