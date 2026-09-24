---
created: 2026-09-24
status: ready
completed: null
---

# Make Herdr cross-agent recovery discoverable to orchestrators and Team Leads

## Goal and scope

- User requirements and settled decisions:
  - Give root orchestrators and Team Leads low-ceremony access to Herdr-wide agent and pane inspection, communication, and recovery.
  - Keep the capability out of the always-loaded tool set and detailed system prompt. It must be found and activated through `tool_search` using descriptive queries such as `Herdr agent control`, `read or prompt another agent`, or `cross-agent pane recovery`.
  - Cover the concrete failure where branch-local subagent ownership cannot see, contact, or clean stale panes owned by an earlier coordinator, while preserving active agents such as a working validator.
  - Prefer agent-aware Herdr operations for live agents and retain raw pane inspection/control for terminals without a functioning agent.
  - Do not add approval prompts, confirmation fields, ownership receipts, or another safety gate. An exact non-caller pane selected for recovery can be interrupted or closed even when the current Pi session did not create it.
  - Keep normal structured subagent control as the primary path for owned children. Herdr control is a complementary layout-wide path, not a replacement protocol.
- Non-goals:
  - Cold resume of completed native subagent sessions. That related lifecycle proposal remains separate from this Herdr recovery capability.
  - Cross-machine orchestration, automatic stale-pane classification, automatic cleanup, a persistent pane registry, or changes to Herdr itself.
  - General Herdr authority for ordinary leaf roles.
- Authorization: planning only. Execution, local commits, and merge are not authorized by this request. Push and deployment are not authorized.

## Fresh-context handoff

All paths are relative to `C:/Users/mglenn/.dotfiles`.

- Owning repository: this dotfiles repository owns the default Pi profile and its Herdr/subagent integration. Do not modify `pi/profiles/legacy/`.
- Required reading:
  - `AGENTS.md`
  - `pi/profiles/default/AGENTS.md`
  - `pi/README.md`
  - `pi/profiles/default/docs/subagents.md`
  - `pi/profiles/default/docs/herdr.md`
  - `pi/profiles/default/skills/herdr/SKILL.md`
  - installed Pi extension documentation referenced by `pi/profiles/default/skills/pi-extension/SKILL.md`
  - `pi/profiles/default/extensions/herdr-tools.ts`
  - `pi/profiles/default/extensions/tool-search.ts`
  - `pi/profiles/default/extensions/tool-visibility.ts`
  - `pi/profiles/default/extensions/subagent-child.ts`
  - `pi/profiles/default/lib/subagents/launch.ts`
  - `pi/profiles/default/agents/teamlead.md`
- Verified starting behavior, 2026-09-24:
  - Root Pi registers `herdr_layout` and `herdr_pane`, then `tool-visibility.ts` defers both until `tool_search` activates them.
  - `herdr_layout list` covers only the caller workspace. There is no structured `herdr_agent` tool for list/get/read/prompt/wait/send-keys.
  - `herdr_pane` permits reads of visible panes but interruption and closure require in-memory ownership; closure also requires `confirm=true`. Ownership is cleared on `session_start`, which prevented a later branch from cleaning stale panes.
  - Team Lead authority includes a restricted `tool_search`, but child launches do not load `herdr-tools.ts` or `tool-visibility.ts`. The child search reports only frozen permitted tools and cannot activate deferred tools.
  - Herdr itself supports `agent list`, `get`, `read`, `prompt`, `wait`, and `send-keys`, plus pane-level read/input/close operations. Session `01a0d1aa-052a-77e3-9e29-1bd8b396e21e` contains the researched discussion and upstream evidence.
  - AIF-087 records the incorrect global-cleanup claim caused by checking only one branch registry. AIF-089 records speculative subagent retention and stale-pane impact.
- Work to preserve: `pi/profiles/default/skills/agent-process/references/instruction-feedback.md` is already modified by concurrent feedback work. Recheck the worktree before editing and do not overwrite or renumber unrelated entries.
- Worktree and integration target: task worktree `C:/Users/mglenn/.dotfiles/.worktrees/discoverable-herdr-agent-recovery` on branch `feature/discoverable-herdr-agent-recovery`, created from commit `1ac0a394` in originating checkout `C:/Users/mglenn/.dotfiles` on branch `main`. This execution request authorizes local integration back into that recorded checkout and branch.
- Profiles: planning used the repository-owned default profile. Intended implementation and checks also use `pi/profiles/default`; no legacy-profile work is in scope.

## Decisions and implementation contract

### Capability shape

Add one deferred structured `herdr_agent` tool for live-agent operations rather than exposing raw CLI construction in the permanent prompt. Its bounded actions are:

- `list`: list recognized agents across the connected Herdr server with pane identity, name/kind, and lifecycle state.
- `get`: inspect one exact live agent target.
- `read`: read bounded recent unwrapped output from one target.
- `prompt`: submit a message to one target, optionally waiting for a settled state with a bounded timeout.
- `wait`: wait for a requested lifecycle state or Herdr's ordinary settled states with a bounded timeout.
- `sendKeys`: send validated logical keys for deliberate terminal interaction.

Use Herdr's agent identity validation and structured responses. Preserve the distinction between delivery/state evidence and successful task completion. Do not build an additional authentication, consent, or ownership layer around these commands.

Keep pane recovery in `herdr_pane`:

- Expand inventory so an orchestrator can inspect the complete connected layout rather than only the caller workspace. Return bounded workspace/tab/pane identities and enough process/agent state to locate non-agent stale panes.
- Continue to support bounded pane reads.
- Allow interrupt and close against an exact existing non-caller pane without session-creation ownership or `confirm=true` requirements. Retain only the functional self-pane refusal because closing the executing pane cannot return a trustworthy tool result.
- Do not automatically decide that `idle` means stale. The orchestrator or Team Lead inspects state/output and chooses the operation; the runtime does not add an approval dialog or policy gate.

### Discovery and prompt ownership

- Root orchestrators keep the existing short generic `tool_search` guidance. Add at most one concise routing sentence in the subagent/Herdr guidance if testing shows the capability is otherwise undiscoverable: when structured subagent control cannot see or reach a visible Herdr agent or pane, search for Herdr cross-agent control. Detailed syntax and recovery procedure belong in deferred tool descriptions and the conditional Herdr skill, not the always-loaded prompt.
- Team Leads receive `herdr_agent`, `herdr_layout`, and `herdr_pane` as frozen permitted capabilities, but those tools start inactive. Their existing `tool_search` may activate only tools already present in that frozen authority. It must not widen authority or activate arbitrary profile tools.
- Ordinary leaves, Strategist, Steward, and Council members do not gain Herdr tools through this plan.
- The root and Team Lead use the same structured tool definitions and behavior. Avoid maintaining a second Team-Lead-only implementation.

### Low-ceremony recovery path

The intended model workflow is short and adaptable:

1. Try structured `subagent_control` for an owned child.
2. If it cannot represent the complete visible layout or reach the target, discover Herdr agent control through `tool_search`.
3. List and inspect the relevant agent or pane.
4. Prefer prompting the earlier live coordinator to reconcile its own children.
5. Read ambiguous workers or panes, then interrupt/close exact abandoned targets when direct cleanup is appropriate.

This is guidance, not a parsed sequence or mandatory checkpoint. No separate specialist, Strategist consultation, operator confirmation, or cleanup approval is introduced.

## Execution guidance

Create or resume the recorded dedicated task worktree and branch. Record the actual path, branch, and originating integration target before editing. Preserve unrelated work and carry task-owned plan content without deleting its source.

Before delegating plan work, consult `strategist` unless the user explicitly requests a single-agent handoff, including a Team Lead. A Team Lead still follows its own Strategist-first workflow. Assign at most one named plan task per subagent, split larger tasks further, and use only roles from the active agent catalog.

Implement the settled intent through the agreed checks. Adapt technical mechanisms when repository evidence requires it, but do not change user intent, scope, settled decisions, or acceptance without approval. In particular, do not reintroduce pane ownership, confirmation, approval, or receipt gates under another name. When blocked, continue independent tasks and ask only for specific consequential input. Do not add automatic cleanup, cross-machine support, cold session resume, or unrelated subagent lifecycle changes.

Keep checkbox state, concise evidence, current blockers, and next action accurate. Leave unfinished integration and cleanup unchecked. Fix demonstrated task-relevant failures and stop when the finite agreed checks pass.

## Tasks

- [x] **T1: Add one reusable structured Herdr agent-control surface**
  - Depends on: none.
  - Parallel with: T2 after its shared activation contract is agreed in code; otherwise complete this first.
  - Files/inputs: `pi/profiles/default/extensions/herdr-tools.ts`, reusable helpers under `pi/profiles/default/lib/` if needed, `pi/profiles/default/tests/herdr-tools.test.ts`.
  - Change: register deferred `herdr_agent` actions for list/get/read/prompt/wait/sendKeys using the installed Herdr CLI, exact target identities, bounded reads/timeouts/output, cancellation, and compact model-visible results. Keep root and child-compatible behavior in one implementation. Improve layout inventory to expose the complete connected layout rather than only the caller workspace.
  - Complexity / split hints: Herdr CLI response shapes and wait semantics are the difficult boundary. Keep agent-aware actions separate from raw pane recovery internally, but do not fragment the public capability into many tools.
  - Verify: from `pi/profiles/default`, run the focused Herdr tool tests covering every action, argument construction, bounded output, cancellation, timeout, missing target, and malformed response.
  - Done when: root Pi can discover and activate one structured tool that lists, inspects, reads, prompts, waits for, and sends keys to any exact live Herdr agent in the connected server, and can obtain bounded complete-layout inventory.
  - If blocked: inspect installed `herdr --skill` and targeted CLI help, then adapt exact argv/response parsing without changing the settled public behavior.
  - Evidence: Added deferred `herdr_agent` list/get/read/prompt/wait/sendKeys actions with exact target validation, bounded output/timeouts, cancellation, compact validated responses, and connected-server layout inventory. Installed Herdr 0.9.1-preview help was inspected. `pnpm test herdr-tools.test.ts` passed 17 tests; targeted TypeScript checking passed.

- [x] **T2: Make deferred Herdr tools activatable inside frozen Team Lead authority**
  - Depends on: T1's registered tool names and shared implementation entry point.
  - Files/inputs: `pi/profiles/default/agents/teamlead.md`, `pi/profiles/default/lib/subagents/launch.ts`, `pi/profiles/default/extensions/subagent-child.ts`, `pi/profiles/default/extensions/tool-visibility.ts`, relevant subagent launch/tool/authority tests.
  - Change: include the three Herdr tools in Team Lead's frozen role authority, load their owning extension for Team Leads, start them inactive, and let the child's restricted `tool_search` activate matching tools only from the already-frozen permitted set. Preserve authority freezing, tool discovery for non-Team-Lead roles, and root deferred activation.
  - Complexity / split hints: Pi CLI `--tools`, extension registration order, `session_start` deactivation, and the child-owned replacement `tool_search` interact. Prove the final active tool set rather than relying only on definition text.
  - Verify: focused tests show a Team Lead starts without Herdr tools in active model context, finds and activates them with descriptive searches, cannot activate tools outside its frozen authority, and ordinary leaves receive no Herdr capability. Confirm root behavior remains deferred and activatable.
  - Done when: orchestrators and Team Leads share the same deferred tools while Team Lead discovery cannot widen its role authority.
  - If blocked: preserve the frozen-authority boundary and change registration/activation plumbing; do not make Herdr tools permanently active as a workaround.
  - Evidence: Implemented Team Lead-only Herdr extension loading, frozen-authority activation through restricted `tool_search`, root deferral, and ordinary-leaf exclusion. Focused launch/loader/tool visibility/search checks passed: 4 files, 24 tests. Typecheck and `git diff --check` also passed in the task worktree.

- [x] **T3: Remove the branch-local cleanup gate and cover the demonstrated recovery workflow**
  - Depends on: T1 complete-layout inventory; T2 Team Lead access.
  - Files/inputs: `pi/profiles/default/extensions/herdr-tools.ts`, `pi/profiles/default/tests/herdr-tools.test.ts`, proposed focused recovery tests if existing tests cannot express multiple sessions/agents.
  - Change: remove in-memory session-creation ownership and `confirm=true` requirements from exact non-caller pane interrupt/close operations. Retain target existence inspection and self-pane refusal. Add a deterministic scenario with a current orchestrator, an earlier coordinator, an active validator, and stale workers: the current orchestrator can inspect all, prompt/read the earlier coordinator, preserve active panes, and close exact stale panes when selected.
  - Complexity / split hints: distinguish model judgment from runtime mechanics. Tests should prove capability and targeting, not encode a new automatic stale classifier or mandatory read-before-close gate.
  - Verify: focused tests establish that exact cross-session pane cleanup succeeds without confirmation, the caller pane remains rejected, no unrelated pane is closed, and agent prompt/read target the requested live agent.
  - Done when: the previously reported `Pane was not created by this session` blocker no longer prevents deliberate exact-pane recovery, without adding a replacement approval mechanism.
  - If blocked: report the exact Herdr server limitation. Do not restore ownership gating or simulate success by forgetting the pane.
  - Evidence: Removed pane-creation ownership tracking and close confirmation from exact non-caller interrupt/close operations while retaining target inspection and self-pane refusal. Added deterministic earlier-coordinator/active-validator/stale-worker coverage that targets only selected agents and panes. `pnpm test herdr-tools.test.ts` passed 18 tests; typecheck and `git diff --check` passed.

- [x] **T4: Document discovery, validate the complete composition, and close out**
  - Depends on: T1-T3.
  - Files/inputs: `pi/profiles/default/skills/herdr/SKILL.md`, `pi/profiles/default/docs/subagents.md`, `pi/profiles/default/docs/herdr.md` if its public contract changes, `pi/profiles/default/lib/subagents/guidance.ts` only if the concise routing sentence is necessary, prompt-composition tests, root `CHANGELOG.md`, this plan.
  - Change: document Herdr-native recovery as complementary to structured subagent ownership; explain discovery terms, agent-first operations, raw-pane fallback, complete-layout claims, and same-server scope. Remove stale statements that interruption/closure always requires session ownership. Keep detailed procedure conditional. Render and inspect the complete root and Team Lead prompts, compare byte counts, and avoid adding command syntax to always-loaded context.
  - Complexity / split hints: prompt ownership and cache stability matter. Prefer tool descriptions and the conditional skill; any always-visible addition must be one concise routing trigger with deterministic composition.
  - Verify from `pi/profiles/default`: run focused Herdr, tool-search, subagent launch/authority/guidance tests, `pnpm run typecheck`, and `pnpm run check:runtime`. From repository root run `git diff --check`. Record static prompt byte changes by affected audience and state that live provider caching/adherence is unmeasured unless representative requests are actually observed.
  - Done when: documentation and prompts describe the implemented discoverable workflow without a contradictory ownership gate, all finite checks pass, and the root changelog records the operator-facing capability.
  - If blocked: leave closeout unchecked with the failing command and task owner; do not broaden into an unrelated prompt or Herdr audit.
  - Evidence: Updated conditional Herdr skill and public docs for tool-search discovery, agent-first same-server recovery, complete connected-layout inventory, and raw-pane fallback; removed stale ownership/confirmation claims; recorded the operator-facing change in `CHANGELOG.md`. Always-loaded root and Team Lead compositions changed by 0 bytes; the deferred Herdr skill description changed by +68 bytes. Focused discovery/prompt, launch/loader/guidance/visibility, and Herdr checks passed; typecheck, runtime check, and `git diff --check` passed. Live provider caching and adherence remain unmeasured.

## Agreed validation and current handoff

- Focused structured Herdr tests for agent actions, complete inventory, cross-session exact-pane cleanup, bounded output, timeout, cancellation, and self-pane rejection.
- Focused tool-search and subagent tests for root/Team Lead deferred activation, frozen authority, and ordinary-role exclusion.
- Complete root and Team Lead prompt composition inspection with deterministic byte comparison.
- `cd pi/profiles/default && pnpm run typecheck`
- `cd pi/profiles/default && pnpm run check:runtime`
- `git diff --check`
- An isolated Herdr live test is appropriate only if the existing opt-in harness can prove real agent targeting and cross-session pane cleanup without touching operator panes. It is agent-owned and non-destructive within its isolated server. Attached-client/manual acceptance is a non-blocking verification limit.

- Status: implementation and agreed agent-owned checks complete; integration pending.
- Completed work and evidence: T1-T4 completed. Focused final validation passed 8 files and 104 tests with injected subagent authority cleared; the bundled Strategist definition check, `pnpm run typecheck`, `pnpm run check:runtime`, and root `git diff --check` also passed. Root and Team Lead composed prompt sizes remain 3,591 and 3,076 bytes, both with 0-byte deltas.
- Next: archive and commit the task branch, then integrate it into the recorded originating `main` checkout.
- Blockers/open decisions: none within the selected scope. The target checkout currently has unrelated changes that must be preserved during integration.
- Verification limits: attached-client behavior, live provider caching, and model adherence were not measured. An extra broad registry test could not find an authenticated Codex Sol model; the agreed bundled authority check passed separately.

## Closeout

After implementation and agreed agent-owned checks pass, update task evidence and record integration as pending. Confirm `.specs/archive/discoverable-herdr-agent-recovery/` does not contain another plan, then move this entire spec directory there in the task worktree and repair affected links. Commit the implementation and archived spec together on the task branch. Do not archive unfinished implementation.

Unless explicitly disabled, merge the task branch into its recorded originating checkout and branch without stashing, discarding, or committing unrelated target changes. Resolve routine merge conflicts within settled intent; ask only for consequential decisions or prerequisites outside authority. If integration is blocked, retain the worktree and report implementation and checks separately from pending delivery. Push is not authorized.

After a successful authorized merge, verify the target contains the changes and archive and no active plan copy remains. Then set the archived plan's `status: completed` and `completed: YYYY-MM-DD`, record integration evidence, and commit that metadata update on the target. Rerun affected checks only if conflict resolution changed checked content. Remove the task worktree only when integration succeeded and it has no uncommitted or unmerged work. Operator manual testing does not block closeout.

### Final response

Start with one overall outcome:

- 🟢 **COMPLETED**: checks passed, integrated, completion metadata committed, and task worktree cleanup verified.
- 🔴 **NOT COMPLETE: MERGE BLOCKED**: implementation committed, integration blocked.
- 🔴 **NOT COMPLETE: USER INPUT REQUIRED**: a consequential decision or prerequisite prevents finishing.
- 🔵 **IMPLEMENTED: MERGE SKIPPED AS REQUESTED**: checks passed and changes committed under an explicit no-merge instruction.
- 🟡 **CLEANUP PENDING**: changes and completion metadata are on the target, but worktree cleanup remains.

For blocked or cleanup-pending outcomes, immediately state the reason, action owner, and exact next action. Then report concise checks, spec location, branch/commits, merge result, and retained worktree or cleanup remnants. Do not imply automatic resumption or substitute operator manual testing for available agent-owned work.
