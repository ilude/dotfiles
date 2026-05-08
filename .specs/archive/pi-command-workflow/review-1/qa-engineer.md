# QA Engineer Review

## Finding 1
severity: high

evidence: The core risk is TUI discovery, but no required gate actually starts/reloads Pi or inspects the slash-command registry/autocomplete. Success criteria can pass with `pi/prompts/handoff.md`, a `prompts` string in JSON, and no TypeScript shadow while `/handoff` remains invisible because the setting key/path/reload semantics are wrong.

required_fix: Add a required discovery verification: either an automated Pi command-registry/listing check proving `handoff` is registered from the prompt template, or a mandatory manual smoke test before completion/archive: reload Pi, type `/hand`, verify description and argument hint.

## Finding 2
severity: high

evidence: T1 explicitly says “if native settings support is confirmed,” but its acceptance check is only `python -m json.tool ... && grep -n 'prompts'`. Current `pi/settings.json` has no prompt-template setting, and grep can pass for an unsupported key. This creates a false-positive path where the configured directory is ignored.

required_fix: Add a precondition task to identify Pi’s actual prompt-template configuration schema from runtime code/docs. Update verification to assert the exact supported key and path normalization behavior, not just any `prompts` text.

## Finding 3
severity: high

evidence: The migration preserves only prompt text fragments by grep. It does not test argument substitution or expansion semantics. Current TypeScript appends `Next session focus: ${args.trim()}` and dispatches hidden workflow prompt; a template using `$ARGUMENTS` incorrectly, missing conditional behavior, or rendering literal placeholders would still satisfy the planned checks.

required_fix: Define expected `/handoff <focus>` expansion output and verify it. If Pi has no dry-run/template expansion test, require a manual execution smoke test that confirms the submitted prompt includes the focus and the mktemp/read-before-write instruction.

## Finding 4
severity: medium

evidence: Repo-wide validation is underspecified as “make check if available and practical; otherwise document why.” This repo’s guidance lists `make check`, but the plan gives no timeout, fallback hierarchy, or distinction between unrelated failures and task blockers. `/do-it` could skip broad validation too easily.

required_fix: Make `make check` required with a reasonable timeout. If it fails, require captured output, classification as unrelated/environmental vs introduced, and successful targeted fallback commands before allowing archive.

## Finding 5
severity: medium

evidence: No regression test is added for future command collisions. The plan removes the current `registerCommand("handoff")`, but only greps this file once. A later extension file or auto-discovered TypeScript command could reintroduce `handoff` and shadow the template without test coverage.

required_fix: Add a durable test or validation script that enumerates extension command names and fails if any prompt-template command name is also registered by an extension, at least covering `handoff` for this migration.
