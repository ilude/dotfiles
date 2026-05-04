---
created: 2026-05-03
status: draft
completed:
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
| T1 | Discover Pi session branching/resume APIs | 2-4 | feature | medium | planning-lead | -- |
| T2 | Implement terminal launcher adapters for `/branch` | 2-4 | feature | medium | typescript-dev | -- |
| V1 | Validate wave 1 | -- | validation | medium | validation-lead | T1, T2 |
| T3 | Wire `/branch [tab-name]` command and tests | 3-5 | feature | medium | typescript-dev | V1 |
| V2 | Validate wave 2 | -- | validation | medium | validation-lead | T3 |

## Execution Waves

### Wave 1 (parallel)

**T1: Discover Pi session branching/resume APIs** [medium] -- planning-lead
- Description: Inspect Pi runtime/extension APIs and current session storage to determine the smallest reliable way to clone current conversation/session state and start a new Pi process attached to the cloned branch.
- Files: `pi/extensions/workflow-commands.ts`, `pi/extensions/context.ts`, relevant Pi session/runtime files under `pi/` or imported runtime APIs
- Acceptance Criteria:
  1. [ ] Branching approach is documented in implementation notes or code comments.
     - Verify: `grep -R "branch" -n pi/extensions pi/lib 2>/dev/null | head -40`
     - Pass: Output identifies the new command/branch helper and the runtime API or storage path it uses.
     - Fail: No concrete branch helper/API is identifiable; inspect runtime package types and session files before proceeding.

**T2: Implement terminal launcher adapters for `/branch`** [medium] -- typescript-dev
- Description: Add a small internal launcher abstraction that detects Windows Terminal and Ghostty, builds properly quoted commands, sets the tab title, and falls back to printing a manual command. Keep this internal; do not add user-facing flags.
- Files: likely `pi/extensions/workflow-commands.ts` plus optional helper under `pi/lib/` or `pi/extensions/branch-terminal.ts`
- Acceptance Criteria:
  1. [ ] Launcher supports Windows Terminal, Ghostty, and fallback paths.
     - Verify: `grep -R "WT_SESSION\|wt.exe\|Ghostty\|ghostty" -n pi/extensions pi/lib 2>/dev/null`
     - Pass: Output shows detection/launch logic for both terminal families.
     - Fail: Only one terminal is implemented or fallback is missing; add the missing adapter before validation.
  2. [ ] Tab title defaults from cwd basename and supports an override value.
     - Verify: `grep -R "basename\|tab.*title\|title" -n pi/extensions pi/lib 2>/dev/null | head -80`
     - Pass: Output shows title derivation and propagation into terminal launch arguments.
     - Fail: Title is hardcoded or ignored; implement default and argument override.

### Wave 1 -- Validation Gate

**V1: Validate wave 1** [medium] -- validation-lead
- Blocked by: T1, T2
- Checks:
  1. Run acceptance criteria for T1 and T2.
  2. `cd pi/extensions && pnpm install --frozen-lockfile && pnpm run typecheck` -- typecheck passes.
  3. Cross-task integration: verify terminal launching receives a concrete branched-session command from the discovered branch/resume mechanism.
- On failure: create a fix task, re-validate after fix.

### Wave 2

**T3: Wire `/branch [tab-name]` command and tests** [medium] -- typescript-dev
- Blocked by: V1
- Description: Register `/branch` in Pi workflow commands, parse the optional tab-name argument, create the branched session, invoke the launcher, notify the user clearly, and add/extend tests for default title, custom title, terminal detection, and fallback behavior.
- Files: `pi/extensions/workflow-commands.ts`, new helper file if created, `pi/tests/**` or existing extension test files
- Acceptance Criteria:
  1. [ ] `/branch` is registered and documented in command descriptions.
     - Verify: `grep -n "registerCommand(\"branch\"\|/branch" pi/extensions/workflow-commands.ts`
     - Pass: Output shows command registration and/or header documentation.
     - Fail: Command is not registered; wire it into the extension registration block.
  2. [ ] Tests cover default cwd basename title and custom argument title.
     - Verify: `grep -R "branch" -n pi/tests pi/extensions/*.test.ts 2>/dev/null | head -120`
     - Pass: Output shows tests or test fixtures for title behavior and launcher fallback/detection.
     - Fail: Add focused tests before final validation.

### Wave 2 -- Validation Gate

**V2: Validate wave 2** [medium] -- validation-lead
- Blocked by: T3
- Checks:
  1. Run acceptance criteria for T3.
  2. `cd pi/extensions && pnpm install --frozen-lockfile && pnpm run typecheck` -- exits 0.
  3. `cd pi/tests && pnpm install --frozen-lockfile && pnpm run test` -- exits 0.
  4. `make check` -- exits 0 with no errors or warnings.
- On failure: create a fix task, re-validate after fix.

## Dependency Graph

```
Wave 1: T1, T2 (parallel) → V1
Wave 2: T3 → V2
```

## Success Criteria

1. [ ] End-to-end automated validation passes.
   - Verify: `cd pi/extensions && pnpm install --frozen-lockfile && pnpm run typecheck && cd ../tests && pnpm install --frozen-lockfile && pnpm run test && cd ../.. && make check`
   - Pass: All commands exit 0 with no errors or warnings.
2. [ ] User-facing behavior is correct in a supported terminal.
   - Verify: Start Pi in Windows Terminal or Ghostty, run `/branch`, then run `/branch custom-name`.
   - Pass: Each command opens a new tab attached to a branched Pi session; first tab title is cwd basename, second is `custom-name`.

## Validation Contract

`/do-it` must satisfy this contract before reporting the plan complete or archiving it.

### Required automated validation

1. [ ] Run the strongest repo-wide validation command or command set for this project.
   - Command: `cd pi/extensions && pnpm install --frozen-lockfile && pnpm run typecheck && cd ../tests && pnpm install --frozen-lockfile && pnpm run test && cd ../.. && make check`
   - Pass: exits 0 with no errors or warnings
   - Fail: do not archive; update `## Execution Status` with the failing command and next fix

2. [ ] Run task-specific verification from every acceptance criterion above.
   - Command: see each task's `Verify:` command
   - Pass: every acceptance criterion passes exactly as written
   - Fail: create/fix a task, rerun affected checks, then rerun repo-wide validation

### Manual validation

- Required: yes
- Steps:
  1. In Windows Terminal or Ghostty, run `/branch` from a Pi session and confirm a new tab opens with title equal to the cwd basename and a branched Pi session attached.
  2. Run `/branch custom-name` and confirm the new tab title is `custom-name`.

If manual validation is required and not confirmed passed, `/do-it` must classify the result as `implemented-awaiting-manual-validation`, update `## Execution Status`, and must not archive the plan.

### Deployment validation

- Required: no
- Procedure: None.

If deployment is required and skipped, cancelled, or fails, `/do-it` must not archive the plan.

### Archive rule

`/do-it` may archive this plan only after all required automated validation, task-specific verification, manual validation, deployment validation, and repo-wide validation pass.

## Handoff Notes

Keep the UX minimal: `/branch` and `/branch <tab-name>` only. Do not add flags unless implementation discovers an unavoidable runtime constraint. Be careful with Windows/MSYS path conversion and command quoting when invoking `wt`; use PowerShell or native Windows paths if required by Windows Terminal. For Ghostty, confirm the installed CLI syntax before hardcoding tab arguments, because Ghostty tab/window command support can vary by version/platform.
