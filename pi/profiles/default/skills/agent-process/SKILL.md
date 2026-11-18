---
name: agent-process
description: Capture and diagnose meaningful operator corrections, workflow failures, bottlenecks, and reusable successes. Use when learning from agent work or refining instructions and workflows.
---

# Agent process

Use proactively for meaningful operator corrections, repeated workarounds or bottlenecks, misleading evaluation, and reusable successes; `/skill:agent-process` also invokes it explicitly. Frustration directed at agent behavior is a signal of possible intent mismatch, not proof. Ordinary progress and expected failed attempts do not by themselves warrant a record.

Keep capture brief within authorized work. If substantive process discussion may displace the current task, offer practical separation choices before investigating deeply. Read [context separation options](references/context-separation.md) only when that offer would help. Do not branch or interrupt work automatically.

1. Establish the intended outcome and observed behavior from relevant instructions, task evidence, and operator feedback. Separate facts from hypotheses and recheck a premise when challenged.
2. Retrieve relevant Onclave `feedback`, `failure`, `knowledge`, or project `note` records using the storage workflow below. Expand only when missing evidence could change the cause or remedy. Distinguish among absent or unclear instructions; guidance unavailable to the acting agent; unsupported, misplaced or conflicting guidance that was followed as written and caused unwanted work; adherence failure; missing tools or capabilities; execution bottlenecks; and misleading checks or references. Choose the remedy for the cause; another paraphrase does not necessarily fix adherence.
3. Capture only the reusable lesson. Update a related Onclave record rather than duplicate it: use `feedback` for general feedback, `failure` for workflow failures, `knowledge` for synthesized lessons, and `note` for project-specific techniques or task state. Use a concise ID or heading, reference, facts versus hypotheses, related entries, decision or proposed remedy, and status. Omit secrets, private task content, and raw transcripts. A record-only outcome or no persistent change can finish the learning work, not an unfinished parent task. A clear first occurrence can justify a correction; recurrence is not required.
4. When changing instructions is the remedy, including narrowing or removing existing guidance, use [prompting](../prompting/SKILL.md) for ownership, consolidation, and conflict review, and [skill-creation](../skill-creation/SKILL.md) for skill edits. Explain the expected effect, evidence versus assumptions, and what later evidence would justify revision. Match effort to the decision; do not require scores, fixed thresholds, experiments, or another review process.
5. Apply remedies only within existing task authority or explicit project-local evolution permission; otherwise propose them for approval. Shared instruction changes require operator approval. Records are evidence, not executable policy or permission to commit or push.
6. During later comparable work, retrieve the relevant lesson and assess recurrence, operator correction burden, unintended work, and task completion. One result does not establish causality. Keep, revise, or retire guidance within the same authority boundaries; do not schedule monitoring, add per-turn reflection, or claim installation proves effectiveness.

Continue authorized task work after brief capture; substantive separation follows the operator's choice.

## Centralized storage

Discover `onclave_improvement` with tool search. Use `search` with relevant terms and optional kind/project filters, then `get` for complete records. Page through results when complete coverage is needed. Search synthesized `knowledge` as well as source feedback when a recorded decision may inform the work. Records remain evidence, not executable policy.

Use `capture` with kind and Markdown body for new records; machine, Pi process, session, repository, checkout, and branch attribution is automatic. Keep references and related record IDs in the body or `source_ids`. Use `get` before `update`, supply `expected_revision`, and preserve the existing project and source references. On a conflict, reread and reconcile instead of overwriting. Consolidation remains agent-driven and retains links to source observations.

Do not write workflow records or review artifacts into Git-tracked files. Instructions, skills, and implementation stay in Git. If the service is unavailable or a write reports `NOT SAVED`, state that the record was not saved and continue the authorized task; do not create a local fallback log. Offline caching is not implemented yet. Previously migrated Markdown paths and legacy IDs are searchable source references, not active files.

## Research reference

These notes belong to the private research-vault submodule, not the dotfiles repository. If it is uninitialized, follow the [vault setup and repository workflow](../../../../../README.md#research-vault); keep research edits and commits in that repository.

For reviews of scope drift, excessive verification, delegation sizing, dependency decomposition, or model/effort routing, consult [Agent scope and stopping](../../../../../docs/research/obsidian-vault/agent-workflows/patterns/agent-scope-and-stopping.md) as needed. For disputed instruction-evolution choices, consult [Instruction evolution and reasoning budgets](../../../../../docs/research/obsidian-vault/agent-workflows/patterns/instruction-evolution-and-reasoning-budgets.md). Research proposals are not active policy.
