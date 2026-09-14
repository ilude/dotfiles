---
status: research-note
surveyed: 2026-09-13
source:
  - https://arxiv.org/abs/2602.11988v2
  - https://arxiv.org/abs/2507.19457v2
  - https://arxiv.org/abs/2510.04618v3
  - https://arxiv.org/abs/2310.01798v2
---

# Academic evidence for selective verification and instruction evolution

## Why this matters

Companion evidence for the [September 2026 survey](agent-improvement-survey-2026-09.md). The practical target is successful work aligned with user intent at reasonable context and supervision cost. The studies below examine parts of that problem; none evaluates this complete Pi workflow.

Sources were inspected on September 13, 2026. Results are author-reported unless stated otherwise. Inspection depth is explicit so abstracts and selected sections are not mistaken for full-paper appraisal. No independent replication was evaluated.

## Useful signals

### Foundations and human control

| Source | Evidence inspected | Relevance and boundary |
| --- | --- | --- |
| [Russell: rationality and intelligence](https://people.eecs.berkeley.edu/~russell/research-bo.html), research overview | Main conceptual discussion and publication list; fetch truncated late in the bibliography. | Rational metareasoning selects computations by expected decision benefit. Russell also explains that optimizing the metalevel can itself be intractable; bounded optimality evaluates programs under machine/environment constraints. Supports selective investigation, not recursive scoring of every thought. |
| [Kadavath et al., Language Models (Mostly) Know What They Know](https://arxiv.org/abs/2207.05221), 2022 | [Author-hosted abstract](https://www.anthropic.com/research/language-models-mostly-know-what-they-know). | Reports calibrated self-evaluation in particular formats, but difficulty calibrating “I know” on new tasks. Does not establish reliable introspection for today's arbitrary coding-agent claims. |
| [Amershi et al., Guidelines for Human-AI Interaction](https://www.microsoft.com/en-us/research/publication/guidelines-for-human-ai-interaction/), CHI 2019 | [Author explanation](https://www.microsoft.com/en-us/research/group/customer-insights-research/articles/guidelines-for-human-ai-interaction-eighteen-best-practices-for-human-centered-ai-design/), including validation account and all 18 guidelines. | Efficient correction, learning from behavior, cautious adaptation, granular feedback, and user controls fit the local intent. Validation involved expert review of guideline clarity and specificity; it is not a controlled trial proving coding-agent outcomes. |
| [Self-Evolving Coding Agents](https://arxiv.org/html/2608.03392v1), August 2026 survey | Abstract, definitions, taxonomy introduction; retrieved text truncated during framework evolution. | Distinguishes what changes, when, and which software feedback drives it: framework, memory, skills/tools, model, or collaboration. A secondary map of the field, not independent confirmation of the systems it cites. |

Bayesian epistemology, Pareto distinctions, NIST experimental-design guidance, and improvement-science context are already captured in [instruction evolution and reasoning budgets](instruction-evolution-and-reasoning-budgets.md); they are not duplicated as additional empirical LLM evidence here.

### When should an agent verify?

**[FLARE: Active Retrieval Augmented Generation](https://aclanthology.org/2023.emnlp-main.495/), Jiang et al., EMNLP 2023.** Inspected abstract, methods, setup, and opening results. FLARE drafts the next sentence, uses token probabilities to decide whether to retrieve, and regenerates with retrieved information. Evaluated with `text-davinci-003` on 2WikiMultihopQA, StrategyQA, ASQA, and WikiAsp, using Wikipedia/Bing retrieval. Authors report competitive or superior results across these tasks; exact result tables were not inspected here.

The provisional sentence can itself embed a false assumption in the search query, a failure the paper discusses. Token probability is not a universal calibrated probability that a claim is true. The transferable idea is selective checking, not the particular threshold or confidence signal.

**[Self-RAG](https://arxiv.org/abs/2310.11511), Asai et al., ICLR 2024.** Inspected abstract, introduction, training/inference methods, critic setup, and task descriptions. Llama 2–based 7B/13B models learn special retrieval and critique tokens using generated supervision. Six knowledge-intensive tasks include QA, reasoning, fact verification, and long-form generation. Authors report improved task performance, factuality, and citations; detailed numerical tables were not inspected.

This is a trained retrieval/critique policy, not evidence that adding “check yourself” to a frozen agent provides the same capability. Retriever and evaluator quality remain dependencies.

**[Large Language Models Cannot Self-Correct Reasoning Yet](https://arxiv.org/abs/2310.01798v2), Huang et al., ICLR 2024.** Inspected methods, experimental results, prompt-design analysis, and limitations. Experiments on GSM8K, CommonSenseQA, and HotpotQA with GPT-3.5, GPT-4 variants, and Llama 2 found that intrinsic self-correction without external feedback could reduce accuracy. Controls distinguish better initial prompting and access to oracle labels from genuine intrinsic correction.

This is negative evidence against equating repeated reflection with new evidence. It does not rule out execution-grounded correction, user feedback, or improvements on other tasks/models. The word “yet” and tested settings matter; the title is not a timeless universal law.

### Which instructions are worth their context cost?

**[Evaluating AGENTS.md](https://arxiv.org/abs/2602.11988v2), Gloaguen et al., June 23, 2026 revision.** Inspected revised abstract, introduction, benchmark construction, experimental details, and trace findings. Evaluated multiple coding-agent/model combinations on SWE-bench tasks and CTXbench, including 138 tasks from 12 Python repositories with developer context files. Conditions compared absent, generated, and developer-written context.

The revised result is **no significant overall success change**, not the earlier stronger headline that context universally harms success. Inference cost rose by over 20%; agents often followed instructions and performed extra exploration/testing. Developer-written context compared better with generated context, but repository overviews were not useful in these settings. This separates obedience from benefit. Selected repositories, task construction, tests, and harnesses limit generalization. See also [agent scope and stopping](agent-scope-and-stopping.md).

**[Lost in the Middle](https://aclanthology.org/2024.tacl-1.9/), Liu et al., TACL 2024.** Inspected abstract and metadata. Controlled multi-document QA and key-value retrieval showed position-sensitive performance, often worse when relevant material was in the middle. This supports distinguishing context capacity from effective use. It does not establish a universal prompt-size threshold, current-model behavior, or that shorter instructions always win.

**[DSPy](https://arxiv.org/abs/2310.03714), Khattab et al., 2023.** Inspected abstract, programming model, compiler, and case-study setup/results summaries. Declarative LM program modules are compiled into task-specific instructions/demonstrations using examples and metrics. Studies included GSM8K and HotpotQA with GPT-3.5 and Llama 2–13B.

Compact source specifications do not necessarily mean compact compiled prompts. These task-specific optimization results do not establish that a small static `AGENTS.md` generalizes across all development work. DSPy supports several optimization approaches; distinguish prompt/demonstration optimization from weight updates.

**[GEPA](https://arxiv.org/abs/2507.19457v2), Agrawal et al., February 14, 2026 revision.** Inspected the latest abstract and detailed v1 methods/results. GEPA reflects on execution traces, proposes textual mutations, evaluates them, and retains complementary candidates using Pareto selection. Detailed v1 experiments covered HotpotQA, IFBench, HoVer, and PUPA with Qwen3-8B and GPT-4.1-mini and separate optimization/validation/test roles. The revised abstract describes six tasks; v1 numerical results should not be presented as the v2 experiment.

Authors report better performance/sample efficiency than the compared optimizers. The useful evidence is evaluated variation with holdout separation, not free self-improvement. Repeated rollouts and reflection have costs, and metric quality remains decisive. Pareto selection means nondominated candidate retention, not a power-law claim. [Implementation details](../projects/agent-improvement-implementations.md#gepa-and-dspy-gepa).

### Can feedback improve behavior without endless accumulation?

**[Reflexion](https://arxiv.org/abs/2303.11366), Shinn et al., NeurIPS 2023.** Inspected methods, experiments, ablations, and limitations. Verbal feedback is retained in episodic memory for subsequent trials without changing weights. Evaluations included AlfWorld, HotpotQA, HumanEval, MBPP, and Leetcode, with task-dependent evaluators and usually one to three stored experiences.

The reported HumanEval 91% versus an 80% GPT-4 comparison is under the paper's iterative procedure, not proof of improved one-shot underlying-model ability. Negative cases matter: generated tests could falsely accept outputs, and a hard HumanEval Rust ablation without internal tests performed below its baseline. This supports feedback-grounded iteration while showing that the evaluator can teach the wrong lesson.

**[ACE: Agentic Context Engineering](https://arxiv.org/abs/2510.04618v3), March 29, 2026 revision.** Inspected latest abstract and detailed v1 algorithm, AppWorld results, and context-collapse case study. Generator, Reflector, and Curator roles incrementally evolve a structured playbook; evaluated on AppWorld and financial tasks in offline/online settings. Authors report gains and reduced adaptation latency against their baselines.

A case study shows aggressive rewriting collapsing an 18,282-token context to 122 tokens while accuracy declined, including below the no-adaptation baseline. That is not a recommendation to retain 18,000 tokens everywhere. It shows that shortening can erase useful information. Reliable feedback and curation remain necessary to the method's results, and playbook growth is a real cost. The inspected runnable implementation has narrower update/pruning behavior than the broad conceptual description; see [implementation caveats](../projects/agent-improvement-implementations.md#ace).

## Possible Pi fit

- Use retrieved facts, execution results, and explicit user feedback to revise consequential claims; do not mistake another model critique for independent confirmation.
- Compare instruction benefit against task completion and operator effort, not only adherence or token count.
- Preserve a successful baseline and evaluate a proposed change on more than the incident used to invent it when the decision warrants that effort.
- Distinguish model-weight learning, task-local retries, persistent memory, and prompt evolution when discussing “self-improvement.” They are not interchangeable.

These are interpretations for discussion, not approved additions to prompts, tests, or workflow.

## Risks / reasons not to build yet

Older-model experiments are mechanism evidence, not calibrated predictions for current Luna/Sol/Astra behavior. Benchmarks do not directly measure this operator's development philosophy. Positive findings are author-reported; no independent replication or local evaluation was conducted. A frozen agent may not reproduce a trained policy. Cheap inference can hide expensive optimization, and compact summaries can remove the qualifications that made a lesson valid.

## KISS recommendation

Use this evidence to make selective, testable changes to existing guidance. Do not implement a general confidence estimator, reflection loop, or automatic prompt optimizer from these papers alone. Start with an actual repeated mismatch and the smallest comparison that could change the proposed remedy.

## Related notes

- [Survey synthesis](agent-improvement-survey-2026-09.md)
- [Implementation comparison](../projects/agent-improvement-implementations.md)
- [Instruction evolution and reasoning budgets](instruction-evolution-and-reasoning-budgets.md)
- [Agent workflow benchmark loops](../workflow-ideas/agent-workflow-benchmark-loops.md)
