# Security Reviewer Review

## Finding 1
severity: high

evidence: The plan permits archiving after grep/json/typecheck gates without proving Pi actually loads `pi/prompts/handoff.md`. A malicious or mistaken unsupported `prompts` setting would pass `python -m json.tool` and `grep -n 'pi/prompts'`, leaving operators with a false sense that `/handoff` migrated safely while the command is absent or shadowed at runtime.

required_fix: Add an archive-blocking runtime discovery gate: either an automated Pi command registry/autocomplete check proving `/handoff` resolves to the prompt template source, or a mandatory manual smoke test recorded in the plan before archive.

## Finding 2
severity: high

evidence: The rollback command includes `git restore -- pi/settings.json ... pi/prompts/handoff.md pi/skills/pi-command/SKILL.md`. The plan also notes an existing unrelated newline-only modification to `pi/settings.json`; this rollback would discard that pre-existing work along with the planned change, violating operational safety during incident recovery.

required_fix: Replace broad rollback with a documented preflight snapshot and path-specific restoration strategy that preserves unrelated pre-existing changes, e.g. capture `git diff -- pi/settings.json` before edits and require confirmation before discarding any pre-existing diff.

## Finding 3
severity: medium

evidence: The plan creates a new tracked prompt surface under `pi/prompts/` but does not define a security review gate for prompt-template contents. Prompt templates can instruct agents to read/write files and execute shell patterns; accepting future markdown commands without checks creates a prompt-injection/persistence surface in a trusted dotfiles repo.

required_fix: Add an archive gate requiring review of new or modified prompt templates for unsafe instructions, secret handling, destructive commands, environment-wide mutation, and hidden exfiltration patterns before they become trusted slash commands.

## Finding 4
severity: medium

evidence: The validation contract allows `make check` to be bypassed as “not practical” with documentation, but archive remains allowed after targeted checks. In this repo, broad checks are the main evidence that settings, docs, shell/Python tooling, and cross-platform conventions were not broken by the workflow change.

required_fix: Make repo-wide validation archive-blocking unless there is a recorded environmental blocker with captured output and an explicit compensating validation set. The plan should require classifying failures as introduced vs unrelated before archive.

## Finding 5
severity: medium

evidence: The plan only checks for `/handoff` shadowing in `pi/extensions/workflow-commands.ts`. Project context says top-level `pi/extensions/*.ts` are auto-discovered, so another extension file can register or export a colliding `handoff` command and silently override the prompt template.

required_fix: Add a collision gate that enumerates all extension command registrations/exports across `pi/extensions/*.ts` and fails if any command name collides with a prompt template basename, at minimum covering `handoff`.
