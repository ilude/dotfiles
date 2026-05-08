---
reviewer: reviewer
status: complete
---

# Findings

- severity: high
  evidence: "T1 says 'Prefer `pi/settings.json` `prompts` array if native settings support is confirmed', but its verification is only `python -m json.tool pi/settings.json >/dev/null && grep -n 'prompts' pi/settings.json`."
  required_fix: "Add an explicit verification step that proves Pi actually loads prompt directories from the configured setting, or cite the exact Pi settings schema/source file that supports the `prompts` array before editing settings."

- severity: medium
  evidence: "Automation Plan rollback uses `git restore -- pi/settings.json pi/extensions/workflow-commands.ts pi/prompts/handoff.md pi/skills/pi-command/SKILL.md`, but `pi/prompts/handoff.md` and `pi/skills/pi-command/SKILL.md` are new files."
  required_fix: "Change rollback instructions to handle untracked files explicitly, e.g. `git restore -- pi/settings.json pi/extensions/workflow-commands.ts pi/extensions/README.md pi/AGENTS.md` plus `rm -f pi/prompts/handoff.md pi/skills/pi-command/SKILL.md` after confirmation."

- severity: medium
  evidence: "T4 Files list only `pi/extensions/README.md and/or repo-level agent guidance`, while V2 diff includes `pi/AGENTS.md`; the plan does not establish whether `pi/AGENTS.md` exists or is the correct repo-level guidance path."
  required_fix: "Name the exact documentation target(s) after preflight inspection, or add a task step to inspect existing Pi docs and choose one tracked file before editing."

- severity: low
  evidence: "Constraints mention 'Current working tree has a newline-only modification to `pi/settings.json`; preserve or intentionally include it with the settings change.'"
  required_fix: "Add a preflight/diff check specifically for `pi/settings.json` line-ending/newline state and require the implementer to document whether that pre-existing change was preserved or intentionally absorbed."
