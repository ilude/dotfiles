# Pi Extensions

This directory contains the TypeScript extensions Pi auto-discovers at startup.
Every top-level `*.ts` file here is loaded by Pi as an extension module via its
`export default function (pi: ExtensionAPI) { ... }` factory.

The conventions below exist so future extensions are easy to read, refactor, and
test, and so safety-critical code paths stay correct under refactor pressure.

## Auto-discovery hazard (read this first)

Pi auto-discovers extensions from `~/.dotfiles/pi/extensions/*.ts` (see
`pi/README.md`). Any non-extension `.ts` file placed here will either:

- crash startup because it does not export a valid extension factory, or
- be silently registered as an empty extension if it exports a no-op factory
  (the workaround `pi/extensions/transcript-runtime.ts:30-40` documents).

**Do not put helpers, libraries, or scaffolds at the top level of
`pi/extensions/`.** Put them under `pi/lib/` (this is where
`extension-utils.ts`, `transcript.ts`, `expertise-snapshot.ts`,
`yaml-helpers.ts`, and friends live). Templates intended for copy-paste
should use the `.ts.example` suffix so auto-discovery skips them.

Subdirectories under `pi/extensions/` (such as `pi/extensions/subagent/` and
`pi/extensions/web-fetch/`) are not auto-discovered; only top-level `*.ts`
files are.

## Default export

Every extension MUST export a default function with this shape:

```ts
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  // register tools, hooks, commands here
}
```

## Shared helpers (pi/lib/extension-utils.ts)

Import shared helpers from `../lib/extension-utils.js` (TypeScript source is
`pi/lib/extension-utils.ts`; the `.js` extension matches the existing
ESM import pattern used by `session-hooks.ts` etc.):

```ts
import {
  canonicalize,
  formatToolError,
  getAgentDir,
  getMultiTeamDir,
  uiNotify,
} from "../lib/extension-utils.js";
```

| Helper | Purpose |
|---|---|
| `getAgentDir()` | Canonical Pi agent state dir (`~/.pi/agent`). |
| `getMultiTeamDir()` | Multi-team expertise root with `PI_MULTI_TEAM_DIR` override and dotfiles fallback. |
| `canonicalize(filePath, cwd?)` | Symlink-resolving path normalization that rejects NUL bytes and expands `~/`. |
| `formatToolError(message, opts?)` | Standard `{ content, details, isError: true }` shape for tool failures. |
| `uiNotify(ctx, level, message, opts?)` | Consistent UI notification wrapper. Falls back to console when no UI is available. |

Use these helpers when:

- you need a canonical path for a safety check,
- you are returning an error from a tool's `execute()` handler,
- you are showing the user a status/warning/error message,
- you need the agent or multi-team directory.

## Tool error shape

Tool `execute()` handlers MUST return errors via `formatToolError(message)` (or
an equivalent shape) so the UI and downstream LLM see consistent error
content. A tool returning ad-hoc shapes makes downstream filtering and
classification fragile.

```ts
async execute(_id, params, _signal, _onUpdate, ctx) {
  if (!ctx.hasUI) {
    return formatToolError("(no UI available -- cannot prompt user)");
  }
  // ...
}
```

## UI notifications

Prefer `uiNotify(ctx, level, message, { prefix: "extension-name" })` over
direct `ctx.ui.notify(...)` calls so messages get a consistent
`[extension-name]` prefix and a sensible non-UI fallback. Direct
`ctx.ui.notify` is acceptable when the call site has a Documented Exception
(see below) -- typically when the message is already inside a structured UI
component (e.g. a modal title) and a prefix would be redundant.

## Path handling

When an extension reads a path from tool input:

1. Resolve relative paths against `ctx.cwd` (do not assume `process.cwd()`).
2. Pass through `canonicalize(rawPath, ctx.cwd)` before any safety check or
   pattern match. `canonicalize` resolves symlinks (defending against
   traversal escapes), expands `~/`, and rejects NUL bytes.
3. Compare against patterns or rules using the canonicalized form, not the
   raw input.

## Config loading

For YAML config files use `pi/lib/yaml-mini.ts` (TS-native, no subprocess) when
the file is small and structured. Fall back to `pi/lib/yaml-helpers.ts:loadYamlViaPython`
only when the file requires full YAML 1.2 semantics that the mini loader does
not cover. Bespoke per-file parsers are acceptable when the file format is
genuinely Pi-specific (e.g. embedded DSLs); use a Documented Exception in that
case.

## Documented Exception

When a refactor leaves a file using a direct API (e.g. `ctx.ui.notify`), an
ad-hoc result shape, or a bespoke parser instead of the shared helper, the
file MUST contain a top-of-file or call-site comment of the form:

```
// Convention exception: <one-line rationale>.
// Risk: <what breaks if this drifts>.
// Why shared helper is inappropriate: <reason>.
```

A bare TODO or a comment without all three lines is NOT a documented
exception and fails review. Reviewers should reject any deviation from the
shared conventions that is not documented this way.

## Validation

`make check-pi-extensions` runs the full extension validation pipeline:

1. `python pi/extensions/tsc-check.py` -- strict TypeScript type-check across
   every top-level extension file.
2. `cd pi/tests && bun vitest run` -- the Vitest suite, including helper
   tests and per-extension behavioral tests.
3. Pi runtime smoke -- launches Pi with a controlled extension flag and
   asserts no helper file from `pi/lib/` is auto-discovered.

Run this target after any extension or helper change.

## Adding a new extension

Start from `pi/extensions/template.extension.ts.example`:

```bash
cp pi/extensions/template.extension.ts.example pi/extensions/my-feature.ts
```

Then:

1. Implement the default export.
2. Import shared helpers as needed.
3. Add a behavioral test under `pi/tests/my-feature.test.ts`.
4. Run `make check-pi-extensions`.
