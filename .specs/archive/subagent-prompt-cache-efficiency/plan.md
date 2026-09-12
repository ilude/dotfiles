---
created: 2026-09-11
status: ready
completed: null
---

# Make subagent prompts smaller and cache-stable

## Goal and scope

- User requirements and settled decisions: prune coordinator prompts by audience, preserve required delegation behavior, and improve prompt-cache reuse through deterministic prompt construction. Keep assignments and runtime-specific values outside the system prompt.
- Apply the Pareto principle: target material that is irrelevant to a role or destabilizes a reusable prefix. Do not optimize harmless bootstrap-only duplication or redesign subagent authority.
- Cache effectiveness means a byte-stable system prompt for the same role, tool set, skill set, catalog, and model configuration. Provider cache hits remain provider-controlled.
- Authorization: planning only. Implementation, commits, merge, and push are not authorized by this request.

## Fresh-context handoff

All paths are relative to the dotfiles repository root. Read the root and `pi/profiles/default/AGENTS.md` instructions before acting.

- Owning repository: this dotfiles repository; implementation belongs under `pi/profiles/default/`.
- Required reading:
  - `pi/profiles/default/lib/subagents/guidance.ts`
  - `pi/profiles/default/extensions/subagent-child.ts`
  - `pi/profiles/default/lib/subagents/launch.ts`
  - `pi/profiles/default/agents/{strategist,teamlead,council,steward}.md`
  - `pi/profiles/default/tests/subagent-guidance.test.ts`
  - `pi/profiles/default/tests/subagent-launch-prompt.test.ts`
  - `pi/profiles/default/tests/subagent-loader.test.ts`
- Verified starting behavior, 2026-09-11 on `main`: `composedAgentPrompt()` injects one complete `SHARED_GUIDANCE` block into Strategist and every role with delegates. Council therefore receives model-selection, Steward, retry, and Team Lead guidance unrelated to council deliberation. Catalog entries are already sorted. Assignments are sent as later user messages rather than included in `PI_SUBAGENT_PROMPT`.
- Measured empty-assignment bootstrap sizes across the ten current roles: mean 2,734 bytes, median 1,118, minimum 934, maximum 6,462 for Strategist. This is not production telemetry and includes transport data that does not all enter model context.
- `subagent-child.ts` appends a model-visible authority sentence before `PI_SUBAGENT_PROMPT`. It interpolates only role and tool names, but tool order is not normalized there.
- Work to preserve: recheck status before editing. Do not alter the explicit `LaunchSpec` projection or bounded visible-host diagnostics delivered in `534ef1c3`.
- Worktree and integration target: `.worktrees/subagent-prompt-cache-efficiency` on `feature/subagent-prompt-cache-efficiency`, created from `C:/Users/mglenn/.dotfiles` branch `main` at `8faaee0c3d62ad08037046fda3a9cfc4deedb477`.
- Profiles: planned and intended execution profile is `pi/profiles/default`; no post-change run exists yet.

## Decisions and implementation contract

- Replace the monolithic shared text with a small common delegation block plus audience-specific guidance for Strategist, Team Lead, and Council.
- Preserve the settled behavior in the role definitions and profile-wide delegation contract. Strategist retains assignment/model/effort advice; Team Lead retains coordination, dependency, integration, and bounded retry advice; Council retains explicit-user invocation, independent openings, rebuttal, synthesis, and non-writing limits.
- `composedAgentPrompt()` must emit sections in a deterministic order. Catalog filtering and lexical ordering remain stable.
- Keep task assignments in later user messages. Do not add child IDs, parent IDs, CWDs, display names, endpoints, timestamps, or task text to model-visible system prompts.
- Normalize model-visible tool-name ordering without changing the frozen authority or active tool ceiling.
- Do not introduce cache-control APIs, provider-specific prompt formats, new telemetry, or a cache-key subsystem. Use existing session usage fields for optional live observation.
- Update `CHANGELOG.md` because prompt composition and coordinator behavior are operator-facing runtime changes.

## Execution guidance

Create a dedicated worktree and branch, record them here, and carry this plan into that worktree before editing. Preserve unrelated work. Keep task evidence current. Adjust routine function names or test organization when repository evidence supports it, but do not broaden this into a general prompt framework.

## Tasks

- [x] **T1: Split delegation guidance by audience**
  - Depends on: none.
  - Files: `pi/profiles/default/lib/subagents/guidance.ts`, `pi/profiles/default/tests/subagent-guidance.test.ts`.
  - Change: extract concise common and role-specific guidance, then compose only the sections required by Strategist, Team Lead, and Council in fixed order. Retain the permitted-role catalog and its deterministic sorting.
  - Verify: focused tests demonstrate required content and explicit absence of unrelated content for each coordinator; repeated composition and differently ordered equivalent catalogs produce byte-identical output.
  - Done when: each coordinator receives its required policy without the full orchestrator-oriented block, leaf prompts remain role-only, and deterministic tests pass.
  - Evidence: `guidance.ts` now composes caller, common coordinator, Strategist, Team Lead, and Council sections explicitly. Focused tests verify required inclusion/exclusion, catalog filtering, stable ordering, and leaf isolation.

- [x] **T2: Stabilize model-visible child authority text**
  - Depends on: T1.
  - Files: `pi/profiles/default/extensions/subagent-child.ts`, `pi/profiles/default/tests/subagent-loader.test.ts`, and a focused helper test if needed.
  - Change: construct the authority sentence deterministically from the role and sorted tool names. Keep runtime identifiers and assignments out of it and preserve tool enforcement behavior.
  - Verify: tests compare output across equivalent tool-order inputs and confirm runtime IDs, paths, endpoints, surfaces, display names, and assignments are absent from model-visible authority text.
  - Done when: equivalent authority inputs yield byte-identical text and the existing active-tool ceiling tests still pass.
  - Evidence: `childSystemPrompt()` sorts and deduplicates model-visible tool names while retaining the existing frozen active-tool set. Loader tests verify equivalent orderings and absence of representative runtime values.

- [x] **T3: Verify prompt boundaries and size improvement**
  - Depends on: T1, T2.
  - Files: `pi/profiles/default/tests/subagent-launch-prompt.test.ts`, relevant focused test helpers, `CHANGELOG.md`.
  - Change: preserve later-message assignment delivery for headless and visible children; add regression assertions that `PI_SUBAGENT_PROMPT` is task-independent and stable. Record before/after composed-prompt byte sizes for Strategist, Team Lead, and Council in task evidence, not runtime code.
  - Verify from `pi/profiles/default`: `pnpm test subagent-guidance.test.ts subagent-launch-prompt.test.ts subagent-loader.test.ts subagent-runtime.test.ts`; `pnpm run typecheck`; repository root: `git diff --check`.
  - Done when: focused checks pass, all three coordinator prompts are no larger than before, Council excludes unrelated delegation policy, and the changelog explains preserved behavior and cache intent.
  - Evidence: Focused tests passed, 30 tests total. TypeScript typecheck and `git diff --check` passed. Composed prompt byte sizes decreased: Strategist 5,011 to 2,482; Team Lead 4,805 to 2,451; Council 4,452 to 1,353. Launch tests verify assignment/runtime independence. `CHANGELOG.md` records the cache-stability intent and preserved boundaries.

- [ ] **T4: Integrate and close out after authorization**
  - Depends on: T3 and separate implementation/integration authorization.
  - Change: archive this spec with the implementation commit, merge into the recorded originating checkout, mark archived completion metadata, commit it, and clean the task worktree. Push only with explicit permission.
  - Done when: implementation and archived plan are present on the target, metadata is completed, and worktree cleanup is verified; otherwise report the exact integration blocker.
  - Evidence: Not started.

## Agreed validation and current handoff

- Status: implementation and agreed agent-owned checks complete; archival and integration pending.
- Completed work and evidence: T1-T3 are complete. Focused tests passed (30 tests), typecheck passed, and `git diff --check` passed. Coordinator prompt sizes decreased materially as recorded under T3.
- Next: archive and commit the implementation, merge it into recorded `main`, commit completion metadata there, and remove the clean task worktree.
- Blockers/open decisions: none.
- Verification limits: actual provider cache-read behavior is not an agent-owned acceptance gate because provider caches are external and timing-dependent. After implementation, repeated same-role launches may be compared through existing session `cacheRead` usage as non-blocking live evidence; do not add telemetry solely for this check.

## Closeout

After implementation and agreed checks pass, update evidence and record integration pending. Confirm `.specs/archive/subagent-prompt-cache-efficiency/` is unused, move this entire spec there in the task worktree, and commit implementation plus archive together. Merge into the recorded originating checkout without disturbing unrelated changes. Resolve routine conflicts within settled intent. Push requires separate authorization.

After merge, verify the target contains the implementation and archive, set the archived plan to `status: completed` with the completion date, commit that metadata update, and remove the clean task worktree. Operator live cache observation does not block closeout.

### Final response

Use the applicable explicit outcome: 🟢 **COMPLETED**, 🔴 **NOT COMPLETE: MERGE BLOCKED**, 🔴 **NOT COMPLETE: USER INPUT REQUIRED**, 🔵 **IMPLEMENTED: MERGE SKIPPED AS REQUESTED**, or 🟡 **CLEANUP PENDING**. For any non-completed outcome, state the reason and exact action owner first, then report checks, spec location, branch/commits, integration state, and retained worktree.
