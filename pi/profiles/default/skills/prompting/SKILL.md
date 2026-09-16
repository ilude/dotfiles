---
name: prompting
description: Create, review, or optimize agent instructions, including role/system prompts, tool guidance, AGENTS.md, skills, and prompt templates. Use for prompt composition, duplication, clarity, and context efficiency.
---

# Prompting

Ground changes in the requested behavior, applicable policy, and observed failures. For operator-feedback analysis, use [agent-process](../agent-process/SKILL.md); skill packaging belongs to [skill-creation](../skill-creation/SKILL.md).

- Inspect the assembled instructions for the affected audience, including role text, injected guidance, catalogs, and relevant inherited rules. Optimize that composition, not just the edited fragment.
- Apply the Pareto principle (80/20): keep the smallest instruction set that prevents consequential errors. Rely on ordinary model knowledge; remove duplicated meanings, no-op rules, and cheaply discoverable facts. Consider replacement, consolidation, deletion, or relocation before appending text: extra instructions consume context and can obscure or conflict with existing rules.
- Put each rule at its owning scope. Keep always-loaded context to discovery, routing, and applicable policy; load detailed procedures through the selected role, skill, or reference. Keep assignment-specific facts in the assignment.
- Preserve operator requirements and effective behavior when shortening. Use direct, positive language and observable actions. Prescribe exact steps only where needed; otherwise retain judgment. Add examples only for useful precision, using positive examples.
- Make outputs easy for their consumer to act on. Structured prose does not imply a parsed schema, approval process, or runtime gate.
- Check the combined result for conflicts and omissions. Compare before/after size across affected audiences, distinguishing characters or words from measured tokens. Use representative behavior checks when they can resolve consequential uncertainty; prompt-loading tests and smaller counts alone do not establish model adherence.
