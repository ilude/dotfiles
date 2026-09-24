---
created: 2026-09-24
status: completed
completed: 2026-09-24
---

# Add a flexible writer role and clarify synthesis and subagent identity

## Goal and scope

- User requirements and settled decisions:
  - Add one low-ceremony `writer` subagent role rather than separate permanent roles for documentation, reports, findings, stories, agent definitions, and skills.
  - Give the writer ordinary read/edit/write capability for prose-oriented artifacts.
  - Let the parent describe the writing type, audience, purpose, supplied evidence or intent, desired style or structure, applicable skills, writable scope, and important limits in natural-language assignment context. These are useful brief elements, not a required schema or workflow gate.
  - Let the parent attach applicable skills such as `project-knowledge`, `prompting`, `skill-creation`, or `planning`; do not bake every artifact convention into the always-loaded role prompt.
  - Keep reviewer and validator read-only. Their findings are returned through their normal result channel.
  - Make the parent responsible for correlating and integrating multi-agent results unless synthesis is itself explicitly assigned. A writer given an established synthesis should materialize it without unnecessarily repeating the review.
  - Correct the always-visible role-selection surface so it identifies reviewer as read-only and writer as writable prose authoring.
  - Replace the inaccurate generalization that only developer can write with capability-based documentation for developer, writer, reviewer, and validator.
  - Make subagent identity unambiguous across parent-visible responses: expose the runtime-control identity canonically as `subagentId`, expose the native Pi `sessionId` needed by session and analytics tools once known, and explain which identifier each tool accepts.
  - Preserve compatibility for existing consumers of the generic `id` field while migrating parent-facing contracts and tests to the explicit name.
- Non-goals:
  - No dedicated findings-output tool or filesystem-writing escape hatch for reviewer/validator.
  - No rigid artifact taxonomy, mandatory writing-brief form, writer modes, path allowlist, approval gate, or automatic role router.
  - No proliferation of documentation-writer/report-writer/prompt-writer/skill-writer roles.
  - No change to the orchestrator's authority over user intent, scope, or consequential unresolved choices.
  - No redesign of skill resolution, project overrides, subagent transport, or tool enforcement.
  - No change to native Pi session-ID generation, session registration, lineage semantics, or the retained-child follow-up mechanism.
  - No exposure of `sessionFile` in ordinary parent-visible completion notifications unless implementation evidence establishes a required consumer.
- Authorization: planning only. This plan does not authorize implementation, commit, push, or deployment.

The user's request and subsequent changes are authoritative. Keep unapproved recommendations and optional work outside tasks and completion criteria.

## Fresh-context handoff

All paths are relative to `C:/Users/mglenn/.dotfiles`. Read current applicable `AGENTS.md` files before acting. Ignore `pi/profiles/legacy/`.

- Owning repository: this dotfiles repository owns the default Pi profile and subagent role definitions. Do not change `modules/onclave/` or `modules/homelab-infra/`.
- Required reading:
  - `pi/profiles/default/agents/developer.md`
  - `pi/profiles/default/agents/reviewer.md`
  - `pi/profiles/default/agents/validator.md`
  - `pi/profiles/default/agents/teamlead.md`
  - `pi/profiles/default/lib/subagents/guidance.ts`
  - `pi/profiles/default/lib/subagents/definitions.ts`
  - `pi/profiles/default/lib/subagents/presentation.ts`
  - `pi/profiles/default/lib/subagents/runtime.ts`
  - `pi/profiles/default/extensions/subagent-child.ts`
  - `pi/profiles/default/extensions/subagents.ts`
  - `pi/profiles/default/docs/subagents.md`
  - `pi/profiles/default/tests/subagent-definitions.test.ts`
  - `pi/profiles/default/tests/subagent-guidance.test.ts`
  - `pi/profiles/default/tests/subagent-skills.test.ts`
  - `pi/profiles/default/tests/subagent-presentation.test.ts`
  - `pi/profiles/default/tests/subagent-runtime.test.ts`
  - `pi/profiles/default/tests/subagent-messaging-lifecycle.test.ts`
  - `pi/profiles/default/skills/agent-process/references/instruction-feedback.md`, entry AIF-090
- Verified starting behavior:
  - `agents/reviewer.md` has no `edit` or `write` tools and says shell commands are for inspection/checks only.
  - `agents/developer.md` currently supplies the only bundled general-purpose implementation role with `edit` and `write`.
  - The generated catalog exposes only each role's description. Reviewer is described as “Independent evidence-based review,” which omits its read-only boundary at the dispatch decision.
  - `docs/subagents.md` says only developer has native edit/write tools and separately says the parent owns dispatch and integration, but this conditional documentation is not the always-visible caller role-selection surface.
  - Session `01a0d4c4-952a-7513-a435-2adbbf7e87e6` assigned a reviewer both synthesis and filesystem output. The reviewer returned useful synthesis but correctly rejected the write. The parent then assigned a developer to independently inspect and synthesize again instead of only materializing the established result.
  - Agent definitions already support role-owned tool lists and assignment-selected skills. No new runtime mechanism is needed for a flexible writer brief.
  - Child startup already sends native `sessionId` and `sessionFile` to the parent runtime, which validates and stores both on `ChildRecord`.
  - Foreground and inspect snapshots can expose the stored native session identity, but automatic `subagent-result` delivery passes through `presentationDetails()`, which currently omits both `sessionId` and `sessionFile`.
  - Parent-visible records currently call the runtime-control UUID `id`; `subagent_control` accepts that identifier for retained follow-up. Native `session_messages` and analytics operations instead require the Pi `sessionId`. The completion payload does not clearly distinguish these contracts.
  - In session `01a0d4c4-952a-7513-a435-2adbbf7e87e6`, the parent attempted seven `session_messages` calls with unverified session-shaped values after receiving background reviewer results without native session IDs. The calls failed with `analytics session reference is unknown`; the embedded reviewer results remained available and synthesis continued.
- Work to preserve: the originating checkout is dirty. At planning time, existing changes include root `CHANGELOG.md`, agent-process and tool-call-analysis logs, plus modified module worktrees. Recheck status before execution and do not overwrite, stage, commit, or clean unrelated work. AIF-090 is task context and currently modified work to preserve.
- Worktree and integration target: originating checkout `C:/Users/mglenn/.dotfiles` on `main`; execution should create a dedicated task worktree/branch and later integrate into this recorded target under the repository workflow.
- Profiles: planned for the default Pi profile only. Intended execution and checks use `pi/profiles/default`; no legacy-profile changes or tests.

## Decisions and implementation contract

### Writer role

Add proposed `pi/profiles/default/agents/writer.md` as one leaf role with no delegates. Its concise role contract should express these behaviors without introducing a form or fixed modes:

- Create and revise prose-oriented artifacts according to the parent's writing brief.
- Adapt to the stated artifact type, audience, purpose, evidence and established intent, style, structure, applicable skills, scope, and limits.
- Use assignment-selected skills and repository guidance when applicable.
- Investigate enough to write accurately, while preserving supplied evidence and not silently inventing consequential decisions.
- Surface consequential unresolved choices to the parent.
- Stay within assigned write scope and preserve unrelated work.
- Do not implement software behavior or delegate.
- When the assignment supplies an established synthesis, materialize it faithfully rather than restarting the underlying review unless re-analysis is explicitly requested.

Give writer the same ordinary local inspection and prose-editing surface needed for these outcomes: `read`, `grep`, `find`, `ls`, `bash`, `edit`, `write`, `tool_search`, `log_analytics`, `web_search`, `web_fetch`, and `subagent_parent`. Keep `skills: []` so the parent can select relevant skills per assignment. Use a reasonable writable-role default consistent with nuanced prose work; the implementation may choose the existing Sol low default discussed during planning unless current model/catalog evidence requires an equivalent adjustment. This default remains overrideable through existing subagent options.

### Parent assignment and synthesis

Keep writing briefs as ordinary prose. Caller guidance should suggest, not require, supplying relevant artifact context and skills. It should establish only the high-value ownership boundary:

- Reviewer/validator return read-only findings through normal results.
- The parent correlates and integrates multi-agent results unless it explicitly assigns synthesis.
- Use writer when the primary delegated outcome is a prose artifact; work directly when delegation adds no value.
- Do not assign filesystem output to a read-only role.
- Do not repeat a completed review merely to materialize its established synthesis.

Integrate this into the existing compact delegation guidance rather than appending a detailed writing workflow. Preserve the existing direct-execution and context-conservation rules.

### Catalog and coordination

- Change reviewer description so its read-only nature and result-returning purpose are visible in the generated role catalog.
- Give writer a description that makes its writable prose-artifact purpose visible without enumerating every artifact type.
- Add writer to Team Lead's permitted leaf delegates so a user-selected Team Lead can use it. Do not add writer to Council unless an independent future requirement establishes that need.
- Keep developer as the source-code implementation role and writer as the prose-oriented writable role. These are judgment-guiding descriptions, not runtime file-type enforcement.

### Parent-visible subagent identity

Keep the runtime's internal `ChildRecord.id` implementation unless changing it is necessary; this plan changes the external contract, not UUID generation or ownership lookup.

- Parent-visible records and completion details should expose `subagentId` as the canonical name for the identifier accepted by `subagent_control`.
- Include native Pi `sessionId` once the child has reported it. This is the identifier accepted by `session_messages` and native session/analytics operations.
- Preserve `id` as a deprecated compatibility alias in existing structured outputs during this change. Do not make parents guess or derive either identifier.
- Keep `sessionFile` internal by default. A native session ID is sufficient for the demonstrated retrieval and lineage workflows.
- Update concise tool guidance so `subagent_control.id` explicitly accepts a returned `subagentId`, while session tools consume `sessionId`. Do not add another lookup tool or alter retained follow-up mechanics.
- Ensure automatic background completion, foreground completion, `subagent_control inspect`, list output, follow-up completion, and nested/Team Lead child delivery use a consistent identity presentation whenever the relevant identity is known. A launch response emitted before child identity handshake may omit `sessionId`; it must not synthesize one.

### Documentation and history

Update `pi/profiles/default/docs/subagents.md` to describe capability-based write authority, the parent/writer/reviewer relationship, and the distinction between `subagentId` and `sessionId`. Update root `CHANGELOG.md` because this changes operator-facing delegation behavior, role availability, and the parent-visible subagent result contract. Do not turn the session narrative or temporary measurements into durable documentation.

## Execution guidance

Create or resume the recorded dedicated task worktree and branch. Record the actual path, branch, and originating integration target before editing. Preserve unrelated work and carry task-owned uncommitted plan content without deleting its source.

Before delegating plan work, consult `strategist` unless the user explicitly requests a single-agent handoff, including a Team Lead. A Team Lead still follows its own Strategist-first workflow. Assign at most one named plan task per subagent, split larger tasks further, and use only roles from the active agent catalog.

Implement the settled intent through the agreed checks. Adapt exact wording and equivalent test organization when repository evidence requires it, but do not add mandatory brief fields, fixed writer modes, path enforcement, new tools, or additional roles without approval. When blocked, continue independent tasks and ask only for the specific consequential input. Do not add audits, optional improvements, speculative fixes, or acceptance requirements.

Keep checkbox state, concise evidence, current blockers, and the next action accurate. Leave unfinished integration/cleanup checkboxes unchecked. Do not stop at a phase boundary or substitute a promise for available work. Fix demonstrated task-relevant failures and stop testing when the finite agreed checks pass.

## Tasks

- [x] **T1: Add the flexible writer role and catalog-visible capability boundaries**
  - Depends on: none.
  - Parallel with: T2 after agreeing exact shared catalog wording; otherwise perform T1 and T2 serially because both affect role-selection expectations.
  - Files/inputs: proposed `pi/profiles/default/agents/writer.md`; `pi/profiles/default/agents/reviewer.md`; `pi/profiles/default/agents/teamlead.md`; `pi/profiles/default/tests/subagent-definitions.test.ts`.
  - Change: create the writer leaf definition with the settled flexible prose-authoring contract, writable tool set, no delegates, and assignment-selected skills. Make reviewer read-only status visible in its description. Add writer to Team Lead's permitted delegates. Extend definition tests to prove the writer loads with edit/write authority, no delegates, no fixed skills, and the intended defaults; prove reviewer remains read-only and its catalog description is explicit.
  - Complexity / split hints: role wording must remain flexible and concise while making authority clear. Do not encode artifact-specific procedures that belong in assignment-selected skills.
  - Verify: from `pi/profiles/default`, run `pnpm test subagent-definitions.test.ts`.
  - Done when: the bundled catalog contains one writable writer leaf, reviewer remains read-only, Team Lead can dispatch writer, and focused definition tests pass.
  - If blocked: preserve the agreed one-role design and ask only if a model/default choice would materially change cost or expected behavior beyond existing override semantics.
  - Evidence: Added `writer.md`, explicit reviewer catalog wording, Team Lead delegation authority, and definition assertions. The 24 task-relevant definition tests pass; the sole failure reproduces unchanged on originating `main` because its pre-existing Sol fixture conflicts with the repository's pinned Sol 5.6 policy.

- [x] **T2: Clarify parent-owned synthesis and low-ceremony writer selection**
  - Depends on: T1's final role names and concise descriptions.
  - Files/inputs: `pi/profiles/default/lib/subagents/guidance.ts`; `pi/profiles/default/tests/subagent-guidance.test.ts`.
  - Change: consolidate a short writer/reviewer/synthesis boundary into existing caller guidance. The parent should be able to provide a natural-language writing brief and applicable skills without a required schema. Preserve direct execution when delegation adds no value. Add tests against the complete composed caller and Team Lead/catalog prompts to establish catalog visibility, parent integration ownership, read-only result handling, writer selection, and the prohibition on repeating established synthesis solely for file creation. Update deterministic byte expectations or bounded size assertions only for the intentional composition change.
  - Complexity / split hints: this changes always-visible prompt composition. Review the complete caller composition for duplication with existing delegation, Steward, and integration guidance, and prefer replacement/consolidation over another standalone policy block.
  - Verify: from `pi/profiles/default`, run `pnpm test subagent-guidance.test.ts`.
  - Done when: the dispatch decision exposes the relevant role capabilities, caller guidance preserves flexible briefs and parent synthesis responsibility, composition remains deterministic and compact, and focused tests pass.
  - If blocked: do not solve wording ambiguity with runtime gates or a required brief schema; present the smallest consequential wording choice to the user.
  - Evidence: Added shared compact writer/read-only/synthesis guidance to caller and Team Lead compositions with catalog and bounded deterministic prompt assertions. `pnpm test subagent-guidance.test.ts` passed 16 tests.

- [x] **T3: Align documentation and change history with the new capability and identity model**
  - Depends on: T1, T2, and T4 contracts.
  - Files/inputs: `pi/profiles/default/docs/subagents.md`; root `CHANGELOG.md`; AIF-090 as historical evidence, not a file to rewrite unless implementation status needs a concise authorized update.
  - Change: replace the “only developer writes” statement with factual role capabilities, explain writer's flexible assignment-selected skills and prose focus, and state that reviewer/validator return findings without writing. Document parent synthesis/integration ownership without imposing writer use. Document `subagentId` as the control identifier and `sessionId` as the native session/analytics identifier, including that `sessionId` becomes available only after the child identity handshake. Add a concise changelog entry covering the new role, corrected dispatch boundary, and explicit parent-visible identity fields.
  - Verify: inspect affected headings and links; run `git diff --check` from the repository root.
  - Done when: operator documentation matches runtime role definitions and generated guidance, no transient session narrative is copied into durable docs, and diff checks pass.
  - Evidence: Updated operator documentation and root changelog for capability-based writing, synthesis ownership, and `subagentId` versus `sessionId`; `git diff --check` passed.

- [x] **T4: Make parent-visible subagent identities explicit and consistent**
  - Depends on: none.
  - Parallel with: T1; coordinate the small caller-guidance boundary with T2 before either task finalizes prompt wording.
  - Files/inputs: `pi/profiles/default/lib/subagents/presentation.ts`; `pi/profiles/default/extensions/subagents.ts`; `pi/profiles/default/lib/subagents/child-surface.ts`; `pi/profiles/default/lib/subagents/rpc.ts` only if public typing needs an alias; `pi/profiles/default/tests/subagent-presentation.test.ts`; `pi/profiles/default/tests/subagent-runtime.test.ts`; `pi/profiles/default/tests/subagent-messaging-lifecycle.test.ts`; relevant guidance/tool-description tests.
  - Change: expose `subagentId` canonically in parent-visible snapshots and completion details, include the recorded native `sessionId` whenever known, and retain `id` as a deprecated compatibility alias. Keep `sessionFile` internal. Apply the same presentation contract to ordinary parent delivery and nested/Team Lead child delivery. Clarify in model-visible tool descriptions or compact caller guidance that `subagent_control.id` consumes `subagentId`, while `session_messages` and native analytics consume `sessionId`. Do not manufacture a `sessionId` before the child handshake or change runtime lookup semantics.
  - Complexity / split hints: distinguish internal record identity from serialized presentation without forcing a broad internal rename. Review every serialization path so background notifications do not lag foreground/inspect output. Avoid duplicating identity guidance across multiple always-visible prompt blocks.
  - Verify: from `pi/profiles/default`, run `pnpm test subagent-presentation.test.ts subagent-runtime.test.ts subagent-messaging-lifecycle.test.ts subagent-guidance.test.ts`.
  - Done when: every settled parent-visible result supplies an explicit `subagentId` and, when registered by the child, its exact `sessionId`; retained follow-up still accepts the control identity; compatibility `id` remains available; no result exposes `sessionFile`; and focused tests cover background delivery, inspect/foreground presentation, and follow-up completion.
  - If blocked: preserve the two-identifier distinction and compatibility alias; ask only if a discovered external consumer makes the alias lifetime or serialized shape consequential.
  - Evidence: Added one parent-visible serializer across root and nested launch/control/progress/outcome paths, canonical `subagentId`, compatibility `id`, conditional `sessionId`, and no `sessionFile`. Focused presentation/runtime/messaging tests passed 41 tests; typecheck and diff checks passed.

- [x] **T5: Validate the complete default-profile change and close out**
  - Depends on: T1, T2, T3, and T4.
  - Files/inputs: all task-owned changes and existing default-profile check scripts.
  - Change: review the full affected prompt composition and role catalog against the settled requirements. Confirm no new tool extension, mandatory taxonomy, hidden path restriction, duplicated synthesis stage, legacy-profile change, or unrelated edit was introduced. Run focused tests, default-profile typecheck, runtime smoke, and repository diff checks. Update task evidence and perform the authorized closeout steps only after implementation is authorized.
  - Verify:
    - `cd pi/profiles/default && pnpm test subagent-definitions.test.ts subagent-guidance.test.ts subagent-skills.test.ts subagent-presentation.test.ts subagent-runtime.test.ts subagent-messaging-lifecycle.test.ts`
    - `cd pi/profiles/default && pnpm run typecheck`
    - `cd pi/profiles/default && pnpm run check:runtime`
    - repository root: `git diff --check`
    - inspect `git status --short` in both task worktree and originating checkout before integration.
  - Done when: all finite checks pass, the complete composed prompts meet the flexible low-ceremony contract, unrelated dirty work remains preserved, and closeout/integration status is accurately recorded.
  - If blocked: distinguish implementation/check completion from integration blockers; retain the worktree and report the exact next action and owner.
  - Evidence: The final focused suite passed 84 task-relevant tests; its only failure reproduces unchanged on originating `main` in the pre-existing Sol-default fixture. `pnpm run typecheck`, `pnpm run check:runtime`, and repository `git diff --check` passed. Complete caller and Team Lead compositions expose the settled writer, read-only result, synthesis, and identity boundaries without legacy-profile or new-tool changes.

## Agreed validation and current handoff

- Status: completed and integrated on 2026-09-24.
- Completed work and evidence: T1-T5 were implemented in `C:/Users/mglenn/.dotfiles/.worktrees/flexible-writer-role`; task commit `e462eefc` was integrated into recorded target `main` through merge commit `bdef99d6`. Focused behavior, typecheck, runtime smoke, and diff checks are recorded above.
- Closeout: the archived spec and implementation are present on `main`; the active spec copy was removed. The changelog entry was staged separately with completion metadata so the originating checkout's unrelated changelog work remained uncommitted and preserved.
- Blockers/open decisions: none. The focused suite's sole failing Sol-default fixture is reproduced unchanged on originating `main` and is not task-related.
- Verification limits: static and lifecycle tests establish composition, serialized identity fields, and authority declarations. They do not prove live model adherence, writing quality across every artifact type, or registration in an unrelated analytics profile.

## Closeout

After implementation and agreed agent-owned checks pass, update task evidence and record integration as pending. Confirm `.specs/archive/flexible-writer-role/` does not contain another plan, then move this entire spec directory there in the task worktree and repair affected links. Commit the implementation and archived spec together on the task branch. Do not archive unfinished implementation.

Unless explicitly disabled, merge the task branch into the recorded originating `main` checkout without stashing, discarding, or committing unrelated target changes. Resolve routine merge conflicts within settled intent; ask only for consequential decisions or prerequisites outside authority. If integration is blocked, retain the worktree and report implementation and checks separately from pending delivery.

After a successful merge, verify the target contains the changes and archive and no active plan copy remains. Then set the archived plan's `status: completed` and `completed` date, record integration evidence, and commit that metadata update on the target. Rerun affected checks only if conflict resolution changed checked content. Remove the task worktree only when integration succeeded and it has no uncommitted or unmerged work. Push requires explicit user authorization. Operator manual testing does not block closeout.

### Final response

Start with one overall outcome:

- 🟢 **COMPLETED**: checks passed, integrated, completion metadata committed, and task worktree cleanup verified.
- 🔴 **NOT COMPLETE: MERGE BLOCKED**: implementation committed, integration blocked.
- 🔴 **NOT COMPLETE: USER INPUT REQUIRED**: a consequential decision or prerequisite prevents finishing; state the precise question and recommendation.
- 🔵 **IMPLEMENTED: MERGE SKIPPED AS REQUESTED**: checks passed and changes committed under an explicit no-merge instruction.
- 🟡 **CLEANUP PENDING**: changes and completion metadata are on the target, but worktree cleanup is unfinished.

For blocked or cleanup-pending outcomes, immediately give **Reason** and **Action needed**, naming the issue, owner, and exact next action before successes. Then give concise checks, spec location, branch/commits, merge result, and retained worktree or cleanup remnants.
