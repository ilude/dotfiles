---
reviewer: typescript-pro
status: complete
---

# Findings list

## Finding 1

severity: high  
evidence: T4 allows extending `operator-status.ts` by importing `damage-control.ts` unless "direct import is unsafe". `damage-control.ts` is an extension entrypoint with mutable module health and default registration logic; coupling `/doctor` to it risks stale state or circular/runtime load ordering issues when Pi loads extensions independently.  
required_fix: Make the plan require a side-effect-light shared module such as `pi/lib/damage-control-health.ts` for health state read/write. `damage-control.ts` should publish health there; `operator-status.ts` should only consume that module.

## Finding 2

severity: high  
evidence: T2/T4 health expectations depend on module-local `lastDamageControlHealth`. If `/doctor` and the extension are imported through different paths (`.ts` in tests, compiled `.js` at runtime, or duplicate resolution), doctor can report the initial failed state while damage-control is active.  
required_fix: Add an extension-load smoke test that registers both damage-control and operator-status in one fake Pi runtime and asserts `/doctor --verbose` sees the health set by `session_start`/load, not a separately imported default.

## Finding 3

severity: medium  
evidence: T7 asks for registered handler tests, but earlier acceptance criteria still permit helper-only coverage for regex, wrapper, and secret/exfil behavior. Helper tests can pass while Pi runtime event shape, `ctx.cwd`, `ctx.ui`, or `pi.on("tool_call")` assumptions fail.  
required_fix: Require every new rule class to have at least one registered `tool_call` smoke test using real-shaped bash/read/write events, alongside unit helper tests for edge cases.

## Finding 4

severity: medium  
evidence: Validation commands include `cd pi/extensions && pnpm run typecheck`, but runtime imports cross package boundaries into `../lib/*` and tests import `../extensions/*.ts`. A package-local typecheck may miss test/runtime API mismatches if test tsconfig differs.  
required_fix: Add `cd pi/tests && pnpm exec tsc --noEmit` or the existing tests package typecheck script if present, and require `pnpm test` after extension build/typecheck to catch ESM/runtime import failures.

## Finding 5

severity: medium  
evidence: T6 requires shell-wrapper detection for `bash -c`, `sh -c`, `python -c`, and `node -e`, but the acceptance examples only assert `bash -c 'rm -fr ./build'` plus one safe command. Implementers can satisfy tests while leaving other named wrappers unhandled.  
required_fix: Add explicit matrix cases for each wrapper named in the task, with one destructive and one safe command per wrapper, or narrow the task text to only bash/sh wrappers.
