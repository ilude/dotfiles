---
reviewer: typescript-pro-toolchain
status: changes_requested
---

## Finding 1

severity: high
evidence: `pi/extensions/README.md` says every top-level `pi/extensions/*.ts` is auto-discovered and must export a default extension factory; it explicitly says not to put helpers at top level. Plan T1 proposes `pi/extensions/safe-edit.ts` as a helper module.
required_fix: Move shared helpers to `pi/lib/safe-edit.ts` (or another `pi/lib` module) and import from extensions with the existing `.js` ESM pattern, e.g. `../lib/safe-edit.js`.

## Finding 2

severity: high
evidence: Success criteria and T3/T4 verification use grep for `name: "text_edit"` / `name: "structured_edit"`. That can pass for files that typecheck but are not loadable Pi extensions. `pi/extensions/README.md` requires top-level extensions to default-export `function (pi: ExtensionAPI)`.
required_fix: Add acceptance criteria and tests that import each top-level extension, invoke its default export with a fake `ExtensionAPI`, and assert `registerTool` receives `text_edit`/`structured_edit` with executable handlers.

## Finding 3

severity: medium
evidence: T3/T4 list parameters but do not require TypeBox schemas. Existing tools use `parameters: Type.Object(...)` from `@sinclair/typebox`; Pi tool registration expects schema metadata for runtime/tool API exposure.
required_fix: Require explicit TypeBox parameter schemas, using literal operation modes and `Type.Union`/nested `Type.Object` definitions for `literal_replace`, `regex_replace`, `normalize_line_endings`, `ensure_final_newline`, JSON `set`, and JSON `delete`.

## Finding 4

severity: medium
evidence: T4 says JSON operations use “selector/path syntax” but does not define that syntax. Implementers can choose incompatible JSONPath, dot-path, slash-path, or array forms while still satisfying current grep and parse tests.
required_fix: Define one selector format in the plan, preferably a typed array path like `Array<string | number>`, and require tests for object keys, array indexes, missing parents, and delete semantics.

## Finding 5

severity: medium
evidence: The plan requires rejecting ignored paths and broad globs “where practical,” but no acceptance criteria verifies gitignore checks or glob expansion boundaries. This creates a mutating tool that can pass tests while writing generated/vendor/ignored files.
required_fix: Specify exact path policy: no glob strings in v1 unless resolved to an explicit bounded path list, reject `.env*`, directories, paths outside `ctx.cwd`, and git-ignored targets via `git check-ignore` or documented fallback; add negative tests.
