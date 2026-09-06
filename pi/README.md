# Pi Profiles

`pp` launches Pi with an isolated profile directory.

- `pp` uses `pi/profiles/default/`.
- `pp -p legacy` uses `pi/profiles/legacy/`, which contains the previous customized Pi setup and its local runtime state.
- Other named profiles use `~/.pi/profiles/<name>/`.

## Documentation ownership

This file owns cross-profile launcher and directory guidance. Customized legacy runtime documentation lives in [`profiles/legacy/docs/README.md`](profiles/legacy/docs/README.md), with the full setup guide in [`profiles/legacy/README.md`](profiles/legacy/README.md). Those documents do not describe the default profile. Keep new profile-specific documentation with its owning profile rather than recreating a shared `pi/docs/` tree.

## Default profile footer

The operator footer shows repository, model, context, and provider usage. `[reload]` indicates changed resource files since startup or reload. It checks the active profile's resources, trusted project resources, literal configured paths, and loaded command/tool/theme source paths every two seconds. It excludes credentials, sessions, generated model catalogs, and usage ledgers. Monitoring failures display `[reload check failed]`; package glob additions and arbitrary imported dependencies are not comprehensively discovered. Use `/reload` to load changes and reset the baseline.

## Default profile commands

- `/bro` restates the last response in plain language.
- `/commit` quietly delegates review, grouping/messages, staging, and commits to `gpt-5.6-luna` at low reasoning. Unclear grouping falls back to one commit for all eligible changes. Only likely `.gitignore` candidates require a question; completion lists each short hash and commit subject.
- `/commit push` additionally pushes the current branch to `origin`, including existing outgoing commits, without force-pushing.

The [profile-local command system](profiles/default/docs/commands.md) uses an explicit TS registry, Markdown prompts, and optional command-scoped tools. Commands print an invocation and add errors to model context, using the current conversation and model. `/commit` runs the complete Git workflow privately in Luna; the main thread shows progress, ignore-file questions, failures, and the actual commit summary, not routine Git commands/output. Luna flags new files that likely belong in `.gitignore`; dedicated secret handling is deferred. There is no extra test, typecheck, lint, or build phase. Normal Git hooks remain enabled, and actual failures surface and stop the workflow. The workflow targets 30 seconds, with a 30-second active-work budget paused for user decisions and 15-second Git/shell timeouts; no extra staging-ambiguity, path-accounting, or busy-command gates. There are no inventory/report files or custom prepare/execute tools. See [the command contract](profiles/default/docs/commit.md). Use `/reload` to activate changes. The legacy profile's existing command is unchanged.

The compatibility path `~/.pi/agent` points to the legacy profile so direct `pi` invocations retain the previous behavior.
