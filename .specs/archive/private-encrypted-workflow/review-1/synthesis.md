---
date: 2026-05-12
status: synthesis-complete
---

# Review: Private per-file age encryption workflow

## Review Panel
| Reviewer | Base Agent | Assigned Expert Persona | Why selected | Adversarial angle | Artifact |
|----------|------------|-------------------------|--------------|-------------------|----------|
| reviewer | reviewer | Completeness & explicitness reviewer | Standard reviewer for hidden assumptions and /do-it readiness | Assume vague commands pass without proving behavior | `.specs/private-encrypted-workflow/review-1/reviewer.md` |
| security-reviewer | security-reviewer | Security and safety reviewer | Standard reviewer for private-data/secret workflow safety | Assume plaintext can leak via staging, evidence, or unsafe paths | `.specs/private-encrypted-workflow/review-1/security-reviewer.md` |
| product-manager | product-manager | Simplicity and scope reviewer | Standard reviewer for scope fit and operator usability | Assume complexity or naming mismatch will confuse future users | `.specs/private-encrypted-workflow/review-1/product-manager.md` |
| python-pro | python-pro | Python encryption script correctness reviewer | Python scripts implement encryption/decryption/status | Assume path, stale file, partial failure, and subprocess edge cases are missed | `.specs/private-encrypted-workflow/review-1/python-pro.md` |
| devops-pro | devops-pro | Git hook and worktree operational safety reviewer | Plan depends on hooks, staging, worktrees, and local commits | Assume dirty checkouts, linked worktrees, and partial staging break the plan | `.specs/private-encrypted-workflow/review-1/devops-pro.md` |
| qa-engineer | qa-engineer | Regression and false-positive acceptance-criteria reviewer | Success depends on tests proving hook/scanner/encryption behavior | Assume tests pass while plaintext leaks or stale encrypted files remain | `.specs/private-encrypted-workflow/review-1/qa-engineer.md` |

## Standard Reviewer Findings
### reviewer
- High: commit command runs `git diff --cached --check` before staging intended files.
- High: T2 grep-only hook verification does not prove real behavior.
- Medium: stale encrypted artifact behavior for deletes/renames is acknowledged but not specified.
- Medium: missing-recipient failure semantics are not acceptance-tested.
- Medium: decrypt path traversal/safety cases are not acceptance-tested.

### security-reviewer
- High: hook tests must prove force-staged plaintext `private/...` is blocked.
- High: broad `git add scripts test` risks staging accidental plaintext fixtures; stage exact intended files and scan staged diff.
- Medium: rollback lacks cleanup of plaintext temp/decrypted outputs.
- Medium: decryption path/symlink safety is underspecified.
- Medium: recipient parsing needs malformed/duplicate/no-recipient tests.

### product-manager
- High: plan lacks product decision and test for delete/rename semantics.
- Medium: hook acceptance should be behavioral, not grep-only.
- Medium: archive-oriented script names need explicit legacy/canonical wording.
- Low: repo-wide validation is heavier than task-specific checks, but acceptable if final mandatory gate is justified.

## Additional Expert Findings
### python-pro
- High: stale encrypted outputs can resurrect deleted private data.
- High: partial encryption failure can leave mixed-generation `.encrypted/` artifacts.
- Medium: symlink/device traversal handling is underspecified.
- Medium: Windows/path filename edge cases are under-tested.
- Medium: subprocess/tool failure behavior is not testable enough.

### devops-pro
- High: hook installer is not worktree-safe if it writes `.git/hooks` directly.
- High: worktree preflight checks `.git/...` paths directly instead of using `git rev-parse --git-path`.
- Medium: unconditional hook staging can stage unrelated local private files; plan needs explicit policy/evidence.
- Medium: delete/rename behavior is not a validation gate.
- Medium: rollback needs a run marker to avoid deleting pre-existing branch/worktree state.

### qa-engineer
- High: T2 can pass without proving real commit blocking/staging.
- High: encryption checks can pass while plaintext is copied into `.encrypted/`.
- Medium: stale encrypted artifacts are not acceptance-tested.
- Medium: merge behavior is named but not concretely tested.
- Medium: evidence ledger needs cwd, command, exit status, and assertion output.

## Suggested Additional Reviewers
- `python-pro` -- relevant because Python scripts own per-file encryption/decryption/status logic; scrutinized path safety, stale outputs, and subprocess failures.
- `devops-pro` -- relevant because the plan uses git hooks, worktrees, staging, and local-only commit workflow; scrutinized linked worktree and hook operational pitfalls.
- `qa-engineer` -- relevant because validation must prove no plaintext leaks and hook behavior is real; scrutinized false-positive tests and missing regressions.

## Bugs (must fix before execution)
1. Stale encrypted artifacts for deletes/renames are unspecified and untested.
2. Encryption is not required to be all-or-nothing, risking mixed-generation `.encrypted/` state.
3. Hook verification is grep-based and does not prove real commit/staging/blocking behavior.
4. Hook installer and preflight use direct `.git/...` assumptions that are unsafe in linked worktrees.
5. Commit command checks cached diff before staging and stages broad directories.
6. T1 encryption verification can pass while plaintext leaks into `.encrypted/`.

## Hardening
1. Add explicit recipient parsing tests for comments, whitespace, malformed, duplicate, and missing recipients.
2. Add symlink/device/path traversal and Windows path edge-case tests.
3. Require `/do-it` evidence entries to record cwd, exact command, exit status, and key assertion output.
4. Clarify `private-archive-*` names as legacy-compatible commands now managing per-file `.encrypted/` artifacts.
5. Add cleanup/rollback steps for temp keys, decrypted outputs, and generated plaintext fixtures.

## Simpler Alternatives / Scope Reductions
1. Keep full repo validation as a final gate but make the primary task-specific signal `uv run pytest test/test_private_archive.py` plus hook commit integration tests. This avoids treating broad validation as the only proof of behavior.
2. Retain existing `private-archive-*` script names as legacy-compatible wrappers/canonical commands for now instead of introducing a rename migration in the same change.

## Automation Readiness
- Agent-runnable operational steps: not ready before fixes because preflight and hook install are not linked-worktree safe.
- Credential/auth flow clarity: mostly ready; tests use generated age keys, but recipient parsing/fail-closed semantics need explicit criteria.
- Evidence and archive gates: need stronger evidence ledger requirements and exact staged-file/secret-scan checks.
- Manual-only steps and justification: no manual gate is warranted; risk classification remains low for local reversible repo work.

## Contested or Dismissed Findings
1. Product-manager suggestion to make repo-wide validation best-effort was not accepted. Repo-wide validation remains mandatory as a final confidence gate, with task-specific tests carrying behavior proof.
2. Devops concern about auto-staging unrelated private files was handled as a policy clarification rather than disabling auto-encryption: the user explicitly wants automatic encryption for anything under `private/`.

## Verification Notes
1. Confirmed commit-order bug in plan line containing `git diff --cached --check; git add -- ...` before commit.
2. Confirmed grep-only hook verification in T2 acceptance criteria.
3. Confirmed stale delete/rename issue appears only as an alternative con, not as task acceptance.
4. Confirmed `scripts/install-x-private-hook` currently writes `Path(".git/hooks/pre-commit")`, matching the linked-worktree risk.
5. Confirmed worktree preflight directly checks `.git/rebase-merge`, `.git/rebase-apply`, and `.git/MERGE_HEAD`.

## Reviewer Artifact Status
| Reviewer | Artifact | Status | Notes |
|----------|----------|--------|-------|
| reviewer | `.specs/private-encrypted-workflow/review-1/reviewer.md` | read | recovered from inline second retry after file write failed |
| security-reviewer | `.specs/private-encrypted-workflow/review-1/security-reviewer.md` | read | recovered from inline second retry after file write failed |
| product-manager | `.specs/private-encrypted-workflow/review-1/product-manager.md` | read | artifact usable |
| python-pro | `.specs/private-encrypted-workflow/review-1/python-pro.md` | read | artifact usable |
| devops-pro | `.specs/private-encrypted-workflow/review-1/devops-pro.md` | read | artifact usable |
| qa-engineer | `.specs/private-encrypted-workflow/review-1/qa-engineer.md` | read | artifact usable |

## Timing Notes
| Step | Duration | Notes |
|------|----------|-------|
| Initial review panel | unknown | 5/6 succeeded; 2 artifacts missing after first pass |
| Artifact reads | unknown | all expected reviewer artifacts read after targeted recovery |
| Recovery calls | unknown | retried reviewer and security-reviewer; second retry returned inline findings, written to artifacts |
| Verification | unknown | used targeted reads/grep against plan and scripts |
| Synthesis | unknown | `.specs/private-encrypted-workflow/review-1/synthesis.md` |

## Auto-Apply Plan
- Applied fixes artifact: `.specs/private-encrypted-workflow/review-1/applied-fixes.md`
- Known-blocker fixes artifact: `not run/no prior blockers`
- Section integrity check: passed
- Standalone-readiness result: STANDALONE READY
- Repair passes used: 0

## Review Artifact
Wrote full synthesis to: `.specs/private-encrypted-workflow/review-1/synthesis.md`

## Overall Verdict
**Fix bugs first**

## Recommended Next Step
- apply review fixes to the plan, then execute via `/do-it .specs/private-encrypted-workflow/plan.md`
