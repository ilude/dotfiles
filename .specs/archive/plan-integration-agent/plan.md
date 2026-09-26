---
created: 2026-09-25
status: completed
completed: 2026-09-26
---

# Delegate authorized plan integration and cleanup to an Integrator agent

## Goal and scope

- User requirements and settled decisions:
  - Add a dedicated `integrator` subagent role that owns the closeout phase of authorized plan execution after implementation, agreed checks, archival, and the task-branch commit are complete.
  - Keep detailed merge, temporary preservation, restoration, metadata, and worktree-cleanup procedures out of the ordinary orchestrator prompt and tool catalog. The orchestrator should dispatch the Integrator through the existing `subagent` tool and retain responsibility for final user reporting and consequential questions.
  - Give the Integrator a repository-owned, narrowly validated closeout helper rather than several new always-visible model tools or a broad Damage Control bypass mode.
  - Treat `/do-it` without `--no-merge` as authorization for local integration and, when needed, temporary stash-and-restore of unrelated target-checkout changes. Include tracked and untracked files, exclude ignored files, and avoid stashing when disjoint dirty changes can safely remain in place.
  - Resolve routine task-branch merge conflicts within settled plan intent. Return restoration conflicts, consequential overlapping edits, ambiguous stash identity, missing/conflicting integration targets, and other user-only decisions to the orchestrator with exact evidence.
  - Launch the Integrator from the recorded parent checkout, default it to Luna high, preserve the task branch after successful worktree removal, and skip Integrator dispatch under `--no-merge`.
  - Return structured closeout outcomes corresponding to `COMPLETED`, `MERGE BLOCKED`, `USER INPUT REQUIRED`, and `CLEANUP PENDING`; the orchestrator converts that result into the existing outcome-first final response.
  - Valid authorized closeout should not trigger Damage Control prompts. Invalid, broadened, unresolved, or unrelated operations remain governed by normal Damage Control behavior.
- Non-goals:
  - Do not add a plan-wide Damage Control mode, exempt an Integrator shell session generally, trust arbitrary agent commands, or weaken remote Git, protected-path, destructive-history, ignored-file, or unrelated-operation controls.
  - Do not push, deploy, force-push, rewrite published history, delete the task branch, or automatically choose between consequential overlapping edits.
  - Do not introduce a second plan-state registry, daemon, persistent integration queue, or general rollback framework.
  - Do not change the legacy Pi profile.
- Authorization: planning only. Execution, local commits, and merge require a later execution request. Push and deployment are not authorized.

## Fresh-context handoff

All paths are relative to `C:/Users/mglenn/.dotfiles`. Read root `AGENTS.md` and `pi/profiles/default/AGENTS.md` before acting. Ignore `pi/profiles/legacy/`.

- Owning repository and boundary: this dotfiles repository owns the default Pi subagent roles, skills, `/do-it` prompt, Damage Control implementation, closeout helper, tests, and operator documentation.
- Required reading:
  - `pi/profiles/default/prompts/do-it.md`
  - `pi/profiles/default/agents/{developer,strategist}.md` and `pi/profiles/default/lib/subagents/{definitions,guidance,launch,runtime}.ts`
  - `pi/profiles/default/extensions/{subagents,subagent-child}.ts`
  - `pi/profiles/default/skills/git-workflow/SKILL.md`
  - `pi/profiles/default/lib/damage-control/{adapters,analysis,enforcement,shell,script-review,script-trust,types}.ts`
  - `pi/profiles/default/extensions/damage-control/index.js`
  - `pi/profiles/default/docs/{subagents,damage-control-setup}.md`
  - focused tests under `pi/profiles/default/tests/{subagent-*,damage-control/**}`
  - installed Pi extension documentation at the path recorded by the active profile instructions.
- Verified starting behavior on 2026-09-25:
  - Subagent definitions are profile Markdown files parsed by `lib/subagents/definitions.ts`; role frontmatter can set tools, model, effort, skills, and delegates. Ordinary children receive role-scoped tools and instructions through the existing subagent runtime.
  - `/do-it` currently keeps integration in the orchestrator and explicitly forbids stashing unrelated target changes. Its final outcome contract already distinguishes completed, merge-blocked, user-input-required, intentionally skipped, and cleanup-pending results.
  - Damage Control currently offers only `default` and `noshell` modes plus a limited session-local `/dc off` bypass. That bypass applies only to eligible contextual asks and is intentionally not a general authorization mechanism.
  - Damage Control's judge prompt already recognizes narrow Git cleanup after guards prove a worktree clean and integrated, but shell review remains probabilistic and can still ask. Reviewed-script trust is source-hash and invocation bound; it is not a general workflow authority.
  - The existing Git workflow requires explicit approval before stash preservation and prescribes named `--include-untracked` stashes, exact stash OIDs, `apply` rather than `pop`, verified restoration, and deletion only of the unambiguously matching stash.
  - The motivating 2026-09-25 plan closeout merged cleanly with unrelated parent changes but `git worktree remove` left a Windows long-path directory remnant; exact-path Node removal completed cleanup. A dedicated closeout path must handle this without broad deletion authority.
- Work to preserve: the originating checkout currently has unrelated modifications in `.specs/advocate-agent/notes.md` and `pi/profiles/default/settings.json`. Recheck before execution and do not commit, discard, stash, or overwrite them except through the new closeout feature's own isolated test fixtures.
- Worktree and integration target: originating checkout `C:/Users/mglenn/.dotfiles`, branch `main`; task worktree `C:/Users/mglenn/.dotfiles/.worktrees/plan-integration-agent`, branch `feature/plan-integration-agent`, created from `6ec31d87730262640918874778888090480fc444` on 2026-09-26.
- Profiles: planning used the repository-owned default profile. Intended implementation and checks use `pi/profiles/default`; no legacy changes or tests are in scope. Record actual dated runs separately.

## Decisions and implementation contract

- Add `integrator` as a non-coordinator profile role with default model `luna`, effort `high`, no delegates, and only the tools/skills needed to inspect, integrate, edit completion metadata, commit, and report. Keep the catalog description concise; put detailed procedure in a dedicated integration skill loaded for that role.
- The orchestrator dispatches one Integrator only after implementation, agreed checks, spec archival, and the task-branch commit succeed. It launches from the recorded parent checkout and supplies an explicit closeout manifest: archived plan path/spec stub, task worktree and branch, task commit, target checkout and branch, known starting target state when available, `--no-merge` state, and the execution authorization relevant to integration.
- `--no-merge` remains authoritative: do not launch the Integrator for mutation. The orchestrator records and reports intentionally pending integration using the existing blue outcome.
- The Integrator may leave disjoint target changes in place when ordinary Git integration can preserve them. If temporary preservation is required, it creates a named stash with untracked files but not ignored files, records the exact OID and captured paths, verifies capture before integration, applies that exact OID after integration, verifies restoration, and drops only the uniquely matching stash reference after successful restoration.
- Routine merge conflicts within settled plan intent are Integrator-owned. A restoration conflict or consequential task/target overlap is not silently resolved; preserve the stash and worktree, return exact conflicted paths and state, and classify the result as user input required or merge blocked as applicable.
- The closeout implementation must be resumable from actual Git state rather than assuming an uninterrupted first run. It must recognize completed merge, retained stash, committed metadata, deregistered worktree, and exact-path cleanup-remnant states without duplicating commits or dropping evidence.
- Mechanical closeout operations belong behind one repository-owned helper/library with a bounded command surface, canonical path checks, Git identity/ancestry checks, exact stash identity, and machine-readable results. Detailed helper arguments are child-only context, not added to the ordinary orchestrator's active tools.
- Damage Control must deterministically permit only validated helper operations belonging to an authorized Integrator closeout. Do not exempt arbitrary shell calls, arbitrary scripts with the same filename, helper calls outside their validated repository/profile identity, dynamic/unresolved targets, remote mutations, or operations beyond the closeout manifest. Invalid calls fail closed or return through normal Damage Control analysis.
- The implementation may choose the narrowest reliable authority handoff supported by the current subagent runtime, such as role/session provenance plus a short-lived manifest. It must not treat prose alone, a command basename, an environment variable supplied by the model, or residence under `.worktrees/` as sufficient authority.
- Completion metadata is committed only after the target contains the task commit and archived plan and unrelated target changes have been restored. Worktree removal happens only after metadata commit and task-worktree cleanliness/unmerged-work checks. A task branch remains after cleanup.
- Windows long-path cleanup may remove only the exact task worktree path after Git has successfully deregistered it. It must re-verify containment and absence from `git worktree list`; it must never recursively clear the shared `.worktrees` directory.
- Integrator results use a stable typed shape containing outcome, reason/action when blocked, target/task commits, stash OID/state when applicable, merge and metadata results, archived/active spec checks, worktree registration/path state, retained recovery artifacts, and concise commands/check evidence. The parent remains responsible for the user-facing response.

## Execution guidance

Create or resume the recorded dedicated task worktree and branch. Record the actual path, branch, and originating integration target before editing. Preserve unrelated work and carry this untracked plan into the task worktree without deleting its source.

Before delegating plan work, consult `strategist` unless the user explicitly requests a single-agent handoff, including a Team Lead. A Team Lead still follows its own Strategist-first workflow. Assign at most one named plan task per subagent, split larger tasks further, and use only roles from the active agent catalog. The new Integrator role is unavailable until its definition is implemented and activated; do not use the feature under construction to integrate this plan unless the completed runtime can safely bootstrap from the existing closeout procedure without circular assumptions.

Implement the settled intent through the agreed checks. Adapt technical mechanisms when repository evidence requires it, but do not change user intent, scope, settled decisions, or acceptance without approval. Continue independent work around blockers and ask only for a consequential decision or external prerequisite. Do not add optional workflow modes, generalized cleanup, audits, or acceptance gates.

Keep checkbox state, concise evidence, blockers, and next action current. Leave integration/cleanup incomplete until actual closeout succeeds. Fix demonstrated task-related failures and stop when the finite checks pass.

## Tasks

- [x] **T1: Define and test the bounded closeout state machine**
  - Depends on: none.
  - Files/inputs: proposed `pi/profiles/default/lib/plan-integration/` modules and focused proposed tests under `pi/profiles/default/tests/plan-integration/`; existing Git workflow skill as behavioral input.
  - Change: implement the typed manifest, state inspection, outcome schema, and mechanical closeout operations for target verification, overlap classification, optional stash creation/capture verification, merge, exact stash restoration/drop, archive and completion-metadata verification/commit, worktree deregistration, and exact Windows remnant cleanup. Make operations resumable and return machine-readable evidence without deleting the task branch.
  - Complexity / split hints: separate pure state classification from subprocess/filesystem mutation so fixture tests can exercise interruption and recovery deterministically. Stash identity/restoration and post-deregistration long-path cleanup are independently verifiable boundaries if this task must be split further.
  - Verify: focused plan-integration tests using disposable Git repositories and worktrees on the current platform. Cover clean target, disjoint dirty tracked/untracked target, ignored files, required preservation, routine merge conflict, restoration conflict, ambiguous/missing stash, already-merged resume, already-committed metadata, ordinary cleanup, and a simulated post-deregistration remnant.
  - Done when: the library can complete or safely stop every agreed closeout branch with exact retained-state evidence and no mutation outside disposable fixtures.
  - If blocked: record the unsupported Git/platform behavior and preserve the existing manual closeout contract; do not weaken identity, containment, or restoration guarantees.
  - Evidence: Implemented typed manifest/result contracts, read-only inspection, resumable Git/worktree closeout operations, exact stash handling, metadata-only commit, and bounded remnant cleanup. On 2026-09-26, `cd pi/profiles/default && pnpm test tests/plan-integration/closeout.test.ts` passed (10 tests), `pnpm run typecheck` passed, and root `git diff --check` passed. Disposable fixtures covered clean/disjoint/ignored changes, overlapping stash and restore, merge and restoration conflicts, stash identity failures, completed-state resume, no-merge, worktree cleanup, and deregistered remnant cleanup.

- [x] **T2: Add the Integrator role and role-scoped closeout procedure**
  - Depends on: T1's manifest and result contracts.
  - Files/inputs: proposed `pi/profiles/default/agents/integrator.md`; proposed `pi/profiles/default/skills/plan-integration/SKILL.md`; `lib/subagents/{definitions,guidance,launch,runtime}.ts`; `extensions/{subagents,subagent-child}.ts`; relevant definition/guidance/runtime/presentation tests.
  - Change: register the concise Luna-high Integrator role, load its detailed integration skill only in that child, constrain delegation and tools, transfer the explicit closeout manifest and authority provenance, and return the typed result to the parent. The role reports consequential decisions instead of prompting the user and does not perform push/deployment or branch deletion.
  - Complexity / split hints: distinguish prompt/catalog composition from runtime authority propagation. Do not solve authority by expanding all subagent prompts or exposing closeout internals to unrelated roles.
  - Verify: focused definition/guidance/runtime tests prove default model/effort, tool and skill isolation, parent-checkout cwd, manifest/provenance transfer, no delegation, structured outcomes, and absence of detailed helper/tool definitions from ordinary orchestrator composition.
  - Done when: an orchestrator can dispatch exactly one role-scoped Integrator and receive sufficient evidence for the existing final-response contract without carrying the integration procedure itself.
  - If blocked: keep ordinary manual integration active and report the missing runtime provenance/API; do not infer authorization from assignment prose alone.
  - Evidence: Added the Luna-high, non-delegating Integrator role and isolated plan-integration skill; runtime now validates the root-only target-checkout manifest handoff and carries it with child ID, role, and authenticated parent-session provenance. On 2026-09-26, focused subagent integration/guidance/launch/runtime tests passed (41 tests), `pnpm run typecheck` passed, and `git diff --check` passed. The broader definition test file has one unrelated registry-dependent failure because no authenticated `openai-codex` Sol model is available; the new role/handoff test passed.

- [x] **T3: Permit validated Integrator closeout without Damage Control prompts**
  - Depends on: T1's bounded operation identities and T2's authority provenance.
  - Files/inputs: proposed closeout helper entrypoint under `pi/profiles/default/scripts/`; `lib/damage-control/{adapters,analysis,enforcement,shell,types}.ts` as required; Damage Control fixtures/tests and setup documentation.
  - Change: connect the helper to the T1 library and make Damage Control deterministically recognize only an authorized, canonical Integrator closeout operation. Valid local closeout runs without an operator prompt; altered helper identity, broadened paths, missing authority, dynamic operands, unrelated commands, remote operations, and protected targets remain blocked, reviewed, or prompted under existing policy. Preserve `/dc on|off` and `default|noshell` semantics.
  - Complexity / split hints: the authority decision must be based on runtime/manifest provenance plus canonical executable identity, not command text. Keep deterministic authorization separate from ordinary policy/judge outcomes so valid closeout does not depend on model judgment.
  - Verify: focused Damage Control tests cover valid clean integration, authorized stash/restore, exact worktree cleanup, helper mutation or aliasing, forged environment/arguments, sibling worktree target, shared-root deletion, remote Git, ignored-file handling, and mixed-command attempts. Confirm valid cases never invoke the approval UI or Luna judge and invalid cases do not inherit the exemption.
  - Done when: the Integrator's bounded helper performs authorized local closeout quietly while existing Damage Control boundaries remain unchanged for all other operations.
  - If blocked: retain normal Damage Control enforcement and report the exact missing provenance hook; do not add a broad role/session bypass.
  - Evidence: Added `scripts/plan-integration.mjs closeout`, which consumes only the authenticated Integrator runtime handoff and delegates to T1's validated closeout state machine. Damage Control deterministically allows only the single canonical helper invocation with exact helper SHA-256, canonical path, validated manifest, and runtime child/role/parent-session provenance; other calls remain under ordinary enforcement. Added setup documentation and focused valid/invalid authorization fixtures. On 2026-09-26, `cd pi/profiles/default && pnpm test tests/damage-control/plan-integration-authority.test.ts` passed (14 tests), `pnpm run typecheck` passed, and root `git diff --check` passed. A broader focused run including `enforcement.test.ts` had two native-judge fixture failures (`integrates the native branch through the gate and actual review`, `uses only the current native branch after resume, reload, and tree navigation`); the other 41 tests passed. Damage Control mode and `/dc on|off` code paths remain unchanged.

- [x] **T4: Wire plan execution and documentation to Integrator-owned closeout**
  - Depends on: T2's dispatch/result contract and T3's validated quiet execution path.
  - Files/inputs: `pi/profiles/default/prompts/do-it.md`; `pi/profiles/default/skills/planning/{SKILL.md,references/plan-template.md}`; `pi/profiles/default/skills/git-workflow/SKILL.md`; `pi/profiles/default/docs/{subagents,damage-control-setup}.md`; root `CHANGELOG.md`; focused prompt/guidance tests.
  - Change: replace orchestrator-owned merge/cleanup procedure with dispatch of the Integrator after the task commit; explicitly authorize temporary stash-and-restore under the settled constraints; preserve `--no-merge`, outcome-first reporting, push/deployment boundaries, and parent-owned user questions. Update new-plan closeout language so future plans record the Integrator handoff rather than duplicating detailed Git procedure. Document the role and Damage Control boundary concisely.
  - Complexity / split hints: keep always-loaded wording short and move procedural detail to the role skill. Existing plans remain executable under their recorded closeout contract; do not rewrite archived plans.
  - Verify: prompt/guidance tests assert the dispatch point, authority, `--no-merge` behavior, conflict boundary, output mapping, and absence of the obsolete blanket no-stash instruction. Compare composed ordinary-orchestrator bytes/tool definitions to confirm no new closeout tool schema or detailed procedure is always visible.
  - Done when: new `/do-it` runs delegate authorized integration consistently and ordinary orchestrator context grows only by the concise role/catalog and handoff language.
  - If blocked: keep `/do-it`'s current manual closeout wording until the runtime path is complete; do not publish a delegation instruction that cannot execute.
  - Evidence: Updated `/do-it`, planning template, Git workflow skill, subagent and Damage Control docs, and `CHANGELOG.md` to dispatch the Integrator after the task-branch commit. Preserved `--no-merge`, conditional tracked/untracked stash authority excluding ignored files, disjoint-change handling, routine-conflict ownership, parent-owned questions/reporting, and push/deployment authorization boundaries. Removed the detailed manifest field from the ordinary subagent tool schema; the assignment envelope is stripped and converted to the existing runtime-authenticated child handoff. Added focused prompt/guidance and tool-schema tests. On 2026-09-26, `cd pi/profiles/default && pnpm test tests/plan-integration-guidance.test.ts tests/subagent-guidance.test.ts tests/subagent-integration-handoff.test.ts tests/damage-control/plan-integration-authority.test.ts` passed (38 tests); `pnpm run typecheck` and root `git diff --check` passed. Re-ran `pnpm test tests/damage-control/enforcement.test.ts`: 22 passed, with the same two native-judge fixture failures previously recorded in T3 (`integrates the native branch through the gate and actual review`, `uses only the current native branch after resume, reload, and tree navigation`).

- [ ] **T5: Validate the end-to-end closeout lifecycle and finish this plan**
  - Depends on: T1-T4 complete.
  - Files/inputs: all task changes; disposable repositories/worktrees only for integration scenarios; this spec.
  - Change: run the finite checks below, fix task-related failures, update evidence, and complete the existing closeout contract. Bootstrap this plan's own integration carefully: use the new Integrator only if activation and authority are available in the executing process without unsafe circularity; otherwise use the pre-change manual procedure once and record that verification limit.
  - Verify:
    - `cd pi/profiles/default && pnpm test` with focused filters for plan-integration, subagent definitions/guidance/runtime/presentation, prompt composition, and Damage Control integration tests
    - `cd pi/profiles/default && pnpm run typecheck`
    - `cd pi/profiles/default && pnpm run check:runtime`
    - disposable end-to-end scenarios for a clean target, disjoint dirty target, stash/restore target, merge conflict, restoration conflict, `--no-merge`, successful metadata commit, and worktree cleanup/remnant reporting
    - ordinary-orchestrator prompt/tool-definition comparison showing closeout internals are not added globally
    - `git diff --check`
  - Done when: checks pass; no disposable repositories, stashes, generated trust records, or test worktrees remain; implementation and archived plan are committed, integrated into the recorded target, completion metadata is committed, and task-worktree cleanup is verified.
  - If blocked: retain exact task/stash/worktree state, identify who must act and the next command or decision, and report implementation separately from integration. Do not claim the new agent completed this plan if the bootstrap used manual closeout.
  - Evidence: On 2026-09-26, ran the disposable closeout lifecycle tests (10 fixture tests) covering clean and disjoint-dirty targets, stash/restore with ignored-file exclusion, merge conflict and resume, restoration conflict with retained stash, no-merge, metadata commit/resume, worktree cleanup/remnant handling, and missing/ambiguous stash identity. The focused plan-integration, subagent guidance/runtime/presentation/handoff, Damage Control authority, and enforcement run passed: 9 files, 119 tests. Its first run reproduced the two known Damage Control enforcement failures: the native judge fixture still exposed `find()` while production resolution now uses `getAll()`; updated that test fixture to supply an authenticated Luna through `getAll()`, after which both tests passed. `pnpm run typecheck`, `pnpm run check:runtime`, and root `git diff --check` passed. The subagent definitions file's focused non-registry tests passed (21 passed, 4 skipped); the full file's existing test requiring an authenticated `openai-codex` Sol model remains environment-dependent and fails when none is configured, as recorded under T2. The visibility comparison passed: composed caller prompt includes only the concise Integrator catalog description, excludes helper/provenance/manifest internals, and remains under 4,500 bytes; ordinary subagent tool parameters expose no closeout manifest field.

## Agreed validation and current handoff

- Status: completed on 2026-09-26.
- Completed work and evidence: implementation and archive were committed on `feature/plan-integration-agent` as `7e971d308977d5d948d976035d3bb3001f17d36f`. Disposable lifecycle scenarios, 119 focused tests, typecheck, runtime smoke, ordinary-orchestrator visibility comparison, and `git diff --check` passed as recorded under T5. One environment-dependent definition test requires an authenticated `openai-codex` Sol model; its focused non-registry coverage passed.
- Integration result: manually bootstrapped under the pre-change closeout contract into `C:/Users/mglenn/.dotfiles` branch `main` with merge commit `f77ac075d993d3bb90e9269ef39698fa39a4c074`. A routine `CHANGELOG.md` merge conflict was resolved by preserving both entries. Existing unrelated target changes remained unstaged and no stash was required.
- Closeout: the active spec was removed, this archived plan records actual completion metadata, and the metadata commit follows this update. The task branch is preserved. Task-worktree cleanup is verified after that commit.
- Blockers/open decisions: none.
- Verification limits: closeout scenarios use disposable Git repositories/worktrees through the production closeout library. The runtime smoke validates bootstrap/policy/grammars without executing tools or calling a model. This plan's own integration was manual because the running process could not safely bootstrap the newly added role and authority path.

## Closeout

After implementation and agreed checks pass, update task evidence and record integration as pending. Confirm `.specs/archive/plan-integration-agent/` does not contain another plan, then move this whole spec directory there in the task worktree and repair links. Commit implementation and archived spec together on the task branch. Do not mark the plan completed yet.

This plan must bootstrap against the current manual closeout contract unless the newly implemented Integrator is safely active and can receive verified authority in the executing process. In either case, merge into the recorded originating checkout and branch without discarding or committing unrelated changes. Under the newly approved behavior, temporary stash-and-restore is authorized only when required and must follow the exact preservation contract above. Resolve routine merge conflicts within settled intent; ask only for consequential decisions or external prerequisites. With `--no-merge`, retain the committed task worktree and report integration as intentionally pending.

After successful integration, verify the target contains the changes and archive and no active plan remains. Set the archived plan to `status: completed` with the actual date, record integration evidence and whether bootstrap closeout was manual or Integrator-owned, and commit that metadata on the target. Remove the task worktree only after integration and restoration succeed and it has no uncommitted or unmerged work. Push and deployment remain unauthorized. Operator manual testing does not block closeout.

### Final response

Start with exactly one overall outcome using both symbol and text:

- 🟢 **COMPLETED**: checks passed, integrated, completion metadata committed, and task-worktree cleanup verified.
- 🔴 **NOT COMPLETE: MERGE BLOCKED**: implementation is committed but integration could not finish.
- 🔴 **NOT COMPLETE: USER INPUT REQUIRED**: a consequential decision or prerequisite prevents finishing.
- 🔵 **IMPLEMENTED: MERGE SKIPPED AS REQUESTED**: checks passed and changes are committed under `--no-merge`; retained worktree is intentional.
- 🟡 **CLEANUP PENDING**: integration and completion metadata are on the target, but cleanup remains unfinished.

For blocked or cleanup-pending outcomes, put **Reason** and **Action needed** immediately after the heading, naming the concrete issue, responsible actor, and exact next action. Then report checks, archived or active spec location, task branch/commits, merge target/result, stash state if any, and retained worktree or cleanup remnants. Do not imply automatic resumption or lead a blocked response with successes.
