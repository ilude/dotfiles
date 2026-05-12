## Finding 1
severity: HIGH
evidence: PRD requires local state/scratch via `git rev-parse --git-path dolos/...` and says this handles worktrees safely, but it does not define whether state is per-worktree or common across linked worktrees. In Git, `--git-path` may resolve under a worktree-specific gitdir for some paths, while refs/object state is common. Two worktrees sharing `.dolos/artifacts/private.tar.gz.age` can maintain divergent `private/` trees and independent index files.
required_fix: Specify the worktree contract: local Dolos index/scratch is per-worktree, artifact freshness is checked against the checked-out commit/upstream, and tests must create two linked worktrees to verify one cannot auto-pack over artifact changes from the other.

## Finding 2
severity: HIGH
evidence: `/commit push` must fetch and hard-block auto-pack if upstream changed `.dolos/artifacts/**`, but the comparison base is undefined. `git fetch --all --prune` does not say which upstream branch, remote-tracking ref, merge-base, or file-diff command determines “upstream changed,” especially with no upstream, multiple remotes, diverged histories, or a non-push `/commit`.
required_fix: Define the exact algorithm: resolve `@{upstream}` when present, fetch its remote, compute `merge-base HEAD @{upstream}`, inspect `git diff --name-only <base>..@{upstream} -- .dolos/artifacts`, and block only auto-pack when matches exist; add acceptance tests for no-upstream, behind-only, ahead-only, and diverged cases.

## Finding 3
severity: MEDIUM
evidence: PRD says no auto-pack/decrypt from Git hooks in MVP and old hooks must be removed or wrapped, while this repo currently has `.git/hooks/pre-commit` invoking `scripts/git-hooks/pre-commit-x-private` and tracked `hooks/pre-commit`. The PRD does not specify hook ownership/boundaries after migration or whether Dolos warnings belong in `/commit`, Git hooks, or install-time hook setup.
required_fix: Add explicit hook requirements: no hook may stage or encrypt Dolos artifacts; any hook may only block/warn on staged plaintext under `private/` and must be idempotently installed or deliberately left uninstalled. Include verification of `core.hooksPath`/`.git/hooks/pre-commit` behavior after migration.

## Finding 4
severity: MEDIUM
evidence: Artifact tracking rules are incomplete. Existing repo rules ignore/allow `.encrypted/**/*.age` and mark `.encrypted/**/*.age` binary, but PRD introduces `.dolos/artifacts/private.tar.gz.age` and `.dolos/authorized_keys` without requiring `.gitignore` or `.gitattributes` updates. Without explicit rules, planners may forget binary `-diff/-merge`, accidentally ignore `.dolos`, or fail to keep scratch under git-path only.
required_fix: Add requirements to track `.dolos/authorized_keys` and `.dolos/artifacts/*.tar.gz.age`, ignore no live `.dolos` scratch in the worktree, and mark `.dolos/artifacts/*.tar.gz.age binary -diff -merge` in `.gitattributes`. Acceptance should verify `git check-ignore` and `git check-attr` for these paths.

## Finding 5
severity: MEDIUM
evidence: Build requirement references the `claude/claude-status-go` Docker pattern, whose `build.sh` installs directly to `$HOME/.claude/<binary>`. PRD acceptance expects an executable at an “expected path” but does not define whether Dolos outputs to repo `bin/dolos`, `$HOME/.dotfiles/bin/dolos`, or platform-specific `.exe`. Reusing the pattern literally would install outside the repo and may not satisfy dotfiles symlink/install conventions.
required_fix: Specify Dolos build/install convention: Docker build may mirror GOOS/GOARCH/BINARY, but output must be `bin/dolos` or `bin/dolos.exe` in the repo/install-managed location. Require the build script to avoid writing to client-specific `~/.claude` paths and verify on Git Bash/MSYS/WSL naming.
