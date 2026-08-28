# Agent command surfaces

This repository supports several coding-agent clients. Shared behavior is intentional, but each client loads its own command entrypoint.

## `/commit`

Pi has three related layers:

- `pi/extensions/workflow-commands.ts` owns the `/commit` slash command. It is the orchestration loop: inspect and preflight Git, handle dirty direct submodules, select changes, plan commit groups, stage and verify each group, review secrets, confirm messages, create commits, and optionally push.
- `pi/extensions/commit.ts` independently registers the structured tools `commit_plan`, `commit_validate_message`, `commit_stage`, `commit_create`, and `commit_push`. These tools are not the slash command implementation.
- The structured tools are activated when a prompt contains commit or staging intent. They are independently registered, while internal state and confirmation tokens enforce the stage/create boundaries. `commit_stage` requires the exact plan-bound worktree token; `commit_create` requires the exact staged-set token; `commit_push` requires the commit hash returned by creation and never force-pushes.

The slash command and structured tools therefore expose different workflows. The slash command owns orchestration; the tools expose discrete, token-guarded operations.

Claude, OpenCode, and Copilot retain their own command or prompt surfaces and shared commit instructions. The Python `scripts/commit-helper` is a compatibility and parity reference for non-Pi consumers.

## `/do-it`

- **Pi:** `pi/skills/workflow/do-it.md` owns the workflow. Its completion check is contract-focused: run the validation required by the task and do not claim completion when that check fails.
- **Claude Code:** `claude/commands/do-it.md` includes `claude/shared/do-it-instructions.md`.
- **OpenCode:** `opencode/commands/do-it.md` includes the shared Claude instructions.
- **Copilot:** `copilot/prompts/do-it.prompt.md` references the shared Claude instructions.

The non-Pi shared rule is aggregate: `/do-it` requires the project's full repo-wide validation suite, including tests, linting, formatting checks, and the strongest project-defined aggregate check when available. Pi's skill is not governed by that aggregate wording; it validates the task's stated contract.

## `/yt`

All clients use the shared executable root `tools/onclave-youtube/`, but their workflow entrypoints differ:

- **Pi:** `pi/prompts/yt.md`
- **Claude, OpenCode, and Copilot:** their respective prompt surfaces

Keep client-specific command and prompt guidance in the owning surface, and keep the executable client-neutral.
