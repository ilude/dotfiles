---
status: research-note
source:
  - https://people.eecs.berkeley.edu/~russell/research-bo.html
  - https://plato.stanford.edu/entries/epistemology-bayesian/
  - https://aclanthology.org/2024.tacl-1.9/
  - https://www.itl.nist.gov/div898/handbook/pri/section3/pri3346.htm
---

# Instruction evolution and reasoning budgets

## Why this matters

The operator wants a few high-impact instructions that preserve their intended workflow and development philosophy. Two resources compete with task work: standing instructions occupy initial context, and indiscriminate verification fills working context with research that may not affect the decision. Too little checking produces confident unsupported claims, invented features, and misapplied best practices. The objective is better task outcomes and less correction effort, not minimum tokens or maximum verification.

This September 2026 discussion extends beyond security. The Onclave incident in AIF-054/APR-035 is one example: an agent defended a context-output restriction until the operator pointed out that the download returns file metadata, not transcript text. A small local inspection was more relevant than general security research. Repetition in assistant messages or compaction does not supply independent evidence for a claim.

## September 2026 evidence survey

The [September 13 survey](agent-improvement-survey-2026-09.md) extends this conceptual discussion with [academic evidence](agent-improvement-academic-evidence.md) and [seven commercial/open-source implementations](../projects/agent-improvement-implementations.md). It separates selective verification, instruction benefit, and feedback-driven adaptation. Key additions include the revised AGENTS.md result, negative intrinsic self-correction evidence, GEPA's evaluated prompt evolution, and the gap between ACE's conceptual curation and its inspected add-only curator-operation path. Product memory capabilities are not proof of effectiveness or user-intent alignment. This remains research, not approval for skill or runtime changes.

## Useful signals

### Economics and bounded rationality: allocate scarce effort

Context, time, and operator attention have opportunity costs. The next instruction or investigation should be considered for its additional benefit and burden, rather than justified because more guidance or evidence sounds good. Diminishing returns are not necessarily a power law; additional instructions can also conflict and reduce quality.

[Stuart Russell's research overview](https://people.eecs.berkeley.edu/~russell/research-bo.html) explains rational metareasoning as choosing computations by their expected value in improving the next decision. It also identifies a limit: optimally deciding how to think can itself be more expensive than the original problem. Bounded optimality instead compares how well agent programs perform in an environment on a given machine.

**Local interpretation:** evaluate instruction sets against the intended workflow and resource constraints. Do not create a scoring ritual or recursively investigate whether every investigation was worthwhile. Economics is a useful decision frame here, not evidence that tokens, attention, and user burden have known numerical exchange rates.

### Bayesian epistemology: revise claims, not just wording

[Bayesian Epistemology](https://plato.stanford.edu/entries/epistemology-bayesian/) describes coherent degrees of belief and updating on evidence. Bounded rationality is broader than Bayesian modeling; not all approaches require Bayesian inference.

**Local interpretation:** existing model knowledge is a starting point, not proof about a particular repository or deployment. Check decision-relevant premises against the nearest relevant evidence. Distinguish observations from assumptions, and revise conclusions when their basis changes. A suggestion can remain tentative without a bibliography; turning it into a requirement needs an established fit and the appropriate user authorization. This does not require numerical confidence estimates or a citation beside every sentence.

### Pareto and power laws: seek leverage without assuming its shape

The operator's Pareto-inspired aim is evolutionary: identify small instruction changes that remove a large share of repeated friction. The Pareto distribution has a power-law tail, but the informal 80/20 ratio is not universal. Zipf-style rank-frequency patterns could describe concentrated failure categories; no distribution has been fitted to local instruction benefits.

Power laws of practice were also discussed as an analogy for early improvement followed by smaller gains. Their applicability to prompt refinement is unestablished. Pareto optimality is a separate trade-off concept, not the 80/20 rule. None of these ideas requires a numerical allocation rule for agent work.

### Experimental design: distinguish improvement from coincidence

[NIST's screening-design guidance](https://www.itl.nist.gov/div898/handbook/pri/section3/pri3346.htm) addresses identifying influential factors efficiently. It explicitly discusses assumptions about interactions and confounding.

**Local interpretation:** compare similar incidents and make small, traceable revisions. Where a consequential uncertainty warrants it, compare wording variants or remove an instruction to assess its contribution (ablation). Different tasks, models, and surrounding instructions can explain different outcomes. Routine observations are useful but weaker causal evidence than controlled comparisons. No experiment suite is required for every sentence.

### Context capacity is not effective context use

[Liu et al., Lost in the Middle (TACL 2024)](https://aclanthology.org/2024.tacl-1.9/) reports position-sensitive performance on multi-document question answering and key-value retrieval. Relevant information in the middle was often used less successfully than information at the beginning or end.

This supports distinguishing available from effectively used context. It does not prove a universal prompt-length threshold, quantify instruction overload in current Pi models, or establish that shorter prompts always perform better. Rate–distortion theory was mentioned as a possible compression analogy: preserve behaviorally important information rather than merely shorten text. That analogy was not developed or validated in this review.

### Improvement science: predictions and revision, not process ceremony

[Taylor et al., Systematic review of PDSA applications (2014)](https://pmc.ncbi.nlm.nih.gov/articles/PMC3963536/) assessed how healthcare studies applied iterative testing, predictions, small-scale changes, and observations over time. Of 73 included articles, 47 supported full framework analysis; fewer than 20% documented a full iterative sequence. This evaluates reported method application, not the effectiveness of Pi instructions. The abstract and introductory method discussion were read; this is not a full-paper appraisal.

**Local interpretation:** distinguish evidence sufficient to try a reversible change from evidence that it helped. State the intended behavioral effect and what would make us reconsider the explanation. Look for unintended burden as well as fewer recurrences. These can be brief prompts within existing feedback records, not mandatory forms, cycle counters, quantitative thresholds, or experiments for every edit. Local context matters; do not import the paper's healthcare reporting requirements into agent work.

## Possible Pi fit

**Historical proposal, subsequently implemented in part:** evolve the existing on-demand `agent-process` skill rather than create a parallel instruction-improvement process. The current skill now uses targeted incident retrieval, distinguishes missing policy from adherence failure, and asks for expected effects and later evidence. These source changes establish installation, not behavioral effectiveness. The original proposal below remains context, not a second active procedure. It already owns feedback, incident comparison, narrow proposals, and approval. Keep the theory in this note and a small procedure in the skill:

1. Identify the operator's intended behavior and a concrete mismatch; compare relevant prior incidents and current instructions.
2. Check uncertainties that could change the proposed remedy, using local evidence before unrelated research. Stop when further evidence would not change the choice.
3. Propose the smallest useful addition, replacement, consolidation, or deletion. Explain the expected behavior change and any instruction or workflow burden; distinguish evidence from hypothesis.
4. After approval, apply the change and use comparable later work to assess recurrence, correction effort, and task completion. Revise or retire ineffective wording without claiming causality from one success.

No fixed scores, numerical budgets, automatic monitoring, mandatory A/B tests, or additional supervisor are implied. A separate skill becomes worth considering only if it has a distinct trigger and responsibility that the existing skill cannot express clearly.

The earlier full-log-read requirement conflicted with selective context. The current `agent-process` skill now searches relevant entries and expands only when missing evidence could change the cause or remedy. This correction was approved separately; this research note did not authorize it.

### Investigation before skill revision

The September 13 follow-up checked the existing skills and selected historical records, not a new census of sessions:

- `skill-creation` already covers consolidation, pruning, Pareto-inspired instruction selection, conditional references, and representative comparisons when an effect is uncertain or consequential. Keep writing guidance there; `agent-process` should own diagnosing the mismatch, proposing a change, approval, and subsequent learning.
- AIF-031 and AIF-054 show that comparable-environment and proportionality instructions existed before the Onclave failure. A new paraphrase cannot be assumed to solve adherence. Checking whether a premise applies to the actual data path and requiring proposal warnings in returned findings target more specific behavior, but remain unvalidated remedies.
- AIF-041 documents approval for context-output limits in another discussion. That does not establish their relevance to a metadata-only download. Retrieve the specific policy context instead of converting a prior decision into a universal rule.
- AIF-013 records successful bounded work alongside gateway churn. It supports preserving the working baseline, not replacing the planning workflow because of one exception. The underlying successful sessions were not re-reviewed here, so this is evidence from the existing comparative record, not an independent replication.
- AIF-003 records wording and approval with later adherence unverified. A successful edit or passing whitespace check establishes installation, not behavioral effectiveness.

The logs totalled 843 lines at the earlier inspection. This measured the former full-read requirement's input size, not a token count. Focused retrieval has since replaced that requirement; its effect on task outcomes remains unverified.

These walkthroughs support a lightweight hypothesis-and-observation approach; they do not demonstrate that the proposed procedure would have prevented the incidents. [Context-separation experiments](pi-context-separation-options.md) establish native fork behavior and identified a repository `/branch` defect, subsequently repaired with separate session files and reciprocal context-excluded markers after operator approval. Those capabilities can be documented conditionally without building automation.

## Risks / reasons not to build yet

- Another skill or always-loaded theory summary could reproduce the context burden it is meant to reduce.
- Demanding objective proof of every suggestion would replace unsupported certainty with research churn.
- Fewer tokens or tool calls alone do not establish success; incomplete work and more user corrections can erase apparent savings.
- Existing similar instructions did not prevent the observed failure. Rewording alone may not be sufficient; inspect actual later behavior rather than promising prevention.
- The sources support conceptual distinctions, not a proven intervention for this profile. The subsequent skill edits have separate approval; this survey authorizes no further procedure or skill changes.

## KISS recommendation

Keep the theory and linked survey in the vault rather than always-loaded instructions. Use the revised `agent-process` skill and assess its usefulness during later relevant reviews before adding a separate skill or optimizer. Preserve user approval and evidence/assumption boundaries; installation and smaller context alone do not demonstrate better task outcomes.

## Related notes

- [Pi context separation options and experiments](pi-context-separation-options.md)

- [Agent scope and stopping](agent-scope-and-stopping.md)
- [Agent process skill](../../../../../pi/profiles/default/skills/agent-process/SKILL.md)
- [Instruction feedback, including AIF-054](../../../../../pi/profiles/default/skills/agent-process/references/instruction-feedback.md)
- [Failure log, including APR-035](../../../../../pi/profiles/default/skills/agent-process/references/failure-log.md)

## Source coverage

This is a bounded synthesis, not a systematic literature review. The Russell overview, introductory Bayesian epistemology sections, NIST screening page, and Liu et al. abstract were inspected directly. Pareto, practice curves, and rate–distortion are discussion context rather than locally validated models. A follow-up fetch of the practice-curve article at PMC was blocked by a browser challenge, so it is not used here to support detailed empirical claims.
