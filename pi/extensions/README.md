# Pi Extensions

This directory is pnpm-managed. Use `pnpm install --frozen-lockfile` and `pnpm run typecheck` here for Pi TypeScript dependencies. Do not use Bun for Pi TypeScript packages or tests: no `bun add`, `bun install`, `bun run`, or `bun test` in `pi/extensions/` or `pi/tests/`. Tests resolve Pi packages from `pi/extensions/node_modules` and are run with pnpm/Vitest.

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
`extension-utils.ts`, `transcript.ts`, `yaml-helpers.ts`, and friends
live). Templates intended for copy-paste should use the `.ts.example`
suffix so auto-discovery skips them.

## Snapshot retirement

The legacy `*-mental-model.json` snapshot loader/regenerator has been
retired. Per-agent JSONL logs at
`pi/multi-team/expertise/**/*-expertise-log.jsonl` are now the single
source of truth, and startup memory hydration uses procedural files plus
the JSONL-backed retrieval block in `pi/lib/memory-retrieve.ts`. The
read path in `pi/extensions/agent-chain.ts` no longer rebuilds or writes
mental-model snapshots; it renders a category-grouped raw view directly
from JSONL.

Historical snapshots are preserved offline:

- Archive location: `~/.pi/agent/index/archive/{ISO-ts}/` (timestamped).
- Each archive carries `manifest.json` (file list + SHA256s),
  `restore.md`, and `transcript.log`.
- Retention: keep each archive at least 30 days unless explicitly
  deleted.

Restore workflow:

```bash
just memory-snapshot-restore-smoke   # parse + ExpertiseSnapshot shape check
# or, to actually restore the files in place:
cp -R ~/.pi/agent/index/archive/<ts>/pi/multi-team/expertise pi/multi-team/expertise
```

(Windows / pwsh: `Copy-Item -Path ... -Destination ... -Recurse -Force`.)

Subdirectories under `pi/extensions/` (such as `pi/extensions/subagent/` and
`pi/extensions/web-fetch/`) are not auto-discovered; only top-level `*.ts`
files are.

## Command surface selection

Do not default to TypeScript for every slash command. Pick the smallest Pi
surface that matches the behavior:

| Need | Location |
|---|---|
| Prompt-only slash command with static instructions and optional arguments | `pi/prompts/<name>.md` |
| Reusable agent guidance or domain workflow | `pi/skills/<name>/SKILL.md` |
| Runtime/state/UI/autocomplete/git/session behavior | TypeScript extension command |

Prompt-only templates support frontmatter, `argument-hint`, and `$ARGUMENTS`
substitution. TypeScript runtime commands are still correct for commands such as
`/commit`, which need git inspection, secret scanning, UI prompts, and staged
file control.

Extension commands have precedence over prompt templates. Before adding a
prompt-only command, check that no top-level extension shadows it:

```bash
grep -R 'registerCommand("<name>"' pi/extensions/*.ts
```

Example: `/handoff` belongs in `pi/prompts/handoff.md`; `/commit` belongs in
`pi/extensions/workflow-commands.ts`.

## Default export

Every extension MUST export a default function with this shape:

```ts
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

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

## Safe edit tools

Prefer Pi-native `text_edit` and `structured_edit` for tracked repo edits when they fit:

- Use `text_edit` instead of Python heredoc, `sed -i`, `perl -pi`, or `cat >` for literal replacement, regex replacement, LF normalization, and final-newline changes.
- Use `structured_edit` instead of ad hoc JSON mutation scripts for JSON `set` and `delete` operations.
- These tools enforce repo containment, reject `.env`/secret-like and gitignored targets, provide bounded dry-run/previews, and make expected match counts explicit.

Shell/Python edits are still acceptable for read-only analysis or cases outside these tools' scope, but do not use mutating Python heredoc snippets for routine tracked repo edits.

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

## Damage-control extension

Damage-control is Pi-only safety enforcement for shell and file-tool decisions. `damage-control.ts` is the Pi event adapter; `damage-control-rules.ts` loads and validates the policy schema with `pi/lib/yaml-mini.ts`; `damage-control-engine.ts` contains pure deny/ask/allow decisions; `damage-control-debug.ts` contains opt-in redacted logging.

Debug logging is off by default. Set `PI_DAMAGE_CONTROL_DEBUG=1` only while investigating, then inspect `.pi/damage-control-debug.log` or `~/.pi/agent/damage-control-debug.log` for redacted synthetic entries. Do not print old damage-control debug logs because they may predate redaction guarantees.

Validate changes with pnpm only:

```bash
cd pi/tests && pnpm test damage-control.test.ts
cd pi/extensions && pnpm run typecheck
make check-pi-extensions
```

Safe live smoke tests must use a disposable temp repo, synthetic sentinel `.env`/key-like paths, or temporary test-only rules. Do not execute shell reads against real `.env`, SSH private keys, `*.pem`, or `*.key` files. If runtime source is not the same symlink/inode/checksum as this repo, rerun the dotfiles link/install flow or otherwise sync before live smoke. Linux-only ask rules such as `docker compose down` should be validated with unit tests on Windows/macOS unless a temporary non-destructive ask rule is used.

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

## Pi `/commit` extension

Pi owns `/commit` through the existing `pi/extensions/workflow-commands.ts` command registration. The Pi-native commit tools live in `pi/extensions/commit.ts` as their own auto-discovered extension, so there is still exactly one slash-command owner for `commit`.

The extension exposes structured commit tools:

- `commit_plan` and `commit_validate_message` are non-mutating.
- `commit_stage` and `commit_create` are mutating and require confirmation tokens generated from the exact path set shown by `commit_plan`.
- `commit_create` re-reads the staged set immediately before `git commit` and reports `pushed: false`; push/grouped-commit mutation is deferred.

The older Python `scripts/commit-helper` remains a compatibility/parity reference for non-Pi consumers. Pi behavior is canonical going forward.

### Direct-tool vs. slash-command usage

**Agents must not call the structured mutating tools `commit_stage` or `commit_create` directly outside of the `/commit` slash-command flow.**

The token-safety model is centralized in `/commit`: the command orchestrates `commit_plan`, presents the plan to the user for explicit approval, and only then passes the confirmation tokens to `commit_stage` and `commit_create`. Calling the mutating tools directly bypasses user review of the staged-path set and the commit message, eliminating the safety guarantee the token system provides.

This restriction is about the structured Pi commit tools only. It does not prohibit ordinary git operations. When the user explicitly asks an agent to commit, the agent may use a normal shell git workflow (`git status`, targeted `git add -- <paths>`, secret scan, `git diff --cached --check`, `git commit`) while following the repo's git safety rules.

`commit_plan` and `commit_validate_message` are non-mutating and may be called directly for inspection or validation purposes.

## Validation

`make check-pi-extensions` runs the full extension validation pipeline:

1. `cd pi/extensions && pnpm install --frozen-lockfile && pnpm run typecheck` -- strict TypeScript type-check using the pnpm-managed Pi dependency graph.
2. `cd pi/tests && pnpm install --frozen-lockfile && pnpm run test` -- the Vitest suite, including helper tests, per-extension behavioral tests, and runtime smoke checks.

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
