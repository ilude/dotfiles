# Review: Pi Orchestration Telemetry

### Step Verification
1. [pass] Exact commands and existing-auth smoke -- bounded call, normal auth resolution, and `&&` sequencing are documented.
2. [pass] Fresh smoke isolation -- unique `episode_id`, targeted removal, and three scratch roots are specified.
3. [pass] Evidence verifier/archive rule -- verifier arguments and required checks are specified; F5 remains pending until execution.
4. [pass] Dependencies/checklist/status -- dependency graph and unchecked resume ledger are coherent; status is `pending`.
5. [fail] Dirty-worktree rollback -- pre-existing evidence-directory contents can survive rollback, and the required byte/status comparison is not an executable check.

### Issues Requiring Fixes
- **Blocker:** Fix rollback to snapshot/restore individual evidence files and add a fail-closed byte-for-byte plus `git status` comparison. (`plan.md:147,153`)
- **Hardening:** Document an executable backup, selective purge, and verification procedure for non-scratch append-only metrics.

### Overall: STANDALONE BLOCKED

Written to `.specs/pi-orchestration-telemetry/review-3/standalone-readiness.md`.