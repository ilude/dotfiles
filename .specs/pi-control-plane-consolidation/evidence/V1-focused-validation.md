# V1 focused validation

## Command 1
cwd: pi/tests
command: pnpm install --frozen-lockfile && pnpm test branch-command.test.ts
Lockfile is up to date, resolution step is skipped
Already up to date

Done in 920ms using pnpm v10.33.2

> pi-extension-tests@ test C:\Users\mglenn\.dotfiles\pi\tests
> vitest run "branch-command.test.ts"


[1m[30m[46m RUN [49m[39m[22m [36mv4.1.5 [39m[90mC:/Users/mglenn/.dotfiles/pi[39m

 [32m✓[39m tests/branch-command.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 14[2mms[22m[39m

[2m Test Files [22m [1m[32m1 passed[39m[22m[90m (1)[39m
[2m      Tests [22m [1m[32m6 passed[39m[22m[90m (6)[39m
[2m   Start at [22m 11:45:56
[2m   Duration [22m 2.11s[2m (transform 359ms, setup 0ms, import 1.63s, tests 14ms, environment 0ms)[22m

exit_code: 0

## Command 2
cwd: pi/tests
command: pnpm test task-registry.test.ts tasks.test.ts

> pi-extension-tests@ test C:\Users\mglenn\.dotfiles\pi\tests
> vitest run "task-registry.test.ts" "tasks.test.ts"


[1m[30m[46m RUN [49m[39m[22m [36mv4.1.5 [39m[90mC:/Users/mglenn/.dotfiles/pi[39m

 [32m✓[39m tests/tasks.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 153[2mms[22m[39m
 [32m✓[39m tests/task-registry.test.ts [2m([22m[2m24 tests[22m[2m)[22m[32m 176[2mms[22m[39m

[2m Test Files [22m [1m[32m2 passed[39m[22m[90m (2)[39m
[2m      Tests [22m [1m[32m36 passed[39m[22m[90m (36)[39m
[2m   Start at [22m 11:46:00
[2m   Duration [22m 681ms[2m (transform 240ms, setup 0ms, import 272ms, tests 329ms, environment 0ms)[22m

exit_code: 0

## Command 3
cwd: pi/tests
command: pnpm test subagent.test.ts

> pi-extension-tests@ test C:\Users\mglenn\.dotfiles\pi\tests
> vitest run "subagent.test.ts"


[1m[30m[46m RUN [49m[39m[22m [36mv4.1.5 [39m[90mC:/Users/mglenn/.dotfiles/pi[39m

 [32m✓[39m tests/subagent.test.ts [2m([22m[2m6 tests[22m[2m)[22m[33m 2439[2mms[22m[39m
     [33m[2m✓[22m[39m uses modelSize/modelPolicy to override pinned agent models [33m 2275[2mms[22m[39m

[2m Test Files [22m [1m[32m1 passed[39m[22m[90m (1)[39m
[2m      Tests [22m [1m[32m6 passed[39m[22m[90m (6)[39m
[2m   Start at [22m 11:46:02
[2m   Duration [22m 2.84s[2m (transform 310ms, setup 0ms, import 116ms, tests 2.44s, environment 0ms)[22m

exit_code: 0

## Command 4
cwd: pi/tests
command: pnpm test task-dependencies.test.ts task-security.test.ts task-renderer.test.ts task-tools.test.ts

> pi-extension-tests@ test C:\Users\mglenn\.dotfiles\pi\tests
> vitest run "task-dependencies.test.ts" "task-security.test.ts" "task-renderer.test.ts" "task-tools.test.ts"


[1m[30m[46m RUN [49m[39m[22m [36mv4.1.5 [39m[90mC:/Users/mglenn/.dotfiles/pi[39m

 [32m✓[39m tests/task-security.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 16[2mms[22m[39m
 [32m✓[39m tests/task-tools.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 99[2mms[22m[39m
 [32m✓[39m tests/task-dependencies.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 44[2mms[22m[39m
 [32m✓[39m tests/task-renderer.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 19[2mms[22m[39m

[2m Test Files [22m [1m[32m4 passed[39m[22m[90m (4)[39m
[2m      Tests [22m [1m[32m10 passed[39m[22m[90m (10)[39m
[2m   Start at [22m 11:46:06
[2m   Duration [22m 662ms[2m (transform 376ms, setup 0ms, import 539ms, tests 178ms, environment 1ms)[22m

exit_code: 0
