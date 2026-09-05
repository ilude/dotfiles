---
status: research-note
source: public implementations, product documentation, academic literature, and installed Pi 0.84.4 documentation
---

# Research: agentic test review for Pi

Date: 2026-09-04

The [test-suite value review PRD](PRD.md) records the subsequent product decisions. Its decisions supersede preliminary recommendations in this research note.

## Purpose

This report evaluates current agentic code-review implementations, Pi's supported composition mechanisms, and academic evidence that should shape a unit-test review system. The target is a high-precision reviewer for test effectiveness, reliability, isolation, and measured performance. It is not an autonomous approval system.

## Main conclusions

1. Use a layered review pipeline, not one prompt over a diff.
2. Default to change-aware review, then retrieve only the source, tests, configuration, and contracts needed to evaluate that change.
3. Generate candidate findings broadly but publish narrowly after an independent evidence check.
4. Optimize for precision and developer attention before recall or comment count.
5. Keep deterministic facts and model judgment separate. Compilers, linters, test runners, coverage, mutation tools, and measured timings retain their provenance.
6. Treat repository content, pull-request text, comments, and branch-local instructions as untrusted input.
7. Evaluate test effectiveness against specifications, historical defects, and targeted mutation results. Coverage alone is inadequate.
8. Track finding state across review revisions when persistent review is added: new, open, resolved, and reopened.
9. For Pi, start with a skill and a closed-read reviewer agent. Let the root run repository commands and validate findings. Add a custom evidence tool or typed stages only after observed inconsistency justifies them.
10. Do not use uncalibrated model confidence as publication authority. Use evidence classes and allow abstention.

## Evidence standard used in this report

Implementation popularity is only a discovery signal. Stronger evidence includes public source, documented architecture, maintained releases, industrial deployment studies, peer-reviewed evaluations, and reproducible benchmarks. Vendor quality claims are not treated as independent validation.

GitHub repository statistics below were queried from the GitHub API on 2026-09-04. Stars indicate attention, not quality:

- `badlogic/pi-mono`: 101,833 stars, active
- `qodo-ai/pr-agent`: 12,857 stars, active community-maintained project
- `reviewdog/reviewdog`: 9,563 stars, active
- `anthropics/claude-code-action`: 8,791 stars, active
- `anthropics/claude-code-security-review`: 6,166 stars, last source update observed 2026-02-11
- `danger/danger-js`: 5,505 stars, active
- `stryker-mutator/stryker-js`: 3,081 stars, active
- `vercel-labs/openreview`: 1,652 stars, beta; source activity observed in March 2026
- `openai/codex-action`: 1,224 stars, active
- `alibaba/aacr-bench`: 220 stars, research artifact

## Current implementation patterns

### PR-Agent

Sources:

- Repository: https://github.com/qodo-ai/pr-agent
- Review behavior: https://docs.pr-agent.ai/tools/review/
- Core abilities: https://docs.pr-agent.ai/core-abilities/
- Agent skills: https://docs.pr-agent.ai/core-abilities/agent_skills/

Observed design:

- Separates review, improvement, description, and question actions.
- Exposes explicit token, file, call, and finding budgets.
- Reports when files were omitted from review.
- Can chunk a large review and merge results conservatively.
- Supports persistent and incremental comments.
- Reads repository instructions and skill text.
- Uses path ignores and repository-specific configuration.
- Exposes model, token, duration, call, and estimated cost details when enabled.
- Its current skill support is single-shot and inlines enabled skill text rather than implementing true progressive disclosure.

Ideas to borrow:

- Distinct review modes rather than one overloaded prompt.
- A review-coverage footer naming omitted files and unvalidated checks.
- Bounded findings and bounded context.
- Persistent finding identity and incremental re-review.
- Conservative merge rules when review chunks disagree.

Do not borrow:

- Treating the presence of tests as evidence that they are effective.
- Loading every skill body into every review.
- Model-generated merge recommendations as authoritative gates.

### BitsAI-CR at ByteDance

Sources:

- Paper: https://arxiv.org/abs/2501.15134
- FSE 2025 DOI: https://doi.org/10.1145/3696630.3728552

Observed design:

- Uses a taxonomy of 219 review rules.
- Expands diff hunks to bounded function context with tree-sitter.
- Runs a candidate-generating RuleChecker followed by a separate ReviewFilter.
- Aggregates similar comments to reduce overload.
- Prioritizes precision over recall because early false positives damage trust.
- Uses developer feedback and per-rule outcomes to refine or retire low-value rules.
- Reports 75.0 percent precision and deployment to more than 12,000 weekly active users. These are author-reported industrial results.

Ideas to borrow:

- Candidate generation followed by independent filtering.
- A hierarchical taxonomy: dimension, smell/category, concrete mechanism.
- Per-category calibration rather than one global confidence threshold.
- Duplicate aggregation before publishing.
- Rule retirement when a rule repeatedly produces technically correct but unused advice.

Caution:

- Developer modification of a flagged line is an adoption signal, not proof that the comment was correct.
- A second model is still probabilistic and is not independent verification by itself.

### AutoCommenter at Google

Sources:

- Paper: https://arxiv.org/abs/2405.13565
- AIware 2024 DOI: https://doi.org/10.1145/3664646.3665664

Observed design:

- Targets documented best practices rather than unconstrained general review.
- Predicts both a precise location and the authoritative practice URL.
- Calibrates thresholds per rule/document rather than only per language.
- Filters findings on unchanged lines.
- Uses historical evaluation, staged deployment, direct feedback, and targeted human evaluation.
- Found that stale best-practice documents produced stale findings and added suppression controls.
- Uses different decoding/latency tradeoffs for IDE and code-review workflows.
- Explicitly recognizes that historical human review comments are incomplete ground truth.

Ideas to borrow:

- Require every policy finding to cite the owning repository or framework contract.
- Store source version/freshness with each rule reference.
- Calibrate and suppress by category.
- Separate fast local feedback from deeper package-level review.
- Roll out narrowly before broad automatic invocation.

### Defect-focused multi-role review

Source:

- "Towards Practical Defect-Focused Automated Code Review": https://arxiv.org/abs/2505.17928

Observed design:

- Uses AST and data-flow-aware code slicing instead of sending only a hunk or the entire repository.
- Separates reviewer, meta-reviewer, validator, and presentation roles.
- Evaluates key-bug inclusion, false-alarm rate, and line localization rather than text similarity.
- Validates against historical production faults.
- Reports that more context is not monotonically better; focused slices can outperform full-flow context.

Ideas to borrow:

- Retrieve the changed test, subject-under-test symbol, direct dependencies, relevant fixtures, and owning configuration as a structured slice.
- Use different roles for candidate discovery and finding verification.
- Measure localization accuracy.
- Build evaluation cases from real escaped defects, not only synthetic smell examples.

Caution:

- Multiple model roles increase cost and can reproduce the same misconception. Add roles only when they have distinct evidence or authority.

### Anthropic Claude Code Security Review

Sources:

- Repository: https://github.com/anthropics/claude-code-security-review
- Finding filter: https://github.com/anthropics/claude-code-security-review/blob/main/claudecode/findings_filter.py

Observed design:

- Reviews changed files and attaches findings to lines.
- Separates finding generation from a false-positive filtering pass.
- Stores structured findings and filter statistics.
- Includes an evaluation harness.
- Warns that it is not hardened against prompt injection and should review only trusted pull requests.
- Applies deterministic hard exclusions before model filtering.

Ideas to borrow:

- Keep explicit counts for generated, rejected, and published candidates.
- Retain rejection reasons for tuning and evaluation.
- Include adversarial repository-content tests.

Do not borrow directly:

- Broad hard exclusions based only on finding text. Its published filter excludes whole classes such as resource-management findings in a security context. A test reviewer could hide real leaks or hangs if it copied this approach.
- Keeping a candidate when the verification model fails. Verification failure should produce `unvalidated`, not implicit acceptance.

### GitHub Copilot code review

Source:

- Current documentation: https://docs.github.com/en/copilot/how-tos/use-copilot-agents/request-a-code-review/use-code-review

Observed design:

- Supports manual, automatic, and new-push reviews.
- Distinguishes review effort levels.
- Uses repository-wide and path-specific instructions, agent skills, and MCP tools.
- Runs in an ephemeral environment that can be configured separately from the coding agent environment.
- Exposes skill/MCP attribution and session/tool-call details.
- Collects per-comment feedback.
- Defaults to a non-approving comment review, although optional automated approvals now exist.
- Documentation warns that re-review may repeat resolved or downvoted comments.
- Reads instructions and skills from the pull request head branch.

Ideas to borrow:

- Show provenance for instructions and external evidence used by a finding.
- Separate lightweight and deep review modes.
- Use an isolated environment for dynamic checks.
- Keep review findings non-authoritative by default.

Security correction for this design:

- Do not trust review instructions from the change under review. Use global/user policy and the trusted base revision. Treat head-branch instruction changes as review subjects, not reviewer authority.

### OpenAI Codex Action

Source:

- Repository: https://github.com/openai/codex-action

Observed design:

- Supports explicit read-only and workspace permission profiles.
- Separates the agent job from the job that publishes feedback.
- Uses an API proxy so the model does not receive the raw provider key through ordinary environment access.
- Supports output schemas and output files.
- Recommends narrow MCP services for privileged operations.
- Rejects configuration combinations that would weaken or ambiguously compose security controls.

Ideas to borrow:

- Separate analysis from publication.
- Use a closed read profile for the reviewer.
- Validate structured output before findings reach the root report.
- Keep credentials and network access outside the reviewer process.

### Vercel OpenReview

Sources:

- Repository: https://github.com/vercel-labs/openreview
- Agent implementation: https://github.com/vercel-labs/openreview/blob/main/lib/agent.ts
- Workflow: https://github.com/vercel-labs/openreview/blob/main/workflow/index.ts

Observed design:

- Creates an isolated sandbox, clones the pull-request branch, installs dependencies, runs an agent, then destroys the sandbox.
- Uses durable, resumable workflow steps.
- Discovers `.agents/skills` and exposes only skill metadata until `loadSkill` is called.
- Bounds agent steps, total tokens, and individual tool-result context.
- Supports line comments, suggestions, reactions, commits, and pushes.

Ideas to borrow:

- True skill progressive disclosure.
- Durable stage boundaries and unconditional sandbox cleanup.
- Explicit step and token ceilings.
- Reaction-based feedback as one signal.

Do not borrow for the first Pi version:

- One agent with read, write, shell, PR publication, approval, and commit authority.
- Automatic dependency installation.
- A fallback to an unconfigured generic linter.
- Automatic commit and push after an open-ended review request.

### Reviewdog, Danger, CodeQL, and Semgrep

Sources:

- Reviewdog: https://github.com/reviewdog/reviewdog
- Danger JS: https://danger.systems/js/
- CodeQL: https://codeql.github.com/docs/
- Semgrep: https://semgrep.dev/docs/

Observed pattern:

- Deterministic analyzers retain rule IDs, source locations, and reproducible output.
- Changed-line filtering and baseline comparison reduce historical noise.
- Repository policy checks remain ordinary code rather than model instructions.

Ideas to borrow:

- Run existing repository analyzers before model review.
- Preserve tool provenance and raw status.
- Let the reviewer correlate and explain deterministic findings, not recreate them.
- Never convert a linter warning into a product defect without checking the violated contract.

## Pi-specific architecture

### Supported Pi mechanisms

Installed Pi version inspected: `@earendil-works/pi-coding-agent` 0.84.4.

Official/local sources:

- Skills: installed `docs/skills.md`
- Extensions and custom tools: installed `docs/extensions.md`
- Packages: installed `docs/packages.md`
- Security: installed `docs/security.md`
- Upstream subagent example: installed `examples/extensions/subagent/`
- Local typed semantic stages: `pi/lib/typed-agent.ts`
- Local typed-agent contract: `pi/skills/typed-agent-workflows/SKILL.md`
- Local subagent contract: `pi/skills/pi-extension/references/contracts/subagents-and-tasks.md`

Pi supports the following layers:

1. Skills for progressively disclosed review methods and references.
2. Agent definitions for isolated role prompts, model choice, effort, skills, and tool allowlists.
3. Subagent tools for bounded read, write, or Team Lead authority.
4. Extensions for tools, commands, events, UI, persistence, and deterministic orchestration.
5. Local typed agents for isolated, no-tool semantic stages with validated TypeBox input/output and one bounded correction attempt.
6. Packages for distributing a mature combination of skills, prompts, and extensions.

### Recommended first version

Use the existing Pi composition model rather than adding an extension:

```text
root Pi session
  -> discovers repository and test configuration
  -> runs any authorized focused test/performance commands
  -> dispatches closed-read test-reviewer with bounded paths and evidence
  -> independently checks candidate findings
  -> reports verified findings and validation gaps
```

Resources:

```text
pi/
|-- agents/
|   `-- test-reviewer.md
`-- skills/
    |-- test-review/
    |   |-- SKILL.md
    |   `-- references/
    |       |-- effectiveness.md
    |       |-- general-smells.md
    |       `-- performance.md
    `-- typescript/
        `-- test-review.md
```

The agent should use `read` and bounded search only. It should not run arbitrary shell commands or modify files. The root already owns command execution, repository state, integration, and final validation. This also matches the local `subagent_read` authority model, which intentionally excludes raw shell access.

Dispatch adds the language skill when applicable, for example `typescript`. The reviewer does not permanently load every language card.

### Why not begin with a Pi extension

An extension becomes justified when at least one of these is demonstrated:

- evidence collection is inconsistent across repeated reviews;
- machine-readable finding lifecycle must persist across turns or sessions;
- a dedicated `/test-review` command needs mode parsing and completion;
- structured artifacts or UI are required;
- deterministic changed-symbol and related-test discovery needs one maintained implementation;
- a PR provider must publish comments or reconcile review revisions.

Until then, a skill plus agent has lower lifecycle cost and uses existing root validation.

### Later Pi evidence tool

If repeated use justifies it, add a narrow `collect_test_review_evidence` tool. It should collect facts, not decide quality:

- canonical package root;
- changed files and changed line ranges;
- test and source file candidates;
- package scripts and runner configuration;
- TypeScript module and type-check configuration;
- existing lint, coverage, and mutation configuration;
- bounded output from an operator-authorized command;
- omitted files and truncation metadata.

The tool must enforce path containment, output bounds, cancellation, and explicit command allowlisting. `promptGuidelines` can guide model use but cannot enforce safety or correctness.

### Later typed pipeline

Use local `defineAgent` only after a single reviewer produces measurable inconsistency. A useful pipeline would be:

```text
deterministic context packet
  -> typed candidate classifier
  -> deterministic evidence joins
  -> typed finding validator
  -> deterministic publication policy
```

Each typed stage gets one judgment responsibility and no tools. Schema validity is necessary but not evidence that the finding is true.

## Academic evidence and design consequences

### Modern code review

- Fagan, "Design and Code Inspections to Reduce Errors in Program Development," 1976, DOI: https://doi.org/10.1147/sj.153.0182
  - Structured preparation and inspection matter.
  - Consequence: make intent reconstruction and evidence collection explicit stages.

- Bacchelli and Bird, "Expectations, Outcomes, and Challenges of Modern Code Review," ICSE 2013, DOI: https://doi.org/10.1109/ICSE.2013.6606617
  - Review supports defect detection, maintainability, knowledge transfer, and coordination.
  - Consequence: classify correctness findings separately from maintainability advice and questions.

- Bosu et al., "Characteristics of Useful Code Reviews: An Empirical Study at Microsoft," MSR 2015, DOI: https://doi.org/10.1109/MSR.2015.21
  - Useful comments tend to be specific, actionable, and technically justified.
  - Consequence: require location, mechanism, impact, and validation for each finding.

- Sadowski et al., "Modern Code Review: A Case Study at Google," ESEC/FSE 2018, DOI: https://doi.org/10.1145/3236024.3236062
  - Lightweight review also supports maintainability and knowledge sharing.
  - Consequence: do not reduce success to bug count, but do not mix advice with blocking defects.

- Google Engineering Practices, "What to look for in a code review": https://google.github.io/eng-practices/review/reviewer/looking-for.html
  - Tests must themselves be reviewed for whether they fail when behavior breaks.
  - Consequence: inspect assertions and oracles rather than accepting passing tests.

- Google Engineering Practices, "Small CLs": https://google.github.io/eng-practices/review/developer/small-cls.html
  - Small, coherent changes are easier to review thoroughly.
  - Consequence: report review coverage degradation or request slices for large, mixed test changes rather than pretending complete review.

### Industrial LLM-assisted review

- Cihan et al., "Automated Code Review in Practice," ICSE-SEIP 2025, DOI: https://doi.org/10.1109/icse-seip66354.2025.00043 and https://arxiv.org/abs/2412.18531
  - In 4,335 pull requests, automated review was associated with useful feedback but also faulty, irrelevant, and unnecessary comments. Average closure duration increased in the studied deployment.
  - Consequence: optimize the whole workflow, not only finding generation. Measure review latency and burden.

- Vijayvergiya et al., AutoCommenter, AIware 2024, DOI above.
  - Consequence: use staged rollout, per-rule calibration, changed-line filtering, and source freshness.

- Sun et al., BitsAI-CR, FSE 2025, DOI above.
  - Consequence: use candidate generation, independent filtering, aggregation, and a rule-level feedback loop.

- Maddila et al., "AI-Assisted Fixes to Code Review Comments at Scale," 2025 preprint: https://arxiv.org/abs/2507.13499
  - An initial user-experience design made reviews more than 5 percent slower; showing suggested patches only to authors removed the measured regression. Reported patch application was 19.7 percent after model improvements.
  - Consequence: do not show every internal candidate or repair draft to every participant. Evaluate UX changes with workflow metrics.

- Adams et al., "Automating Low-Risk Code Review at Meta: RADAR, Risk Calibration, and Review Efficiency," 2026 preprint: https://arxiv.org/abs/2605.30208
  - RADAR is a multi-stage risk funnel with eligibility gates, static heuristics, learned risk, LLM review, deterministic validation, source-specific policy, rollout controls, and incident/revert monitoring.
  - Consequence: if automated approval is ever considered, make eligibility and deterministic validation separate from the reviewer. The initial test reviewer should never approve or merge.

- Alami and Ernst, "Human and Machine: How Software Engineers Perceive and Engage with AI-Assisted Code Reviews Compared to Their Peers," 2025 preprint: https://arxiv.org/abs/2501.02092
  - Interviewees reported trust and missing-context problems, and excessive detail could increase cognitive load.
  - Consequence: concise findings and visible evidence are functional requirements.

### Context and review lifecycle

- Zhang et al., "AACR-Bench: Evaluating Automatic Code Review with Holistic Repository-Level Context," 2026 preprint and artifact: https://arxiv.org/abs/2601.19494 and https://github.com/alibaba/aacr-bench
  - Context granularity and retrieval strategy materially affect results, varying by model and language. Original human comments are incomplete ground truth.
  - Consequence: use structured retrieval and multiple evaluation oracles.

- Zheng et al., "From Static to Dynamic: Benchmarking Real-World Code Review with MCR-Bench," 2026 preprint: https://arxiv.org/abs/2608.27442
  - Model performance degrades across review rounds and models confuse historical, resolved, and new defects.
  - Consequence: use stable finding IDs and explicit `new`, `open`, `resolved`, and `reopened` states in any persistent workflow.

- Karakaya et al., "Understanding the Limits of Automated Evaluation for Code Review Bots in Practice," EASE 2026: https://arxiv.org/abs/2604.24525
  - LLM judges reached only moderate agreement with developer labels, and developer actions reflect workflow pressures as well as technical validity.
  - Consequence: do not use an LLM judge or fixed/dismissed status as the sole quality oracle.

### Test effectiveness

- Zhu, Hall, and May, "Software Unit Test Coverage and Adequacy," ACM Computing Surveys 1997, DOI: https://doi.org/10.1145/254180.254192
  - Coverage is an adequacy criterion, not proof of effectiveness.

- Inozemtseva and Holmes, "Coverage Is Not Strongly Correlated with Test Suite Effectiveness," ICSE 2014, DOI: https://doi.org/10.1145/2568225.2568271
  - Consequence: never score a review as successful because coverage increased alone.

- Jia and Harman, "An Analysis and Survey of the Development of Mutation Testing," IEEE TSE 2011, DOI: https://doi.org/10.1109/TSE.2010.62
  - Mutation testing is useful but costly and complicated by equivalent mutants.
  - Consequence: use targeted changed-code mutation as supporting evidence, not a universal gate or raw score target.

- StrykerJS: https://github.com/stryker-mutator/stryker-js
  - Consequence: when a TypeScript repository already configures Stryker, use its changed/test scope and surviving-mutant detail. Do not install it during review.

- Zhao, Zhou, and Cohen, "Evaluating and Mitigating the Misguidance Effect of Buggy Code in LLM-Generated Unit Tests," 2026 preprint: https://arxiv.org/abs/2607.22883
  - Buggy implementation code can steer generated tests toward asserting the bug. Specification-oriented prompting reduced this effect in the study.
  - Consequence: derive expected behavior from issues, specifications, schemas, public contracts, and independent examples before reading implementation details when possible.

- Pan et al., "Tangent: An Empirical Study of Testing Practices for LLM-Based Agent Applications," 2026 preprint: https://arxiv.org/abs/2608.08413
  - The mined agent projects emphasized narrow unit tests, heavy mocking, simplistic data, and shallow assertions, with gaps in realistic interactions and non-functional properties.
  - Consequence: the reviewer must inspect cross-tool lifecycle, failure recovery, cancellation, resource cleanup, and realistic workflows in agent systems, not only isolated prompt/function tests.

### Security and adversarial review

- Melo et al., "SEVRA-BENCH: Social Engineering of Vulnerabilities in Review Agents," 2026 preprint: https://arxiv.org/abs/2606.13757
  - Review agents were susceptible to adversarial pull-request narratives wrapped around vulnerability-introducing changes.
  - Consequence: PR descriptions are claims to verify, not authority.

- Liu et al., "LongPIBench: A Long-Context Benchmark for Prompt Injection," 2026 preprint: https://arxiv.org/abs/2608.28411
  - Long-context code-review scenarios can bypass current prompt-injection defenses even with simple attacks.
  - Consequence: isolate authority structurally. Prompt instructions cannot safely distinguish trusted policy from untrusted repository text by wording alone.

- Pi security documentation states that project trust controls dynamic resource loading but is not a sandbox.
  - Consequence: use user-owned agent definitions and skill policy by default. Do not load project-local reviewer agents or changed branch skills merely because the repository is otherwise trusted.

## Revised system design

### Roles

#### Root coordinator

- Resolves review mode and scope.
- Reads trusted instructions and repository configuration.
- Executes authorized commands.
- Builds the evidence packet.
- Dispatches the reviewer.
- Independently verifies candidate findings.
- Owns final reporting and any later remediation.

#### Test reviewer

- Closed-read authority only.
- Maps tests to behavior and fault hypotheses.
- Produces candidate findings and explicit gaps.
- Does not edit, approve, merge, install dependencies, or publish externally.

#### Deterministic tools

- Retain their native status and rule identity.
- Supply facts such as compiler failures, lint results, timing phases, coverage regions, and mutation survivors.
- Do not make the overall review verdict.

#### Human operator

- Owns disputed contracts, risk tolerance, and consequential acceptance decisions.

### Review protocol

1. **Bound the review**
   - Mode: diff, selected suite, effectiveness, or performance.
   - Package root and paths.
   - Time/command budget.
   - Explicit exclusions.

2. **Establish the trusted contract**
   - User request and accepted requirements.
   - Base-branch or user-owned instructions.
   - Public API, schema, issue, and framework contracts.
   - Repository runner and package configuration.

3. **Build a focused context slice**
   - Changed test and source symbols.
   - Direct imports and relevant callers/callees.
   - Fixtures, setup files, and runner environment.
   - Nearby tests proving the local convention.
   - Existing deterministic diagnostics.

4. **Generate candidates**
   - Name the behavior seam.
   - Name the plausible defect the test should detect.
   - Explain why the current assertion, fixture, mock, lifecycle, or configuration may miss it.
   - Classify as effectiveness, reliability, isolation, performance, or maintainability.

5. **Verify candidates**
   - Re-read exact current lines and definitions.
   - Check repository/framework behavior in maintained documentation when version-sensitive.
   - Match deterministic evidence where available.
   - Reject duplicates, pre-existing issues outside scope, style preferences, and unsupported hypotheticals.
   - Mark unresolved contract questions as `unvalidated`; do not publish them as defects.

6. **Report coverage and limits**
   - Files and symbols examined.
   - Commands and versions used.
   - Omitted files or truncated output.
   - Checks not run and why.

### Finding contract

Do not require a numeric confidence value until it has been calibrated against local labeled outcomes. Use this structure:

```text
id: stable category/path/symbol/mechanism fingerprint
status: new | open | resolved | reopened
class: defect | test-quality-risk | maintainability | question
category: effectiveness | reliability | isolation | performance | maintainability
severity: high | medium | low
location: exact current path and line range
tested_contract: observable behavior or invariant
failure_mechanism: reachable way the test gives false confidence or incurs measured cost
evidence: source, configuration, command, or mutation evidence
required_change: outcome to restore, not a mandatory implementation
validation: focused check that would prove the correction
provenance: reviewer plus deterministic sources used
```

Publication policy:

- Publish `defect` only with a concrete reachable mechanism and current evidence.
- Publish `test-quality-risk` when effectiveness cannot be proved but a specific false-confidence path exists.
- Keep maintainability findings advisory.
- Ask a question when the contract is genuinely missing.
- Omit speculative and duplicate candidates.
- Permit a clean `no verified findings` result.

### Performance review protocol

- Require a named command and target workflow.
- Label cold, warm, coverage, type-check, and profiled runs separately.
- Use runner phase data before changing configuration.
- Tie every recommendation to an observed dominant phase.
- Change one relevant input at a time.
- Re-run only after that input changes or a benchmark design explicitly requires samples.
- Recheck correctness and isolation after sharing setup or weakening isolation.
- Report hardware/CI constraints that affect worker conclusions.
- Do not impose universal worker counts, test-file sizes, DOM environments, or time thresholds.

## Evaluation plan for the reviewer

### Evaluation corpus

Build a small repository-held-out corpus before automatic invocation:

1. Real historical test defects and escaped regressions.
2. Reviewed diffs with accepted and rejected test comments.
3. Seeded TypeScript cases:
   - floating promise;
   - `forEach(async ...)`;
   - unexpected-success error test;
   - tautological mock;
   - fake drift;
   - leaked timer/global/environment;
   - ESM mock after import;
   - type assertion hiding an incomplete fixture;
   - runtime test mistaken for a type test;
   - large unstable snapshot;
   - order-dependent fixture;
   - browser emulator mistaken for browser behavior;
   - repeated expensive environment/setup;
   - oversubscribed worker pool;
   - coverage-only improvement with no stronger oracle.
4. Clean controls containing intentional and justified uses of mocks, snapshots, fake timers, shared immutable fixtures, and serialized integration tests.
5. Adversarial cases where test names, comments, PR descriptions, or branch-local instructions assert false behavior.

### Metrics

Primary:

- verified precision by category;
- false-positive findings per review;
- localization accuracy;
- duplicate rate;
- reviewer actionability rating;
- review latency and human verification burden.

Secondary:

- recall against known historical defects;
- meaningful surviving-mutant identification;
- accepted, fixed, dismissed, and disputed finding rates;
- scope coverage and abstention rate;
- cost and token use;
- performance recommendation success on the named workflow.

Do not use as sole success metrics:

- number of comments;
- line or branch coverage;
- lexical similarity to human comments;
- LLM-judge score;
- comment resolution rate;
- model-reported confidence.

### Rollout

1. Offline corpus evaluation.
2. Manual invocation with unpublished local reports.
3. Compare reviewer findings with human review outcomes.
4. Tune or retire noisy categories.
5. Add optional automatic review only for bounded changed-test diffs.
6. Keep publishing and approval human-controlled.
7. Add persistent lifecycle tracking only when repeated re-review creates duplicate or stale findings.

## Changes to the earlier proposal

Research supports these corrections:

- Keep the skill plus agent recommendation, but remove shell access from the reviewer. The root runs commands.
- Replace uncalibrated numeric confidence with evidence states and abstention.
- Add an explicit trusted-policy boundary. Base/user instructions govern review; head-branch instructions are data under review.
- Add candidate generation and independent root verification as the initial two-stage filter.
- Add a review-coverage footer and omitted-file accounting.
- Add stable finding identity for any later incremental workflow.
- Evaluate precision, workflow burden, and latency before adding automatic invocation.
- Use targeted mutation only when already configured or explicitly introduced as a separate repository decision.
- Do not add an extension or typed multi-agent pipeline until repeated use demonstrates the missing invariant.

## Decision handoff

The [test-suite value review PRD](PRD.md) resolves the product questions that remained open during research. It selects owned JavaScript and TypeScript scope, baseline-first mode inference, local Git-common-directory state, complete baseline accounting, one local timing sample per distinct canonical command scope shared across relevant review units, recorded user dispositions, and a skill-plus-agent first implementation. The [operating model](operating-model.md) defines resume, final-commit reconciliation, repository boundaries, and known-answer calibration.

## KISS recommendation

Implement the prompt template, review skill, and closed-read reviewer first. Use one complete repository baseline to evaluate finding value and orchestration pain before adding an extension or typed pipeline.

## Related notes

- [General testing code smells](general-testing-code-smells.md)
- [TypeScript testing smells and performance](typescript-testing-code-smells.md)
- [Evidence-based code review](../../patterns/evidence-based-code-review.md)
