---
date: 2026-05-02
status: synthesis-complete
---

# Review: Deterministic Commit Helper for Slash Commit

## Review Panel
| Reviewer | Base Agent | Assigned Expert Persona | Why selected | Adversarial angle |
|----------|------------|-------------------------|--------------|-------------------|
| Standard completeness | reviewer | Completeness & explicitness reviewer | Required standard reviewer | Assume the plan will be executed without conversation context and find ambiguous/untestable steps |
| Standard security | security-reviewer | Git safety and permission reviewer | Required standard reviewer | Assume messy real Git state, ignored files, and unsafe automation failures |
| Standard simplicity | product-manager | Scope and simplicity reviewer | Required standard reviewer | Challenge whether the helper is too broad for the bug being fixed |
| Python tooling | python-pro | Python CLI/tooling correctness reviewer | Helper is planned as a Python CLI invoked through `uv` | Assume path quoting, subprocess, encoding, and exit-code edge cases break happy-path code |
| QA regression | qa-engineer | Git workflow regression reviewer | Plan success depends on real Git tests | Assume tests over-mock or grep strings and miss the actual failure mode |
| Git operations | devops-pro | Git automation and rollout reviewer | Plan changes commit/push automation | Assume partial staging, hooks, branch/upstream issues, and push failures happen in normal use |

## Standard Reviewer Findings
### reviewer
- T1 and T2 both touch `scripts/commit-helper` in the same parallel wave, creating a likely edit conflict and unclear ownership.
- The `stage --paths` contract is underspecified: exact JSON output, exit codes, ignored-path handling, force-add behavior, and partial-staging behavior need to be defined before implementation.
- Secret scanning is included in implementation scope but lacks concrete tests or pass/fail criteria.
- Validation commands are inconsistent: gates use `make test-quick`/`make lint`, while success criteria require `make check`.

### security-reviewer
- Push behavior lacks branch/upstream/remote safeguards. A helper that can push should define what remote/ref it pushes and how it handles missing upstream or rejected pushes.
- A script that stages and commits can mutate Git state significantly; plan needs clearer dry-run/plan-first behavior before mutation.
- Force-adding ignored files is mentioned but not specified enough to prevent accidental inclusion of generated/private files.
- Secret scanning risks false confidence unless it is tightly scoped and tested; hooks or external scanners may remain necessary.

### product-manager
- The helper scope may be too broad for the original failure. The immediate issue could be solved by deterministic status planning and message validation without implementing commit/push in V1.
- Secret scanning and push orchestration may distract from the primary bug and increase rollout risk.
- A staged rollout would be simpler: first add `status-json`, `stage-plan`, and `validate-message`; later add commit/push wrappers only if needed.

## Additional Expert Findings
### python-pro
- The plan should specify Python execution details more precisely: shebang, executable bit expectations on Windows/Git Bash, `uv run python scripts/commit-helper`, and subprocess text encoding.
- Git subprocess calls need exact error propagation and JSON error shape so agents can act deterministically.
- Path handling must be repo-relative and robust to spaces, backslashes, CRLF, and non-UTF output.

### qa-engineer
- T4 is blocked behind V1, but T2 acceptance criteria depend on tests from T4. This creates a validation gap in Wave 1.
- Some checks rely on grepping code for strings, which can pass without proving behavior.
- Regression tests should use real temporary Git repositories and assert exact state transitions: tracked -> ignored -> `git rm --cached` -> staged deletion preserved -> commit succeeds.

### devops-pro
- T1/T2 parallelism is operationally unsafe because both list `scripts/commit-helper`; split contract into a separate doc/test fixture or make implementation depend on contract.
- Push execution must handle no upstream, detached HEAD, protected branches, rejected non-fast-forward pushes, and network failures without claiming success.
- Integration with existing hooks and `--no-verify` behavior needs explicit boundaries so the helper does not bypass repo policy unintentionally.

## Suggested Additional Reviewers
- `python-pro` -- relevant because the helper is planned as a Python CLI; reviewed subprocess, encoding, path, and `uv` execution risks.
- `qa-engineer` -- relevant because the original bug requires real Git regression tests; reviewed whether acceptance criteria can falsely pass.
- `devops-pro` -- relevant because `/commit push` is Git automation; reviewed branch, remote, hook, and rollout hazards.

## Bugs (must fix before execution)
1. **Parallel edit conflict between T1 and T2.** T1 and T2 both list `scripts/commit-helper` in Wave 1, but run in parallel. This can cause conflicting edits and unclear contract ownership.
   - Fix: make T2 depend on T1, or move T1 contract into a separate file such as `docs/commit-helper-contract.md` / test fixtures and reserve `scripts/commit-helper` for T2.
2. **Wave dependency bug: tests are scheduled after the implementation validation that depends on them.** T2 says staged deletion behavior is “Covered by test from T4,” but T4 is blocked by V1, while V1 validates T2.
   - Fix: move core regression tests into Wave 1 with implementation, or make V1 validate only contract/implementation smoke and move full validation after tests.
3. **Stage/force-add semantics are underspecified.** The plan says ignored files can be force-added after explicit confirmation but does not define CLI flags, JSON errors, or confirmation boundary.
   - Fix: define exact behavior for ignored paths: default skip/fail, `--force-ignored` requirement, and no interactive confirmation inside helper unless explicitly designed.
4. **Push safety is underspecified for a helper that owns `push`.** The plan includes `push` but does not specify remote/ref behavior, upstream detection, detached HEAD, rejected pushes, or network failure reporting.
   - Fix: either remove `push` from V1 or specify safe push semantics and tests.

## Hardening
1. Split V1 into minimal commands: `status-json`, `stage-plan`, and `validate-message`; defer `commit` and `push` wrappers until the planner is proven.
2. Add a stable JSON schema section to the plan with top-level fields, per-path fields, exit codes, and error shape.
3. Replace grep-only acceptance criteria with behavior tests where possible.
4. Add explicit Windows/Git Bash path handling requirements: repo-relative paths, spaces, CRLF, and subprocess encoding.
5. Clarify secret scanning scope or defer it. If kept, add tests and state that it supplements, not replaces, hooks or dedicated scanners.
6. Align validation commands so wave gates and final success criteria consistently require either `make check` or the same test/lint pair.

## Simpler Alternatives / Scope Reductions
1. Build a deterministic planner first, not a full committer: `status-json`, `stage-plan`, and `validate-message` would prevent the observed failure with much lower risk.
2. Keep actual `git commit` and `git push` in the existing committer workflow initially, but require it to consume helper output and validated messages.
3. Defer secret scanning and push orchestration to a second phase after the ignored-staged-deletion regression is fixed.

## Contested or Dismissed Findings
1. **“Needs complete redesign”** was dismissed. The selected helper approach is reasonable, but the plan needs dependency/scope fixes before execution.
2. **“Secret scanning is inherently unsafe”** was downgraded. Secret scanning is useful as defense-in-depth, but it should not be part of the critical V1 unless tested and clearly scoped.
3. **“Push must be fully implemented in V1”** was rejected. The original failure was staging/message validation; push can be deferred or tightly constrained.

## Verification Notes
1. Confirmed T1/T2 conflict by reading the task table and Wave 1: both tasks are parallel and both list `scripts/commit-helper`.
2. Confirmed T2/T4 validation dependency bug: T2 acceptance criterion says staged deletion is covered by T4, but T4 depends on V1 and V1 validates T2.
3. Confirmed push underspecification by reading T2 objective and success criteria: `push` is included, but no branch/upstream/rejection semantics are defined.
4. Confirmed current plan uses grep-only checks in several acceptance criteria, which can pass without real behavior.

## Review Artifact
Wrote full synthesis to: `.specs/deterministic-commit-helper/review-1/synthesis.md`

## Overall Verdict
**Fix bugs first**

## Recommended Next Step
- Apply the must-fix plan edits before `/do-it`.
- Prefer a reduced V1 that implements deterministic planning/message validation first, then adds commit/push wrappers later if still needed.
