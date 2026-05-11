- severity: high
  evidence: Plan T4 only says tests/grep must show no active `/team` command remains (`plan.md:78-80`), but the current auto-discovered top-level extension `pi/extensions/agent-team.ts` registers `pi.registerCommand("team")` (`agent-team.ts:168-172`). Leaving that file in place, even with docs changed, keeps `/team` active.
  required_fix: Amend T4 to require deleting, renaming out of auto-discovery, or converting `pi/extensions/agent-team.ts` into non-registering shared code, plus a registration test that loads extensions and asserts `team` is absent.

- severity: high
  evidence: T6 requires explicit team/lead dispatch through `subagent` (`plan.md:86-88`), while the existing `subagent` extension is a tool-only directory extension (`pi/extensions/subagent/index.ts:1-12`) and has no command parser for team keys. The plan never specifies whether this is a new tool schema, slash command, or fields on the existing `subagent` tool.
  required_fix: Define the public registered interface for team dispatch: exact `subagent` tool input fields, schema, resolution rules, and expected outputs/errors. Require tests to invoke the registered tool, not imported resolver helpers.

- severity: medium
  evidence: The plan bans top-level helper `.ts` files because every top-level extension is auto-discovered (`plan.md:42`), but T10 says “Add LLM-callable MVP task tools” without specifying module placement (`plan.md:106-108`). Implementers may add `pi/extensions/task-tools.ts`, unintentionally creating another auto-discovered extension boundary.
  required_fix: Amend T10 to name the target module/location, e.g. register task tools from existing `pi/extensions/tasks.ts` or a subdirectory `pi/extensions/tasks/index.ts`, and require an extension-discovery test proving no unintended top-level task helper is registered.

- severity: medium
  evidence: T10 requires registered tools named `TaskCreate`, `TaskCreateMany`, `TaskList`, `TaskGet`, and `TaskUpdate` (`plan.md:106-108`), but current Pi tool names are lower_snake_case in available tools and extensions such as `commit_plan`, `test_run`, and `ask_user`. UpperCamelCase may be unusable or inconsistent for model/tool routing.
  required_fix: Decide and document canonical tool names before implementation. Prefer existing lower_snake_case convention or explicitly verify UpperCamelCase support with a registered-tool integration test and update command/docs references accordingly.

- severity: medium
  evidence: T11 requires `/tasks create`, state transitions, settings, and clear flows (`plan.md:110-112`), but T9 only guards secret redaction generally (`plan.md:100-102`). Existing `/tasks` currently renders task prompt/preview fields (`tasks.ts:177-180` and detail rendering earlier), so command-created task input is a direct persistence/rendering path.
  required_fix: Add per-command acceptance criteria requiring `/tasks create/show/list` and task tool create/update tests to submit synthetic secret sentinels through registered commands/tools and assert persisted JSON plus command output are redacted or rejected.
