# Provider Spike Vitest

- command: cd pi/tests && pnpm run test -- prompt-router.test.ts
- test_exit_code: 0

## output
 [32m✓[39m tests/commit-extension.test.ts [2m([22m[2m4 tests[22m[2m)[22m[33m 9426[2mms[22m[39m
     [33m[2m✓[22m[39m commit_stage succeeds with a valid plan and returns staged paths [33m 9394[2mms[22m[39m
 [32m✓[39m tests/tool-search.test.ts [2m([22m[2m11 tests[22m[2m)[22m[33m 722[2mms[22m[39m
     [33m[2m✓[22m[39m should register tool_search [33m 676[2mms[22m[39m
 [32m✓[39m tests/test-orchestrator.test.ts [2m([22m[2m6 tests[22m[2m)[22m[33m 499[2mms[22m[39m
       [33m[2m✓[22m[39m session_start handler runs and calls ctx.ui.setStatus with the expected key [33m 468[2mms[22m[39m
 [32m✓[39m tests/task-registry.test.ts [2m([22m[2m24 tests[22m[2m)[22m[33m 405[2mms[22m[39m
 [32m✓[39m tests/skill-stats.test.ts [2m([22m[2m4 tests[22m[2m)[22m[33m 565[2mms[22m[39m
     [33m[2m✓[22m[39m aggregates structured, prompt, and manual-read evidence safely [33m 470[2mms[22m[39m
 [32m✓[39m tests/codex-status.test.ts [2m([22m[2m10 tests[22m[2m)[22m[32m 280[2mms[22m[39m
 [32m✓[39m tests/workflow-commands.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 252[2mms[22m[39m
 [32m✓[39m tests/permission-registry.test.ts [2m([22m[2m17 tests[22m[2m)[22m[32m 177[2mms[22m[39m
 [32m✓[39m tests/tasks.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 188[2mms[22m[39m
 [32m✓[39m tests/memory-retrieve.test.ts [2m([22m[2m5 tests[22m[2m)[22m[33m 321[2mms[22m[39m
 [32m✓[39m tests/settings-loader.test.ts [2m([22m[2m19 tests[22m[2m)[22m[32m 215[2mms[22m[39m
 [32m✓[39m tests/transcript-fixtures.test.ts [2m([22m[2m23 tests[22m[2m)[22m[33m 597[2mms[22m[39m
 [32m✓[39m tests/transcript-log.test.ts [2m([22m[2m30 tests[22m[2m)[22m[33m 1036[2mms[22m[39m
 [32m✓[39m tests/transcript-correlation.test.ts [2m([22m[2m17 tests[22m[2m)[22m[33m 935[2mms[22m[39m
 [32m✓[39m tests/permissions.test.ts [2m([22m[2m14 tests[22m[2m)[22m[32m 186[2mms[22m[39m
 [32m✓[39m tests/snapshot-restore-smoke.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 111[2mms[22m[39m
 [32m✓[39m tests/transcript-integration.test.ts [2m([22m[2m16 tests[22m[2m)[22m[33m 1350[2mms[22m[39m
     [33m[2m✓[22m[39m correlates out-of-order parallel completions by tool_call_id [33m 320[2mms[22m[39m
     [33m[2m✓[22m[39m a single turn with routing + tool call produces all expected event families with redacted secrets [33m 467[2mms[22m[39m
 [32m✓[39m tests/skill-discovery.test.ts [2m([22m[2m13 tests[22m[2m)[22m[32m 244[2mms[22m[39m
 [32m✓[39m tests/damage-control.test.ts [2m([22m[2m46 tests[22m[2m)[22m[32m 98[2mms[22m[39m
 [32m✓[39m tests/prompt-router.test.ts [2m([22m[2m61 tests[22m[2m)[22m[32m 233[2mms[22m[39m
 [32m✓[39m tests/metrics.test.ts [2m([22m[2m11 tests[22m[2m)[22m[32m 156[2mms[22m[39m
 [32m✓[39m tests/repo-id.test.ts [2m([22m[2m70 tests[22m[2m)[22m[32m 73[2mms[22m[39m
 [32m✓[39m tests/operator-state.test.ts [2m([22m[2m28 tests[22m[2m)[22m[32m 72[2mms[22m[39m
 [32m✓[39m tests/reload-status.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 43[2mms[22m[39m
 [32m✓[39m tests/refresh-models.test.ts [2m([22m[2m10 tests[22m[2m)[22m[32m 37[2mms[22m[39m
 [32m✓[39m tests/model-routing.test.ts [2m([22m[2m11 tests[22m[2m)[22m[32m 41[2mms[22m[39m
 [32m✓[39m tests/runtime-smoke.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 25[2mms[22m[39m
 [32m✓[39m tests/commit-guard.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 25[2mms[22m[39m
 [32m✓[39m tests/provider.test.ts [2m([22m[2m10 tests[22m[2m)[22m[32m 30[2mms[22m[39m
 [32m✓[39m tests/persistent-defaults.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 19[2mms[22m[39m
 [32m✓[39m tests/extension-utils.test.ts [2m([22m[2m13 tests[22m[2m)[22m[32m 22[2mms[22m[39m
 [32m✓[39m tests/agent-team.test.ts [2m([22m[2m11 tests[22m[2m)[22m[32m 17[2mms[22m[39m
 [32m✓[39m tests/memory-promote-scan.test.ts [2m([22m[2m13 tests[22m[2m)[22m[32m 19[2mms[22m[39m
 [32m✓[39m tests/hook-schema.test.ts [2m([22m[2m15 tests[22m[2m)[22m[32m 19[2mms[22m[39m
 [32m✓[39m tests/workflow-commands-pure.test.ts [2m([22m[2m27 tests[22m[2m)[22m[32m 30[2mms[22m[39m
 [32m✓[39m tests/branch-command.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 18[2mms[22m[39m
 [32m✓[39m tests/session-hooks.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 78[2mms[22m[39m
 [32m✓[39m tests/todo-pure.test.ts [2m([22m[2m27 tests[22m[2m)[22m[32m 16[2mms[22m[39m
 [32m✓[39m tests/permission-rules.test.ts [2m([22m[2m19 tests[22m[2m)[22m[32m 14[2mms[22m[39m
 [32m✓[39m tests/direct-personality.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 19[2mms[22m[39m
 [32m✓[39m tests/commit-message.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m tests/workflow-prompts.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m tests/context.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 14[2mms[22m[39m
 [32m✓[39m tests/memory-eval/bootstrap.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m tests/tool-search-pure.test.ts [2m([22m[2m10 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m tests/skill-loader.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m tests/web-tools-pure.test.ts [2m([22m[2m18 tests[22m[2m)[22m[32m 18[2mms[22m[39m
 [32m✓[39m tests/quality-gates.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m tests/memory-eval/score.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m tests/shell-edit-guard.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m tests/skill-prompt.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m tests/model-visibility.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m tests/observability.test.ts [2m([22m[2m8 tests[22m[2m)[22m[33m 19631[2mms[22m[39m
     [33m[2m✓[22m[39m commit_stage emits a commit.stage timing span [33m 9683[2mms[22m[39m
     [33m[2m✓[22m[39m commit_create emits a commit.create timing span [33m 9896[2mms[22m[39m
 [32m✓[39m tests/pwsh-pure.test.ts [2m([22m[2m15 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m tests/commit-mutation.test.ts [2m([22m[2m18 tests[22m[2m)[22m[33m 25543[2mms[22m[39m
     [33m[2m✓[22m[39m commit_stage rejects missing token and never stages unsafe ignored paths [33m 10751[2mms[22m[39m
     [33m[2m✓[22m[39m commit_create revalidates staged set and message immediately before commit [33m 12621[2mms[22m[39m
     [33m[2m✓[22m[39m returns untracked files without throwing on a repo with no commits [33m 750[2mms[22m[39m
     [33m[2m✓[22m[39m leaves no staged files after commitCurrentChanges throws via a failing pre-commit hook [33m 1410[2mms[22m[39m
 [32m✓[39m tests/commit-planning.test.ts [2m([22m[2m6 tests[22m[2m)[22m[33m 27569[2mms[22m[39m
     [33m[2m✓[22m[39m preserves tracked file -> ignored -> git rm --cached staged deletion [33m 6794[2mms[22m[39m
     [33m[2m✓[22m[39m marks ignored untracked files unsafe to add [33m 4949[2mms[22m[39m
     [33m[2m✓[22m[39m blocks detached HEAD before mutation [33m 5023[2mms[22m[39m
     [33m[2m✓[22m[39m blocks mergeInProgress [33m 5261[2mms[22m[39m
     [33m[2m✓[22m[39m blocks rebaseInProgress [33m 2985[2mms[22m[39m
     [33m[2m✓[22m[39m blocks hasUnmergedPaths [33m 2555[2mms[22m[39m

[2m Test Files [22m [1m[32m71 passed[39m[22m[90m (71)[39m
[2m      Tests [22m [1m[32m934 passed[39m[22m[90m (934)[39m
[2m   Start at [22m 22:52:03
[2m   Duration [22m 29.02s[2m (transform 9.59s, setup 0ms, import 47.71s, tests 144.35s, environment 24ms)[22m

