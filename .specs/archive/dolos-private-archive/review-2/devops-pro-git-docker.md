## Finding 1
severity: HIGH
evidence: T7 verifies `git check-ignore -v .dolos/authorized_keys .dolos/artifacts/private.tar.gz.age || true`, and pass text says the paths are not ignored. With `|| true`, this command exits 0 whether paths are ignored or not; a reviewer/executor can miss ignore output in the evidence file. The same pattern appears in the automation table.
required_fix: Replace with an assertion that fails on ignored paths, e.g. `! git check-ignore -q .dolos/authorized_keys .dolos/artifacts/private.tar.gz.age`, while separately capturing verbose output for evidence.

## Finding 2
severity: HIGH
evidence: Hook migration includes `scripts/install-x-private-hook`, but no acceptance or validation step runs it or inspects the active hook after migration. This repo currently has `.git/hooks/pre-commit` invoking `scripts/git-hooks/pre-commit-x-private`; a changed tracked script can pass grep/tests while an installed hook remains stale, non-idempotent, or points at a removed wrapper.
required_fix: Add validation that runs the install/update hook script in a temp repo and inspects the active hook (`core.hooksPath` or `.git/hooks/pre-commit`) to prove it calls Dolos scan/block-only behavior and never packs/stages.

## Finding 3
severity: MEDIUM
evidence: Plan says the build output is repo/install-managed as `bin/dolos(.exe)`, but current `install.conf.yaml` has no `bin/` link and no PATH/install task is listed. `bin/` also does not currently exist. Producing `./bin/dolos.exe` in the checkout proves build only; it does not prove Dolos is runnable after dotfiles install on Git Bash/MSYS.
required_fix: Specify the install contract: either add/link repo `bin/` via Dotbot/PATH and validate it, or state Dolos is checkout-local only and update commands/docs to use `./bin/dolos(.exe)` consistently.

## Finding 4
severity: MEDIUM
evidence: T2/V1 invoke `tools/dolos/build.sh` directly. On Windows/Git Bash, newly created scripts may lack executable mode until `.gitattributes`/git index mode is correct; direct execution can fail with permission issues while `bash tools/dolos/build.sh` would work. The plan does not require preserving executable bit for the new build script.
required_fix: Require `tools/dolos/build.sh` to be committed executable and add evidence (`git ls-files --stage tools/dolos/build.sh` shows `100755`) or change all validation commands to `bash tools/dolos/build.sh` for Git Bash portability.
