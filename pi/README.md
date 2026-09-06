# Pi Profiles

`pp` launches Pi with an isolated profile directory.

- `pp` uses `pi/profiles/default/`.
- `pp -p legacy` uses `pi/profiles/legacy/`, which contains the previous customized Pi setup and its local runtime state.
- `pp -p <name> --resume <session-id-or-path>` resumes a saved session in that profile.
- Other named profiles use `~/.pi/profiles/<name>/`.

## Documentation ownership

This file owns cross-profile launcher and directory guidance. Customized legacy runtime documentation lives in [`profiles/legacy/docs/README.md`](profiles/legacy/docs/README.md), with the full setup guide in [`profiles/legacy/README.md`](profiles/legacy/README.md). Those documents do not describe the default profile. Keep new profile-specific documentation with its owning profile rather than recreating a shared `pi/docs/` tree.

## Default profile footer

The operator footer shows repository, model, context, and provider usage. `[reload]` indicates changed resource files since startup or reload. It checks the active profile's resources, trusted project resources, literal configured paths, and loaded command/tool/theme source paths every two seconds. It excludes credentials, sessions, generated model catalogs, and usage ledgers. Monitoring failures display `[reload check failed]`; package glob additions and arbitrary imported dependencies are not comprehensively discovered. Use `/reload` to load changes and reset the baseline.

## Default profile scheduling

The agent-facing `schedule` tool provides one-shot `create_at`, `list`, and `cancel` actions. Use a positive duration (`30s`, `15m`, `2h`, `1d`) or a future ISO timestamp; timestamps without an offset use local time. There are no scheduling slash commands, recurring jobs, persistence, metrics, or extra dependencies. To change a schedule, cancel it and create another.

Schedules live only in the current Pi process. They survive `/new`, `/resume`, `/fork`, and `/reload`, delivering into whichever conversation is active, not necessarily the originating project. At the due time, Pi receives a follow-up prompt: idle agents start a turn; busy agents finish their current work first. Closing Pi discards all schedules, and timers do not keep a noninteractive process alive. Prompts due during session replacement are handed off after rebinding. Cancelling works only before handoff; prompts already in Pi's queue cannot be recalled by this tool.

The footer shows only the next injection time (`sched@ 9:00am`, local time), clearing when none remains. It does not show pending states or errors. Synchronous handoff failures remain inspectable through `list`, with no automatic retries or injected error prompts; cancel and reschedule them. Limits remain 64 outstanding schedules and 4,000 characters per prompt; slash-command prompts are rejected. Use `/reload` to activate the tool.

## Default profile web tools

The default profile provides `web_search` (SearXNG) and `web_fetch` (local readable extraction with automatic public-URL Jina fallback). A tool-free Luna call adds best-effort prompt-injection annotations before results enter context; screening failures are marked, not blocked. See [setup, behavior, and limitations](profiles/default/docs/web-tools.md).

## Default profile commands

- `/branch` opens a branched copy of the current session in a new terminal tab.
- `/bro` restates the last response in plain language.
- `/clear` starts a new session, matching `/new`, and reloads profile resources when the footer shows `[reload]`.
- `/commit` quietly delegates review, grouping/messages, staging, and commits to `gpt-5.6-luna` at low reasoning. Unclear grouping falls back to one commit for all eligible changes. Only likely `.gitignore` candidates require a question; completion lists each short hash and commit subject.
- `exit` or `/exit` gracefully quits Pi; Pi prints its built-in resume hint on shutdown.
- `/effort [level]` shows or sets thinking effort.
- `/handoff`, `/init`, `/summarize`, and `/war-report` are native prompt templates.
- `/new-instance` opens a new Pi instance for the current profile; `/new-terminal` opens a plain shell.
- `/yt <request>` ingests, searches, lists, or fetches YouTube content through Onclave, then compares ingested videos with the current repository without modifying it.
- `/yt-local <url-or-id> [transcript|metadata] [options]` explicitly fetches local YouTube artifacts without uploading them to Onclave.
- `/commit push` additionally pushes the current branch to `origin`, including existing outgoing commits, without force-pushing.

The [profile-local command system](profiles/default/docs/commands.md) uses an explicit TS registry, Markdown prompts, and optional command-scoped tools. Commands print an invocation and add errors to model context, using the current conversation and model. `/commit` runs the complete Git workflow privately in Luna; the main thread shows progress, ignore-file questions, failures, and the actual commit summary, not routine Git commands/output. Luna flags new files that likely belong in `.gitignore`; dedicated secret handling is deferred. There is no extra test, typecheck, lint, or build phase. Normal Git hooks remain enabled, and actual failures surface and stop the workflow. The workflow targets 30 seconds, with a 30-second active-work budget paused for user decisions and 15-second Git/shell timeouts; no extra staging-ambiguity, path-accounting, or busy-command gates. There are no inventory/report files or custom prepare/execute tools. See [the command contract](profiles/default/docs/commit.md). Use `/reload` to activate changes. The legacy profile's existing command is unchanged.

The compatibility path `~/.pi/agent` points to the legacy profile so direct `pi` invocations retain the previous behavior.
