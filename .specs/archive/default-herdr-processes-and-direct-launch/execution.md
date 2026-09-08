# Execution evidence: 2026-09-08

## Ownership and integration

- Task worktree: `.worktrees/default-herdr`, branch `feature/default-herdr`.
- Merge target: `main` in `C:/Users/mglenn/.dotfiles`.
- Actual implementation/test profile: `.worktrees/default-herdr/pi/profiles/default/`.
- Pi CLI reported 0.85.0; Node 25.9.0; installed Herdr 0.8.2 preview. Pi global dependency links include some 0.85.1 packages, matching the installed workstation dependency-link setup.
- User approved automatic Herdr use for requested long-running servers/logs, preserving focus.
- No module changes, third-party Pi extension, new supervisor, or delegation surface.

## Implementation

- Deferred `herdr_layout` and `herdr_pane`, a bounded native-argv CLI adapter, and the dynamic documentation skill.
- Run verifies Bash/PowerShell foreground identity/cwd, asks the existing Damage Control gate over Pi's event bus, and reinspects before one submission. Gate absence, denial, or changed identity prevents submission. Read-only/cancellation/ownership behavior stays within the scoped tools.
- Local plugin template/setup plus same-process Node bootstrap; exact profile/branch file input; default preflight and repair mode; direct command launch and tab rename.
- Generated Herdr version 8 lifecycle integration, unmodified, plus the native prompt bridge. No existing footer or approval-view changes.
- User documentation and changelog updated.

## Automated checks

- Initial six-file focused run: 18 passed, one existing visibility expectation failed because it listed only the previous three deferred tools. Updated that expectation; its two tests then passed.
- Bootstrap suite expanded to five passing tests, including real subprocess argv/env/preflight and exact plugin-only exit cleanup. Across the six focused files, 21 tests pass.
- `pnpm run typecheck` passed.
- `pnpm run check:runtime` passed with the real Pi loader/bootstrap guard, policy, grammars, and eight native schemas; no model call/tool execution in that check.
- The live tool fixture exercised the real loaded gate and current policy, not a substituted approval result.

## Live acceptance in an isolated Herdr server

Temporary root: `C:/Users/mglenn/AppData/Local/Temp/herdr-implementation-L1Louc/`.
Session: `pi-implementation-check`. Config/registry/socket were isolated; sound/toast delivery disabled and no client attached.

- Actual production tool callbacks created a PowerShell sibling pane, verified its process/cwd, passed a Node fixture command through the actual Damage Control gate, submitted once, matched a fresh readiness marker, and received the expected loopback HTTP response.
- Interruption returned the shell prompt for the Node fixture; the owned-pane close removed it.
- The production `/new-instance` and `/branch` commands created direct Pi tabs with preserved titles, cwd, profile, and distinct child pane/session identities. Process ancestry was `Herdr -> Node bootstrap/Pi`, not a shell. The branched tab visibly restored `HERDR_BRANCH_CONTEXT_FIXTURE` from its exact session file. The inert seeded assistant message used an intentionally nonexistent model and caused an expected model-fallback warning, not a model invocation.
- `/new-terminal` still created a PowerShell tab. `/reload` retained the normal default footer/resources and rebound the gate successfully; a subsequent tool command passed through it.
- The real current `promptDecision()` custom dialog with an inert request produced unfocused `blocked`; Escape denied it without executing anything, then Herdr reported `done`. No second prompt reporter was loaded.
- Docker/Compose used an existing Alpine image with pulls disabled, no mounts/network/ports, and limited CPU/memory. Production tools submitted `compose logs -f`, matched fresh output, interrupted/read/closed the owned viewer, and an immediate Docker inspection still reported the detached container `running`. The exact fixture project was then removed.

## Relevant failures and corrections

- A fresh worktree lacked the existing nested web-tools dependencies, causing Pi startup failure. Installed that package's frozen dependencies with pnpm `--ignore-workspace`; no manifest/lockfile change. A short-lived hypothesis that bundled Pi could not be imported was disproved by a direct `--help` probe; the unnecessary child-Node wrapper was removed. Final code uses same-process loading.
- Setup initially inherited the production socket despite isolated config directories. The resulting task-owned `local.pi` link was identified by its exact worktree path and unlinked. Setup was then routed to the isolated socket. No production pane was opened. Documentation explicitly calls out this isolation requirement.
- The installed preview sometimes replaced an exited focused plugin Pi pane with a shell. The bootstrap now explicitly closes only its own `local.pi` pane at process exit. Live focused exit then removed the pane without a replacement shell; a subprocess test covers the exact cleanup identity and excludes unrelated plugins.
- A finite Compose fixture expired during the manually paced checks. The conclusive ownership check ran as one bounded script, waited for actual tool completion, asserted the container remained running after viewer close, and cleaned it in `finally`.

## Cleanup and remaining acceptance

- Temporary validation extension copied into the temporary evidence directory, then removed from the worktree. It is not part of the implementation.
- Test Pi exited; the isolated plugin was unlinked and server stopped. Session list confirmed stopped. Exact Compose project container query returned empty. Production panes/settings were not changed.
- Temporary source/log evidence remains in Temp only. The worktree's generated plugin manifest is ignored and must not become the production link. Run setup from the lasting main checkout after integration.
- **Accepted limitation (2026-09-08):** the user explicitly accepted physical sound/desktop delivery as unverified and authorized archival/merge. State API and rendered text checks passed, but cannot establish audible/desktop delivery. No settings were changed to manufacture a passing result.
- Implementation and agreed acceptance are complete. The dated archived plan and implementation are delivered together to main; no push is authorized.
