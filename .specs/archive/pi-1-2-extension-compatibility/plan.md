---
created: 2026-10-13
status: completed
completed: 2026-10-13
---

# Make default Pi extensions compatible with Pi 1.2.0

## Goal and scope

Keep the default profile working on installed Pi 1.2.0, preserve Sol 6.1/low startup, fix the confirmed lifecycle API break, and resolve the provider/login mismatch without confusing native OpenAI with legacy Codex routing.

- Requested now: investigation and a standalone implementation plan only.
- Implementation, worktrees, commits, merge, push, and deployment are not authorized by planning. `/do-it` authorizes implementation, dedicated task worktrees, local commits, and merge unless `--no-merge` applies. Push/deployment remain separately authorized.
- Preserve legacy contents, credentials, subscription/API distinctions, existing model-family/version behavior, safety policy, billing warnings, and unrelated work.
- Non-goals: a blanket provider-string replacement, new authentication flows, copying credentials between providers, upgrading Pi again, broad extension redesign, adding optional Pi 1.2.0 features, or another subagent lifecycle rewrite.

## Fresh-context handoff

All paths below are relative to `C:/Users/mglenn/.dotfiles` unless absolute.

- Ownership: dotfiles repository, active profile `pi/profiles/default/`. No module or legacy changes are planned.
- Read applicable `AGENTS.md`, `pi/README.md`, the default profile's `skills/pi-extension/SKILL.md`, and this spec's [investigation](investigation.md). Read installed API docs/types for affected calls before editing.
- Verified planning runtime: default profile linked to Pi 1.2.0. Baseline HEAD was `eca70a6d` on `main`, 2026-10-13. Intended execution profile is default only.
- Native `openai` still supports ChatGPT OAuth. Legacy `openai-codex` is also supported but is a different provider/auth/API route. The active profile has legacy Codex OAuth, not native OpenAI OAuth.
- Startup repair history: settings temporarily selected `openai-codex/gpt-6.1-sol` while native login was missing; the native junction points to default. On 2026-10-13 the operator completed native login, settings were restored to `openai/gpt-6.1-sol`, and native/wrapped startup plus a native authenticated request passed. See T2 evidence.
- Preserve concurrent edits and the verified native Sol 6.1/low default.
- Originating integration target: `C:/Users/mglenn/.dotfiles`, branch `main`. Proposed task worktree: `.worktrees/pi-1-2-extension-compatibility`, proposed branch: `task/pi-1-2-extension-compatibility`. Execution records actual coordinates before changes. Runtime-prepared coordinates supersede these proposals, never the integration target.

## Settled provider decision and prerequisite

On 2026-10-13 the operator selected **restore native OpenAI login**. Retain native-oriented extensions; dual-provider compatibility is outside scope.

The operator must sign into native OpenAI through `/login` in the actual default profile, selecting the ChatGPT subscription flow for provider `openai`, not legacy `openai-codex` or an API key. This requires operator interaction; agents must not copy or relabel credentials. Keep the working legacy startup repair until native authentication and model availability are established, then restore `openai/gpt-6.1-sol` and low effort.

The first read-only auth check on 2026-10-13 returned `not_ready`. After the operator completed `/login`, the same check returned `ready`, `authType: oauth`; T2 startup and authenticated-request checks passed. The login prerequisite is resolved. T1 remains unimplemented and can proceed during authorized execution. No source migration to legacy routing is needed.

## Implementation contract

- In Herdr's first-user-prompt naming handler, check `event.messageType === "user"` before reading `prompt` or consuming first-prompt state. Custom-triggered runs must not consume that opportunity.
- System-prompt handlers for delegation, successor authority, and branch context continue applying to both user and custom runs. No blanket early-return guards.
- Use native provider APIs and actual model descriptors. `openai` classifiers remain separate from subscription chat; legacy does not provide a replacement for the Decisions API.
- Sol remains pinned to 6.1. Do not select older Sol or change effort defaults. Existing family shortcuts, safety decisions, timeout/retry behavior, and explicit provider requests remain otherwise unchanged.
- Quota credential resolution already supports both routes. Do not replace it unnecessarily. Native-only Daybreak retry remains scoped to its verified API/error unless new concrete evidence establishes an additional case.
- Do not treat unmatched scope warnings caused by missing auth as proof that every model ID is stale. Reconcile scope against the chosen authenticated provider and actual chat catalog.
- Changes on disk do not retrofit an existing session. State the required reload/restart specifically. Do not reload while subagents are active.

## Execution guidance

Create or resume the dedicated task worktree and record its path, branch, and originating integration target before editing. If runtime-prepared context matches this plan, use it without creating a second worktree. Carry task-owned plan/settings work without deleting or discarding the source copy.

Consult Strategist before delegating unless the operator explicitly requests a single-agent handoff, including a Team Lead. Team Leads retain their Strategist-first workflow. Assign at most one named plan task per subagent; split large tasks and preserve disjoint writes. Use active catalog roles only.

Adapt routine implementation mechanisms within settled intent. Ask before changing scope, provider choices, or acceptance. Continue independent work around blockers. Keep tasks, evidence, actual runs, blockers, next actions, and action owners accurate. Stop when finite checks pass and evidenced task-related defects are resolved.

## Tasks

- [x] **T1: Adapt first-prompt naming and event fixtures to Pi 1.2.0**
  - Depends on: none; can proceed independently of operator login.
  - Owns: `extensions/herdr-orchestrator-label.ts`, `tests/herdr-orchestrator-label.test.ts`, `tests/fixtures/plan-closeout-provider.ts`, `tests/session-launch.test.ts`, under default profile.
  - Guard user-only naming before first-prompt state mutation. Update typed user fixtures with `messageType`; make the live fixture handle the discriminated event without pretending every run has a prompt.
  - Add behavioral coverage for custom-triggered startup followed by a real user prompt, and ensure shared branch/delegation context remains valid on custom runs using existing focused fixtures where applicable.
  - Verify: default-profile `pnpm run typecheck`; `pnpm test herdr-orchestrator-label.test.ts session-launch.test.ts prepared-plan-session.test.ts --maxWorkers=4`.
  - Done when the three baseline type errors are fixed and custom runs neither read missing prompt data nor consume first-user naming.
  - Evidence: 2026-10-13, executed in runtime-prepared `C:/Users/mglenn/.dotfiles/.worktrees/pi-1-2-extension-compatibility`, branch `task/pi-1-2-extension-compatibility`, target `C:/Users/mglenn/.dotfiles` on `main`, starting commit `eca70a6d`. User-only guard precedes prompt access and state mutation; fixture records messageType and clears user prompt for custom runs. Added custom-startup then user naming coverage and branch-context equivalence on custom runs. Typecheck passed on installed Pi 1.2.0 after `bash scripts/pi-deps-link-setup --profile default` supplied missing task-local runtime peers. Initial typecheck failure was missing peers, not an additional source defect. The finite T3 run includes all three T1 files and passed.

- [x] **T2: Restore and verify native OpenAI startup**
  - Depends on: operator completes native `openai` subscription `/login` in default. Parallel with T1; no shared source writes.
  - Owns: `pi/profiles/default/settings.json`; login and credentials remain owned by Pi and the operator.
  - Verify native auth availability without emitting credentials. Confirm `openai/gpt-6.1-sol` is available through the installed runtime. Then change only the temporary legacy default/scope repair back to native `openai`, keeping Sol 6.1 and low effort. Preserve other settings and saved credentials.
  - Reconcile any remaining proven scope mismatch against the authenticated native catalog using the existing refresh command, not wholesale prefix replacement or speculative deletion. Preserve current curated ordering and other providers.
  - Do not modify native-oriented selection, refresh, visibility, resume, usage, or classifier implementations unless checks establish a task-related defect; dual-provider compatibility is excluded.
  - Verify native and wrapped launches select `openai/gpt-6.1-sol` at low effort, and one bounded authenticated request through the affected native launch succeeds. Keep provider/model overrides out of startup probes and omit `PI_CODING_AGENT_DIR` for native launch.
  - If native login is unavailable or fails, keep the working legacy settings, continue T1, and record the exact prerequisite and operator action. Do not declare native restoration complete from credential metadata alone.
  - Evidence: Completed directly in the operator checkout on 2026-10-13 after operator login, before plan execution. `pi auth check --provider openai --json --no-refresh` reported native OAuth ready. Restored only temporary default-provider and Sol-scope changes to `openai`. `node scripts/pi-setup-smoke.mjs --root C:/Users/mglenn/.dotfiles` passed native and wrapper startup selection on Pi 1.2.0. A native `pi.ps1` RPC launch in this workspace, without provider/model/profile overrides, selected `openai/gpt-6.1-sol` at low thinking and returned `OK` to a minimal authenticated prompt. That request disabled extensions/tools/resources to isolate authentication; normal-extension startup and T1 lifecycle behavior are not established by it. No credentials were copied and no extension code changed.

- [x] **T3: Validate selected workflow and document compatibility**
  - Depends on: T1 and T2.
  - Run the finite checks below, fix established task-related defects, and record exactly which providers and profiles were exercised.
  - Update `pi/README.md`, relevant existing default docs, and root `CHANGELOG.md` to describe the chosen provider workflow and 1.2.0 event compatibility. Do not rewrite AGENTS.md, roles, or skills as an incidental cleanup.
  - Done when checks pass, selected model/provider behavior matches the approved workflow, and restart/verification limits are explicit.
  - Evidence: 2026-10-13 default-only typecheck passed. Finite Vitest command selected 11 files / 155 tests, all passed with `--maxWorkers=4`; all named filters exist except `codex-usage.test.ts`, which is absent and selected no tests. No replacement suite or full audit was added. Native model fixtures were exercised, not legacy routing. README, existing Herdr docs, and changelog document native OpenAI login, Sol 6.1/low, discriminated startup events, and settled reload/restart limits. Settings already contain native OpenAI Sol 6.1/low, with no new settings or credential changes. T2's bounded authenticated request is retained because the implementation does not invalidate auth/provider routing. Native alias remains on the lasting target checkout, not this disposable task. Post-integration offline native/wrapped startup smoke belongs to the orchestrator after successor readiness. Interactive Herdr UX remains optional and unverified. `git diff --check` passed.

- [x] **T4: Archive, commit, integrate, and clean up authorized execution**
  - Depends on: T3, authorization through `/do-it` or equivalent, and resolved provider scope.
  - Apply the closeout contract below. Leave integration/cleanup unchecked when blocked or intentionally skipped.
  - [x] Evidence: Implementation and agreed checks complete; whole spec archived and task commit integrated locally. Completion metadata committed on `main`; exact-origin retirement observed and task worktree removed. Task branch retained. No push/deployment authorized.

## Finite validation

From `pi/profiles/default/`:

1. `pnpm run typecheck`.
2. `pnpm test herdr-orchestrator-label.test.ts session-launch.test.ts prepared-plan-session.test.ts model-selection.test.ts model-shortcuts.test.ts subagent-model-resolution.test.ts resume-latest-model.test.ts refresh-models.test.ts model-visibility.test.ts codex-usage.test.ts herdr-tab-naming.test.ts commit-retry.test.ts --maxWorkers=4`. Confirm file names before running; omit a nonexistent filter rather than silently treating zero tests as a pass.
3. Shared selection is not planned to change. Run its existing focused tests above to establish native model behavior; do not add a dual-provider test matrix or full-suite audit.
4. From repo root: `node scripts/pi-setup-smoke.mjs --root <task-checkout>` only when native alias matches that checkout. Do not repoint the operator's live alias to a disposable worktree just to satisfy this assertion. Otherwise use the same native/wrapped RPC probe mechanism against the actual integration checkout after integration and describe what was tested. No provider/model override may mask startup selection; native probes must omit `PI_CODING_AGENT_DIR`.
5. One bounded authenticated Sol request through the affected native launch, in the operator's workspace, for the chosen authenticated route. No tools needed; no secret output. Repeat only if implementation invalidates prior results. Native login is an operator prerequisite for T2, not optional acceptance testing. If unavailable, native restoration remains blocked while independent implementation continues. Interactive Herdr UX testing remains optional and non-blocking.

Baseline: typecheck failed in 3 event-related locations; 5 focused files/69 tests passed on 2026-10-13. T2's native/wrapped startup and native authenticated request now pass, as recorded above. T1 implementation and its checks remain pending. See investigation for original evidence and limits.

## Current handoff

- Status: T1 through T4 complete; authorized local integration and closeout complete. Source changes require settled `/reload` or a fresh Pi process.
- External prerequisites/open design decisions: none. Existing sessions retain their selected model until switched or restarted.
- Execution profile: default. Legacy is excluded.

## Closeout

After implementation and agreed agent-owned checks, archive the entire spec directory to `.specs/archive/pi-1-2-extension-compatibility/` after confirming the destination does not contain another plan. Commit implementation and archived spec on the task branch; do not archive unfinished implementation.

For authorized `/do-it`, dispatch the Integrator from the recorded target checkout after that commit with the closeout manifest. It owns local integration, completion metadata, and cleanup. Ordinary direct/run-here execution keeps user questions/reporting with the orchestrator. Prepared Herdr execution uses the runtime-admitted same-tab successor: integration readiness, explicitly authorized orchestrator-only obligations, exact-origin graceful retirement, then successor cleanup and final reporting. Preserve runtime coordinates; do not create a second worktree or retire the origin before readiness.

If blocked, retain worktree/panes and record reason, next action, and action owner. Routine merge conflicts are agent-owned. If `--no-merge`, retain the committed task worktree and skip mutating integration. Manual operator UX testing is non-blocking. Do not label unavailable native authentication as verified. Integrator records completion date/status/evidence and commits metadata before removing the clean task worktree. Push/deployment require separate authorization.

Final reporting starts with explicit text and the corresponding symbol: 🟢 COMPLETED, 🔴 NOT COMPLETE: MERGE BLOCKED or USER INPUT REQUIRED, 🔵 IMPLEMENTED: MERGE SKIPPED AS REQUESTED, or 🟡 CLEANUP PENDING. Blocked/pending reports lead with reason and action needed, including the owner and exact next action, before passed checks. Include concise checks, archived spec, commits, integration result, and retained paths. Do not claim integration or cleanup complete from a task commit alone.

## Integration evidence

Default Pi 1.2.0 typecheck passed after `bash scripts/pi-deps-link-setup --profile default` linked missing task-local runtime peers. Finite Vitest selection passed 11 files/155 tests with four workers; absent `codex-usage.test.ts` selected no tests. `git diff --check` passed. T2 native/wrapped Sol 6.1 low startup and bounded native authenticated request passed; the auth request was not repeated. After integration, the origin ran `node scripts/pi-setup-smoke.mjs --root C:/Users/mglenn/.dotfiles`, exit 0: Pi 1.2.0 native and wrapper load and select default `openai/gpt-6.1-sol`. This offline smoke did not make a model request or verify authentication; T2's authenticated request remains valid. Interactive Herdr UX remains optional and unverified. No legacy files or credentials changed; no publication authorized. Target `main` is at `9ca3550cb06336495281a27939cec26acb247f38` before this completion-evidence update; task commit `b4d6c913329bf444c13e70e01db6e978be1f3987` was integrated, and task branch `task/pi-1-2-extension-compatibility` is retained. Task worktree `.worktrees/pi-1-2-extension-compatibility` was removed.
