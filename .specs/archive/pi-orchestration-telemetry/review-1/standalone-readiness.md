STANDALONE BLOCKED

1. **Blocker -- Live smoke failure can be masked.**  
   In the Automation Plan, the two pipelines are separated by `;`, so the command exits based only on the second pipeline.  
   **Fix:** chain them with `&&` or capture and explicitly validate both exit statuses before reporting success/archive eligibility.

2. **Blocker -- Rollback can destroy unrelated work.**  
   `git checkout -- <plan-owned files>` discards all uncommitted changes in those files, contradicting the stated allowance for unrelated work.  
   **Fix:** require a pre-execution scoped patch/snapshot and restore only plan-generated changes, or require an isolated clean worktree before execution.