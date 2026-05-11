# V1 dependency helper and renderer validation
cwd: pi/tests
command: pnpm install --frozen-lockfile && pnpm test task-registry.test.ts tasks.test.ts task-dependencies.test.ts task-renderer.test.ts task-tools.test.ts task-security.test.ts
Lockfile is up to date, resolution step is skipped
Already up to date

Done in 658ms using pnpm v10.33.2

> pi-extension-tests@ test C:\Users\mglenn\.dotfiles\pi\tests
> vitest run "task-registry.test.ts" "tasks.test.ts" "task-dependencies.test.ts" "task-renderer.test.ts" "task-tools.test.ts" "task-security.test.ts"


[1m[30m[46m RUN [49m[39m[22m [36mv4.1.5 [39m[90mC:/Users/mglenn/.dotfiles/pi[39m

 [32m✓[39m tests/task-tools.test.ts [2m([22m[2m3 tests[22m[2m)[22m[33m 430[2mms[22m[39m
     [33m[2m✓[22m[39m registers MVP lower_snake_case task tools [33m 415[2mms[22m[39m
 [32m✓[39m tests/task-security.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 23[2mms[22m[39m
 [32m✓[39m tests/task-renderer.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 116[2mms[22m[39m
 [32m✓[39m tests/task-dependencies.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 191[2mms[22m[39m
 [32m✓[39m tests/task-registry.test.ts [2m([22m[2m24 tests[22m[2m)[22m[32m 296[2mms[22m[39m
 [32m✓[39m tests/tasks.test.ts [2m([22m[2m17 tests[22m[2m)[22m[33m 466[2mms[22m[39m
     [33m[2m✓[22m[39m treats empty as list [33m 345[2mms[22m[39m

[2m Test Files [22m [1m[32m6 passed[39m[22m[90m (6)[39m
[2m      Tests [22m [1m[32m56 passed[39m[22m[90m (56)[39m
[2m   Start at [22m 14:11:55
[2m   Duration [22m 1.19s[2m (transform 540ms, setup 0ms, import 890ms, tests 1.52s, environment 1ms)[22m

exit=0
