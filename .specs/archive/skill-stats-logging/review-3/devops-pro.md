# DevOps/adversarial plan review

## Finding 1

- severity: high
- evidence: The resume ledger requires preserving checked state and evidence across `/do-it` resumes (plan.md:69-71), but the P1 preflight command overwrites `.specs/skill-stats-logging/evidence/preflight-status.txt` on every run (plan.md:167-169). P2 then appends target-path status into that same file (plan.md:177-179). A fresh or retried `/do-it` can erase the original pre-edit status and replace it with a post-edit status, making pre-existing changes indistinguishable from task changes.
- required_fix: Make preflight idempotent and append-only after first capture: if `preflight-status.txt` already exists, do not overwrite it; write retry status to a separate timestamped/current file. P2 should write target-path classification to its own evidence file, not append to the immutable initial preflight snapshot.

## Finding 2

- severity: high
- evidence: The owned-file manifest lists broad directories (`pi/lib`, `pi/tests`, `.specs/skill-stats-logging/evidence`, `.specs/skill-stats-logging/fixtures`) rather than the exact files that will be created/modified (plan.md:177-179). Rollback and archive gates depend on this manifest (plan.md:65, 402-405), so a fresh session with unrelated pre-existing edits anywhere under `pi/tests` or `pi/lib` can incorrectly treat them as owned or make rollback/archive decisions ambiguous.
- required_fix: Require an exact manifest format with path + intended action + pre-existing status/hash for each file. For directories, record them only as allowed parent directories and require newly discovered files to be appended explicitly before edit. Archive preflight must compare changed tracked and untracked files against exact file entries, not broad directory ownership.

## Finding 3

- severity: medium
- evidence: The archive preflight captures `git status --short --untracked-files=all` in `archive-status.txt` but captures only tracked diff names in `archive-files.txt` via `git diff --name-only` (plan.md:402-404). The pass condition says tracked and untracked changed files must match the manifest (plan.md:403-405), but no machine-checkable untracked file list is placed in `archive-files.txt`; a reviewer or automation that keys off `archive-files.txt` can miss newly generated tests/fixtures/evidence.
- required_fix: Change archive preflight to write a normalized complete changed-file list, e.g. combine `git diff --name-only`, `git diff --name-only --cached`, and `git ls-files --others --exclude-standard`, then compare that complete list against the exact owned-file manifest.

## Finding 4

- severity: medium
- evidence: Several validation commands assume Git Bash relative paths remain correct after `cd` (plan.md:300, 313-315, 328-333, 372-380), while the automation table uses the safer `REPO_ROOT=$(git rev-parse --show-toplevel)` pattern (plan.md:60-62). This inconsistency is a Windows Git Bash portability trap: if the command is run from a different working directory, via a wrapper, or after a failed `cd`, evidence redirects can fail or write to the wrong location.
- required_fix: Standardize every evidence-producing command to compute `REPO_ROOT=$(git rev-parse --show-toplevel)` before `cd` and redirect to `"$REPO_ROOT/.specs/skill-stats-logging/evidence/..."`. Remove alternate relative forms from acceptance criteria and validation contract.

## Finding 5

- severity: medium
- evidence: The content redaction scan intentionally ends with `|| true` and then redirects matches to `redaction-scan.txt` (plan.md:396-400). The pass condition allows matches only if each is documented as a false positive (plan.md:399), but there is no required structured classification artifact or command that fails when matches remain. In a fresh `/do-it`, this can silently archive evidence containing raw session fields if the operator marks F5 complete without proving classification.
- required_fix: Split redaction into two artifacts: raw scan output and a required `redaction-classification.md` when the scan output is non-empty. F5 should pass only when `redaction-scan.txt` is empty or every line is referenced in the classification file with `false-positive` or `redacted` status.
