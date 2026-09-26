# Intent-led learning, evaluation, and routing

Recorded September 26, 2026. Design discussion and research for the [Advocate plan](plan.md), not active instructions or execution authorization.

## Operator direction

Mike clarified four points after the comparison with other memory systems:

1. Diagnosing instruction failures and evaluating a proposed rewrite belongs in the generalized `prompting` skill, applied by writer. It should not become an Advocate-only evaluator or another specialist role by default.
2. Prompt versioning is insufficient. Preserve the user's intent behind an instruction and evaluate whether actual system output improves relative to that intent.
3. Bounded practical comparisons are useful both for testing instruction changes and for developing model-routing rules of thumb from the available inputs. Bayesian updating is a promising way to think about uncertain routing knowledge, not authorization to build an automatic router.
4. Concurrent knowledge writers are a deferred, non-blocking concern. This is a personal experiment, overlapping writers are unlikely in the current workflow, and Mike does not want a complex coordination system for a need not yet demonstrated. Ordinary file/Git/worktree mechanisms can address an actual collision if needed. Do not make a concurrency design or test program a prerequisite.

The following procedure is the proposed practical expression of that direction. Documentation does not authorize installing it, running experiments against live services, changing role permissions, or committing/pushing.

## Ownership

| Owner | Responsibility |
| --- | --- |
| `prompting` | General instruction diagnosis, preserving intent, designing a useful comparison, and interpreting results. Keep detail in an on-demand reference rather than expanding global instructions. |
| Writer | Performs the assigned investigation, comparison, and permitted prose maintenance using the applicable skills. Evaluation is part of its reasoning, not merely transcription. |
| `agent-process` | Recognizes the existing feedback triggers, commissions background work, and owns feedback evidence and curated learning references. It links to the prompting procedure instead of duplicating it. |
| Advocate | Reads the shared knowledge and advises on the current approach. It does not approve maintenance or start learning merely by being consulted. |
| Strategist | Uses supported routing lessons when selecting models and sizing assignments. New observations do not automatically rewrite model defaults or permissions. |
| Orchestrator | Owns immediate task correction, assignment context, consequential user questions, and approval boundaries. |

No separate Reflector, Curator, evaluator service, or prompt-writer role is proposed. One worker may reason through diagnosis, candidate change, and comparison without conflating those activities. A separate judgment call is useful only when the particular comparison warrants it, not as a mandatory review stage.

## What needs to persist

Retain the existing three-layer structure under `agent-process`: feedback evidence, curated knowledge, and separately governed instructions. Intent and evaluation evidence connect those layers; they do not require a fourth database or registry.

### Intent survives wording changes

For an instruction being investigated, preserve the intended behavior, why it matters, its applicability, important opposing requirements, and the operator/source decision behind it. Use an existing owning reference or feedback record when sufficient. Do not create a mandatory record for every sentence or copy the same rationale into every role.

Example:

> Reduce unnecessary operator questions while still surfacing unresolved choices that materially change the requested outcome.

This is more useful than retaining only successive versions of “ask fewer questions.” It exposes the risk of an apparent improvement that merely replaces questions with unsupported guesses.

If Mike changes the goal, update the intent with its source and chronology. Do not silently move the success criterion to make a candidate look better, or describe adherence to a deliberately changed requirement as a regression.

### Evidence explains what was observed

A useful evaluation note identifies the intent/case, compared configurations, observed behavior, result, and limitations. Preserve only details needed to interpret or repeat the comparison: relevant input and environment, instruction/knowledge revision, actual model/provider/effort, and native run/source pointers. Git revision alone may not identify uncommitted prompt changes; retain the relevant candidate text or another unambiguous local reference when needed. Do not copy historical transcript corpora or create new telemetry merely to fill fields.

Separate operator judgment, verified task outcome, assistant report, and model-judge inference. Repeated reports of the same run are not independent observations. A successful save, a better recommendation, and sustained workflow improvement are different claims.

Use existing feedback records for concise investigation results. Put longer task-specific comparisons beside their owning experiment/spec and link them. Curated knowledge retains the practical conclusion and its limits, not the entire trial diary.

### Knowledge carries the current useful conclusion

Update the relevant passage locally. Preserve its reason, applicability, and meaningful counterexample while consolidating. Whole-file rewriting and excessive abstraction can erase the very distinction that makes a lesson useful. Revise, merge, qualify, or remove misleading advice rather than accumulating every historical formulation as current policy.

Instruction and permission changes still require approval. A successful evaluation supplies evidence for that decision; it does not grant authority to install the candidate.

## Proposed flexible evaluation loop

Use this when an instruction or model-fit question could benefit from observation. It is not a fixed sequence required before every obvious correction.

### 1. Establish the intent and the decision being made

Recover the current requirement and why it exists. State what comparison could change the next action. Prefer a concrete question such as “does this wording avoid needless questions without hiding consequential uncertainty?” over “is this a better prompt?”

### 2. Select revealing cases

Start with relevant real examples. Include an opposing or boundary case when that is necessary to distinguish success from an easy shortcut. For the example above, compare routine implementation judgment, consequential unresolved ambiguity, and a clear comparable precedent that settles the choice.

When testing generalization, include an example beyond the incident used to construct the change. Do not give the acting agent the evaluator's expected answer or a historical resolution that would not have been available at the decision point. Use known resolutions to judge the result, not to leak the answer into the trial.

There is no universal sample count, mandatory taxonomy, or requirement to recreate every past failure. Select enough to answer the current question; report when the available cases do not support a broader conclusion.

### 3. Diagnose before choosing the intervention

Inspect what the agent actually received and did, including the assembled instructions when relevant. Consider missing or incorrect knowledge, retrieval failure, misapplication, incomplete assignment context, unavailable tools, task size, and model capability. These are reasoning possibilities, not required labels.

A prompt rewrite is one possible intervention. Correcting input transmission or making existing knowledge findable may be the better remedy. Judge system usefulness even when the defect was not the model's fault, but do not count an environment failure as proof of model incapability.

### 4. Compare the current approach with a targeted candidate

Use comparable inputs and starting conditions. Hold the model fixed when investigating a prompt change, and hold the relevant instructions/context fixed when comparing models, where practical. If several things change together, describe the observed system improvement without claiming which change caused it.

Evaluate the actual role/harness composition, not a bare-model approximation presented as equivalent. Keep repeated trials from inheriting previous answers or mutated test state. Use disposable local artifacts for write-path checks; historical task authority is not permission to replay live mutations.

Select observations tied to the intent. Possible measures include requested work completed, substantive correction needed, unnecessary questions, missed consequential questions, elapsed time, and cost. Do not force them into one weighted score. Fewer turns or tokens is not improvement if functionality or appropriate uncertainty handling is lost.

Use executable checks when they establish the intended outcome. For judgment-heavy behavior, compare outputs against Mike's demonstrated decisions and explain the differences. Hide candidate labels or swap presentation order when practical if a model is judging two outputs. Check disputed judgments against source evidence; the writer's favorable opinion of its own revision is not proof. Do not require Mike to label a new dataset or approve every evaluation result.

### 5. Interpret, retain, or revise

A useful result may be improvement, no meaningful difference, a tradeoff, a regression, or insufficient evidence. These are ordinary descriptions, not required status codes. Inspect traces when an apparent failure may instead be a bad case or an unsuitable check. Do not optimize for obsolete assertions or demand a particular valid implementation path.

Repeat or expand only when another observation could change the decision. One clean trial can demonstrate a mechanism; it cannot establish reliable behavior across tasks. A comparison does not have to produce a winning rewrite to be useful. Retain the existing approach when that is the supported conclusion.

Record the result and refine the relevant knowledge or propose an instruction change within the existing approval boundary. Later comparable work can strengthen or revise the conclusion without a scheduled monitoring program.

## Initial Advocate exercise

Use one bounded, agent-owned exercise after the implementation is available, with disposable knowledge rather than edits to the live learning store:

1. Select a recorded correction with clear intent and a meaningful contrasting case.
2. Give the learning worker the relevant feedback and prior knowledge state; verify its actual permitted edits and concise explanation, not just a claim that it learned.
3. Compare fresh Advocate consultations using the before/after knowledge on the same relevant cases. Keep the consultation input free of the expected historical answer.
4. Record what changed in the advice, whether the contrast survived, actual model/configuration, and verification limits.

This exercises feedback interpretation, persistence, retrieval, and advice together. Fix demonstrated task-related wiring defects. An inconclusive quality comparison is an honest experimental result, not a reason to keep generating candidates until something wins. This is not a new permanent evaluation harness, cross-model benchmark, or operator acceptance gate.

## Routing lessons and Bayesian interpretation

The useful question is conditional:

> How likely is an acceptable outcome for this model on this kind of assignment with these available inputs and instructions?

Treat existing routing expectations as starting beliefs, then revise them with relevant evidence. Preserve the conditions that matter: settled versus unresolved requirements, interacting interfaces, context burden, tools, assignment size, and actual model version/effort. Avoid a universal ranking inferred from a mixture of unrelated jobs.

Ordinary execution reveals the chosen model's outcome, not the result of models never tried. A stronger model succeeding after receiving a repaired assignment and the first worker's findings does not isolate the model effect. Keep those runs useful as system evidence while labeling the comparison's limit.

Begin with evidence-backed rules of thumb and explicit uncertainty. If enough genuinely comparable binary outcomes accumulate, a simple Bayesian success estimate could be useful. Choosing the outcome definition, comparison population, and prior would be part of that later analysis. Do not invent calibrated probabilities from a few heterogeneous anecdotes, treat model-predicted outcomes as observed trials, or require formal statistics to record a clear lesson.

Record supported routing conclusions in the same curated knowledge with links to their evidence. Make them discoverable to Strategist through the knowledge-reader path. Keep model defaults, hard routing restrictions, and permissions separately governed. No automatic contextual-bandit router, random live exploration, mandatory cross-model sweep, or new metrics pipeline is proposed.

## Concurrency decision

No work is currently justified on a dedicated writer-coordination mechanism. Preserve unrelated edits using ordinary file operations. If a real collision occurs, inspect the current content and reconcile the specific changes with available Git/worktree tools or parent coordination. Do not silently overwrite another writer, but do not add locks, queues, a separate repository, or a worktree-per-learning-update requirement speculatively. This deferral does not change the normal implementation worktree/closeout contract.

## Research basis and limits

Sources consulted September 26, 2026. Product docs are living pages, not frozen release snapshots. The research is a targeted architectural review, not a systematic literature review or local reproduction of published results. Long pages were read in relevant bounded excerpts; the GEPA full-paper HTML fetch timed out, so its abstract and official implementation documentation support the description below.

| Source | Relevant mechanism or evidence | Application here |
| --- | --- | --- |
| [GEPA paper, February 2026 revision](https://arxiv.org/abs/2507.19457) and [official implementation](https://github.com/gepa-ai/gepa) | Reflects on execution traces and tests targeted candidate changes; retains alternatives that excel on different cases. | Borrow diagnosis, comparison, and explicit tradeoffs, not an evolutionary optimizer, candidate pool, or mandatory scalar score. |
| [Anthropic, Demystifying evals for AI agents, January 2026](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents) | Distinguishes transcript from outcome; evaluates the agent harness plus model; recommends balanced cases and checking grader validity. | Evaluate intended behavior, preserve opposing cases, and avoid rigid wording/tool-sequence checks. |
| [Hamel Husain and Shreya Shankar, AI Evals FAQ](https://hamel.dev/blog/posts/evals-faq/) and [selective evaluator investment](https://hamel.dev/blog/posts/evals-faq/should-i-build-automated-evaluators-for-every-failure-mode-i-find.html) | Starts with examination of real outputs and reserves expensive evaluators for repeated needs. | Use existing evidence and modest comparisons. Their suggested sample counts, annotation workload, and maintenance cadence are not requirements for this personal experiment. |
| [RouteLLM, February 2025 revision](https://arxiv.org/abs/2406.18665) | Learns routing from preference data under quality/cost tradeoffs. | Supports task-conditioned routing rather than a single model ranking; does not prove a particular Pi staffing choice. |
| [Learning to Route LLMs from Bandit Feedback, October 2025](https://arxiv.org/abs/2510.07429) | Models routing with prompt context, tradeoff preferences, and feedback only for the selected model. | Preserve the missing counterfactual instead of treating ordinary logs as complete model comparisons. No adoption of its learned policy is proposed. |
| [Correlation-Aware Contextual Bandits with Surrogate Rewards, July 2026](https://arxiv.org/abs/2607.09015) | Separates observed feedback from potentially misspecified predicted rewards and studies combining them. | Keep model judgments and predicted alternative outcomes distinct from observed evidence. Published regret/results do not establish our local reliability. |
| [ACE, March 2026 revision](https://arxiv.org/abs/2510.04618) | Studies loss of useful detail through monolithic context rewriting and uses incremental curation. | Preserve reasons and exceptions through localized knowledge edits; no new Reflector/Curator roles or helpfulness counters. |
| [Honcho architecture](https://honcho.dev/docs/v3/documentation/core-concepts/architecture) | Separates background conclusion formation from query-time reasoning over conclusions and source messages. | Supports the learning-worker/Advocate split, without its services or exhaustive ingestion. |
| [Letta Context Repositories, February 2026](https://www.letta.com/blog/context-repositories/) | Uses files, progressive disclosure, Git, and worktrees for memory. | Supports Markdown and ordinary tools. Its concurrent-worktree machinery is not a current requirement here. |
| [Hermes persistent memory](https://hermes-agent.nousresearch.com/docs/user-guide/features/memory) | Distinguishes persisted writes from claims, frozen context from current files, and documents shared-writer limitations. | Check actual writes and fresh reads. Do not import universal approval queues, automatic reviews, or memory quotas. |
| [Hindsight overview](https://hindsight.vectorize.io/) | Separates source facts and consolidated observations, with freshness checks against underlying facts. | New direct intent must remain authoritative over an older curated interpretation. |
| [Mem0 Dream](https://docs.mem0.ai/platform/features/dream) | Distinguishes merge, supersede, and synthesis with source links. | Learning may revise, consolidate, or replace advice rather than only append. No lifecycle database or scheduled synthesis is needed. |

No cited benchmark establishes improved advice or optimal model routing in this Pi workflow. The initial exercise supplies local evidence; later relevant outcomes can refine it.
