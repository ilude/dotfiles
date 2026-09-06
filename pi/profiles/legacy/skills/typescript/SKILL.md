---
name: typescript
description: "TypeScript or JavaScript files, package manifests, workspaces, module boundaries, or configured test/build behavior. Use for TypeScript-specific runtime and package traps. Not for general repository policy."
---

# TypeScript and JavaScript

Use this card when the task changes TypeScript, JavaScript, or its package configuration.

## Activation and routing

1. Identify the owning package root from the nearest manifest, lockfile, workspace file, scripts, and compiler configuration.
2. Read [reference.md](reference.md) for package, lifecycle, module, export, declaration, schema, and type traps.
3. Read [testing.md](testing.md) when the package's configured test runner is involved; load framework references only when that framework is present.
4. Use the package's configured manager, scripts, formatter, linter, compiler, and test runner. Do not infer universal tooling from this skill.

Completion evidence: the package root and configured commands are identified before editing, and the focused package check passes or its failure is reported.

## Recurring traps

- Discover the package root and workspace before changing dependencies. Choose runtime versus development dependency from how the package is consumed.
- Check lifecycle scripts and native-build requirements before installing or changing a dependency; preserve the project's supply-chain controls.
- Preserve the package's ESM/CJS mode, export paths, and runtime resolution. Test the actual entry path when exports or module format changes.
- Check test-script argument forwarding before passing filters or extra options. Generated declarations may require the configured build prerequisite before type checking.
- Distinguish runtime schemas, static types, and tests: each proves a different contract.
