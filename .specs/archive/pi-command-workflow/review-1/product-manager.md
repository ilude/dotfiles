# Product Manager Review

## Finding 1
severity: high

evidence: The plan's T1 acceptance requires adding a `prompts` entry to `pi/settings.json`, but the current settings file has no comparable key and the plan cites no source file, package doc, or runtime schema proving that `prompts` is the supported setting name. The plan itself says "if native settings support is confirmed," but the checkbox can pass with only `grep -n 'prompts'`.

required_fix: Add a discovery task before editing settings: identify the actual Pi prompt-template configuration key/source, then update T1 verification to validate that exact key rather than grepping for a guessed string.

## Finding 2
severity: high

evidence: The plan removes `/handoff` from TypeScript even though the current implementation uses `echoSlashCommand(pi, "handoff", args)` and `sendHiddenWorkflowPrompt(...)`. A prompt template may not preserve hidden dispatch or slash echo behavior; the plan only asserts "native TUI behavior" without proving equivalence.

required_fix: Define the acceptable behavior delta explicitly. If hidden prompt injection and echo are required, keep TypeScript or add evidence that native templates provide equivalent behavior. If not required, state that this migration intentionally changes those behaviors.

## Finding 3
severity: medium

evidence: The selected scope includes settings changes, TypeScript removal, new prompt template, new skill, and documentation updates. For a convention correction, that is broad and creates multiple failure modes before proving that one prompt template works. The rejected `pi/commands` loader is avoided, but the plan still adds durable process artifacts immediately.

required_fix: Split into a smaller first increment: prove `pi/prompts/handoff.md` discovery and remove the shadowing command. Add the skill/docs only after the prompt-template path is verified in Pi, or make them a follow-up plan.

## Finding 4
severity: medium

evidence: T3 creates `pi/skills/pi-command/SKILL.md`, but loaded project guidance says existing Pi workflow skills live under `pi/skills/workflow/`, and available runtime skills are under `~/.pi/agent/skills`. The plan does not prove that `pi/skills/pi-command` will be discovered or used by agents.

required_fix: Verify repo skill conventions before choosing the path. Either place the skill where Pi loads project skills, or make it plain documentation if automatic skill activation is not supported from `pi/skills/pi-command`.

## Finding 5
severity: low

evidence: Several checks are weak grep tests: `grep -n 'prompts'`, `grep -n 'argument-hint'`, and `grep -n 'prompt-only\|prompt template\|runtime'`. These can pass with comments, unrelated docs, or invalid frontmatter. They do not prove slash autocomplete or argument substitution works.

required_fix: Replace grep-only gates with structural checks where possible: parse JSON, validate markdown frontmatter boundaries/fields, and add one documented manual smoke test for `/handoff` autocomplete after reload if no automated prompt-template registry test exists.
