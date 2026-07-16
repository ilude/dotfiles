# Pi Workflow and Design Refinement Research Notes

Date: 2026-07-16
Status: Discussion and research in progress

## Purpose

This notebook records research and local architecture findings for refining:

- Pi subagent prompting and orchestration
- `/goal`
- `/plan-it`
- `/review-it`
- `/do-it`
- typed semantic stages
- workflow telemetry and evaluation
- frontend and product-design guidance

The intent is to preserve the source trail while additional videos, discussions,
and implementation examples are collected. This is not an implementation plan.
No behavior changes have been approved or applied from this research.

## Current Working Questions

1. Which durable prompting lessons from GPT-5.6 should change Pi's global,
   skill, agent, tool, and workflow prompt layers?
2. Which repeated workflow transitions should be enforced by deterministic
   TypeScript rather than interpreted from prompt state machines?
3. How should `/goal` relate to `/plan-it`, `/review-it`, and `/do-it`?
4. Should `/review-it` remain explicit, become adaptive, or eventually become
   an embedded stage of planning?
5. Which review stages and reviewer counts produce useful findings rather than
   duplicate or low-value work?
6. How should workflow success be validated across artifacts, runtime state,
   execution trajectory, validation evidence, and terminal state?
7. How should the UX design skill avoid global aesthetic prescriptions while
   still producing distinctive, accessible, verified interfaces?

## Current Conclusions

These conclusions are provisional and should be revisited as more sources are
added.

### 1. Keep `/goal` as a persistent objective wrapper

Current evidence supports treating `/goal` as the durable objective envelope,
not as a replacement scheduler for the other commands.

The strongest future shape is:

```text
/goal
  persistent objective and lifecycle references

/plan-it
  executable plan, task graph, validation contract, and checklist

/review-it
  evidence-backed adversarial review and readiness assessment

/do-it
  implementation, validation, repair, archive, and terminal outcome

goal_complete
  closeout linked to verified terminal evidence
```

`/goal` can feel like a compressed version of the larger lifecycle from the
operator's perspective. Its current runtime behavior is narrower: it stores and
reasserts an objective but does not own planning, review, execution, validation,
or archive transitions.

### 2. Keep global instructions lean

Do not add another large global orchestration or frontend section. GPT-5.6
model guidance explicitly recommends stating each instruction once, exposing
only relevant tools, and validating prompt reductions on representative work.

Task-specific context belongs in generated stage prompts. Repeated mechanical
transitions, retry limits, artifact checks, and terminal conditions belong in
code when the workflow is stable enough to justify implementation.

### 3. Use code for predictable control flow and models for judgment

Candidate ownership boundary:

| Concern | Preferred owner |
| --- | --- |
| Command parsing and registration | TypeScript extension |
| Lifecycle and correlation IDs | TypeScript extension |
| Session transfer | TypeScript extension |
| Dependency and phase transitions | TypeScript extension |
| Retry, timeout, concurrency, and depth limits | TypeScript extension |
| Artifact existence and schema checks | TypeScript extension |
| Validation command results | Deterministic code |
| Plan quality judgment | Focused typed stage |
| Reviewer findings and synthesis | Focused typed stage or bounded reviewer worker |
| Product, UX, and risk judgment | Prompt skill or specialist worker |
| Implementation and repository inspection | Direct parent or bounded worker |
| Resume ledger | Plan checklist and runtime events |
| Human-readable evidence | Plan and review artifacts |
| Aggregate evaluation | Runtime telemetry plus deterministic analysis |

### 4. Do not reduce `/review-it` before measuring it

The current six-or-more-reviewer panel is local policy. Research did not prove
that six reviewers are optimal, but it also did not prove that the panel is
wasteful.

Before changing panel size or embedding review into planning, collect:

- plan profile
- panel composition decision
- findings per reviewer
- applied findings
- duplicates
- false positives
- low-value findings
- whether review changed execution readiness
- execution failures caused by plan gaps
- issues missed by review
- tokens, cost, duration, retries, and failure rate

The existing workflow telemetry specification already anticipates most of this
measurement.

### 5. Replace universal design prescriptions with contextual validation

The current UX skill contains unconditional visual and process rules that can
conflict with existing products and with each other. The more defensible flow is:

```text
inspect the existing product and design system
-> identify whether visual direction is actually unresolved
-> offer bounded product-specific alternatives only when needed
-> implement with existing components and tokens
-> verify the rendered interface in a browser
-> verify semantics, keyboard flow, states, and named viewports
-> retain screenshots and functional evidence when appropriate
```

Browser evidence should be conditional on user-facing UI work. Performance or
visual-regression tooling should not be imposed when the repository does not
already support it unless setup is explicitly in scope.

## Initial Video Reference

### Video

URL: https://www.youtube.com/watch?v=Noo0NWD0gHU

Ingestion metadata:

- Content ID: `yhi0a6y8tw7yuku1fsz5`
- Job ID: `50aeg2qylkq6n630lu67`

Relevant sections:

| Timestamp | Topic | Current interpretation |
| --- | --- | --- |
| 04:54-05:42 | Code-defined workflows with stages and termination | Repeated orchestration should have explicit stages and a real terminal condition. |
| 07:40-07:48 | Browser verification for frontend changes | Rendered behavior must be inspected before completion, not inferred from source changes. |
| 09:51-18:06 | Over-prescriptive global frontend guidance | Universal aesthetic and component rules can overpower project context and model capability. |
| 14:47-15:27 | Fixed polling and update intervals | Avoid arbitrary global timing instructions without a measured runtime need. |
| 16:36-18:06 | Prompt and skill curation | Durable prompts should be concise, deliberate, and measured against actual outcomes. |
| 20:49-22:08 | General behavioral boundaries | Generic policy should describe outcomes, reversibility, blast radius, and communication rather than prescribe domain implementation details. |
| 26:41-29:15 | Explicit workflow orchestration | Parallel work should be selected deliberately and should terminate through a bounded workflow. |

Claims from the video are treated as practitioner observations unless supported
by primary documentation or repository evidence below. Reported token savings
were not accepted as project evidence.

## Verified GPT-5.6 Sources

Accessed: 2026-07-16

### GPT-5.6 launch

URL: https://openai.com/index/gpt-5-6/

Verified points:

- GPT-5.6 supports Programmatic Tool Calling.
- Programmatic Tool Calling can coordinate tools, process intermediate results,
  monitor progress, and reduce model round trips.
- `ultra` coordinates parallel agents and trades higher token use for stronger
  results and lower wall-clock time on suitable tasks.
- The launch material attributes improved design outcomes partly to inspecting
  and refining the rendered result.
- Reference formats and existing design systems are emphasized for repeatable
  visual work.

Caveats:

- Vendor benchmarks do not establish results for this repository.
- Launch claims do not establish the best Pi prompt or reviewer count.
- More agents and higher reasoning are not automatically better for every task.

### GPT-5.6 model guidance and migration guide

URL: https://developers.openai.com/api/docs/guides/latest-model

Verified points:

- Preserve the current reasoning level as a migration baseline, then test the
  same level and one level lower.
- Provide domain context, hard constraints, approval boundaries, success
  criteria, and an ambiguity policy.
- Do not prescribe every step when the model can infer intent from context.
- Benchmark task success, answer completeness, required evidence, tokens,
  latency, and cost.
- Use prompt and tool simplification as measured changes, not assumptions.

### Leaner prompt guidance

URL: https://developers.openai.com/api/docs/guides/latest-model#favor-leaner-prompts

Verified points:

- State each instruction once.
- Expose only tools relevant to the task.
- Keep tool descriptions concise and precise.
- Remove one instruction, example group, or tool group at a time.
- Rerun the same representative evaluations after each simplification.
- Long sessions amplify repeated prompt and tool content.

The guide reports directional internal improvements from leaner prompts. Those
numbers must not be copied into Pi expectations without local evaluation.

### Programmatic Tool Calling

URL: https://developers.openai.com/api/docs/guides/tools-programmatic-tool-calling

Verified task boundary:

| Task shape | Recommended treatment |
| --- | --- |
| One lookup or action | Direct tool call |
| Filtering, joining, ranking, deduplication, aggregation, or validation | Programmatic stage when it can return a smaller structured result |
| Predictable dependent calls | Programmatic stage with explicit limits and failure behavior |
| Adaptive search or semantic evaluation | Direct model/tool loop |
| Approval-sensitive writes | Direct call with visible authorization boundary |
| Final citation or native artifact validation | Direct validation unless native evidence is preserved |

The official orchestration prompt shape includes:

- bounded stage
- eligible tools
- safe parallelism rule
- documented input and output fields
- exact result shape
- required evidence
- stop condition
- retry limit
- no repeated completed work
- structured failure
- direct-call boundary for judgment, approval, and final validation

This strongly supports generating a stage contract instead of adding vague
instructions such as "use workflows efficiently."

### Multi-agent beta

URL: https://developers.openai.com/api/docs/guides/responses-multi-agent

Verified points:

- Multi-agent work is best for independent, bounded workstreams.
- Separate context can reduce interference between unrelated work.
- More agents can increase token use.
- A single agent is preferred for ordered reasoning, small tasks, shared mutable
  state, and fixed deterministic execution graphs.
- The service exposes concurrency control but no fixed total-agent or tree-depth
  limit.

Pi implication:

- Keep Pi's direct-work default.
- Keep worker contexts bounded.
- Enforce Pi-specific concurrency, depth, retry, and mutation rules rather than
  inheriting unbounded provider behavior.

### Model catalog pages

URLs:

- https://developers.openai.com/api/docs/models/gpt-5.6-sol
- https://developers.openai.com/api/docs/models/gpt-5.6-luna

Searched for:

- supported tools
- structured output support
- reasoning modes
- model aliases
- context and pricing boundaries
- workload positioning

These pages are useful for model routing and capability checks. They do not
establish workflow quality by themselves.

### API changelog

URL: https://developers.openai.com/api/docs/changelog

Searched for:

- additional GPT-5.6 workflow guidance
- prompting changes after launch
- multi-agent changes
- Programmatic Tool Calling changes

No separate GPT-5.6 prompting change beyond the launch and current guidance was
identified during this pass.

## Verified Repository Sources

Accessed: 2026-07-16

Popularity counts are volatile and were not used as primary evidence. Source
quality here comes from inspectable code, tests, active maintenance, and direct
relevance.

### Pi settled lifecycle event

URL: https://github.com/earendil-works/pi/commit/e9fa5a68a1967f42a90a1c07f512bc8af63517a9

Observed pattern:

- Distinguishes low-level agent completion from a fully settled session.
- Adds `agent_settled`, `isIdle`, and `waitForIdle()`.
- Includes post-run retries and continuations in the settled boundary.

Pi workflow implication:

A workflow should not declare success merely because the first model run ended.
Terminal checks should occur after retries, compaction follow-ups, queued work,
and required artifacts have settled.

### Codex artifact validation

URL: https://github.com/openai/codex/commit/52c9605dc707f62100157c5869e958268e3a5d15

Observed pattern:

- A clean workspace is not treated as sufficient success.
- Required memory artifacts are validated.
- Missing artifacts produce retry or failure behavior.
- Regression tests cover the missing-artifact case.

Pi workflow implication:

Subprocess success, a clean diff, or reviewer completion is insufficient. The
runtime must validate required plan, review, synthesis, evidence, and archive
artifacts before accepting a terminal state.

### Codex multi-agent configuration

URL: https://github.com/openai/codex/commit/03bb3b12367397e14a8facc2e018d645ff4d8e83

Observed pattern:

- Multi-agent settings are centralized under one canonical configuration area.
- Concurrency naming is explicit.
- Legacy names are normalized through compatibility aliases.

Pi workflow implication:

If more orchestration limits become configurable, keep one canonical settings
owner and normalize old names rather than creating competing configuration
surfaces.

### Agentic trajectory evaluators

URL: https://github.com/pydantic/pydantic-ai/commit/4104cccc061b807bb5ce9b1d051eb3b3acecc3cb

Observed pattern:

- Evaluates tool coverage, trajectory order, arguments, tool-call budgets, and
  model-request budgets.
- Uses deterministic trace evaluation rather than another model call.
- Includes nested worker calls in execution-budget accounting.

Pi workflow implication:

Evaluate whether the expected workflow occurred, not only whether the final
answer sounds correct. Candidate checks include expected command sequence,
validation order, artifact writes, retry count, model requests, and terminal
state.

### Bounded nested agents

URL: https://github.com/mastra-ai/mastra/commit/dab1257b64e4ed576dc5038bb7a3f7072338bc9f

Observed pattern:

- Filesystem-defined nested workers are allowed only to a fixed depth.
- Deeper workers are ignored with a warning.
- The depth bound also protects against cyclic structures.

Pi workflow implication:

Pi's worker/lead tool allowlists already prevent arbitrary nesting in common
paths. Any future nested workflow support should retain a deterministic depth
cap and global concurrency budget.

### Additional GitHub surfaces searched

Repositories and areas inspected for distinct patterns:

- `earendil-works/pi`
- `openai/codex`
- `openai/openai-agents-python`
- `microsoft/agent-framework`
- `pydantic/pydantic-ai`
- `run-llama/llama_index`
- `mastra-ai/mastra`
- `crewAIInc/crewAI`
- `langchain-ai/langgraph`
- `huggingface/smolagents`

Patterns searched:

- code-defined workflow stages
- bounded worker trees
- concurrency limits
- typed worker output
- artifact handoff validation
- resumable workflow snapshots
- human-input transitions
- settled terminal events
- trajectory evaluation
- retry and request budgets
- July 2026 GPT-5.6 configuration changes

Additional candidate patterns found but not yet independently promoted to design
requirements:

- durable named subworkflows
- workflow-level preservation of worker output schemas
- pruning persisted snapshots to retain only resume-critical state
- typed interception hooks with explicit abort semantics
- hosted multi-agent execution as an alternative provider boundary

These require source-level review before they influence an implementation plan.

## Frontend and Product-Design Sources

### Browser automation and evidence

Agent Browser:
https://github.com/vercel-labs/agent-browser

Relevant capabilities verified:

- accessibility-tree snapshots
- semantic role, label, and text interactions
- screenshots
- fresh snapshots after overlays or DOM changes
- browser flow execution

### Playwright screenshot comparison

URL: https://playwright.dev/docs/test-snapshots

Relevant use:

- controlled screenshot baselines
- fixed routes, states, viewports, data, and browser environment
- visual-regression evidence

Caveat:

Pixel differences can be caused by fonts, rendering engines, animation, timing,
and host differences. Pair screenshots with semantic and functional assertions.

### Lighthouse CI

URL: https://github.com/GoogleChrome/lighthouse-ci

Relevant use:

- repeatable performance and accessibility budgets
- stored reports and CI gates

Caveat:

A score is a proxy, not proof of product usability or accessibility. Do not add
Lighthouse setup to every frontend task by default.

### Design conclusion

The source-backed design workflow is:

```text
project context
-> unresolved design decision, if any
-> implementation
-> rendered browser inspection
-> semantic and keyboard checks
-> screenshot and metric regression where supported
```

No strong source found during this pass established a universal font, palette,
border-radius, card, animation, or layout rule for GPT-5.6.

## Community Discussion Search

Search window intended: 2026-07-01 through the current date, 2026-07-16.

An initial worker prompt mistakenly used 2026-07-23 as the upper bound. Because
that date is in the future, no date or availability claim after 2026-07-16 is
accepted in this notebook.

Surfaces searched:

- Hacker News
- Reddit
- technical blogs and newsletters
- public social posts
- video transcripts
- Codex GitHub issues and discussions
- OpenAI announcement and documentation pages

Representative queries:

```text
"GPT-5.6" "Hacker News"
"GPT-5.6" "Reddit"
"GPT-5.6" "Codex"
"GPT-5.6" "system prompt"
"GPT-5.6" "subagents"
"GPT-5.6" workflow orchestration
"GPT-5.6" frontend prompting
"GPT-5.6" programmatic tool calling
"GPT-5.6" multi-agent
Codex harness system prompt July 2026
GPT-5.6 prompting guide July 2026
```

Result:

No independently verifiable community source met all of these requirements:

- published by 2026-07-16
- direct URL and date
- concrete technical claim
- reproducible prompt, code, trace, or experiment
- observable regard signal
- evidence distinguishable from opinion or launch-summary repetition

Low-confidence candidates encountered:

- launch-summary blogs without reproducible evidence
- reports of a Reddit discussion without a direct thread or comment IDs
- undated posts that repeated official launch claims
- articles with no observable engagement or independent citation trail

These were not used as decision evidence. Future videos can still be useful as
hypothesis sources, but their claims should be checked against primary sources,
repository behavior, or local evaluation.

## Other Lifecycle Sources Searched

These were used as architecture comparisons, not as direct implementation
requirements.

### GitHub Spec Kit

URL: https://github.com/github/spec-kit/blob/main/README.md

Lifecycle compared:

```text
constitution -> specify -> plan -> tasks -> implement
```

Useful idea:

Separate requirements, technical planning, task breakdown, and implementation
while keeping artifacts explicit.

### Temporal workflows

URL: https://docs.temporal.io/workflows

Useful ideas:

- workflow definition versus workflow execution
- durable event history
- replayable state transitions
- explicit terminal state

Pi difference:

Pi currently relies on prompt-owned state and plan artifacts for much of the
lifecycle. Runtime telemetry records command dispatch but not the complete event
history.

### Airflow task lifecycle

URL: https://airflow.apache.org/docs/apache-airflow/stable/core-concepts/tasks.html

Useful ideas:

- explicit dependency graph
- scheduler-enforced task states
- retry and wait states
- terminal success and failure

Pi difference:

Pi's checklist and waves express comparable concepts, but the executor interprets
many transitions from prompt instructions rather than a runtime scheduler.

### GitHub Actions workflow syntax

URL: https://docs.github.com/en/actions/writing-workflows/workflow-syntax-for-github-actions

Useful ideas:

- workflow run, job, and step separation
- declarative dependencies
- evidence attached to a run
- explicit triggers and status

## Local Pi Surfaces Inspected

### Global orchestration policy

`pi/PI-INSTRUCTIONS.md`

Relevant current rules:

- direct work by default
- delegation only for independent or specialized work
- file-only discovery followed by synthesis for broad research
- every assignment states deliverable, scope, allowed changes, evidence, and stop
  condition
- parent verifies critical evidence
- no polling of task actions

Current assessment:

These rules already align with GPT-5.6 multi-agent guidance. The main missing
fields for generated stage contracts are explicit dependency inputs, output
schema or artifact, failure behavior, and terminal predicate.

### Subagent runtime

`pi/extensions/subagent/index.ts`

Relevant behavior:

- isolated child Pi process
- no child session reuse
- child skill discovery disabled, then explicitly selected skills loaded
- single, parallel, and chain modes
- file-only output artifacts
- concurrency limit
- chain stops on worker error
- metrics and task registry integration

Current assessment:

The primitive is capable enough for ad hoc delegation. Repeated workflow control
should not be rebuilt as more generic subagent features unless production
evidence requires it.

### Typed semantic stages

`pi/lib/typed-agent.ts`
`pi/skills/typed-agent-workflows/SKILL.md`

Relevant behavior:

- input schema validation
- output schema validation
- isolated in-memory session
- no tools by default
- bounded output correction retry
- cancellation and timeout support
- caller-owned deterministic policy after semantic output

Current assessment:

This is the correct primitive for narrow plan classification, finding
normalization, evidence sufficiency, and workflow-friction judgment. It should
not become the workflow scheduler.

### `/goal`

`pi/extensions/goal.ts`
`pi/tests/goal.test.ts`

Relevant behavior:

- inline objective or workspace text file
- active state stored in session entries
- restoration from the current session branch
- compact per-turn reminders
- explicit `goal_complete` closeout
- file containment, type, size, and binary checks

Observed gaps:

- no plan path
- no lifecycle ID
- no review or execution reference
- no terminal evidence linkage
- no explicit transfer into the new session created by `/do-it <plan>`
- `goal_complete` trusts the supplied closeout rather than checking linked
  workflow state

### Workflow command dispatch

`pi/extensions/workflow-commands.ts`
`pi/tests/workflow-dispatch.test.ts`

Relevant behavior:

- `/plan-it`, `/review-it`, and `/do-it` are TypeScript-registered commands
- each command loads a workflow skill and sends it as a hidden follow-up prompt
- each command starts a separate workflow episode
- `/do-it <plan>` opens a new session before sending its workflow prompt

Observed gaps:

- separate episodes are not linked by a shared lifecycle ID
- TypeScript does not enforce prompt state transitions
- goal state is not explicitly propagated into the new execution session
- focused tests verify dispatch, not the complete lifecycle

### `/plan-it`

`pi/skills/workflow/plan-it.md`
`pi/skills/workflow/templates/plan-template.md`

Relevant behavior:

- conversation and repository inspection
- optional clarification
- executable MVP definition
- task files, dependencies, model, agent, verification, and mutation boundaries
- execution waves and validator gates
- durable checklist
- self-validation before writing

Potential refinement areas:

- avoid duplicating policy already enforced globally or by runtime
- emit a stable plan profile and lifecycle identity
- separate deterministic contract checks from semantic plan judgment
- retain the plan as the durable human-readable execution ledger

### `/review-it`

`pi/skills/workflow/review-it.md`
`pi/skills/workflow/templates/review-it-reviewer-prompts.md`
`pi/skills/workflow/templates/review-synthesis-template.md`

Relevant behavior:

- three standard reviewers plus at least three domain reviewers
- one independent parallel panel call
- artifact-backed findings
- targeted recovery for failed reviewers
- optional rebuttal only for outcome-changing disagreement
- direct verification of high-severity findings
- synthesis and plan edits
- material-change review
- deterministic pre-readiness audit
- final standalone-readiness reviewer

Potential refinement areas:

- prompt state machine is large and mechanically complex
- reviewer count is fixed before local yield data is available
- several transitions and retry budgets could eventually be runtime-enforced
- artifact verification and terminal readiness should be deterministic
- do not change panel policy until yield and execution outcome can be measured

### `/do-it`

`pi/skills/workflow/do-it.md`
`pi/skills/workflow/templates/do-it-report-template.md`

Relevant behavior:

- raw-task routing or plan-file execution
- resume from first dependency-ready unchecked item
- wave-by-wave execution
- validation after each wave
- repair and incident transitions
- manual and deployment gates
- final validation
- archive preflight and archive
- post-run workflow evaluation

Potential refinement areas:

- runtime does not yet own detailed phase events
- terminal state depends heavily on prompt compliance
- plan, review, validation, archive, and goal closeout are not one correlated
  lifecycle
- trajectory and resource-budget checks are not yet first-class workflow evals

### Workflow telemetry

`pi/docs/workflow-eval-telemetry.md`
`pi/docs/workflow-eval-operations.md`
`pi/lib/workflow-telemetry.ts`
`pi/docs/orchestration-telemetry.md`

Relevant existing model:

```text
workflow episode
  -> phase
    -> event
```

Current runtime limitation:

- dispatch episodes and dispatch events exist
- detailed task, validation, repair, manual-gate, archive, and terminal events
  remain prompt-recorded or follow-up scope

Important planned evaluation records already documented:

- plan profile
- review panel decision
- review yield
- execution outcome
- panel quality label

## Current Candidate Refinement Sequence

This is a discussion sequence, not an approved implementation plan.

### Candidate 1: Lifecycle identity without behavior change

- Create one lifecycle identity spanning goal, plan, review, and execution.
- Link command episodes to that lifecycle.
- Record optional goal ID, plan path, review path, and execution episode.
- Propagate the objective and lifecycle references across `/do-it`'s new-session
  boundary.

Evidence to require:

- no timestamp-based correlation
- no regression in standalone command use
- raw `/do-it` remains valid without a plan or goal
- session replacement retains only intended objective metadata

### Candidate 2: Deterministic artifact and terminal validation

- Validate required plan and review artifacts before success.
- Use the settled runtime boundary before terminal checks.
- Emit explicit blocked, failed, incomplete, and completed terminal states.
- Keep semantic quality decisions outside deterministic validators.

Evidence to require:

- missing artifacts cannot produce success
- failed validation cannot produce archive success
- queued follow-up work cannot race terminal reporting
- retry limits remain bounded

### Candidate 3: Detailed workflow telemetry

- Emit phase and event records from runtime-owned transitions.
- Link orchestration runs to workflow phases through explicit IDs.
- Preserve non-secret evidence summaries and artifact references.
- Keep JSONL as runtime source and analysis stores rebuildable.

Evidence to require:

- event completeness against checklist and validation contract
- redaction and path safety
- no raw sensitive logs
- no timestamp inference for joins

### Candidate 4: Prompt deduplication

- Inventory duplicated instructions across global policy, agents, skills, tools,
  and templates.
- Remove one group at a time.
- Run identical representative workflows before and after each change.
- Preserve requirements that correct a measured failure.

Measurements:

- task success
- plan completeness
- review yield
- execution readiness
- validation evidence
- terminal correctness
- tokens
- cost
- duration
- retries
- context peak

### Candidate 5: Bounded semantic evaluators

Candidate typed stages:

- plan profile classification
- plan contract judgment after deterministic checks
- review finding normalization
- evidence sufficiency judgment
- post-run friction classification

Do not use typed stages for:

- lifecycle control
- file mutation
- deployment
- destructive actions
- validation command execution
- approval decisions owned by the operator

### Candidate 6: Adaptive review experiment

Only after panel-yield telemetry exists:

- compare fixed panel against risk and complexity profiles
- identify reviewers with unique applied findings
- detect duplicate and low-value reviewer roles
- determine when a small panel misses execution-blocking defects
- determine whether planning can embed a bounded review stage

Do not optimize solely for fewer tokens. Preserve or improve execution readiness
and defect detection.

### Candidate 7: UX skill refinement

- make pipeline activation conditional on full product-design work
- preserve existing design systems by default
- remove universal visual bans and defaults
- separate objective accessibility requirements from project-specific tooling
- require browser validation for user-facing changes
- use screenshots and metric gates only when supported or explicitly planned

## Evaluation Cases To Build Before Prompt Changes

Representative cases should include:

1. One-file mechanical change that should not delegate.
2. Medium cross-file implementation using one specialist.
3. Broad read-only research with file-only discovery and synthesis.
4. Plan with independent frontend and backend work.
5. Plan with strict serial dependency.
6. Review with one missing reviewer artifact.
7. Review with conflicting high-severity findings.
8. Review whose accepted fix materially changes task structure.
9. Execution with a focused validation failure that is repaired.
10. Execution with a real blocker and durable resume state.
11. Completed execution requiring archive.
12. Goal that creates a plan and later resumes execution in a new session.
13. Goal with raw direct implementation and no plan.
14. UI change with an established design system.
15. Greenfield UI with unresolved visual direction.
16. UI change where no dev server is running.

For each case capture:

- expected command and tool trajectory
- expected artifact set
- expected lifecycle and phase events
- expected delegation topology
- allowed mutation boundary
- retry and request budget
- validation evidence
- terminal state
- token, duration, and cost observations

## Ideas Not Currently Supported

Do not adopt these without new evidence:

- replacing all four commands with `/goal`
- making `/goal` a second workflow scheduler
- always using multi-agent mode for complex tasks
- allowing unbounded nested workers
- copying the complete parent context into every worker
- passing full raw worker output through every stage
- reducing `/review-it` solely because it is long
- keeping six reviewers solely because more review feels safer
- treating model self-assessment as artifact validation
- treating subprocess exit zero as workflow success
- treating a clean working tree as workflow success
- universal frontend palettes, fonts, radii, card rules, or animation rules
- automatic screenshot baseline updates
- mandatory Lighthouse setup for every UI repository
- using vendor benchmark percentages as local expected improvements

## Open Questions

### Lifecycle

1. Which component owns the shared lifecycle ID?
2. Is a lifecycle created by `/goal`, `/plan-it`, or whichever command starts
   first?
3. How should standalone `/review-it` and `/do-it` attach to an existing plan
   lifecycle?
4. Should goal state reference one active plan or a history of linked artifacts?
5. What exact metadata crosses `/do-it`'s new-session boundary?
6. What terminal evidence may `goal_complete` verify without becoming a second
   scheduler?
7. How are abandoned or superseded plans represented?

### Review

1. Which existing telemetry fields are already emitted rather than documented
   only?
2. How many completed reviewed executions are needed before panel sizing can be
   evaluated?
3. What qualifies as a reviewer contribution: unique finding, applied finding,
   readiness change, or prevented execution failure?
4. How should a reviewer that finds nothing useful be distinguished from a
   reviewer that correctly confirms a safe plan?
5. When should review remain an explicit operator command?
6. When could planning embed a bounded review stage without surprising the
   operator?

### Typed stages and runtime

1. Which current Pi provider paths support GPT-5.6 Programmatic Tool Calling or
   provider-hosted multi-agent mode?
2. Should Pi use provider-hosted orchestration at all, given its existing local
   worker runtime and inspectable artifacts?
3. Which deterministic validators should run before a semantic stage?
4. Which schemas are stable enough to become runtime contracts?
5. How should typed-stage usage and correction retries appear in telemetry?

### Design

1. Which UX rules are true product requirements versus imported preferences?
2. Which repositories already have browser, accessibility, screenshot, or
   Lighthouse tooling?
3. Should visual direction selection be a planning-stage decision or a direct
   implementation-stage question?
4. What browser evidence is sufficient for small UI changes?
5. How should cross-platform screenshot variance be represented?

## Future Video Intake Template

Add each new video under this section before changing conclusions.

```markdown
### Video: <title>

URL: <url>
Date reviewed: YYYY-MM-DD
Transcript source: <menos content ID, local cache, or direct source>

#### Relevant sections

| Timestamp | Claim or technique | Evidence type | Pi relevance |
| --- | --- | --- | --- |
| 00:00 | | practitioner observation / demo / primary source citation | |

#### Claims to validate

- <claim>

#### Sources cited by the video

- <url>

#### Local hypotheses

- <testable hypothesis>

#### Effect on current conclusions

- confirms / weakens / changes / no effect
```

## Source Validation Checklist

Before promoting a new claim into an implementation plan:

- [ ] Direct source URL is recorded.
- [ ] Publication or observation date is not in the future.
- [ ] Source type is identified.
- [ ] Primary source was preferred where available.
- [ ] Exact code, prompt, trace, or quoted claim was inspected.
- [ ] Popularity or regard signal is independently observable when claimed.
- [ ] Model-specific evidence is separated from general practice.
- [ ] Vendor-reported metrics are labeled as vendor-reported.
- [ ] Local relevance is explained.
- [ ] A falsifying local evaluation is possible.
- [ ] Contradictory evidence is recorded.
- [ ] Recommendation does not depend on a temporary scratch artifact.

## Research Artifacts

The discovery workers and synthesis worker wrote scratch reports under the
operating system temporary directory. Those paths are not durable and are not
used as canonical evidence. This notebook preserves the direct sources,
search coverage, local paths, conclusions, and caveats needed to reproduce the
research.

The direct source URLs and local repository paths in this notebook are the
starting points for future validation.
