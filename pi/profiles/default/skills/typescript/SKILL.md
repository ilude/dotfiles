---
name: typescript
description: Write or review TypeScript and JavaScript, especially typed object construction, runtime boundaries, modules, async resources, package configuration, and tests.
---

# TypeScript and JavaScript

Identify the owning package from its manifest, lockfile, scripts, and compiler configuration. Use its configured package manager, module format, formatter, linter, typecheck, and test runner.

## Type safety

- Do not use `any` when `unknown`, a generic, or a specific type works. Narrow `unknown` before use.
- Do not use a type assertion merely to silence an error. Assertions neither validate nor transform values.
- Prefer a typed declaration over an object-literal assertion. Use `satisfies` when checking an object while preserving its inferred type.
- At RPC, serialization, persistence, subprocess, and public API boundaries, explicitly construct the boundary type. Do not spread a broader internal object and assert it to a narrower type.

```ts
// Checks and transmits only the declared contract.
const request: Request = {
  id: input.id,
  prompt,
};
```

## Runtime boundaries

- Static types disappear at runtime. Validate untrusted files, environment values, decoded JSON, and network responses.
- Keep runtime dependencies separate from serializable data. Treat serialized shape as an explicit contract and test which fields cross it.
- Preserve public types, serialization, and error behavior unless the request changes that contract.

## Modules and resources

- Preserve the package's ESM/CJS mode, exports, runtime resolution, and supported import paths. Test the actual entry path when these change.
- Keep exports minimal and avoid mutable exported state.
- Make ownership and cleanup explicit for processes, sockets, timers, subscriptions, file handles, and temporary state. Use `finally` or the package's teardown mechanism.
- Keep dependency and external failures visible. Do not hide them with broad catches or silent fallbacks.

## Checks

- Read test scripts before passing filters or options.
- Run the smallest configured typecheck and focused tests that can falsify the change.
- Test observable behavior at the relevant runtime boundary. A typecheck alone does not prove validation, serialization, module resolution, or cleanup behavior.
