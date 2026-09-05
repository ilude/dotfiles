---
created: 2026-09-04
status: draft
---

# PRD: Pi test-suite value review

## Problem

The repository can accumulate a large number of tests without evidence that each test provides useful regression protection relative to the human time it consumes. New tests are easy to add, but test count and coverage do not establish that assertions detect meaningful faults, mocks represent real boundaries, or duplicated scenarios justify their execution and maintenance cost.

The primary cost is the maintainer's time. That includes waiting for developer-facing test commands, reviewing and updating tests, investigating failures, recovering from flaky tests, and understanding complex fixtures. A fast, stable, simple test can remain even when its marginal protection is weak because changing it would consume more time than it saves. Slow or complex tests require stronger evidence of unique protection.

The initial capability is a testing review, not a general production-code review. It may inspect production code to reconstruct the tested contract and may later recommend a behavior-preserving production seam change when reliable testing otherwise remains impractical.

## Goals

1. Review all in-scope JavaScript and TypeScript unit, integration, contract, and component tests in a repository for effectiveness, reliability, isolation, maintainability, and developer-facing execution cost.
2. Establish a resumable baseline for a repository that has never received this review.
3. Identify test proliferation, semantic duplication, weak or misleading assertions, unrealistic doubles, lifecycle leaks, and avoidable execution cost.
4. Recommend additions, strengthening, consolidation, replacement, deletion, tier changes, or no change according to marginal regression protection and human-time cost.
5. Ground findings in the repository's actual runners, versions, configuration, source contracts, history, CI evidence, and focused command output.
6. Produce concise, prioritized findings while retaining complete reviewed-scope and evidence records locally.
7. Prove the workflow with a prompt template, reusable skill, and closed-read reviewer before considering a Pi extension.

## Non-goals

- Perform a general review of production design, style, security, or implementation quality.
- Maximize test count, line coverage, branch coverage, mutation score, or finding count.
- Remove every weak test when the test imposes negligible human cost.
- Enforce a universal test pyramid, file size, worker count, runtime threshold, or unit-to-integration ratio.
- Review browser end-to-end tests semantically in the initial capability.
- Support languages other than JavaScript and TypeScript initially.
- Modify files, install dependencies, approve changes, push, merge, or publish external comments during review.
- Start automatically when Pi opens a repository or after a commit.
- Add a Pi extension, database, generalized queue, or numeric test-value scoring formula in the first version.
- Begin remediation before the initial baseline is complete.

## Users and jobs to be done

- Primary user: the maintainer reviewing a local repository through Pi.
- Primary job: determine whether the suite prevents meaningful regressions at an acceptable cost to developer time.
- Baseline job: review a previously unreviewed repository to establish suite inventory, review coverage, findings, timing evidence, and known gaps.
- Steady-state job: review changed tests and their affected behavior clusters without repeating unrelated baseline debt.
- Remediation job: improve the suite in an isolated worktree only after the maintainer explicitly requests fixes.

## Product principles

### Optimize human time

The reviewer shall weigh unique regression protection against:

- local execution waiting;
- maintenance and comprehension effort;
- failure investigation;
- flake recovery;
- code-review burden;
- context switching; and
- the implementation cost of the proposed correction.

Automated compute cost matters when it delays a developer-facing workflow, consumes material CI resources, or creates operational burden. It is not a reason by itself to spend maintainer time rewriting harmless tests.

### Evaluate behavior clusters

The primary semantic unit is a behavior or fault-protection cluster. It includes the relevant tests, subject code, fixtures, mocks, setup, utilities, runner configuration, and public contracts. Test files and individual cases are evidence within the cluster, not the default value unit.

### Treat coverage as evidence

Coverage can reveal unexamined code but cannot prove assertion strength or regression protection. A remediation may reduce numerical coverage when the remaining suite preserves or improves meaningful behavior and fault protection while reducing human-time cost.

### Permit no change

A valid conclusion is that a known weakness is not worth changing. The report shall distinguish this conclusion from an unreviewed or unvalidated item.

## Requirements

### Command and review modes

- **REQ-001:** The first version shall provide `pi/prompts/test-review.md` as the primary `/test-review` entrypoint.
  - The prompt template shall invoke the `test-review` skill workflow.
  - Review shall begin only after an explicit user request.
  - Verification: Pi discovers the prompt template, and invoking it places the complete workflow instructions in model context.

- **REQ-002:** An unqualified `/test-review` invocation shall infer its normal mode.
  - When no baseline state exists, it shall run baseline mode.
  - When a current baseline exists and repository changes are present, it shall run diff mode.
  - When neither condition applies, it shall report current baseline status and offer applicable explicit modes.
  - Verification: exercise all three repository states and inspect the selected mode.

- **REQ-003:** The prompt shall accept explicit mode overrides for `baseline`, `diff`, `path`, `deep-performance`, and `smells`.
  - `path` shall require a repository-contained target.
  - `smells` shall not promote unverified candidates to normal findings.
  - Verification: invoke each mode and confirm its scope and report classification.

### Initial language and test scope

- **REQ-004:** The first version shall semantically review JavaScript and TypeScript unit, integration, contract, and component tests.
  - JavaScript-only packages shall receive the same review without TypeScript-specific checks.
  - Verification: the first trial inventories and classifies every JavaScript and TypeScript test unit in the dotfiles repository.

- **REQ-005:** The review shall include test infrastructure that can change test meaning or cost.
  - This includes fixtures, mocks, builders, setup hooks, test utilities, runner configuration, package scripts, module mode, transforms, environments, and TypeScript configuration.
  - Verification: every reviewed unit records the infrastructure inspected or states why none applies.

- **REQ-006:** Compile-time TypeScript tests shall be in scope.
  - This includes configured `tsd`, `expectTypeOf`, declaration tests, `@ts-expect-error` cases, and public type-contract checks.
  - Verification: a fixture containing runtime and compile-time tests produces separate contract assessments.

- **REQ-007:** Browser end-to-end tests shall be inventoried and their developer-facing runtime recorded when available, but detailed semantic review shall route to the Playwright E2E capability.
  - Verification: a repository containing browser E2E tests lists them without applying unit-test-specific conclusions to browser-owned behavior.

- **REQ-008:** The reviewer shall support any configured JavaScript or TypeScript test runner.
  - Runner-specific conclusions shall cite repository evidence or maintained documentation applicable to the installed version.
  - The workflow shall not substitute an unrelated generic runner.
  - Verification: review fixtures using at least Vitest, Jest, and Node Test without transferring incompatible mocking, timer, or module assumptions.

### Baseline inventory and completion

- **REQ-009:** Baseline mode shall require a clean, committed working tree before semantic review begins.
  - `git status --porcelain=v1 --untracked-files=all` shall produce no entries in the reviewed worktree. Ignored files and changes in other linked worktrees shall not block review. An in-scope dirty submodule shall block its affected unit.
  - The workflow shall not discard or overwrite existing changes.
  - Verification: dirty tracked, staged, untracked, and in-scope submodule fixture states are reported as blocked and remain unchanged; ignored files and unrelated linked-worktree changes do not block review.

- **REQ-010:** Baseline mode shall create a deterministic repository-wide inventory before semantic review.
  - The inventory shall include package/workspace boundaries, test commands, runners and versions, test files, setup, fixtures, environments, type checks, coverage, mutation configuration, CI entrypoints, disabled tests, and available timing or flake evidence.
  - Verification: compare the generated inventory with known fixture repository contents.

- **REQ-011:** Baseline mode shall divide the inventory into behavior-area review units, normally bounded by a package or workspace.
  - Each unit shall name its tests, subject behavior, relevant infrastructure, and known dependency relationships.
  - Verification: every discovered test belongs to a unit or has an explicit unsupported/skipped reason.

- **REQ-012:** Baseline priority shall be inferred from repository evidence and overridden by user-specified critical areas.
  - Relevant evidence may include destructive or stateful boundaries, authentication, persistence, concurrency, shared infrastructure, churn, historical regressions, CI failures, and suite centrality.
  - Priority shall change review order, not silently remove units from scope.
  - Verification: a user override moves the named unit ahead of lower-priority work without dropping other units.

- **REQ-013:** A requested baseline shall continue until every discovered unit is `reviewed`, `blocked`, or `skipped` with a reason.
  - There is no overall execution budget.
  - Persistent state exists for recovery from interruption, not planned partial completion.
  - Verification: the final report accounts for every inventory unit and contains no unexplained pending unit.

- **REQ-014:** Static semantic review may run concurrently across independent units, while performance measurements shall run serially.
  - Verification: execution records show no overlapping timing samples and no conflicting review assignments.

- **REQ-015:** If a unit command fails, the root shall classify the failure, preserve its output, continue independent units, and revisit the failed unit before baseline completion.
  - A failing check shall not automatically become a product finding.
  - Verification: a fixture with one failing unit still reviews independent units and ends with the failed unit explicitly resolved or blocked.

- **REQ-016:** Each command shall have hang protection based on repository timeout configuration and observed suite behavior when available, otherwise a bounded command timeout.
  - A timeout shall produce incomplete evidence requiring diagnosis, not automatic proof of a defect.
  - Verification: a hanging fixture command terminates within its configured bound and remains classified as incomplete.

### State and invalidation

- **REQ-017:** Baseline state and reports shall be stored under `<git-common-dir>/test-review/`, resolved through `git rev-parse --git-common-dir`.
  - The location shall remain untracked and shared by linked worktrees.
  - Verification: state is absent from `git status` and resolves to the same common directory from linked worktrees.

- **REQ-018:** The root shall be the sole writer of baseline state.
  - Reviewer agents shall return evidence and candidates but shall not write state.
  - Verification: agent definitions lack write tools and state changes occur only in root-owned steps.

- **REQ-019:** State shall retain repository identity, starting revision, unit status, last reviewed revision, bounded evidence, findings, user dispositions, commands, and timing summaries.
  - Complete raw logs and source snapshots shall remain temporary unless requested.
  - Verification: inspect a completed trial state and confirm required fields and bounded payloads.

- **REQ-020:** Repository changes shall invalidate touched units and units affected by changed shared fixtures or configuration.
  - The initial version shall determine change scope from Git history and recorded reviewed revisions rather than content-fingerprint machinery.
  - If history cannot establish the change safely, the affected state shall become uncertain and require re-review.
  - Verification: change one unit and one shared setup file in a fixture repository and inspect invalidation results.

- **REQ-021:** When files change during a baseline, unaffected units may continue, while touched units and affected dependents shall refresh before completion.
  - Verification: mutate a fixture unit during review and confirm that completed unrelated units remain valid.

### Evidence collection

- **REQ-022:** The root may automatically run existing focused local commands that are non-destructive and do not target live or unclear external systems.
  - This includes applicable tests, type checks, and linters.
  - Live, external, destructive, or unclear targets shall stop at the relevant boundary.
  - Verification: local fixture commands run; a command marked as requiring a live service is not executed without additional authorization.

- **REQ-023:** Missing repository dependencies or required tooling shall block dynamic validation for the affected unit without automatic installation during baseline review.
  - Static review may continue but shall not be labeled fully validated.
  - Verification: remove a required dependency from a fixture environment and confirm no package installation occurs.

- **REQ-024:** Each baseline unit shall receive one timed run of its canonical local developer-facing test command when such a command exists.
  - The report shall label this as a timing sample, not a statistically rigorous benchmark.
  - It shall record absolute duration and the unit's share of the target local workflow where available.
  - Verification: timing records name the command, runner version, selected scope, and instrumentation state.

- **REQ-025:** Deep-performance mode shall support separate cold and warm samples, repeated measurements, phase or slow-test data where the runner supports them, and variability reporting.
  - Runner configuration experiments shall remain a later remediation action rather than part of ordinary baseline measurement.
  - Verification: a deep-performance fixture report distinguishes cold, warm, coverage, type-check, and profiled runs.

- **REQ-026:** Coverage evidence shall be reused when current and collected through existing repository commands only when it resolves a behavior-protection or suite-value question.
  - Coverage collection shall not run for every unit by default.
  - Verification: a unit with sufficient existing evidence does not trigger an unnecessary coverage run.

- **REQ-027:** Existing mutation tooling shall be used selectively when targeted mutation can distinguish assertion strength, unique protection, or semantic redundancy.
  - Mutation score shall not be a target or sole decision rule.
  - Missing mutation tooling may be proposed for the later remediation worktree but shall not be installed during baseline review.
  - Verification: surviving and killed mutants retain tool provenance and are interpreted against a named behavior.

- **REQ-028:** The root may inspect bounded Git history for test origin, churn, prior regressions, and fixture maintenance.
  - It may expand to complete relevant history when earlier evidence indicates likely high-value information.
  - Verification: history expansion names the signal that justified broader retrieval.

- **REQ-029:** When an authenticated CI provider is already configured, the root may retrieve relevant read-only timing, failure, retry, and flake evidence.
  - It shall not mutate CI state or disclose credentials.
  - Verification: CI retrieval uses read-only operations and the report records source and timeframe.

- **REQ-030:** A reviewer that needs context outside its assigned behavior cluster shall return a structured context request.
  - The root shall validate repository containment and relevance before supplying the additional path or evidence.
  - Verification: a fixture with a shared dependency expands context without giving the reviewer write or publication authority.

### Test-suite value assessment

- **REQ-031:** The reviewer shall map each behavior cluster to observable contracts and plausible fault classes before recommending test changes.
  - Production implementation behavior alone shall not define the expected result when an independent contract exists.
  - Verification: findings name the protected or unprotected contract and the fault mechanism.

- **REQ-032:** Missing coverage shall become a finding only when a concrete behavior, branch, failure mode, or invariant is left unprotected.
  - Lack of a direct test for each production function shall not be sufficient.
  - Verification: an untested implementation detail without independent behavioral risk produces no finding.

- **REQ-033:** Test severity shall derive from the reachable product consequence and the mechanism by which the suite gives false confidence.
  - Testing-smell labels, test-file size, and test complexity alone shall not determine severity.
  - Verification: severity rationales name both consequence and false-confidence path.

- **REQ-034:** Test complexity shall be reportable when it causes concrete reliability, comprehension, modification, investigation, or execution burden.
  - The reviewer shall weigh that burden against the test's unique regression protection and the effort required to improve it.
  - Verification: complexity findings include evidence of burden and do not rely on a structural threshold alone.

- **REQ-035:** The reviewer may recommend strengthening, consolidating, replacing, deleting, retiering, or retaining tests.
  - Deletion or consolidation shall require behavior/fault mapping that shows no lost unique protection, supported where practical by focused execution, coverage, history, or targeted mutation.
  - Verification: each deletion recommendation identifies the remaining source of equivalent protection.

- **REQ-036:** The reviewer may recommend moving valuable slow tests among local/PR, pre-merge, scheduled, or release tiers.
  - The recommendation shall preserve the cadence needed for the protected risk.
  - Verification: tier recommendations state the protected behavior, current human-time cost, and expected feedback point.

- **REQ-037:** A fast, stable, simple test with weak marginal protection shall not require a finding when it creates no material false confidence or human-time burden.
  - Verification: clean-control fixtures containing harmless low-value tests do not produce cleanup findings.

- **REQ-038:** The reviewer shall permit `reviewed - no change warranted` as an explicit outcome when remediation cost exceeds likely benefit.
  - Verification: the outcome is distinguishable from blocked, skipped, and unreviewed state.

- **REQ-039:** The initial workflow shall not compute a numeric test-value or model-confidence score.
  - It shall report protection, consequence, runtime share, flake evidence, and maintenance burden separately.
  - Verification: reports contain no synthetic weighted score or confidence threshold.

### Findings and reporting

- **REQ-040:** Candidate findings shall receive an independent root evidence check before publication.
  - The root shall reject duplicates, unsupported hypotheticals, version mistakes, style preferences, and findings contradicted by callers or contracts.
  - Verification: trial records retain candidate disposition counts and rejection reasons.

- **REQ-041:** The standard report shall distinguish verified defects, concrete test-quality risks, maintainability advice, and contract questions.
  - A clean `no verified findings` result shall be valid.
  - Verification: report fixtures render each class separately.

- **REQ-042:** The primary findings section shall contain every high-severity finding plus the highest-value medium findings.
  - Remaining verified findings shall appear in an appendix rather than disappear.
  - Cross-cutting findings shall appear once with an affected-unit list.
  - Verification: a fixture with repeated shared-setup impact produces one finding and complete affected scope.

- **REQ-043:** Smell-audit mode shall place weaker or unverified smell candidates in a separate candidate appendix.
  - Candidate status shall not be represented as low-severity verified status.
  - Verification: seeded smell signals lacking a concrete failure mechanism remain candidates only.

- **REQ-044:** Every verified finding shall include category, severity, location, tested contract, failure mechanism, reachable impact, evidence, required outcome, and focused validation.
  - Findings shall preserve deterministic tool and documentation provenance.
  - Verification: schema inspection rejects a verified finding missing any required field.

- **REQ-045:** Every report shall include review coverage and limitations.
  - This includes units and symbols examined, commands and versions used, omitted or blocked scope, truncated evidence, and checks not run.
  - Verification: the reader can account for every inventoried unit from the report.

- **REQ-046:** Later diff reviews shall retain unresolved baseline findings locally but repeat them only when the affected area is touched, severity changes, or the finding blocks the current change.
  - Verification: an unrelated diff does not repeat known baseline debt.

- **REQ-047:** The workflow shall record user dispositions as `useful`, `valid-not-worth-changing`, `false-positive`, `already-known`, or `needs-more-evidence`.
  - Dispositions shall support trial evaluation but shall not become ground truth automatically.
  - Verification: each disposition is retained with finding identity and revision.

### Reviewer authority and trust

- **REQ-048:** `pi/agents/test-reviewer.md` shall be a closed-read reviewer.
  - It shall not modify files, run arbitrary shell commands, install dependencies, approve, merge, push, publish externally, or delegate.
  - Verification: its tool and role definition expose no mutation or publication authority.

- **REQ-049:** The root shall own repository discovery, command execution, candidate verification, state, reporting, and remediation decisions.
  - Verification: no child result bypasses root validation into the final report.

- **REQ-050:** User-owned reviewer policy and trusted repository policy shall remain authoritative over pull-request narratives, test comments, source text, and instructions introduced by the change under review.
  - Untrusted text shall be treated as evidence claims, not operating instructions.
  - Verification: adversarial fixture comments cannot alter review scope, tools, or publication rules.

### Remediation

- **REQ-051:** Remediation shall begin only after the full initial baseline is complete and the user explicitly requests fixes.
  - Unit-by-unit remediation during an active baseline shall remain a documented future option, not initial behavior.
  - Verification: the initial workflow does not create a remediation worktree while baseline units remain pending.

- **REQ-052:** The root shall create one isolated Git worktree for the entire baseline remediation effort, based on the exact reviewed revision.
  - It shall preserve unrelated working-tree changes and existing worktrees.
  - Verification: fixes occur outside the user's primary checkout and no pre-existing worktree is removed or changed.

- **REQ-053:** Remediation shall create focused commits after each validated review unit but shall not push, merge, rebase, or synchronize `main` automatically.
  - Divergence from `main` shall be reported and await explicit instructions.
  - Verification: repository history shows focused local commits and unchanged remotes/main.

- **REQ-054:** The remediation worktree and branch shall remain until the user states that fix work is complete and provides integration or cleanup instructions.
  - Verification: closeout reports the exact worktree and branch without deleting them.

- **REQ-055:** Remediation may change production code when the existing seam prevents reliable testing, provided observable behavior and public interfaces remain unchanged.
  - Broader production refactoring may be proposed but requires a separate explicit decision.
  - Verification: any production change is reported separately and validated against existing behavior.

## Non-functional requirements

- **NFR-001:** The workflow shall minimize maintainer attention by omitting speculative cleanup and recommending no change when correction cost exceeds likely benefit.
  - Verification: clean-control evaluation includes harmless weak tests and justified complex tests without mandatory findings.

- **NFR-002:** The workflow shall preserve failure provenance.
  - Test, type-check, lint, coverage, mutation, CI, and history evidence shall retain source, command or query, revision, version, and relevant scope.
  - Verification: a reader can distinguish deterministic results from reviewer judgment.

- **NFR-003:** The workflow shall be resumable after context compaction or process interruption using local state and repository revision.
  - Verification: interrupt a fixture baseline and resume without repeating completed unaffected units.

- **NFR-004:** The workflow shall use LF line endings and ASCII punctuation in tracked artifacts.
  - Verification: repository formatting checks and an ASCII scan pass.

- **NFR-005:** The first version shall remain removable without repository migration.
  - Removing the prompt, skill, and agent shall leave only untracked `<git-common-dir>/test-review/` data.
  - Verification: no production package, test runner, or CI configuration depends on the reviewer.

## Acceptance criteria

1. [ ] Given a clean repository with no review state, when `/test-review` runs without a mode, then it inventories every JavaScript and TypeScript test unit and starts baseline review.
   - Verification: the dotfiles trial inventory accounts for every applicable test or records an explicit exclusion.

2. [ ] Given the baseline inventory, when review completes, then every unit is reviewed, blocked, or skipped with a reason.
   - Verification: machine state and Markdown coverage tables contain the same complete unit set.

3. [ ] Given a review unit, when the reviewer assesses it, then the evidence includes its behavior contract, relevant source seam, fixtures/configuration, and one canonical local timing sample when available.
   - Verification: inspect all trial unit records; no reviewed unit lacks required evidence without a stated limitation.

4. [ ] Given duplicated or proliferated tests, when consolidation is recommended, then the report identifies remaining equivalent protection and the expected human-time benefit.
   - Verification: no deletion recommendation relies only on code similarity, test count, or coverage percentage.

5. [ ] Given a fast and harmless weak test, when the standard review runs, then it does not consume the primary report merely because its assertion is weak.
   - Verification: a clean-control fixture yields no finding unless a concrete false-confidence or maintenance mechanism exists.

6. [ ] Given a slow test with little additional coverage, when value is assessed, then the decision considers unique behavior/fault protection and execution tier rather than a coverage/runtime ratio alone.
   - Verification: critical unique integration coverage can be retained or retiered, while redundant slow coverage can be consolidated or removed.

7. [ ] Given a high-severity candidate, when the final report is produced, then the root has verified its current location, contract, reachable mechanism, and evidence.
   - Verification: rejected candidates retain rejection reasons and do not appear as verified findings.

8. [ ] Given an unsupported or version-sensitive runner claim, when authoritative evidence is unavailable, then the claim remains unvalidated rather than becoming a defect.
   - Verification: the report identifies the missing evidence.

9. [ ] Given a changed unit after baseline, when `/test-review` runs again, then unrelated reviewed units remain valid and touched/shared-dependent units become stale.
   - Verification: a fixture change produces the expected invalidation set from Git history.

10. [ ] Given one failing or hanging unit command, when baseline review continues, then independent units complete and the affected unit is revisited or explicitly blocked.
    - Verification: the baseline cannot close with an unexplained command failure.

11. [ ] Given browser E2E tests, when the baseline runs, then they are inventoried and timed where available but routed to the Playwright E2E capability for semantic review.
    - Verification: no browser-fidelity claim is inferred from DOM-emulator tests.

12. [ ] Given completed baseline findings, when the user supplies a disposition, then local state records it without treating that response as objective correctness ground truth.
    - Verification: trial evaluation reports disposition counts and separately verified false positives.

13. [ ] Given an explicit remediation request after baseline completion, when fixes begin, then one isolated worktree contains all baseline fixes as focused unit commits.
    - Verification: the primary checkout and `main` remain unchanged until explicit integration instructions.

14. [ ] Given the first dotfiles trial, when the user evaluates the output, then success is based on accurate and useful findings plus credible consolidation or performance savings.
    - Verification: finding count, coverage increase, and mutation score are not acceptance gates; `no verified findings` remains a valid result.

## Alternatives considered

| Option | Advantages | Costs | Decision |
| --- | --- | --- | --- |
| Skill and closed-read reviewer | Small, inspectable, reversible, and quick to revise | Root manually coordinates state and completion | Selected for the first version |
| Pi extension plus skill/reviewer | Deterministic queues, state, modes, and UI | Larger privileged TypeScript surface before review value is proven | Defer until repeated failures demonstrate need |
| Standalone CLI | Cross-client and CI use | Duplicates Pi orchestration, security, packaging, and model integration | Out of scope |
| Diff-only review | Fast steady-state feedback | Cannot establish value or debt in a never-reviewed suite | Use after baseline, not instead of baseline |
| Whole-repository single prompt | Simple invocation | Poor context quality, weak coverage accounting, and injection exposure | Reject |
| Numeric test-value score | Easy ranking | False precision without calibrated local weights | Reject initially |
| Coverage/runtime ratio | Simple | Misses critical low-coverage tests and weak high-coverage assertions | Reject as sole decision rule |
| Full mutation suite | Strong fault evidence | High cost and equivalent-mutant noise | Use targeted configured mutation only |
| Automatic remediation | Reduces handoff steps | Expands authority and can destroy unique protection | Reject |

## Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Reviewer recommends deleting uniquely valuable tests | Escaped regressions | Require behavior/fault mapping, root verification, supporting evidence, isolated worktree, and focused validation |
| Baseline consumes excessive maintainer attention | Workflow costs exceed value | Prioritize human-time impact, cap the primary report, permit no-change outcomes, and keep uncertain candidates separate |
| One timing sample is mistaken for a benchmark | Misguided performance changes | Label ordinary evidence as a timing sample and reserve repeated measurements for deep-performance mode |
| Manual state coordination drifts | Repeated or missing units | Keep root as sole writer, reconcile report/state unit sets, and use Git revisions for invalidation |
| Review scope expands into general production review | Noise and unrelated refactoring | Require every finding to explain test validity, protection, or cost |
| Repository text manipulates reviewer behavior | Unsafe scope or authority expansion | Keep user-owned policy authoritative and treat repository narratives as untrusted claims |
| CI/history retrieval exposes sensitive data | Disclosure | Use existing authenticated read-only mechanisms, bounded queries, and summarized evidence |
| Runner semantics are assumed incorrectly | False findings | Inspect installed version/configuration and maintained applicable documentation |
| Slow but valuable tests are deleted | Lost integration protection | Consider unique faults, consequence, and execution tier before deletion |
| Harmless weak tests generate cleanup work | Wasted maintainer time | Require a concrete false-confidence or human-cost mechanism before reporting |
| Baseline never reaches closure | Incomplete review presented as complete | Account for every unit as reviewed, blocked, or skipped and persist recovery state |

## Evaluation

The first trial shall cover all in-scope JavaScript and TypeScript unit, integration, contract, and component tests in the dotfiles repository. Browser E2E tests shall be inventoried and timed where available, then routed to the Playwright E2E capability for semantic review. The trial shall emphasize actual suite value rather than seeded finding count.

User dispositions shall use:

- `useful`
- `valid-not-worth-changing`
- `false-positive`
- `already-known`
- `needs-more-evidence`

Evaluation shall consider:

- verified false positives;
- finding actionability;
- duplicate findings;
- localization accuracy;
- useful consolidation opportunities;
- measured local feedback-time opportunities;
- review and verification burden;
- completeness of unit accounting; and
- explicit abstention when evidence is insufficient.

Human dispositions, comment resolution, coverage, mutation score, and model self-confidence shall not serve as sole ground truth.

## Research references

- [Agentic test-review research](agentic-test-review-research.md)
- [General testing code smells](general-testing-code-smells.md)
- [TypeScript testing smells and performance](typescript-testing-code-smells.md)
- [Evidence-based code review](../../patterns/evidence-based-code-review.md)

## Open questions

- What default per-command timeout should apply when neither repository configuration nor prior timing provides a reliable bound?
- Which exact fields and size limits should the first local state format use?
- Does the first trial expose enough repeated orchestration failure to justify a later extension?
- Should broader production refactoring become an ordinary remediation option after the initial workflow is proven?
- Should the human-readable report eventually be rendered from machine state rather than stored as a separate artifact?

## KISS recommendation

Implement one `/test-review` prompt template, one review skill with progressive references, and one closed-read reviewer. Run the complete dotfiles JavaScript/TypeScript baseline, record user dispositions, and consider additional machinery only after observed failures show what deterministic support is missing.
