# Claude Code Configuration

Claude Code-specific configuration subtree inside the dotfiles monorepo. This directory is linked to `~/.claude` by the repo installer and related setup scripts.

This is not a standalone Git repository workflow. Manage changes from the root dotfiles repo.

## Contents

- **CLAUDE.md** - Independent Claude-specific global instructions
- **commands/** - Claude command definitions; this is also the canonical shared command source for OpenCode overlays
- **settings.json** - Claude Code runtime settings
- **hooks/** - Claude hook implementations
- **agents/** - Claude agent definitions
- **skills/** and **shared/** - Claude-specific workflows and shared instruction fragments
- **downloads/**, **ide/**, **sessions/**, **session-env/**, **tasks/**, and **teams/** - ignored runtime state created as needed

## Installation

The top-level repo installer handles the normal setup flow:

```bash
~/.dotfiles/install
```

Or on Windows PowerShell:

```powershell
~\.dotfiles\install.ps1
```

Relevant helper scripts:

- `scripts/claude-link-setup` migrates or links an existing `~/.claude` into this repo layout.
- `scripts/claude-mcp-setup` configures Claude MCP integration.
- `scripts/claude-plugins-setup` configures Claude plugins.

### Existing Claude Home Migration

If you already have a populated `~/.claude`, `scripts/claude-link-setup` will:

1. back it up,
2. merge selected machine-specific files into `claude/`,
3. replace `~/.claude` with a link to this directory.

Make changes from the root repo, not by treating `~/.claude` as an independent checkout.

## File Structure

```text
claude/
├── .gitignore              # Protects sensitive files
├── README.md               # This file
├── CLAUDE.md               # Independent Claude-specific global instructions
├── settings.json           # Claude Code settings
├── commands/               # Shared command source for Claude and OpenCode
├── hooks/                  # Claude hooks
├── agents/                 # Claude agents
├── skills/                 # Claude-specific skills
├── shared/                 # Shared Claude instruction fragments
└── runtime state/          # Ignored downloads, IDE, session, task, and team data
```

### Excluded from Version Control

The following files and directories are automatically excluded via `.gitignore`:

- `.credentials.json` - API credentials
- `history.jsonl` - Session history
- `file-history/` - File version history
- `projects/` - Project-specific session data
- `todos/` - Session todos
- `debug/` - Debug logs
- `shell-snapshots/` - Temporary shell snapshots
- `downloads/` - Downloaded runtime artifacts
- `ide/` - IDE state files
- `session-env/` and `sessions/` - Session-specific runtime state
- `tasks/` and `teams/` - Claude task and team coordination state
- `statsig/` - Analytics data

## Usage

### Guidance Layers

- Root `AGENTS.md` contains repository-specific rules for all coding agents.
- `pi/AGENTS.md` contains Pi-specific global instructions.
- `CLAUDE.md` independently owns Claude-specific global instructions; keep shared repository rules in root `AGENTS.md` rather than linking these client files.
- Nested `.claude/CLAUDE.md` files still take precedence inside subprojects such as `modules/onclave/`.

### Custom Commands

Command definitions and their argument hints live under `commands/`. For example,
`/commit [push]` creates logical Git commits with optional push.

## Best Practices

### Before Committing Changes

1. Review your changes:
   ```bash
   cd ~/.dotfiles
   git status
   git diff
   ```
2. Ensure no sensitive data is staged.
3. Restart Claude Code and verify rules, hooks, and custom commands behave as expected on the current machine.

### Syncing Across Machines

Sync the root dotfiles repository, then rerun the installer or the relevant setup helpers if needed.

## Troubleshooting

### Changes not being applied

- Restart Claude Code.
- Check file permissions with `ls -la ~/.claude`.
- Verify the linked files match the root dotfiles repository.

### Accidentally committed sensitive data

1. Remove the data from history.
2. Force-push only if you understand the impact.
3. Rotate compromised credentials immediately.

## Security Notes

- **NEVER commit** `.credentials.json` or any files with API keys.
- The `.gitignore` is configured to prevent common sensitive files.
- Review all changes before pushing.
- Use a private repository if it contains identifying information.

## License

Personal configuration inside the dotfiles repo.

## Related Resources

- [Claude Code Documentation](https://docs.claude.com/claude-code)
- [Writing Custom Commands](https://docs.claude.com/claude-code/custom-commands)
- [CLAUDE.md Ruleset Guide](https://docs.claude.com/claude-code/rulesets)
