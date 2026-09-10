---
created: 2026-09-09
status: completed
completed: 2026-09-09
---

# Command invocation ownership with interactive steering

## Goal and scope

Preserve the operator's ability to interact with and steer the orchestrator while it works. Bind command-specific tool authority and `/commit push` permission to the relevant delivered invocation, not mutable command globals.

Non-goals: finish-first queues, busy-command rejection, serializing the whole conversation, command chaining, a generic task framework, changes to Luna's Git workflow, broader Git permissions, OS sandboxing, or other review findings. Do not add rollback work.

Authorization: planning only. Separate execution authorization includes local task commits and merge into `main`, not push/deployment.

## Context for a fresh session

All paths are dotfiles-root-relative. Read current root/default `AGENTS.md` files.

- Proposed worktree: `../.dotfiles-worktrees/default-command-invocation-ownership`.
- Proposed branch: `fix/default-command-invocation-ownership`; merge target: dotfiles `main`.
- Required reading: `pi/profiles/default/docs/{commands,commit}.md`, `extensions/commands.ts`, `commands/index.ts`, `commands/commit/reviewer.ts`, `tests/commit-reviewer.test.ts` under the default profile; AIF-022 in its instruction-feedback log.
- Read installed Pi `docs/extensions.md` completely and relevant SDK examples before implementation. Inspect the actual installed version rather than assuming a run-ID API exists.
- Starting evidence: `commands.ts` mutates `running` and tool visibility at submission; `commands/index.ts` mutates module-global `commitPushRequested`; `commit_run` reads that flag when execution begins.
- Offline reproduction on 2026-09-09 used actual command registration/registry and an inert commit tool: submission of `/commit push` changed a prior callable's permission before any queued prompt was delivered. `/bro` revoked the earlier tool. No Git mutation occurred.
- Installed Pi 0.85.0: `AgentSession.prompt()` runs extension commands immediately while streaming. `sendCustomMessage()` retains details and uses native steering by default. `agent-loop.js` prepares its next tool snapshot BEFORE emitting steering `message_start`; an idle prompt also starts from a tool snapshot. Therefore delivery-time-only schema activation can be one response too late.
- Checkout was clean before plan creation. Preserve concurrent changes on execution.

### Profiles and evidence

Planning profile: verified default at `pi/profiles/default`. Implementation/validation: default only; legacy unchanged. The command reproduction and installed-source trace are planning evidence, not SDK integration acceptance.

## Decisions and contracts

| Decision | Authority | Choice |
| --- | --- | --- |
| D1 | Explicit operator correction | Accept mid-work commands and deliver through native steering. Do not wait for the current workflow to finish. |
| D2 | Existing commit contract | Push comes from the slash invocation, never model-chosen tool arguments. |
| D3 | Existing lifecycle contract | Keep authority across retries/compaction and ordinary steering; clear at settlement/session teardown. Preserve unrelated tools. |
| D4 | User scope confirmation | Fix ownership, not Git execution or other extension subsystems. |

Proposed implementation:

- Argument parsing returns immutable invocation data without side effects. Each submission creates a process-local `{ id, command, options }`; commit options contain its boolean `push`.
- The hidden `profile-command-prompt` carries an invocation ID in `details`. Authority is looked up in the locally created record map, not trusted from model text, arbitrary details, or restored history.
- Send explicitly with `deliverAs: "steer", triggerTurn: true`. Native steering is consumed at Pi's supported turn boundary, not in the middle of an executing tool. This plan does not interrupt or restart an already executing commit workflow.
- Prepare needed schemas before submitting the prompt so Pi's tool snapshot includes them. Add tools without removing tools used by the current batch. Schema availability alone grants no execution authority.
- At actual matching custom-message delivery, select that invocation as current. On owned `tool_call`, bind `toolCallId` to the current immutable invocation and validate that the tool belongs to its command. The wrapper reads that binding. A later submission cannot alter already-bound options.
- Retain records only while current, pending delivery, or referenced by calls. Release call bindings after results and clear session-owned state at settlement/shutdown. Do not reconstruct authorization from old transcript entries. A pending/invalid command must not deactivate valid in-flight work.
- Schema cleanup must not remove tools from an executing batch. Remove owned schemas on settlement/shutdown while preserving unrelated extensions' changes. Any temporary superset of prepared schemas remains guarded by invocation ownership.

No SDK modification is currently proposed. If the actual loader cannot implement this delivery/binding contract, record the precise limitation and ask before changing interactive steering; do not silently substitute follow-up delivery.

## Execution guidance

Create the task worktree/branch only when execution is authorized. Carry and maintain the plan there; preserve unrelated work. Prefer a small invocation record and binding map over a service framework. Keep validation finite. If evidence invalidates a mechanism, change the implementation detail within the same contract; ask before changing operator behavior. Remove task-created detours without deleting others' work.

## Tasks

- [x] **T1 - Introduce immutable invocation data and delivery-bound authority**
  - Depends on: none.
  - Files: existing `extensions/commands.ts`, `commands/index.ts`, `commands/commit/reviewer.ts`; proposed `lib/command-invocations.ts` only if it makes the state transitions clearer.
  - Do: implement the contract above; remove mutable `commitPushRequested` and command-name-only authorization. Keep the public `commit_run` parameters unchanged and supply resolved invocation options internally. Separate schema preparation from authority activation.
  - Verify: trace idle submission, streaming submission, delivery, tool preflight, execution, result, settlement and teardown; author T2 regressions against those transitions.
  - Done when: submission cannot change an older call's options and native steering remains the delivery path.
  - Evidence: Added `lib/command-invocations.ts`; command arguments now return frozen invocation options, delivery selects only process-local invocation IDs, and tool calls bind immutable invocation records before execution.

- [x] **T2 - Add finite transition regressions and runtime-boundary evidence**
  - Depends on: T1.
  - Files: proposed `tests/command-invocations.test.ts` and `tests/commands-lifecycle.test.ts`; existing `tests/commit-reviewer.test.ts`.
  - Do: test bare commit followed by push and the reverse; submission before old tool execution; `/bro` steering; ordinary user steering; invalid invocation while work is active; retries/compaction continuity; session cleanup; preservation of unrelated active tools.
  - Verify: one offline installed-Pi/Agent integration fixture with a deterministic stream and inert command tool proves the steered command and its tool schema reach the next response while the earlier workflow has not settled, and its tool reads the correct invocation. Assert old calls retain their own options. No real Git or model calls.
  - Done when: behavior is covered at the real event/tool-snapshot boundary, not solely by a fake event emitter.
  - Scope checkpoint: no finish-first queue, busy gate, or arbitrary router has been introduced.
  - Evidence: Added focused authority/lifecycle tests, including a deterministic installed `Agent` stream that holds an earlier tool, steers the command, observes the prepared next-turn schema, and verifies the bound push option without Git or model calls.

- [x] **T3 - Document, validate and integrate**
  - Depends on: T2.
  - Files: `docs/commands.md`, `docs/commit.md` under default; root `CHANGELOG.md`.
  - Do: explain native steering and invocation-bound permissions, including schema availability versus authority. Run final checks, record actual profile/results, then archive and merge locally.
  - Verify: checks below pass and target contains implementation plus dated archive.
  - Done when: integrated behavior preserves D1-D3; no live commit/push acceptance is required.
  - Evidence: Updated default-profile command/commit documentation and root changelog. On 2026-09-09 in the default profile, 11 focused tests passed; `pnpm run typecheck`, `pnpm run check:runtime`, and `git diff --check` passed.

## Agreed validation and finish

From `pi/profiles/default` in the task worktree:

```sh
pnpm test command-invocations.test.ts commands-lifecycle.test.ts commit-reviewer.test.ts
pnpm run typecheck
pnpm run check:runtime
```

The first two test files are proposed. The loader fixture must use an empty temporary profile and deterministic provider/tool substitutes, not load the operator's unrelated extensions. Classify baseline failures; fix only task-relevant defects and rerun affected checks. Stop when these pass.

## Current handoff

- Status: implementation and local integration into recorded target `main` completed on 2026-09-09; cleanup verification remains.
- Completed: T1-T3 implementation, focused regressions, runtime-boundary fixture, documentation, changelog, archive, task commit, and merge conflict resolution.
- Next: commit this completion metadata on `main`, verify the target, and remove temporary/task worktrees.
- Open operator decisions: none. No operator manual or live testing is required.

## Completion and archive

Set completed status/date only after the agreed work/checks. Move this directory to `.specs/archive/default-command-invocation-ownership/` in the task worktree; never overwrite an archive. Repair affected links. Commit implementation, changelog and archived plan together, then merge into `main`, preserving unrelated target changes. If blocked, retain the worktree and distinguish completed implementation from pending integration. Verify archive/implementation on target and no active plan remains. Only rerun checks changed by conflict resolution; remove worktree after clean integration. No push.
