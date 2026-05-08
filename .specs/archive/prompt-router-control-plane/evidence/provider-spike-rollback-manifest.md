# Provider Spike Rollback Manifest

## Changed tracked/source files
 M .specs/prompt-router-control-plane/plan.md
 M pi/extensions/prompt-router.ts
 M pi/extensions/workflow-commands.ts
 M pi/tests/prompt-router.test.ts
?? .specs/prompt-router-control-plane/evidence/
?? .specs/prompt-router-control-plane/provider-architecture-spike.md
?? .specs/prompt-router-control-plane/review-2/

## Rollback
- Use git restore for tracked source/plan files in the isolated worktree if abandoning.
- Remove untracked evidence/review artifacts only after preserving needed blocker/proof evidence.
