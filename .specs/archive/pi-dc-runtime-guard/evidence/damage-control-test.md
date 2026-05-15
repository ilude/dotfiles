# Damage-control test evidence
Command: cd pi/tests && pnpm test damage-control.test.ts
Cwd: /c/Users/mglenn/.dotfiles

> pi-extension-tests@ test C:\Users\mglenn\.dotfiles\pi\tests
> vitest run "damage-control.test.ts"


[1m[30m[46m RUN [49m[39m[22m [36mv4.1.5 [39m[90mC:/Users/mglenn/.dotfiles/pi[39m

 [32m✓[39m tests/damage-control.test.ts [2m([22m[2m63 tests[22m[2m)[22m[33m 2913[2mms[22m[39m
     [33m[2m✓[22m[39m registers /damage-control and /dc session-local mode commands [33m 341[2mms[22m[39m
     [33m[2m✓[22m[39m sets status and prompts through the registered bash handler [33m 519[2mms[22m[39m
     [33m[2m✓[22m[39m real tracked rules block synthetic secret reads and destructive commands [33m 539[2mms[22m[39m
     [33m[2m✓[22m[39m real tracked rules block dangerous bash command strings through the registered handler [33m 325[2mms[22m[39m
     [33m[2m✓[22m[39m real tracked rules allow safe bash command strings through the registered handler [33m 369[2mms[22m[39m

[2m Test Files [22m [1m[32m1 passed[39m[22m[90m (1)[39m
[2m      Tests [22m [1m[32m63 passed[39m[22m[90m (63)[39m
[2m   Start at [22m 22:44:29
[2m   Duration [22m 3.59s[2m (transform 368ms, setup 0ms, import 221ms, tests 2.91s, environment 0ms)[22m

Exit code: 0
Conclusion: damage-control handler regression tests pass; destructive command strings are inert test inputs.
