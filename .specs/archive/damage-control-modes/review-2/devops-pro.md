# DevOps Review: Damage-Control Modes Plan

## Finding 1

**severity:** high

**evidence:** The validation contract writes the secret-scan artifact with:

```bash
grep -RInE '(AKIA[0-9A-Z]{16}|BEGIN (RSA|OPENSSH|PRIVATE) KEY|xox[baprs]-|ghp_[A-Za-z0-9_]+)' .specs/damage-control-modes/evidence > .specs/damage-control-modes/evidence/no-secret-check.txt || true
```

On a clean/no-match run, `grep` creates/truncates `no-secret-check.txt` before scanning and produces a zero-byte file. Later Success Criteria require:

```bash
test -s .specs/damage-control-modes/evidence/no-secret-check.txt
```

This will fail when the desired result is no matches.

**required_fix:** Change the archive gate to require file existence (`test -e`) rather than non-empty for `no-secret-check.txt`, or make the command write an explicit success line such as `NO_MATCHES` only after confirming no real secret matches.

## Finding 2

**severity:** high

**evidence:** The baseline exception path says: “If `make check` fails, rerun the failing command(s) from a clean pre-edit baseline or use preflight evidence to prove the same failure existed before executor edits.” The documented preflight only captures `git status` and `git diff`; it does not run `make check` before edits or create a clean baseline worktree. In a dirty repo, an executor following this literally cannot prove the same validation failure existed before implementation.

**required_fix:** Add an explicit pre-edit validation baseline when planned paths or repo are dirty, e.g. run `make check` before implementation and save `.specs/damage-control-modes/evidence/preflight-make-check.txt`, or require a separate clean worktree/baseline commit comparison before accepting a repo-wide validation exception.

## Finding 3

**severity:** medium

**evidence:** The secret-scan command writes the output file inside the same directory being recursively scanned:

```bash
grep -RInE ... .specs/damage-control-modes/evidence > .specs/damage-control-modes/evidence/no-secret-check.txt || true
```

With GNU grep/Git Bash this can produce an “input file is also the output” diagnostic on stderr, and stderr is not captured in the artifact. The `|| true` masks grep errors, so the archive gate can pass with an incomplete or noisy scan.

**required_fix:** Write to a temporary file outside the scanned tree, capture stderr, then move it into evidence after success; or exclude `no-secret-check.txt` from the scan and redirect `2>&1` into a separate log that is inspected.
