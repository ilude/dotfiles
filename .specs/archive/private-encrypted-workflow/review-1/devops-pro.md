# devops-pro review: Git hook and worktree operational safety

## Finding 1: High — hook installer is not worktree-safe

**Evidence:** `scripts/install-x-private-hook` writes directly to `Path(".git/hooks/pre-commit")`. In a linked git worktree, `.git` is a file that points to the real per-worktree gitdir, so `.git/hooks` is not a valid directory. The plan requires all implementation/final commit in `../.dotfiles-private-encrypted-workflow`, but does not require validating hook installation from that worktree.

**required_fix:** Update hook installation to resolve the hook path via `git rev-parse --git-path hooks/pre-commit` or `git rev-parse --git-common-dir`/per-worktree gitdir as appropriate, then add an acceptance/validation check that runs `scripts/install-x-private-hook --dry-run` and the real install in a linked worktree fixture.

## Finding 2: High — worktree preflight checks the wrong git-state paths

**Evidence:** The worktree preflight command checks `.git/rebase-merge`, `.git/rebase-apply`, and `.git/MERGE_HEAD` directly. In linked worktrees `.git` is a pointer file, and merge/rebase state paths must be discovered with `git rev-parse --git-path ...`. This can miss an in-progress merge/rebase or report misleading results when `/do-it` starts from a dirty/original checkout.

**required_fix:** Replace direct `.git/...` tests with `git rev-parse --git-path rebase-merge`, `rebase-apply`, and `MERGE_HEAD` checks, and run them against both the original checkout before creating the worktree and the new worktree after creation.

## Finding 3: Medium — hook can stage encrypted artifacts for unrelated ignored private files

**Evidence:** The planned hook behavior is unconditional: if `private/` exists, run `scripts/private-archive-encrypt` and `git add -- .encrypted`. Because `private/` is ignored, a developer making an unrelated commit from a dirty checkout/worktree can accidentally stage `.encrypted/**.age` for every local private file, including untracked files not related to the commit.

**required_fix:** Add a pre-commit safety policy and tests: either require an explicit opt-in env var/command for auto-staging all private files, or make the hook print the `.encrypted/` paths it staged and fail when new encrypted artifacts would be added during a commit with no staged private-workflow changes.

## Finding 4: Medium — deletion/rename behavior is not a validation gate

**Evidence:** The plan notes that per-file outputs create “stale-output handling decisions,” but acceptance criteria only test create/decrypt. There is no required test proving that deleting or renaming `private/a/note.txt` removes/stages deletion of `.encrypted/a/note.txt.age`; otherwise stale encrypted private data can remain committed forever.

**required_fix:** Add script and hook tests for delete and rename cases: after removing a private file, encryption must remove the corresponding `.encrypted/*.age`, and the hook must stage that deletion with `git add -- .encrypted`/equivalent.

## Finding 5: Medium — rollback can delete pre-existing user worktree/branch state

**Evidence:** The plan says on V0 failure “remove incomplete worktree/branch if safe,” while the preflight also stops if `refs/heads/plan/private-encrypted-workflow` or `../.dotfiles-private-encrypted-workflow` already exists. In a dirty operational environment, a partial prior run or user-created path can be mistaken for this run’s artifact.

**required_fix:** Create a run marker inside the new worktree immediately after successful creation, and only allow automated rollback when that marker exists and the worktree branch/HEAD match the just-created branch. Otherwise stop and report manual cleanup instructions.
