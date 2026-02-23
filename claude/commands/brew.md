---
description: Sync Brewfile with installed Homebrew packages
model: haiku
---

Update the Brewfile at the root of the dotfiles repo to match currently installed Homebrew packages.

## Steps

1. Verify `brew` is available. If not, exit with a message.

2. Get top-level formulae (not dependencies):
   ```bash
   brew leaves --installed-on-request
   ```

3. Get installed casks:
   ```bash
   brew list --cask
   ```

4. Get taps beyond the defaults (`homebrew/core` and `homebrew/cask`):
   ```bash
   brew tap
   ```

5. Read the current Brewfile from the dotfiles repo root.

6. Compare installed packages against the Brewfile. Report:
   - **New** packages installed locally but missing from Brewfile
   - **Removed** packages in Brewfile but no longer installed
   - **Unchanged** count

7. If there are differences, update the Brewfile with the following format and sorting:
   - Taps first (sorted), then a blank line
   - Formulae next as `brew "name"` (sorted), then a blank line
   - Casks last as `cask "name"` (sorted)
   - Each section gets a `# Section` comment header

8. Show a summary of changes made.

## Rules

- Only include top-level formulae from `brew leaves`, never transitive dependencies
- Sort all entries alphabetically within their section
- Preserve the tap prefix for formulae from non-default taps (e.g., `brew "oven-sh/bun/bun"`)
- Do NOT run `brew install`, `brew uninstall`, or `brew bundle` — this command only updates the Brewfile
