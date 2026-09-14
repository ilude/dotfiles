---
status: research-note
surveyed: 2026-09-13
source:
  - agent-improvement-academic-evidence.md
  - ../projects/agent-improvement-implementations.md
  - instruction-evolution-and-reasoning-budgets.md
---

# Agent improvement survey: September 2026

## Why this matters

The goal is better alignment with the operator's intended development workflow using a few effective instructions, not maximum verification, minimum tokens, or autonomous self-modification. Standing instructions and research both consume context and attention; insufficient checking produces confident unsupported claims and invented obligations.

This survey answers three questions:

1. When should an agent verify rather than rely on existing model knowledge?
2. Which small instructions improve behavior across tasks without extra friction?
3. How can feedback improve the workflow without accumulating context or overfitting to incidents?

**Cutoff: September 13, 2026**, not the entire month. This is a targeted survey, not a systematic review or an implementation plan. See the [academic evidence](agent-improvement-academic-evidence.md) and [implementation comparison](../projects/agent-improvement-implementations.md) for sources, inspection depth, versions, and limitations. No systems were installed or benchmarked locally.

## Useful signals

### 1. Verification: select useful evidence, not more self-assurance

**Research:** FLARE and Self-RAG demonstrate selective retrieval in knowledge-intensive tasks. They do not establish a universal confidence threshold for coding agents. Intrinsic self-correction experiments show that asking a model to reconsider without external feedback can reduce accuracy. Reflexion's positive results depend on evaluators whose errors also matter.

**Implementations:** Coding-agent rules and memories generally do not verify their contents. GEPA evaluates prompt candidates against caller-defined metrics; Claude Code documents an explicitly invoked verification workflow. Neither establishes that every explanation or remembered lesson is true.

**Application to our workflow, proposed:** use model knowledge to generate hypotheses; check premises that could change the work against the nearest relevant source. Code and execution results often answer local questions more directly than web research. Ask the operator about unresolved intent, not facts that can be inspected. Treat disagreement as a reason to recheck, not as proof that either party is correct.

The Onclave example is decisive because the download returns file metadata rather than transcript text. Inspecting that return path addresses the claimed context problem. A general security bibliography does not. This local incident motivates the question; it does not prove a particular prompt prevents recurrence.

**Still unknown:** no reviewed system supplies a demonstrated general policy for choosing among repository inspection, web research, user clarification, and proceeding from knowledge in this Pi workflow. Rational metareasoning supplies the decision frame, not a ready-made controller.

### 2. Instructions: distinguish adherence from usefulness

**Research:** the June 2026 revision of *Evaluating AGENTS.md* found no significant overall success improvement from context files, despite agents following their instructions, and reported over 20% higher inference cost. This is evidence from particular repositories and agent/model combinations, not a verdict against all instructions. GEPA shows that evaluated prompt changes can improve task-specific systems; it does not establish universally effective short rules.

**Implementations:** Claude Code, Cursor, Codex, and Letta separate always-present guidance from scoped or on-demand content. This is a concrete alternative to loading every lesson into every prompt. Product documentation establishes the mechanism, not the size of its benefit here.

**Application, proposed:** reserve global instructions for stable cross-task intent, keep role-specific return requirements in the owning role, and retrieve task-specific evidence when relevant. When wording overlaps, consider replacement or deletion before another addition. Preserve meaning rather than optimize word count alone.

**Still unknown:** there is no measured local ranking of instruction effectiveness or evidence that its distribution follows Pareto/Zipf. Existing similar instructions failed to prevent the Onclave behavior. The recent revisions are installed, not behaviorally validated.

### 3. Feedback: persist lessons selectively and test their fit

**Research:** Reflexion stores a small episodic history; GEPA mutates and evaluates prompt candidates; ACE incrementally evolves a structured playbook. These change different artifacts and have different costs. Positive benchmark results coexist with evaluator errors, overfitting risks, and loss of useful detail during compression.

**Implementations:** products offer editable memory, scoped files, Git history, or background consolidation. GEPA and ACE provide runnable evaluation paths. None of these mechanisms makes an agent-authored lesson equivalent to user intent. In the inspected ACE code, the normal curator-operation function implements additions while update/merge/delete operations remain TODOs; optional analysis must not be confused with automatic pruning.

**Application, proposed:** use existing incident and feedback records to identify a recurring mismatch, propose one small change, obtain approval, and inspect comparable later work. Preserve the observation and the hypothesis separately. Retain, revise, or remove wording based on usefulness rather than accumulate every explanation.

**Still unknown:** how much of later improvement comes from the instruction rather than task mix, model upgrades, tool changes, or increased operator supervision. Fewer corrections alone can hide avoidance or excessive agreement.

## Where the research areas overlap

| Area | Useful contribution | What it does not establish |
| --- | --- | --- |
| Bayesian epistemology and calibration | Revise confidence when evidence changes; distinguish belief from support. | That a model's verbal confidence is calibrated or that repeated assistant text is new evidence. |
| Economics and rational metareasoning | Consider opportunity cost and the expected benefit of another check. | Known exchange rates between tokens, attention, and task quality, or a need for numerical scoring. |
| Bounded optimality | Evaluate the whole workflow under resource constraints, not an impossible ideal of perfect reasoning. | That the shortest prompt or cheapest run is best. |
| Pareto/Zipf | Investigate whether a few failure categories account for much of the friction. | A guaranteed 80/20 split in instruction benefits. |
| Experimental design | Compare changes, control confounds, and examine interactions or ablations when worthwhile. | That every wording edit needs an experiment suite. |
| Human–AI interaction | Keep correction easy and adaptation understandable and user-controlled. | That automatic personalization correctly infers durable user intent. |
| Evolutionary optimization | Generate variants and retain those that perform better under an evaluation. | That the evaluation measures the operator's real objective. |

GEPA's **Pareto selection concerns nondominated candidates across evaluation examples**, not a Pareto power-law distribution or an 80/20 allocation rule. This is a concrete overlap between evolutionary prompt improvement and multi-objective selection, but not proof of the operator's concentration hypothesis.

## Possible Pi fit

The current on-demand `agent-process` skill already incorporates targeted incident retrieval, expected effects, and comparison during later relevant reviews. The [existing reasoning-budget note](instruction-evolution-and-reasoning-budgets.md) records the earlier proposal and former full-log-read cost. Reuse that approved workflow before adding an optimizer or memory service; these installed instructions still need behavioral evidence.

A lightweight evaluation could use comparable cases to ask:

- Did the requested work finish without invented obligations?
- Were consequential claims grounded and corrected when contradicted?
- Did the operator need fewer corrections without more approval interruptions or avoidance?
- Did context, elapsed time, and verification effort improve without lost functionality?

These are interpretation questions, not a mandatory scorecard. For a consequential uncertain change, a small held-out comparison can provide stronger evidence than the incident used to write the rule. For routine edits, later task observations may be enough to reconsider the hypothesis, though not to prove causality. Preserve cases where the current workflow already works.

## Risks / reasons not to build yet

- Benchmark rewards and self-generated critiques can reinforce the wrong behavior. Passing a test does not establish user authorization or maintainability.
- Moving lessons to memory changes retrieval and persistence, not their truth. Repeated summaries can preserve an error while dropping its uncertainty.
- Compression can discard useful detail; expansion can burden context. Neither direction is universally better.
- Product features and research artifacts are not head-to-head effectiveness evidence. No independent replication or local transfer evaluation was performed here.
- Automatically optimizing global instructions would change the approval workflow. Research capture authorizes none of that.

## KISS recommendation

Keep the evidence in the vault and reuse the existing feedback process, including its now-implemented selective incident retrieval. Assess comparable later outcomes before proposing another instruction revision or framework. Use GEPA as an example of evaluated variation, progressive disclosure as an implementation pattern, and negative self-correction results as a warning against treating reflection as proof. Do not import fixed token budgets, universal confidence thresholds, or automatic promotion from this survey.

## Related notes

- [Academic evidence and limits](agent-improvement-academic-evidence.md)
- [Commercial and open-source implementations](../projects/agent-improvement-implementations.md)
- [Instruction evolution and reasoning budgets](instruction-evolution-and-reasoning-budgets.md)
- [Agent scope and stopping](agent-scope-and-stopping.md)
- [Markdown skills and memory](markdown-skills-memory.md)
- [Agent workflow benchmark loops](../workflow-ideas/agent-workflow-benchmark-loops.md)

## Source coverage

Two bounded research passes covered original papers and seven implementations, supplemented by parent inspection of foundational and human–AI interaction sources, the August 2026 coding-agent survey, and ACE's curator-operation source. Search used SearXNG with Brave/Serper fallback; intermittent Google CAPTCHA/suspension and partial fetches limit completeness. Source abstracts, selected paper sections, live documentation, repository files, and releases are distinguished in the companion notes. No claim is based solely on a search snippet. Live pages and unpinned branches are observations on the cutoff date, not immutable snapshots. Positive study results remain author-reported; absence of a replication in this bounded search is not proof that none exists.
