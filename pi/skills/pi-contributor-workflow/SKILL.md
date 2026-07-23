---
name: pi-contributor-workflow
description: "Pi-mono upstream contribution workflow. Activate only when working in badlogic/pi-mono or @mariozechner/pi-* packages and discussing Pi issue/PR submission, maintainer approval, contributor gates, pkg:* labels, changelog rules, or getting a Pi fix accepted upstream."
---

# Pi Contributor Workflow

Do **not** activate for generic GitHub contribution, generic npm packages, or non-Pi repositories.

## Core Principle

Pi changes are more likely to be accepted when they are small, validated with the repo's expected commands, tied to a high-signal issue, and respect the maintainer's contribution gates.

## Contribution Gates

- New issues from new contributors are auto-closed by `.github/workflows/issue-gate.yml`.
- New PRs from new contributors without PR rights are auto-closed by `.github/workflows/pr-gate.yml`.
- Maintainer approval comments are handled by `.github/workflows/approve-contributor.yml`.
- `lgtmi` approves future issues.
- `lgtm` approves future issues and rights to submit PRs.
- Maintainers review auto-closed issues daily.

## Before Opening Anything

1. Confirm the fix is minimal and scoped.
2. Check existing issues/PRs for duplicates.
3. Prepare a concise issue first unless the user already has maintainer approval.
4. Use `pkg:*` labels:
   - `pkg:agent`
   - `pkg:ai`
   - `pkg:coding-agent`
   - `pkg:tui`
   - `pkg:web-ui`
5. Ask `May I fix it?` in the issue when seeking approval.

## Validation Expectations

For code changes in `pi-mono`:

```bash
npm install
npm run build
npm run check
```

Important: in this TypeScript monorepo, fresh worktrees may need `npm run build` before `npm run check` because workspace package `types` resolve to built `dist/*.d.ts` outputs.

Targeted tests are package-specific. For TUI:

```bash
cd packages/tui
node --test --import tsx test/markdown.test.ts
```

For coding-agent specific tests, run from `packages/coding-agent`:

```bash
npx tsx ../../node_modules/vitest/dist/cli.js --run test/specific.test.ts
```

Do not run forbidden project commands from `AGENTS.md` such as `npm run dev`, `npm run build` only when it is needed for validation/setup or explicitly requested.

## Issue / PR Style

- Keep issue and PR text concise and technical.
- Use conventional PR titles, e.g. `fix(tui): omit markdown code fence delimiters`.
- PR bodies should include:
  - root cause
  - concise summary
  - validation commands run
  - `Fixes #NNN` only after an issue exists
- When posting comments via `gh`, write the body to a temp file and use `--body-file`.
- Preview exact text before posting.

## Changelog Rules

- Package changelogs live at `packages/*/CHANGELOG.md`.
- Add entries only under `## [Unreleased]`.
- Append to existing subsections; do not duplicate headings.
- Do not edit released sections.
- Follow project attribution format.
- If project-specific notes say maintainers handle changelogs for external PRs, do not add a changelog unless requested.

## Local Handoff Artifacts

When the user requests a durable draft or handoff, keep it under `.specs/<slug>/`. Do not stage `.specs/` unless the user explicitly asks.
