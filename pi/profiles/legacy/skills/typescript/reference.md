# TypeScript and JavaScript reference

Use this reference after identifying the owning package. The manifest, workspace files, lockfile, scripts, compiler configuration, and configured supply-chain controls are authoritative; this file does not select a package manager or framework.

## Package and dependency boundaries

- Find the nearest package root and workspace before editing dependencies. Read scripts and lockfile together; do not assume the repository root owns the package.
- Decide runtime versus development dependency from whether the published or deployed code imports it. Keep test, build, and type-only dependencies out of runtime packages.
- Inspect install, prepare, preinstall, postinstall, and native-build scripts before resolving a dependency. Treat lifecycle scripts and native builds as code execution and preserve configured approval, lockfile, registry, age, and source controls.
- Use the existing manager and frozen or locked install mode when configured. Do not invent hardening configuration or bypass a project's controls to make installation pass.

## Module format and exports

- Preserve the package's ESM/CJS mode and compiler/runtime resolution. Check `package.json` fields, compiler configuration, and the actual runtime rather than assuming ESM or a bundler.
- When changing exports, verify every supported import path, including declaration paths, conditional exports, extension requirements, and package self-references. A typecheck alone may not exercise runtime resolution.
- Keep source, generated output, and package entry paths consistent. Do not expose an internal file merely to satisfy a test or editor.

## Types, schemas, and generated declarations

- Static types constrain callers at compile time; runtime schemas validate untrusted data; tests verify behavior. Do not substitute one artifact for another.
- Use the project's configured schema or validation library only when the boundary needs runtime validation. Parse external input into a trusted representation and preserve the distinction between `unknown`, validated values, and assertions.
- Check whether `types` or `exports` point to generated declarations. Read the documented build prerequisite before running type checks in a fresh workspace, and do not claim declarations are valid if their generating step was not run.
- Preserve public types, serialization, and error behavior unless the requested change changes that contract.

## Async, cleanup, and runtime traps

- Make resource ownership explicit for timers, child processes, sockets, file handles, subscriptions, and temporary state. Register cleanup at creation and use `finally` or the configured teardown mechanism.
- Watch for module-load side effects, import cycles, top-level await, environment caching, promise rejection, and differences between test and production runtimes.
- Keep external input and dependency failures visible. Do not hide them with broad catches, silent defaults, or compatibility shims that are not part of the contract.

## Testing and checks

- Read the package test script and runner configuration before selecting a command. Verify how script arguments are forwarded before adding a file filter or option; use the project's documented form.
- Test observable behavior at the relevant seam. Keep fixtures isolated, expectations independent of the implementation, cleanup reliable, and real filesystem, parser, database, subprocess, or protocol boundaries real when they determine the contract.
- Run the smallest configured type, lint, build-prerequisite, or test check that can falsify the change. Framework-specific guidance is conditional on the project using that framework.
