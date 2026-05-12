## Finding 1

severity: high
evidence: The Automation Plan redirects logs to `.specs/damage-control-modes/evidence/*.txt` and `implementation.diff`, but no step creates `.specs/damage-control-modes/evidence`. In Git Bash, `cmd > missing/dir/file.txt` fails before the command runs.
required_fix: Add an initial executable step: `mkdir -p .specs/damage-control-modes/evidence .specs/damage-control-modes/review-1`, and require all evidence-producing commands run only after it passes.

## Finding 2

severity: high
evidence: Rollback uses `git checkout -- pi/...` for all planned paths. If `/do-it` starts with unrelated user edits in any same path, this irreversibly discards them, matching the adversarial dirty-tree condition.
required_fix: Add a preflight dirty-path gate for planned files using `git status --short -- <paths>`. If any are modified before executor edits, stop or save a patch/snapshot and require an explicit merge strategy; rollback must restore only executor-owned changes.

## Finding 3

severity: medium
evidence: Success Criteria require `make check` to pass, but Handoff Notes allow completing when `make check` exposes unrelated pre-existing failures after documenting them. This creates conflicting archive gates.
required_fix: Make archive criteria explicit: either `make check` must pass always, or define a repeatable exception process with preflight baseline evidence proving the same failure existed before edits.

## Finding 4

severity: medium
evidence: The preflight command only records global `git status --short`; it does not capture baseline diffs for planned files. Later evidence (`implementation.diff`) can mix executor changes with pre-existing draft/user changes.
required_fix: Save `git diff -- <planned paths>` and `git status --short -- <planned paths>` before edits. Require final evidence to distinguish baseline changes from executor changes, or block until planned paths are clean.

## Finding 5

severity: low
evidence: Success Criteria verify `test -s .../implementation.diff`. If existing draft changes already satisfy the plan and validation runs without new diffs, the diff can be empty even though implementation is complete.
required_fix: Replace non-empty diff as a completion gate with either `git diff --exit-code` expectations tied to actual edit ownership, or allow an empty diff when preflight evidence shows implementation was already present and tests/typecheck pass.
