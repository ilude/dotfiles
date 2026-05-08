---
reviewer: skills-engineer
status: complete
---

# Findings

- severity: high
  evidence: "Plan T3 creates `pi/skills/pi-command/SKILL.md`, but neither the plan nor current `pi/settings.json` specifies how Pi loads project-local skills from `pi/skills/`; the loaded system skills list comes from `C:\\Users\\mglenn\\.pi\\agent\\skills`, and `pi/README.md` only says `pi/skills/` is trackable source."
  required_fix: "Before execution, confirm the Pi skill-loader discovery path for `~/.pi/agent/skills` versus repo `pi/skills`, and add an acceptance check that the installed/symlinked runtime will actually expose `pi-command` to sessions. If needed, place or link the skill in the loader-supported location."

- severity: medium
  evidence: "T3 acceptance only greps for `prompt template` and `TypeScript`, while the objective requires future agents to choose between prompt templates, skills, and TypeScript commands. That check can pass with two vague sentences and no enforceable decision rule."
  required_fix: "Require a concrete placement decision table with at least three rows: prompt-only slash command -> `pi/prompts/*.md`; reusable domain workflow not necessarily slash-invoked -> `pi/skills/<name>/SKILL.md`; runtime/state/UI/autocomplete/git/session behavior -> TypeScript extension. Validate by grepping for those destination paths and trigger terms."

- severity: high
  evidence: "The plan notes extension commands run before prompt templates, but T3 does not require the skill to warn that a TypeScript command name collision shadows a prompt template. A future author could add `/foo` in both places and the markdown command would silently lose."
  required_fix: "Add a mandatory collision section to `pi-command` explaining extension-command precedence, requiring authors to search `pi/extensions/*.ts` for `registerCommand(\"<name>\"` before adding a prompt template and to remove/rename collisions. Include `/handoff` as the worked example."

- severity: medium
  evidence: "T3 says include examples, but does not name required examples or anti-examples. The plan's problem is specifically that `/handoff` was implemented in TypeScript despite being prompt-only; vague examples will not prevent recurrence."
  required_fix: "Require explicit examples: `/handoff` as a prompt-template command, `/commit` or `/test-*` as TypeScript-backed commands, and a reusable workflow skill example. Include an anti-pattern stating 'do not add prompt-only commands to `workflow-commands.ts`'."

- severity: medium
  evidence: "No task updates the global skills inventory or agent activation surface shown to the model. A new `pi-command` skill with good frontmatter may still not be listed in available skills until whatever startup/discovery mechanism indexes it."
  required_fix: "Add a verification step that starts or inspects Pi's skill inventory after adding the skill, or update the documented source that generates the available-skills list. The pass condition should prove `pi-command` appears with activation triggers for creating/reviewing/relocating Pi slash commands."
