---
status: research-note
source:
  - https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/docs/session-format.md
  - https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/docs/rpc.md
  - ../../../../../pi/profiles/default/extensions/session-launch.ts
  - ../../../../../pi/profiles/default/docs/herdr.md
---

# Pi context separation options

## Why this matters

The operator wants an early offer to separate a growing process-improvement discussion from task work, not automatic branching or a rigid workflow. Commands and alternatives should remain discoverable so actual use can guide later refinement.

Investigated against installed Pi **0.85.1** on Windows, 2026-09-13. Upstream links are navigation, not pinned evidence; the installed README, session-format, RPC, skills documentation and runtime source were inspected. No real conversation was forked or edited during the investigation. The operator subsequently approved the bounded `/branch` repair described below; skill changes remain unimplemented.

## Useful signals

### Skills do not have a deterministic firing event

Pi places skill names and descriptions in the system prompt. The model decides when to read the full skill; automatic loading is not guaranteed. `/skill:agent-process` explicitly expands the skill. References are conditional reading, not a second automatically loaded prompt. Keep the description useful and put the context-separation offer early enough that it precedes a long investigation.

### Commands have different effects

| Option | Effect | Evidence / limitation |
| --- | --- | --- |
| `/fork` | Pick a previous user message on the active branch. Creates a new session and switches the current Pi process to it. Context ends **before** the selected message; its text goes into the editor, unsent. | Native runtime exercised through RPC; TUI selector/editor behavior inspected in installed interactive-mode source, not clicked live. |
| `/clone` | Copies the current active path into a new session and switches this process to it, with an empty editor. | Native runtime exercised through RPC; does not remove a digression. |
| `/tree` | Navigate within the same session file. A no-summary navigation can exclude the later discussion from active context while preserving it in the tree. | SessionManager context construction exercised; TUI navigation source inspected. Selecting a user entry may put its text back into the editor; an assistant checkpoint is less ambiguous for continuation. |
| `/new-instance [title]` | Repository command opening a fresh Pi tab with the same profile and cwd. No conversation handoff is supplied automatically. | Source inspected; existing launch tests passed with terminal subprocesses mocked. Not live-launched in this investigation. |
| `/branch [title]` | Repository command copies the current path into another tab. The repaired implementation keeps parent and child in separate files and records reciprocal visible, context-excluded relationship markers. | Repair passed real-manager tests and installed extension-loader inspection. Reload to activate; live two-tab behavior remains untested. See below. |
| `pp --fork <session-id-or-path>` | CLI creates a new session from an existing session, rather than selecting a historical prompt. | Installed README and `SessionManager.forkFrom` examined; storage behavior exercised. No new interactive CLI tab tested. |
| `pp --session <session-id-or-path>` | Opens the existing saved session, not a copy. | Native session loading exercised. Use an explicit profile when it differs from default: `pp -p <profile> --session <id-or-path>`. |
| `herdr_layout {action: "resume", session: "<UUID>"}` | Model-callable tool opens and focuses an existing saved session in a Herdr tab and checks its identity/readiness. `placement: "workspace"` requests another workspace. | Existing resume/launch tests passed; no live Herdr resume performed here. It is not a fork. |

Native TUI commands are not interchangeable with model tool calls. RPC exposes `fork`, `clone`, `get_fork_messages`, `switch_session`, and `new_session`, but that does not give the current orchestrator an RPC controller for its interactive process. Do not send a TUI `/fork` as a normal RPC prompt and assume it executes the native command.

### Practical options to offer, not mandatory sequences

**Separate before the discussion grows:** offer `/new-instance process-review` and a short user-approved handoff. Include the source session ID, the concrete issue and relevant message/incident references, known facts versus hypotheses, and the scope of approval. Do not copy the whole conversation or a large research bibliography by default.

**Recover task context after a digression:** use `/session` to retain the original identity, then `/fork` and select the first off-topic user message. That message is excluded from the new history but appears in the editor; replace it with the task continuation rather than resubmitting the digression. The original session remains saved for later review or opening in another instance. After switching away, opening that original avoids deliberately running two instances on the same session file.

**Stay in one file:** `/tree` can return to a pre-digression checkpoint. Choose **No summary** when the aim is to exclude the discussion: a generated branch summary explicitly carries material from the abandoned path into model context. The unrelated branch stays in stored history.

The operator chooses which conversation stays here and which opens elsewhere. There is no automatic offer threshold, tab creation, handoff delivery, or cleanup workflow in this proposal.

### `/branch` defect found and subsequently repaired

`extensions/session-launch.ts` calls `ctx.sessionManager.createBranchedSession(leafId)` on the running manager, then launches another tab with the returned path. Installed Pi's method changes the calling manager's ID, file, entries, and leaf; it is not a non-mutating export operation.

The disposable real-manager probe confirmed that a subsequent append through that manager writes to the new branch file, leaving the old file unchanged. Therefore the parent manager and launched child target the same new session file. The repository command does not use the native runtime replacement lifecycle around this mutation. A live two-tab collision was not induced; the shared target follows directly from inspected source and the storage experiment.

The existing `session-launch.test.ts` mocks this method as a function returning a path, so passing that test does not cover the mutation. The operator subsequently approved a bounded repair: open the persisted parent through a separate manager, branch that manager, and append reciprocal native custom entries to parent and child. The entries show roles, both IDs and paths, and the branch-point ID/timestamp without entering model context. Real-manager tests now verify independent subsequent writes, reopened markers, context exclusion, rendering, and child launch path. The installed Pi extension loader accepted the module and registered its renderer; source review verified both live and restored custom-entry rendering paths. Focused launch/resume tests (27) and profile typecheck passed. No new limits, approvals, or orchestration were added.

### Conversation history is not filesystem state

Forking does not undo edits, commits, deployments, or external effects. A restored task needs a short update on material changes made since its checkpoint, without importing the entire process discussion. Current profile/repository instructions also load from current files, not historical copies.

Forking after a compaction that already summarizes the digression retains that summary. To exclude it, select a point before the digression, or use a fresh instance and focused handoff. Process-local schedules are another separate concern: repository documentation says they follow the active conversation across session replacement rather than being copied into a second process.

## Experiments and outcomes

All session fixtures used task-owned temporary directories and synthetic messages. No provider calls, credentials, or real sessions were needed. Owned processes and fixtures were removed.

1. **Real SessionManager, six check groups passed:** caller mutation on `createBranchedSession`; later writes target the new file; pre-digression extraction excludes later text without changing the working file; no-summary tree navigation preserves stored history but excludes it from context; summary navigation includes the supplied summary; `forkFrom` produces a separate ID with copied context.
2. **Installed CLI RPC, five checks passed:** native fork returns the selected text and excludes it from context; independent session ID and source preservation after startup; clone copies active context; switching restores original discussion; fresh session with parent reference has empty messages.
3. **Fixture correction:** the first RPC run compared source bytes before startup with bytes after fork and failed because startup appended `thinking_level_change`. Moving the baseline to after startup isolated the fork operation; rerun passed. Resume/startup can append metadata, so byte-for-byte immutability across opening is not promised.
4. **Existing repository checks:** `pnpm test session-launch.test.ts herdr-resume.test.ts herdr-launch.test.ts` in `pi/profiles/default/`: 3 files, 27 tests passed. These cover mocked integrations, not attached-client appearance or live new-tab startup.

## Risks / reasons not to build yet

- Fork, clone, resume, and branch are not synonyms. Incorrect advice can duplicate context or share a session file rather than isolate work.
- Fresh handoffs can lose evidence or promote assumptions to facts. Retain source references and explicit uncertainty, not an elaborate transfer schema.
- An elaborate context-management tool would exceed the current request. The native fork path already supplies useful manual recovery.
- No behavioral improvement from proposed skill wording has been demonstrated. Functional session tests do not establish model adherence.

## KISS recommendation

Use a short optional offer in the future skill revision and a conditional command reference. Prefer native `/fork` for pre-digression recovery and fresh-instance handoffs for early separation. The separately approved `/branch` repair also permits a full-context copy after reload; unlike a historical `/fork`, it does not remove an existing digression. Keep UI behavior not exercised here marked as such until real use justifies checking it.

## Related notes

- [Instruction evolution and reasoning budgets](instruction-evolution-and-reasoning-budgets.md)
- [Agent scope and stopping](agent-scope-and-stopping.md)
- [Agent process skill](../../../../../pi/profiles/default/skills/agent-process/SKILL.md)
