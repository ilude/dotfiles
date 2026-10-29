---
created: 2026-10-28
status: draft
completed: null
---

# Subagent sidebar groups and instance-wide activity

## Goal and settled scope

Make Team Leads and overflow recognizable as indented Herdr sidebar workspaces, and make actual ongoing subagent work visible in the Pi footer and outcome notifications.

The operator approved these behaviors in default-profile session `01a184c9-b4ff-7507-af87-7d792d69fca5`:

1. Every Team Lead gets a dedicated sidebar entry from launch and stays there until completion. Do not place a small team above the orchestrator or migrate it back there.
2. Ordinary agents may remain in the readable row above the orchestrator. Ordinary overflow compacts back into available inline space on lifecycle boundaries, subject to existing manual-layout protections. Team overflow stays associated with its team.
3. Team Lead and overflow groups are sidebar entries, not tabs collected in the shared `<origin title> · agents` workspace. A workspace will necessarily contain a Herdr tab internally; that is not permission to retain the existing collected-tabs presentation.
4. Preserve assigned child working directories. The interface change does not introduce Git worktrees, branches, merges, or checkout isolation. `/plans d` is an existing visual precedent, not a request to copy its Git workflow.
5. Immediately after Onclave, always show `agents: N active`, including `agents: 0 active`. Count active descendants from all chats belonging to this Pi process, including direct children and Team Lead descendants. Running and waiting are combined; Herdr retains responsibility for approval alerts.
6. Settled or exited children are not active. Terminal partial outcomes must not look like progress from a still-running agent. Follow-up resumes through existing managed messaging, not automatic retries.
7. Preserve readable pane geometry, focus behavior, manual edits and names, exact process/terminal identities, cleanup ownership, automatic completion closure, and frozen-authority saved-session follow-ups, except for the explicitly changed Team Lead origin-placement/return behavior.

Optional comparative-research ideas, such as a preview browser, new attention indicators, search, pinned groups, and a replacement session manager, are outside scope. Do not add new alerts, polling, automatic retries, persistent registries, retention options, or instruction-audit work.

Planning authorizes no implementation, commits, publication, package replacement, or process restart. `/do-it` normally authorizes selected plan implementation, local task worktrees, commits, and integration, but this full plan is **draft** until the native-grouping dependency below has an approved implementation route. Task-execution worktrees are separate from, and do not authorize, changing the subagent product's checkout behavior. Push, upstream submission, and installing/restarting a modified Herdr require separate authorization.

## Fresh-context handoff

Paths below are relative to `C:/Users/mglenn/.dotfiles` unless identified as upstream Herdr paths. Read applicable `AGENTS.md` files first. Leave `pi/profiles/legacy/` untouched.

- Planning profile: verified `default` through `pi_session`; intended Pi implementation/execution profile: `pi/profiles/default/`.
- Planning date and revision: 2026-10-28, `main` at `af1638c960efd8f378f101cd27ce3b450052afbf`. Recheck before execution.
- Integration target: originating checkout `C:/Users/mglenn/.dotfiles`, branch `main`. Consume actual runtime-prepared task coordinates if supplied; otherwise record the task branch/path before editing. Do not use a task checkout as the integration target.
- Current checkout has unrelated Bedrock/usage changes, including `CHANGELOG.md`, `pi/README.md`, provider extensions, new billing/query files, and tests. Preserve them. This planning conversation also added an incident to `pi/profiles/default/skills/agent-process/references/failure-log.md`; do not replace that file or sweep unrelated changes into this task.
- No runtime changes or tests have been performed for this plan. Research results and source reading are not implementation validation.

Required local reading:

- `pi/profiles/default/docs/subagents.md`, `docs/herdr.md`, and the subagent/footer sections of `pi/README.md`.
- `pi/profiles/default/lib/subagents/{layout-model,layout,herdr-layout-api,visible,runtime,rpc,status}.ts`.
- `pi/profiles/default/extensions/{subagents,subagent-child,operator-footer,session-launch}.ts`.
- Relevant existing tests named under tasks below.

### Verified starting behavior

- `layout-model.ts` already derives team ownership from `parentId` ancestry and produces distinct team-primary, team-overflow, and ordinary-overflow slot keys. Team Leads can currently share the origin row when small enough.
- `layout.ts` maps non-origin slots to tabs in one lazily created agents workspace. It already owns returned pane identities, preserves live terminal identities during moves, respects dirty/manual tabs, and preserves operator-added content during cleanup.
- `extensions/subagents.ts` binds status to the current origin and counts records whose status is `running`; it clears the status at zero. `runtime.ts` publishes `list(origin)` through that origin's binding. This misses work from another chat in the same process.
- `extensions/operator-footer.ts` already orders `onclave-v2` immediately before `subagents`; use that existing integration.
- `rpc.ts` legitimately settles terminal partial/blocked reports at turn completion and performs normal cleanup. `status.ts` currently labels a settled partial result only `partial`, without explicitly saying work has stopped or stating ordinary closed-resource state.
- Three agents in this planning conversation returned terminal partial reports saying research was underway. Later inspection found settled assignments, exited processes, and closed panes. The orchestrator incorrectly interpreted their prose as liveness. Explicit follow-ups returned findings. No stale runtime `running` flag was established.

## Native grouping dependency: confirmed boundary, proposed route

The installed Herdr client and server are both 0.9.5. Exact native tree rendering is not presently exposed for ordinary workspaces through that version's API.

This is source evidence, not an inference from missing CLI flags:

- [Herdr 0.9.5 sidebar source](https://github.com/herdrdev/herdr/blob/v0.9.5/src/client/shell/sidebar.rs), `workspace_entries` around lines 458–550: groups snapshot workspaces by their worktree key; indentation requires linked-worktree and non-linked-worktree memberships. The row renderer around lines 709–715 emits the tree prefix from that derived indentation.
- [Workspace schema](https://github.com/herdrdev/herdr/blob/v0.9.5/src/api/schema/workspaces.rs): workspace records expose worktree provenance, but ordinary workspace creation has no parent-assignment contract.
- [Workspace source](https://github.com/herdrdev/herdr/blob/v0.9.5/src/workspace.rs): `worktree_space` is explicitly Herdr-managed worktree-group provenance.
- [Version-matched CLI reference](https://raw.githubusercontent.com/herdrdev/herdr/v0.9.5/docs/next/website/src/content/docs/cli-reference.mdx) and [configuration](https://raw.githubusercontent.com/herdrdev/herdr/v0.9.5/docs/next/website/src/content/docs/configuration.mdx) document the worktree-backed grouping.
- Local `/plans d` uses `launchPreparedHerdrPlan()` in `extensions/session-launch.ts`, which prepares a task checkout and calls `herdr worktree open --cwd <origin> --path <task-worktree> --no-focus`. That is not a layout-only adapter suitable for this request.

**Proposed route, not yet approved executable scope:** a minimal Herdr-native relationship allowing an ordinary child workspace to be displayed beneath a specified existing parent workspace, independently of its cwd and Git provenance. Pi then uses that relationship for its owned team/overflow workspaces. One level beneath the origin is sufficient; arbitrary folder systems or recursively nested Team Lead trees are not required.

Herdr is a separate upstream product, not an existing source module in this checkout. No Herdr source checkout, patch/publication route, or modified-runtime activation has been authorized. Do not silently add a vendored fork, patch an installed binary, edit Herdr's persisted runtime state, fabricate worktree provenance, or substitute labels with tree glyphs and call the native grouping requirement complete.

The remaining blocker is establishing authorization and a source/delivery route for that narrow Herdr capability, or finding a real supported equivalent in a later approved version. An executor must report this boundary instead of repeatedly researching settled Git-workflow questions. This dependency does not prevent the independent Pi activity/notification tasks from being implemented if separately selected for execution. Their completion is not completion of the full sidebar request.

## Implementation contracts

### Layout

Each team-primary, team-overflow, and ordinary-overflow slot owns a separate managed workspace under the origin workspace. Example labels (wording may follow existing naming conventions):

```text
.dotfiles
├─ Team · Clara · runtime
├─ Team · Clara · overflow 1
├─ Team · Maya · docs
└─ Agents · overflow 1
```

These are sibling child workspaces under the actual origin, not a claim of arbitrary native nesting. Team association remains based on existing runtime ancestry, not display labels. Preserve each child's launch cwd, including when a coordinator intentionally assigned a different existing checkout.

Keep the existing two-worker upper-row maximum, 50-column/14-row capacity policy, full-width lower caller/leader, narrow-window singleton handling, lifecycle-boundary reconciliation, and manual-layout protections. Ordinary agents compact into clean available inline capacity. Team Leads never return to the origin row; descendants compact within their team's destinations only.

Cross-workspace moves must adopt exact returned pane IDs and preserve verified terminal/process identity as today. Creation and moves preserve the user's actual focus. Remove only empty owned workspace content and the owned initial shell; preserve operator-added tabs/panes and manual names. Do not recreate a process to repair layout.

### Instance activity

Use the existing shared runtime's records across all origins in this Pi process. Count each distinct child once when its assignment is running or waiting and its process is not known exited. Include starting work, background/foreground children, direct children, and coordinator descendants. A coordinator waiting for its children is itself an active assignment, so count it as well as its active workers.

Exclude settled outcomes regardless of complete/partial/blocked/failed/cancelled classification, known exited processes, historical/inert records, unread-result mailboxes, and saved conversations with no active assignment. A managed follow-up becomes active again during its actual reopened exchange. Do not equate open panes or cleanup remnants with active assignments.

Publish changes from authoritative lifecycle transitions, not result text, Herdr-wide discovery, or new polling. The visible chat gets an immediate instance snapshot on binding/rebinding; changes under another origin must refresh it. Keep result/question delivery origin-scoped. Do not route another chat's messages into the currently visible chat merely to update the count.

Always use the existing `subagents` status slot: `agents: N active`, including zero, immediately after Onclave under ordinary footer rendering. Preserve existing narrow-width footer handling and other extension statuses. Herdr retains approval alert ownership. No running/waiting breakdown, notification layer, or clickable controls are required.

### Terminal results

Make terminal partial/blocked outcome wording explicitly distinguish assignment settlement from the child result's prose. Include observed lifecycle/resource facts without claiming closure when cleanup is unresolved. For example, when established by the record: `Stopped with partial results. Process exited; pane closed. No work is continuing. Send a follow-up to resume.`

A live factual parent question remains waiting/active, not a terminal outcome. Live tool activity remains UI progress, not model-triggering result chatter. Preserve frozen follow-up authority and original-vs-follow-up evidence. Do not add automatic relaunch/retry or require the orchestrator to poll.

## Execution guidance

This is a planning artifact. Do not execute the full plan while its native-grouping route remains unresolved. User requirements above are settled and should not be reopened.

Once executable scope is authorized, use the recorded dedicated task worktree/branch, or consume matching runtime-prepared coordinates without creating a second worktree. Consult `strategist` before plan delegation unless the user explicitly requests a single-agent handoff; a Team Lead still uses its own Strategist-first workflow. Assign at most one named task per subagent. Use active catalog roles, preserve disjoint write ownership, and integrate prerequisites before dependent work.

Continue independent authorized tasks around blockers. Adapt equivalent technical details within settled intent. Ask before changing scope, acceptance, repository ownership, or checkout behavior. Do not turn optional research suggestions into implementation requirements. Keep task state, blockers, next actions, and their owners accurate. Stop checks once agreed checks pass and demonstrated task-related defects are resolved.

## Tasks

- [ ] **T1: Publish an instance-wide active count in the existing footer slot**
  - Depends on: none; independent of native sidebar support and T2/T3.
  - Ownership: `lib/subagents/runtime.ts`, `extensions/subagents.ts`, and their focused runtime/session lifecycle tests. Paths under `pi/profiles/default/`.
  - Change: publish a process-wide activity snapshot to the currently bound UI using existing runtime ownership and events; keep origin-scoped result delivery unchanged. Replace current-origin running-only/hidden-zero rendering with `agents: N active` under the contract above. Change `operator-footer.ts` only if an established test shows its existing ordering/width handling needs adjustment.
  - Verify: focused runtime and session-lifecycle tests cover work in chat A while displaying chat B, coordinator descendants, waiting, terminal partial/exit, zero, and managed reopen. Reuse existing fixtures rather than building another telemetry system.
  - Done when: lifecycle changes from any owned chat produce an accurate count next to Onclave, including zero, without cross-chat result leakage or duplicate counting.
  - Evidence: Not started.

- [ ] **T2: Make terminal partial outcomes unmistakably stopped**
  - Depends on: none; may run alongside T1/T3 with disjoint write ownership.
  - Ownership: `lib/subagents/status.ts`, relevant presentation paths only if needed, `tests/subagent-status.test.ts`, `tests/subagent-terminal-outcomes.test.ts`.
  - Change: render terminal assignment/liveness facts separately from child prose and identify managed follow-up as the continuation mechanism. Preserve waiting-question and nonterminal activity semantics. Do not change settlement policy to keep agents alive merely because they said `underway`.
  - Verify: terminal partial with exited/closed resources, partial with unresolved cleanup, and live parent-question wording remain distinguishable. Use actual record state, not an assertion that all resources must always close successfully.
  - Done when: a stopped child reporting `investigation underway` is unambiguously presented as stopped and cannot be mistaken for a live progress notification from the supplied state text.
  - Evidence: Not started.

- [ ] **T3: Make Team Lead placement permanently dedicated**
  - Depends on: none; independent of the native-grouping capability and T1/T2.
  - Ownership: `lib/subagents/layout-model.ts`, `tests/subagent-layout-model.test.ts`.
  - Change: remove Team Lead sharing of the origin row; retain existing group/slot keys, ancestry, capacity policy, ordinary inline/overflow compaction, and team-local descendant overflow. Supply the desired-slot result consumed by T4.
  - Verify: Team Lead singleton starts dedicated; small/shrinking teams remain dedicated; ordinary agents use and regain readable inline capacity; narrow layouts keep the existing geometry policy.
  - Done when: pure model results enforce dedicated teams without changing ordinary-agent capacity or checkout behavior.
  - Evidence: Not started. This alone changes placement but does not complete sidebar grouping.

- [ ] **T4: Place each dedicated group in a native child workspace**
  - Depends on: T3 desired-slot behavior **and an approved, available native ordinary-workspace grouping capability**. The proposed Herdr-side prerequisite is outside executable scope until its owning source/delivery route is authorized.
  - Ownership: `lib/subagents/layout.ts`, `lib/subagents/herdr-layout-api.ts` if needed, focused `tests/subagent-layout.test.ts`, and existing isolated UX fixture changes needed for the new destinations.
  - Change: replace the one-agents-workspace destination with per-slot managed workspaces attached beneath the exact origin through the established native contract. Preserve per-child cwd and existing movement/manual-layout/cleanup/focus contracts. Each primary/overflow group is a sidebar workspace rather than another tab in a collection.
  - Complexity: workspace membership, returned pane identities, and ownership cleanup interact. Keep native API adaptation separate from controller destination reconciliation if staffing requires a further split.
  - Verify: dedicated team/ordinary overflow destinations, team overflow association, ordinary return/empty-group removal, manual edits/names, focus preservation, and operator-added content. Update the existing opt-in isolated Herdr fixture only once a compatible native capability is available; mocks alone cannot establish native indentation.
  - Done when: the required group entries have real native sidebar parentage, not cosmetic label prefixes or worktree-backed provenance, while child cwd/process identity stays unchanged.
  - If blocked: retain the exact capability/repository/delivery blocker below. Continue separately authorized T1–T3; do not substitute collected tabs or new Git checkouts and declare this task complete.
  - Evidence: Not started; blocked on native grouping route.

- [ ] **T5: Document implemented behavior and close out the selected scope**
  - Depends on: T1–T4 and their relevant checks for full-plan completion. A separately authorized partial delivery must explicitly name its reduced scope rather than archive the unfinished full plan.
  - Ownership: `pi/README.md`, `pi/profiles/default/docs/{subagents,herdr}.md`, `CHANGELOG.md`, and this spec. Preserve existing edits in shared documentation.
  - Change: document the actual layout, instance-count semantics, terminal-partial behavior, and normal settled-only reload/restart activation. Remove stale claims that all dedicated groups live in one agents workspace or that subagents provide no persistent status at all. Do not alter Onclave adapter ownership or legacy.
  - Verify: finite commands below; review docs against actual implemented scope and source once.
  - Done when: selected implementation and checks are recorded accurately, the full spec is archived/committed only when its implementation is complete, and authorized integration/cleanup are complete or explicitly reported pending.
  - Evidence: Not started.

### Concurrency

T1, T2, and T3 have disjoint primary write ownership and may start concurrently when selected for execution. T4 consumes T3 and native grouping support. T5 follows integrated behavior. Do not put documentation edits into every parallel assignment.

## Validation and current handoff

Finite checks from `pi/profiles/default/`, selecting only files affected by the implemented tasks:

```sh
pnpm test subagent-runtime.test.ts subagent-session-lifecycle.test.ts subagent-status.test.ts subagent-terminal-outcomes.test.ts subagent-layout-model.test.ts subagent-layout.test.ts subagent-cleanup.test.ts
pnpm run typecheck
pnpm run check:runtime
```

If T4 updates the existing native layout fixture, run its relevant isolated cases against a compatible Herdr build. The existing opt-in entry point is `PI_SUBAGENT_UX_LIVE=1 pnpm test subagent-ux-live.test.ts`; follow that fixture's isolated socket/config/registry boundary and do not mutate production layout. Do not run real model-backed assignments merely to validate counts or layout.

Attached-client rendering and keyboard experience remain non-blocking verification limits unless actually observed; mocked geometry is not proof of native sidebar indentation. Do not require operator manual acceptance before normal authorized archival/integration of completed implementation.

- Status: **Draft.** Requirements settled; full sidebar implementation has an external technical/scope dependency.
- Completed: local implementation trace, targeted DEFAULT-profile historical review, upstream/version-matched source verification, comparative research, and this plan. No code or tests implemented.
- History limits: some earlier pane/focus/name requirements were recovered from direct operator messages; later October policies were recovered from maintained docs, not verified original operator passages. Child assignment messages in session logs are not independent operator approval.
- Blocker: Herdr 0.9.5 has no exposed ordinary-workspace parentage contract matching the requested Git-independent native tree.
- Next action/owner: orchestrator presents the narrow Herdr-side grouping proposal and obtains a source/delivery scope decision before expanding executable work beyond dotfiles. Alternatively, accept an independently selected Pi activity/notification delivery while keeping T4 visibly unfinished.
- No other behavior questions remain. Do not ask the operator again whether agents should use new Git checkouts.

## Closeout contract

For subsequently authorized execution, preserve the recorded originating checkout/branch and actual prepared coordinates. After implementation and agreed agent-owned checks, verify `.specs/archive/subagent-sidebar-and-instance-activity/` does not already contain another plan, move this entire spec directory there in the task worktree, and commit implementation plus archived spec together. Do not archive unfinished sidebar implementation as completed.

For `/do-it`, dispatch Integrator from the recorded target checkout after the task commit. It owns local integration, completion metadata, and task-worktree cleanup. In a runtime-prepared Herdr run, use the admitted same-tab successor: readiness precedes explicitly authorized orchestrator-only obligations and exact-origin retirement; the surviving Integrator then cleans up and reports. In ordinary direct/run-here execution, the orchestrator retains operator communication. `--no-merge` intentionally retains the committed task checkout and skips mutating integration. No push, upstream publication, modified-Herdr installation, or shared-server restart is implied.

Keep integration/cleanup unchecked until verified; record blocker, next action, and owner when unfinished. Report one explicit overall outcome first: 🟢 **COMPLETED**, 🔴 **NOT COMPLETE: MERGE BLOCKED**, 🔴 **NOT COMPLETE: USER INPUT REQUIRED**, 🔵 **IMPLEMENTED: MERGE SKIPPED AS REQUESTED**, or 🟡 **CLEANUP PENDING**. Blocked reports lead with the reason and action needed, not passed checks. Record scope, checks, commits, archive location, and retained resources accurately.
