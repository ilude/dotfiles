---
name: agent-process
description: Capture and diagnose meaningful operator corrections, workflow failures, bottlenecks, and reusable successes. Use when learning from agent work or refining instructions and workflows.
---

# Agent process

Use proactively for meaningful operator corrections, repeated workarounds or bottlenecks, misleading evaluation, and reusable successes; `/skill:agent-process` also invokes it explicitly. Frustration directed at agent behavior is a signal of possible intent mismatch, not proof. Ordinary progress and expected failed attempts do not by themselves warrant a record.

Keep capture brief within authorized work. If substantive process discussion may displace the current task, offer practical separation choices before investigating deeply. Read [context separation options](references/context-separation.md) only when that offer would help. Do not branch or interrupt work automatically.

1. Establish the intended outcome and observed behavior from relevant instructions, task evidence, and operator feedback. Separate facts from hypotheses and recheck a premise when challenged.
2. Retrieve relevant entries from the [instruction feedback log](references/instruction-feedback.md), [failure log](references/failure-log.md), or owning project notes. Expand only when missing evidence could change the cause or remedy. Distinguish absent or unclear instructions from adherence failure, missing tools or capabilities, execution bottlenecks, and misleading checks or references. Choose the remedy for the cause; another paraphrase does not necessarily fix adherence.
3. Capture only the reusable lesson. Update a related entry rather than duplicate it: general feedback belongs in the feedback log, workflow failures in the failure log, and domain-specific techniques or task state in owning project notes. Use a concise ID or heading, reference, facts versus hypotheses, related entries, decision or proposed remedy, and status. Omit secrets, private task content, and raw transcripts. A record-only outcome or no persistent change can finish the learning work, not an unfinished parent task. A clear first occurrence can justify a correction; recurrence is not required.
4. When instructions are the remedy, use [prompting](../prompting/SKILL.md) for ownership, consolidation, and conflict review, and [skill-creation](../skill-creation/SKILL.md) for skill edits. Explain the expected effect, evidence versus assumptions, and what later evidence would justify revision. Match effort to the decision; do not require scores, fixed thresholds, experiments, or another review process.
5. Apply remedies only within existing task authority or explicit project-local evolution permission; otherwise propose them for approval. Shared instruction changes require operator approval. Records are evidence, not executable policy or permission to commit or push.
6. During later comparable work, retrieve the relevant lesson and assess recurrence, operator correction burden, unintended work, and task completion. One result does not establish causality. Keep, revise, or retire guidance within the same authority boundaries; do not schedule monitoring, add per-turn reflection, or claim installation proves effectiveness.

Continue authorized task work after brief capture; substantive separation follows the operator's choice.

## Research reference

For reviews of scope drift, excessive verification, delegation sizing, dependency decomposition, or model/effort routing, consult [Agent scope and stopping](../../../../../docs/research/obsidian-vault/agent-workflows/patterns/agent-scope-and-stopping.md) as needed. For disputed instruction-evolution choices, consult [Instruction evolution and reasoning budgets](../../../../../docs/research/obsidian-vault/agent-workflows/patterns/instruction-evolution-and-reasoning-budgets.md). Research proposals are not active policy.
