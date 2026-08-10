# Zsh instructions

- Prefer `${ZDOTDIR:-$HOME}` over raw `~` or `$HOME` when shell configuration or prompt paths cross the Git Bash/MSYS2 boundary.
- Compare Windows-home paths case-insensitively during WSL prompt normalization.
- Use the canonical platform helpers in `rc.d/00-helpers.zsh`; standalone scripts may redefine platform detection only when they must remain self-contained.
