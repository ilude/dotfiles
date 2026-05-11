---
created: 2026-05-03
status: superseded
completed: 2026-05-11
---

# Plan: Add terminal-aware Pi `/branch` command

## Context & Motivation

The user wants Pi's `/branch` command to create a duplicate copy of the existing Pi session and open it in a new terminal tab. This combines terminal tab duplication with Pi conversation/session branching so the new tab can continue independently from the current point. The command should detect Windows Terminal on Windows and Ghostty on macOS/Linux. The tab title should default to the current working directory basename, with an optional `/branch <name>` argument overriding the tab title.

## Constraints

- Platform: Windows 11 under Git Bash/MSYS2 (`MINGW64_NT-10.0-26200`)
- Shell: `/usr/bin/bash`
- User explicitly wants the command name to be `/branch`, not `/fork-tab` or a separate command.
- Avoid gold plating: no user-facing flags unless a real need emerges.
- Supported terminals: Windows Terminal via `wt`/`WT_SESSION`; Ghostty on macOS/Linux via Ghostty environment/CLI where available.
- Fallback must be safe: if opening a tab is unsupported, print the exact manual command rather than failing opaquely.
- Pi TypeScript work is pnpm-only for validation; do not use bun/npm for Pi extension/test packages.
- Process launch safety:
  - Build terminal commands as argv arrays and spawn without a shell wherever possible.
  - Do not interpolate tab title, cwd, branch id, or resume command into shell strings.
  - Tests must include cwd/title values containing spaces and shell-special characters.
- Branch-state safety:
  - Copy only the minimum Pi session/conversation state needed to resume from the current point.
  - Do not copy secrets into shell-visible argv, logs, fallback command text, tab titles, or environment variables.
  - The child process must receive only an opaque branch/session identifier or a safe resume argument.
  - If branch creation succeeds but terminal launch fails, clean up the created branch when the branch API supports deletion; otherwise clearly report the orphaned branch id and exact manual recovery/resume command.
- Windows path safety:
  - Convert MSYS/Git Bash paths to Windows-native paths before passing cwd to `wt` or native Windows process APIs.
  - Validate paths with spaces.
- Ghostty safety:
  - Confirm installed/documented Ghostty CLI tab syntax before hardcoding adapter arguments.
  - If tab-opening syntax is unavailable or version-dependent, use the fallback manual command rather than guessing.

## Alternatives Considered

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| Add a new `/fork-tab` command | Clear terminal-oriented name; avoids changing existing semantics | Violates user preference; fragments workflow between branch and fork metaphors | Rejected: user specified `/branch` |
| Add many flags such as `--terminal`, `--print-command`, `--no-open` | More controllable for edge cases and tests | Gold plating; exposes implementation details; conflicts with KISS preference | Rejected: only optional title argument is justified |
| Implement `/branch [tab-name]` with internal terminal adapters and fallback | Simple UX; supports Windows Terminal and Ghostty; leaves room for internal tests | Requires discovering Pi session-branch internals and terminal CLI quoting details | **Selected** |
| Shell-script wrapper outside Pi | Faster to prototype around `wt`/`ghostty` | Cannot reliably duplicate Pi conversation/session state from inside runtime | Rejected: Pi-native command is required |

## Objective

Implement Pi `/branch [tab-name]` so it creates a branched copy of the current Pi session and opens that branch in a new terminal tab. The tab title defaults to `basename(cwd)` and may be overridden by a single optional argument. If the active terminal is unsupported, the command prints a manual resume command for the branched session.

## Project Context

- **Language**: TypeScript for Pi extensions, Python/shell for broader dotfiles
- **Test command**: `make check` for repo-wide validation; Pi-specific `cd pi/extensions && pnpm install --frozen-lockfile && pnpm run typecheck` and `cd pi/tests && pnpm install --frozen-lockfile && pnpm run test`
- **Lint command**: `make lint`

## Task Breakdown

| # | Task | Files | Type | Model | Agent | Depends On |
|---|------|-------|------|-------|-------|------------|
| T1 | Discover Pi session branching/resume APIs and terminal CLI requirements | 2-4 | research | medium | planner | -- |
| V1 | Validate discovery | -- | validation | medium | qa-engineer | T1 |
| T2 | Implement typed branch/session helper and terminal launcher adapters | 3-6 | feature | medium | typescript-pro | V1 |
| T3 | Wire `/branch [tab-name]` command and executable tests | 3-6 | feature | medium | coding-medium | T2 |
| V2 | Validate implementation | -- | validation | medium | qa-engineer | T3 |

## Execution Waves

### Wave 1

**T1: Discover Pi session branching/resume APIs and terminal CLI requirements** [medium] -- planner
- Description: Inspect Pi runtime/extension APIs, current session storage, existing command registration patterns, and terminal CLI documentation/installed help output. Determine the smallest reliable way to clone current conversation/session state and start a new Pi process attached to the cloned branch. Confirm Windows Terminal and Ghostty launch syntax before implementation.
- Files: `pi/extensions/workflow-commands.ts`, `pi/extensions/context.ts`, relevant Pi session/runtime files under `pi/`, `pi/tests/**`, runtime package types, and terminal help/docs as needed
- Acceptance Criteria:
  1. [ ] A discovery note is added to the plan's implementation notes or a dedicated implementation comment/doc before coding starts.
     - Verify: open the changed note/doc and confirm it names exact Pi extension/session API or storage mechanism, child Pi resume command shape, opaque identifier, cleanup capability, Windows Terminal argv syntax, MSYS cwd conversion, and confirmed Ghostty syntax or fallback decision.
     - Pass: all items above are documented with concrete command/API names and no `TBD`.
     - Fail: do not implement T2; continue discovery.
  2. [ ] Discovery validates the manual fallback command shape.
     - Verify: construct the fallback command from the discovered API using a test/dummy branch id and inspect that it is copy-pasteable, contains only safe opaque identifiers, and includes cwd/title guidance outside shell interpolation.
     - Pass: command can be executed manually in the target shell shape or is covered by an executable unit test fixture.
     - Fail: refine branch/resume mechanism before implementation.

### Wave 1 -- Validation Gate

**V1: Validate discovery** [medium] -- qa-engineer
- Blocked by: T1
- Checks:
  1. Run T1 acceptance criteria exactly.
  2. Confirm no implementation task starts until the branch/resume command shape and Ghostty/Windows Terminal syntax are known.
  3. Confirm discovery identifies the existing test conventions to use for Pi extension command tests.
- On failure: create a fix task, re-validate after fix.

### Wave 2

**T2: Implement typed branch/session helper and terminal launcher adapters** [medium] -- typescript-pro
- Blocked by: V1
- Description: Add a typed helper boundary for creating/resuming/cleaning up branched sessions and a small internal launcher abstraction for Windows Terminal, Ghostty, and fallback. The launcher must consume the concrete branch resume command discovered in T1. Keep this internal; do not add user-facing flags.
- Files: likely `pi/extensions/workflow-commands.ts`, optional helper under `pi/extensions/` or `pi/lib/`, and existing integrated test files
- Acceptance Criteria:
  1. [ ] Branch helper uses typed inputs/outputs and enforces safe branch-state semantics.
     - Verify: run the integrated unit test that mocks branch creation, resume command generation, and cleanup-on-launch-failure.
     - Pass: test proves the child receives only an opaque branch/session id or safe resume arg, launch failure triggers cleanup when supported, and fallback output does not expose copied session content.
     - Fail: add typed helper/cleanup behavior before proceeding.
  2. [ ] Launcher uses argv arrays/no-shell process launch.
     - Verify: run launcher unit tests that spy on process spawning for Windows Terminal and Ghostty.
     - Pass: tests assert executable plus argv array, `shell: false` or equivalent no-shell behavior, and no command string containing interpolated title/cwd/branch id.
     - Fail: refactor launcher to avoid shell interpolation.
  3. [ ] Windows Terminal adapter handles MSYS/Git Bash path conversion and titles.
     - Verify: run a unit test with cwd like `/c/Users/Example User/project dir` and title like `feat/$HOME && nope`.
     - Pass: spawn args use a Windows-native cwd path and title remains a single argv value.
     - Fail: implement/fix path conversion and argv construction.
  4. [ ] Ghostty adapter implements only confirmed syntax.
     - Verify: run a unit test for the confirmed Ghostty CLI syntax from T1, or run a fallback test if T1 found no reliable tab syntax.
     - Pass: adapter arguments match confirmed syntax exactly, or Ghostty safely falls back with a manual command.
     - Fail: do not guess; return to T1 discovery.

**T3: Wire `/branch [tab-name]` command and executable tests** [medium] -- coding-medium
- Blocked by: T2
- Description: Register `/branch` in Pi workflow commands, parse the optional tab-name argument, create the branched session, invoke the launcher, notify the user clearly, and add/extend executable tests for default title, custom title, registered handler behavior, terminal detection, fallback, and failure cleanup.
- Files: `pi/extensions/workflow-commands.ts`, new helper file if created, `pi/tests/**` or existing extension test files
- Acceptance Criteria:
  1. [ ] `/branch` executes through the registered command handler.
     - Verify: run the integrated command test that invokes the registered `/branch` handler rather than calling only private helpers.
     - Pass: mocked branch helper and launcher are called with the current cwd, default title, and branch resume command.
     - Fail: wire command registration or test through the real registration path.
  2. [ ] Title behavior is covered by executable tests.
     - Verify: run tests for `/branch` and `/branch custom-name`.
     - Pass: default title equals cwd basename; override title equals the provided argument and remains a single argv value even with spaces/special characters.
     - Fail: fix parser/title derivation.
  3. [ ] Fallback behavior is executable and copy-pasteable.
     - Verify: run unsupported-terminal test.
     - Pass: output includes the exact manual resume command, cwd/title guidance, and safe opaque branch id; it excludes session content/secrets.
     - Fail: fix fallback message and safety filtering.
  4. [ ] Terminal launch failure cleanup is covered.
     - Verify: run test where branch creation succeeds and launcher throws.
     - Pass: cleanup is called when supported; otherwise user-facing output reports the orphaned branch id and manual command.
     - Fail: implement cleanup/reporting behavior.

### Wave 2 -- Validation Gate

**V2: Validate implementation** [medium] -- qa-engineer
- Blocked by: T3
- Checks:
  1. Run all executable acceptance tests for T2 and T3.
  2. `cd pi/extensions && pnpm install --frozen-lockfile && pnpm run typecheck` -- exits 0.
  3. `cd pi/tests && pnpm install --frozen-lockfile && pnpm run test` -- exits 0.
  4. `make check` -- exits 0 with no errors or warnings.
  5. Confirm no grep-only acceptance criteria remain as the sole proof of behavior.
- On failure: create a fix task, re-validate after fix.

## Dependency Graph

```text
Wave 1: T1 → V1
Wave 2: T2 → T3 → V2
```

## Success Criteria

1. [ ] End-to-end automated validation passes.
   - Verify: `cd pi/extensions && pnpm install --frozen-lockfile && pnpm run typecheck && cd ../tests && pnpm install --frozen-lockfile && pnpm run test && cd ../.. && make check`
   - Pass: all commands exit 0 with no errors or warnings.
2. [ ] User-facing behavior is correct in a supported terminal.
   - Verify: start Pi in Windows Terminal or Ghostty, run `/branch`, then run `/branch custom-name`.
   - Pass: each command opens a new tab attached to a branched Pi session; first tab title is cwd basename, second is `custom-name`.
3. [ ] Branch independence is manually proven.
   - Verify: in the branched tab, send a distinct test message such as `branch independence marker <timestamp>`; then return to the original tab.
   - Pass: the branched tab contains the marker in its conversation, while the original tab remains at the pre-branch conversation point and does not receive or display the branched message.
4. [ ] Fallback manual command is usable.
   - Verify: simulate or force an unsupported terminal path, copy the printed manual command into a new terminal in the intended cwd, and run it.
   - Pass: Pi resumes the branched session from the same conversation point and uses only safe opaque identifiers in the command text.

## Validation Contract

`/do-it` must satisfy this contract before reporting the plan complete or archiving it.

### Required automated validation

1. [ ] Run the strongest repo-wide validation command or command set for this project.
   - Command: `cd pi/extensions && pnpm install --frozen-lockfile && pnpm run typecheck && cd ../tests && pnpm install --frozen-lockfile && pnpm run test && cd ../.. && make check`
   - Pass: exits 0 with no errors or warnings
   - Fail: do not archive; update `## Execution Status` with the failing command and next fix

2. [ ] Run task-specific executable verification from every acceptance criterion above.
   - Command: use the executable tests and concrete command checks named in each task's `Verify:` item.
   - Pass: every acceptance criterion passes exactly as written
   - Fail: create/fix a task, rerun affected checks, then rerun repo-wide validation

3. [ ] Run branch/session safety tests.
   - Command: the integrated test target containing branch helper, launcher, fallback, and cleanup tests
   - Pass: tests prove opaque branch ids, no shell interpolation, cleanup/reporting on launch failure, path conversion, and title quoting
   - Fail: do not archive; fix implementation and rerun validation

### Manual validation

- Required: yes
- Steps:
  1. In Windows Terminal or Ghostty, run `/branch` from a Pi session and confirm a new tab opens with title equal to the cwd basename and a branched Pi session attached.
  2. Run `/branch custom-name` and confirm the new tab title is `custom-name`.
  3. In the branched tab, send a distinct marker message. Confirm the original tab remains independent and does not receive that marker.
  4. Simulate or use an unsupported-terminal fallback path. Copy the printed manual command into a new terminal in the intended cwd and confirm it resumes the branched session.

If manual validation is required and not confirmed passed, `/do-it` must classify the result as `implemented-awaiting-manual-validation`, update `## Execution Status`, and must not archive the plan.

### Deployment validation

- Required: no
- Procedure: None.

If deployment is required and skipped, cancelled, or fails, `/do-it` must not archive the plan.

### Archive rule

`/do-it` may archive this plan only after all required automated validation, task-specific verification, manual validation, deployment validation, and repo-wide validation pass.

## Execution Status

- Completion classification: superseded-by-consolidation.
- Status: superseded on 2026-05-11 by `.specs/pi-control-plane-consolidation/plan.md`; code for the Windows Terminal/session-branch path is present in `pi/extensions/workflow-commands.ts` and covered by `pi/tests/branch-command.test.ts`.
- Verified present on 2026-05-11: `/branch` command registration, `createBranchedSession(leafId)`, session-id extraction for timestamp-prefixed files, Windows Terminal `wt` argv-array launch through PowerShell, MSYS-to-Windows cwd conversion, custom/default title handling, and unsupported-terminal manual fallback.
- Validation evidence: `make check` passed on 2026-05-11 after this review, including Pi tests; focused branch tests are part of the Pi Vitest suite.
- Remaining before archive: required live manual validation from this plan has not been recorded; Ghostty adapter syntax is not implemented beyond safe fallback; cleanup-on-terminal-launch-failure is not implemented. Either complete/record manual validation and decide whether Ghostty/cleanup are still required, or revise the plan to match the Windows-focused implementation.
- Next safe action: continue remaining `/branch` validation/contract cleanup from `.specs/pi-control-plane-consolidation/plan.md`.

## Handoff Notes

Keep the UX minimal: `/branch` and `/branch <tab-name>` only. Do not add flags unless implementation discovers an unavoidable runtime constraint. De-risk the core session branch/resume primitive before terminal adapter implementation. Be careful with Windows/MSYS path conversion and command quoting when invoking `wt`; use argv-array/no-shell spawning and Windows-native paths for native terminals. For Ghostty, confirm the installed CLI syntax before hardcoding tab arguments, because Ghostty tab/window command support can vary by version/platform.
