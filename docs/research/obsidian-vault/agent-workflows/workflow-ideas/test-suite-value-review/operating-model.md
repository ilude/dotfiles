---
status: design-note
source: PRD.md and local design review
---

# Test-suite value review operating model

This note supports the [PRD](PRD.md). The definitions, mode table, and validity rules clarify its requirements; they do not authorize execution or require a new orchestration system. Suggested representations and implementation defaults are identified separately at the end.

## Units and terminology

| Term | Meaning |
| --- | --- |
| Selected repository | One Git repository/common directory and an explicit owned scope. Linked worktrees share identity; independent repositories do not. |
| Semantic review unit | A behavior/fault-protection cluster with owned tests, contracts, source, infrastructure, and dependency references. |
| Measurement unit | One canonical command with owning cwd, selected test scope, runner/version, environment, and instrumentation. Several semantic units may reference it. |
| Starting commit | Clean commit at baseline start; retained for provenance, not assumed to be the final reviewed state. |
| Reviewed commit | Commit at which a unit's semantic evidence was collected or refreshed. |
| Final commit | Single clean commit against which all inventory entries, evidence, and gaps have been reconciled at closeout. |
| Carry-forward evidence | Recorded comparison establishing that an older result's relevant inputs are unchanged at the final commit. It does not change the original observation's revision. |
| Gap | Blocked/skipped semantic scope or missing required dynamic evidence, with reason and consequence for conclusions. |

Unit work states are `pending`, `reviewed`, `blocked`, and `skipped`. Staleness is evidence validity, not a successful terminal status: an invalidated unit returns to pending work. `reviewed - no change warranted` is a reviewed conclusion, not a skip. A statically reviewed unit can retain a dynamic-validation gap; the report must show both.

Baseline lifecycle states are:

- `active`: work remains or revision reconciliation is incomplete.
- `uncertain`: persisted state cannot support a safe comparison, for example a missing reviewed commit, unknown dependency reach, or an incompatible state record.
- `closed-assessed`: every selected semantic unit was reviewed, required evidence is available, and closeout is reconciled to a final commit.
- `closed-with-gaps`: all units are accounted for and reconciled, but at least one is blocked/skipped or lacks required evidence.

Inventory-only external repositories and browser-E2E routes are declared exclusions from semantic scope, not covert claims of review. They must appear in the report; absent required browser timing is an evidence limitation. No pending or stale unit can be hidden under `closed-with-gaps` merely to end the run.

## Mode selection

Apply explicit user modes first. For an unqualified `/test-review`, apply the following rows in order to the selected repository and scope.

| State | Action | Completion claim |
| --- | --- | --- |
| No baseline | Start inventory and baseline after clean-start checks. | None until closeout. |
| Active/interrupted baseline | Resume; reconcile changes before reusing evidence; prioritize unfinished/stale units. | Existing completed unaffected work is retained, not restarted. |
| Uncertain baseline | Refresh inventory and affected evidence. If affected scope cannot be bounded, refresh the entire selected scope. | Do not silently treat uncertain state as current or use diff-only review. |
| Closed baseline with changed inputs/revision | Diff-first review against the recorded final commit, expanding to affected units and dependencies. | A new baseline closeout requires complete reconciliation; a limited diff report alone does not advance it. |
| Closed baseline with no changes | Report status, gaps, and available explicit modes. | Preserve the prior assessed/with-gaps distinction. |

A newly installed dependency, supplied evidence, or changed environment can make a blocked unit retryable even if Git files are unchanged. Record the operator request or observed input change that triggers reopening; do not silently loop on unchanged blocked work. Explicit `baseline` can reopen recorded gaps or request a full refresh; make that choice visible before running commands. It does not discard previous findings/dispositions.

Explicit `path`, `diff`, `smells`, and `deep-performance` runs can produce bounded reports without an existing full baseline. They must state their scope and cannot manufacture a baseline-complete label. Dirty working-tree diff review may report against a clearly identified snapshot, but cannot advance committed baseline state or authorize remediation from an uncommitted revision.

## Repository and cleanliness boundaries

Inventory the selected repository's tracked files and configured discovery. Do not traverse gitlinks or nested independent Git repositories as though they were packages owned by the parent. Ignore generated dependencies, caches, and review artifacts. Record external boundaries and the parent commands that depend on them.

For the first trial, select the dotfiles Git repository, including its owned packages such as `pi/`, but not the implementations within `modules/`, vendored Git submodules, or other independent checkouts. A separate requested module trial needs its own revision, instructions, state, commands, and acceptance scope. No recursive module initialization or package installation is implied.

A concrete clean-start check for the selected worktree is:

```bash
git rev-parse --verify HEAD
git status --porcelain=v1 --untracked-files=all --ignore-submodules=dirty
```

The first command must resolve a commit and the second must produce no entries. Also reject unresolved repository operations such as a merge/rebase in progress, even if a transient status looks clean. `--ignore-submodules=dirty` excludes internal child worktree dirt, not a checked-out child commit different from the parent gitlink. Inspection of in-scope command dependencies is still required; this flag is not permission to run against mutable children.

| Observed state | Boundary |
| --- | --- |
| Parent tracked/staged edits or non-ignored untracked files | Block baseline start; preserve files. |
| Gitlink revision changed from parent commit | Block parent baseline start. |
| Excluded child repository internally dirty | Do not block independent parent review; block commands that consume that child. |
| Required child missing/uninitialized or dependency unavailable | Block dependent commands/units, not independent static review. |
| Ignored generated dependencies | Do not block cleanliness; record relevant runtime/dependency identity for evidence validity. |
| Other linked worktree changed | Do not block this worktree; never borrow its state as the reviewed revision. |
| Selected child repository dirty in a separately requested review | Apply the full clean-start gate within that child repository. |

A parent test that calls into an excluded module remains an owned parent test. Its dependence is explicit; unavailable child evidence may limit that unit. Reviewers do not gain authority to audit the whole module by following that call.

## Revision reconciliation

The root owns these steps. This is a procedure using Git evidence, not a requirement for a custom state machine implementation.

1. At start, record repository/scope identity, clean starting commit, inventory, units, dependencies, and canonical measurement units.
2. Bind assignments and command evidence to their observed commit and relevant environment. If checkout inputs change during a read or command, withhold affected results. If the affected scope cannot be established, withhold the entire in-flight result. Record the ambiguity rather than assigning evidence to a guessed commit.
3. On resume or a committed change, diff each retained result's reviewed commit against the proposed target. Include relevant production source/contracts, tests, setup, utilities, configuration, dependency manifests, and command inputs. Refresh inventory for additions, deletions, and scope changes; retain historical finding dispositions.
4. Carry forward unaffected results with comparison endpoints and affected-input reasoning. Re-review touched units and dependents. Unknown dependency reach, a missing revision, or incompatible evidence means refresh, not a fallback assumption of validity.
5. Reuse a timing sample only when its command inputs and relevant environment remain applicable. Otherwise invalidate the measurement once and update all referencing units. A new environmental limitation becomes a gap, not an invented runtime.
6. Before closeout, require a clean selected worktree at candidate final commit F. Account for every currently selected unit as reviewed, blocked, or explicitly skipped, and reconcile every retained result or gap reason to F. Removed units remain historical records rather than disappearing without explanation.
7. Record F, inventory coverage, original observation revisions, carry-forward comparisons, valid measurement references, remaining gaps, and either `closed-assessed` or `closed-with-gaps`. Confirm the checkout did not change during closeout; if it did, leave the baseline active.

Uncommitted changes do not become a baseline revision. Independent static work already bound to unaffected committed inputs can finish while a unit is dirty, but shared command execution and final closeout wait for a clean, attributable state. Repeated external changes can prevent closeout; report the blocker instead of implying the no-overall-budget policy guarantees eventual completion.

Remediation starts from F, not the starting commit or current HEAD. For `closed-with-gaps`, a verified finding can be fixed only when its evidence does not depend on an unresolved unit or missing validation. Findings relying on uncertain equivalence cannot authorize deletion. Later invalidation requires refreshed finding evidence before mutation. No live `main` synchronization is implied.

## Measurement ownership and attribution

A measurement record identifies command/arguments, cwd, selected scope, runner/version, environment and instrumentation, observed revision, duration/outcome, and applicable review units. The same command text in different packages is not necessarily the same measurement unit; changed filters or instrumentation also change its scope.

Ordinary baseline timing collects one sample per applicable canonical measurement unit. It does not run the package command once for every behavior cluster. Valid unchanged samples remain reusable after interruption. A retry following diagnosis is labeled a retry; it is not hidden as the original sample.

Example: parser and formatter clusters both use a package's canonical `pnpm test` command. One package timing sample belongs to both clusters. The report shows the package duration once and marks exclusive parser/formatter contributions unknown unless runner evidence provides attribution. A root command that already includes that package is overlapping coverage, not another independent cost to add.

- Do not sum overlapping suite/package runs into a developer-workflow total.
- Do not infer wall-clock shares from summed test durations when tests execute concurrently.
- A percentage requires a measured compatible workflow denominator and attributable numerator; otherwise report absolute command time and the attribution limitation.
- Run measurements serially, without concurrent root-owned tests, type checks, mutation jobs, or other measurement workloads. Disclose observed external load rather than claiming isolation that was not established.
- Browser E2E commands have the same safety/dependency gates; unavailable timing remains a gap.
- Deep-performance repetitions label cold/warm conditions, instrumentation, variability, and overhead separately. A normal sample is not a statistically rigorous benchmark or evidence of a future speedup.

## Calibration and trial evidence

Use a small bounded fixture collection with independently established behavior contracts and known executable faults. Prefer existing runner examples and historical regression cases where practical. The fixture owner records expected outcomes before review; the reviewer receives the repository evidence, not answer labels. The root compares verified findings with those expectations afterward.

| Case | Required observation |
| --- | --- |
| Known regression hidden by a weak assertion | Demonstrate the faulty behavior and why the current test passes; reviewer localizes and explains the missing protection. |
| Uniquely protective test | Demonstrate that this test catches a named fault not caught by the remaining suite; no accepted deletion/consolidation loses it. |
| Redundant tests | Demonstrate overlapping fault protection and the remaining equivalent protection; recommendation explains whether consolidation is worth its human cost. |
| Justified complex or slow test | Establish its unique integration/contract protection; no mandatory simplification based on structural complexity alone. |
| Harmless weak test | No concrete false-confidence path or material burden; retaining it is acceptable without mandatory cleanup. |
| Uncertain equivalence or unavailable runner evidence | Explicit abstention or context request, not a verified deletion or version-specific defect claim. |

Faults belong in disposable fixtures, not production changes during review. Counterfactual checks such as removing a fixture test are root-owned, isolated experiments to establish the expected answer. They do not grant the reviewer mutation tools or require installing a mutation framework.

For each fixture record expected protection, fault/counterfactual evidence, reviewer candidates, root dispositions, detected defects, omissions, false mandatory cleanup, unsafe accepted deletion, and abstentions. A missing expected contract-threatening finding fails bounded calibration acceptance even if the reviewer found something else useful. A control's justified abstention is not a miss. Correct an observed mechanism, not prompt wording tailored to fixture filenames; use a fresh equivalent case where feasible to check the correction.

The small known-answer set is a safety and usefulness check, not a numerical general-recall claim. The real dotfiles baseline can validly find no verified defects, but must still account for all owned scope and report gaps honestly.

Trial evidence separates:

- **Recommendation correctness:** independently checked contract and fault mechanism, including known-answer misses and preservation failures.
- **Human usefulness:** the five PRD disposition labels, maintenance/comprehension burden, and concrete actionability.
- **Workflow cost:** command waiting, root verification effort, and operator interventions. Record observed durations/counts; do not fabricate counterfactual time saved.
- **Potential benefit:** attributable measured execution opportunities or specific maintenance reductions, labeled as estimates until a separately authorized remediation demonstrates the result.

## Planning choices, not new product features

The plan may choose a small JSON state file plus Markdown report, or another inspectable representation under the required Git common directory. A baseline record needs enough identity to avoid mixing scope/revisions across linked worktrees. The first version can require one active root owner per baseline and refuse a competing writer; it does not need a queue or distributed lock service.

Choose explicit limits for stored excerpts and a finite overridable command timeout before execution. Use maintained runner/command behavior and prior duration when available; a documented initial timeout such as 300 seconds is a candidate default, not a universal test-runtime policy. Missing raw evidence or truncation must remain visible. Do not create fallback records that pretend a failed write, unknown schema, or missing dependency succeeded.

Verification should exercise the operator sequence, repository boundaries, evidence interpretation, and parsed records where a parser exists. Agent/skill definitions can be inspected for authority and demonstrated through the active harness. Do not build a runtime merely to make prose testable or assert source spelling as proof that a workflow works. Inspect installed Pi discovery/delegation contracts before promising that an added reviewer file becomes an invocable agent automatically.

## KISS recommendation

Keep the first implementation root-coordinated. Prove resume, shared measurement reuse, final-revision reconciliation, and safe recommendations with focused demonstrations, then run the complete selected-repository baseline. This note is a procedure and acceptance reference, not a mandate for more infrastructure.
