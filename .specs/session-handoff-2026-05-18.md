# Session Handoff: 2026-05-18

## What happened

Repo was stuck -- `git pull` failed due to stale rebase state, 179 files of unstaged changes, missing git-lfs, and massive branch divergence (417 ahead / 1190 behind origin/main). We reset to origin/main, ran the install script, and fixed issues found during the run.

## Current state

Branch `main` is clean and tracking `origin/main` at `69cdbb3`. Three files have uncommitted changes ready for review and commit.

## Uncommitted changes

### 1. `scripts/zsh-setup` -- add nodejs to Linux apt packages

`nodejs` was missing from `CLI_PACKAGES`. The Pi coding agent install (`pnpm add`) requires Node.js at runtime, but Node was only provided via Brewfile (macOS) and winget (Windows). Linux had no Node install path, causing the Pi agent step to fail with `node: not found`.

```diff
- CLI_PACKAGES=(fzf ripgrep fd-find bat jq curl wget unzip age)
+ CLI_PACKAGES=(fzf ripgrep fd-find bat jq curl wget unzip age nodejs)
```

### 2. `AGENTS.md` -- three new conventions

Added to the Conventions section:

- **No defensive fluff**: Do not use try-catch wrappers, guard flags, or fallback logic unless specifically requested. Solve the domain problem natively. If data or dependencies are missing, fail with explicit exceptions -- not silent defaults. When requirements make code paths redundant, remove them entirely; do not wrap old logic in fallback flags.
- **Completeness contract**: When a task involves a list or batch of items, track scope explicitly. Do not finalize until all items are accounted for -- completed, explicitly skipped with reason, or flagged as blocked.
- **Retrieval budgets**: Stop researching when the core question is answered and additional retrieval is unlikely to change the conclusion. Exhaustive coverage only when explicitly requested.

### 3. `home/.zshrc` -- installer side-effect (review needed)

The bun and pnpm installers appended hardcoded paths to `.zshrc` during the install run:

- `PNPM_HOME` was overwritten from macOS path to `/home/anvil/.local/share/pnpm`
- Bun completions and `BUN_INSTALL` block was appended

This may need cleanup -- the hardcoded `/home/anvil/` paths break cross-platform portability. The pnpm/bun PATH setup should probably live in a `zsh/env.d/` module using `$HOME` instead of being appended raw by installers.

## TODO

- [ ] Review and commit the three changes above (possibly as 2-3 separate commits)
- [ ] Decide whether `.zshrc` bun/pnpm additions should be moved to `zsh/env.d/` for portability
- [ ] Rerun `~/.dotfiles/install` after committing to verify the Pi agent installs cleanly with nodejs available
- [ ] The `production` branch tracks a deleted remote (`origin/production: gone`) -- decide whether to delete it locally
