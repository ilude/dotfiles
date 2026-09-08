---
created: 2026-09-08
status: completed
completed: 2026-09-08
---

# Observable subagent work and reliable outcomes

## Goal and authorization
Implement the operator-approved headless UX improvements: user-only progress without model turns or transcript spam; automatic completion/failure delivery to the originating parent; explicit detached waits, inspection, reattachment and cancellation; concrete bounded transport errors. Preserve visible Herdr defaults and user-only approvals. Local commits and integration authorized; no push, deployment, production relinking, automatic job timeout/retry or scheduler. Do not infer productivity from heartbeats. No configurable silence-warning threshold is required; show activity age without inventing a failure.

## Context
All source paths are repository-root-relative. Owning repository is dotfiles; default Pi only. Worktree `C:/Users/mglenn/.dotfiles/.worktrees/subagent-headless-ux`, branch `feature/subagent-headless-ux`, integration target `main` at `C:/Users/mglenn/.dotfiles` (initially clean, 59b6b0a0). Planning profile verified via PI_CODING_AGENT_DIR: default at main `pi/profiles/default`; validation uses worktree default profile. Read root/default AGENTS, pi/README.md, default docs/subagents.md, installed Pi extensions/RPC/TUI docs, testing skill before implementation.

Existing root/coordinator descriptions already reserve headless overrides inside Herdr for user requests. Incident launch arguments explicitly selected headless. Two assignments eventually completed; one exceeded the 1 MiB JSONL limit. Exact original offending event is not yet identified. Existing origin-bound acknowledged deliveries and process-global runtime should be extended, not replaced by a broker.

## Contracts
- Progress is coalesced UI-only state with assignment start, phase, meaningful activity age, tool name and separate process/transport state. No reasoning or tool arguments exposed.
- Terminal results/errors reach originating parent automatically when safe, without duplicate delivery across reload/chat changes. Busy parents must not lose outcomes. UI also exposes terminal errors promptly.
- Stop waiting detaches without cancellation and says so. Reattach waits on the same child. Cancel terminates owned work with concrete cleanup diagnostics.
- A compact origin-scoped widget is an implementation choice; continuously visible activity age replaces any unapproved warning threshold.
- Investigate native RPC event shapes, preserve explicit resource bounds and final-result bounds, observe initial prompt rejection. Do not silently discard possible outcome events.

## Execution guidance
Use the task worktree. Preserve unrelated work. Before expanding work, identify the existing requirement and evidence requiring it. If an assumption fails, adjust within scope or ask only for a consequential scope decision. At checkpoints remove task-created unnecessary extras safely, retain required behavior, and continue. No progress-only handoff while actionable work remains. Stop after finite agreed checks pass.

## Tasks
- [x] T1: Inspected runtime.ts, rpc.ts, framing.ts and extensions/subagents.ts. Native agent_end aggregation reproduces the 1 MiB failure with a 1,201,474-byte synthetic frame. Incident journal sizes/timing strongly support this mechanism but raw original frame is unavailable. See investigation.md. Existing root origin delivery is idle-only and coordinator parentId delivery needs review.
- [x] T2 (T1): Implemented separate phase/activity/contact/process/wait state, a growing bounded JSONL buffer and 16 MiB native RPC allowance (application 256 KiB/final 24k unchanged), prompt rejection and concrete owned-cleanup diagnostics. Native RPC fixtures verify aggregate >1 MiB completion, over-bound rejection, provider failure and cleanup reporting.
- [x] T3 (T2): Implemented one-second origin widget, same-child model/user waits and explicit detached notices without contaminating result text. Root and coordinator outcomes return automatically with journal acknowledgement; user-only approvals route to the originating user. UI-only progress, silence, busy parent, multiple children, reattachment, retained turns and actual native Pi reload/chat-switch journal delivery pass. Old process-global owners remain intact across code upgrade; reloaded tools explain the fresh-process boundary rather than silently running old launch/wait behavior.
- [x] T4 (T2,T3): Final worktree default run on 2026-09-08: `pnpm test subagent herdr-launch.test.ts session-launch.test.ts tool-visibility.test.ts herdr-ui-prompt-state.test.ts` passed 65 tests, 3 opt-in model/live tests skipped (14 files passed, 2 skipped). `pnpm run typecheck`, `pnpm run check:runtime` (Pi 0.85.0, no model calls) and `git diff --check` passed. Isolated `PI_HERDR_FOCUS_LIVE=1 pnpm test herdr-background-focus.test.ts` also passed, including preflight/create/cleanup across tabs/workspaces. Docs and CHANGELOG updated. Scope checkpoint: no scheduler, job timeout/retry, production relink or focus-restore workaround. Attached-client focus jump remains unreproduced, not fixed; see investigation.md.
- [ ] T5 (T4): Archive whole spec with completion date, commit locally, merge to recorded main preserving concurrent edits, verify integration and remove clean task worktree. No push.

## Validation and handoff
Finite checks: default subagent regression files plus affected UI/lifecycle tests, pnpm run typecheck, pnpm run check:runtime, git diff --check. Tests must assert UI progress does not send model messages, terminal outcomes do, busy/origin/reload isolation, same-child reattachment, concrete initial prompt/provider/oversize failures and cleanup. Use real runtime with controlled native RPC fixtures where provider silence is deterministic; distinguish automated UI evidence from physical operator experience. T1-T4 complete and checks passed. The initial delegated prototype was incomplete; the orchestrator implemented and validated the delivered source. Both task child processes/panes have settled and closed. No implementation blocker for the headless changes. Next T5 local integration. Concurrent main changes to operator-footer.ts, scheduler.ts, scheduler-footer.test.ts and agent-process logs are unrelated and must remain untouched. Verification limits: no physical attached-client focus confirmation or live provider/model run; the reported focus jump is a separate unresolved observation, not a claimed fix.
