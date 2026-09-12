---
name: skill-creation
description: Create or revise concise agent skills after the operator has decided a skill is needed. Use to select, structure, and write high-value skill instructions.
---

# Skill Creation

Ground the skill in the operator’s requirements, relevant project artifacts, authoritative references, and observed corrections.

When adding or refactoring, inspect the existing skill and related skills first. Consolidate overlapping guidance into one source of truth, preserve effective triggers and behavior, and remove instructions that do not change behavior. When an instruction’s effect is uncertain or consequential, compare representative runs with and without it.

Keep the skill concise and token-efficient. Apply the Pareto principle (80/20): include the smallest set of instructions that prevents the most consequential or recurring errors. Rely on the model’s existing knowledge and judgment for everything else. Prune no-op instructions, duplicated meanings, and facts the agent can cheaply obtain from the environment.

Give the skill one coherent responsibility. Make its description state what it does and when it should be loaded.

Keep essential instructions in `SKILL.md`. Move conditional detail to directly linked references and state when to read them.

Prescribe exact actions only where correctness requires them; otherwise preserve model judgment.

Use direct, positive instructions. Include an example only when it adds precision, and do not include copyable examples of prohibited behavior.
