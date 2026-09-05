---
created: 2026-09-05
status: complete
completed: 2026-09-05
---

# Resolve workflow state consistently across inspection and execution

## Objective

Make Pi workflow discovery, inspection, resume, and closeout use one read-only interpretation of existing plan, ownership, and Git evidence, so a stale primary plan cannot conceal owned implementation or cause completed work to restart.

## Completion Evidence

- Evidence: Disposable real-Git fixtures produce consistent workflow identity, selected execution copy or explicit conflict, recorded implementation/validation claims, integration facts, and cleanup/retention facts through discovery, the model-callable inspection surface, and execution preparation. Inspection changes no repository files, index, refs, or ownership, and the tool does not trigger an execution turn. Resume preserves the same evidence while mutations retain fresh action-specific checks. The representative stale-primary/completed-owned-archive case reports implementation claims and pending integration separately instead of reporting not started. Missing evidence is explicit, not a fabricated pass.
- Fails when: A caller silently chooses a contradictory plan; a checkbox or commit becomes proof of behavioral validation; completed or retained work is restarted; inspection changes persistent state; a cached observation authorizes mutation; unrelated dirt again blocks verified post-merge cleanup; or replaced callers retain competing source-selection logic.

## Boundaries

- In scope: Pi's canonical plan-backed workflow discovery, read-only inspection, preparation/resume evidence, closeout observation helpers, and bounded workflow evidence supplied in execution/review context. Reuse the existing plan parsers, ownership formats, Git runner, cache lifecycle, and mutation verifiers. Update directly affected tests, workflow/tool contracts, operator documentation, and changelog.
- Out of scope: New workflow engines, persisted aggregate status, databases, ledgers, watchers, polling, telemetry, automatic scope reconciliation, automatic validation reruns, generic review scoring, hot reload, provider changes, new slash commands, standalone CLIs, subagent APIs, or goal/task/loop redesign. Do not reopen test-review calibration, baseline work, or its completed cleanup. Do not infer semantic operator intent from arbitrary Markdown or session logs.
- Preserve: Canonical plan paths, task identities, readiness/attempt rules, existing flags, modified/untracked/ignored plan transfer behavior, v1 ownership compatibility, in-place and commit-and-retain operation, plan handoff binding, closed-read worker authority, and all existing pre-mutation authorization/target/ownership checks. Preserve the post-merge cleanup behavior committed in `3cc9a20b`, including later primary commits, unrelated dirt, and exact qualifying merge evidence. Raw work and goal consumers of shared helpers retain their current semantics.
- Implementation workspace: `/do-it` must create and own this plan's implementation worktree before source edits, test authoring, validation, archive, or commit. Planning changes only this canonical plan in primary. Do not modify other worktrees, unrelated primary changes, submodules, or runtime records during implementation except disposable owned test fixtures and this workflow's normal closeout.
- Assumptions: Planning inspected clean primary `main` at `3cc9a20b`; recheck at execution. Existing configured dependencies are used without installation. The previously observed unrelated typecheck error is historical evidence, not an assumed current failure or permission to fix unrelated code.

## Selected mechanism

Extract a small read-only workflow observation module, with an injected existing Git runner and ordinary filesystem reads. Keep source selection as an explicit policy consuming that observation; execution selection never occurs merely because a file was encountered first. Existing mutation owners retain their checks and state changes. Prefer this shared interpretation over patching each caller, which leaves contradictory answers possible, or persisting another status, which creates another reconciliation problem.

The result carries only facts callers need: canonical identity; primary and owned source/archive locations; ownership and registered worktree/branch identity; parsed routing/task claims with their source path and revision when known; verified integration and resource presence; and explicit conflicts/errors. Present implementation, validation, integration, and cleanup/retention separately, not as one sequential lifecycle enum. Existing parsers establish recorded claims, not proof of tests passing. Absent machine-readable evidence remains unknown; bounded source references let the root inspect narrative evidence without a new evidence schema or transcript scanner.

Use the current resume policy for a demonstrably unchanged primary copy and for a valid completed owned archive. Independently changed primary plan content must remain visible as a conflict requiring contextual reconciliation, including when an owned archive exists. Do not implement semantic comparison or automatically reinstate cancelled work. A conflict can be inspected and reported but cannot authorize execution. Completed archives without surviving ownership can report recorded completion and resource absence; they must not invent a branch identity, merge proof, validation result, or cleanup success from absence alone.

Add one read-only `workflow_inspect` tool to the existing workflow extension because no current callable surface answers the original status question without ad hoc filesystem inspection. Its optional canonical `path` selects one workflow; omission lists current primary canonical plans and existing plan-bound ownership records, deduplicated by repository and canonical identity. A selected path may also inspect its exact archived plan. Do not recursively scan all historical archives or arbitrary worktrees. Return bounded summaries with completeness/error information and exact paths for follow-up; do not hide malformed/conflicting entries as an empty list. Keep it available for permitted roots through normal tool discovery, without granting it to closed-read children or adding a slash command. It neither changes session state nor launches an execution turn.

Autocomplete remains an in-memory projection: preload observations at existing asynchronous lifecycle refresh boundaries and filter locally in the synchronous completion callback. No Git subprocesses on keystrokes or rendering. A list snapshot is observational; selected inspection and execution preparation refresh their evidence. Reuse repository/worktree facts within one invocation rather than invoking Git once per fact per plan. Use read-only Git arguments, disabled optional locks for status, existing timeout/abort cleanup, and disclosed failures; do not fetch, run hooks, or execute repository code.

## Tasks

- [x] **T1: Extract shared read-only workflow observation and selection**
  - Files: `pi/lib/workflow-observation.ts` (new); `pi/lib/workflow-worktree.ts`; `pi/lib/plan-state.ts` only if a compatible parser extraction is required; `pi/tests/workflow-observation.test.ts` (new); `pi/tests/workflow-worktree.test.ts`.
  - Change: Map the actual discovery, selection, ownership, and closeout callers before editing. Extract the common filesystem/Git observations and source-selection policy without moving mutations into the resolver. Author the representative stale primary plus completed owned archive fixture and inspect that slice before expansion; do not run it early. Finish the complete bounded observation behavior for active, archived, in-place, retained, conflicted, missing, malformed, and interrupted-resource cases. Preserve existing formats and distinguish absence from failed inspection. Reuse or extract existing merge/registration observations rather than adding a second implementation. Author tests for non-mutation and failure behavior at the filesystem/Git seam.
  - Done when: The typed result, read-only observation path, compatibility-preserving selection policy, and representative plus edge-case regressions are authored. Every field has a concrete caller need; source review identifies no mutation-capable path invoked by inspection. This is authored completion only; runtime acceptance remains T3.
  - Verify: deterministic Before marking T1 authored complete, inspect the caller map, complete diff, and test scenarios against the selected mechanism; defer all executable checks to T3. An unmet authored criterion leaves T1 incomplete: record the mismatch and stop dependent integration; do not claim completion, widen scope, or start executable retries. If current evidence requires changing an operator decision, ownership format, or excluded subsystem, stop affected work and report the required reconciliation instead of extending scope or adding fallback state.

- [x] **T2: Integrate consistent discovery, inspection, and execution context**
  - Files: `pi/extensions/workflow-commands.ts`; `pi/lib/workflow-commands/plan-lifecycle.ts`; `pi/lib/workflow-worktree.ts`; `pi/tests/plan-lifecycle.test.ts`; `pi/tests/workflow-dispatch.test.ts`; `pi/tests/workflow-observation.test.ts`; `pi/tests/workflow-worktree.test.ts`; `pi/skills/workflow/do-it.md`; `pi/skills/pi-extension/references/contracts/workflow-lifecycle.md`; `pi/skills/pi-extension/references/contracts/tool-discovery.md`; `pi/README.md`; `CHANGELOG.md`.
  - Change: Replace primary-only discovery and duplicated resume interpretation with T1 observations. Register the bounded root inspection tool and wire cache refreshes outside autocomplete/render callbacks. Make incomplete owned work and closeout-only recovery discoverable; expose conflicts for inspection without advertising them as executable. Preserve canonical completion values and flags. Supply bounded resolved workspace, comparison revision when established, selected plan, conflicts, and evidence limits in the existing execution context so later root-created review assignments use the actual implementation location; do not add a global delegation hook. Reuse observations in closeout preparation but re-read required target/merge/archive facts at each mutation boundary; do not make snapshot possession authorization. Remove replaced selection/scanning code and update mocks/callers for asynchronous refresh. Update owning documentation, not global instructions, to describe the exact surface, evidence limits, and separate completion dimensions.
  - Done when: All mapped in-scope callers consume the shared interpretation, the inspection tool is registered under existing root authority rules, and integrated entrypoint tests are authored. Existing goal/raw/in-place/retained consumers remain compatible without new orchestration. Source inspection accounts for replaced code and shows no new persisted aggregate status or mutation from inspection.
  - Verify: deterministic After integration, inspect the actual registration, authority, caller graph, refresh sites, dispatch context, and documentation against the selected contract; do not run development checks before T3. An unmet registration, authority, caller-replacement, refresh, or non-mutation criterion leaves T2 incomplete: record the mismatch and stop before T3 rather than retrying execution. Missing supported loader/runner contracts block the affected integration until inspected; do not invent flags or substitute a production trial.
  - Depends on: T1

- [x] **T3: Validate consistent answers and preserved mutation boundaries**
  - Files: Integrated T1/T2 files; disposable test repositories and captured bounded results under the owned worktree's ignored `.tmp/`; this plan's Execution Status.
  - Change: Run the final Validation batch after implementation, test authoring, and integration settle. Exercise actual tool registration, discovery refresh/completion, and preparation/resume paths with deterministic injected extension context and real disposable Git state. No provider, live agent, production workflow cleanup, or cancelled test-review trial is required.
  - Done when: Completion Evidence passes through the scenario matrix below; inspection is byte/ref/index/ownership preserving, source selection agrees across entrypoints, claims remain provenance-labelled, and existing action-specific safety regressions pass. Required unavailable or failing checks remain explicit incomplete acceptance, not implied success.
  - Verify: deterministic Run the Validation batch once and record exact commands/results, affected revisions, and evidence limits. On failure classify first, use only the shared repair allowance, and stop with preserved evidence if the targeted rerun still fails.
  - Depends on: T1, T2

## Execution Strategy

Root owns integration and acceptance. Finish implementation, test authoring, and integration before one final validation phase. T1's representative slice is source-inspected, not an early behavior gate or a substitute for the full fix. Read-only safety/ownership and external-contract inspection remain at their actual boundaries. Do not create another task/evidence ledger or mandate delegation.

Before changing extension registration or refresh semantics, read the installed Pi 0.84.4 `docs/extensions.md` and applicable referenced tool/command/event APIs, plus the owning local contracts. Recheck installed version at execution. Consult maintained Git documentation before introducing or changing Git arguments or cancellation behavior; preserve the existing runner and tested Windows argument handling. No invocation depends on guessed CLI options.

## Validation

Timing: T3 only, after all implementation/test/integration edits settle. Commands run from the owned implementation worktree, with the Pi commands' cwd set to its `pi/` directory.

- Run `pnpm test workflow-observation.test.ts workflow-worktree.test.ts plan-lifecycle.test.ts workflow-dispatch.test.ts` once. Expected: focused suites pass, including the scenario matrix and existing transfer, handoff, retain, in-place, and post-merge cleanup protections exercised by these suites. If T1's caller inspection identifies a changed shared signature used by an additional test owner, record that exact focused file and reason in this section before the final batch; do not substitute an aggregate suite.
- Run `pnpm run typecheck` once because shared TypeScript return types, async refresh signatures, and tool registration change. Classify unrelated existing errors separately; do not repair them as part of this plan or claim a passing typecheck. Any diagnostic caused by changed interfaces blocks acceptance.
- Run `git diff --check` once on the settled implementation; inspect relevant local links, LF/ASCII punctuation, and contract/source agreement without prose-spelling tests.

Scenario matrix for the focused fixtures:

| Scenario | Required observation and behavior |
| --- | --- |
| Stale primary, committed owned implementation and completed archive | Discovery and inspection reveal owned progress and closeout context; preparation selects the owned archive when primary is demonstrably unchanged; no implementation replay. |
| Independently changed primary and owned plan/archive | Both sources and relevant revisions are reported; conflict blocks dispatch before ownership mutation or session clearing; no silent semantic choice. |
| Implementation commit without merge | Recorded implementation/validation claims remain separate from verified integration; no test pass inferred from commit/checklist. |
| Missing, unbound, or changed validation inputs | Report recorded evidence with provenance and uncertainty; never certify current behavior or rerun checks automatically. |
| Merge followed by unrelated commits and dirty files | Inspection is unchanged-state; existing cleanup verifier still accepts exact integrated clean target and preserves unrelated work. |
| Commit-and-retain and in-place workflows | Report intentional retention/in-place completion accurately without requiring a merge, cleanup, or new worktree. |
| Interrupted cleanup, absent ownership/resources, unsafe or malformed records | Report observable remaining resources and explicit uncertainty/errors; never infer ownership from a matching directory name, discard recovery, or silently hide a workflow. Existing cleanup rejection boundaries remain intact. |
| Discovery cache and selected refresh | Completion filtering causes no filesystem/Git work; explicit inspection/preparation refreshes current evidence, and an old snapshot cannot authorize a changed target. |
| Read-only inspection under failure/abort | Real fixtures preserve files, index bytes, refs, and ownership; the registered tool does not request an execution turn. Failed/aborted Git work is bounded and reported, not converted to an empty successful result. |

On failure: Classify fixture/harness, product, external-contract misunderstanding, or protocol violation. Allow at most one focused repair batch and one targeted rerun of affected checks for the whole outcome; reuse unchanged passing results. If failure remains, stop patching, reassess the mechanism and harness, and report before further execution. Additional repair/validation requires user direction. Keep used checks and remaining allowance in Execution Status across resume. Tests clean only their owned disposable repositories and processes.

## Retention

Keep incomplete work at `.specs/workflow-state-resolution/plan.md`. `/do-it` materializes the spec in its owned implementation worktree, implements and validates there, archives the complete spec to `.specs/archive/workflow-state-resolution/`, commits the workflow branch, merges with `--no-ff` into primary, verifies the integrated result, and removes only its owned worktree/branch/ownership through the maintained verifier. Preserve recovery on unresolved conflict, unmerged state, dirty target worktree, or failed closeout. Unrelated primary changes remain protected and follow the action-specific merge versus cleanup rules. Ignored plans stay untracked and return to the primary local archive after successful closeout; never force-add them.

## Execution Status

- State: Complete. T1, T2, and T3 are complete; archive and Git closeout follow this status update.
- Result: Shared read-only workflow observation now drives discovery, inspection, execution preparation, and closeout source conflict checks. The model-callable inspection tool reports provenance-labelled implementation, validation, integration, retention, and cleanup facts without authorizing mutation or triggering execution.
- Validation: `pnpm test workflow-observation.test.ts workflow-worktree.test.ts plan-lifecycle.test.ts workflow-dispatch.test.ts` passed 107 tests across 4 files after repository-required Pi dependency links were restored. `git diff --check` passed on the settled T1/T2 implementation. The operator resumed `/do-it .specs/workflow-state-resolution/plan.md` on 2026-09-05 and authorized correction of the blocked result-details typing plus one targeted rerun; `pnpm run typecheck` then passed with no diagnostics.
- Evidence limits: Tests verify deterministic extension contexts and disposable real-Git fixtures, not a provider or live-agent invocation. Recorded plan claims remain provenance-labelled observations rather than proof of current behavior, and every mutation boundary still performs fresh action-specific checks.
- Repair allowance: Consumed. No further development repair or validation rerun remains authorized.
