---
reviewer: typescript-pro-module-runtime
status: complete
---

# Findings

- severity: high
  evidence: "T2 files: new `damage-control-rules.ts`, `damage-control-engine.ts`, `damage-control-debug.ts`; T2 acceptance only greps `from \"./damage-control` while existing Pi extension sibling imports use `.js` specifiers such as `prompt-router.ts: import ... from \"./transcript-runtime.js\"`."
  required_fix: Add an explicit T2 acceptance criterion that all new relative ESM imports in `pi/extensions/*.ts` use runtime-compatible `.js` specifiers, and verify with a grep or TypeScript/Node import smoke check. Do not allow `.ts` or extensionless relative imports in production extension modules.

- severity: high
  evidence: "Constraints mention runtime copies/symlinks under `~/.pi/agent/extensions/`, but T3 dependency verification only runs `cd pi/extensions && pnpm install --frozen-lockfile && pnpm run typecheck`; manual smoke says restart Pi but does not verify dependency resolution from the actual runtime extension path."
  required_fix: Before adding `yaml`, require a runtime-path check that proves `~/.pi/agent/extensions` is the repo path/symlink or that its module resolution can see `pi/extensions/node_modules`. Add a post-T3 restarted-Pi smoke criterion that imports/loads damage-control without `ERR_MODULE_NOT_FOUND` for the YAML parser.

- severity: medium
  evidence: "T3 says `Prefer the yaml npm package plus TypeScript type guards or TypeBox validation already available in pi/extensions/package.json`, but the existing TypeBox dependency in `pi/extensions/package.json` is only `@sinclair/typebox`; no `@sinclair/typebox/value` package boundary or validation import convention is specified."
  required_fix: Specify the schema-validation implementation and imports before execution. If using TypeBox Value, verify the import path is exported by the installed package and works under the Pi runtime; otherwise use plain type guards. Add a test/typecheck criterion covering invalid policy validation through the chosen validator.

- severity: medium
  evidence: "T2 says `Keep public exports needed by tests stable or update tests to import from the new modules directly`; current tests import `../extensions/damage-control.ts` and call exported pure helpers from the adapter file."
  required_fix: Decide the public test API in the plan. Either keep compatibility re-exports from `damage-control.ts` for `parseDamageControlRules`, `loadRules`, `checkZeroAccess`, `evaluateDangerousCommand`, etc., or update tests to import specific new modules and add an acceptance check that no test imports adapter-only runtime wiring for pure engine/parser tests.
