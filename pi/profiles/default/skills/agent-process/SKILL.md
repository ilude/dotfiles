---
name: agent-process
description: Capture and review operator feedback, frustration about agent behavior, or workflow failures when refining AGENTS.md, skills, or agent workflows. Compare relevant prior evidence before proposing changes.
---

# Agent process

Use this skill on demand, including through `/skill:agent-process`. Explicit correction, frustration, swearing, or “wtf” directed at agent behavior is a strong signal of a possible intent mismatch, but wording alone is not proof and unrelated frustration does not trigger process work.

If substantive process discussion may displace the current task, offer the operator practical separation choices before investigating deeply. Read [context separation options](references/context-separation.md) only when that offer would help. Do not branch or interrupt work automatically.

1. Establish intended and observed behavior from relevant instructions, task evidence, and operator feedback. Separate facts from hypotheses and recheck a premise when challenged.
2. Search the [instruction feedback log](references/instruction-feedback.md) and [failure log](references/failure-log.md) for relevant entries. Expand to linked incidents or more history only when missing evidence could change the cause or remedy. Distinguish absent or unclear policy from failure to follow existing policy; another paraphrase does not necessarily fix adherence.
3. Record general feedback in the feedback log and workflow failures in the failure log. Use a concise ID, reference, facts, related entries, decision or remediation, and status. Omit secrets, private task content, and raw transcripts. A concise record with no instruction change or promised follow-up can be the finished response, including for a first unfamiliar occurrence. A clear first occurrence can also justify proposing an obvious correction; recurrence is not required.
4. When a change is warranted, propose the smallest useful addition, replacement, consolidation, deletion, or relocation at the owning scope. Explain its expected behavioral effect, supporting evidence versus assumptions, and what later evidence would justify revising it. Match investigation effort to the actual decision; do not require scores, citations for every tentative thought, fixed thresholds, experiments, or another review process.
5. Change instructions only with operator approval. For skill edits, follow [skill-creation](../skill-creation/SKILL.md) rather than duplicating its writing guidance. A log entry is not executable policy or permission to commit or push.
6. During later relevant reviews, compare comparable outcomes, including recurrence, operator correction burden, unintended work, and task completion. One result does not establish causality. Keep, revise, or retire wording with approval; do not schedule monitoring or claim installation proves effectiveness.

Resume any interrupted task when requested.

## Research reference

For reviews of scope drift, excessive verification, delegation sizing, dependency decomposition, or model/effort routing, consult [Agent scope and stopping](../../../../../docs/research/obsidian-vault/agent-workflows/patterns/agent-scope-and-stopping.md) as needed. For disputed instruction-evolution choices, consult [Instruction evolution and reasoning budgets](../../../../../docs/research/obsidian-vault/agent-workflows/patterns/instruction-evolution-and-reasoning-budgets.md). Research proposals are not active policy.
