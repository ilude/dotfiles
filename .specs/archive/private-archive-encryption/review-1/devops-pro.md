## Finding 1

severity: high
evidence: T1 and Success Criteria use `git check-ignore private/ private.tar private.conflicts/ && ! git check-ignore private.tar.age`. `git check-ignore` with multiple paths exits 0 if any supplied path is ignored, so this can pass when `private.tar` or `private.conflicts/` is not ignored, as long as `private/` is ignored.
required_fix: Replace with per-path assertions, e.g. loop over plaintext paths and require each `git check-ignore -q -- "$path"`, then separately require `! git check-ignore -q -- private.tar.age`.

## Finding 2

severity: high
evidence: The adversarial condition says hooks may not be installed, but T1 only validates scanner behavior against fixture paths. Files list includes `scripts/git-hooks/*` and installer “if needed”, yet no acceptance criterion verifies that the pre-commit hook is installed, updated, executable, or invoked by the repo install flow.
required_fix: Add an acceptance criterion that runs the hook installer in a temporary repo, verifies `.git/hooks/pre-commit` exists and calls `private-archive-scan`, and verifies the hook blocks staged `private/*` while allowing `private.tar.age`.

## Finding 3

severity: medium
evidence: T3 requires the resolver to use `git ls-files -u` stages, but the plan does not require validating stage extraction with path quoting or `--stage`/NUL-safe parsing. Under Git Bash/MSYS2, paths with spaces, backslashes, or unusual bytes can be split incorrectly by whitespace parsing.
required_fix: Add tests and implementation requirements for NUL-safe or structured parsing of conflicted `private.tar.age` stages, including a fixture repo path containing spaces, and use `git show :1:private.tar.age`/`:2:`/`:3:` or equivalent explicit stage addressing.

## Finding 4

severity: medium
evidence: The plan says `.gitattributes` should mark `private.tar.age` as binary/non-mergeable “or route users to explicit resolver docs,” but no criterion verifies Git actually preserves conflict stages for the resolver. If attributes suppress or alter merge behavior unexpectedly, T3 cannot proceed.
required_fix: Add a fixture merge test that creates divergent `private.tar.age` versions, performs `git merge`, confirms `git ls-files -u -- private.tar.age` has stages 1/2/3, and then runs the resolver.

## Finding 5

severity: medium
evidence: Rollback is described as `git checkout -- <changed-files>`, but private archive operations are acknowledged as data-loss-prone. The encrypt/decrypt acceptance criteria do not require backup/atomic replace behavior for existing `private.tar.age` or `private/` before overwrite/reencrypt.
required_fix: Require atomic writes via temp file plus rename, backup or refusal before replacing existing `private.tar.age`, and tests proving failed encrypt/decrypt/conflict resolution leaves the prior archive and plaintext directory unchanged.
