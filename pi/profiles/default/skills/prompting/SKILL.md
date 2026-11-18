---
name: prompting
description: Create, review, or optimize agent instructions, including role/system prompts, tool guidance, AGENTS.md, skills, and prompt templates. Use for prompt composition, duplication, clarity, and context efficiency.
---

# Prompting

- Keep concise instructions only for the operator's specific work style/requirements or knowledge a frontier model would not ordinarily have. Remove generic advice.
- Verify custom policy against the operator's requirements; its presence in an existing file is not justification. Distinguish user requirements from agent proposals and role-local restrictions.
- Put each instruction at its narrowest useful scope. Non-obvious component facts do not belong in global instructions. Resolve conflicts and consolidate duplicates at the owning scope, using applicable instruction precedence and the operator's requirements rather than adding exceptions.
- Do not turn an instruction cleanup into new workflow gates, tool restrictions or runtime mechanisms.

## Conditional references

- For a Pi-specific review that needs to reconstruct what a model call can see, read the [instruction-composition reference](../pi-extension/references/instruction-composition.md).
- For operator-feedback analysis, use [agent-process](../agent-process/SKILL.md). An adherence failure does not by itself justify another instruction.
- For skill packaging, use [skill-creation](../skill-creation/SKILL.md).

Source text, assembled model context and the provider payload are different measurements. Static size or prefix comparisons do not establish cache savings; use reported provider usage before making that claim.
