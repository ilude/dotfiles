# Applied Fix Plan

| Finding | Category | Plan section(s) to edit | Edit intent | Checklist impact |
|---------|----------|-------------------------|-------------|------------------|
| Stale encrypted artifacts unspecified | Bug | Constraints, T1/T3/V1, Success Criteria | Define sync behavior: remove stale `.encrypted/**/*.age` with no `private/` source; test delete/rename | No new task IDs; strengthen T1/T3 criteria |
| Partial encryption mixed generation | Bug | Constraints, T1, V1 | Require temp mirror/all-or-nothing promotion and failure test | No new task IDs; strengthen T1/T3 criteria |
| Grep-only hook verification | Bug | T2, V1, Success Criteria | Replace with temp repo real hook/commit tests including forced plaintext block | No new task IDs |
| Worktree-unsafe hook installer/preflight | Bug | Automation Plan, T0, T2, V0 | Use `git rev-parse --git-path`; require install script update/test in linked worktree | No new task IDs |
| Commit command order and broad staging | Bug | Automation Plan, T4, V2 | Stage exact intended files, run post-stage checks, scan staged diff | No new task IDs |
| Plaintext leak not detected | Bug | T1/T3/V1 | Verify encrypted artifact lacks plaintext and decrypts only via age | No new task IDs |
| Recipient/path/symlink/subprocess tests | Hardening | T1/T3/V1 | Add explicit acceptance coverage | No new task IDs |
| Evidence ledger weak | Readiness | Execution Checklist, Validation Contract | Require cwd, command, exit status, assertion output in Evidence | No new task IDs |
| Cleanup/rollback incomplete | Hardening | Automation Plan, Handoff Notes | Add cleanup of temp/generated private data and marker-safe rollback | No new task IDs |
| Script naming ambiguity | Hardening | Constraints, T4 | Clarify retained names are legacy-compatible canonical commands for now | No new task IDs |
