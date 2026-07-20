---
name: typescript
description: TypeScript/JavaScript development with Bun, Biome, Zod, and modern tooling. Activate when working with .ts, .tsx, .js, .jsx files, package.json, or discussing TypeScript/JavaScript patterns.
---

# TypeScript/JavaScript Projects Workflow

Compact index for TypeScript and JavaScript work. Load linked files only when the task needs that framework or deeper examples.

## Auto-activate when

- Editing `.ts`, `.tsx`, `.js`, `.jsx`, `package.json`, lockfiles, `tsconfig.json`, Biome, Vite, Next.js, React, or test config.
- Discussing TypeScript/JavaScript patterns, package managers, ESM/CJS interop, runtime validation, or frontend build/test workflow.
- Do not use for generic web design without TypeScript/JavaScript changes.

## Project-specific rules

- Prefer the existing package manager from the repo lockfile/scripts.
- In this dotfiles repo, prefer `bun` for general JS/TS unless a package already uses `pnpm-lock.yaml` or Bun cannot resolve the package graph.
- Pi TypeScript is pnpm-only: `pi/extensions/` and `pi/tests/` must use `pnpm`, not `bun` or `npm`.
- Never create or commit `package-lock.json`; do not use `npm` unless the user explicitly asks for npm-specific troubleshooting.
- Preserve module style and formatter already used by the package; do not reformat unrelated code.
- Use deterministic code for routing, retries, transforms, status handling, and install detection; reserve judgment calls for ambiguous language tasks.
- Before adding or resolving dependencies, check the package-manager hardening guidance in
  `reference.md`; do not bypass lifecycle-script, build-script, or minimum-release-age
  protections to make installs pass.
- Treat `.vscode/tasks.json`, `.claude/settings.json`, `.gemini/settings.json`,
  `.cursor/rules/**`, `.github/workflows/**`, package lifecycle scripts, and setup scripts as
  executable or agent-instruction attack surface.

## Practical steps

1. Identify package root by lockfile and nearest `package.json`.
2. Read scripts before inventing commands.
3. Make the smallest change that matches local naming, import, error, and test patterns.
4. Validate the changed contract with the relevant typecheck, lint, or tests from that package.
5. If adding dependencies, update only the owning package manager files.

## Quick validation

| Context | Commands |
|---|---|
| Generic Bun package | `bun install --frozen-lockfile`; `bun run typecheck`; `bun test` |
| Generic pnpm package | `pnpm install --frozen-lockfile`; `pnpm run typecheck`; `pnpm test` |
| Dotfiles Pi extensions | `cd pi/extensions && pnpm install --frozen-lockfile && pnpm run typecheck` |
| Dotfiles Pi tests | `cd pi/tests && pnpm install --frozen-lockfile && pnpm run test` |
| Single Pi Vitest file | `cd pi/tests && pnpm test <file>.test.ts` (no `--`) |

## Anti-patterns

- Switching package managers or regenerating lockfiles outside the owning package.
- Adding runtime dependencies for problems already solved by local utilities or standard APIs.
- Rewriting module format, import style, or framework structure as drive-by cleanup.
- Treating schemas, type definitions, and tests as interchangeable; update the artifact that enforces the behavior.

## Optional references

- [reference.md](reference.md) - detailed guidance, examples, and templates.
- [testing.md](testing.md) - TS/JS testing patterns.
- [react.md](react.md), [nextjs.md](nextjs.md), [css.md](css.md) - framework-specific guidance.
