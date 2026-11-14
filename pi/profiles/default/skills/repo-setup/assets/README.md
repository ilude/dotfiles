# Template selection

Replace __PLACEHOLDERS__ and remove unused sections; do not copy the bundle blindly.

- AGENTS.md.template: repo-local decisions and routing.
- README.md.template: operator setup, configuration and actual focused checks.
- setup-windows.ps1.template: Windows/Python variant. Set the name and explicit
  Python project paths (use '.' for a single root project); adjust tools and sync
  commands for another stack. Do not install uv in a non-Python repo without a consumer.
- gitignore.template: keep only applicable artifact patterns. Do not ignore a safe
  tracked default merely because machine-local configuration is also JSON.
- CHANGELOG.md.template and changelog/SKILL.md.template: adapt the changelog style
  and native skill location to the target. Existing policy takes precedence.
- CLAUDE.md.template: optional pointer when Claude actually consumes this repo.

References are relative to the skill. Templates do not provision services,
authenticate providers, initialize/synchronize Git or authorize publication.
