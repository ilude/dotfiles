## Finding 1

severity: high

evidence: T1 plans to add `pi/settings.json` `prompts` only “if native settings support is confirmed,” but all pass criteria merely run `json.tool` and `grep -n 'prompts'`. Current `pi/settings.json` has no `prompts` key, and no plan task identifies Pi’s exact setting name, path expansion rules, or reload behavior.

required_fix: Before editing settings, inspect Pi runtime docs/source and record the exact prompt-template setting schema. Update acceptance to validate that schema, including whether `~/.dotfiles/pi/prompts` expands correctly on Windows/MSYS and is actually consumed by Pi.

## Finding 2

severity: high

evidence: The plan’s shadow check only searches `pi/extensions/workflow-commands.ts`. `pi/extensions/README.md` says every top-level `pi/extensions/*.ts` is auto-discovered, and the plan itself says extension commands run before templates. A stale or future `registerCommand("handoff"...)` in another top-level extension would still shadow the prompt template while all current checks pass.

required_fix: Change verification to scan every auto-discovered extension, e.g. top-level `pi/extensions/*.ts`, for `registerCommand("handoff"` and `HANDOFF_PROMPT`. Add this as a blocking integration check after migration and in the success criteria.

## Finding 3

severity: medium

evidence: `pi/extensions/tsconfig.json` has `strict: true` but does not enable `noUnusedLocals` or `noUnusedParameters`. The plan relies on `pnpm run typecheck` after removing `/handoff`, but that will not catch stale imports/constants/helpers left behind by command removal unless they create a real type error.

required_fix: Add a targeted cleanup/review check for `workflow-commands.ts`: grep or diff-review for orphaned `HANDOFF_PROMPT`, handoff-only helpers/imports, and duplicate descriptions in the top command list. Do not rely on TypeScript alone for unused cleanup.

## Finding 4

severity: medium

evidence: The prompt-template acceptance checks only require `argument-hint` and the `mktemp -t handoff-XXXXXX.md` instruction. They do not verify the frontmatter delimiter, `description`, filename-to-command mapping, or `$ARGUMENTS`/positional argument behavior that replaces the TypeScript `nextSessionFocus` append.

required_fix: Specify the exact `pi/prompts/handoff.md` frontmatter shape and argument substitution syntax. Add checks for `---`, `description:`, `argument-hint:`, and the template’s use of `$ARGUMENTS` or equivalent to preserve optional focus arguments.
