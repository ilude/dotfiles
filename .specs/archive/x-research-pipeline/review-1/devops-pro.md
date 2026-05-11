# DevOps/Security Adversarial Review

## Finding 1

- **severity:** high
- **evidence:** T3 adds `scripts/git-hooks/pre-commit-x-private`, but the plan never installs it into `.git/hooks/pre-commit`, sets `core.hooksPath`, or updates the repo install flow. Current repo evidence shows only sample hooks under `.git/hooks/` and no existing `core.hooksPath`/pre-commit installation path in tracked files. If the hook is not installed, the stated objective “Git hooks prevent accidental staging of plaintext X-derived PII” is false.
- **required_fix:** Add an explicit, idempotent hook installation task and acceptance criterion that verifies `git config --get core.hooksPath` or `.git/hooks/pre-commit` invokes `scripts/git-hooks/pre-commit-x-private`. Include Git Bash and PowerShell-compatible install instructions or make the hook runnable through a checked-in hooks path.

## Finding 2

- **severity:** high
- **evidence:** The plan says encrypted snapshots “must be encrypted with `age`” and T3 dry-run prints “recipient source,” but it does not define where recipients live, how missing recipients fail, how public recipients are bootstrapped, or how private identities are kept out of the repo. Under the adversarial assumption that age recipients are missing, the encrypt helper can only fail late or invite unsafe ad-hoc recipient handling.
- **required_fix:** Define a tracked public-recipient file path or documented env/config source, explicitly gitignore private age identities, and require `scripts/x-private-encrypt --dry-run` to fail closed with a clear message when recipients are absent. Add acceptance tests for missing recipient, invalid recipient, and no plaintext output.

## Finding 3

- **severity:** medium
- **evidence:** `.gitignore` currently ignores `private/` but has no `private-encrypted/` rules. The plan states only `*.age` files should be allowed under `private-encrypted/`, yet the T3 acceptance criterion only checks that `private-encrypted/x/test.json.age` is trackable and relies on a hook smoke test for some plaintext extensions. This leaves non-`.age` files trackable whenever hooks are absent or bypassed.
- **required_fix:** Add `.gitignore` allowlist rules for `private-encrypted/` that ignore everything except directories and `*.age`, then test both positive and negative cases: `git check-ignore private-encrypted/x/test.json` must be true and `git check-ignore private-encrypted/x/test.json.age` must be false.

## Finding 4

- **severity:** medium
- **evidence:** Cross-shell support is a constraint, but T3 specifies extensionless scripts (`scripts/x-private-encrypt`, `scripts/x-private-decrypt`, `scripts/git-hooks/pre-commit-x-private`) with no interpreter contract, path-conversion strategy, or Windows validation. PowerShell cannot directly execute POSIX shebang scripts the same way Git Bash does, and age/git path behavior can differ on Windows.
- **required_fix:** Specify the scripts’ runtime contract: either POSIX-only with PowerShell wrappers (`.ps1`) for user-facing commands, or Python entry points invoked by both shells. Add acceptance criteria that run the dry-run encrypt helper and hook staged-file smoke test from both Git Bash and PowerShell on Windows.

## Finding 5

- **severity:** high
- **evidence:** Validation gates say “Confirm no plaintext private data is staged,” but there is no deterministic command or test proving staged contents are free of plaintext PII. The hook criterion covers only selected extensions under `private-encrypted/`; it does not address staged plaintext from other paths, renamed files, `git add -f private/...`, or extensionless/CSV/TXT exports.
- **required_fix:** Add a deterministic staged-file scanner used by both the hook and validation gate. It should inspect `git diff --cached --name-only -z`, reject `private/**`, reject any non-`.age` under `private-encrypted/**`, and optionally block common export extensions repo-wide unless explicitly allowlisted. Add tests for forced-add private files, renamed files, spaces in paths, and non-`.age` private-encrypted files.
