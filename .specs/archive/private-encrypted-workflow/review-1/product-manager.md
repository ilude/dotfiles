# Product Manager Review

## Finding 1
severity: high
evidence: The plan selects per-file outputs but explicitly leaves “deletes/renames need explicit stale-output handling decisions” as a con, then has no task or acceptance criterion for removing `.encrypted/<old>.age` when `private/<old>` is deleted or renamed.
required_fix: Add a clear product decision and tests for delete/rename semantics. Prefer simple sync behavior: encryption removes stale `.encrypted/**/*.age` that no longer has a corresponding `private/` source, unless explicitly documented as unsupported.

## Finding 2
severity: medium
evidence: The objective says the hook “encrypts every regular file under `private/`” and stages `.encrypted/`, but T2 only greps for command order. It does not verify hook behavior with no recipients, no `private/`, or unstaged/private-only changes.
required_fix: Replace grep-only acceptance with a temp-repo behavioral test covering: no-op when `private/` absent, safe failure when recipients are missing and private files exist, and successful staging of `.encrypted/` without staging plaintext.

## Finding 3
severity: medium
evidence: The plan keeps archive-oriented command names (`private-archive-*`) while changing the product model from one archive to per-file encryption. This risks confusing operators and future maintainers about the canonical workflow.
required_fix: Decide whether names are legacy compatibility or canonical. If retained, update docs/help/status output to say they now manage per-file `.encrypted/` artifacts; otherwise add simple `private-encrypt/decrypt/status` wrappers and keep old names as aliases.

## Finding 4
severity: low
evidence: Validation requires `make lint-python && make test-quick`, multiple temp-repo checks, py_compile, worktree creation, and a local commit. For a script/test/docs change, this may slow iteration and add friction without improving product confidence proportionally.
required_fix: Keep `uv run pytest test/test_private_archive.py` plus the hook integration temp-repo test as required gates. Make full repo validation a final best-effort gate or justify why it is mandatory for this narrow workflow change.
