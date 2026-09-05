---
created: 2026-09-04
status: draft
---

# PRD: Pi test-suite value review

## Decision summary

Build a testing-only review workflow using one `/test-review` prompt template, one reusable skill, and one closed-read reviewer. Establish a complete repository baseline before ordinary diff-first review. Judge tests by meaningful regression protection relative to maintainer time, not test count, coverage, or finding count.

This is a product draft for planning consideration, not implementation approval. Requirements and acceptance criteria below are normative. The companion [operating model](operating-model.md) defines their lifecycle terms and execution boundaries; its suggested file layout and defaults are planning choices, not additional product features. Existing requirement IDs are retained for traceability.

## Problem

A suite can accumulate tests without evidence that each adds useful regression protection. Coverage does not establish that assertions detect meaningful faults, doubles represent real boundaries, or duplicated scenarios justify their execution and maintenance cost.

The primary cost is maintainer time: waiting, understanding tests, reviewing changes, updating fixtures, investigating failures, recovering from flakes, and context switching. A fast, stable, simple test can remain despite weak marginal protection when changing it would cost more than it saves. Slow or complex tests require stronger evidence of unique protection.

Production code is context for tested contracts and seams, not an invitation to general production review. Later, explicitly requested remediation may change a seam while preserving observable behavior and public interfaces.

## Goals

1. Assess JavaScript and TypeScript test effectiveness, reliability, isolation, maintainability, and developer-facing execution cost.
2. Establish a resumable, fully accounted baseline, then review changed tests and affected behavior without repeating unrelated baseline debt.
3. Recommend strengthening, adding, consolidating, replacing, deleting, retiering, retaining, or explicitly taking no action according to protection and human cost.
4. Ground findings in actual source contracts, configured runners and versions, fixtures, focused checks, and available history and CI evidence.
5. Prove recommendation quality and one complete inventory-review-verification-report-resume loop before adding orchestration machinery.

## Non-goals

- General production design, style, security, or implementation review.
- Maximizing coverage, mutation score, test count, finding count, or eliminating every smell.
- Universal runtime limits, test pyramids, worker counts, or numeric test-value/confidence scores.
- Semantic browser E2E review or languages other than JavaScript and TypeScript initially.
- Automatic invocation, package installation during review, external publication, or automatic remediation.
- A Pi extension, standalone CLI, database, or generalized queue in the first version.
- Remediation before baseline closeout, or integration/cleanup without explicit instructions.

## Users and product principles

The maintainer uses baseline mode to understand existing suite protection and cost, diff mode to assess changes, and a separately authorized remediation workflow to improve the suite.

- **Human time first:** weigh unique protection against execution waiting, maintenance, comprehension, investigation, flake recovery, review, context switching, and correction effort. Compute cost matters when it affects those costs or creates material operational burden.
- **Behavior clusters:** a semantic review unit contains tests, subject behavior, contracts, and relevant fixtures/configuration. It is not necessarily one file or one executable test command.
- **Measurements are separate:** multiple review units can share one timing sample. A shared command duration is not each unit's exclusive runtime.
- **Evidence, not proxy targets:** coverage and targeted mutation inform fault protection; neither is proof of suite value. Coverage may decrease when meaningful protection is preserved or improved.
- **Permit no change:** harmless weakness and justified complexity do not require cleanup. Insufficient evidence is a limitation, not permission to invent a finding.

## Requirements

### Invocation and scope

- **REQ-001:** The first version shall provide `pi/prompts/test-review.md` as the primary `/test-review` entrypoint invoking the `test-review` skill. Review shall begin only on explicit user request.
- **REQ-002:** An unqualified invocation shall start a missing baseline, resume an incomplete baseline, refresh an uncertain baseline, review changes against a closed baseline, or report unchanged status, in that precedence. A closed baseline with recorded gaps shall not silently restart unchanged blocked/skipped work. Mode selection shall follow the [state table](operating-model.md#mode-selection).
- **REQ-003:** Explicit `baseline`, `diff`, `path`, `deep-performance`, and `smells` modes shall be available. Path scope shall be repository-contained; limited modes shall not claim whole-baseline completion, and smell candidates shall remain distinct from verified findings.
- **REQ-004:** Semantic scope shall include JavaScript and TypeScript unit, integration, contract, and component tests owned by the selected Git repository. JavaScript-only packages receive the same review without TypeScript-specific checks. Submodules and nested independent repositories shall be inventoried as boundaries, not recursively reviewed without explicit selection and their own baseline.
- **REQ-005:** Scope shall include relevant fixtures, doubles, builders, setup, utilities, runner configuration, scripts, environments, transforms, module mode, and TypeScript configuration that affect test meaning or cost.
- **REQ-006:** Configured compile-time tests and public type-contract checks shall be in scope, including `tsd`, `expectTypeOf`, declaration tests, and `@ts-expect-error` cases.
- **REQ-007:** Browser E2E shall be inventoried and timed when available and safe; semantic review shall route to the dedicated browser-E2E capability, using Playwright guidance where applicable rather than assuming every browser suite uses Playwright.
- **REQ-008:** The reviewer shall use the repository's configured JavaScript/TypeScript runner, with version-appropriate repository or maintained documentation evidence. It shall not substitute a generic runner or transfer incompatible mock, timer, or module assumptions. Initial verification shall include Vitest, Jest, and Node Test examples.

### Baseline and completion

- **REQ-009:** Baseline semantic review shall start from a clean committed revision of the selected repository. Tracked, staged, untracked non-ignored changes and changed gitlink revisions in that worktree shall block baseline start; ignored files, unrelated linked worktrees, and internal dirt in excluded child repositories shall not. Commands consuming dirty or unavailable child dependencies shall be blocked individually. No changes shall be discarded. See [repository boundaries](operating-model.md#repository-and-cleanliness-boundaries).
- **REQ-010:** Baseline mode shall first create a deterministic inventory of owned packages, tests, commands, runners/versions, setup, fixtures, environments, type checks, coverage/mutation configuration, CI entrypoints, disabled tests, available historical evidence, and excluded repository boundaries.
- **REQ-011:** Every discovered owned test shall belong to a behavior-area review unit, normally within a package/workspace, or have an explicit exclusion reason. Units shall name subject behavior, relevant infrastructure, and dependency relationships. Measurement units shall be recorded separately.
- **REQ-012:** Evidence-based risk priority shall set review order, with user critical-area overrides taking precedence. Destructive/stateful boundaries, authentication, persistence, concurrency, shared infrastructure, churn, regressions, and CI failures may inform priority; priority shall not remove units from scope.
- **REQ-013:** Baseline execution shall continue until every unit is `reviewed`, `blocked`, or explicitly `skipped` with a reason, without an overall execution budget. Closeout shall distinguish `closed-assessed` from `closed-with-gaps`; neither pending work nor unreconciled revision changes count as closed. Blocked/skipped units and missing dynamic evidence shall not be presented as successful assessment.
- **REQ-014:** Independent static reviews may run concurrently; performance measurements shall run serially without overlapping review-owned execution workloads that would distort them.
- **REQ-015:** Failed commands shall retain relevant output and be classified before conclusions or edits. The root shall continue independent work and revisit failed units before closeout, recording any unresolved block rather than treating a check failure as proof of a product defect.
- **REQ-016:** Every command shall have a finite timeout and child-process cleanup appropriate to its execution mechanism. Repository configuration and observed behavior shall inform the bound; timeouts shall be incomplete evidence requiring diagnosis, not automatic findings.

### State and revision validity

- **REQ-017:** Local untracked state and reports shall live under `<git-common-dir>/test-review/`, shared by linked worktrees without conflating different baseline scopes or revisions.
- **REQ-018:** The root shall be the sole state writer for an active baseline; reviewer children shall return evidence, not mutate state. Concurrent roots shall not silently overwrite one another's baseline records.
- **REQ-019:** State shall retain repository/scope identity, starting commit, per-unit reviewed commit and status, evidence references, findings, dispositions, command measurements, and the final commit and reconciliation evidence at closeout. Raw logs/source snapshots shall remain temporary unless requested; persistent summaries shall be bounded and disclose truncation.
- **REQ-020:** Git changes shall invalidate touched units and dependents affected by shared source, fixtures, configuration, or other recorded inputs. Unchanged evidence may carry forward with a recorded Git comparison. Unknown dependencies, unavailable revisions, or insufficient comparisons shall require refresh, not assumed validity; no content-fingerprint machinery is required initially.
- **REQ-021:** Work may continue on unaffected units after a change, but closeout shall reconcile the complete inventory, unit evidence, measurements, and gap reasons to one clean final commit. Dirty or uncertain results shall not acquire a reviewed-commit label. In-flight affected results shall be withheld until revalidated. See [revision reconciliation](operating-model.md#revision-reconciliation).

### Evidence and timing

- **REQ-022:** The root may automatically run existing focused local, non-destructive tests, type checks, and linters. Live, destructive, external, or unclear execution targets shall stop at the relevant authorization boundary.
- **REQ-023:** Missing dependencies/tooling shall block affected dynamic validation without automatic installation. Static review may continue with explicit limits but shall not be called fully validated.
- **REQ-024:** The baseline shall collect one ordinary timing sample per distinct canonical measurement unit when available and safe, and link it to every relevant semantic unit. It shall not rerun an unchanged command solely for another cluster, double-count shared runtime, or invent per-cluster percentages. Duration, command scope, runner version, instrumentation, and revision shall accompany each sample. Workflow share requires a measured compatible denominator and observable attribution.
- **REQ-025:** Optional deep-performance mode shall distinguish cold/warm repetitions, variability, available phase/slow-test data, coverage, type-check, and profiling overhead. Runner configuration experiments remain separately authorized remediation, not ordinary baseline measurement.
- **REQ-026:** Current coverage evidence shall be reused; configured coverage shall run only when needed to resolve a specific protection/value question, not automatically for every unit.
- **REQ-027:** Existing mutation tooling shall be used selectively where targeted mutation resolves assertion strength, uniqueness, or redundancy. Mutants shall retain provenance and a named behavior interpretation; score is not a target. Missing tooling may be proposed for later remediation, not installed during baseline. Any mutation execution shall use an isolated disposable execution location, preserve the reviewed checkout, and obey REQ-022.
- **REQ-028:** The root may inspect bounded Git history for origin, churn, regressions, and maintenance, expanding to complete relevant history only when an observed signal justifies it.
- **REQ-029:** Already-configured authenticated CI may supply read-only timing, failure, retry, and flake evidence with source/timeframe. Retrieval shall not mutate CI or disclose credentials.
- **REQ-030:** Reviewers needing context beyond their assignment shall request it explicitly; the root shall validate relevance and containment before supplying it. Context expansion shall not expand mutation, shell, delegation, or publication authority.

### Test-suite value

- **REQ-031:** Reviewers shall map behavior clusters to observable contracts and plausible faults before recommending changes. An independent contract takes precedence over assuming the current implementation defines correctness.
- **REQ-032:** Missing coverage shall be a finding only for a concrete unprotected behavior, branch, failure mode, or invariant, not merely a function without a direct test.
- **REQ-033:** Severity shall reflect reachable product consequence and the suite's false-confidence mechanism, not smell labels, file size, or complexity alone.
- **REQ-034:** Complexity shall be reportable only with concrete reliability, comprehension, maintenance, investigation, or execution burden, weighed against unique protection and correction effort.
- **REQ-035:** Recommendations may strengthen, consolidate, replace, delete, retier, or retain tests. Deletion/consolidation shall identify remaining equivalent behavior/fault protection, supported where practical by focused execution, coverage, history, or targeted mutation. Uncertain unique protection shall block a deletion recommendation.
- **REQ-036:** Valuable slow tests may be recommended for local/PR, pre-merge, scheduled, or release tiers only with the protected risk, measured human-time cost, and required feedback cadence made explicit.
- **REQ-037:** Fast, stable, simple tests with weak marginal protection shall not require findings without material false confidence or human cost.
- **REQ-038:** `reviewed - no change warranted` shall be an explicit conclusion distinct from blocked, skipped, or unreviewed state.
- **REQ-039:** Reports shall separate protection, consequence, runtime share, flake evidence, and maintenance burden; they shall not compute a synthetic test-value or model-confidence score.

### Findings and trust

- **REQ-040:** The root shall independently check candidate evidence before publication, rejecting duplicates, unsupported hypotheticals, version errors, style preferences, and contradictions with contracts/callers. Candidate dispositions and rejection reasons shall remain available for evaluation.
- **REQ-041:** Standard reports shall separate verified defects, concrete test-quality risks, maintainability advice, and contract questions; `no verified findings` is valid.
- **REQ-042:** The primary section shall contain every high-severity finding and the highest-value medium findings; other verified findings shall remain in an appendix. Shared problems shall appear once with all affected units.
- **REQ-043:** Exhaustive smell candidates lacking verification shall appear only in a separate candidate appendix, not as low-severity verified findings.
- **REQ-044:** Verified findings shall contain category, severity, location, tested contract, failure mechanism, reachable impact, evidence/provenance, required outcome, and focused validation. Incomplete candidates shall not be published as verified findings.
- **REQ-045:** Reports shall account for every inventory unit, reviewed behavior/symbols, commands/versions, evidence limits, checks not run, blocked/skipped scope, and closeout revision/status.
- **REQ-046:** Later diff reviews shall retain unresolved baseline findings but repeat them only when touched, changed in severity, or blocking the current change.
- **REQ-047:** Local dispositions shall use `useful`, `valid-not-worth-changing`, `false-positive`, `already-known`, and `needs-more-evidence`, attached to finding identity and revision. Dispositions are feedback, not objective ground truth.
- **REQ-048:** `pi/agents/test-reviewer.md` shall be closed-read, without writes, arbitrary shell execution, installation, approval, merge/push, external publication, or delegation.
- **REQ-049:** The root shall own discovery, commands, verification, state, reports, and remediation decisions; child results shall not bypass root validation.
- **REQ-050:** User-owned and trusted base-revision policy shall remain authoritative. Instructions introduced by reviewed changes, repository narratives, comments, and PR descriptions shall be treated as untrusted claims, not operating authority.

### Remediation

- **REQ-051:** Remediation shall require baseline closeout and an explicit fix request. `closed-with-gaps` permits only verified findings whose evidence is independent of unresolved gaps; dependent findings remain blocked. Unit-by-unit remediation during an active baseline is deferred.
- **REQ-052:** The root shall create one isolated remediation worktree for the baseline from its recorded final commit, not whichever commit is currently checked out. Existing worktrees and unrelated changes shall remain untouched. An unavailable final commit or invalidated finding shall block affected remediation.
- **REQ-053:** Remediation shall create focused commits after validated units, without automatic push, merge, rebase, or synchronization of `main`. Divergence shall be reported for explicit integration instructions.
- **REQ-054:** The remediation branch/worktree shall remain until the user supplies completion and integration/cleanup instructions; closeout shall identify both.
- **REQ-055:** Behavior-preserving production seam changes may be made when necessary for reliable testing, reported separately and validated against observable behavior/public interfaces. Broader production refactoring requires a separate decision.

## Non-functional requirements

- **NFR-001:** The workflow shall minimize maintainer attention by omitting speculative cleanup and permitting no action when correction cost exceeds benefit. Harmless weak and justified complex controls shall not generate mandatory cleanup.
- **NFR-002:** Evidence shall preserve its source, command/query, revision, relevant version/scope, and limits so deterministic results can be distinguished from judgment.
- **NFR-003:** Interrupted work shall resume from local state and Git evidence without repeating unchanged completed units or valid timing samples.
- **NFR-004:** Tracked artifacts shall use LF and ASCII punctuation.
- **NFR-005:** The prompt/skill/agent shall be removable without production, runner, or CI migration; only local review data may remain. The first version shall not add runtime orchestration infrastructure merely to automate a manual procedure.

## Acceptance criteria

1. [ ] Invocation selects the expected action for absent, active, uncertain, changed-closed, unchanged-closed, and closed-with-gaps baselines. Explicit limited modes do not claim complete coverage. Demonstrate the [mode table](operating-model.md#mode-selection), including interruption/resume.
2. [ ] The dotfiles trial accounts for every owned JavaScript/TypeScript runtime and compile-time test, with browser E2E routed and independent repositories excluded explicitly. Verify inventory against tracked files and configured discovery, including disabled tests.
3. [ ] Dirty parent tracked/staged/untracked files and gitlink revision changes block baseline start without mutation. Excluded child dirt and unrelated linked-worktree changes do not; commands consuming dirty/unavailable children are individually blocked. Demonstrate each boundary.
4. [ ] Two behavior clusters sharing one canonical command reference one timing sample. Overlapping aggregate/package commands are not summed as exclusive time; unavailable attribution is labeled unknown. A changed command/configuration invalidates the shared sample and its dependents.
5. [ ] One lifecycle demonstration interrupts a baseline, commits a unit and shared-setup change, resumes unaffected work, and reconciles added/removed/changed units to one final commit. Dirty in-flight results are withheld; missing revision/dependency evidence prevents unsupported carry-forward.
6. [ ] Closeout contains no pending or stale unit and matches state/report inventory sets. A fully assessed run is distinguished from a closed run with blocked/skipped units or incomplete dynamic evidence. An unchanged closed-with-gaps run reports gaps without silently retrying them.
7. [ ] Failed, hanging, missing-tool, and unauthorized-target checks preserve provenance, terminate safely where applicable, allow independent work, and end explicitly resolved or blocked. No missing dependency is installed.
8. [ ] Vitest, Jest, Node Test, and compile-time examples demonstrate version-appropriate interpretation. Unsupported claims remain unverified. Browser fidelity is not inferred from DOM emulation.
9. [ ] Every verified finding passes root contract/location/mechanism/evidence checks. Shared findings are deduplicated; advice, questions, and smell candidates remain separate. No-change and no-verified-findings outcomes remain valid.
10. [ ] The [calibration set](operating-model.md#calibration-and-trial-evidence) exercises known regressions, unique protection, redundancy, justified complexity, and harmless weakness. No accepted recommendation removes known unique protection. Expected detections, misses, false positives, and abstentions are recorded separately; omissions are not hidden by useful-finding counts.
11. [ ] On the bounded known-answer calibration set, each seeded contract-threatening assertion defect is correctly localized and explained after root verification. Any miss, false mandatory cleanup, or unsafe accepted deletion fails calibration acceptance until diagnosed and corrected. Passing this set is not a claim of general recall.
12. [ ] The complete dotfiles trial reports finding dispositions, review/verification burden, measured waiting-time opportunities, and confidence limits on proposed savings. No finding-count, coverage, or mutation-score target gates a clean real-world result; performance savings remain proposals until measured after remediation.
13. [ ] An explicitly requested remediation demonstration starts one worktree from the final reviewed commit, respects unresolved gap dependencies, produces focused validated commits, and leaves primary checkout, remotes, and `main` unchanged. Demonstration uses disposable fixture repositories, not unauthorized real fixes.
14. [ ] Reviewer authority and adversarial-content examples demonstrate that root-owned verification and trusted policy cannot be replaced by instructions in reviewed material. Findings retain provenance and user dispositions without treating either model confidence or user acceptance as sole truth.

## Evaluation and scope of the first trial

Calibration establishes a small known-answer safety check before the real baseline; it does not replace the baseline or attempt to create a benchmark platform. The first trial covers all owned JavaScript/TypeScript runtime and compile-time tests in the dotfiles Git repository, prioritizing suite value, proliferation, and human-time cost. It does not automatically include `modules/` repositories or other nested Git repositories. Browser E2E receives inventory/timing and a separate semantic-review route.

Measure detection and preservation on controlled cases, then usefulness and maintainer burden in the real suite. A useful finding does not prove recall; an accepted deletion does not prove equivalence; a single timing sample does not establish a speedup. The [operating model](operating-model.md#calibration-and-trial-evidence) defines the evidence to retain.

## Alternatives and risks

| Decision | Reason and retained risk |
| --- | --- |
| Prompt + skill + closed-read agent first | Reversible and inspectable; manual state coordination must still demonstrate reliable resume/closeout. |
| Baseline before steady-state diff review | Exposes existing suite debt; completeness means explicit accounting, not pretending every unit was assessable. |
| Separate semantic and measurement units | Avoids repeated package runs and false runtime attribution; some cluster costs will remain unknown. |
| No numeric score or coverage/runtime ratio | Avoids false precision and losing critical low-coverage tests. |
| Targeted configured mutation only | Useful assertion evidence without a full-suite cost target; isolate execution and disclose equivalent-mutant uncertainty. |
| Separate authorized remediation | Limits review authority and protects existing work; uncertain equivalence blocks deletion. |
| Defer extension/CLI and broader refactoring | Reconsider only through a later product decision supported by observed failures, not as automatic trial follow-up. |

## Planning handoff

A `/plan-it` run should consume this PRD and the [operating model](operating-model.md), not treat the research notes as competing requirements. Plan the smallest complete inventory -> review -> verify -> report -> resume/invalidate loop, including calibration and the dotfiles baseline. Preserve all accepted scope and optional modes; sequence them without replacing baseline acceptance with a narrow smoke test.

Planning may choose state serialization and size limits, prompt syntax, evidence filenames, focused command timeout defaults, and fixture locations using existing Pi mechanisms. These are bounded implementation decisions, not unresolved product goals. Inspect installed agent-discovery/tool contracts before assuming a new reviewer name can be delegated. Missing harness support must be surfaced rather than silently broadening authority or adding an extension.

This revision neither runs `/plan-it` nor authorizes implementation, actual baseline execution, remediation, or commits. A later extension, broad production refactoring, or unit-by-unit remediation during an active baseline remains a separate product decision.

## Research references

- [Operating model and validation scenarios](operating-model.md)
- [Agentic test-review research](agentic-test-review-research.md)
- [General testing code smells](general-testing-code-smells.md)
- [TypeScript testing smells and performance](typescript-testing-code-smells.md)
- [Evidence-based code review](../../patterns/evidence-based-code-review.md)

## KISS recommendation

Prove one complete review loop and safe, useful recommendations with a prompt, skill, and closed-read reviewer. Keep durable requirement IDs, but do not turn each requirement into a new runtime component or a source-spelling test. Add machinery only when an observed failure demonstrates why it is needed.
