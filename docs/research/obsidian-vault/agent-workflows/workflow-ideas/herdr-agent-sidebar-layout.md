---
status: research-note
source: https://github.com/herdrdev/herdr/discussions/801
updated: 2026-10-29
---

# Herdr sidebar layout for Team Leads and agent overflow

## Why this matters

We want Team Leads and subagent overflow to be easy to find beneath their owning project in Herdr's workspace sidebar, rather than collected as tabs in a separate shared `· agents` workspace. The visual precedent is the indented project-child entry already produced by Pi's `/plans d` launch.

This note preserves operator intent and upstream references. It is not an implementation plan, approval to modify/build Herdr, or evidence that an upstream proposal has shipped.

## Desired layout

Conceptually, with existing pane arrangements inside each entry:

```text
.dotfiles
  ├─ Team · Clara · runtime
  ├─ Team · Clara · overflow 1
  ├─ Team · Maya · docs
  └─ Agents · overflow 1
```

- Each Team Lead gets a dedicated entry from launch and stays dedicated throughout its lifetime. Opening inline space must not move it back above the orchestrator.
- Team overflow identifies its owning team. Ordinary agents that fit inline remain there; ordinary overflow compacts back into available inline space, subject to existing manual-layout protections.
- Preserve readable pane sizes, caller/leader below workers, existing two-worker upper row, focus preservation, human names, manual names/dividers, process identity during moves, and ownership-safe cleanup.
- Sidebar organization must not introduce Git worktrees, branches, checkout isolation, merges, or changes to agents' assigned working directories.
- The operator does not want to rebuild Herdr for this feature.
- Collapsible groups and general grouping APIs are upstream proposals discussed below. They are not additional local requirements merely because the proposals include them.

Visual reference: `C:/Users/mglenn/Pictures/Screenpresso/2026-10-28_19h12_19.png`. The image is workstation-local, not embedded in this vault.

## Related Pi subagent requirements

Keep these distinct from Herdr's sidebar capabilities:

- Show `agents: N active` beside Onclave across all chats in this Pi instance, including nested descendants. Count unfinished running/waiting assignments once; exclude settled children and unrelated Pi processes. Hide the indicator at zero, as explicitly confirmed in the October 29 discussion.
- Use a noticeable theme color distinct from the token statistics that follow it. No separate running/waiting breakdown; Herdr remains responsible for approval alerts.
- Keep outcomes and questions routed to the originating chat/coordinator.
- Distinguish stopped partial/blocked attempts, resumed work, and completed work. The orchestrator should answer questions or resume the saved assignment with concrete remaining work when possible, not mistake terminal prose such as “underway” for live activity.
- Preserve normal automatic child closure. When completed agents are allowed to persist, the orchestrator should attempt existing cleanup controls once they are no longer needed, preserving explicit user ownership and unrelated content.

## What was verified locally

Inspection on 2026-10-29 covered the installed Herdr 0.9.5 CLI and bundled API schema, plus committed `v0.9.5` source in `C:/Users/mglenn/.local/src/herdr`. That checkout also contains rejected-plan edits; those working-tree edits were not treated as shipped behavior.

- Pi's `pi/profiles/default/extensions/session-launch.ts` calls `herdr worktree open --cwd <origin> --path <task checkout> --no-focus` for prepared `/plans d` launches.
- In committed `src/client/shell/sidebar.rs`, `workspace_entries()` groups matching worktree keys and marks linked members `indented: true` beneath the primary member.
- The bundled workspace API has no general parent/group setter. `source_workspace_id` selects cwd inheritance, not sidebar ancestry.
- Metadata supports display tokens; the inspected renderer does not interpret a parent token as a workspace relationship.
- Sidebar configuration controls rows/tokens/styles, not general hierarchy. Plugin manifests expose actions, startup/event commands, links, and terminal panes, not a built-in workspace-sidebar renderer hook.

These findings establish the inspected native grouping path, not a universal proof that no other workaround exists. No isolated rendering experiment was performed for the alternative below.

## Upstream discussions and implementation proposal

Sources and comments were read on 2026-10-29. Status describes that inspection, not a future guarantee.

### General sidebar structure: Discussion #801

[Give the workspace sidebar some structure](https://github.com/herdrdev/herdr/discussions/801) requests automatic, manual, and CLI-driven grouping, with collapsible groups suggested as a solution.

The closest match to our use case is [MuratAitov's October 14 comment](https://github.com/herdrdev/herdr/discussions/801#discussioncomment-18932642):

> I want these to appear as collapsible child workspaces in the left sidebar, while allowing them to share the same working directory. Creating a Git worktree just to organize conversations adds unnecessary overhead.

It asks for logical workspace groups independent of Git worktrees, available through UI and CLI. The [October 22 reply](https://github.com/herdrdev/herdr/discussions/801#discussioncomment-19129552) discusses a separate conversation tool and explicitly says it does not add Herdr sidebar groups. No maintainer response or implementation commitment appeared in the three comments returned for this discussion.

A [July 22 comment by selmison](https://github.com/herdrdev/herdr/discussions/801#discussioncomment-17733874) proposes grouping workspace names by a delimiter, such as `WorkA:service1`. That is a proposed Herdr feature, not evidence that such names already create groups.

### Proposed implementation: PR #2383

[feat: workspace groups](https://github.com/herdrdev/herdr/pull/2383) proposed named collapsible groups, aggregate member activity, persisted membership, and `workspace_group.list/set/rename/delete` API operations. These are the proposal's interfaces, not installed 0.9.5 APIs. It creates group headers rather than specifically making an existing project workspace the parent of agent entries.

Status: **closed, not merged**. The [contribution-policy bot comment](https://github.com/herdrdev/herdr/pull/2383#issuecomment-5196288876) says feature proposals require maintainer approval through Discussions before a PR. This is not evidence that maintainers evaluated and rejected the grouping design.

### Related Git-specific work: Discussion #780

[Group API-opened workspaces and parentless worktrees by repo](https://github.com/herdrdev/herdr/discussions/780) proposes making `workspace.create` infer existing Git-worktree relationships and decoupling repo groups from an open parent workspace.

The author [linked a prototype branch](https://github.com/herdrdev/herdr/discussions/780#discussioncomment-17421029): [alecuba16/herdr, worktree-api-groups](https://github.com/alecuba16/herdr/tree/worktree-api-groups), citing commit `5f99eee`. This remains Git-derived grouping, not an arbitrary same-directory agent-parent solution. No maintainer reply appeared in the two returned comments.

### Related visible-parent request: Discussion #553

[Allow sibling worktrees to group under the main checkout workspace](https://github.com/herdrdev/herdr/discussions/553) requests a useful checkout as the visible parent instead of the bare-repository container. A [follow-up comment](https://github.com/herdrdev/herdr/discussions/553#discussioncomment-17268085) explains that a related fix did not solve the visible-parent case. Useful background, but not our Git-independent requirement.

## Possible Pi fit

A Pi controller or Herdr plugin could potentially maintain adjacent ordinary workspaces with tree-style labels using the existing workspace ordering/rename APIs. That would be a visual approximation, not native ancestry, collapse, or group navigation. Its appearance has not been verified and the operator has not accepted it as a substitute for the requested layout.

The existing Pi layout controller already owns team/overflow placement. A separate plugin is not inherently necessary for that approximation. A plugin cannot be assumed to add a native sidebar rendering hook absent from the inspected interface.

## Risks / reasons not to build yet

- Do not confuse “Herdr renders the screenshot” with “the same grouping can be assigned to arbitrary workspaces through an existing supported API.”
- Do not treat unmerged PR APIs, discussion suggestions, a custom frontend, or local Rust edits as installed capability.
- Do not silently add a Herdr build, change Git workflow, or declare cosmetic labels equivalent to native grouping.
- The original planning/execution discussions were reviewed in default-profile sessions `01a184c9-b4ff-7507-af87-7d792d69fca5` and `01a187c4-253d-72ec-9ff9-129572f1bad3`. Earlier assistant assurances about a ready, rebuild-free solution were unsupported. This note supersedes those assurances, not the operator's desired behavior.
- Research covered the linked threads/comments, one relevant PR and its closure comment, and bounded searches. It was not an exhaustive review of all upstream issues or forks.

## KISS recommendation

Preserve the exact desired layout and follow upstream Discussion #801 as the closest existing request. Do not rebuild Herdr or create Git worktrees for presentation. If considering a local workaround, first demonstrate the ordinary-workspace label/order appearance in isolation and discuss its limitations before treating it as the solution. Footer and lifecycle improvements are separate Pi-side concerns and need not be redesigned around sidebar grouping.

## Related notes

- [Visible coding-agent orchestration: September 2026](../projects/visible-agent-orchestration-2026-09.md)
- [Agent terminal workspaces](../patterns/agent-terminal-workspaces.md)
