---
name: prompting
description: Create, review, or optimize agent instructions, including role/system prompts, tool guidance, AGENTS.md, skills, and prompt templates. Use for prompt composition, duplication, clarity, and context efficiency.
---

# Prompting

Ground changes in requested behavior, applicable policy, and observed failures. For Pi-specific prompt reviews, read the [Pi instruction-composition reference](../pi-extension/references/instruction-composition.md). For operator-feedback analysis, use [agent-process](../agent-process/SKILL.md); skill packaging belongs to [skill-creation](../skill-creation/SKILL.md).

## Procedure

1. **Assemble the prompt.** Identify each affected audience and render everything model-visible to it: base and inherited instructions, role text, injected guidance, catalogs, skills, tool guidance, and assignment framing. Mark dynamic sections explicitly and distinguish the complete composition from excerpts.
2. **Recover requirements.** Trace existing instructions through relevant history, feedback, incidents, tests, and related prompts when their purpose affects the change. Map each instruction to the behavior or failure it addresses, separating evidence from assumptions. Preserve required behavior rather than wording.
3. **Assign ownership.** Give each behavior one owning layer and audience. Keep always-loaded context to discovery, routing, and applicable policy; put specialist procedures in roles, skills, or references and assignment facts in the assignment. Apply the Pareto principle: rely on ordinary model knowledge and prefer consolidation, replacement, relocation, or deletion over appended exceptions.
4. **Rewrite the composition.** Organize instructions around the decisions and sequence the audience follows. Use consistent terminology, direct positive language, and observable triggers. Prescribe exact steps where needed and retain judgment elsewhere. Use positive examples only when they add precision. Structured prose remains guidance rather than an implicit schema, approval process, or runtime gate.
5. **Inspect the complete result.** Render the affected composition again and review it from beginning to end for conflicting instructions, duplicated behavior, omissions, terminology drift, vague discretion, and misplaced ownership. Show the complete affected prompt to the consumer or identify the dynamic sections that cannot be rendered statically.
6. **Review caching effects.** Classify changed content as always-visible, conditional, or assignment-specific. Check deterministic ordering and byte stability; compare composed size by affected audience and identify an earlier changed prompt region when it could invalidate a stable prefix. Inspect provider request construction when payload placement is uncertain. Use reported provider usage from representative requests before claiming cache improvement or regression. Static size and prefix analysis establish cacheability conditions, not actual cache effectiveness; report when live behavior was not measured.
7. **Review against requirements.** Read the complete affected instructions against the agreed requirements. Identify missing requirements, conflicting directions, duplicated guidance, and misplaced responsibilities; revise those findings before presenting the result.
