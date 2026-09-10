---
name: agent-process
description: Capture and review operator feedback or agent workflow failures when refining AGENTS.md, skills, or agent workflows. Compare earlier feedback and incidents before proposing changes.
---

# Agent process

Use this skill when the operator asks to capture, review, or refine agent behavior. It is on demand, not automatic monitoring.

1. Read [the instruction feedback log](references/instruction-feedback.md) and [the failure log](references/failure-log.md) completely.
2. Verify the relevant instructions and evidence. Separate observed behavior from suspected causes.
3. Record general feedback in the feedback log and workflow failures in the failure log. Use a concise ID, reference, facts, related entries, decision or remediation, and status. Omit secrets, private task content, and raw transcripts.
4. Propose the smallest clear change that addresses the evidence. Avoid speculative edge cases, ceremony, and scope expansion. Prefer flexible, judgment-based workflows; use deterministic checks for narrow factual questions when their reliability outweighs the loss of judgment.
5. Change instructions only with operator approval and at the owning scope. A log entry is not executable policy or permission to commit or push.
6. Resume any interrupted task when requested. Do not claim effectiveness or prevention without evidence.

## Research reference

For reviews of scope drift, excessive verification, delegation sizing, dependency decomposition, or model/effort routing, consult [Agent scope and stopping](../../../../../docs/research/obsidian-vault/agent-workflows/patterns/agent-scope-and-stopping.md) as needed. It combines external research with related local feedback and incidents; its control candidates are not approved policy.
