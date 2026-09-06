# Profile commands

`extensions/commands.ts` runs the explicit registry in `commands/index.ts` for prompt-backed commands. `extensions/clear.ts` registers the direct runtime alias for `/new`. Everything belongs to this profile; no other profiles or project command directories are scanned. Legacy is unchanged.

- `/bro`: sends the plain-language restatement prompt, without additional tools.
- `/clear`: starts a new session, matching `/new`, and reloads profile resources when the footer shows `[reload]`.
- `/commit [push]`: sends the [commit workflow](commit.md) and temporarily enables `commit_run`, which delegates the complete Git workflow privately to Luna/low.

Each invocation prints only `/name` in the transcript, without a label or “Running” prefix. Prompt text is added to model context without filling the screen. Commands use the current conversation and selected model. There is no extra busy-command rejection gate. Dispatch/usage errors are visible and added to model context; idle failures trigger a response so the model can discuss them. Tool execution errors use Pi's normal visible, model-readable error results. Registration failures caught by this extension are reported at session start and invocation. Syntax/import failures that prevent the extension itself from loading remain Pi loader errors, outside this handler.

Command tools are registered but inactive initially. They are enabled only for their command run, including automatic retries/compaction/queued continuations, and removed when the agent settles or the session shuts down. Built-in tools and other extensions' tools are preserved. Execution also checks command ownership. This controls availability, not a security sandbox: ordinary shell tools still have their normal permissions. `/commit` handles ignore-file decisions inside its running tool through Pi's UI. Answering resumes the same Luna task, with its active-work timer paused during the question.

## Add a command

Prompt-backed commands use the registry below. Direct runtime commands, such as `/clear`, can instead register their own handler in `extensions/` when they need Pi command context methods. `/clear` checks the same reload monitor used by the footer and calls the runtime reload flow in the replacement session when the monitor has marked reload as needed.

1. Add `commands/<name>/prompt.md` containing plain Markdown instructions (no frontmatter or template syntax required).
2. Add `{ name, description }` to `commands/index.ts`.
3. Optionally provide an `arguments(args)` function returning extra prompt text (throw for invalid usage), `completions`, and a `tools(pi)` factory returning Pi tool definitions. Import that factory explicitly from a neighboring `tools.ts`.
4. Run `/reload` to register the new command/tool code. Prompts are read at invocation; the footer watches the commands directory for changes.

Commands without an argument handler accept no arguments. Tool names must be unique and should be prefixed with the owning command name. This deliberately uses a small TS registry instead of dynamic module discovery, another metadata format, or a plugin manager.

`/commit` delegates review and Git mutations to an isolated in-memory agent using `openai-codex/gpt-5.6-luna` at low reasoning. The tool owns that fixed assignment and explicit instructions, read/shell tools, and ignore-file UI—not the parent conversation. Only progress, questions, errors, and the final result are exposed. The current model presents the result without redoing Git work. General named-agent dispatch, arbitrary context transfer, command chains, parallel execution, and background job management remain unimplemented.
